/**
 * Deno tests for the server-side security primitives.
 *   cd supabase/functions && deno test tests/
 * The HMAC vector is shared with the client test (src/core/crypto/hmac.test.ts),
 * proving Hermes (@noble/hashes) and Deno (Web Crypto) sign identically.
 */
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import { hexToBytes, timingSafeEqual, verifyHmacHex } from '../_shared/hmac.ts';
import { canonicalize } from '../_shared/pure/canonical.ts';
import { computeCoinReward, parsePayload, validateScoreClaim } from '../_shared/pure/gameRules.ts';

const DEV_SECRET = 'local-dev-hmac-secret-change-me-0123456789';
const PAYLOAD = {
  v: 1,
  sessionId: '5f0c9a52-1d0e-4c4b-9a39-2f9d7c1e8b10',
  nonce: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718',
  gameId: 'terminal-coder',
  score: 420,
  startedAt: 1790000000000,
  endedAt: 1790000060000,
  stats: { misses: 1, hits: 40 },
} as const;
const VECTOR_SIG = '5a05c059e08cdb78856e10b1b11ce7022107341860e30320ef9b0f7382da2c9d';

Deno.test('canonicalize sorts keys recursively', () => {
  assertEquals(canonicalize({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

Deno.test('HMAC matches the cross-runtime test vector', async () => {
  assert(await verifyHmacHex(DEV_SECRET, canonicalize(PAYLOAD), VECTOR_SIG));
});

Deno.test('HMAC rejects tampered score / malformed signatures', async () => {
  assertFalse(await verifyHmacHex(DEV_SECRET, canonicalize({ ...PAYLOAD, score: 9999 }), VECTOR_SIG));
  assertFalse(await verifyHmacHex(DEV_SECRET, canonicalize(PAYLOAD), VECTOR_SIG.slice(0, 62)));
  assertFalse(await verifyHmacHex(DEV_SECRET, canonicalize(PAYLOAD), 'zz'.repeat(32)));
  assertFalse(await verifyHmacHex('another-secret-another-secret-12345', canonicalize(PAYLOAD), VECTOR_SIG));
});

Deno.test('timingSafeEqual', () => {
  const a = hexToBytes('00ff10')!;
  assert(timingSafeEqual(a, hexToBytes('00ff10')!));
  assertFalse(timingSafeEqual(a, hexToBytes('00ff11')!));
  assertFalse(timingSafeEqual(a, hexToBytes('00ff')!));
});

Deno.test('parsePayload rejects malformed input', () => {
  assert(parsePayload(PAYLOAD));
  assertEquals(parsePayload({ ...PAYLOAD, score: 1.5 }), undefined);
  assertEquals(parsePayload({ ...PAYLOAD, gameId: 'minesweeper' }), undefined);
  assertEquals(parsePayload({ ...PAYLOAD, v: 2 }), undefined);
  assertEquals(parsePayload(null), undefined);
});

Deno.test('validateScoreClaim enforces duration window and theoretical max', () => {
  const p = parsePayload(PAYLOAD)!;
  const serverStart = PAYLOAD.startedAt - 4_000; // countdown before play
  assert(validateScoreClaim(p, serverStart, PAYLOAD.endedAt + 500).ok);

  const tooHigh = { ...p, score: 60 * 20 + 1 };
  assertEquals(validateScoreClaim(tooHigh, serverStart, PAYLOAD.endedAt + 500), { ok: false, reason: 'score_exceeds_theoretical_max' });

  // Client claims 60s but the server only issued the session 5s ago.
  assertEquals(validateScoreClaim(p, PAYLOAD.endedAt - 5_000, PAYLOAD.endedAt), {
    ok: false,
    reason: 'duration_exceeds_server_window',
  });

  const instant = { ...p, endedAt: p.startedAt + 2_000 };
  assertEquals(validateScoreClaim(instant, serverStart, PAYLOAD.endedAt), { ok: false, reason: 'too_short' });
});

Deno.test('coin reward is capped', () => {
  assertEquals(computeCoinReward('terminal-coder', 100_000), 90);
  assertEquals(computeCoinReward('terminal-coder', -5), 0);
});
