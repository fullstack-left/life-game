import { gameStorage } from '@/core/storage/mmkv';

import { ServerClock } from './serverClock';

/** App-wide singleton. Persisted through MMKV so offsets survive restarts. */
export const serverClock = new ServerClock({
  storage: {
    getNumber: (key) => gameStorage.getNumber(key),
    set: (key, value) => gameStorage.set(key, value),
  },
});

export const trustedNow = (): number => serverClock.now();

export { ServerClock } from './serverClock';
