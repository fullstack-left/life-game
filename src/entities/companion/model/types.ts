export const STAT_KEYS = ['energy', 'hunger', 'hygiene', 'fun'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/**
 * All stats are normalised to [0, 100] where 100 is "perfect".
 * NB: `hunger` is expressed as *satiety* (100 = full, 0 = starving) so every bar
 * reads the same way in the HUD.
 */
export type Stats = Readonly<Record<StatKey, number>>;

export const STAT_MAX = 100;
export const STAT_MIN = 0;

export type ActivityType = 'idle' | 'sleeping' | 'eating' | 'showering' | 'working';

export interface Activity {
  readonly type: ActivityType;
  /** Trusted epoch ms when the activity began. */
  readonly since: number;
  /** For timed activities (eating/showering): trusted epoch ms when it completes. */
  readonly until?: number;
}

export interface Modifiers {
  /** Σ M_i for the Fun decay coefficient. */
  readonly fun: number;
  /** Σ M_i for the Energy decay coefficient. */
  readonly energy: number;
  /** Σ M_i for the Hygiene linear rate. */
  readonly hygiene: number;
}

export const ZERO_MODIFIERS: Modifiers = Object.freeze({ fun: 0, energy: 0, hygiene: 0 });

export type Mood = 'sleeping' | 'exhausted' | 'starving' | 'filthy' | 'sad' | 'tired' | 'content' | 'happy';

export type SimulationEvent =
  | 'woke_up'
  | 'became_starving'
  | 'became_filthy'
  | 'became_exhausted'
  | 'became_bored'
  | 'offline_cap_reached';
