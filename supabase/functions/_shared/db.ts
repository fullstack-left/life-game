import postgres from 'npm:postgres@3';

import { getAdminClient } from './auth.ts';
import { ENV } from './env.ts';

/**
 * Settlement transport.
 *
 * Preferred: direct SQL through **Supavisor in Transaction Mode (port 6543)**.
 * A client holds a real Postgres backend only for the duration of one
 * transaction, so thousands of concurrent isolates multiplex onto a small pool.
 * Transaction mode does not support prepared statements → `prepare: false`.
 *
 * Fallback (no DB_POOLER_URL): the same SQL function via PostgREST RPC with the
 * service_role key. Both paths call `settle_game_session`, a single atomic
 * transaction, so semantics are identical.
 */

let sql: ReturnType<typeof postgres> | undefined;

const getSql = (): ReturnType<typeof postgres> | undefined => {
  const url = ENV.dbPoolerUrl;
  if (!url) return undefined;
  if (!url.includes(':6543')) console.warn('[db] DB_POOLER_URL should target the transaction pooler on port 6543');
  sql ??= postgres(url, {
    prepare: false, // required by transaction-mode pooling
    max: 1, // one connection per isolate; Supavisor does the fan-in
    idle_timeout: 20,
    connect_timeout: 5,
  });
  return sql;
};

export interface SettleArgs {
  readonly sessionId: string;
  readonly userId: string;
  readonly opId: string;
  readonly score: number;
  readonly coins: number;
}

export interface SettleResult {
  readonly ok: boolean;
  readonly credited?: number;
  readonly coins?: number;
  readonly error?: string;
  readonly replay?: boolean;
}

export const settleSession = async (a: SettleArgs): Promise<SettleResult> => {
  const db = getSql();
  if (db) {
    const rows = await db.begin(async (tx) => {
      // Bound the transaction so a stuck lock can never pin a pooled connection.
      await tx`set local statement_timeout = '3s'`;
      return tx`select public.settle_game_session(${a.sessionId}::uuid, ${a.userId}::uuid, ${a.opId}::uuid, ${a.score}::int, ${a.coins}::int) as r`;
    });
    return (rows[0]?.r ?? { ok: false, error: 'no_result' }) as SettleResult;
  }

  const { data, error } = await getAdminClient().rpc('settle_game_session', {
    p_session_id: a.sessionId,
    p_user_id: a.userId,
    p_op_id: a.opId,
    p_score: a.score,
    p_coins: a.coins,
  });
  if (error) throw new Error(`settle rpc failed: ${error.message}`);
  return data as SettleResult;
};
