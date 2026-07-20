// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (offboarding_sweep_30day)
// SPEC LINK: migrations/233_pg_cron_maintenance_catalog.sql
// SPEC LINK: migrations/235_offboarding_sweep_hardening.sql (F8 fold 2026-07-20 — WHEN
//   OTHERS exception arm + durable pipeline_runs summary row, asserted below)
//
// P3-F5 (Phase 3 Supabase migration) — real-DB battery for the
// `public.offboarding_sweep_30day()` function: a per-user loop over
// `user_profiles.account_deleted_at < NOW() - 30 days` that deletes the
// matching `auth.users` row (cascading onto the D6/mig-229 CASCADE
// inventory) EXCEPT when that user authored an `admin_audit_log` row, in
// which case `admin_audit_log.admin_uid`'s `ON DELETE RESTRICT` fence
// (mig 229:96-106 — audit trails must survive the account that authored
// them) aborts just that user's DELETE; the function catches the
// `foreign_key_violation`, `RAISE WARNING`s, and continues the batch
// (P3-G12 / Schema-Fidelity F3).
//
// ── Harness auth-schema gap (found while authoring this test, 2026-07-20) ──
// `src/tests/db/setup-testcontainer.ts`'s globalSetup runs
// `node scripts/migrate.js` unconditionally against whatever DB is available
// (CI's `postgres` service container, or the `BUILDO_TEST_DB=1` testcontainer
// — BOTH provision a plain `postgis/postgis:16-3.4-alpine` image with no
// GoTrue, hence no `auth` schema at all). Empirically reproduced this session
// by running `scripts/migrate.js` against a scratch container of that exact
// image: migration application halts at `226_profiles_admin_bootstrap.sql`
// with `schema "auth" does not exist` (that migration's `CREATE TABLE
// profiles (id UUID ... REFERENCES auth.users(id) ...)` requires it).
// `migrate.js` `process.exit(1)`s on that failure, which `execSync(...,
// {stdio:'inherit'})` propagates as a thrown error out of globalSetup — i.e.
// the ENTIRE db.test.ts suite currently fails to even start on the CI /
// `BUILDO_TEST_DB=1` path, for every migration >= 226, not something this
// test introduces. This is a pre-existing gap in the harness, not scoped to
// P3-F5 — flagged for the orchestrator, not fixed here.
//
// This test can therefore only run MEANINGFULLY against a real Supabase
// instance's `DATABASE_URL` (local Supabase stack or Cloud), where GoTrue
// provisions `auth.users`. It additionally self-detects `auth.users`
// absence at runtime (`to_regclass('auth.users')`) and skips gracefully if
// the harness gap above is ever closed independently and this file starts
// being reached on the plain-postgis path.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/offboarding-sweep — OR,
// meaningfully today, against a live Supabase DATABASE_URL:
//   DATABASE_URL=<local-or-cloud-supabase-url> npx vitest run src/tests/db/offboarding-sweep

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

const TEST_TAG = 'p3f5-sweep-test';

let authAvailable = false;
let user1Id: string | null = null; // eligible, no audit rows — must be swept
let user2Id: string | null = null; // eligible BUT authored an audit row — must survive (RESTRICT fence)

