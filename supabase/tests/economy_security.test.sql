-- ════════════════════════════════════════════════════════════════════════════
-- Database security & economy tests. Plain SQL assertions (no pgTAP needed):
-- any failure raises and aborts with a non-zero psql exit code.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/economy_security.test.sql
-- Runs inside a transaction that is rolled back — leaves no data behind.
-- ════════════════════════════════════════════════════════════════════════════
\o /dev/null
begin;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

-- Two players
insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-00000000000b');

-- ── Signup bootstrap ───────────────────────────────────────────────────────
select pg_temp.assert((select coins from public.wallets where user_id = '00000000-0000-4000-8000-00000000000a') = 150, 'starting coins = 150');
select pg_temp.assert((select count(*) from public.inventory where user_id = '00000000-0000-4000-8000-00000000000a' and equipped) = 5, '5 starter items equipped');
select pg_temp.assert((select count(*) from public.coin_ledger where user_id = '00000000-0000-4000-8000-00000000000a' and reason = 'signup') = 1, 'signup ledger entry');

-- ── Act as player A ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

-- RLS: A sees only A's rows
select pg_temp.assert((select count(*) from public.wallets) = 1, 'RLS: wallet isolation');
select pg_temp.assert((select count(*) from public.inventory where user_id = '00000000-0000-4000-8000-00000000000b') = 0, 'RLS: cannot read B inventory');

-- Direct writes to money tables are denied
do $$ begin
  update public.wallets set coins = 999999;
  raise exception 'ASSERTION FAILED: wallet update should be denied';
exception when insufficient_privilege then null; end $$;

do $$ begin
  insert into public.inventory (user_id, item_id) values ('00000000-0000-4000-8000-00000000000a', 'monitor_dual_rgb');
  raise exception 'ASSERTION FAILED: inventory insert should be denied';
exception when insufficient_privilege then null; end $$;

do $$ begin
  insert into public.coin_ledger (user_id, op_id, delta, reason, balance_after)
    values ('00000000-0000-4000-8000-00000000000a', gen_random_uuid(), 1000, 'admin_adjust', 1000);
  raise exception 'ASSERTION FAILED: ledger insert should be denied';
exception when insufficient_privilege then null; end $$;

-- service_role-only RPCs are not callable by clients
do $$ begin
  perform public.settle_game_session(gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', gen_random_uuid(), 1, 1000);
  raise exception 'ASSERTION FAILED: settle_game_session must not be client-callable';
exception when insufficient_privilege then null; end $$;

-- Purchases: insufficient funds
select pg_temp.assert(
  (public.purchase_item('11111111-1111-4111-8111-111111111111', 'monitor_4k') ->> 'error') = 'insufficient_funds',
  'cannot buy 450-coin item with 150');

-- Purchase OK + idempotent replay
select pg_temp.assert((public.purchase_item('22222222-2222-4222-8222-222222222222', 'rug_round') ->> 'coins')::int = 0, 'rug purchase leaves 0 coins');
select pg_temp.assert((public.purchase_item('22222222-2222-4222-8222-222222222222', 'rug_round') ->> 'replay')::boolean, 'replayed op is idempotent');
select pg_temp.assert((select coins from public.wallets) = 0, 'replay did not double-charge');
select pg_temp.assert((public.purchase_item('33333333-3333-4333-8333-333333333333', 'rug_round') ->> 'error') = 'already_owned', 'already owned');

-- Unknown item / food as item
select pg_temp.assert((public.purchase_item(gen_random_uuid(), 'food_apple') ->> 'error') = 'unknown_item', 'food not purchasable as item');

-- Equip: owned vs not owned, single equipped per slot
select pg_temp.assert((public.equip_item('monitor_4k') ->> 'error') = 'not_owned', 'cannot equip unowned');
select pg_temp.assert((public.equip_item('rug_round') ->> 'ok')::boolean, 'equip owned rug');

-- Game state LWW + future timestamp rejection
select pg_temp.assert(
  (public.sync_game_state(50, 50, 50, 50, 'idle', now(), now() + interval '1 hour') ->> 'error') = 'future_timestamp',
  'future simulated_at rejected');
select pg_temp.assert(
  (public.sync_game_state(42, 43, 44, 45, 'sleeping', now(), clock_timestamp()) ->> 'applied')::boolean,
  'newer state applied');
select pg_temp.assert(
  not (public.sync_game_state(1, 1, 1, 1, 'idle', now(), now() - interval '1 day') ->> 'applied')::boolean,
  'older state ignored (LWW)');
select pg_temp.assert((select energy from public.game_state) = 42, 'state kept newest');

-- Snapshot shape
select pg_temp.assert((public.get_player_snapshot() -> 'owned') ? 'rug_round', 'snapshot lists owned items');
select pg_temp.assert((public.get_player_snapshot() ->> 'server_now')::bigint > 0, 'snapshot has server time');

-- ── Service role: session lifecycle ────────────────────────────────────────
reset role;
set local role service_role;

create temp table s as
  select (public.create_game_session('00000000-0000-4000-8000-00000000000a', 'terminal-coder', repeat('ab', 12)) ->> 'id')::uuid as id;

select pg_temp.assert(
  (public.settle_game_session((select id from s), '00000000-0000-4000-8000-00000000000b', gen_random_uuid(), 100, 12) ->> 'error') = 'session_not_found',
  'cannot settle another user''s session');

select pg_temp.assert(
  (public.settle_game_session((select id from s), '00000000-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 100, 12) ->> 'credited')::int = 12,
  'session credits coins');
select pg_temp.assert(
  (public.settle_game_session((select id from s), '00000000-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 100, 12) ->> 'replay')::boolean,
  'double settlement is a replay');
select pg_temp.assert((select coins from public.wallets where user_id = '00000000-0000-4000-8000-00000000000a') = 12, 'credited exactly once');

-- 24h income cap
do $$
declare v_id uuid; v_credit int; i int;
begin
  for i in 1..40 loop
    v_id := (public.create_game_session('00000000-0000-4000-8000-00000000000b', 'farm-sim', repeat('cd', 12)) ->> 'id')::uuid;
    v_credit := (public.settle_game_session(v_id, '00000000-0000-4000-8000-00000000000b', gen_random_uuid(), 500, 80) ->> 'credited')::int;
  end loop;
  if (select coalesce(sum(delta), 0) from public.coin_ledger where user_id = '00000000-0000-4000-8000-00000000000b' and reason = 'minigame_reward') > 2500 then
    raise exception 'ASSERTION FAILED: 24h cap exceeded';
  end if;
end $$;

-- Active session cap (≤ 3 concurrently active)
select pg_temp.assert(
  (select count(*) from public.game_sessions where user_id = '00000000-0000-4000-8000-00000000000b' and status = 'active') <= 3,
  'active session cap');

-- Rejection
create temp table r as
  select (public.create_game_session('00000000-0000-4000-8000-00000000000a', 'save-server', repeat('ef', 12)) ->> 'id')::uuid as id;
select public.reject_game_session((select id from r), '00000000-0000-4000-8000-00000000000a', 'score_exceeds_theoretical_max');
select pg_temp.assert(
  (public.settle_game_session((select id from r), '00000000-0000-4000-8000-00000000000a', gen_random_uuid(), 1, 1) ->> 'error') = 'session_rejected',
  'rejected session cannot be settled');

reset role;
rollback;

\o
\echo 'ALL DATABASE TESTS PASSED'
