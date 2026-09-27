import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { CATALOG_BY_ID, FOOD_BY_ID, STARTER_ITEMS, STARTING_COINS, type ItemSlot } from '@shared/catalog';
import { computeCoinReward, MINIGAME_RULES } from '@shared/gameRules';

import type { EconomyMode } from '@/core/config/env';
import { clamp } from '@/core/utils/math';
import {
  aggregateModifiers,
  simulate,
  STAT_MAX,
  type Activity,
  type Stats,
} from '@/entities/companion';

import type {
  ActionResult,
  CompanionData,
  CompanionStore,
  PendingOp,
  ServerSnapshot,
} from './types';

export const COMPANION_SCHEMA_VERSION = 1;

export const TIMED_ACTIVITY_MS = {
  eating: 4_000,
  showering: 6_000,
  working: 10 * 60_000, // safety auto-end if the mini-game overlay is killed
} as const;

/** How long the app must have been away before we show "While you were away…". */
export const DEFAULT_REPORT_THRESHOLD_SEC = 15 * 60;

export interface CompanionStoreDeps {
  readonly storage: import('zustand/middleware').StateStorage;
  readonly economyMode: EconomyMode;
  readonly uuid: () => string;
  /** Trusted clock used for initial state. */
  readonly now: () => number;
  readonly storageKey?: string;
}

const OK: ActionResult = { ok: true };
const fail = (reason: Exclude<ActionResult, { ok: true }>['reason']): ActionResult => ({ ok: false, reason });

const addStat = (s: Stats, key: keyof Stats, delta: number): Stats => ({
  ...s,
  [key]: clamp(s[key] + delta, 0, STAT_MAX),
});

export const createInitialData = (now: number): CompanionData => {
  const equipped: Partial<Record<ItemSlot, string>> = {};
  for (const item of STARTER_ITEMS) equipped[item.slot] ??= item.id;
  return {
    schemaVersion: COMPANION_SCHEMA_VERSION,
    characterName: 'Alex',
    stats: { energy: 85, hunger: 75, hygiene: 80, fun: 70 },
    activity: { type: 'idle', since: now },
    lastSimulatedAt: now,
    confirmed: { coins: STARTING_COINS, owned: STARTER_ITEMS.map((i) => i.id) },
    equipped,
    pendingOps: [],
    offlineReport: undefined,
    lastServerSyncAt: undefined,
    totalGamesPlayed: 0,
  };
};

// ── Selectors (pure, memo-friendly) ──────────────────────────────────────────
export const selectDisplayedCoins = (s: CompanionData): number =>
  s.pendingOps.reduce((acc, op) => acc + op.coinDelta, s.confirmed.coins);

export const selectPendingCoins = (s: CompanionData): number =>
  s.pendingOps.reduce((acc, op) => (op.kind === 'submit_score' ? acc + op.coinDelta : acc), 0);

export const selectOwnedIds = (s: CompanionData): ReadonlySet<string> => {
  const owned = new Set(s.confirmed.owned);
  for (const op of s.pendingOps) if (op.kind === 'purchase_item') owned.add(op.itemId);
  return owned;
};

export const selectEquippedIds = (s: CompanionData): string[] =>
  Object.values(s.equipped).filter((v): v is string => typeof v === 'string');

// ─────────────────────────────────────────────────────────────────────────────

