import { acquire, createPool, release, type Poolable } from '../engine/objectPool';
import { createRng, nextFloat, nextInt, nextRange, type RngState } from '../engine/rng';

/**
 * Terminal Coder — reaction game.
 * Code lines fall down the terminal. Tap the BUGS (red) before they hit
 * production; let CLEAN lines (green) ship. Pure worklet logic, no rendering.
 */

export const BUG_LINES = [
  'undefined is not a function',
  'NullPointerException',
  'segfault (core dumped)',
  'while (true) {}',
  'DROP TABLE users;',
  'git push --force main',
  'catch (e) {}',
  'any as any as any',
] as const;

export const CLEAN_LINES = [
  'const ok = await ship();',
  'git commit -m "fix"',
  'npm test  ✓ 128 passed',
  'return Result.ok(data);',
  'type Id = string & {}',
  'export default memo(App)',
] as const;

export const POOL_SIZE = 14;
export const LINE_HEIGHT = 26;
export const LIVES = 3;

export const SCORE_BUG = 10;
export const SCORE_SHIPPED = 2;
export const PENALTY_WRONG_TAP = 5;

export interface CodeLine extends Poolable {
  x: number;
  y: number;
  speed: number;
  isBug: boolean;
  textIndex: number;
  width: number;
  /** Seconds since squashed — drives the "squash" flash; -1 when not squashed. */
  flash: number;
}

export interface TerminalState {
  lines: CodeLine[];
  rng: RngState;
  score: number;
  lives: number;
  hits: number;
  misses: number;
  wrongTaps: number;
  shipped: number;
  spawnIn: number;
  elapsed: number;
  over: boolean;
  width: number;
  height: number;
  duration: number;
}

/** Pixel width per character for the monospaced terminal font (12pt bold ≈ 7.3px). */
export const CHAR_W = 7.3;

export const createTerminalState = (width: number, height: number, seed: number, duration: number): TerminalState => {
  'worklet';
  return {
    lines: createPool<CodeLine>(POOL_SIZE, () => ({
      active: false,
      x: 0,
      y: 0,
      speed: 0,
      isBug: false,
      textIndex: 0,
      width: 0,
      flash: -1,
    })),
    rng: createRng(seed),
    score: 0,
    lives: LIVES,
    hits: 0,
    misses: 0,
    wrongTaps: 0,
    shipped: 0,
    spawnIn: 0.6,
    elapsed: 0,
    over: false,
    width,
    height,
    duration,
  };
};

/** Difficulty ramps with time: faster falls, denser spawns (bounded so max score stays within server rules). */
export const spawnInterval = (elapsed: number): number => {
  'worklet';
  return Math.max(0.6, 1.0 - elapsed * 0.008);
};

export const fallSpeed = (elapsed: number): number => {
  'worklet';
  return 70 + elapsed * 2.4;
};

const spawn = (s: TerminalState): void => {
  'worklet';
  const i = acquire(s.lines);
  if (i < 0) return;
  const line = s.lines[i];
  if (!line) return;
  const isBug = nextFloat(s.rng) < 0.55;
  const textIndex = isBug ? nextInt(s.rng, BUG_LINES.length) : nextInt(s.rng, CLEAN_LINES.length);
  const text = isBug ? BUG_LINES[textIndex] : CLEAN_LINES[textIndex];
  const width = (text?.length ?? 10) * CHAR_W + 16;
  line.isBug = isBug;
  line.textIndex = textIndex;
  line.width = width;
  line.x = nextRange(s.rng, 8, Math.max(9, s.width - width - 8));
  line.y = -LINE_HEIGHT;
  line.speed = fallSpeed(s.elapsed) * nextRange(s.rng, 0.85, 1.2);
  line.flash = -1;
};

export const stepTerminal = (s: TerminalState, dt: number): void => {
  'worklet';
  if (s.over) return;
  s.elapsed += dt;

  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    spawn(s);
    s.spawnIn = spawnInterval(s.elapsed);
  }

  const floor = s.height - 40;
  for (let i = 0; i < s.lines.length; i++) {
    const l = s.lines[i];
    if (!l || !l.active) continue;
    if (l.flash >= 0) {
      l.flash += dt;
      if (l.flash > 0.25) release(s.lines, i);
      continue;
    }
    l.y += l.speed * dt;
    if (l.y > floor) {
      if (l.isBug) {
        s.lives -= 1;
        s.misses += 1;
      } else {
        s.score += SCORE_SHIPPED;
        s.shipped += 1;
      }
      release(s.lines, i);
    }
  }

  if (s.lives <= 0 || s.elapsed >= s.duration) s.over = true;
};

/** Hit-test a tap. Returns true when something was hit. */
export const tapTerminal = (s: TerminalState, x: number, y: number): boolean => {
  'worklet';
  if (s.over) return false;
  const pad = 10; // forgiving touch target
  for (let i = 0; i < s.lines.length; i++) {
    const l = s.lines[i];
    if (!l || !l.active || l.flash >= 0) continue;
    if (x >= l.x - pad && x <= l.x + l.width + pad && y >= l.y - pad && y <= l.y + LINE_HEIGHT + pad) {
      if (l.isBug) {
        s.score += SCORE_BUG;
        s.hits += 1;
      } else {
        s.score = Math.max(0, s.score - PENALTY_WRONG_TAP);
        s.wrongTaps += 1;
      }
      l.flash = 0;
      return true;
    }
  }
  return false;
};

export const terminalPerformance = (s: TerminalState): number => {
  'worklet';
  const attempts = s.hits + s.misses + s.wrongTaps;
  const accuracy = attempts === 0 ? 0 : s.hits / attempts;
  return Math.min(1, 0.5 * accuracy + 0.5 * Math.min(1, s.score / 450));
};
