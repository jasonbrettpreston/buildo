// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2 (Account Linking)
//
// P2 output-panel fold (2026-07-20): locks the emailFromIdToken fallback that
// keeps the linking email-guard armed when Apple withholds credential.email
// (every sign-in after the first). Best-effort decode — malformed input must
// yield undefined ("unknown"), never throw.
import { emailFromIdToken } from '@/lib/jwtClaims';

function fakeJwt(payload: object): string {
  const b64url = (s: string) =>
    Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

describe('emailFromIdToken', () => {
  it('reads the email claim from a well-formed JWT payload', () => {
    expect(emailFromIdToken(fakeJwt({ email: 'user@example.com', sub: 'abc' }))).toBe(
      'user@example.com',
    );
  });

  it('handles base64url payloads needing padding', () => {
    // Payload length chosen so the base64url form drops padding chars.
    expect(emailFromIdToken(fakeJwt({ email: 'a@b.co' }))).toBe('a@b.co');
  });

  it('returns undefined when the payload has no email claim', () => {
    expect(emailFromIdToken(fakeJwt({ sub: 'abc' }))).toBeUndefined();
  });

  it('returns undefined for a non-string or empty email claim', () => {
    expect(emailFromIdToken(fakeJwt({ email: 42 }))).toBeUndefined();
    expect(emailFromIdToken(fakeJwt({ email: '' }))).toBeUndefined();
  });

  it('returns undefined (never throws) on malformed input', () => {
    expect(emailFromIdToken(null)).toBeUndefined();
    expect(emailFromIdToken(undefined)).toBeUndefined();
    expect(emailFromIdToken('')).toBeUndefined();
    expect(emailFromIdToken('not-a-jwt')).toBeUndefined();
    expect(emailFromIdToken('a.b')).toBeUndefined();
    expect(emailFromIdToken('a.!!!not-base64!!!.c')).toBeUndefined();
    expect(emailFromIdToken(`h.${Buffer.from('not json').toString('base64')}.s`)).toBeUndefined();
  });
});
