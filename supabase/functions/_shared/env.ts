/** Typed access to Edge Function secrets. Fails fast on missing required config. */

const required = (name: string): string => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
};

export const ENV = {
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get anonKey() {
    return required('SUPABASE_ANON_KEY');
  },
  get serviceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get clientHmacSecret() {
    const s = required('CLIENT_HMAC_SECRET');
    if (s.length < 32) throw new Error('CLIENT_HMAC_SECRET must be ≥ 32 chars');
    return s;
  },
  /** Optional Supavisor transaction-mode URL (port 6543) for direct SQL. */
  get dbPoolerUrl(): string | undefined {
    return Deno.env.get('DB_POOLER_URL') || undefined;
  },
  get upstashUrl(): string | undefined {
    return Deno.env.get('UPSTASH_REDIS_REST_URL') || undefined;
  },
  get upstashToken(): string | undefined {
    return Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || undefined;
  },
  get isProduction(): boolean {
    return (Deno.env.get('ENVIRONMENT') ?? 'production') === 'production';
  },
};
