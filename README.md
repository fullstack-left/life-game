# Life Simulator: a 2D virtual companion

A mobile life simulator. Your companion Alex, a young freelancer, lives in a 2D room. He keeps getting hungry, tired, dirty and bored even while the app is closed. You look after him, earn coins in three mini-games on his PC, and spend them on furniture and clothes. Equipped items also slow down how fast his mood drops.

| Layer | Technology |
|---|---|
| App | Expo SDK 57 · React Native 0.86 (New Architecture) · Expo Router · TypeScript (strict) |
| Rendering | `@shopify/react-native-skia` (GPU, JSI) · SkSL runtime shaders · Reanimated 4 / Worklets |
| State | Zustand 5 + `react-native-mmkv` 4 (synchronous, memory-mapped, JSI) |
| Backend | Supabase: Postgres 17, RLS, SECURITY DEFINER RPCs, Deno Edge Functions, Supavisor (transaction mode) |
| Anti-cheat | Server-synced monotonic clock · HMAC-SHA256 signed results · single-use sessions · Upstash sliding-window rate limits · 24h income cap |
| Delivery | GitHub Actions · EAS Build/Submit (or Fastlane) · Supabase CLI migrations |

## Gameplay

- **Four needs:** Energy, Food, Hygiene and Mood. They decay using closed-form math, so no background tasks run and the battery isn't touched. Opening the app fast-forwards time and shows a "While you were away…" report.
- **Room interactions:** Tap the bed to sleep (the lights dim and "Zzz" appears), the fridge to eat (costs coins), the shower to wash, and the PC to work.
- **Mini-games** (60 s each, 60 FPS on the UI thread):
  - **Terminal Coder:** tap the falling bugs and let clean code ship.
  - **Farming Simulator (Fermerlik Simulyatsiyasi):** feed hungry sheep watermelons before their timer runs out.
  - **Save the Server (Serverni Saqla):** cool overheating racks before they crash.
- **Shop:** monitors, wallpaper, window view, rugs, plants, lamps, outfits and hair. Each item changes how the room is rendered, and many reduce mood decay: `λ_mod = λ / (1 + Σ M_i)`.
- **Dynamic room:** the sky follows your real local time (dawn, day, golden hour, night with stars). When energy drops below 20, a shader dims the room and the character switches to an exhausted animation loop.
- **Languages:** 🇺🇿 Uzbek (default) · 🇷🇺 Russian · 🇬🇧 English, chosen automatically from the device locale.

## Quick start

```bash
git clone https://github.com/fullstack-left/life-game.git && cd life-game
npm ci
npm run verify          # lint + typecheck + unit tests
```

### 1. Fully offline (no backend)
With no Supabase env vars, the app runs as a single-player offline edition and the economy is settled on the device:
```bash
npx expo run:ios        # or: npx expo run:android   (Skia/MMKV need a dev build, not Expo Go)
```

### 2. With the local Supabase stack
Requires Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).
```bash
supabase start                                    # Postgres, Auth, Supavisor, Edge Runtime
supabase db reset                                 # applies supabase/migrations/* + catalog seed
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve --env-file supabase/functions/.env

cp .env.example .env.local                        # paste the anon key from `supabase status`
npx expo run:ios
```
Anonymous sign-in is enabled, so the first launch creates a player (150 coins plus starter items) with no sign-up screen.

## Project structure

```
src/
  app/                      Expo Router routes (room, computer, shop, minigame/[id])
  core/                     cross-cutting infrastructure
    config/ crypto/ i18n/ logger.ts network/ storage/ theme/ time/ utils/
  entities/companion/       domain model: stats, decay engine, mood, modifiers (pure TS)
  store/companion/          Zustand store + MMKV persistence + optimistic op queue
  features/
    pet-state/              AppState lifecycle → offline time-jump, UI tick
    room-renderer/          Skia <DynamicRoom/>: layers, SkSL lighting, character state machine
    hud/                    stat bars, action bar, food sheet, offline report
    minigames/              engine (loop, pool, rng, signing) + 3 games + host sandbox
    shop/                   catalog UI
    sync/                   offline-first sync engine + typed API client
supabase/
  migrations/               schema · RLS · RPCs · catalog seed
  functions/                Deno Edge Functions (start-game, process-score)
    _shared/pure/           dependency-free code shared with the app (rules, catalog, canonical JSON)
  tests/                    SQL security/economy test suite
scripts/                    secret obfuscation, catalog SQL generator, DB verifier
docs/                       ARCHITECTURE.md · SECURITY.md
```

