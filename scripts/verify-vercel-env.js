#!/usr/bin/env node
/**
 * verify-vercel-env — env-only pre-deploy verification for the Vercel-deployed
 * Next.js app. Standalone CLI, NOT a `pipeline.run()` chain step (it runs as a
 * Vercel build step / CI pre-step, BEFORE any app code executes) — same
 * "outside the Spec 47 skeleton" category as `scripts/migrate.js`,
 * `scripts/restore-db.js`, and `scripts/check-chain-running.js`.
 *
 * Reads `process.env` ONLY — there is no `vercel env pull` dual mode (SEC-3 /
 * Gemini MED: one code path, no pulled-secret file written to disk). The build
 * step / CI job is responsible for invoking this with the target environment's
 * variables already in `process.env`.
 *
 * Three checks (Spec 113 §3 / §3.2):
 *   (a) PRESENCE — every runtime-critical var is present & non-empty, and
 *       ADMIN_MFA_ENFORCED === 'true' (so prod can never ship green with MFA
 *       inert or the Stripe webhook dead). MFA + the SHOULD-grade Sentry DSN
 *       hard-fail PRODUCTION only, demoting to WARN on preview/development
 *       (P4-F0 fold C4 — the DEV_MODE env-scoping pattern).
 *   (b) DEV_MODE ABSENT/false — in production, DEV_MODE / NEXT_PUBLIC_DEV_MODE
 *       must be absent or explicitly 'false'.
 *   (c) NO LEAKED SECRET — every NEXT_PUBLIC_* / EXPO_PUBLIC_* var is inspected;
 *       a known-public value SHAPE (sb_publishable_*, the project https URL, a
 *       Sentry ingest DSN, a phc_* PostHog key) is permitted, and ANY OTHER
 *       public var whose value matches a secret shape is FLAGGED (never printing
 *       the value): postgres(ql):// or a password-bearing connection string, a
 *       legacy service_role JWT (eyJ… decoded, role === service_role), an
 *       sb_secret_* key, a Stripe secret (sk_live_/sk_test_/whsec_), or a bare
 *       long hex/base64 blob.
 *
 * Target env: `--env=production|preview|development` arg, else `VERCEL_ENV`, else
 * 'production'. The SAME script is meant to run once PER environment — the plan
 * requires all three (production + preview + development); the multi-env
 * orchestration is the caller's (workflow/checklist) concern, this script just
 * evaluates one invocation's `process.env` against the given target label.
 *
 * Exit 0 = all checks passed. Exit 1 = at least one finding (missing-required,
 * DEV_MODE present in prod, or a leaked-secret hit) — with a per-var report.
 *
 * Follows scripts/check-chain-running.js CLI conventions: `process.exitCode`
 * (never `process.exit()`), no `new Pool`, module.exports for the logic test.
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §3.2
 */
'use strict';

// ---------------------------------------------------------------------------
// Presence contract (Spec 113 §3 / §3.2)
// ---------------------------------------------------------------------------

// Single vars that must be present & non-empty in every deployed environment.
const REQUIRED_PRESENT = [
  'POSTGRES_URL', // Vercel integration-injected pooled 6543 runtime string (§3)
  'POSTGRES_URL_NON_POOLING', // direct 5432 (§3)
  'STRIPE_SECRET_KEY', // operator-set (§3.2)
  'STRIPE_WEBHOOK_SECRET', // operator-set (§3.2)
  'RESEND_API_KEY', // operator-set (§3.2)
  'CRON_SECRET', // operator-set (§3.2)
];

// Groups where ANY ONE of the listed vars satisfies the requirement.
// `warnOutsideProduction: true` (P4-F0 fold C4): Spec 113 §3.2 grades the
// Sentry DSN as SHOULD — a missing DSN hard-fails production but only WARNs
// preview/development (an unSentried preview build is degraded, not broken).
const REQUIRED_GROUPS = [
  { label: 'Supabase project URL', anyOf: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] },
  {
    label: 'Supabase publishable/anon key',
    anyOf: [
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ],
  },
  { label: 'Sentry DSN', anyOf: ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'], warnOutsideProduction: true },
];

// DEV_MODE family — must be absent or 'false' in production (§3.2).
const DEV_MODE_VARS = ['DEV_MODE', 'NEXT_PUBLIC_DEV_MODE'];

const PUBLIC_VAR_PREFIXES = ['NEXT_PUBLIC_', 'EXPO_PUBLIC_'];

// ---------------------------------------------------------------------------
// Pure predicates — exported for src/tests/verify-vercel-env.logic.test.ts.
// None read process.env; all operate on passed values so tests need no env
// mutation.
// ---------------------------------------------------------------------------

