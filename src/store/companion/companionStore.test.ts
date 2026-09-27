import type { StateStorage } from 'zustand/middleware';

import { MINIGAME_RULES, PAYLOAD_VERSION } from '@shared/gameRules';

import {
  createCompanionStore,
  selectDisplayedCoins,
  selectOwnedIds,
  selectPendingCoins,
} from './createCompanionStore';

const T0 = 1_800_000_000_000;

const memoryStorage = (): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const makeStore = (economyMode: 'server' | 'local' = 'server', storage = memoryStorage()) =>
  createCompanionStore({ storage, economyMode, uuid, now: () => T0 });

describe('companion store', () => {
  it('advances the simulation and produces an offline report', () => {
    const store = makeStore();
    const before = store.getState().stats;
    store.getState().advance(T0 + 3 * 3600_000, 15 * 60);
    const s = store.getState();
    expect(s.stats.hunger).toBeLessThan(before.hunger);
    expect(s.offlineReport?.awaySec).toBe(3 * 3600);
    expect(s.lastSimulatedAt).toBe(T0 + 3 * 3600_000);
  });

  it('optimistic purchase in server mode: queued op, displayed balance drops, rollback on reject', () => {
    const store = makeStore('server');
    expect(store.getState().purchase('rug_round', T0).ok).toBe(true);
    let s = store.getState();
    expect(s.pendingOps).toHaveLength(1);
    expect(s.confirmed.coins).toBe(150); // server hasn't confirmed yet
    expect(selectDisplayedCoins(s)).toBe(0);
    expect(selectOwnedIds(s).has('rug_round')).toBe(true);

    expect(store.getState().equip('rug_round', T0).ok).toBe(true);
    const purchaseOp = store.getState().pendingOps.find((o) => o.kind === 'purchase_item')!;
    store.getState().rejectOp(purchaseOp.opId);
    s = store.getState();
    expect(selectDisplayedCoins(s)).toBe(150);
    expect(selectOwnedIds(s).has('rug_round')).toBe(false);
    expect(s.equipped.rug).toBeUndefined(); // no starter rug → unequipped
  });

  it('settling folds the op into confirmed state without flicker', () => {
    const store = makeStore('server');
    store.getState().purchase('plant_cactus', T0);
    const op = store.getState().pendingOps[0]!;
    store.getState().settleOp(op.opId);
    const s = store.getState();
    expect(s.pendingOps).toHaveLength(0);
    expect(s.confirmed.coins).toBe(60);
    expect(s.confirmed.owned).toContain('plant_cactus');
  });

  it('rejects purchases the player cannot afford or already owns', () => {
    const store = makeStore();
    expect(store.getState().purchase('monitor_dual_rgb', T0)).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(store.getState().purchase('monitor_basic', T0)).toEqual({ ok: false, reason: 'already_owned' });
    expect(store.getState().equip('monitor_4k', T0)).toEqual({ ok: false, reason: 'not_owned' });
  });

  it('eating restores hunger, costs coins and blocks while sleeping', () => {
    const store = makeStore('local');
    store.getState().advance(T0 + 4 * 3600_000);
    const hungerBefore = store.getState().stats.hunger;
    expect(store.getState().eat('food_plov', T0 + 4 * 3600_000).ok).toBe(true);
    expect(store.getState().stats.hunger).toBeCloseTo(Math.min(100, hungerBefore + 55), 5);
    expect(store.getState().confirmed.coins).toBe(132);
    expect(store.getState().activity.type).toBe('eating');

    store.getState().advance(T0 + 4 * 3600_000 + 10_000);
    store.getState().sleep(T0 + 4 * 3600_000 + 10_000);
    expect(store.getState().eat('food_apple', T0 + 4 * 3600_000 + 11_000)).toEqual({ ok: false, reason: 'busy' });
  });

  it('equip ops are coalesced per slot', () => {
    const store = makeStore('server');
    store.getState().applyServerSnapshot({ coins: 1000, owned: ['hair_short'], equipped: [], serverNow: T0 });
    expect(store.getState().purchase('hair_curly', T0).ok).toBe(true);
    store.getState().settleOp(store.getState().pendingOps[0]!.opId);
    store.getState().equip('hair_curly', T0);
    store.getState().equip('hair_short', T0);
    store.getState().equip('hair_curly', T0);
    const equips = store.getState().pendingOps.filter((o) => o.kind === 'equip_item');
    expect(equips).toHaveLength(1);
  });

  it('mini-game outcome: signed rounds queue a pending reward; practice rounds give none', () => {
    const store = makeStore('server');
    const rule = MINIGAME_RULES['terminal-coder'];
    const funBefore = store.getState().stats.fun;
    const res = store.getState().applyMiniGameOutcome(
      {
        gameId: 'terminal-coder',
        score: 400,
        performance: 1,
        signed: {
          payload: {
            v: PAYLOAD_VERSION,
            sessionId: 'x'.repeat(36),
            nonce: 'n'.repeat(48),
            gameId: 'terminal-coder',
            score: 400,
            startedAt: T0 - 60_000,
            endedAt: T0,
            stats: {},
          },
          signature: 'f'.repeat(64),
        },
      },
      T0,
    );
    expect(res.coinsPending).toBe(48);
    expect(selectPendingCoins(store.getState())).toBe(48);
    expect(store.getState().stats.fun).toBeCloseTo(Math.min(100, funBefore + rule.funReward), 5);

    const practice = store.getState().applyMiniGameOutcome({ gameId: 'farm-sim', score: 300, performance: 0.5 }, T0);
    expect(practice.coinsPending).toBe(0);
  });

  it('server snapshot applies LWW for game state from another device', () => {
    const store = makeStore('server');
    store.getState().applyServerSnapshot({
      coins: 999,
      owned: ['monitor_basic', 'monitor_4k'],
      equipped: ['monitor_4k'],
      gameState: {
        stats: { energy: 11, hunger: 22, hygiene: 33, fun: 44 },
        activity: { type: 'sleeping', since: T0 + 50_000 },
        simulatedAt: T0 + 60_000,
      },
      serverNow: T0 + 60_000,
    });
    const s = store.getState();
    expect(s.confirmed.coins).toBe(999);
    expect(s.equipped.monitor).toBe('monitor_4k');
    expect(s.stats.energy).toBe(11);
    expect(s.activity.type).toBe('sleeping');
  });

  it('persists synchronously and rehydrates into a new store instance', () => {
    const storage = memoryStorage();
    const a = makeStore('local', storage);
    a.getState().rename('Dilshod');
    a.getState().purchase('rug_round', T0);
    const b = makeStore('local', storage);
    expect(b.getState().characterName).toBe('Dilshod');
    expect(b.getState().confirmed.owned).toContain('rug_round');
  });
});
