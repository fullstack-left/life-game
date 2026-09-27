# Architecture

## 1. Threads and data flow

```
            ┌──────────────── JS thread ─────────────────┐        ┌──────── UI thread ────────┐
 MMKV ⇄ Zustand store ── selectors ──► React (HUD, routes)          Skia Canvas (GPU)
  (sync)    │  ▲                         │                          ▲
            │  │ actions                 │ writes *targets* only    │ derived values
            │  └──── useCompanionLifecycle (AppState, 2s tick)      │ (clock, shader uniforms,
            │                            ▼                          │  walk/pose/loop)
            └──► SyncEngine ──HTTP──► Supabase          SharedValues ┘
                                                     useFrameCallback game loops (worklets)
```

- **React re-renders only when a visible value changes.** Examples are a rounded stat, a décor change, or a change in the character's target activity or mood. Nothing re-renders per frame.
- **Everything that moves is a worklet or derived value:** walking, breathing, blinking, sky colours, the SkSL lighting uniforms and all mini-game physics.

## 2. Time-based decay engine (`src/entities/companion/model/decayEngine.ts`)

| Stat | Model | Formula |
|---|---|---|
| Food (satiety), Hygiene | linear | `S = max(0, S₀ − R·Δt)` |
| Energy (awake), Mood | exponential | `S = S₀·e^(−λΔt)` |
| Energy (asleep) | exponential recovery | `S = 100 − (100 − S₀)·e^(−kΔt)` |
| Items | coefficient modifier | `λ_mod = λ / (1 + Σ M_i)` |

Rates change at **breakpoints**:
- food reaches 0, which applies a starving penalty to mood and energy;
- hygiene reaches 0, which applies a filthy penalty to mood;
- energy reaches the wake threshold, and the character wakes up.

Each breakpoint time is solved analytically. Δt is then split into at most a handful of constant-rate segments, and each segment is integrated exactly. Because of this, the result doesn't depend on how the time is split: one 8 h jump equals 28,800 one-second ticks (a unit test checks this). The engine runs in microseconds when the app returns to the foreground and costs no battery while the app is closed. A single offline jump is capped at 7 days.

## 3. Trusted time (`src/core/time/serverClock.ts`)

- `offset = serverTime + RTT/2 − deviceTime`. The engine keeps the lowest-RTT sample from the last 5.
- **While the app is running**, time is `anchorServer + (performance.now() − anchorMono)`. That makes it immune to wall-clock edits.
- **Across restarts**, time is `Date.now() + persistedOffset`, with a persisted **high-water mark** so time can never go backwards. A new server sample overrides the mark, which repairs a clock that was pushed forward while offline.
- The server rejects state pushes with timestamps more than 2 minutes in the future.

## 4. State, persistence and offline-first sync

- **Hydration:** `useCompanionStore` is a Zustand store with `persist`. MMKV is synchronous, so the store is hydrated before the first frame.
- **Optimistic economy:** the displayed balance is `confirmed.coins + Σ pendingOps.coinDelta`. Rolling back is simply removing an op, because the server snapshot stays the source of truth.
- **SyncEngine** (`src/features/sync/syncEngine.ts`) works like this:
  - Only one flush runs at a time, and it processes ops in FIFO order.
  - Every op carries a UUID `opId`, and `unique(user_id, op_id)` in the ledger makes replays idempotent.
  - Transient errors (network, 5xx, 429 with `Retry-After`) back off exponentially with full jitter. Definitive rejections roll the op back.
  - When the queue is empty, it pulls `get_player_snapshot()`. Game state uses **last-write-wins on `simulated_at`**, compared on the server.
  - Flushes are triggered by: foreground, backgrounding (awaited), network regained, new op (debounced 400 ms), and every 60 s.

## 5. Rendering (`src/features/room-renderer`)

- **Coordinates:** the room is drawn in a 400×620 virtual space and letter-boxed to the device.
- **Layers, back to front:**
  1. Wall, pattern, floor and rug
  2. Window (real-time sky, stars, sun and moon, city/mountain/ocean view)
  3. Furniture (bed; desk with scrolling code screens; fridge that opens while eating; shower with water particles; plant; lamp or neon sign; a wall clock showing local time)
  4. Character
  5. Foreground (blanket, shower glass)
  6. **Two SkSL passes:**
     - *ambient*, blended with `multiply`: night, fatigue dimming when energy < 20, lights-off while asleep, pulsing vignette;
     - *lights*, blended with `plus`: warm lamp pool and monitor glow.
- **Character state machine** (`characterMachine.ts`): activity + mood → `{anchor, pose, loop, walkSpeed, bob, eyelid}`.
  - When the anchor changes, the character first walks there (slower when exhausted).
  - The target loop starts in the `withTiming` completion worklet, so the transition runs entirely on the UI thread.
  - When idle, the character wanders around the room.
- **Art:** the character is fully procedural vector art. Outfit and hair come from equipped catalog items.
- **Swapping in Spine/Rive:** replace `<Character/>`. The state machine output (`LOOP_CODE`) maps directly onto Rive state-machine inputs or Spine animation names.

## 6. Mini-game engine (`src/features/minigames`)

- **`useGameLoop`** builds a fixed-timestep accumulator on top of Reanimated's `useFrameCallback`:
  - it runs on the native display link (UI thread);
  - frame time is clamped, which avoids the "spiral of death" where catch-up work keeps growing;
  - there is a maximum number of simulation steps per frame.
- **State:** all entities live in a single `SharedValue`, mutated in place with `.modify()` inside worklets. Taps are hit-tested in Gesture Handler worklets.
- **Object pool** (`objectPool.ts`): entities are pre-allocated and recycled through an `active` flag, so there are zero allocations per frame. This covers falling code lines and sheep.
- **Seeded PRNG** (Mulberry32): runs are reproducible.
- **Game logic** (`*/logic.ts`) is written as pure worklets, so unit tests run "perfect bots" against it. They assert that even perfect play stays under the server's `maxScorePerSecond`.
- **Adding a game:**
  1. write `logic.ts` and its component;
  2. add the rules to `_shared/pure/gameRules.ts`;
  3. add one line to `registry.ts`.

## 7. Backend

- **Data model:** `wallets`, `inventory`, `game_state`, `game_sessions`, an append-only `coin_ledger`, and `catalog_items`, which holds the authoritative prices. The catalog seed is generated from the shared TS catalog, and a drift test fails CI if the two disagree.
- **Client RPCs** (`SECURITY DEFINER`, `search_path=''`, user taken from `auth.uid()`): `purchase_item`, `buy_food`, `equip_item`, `sync_game_state`, `get_player_snapshot`, `server_now`.
- **service_role-only RPCs:** `create_game_session`, `settle_game_session`, `reject_game_session`.
- **Edge Functions:** `start-game` and `process-score` (see SECURITY.md).
- **Connection pooling:**

| Supavisor mode | Port | Used for |
|---|---|---|
| Transaction | 6543 | Edge Function direct SQL (`DB_POOLER_URL`, `prepare: false`, `max: 1` per isolate) |
| Session | 5432 | migrations and admin scripts only |

  PostgREST (all client RPCs) keeps its own pooled connections.
