import { DEFAULT_DECAY_CONFIG as CFG } from './decayConfig';
import { applyModifier, simulate } from './decayEngine';
import type { Activity, Stats } from './types';

const HOUR = 3600;
const NOW = 1_800_000_000_000;
const idle: Activity = { type: 'idle', since: NOW };
const sleeping: Activity = { type: 'sleeping', since: NOW };
const full: Stats = { energy: 100, hunger: 100, hygiene: 100, fun: 100 };

describe('decay engine — closed-form math', () => {
  it('applies linear decay to hunger: S = max(0, S0 − R·Δt)', () => {
    const r = simulate({ stats: full, activity: idle, deltaSec: 2 * HOUR, nowMs: NOW });
    expect(r.stats.hunger).toBeCloseTo(100 - CFG.hungerRatePerSec * 2 * HOUR, 6);
    expect(r.stats.hunger).toBeCloseTo(75, 6); // 8h to empty → 2h = −25
  });

  it('applies exponential decay to energy: S = S0·e^(−λΔt)', () => {
    const r = simulate({ stats: full, activity: idle, deltaSec: 6 * HOUR, nowMs: NOW });
    expect(r.stats.energy).toBeCloseTo(50, 6); // half-life 6h
    expect(r.stats.energy).toBeCloseTo(100 * Math.exp(-CFG.energyLambda * 6 * HOUR), 9);
  });

  it('never produces negative or >100 values', () => {
    const r = simulate({ stats: full, activity: idle, deltaSec: 30 * 24 * HOUR, nowMs: NOW });
    for (const v of Object.values(r.stats)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(r.stats.hunger).toBe(0);
    expect(r.events).toContain('offline_cap_reached');
    expect(r.simulatedSec).toBe(CFG.maxOfflineSec);
  });

  it('ignores negative deltas (device clock rewound)', () => {
    const r = simulate({ stats: full, activity: idle, deltaSec: -5000, nowMs: NOW });
    expect(r.stats).toEqual(full);
    expect(r.simulatedSec).toBe(0);
  });

  it('item modifiers reduce the decay coefficient: λ_mod = λ / (1 + ΣM)', () => {
    expect(applyModifier(1, 1)).toBe(0.5);
    expect(applyModifier(1, -3)).toBe(1); // negative sums are floored
    const base = simulate({ stats: full, activity: idle, deltaSec: 5 * HOUR, nowMs: NOW });
    const buffed = simulate({
      stats: full,
      activity: idle,
      deltaSec: 5 * HOUR,
      nowMs: NOW,
      modifiers: { fun: 1, energy: 0, hygiene: 0 },
    });
    expect(base.stats.fun).toBeCloseTo(50, 5); // half-life 5h
    expect(buffed.stats.fun).toBeCloseTo(100 * Math.exp(-(CFG.funLambda / 2) * 5 * HOUR), 6);
    expect(buffed.stats.fun).toBeGreaterThan(base.stats.fun);
  });

  it('starvation compounds mood decay after the hunger breakpoint', () => {
    const start: Stats = { energy: 100, hunger: 10, hygiene: 100, fun: 100 };
    const t0 = 10 / CFG.hungerRatePerSec; // moment hunger hits 0
    const r = simulate({ stats: start, activity: idle, deltaSec: t0 + HOUR, nowMs: NOW });
    const expectedFun = 100 * Math.exp(-CFG.funLambda * t0) * Math.exp(-CFG.funLambda * CFG.starvingFunPenalty * HOUR);
    expect(r.stats.fun).toBeCloseTo(expectedFun, 6);
    expect(r.events).toContain('became_starving');
  });

  it('sleep recovers energy and auto-wakes at the threshold', () => {
    const tired: Stats = { energy: 10, hunger: 100, hygiene: 100, fun: 80 };
    const r = simulate({ stats: tired, activity: sleeping, deltaSec: 12 * HOUR, nowMs: NOW });
    expect(r.events).toContain('woke_up');
    expect(r.activity.type).toBe('idle');
    // Closed form: wakes at t_w = ln((100−10)/(100−99)) / k, then decays awake for the rest.
    const tWake = Math.log(90 / (100 - CFG.wakeThreshold)) / CFG.sleepRecoveryK;
    const expected = CFG.wakeThreshold * Math.exp(-CFG.energyLambda * (12 * HOUR - tWake));
    expect(r.stats.energy).toBeCloseTo(expected, 6);
    expect(r.activity.since).toBe(Math.round(NOW - (12 * HOUR - tWake) * 1000));
  });

  it('is path-independent: one 8h jump ≈ 28,800 one-second ticks', () => {
    const start: Stats = { energy: 30, hunger: 40, hygiene: 20, fun: 60 };
    const jump = simulate({ stats: start, activity: sleeping, deltaSec: 8 * HOUR, nowMs: NOW });

    let s: Stats = start;
    let a: Activity = sleeping;
    for (let i = 1; i <= 8 * HOUR; i++) {
      const step = simulate({ stats: s, activity: a, deltaSec: 1, nowMs: NOW - 8 * HOUR * 1000 + i * 1000 });
      s = step.stats;
      a = step.activity;
    }
    expect(a.type).toBe(jump.activity.type);
    for (const key of Object.keys(start) as (keyof Stats)[]) {
      expect(s[key]).toBeCloseTo(jump.stats[key], 3);
    }
  });

  it('ends timed activities (eating/showering) when their deadline passes', () => {
    const eating: Activity = { type: 'eating', since: NOW - 10_000, until: NOW - 5_000 };
    const r = simulate({ stats: full, activity: eating, deltaSec: 10, nowMs: NOW });
    expect(r.activity).toEqual({ type: 'idle', since: NOW - 5_000 });
  });
});
