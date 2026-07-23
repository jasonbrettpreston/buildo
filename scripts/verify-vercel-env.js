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
 * Five checks (Spec 113 §3 / §3.2 / §5):
 *   (a) PRESENCE — every runtime-critical var is present & non-empty, and
 *       ADMIN_MFA_ENFORCED === 'true' (so prod can never ship green with MFA
 *       inert or the Stripe webhook dead). MFA + the SHOULD-grade Sentry DSN
 *       hard-fail PRODUCTION only, demoting to WARN on preview/development
 *       (P4-F0 fold C4 — the DEV_MODE env-scoping pattern).
 *   (b) DEV_MODE ABSENT/false — in production, DEV_MODE / NEXT_PUBLIC_DEV_MODE
 *       must be absent or explicitly 'false'.
 *   (c) NO LEAKED SECRET (Tier 1, hard-fail EVERY env) — every NEXT_PUBLIC_* /
 *       EXPO_PUBLIC_* var is inspected; a known-public value SHAPE
 *       (sb_publishable_*, the project https URL, a Sentry ingest DSN, a phc_*
 *       PostHog key) is permitted, and ANY OTHER public var whose value matches
 *       a secret shape is FLAGGED (never printing the value): postgres(ql):// or
 *       a password-bearing connection string, a legacy service_role JWT (eyJ…
 *       decoded, role === service_role), an sb_secret_* key, a Stripe secret
 *       (sk_live_/sk_test_/whsec_), or a bare long hex/base64 blob.
 *   (d) NAME ALLOWLIST (Tier 2, P4-hardening H1) — any public-prefixed var
 *       whose NAME is not on PUBLIC_VAR_NAME_ALLOWLIST (nor a platform-injected
 *       NEXT_PUBLIC_VERCEL_* system var) is flagged: `error` on production AND
 *       preview, `warn` on development. Catches novel-format secrets Tier 1's
 *       shape blocklist can't recognize. Both tiers evaluate every public var
 *       INDEPENDENTLY — an unknown-name + secret-shaped var emits TWO findings.
 *       The finding prints the var NAME only, never the value.
 *   (e) PG_POOL_MAX PIN (P4-hardening H4, Spec 113 §5) — must be a plain
 *       integer 1..10 (ruled value 5): `error` on production AND preview
 *       (preview shares the one cloud DB), `warn` on development. A missing/
 *       invalid value makes the runtime silently fall back to the unsafe
 *       single-server default of 20 (src/lib/db/client.ts parsePositiveIntEnv).
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
  // 7th critical (operator-RULED 2026-07-22, twice-raised escalation): the
  // integration-injected server key. §13's documented failure mode is the
  // Vercel↔Supabase integration silently failing to provision keys on
  // asymmetric-JWT (sb_*) projects — absent, the Supabase server factory is
  // dead while the build ships green.
  'SUPABASE_SECRET_KEY',
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
    // POSITIVE shape assertion (operator-RULED 2026-07-22, GT F1 upgrade):
    // presence alone let a WRONGLY-provisioned key pass (the shape scan is a
    // negative blocklist — an anon-role legacy JWT or garbage in the
    // publishable slot isn't secret-shaped, so nothing flagged it). The
    // satisfying value must be sb_publishable_* or an anon-role legacy JWT —
    // the two legitimate forms. Error in EVERY env: a mis-shaped key means
    // auth cannot work anywhere; nothing legitimate is mis-shaped.
    shape: 'publishable',
  },
  { label: 'Sentry DSN', anyOf: ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'], warnOutsideProduction: true },
  // F1g fold (2026-07-23, blind spot exposed by the first preview build):
  // the deployed app's pool ALWAYS targets a non-loopback host, and
  // resolveSslConfig fail-closes without a pinned CA — the build died at
  // collect-page-data with SUPABASE_CA_CERT_PATH unset, and this verifier
  // hadn't asserted it. On Vercel the INLINE form (SUPABASE_CA_CERT, the PEM
  // content) is the correct one — a file path can't be traced into the
  // serverless bundle; the path form remains valid for runner/CI contexts.
  { label: 'Supabase DB CA cert (inline PEM or path)', anyOf: ['SUPABASE_CA_CERT', 'SUPABASE_CA_CERT_PATH'] },
];

// DEV_MODE family — must be absent or 'false' in production (§3.2).
const DEV_MODE_VARS = ['DEV_MODE', 'NEXT_PUBLIC_DEV_MODE'];

const PUBLIC_VAR_PREFIXES = ['NEXT_PUBLIC_', 'EXPO_PUBLIC_'];