export const createCompanionStore = (deps: CompanionStoreDeps) => {
  const { economyMode, uuid } = deps;

  return createStore<CompanionStore>()(
    subscribeWithSelector(
      persist(
        (set, get) => {
          /** Advances the simulation in-place; every mutating action calls this first. */
          const advanced = (now: number): CompanionData => {
            const s = get();
            const deltaSec = (now - s.lastSimulatedAt) / 1000;
            if (deltaSec <= 0) return s;
            const result = simulate({
              stats: s.stats,
              activity: s.activity,
              deltaSec,
              nowMs: now,
              modifiers: aggregateModifiers(selectEquippedIds(s)),
            });
            return { ...s, stats: result.stats, activity: result.activity, lastSimulatedAt: now };
          };

          const newOp = <K extends PendingOp['kind']>(
            kind: K,
            coinDelta: number,
            now: number,
            extra: Omit<Extract<PendingOp, { kind: K }>, 'kind' | 'opId' | 'createdAt' | 'coinDelta' | 'attempts' | 'nextAttemptAt'>,
          ): PendingOp =>
            ({ kind, opId: uuid(), createdAt: now, coinDelta, attempts: 0, nextAttemptAt: now, ...extra }) as unknown as PendingOp;

          /** Local economy settles instantly; server economy queues for the sync engine. */
          const commitEconomy = (
            base: CompanionData,
            op: PendingOp,
            localApply: (c: CompanionData['confirmed']) => CompanionData['confirmed'],
          ): Pick<CompanionData, 'confirmed' | 'pendingOps'> =>
            economyMode === 'local'
              ? { confirmed: localApply(base.confirmed), pendingOps: base.pendingOps }
              : { confirmed: base.confirmed, pendingOps: [...base.pendingOps, op] };

          const isBusy = (a: Activity): boolean => a.type === 'eating' || a.type === 'showering';

          return {
            ...createInitialData(deps.now()),

            advance: (now, reportIfAwayOverSec) => {
              const before = get();
              const deltaSec = (now - before.lastSimulatedAt) / 1000;
              if (deltaSec <= 0) return;
              const result = simulate({
                stats: before.stats,
                activity: before.activity,
                deltaSec,
                nowMs: now,
                modifiers: aggregateModifiers(selectEquippedIds(before)),
              });
              const report =
                reportIfAwayOverSec !== undefined && deltaSec >= reportIfAwayOverSec
                  ? { awaySec: result.simulatedSec, before: before.stats, after: result.stats, events: result.events }
                  : before.offlineReport;
              set({ stats: result.stats, activity: result.activity, lastSimulatedAt: now, offlineReport: report });
            },

            sleep: (now) => {
              const s = advanced(now);
              if (s.activity.type === 'sleeping') return OK;
              if (isBusy(s.activity)) return fail('busy');
              set({ ...s, activity: { type: 'sleeping', since: now } });
              return OK;
            },

            wakeUp: (now) => {
              const s = advanced(now);
              if (s.activity.type !== 'sleeping') return OK;
              set({ ...s, activity: { type: 'idle', since: now } });
              return OK;
            },

            shower: (now) => {
              const s = advanced(now);
              if (s.activity.type === 'sleeping' || isBusy(s.activity)) return fail('busy');
              set({
                ...s,
                stats: addStat(addStat(s.stats, 'hygiene', STAT_MAX), 'fun', 3),
                activity: { type: 'showering', since: now, until: now + TIMED_ACTIVITY_MS.showering },
              });
              return OK;
            },

            eat: (foodId, now) => {
              const food = FOOD_BY_ID.get(foodId);
              if (!food) return fail('unknown_item');
              const s = advanced(now);
              if (s.activity.type === 'sleeping' || isBusy(s.activity)) return fail('busy');
              if (selectDisplayedCoins(s) < food.price) return fail('insufficient_funds');
              const op = newOp('buy_food', -food.price, now, { foodId });
              set({
                ...s,
                ...commitEconomy(s, op, (c) => ({ ...c, coins: c.coins - food.price })),
                stats: addStat(addStat(s.stats, 'hunger', food.hungerRestore), 'fun', food.funBonus),
                activity: { type: 'eating', since: now, until: now + TIMED_ACTIVITY_MS.eating },
              });
              return OK;
            },

            purchase: (itemId, now) => {
              const item = CATALOG_BY_ID.get(itemId);
              if (!item) return fail('unknown_item');
              const s = advanced(now);
              if (selectOwnedIds(s).has(itemId)) return fail('already_owned');
              if (selectDisplayedCoins(s) < item.price) return fail('insufficient_funds');
              const op = newOp('purchase_item', -item.price, now, { itemId });
              set({
                ...s,
                ...commitEconomy(s, op, (c) => ({ coins: c.coins - item.price, owned: [...c.owned, itemId] })),
              });
              return OK;
            },

            equip: (itemId, now) => {
              const item = CATALOG_BY_ID.get(itemId);
              if (!item) return fail('unknown_item');
              const s = advanced(now); // advance with OLD modifiers up to now, then switch
              if (!selectOwnedIds(s).has(itemId)) return fail('not_owned');
              const equipped = { ...s.equipped, [item.slot]: itemId };
              const pendingOps =
                economyMode === 'local'
                  ? s.pendingOps
                  : [
                      // Coalesce: only the latest equip per slot needs to reach the server.
                      ...s.pendingOps.filter(
                        (op) => !(op.kind === 'equip_item' && CATALOG_BY_ID.get(op.itemId)?.slot === item.slot),
                      ),
                      newOp('equip_item', 0, now, { itemId }),
                    ];
              set({ ...s, equipped, pendingOps });
              return OK;
            },

            beginWork: (now) => {
              const s = advanced(now);
              if (s.activity.type === 'sleeping' || isBusy(s.activity)) return fail('busy');
              set({ ...s, activity: { type: 'working', since: now, until: now + TIMED_ACTIVITY_MS.working } });
              return OK;
            },

            endActivity: (now) => {
              const s = advanced(now);
              if (s.activity.type === 'sleeping' || s.activity.type === 'idle') return;
              set({ ...s, activity: { type: 'idle', since: now } });
            },

            applyMiniGameOutcome: (outcome, now) => {
              const rule = MINIGAME_RULES[outcome.gameId];
              const s = advanced(now);
              const perf = clamp(outcome.performance, 0, 1);
              let stats = addStat(s.stats, 'fun', rule.funReward * (0.4 + 0.6 * perf));
              stats = addStat(stats, 'energy', -rule.energyCost);
              stats = addStat(stats, 'hunger', -rule.hungerCost);

              const coins = computeCoinReward(outcome.gameId, outcome.score);
              let economy: Pick<CompanionData, 'confirmed' | 'pendingOps'> = {
                confirmed: s.confirmed,
                pendingOps: s.pendingOps,
              };
              if (economyMode === 'local') {
                economy = { ...economy, confirmed: { ...s.confirmed, coins: s.confirmed.coins + coins } };
              } else if (outcome.signed && coins > 0) {
                economy = {
                  ...economy,
                  pendingOps: [
                    ...s.pendingOps,
                    newOp('submit_score', coins, now, {
                      payload: outcome.signed.payload,
                      signature: outcome.signed.signature,
                    }),
                  ],
                };
              }
              set({
                ...s,
                ...economy,
                stats,
                activity: { type: 'idle', since: now },
                totalGamesPlayed: s.totalGamesPlayed + 1,
              });
              const credited = economyMode === 'local' || (outcome.signed !== undefined && coins > 0);
              return { coinsPending: credited ? coins : 0 };
            },

            dismissOfflineReport: () => set({ offlineReport: undefined }),

            rename: (name) => {
              const trimmed = name.trim().slice(0, 20);
              if (trimmed) set({ characterName: trimmed });
            },

            markOpAttempt: (opId, nextAttemptAt) =>
              set((s) => ({
                pendingOps: s.pendingOps.map((op) =>
                  op.opId === opId ? { ...op, attempts: op.attempts + 1, nextAttemptAt } : op,
                ),
              })),

            settleOp: (opId) =>
              set((s) => {
                const op = s.pendingOps.find((o) => o.opId === opId);
                if (!op) return {};
                // Fold the op into the confirmed economy so the displayed balance does not flicker
                // between settlement and the next full snapshot.
                const owned =
                  op.kind === 'purchase_item' && !s.confirmed.owned.includes(op.itemId)
                    ? [...s.confirmed.owned, op.itemId]
                    : s.confirmed.owned;
                return {
                  confirmed: { coins: s.confirmed.coins + op.coinDelta, owned },
                  pendingOps: s.pendingOps.filter((o) => o.opId !== opId),
                };
              }),

            rejectOp: (opId) =>
              set((s) => {
                const op = s.pendingOps.find((o) => o.opId === opId);
                if (!op) return {};
                const pendingOps = s.pendingOps.filter((o) => o.opId !== opId);
                // Roll back an optimistic equip of an item we turned out not to own.
                if (op.kind === 'purchase_item') {
                  const item = CATALOG_BY_ID.get(op.itemId);
                  if (item && s.equipped[item.slot] === op.itemId) {
                    const fallback = STARTER_ITEMS.find((i) => i.slot === item.slot)?.id;
                    return { pendingOps, equipped: { ...s.equipped, [item.slot]: fallback } };
                  }
                }
                return { pendingOps };
              }),

            applyServerSnapshot: (snap: ServerSnapshot) =>
              set((s) => {
                const patch: { -readonly [K in keyof CompanionData]?: CompanionData[K] } = {
                  confirmed: { coins: snap.coins, owned: [...snap.owned] },
                  lastServerSyncAt: snap.serverNow,
                };
                const hasPendingEquip = s.pendingOps.some((op) => op.kind === 'equip_item');
                if (!hasPendingEquip && snap.equipped.length > 0) {
                  const equipped: Partial<Record<ItemSlot, string>> = { ...s.equipped };
                  for (const id of snap.equipped) {
                    const item = CATALOG_BY_ID.get(id);
                    if (item) equipped[item.slot] = id;
                  }
                  patch.equipped = equipped;
                }
                // Last-Write-Wins on server timestamps: adopt a newer state from another device.
                if (snap.gameState && snap.gameState.simulatedAt > s.lastSimulatedAt + 1_000) {
                  patch.stats = snap.gameState.stats;
                  patch.activity = snap.gameState.activity;
                  patch.lastSimulatedAt = snap.gameState.simulatedAt;
                }
                return patch;
              }),
          };
        },
        {
          name: deps.storageKey ?? 'companion',
          version: COMPANION_SCHEMA_VERSION,
          storage: createJSONStorage(() => deps.storage),
          partialize: (s): CompanionData => ({
            schemaVersion: s.schemaVersion,
            characterName: s.characterName,
            stats: s.stats,
            activity: s.activity,
            lastSimulatedAt: s.lastSimulatedAt,
            confirmed: s.confirmed,
            equipped: s.equipped,
            pendingOps: s.pendingOps,
            offlineReport: s.offlineReport,
            lastServerSyncAt: s.lastServerSyncAt,
            totalGamesPlayed: s.totalGamesPlayed,
          }),
          migrate: (persisted, version) => {
            // Future schema migrations go here, keyed by `version`.
            if (version !== COMPANION_SCHEMA_VERSION) return createInitialData(deps.now());
            return persisted as CompanionData;
          },
        },
      ),
    ),
  );
};

export type CompanionStoreApi = ReturnType<typeof createCompanionStore>;
