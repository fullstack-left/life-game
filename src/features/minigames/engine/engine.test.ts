import { MINIGAME_RULES } from '@shared/gameRules';

import { createFarmState, SheepPhase, stepFarm, tapFarm, penRect } from '../farm-sim/logic';
import { createServerState, rackRect, stepServer, tapServer } from '../save-server/logic';
import {
  CHAR_W,
  createTerminalState,
  LINE_HEIGHT,
  POOL_SIZE,
  SCORE_BUG,
  stepTerminal,
  tapTerminal,
} from '../terminal-coder/logic';

import { acquire, activeCount, createPool, release } from './objectPool';
import { createRng, nextFloat } from './rng';

const DT = 1 / 60;

describe('object pool', () => {
  it('recycles slots without allocating', () => {
    const pool = createPool(3, () => ({ active: true, v: 0 }));
    expect(activeCount(pool)).toBe(0);
    const a = acquire(pool);
    const b = acquire(pool);
    const c = acquire(pool);
    expect([a, b, c]).toEqual([0, 1, 2]);
    expect(acquire(pool)).toBe(-1); // exhausted
    const ref = pool[1];
    release(pool, 1);
    expect(acquire(pool)).toBe(1);
    expect(pool[1]).toBe(ref); // same object instance reused
  });
});

describe('rng', () => {
  it('is deterministic per seed and uniform-ish', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => nextFloat(a));
    const seqB = Array.from({ length: 5 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
    const r = createRng(7);
    const mean = Array.from({ length: 10_000 }, () => nextFloat(r)).reduce((x, y) => x + y) / 10_000;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

/** A bot that taps every bug the frame it appears — the best-possible human. */
const perfectTerminalRun = (seed: number) => {
  const s = createTerminalState(390, 700, seed, 60);
  let peakActive = 0;
  while (!s.over) {
    stepTerminal(s, DT);
    peakActive = Math.max(peakActive, s.lines.filter((l) => l.active).length);
    for (const l of s.lines) {
      if (l.active && l.isBug && l.flash < 0) tapTerminal(s, l.x + 1, l.y + LINE_HEIGHT / 2);
    }
  }
  return { s, peakActive };
};

describe('Terminal Coder', () => {
  it('a perfect player stays under the server theoretical max', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const { s, peakActive } = perfectTerminalRun(seed);
      expect(s.misses).toBe(0);
      expect(s.wrongTaps).toBe(0);
      expect(s.score).toBeLessThanOrEqual(MINIGAME_RULES['terminal-coder'].maxScorePerSecond * 60);
      expect(s.score).toBeGreaterThan(0);
      expect(peakActive).toBeLessThanOrEqual(POOL_SIZE);
    }
  });

  it('missed bugs cost lives and end the game', () => {
    const s = createTerminalState(390, 700, 5, 60);
    while (!s.over) stepTerminal(s, DT);
    expect(s.lives).toBeLessThanOrEqual(0);
    expect(s.elapsed).toBeLessThan(60);
  });

  it('tapping a clean line is penalised', () => {
    const s = createTerminalState(390, 700, 3, 60);
    const line = s.lines[0]!;
    Object.assign(line, { active: true, isBug: false, x: 50, y: 100, width: 20 * CHAR_W, flash: -1 });
    s.score = 20;
    tapTerminal(s, 60, 110);
    expect(s.score).toBe(15);
    expect(s.wrongTaps).toBe(1);
    Object.assign(s.lines[1]!, { active: true, isBug: true, x: 50, y: 300, width: 100, flash: -1 });
    tapTerminal(s, 60, 310);
    expect(s.score).toBe(15 + SCORE_BUG);
  });
});

describe('Farm Simulator', () => {
  it('perfect feeding stays within the theoretical max', () => {
    const s = createFarmState(390, 700, 11, 60);
    while (!s.over) {
      stepFarm(s, DT);
      for (const sh of s.sheep) {
        if (sh.active && sh.phase === SheepPhase.Hungry) {
          const r = penRect(s.width, s.height, sh.pen);
          tapFarm(s, r.x + r.w / 2, r.y + r.h / 2);
        }
      }
    }
    expect(s.missed).toBe(0);
    expect(s.fed).toBeGreaterThan(10);
    expect(s.score).toBeLessThanOrEqual(MINIGAME_RULES['farm-sim'].maxScorePerSecond * 60);
    // A pen is never double-booked
    const pens = s.sheep.filter((x) => x.active).map((x) => x.pen);
    expect(new Set(pens).size).toBe(pens.length);
  });
});

describe('Save the Server', () => {
  it('a perfect cooler keeps all racks alive and respects the max', () => {
    const s = createServerState(390, 700, 21, 60);
    while (!s.over) {
      stepServer(s, DT);
      s.racks.forEach((r, i) => {
        if (r.heat > 80) {
          const rr = rackRect(s.width, s.height, i);
          tapServer(s, rr.x + 5, rr.y + 5);
        }
      });
    }
    expect(s.crashes).toBe(0);
    expect(Math.floor(s.score)).toBeLessThanOrEqual(MINIGAME_RULES['save-server'].maxScorePerSecond * 60);
  });

  it('neglected racks crash and end the round early', () => {
    const s = createServerState(390, 700, 21, 60);
    while (!s.over) stepServer(s, DT);
    expect(s.crashes).toBeGreaterThanOrEqual(3);
    expect(s.elapsed).toBeLessThan(60);
  });
});
