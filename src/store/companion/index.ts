import * as Crypto from 'expo-crypto';
import { useStore } from 'zustand';

import { env } from '@/core/config/env';
import { createZustandMMKVStorage, gameStorage } from '@/core/storage/mmkv';
import { trustedNow } from '@/core/time';

import { createCompanionStore } from './createCompanionStore';
import type { CompanionStore } from './types';

/**
 * App-wide companion store. MMKV is synchronous, so `persist` rehydrates during
 * module evaluation — the very first render already sees the saved state.
 */
export const companionStore = createCompanionStore({
  storage: createZustandMMKVStorage(gameStorage),
  economyMode: env.economyMode,
  uuid: () => Crypto.randomUUID(),
  now: trustedNow,
});

/**
 * `useCompanionStore(selector)` — always pass a selector (use `useShallow` for
 * objects) so components only re-render when their slice changes.
 */
export function useCompanionStore<T>(selector: (state: CompanionStore) => T): T {
  return useStore(companionStore, selector);
}

export * from './createCompanionStore';
export type * from './types';
