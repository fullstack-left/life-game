-- ════════════════════════════════════════════════════════════════════════════
-- Server-authoritative RPCs.
--   * SECURITY DEFINER + `set search_path = ''` (no search-path hijacking);
--     every identifier is schema-qualified.
--   * Client RPCs derive the user from auth.uid() — never from arguments.
--   * Money mutations lock the wallet row (FOR UPDATE) and write the ledger in
--     the same transaction; (user_id, op_id) uniqueness makes retries idempotent.
--   * service_role-only functions are REVOKEd from PUBLIC/anon/authenticated.
-- ════════════════════════════════════════════════════════════════════════════

-- ── New user bootstrap ─────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start constant bigint := 150; -- STARTING_COINS in catalog.ts
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.wallets (user_id, coins) values (new.id, v_start) on conflict do nothing;
  insert into public.coin_ledger (user_id, op_id, delta, reason, balance_after)
    values (new.id, gen_random_uuid(), v_start, 'signup', v_start);
  insert into public.game_state (user_id) values (new.id) on conflict do nothing;
  insert into public.inventory (user_id, item_id, equipped)
    select new.id, c.id, true from public.catalog_items c where c.starter and c.active and c.kind = 'item'
    on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Trusted clock ──────────────────────────────────────────────────────────
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select clock_timestamp() $$;

-- ── Purchases ──────────────────────────────────────────────────────────────
create or replace function public.purchase_item(p_op_id uuid, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_price integer;
  v_coins bigint;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  -- Lock first: serialises concurrent purchases from multiple devices.
  select w.coins into v_coins from public.wallets w where w.user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_wallet'); end if;

  -- Idempotent replay (response lost, client retried).
  if exists (select 1 from public.coin_ledger l where l.user_id = v_uid and l.op_id = p_op_id) then
    return jsonb_build_object('ok', true, 'coins', v_coins, 'replay', true);
  end if;

  select c.price into v_price from public.catalog_items c
   where c.id = p_item_id and c.kind = 'item' and c.active;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;

  if exists (select 1 from public.inventory i where i.user_id = v_uid and i.item_id = p_item_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'coins', v_coins);
  end if;
  if v_coins < v_price then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'coins', v_coins);
  end if;

  update public.wallets set coins = coins - v_price where user_id = v_uid returning coins into v_coins;
  insert into public.inventory (user_id, item_id) values (v_uid, p_item_id);
  insert into public.coin_ledger (user_id, op_id, delta, reason, ref, balance_after)
    values (v_uid, p_op_id, -v_price, 'purchase_item', p_item_id, v_coins);

  return jsonb_build_object('ok', true, 'coins', v_coins);
end;
$$;

create or replace function public.buy_food(p_op_id uuid, p_food_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_price integer;
  v_coins bigint;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select w.coins into v_coins from public.wallets w where w.user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_wallet'); end if;

  if exists (select 1 from public.coin_ledger l where l.user_id = v_uid and l.op_id = p_op_id) then
    return jsonb_build_object('ok', true, 'coins', v_coins, 'replay', true);
  end if;

  select c.price into v_price from public.catalog_items c
   where c.id = p_food_id and c.kind = 'food' and c.active;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
  if v_coins < v_price then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'coins', v_coins);
  end if;

  update public.wallets set coins = coins - v_price where user_id = v_uid returning coins into v_coins;
  insert into public.coin_ledger (user_id, op_id, delta, reason, ref, balance_after)
    values (v_uid, p_op_id, -v_price, 'buy_food', p_food_id, v_coins);

  return jsonb_build_object('ok', true, 'coins', v_coins);
end;
$$;

create or replace function public.equip_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select c.slot into v_slot
    from public.inventory i join public.catalog_items c on c.id = i.item_id
   where i.user_id = v_uid and i.item_id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_owned'); end if;

  update public.inventory i set equipped = (i.item_id = p_item_id)
    from public.catalog_items c
   where i.user_id = v_uid and c.id = i.item_id and c.slot = v_slot;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Companion state sync (Last-Write-Wins on simulated_at) ─────────────────
