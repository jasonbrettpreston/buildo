// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.10 (last_heartbeat_at, Consumer)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.4 (A3 — Step-0 reconcile,
//   the SIBLING reaper this same-shaped test file's precedent, src/tests/db/reconcile-runs.db.test.ts)
//
// Real-DB integration tests for src/lib/admin/reap-stale-runs.ts's reapStaleRunningRows() — the
// admin stats page's own "auto-fail orphaned running rows" reaper (extracted out of
// src/app/api/admin/stats/route.ts's GET handler at pilot 9 commit 8 P5(d) specifically so it
// could be independently DB-tested, since a route.ts file's own generated Next.js type-check
// restricts it to the HTTP-method/config export allowlist).
//
// BOTH DIRECTIONS, per Spec 48 §3.10's own "Consumer: none yet" gap this peel closes:
//   1. a running row with a RECENT heartbeat (< 30 min) survives, even with started_at
//      hours in the past — the deliverable this peel adds
//   2. a running row with a STALE heartbeat (> 30 min) IS reaped
//   3. a running row with NO heartbeat at all follows the ORIGINAL 2-hour started_at rule,
//      unchanged in both directions (still reaped past 2h; still survives under 2h) — the
//      widening must not narrow what the pre-existing rule already reaped
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/admin-stats-reaper.db.test.ts

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { reapStaleRunningRows } from '@/lib/admin/reap-stale-runs';

const pool = getTestPool();

/** Fixture prefix — every seeded pipeline_runs row is deleted by prefix. */
const FX = 'ADMIN_REAP_FX';

describe.skipIf(!dbAvailable())('reapStaleRunningRows — the admin stats page reaper (Spec 48 §3.10)', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run — there a missing pool means silently
    // registering zero tests. In a plain `npm run test` this is the designed skip.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (the reconcile-runs.db.test.ts precedent) ──
  // This suite REWRITES pipeline_runs statuses (including via reapStaleRunningRows()'s own
  // unscoped `WHERE status = 'running'`), so it refuses anything but an explicit opt-in on
  // a loopback host — an ambient DATABASE_URL alone is NOT sufficient.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to mutate an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'admin-stats-reaper.db.test.ts rewrites pipeline_runs statuses. Refusing to run without an ' +
        'explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to mutate pipeline_runs on non-loopback host "${dbUrl.hostname}".`);
  }

  /** @param heartbeatMinutesAgo - null = no records_meta.last_heartbeat_at key at all. */
  async function seedRun(suffix: string, startedMinutesAgo: number, heartbeatMinutesAgo: number | null): Promise<number> {
    const recordsMeta = heartbeatMinutesAgo === null
      ? null
      : { last_heartbeat_at: new Date(Date.now() - heartbeatMinutesAgo * 60_000).toISOString() };
    const res = await pool!.query<{ id: number }>(
      `INSERT INTO pipeline_runs (pipeline, started_at, status, records_meta)
       VALUES ($1, NOW() - ($2 * INTERVAL '1 minute'), 'running', $3::jsonb)
       RETURNING id`,
      [`${FX}:${suffix}`, startedMinutesAgo, recordsMeta === null ? null : JSON.stringify(recordsMeta)],
    );
    return res.rows[0]!.id;
  }

  async function statusOf(id: number): Promise<string> {
    const res = await pool!.query<{ status: string }>(`SELECT status FROM pipeline_runs WHERE id = $1`, [id]);
    return res.rows[0]!.status;
  }

  beforeEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}:%`]);
    // Deterministic baseline: park any OTHER `running` row so this suite's own reap only
    // ever touches its own fixtures. Safe only because of the loopback + opt-in guard above.
    await pool!.query(
      `UPDATE pipeline_runs SET status = 'completed', completed_at = NOW()
        WHERE status = 'running' AND pipeline NOT LIKE $1`,
      [`${FX}:%`],
    );
  });

  afterAll(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}:%`]);
    await pool!.end();
  });

  it('a RECENT heartbeat (10 min ago) survives, even with started_at 5 hours in the past — the deliverable', async () => {
    const id = await seedRun('fresh-heartbeat-old-start', 300, 10);
    await reapStaleRunningRows();
    expect(await statusOf(id), 'a genuinely progressing run must not be reaped out from under it').toBe('running');
  });

  it('a STALE heartbeat (45 min ago) IS reaped, even though 45 min alone is well under the 2-hour started_at rule', async () => {
    const id = await seedRun('stale-heartbeat-recent-start', 50, 45);
    await reapStaleRunningRows();
    expect(await statusOf(id), 'a heartbeat that stopped 45 minutes ago means the run is genuinely stuck').toBe('failed');
  });

  it('NO heartbeat at all: started_at 3 hours ago IS reaped — the ORIGINAL 2-hour rule, unchanged', async () => {
    const id = await seedRun('no-heartbeat-old', 180, null);
    await reapStaleRunningRows();
    expect(await statusOf(id)).toBe('failed');
  });

  it('NO heartbeat at all: started_at 30 minutes ago survives — the ORIGINAL 2-hour rule, unchanged (not narrowed)', async () => {
    const id = await seedRun('no-heartbeat-fresh', 30, null);
    await reapStaleRunningRows();
    expect(await statusOf(id)).toBe('running');
  });

  it('sets completed_at and the stale-run error_message on a genuinely reaped row', async () => {
    const id = await seedRun('reaped-fields', 180, null);
    await reapStaleRunningRows();
    const res = await pool!.query<{ status: string; completed_at: Date | null; error_message: string | null }>(
      `SELECT status, completed_at, error_message FROM pipeline_runs WHERE id = $1`,
      [id],
    );
    const row = res.rows[0]!;
    expect(row.status).toBe('failed');
    expect(row.completed_at).not.toBeNull();
    expect(row.error_message).toMatch(/stale run auto-cleaned/i);
  });
});
