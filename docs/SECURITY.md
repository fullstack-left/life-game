# Security model

**Guiding rule:** the client is untrusted. It can simulate stats and show optimistic numbers, but **only the server can change coins or inventory**.

## Database (RLS)

- **RLS is enabled on every table.** Clients get owner-only `SELECT` policies built on `user_id = (select auth.uid())`. `auth.uid()` is evaluated once per statement, not once per row.
- **Clients have no write access to economy tables.** On `wallets`, `inventory`, `coin_ledger`, `game_sessions` and `game_state`, three safeguards stack:
  1. `REVOKE INSERT/UPDATE/DELETE` from `anon` and `authenticated`.
  2. No permissive write policy exists.
  3. **Restrictive** deny policies on `wallets` and `inventory`. If someone later adds a permissive policy by mistake, these still block writes.
- **Profiles:** clients can update only `profiles.display_name`, through a column-level grant.
- **Functions:**
  - `EXECUTE` is revoked from `PUBLIC` by default, including for functions created in the future.
  - Each RPC is granted to exactly one role.
  - `settle_game_session`, `create_game_session` and `reject_game_session` are `service_role` only.
- **Money mutations:**
  - Each one locks the wallet row (`FOR UPDATE`) and writes an append-only ledger row in the same transaction.
  - `unique(user_id, op_id)` makes them idempotent.
  - `CHECK (coins >= 0)` stops the balance from going negative.
- **Verification:** `supabase/tests/economy_security.test.sql` attacks these rules directly:
  - updating the wallet, inserting inventory and inserting ledger rows directly;
  - calling service-only RPCs;
  - replaying purchases;
  - settling another user's session;
  - double settlement;
  - the 24h cap.

## Mini-game rewards: `process-score` pipeline

1. **`start-game`** creates a server session with a random 24-byte nonce and a server `started_at`. At most 3 sessions can be active per user, and sessions expire after 30 minutes.
2. **The client plays.** On finish it builds `{v, sessionId, nonce, gameId, score, startedAt, endedAt, stats}` and signs the canonical JSON (sorted keys) with **HMAC-SHA256** (`src/features/minigames/engine/signedResult.ts`).
3. **`process-score`** checks, in order:
   1. **JWT** via `auth.getClaims()`: signature (JWKS), `role = authenticated`, expiry, and **AAL** (`aal1`/`aal2`).
   2. **Rate limits** with Upstash sliding windows: 5/min per user and 30/min per IP. The limiter **fails closed** in production.
   3. **Schema:** strict validation of the untrusted body, bounded size and integer-only fields.
   4. **HMAC check:** constant-time comparison (`timingSafeEqual`), so there is no timing oracle for guessing the signature byte by byte.
   5. **Session binding:** the session must belong to the caller, match the game, have the right nonce (compared in constant time), and be `active`. Settled sessions are answered idempotently.
   6. **Plausibility:**
      - the claimed duration must fit inside the window the server observed;
      - `minDurationSec ≤ duration ≤ durationSec + 5s`;
      - `score ≤ maxScorePerSecond × min(claimed, observed)`.
   7. **Settlement:** atomic, with a row lock on the session. There is a **24h rolling cap** of 2,500 mini-game coins per user.
4. Rejected sessions are marked `rejected` with a reason, which gives an audit trail for detecting cheaters.

### About the client secret

The HMAC key embedded in the app is XOR-masked, split into shuffled chunks, rebuilt only for the moment of signing, and then zeroed (`scripts/generate-client-secret.mjs`). This stops casual memory editing and `strings` extraction. **A determined attacker can still pull a key out of any client binary.** So the signature is **not** the main defence. The main defences are:
- the server-issued single-use session;
- the server-observed time window;
- the theoretical-maximum score check;
- rate limiting;
- the daily income cap.

With all of those in place, a fully compromised client can earn at most what a perfect human player could. Rotate `CLIENT_HMAC_SECRET` together with each app release. For extra hardening, consider App Attest (iOS) / Play Integrity (Android) attestation on `start-game`.

## Time manipulation

- Trusted time comes from `server_now()` and is anchored to a monotonic clock while the app runs. A high-water mark prevents rewinds while offline (see ARCHITECTURE.md §3).
- Setting the clock forward only makes the companion's needs *worse*. Coins are never earned from elapsed time.
- `sync_game_state` rejects timestamps more than 2 minutes in the future.

## Secrets and storage

- **Supabase tokens:** stored in an **AES-encrypted MMKV** instance. The encryption key is generated per install and kept in the iOS Keychain / Android Keystore (`expo-secure-store`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`).
- **Public config:** only `EXPO_PUBLIC_*` values are bundled (the Supabase URL and anon key are public by design).
- **Server secrets:** set through `supabase secrets set` from GitHub environment secrets. They are never committed. `.env` files are ignored by git.
- **Edge Functions:** unexpected errors return an opaque `internal_error`. Details go only to server logs.