create or replace function public.sync_game_state(
  p_energy double precision,
  p_hunger double precision,
  p_hygiene double precision,
  p_fun double precision,
  p_activity text,
  p_activity_since timestamptz,
  p_simulated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_applied boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_activity not in ('idle', 'sleeping') then return jsonb_build_object('ok', false, 'error', 'bad_activity'); end if;
  -- A client clock in the future is rejected outright (time-travel cheat).
  if p_simulated_at > clock_timestamp() + interval '2 minutes' then
    return jsonb_build_object('ok', false, 'error', 'future_timestamp');
  end if;

  update public.game_state g set
    energy         = least(100, greatest(0, p_energy)),
    hunger         = least(100, greatest(0, p_hunger)),
    hygiene        = least(100, greatest(0, p_hygiene)),
    fun            = least(100, greatest(0, p_fun)),
    activity       = p_activity,
    activity_since = p_activity_since,
    simulated_at   = p_simulated_at
  where g.user_id = v_uid and g.simulated_at < p_simulated_at;

  v_applied := found;
  return jsonb_build_object('ok', true, 'applied', v_applied);
end;
$$;

-- ── Full reconciliation snapshot ───────────────────────────────────────────
create or replace function public.get_player_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'coins',      coalesce((select w.coins from public.wallets w where w.user_id = auth.uid()), 0),
    'owned',      coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.inventory i where i.user_id = auth.uid()), '[]'::jsonb),
    'equipped',   coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.inventory i where i.user_id = auth.uid() and i.equipped), '[]'::jsonb),
    'game_state', (select to_jsonb(g) - 'user_id' - 'updated_at' from public.game_state g where g.user_id = auth.uid()),
    'server_now', floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- service_role-only functions (called by Edge Functions)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.create_game_session(p_user_id uuid, p_game_id text, p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_started timestamptz;
begin
  -- Expire stale sessions, then cap concurrently active sessions per user.
  update public.game_sessions set status = 'expired'
   where user_id = p_user_id and status = 'active' and started_at < clock_timestamp() - interval '30 minutes';

  if (select count(*) from public.game_sessions s where s.user_id = p_user_id and s.status = 'active') >= 3 then
    update public.game_sessions set status = 'expired'
     where id = (select s.id from public.game_sessions s
                  where s.user_id = p_user_id and s.status = 'active'
                  order by s.started_at asc limit 1);
  end if;

  insert into public.game_sessions (user_id, game_id, nonce)
  values (p_user_id, p_game_id, p_nonce)
  returning id, started_at into v_id, v_started;

  return jsonb_build_object('id', v_id, 'started_at_ms', floor(extract(epoch from v_started) * 1000)::bigint);
end;
$$;

/**
 * Atomically settles a session and credits coins exactly once.
 *  - Row lock on the session prevents double-settlement races.
 *  - A 24h rolling cap on mini-game income limits automated farming even with a
 *    compromised client key.
 */
create or replace function public.settle_game_session(
  p_session_id uuid,
  p_user_id uuid,
  p_op_id uuid,
  p_score integer,
  p_coins integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status  text;
  v_prev    integer;
  v_earned  bigint;
  v_credit  integer;
  v_coins   bigint;
  v_cap     constant integer := 2500;
begin
  select s.status, s.coins into v_status, v_prev
    from public.game_sessions s
   where s.id = p_session_id and s.user_id = p_user_id
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'session_not_found'); end if;

  if v_status = 'settled' then
    select w.coins into v_coins from public.wallets w where w.user_id = p_user_id;
    return jsonb_build_object('ok', true, 'credited', coalesce(v_prev, 0), 'coins', v_coins, 'replay', true);
  end if;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'error', 'session_' || v_status); end if;

  select coalesce(sum(l.delta), 0) into v_earned
    from public.coin_ledger l
   where l.user_id = p_user_id and l.reason = 'minigame_reward' and l.created_at > clock_timestamp() - interval '24 hours';
  v_credit := greatest(0, least(p_coins, v_cap - v_earned::integer));

  update public.wallets set coins = coins + v_credit where user_id = p_user_id returning coins into v_coins;
  if v_credit > 0 then
    insert into public.coin_ledger (user_id, op_id, delta, reason, ref, balance_after)
      values (p_user_id, p_op_id, v_credit, 'minigame_reward', p_session_id::text, v_coins)
      on conflict (user_id, op_id) do nothing;
  end if;

  update public.game_sessions
     set status = 'settled', settled_at = clock_timestamp(), score = p_score, coins = v_credit
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'credited', v_credit, 'coins', v_coins);
end;
$$;

create or replace function public.reject_game_session(p_session_id uuid, p_user_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.game_sessions
     set status = 'rejected', settled_at = clock_timestamp(), reject_reason = left(p_reason, 64)
   where id = p_session_id and user_id = p_user_id and status = 'active';
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────
-- Functions are EXECUTE-able by PUBLIC by default in Postgres: revoke everything,
-- then grant precisely.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.server_now()                                   to anon, authenticated;
grant execute on function public.purchase_item(uuid, text)                     to authenticated;
grant execute on function public.buy_food(uuid, text)                          to authenticated;
grant execute on function public.equip_item(text)                              to authenticated;
grant execute on function public.sync_game_state(double precision, double precision, double precision, double precision, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_player_snapshot()                         to authenticated;

grant execute on function public.create_game_session(uuid, text, text)         to service_role;
grant execute on function public.settle_game_session(uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.reject_game_session(uuid, uuid, text)         to service_role;

-- New functions created later must not silently become public.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
