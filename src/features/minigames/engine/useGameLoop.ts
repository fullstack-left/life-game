import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

export interface GameLoopOptions {
  /** Simulation step in seconds (default 1/60). Physics is frame-rate independent. */
  readonly fixedDt?: number;
  /** Frame deltas above this are clamped (app switch, GC hiccup) — prevents the "spiral of death". */
  readonly maxFrameDt?: number;
  /** Max simulation steps per rendered frame. */
  readonly maxStepsPerFrame?: number;
}

export interface GameLoop {
  /** Total simulated seconds (UI-thread value). */
  readonly elapsed: SharedValue<number>;
  /** Interpolation factor in [0,1) between the last two fixed steps — for smooth rendering at 90/120Hz. */
  readonly alpha: SharedValue<number>;
  readonly setRunning: (running: boolean) => void;
}

/**
 * Deterministic fixed-timestep game loop on the **UI thread**.
 *
 * Built on Reanimated's `useFrameCallback`, which is invoked from the native
 * display link (Choreographer / CADisplayLink) *as a worklet*: no JS-thread
 * hops, no React renders, no bridge. `step` must be a worklet.
 *
 *   accumulator += frameDt
 *   while accumulator ≥ fixedDt: step(fixedDt); accumulator -= fixedDt
 */
export const useGameLoop = (
  step: (dt: number, elapsed: number) => void,
  running: boolean,
  { fixedDt = 1 / 60, maxFrameDt = 0.1, maxStepsPerFrame = 6 }: GameLoopOptions = {},
): GameLoop => {
  const elapsed = useSharedValue(0);
  const accumulator = useSharedValue(0);
  const alpha = useSharedValue(0);

  const callback = useFrameCallback((frame) => {
    'worklet';
    const rawMs = frame.timeSincePreviousFrame ?? 0;
    const frameDt = Math.min(rawMs / 1000, maxFrameDt);
    let acc = accumulator.value + frameDt;
    let steps = 0;
    while (acc >= fixedDt && steps < maxStepsPerFrame) {
      step(fixedDt, elapsed.value);
      elapsed.value += fixedDt;
      acc -= fixedDt;
      steps++;
    }
    // Drop leftover time if we hit the step cap (device too slow) rather than accumulating debt.
    accumulator.value = steps === maxStepsPerFrame ? 0 : acc;
    alpha.value = accumulator.value / fixedDt;
  }, false);

  const { setActive } = callback;
  useEffect(() => {
    setActive(running);
    return () => setActive(false);
  }, [running, setActive]);

  return { elapsed, alpha, setRunning: setActive };
};
