import { acquire, createPool, release, type Poolable } from '../engine/objectPool';
import { createRng, nextInt, nextRange, type RngState } from '../engine/rng';

/**
 * Fermerlik Simulyatsiyasi — idle / clicker with timing windows.
 * Sheep wander into pens, graze, then get hungry (watermelon bubble). Feed them
 * inside the window for points; tapping a grazing sheep startles it.
 * Sheep entities are recycled through an object pool (no per-spawn allocation).
 */

export const COLS = 2;
export const ROWS = 4;
export const PEN_COUNT = COLS * ROWS;
export const POOL_SIZE = PEN_COUNT;

export const SCORE_FED = 5;
export const PENALTY_STARTLE = 1;
export const PENALTY_MISSED = 2;

/** Plain numeric constants (not a TS enum) so worklets can inline them safely. */
export const SheepPhase = {
  Entering: 1,
  Grazing: 2,
  Hungry: 3,
  Fed: 4,
  Leaving: 5,
} as const;

export interface Sheep extends Poolable {
  pen: number;
  phase: number;
  /** Seconds spent in the current phase. */
  t: number;
  /** Duration of the current phase. */
  phaseLen: number;
  /** Cosmetic variation. */
  wool: number;
}

export interface FarmState {
  sheep: Sheep[];
  penTaken: boolean[];
  rng: RngState;
  score: number;
  fed: number;
  missed: number;
  startled: number;
  spawnIn: number;
  elapsed: number;
  duration: number;
  over: boolean;
  width: number;
  height: number;
}

export interface PenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HUD_H = 56;

export const penRect = (width: number, height: number, pen: number): PenRect => {
  'worklet';
  const pad = 12;
  const areaY = HUD_H;
  const w = (width - pad * (COLS + 1)) / COLS;
  const h = (height - areaY - pad * (ROWS + 1)) / ROWS;
  const col = pen % COLS;
  const row = Math.floor(pen / COLS);
  return { x: pad + col * (w + pad), y: areaY + pad + row * (h + pad), w, h };
};

export const createFarmState = (width: number, height: number, seed: number, duration: number): FarmState => {
  'worklet';
  const penTaken: boolean[] = [];
  for (let i = 0; i < PEN_COUNT; i++) penTaken.push(false);
  return {
    sheep: createPool<Sheep>(POOL_SIZE, () => ({ active: false, pen: 0, phase: 0, t: 0, phaseLen: 0, wool: 0 })),
    penTaken,
    rng: createRng(seed),
    score: 0,
    fed: 0,
    missed: 0,
    startled: 0,
    spawnIn: 0.4,
    elapsed: 0,
    duration,
    over: false,
    width,
    height,
  };
};

/** Hunger window shrinks from 2.4s to 1.2s as the round progresses. */
export const hungerWindow = (elapsed: number): number => {
  'worklet';
  return Math.max(1.2, 2.4 - elapsed * 0.02);
};

const enterPhase = (sh: Sheep, phase: number, len: number): void => {
  'worklet';
  sh.phase = phase;
  sh.t = 0;
  sh.phaseLen = len;
};

const trySpawn = (s: FarmState): void => {
  'worklet';
  const freePens: number[] = [];
  for (let p = 0; p < PEN_COUNT; p++) if (!s.penTaken[p]) freePens.push(p);
  if (freePens.length === 0) return;
  const i = acquire(s.sheep);
  if (i < 0) return;
  const sh = s.sheep[i];
  if (!sh) return;
  const pen = freePens[nextInt(s.rng, freePens.length)] ?? 0;
  s.penTaken[pen] = true;
  sh.pen = pen;
  sh.wool = nextInt(s.rng, 3);
  enterPhase(sh, SheepPhase.Entering, 0.35);
};

const despawn = (s: FarmState, i: number): void => {
  'worklet';
  const sh = s.sheep[i];
  if (!sh) return;
  s.penTaken[sh.pen] = false;
  sh.phase = 0;
  release(s.sheep, i);
};

export const stepFarm = (s: FarmState, dt: number): void => {
  'worklet';
  if (s.over) return;
  s.elapsed += dt;

  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    trySpawn(s);
    s.spawnIn = nextRange(s.rng, 0.7, 1.2) * Math.max(0.6, 1 - s.elapsed * 0.006);
  }

  for (let i = 0; i < s.sheep.length; i++) {
    const sh = s.sheep[i];
    if (!sh || !sh.active) continue;
    sh.t += dt;
    if (sh.t < sh.phaseLen) continue;
    switch (sh.phase) {
      case SheepPhase.Entering:
        enterPhase(sh, SheepPhase.Grazing, nextRange(s.rng, 0.9, 2.6));
        break;
      case SheepPhase.Grazing:
        enterPhase(sh, SheepPhase.Hungry, hungerWindow(s.elapsed));
        break;
      case SheepPhase.Hungry:
        s.missed += 1;
        s.score = Math.max(0, s.score - PENALTY_MISSED);
        enterPhase(sh, SheepPhase.Leaving, 0.5);
        break;
      case SheepPhase.Fed:
      case SheepPhase.Leaving:
        despawn(s, i);
        break;
    }
  }

  if (s.elapsed >= s.duration) s.over = true;
};

export const tapFarm = (s: FarmState, x: number, y: number): void => {
  'worklet';
  if (s.over) return;
  for (let i = 0; i < s.sheep.length; i++) {
    const sh = s.sheep[i];
    if (!sh || !sh.active) continue;
    const r = penRect(s.width, s.height, sh.pen);
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    if (sh.phase === SheepPhase.Hungry) {
      s.score += SCORE_FED;
      s.fed += 1;
      enterPhase(sh, SheepPhase.Fed, 0.6);
    } else if (sh.phase === SheepPhase.Grazing) {
      s.score = Math.max(0, s.score - PENALTY_STARTLE);
      s.startled += 1;
      // A startled sheep gets hungry sooner (keeps the game fair, not punishing).
      sh.t = Math.max(sh.t, sh.phaseLen - 0.3);
    }
    return;
  }
};

export const farmPerformance = (s: FarmState): number => {
  'worklet';
  const total = s.fed + s.missed;
  const accuracy = total === 0 ? 0 : s.fed / total;
  return Math.min(1, 0.6 * accuracy + 0.4 * Math.min(1, s.score / 250));
};
