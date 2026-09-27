-- ════════════════════════════════════════════════════════════════════════════
-- Life Simulator — core schema
-- Design notes:
--   * One row per user in wallets / game_state; composite PKs lead with user_id,
--     so every RLS predicate `user_id = auth.uid()` is an index lookup.
--   * Coins only ever change through SECURITY DEFINER functions that write an
--     append-only ledger (idempotent on (user_id, op_id)).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Catalog (authoritative prices) ─────────────────────────────────────────
create table public.catalog_items (
  id         text primary key check (id ~ '^[a-z0-9_]{2,48}$'),
  slot       text not null,
  kind       text not null check (kind in ('item', 'food')),
  price      integer not null check (price >= 0),
  starter    boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.catalog_items is 'Shop catalog; mirrors supabase/functions/_shared/pure/catalog.ts';

-- ── Profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Alex' check (char_length(display_name) between 1 and 20),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Wallet ─────────────────────────────────────────────────────────────────
create table public.wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  coins      bigint not null default 150 check (coins >= 0),
  updated_at timestamptz not null default now()
);

-- ── Append-only coin ledger (audit trail + idempotency) ────────────────────
create table public.coin_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  op_id         uuid not null,
  delta         integer not null,
  reason        text not null check (reason in ('signup', 'purchase_item', 'buy_food', 'minigame_reward', 'admin_adjust')),
  ref           text,
  balance_after bigint not null check (balance_after >= 0),
  created_at    timestamptz not null default now(),
  constraint coin_ledger_user_op_unique unique (user_id, op_id)
);
create index coin_ledger_user_created_idx on public.coin_ledger (user_id, created_at desc);

-- ── Inventory ──────────────────────────────────────────────────────────────
create table public.inventory (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     text not null references public.catalog_items (id),
  equipped    boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ── Companion state (client-simulated, server-stored; LWW on simulated_at) ─
create table public.game_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  energy         double precision not null default 85 check (energy between 0 and 100),
  hunger         double precision not null default 75 check (hunger between 0 and 100),
  hygiene        double precision not null default 80 check (hygiene between 0 and 100),
  fun            double precision not null default 70 check (fun between 0 and 100),
  activity       text not null default 'idle' check (activity in ('idle', 'sleeping')),
  activity_since timestamptz,
  simulated_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Mini-game sessions (single-use nonce, server start time) ───────────────
create table public.game_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  game_id       text not null check (game_id in ('terminal-coder', 'farm-sim', 'save-server')),
  nonce         text not null check (char_length(nonce) between 16 and 128),
  status        text not null default 'active' check (status in ('active', 'settled', 'rejected', 'expired')),
  started_at    timestamptz not null default clock_timestamp(),
  settled_at    timestamptz,
  score         integer,
  coins         integer,
  reject_reason text
);
create index game_sessions_user_started_idx on public.game_sessions (user_id, started_at desc);
create index game_sessions_active_idx on public.game_sessions (user_id) where status = 'active';

-- ── updated_at maintenance ─────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger wallets_touch before update on public.wallets for each row execute function public.touch_updated_at();
create trigger game_state_touch before update on public.game_state for each row execute function public.touch_updated_at();
