import type { ActivityType, Mood } from '@/entities/companion';

import type { Anchor } from './layout';

/**
 * Character animation state machine.
 *
 * Game state (activity + mood) → a *target* visual state. The renderer then
 * resolves the transition: if the anchor changes, the character walks there
 * first (walk cycle), and only on arrival enters the target pose/loop.
 * Pure & deterministic → unit-testable without a renderer.
 */

export type Pose = 'stand' | 'lie' | 'sit';

export type AnimationLoop =
  | 'idle_happy'
  | 'idle_content'
  | 'idle_tired'
  | 'idle_exhausted'
  | 'idle_sad'
  | 'idle_hungry'
  | 'idle_filthy'
  | 'sleep'
  | 'eat'
  | 'shower'
  | 'work';

export interface CharacterTarget {
  readonly anchor: Anchor;
  readonly pose: Pose;
  readonly loop: AnimationLoop;
  /** Walk-speed multiplier (virtual units / ms scale). Exhausted characters shuffle. */
  readonly walkSpeed: number;
  /** Breathing / bob amplitude & frequency. */
  readonly bobAmp: number;
  readonly bobHz: number;
  /** 0 = eyes open … 1 = fully closed (tiredness droop). */
  readonly eyelid: number;
}

const IDLE_BY_MOOD: Record<Exclude<Mood, 'sleeping'>, AnimationLoop> = {
  happy: 'idle_happy',
  content: 'idle_content',
  tired: 'idle_tired',
  exhausted: 'idle_exhausted',
  sad: 'idle_sad',
  starving: 'idle_hungry',
  filthy: 'idle_filthy',
};

export const resolveCharacterTarget = (activity: ActivityType, mood: Mood): CharacterTarget => {
  const exhausted = mood === 'exhausted';
  const tired = mood === 'tired' || exhausted;
  const walkSpeed = exhausted ? 0.45 : tired ? 0.7 : mood === 'happy' ? 1.2 : 1;
  const eyelid = exhausted ? 0.6 : tired ? 0.35 : mood === 'sad' ? 0.2 : 0;

  switch (activity) {
    case 'sleeping':
      return { anchor: 'bed', pose: 'lie', loop: 'sleep', walkSpeed, bobAmp: 1.2, bobHz: 0.22, eyelid: 1 };
    case 'eating':
      return { anchor: 'fridge', pose: 'stand', loop: 'eat', walkSpeed, bobAmp: 1, bobHz: 0.9, eyelid };
    case 'showering':
      return { anchor: 'shower', pose: 'stand', loop: 'shower', walkSpeed, bobAmp: 1.5, bobHz: 0.8, eyelid: 0.3 };
    case 'working':
      return { anchor: 'computer', pose: 'sit', loop: 'work', walkSpeed, bobAmp: 0.6, bobHz: 1.4, eyelid };
    case 'idle': {
      const loop = mood === 'sleeping' ? 'idle_content' : IDLE_BY_MOOD[mood];
      return {
        anchor: 'center',
        pose: 'stand',
        loop,
        walkSpeed,
        bobAmp: exhausted ? 0.8 : tired ? 1.2 : mood === 'happy' ? 3 : 2,
        bobHz: exhausted ? 0.25 : tired ? 0.4 : mood === 'happy' ? 1.1 : 0.6,
        eyelid,
      };
    }
  }
};

/** Numeric encoding so loops can live in a SharedValue read by UI-thread worklets. */
export const LOOP_CODE: Record<AnimationLoop, number> = {
  idle_happy: 0,
  idle_content: 1,
  idle_tired: 2,
  idle_exhausted: 3,
  idle_sad: 4,
  idle_hungry: 5,
  idle_filthy: 6,
  sleep: 7,
  eat: 8,
  shower: 9,
  work: 10,
};

export const POSE_CODE: Record<Pose, number> = { stand: 0, lie: 1, sit: 2 };

/** Base walk speed in virtual units per millisecond. */
export const BASE_WALK_SPEED = 0.11;

export const walkDurationMs = (fromX: number, toX: number, speed: number): number =>
  Math.round(Math.abs(toX - fromX) / (BASE_WALK_SPEED * Math.max(0.1, speed)));