// ---------------------------------------------------------------------------
// H1 Tier 2 — public-var NAME allowlist (P4 hardening WF2, 2026-07-22).
// Frozen from the 3-way-verified live census (Integration + Schema-Fidelity +
// Reality-Check): every NEXT_PUBLIC_* name actually read by live src/ code,
// plus the legacy anon-key group member. Names NOT here (and not matching the
// platform prefix below) flag as unknown-name — the tier that catches
// novel-format secrets Tier 1's shape blocklist can't recognize. Drift is
// test-enforced (census-sync + REQUIRED_GROUPS-subset invariants in
// src/tests/verify-vercel-env.logic.test.ts) — add the entry AND the reading
// code in the same commit.
// NB: NEXT_PUBLIC_GOOGLE_MAPS_KEY's 39-char AIza… value narrowly evades the
// 40-char blob regex in secretShapeReason — this name tier is the only check
// that ever sees it (PropertyPhoto.tsx:41).
const PUBLIC_VAR_NAME_ALLOWLIST = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', // legacy group member (REQUIRED_GROUPS)
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_DEV_MODE', // value policed by the dev_mode check, not here
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
];

// Vercel's "Automatically expose System Environment Variables" injects
// NEXT_PUBLIC_VERCEL_URL/_ENV/_GIT_* etc. into every build — platform-owned
// names structurally invisible to any repo grep; never treat as unknown.
const PUBLIC_VAR_NAME_PREFIX_ALLOW = ['NEXT_PUBLIC_VERCEL_'];

// H4 — PG_POOL_MAX pin (Spec 113 §5; ruled value 5, 2026-07-22). Ceiling kept
// as a band (not the ruled value) so the operator can tune 1..10 without a
// code change. Reality-Check's live margin data (2026-07-22): Supavisor's
// EMPIRICAL backend ceiling is ~14-17 (wave-timed), not the raw max_conn=90 —
// max 10 leaves only ~1-2 concurrent Fluid instances of headroom, max 5
// leaves ~3; the current unpinned default of 20 can contend with a SINGLE
// instance. Measured cost of 5 vs 20 on the admin 33-query stats fan-out:
// +1.2-1.4s (~15-18%) on a 7.3-7.7s baseline pool size doesn't move.
const PG_POOL_MAX_PROD_CEILING = 10;

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
 * H1 Tier 2 — is this public-prefixed NAME known? (allowlist ∪ platform
 * prefix carve-out). Pure; case-sensitive by design (env names are
 * case-sensitive on the Linux/Vercel platforms in play).
 * @param {string} name
 */
function isAllowlistedPublicVarName(name) {
  return (
    PUBLIC_VAR_NAME_ALLOWLIST.includes(name) ||
    PUBLIC_VAR_NAME_PREFIX_ALLOW.some((p) => name.startsWith(p))
  );
}

/**
 * The exposure-tier level for exposure-type findings (H1 Tier 2 unknown-name,
 * H4 pool-max): `error` on production AND preview, `warn` on development.
 * A PRINCIPLED deviation from the C4 pattern (which scopes degradation-type
 * findings like a missing Sentry DSN to prod-only hard-fail): preview deploys
 * share the one cloud project and bake NEXT_PUBLIC_* values into durable,
 * immutable bundles at BUILD time — Deployment Protection is a toggle, the
 * artifact is forever — and a preview-scoped var never meets the production
 * tier at all, so warn-off-prod would make that class warn-only permanently
 * (Security F1 ruling, P4 hardening WF2 panel 2026-07-22). `vercel dev`
 * (development) yields no deployed bundle → warn is correct there.
 * @param {'production'|'preview'|'development'} targetEnv
 * @returns {'error'|'warn'}
 */
function exposureLevel(targetEnv) {
  return targetEnv === 'development' ? 'warn' : 'error';
}

/**
 * H4 — classify a PG_POOL_MAX value by MIRRORING the runtime's actual parse
 * semantics (src/lib/db/client.ts parsePositiveIntEnv: parseInt(v,10) — a
 * PREFIX parser — with fallback to 20 unless finite and > 0), so every
 * message tells the truth about what the runtime would really do (Round-2
 * output fold, 5-reviewer message-accuracy converge: '100' and '010' are
 * HONORED by the runtime, not discarded; '5.9'/'7abc'/'1e2' are prefix-
 * mangled to 5/7/1 and honored; only NaN/<=0 genuinely falls back to 20).
 *
 * Statuses: 'ok' (canonical integer within [1, ceiling]) · 'missing' ·
 * 'fallback' (runtime discards → default 20) · 'noncanonical' (runtime
 * prefix-honors an unintended integer) · 'exceeds_ceiling' (honored, over).
 * Everything except 'ok' is a finding at exposureLevel.
 *
 * @param {string|undefined} value
 * @param {number} [ceiling]
 * @returns {{ status: 'ok'|'missing'|'fallback'|'noncanonical'|'exceeds_ceiling', parsed: number|null, message: string }}
 */
