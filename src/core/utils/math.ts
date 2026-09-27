export const clamp = (value: number, min: number, max: number): number => {
  'worklet';
  return value < min ? min : value > max ? max : value;
};

export const clamp01 = (value: number): number => {
  'worklet';
  return clamp(value, 0, 1);
};

export const lerp = (a: number, b: number, t: number): number => {
  'worklet';
  return a + (b - a) * t;
};

/** Smoothstep easing, useful for lighting transitions. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  'worklet';
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const roundTo = (value: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
