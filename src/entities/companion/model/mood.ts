import { DEFAULT_DECAY_CONFIG } from './decayConfig';
import type { Activity, Mood, StatKey, Stats } from './types';

const { criticalThreshold: CRIT, lowThreshold: LOW } = DEFAULT_DECAY_CONFIG;

/** Priority-ordered mood resolution; drives the character's animation state. */
export const deriveMood = (stats: Stats, activity: Activity): Mood => {
  if (activity.type === 'sleeping') return 'sleeping';
  if (stats.energy < CRIT) return 'exhausted';
  if (stats.hunger < CRIT) return 'starving';
  if (stats.hygiene < CRIT) return 'filthy';
  if (stats.fun < CRIT) return 'sad';
  if (stats.energy < LOW) return 'tired';
  const avg = (stats.energy + stats.hunger + stats.hygiene + stats.fun) / 4;
  return avg >= 75 ? 'happy' : 'content';
};

/** Overall wellbeing 0..1 — used for lighting warmth and character posture. */
export const wellbeing = (s: Stats): number => {
  // Weighted harmonic-ish blend: a single neglected need drags the whole score down.
  const values = [s.energy, s.hunger, s.hygiene, s.fun].map((v) => Math.max(1, v) / 100);
  const harmonic = values.length / values.reduce((acc, v) => acc + 1 / v, 0);
  return Math.min(1, Math.max(0, harmonic));
};

export const mostUrgentNeed = (s: Stats): StatKey | undefined => {
  const entries = (Object.entries(s) as [StatKey, number][]).sort((a, b) => a[1] - b[1]);
  const first = entries[0];
  return first && first[1] < LOW ? first[0] : undefined;
};
