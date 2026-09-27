import type { MiniGameId } from '@shared/gameRules';

import type { MiniGameDefinition } from './engine/types';
import { FarmGame } from './farm-sim/FarmGame';
import { SaveServerGame } from './save-server/SaveServerGame';
import { TerminalCoderGame } from './terminal-coder/TerminalCoderGame';

/** Plug-in registry: adding a mini-game = one entry here + rules in `gameRules.ts`. */
export const MINIGAMES: Readonly<Record<MiniGameId, MiniGameDefinition>> = {
  'terminal-coder': { id: 'terminal-coder', accent: '#50FA7B', icon: '>_', Component: TerminalCoderGame },
  'farm-sim': { id: 'farm-sim', accent: '#FFD166', icon: '🐑', Component: FarmGame },
  'save-server': { id: 'save-server', accent: '#4CC9F0', icon: '▤', Component: SaveServerGame },
};
