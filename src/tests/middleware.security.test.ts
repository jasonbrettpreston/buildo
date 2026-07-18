// Security Tests — Bearer token authentication for mobile clients (Phase 1)
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md
//            docs/specs/00-architecture/13_authentication.md §3.5, §4a
//            .cursor/phase1_plan.md Item 1 design note, P1-F5.5a
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// get-user.ts — Bearer verification path (regression locks, renamed for the
// Supabase swap — Item 2: getClaimsUid/getVerifiedUid replace
// verifyIdTokenCookie/getUserIdFromSession as the concrete verifier names)
// ---------------------------------------------------------------------------

const getUserSource = fs.readFileSync(
  path.join(__dirname, '../lib/auth/get-user.ts'),
  'utf-8',
);

describe('get-user.ts — Bearer fallback (regression locks)', () => {
  it('imports extractBearerToken', () => {
    expect(getUserSource).toContain('extractBearerToken');
  });

  it('reads Authorization header as a fallback token source', () => {
    expect(getUserSource).toMatch(/[Aa]uthorization/);
  });

  it('exports getClaimsUid and getVerifiedUid per Spec 13 §3.2\'s two-verifier split', () => {
    expect(getUserSource).toContain('export async function getClaimsUid');
    expect(getUserSource).toContain('export async function getVerifiedUid');
  });

  it('routes a Bearer token through the Supabase verifier (getClaims/getUser), not a shape check alone', () => {
    // Shape check alone (like the edge layer) is NOT sufficient in the Node
    // layer — the Bearer path must call into the Supabase SDK for real
    // verification.
    expect(getUserSource).toContain('verifyRawToken');
    expect(getUserSource).toMatch(/supabase\.auth\.getClaims/);
    expect(getUserSource).toMatch(/supabase\.auth\.getUser/);
  });
});

// ---------------------------------------------------------------------------
// updateSession fail-open contract (P1-F5.5a — panel-fold Gm+DS CRITICAL,
// adjudicated GT). Middleware calls getClaims() PURELY to trigger
// @supabase/ssr's refresh side effect (Item 1 design note); on ANY failure
// (JWKS fetch error, network partition, Supabase Auth outage) the pass MUST
// fail open — never throw, never block. This is a BEHAVIORAL test of
// `src/lib/supabase/middleware.ts`'s `updateSession`, not a source-string
// assertion, because the contract is "does it actually keep working," not
// "does the code look right."
// ---------------------------------------------------------------------------

const mockGetClaims = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims: mockGetClaims },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

function makeFakeRequest(): { cookies: { getAll: () => never[]; set: (n: string, v: string) => void }; headers: Headers } {
  const jar = new Map<string, string>();
  return {
    cookies: {
      getAll: () => [] as never[],
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
    },
    headers: new Headers(),
  };
}

describe('updateSession — fail-open on getClaims failure (P1-F5.5a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw and returns a pass-through response when getClaims rejects (JWKS/network failure)', async () => {
    mockGetClaims.mockRejectedValueOnce(new Error('JWKS fetch failed'));
    const { updateSession } = await import('@/lib/supabase/middleware');
    const request = makeFakeRequest();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(updateSession(request as any)).resolves.toBeDefined();
  });

  it('logs a WARN (not an error/throw) identifying the fail-open path', async () => {
    mockGetClaims.mockRejectedValueOnce(new Error('JWKS fetch failed'));
    const { updateSession } = await import('@/lib/supabase/middleware');
    const logger = await import('@/lib/logger');
    const request = makeFakeRequest();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateSession(request as any);

    expect(logger.logWarn).toHaveBeenCalledWith(
      '[supabase/middleware]',
      expect.stringMatching(/fail(ing)? open/i),
      expect.any(Object),
    );
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('does not reject the promise even when getClaims throws synchronously', async () => {
    mockGetClaims.mockImplementationOnce(() => {
      throw new Error('synchronous JWKS failure');
    });
    const { updateSession } = await import('@/lib/supabase/middleware');
    const request = makeFakeRequest();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(updateSession(request as any)).resolves.toBeDefined();
  });
});
