const HOUR = 3600;
const LN2 = Math.LN2;

export interface DecayConfig {
  /** Linear satiety loss per second (R in S = max(0, S − R·Δt)). */
  readonly hungerRatePerSec: number;
  /** Linear hygiene loss per second. */
  readonly hygieneRatePerSec: number;
  /** Exponential energy decay coefficient λ while awake (S = S₀·e^{−λΔt}). */
  readonly energyLambda: number;
  /** Exponential fun (mood) decay coefficient λ. */
  readonly funLambda: number;
  /** While sleeping energy approaches 100: E = 100 − (100 − E₀)·e^{−kΔt}. */
  readonly sleepRecoveryK: number;
  /** Character wakes up automatically once energy reaches this value. */
  readonly wakeThreshold: number;

  readonly sleepHungerFactor: number;
  readonly sleepHygieneFactor: number;
  readonly sleepFunFactor: number;

  /** λ multipliers when a need is fully depleted — neglect compounds. */
  readonly starvingFunPenalty: number;
  readonly filthyFunPenalty: number;
  readonly starvingEnergyPenalty: number;
  readonly starvingSleepRecoveryFactor: number;

  /** Upper bound for a single offline jump (protects against absurd deltas). */
  readonly maxOfflineSec: number;

  /** HUD thresholds. */
  readonly criticalThreshold: number;
  readonly lowThreshold: number;
}

/**
 * Tuned so a player who checks in ~3 times a day keeps a healthy companion:
 *  - satiety  100 → 0  in 8h
 *  - hygiene  100 → 0  in 18h
 *  - energy   half-life 6h awake  (100 → 20 in ≈14h), full sleep ≈ 7h
 *  - fun      half-life 5h (doubled by ≈ +1.0 Σ item modifiers)
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = Object.freeze({
  hungerRatePerSec: 100 / (8 * HOUR),
  hygieneRatePerSec: 100 / (18 * HOUR),
  energyLambda: LN2 / (6 * HOUR),
  funLambda: LN2 / (5 * HOUR),
  sleepRecoveryK: LN2 / (1.25 * HOUR),
  wakeThreshold: 99,

  sleepHungerFactor: 0.45,
  sleepHygieneFactor: 0.5,
  sleepFunFactor: 0.25,

  starvingFunPenalty: 2.2,
  filthyFunPenalty: 1.6,
  starvingEnergyPenalty: 1.5,
  starvingSleepRecoveryFactor: 0.5,

  maxOfflineSec: 7 * 24 * HOUR,

  criticalThreshold: 20,
  lowThreshold: 40,
});
