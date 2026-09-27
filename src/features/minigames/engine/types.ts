import type { ComponentType } from 'react';

import type { MiniGameId } from '@shared/gameRules';

export interface GameResult {
  readonly score: number;
  /** 0..1 subjective performance (drives Fun reward). */
  readonly performance: number;
  /** Integer counters, sent to the server for heuristics. */
  readonly stats: Readonly<Record<string, number>>;
}

export interface MiniGameProps {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly durationSec: number;
  /** Called exactly once, on the JS thread, when the round ends. */
  readonly onFinish: (result: GameResult) => void;
}

export interface MiniGameDefinition {
  readonly id: MiniGameId;
  readonly accent: string;
  readonly icon: string;
  readonly Component: ComponentType<MiniGameProps>;
}
