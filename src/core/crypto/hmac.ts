import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { canonicalize } from '@shared/canonical';

import { K, P } from './secret.generated';

/** Reassembles the XOR-masked, chunk-shuffled client key. Never cached as a string. */
const revealKey = (): Uint8Array => {
  const ordered = [...P].sort((a, b) => a[0] - b[0]).flatMap(([, bytes]) => bytes);
  const out = new Uint8Array(ordered.length);
  for (let i = 0; i < ordered.length; i++) {
    out[i] = (ordered[i] ?? 0) ^ (K[i] ?? 0);
  }
  return out;
};

export const hmacSha256Hex = (key: Uint8Array, message: string): string =>
  bytesToHex(hmac(sha256, key, utf8ToBytes(message)));

/**
 * Signs an arbitrary JSON-compatible object with HMAC-SHA256 over its canonical form.
 * The key buffer is zeroed after use to shorten its lifetime in memory.
 */
export const signPayload = (payload: object): { canonical: string; signature: string } => {
  const canonical = canonicalize(payload);
  const key = revealKey();
  try {
    return { canonical, signature: hmacSha256Hex(key, canonical) };
  } finally {
    key.fill(0);
  }
};