function isPresent(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Decode a JWT's payload `role` claim, or null if `value` is not a JWT-shaped
 * `eyJ….….…` string. Handles base64url. Never throws.
 * @param {string} value
 * @returns {string|null}
 */
function decodeJwtRole(value) {
  if (typeof value !== 'string' || !value.startsWith('eyJ')) return null;
  const parts = value.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(payload);
    return typeof obj.role === 'string' ? obj.role : null;
  } catch {
    return null; // not a decodable JWT payload — not our concern here
  }
}

/**
 * Known-PUBLIC value shapes that are safe to appear in a NEXT_PUBLIC_ /
 * EXPO_PUBLIC_ var. Checked BEFORE secret-shape detection so a legitimate
 * publishable key (sb_publishable_… is all-base64url chars and would otherwise
 * trip the bare-base64 secret heuristic) is never a false positive.
 * @param {string} value
 */
function isKnownPublicShape(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (/^sb_publishable_/.test(v)) return true; // Supabase publishable key
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v)) return true; // project URL
  if (/^https:\/\/[^\s@]*ingest[^\s@]*\//i.test(v)) return true; // Sentry ingest DSN
  if (/^phc_/.test(v)) return true; // PostHog project key
  return false;
}

/**
 * If `value` looks like a SECRET, return a short human reason (never the value
 * itself); else null. Used only against NEXT_PUBLIC_ / EXPO_PUBLIC_ vars.
 * @param {string} value
 * @returns {string|null}
 */
function secretShapeReason(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const v = value.trim();
  if (/^postgres(ql)?:\/\//i.test(v)) return 'postgres connection string';
  // any URL scheme carrying user:password@host
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(v)) return 'password-bearing connection string';
  if (/^sb_secret_/.test(v)) return 'Supabase secret key (sb_secret_)';
  if (/^sk_(live|test)_/.test(v)) return 'Stripe secret key (sk_live_/sk_test_)';
  if (/^whsec_/.test(v)) return 'Stripe webhook secret (whsec_)';
  if (decodeJwtRole(v) === 'service_role') return 'legacy service_role JWT';
  if (/^[0-9a-fA-F]{32,}$/.test(v)) return 'bare long hex blob (key-shaped)';
  if (/^[A-Za-z0-9+\/_-]{40,}={0,2}$/.test(v)) return 'bare long base64 blob (key-shaped)';
  return null;
}

/**
 * Classify a single public (NEXT_PUBLIC_/EXPO_PUBLIC_) var's value.
 * Known-public shapes are allowed first; otherwise a secret shape flags it;
 * anything else (short config, booleans, non-secret strings) is allowed.
 * @param {string} name
 * @param {string} value
 * @returns {{ verdict: 'allow'|'flag', reason: string }}
 */
function classifyPublicVar(name, value) {
  if (isKnownPublicShape(value)) return { verdict: 'allow', reason: 'known-public shape' };
  const secret = secretShapeReason(value);
  if (secret) return { verdict: 'flag', reason: `looks like a ${secret}` };
  return { verdict: 'allow', reason: 'not secret-shaped' };
}

