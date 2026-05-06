/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.1 + §10
//
// Locks the Apple ↔ Firebase nonce hash contract that the 2026-05-06
// mobile-spec audit item 8 flagged. Without this test, a regression
// where the SHA-256 algorithm is silently swapped (crypto module update,
// copy-paste from a different project, refactor that drops the digest
// call) would break Firebase identity-token verification at runtime.
//
// `expo-crypto` is a native module unavailable in jest-node; mock it with
// Node's built-in `crypto` so the helper executes a real SHA-256 in tests.
// The mock MUST mirror the contract: getRandomBytes returns Uint8Array,
// digestStringAsync returns lowercase hex, and CryptoDigestAlgorithm.SHA256
// is the algorithm sentinel the helper passes through.

jest.mock('expo-crypto', () => {
  // Inline-require Node's crypto (jest.mock factories may not reference
  // outer-scope variables, but require() inside the factory is allowed).
  //
  // Limitation (acknowledged by Independent reviewer #3): the algorithm
  // string `'SHA-256'` here is self-referential — the mock both produces
  // it (via CryptoDigestAlgorithm.SHA256) and checks against it. If
  // `expo-crypto` ever changes the enum value upstream, the production
  // call will break at runtime but this test would not detect the change
  // (the mock owns both sides). The hash-relationship test (which uses
  // Node's crypto DIRECTLY for the recompute, see below) catches the
  // algorithm-correctness contract regardless.
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: (size: number) => new Uint8Array(nodeCrypto.randomBytes(size)),
    digestStringAsync: async (algorithm: string, data: string) => {
      if (algorithm !== 'SHA-256') {
        throw new Error(`Unexpected algorithm: ${algorithm}`);
      }
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    },
  };
});

// Direct node:crypto import for the SHA-256 recompute in the equality
// test below — this MUST NOT go through the mocked expo-crypto, otherwise
// the test becomes circular (mock validates mock). DeepSeek MEDIUM #2.
import { createHash as nodeCreateHash } from 'node:crypto';
import * as Crypto from 'expo-crypto';
import { prepareAppleNonce } from '@/lib/appleAuth';

describe('prepareAppleNonce — Spec 93 §3.1 + §10 nonce hash contract', () => {
  it('rawNonce is 32 lowercase hex chars (16 random bytes)', async () => {
    const { rawNonce } = await prepareAppleNonce();
    expect(rawNonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hashedNonce is 64 lowercase hex chars (SHA-256 → 32 bytes)', async () => {
    const { hashedNonce } = await prepareAppleNonce();
    expect(hashedNonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashedNonce is exactly SHA-256(rawNonce) — the security-critical relationship', async () => {
    const { rawNonce, hashedNonce } = await prepareAppleNonce();
    // Recompute via Node's crypto DIRECTLY (not the mocked expo-crypto).
    // This breaks the circular validation DeepSeek MEDIUM #2 flagged: if
    // a future refactor swaps `prepareAppleNonce` to use a different
    // crypto library, the production code's hash output would still need
    // to match Node's SHA-256 — otherwise this test fails.
    const expected = nodeCreateHash('sha256').update(rawNonce).digest('hex');
    expect(hashedNonce).toBe(expected);
  });

  it('hashedNonce is NOT identical to rawNonce — proves the hash actually ran', async () => {
    const { rawNonce, hashedNonce } = await prepareAppleNonce();
    // A regression that returns rawNonce as both fields (e.g., dropped
    // digest call short-circuiting to identity) would still match
    // length and hex format on rawNonce but fail this guard. Belt-and-
    // braces with the SHA-256 equality test above.
    expect(hashedNonce).not.toBe(rawNonce);
  });

  it('two consecutive calls produce different rawNonces — entropy guard', async () => {
    const a = await prepareAppleNonce();
    const b = await prepareAppleNonce();
    expect(a.rawNonce).not.toBe(b.rawNonce);
    // Hashed values differ too (SHA-256 is collision-resistant on
    // distinct inputs at this length).
    expect(a.hashedNonce).not.toBe(b.hashedNonce);
  });
});
