import type { ItemSlot } from '@shared/catalog';
import type { MiniGameId, MiniGameResultPayload } from '@shared/gameRules';

import type { Activity, SimulationEvent, Stats } from '@/entities/companion';

interface BaseOp {
  /** UUID v4 — doubles as the server-side idempotency key. */
  readonly opId: string;
  readonly createdAt: number;
  /** Optimistic coin delta applied to the displayed balance until settled. */
  readonly coinDelta: number;
  readonly attempts: number;
  readonly nextAttemptAt: number;
}

export type PendingOp =
  | (BaseOp & { readonly kind: 'purchase_item'; readonly itemId: string })
  | (BaseOp & { readonly kind: 'buy_food'; readonly foodId: string })
  | (BaseOp & { readonly kind: 'equip_item'; readonly itemId: string })
  | (BaseOp & {
      readonly kind: 'submit_score';
      readonly payload: MiniGameResultPayload;
      readonly signature: string;
    });

export type PendingOpKind = PendingOp['kind'];

export interface ConfirmedEconomy {
  /** Last server-acknowledged balance. Displayed balance = coins + Σ pending coinDelta. */
  readonly coins: number;
  readonly owned: readonly string[];
}

export interface OfflineReport {
  readonly awaySec: number;
  readonly before: Stats;
  readonly after: Stats;
  readonly events: readonly SimulationEvent[];
}

export interface MiniGameOutcome {
  readonly gameId: MiniGameId;
  readonly score: number;
  /** 0..1 — how well the round went; scales the Fun reward. */
  readonly performance: number;
  /** Present when the round was bound to a server session (earns coins). */
  readonly signed?: { readonly payload: MiniGameResultPayload; readonly signature: string };
}

export interface CompanionData {
  readonly schemaVersion: number;
  readonly characterName: string;
  readonly stats: Stats;
  readonly activity: Activity;
  /** Trusted epoch ms the stats were last advanced to. */
  readonly lastSimulatedAt: number;
  readonly confirmed: ConfirmedEconomy;
  readonly equipped: Readonly<Partial<Record<ItemSlot, string>>>;
  readonly pendingOps: readonly PendingOp[];
  readonly offlineReport: OfflineReport | undefined;
  /** Trusted ms of the last successful server reconciliation. */
  readonly lastServerSyncAt: number | undefined;
  readonly totalGamesPlayed: number;
}

export type ActionResult = { ok: true } | { ok: false; reason: 'insufficient_funds' | 'unknown_item' | 'not_owned' | 'already_owned' | 'busy' };

export interface CompanionActions {
  /** Advance the simulation to `now` (trusted ms). `reportIfAwayOverSec` produces an offline summary. */
  advance(now: number, reportIfAwayOverSec?: number): void;
  sleep(now: number): ActionResult;
  wakeUp(now: number): ActionResult;
  shower(now: number): ActionResult;
  eat(foodId: string, now: number): ActionResult;
  purchase(itemId: string, now: number): ActionResult;
  equip(itemId: string, now: number): ActionResult;
  beginWork(now: number): ActionResult;
  /** Ends any non-sleep activity immediately (e.g. mini-game cancelled). */
  endActivity(now: number): void;
  applyMiniGameOutcome(outcome: MiniGameOutcome, now: number): { coinsPending: number };
  dismissOfflineReport(): void;
  rename(name: string): void;

  // Sync engine hooks
  markOpAttempt(opId: string, nextAttemptAt: number): void;
  settleOp(opId: string): void;
  rejectOp(opId: string): void;
  applyServerSnapshot(snapshot: ServerSnapshot): void;
}

export interface ServerSnapshot {
  readonly coins: number;
  readonly owned: readonly string[];
  readonly equipped: readonly string[];
  readonly gameState?: {
    readonly stats: Stats;
    readonly activity: Activity;
    readonly simulatedAt: number;
  };
  readonly serverNow: number;
}

export type CompanionStore = CompanionData & CompanionActions;
