import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import type { MiniGameId, MiniGameResultPayload } from '@shared/gameRules';

import type { TypedSupabaseClient } from '@/core/network/supabase';
import type { Activity, ActivityType, Stats } from '@/entities/companion';
import type { ServerSnapshot } from '@/store/companion';

/**
 * Typed, error-normalised wrapper over RPCs & Edge Functions.
 * Every call resolves to a discriminated union — no throws leak to callers.
 */

export type ApiOutcome<T> =
  | { kind: 'ok'; data: T }
  /** Server understood and definitively refused (don't retry). */
  | { kind: 'rejected'; reason: string }
  /** Network / 5xx / 429 — safe to retry with backoff (all mutations are idempotent). */
  | { kind: 'transient'; reason: string; retryAfterMs?: number };

interface RpcEconomyResult {
  ok: boolean;
  coins?: number;
  error?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** PostgREST errors: 5 digit SQLSTATE codes. Class 08 / 53 / 57 are infrastructure → transient. */
const classifyPgError = (error: { code?: string; message: string }): ApiOutcome<never> => {
  const code = error.code ?? '';
  if (code === '' || code.startsWith('08') || code.startsWith('53') || code.startsWith('57') || code === 'PGRST301') {
    return { kind: 'transient', reason: error.message };
  }
  return { kind: 'rejected', reason: `${code}:${error.message}` };
};

const economyRpc = async (
  sb: TypedSupabaseClient,
  fn: 'purchase_item' | 'buy_food' | 'equip_item',
  args: Record<string, string>,
): Promise<ApiOutcome<{ coins: number | undefined }>> => {
  try {
    // The generated Database type narrows `args` per function; the union here is validated by the caller.
    const { data, error } = await sb.rpc(fn as 'purchase_item', args as never);
    if (error) return classifyPgError(error);
    const result = (isRecord(data) ? data : {}) as unknown as RpcEconomyResult;
    if (!result.ok) return { kind: 'rejected', reason: result.error ?? 'unknown' };
    return { kind: 'ok', data: { coins: result.coins } };
  } catch (e) {
    return { kind: 'transient', reason: e instanceof Error ? e.message : 'network' };
  }
};

export const purchaseItem = (sb: TypedSupabaseClient, opId: string, itemId: string) =>
  economyRpc(sb, 'purchase_item', { p_op_id: opId, p_item_id: itemId });

export const buyFood = (sb: TypedSupabaseClient, opId: string, foodId: string) =>
  economyRpc(sb, 'buy_food', { p_op_id: opId, p_food_id: foodId });

export const equipItem = (sb: TypedSupabaseClient, itemId: string) =>
  economyRpc(sb, 'equip_item', { p_item_id: itemId });

// ── Edge Functions ───────────────────────────────────────────────────────────

const invokeFunction = async <T>(
  sb: TypedSupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<ApiOutcome<T>> => {
  try {
    const { data, error } = await sb.functions.invoke<T>(name, { body });
    if (!error) return { kind: 'ok', data: data as T };

    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let reason = `http_${res.status}`;
      try {
        const json: unknown = await res.json();
        if (isRecord(json) && typeof json.error === 'string') reason = json.error;
      } catch {
        /* non-JSON body */
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        return { kind: 'transient', reason, retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : 60_000 };
      }
      if (res.status >= 500 || res.status === 408) return { kind: 'transient', reason };
      return { kind: 'rejected', reason };
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      return { kind: 'transient', reason: error.message };
    }
    return { kind: 'transient', reason: String(error) };
  } catch (e) {
    return { kind: 'transient', reason: e instanceof Error ? e.message : 'network' };
  }
};

export interface StartGameResponse {
  sessionId: string;
  nonce: string;
  serverStartedAt: number;
}

export const startGameSession = (sb: TypedSupabaseClient, gameId: MiniGameId) =>
  invokeFunction<StartGameResponse>(sb, 'start-game', { gameId });

export interface ProcessScoreResponse {
  credited: number;
  coins: number;
}

export const submitScore = (
  sb: TypedSupabaseClient,
  payload: MiniGameResultPayload,
  signature: string,
  opId: string,
) => invokeFunction<ProcessScoreResponse>(sb, 'process-score', { payload, signature, opId });

// ── Clock & snapshots ────────────────────────────────────────────────────────

export const fetchServerTime = async (
  sb: TypedSupabaseClient,
): Promise<{ sentAt: number; serverMs: number; receivedAt: number } | undefined> => {
  const sentAt = Date.now();
  const { data, error } = await sb.rpc('server_now');
  const receivedAt = Date.now();
  if (error || typeof data !== 'string') return undefined;
  const serverMs = Date.parse(data);
  return Number.isFinite(serverMs) ? { sentAt, serverMs, receivedAt } : undefined;
};

const ACTIVITY_TYPES: readonly ActivityType[] = ['idle', 'sleeping', 'eating', 'showering', 'working'];

const toNumber = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export const fetchSnapshot = async (sb: TypedSupabaseClient): Promise<ServerSnapshot | undefined> => {
  const { data, error } = await sb.rpc('get_player_snapshot');
  if (error || !isRecord(data)) return undefined;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  let gameState: ServerSnapshot['gameState'];
  const gs = data.game_state;
  if (isRecord(gs)) {
    const activityType = ACTIVITY_TYPES.includes(gs.activity as ActivityType) ? (gs.activity as ActivityType) : 'idle';
    const since = typeof gs.activity_since === 'string' ? Date.parse(gs.activity_since) : NaN;
    const simulatedAt = typeof gs.simulated_at === 'string' ? Date.parse(gs.simulated_at) : NaN;
    if (Number.isFinite(simulatedAt)) {
      const stats: Stats = {
        energy: toNumber(gs.energy),
        hunger: toNumber(gs.hunger),
        hygiene: toNumber(gs.hygiene),
        fun: toNumber(gs.fun),
      };
      const activity: Activity = { type: activityType, since: Number.isFinite(since) ? since : simulatedAt };
      gameState = { stats, activity, simulatedAt };
    }
  }

  return {
    coins: toNumber(data.coins),
    owned: strings(data.owned),
    equipped: strings(data.equipped),
    gameState,
    serverNow: toNumber(data.server_now, Date.now()),
  };
};

export const pushGameState = async (
  sb: TypedSupabaseClient,
  stats: Stats,
  activity: Activity,
  simulatedAt: number,
): Promise<boolean> => {
  const { error } = await sb.rpc('sync_game_state', {
    p_energy: stats.energy,
    p_hunger: stats.hunger,
    p_hygiene: stats.hygiene,
    p_fun: stats.fun,
    // Timed activities are purely cosmetic and short; persist them as idle.
    p_activity: activity.type === 'sleeping' ? 'sleeping' : 'idle',
    p_activity_since: new Date(activity.since).toISOString(),
    p_simulated_at: new Date(simulatedAt).toISOString(),
  });
  return !error;
};
