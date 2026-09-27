import { canonicalize } from '@shared/canonical';

import { hmacSha256Hex, signPayload } from './hmac';

/** Same vector as supabase/functions/tests/security_test.ts (Deno / Web Crypto). */
const PAYLOAD = {
  v: 1,
  sessionId: '5f0c9a52-1d0e-4c4b-9a39-2f9d7c1e8b10',
  nonce: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718',
  gameId: 'terminal-coder',
  score: 420,
  startedAt: 1790000000000,
  endedAt: 1790000060000,
  stats: { misses: 1, hits: 40 },
};
const VECTOR_SIG = '5a05c059e08cdb78856e10b1b11ce7022107341860e30320ef9b0f7382da2c9d';

describe('client HMAC signing', () => {
  it('matches the server test vector (dev key reassembled from obfuscated chunks)', () => {
    expect(signPayload(PAYLOAD).signature).toBe(VECTOR_SIG);
  });

  it('is independent of key insertion order', () => {
    const reordered = {
      stats: { hits: 40, misses: 1 },
      endedAt: PAYLOAD.endedAt,
      score: PAYLOAD.score,
      v: PAYLOAD.v,
      gameId: PAYLOAD.gameId,
      startedAt: PAYLOAD.startedAt,
      nonce: PAYLOAD.nonce,
      sessionId: PAYLOAD.sessionId,
    };
    expect(signPayload(reordered).signature).toBe(VECTOR_SIG);
  });

  it('changes when any field is tampered with', () => {
    expect(signPayload({ ...PAYLOAD, score: 421 }).signature).not.toBe(VECTOR_SIG);
    expect(signPayload({ ...PAYLOAD, endedAt: PAYLOAD.endedAt + 1 }).signature).not.toBe(VECTOR_SIG);
  });

  it('implements RFC 4231 test case 2', () => {
    const key = new TextEncoder().encode('Jefe');
    expect(hmacSha256Hex(key, 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('canonicalize rejects non-finite numbers', () => {
    expect(() => canonicalize({ a: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});
