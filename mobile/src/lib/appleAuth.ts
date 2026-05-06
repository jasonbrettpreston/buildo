// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.1 + §10 — Apple Sign-In nonce contract
//
// The Apple ↔ Firebase sign-in handshake is security-critical:
//   - Apple receives the SHA-256 of the rawNonce via signInAsync({ nonce: hashedNonce })
//     and signs the identity token over that hash.
//   - Firebase receives the *raw* value via AppleAuthProvider.credential(idToken, rawNonce)
//     and recomputes SHA-256(rawNonce) to verify Apple's signature against the
//     identity token's nonce claim.
//
// If the hash relationship breaks (algorithm swap, dropped hash, mismatched
// nonce halves), Firebase rejects the credential and sign-in silently fails.
// Extracted into a pure helper so the relationship is unit-testable without
// rendering the sign-in screen.

import * as Crypto from 'expo-crypto';

export interface AppleNonce {
  /** 32-char lowercase hex (16 random bytes). Passed to AppleAuthProvider.credential. */
  rawNonce: string;
  /** 64-char lowercase hex (SHA-256 of rawNonce). Passed to AppleAuthentication.signInAsync. */
  hashedNonce: string;
}

export async function prepareAppleNonce(): Promise<AppleNonce> {
  const rawNonce = Array.from(Crypto.getRandomBytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  return { rawNonce, hashedNonce };
}
