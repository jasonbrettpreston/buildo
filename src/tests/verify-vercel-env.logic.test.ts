// Logic Layer Tests — Vercel env-verification (scripts/verify-vercel-env.js)
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §3.2, §5
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vve = require('../../scripts/verify-vercel-env.js') as {
  evaluateEnv: (
    env: Record<string, string | undefined>,
    targetEnv: 'production' | 'preview' | 'development'
  ) => {
    ok: boolean;
    targetEnv: string;
    findings: { level: 'ok' | 'warn' | 'error'; check: string; name: string; message: string }[];
  };
  secretShapeReason: (value: string) => string | null;
  classifyPublicVar: (name: string, value: string) => { verdict: 'allow' | 'flag'; reason: string };
  decodeJwtRole: (value: string) => string | null;
  resolveTargetEnv: (argv: string[], env: Record<string, string | undefined>) => string;
  PUBLIC_VAR_NAME_ALLOWLIST: string[];
  PUBLIC_VAR_NAME_PREFIX_ALLOW: string[];
  PG_POOL_MAX_PROD_CEILING: number;
  REQUIRED_GROUPS: { label: string; anyOf: string[] }[];
  isPublicVarName: (name: string) => boolean;
  isAllowlistedPublicVarName: (name: string) => boolean;
  exposureLevel: (targetEnv: string) => 'error' | 'warn';
  classifyPoolMax: (value: string | undefined, ceiling?: number) => {
    status: 'ok' | 'missing' | 'fallback' | 'noncanonical' | 'exceeds_ceiling';
    parsed: number | null;
    message: string;
  };
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
    // P4 hardening H4 (Guardian F1): the fixture carries the ruled value so
    // "a correctly configured production env is green" stays the pinned truth.
    PG_POOL_MAX: '5',
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

describe('verify-vercel-env — C4 env-scoping (Spec 113 §3.2: MFA/Sentry hard-fail production only)', () => {
  for (const targetEnv of ['preview', 'development'] as const) {
    it(`ADMIN_MFA_ENFORCED missing on ${targetEnv} is a WARN, not a failure`, () => {
      const env = validEnv();
      delete env.ADMIN_MFA_ENFORCED;
      const result = vve.evaluateEnv(env, targetEnv);
      expect(result.ok).toBe(true);
      expect(result.findings.some((f) => f.level === 'warn' && f.name === 'ADMIN_MFA_ENFORCED')).toBe(true);
      expect(result.findings.some((f) => f.level === 'error' && f.name === 'ADMIN_MFA_ENFORCED')).toBe(false);
    });

    it(`a missing Sentry DSN on ${targetEnv} is a WARN (Spec 113 §3.2 SHOULD), not a failure`, () => {
      const env = validEnv();
      delete env.NEXT_PUBLIC_SENTRY_DSN;
      const result = vve.evaluateEnv(env, targetEnv);
      expect(result.ok).toBe(true);
      expect(result.findings.some((f) => f.level === 'warn' && /Sentry DSN/.test(f.message))).toBe(true);
    });
  }

  it('production still hard-fails a missing Sentry DSN', () => {
    const env = validEnv();
    delete env.NEXT_PUBLIC_SENTRY_DSN;
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && /Sentry DSN/.test(f.message))).toBe(true);
  });

  it('production still hard-fails a missing/false ADMIN_MFA_ENFORCED (the original §3.2 posture is untouched)', () => {
    const env = validEnv();
    env.ADMIN_MFA_ENFORCED = 'false';
    expect(vve.evaluateEnv(env, 'production').ok).toBe(false);
    delete env.ADMIN_MFA_ENFORCED;
    expect(vve.evaluateEnv(env, 'production').ok).toBe(false);
  });

  it('the six REQUIRED_PRESENT criticals still hard-fail on EVERY env — only MFA/Sentry are scoped', () => {
    const env = validEnv();
    delete env.STRIPE_WEBHOOK_SECRET;
    delete env.ADMIN_MFA_ENFORCED; // warn-only on preview — must not mask the Stripe error
    const result = vve.evaluateEnv(env, 'preview');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.level === 'error' && f.name === 'STRIPE_WEBHOOK_SECRET')).toBe(true);
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
    // target the Tier-1 finding by check (order-independent — Tier 2 now also
    // fires on this unknown name, which is correct and separately asserted)
    const hit = result.findings.find((f) => f.name === 'NEXT_PUBLIC_DB' && f.check === 'leaked_secret');
    expect(hit).toBeDefined();
    expect(hit?.level).toBe('error');
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

  it('does NOT flag an anon-role JWT VALUE in an allowlisted public var (anon key is public — Tier-1 concern)', () => {
    // P4 hardening H1 (Guardian F2): re-targeted from the synthetic name
    // NEXT_PUBLIC_ANON (which Tier 2 now correctly flags as unknown) onto the
    // allowlisted legacy name, preserving this test's original intent: an
    // anon-role JWT's VALUE is legitimately public.
    const env = validEnv();
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = makeJwt('anon');
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

describe('verify-vercel-env — H1 Tier 2 name allowlist (P4 hardening WF2)', () => {
  it('an unknown-name public var is an ERROR in production AND preview, WARN in development (exposure tier, not the C4 tier)', () => {
    for (const [envName, level] of [['production', 'error'], ['preview', 'error'], ['development', 'warn']] as const) {
      const env = validEnv();
      env.NEXT_PUBLIC_TOTALLY_NOVEL = 'some-benign-looking-value';
      const result = vve.evaluateEnv(env, envName);
      const hit = result.findings.find((f) => f.name === 'NEXT_PUBLIC_TOTALLY_NOVEL' && f.check === 'public_var_name');
      expect(hit?.level).toBe(level);
      expect(result.ok).toBe(level !== 'error');
    }
  });

  it('every allowlisted name passes the name tier (no public_var_name finding)', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = 'AIzaSyA1234567890abcdefghijklmnopqrstu'; // 39 chars — evades the 40-char blob regex
    env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_abc123';
    env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.findings.filter((f) => f.check === 'public_var_name' && f.level !== 'ok')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('platform-injected NEXT_PUBLIC_VERCEL_* system vars are carved out (Integration/SF HIGH — invisible to any repo grep)', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_VERCEL_URL = 'my-app-abc123.vercel.app';
    env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = 'a'.repeat(30);
    const result = vve.evaluateEnv(env, 'production');
    expect(result.findings.some((f) => f.check === 'public_var_name' && f.level === 'error')).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('BOTH tiers fire independently: an unknown-name + secret-shaped var emits TWO findings (the masking quadrant, Observability #1)', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_RANDOM = 'sk_live_0123456789abcdef0123';
    const result = vve.evaluateEnv(env, 'development'); // even where the name tier is warn-only…
    const tier1 = result.findings.find((f) => f.name === 'NEXT_PUBLIC_RANDOM' && f.check === 'leaked_secret');
    const tier2 = result.findings.find((f) => f.name === 'NEXT_PUBLIC_RANDOM' && f.check === 'public_var_name');
    expect(tier1?.level).toBe('error'); // …the Tier-1 secret-shape error is NEVER masked
    expect(tier2?.level).toBe('warn');
    expect(result.ok).toBe(false);
  });

  it('never-echo: the Tier-2 finding message contains the NAME only, never the value (Security F2)', () => {
    const plantedValue = 'maybe-a-novel-format-secret-abc987';
    const env = validEnv();
    env.NEXT_PUBLIC_MYSTERY = plantedValue;
    const result = vve.evaluateEnv(env, 'production');
    const hit = result.findings.find((f) => f.name === 'NEXT_PUBLIC_MYSTERY' && f.check === 'public_var_name');
    expect(hit).toBeDefined();
    expect(hit?.message).not.toContain(plantedValue);
  });

  it('a present-but-EMPTY unknown-name var still gets the Tier-2 finding — the blanked-not-deleted leftover class (Round-2, Code Reviewer)', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_RETIRED_DEBUG_FLAG = '';
    const result = vve.evaluateEnv(env, 'production');
    const tier2 = result.findings.find((f) => f.name === 'NEXT_PUBLIC_RETIRED_DEBUG_FLAG' && f.check === 'public_var_name');
    expect(tier2?.level).toBe('error');
    // Tier 1 has no value to classify — no leaked_secret finding for it
    expect(result.findings.some((f) => f.name === 'NEXT_PUBLIC_RETIRED_DEBUG_FLAG' && f.check === 'leaked_secret')).toBe(false);
  });

  it('an EXPO_PUBLIC_* var in a Vercel env is name-unknown → flagged (it has no legitimate Vercel presence)', () => {
    const env = validEnv();
    env.EXPO_PUBLIC_API_URL = 'https://buildo.app';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.findings.some((f) => f.name === 'EXPO_PUBLIC_API_URL' && f.check === 'public_var_name' && f.level === 'error')).toBe(true);
  });
});

describe('verify-vercel-env — H4 PG_POOL_MAX pin (P4 hardening WF2, Spec 113 §5)', () => {
  it('classifyPoolMax: the full matrix, mirroring parsePositiveIntEnv exactly (Round-2 output fold — every status tells the runtime truth)', () => {
    expect(vve.classifyPoolMax('5').status).toBe('ok');
    expect(vve.classifyPoolMax('05').status).toBe('ok'); // runtime honors as 5
    expect(vve.classifyPoolMax(' 5 ').status).toBe('ok'); // runtime honors (parseInt skips whitespace)
    expect(vve.classifyPoolMax('10').status).toBe('ok');
    expect(vve.classifyPoolMax('010').status).toBe('ok'); // runtime honors as 10 — within ceiling
    expect(vve.classifyPoolMax(undefined).status).toBe('missing');
    expect(vve.classifyPoolMax('').status).toBe('missing');
    expect(vve.classifyPoolMax('0').status).toBe('fallback'); // runtime DISCARDS → default 20
    expect(vve.classifyPoolMax('00').status).toBe('fallback');
    expect(vve.classifyPoolMax('abc').status).toBe('fallback');
    expect(vve.classifyPoolMax('0x10').status).toBe('fallback'); // parseInt(…,10) → 0 → silent discard
    // prefix-parsed-and-HONORED forms — the runtime uses the mangled integer,
    // it does NOT fall back to 20 (5-reviewer message-accuracy converge):
    expect(vve.classifyPoolMax('5.9')).toMatchObject({ status: 'noncanonical', parsed: 5 });
    expect(vve.classifyPoolMax('7abc')).toMatchObject({ status: 'noncanonical', parsed: 7 });
    expect(vve.classifyPoolMax('1e2')).toMatchObject({ status: 'noncanonical', parsed: 1 });
    expect(vve.classifyPoolMax('11').status).toBe('exceeds_ceiling');
    expect(vve.classifyPoolMax('100')).toMatchObject({ status: 'exceeds_ceiling', parsed: 100 }); // honored as 100 — NOT "falls back to 20"
  });

  it('messages tell the truth about the runtime outcome per class (Observability #2 + Round-2)', () => {
    expect(vve.classifyPoolMax(undefined).message).toMatch(/falls back to the unsafe single-server default of 20/);
    expect(vve.classifyPoolMax('abc').message).toMatch(/DISCARDS it and falls back to the unsafe default of 20/);
    expect(vve.classifyPoolMax('11').message).toMatch(/honored by the runtime as 11 — exceeds the ceiling/);
    expect(vve.classifyPoolMax('100').message).toMatch(/honored by the runtime as 100/);
    expect(vve.classifyPoolMax('5.9').message).toMatch(/prefix-parse it and honor 5/);
    // a fallback-class message must NEVER claim an honored value, and vice versa
    expect(vve.classifyPoolMax('100').message).not.toMatch(/falls back/);
    expect(vve.classifyPoolMax('abc').message).not.toMatch(/honor/);
  });

  it('missing PG_POOL_MAX is an ERROR in production and preview, WARN in development', () => {
    for (const [envName, level] of [['production', 'error'], ['preview', 'error'], ['development', 'warn']] as const) {
      const env = validEnv();
      delete env.PG_POOL_MAX;
      const result = vve.evaluateEnv(env, envName);
      const hit = result.findings.find((f) => f.name === 'PG_POOL_MAX' && f.check === 'pool_max');
      expect(hit?.level).toBe(level);
      expect(result.ok).toBe(level !== 'error');
    }
  });

  it("the ruled value '5' passes everywhere; PG_CONNECTION_TIMEOUT_MS is surfaced when set (both-knobs visibility)", () => {
    const env = validEnv();
    env.PG_CONNECTION_TIMEOUT_MS = '10000';
    const result = vve.evaluateEnv(env, 'production');
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.name === 'PG_CONNECTION_TIMEOUT_MS' && /10000ms/.test(f.message))).toBe(true);
  });
});