function isPublicVarName(name) {
  return PUBLIC_VAR_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Evaluate an env object against the presence + DEV_MODE + leaked-secret
 * contract for a given target environment. Pure; does not touch process.env.
 *
 * `warn`-level findings (C4: off-prod MFA/Sentry) never fail the run — `ok`
 * is derived from `error` findings only.
 *
 * @param {Record<string, string|undefined>} env
 * @param {'production'|'preview'|'development'} targetEnv
 * @returns {{ ok: boolean, targetEnv: string, findings: { level: 'ok'|'warn'|'error', check: string, name: string, message: string }[] }}
 */
function evaluateEnv(env, targetEnv) {
  const findings = [];

  // (a) presence
  for (const name of REQUIRED_PRESENT) {
    if (isPresent(env[name])) {
      findings.push({ level: 'ok', check: 'presence', name, message: 'present' });
    } else {
      findings.push({ level: 'error', check: 'presence', name, message: 'MISSING or empty (required, Spec 113 §3/§3.2)' });
    }
  }
  for (const group of REQUIRED_GROUPS) {
    const satisfiedBy = group.anyOf.find((n) => isPresent(env[n]));
    if (satisfiedBy) {
      findings.push({ level: 'ok', check: 'presence', name: satisfiedBy, message: `present (${group.label})` });
    } else {
      // C4: SHOULD-grade groups (Spec 113 §3.2) demote to WARN off-prod.
      const level = group.warnOutsideProduction && targetEnv !== 'production' ? 'warn' : 'error';
      findings.push({
        level,
        check: 'presence',
        name: group.anyOf.join(' | '),
        message: `MISSING — ${group.label} requires one of these to be set${level === 'warn' ? ` (WARN on ${targetEnv}; hard-fail on production)` : ''}`,
      });
    }
  }
  // ADMIN_MFA_ENFORCED must be exactly 'true' — hard-fail scoped to
  // PRODUCTION only (P4-F0 fold C4, Code Reviewer + GT-7: Spec 113 §3.2's
  // "admins sign in without a second factor" consequence is a prod posture;
  // preview/development enforcing it blocked legitimate non-prod deploys —
  // the same env-scoping pattern DEV_MODE already uses). Off-prod it WARNs.
  if (env.ADMIN_MFA_ENFORCED === 'true') {
    findings.push({ level: 'ok', check: 'presence', name: 'ADMIN_MFA_ENFORCED', message: "=== 'true'" });
  } else {
    findings.push({
      level: targetEnv === 'production' ? 'error' : 'warn',
      check: 'presence',
      name: 'ADMIN_MFA_ENFORCED',
      message:
        `must === 'true' in production (got ${isPresent(env.ADMIN_MFA_ENFORCED) ? 'a non-true value' : 'MISSING'})` +
        (targetEnv === 'production' ? '' : ` — WARN on ${targetEnv}`),
    });
  }

  // (b) DEV_MODE absent/false in production
  if (targetEnv === 'production') {
    for (const name of DEV_MODE_VARS) {
      const val = env[name];
      if (val === undefined || val === '' || val === 'false') {
        findings.push({ level: 'ok', check: 'dev_mode', name, message: 'absent or false' });
      } else {
        findings.push({
          level: 'error',
          check: 'dev_mode',
          name,
          message: 'must be absent or false in production',
        });
      }
    }
  }

  // (c) leaked-secret scan over public vars
  for (const name of Object.keys(env)) {
    if (!isPublicVarName(name)) continue;
    const value = env[name];
    if (!isPresent(value)) continue;
    const { verdict, reason } = classifyPublicVar(name, value);
    if (verdict === 'flag') {
      findings.push({ level: 'error', check: 'leaked_secret', name, message: `${reason} in a public var` });
    } else {
      findings.push({ level: 'ok', check: 'leaked_secret', name, message: reason });
    }
  }

  const ok = !findings.some((f) => f.level === 'error');
  return { ok, targetEnv, findings };
}

/**
 * Resolve the target env label from argv / env. --env= wins, then VERCEL_ENV,
 * then 'production'. An unrecognized value is normalized to 'production' (the
 * safest/strictest posture).
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 */
function resolveTargetEnv(argv, env) {
  let target = null;
  for (const raw of argv) {
    const m = raw.match(/^--env=(.*)$/);
    if (m) target = m[1];
  }
  if (!target) target = env.VERCEL_ENV || 'production';
  return ['production', 'preview', 'development'].includes(target) ? target : 'production';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printReport(result) {
  console.log(`[verify-vercel-env] target env: ${result.targetEnv}`);
  for (const f of result.findings) {
    const tag = f.level === 'error' ? '✗ FAIL' : f.level === 'warn' ? '⚠ warn' : '✓ ok';
    console.log(`  ${tag}  [${f.check}] ${f.name} — ${f.message}`);
  }
  const errors = result.findings.filter((f) => f.level === 'error');
  const warns = result.findings.filter((f) => f.level === 'warn');
  if (result.ok) {
    console.log(
      `[verify-vercel-env] PASS — ${result.findings.length} checks, 0 failures` +
        (warns.length ? ` (${warns.length} warning(s))` : '')
    );
  } else {
    console.error(
      `[verify-vercel-env] FAIL — ${errors.length} finding(s) for env=${result.targetEnv}` +
        (warns.length ? ` (+${warns.length} warning(s))` : '')
    );
  }
}

function run() {
  const targetEnv = resolveTargetEnv(process.argv.slice(2), process.env);
  const result = evaluateEnv(process.env, targetEnv);
  printReport(result);
  process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
  run();
}

module.exports = {
  REQUIRED_PRESENT,
  REQUIRED_GROUPS,
  DEV_MODE_VARS,
  isPresent,
  decodeJwtRole,
  isKnownPublicShape,
  secretShapeReason,
  classifyPublicVar,
  isPublicVarName,
  evaluateEnv,
  resolveTargetEnv,
  run,
};
