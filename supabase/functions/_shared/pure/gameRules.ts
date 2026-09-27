/**
 * Mini-game economy & anti-cheat rules — the SINGLE source of truth shared by
 * the Expo client (UI, reward preview) and the `process-score` Edge Function
 * (authoritative validation). Dependency-free on purpose.
 */

export const MINIGAME_IDS = ['terminal-coder', 'farm-sim', 'save-server'] as const;
export type MiniGameId = (typeof MINIGAME_IDS)[number];

export const PAYLOAD_VERSION = 1 as const;

export interface MiniGameRule {
  readonly id: MiniGameId;
  /** Nominal round length. */
  readonly durationSec: number;
  /** Rounds shorter than this are rejected (prevents instant-submit farming). */
  readonly minDurationSec: number;
  /** Theoretical ceiling for a perfect human player, with headroom. */
  readonly maxScorePerSecond: number;
  readonly coinsPerPoint: number;
  readonly maxCoinsPerSession: number;
  /** Local stat effects applied when a round finishes. */
  readonly funReward: number;
  readonly energyCost: number;
  readonly hungerCost: number;
}

export const MINIGAME_RULES: Readonly<Record<MiniGameId, MiniGameRule>> = {
  'terminal-coder': {
    id: 'terminal-coder',
    durationSec: 60,
    minDurationSec: 10,
    maxScorePerSecond: 20,
    coinsPerPoint: 0.12,
    maxCoinsPerSession: 90,
    funReward: 22,
    energyCost: 8,
    hungerCost: 5,
  },
  'farm-sim': {
    id: 'farm-sim',
    durationSec: 60,
    minDurationSec: 10,
    maxScorePerSecond: 14,
    coinsPerPoint: 0.15,
    maxCoinsPerSession: 80,
    funReward: 26,
    energyCost: 5,
    hungerCost: 6,
  },
  'save-server': {
    id: 'save-server',
    durationSec: 60,
    minDurationSec: 10,
    maxScorePerSecond: 13,
    coinsPerPoint: 0.1,
    maxCoinsPerSession: 75,
    funReward: 20,
    energyCost: 10,
    hungerCost: 5,
  },
};

/** Clock drift tolerated between the client-reported and server-observed durations. */
export const DURATION_TOLERANCE_MS = 5_000;
/** A started session must be settled within this window. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export const isMiniGameId = (v: unknown): v is MiniGameId =>
  typeof v === 'string' && (MINIGAME_IDS as readonly string[]).includes(v);

export const computeCoinReward = (gameId: MiniGameId, score: number): number => {
  const rule = MINIGAME_RULES[gameId];
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(rule.maxCoinsPerSession, Math.floor(score * rule.coinsPerPoint));
};

export interface MiniGameResultPayload {
  readonly v: typeof PAYLOAD_VERSION;
  readonly sessionId: string;
  readonly nonce: string;
  readonly gameId: MiniGameId;
  readonly score: number;
  /** Epoch ms (trusted client clock). */
  readonly startedAt: number;
  readonly endedAt: number;
  /** Game-specific counters (hits, misses, …) — used for heuristics / analytics. */
  readonly stats: Readonly<Record<string, number>>;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** Structural validation of untrusted input. */
export const parsePayload = (input: unknown): MiniGameResultPayload | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const p = input as Record<string, unknown>;
  const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
  if (p.v !== PAYLOAD_VERSION) return undefined;
  if (typeof p.sessionId !== 'string' || p.sessionId.length < 8 || p.sessionId.length > 64) return undefined;
  if (typeof p.nonce !== 'string' || p.nonce.length < 16 || p.nonce.length > 128) return undefined;
  if (!isMiniGameId(p.gameId)) return undefined;
  if (!isInt(p.score) || p.score < 0 || p.score > 1_000_000) return undefined;
  if (!isInt(p.startedAt) || !isInt(p.endedAt)) return undefined;
  if (typeof p.stats !== 'object' || p.stats === null || Array.isArray(p.stats)) return undefined;
  const statEntries = Object.entries(p.stats as Record<string, unknown>);
  if (statEntries.length > 16) return undefined;
  const stats: Record<string, number> = {};
  for (const [k, val] of statEntries) {
    if (k.length > 32 || !isInt(val)) return undefined;
    stats[k] = val;
  }
  return {
    v: PAYLOAD_VERSION,
    sessionId: p.sessionId,
    nonce: p.nonce,
    gameId: p.gameId,
    score: p.score,
    startedAt: p.startedAt,
    endedAt: p.endedAt,
    stats,
  };
};

/**
 * Logical (physics-of-the-game) validation.
 * @param serverStartedAt when the server issued the session
 * @param serverNow       when the server received the result
 */
export const validateScoreClaim = (
  payload: MiniGameResultPayload,
  serverStartedAt: number,
  serverNow: number,
): ValidationResult => {
  const rule = MINIGAME_RULES[payload.gameId];
  const claimedMs = payload.endedAt - payload.startedAt;

  if (claimedMs <= 0) return { ok: false, reason: 'non_positive_duration' };
  if (claimedMs < rule.minDurationSec * 1000) return { ok: false, reason: 'too_short' };
  if (claimedMs > rule.durationSec * 1000 + DURATION_TOLERANCE_MS) return { ok: false, reason: 'too_long' };

  const serverElapsed = serverNow - serverStartedAt;
  if (serverElapsed > SESSION_TTL_MS) return { ok: false, reason: 'session_expired' };
  // The client cannot have played longer than the server has known about the session.
  if (claimedMs > serverElapsed + DURATION_TOLERANCE_MS) return { ok: false, reason: 'duration_exceeds_server_window' };

  // Use the *smaller* of the two durations so a forged long round buys nothing.
  const effectiveSec = Math.min(claimedMs, serverElapsed) / 1000;
  const ceiling = Math.ceil(rule.maxScorePerSecond * effectiveSec);
  if (payload.score > ceiling) return { ok: false, reason: 'score_exceeds_theoretical_max' };

  return { ok: true };
};
