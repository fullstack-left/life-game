/**
 * Runtime configuration.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined into the JS bundle by Metro, so
 * NOTHING secret may ever be read from here. The Supabase anon key is public by
 * design — all protection lives in RLS policies and Edge Functions.
 */

const readEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * - `server`: coins & inventory are authoritative on Supabase (production).
 * - `local` : no backend configured → single-player offline edition; the economy
 *             settles on-device (there is nothing server-side to protect).
 */
export type EconomyMode = 'server' | 'local';

export interface AppEnv {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly isBackendConfigured: boolean;
  readonly economyMode: EconomyMode;
}

const supabaseUrl = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = readEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const env: AppEnv = Object.freeze({
  supabaseUrl,
  supabaseAnonKey,
  isBackendConfigured,
  economyMode: isBackendConfigured ? 'server' : 'local',
});
