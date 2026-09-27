import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { ENV } from './env.ts';
import { HttpError } from './http.ts';

export interface AuthContext {
  readonly userId: string;
  readonly isAnonymous: boolean;
  readonly aal: 'aal1' | 'aal2';
}

let anonClient: SupabaseClient | undefined;
const getAnonClient = (): SupabaseClient =>
  (anonClient ??= createClient(ENV.supabaseUrl, ENV.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));

/**
 * Validates the caller's JWT.
 *  - `getClaims()` verifies the signature locally against the project JWKS
 *    (asymmetric keys, cached) and falls back to the Auth server otherwise.
 *  - Requires role=authenticated and a valid Authenticator Assurance Level.
 */
export const authenticate = async (req: Request): Promise<AuthContext> => {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new HttpError(401, 'missing_token');

  const { data, error } = await getAnonClient().auth.getClaims(match[1]);
  if (error || !data?.claims) throw new HttpError(401, 'invalid_token');

  const claims = data.claims as Record<string, unknown>;
  const sub = claims.sub;
  if (typeof sub !== 'string' || claims.role !== 'authenticated') throw new HttpError(401, 'invalid_token');

  const exp = typeof claims.exp === 'number' ? claims.exp : 0;
  if (exp * 1000 < Date.now()) throw new HttpError(401, 'token_expired');

  const aal = claims.aal;
  if (aal !== 'aal1' && aal !== 'aal2') throw new HttpError(403, 'insufficient_aal');

  return { userId: sub, isAnonymous: claims.is_anonymous === true, aal };
};

let adminClient: SupabaseClient | undefined;

/**
 * service_role client — bypasses RLS. Only ever used server-side, after the
 * request has been authenticated and validated. Talks to PostgREST, which is
 * itself pooled, so no per-request Postgres connection is opened here.
 */
export const getAdminClient = (): SupabaseClient =>
  (adminClient ??= createClient(ENV.supabaseUrl, ENV.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: 'public' },
  }));
