// Security Tests — Bearer token authentication for mobile clients (Phase 1)
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md
import { describe, it, expect } from 'vitest';
import { extractBearerToken, isValidSessionCookie } from '@/lib/auth/route-guard';
import fs from 'fs';
import path from 'path';

const VALID_JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiIxMjMifQ.signature';

// ---------------------------------------------------------------------------
// extractBearerToken — pure unit tests
// ---------------------------------------------------------------------------

describe('extractBearerToken', () => {
  it('extracts token from well-formed Authorization: Bearer header', () => {
    expect(extractBearerToken('Bearer a.b.c')).toBe('a.b.c');
  });

  it('is case-insensitive for the Bearer scheme prefix', () => {
    expect(extractBearerToken('bearer A.B.C')).toBe('A.B.C');
    expect(extractBearerToken('BEARER x.y.z')).toBe('x.y.z');
  });

  it('returns undefined for null header', () => {
    expect(extractBearerToken(null)).toBeUndefined();
  });

  it('returns undefined for non-Bearer schemes', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
  });

  it('returns undefined when token part is empty', () => {
    expect(extractBearerToken('Bearer')).toBeUndefined();
    expect(extractBearerToken('Bearer ')).toBeUndefined();
  });

  it('extracted JWT-shaped token passes isValidSessionCookie shape check', () => {
    expect(isValidSessionCookie(extractBearerToken(`Bearer ${VALID_JWT}`))).toBe(true);
  });

  it('extracted non-JWT token fails isValidSessionCookie shape check', () => {
    expect(isValidSessionCookie(extractBearerToken('Bearer not-a-jwt'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Middleware — Bearer acceptance regression locks (source shape)
// ---------------------------------------------------------------------------

const middlewareSource = fs.readFileSync(
  path.join(__dirname, '../middleware.ts'),
  'utf-8',
);

describe('Middleware — Bearer token support (regression locks)', () => {
  it('imports extractBearerToken from route-guard', () => {
    expect(middlewareSource).toContain('extractBearerToken');
  });

  it('reads the Authorization header so mobile clients can authenticate', () => {
    expect(middlewareSource).toMatch(/[Aa]uthorization/);
  });

  it('uses logical OR so cookie OR Bearer token independently satisfies auth', () => {
    // Cookie path and Bearer path must be equivalent, not additive
    expect(middlewareSource).toContain('||');
    expect(middlewareSource).toContain('extractBearerToken');
  });
});

// ---------------------------------------------------------------------------
// getUserIdFromSession — Bearer fallback regression locks (source shape)
// ---------------------------------------------------------------------------

const getUserSource = fs.readFileSync(
  path.join(__dirname, '../lib/auth/get-user.ts'),
  'utf-8',
);

describe('getUserIdFromSession — Bearer fallback (regression locks)', () => {
  it('imports extractBearerToken', () => {
    expect(getUserSource).toContain('extractBearerToken');
  });

  it('reads Authorization header as a fallback token source', () => {
    expect(getUserSource).toMatch(/[Aa]uthorization/);
  });

  it('routes bearer token through verifyIdTokenCookie for full Firebase verification', () => {
    // Shape check alone (like the edge layer) is NOT sufficient in the Node layer.
    // verifyIdTokenCookie calls Firebase Admin verifyIdToken — that's the contract.
    expect(getUserSource).toContain('verifyIdTokenCookie');
  });
});
