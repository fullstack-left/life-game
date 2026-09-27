/** HTTP helpers shared by all Edge Functions. */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(code);
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const MAX_BODY_BYTES = 8 * 1024;

/** Reads and parses a bounded JSON body (rejects oversized payloads before parsing). */
export const readJson = async (req: Request): Promise<unknown> => {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
};

export const clientIp = (req: Request): string =>
  req.headers.get('cf-connecting-ip') ??
  req.headers.get('x-real-ip') ??
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * Wraps a handler with CORS preflight, method guard and uniform error mapping.
 * Unexpected errors are logged server-side and surfaced as an opaque 500.
 */
export const handler =
  (fn: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status, e.headers);
      console.error('[edge] unhandled', e);
      return json({ error: 'internal_error' }, 500);
    }
  };
