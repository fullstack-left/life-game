import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * MMKV (memory-mapped, C++/JSI) gives us a *synchronous* key-value API that is
 * ~30x faster than AsyncStorage. Synchronous reads mean Zustand hydrates before
 * the first frame, so the room never flashes a default state.
 *
 * Instances:
 *  - `gameStorage`  : non-sensitive simulation state (hydrated synchronously at boot).
 *  - `authStorage`  : Supabase session tokens, AES-encrypted with a key held in the
 *                     platform keychain (see `secureKey.ts`). Created lazily.
 */

export const gameStorage: MMKV = createMMKV({ id: 'life-game.state.v1' });

let authStorageInstance: MMKV | undefined;

export const initAuthStorage = (encryptionKey: string | undefined): MMKV => {
  if (!authStorageInstance) {
    authStorageInstance = createMMKV(
      encryptionKey ? { id: 'life-game.auth.v1', encryptionKey } : { id: 'life-game.auth.v1' },
    );
  }
  return authStorageInstance;
};

export const getAuthStorage = (): MMKV => {
  if (!authStorageInstance) {
    throw new Error('Auth storage accessed before initAuthStorage()');
  }
  return authStorageInstance;
};

/** Zustand `persist` adapter. All operations are synchronous. */
export const createZustandMMKVStorage = (storage: MMKV): StateStorage => ({
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => {
    storage.remove(name);
  },
});

/** Supabase auth storage adapter (supabase-js accepts sync or async implementations). */
export const createSupabaseAuthStorage = (storage: MMKV) => ({
  getItem: (key: string): string | null => storage.getString(key) ?? null,
  setItem: (key: string, value: string): void => storage.set(key, value),
  removeItem: (key: string): void => {
    storage.remove(key);
  },
});
