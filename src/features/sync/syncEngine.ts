import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { env } from '@/core/config/env';
import { createLogger } from '@/core/logger';
import { ensureSession, getSupabase, initSupabase, type TypedSupabaseClient } from '@/core/network/supabase';
import { serverClock, trustedNow } from '@/core/time';
import { companionStore, type PendingOp } from '@/store/companion';

import {
  buyFood,
  equipItem,
  fetchServerTime,
  fetchSnapshot,
  purchaseItem,
  pushGameState,
  submitScore,
  type ApiOutcome,
} from './serverApi';

const log = createLogger('sync');

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const PERIODIC_SYNC_MS = 60_000;
const DEBOUNCE_MS = 400;

/** Exponential backoff with full jitter (AWS architecture blog) — avoids thundering herds at 1M users. */
export const backoffMs = (attempts: number, random: () => number = Math.random): number => {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(attempts, 16));
  return Math.floor(random() * cap) + 500;
};

const executeOp = (sb: TypedSupabaseClient, op: PendingOp): Promise<ApiOutcome<unknown>> => {
  switch (op.kind) {
    case 'purchase_item':
      return purchaseItem(sb, op.opId, op.itemId);
    case 'buy_food':
      return buyFood(sb, op.opId, op.foodId);
    case 'equip_item':
      return equipItem(sb, op.itemId);
    case 'submit_score':
      return submitScore(sb, op.payload, op.signature, op.opId);
  }
};

/**
 * Offline-first sync engine.
 *  - Single-flight: at most one flush runs at a time; triggers during a flush coalesce into one rerun.
 *  - Ordered: ops are replayed FIFO so a purchase precedes the equip that depends on it.
 *  - Idempotent: every mutation carries its opId; the server ledger dedupes replays.
 *  - Reconciling: after the queue drains we pull the authoritative snapshot (LWW on server timestamps).
 */
class SyncEngine {
  private running = false;
  private rerun = false;
  private online = true;
  private started = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribers: (() => void)[] = [];

  start(): void {
    if (this.started || !env.isBackendConfigured) return;
    this.started = true;

    this.unsubscribers.push(
      NetInfo.addEventListener((state: NetInfoState) => {
        const wasOnline = this.online;
        this.online = state.isConnected !== false && state.isInternetReachable !== false;
        if (!wasOnline && this.online) this.requestSync('network_regained');
      }),
    );

    // New ops → flush soon (debounced so bursts of purchases batch into one pass).
    this.unsubscribers.push(
      companionStore.subscribe(
        (s) => s.pendingOps.length,
        (len, prev) => {
          if (len > prev) this.requestSync('op_enqueued');
        },
      ),
    );

    const periodic = setInterval(() => this.requestSync('periodic'), PERIODIC_SYNC_MS);
    this.unsubscribers.push(() => clearInterval(periodic));
    this.requestSync('startup');
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.started = false;
  }

  requestSync(reason: string): void {
    if (!env.isBackendConfigured) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      log.debug(`sync requested: ${reason}`);
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /** Awaitable flush — used when the app is about to background. */
  async flush(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (!this.online) return;
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.flushOnce();
      } while (this.rerun);
    } catch (e) {
      log.warn('flush failed', e);
    } finally {
      this.running = false;
    }
  }

  private async flushOnce(): Promise<void> {
    const sb = getSupabase() ?? (await initSupabase());
    if (!sb) return;
    const userId = await ensureSession();
    if (!userId) return;

    const t = await fetchServerTime(sb);
    if (t) serverClock.applySample(t.sentAt, t.serverMs, t.receivedAt);

    const now = trustedNow();
    const store = companionStore.getState();
    store.advance(now);

    let blocked = false;
    for (const op of companionStore.getState().pendingOps) {
      if (op.nextAttemptAt > now) {
        blocked = true;
        break; // preserve FIFO ordering: don't skip ahead of a backing-off op
      }
      const outcome = await executeOp(sb, op);
      if (outcome.kind === 'ok') {
        companionStore.getState().settleOp(op.opId);
      } else if (outcome.kind === 'rejected') {
        log.warn(`op ${op.kind} rejected: ${outcome.reason}`);
        companionStore.getState().rejectOp(op.opId);
      } else {
        const delay = outcome.retryAfterMs ?? backoffMs(op.attempts);
        companionStore.getState().markOpAttempt(op.opId, now + delay);
        this.schedule(delay);
        blocked = true;
        break;
      }
    }

    const latest = companionStore.getState();
    await pushGameState(sb, latest.stats, latest.activity, latest.lastSimulatedAt);

    // Only reconcile economy when the queue is drained, otherwise the snapshot would
    // momentarily "undo" optimistic ops that are still in flight.
    if (!blocked && companionStore.getState().pendingOps.length === 0) {
      const snap = await fetchSnapshot(sb);
      if (snap) companionStore.getState().applyServerSnapshot(snap);
    }
  }

  private schedule(delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      this.requestSync('backoff_elapsed');
    }, delayMs);
    this.timers.push(timer);
  }
}

export const syncEngine = new SyncEngine();
