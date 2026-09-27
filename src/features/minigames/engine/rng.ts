/**
 * Mulberry32 — tiny, fast, seedable PRNG that runs inside worklets.
 * State is a plain `{ s }` object so it can be embedded in game state.
 * Seeded games are reproducible (useful for replays / anti-cheat auditing).
 */
export interface RngState {
  s: number;
}

export const createRng = (seed: number): RngState => {
  'worklet';
  return { s: seed >>> 0 || 0x9e3779b9 };
};

export const nextFloat = (rng: RngState): number => {
  'worklet';
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const nextRange = (rng: RngState, min: number, max: number): number => {
  'worklet';
  return min + nextFloat(rng) * (max - min);
};

export const nextInt = (rng: RngState, maxExclusive: number): number => {
  'worklet';
  return Math.floor(nextFloat(rng) * maxExclusive);
};
