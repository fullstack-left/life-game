import { createRng, nextRange, type RngState } from '../engine/rng';

/**
 * Serverni Saqla — balancing game.
 * Every rack heats up at its own (randomly drifting) rate. Tap a rack to cool
 * it. At 100° it crashes: you lose a life and it reboots for a few seconds.
 * Score accrues per healthy rack per second (uptime = money).
 */

export const COLS = 3;
export const ROWS = 4;
export const RACK_COUNT = COLS * ROWS;
export const LIVES = 3;
export const COOL_PER_TAP = 38;
export const REBOOT_SEC = 3;
export const WARN_HEAT = 70;
export const SCORE_PER_RACK_SEC = 1;
export const HUD_H = 56;

export interface Rack {
  heat: number;
  rate: number;
  /** Seconds until reboot completes (0 = online). */
  reboot: number;
  /** Seconds since last cooled — drives a frost flash. */
  cooled: number;
}

export interface ServerState {
  racks: Rack[];
  rng: RngState;
  score: number;
  lives: number;
  crashes: number;
  cools: number;
  elapsed: number;
  duration: number;
  over: boolean;
  width: number;
  height: number;
}

export interface RackRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rackRect = (width: number, height: number, i: number): RackRect => {
  'worklet';
  const pad = 12;
  const w = (width - pad * (COLS + 1)) / COLS;
  const h = (height - HUD_H - pad * (ROWS + 1)) / ROWS;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: pad + col * (w + pad), y: HUD_H + pad + row * (h + pad), w, h };
};

/** Heating accelerates over the round. */
export const heatRate = (rng: RngState, elapsed: number): number => {
  'worklet';
  return nextRange(rng, 5, 12) * (1 + elapsed / 45);
};

export const createServerState = (width: number, height: number, seed: number, duration: number): ServerState => {
  'worklet';
  const rng = createRng(seed);
  const racks: Rack[] = [];
  for (let i = 0; i < RACK_COUNT; i++) {
    racks.push({ heat: nextRange(rng, 0, 35), rate: heatRate(rng, 0), reboot: 0, cooled: 99 });
  }
  return { racks, rng, score: 0, lives: LIVES, crashes: 0, cools: 0, elapsed: 0, duration, over: false, width, height };
};

export const stepServer = (s: ServerState, dt: number): void => {
  'worklet';
  if (s.over) return;
  s.elapsed += dt;
  let healthy = 0;
  for (let i = 0; i < s.racks.length; i++) {
    const r = s.racks[i];
    if (!r) continue;
    r.cooled += dt;
    if (r.reboot > 0) {
      r.reboot = Math.max(0, r.reboot - dt);
      if (r.reboot === 0) {
        r.heat = 10;
        r.rate = heatRate(s.rng, s.elapsed);
      }
      continue;
    }
    r.heat += r.rate * dt;
    if (r.heat >= 100) {
      r.heat = 0;
      r.reboot = REBOOT_SEC;
      s.lives -= 1;
      s.crashes += 1;
      continue;
    }
    healthy++;
  }
  s.score += healthy * SCORE_PER_RACK_SEC * dt;
  if (s.lives <= 0 || s.elapsed >= s.duration) s.over = true;
};

export const tapServer = (s: ServerState, x: number, y: number): void => {
  'worklet';
  if (s.over) return;
  for (let i = 0; i < s.racks.length; i++) {
    const rr = rackRect(s.width, s.height, i);
    if (x < rr.x || x > rr.x + rr.w || y < rr.y || y > rr.y + rr.h) continue;
    const r = s.racks[i];
    if (!r || r.reboot > 0) return;
    r.heat = Math.max(0, r.heat - COOL_PER_TAP);
    r.cooled = 0;
    // Each cooling re-rolls the rate — keeps the player scanning the whole grid.
    r.rate = heatRate(s.rng, s.elapsed);
    s.cools += 1;
    return;
  }
};

export const serverPerformance = (s: ServerState): number => {
  'worklet';
  const maxScore = RACK_COUNT * SCORE_PER_RACK_SEC * Math.max(1, s.elapsed);
  return Math.min(1, (s.score / maxScore) * 1.15);
};
