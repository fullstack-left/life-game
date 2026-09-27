/**
 * Time-Based State Decay Engine
 * ─────────────────────────────
 * Computes the companion's state after an arbitrary Δt in O(1) closed-form
 * segments — no background tasks, no per-second loops, zero battery cost.
 *
 *   Linear  (hunger, hygiene):  S = max(0, S₀ − R·Δt)
 *   Exponential (energy, fun):  S = S₀ · e^{−λ·Δt}
 *   Sleep recovery (energy):    S = 100 − (100 − S₀) · e^{−k·Δt}
 *   Item modifiers:             λ_mod = λ / (1 + Σ M_i)
 *
 * Because rates change when a need hits zero (neglect penalties) or when the
 * character wakes up, Δt is split at those *analytically computed* breakpoints
 * and each segment is solved exactly. Result is identical whether you simulate
 * 8h in one call or 28,800 one-second ticks (verified by unit tests).
 */

import { DEFAULT_DECAY_CONFIG, type DecayConfig } from './decayConfig';
import {
  STAT_MAX,
  ZERO_MODIFIERS,
  type Activity,
  type Modifiers,
  type SimulationEvent,
  type Stats,
} from './types';

const EPS = 1e-9;
const MAX_SEGMENTS = 16;

export interface SimulationInput {
  readonly stats: Stats;
  readonly activity: Activity;
  /** Elapsed seconds since the last simulation (may be negative on clock rewind → ignored). */
  readonly deltaSec: number;
  /** Trusted epoch ms at the *end* of the interval (used to stamp activity changes). */
  readonly nowMs: number;
  readonly modifiers?: Modifiers;
  readonly config?: DecayConfig;
}

export interface SimulationResult {
  readonly stats: Stats;
  readonly activity: Activity;
  readonly simulatedSec: number;
  readonly events: readonly SimulationEvent[];
}

interface SegmentRates {
  hunger: number; // linear, units / s
  hygiene: number; // linear, units / s
  fun: number; // exponential λ
  energy: number; // λ (awake decay) or k (sleep recovery)
}

const clampStat = (v: number): number => (v <= EPS ? 0 : v >= STAT_MAX ? STAT_MAX : v);

/** λ_mod = λ / (1 + Σ M_i), with Σ M_i floored at 0 so negative items can't explode rates. */
export const applyModifier = (base: number, sumM: number): number => base / (1 + Math.max(0, sumM));

export const segmentRates = (
  s: Stats,
  sleeping: boolean,
  mods: Modifiers,
  cfg: DecayConfig,
): SegmentRates => {
  const starving = s.hunger <= EPS;
  const filthy = s.hygiene <= EPS;

  const hunger = cfg.hungerRatePerSec * (sleeping ? cfg.sleepHungerFactor : 1);
  const hygiene = applyModifier(cfg.hygieneRatePerSec, mods.hygiene) * (sleeping ? cfg.sleepHygieneFactor : 1);

  let fun = applyModifier(cfg.funLambda, mods.fun);
  if (starving) fun *= cfg.starvingFunPenalty;
  if (filthy) fun *= cfg.filthyFunPenalty;
  if (sleeping) fun *= cfg.sleepFunFactor;

  const energy = sleeping
    ? cfg.sleepRecoveryK * (starving ? cfg.starvingSleepRecoveryFactor : 1)
    : applyModifier(cfg.energyLambda, mods.energy) * (starving ? cfg.starvingEnergyPenalty : 1);

  return { hunger, hygiene, fun, energy };
};

const integrateSegment = (s: Stats, r: SegmentRates, sleeping: boolean, dt: number): Stats => ({
  hunger: clampStat(s.hunger - r.hunger * dt),
  hygiene: clampStat(s.hygiene - r.hygiene * dt),
  fun: clampStat(s.fun * Math.exp(-r.fun * dt)),
  energy: clampStat(
    sleeping ? STAT_MAX - (STAT_MAX - s.energy) * Math.exp(-r.energy * dt) : s.energy * Math.exp(-r.energy * dt),
  ),
});

/** Time until an exponentially recovering energy reaches `target`. */
const timeToReach = (e0: number, target: number, k: number): number => {
  if (e0 >= target) return 0;
  if (k <= 0) return Infinity;
  return Math.log((STAT_MAX - e0) / (STAT_MAX - target)) / k;
};

const crossedBelow = (before: number, after: number, threshold: number): boolean =>
  before >= threshold && after < threshold;

export const simulate = ({
  stats,
  activity,
  deltaSec,
  nowMs,
  modifiers = ZERO_MODIFIERS,
  config = DEFAULT_DECAY_CONFIG,
}: SimulationInput): SimulationResult => {
  const events: SimulationEvent[] = [];
  const requested = Number.isFinite(deltaSec) ? Math.max(0, deltaSec) : 0;
  const total = Math.min(requested, config.maxOfflineSec);
  if (requested > config.maxOfflineSec) events.push('offline_cap_reached');

  let s: Stats = {
    energy: clampStat(stats.energy),
    hunger: clampStat(stats.hunger),
    hygiene: clampStat(stats.hygiene),
    fun: clampStat(stats.fun),
  };
  const initial = s;
  let sleeping = activity.type === 'sleeping';
  let wokeAtSec: number | undefined;
  let t = 0;

  for (let i = 0; i < MAX_SEGMENTS && total - t > EPS; i++) {
    if (sleeping && s.energy >= config.wakeThreshold) {
      sleeping = false;
      wokeAtSec = t;
      events.push('woke_up');
    }

    const r = segmentRates(s, sleeping, modifiers, config);
    let seg = total - t;
    if (s.hunger > EPS && r.hunger > 0) seg = Math.min(seg, s.hunger / r.hunger);
    if (s.hygiene > EPS && r.hygiene > 0) seg = Math.min(seg, s.hygiene / r.hygiene);
    if (sleeping) seg = Math.min(seg, timeToReach(s.energy, config.wakeThreshold, r.energy));
    seg = Math.max(seg, 0);

    s = integrateSegment(s, r, sleeping, seg);
    t += seg;

    // Snap values that landed on a breakpoint within floating-point noise.
    if (s.hunger < 1e-6) s = { ...s, hunger: 0 };
    if (s.hygiene < 1e-6) s = { ...s, hygiene: 0 };
    if (sleeping && config.wakeThreshold - s.energy < 1e-6) s = { ...s, energy: config.wakeThreshold };
  }

  // Remaining time after the segment budget (practically unreachable) is solved in one step.
  if (total - t > EPS) {
    s = integrateSegment(s, segmentRates(s, sleeping, modifiers, config), sleeping, total - t);
  }
  if (sleeping && s.energy >= config.wakeThreshold) {
    sleeping = false;
    wokeAtSec = total;
    events.push('woke_up');
  }

  if (initial.hunger > 0 && s.hunger === 0) events.push('became_starving');
  if (initial.hygiene > 0 && s.hygiene === 0) events.push('became_filthy');
  if (crossedBelow(initial.energy, s.energy, config.criticalThreshold)) events.push('became_exhausted');
  if (crossedBelow(initial.fun, s.fun, config.criticalThreshold)) events.push('became_bored');

  let nextActivity: Activity = activity;
  if (wokeAtSec !== undefined) {
    nextActivity = { type: 'idle', since: Math.round(nowMs - (total - wokeAtSec) * 1000) };
  } else if (activity.until !== undefined && activity.until <= nowMs) {
    // Timed activities (eating, showering) end on their own.
    nextActivity = { type: 'idle', since: activity.until };
  }

  return { stats: s, activity: nextActivity, simulatedSec: total, events };
};
