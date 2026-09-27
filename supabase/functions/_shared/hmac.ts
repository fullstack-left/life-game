/** HMAC-SHA256 verification with constant-time comparison (Web Crypto, no deps). */

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

const importKey = (secret: string): Promise<CryptoKey> => {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, key);
  }
  return key;
};

export const hmacSha256 = async (secret: string, message: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(message)));

const HEX_RE = /^[0-9a-f]+$/i;

export const hexToBytes = (hex: string): Uint8Array | undefined => {
  if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) return undefined;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Constant-time equality: runtime depends only on the (public) length, never on
 * *where* the first mismatching byte is — defeats byte-by-byte timing oracles.
 */
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
};

export const timingSafeEqualStrings = (a: string, b: string): boolean =>
  timingSafeEqual(encoder.encode(a), encoder.encode(b));

export const verifyHmacHex = async (secret: string, message: string, signatureHex: string): Promise<boolean> => {
  const provided = hexToBytes(signatureHex);
  if (!provided || provided.length !== 32) return false;
  const expected = await hmacSha256(secret, message);
  return timingSafeEqual(expected, provided);
};

export const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
