#!/usr/bin/env node
/**
 * scripts/bootstrap-first-admin.js
 *
 * SPEC LINK: .cursor/phase1_plan.md Item 3 (P1-F3a, "Bootstrap seed mechanism
 *   — REDESIGNED") + docs/adr/007-supabase-auth-uuid-fk.md +
 *   migrations/226_profiles_admin_bootstrap.sql.
 *
 * One-off, service-role-only ops script (docs/runbook/README.md "one-off
 * script index" convention — NOT a pipeline chain step, no manifest entry,
 * not registered in scripts/manifest.json).
 *
 * WHY this exists (the redesign, not the original plan): the original
 * design waited for the operator's own first PUBLIC sign-in, then matched
 * their `profiles` row by bare email. That design leaves a race window —
 * between migration 226 landing and the operator's first sign-in, ANY
 * visitor who controls (or first authenticates as) the operator's exact
 * email address can sign up FIRST and occupy the identity, and would then
 * legitimately BE the row this script promotes to `is_admin=true`. This
 * script instead PROVISIONS the operator's `auth.users` row directly via
 * the service-role Admin API — never raced through public signup — and
 * matches the promotion UPDATE by the `id` the Admin API just returned,
 * NOT by email (an email-lookup match reopens exactly the squatting risk
 * being closed here).
 *
 * Sequence:
 *   1. `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true })`
 *      — no email-verification race either; the operator's identity is
 *      established by this script running with service-role trust, not by
 *      racing a public form. `handle_new_user`'s trigger (migration 226)
 *      fires on the INSERT into auth.users, creating the `profiles` row
 *      automatically (same as any signup).
 *   2. `UPDATE profiles SET is_admin = true ... WHERE id = $1 AND is_admin
 *      = false` — matched by the id the Admin API just returned.
 *   3. `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })`
 *      — the operator sets their own password afterward via this
 *      out-of-band link. This script never handles or stores a plaintext
 *      password. NOTE: `generateLink` only GENERATES the link — it does NOT
 *      send an email itself (verified against the GoTrue Admin API
 *      `/admin/generate_link` contract before writing this; that is
 *      `resetPasswordForEmail`'s job, a client-facing call this
 *      service-role script deliberately does not use). This script prints
 *      the `action_link` to stdout for the operator to deliver out-of-band.
 *
 * Recovery if this script fails or is skipped: the exact same two-step
 * sequence (create-if-absent, then promote) can be run manually via the
 * Supabase dashboard/Admin API — this is documented recovery, not a
 * lockout. This script is NOT idempotent by design: re-running it after a
 * successful run will fail at `createUser` (email already registered),
 * which is the expected signal to fall back to the manual recovery path
 * rather than an error this script silently works around.
 *
 * LOCAL STACK ONLY — do NOT run against the cloud project (phase1_plan.md
 * P1-F3a's go/no-go gate is scoped to local-stack verification only).
 * Deliberately does NOT read `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY`
 * — those are the CLOUD project's vars (Spec 113 §3) and are already bound
 * to the cloud project in this repo's `.env`; reusing them here would
 * silently point this one-off script at production. This script reads its
 * own dedicated env vars instead, with a hardcoded LOCAL default for the
 * URL only (never for the secret key).
 *
 * Usage:
 *   node -r dotenv/config scripts/bootstrap-first-admin.js
 *
 * Env vars:
 *   BOOTSTRAP_ADMIN_EMAIL       (required) — the operator's own email.
 *                                 Never hardcoded in this file.
 *   SUPABASE_URL                (optional) — default 'http://127.0.0.1:54321'
 *                                 (the local `supabase start` stack).
 *   SUPABASE_SERVICE_ROLE_KEY   (required) — the local stack's service-role
 *                                 key. Run `supabase status` and use the
 *                                 printed SERVICE_ROLE_KEY (legacy JWT form)
 *                                 or SECRET_KEY (sb_secret_... form) value.
 *                                 No default is hardcoded here on purpose —
 *                                 this file must not carry key material.
 *   DATABASE_URL / PG_*         (REQUIRED) — same contract as
 *                                 scripts/migrate.js. **No default.** This
 *                                 previously read "(optional) — defaults to
 *                                 the local stack's DB (127.0.0.1:54322)".
 *                                 That default already pointed at the
 *                                 AUTHORITATIVE stack, so retiring it is an
 *                                 ADDITIONAL loss beyond the P0 defect
 *                                 (Spec 122 §P0, 2026-08-23): the zero-config
 *                                 convenience is gone. Deliberate trade-off —
 *                                 one resolver with one rule beats a
 *                                 per-script allow-list of "which defaults
 *                                 happen to be correct today", which is
 *                                 exactly the state that let 24 scripts drift
 *                                 onto the pre-cutover DB unnoticed. Run with
 *                                 `node -r dotenv/config` (the repo .env
 *                                 carries the target) to restore it.
 *   BOOTSTRAP_ALLOW_REMOTE=1    — required to proceed if SUPABASE_URL does
 *                                 not resolve to localhost/127.0.0.1. Not
 *                                 set by default — the script refuses a
 *                                 non-local target otherwise.
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('./lib/resolve-db');

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

/**
 * Pure config resolution — no network/DB access, so this is unit-testable
 * without a live stack. Throws a descriptive Error on any missing/unsafe
 * input rather than proceeding with a guessed default for anything secret.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ supabaseUrl: string, serviceRoleKey: string, adminEmail: string }}
 */