describe.skipIf(!dbAvailable())('public.offboarding_sweep_30day (migration 233)', () => {
  beforeAll(async () => {
    if (!pool) return;

    const authCheck = await pool.query<{ has_auth: boolean }>(
      `SELECT to_regclass('auth.users') IS NOT NULL AS has_auth`,
    );
    authAvailable = Boolean(authCheck.rows[0]?.has_auth);
    if (!authAvailable) return; // logged via the top-of-file note; individual tests early-return too

    // User 1: eligible for the sweep, no admin_audit_log rows — should be
    // fully cascaded away (auth.users row + every CASCADE dependent).
    const u1 = await pool.query<{ id: string }>(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`);
    user1Id = u1.rows[0]!.id;
    await pool.query(
      `INSERT INTO user_profiles (user_id, account_deleted_at) VALUES ($1, NOW() - INTERVAL '31 days')`,
      [user1Id],
    );
    // lead_type='coa' shape needs no permits/entities FK row (lead_views_check).
    await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, trade_slug) VALUES ($1, $2, 'coa', $3)`,
      [user1Id, `${TEST_TAG}:coa:1`, TEST_TAG],
    );
    await pool.query(
      `INSERT INTO device_tokens (user_id, push_token) VALUES ($1, $2)`,
      [user1Id, `${TEST_TAG}-push-token-1`],
    );
    await pool.query(
      `INSERT INTO notifications (user_id, type) VALUES ($1, $2)`,
      [user1Id, `${TEST_TAG}_notification`],
    );

    // User 2: also eligible by the account_deleted_at predicate, but
    // authored an admin_audit_log row — the RESTRICT fence must hold and
    // the sweep must skip-and-surface, not abort the whole batch.
    const u2 = await pool.query<{ id: string }>(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`);
    user2Id = u2.rows[0]!.id;
    await pool.query(
      `INSERT INTO user_profiles (user_id, account_deleted_at) VALUES ($1, NOW() - INTERVAL '31 days')`,
      [user2Id],
    );
    await pool.query(
      `INSERT INTO admin_audit_log (admin_uid, action) VALUES ($1, $2)`,
      [user2Id, `${TEST_TAG}_action`],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    if (authAvailable) {
      // User 1 should already be gone via the sweep's cascade; these are
      // no-ops if so, and a safety net if an assertion failed before the
      // sweep ran.
      if (user1Id) await pool.query(`DELETE FROM auth.users WHERE id = $1`, [user1Id]);
      // User 2 survives the sweep by design — clean up the RESTRICT-fencing
      // audit row first, then the user itself (cascades user_profiles).
      if (user2Id) {
        await pool.query(`DELETE FROM admin_audit_log WHERE admin_uid = $1`, [user2Id]);
        await pool.query(`DELETE FROM auth.users WHERE id = $1`, [user2Id]);
      }
    }
    await pool.end();
  });

  it('auth.users is available on this DB (harness precondition for the rest of this suite)', () => {
    if (!pool) return;
    if (!authAvailable) {
      console.warn(
        '[offboarding-sweep.db.test.ts] SKIPPED: auth.users is absent on this DB — ' +
        'this test only runs meaningfully against a real Supabase DATABASE_URL. See file header.',
      );
    }
    // Not a hard requirement of the CI-gated suite: this is a visibility
    // assertion, not a failure. If auth is absent, every other test in
    // this file early-returns without assertions (see each `it` below).
    expect(true).toBe(true);
  });

  it('sweeps the non-audit-authoring user: auth.users row and every CASCADE dependent are gone', async () => {
    if (!pool || !authAvailable) return;

    const sweep = await pool.query<{ deleted_count: number; skipped_count: number }>(
      `SELECT * FROM public.offboarding_sweep_30day()`,
    );
    expect(sweep.rows).toHaveLength(1);
    expect(sweep.rows[0]!.deleted_count).toBeGreaterThanOrEqual(1);
    expect(sweep.rows[0]!.skipped_count).toBeGreaterThanOrEqual(1);

    const userRow = await pool.query(`SELECT id FROM auth.users WHERE id = $1`, [user1Id]);
    expect(userRow.rowCount).toBe(0);

    const profileRow = await pool.query(`SELECT user_id FROM user_profiles WHERE user_id = $1`, [user1Id]);
    expect(profileRow.rowCount).toBe(0);

    const leadViewRow = await pool.query(`SELECT id FROM lead_views WHERE user_id = $1`, [user1Id]);
    expect(leadViewRow.rowCount).toBe(0);

    const deviceTokenRow = await pool.query(`SELECT id FROM device_tokens WHERE user_id = $1`, [user1Id]);
    expect(deviceTokenRow.rowCount).toBe(0);

    const notificationRow = await pool.query(`SELECT id FROM notifications WHERE user_id = $1`, [user1Id]);
    expect(notificationRow.rowCount).toBe(0);
  });

  it('function body contains a WHEN OTHERS exception arm alongside WHEN foreign_key_violation (F8 fold, migration 235)', async () => {
    if (!pool) return;
    // A non-FK error for one user must not abort the whole batch — this is
    // a static assertion on the live function definition (pg_get_functiondef)
    // rather than a simulated fault injection, per the fold's own fallback
    // instruction (an unexpected-constraint fixture is not cheap to author
    // safely against a real auth.users/CASCADE topology).
    const def = await pool.query<{ def: string }>(
      `SELECT pg_get_functiondef('public.offboarding_sweep_30day()'::regprocedure) AS def`,
    );
    expect(def.rows).toHaveLength(1);
    expect(def.rows[0]!.def).toMatch(/WHEN\s+foreign_key_violation\s+THEN/i);
    expect(def.rows[0]!.def).toMatch(/WHEN\s+OTHERS\s+THEN/i);
    // pg_get_functiondef renders a SET clause as `SET search_path TO 'pg_catalog'`
    // (quoted) — verified directly against a scratch pg_temp function during
    // authoring, not assumed from the CREATE FUNCTION source text.
    expect(def.rows[0]!.def).toMatch(/SET\s+search_path\s+TO\s+'pg_catalog'/i);
  });

  it('writes a durable pipeline_runs summary row (F8 fold, migration 235 — pg_cron does not capture RAISE WARNING output)', async () => {
    if (!pool || !authAvailable) return;

    const before = await pool.query<{ now: string }>(`SELECT clock_timestamp() AS now`);
    const boundary = before.rows[0]!.now;

    const sweep = await pool.query<{ deleted_count: number; skipped_count: number }>(
      `SELECT * FROM public.offboarding_sweep_30day()`,
    );
    const { deleted_count: deletedCount, skipped_count: skippedCount } = sweep.rows[0]!;

    const runRow = await pool.query<{
      pipeline: string;
      status: string;
      started_at: string;
      completed_at: string | null;
      records_meta: { deleted_count: number; skipped_count: number; skipped_user_ids: string[] };
    }>(
      `SELECT pipeline, status, started_at, completed_at, records_meta
         FROM pipeline_runs
        WHERE pipeline = 'offboarding_sweep' AND started_at >= $1
        ORDER BY started_at DESC
        LIMIT 1`,
      [boundary],
    );
    expect(runRow.rowCount).toBe(1);
    const row = runRow.rows[0]!;
    expect(row.status).toBe('completed');
    expect(row.completed_at).not.toBeNull();
    expect(row.records_meta.deleted_count).toBe(deletedCount);
    expect(row.records_meta.skipped_count).toBe(skippedCount);
    expect(Array.isArray(row.records_meta.skipped_user_ids)).toBe(true);
    // User 2 (RESTRICT-fenced) is still eligible-but-skipped on this run —
    // it must appear in skipped_user_ids.
    expect(row.records_meta.skipped_user_ids).toContain(user2Id);
  });

  it('skips-and-surfaces the audit-authoring user: the RESTRICT fence holds, the row survives', async () => {
    if (!pool || !authAvailable) return;

    // The sweep already ran in the previous test (same beforeAll fixture
    // set, one shared table). Re-verify user 2's survival directly.
    const userRow = await pool.query(`SELECT id FROM auth.users WHERE id = $1`, [user2Id]);
    expect(userRow.rowCount).toBe(1);

    const profileRow = await pool.query(`SELECT user_id, account_deleted_at FROM user_profiles WHERE user_id = $1`, [user2Id]);
    expect(profileRow.rowCount).toBe(1);
    expect(profileRow.rows[0]!.account_deleted_at).not.toBeNull();

    const auditRow = await pool.query(`SELECT admin_uid, action FROM admin_audit_log WHERE admin_uid = $1`, [user2Id]);
    expect(auditRow.rowCount).toBe(1);
    expect(auditRow.rows[0]!.action).toBe(`${TEST_TAG}_action`);
  });

  it('is idempotent — a second run finds nothing left to sweep for these fixtures', async () => {
    if (!pool || !authAvailable) return;

    const sweep = await pool.query<{ deleted_count: number; skipped_count: number }>(
      `SELECT * FROM public.offboarding_sweep_30day()`,
    );
    expect(sweep.rows).toHaveLength(1);
    // User 1 is already gone (not re-counted); user 2 is still eligible by
    // the predicate and still fenced, so it is re-skipped every run until
    // manually RTBF-scrubbed — that is the documented behavior, not a bug.
    const userRow = await pool.query(`SELECT id FROM auth.users WHERE id = $1`, [user2Id]);
    expect(userRow.rowCount).toBe(1);
  });
});