## Quality gates

| Command | What it checks |
|---|---|
| `npm run lint` | ESLint (expo config, `import/no-cycle`) |
| `npm run typecheck` | TypeScript strict + `noUncheckedIndexedAccess` |
| `npm test` | 45 Jest tests: decay math (closed form vs. 28,800 one-second ticks), clock anti-tamper, HMAC test vector, object pool, mini-game "perfect bot" runs vs. server score limits, optimistic store, catalog↔SQL drift |
| `cd supabase/functions && deno test tests/` | HMAC/timing-safe compare, payload schema, score plausibility |
| `./scripts/verify-db.sh` | Applies every migration to a fresh Postgres 17 and asserts RLS denies client writes, idempotent purchases, LWW sync, session settlement, 24h cap |

## CI/CD

- **`ci.yml`** runs on every PR/push: app lint/typecheck/tests, `expo-doctor`, Metro bundle for iOS and Android, Deno check/lint/test, and migrations plus the SQL security suite against a Postgres 17 service.
- **`deploy-backend.yml`** runs on `main` changes under `supabase/`. It does `supabase db push`, syncs secrets and deploys the Edge Functions.
- **`mobile-release.yml`** runs on a `v*.*.*` tag. It embeds the production HMAC key (obfuscated), then does `eas build --platform all --auto-submit`.
- **Fastlane** (`fastlane/`) is an alternative for self-hosted runners: `bundle exec fastlane ios beta` / `android beta`.

Required repository secrets are listed at the top of each workflow file.

## Scaling to 1M users

- All client traffic goes through PostgREST and Edge Functions over HTTP. Direct SQL from functions uses **Supavisor transaction mode (port 6543)** with `prepare: false`, so each isolate holds a backend connection only for the length of one transaction.
- Every RLS predicate is `user_id = (select auth.uid())` on a primary key that starts with `user_id`. That makes each check an index lookup evaluated once per statement.
- Clients are offline-first. Decay is computed on the device, and the server only receives batched, idempotent mutations plus a periodic LWW state push. Retries use exponential backoff with full jitter.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** and **[docs/SECURITY.md](docs/SECURITY.md)**.

---

### 🇺🇿 Qisqacha (o'zbekcha)

**Life Simulator** — 2D virtual do'st: xonada yashaydigan frilanser Alex. Energiya, ovqat, gigiyena va kayfiyat ilova yopiq bo'lsa ham kamayadi (fon jarayonisiz, matematik "vaqt sakrashi" bilan). Kompyuterdagi 3 ta mini-o'yin (Terminal Coder, Fermerlik Simulyatsiyasi, Serverni Saqla) orqali tanga ishlab, do'kondan jihozlar sotib olasiz. Qimmat jihozlar kayfiyat pasayishini sekinlashtiradi.

**Ishga tushirish:** `npm ci` → `npm run verify` → `npx expo run:android` (backendsiz oflayn rejim). Supabase bilan: `supabase start && supabase db reset`, so'ng `.env.local` ga URL va anon kalitni yozing.

**Xavfsizlik:** tangalar faqat serverda (RLS + SECURITY DEFINER funksiyalar) o'zgaradi; mini-o'yin natijalari HMAC-SHA256 bilan imzolanadi, server sessiyasi, vaqt oynasi va maksimal ball tekshiriladi, Upstash Redis bilan so'rovlar cheklanadi.