function resolveConfig(env) {
  const supabaseUrl = env.SUPABASE_URL || LOCAL_SUPABASE_URL;
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl);
  if (!isLocal && env.BOOTSTRAP_ALLOW_REMOTE !== '1') {
    throw new Error(
      `bootstrap-first-admin.js refuses to run against a non-local SUPABASE_URL ` +
        `(${supabaseUrl}). This script is LOCAL-stack only per phase1_plan.md ` +
        `P1-F3a — do NOT run it against the cloud project. Set ` +
        `BOOTSTRAP_ALLOW_REMOTE=1 only if you have deliberately reviewed this ` +
        `against a non-local target.`,
    );
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required. For the local stack, run ' +
        '`supabase status` and use the printed SERVICE_ROLE_KEY (or SECRET_KEY, ' +
        'sb_secret_... form) value — never NEXT_PUBLIC_SUPABASE_URL/' +
        'SUPABASE_SECRET_KEY from .env, which are bound to the CLOUD project.',
    );
  }

  const adminEmail = env.BOOTSTRAP_ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL is required (the operator's own email — never " +
        'hardcoded in this script).',
    );
  }

  return { supabaseUrl, serviceRoleKey, adminEmail };
}

/**
 * Same DB-connection contract as scripts/migrate.js (Spec 113 §4.1 —
 * resolveSslConfig is the only place an `ssl` config is constructed),
 * defaulting to the local stack so this script always writes to whichever
 * Postgres migrate.js just applied migration 226 to.
 * @returns {import('pg').Pool}
 */
function createDbPool() {
  return createResolvedPool({ label: 'bootstrap-first-admin' });
}

async function main() {
  const config = resolveConfig(process.env);

  console.log(`Provisioning operator account: ${config.adminEmail}`);
  console.log(`Target Supabase Auth: ${config.supabaseUrl}`);

  const supabaseAdmin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1 — provision auth.users directly (never a public-signup race).
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: config.adminEmail,
    email_confirm: true,
  });
  if (createError) {
    // Do not silently continue on a create failure — see this file's header
    // for why this script is deliberately non-idempotent (re-running after
    // a successful prior run is expected to fail here with "already
    // registered"; that is the signal to fall back to manual recovery).
    throw createError;
  }
  const userId = createData.user.id;
  console.log(`Created auth.users row: id=${userId}`);

  // Step 2 — promote via the id the Admin API just returned, NOT an email
  // lookup (an email-lookup match reopens the squatting risk this redesign
  // closes — see header). handle_new_user's trigger (migration 226) has
  // already inserted the profiles row by the time this UPDATE runs.
  const pool = createDbPool();
  try {
    // Parameterized timestamp (not a SQL clock call): §R3.5's sql-now footgun
    // gate is file-scoped; a one-shot operator CLI has no pipeline SDK pool to
    // source getDbTimestamp from, and a JS-clock param is exact enough for a
    // single idempotent promotion (this script is in the eslint operator-CLI
    // exemption block, same as migrate.js/restore-db.js).
    const result = await pool.query(
      `UPDATE profiles SET is_admin = true, updated_at = $2
       WHERE id = $1 AND is_admin = false
       RETURNING id`,
      [userId, new Date().toISOString()],
    );
    if (result.rowCount === 0) {
      console.warn(
        `Promotion UPDATE affected 0 rows for id=${userId} — already admin, or the ` +
          `profiles row is missing (handle_new_user trigger may not have fired). ` +
          `Investigate before re-running.`,
      );
    } else {
      console.log(`Promoted profiles.is_admin=true for id=${userId} (1 row).`);
    }
  } finally {
    await pool.end();
  }

  // Step 3 — out-of-band password-set link. This script never handles or
  // stores a plaintext password.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: config.adminEmail,
  });
  if (linkError) {
    throw linkError;
  }
  // NOTE: auth.admin.generateLink() only GENERATES the link — it does NOT
  // dispatch an email itself (that is `resetPasswordForEmail`'s job, a
  // client-facing call this service-role script deliberately does not use).
  // Verified against the GoTrue Admin API contract (`/admin/generate_link`)
  // via Context7 before writing this — do not assume an email was sent.
  console.log(
    'Recovery (password-set) link generated (generateLink does NOT send email itself ' +
      '— deliver this link to the operator out-of-band, e.g. paste it directly):',
  );
  if (linkData && linkData.properties && linkData.properties.action_link) {
    console.log(`  action_link: ${linkData.properties.action_link}`);
  }

  console.log('Done.');
}

module.exports = { resolveConfig, createDbPool, LOCAL_SUPABASE_URL };

if (require.main === module) {
  main().catch((err) => {
    console.error('bootstrap-first-admin.js FAILED:', err.message || err);
    process.exitCode = 1;
  });
}
