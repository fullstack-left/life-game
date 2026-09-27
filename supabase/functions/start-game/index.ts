/**
 * POST /functions/v1/start-game   { gameId }
 * → { sessionId, nonce, serverStartedAt }
 *
 * Issues a single-use session bound to the user, the game and a server
 * timestamp. `process-score` later proves the round happened inside this
 * window, which defeats forged durations and replayed results.
 */
import { isMiniGameId } from '../_shared/pure/gameRules.ts';
import { authenticate, getAdminClient } from '../_shared/auth.ts';
import { randomHex } from '../_shared/hmac.ts';
import { clientIp, handler, HttpError, json, readJson } from '../_shared/http.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(
  handler(async (req) => {
    const auth = await authenticate(req);
    await Promise.all([
      enforceRateLimit('start-game:user', auth.userId, 12, '60 s'),
      enforceRateLimit('start-game:ip', clientIp(req), 60, '60 s'),
    ]);

    const body = await readJson(req);
    const gameId = (body as { gameId?: unknown } | null)?.gameId;
    if (!isMiniGameId(gameId)) throw new HttpError(400, 'invalid_game');

    const nonce = randomHex(24);
    const { data, error } = await getAdminClient().rpc('create_game_session', {
      p_user_id: auth.userId,
      p_game_id: gameId,
      p_nonce: nonce,
    });
    if (error || !data) {
      console.error('[start-game] create_game_session failed', error);
      throw new HttpError(500, 'session_create_failed');
    }
    const row = data as { id: string; started_at_ms: number };
    return json({ sessionId: row.id, nonce, serverStartedAt: Number(row.started_at_ms) });
  }),
);
