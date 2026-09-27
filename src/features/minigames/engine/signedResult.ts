import { PAYLOAD_VERSION, type MiniGameId, type MiniGameResultPayload } from '@shared/gameRules';

import { signPayload } from '@/core/crypto/hmac';

import type { GameResult } from './types';

export interface ServerSession {
  readonly sessionId: string;
  readonly nonce: string;
  readonly serverStartedAt: number;
}

const toInt = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * Builds the tamper-evident result envelope sent to `process-score`.
 *
 *   payload   = { v, sessionId, nonce, gameId, score, startedAt, endedAt, stats }
 *   signature = HMAC-SHA256(clientKey, canonicalJSON(payload))
 *
 * Editing any field in memory (score, timestamps) after the round invalidates
 * the signature; replaying it is blocked by the single-use server nonce.
 */
export const buildSignedResult = (
  session: ServerSession,
  gameId: MiniGameId,
  result: GameResult,
  startedAt: number,
  endedAt: number,
): { payload: MiniGameResultPayload; signature: string } => {
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.stats)) stats[k] = toInt(v);

  const payload: MiniGameResultPayload = {
    v: PAYLOAD_VERSION,
    sessionId: session.sessionId,
    nonce: session.nonce,
    gameId,
    score: toInt(result.score),
    startedAt: Math.round(startedAt),
    endedAt: Math.round(endedAt),
    stats,
  };
  const { signature } = signPayload(payload);
  return { payload, signature };
};
