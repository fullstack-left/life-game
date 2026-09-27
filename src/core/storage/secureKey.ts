import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createLogger } from '@/core/logger';

const log = createLogger('secure-key');
const KEY_NAME = 'life-game.mmkv-auth-key';

/**
 * Returns a per-install 128-bit key stored in Keychain / Android Keystore.
 * MMKV's AES-CFB encryption accepts keys up to 16 bytes.
 */
export const getOrCreateStorageKey = async (): Promise<string | undefined> => {
  try {
    const existing = await SecureStore.getItemAsync(KEY_NAME);
    if (existing) return existing;

    const bytes = Crypto.getRandomBytes(8);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); // 16 hex chars
    await SecureStore.setItemAsync(KEY_NAME, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return key;
  } catch (error) {
    // Web / unsupported platform: fall back to unencrypted storage rather than bricking auth.
    log.warn('SecureStore unavailable, auth storage will not be encrypted', error);
    return undefined;
  }
};
