#!/usr/bin/env node
/**
 * scripts/wipe-supabase-auth-state.js
 *
 * SPEC LINK: .cursor/phase1_plan.md Item 7 (Rollback/abort + go/no-go gates)
 *   + docs/adr/007-supabase-auth-uuid-fk.md (the RESTRICT/CASCADE/SET NULL
 *   split this script's behavior must respect).
 *
 * One-off, destructive, human-gated ops script (docs/runbook/README.md
 * "one-off script index" convention — NOT a pipeline chain step). Used to
 * wipe local Supabase auth state on an ABORTED Phase 1 migration attempt,
 * per phase1_plan.md Item 7's two abort states:
 *
 *   - BEFORE migration 229 (D6 uuid/FK conversion) lands: `profiles` and
 *     `entitlements` (if they exist) already carry a real FK to
 *     `auth.users(id) ON DELETE CASCADE`, so a `DELETE FROM auth.users`
 *     alone would already cascade-clean them — this script still runs an
 *     explicit `TRUNCATE profiles, entitlements` FIRST (belt-and-suspenders,
 *     matching the plan's literal wording) before deleting auth.users. The
 *     10 D6 tables are untouched at this point (still Firebase-uid-keyed,
 *     no FK to auth.users yet) — no orphan risk there.
 *
 *   - AFTER migration 229 has landed: `DELETE FROM auth.users` cascades
 *     through the D6 FKs to all 8 CASCADE tables automatically and SETs
 *     NULL on `admin_watchlist.admin_uid` — no manual truncation needed for
 *     those. `admin_audit_log.admin_uid` is the ADR-007 exception: its FK is
 *     `ON DELETE RESTRICT`, not `SET NULL` or `CASCADE` — a bare `DELETE
 *     FROM auth.users` FAILS with a foreign-key violation for any user who
 *     authored an admin_audit_log row, which is CORRECT behavior (an abort
 *     script must not silently erase who-did-what history). This script
 *     detects that failure, reports which admin_uid(s) are blocking the
 *     delete, and STOPS — it does NOT fall back to truncating
 *     admin_audit_log automatically. Truncating that table is a human
 *     decision, made explicitly via --truncate-admin-audit-log (its own
 *     separate confirmation), never a silent side effect of an unrelated
 *     auth-state wipe.
 *
 * LOCAL STACK ONLY — this script refuses to run against a non-local target
 * unless explicitly overridden (same guard as bootstrap-first-admin.js).
 * Firebase env vars are never touched by this script (Firebase-side state
 * was never migrated, per Item 7 — only the Supabase side needs wiping).
 *
 * Usage:
 *   node -r dotenv/config scripts/wipe-supabase-auth-state.js --confirm
 *   node -r dotenv/config scripts/wipe-supabase-auth-state.js --confirm --truncate-admin-audit-log
 *
 * Flags:
 *   --confirm                     required; refuses to run without it.
 *   --truncate-admin-audit-log    explicit, separate opt-in to truncate
 *                                 admin_audit_log FIRST when the plain
 *                                 DELETE FROM auth.users is blocked by its
 *                                 RESTRICT FK. Never implied by --confirm
 *                                 alone.
 *
 * Env vars:
 *   DATABASE_URL / PG_*          (REQUIRED) same contract as scripts/migrate.js.
 *                                **No default.** This previously read
 *                                "defaults to the local stack" — i.e.
 *                                127.0.0.1:54322/postgres, a default that
 *                                already pointed at the AUTHORITATIVE DB, so
 *                                its retirement is ADDITIONAL to the P0 defect
 *                                (Spec 122 §P0, 2026-08-23). Deliberate
 *                                trade-off: one resolver with one rule, rather
 *                                than a per-script allow-list of defaults that
 *                                happen to be right today. Run with
 *                                `node -r dotenv/config` to restore zero-config.
 *   WIPE_ALLOW_REMOTE=1          required to proceed if the resolved DB
 *                                host does not look local.
 */
'use strict';

const { createResolvedPool } = require('./lib/resolve-db');

const ADMIN_AUDIT_LOG_RESTRICT_SQLSTATE = '23503'; // foreign_key_violation

/**
 * Pure arg/env resolution — no DB access, unit-testable.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ confirmed: boolean, truncateAdminAuditLog: boolean, isLocal: boolean, allowRemote: boolean }}
 */
function resolveOptions(argv, env) {
  const confirmed = argv.includes('--confirm');
  const truncateAdminAuditLog = argv.includes('--truncate-admin-audit-log');

  const host =
    env.PG_HOST ||
    (env.DATABASE_URL ? safeHostFromConnectionString(env.DATABASE_URL) : '127.0.0.1');
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  const allowRemote = env.WIPE_ALLOW_REMOTE === '1';

  return { confirmed, truncateAdminAuditLog, isLocal, allowRemote };
}

