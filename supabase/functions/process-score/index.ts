/**
 * POST /functions/v1/process-score   { payload, signature, opId }
 * → { credited, coins }
 *
 * Anti-cheat pipeline (cheapest checks first, DB last):
 *   1. JWT validation (signature, role, expiry, AAL)
 *   2. Sliding-window rate limit — 5 req/min per user, 30/min per IP (Upstash Redis)
 *   3. Strict schema validation of the untrusted body
 *   4. HMAC-SHA256 over canonical JSON, constant-time comparison
 *   5. Session binding: owner, game, single-use nonce (constant-time), status
 *   6. Logical validation: duration inside the server-observed window,
 *      score ≤ theoretical maximum for that duration
 *   7. Atomic, idempotent settlement (session lock + wallet + ledger, 24h cap)
 *      via Supavisor transaction mode or service_role RPC.
 */
import { canonicalize } from '../_shared/pure/canonical.ts';
import { computeCoinReward, parsePayload, validateScoreClaim } from '../_shared/pure/gameRules.ts';
import { authenticate, getAdminClient } from '../_shared/auth.ts';
import { settleSession } from '../_shared/db.ts';
import { ENV } from '../_shared/env.ts';
import { timingSafeEqualStrings, verifyHmacHex } from '../_shared/hmac.ts';
import { clientIp, handler, HttpError, isUuid, json, readJson } from '../_shared/http.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

interface SessionRow {
  id: string;
  user_id: string;
  game_id: string;
  nonce: string;
  status: string;
  started_at: string;
}

Deno.serve(
  handler(async (req) => {
    // 1 ─ identity
    const auth = await authenticate(req);

    // 2 ─ rate limiting
    await Promise.all([
      enforceRateLimit('process-score:user', auth.userId, 5, '60 s'),
      enforceRateLimit('process-score:ip', clientIp(req), 30, '60 s'),
    ]);

    // 3 ─ schema
    const body = (await readJson(req)) as { payload?: unknown; signature?: unknown; opId?: unknown } | null;
    const payload = parsePayload(body?.payload);
    const signature = body?.signature;
    const opId = body?.opId;
    if (!payload || typeof signature !== 'string' || signature.length !== 64 || !isUuid(opId)) {
      throw new HttpError(400, 'invalid_body');
    }
    if (!isUuid(payload.sessionId)) throw new HttpError(400, 'invalid_session');

    // 4 ─ integrity (constant-time)
    const validSig = await verifyHmacHex(ENV.clientHmacSecret, canonicalize(payload), signature);
    if (!validSig) {
      console.warn(`[process-score] bad signature user=${auth.userId} session=${payload.sessionId}`);
      throw new HttpError(401, 'invalid_signature');
    }

    // 5 ─ session binding
    const admin = getAdminClient();
    const { data: session, error } = await admin
      .from('game_sessions')
      .select('id, user_id, game_id, nonce, status, started_at')
      .eq('id', payload.sessionId)
      .maybeSingle<SessionRow>();
    if (error) throw new Error(`session lookup failed: ${error.message}`);
    if (!session || session.user_id !== auth.userId) throw new HttpError(404, 'session_not_found');
    if (session.game_id !== payload.gameId) throw new HttpError(422, 'game_mismatch');
    if (!timingSafeEqualStrings(session.nonce, payload.nonce)) throw new HttpError(401, 'invalid_nonce');

    const settle = () =>
      settleSession({
        sessionId: session.id,
        userId: auth.userId,
        opId,
        score: payload.score,
        coins: computeCoinReward(payload.gameId, payload.score),
      });

    // Retries of an already-settled session are answered idempotently.
    if (session.status === 'settled') {
      const replay = await settle();
      return json({ credited: replay.credited ?? 0, coins: replay.coins ?? 0, replay: true });
    }
    if (session.status !== 'active') throw new HttpError(409, `session_${session.status}`);

    // 6 ─ game-logic plausibility
    const serverStartedAt = Date.parse(session.started_at);
    const verdict = validateScoreClaim(payload, serverStartedAt, Date.now());
    if (!verdict.ok) {
      await admin.rpc('reject_game_session', {
        p_session_id: session.id,
        p_user_id: auth.userId,
        p_reason: verdict.reason,
      });
      console.warn(`[process-score] rejected user=${auth.userId} reason=${verdict.reason}`);
      throw new HttpError(422, verdict.reason);
    }

    // 7 ─ atomic settlement
    const result = await settle();
    if (!result.ok) throw new HttpError(409, result.error ?? 'settle_failed');
    return json({ credited: result.credited ?? 0, coins: result.coins ?? 0 });
  }),
);