function classifyPoolMax(value, ceiling = PG_POOL_MAX_PROD_CEILING) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return {
      status: 'missing',
      parsed: null,
      message: `MISSING — the runtime silently falls back to the unsafe single-server default of 20 (Spec 113 §5; ruled value 5)`,
    };
  }
  const v = String(value).trim();
  const parsed = parseInt(v, 10); // mirror parsePositiveIntEnv exactly
  const runtimeHonors = Number.isFinite(parsed) && parsed > 0;
  if (!runtimeHonors) {
    return {
      status: 'fallback',
      parsed: Number.isFinite(parsed) ? parsed : null,
      message: `unparseable or non-positive — the runtime silently DISCARDS it and falls back to the unsafe default of 20`,
    };
  }
  if (parsed > ceiling) {
    return {
      status: 'exceeds_ceiling',
      parsed,
      message: `honored by the runtime as ${parsed} — exceeds the ceiling of ${ceiling} (ruled value 5; Supavisor's empirical backend ceiling is ~14-17)`,
    };
  }
  if (!/^\d+$/.test(v)) {
    return {
      status: 'noncanonical',
      parsed,
      message: `not a plain integer — the runtime would prefix-parse it and honor ${parsed}; set a clean integer (ruled value 5)`,
    };
  }
  return { status: 'ok', parsed, message: `= ${parsed} (within [1, ${ceiling}])` };
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
      if (group.shape === 'publishable') {
        const v = String(env[satisfiedBy]).trim();
        const validShape = /^sb_publishable_/.test(v) || decodeJwtRole(v) === 'anon';
        findings.push(
          validShape
            ? { level: 'ok', check: 'presence', name: satisfiedBy, message: `present (${group.label}, valid key shape)` }
            : {
                level: 'error',
                check: 'presence',
                name: satisfiedBy,
                message:
                  `WRONGLY PROVISIONED — value is neither an sb_publishable_* key nor an anon-role ` +
                  `legacy JWT (Spec 113 §13 silent key non-provisioning; auth cannot work with this value)`,
              }
        );
      } else {
        findings.push({ level: 'ok', check: 'presence', name: satisfiedBy, message: `present (${group.label})` });
      }
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

  // (c) + (d) — the two-tier public-var scan. BOTH tiers evaluate every
  // public var INDEPENDENTLY (P4 hardening H1, Observability fold): an
  // unknown-name + secret-shaped var emits TWO findings — the Tier-1 error
  // must never be masked by a Tier-2 result, and vice versa.
  for (const name of Object.keys(env)) {
    if (!isPublicVarName(name)) continue;
    const value = env[name];
    // Tier 2 — name allowlist — runs REGARDLESS of value presence (Round-2
    // output fold, Code Reviewer: a present-but-EMPTY unknown name — a
    // blanked-not-deleted leftover or a dashboard stub — is exactly the
    // leftover-retired-config class this tier exists to catch). Message
    // carries the NAME + a fixed reason string, NEVER the value (a
    // novel-format secret would re-leak into retained build logs otherwise —
    // Security F2, test-locked).
    if (!isAllowlistedPublicVarName(name)) {
      findings.push({
        level: exposureLevel(targetEnv),
        check: 'public_var_name',
        name,
        message:
          'name is not on PUBLIC_VAR_NAME_ALLOWLIST — a public var this repo does not know about ' +
          '(possible novel-format secret or leftover retired config); add it to the allowlist in the ' +
          'same PR if legitimate, or delete the var',
      });
    }
    // Tier 1 — secret-shape blocklist (hard-fail every env, unchanged) —
    // needs a value to classify.
    if (!isPresent(value)) continue;
    const { verdict, reason } = classifyPublicVar(name, value);
    if (verdict === 'flag') {
      findings.push({ level: 'error', check: 'leaked_secret', name, message: `${reason} in a public var` });
    } else {
      findings.push({ level: 'ok', check: 'leaked_secret', name, message: reason });
    }
  }

  // (e) PG_POOL_MAX pin (P4 hardening H4, Spec 113 §5).
  const poolMax = classifyPoolMax(env.PG_POOL_MAX);
  if (poolMax.status === 'ok') {
    findings.push({ level: 'ok', check: 'pool_max', name: 'PG_POOL_MAX', message: poolMax.message });
  } else {
    findings.push({ level: exposureLevel(targetEnv), check: 'pool_max', name: 'PG_POOL_MAX', message: poolMax.message });
  }
  // Companion visibility: the WF3 2026-04-10 fence survives the pin only
  // because PG_CONNECTION_TIMEOUT_MS defaults to 10s — surface it when set so
  // a future operator can't shrink both knobs blind (Integration fold).
  if (isPresent(env.PG_CONNECTION_TIMEOUT_MS)) {
    findings.push({
      level: 'ok',
      check: 'pool_max',
      name: 'PG_CONNECTION_TIMEOUT_MS',
      message: `set to ${String(env.PG_CONNECTION_TIMEOUT_MS).trim()}ms — pairs with PG_POOL_MAX (pool waiters queue up to this long; default 10000ms)`,
    });
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
  target = String(target).trim(); // '--env= production' must not silently normalize (Round-2 nit)
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
  PUBLIC_VAR_NAME_ALLOWLIST,
  PUBLIC_VAR_NAME_PREFIX_ALLOW,
  PG_POOL_MAX_PROD_CEILING,
  isPresent,
  decodeJwtRole,
  isKnownPublicShape,
  secretShapeReason,
  classifyPublicVar,
  isPublicVarName,
  isAllowlistedPublicVarName,
  exposureLevel,
  classifyPoolMax,
  evaluateEnv,
  resolveTargetEnv,
  run,
};