/**
 * @param {string} connectionString
 * @returns {string}
 */
function safeHostFromConnectionString(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
}

/**
 * Same DB-connection contract as scripts/migrate.js / bootstrap-first-admin.js.
 * @returns {import('pg').Pool}
 */
function createDbPool() {
  return createResolvedPool({ label: 'wipe-supabase-auth-state' });
}

async function tableExists(pool, tableName) {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [
    `public.${tableName}`,
  ]);
  return rows[0].exists;
}

async function main() {
  const options = resolveOptions(process.argv.slice(2), process.env);

  if (!options.isLocal && !options.allowRemote) {
    throw new Error(
      'wipe-supabase-auth-state.js refuses to run against a non-local target. ' +
        'This script is LOCAL-stack only per phase1_plan.md Item 7 — do NOT run it ' +
        'against the cloud project. Set WIPE_ALLOW_REMOTE=1 only if you have ' +
        'deliberately reviewed this against a non-local target.',
    );
  }

  if (!options.confirmed) {
    throw new Error(
      'Refusing to run without --confirm. This is a destructive wipe of Supabase ' +
        'auth state (auth.users + everything FK-CASCADE/SET NULL-linked to it). ' +
        'Re-run with --confirm once you have reviewed phase1_plan.md Item 7.',
    );
  }

  const pool = createDbPool();
  try {
    // Explicit TRUNCATE of profiles/entitlements first (belt-and-suspenders
    // — see header; a no-op if 226/228 haven't landed yet, or if the FK
    // cascade from auth.users would have caught them anyway).
    const profilesExists = await tableExists(pool, 'profiles');
    const entitlementsExists = await tableExists(pool, 'entitlements');
    const toTruncate = [];
    if (entitlementsExists) toTruncate.push('entitlements');
    if (profilesExists) toTruncate.push('profiles');
    if (toTruncate.length > 0) {
      await pool.query(`TRUNCATE ${toTruncate.join(', ')}`);
      console.log(`Truncated: ${toTruncate.join(', ')}`);
    } else {
      console.log('Neither profiles nor entitlements exist yet — nothing to truncate there.');
    }

    if (options.truncateAdminAuditLog) {
      // Separate, explicit opt-in ONLY — never a silent side effect of
      // --confirm alone (see header).
      const auditExists = await tableExists(pool, 'admin_audit_log');
      if (auditExists) {
        await pool.query('TRUNCATE admin_audit_log');
        console.log(
          'Truncated admin_audit_log (explicit --truncate-admin-audit-log opt-in).',
        );
      }
    }

    // DELETE FROM auth.users — cascades through D6 FKs (post-229) to the 8
    // CASCADE tables and SETs NULL on admin_watchlist.admin_uid
    // automatically. admin_audit_log's RESTRICT FK (ADR-007) will abort
    // this statement with a foreign-key violation if any remaining
    // auth.users row authored an admin_audit_log entry and
    // --truncate-admin-audit-log was not passed — that is CORRECT
    // behavior, not a bug in this script.
    try {
      const result = await pool.query('DELETE FROM auth.users');
      console.log(`Deleted ${result.rowCount} row(s) from auth.users.`);
    } catch (err) {
      if (err && err.code === ADMIN_AUDIT_LOG_RESTRICT_SQLSTATE) {
        console.error('');
        console.error(
          '  DELETE FROM auth.users was BLOCKED by a RESTRICT foreign key — almost ' +
            'certainly admin_audit_log.admin_uid (ADR-007: audit-log rows must always ' +
            'name their actor, so this FK is RESTRICT, never SET NULL/CASCADE).',
        );
        console.error(
          '  This is a human decision, not something this script resolves ' +
            'automatically. Options:',
        );
        console.error(
          '    1. Re-run with --truncate-admin-audit-log if you have deliberately ' +
            'decided to discard the audit trail for this abort.',
        );
        console.error(
          '    2. Query admin_audit_log for the blocking admin_uid(s) and decide ' +
            'per-row (scrub_admin_audit_for_target from migration 217, or a manual ' +
            'DELETE of only the rows tied to this abort).',
        );
        console.error('');
        throw new Error('Blocked by admin_audit_log RESTRICT FK — see guidance above.');
      }
      throw err;
    }
  } finally {
    await pool.end();
  }

  console.log('Done.');
}

module.exports = { resolveOptions, createDbPool, ADMIN_AUDIT_LOG_RESTRICT_SQLSTATE };

if (require.main === module) {
  main().catch((err) => {
    console.error('wipe-supabase-auth-state.js FAILED:', err.message || err);
    process.exitCode = 1;
  });
}
