import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/core/config/env';
import { createLogger } from '@/core/logger';
import { createSupabaseAuthStorage, initAuthStorage } from '@/core/storage/mmkv';
import { getOrCreateStorageKey } from '@/core/storage/secureKey';

import type { Database } from './database.types';

const log = createLogger('supabase');

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | undefined;
let initPromise: Promise<TypedSupabaseClient | undefined> | undefined;

/**
 * Lazily builds the Supabase client once the encrypted auth storage is ready.
 * Returns `undefined` when the backend is not configured (fully offline mode).
 */
export const initSupabase = (): Promise<TypedSupabaseClient | undefined> => {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!env.isBackendConfigured || !env.supabaseUrl || !env.supabaseAnonKey) {
      log.warn('Supabase not configured — running in offline-only mode');
      return undefined;
    }
    const key = await getOrCreateStorageKey();
    const storage = createSupabaseAuthStorage(initAuthStorage(key));
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-client-info': 'life-game-expo' } },
    });
    return client;
  })();
  return initPromise;
};

export const getSupabase = (): TypedSupabaseClient | undefined => client;

/**
 * Ensures there is an authenticated user. First launch signs in anonymously
 * (zero-friction onboarding); the account can later be linked to email/OAuth.
 */
export const ensureSession = async (): Promise<string | undefined> => {
  const sb = await initSupabase();
  if (!sb) return undefined;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signIn, error } = await sb.auth.signInAnonymously();
  if (error) {
    log.warn('Anonymous sign-in failed (will retry on next sync)', error.message);
    return undefined;
  }
  return signIn.user?.id;
};
