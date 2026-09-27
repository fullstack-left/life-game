-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security — deny by default.
--   * Every table has RLS enabled; only explicit SELECT policies exist for clients.
--   * NO insert/update/delete policies on wallets, inventory, coin_ledger,
--     game_sessions, game_state → PostgREST writes are rejected for anon/authenticated.
--   * Writes happen exclusively through SECURITY DEFINER RPCs (validated) or
--     Edge Functions using the service_role key.
--   * `(select auth.uid())` is evaluated once per statement (initPlan), not per row.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.catalog_items enable row level security;
alter table public.profiles      enable row level security;
alter table public.wallets       enable row level security;
alter table public.coin_ledger   enable row level security;
alter table public.inventory     enable row level security;
alter table public.game_state    enable row level security;
alter table public.game_sessions enable row level security;

-- Belt and braces: strip table-level write privileges from client roles, so even
-- a future permissive policy added by mistake cannot mint coins.
revoke insert, update, delete, truncate on public.catalog_items from anon, authenticated;
revoke insert, update, delete, truncate on public.wallets       from anon, authenticated;
revoke insert, update, delete, truncate on public.coin_ledger   from anon, authenticated;
revoke insert, update, delete, truncate on public.inventory     from anon, authenticated;
revoke insert, update, delete, truncate on public.game_state    from anon, authenticated;
revoke insert, update, delete, truncate on public.game_sessions from anon, authenticated;
revoke insert, delete, truncate         on public.profiles      from anon, authenticated;
revoke update                           on public.profiles      from anon, authenticated;
grant  update (display_name)            on public.profiles      to authenticated;
revoke all on public.game_sessions from anon;
revoke all on public.coin_ledger   from anon;

-- ── Catalog: public read of active items ───────────────────────────────────
create policy "catalog: read active"
  on public.catalog_items for select
  to anon, authenticated
  using (active);

-- ── Profiles: owner read + rename ──────────────────────────────────────────
create policy "profiles: owner select"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles: owner update display_name"
  on public.profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Economy tables: owner read-only ────────────────────────────────────────
create policy "wallets: owner select"
  on public.wallets for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "ledger: owner select"
  on public.coin_ledger for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "inventory: owner select"
  on public.inventory for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "game_state: owner select"
  on public.game_state for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "sessions: owner select"
  on public.game_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit RESTRICTIVE deny for client writes on money tables. Restrictive policies
-- are AND-ed with permissive ones, so a permissive write policy added by mistake
-- later still cannot open these tables. Scoped per write command so owner SELECT stays allowed.
create policy "wallets: deny client insert"  on public.wallets   as restrictive for insert to anon, authenticated with check (false);
create policy "wallets: deny client update"  on public.wallets   as restrictive for update to anon, authenticated using (false) with check (false);
create policy "wallets: deny client delete"  on public.wallets   as restrictive for delete to anon, authenticated using (false);
create policy "inventory: deny client insert" on public.inventory as restrictive for insert to anon, authenticated with check (false);
create policy "inventory: deny client update" on public.inventory as restrictive for update to anon, authenticated using (false) with check (false);
create policy "inventory: deny client delete" on public.inventory as restrictive for delete to anon, authenticated using (false);
