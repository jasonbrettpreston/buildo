// Logic Layer Tests — Vercel env-verification (scripts/verify-vercel-env.js)
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §3.2
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vve = require('../../scripts/verify-vercel-env.js') as {
  evaluateEnv: (
    env: Record<string, string | undefined>,
    targetEnv: 'production' | 'preview' | 'development'
  ) => {
    ok: boolean;
    targetEnv: string;
    findings: { level: 'ok' | 'error'; check: string; name: string; message: string }[];
  };
  secretShapeReason: (value: string) => string | null;
  classifyPublicVar: (name: string, value: string) => { verdict: 'allow' | 'flag'; reason: string };
  decodeJwtRole: (value: string) => string | null;
  resolveTargetEnv: (argv: string[], env: Record<string, string | undefined>) => string;
};

/** Build an unsigned JWT whose payload carries the given role claim. */
function makeJwt(role: string): string {
  const b64url = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role, iss: 'supabase' })}.sig_placeholder_value_xyz`;
}

/** A fully-populated, all-passing production env. */
function validEnv(): Record<string, string | undefined> {
  return {
    POSTGRES_URL: 'postgresql://app:pw@pooler.supabase.com:6543/postgres',
    POSTGRES_URL_NON_POOLING: 'postgresql://app:pw@pooler.supabase.com:5432/postgres',
    NEXT_PUBLIC_SUPABASE_URL: 'https://gcnatfpacuhsytcbaszi.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_AbCdEf0123456789AbCdEf0123456789',
    ADMIN_MFA_ENFORCED: 'true',
    STRIPE_SECRET_KEY: 'sk_live_redactedvalue',
    STRIPE_WEBHOOK_SECRET: 'whsec_redactedvalue',
    RESEND_API_KEY: 're_redactedvalue',
    NEXT_PUBLIC_SENTRY_DSN: 'https://abc123@o12345.ingest.sentry.io/67890',
    CRON_SECRET: 'a-strong-cron-secret-value',
  };
}

describe('verify-vercel-env — evaluateEnv presence (Spec 113 §3/§3.2)', () => {
  it('a fully-populated production env passes with zero errors', () => {
    const result = vve.evaluateEnv(validEnv(), 'production');
    expect(result.ok).toBe(true);
    expect(result.findings.filter((f) => f.level === 'error')).toEqual([]);
  });

  const criticals = [
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'CRON_SECRET',
  ];
  for (const missing of criticals) {
    it(`fails when the critical var ${missing} is absent`, () => {
      const env = validEnv();
      delete env[missing];
      const result = vve.evaluateEnv(env, 'production');
      expect(result.ok).toBe(false);
      expect(result.findings.some((f) => f.level === 'error' && f.name === missing)).toBe(true);
    });
  }

  it('fails when the Supabase URL group is entirely absent', () => {
    const env = validEnv();
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && f.check === 'presence' && /Supabase project URL/.test(f.message))).toBe(true);
  });

  it('fails when the publishable/anon key group is entirely absent', () => {
    const env = validEnv();
    delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && /publishable\/anon key/.test(f.message))).toBe(true);
  });

  it("fails when ADMIN_MFA_ENFORCED is not exactly 'true'", () => {
    const env = validEnv();
    env.ADMIN_MFA_ENFORCED = 'false';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && f.name === 'ADMIN_MFA_ENFORCED')).toBe(true);
  });
});

describe('verify-vercel-env — DEV_MODE (production only)', () => {
  it('fails when DEV_MODE is truthy in production', () => {
    const env = validEnv();
    env.DEV_MODE = 'true';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && f.check === 'dev_mode' && f.name === 'DEV_MODE')).toBe(true);
  });

  it("passes when DEV_MODE === 'false' in production", () => {
    const env = validEnv();
    env.DEV_MODE = 'false';
    expect(vve.evaluateEnv(env, 'production').ok).toBe(true);
  });

  it('does not enforce DEV_MODE-absent outside production', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_DEV_MODE = 'true';
    // In development, DEV_MODE truthiness is not a failure. (It is still a
    // public var, but 'true' is not secret-shaped, so no leak finding either.)
    expect(vve.evaluateEnv(env, 'development').ok).toBe(true);
  });
});

describe('verify-vercel-env — leaked-secret allowlist scan (public vars)', () => {
  it('flags a postgres:// connection string in a NEXT_PUBLIC_ var', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_DB = 'postgresql://user:secretpw@host:5432/db';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    const hit = result.findings.find((f) => f.name === 'NEXT_PUBLIC_DB' && f.level === 'error');
    expect(hit).toBeDefined();
    expect(hit?.check).toBe('leaked_secret');
    // must NOT echo the secret value
    expect(hit?.message).not.toContain('secretpw');
  });

  it('flags a legacy service_role JWT in a public var', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_SERVICE_KEY = makeJwt('service_role');
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(
      result.findings.some(
        (f) => f.name === 'NEXT_PUBLIC_SERVICE_KEY' && f.level === 'error' && /service_role/.test(f.message)
      )
    ).toBe(true);
  });

  it('does NOT flag an anon-role JWT in a public var (anon key is public)', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_ANON = makeJwt('anon');
    expect(vve.evaluateEnv(env, 'production').ok).toBe(true);
  });

  it('passes the sb_publishable_* key in a public var (the intended public shape)', () => {
    // validEnv already carries NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — assert it
    // is classified allow, not a bare-base64 false positive.
    const c = vve.classifyPublicVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', validEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string);
    expect(c.verdict).toBe('allow');
    expect(vve.evaluateEnv(validEnv(), 'production').ok).toBe(true);
  });

  it('flags an sb_secret_* key and a Stripe secret placed in public vars', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_LEAK1 = 'sb_secret_abcDEF0123456789';
    env.EXPO_PUBLIC_LEAK2 = 'sk_live_0123456789abcdef0123';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.name === 'NEXT_PUBLIC_LEAK1' && f.level === 'error')).toBe(true);
    expect(result.findings.some((f) => f.name === 'EXPO_PUBLIC_LEAK2' && f.level === 'error')).toBe(true);
  });
});

describe('verify-vercel-env — helpers', () => {
  it('decodeJwtRole extracts the role claim, null for non-JWT', () => {
    expect(vve.decodeJwtRole(makeJwt('service_role'))).toBe('service_role');
    expect(vve.decodeJwtRole('not-a-jwt')).toBeNull();
  });

  it('secretShapeReason returns null for a plain short public config value', () => {
    expect(vve.secretShapeReason('true')).toBeNull();
    expect(vve.secretShapeReason('v2')).toBeNull();
  });

  it('resolveTargetEnv: --env wins, then VERCEL_ENV, then production; unknown -> production', () => {
    expect(vve.resolveTargetEnv(['--env=preview'], {})).toBe('preview');
    expect(vve.resolveTargetEnv([], { VERCEL_ENV: 'development' })).toBe('development');
    expect(vve.resolveTargetEnv([], {})).toBe('production');
    expect(vve.resolveTargetEnv(['--env=staging'], {})).toBe('production');
  });
});
