import { Ratelimit } from 'npm:@upstash/ratelimit@2';
import { Redis } from 'npm:@upstash/redis@1';

import { ENV } from './env.ts';
import { HttpError } from './http.ts';

type Window = `${number} ${'s' | 'm' | 'h'}`;

const limiters = new Map<string, Ratelimit>();
let redis: Redis | undefined;

const getLimiter = (name: string, limit: number, window: Window): Ratelimit | undefined => {
  if (!ENV.upstashUrl || !ENV.upstashToken) return undefined;
  redis ??= new Redis({ url: ENV.upstashUrl, token: ENV.upstashToken });
  const key = `${name}:${limit}:${window}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      // Sliding window: smooth, no burst-at-boundary exploit of fixed windows.
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${name}`,
      analytics: false,
      // In-isolate cache short-circuits already-blocked identifiers without a Redis round-trip.
      ephemeralCache: new Map(),
      timeout: 1_500,
    });
    limiters.set(key, rl);
  }
  return rl;
};

/**
 * Throws HttpError(429) with Retry-After when the identifier exceeds the limit.
 * Missing Upstash config: fail-CLOSED in production (503), fail-open locally.
 */
export const enforceRateLimit = async (name: string, identifier: string, limit: number, window: Window): Promise<void> => {
  const rl = getLimiter(name, limit, window);
  if (!rl) {
    if (ENV.isProduction) throw new HttpError(503, 'rate_limiter_unavailable');
    console.warn(`[rate-limit] Upstash not configured — '${name}' disabled (non-production)`);
    return;
  }
  const { success, reset } = await rl.limit(identifier);
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    throw new HttpError(429, 'rate_limited', { 'Retry-After': String(retryAfter) });
  }
};