describe('verify-vercel-env — allowlist drift invariants (DeepSeek + CR #4)', () => {
  it("REQUIRED_GROUPS' public-prefixed names are a subset of the allowlist — the two hand-maintained lists cannot silently diverge", () => {
    const groupPublicNames = vve.REQUIRED_GROUPS.flatMap((g) => g.anyOf).filter((n) => vve.isPublicVarName(n));
    const offenders = groupPublicNames.filter((n) => !vve.isAllowlistedPublicVarName(n));
    expect(offenders).toEqual([]);
  });

  it('census-sync: every NEXT_PUBLIC_* name referenced in live src/ code is allowlisted (add the entry with the reading code, same commit)', () => {
    const SRC = path.resolve(__dirname, '..');
    const offenders = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'tests' && dir === SRC) continue; // fixtures use deliberately-unknown names
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf-8');
          for (const m of source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
            const name = m[0];
            if (!vve.isAllowlistedPublicVarName(name)) offenders.set(name, path.relative(SRC, full));
          }
        }
      }
    };
    walk(SRC);
    // Root-level Next.js config/instrumentation files sit OUTSIDE src/ but
    // are bundle-relevant (sentry.client.config.ts reads NEXT_PUBLIC_SENTRY_DSN)
    // — scan top-level .ts/.tsx too (Round-2, Guardian INFO).
    const ROOT = path.resolve(SRC, '..');
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = fs.readFileSync(path.join(ROOT, entry.name), 'utf-8');
      for (const m of source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        if (!vve.isAllowlistedPublicVarName(m[0])) offenders.set(m[0], entry.name);
      }
    }
    expect(Object.fromEntries(offenders)).toEqual({});
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
