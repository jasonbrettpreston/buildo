// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.4 (A3 — Step-0 reconcile)
// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b (`crashed` ≠ `failed`)
//
// Real-DB integration tests for scripts/reconcile-runs.js — the ONE writer of
// `pipeline_runs.status = 'crashed'`.
//
// RED-FIRST, and the red is meaningful: before this step existed, a `running` row
// left behind by a dead process stayed `running` forever unless a human loaded the
// admin stats page (src/app/api/admin/stats/route.ts:188-199), which then wrote
// `failed` — conflating "died" with "ran and lost". 19 rows sat that way for
// months. Case 1 below is exactly that row, and it must come back `crashed`.
//
// The cases, and why each exists:
//   1. a stale `running` row is reaped to `crashed`           — the deliverable
//   2. `crashed`, NOT `failed`                                — §3.2b, the whole distinction
//   3. a FRESH `running` row survives                         — the fence: reconcile's own
//                                                               in-chain row is seconds old
//   4. the report prints when there is nothing to reap        — claim #85
//   5. the threshold is honoured                              — the one knob, both directions
//   6. published_batch_rollback reports `not_armed`           — §7.4's ownerless half, visible
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/reconcile-runs.db.test.ts

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/reconcile-runs.js');

/** Fixture prefix — every seeded pipeline_runs row is deleted by prefix. */
const FX = 'RECONCILE_FX';

interface AuditRow {
  metric: string;
  value: unknown;
  threshold: string | null;
  status: string;
}

describe.skipIf(!dbAvailable())('reconcile-runs — the Step-0 reaper (Spec 122 §7.4)', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run — there a missing pool means silently
    // registering zero tests. In a plain `npm run test` this is the designed skip.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (the C1 pattern) ──
  // setup-testcontainer.ts returns EARLY on an ambient DATABASE_URL before ever
  // consulting BUILDO_TEST_DB, so dbAvailable() alone does not prove this is a
  // disposable container. This suite REWRITES pipeline_runs statuses — including
  // a baseline sweep of pre-existing `running` rows — so it refuses anything but
  // an explicit opt-in on a loopback host.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn the child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'reconcile-runs.db.test.ts rewrites pipeline_runs statuses. Refusing to run without an explicit ' +
        'opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to mutate pipeline_runs on non-loopback host "${dbUrl.hostname}".`);
  }

  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
  };

  interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    verdict: string | null;
    rows: AuditRow[];
    recordsTotal: number | null;
    recordsUpdated: number | null;
  }

  function runScript(env: Record<string, string> = {}): RunResult {
    const r = spawnSync('node', [SCRIPT], {
      env: { ...childEnv, ...env } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
    const stdout = r.stdout ?? '';
    const line = stdout.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    expect(line, `no PIPELINE_SUMMARY on stdout.\nSTDOUT:\n${stdout}\nSTDERR:\n${r.stderr}`).toBeTruthy();
    const summary = JSON.parse(line!.slice('PIPELINE_SUMMARY:'.length)) as {
      records_total: number | null;
      records_updated: number | null;
      records_meta?: { audit_table?: { verdict?: string; rows?: AuditRow[] } };
    };
    const audit = summary.records_meta?.audit_table;
    return {
      status: r.status,
      stdout,
      stderr: r.stderr ?? '',
      verdict: audit?.verdict ?? null,
      rows: audit?.rows ?? [],
      recordsTotal: summary.records_total,
      recordsUpdated: summary.records_updated,
    };
  }

  const metric = (rows: AuditRow[], name: string): AuditRow | undefined => rows.find((r) => r.metric === name);

  async function seedRun(suffix: string, ageMinutes: number, status = 'running'): Promise<number> {
    const res = await pool!.query<{ id: number }>(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW() - ($2 * INTERVAL '1 minute'), $3) RETURNING id`,
      [`${FX}:${suffix}`, ageMinutes, status],
    );
    return res.rows[0]!.id;
  }

  beforeEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}:%`]);
    // Deterministic baseline: park any OTHER `running` row so the counts below
    // measure this suite's fixtures and nothing else. Safe only because of the
    // loopback + opt-in guard above.
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

  it('reaps a stale `running` row and reports it', async () => {
    const id = await seedRun('stale', 180);

    const run = runScript();
    expect(run.status, `exit ${run.status}\n${run.stderr}`).toBe(0);

    const after = await pool!.query<{ status: string; completed_at: Date | null; error_message: string | null; duration_ms: number | null }>(
      `SELECT status, completed_at, error_message, duration_ms FROM pipeline_runs WHERE id = $1`,
      [id],
    );
    const row = after.rows[0]!;
    expect(row.status).toBe('crashed');
    expect(row.completed_at).not.toBeNull();
    expect(row.error_message).toMatch(/stranded/i);
    expect(row.duration_ms, 'a reaped row gets a saturating duration, never NULL').toBeGreaterThan(0);

    // ...and the report says so, row-derived.
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(1);
    expect(metric(run.rows, 'stranded_reaped')?.status).toBe('WARN');
    expect(metric(run.rows, 'stranded_remaining')?.value).toBe(0);
    expect(run.verdict, 'a reap is a WARN — a process died').toBe('WARN');
    expect(run.recordsTotal).toBe(1);
    expect(run.recordsUpdated).toBe(1);
  });

  it('writes `crashed`, NEVER `failed` — the admin reaper conflated the two', async () => {
    // src/app/api/admin/stats/route.ts:190 writes 'failed' for the same rows.
    // Spec 120 §3.2b: `failed` means the code ran and reached a verdict. These
    // rows never reached one. scripts/lib/step/ledger.js:83-87 THROWS rather than
    // write `crashed` in-process, which is the other half of the same rule.
    await seedRun('crashed-not-failed', 240);
    runScript();
    const res = await pool!.query<{ status: string }>(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1`,
      [`${FX}:crashed-not-failed`],
    );
    expect(res.rows.map((r) => r.status)).toEqual(['crashed']);
  });

  it('leaves a FRESH `running` row alone — reconcile must not reap its own in-chain row', async () => {
    // In-chain, run-chain.js:591-604 INSERTs `sources:reconcile` as `running`
    // seconds before this step executes. Nothing excludes it by name; the age
    // predicate is what protects it, so the age predicate is what is tested.
    const fresh = await seedRun('fresh', 1);
    const stale = await seedRun('stale', 300);

    const run = runScript();

    const res = await pool!.query<{ id: number; status: string }>(
      `SELECT id, status FROM pipeline_runs WHERE pipeline LIKE $1 ORDER BY id`,
      [`${FX}:%`],
    );
    const byId = new Map(res.rows.map((r) => [r.id, r.status]));
    expect(byId.get(fresh)).toBe('running');
    expect(byId.get(stale)).toBe('crashed');
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(1);
    expect(metric(run.rows, 'runs_still_live')?.value).toBe(1);
  });

  it('prints the report even when there is nothing to reap (claim #85)', async () => {
    const run = runScript();
    expect(run.status).toBe(0);
    // The whole table, not just a "nothing to do" log line — a reaper that only
    // speaks when it finds something is indistinguishable from one that never ran.
    // Prefix, not exact set: pipeline.emitSummary appends its own
    // `sys_velocity_rows_sec` / `sys_duration_ms` rows to every audit_table
    // (measured 2026-08-24). Pinning the exact array would red on an SDK change
    // that has nothing to do with this step; pinning the prefix still catches a
    // row this step silently stops emitting.
    const names = run.rows.map((r) => r.metric);
    expect(names.slice(0, 6)).toEqual([
      'stranded_reaped',
      'stranded_remaining',
      'oldest_stranded_minutes',
      'runs_still_live',
      'threshold_minutes',
      'published_batch_rollback',
    ]);
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(0);
    expect(metric(run.rows, 'stranded_reaped')?.status).toBe('INFO');
    expect(run.verdict).toBe('PASS');
    expect(run.recordsTotal).toBe(0);
  });

  it('honours RECONCILE_STRANDED_AFTER_MINUTES, in both directions', async () => {
    await seedRun('threshold', 30);

    // 60-minute threshold: a 30-minute-old row is still live.
    const lenient = runScript({ RECONCILE_STRANDED_AFTER_MINUTES: '60' });
    expect(metric(lenient.rows, 'threshold_minutes')?.value).toBe(60);
    expect(metric(lenient.rows, 'stranded_reaped')?.value).toBe(0);
    let res = await pool!.query<{ status: string }>(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1`, [`${FX}:threshold`],
    );
    expect(res.rows[0]!.status).toBe('running');

    // 10-minute threshold: the same row is now stranded. Same fixture, one env
    // var apart — so a green here cannot be green-because-it-never-looked.
    const strict = runScript({ RECONCILE_STRANDED_AFTER_MINUTES: '10' });
    expect(metric(strict.rows, 'threshold_minutes')?.value).toBe(10);
    expect(metric(strict.rows, 'stranded_reaped')?.value).toBe(1);
    res = await pool!.query<{ status: string }>(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1`, [`${FX}:threshold`],
    );
    expect(res.rows[0]!.status).toBe('crashed');
  });

  it('refuses a nonsense threshold before acquiring the lock', async () => {
    const r = spawnSync('node', [SCRIPT], {
      env: { ...childEnv, RECONCILE_STRANDED_AFTER_MINUTES: '0' } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/strandedAfterMinutes|greater than or equal to 1/i);
  });

  it('reports published_batch rollback as `not_armed` while the S4 table is absent (§7.4)', async () => {
    const present = await pool!.query<{ present: boolean }>(
      `SELECT to_regclass('public.published_batch') IS NOT NULL AS present`,
    );
    // If this ever flips true, the S4 migrations landed and the rollback owner is
    // still unimplemented — which is precisely what the FAIL row exists to say.
    expect(present.rows[0]!.present, 'published_batch arrives with S4 (migrations 246-249)').toBe(false);

    const run = runScript();
    const row = metric(run.rows, 'published_batch_rollback');
    expect(row?.value).toBe('not_armed');
    expect(row?.status).toBe('INFO');
  });

  it('does not reap rows in a terminal status', async () => {
    await seedRun('already-failed', 500, 'failed');
    await seedRun('already-completed', 500, 'completed');
    runScript();
    const res = await pool!.query<{ pipeline: string; status: string }>(
      `SELECT pipeline, status FROM pipeline_runs WHERE pipeline LIKE $1 ORDER BY pipeline`,
      [`${FX}:%`],
    );
    expect(res.rows).toEqual([
      { pipeline: `${FX}:already-completed`, status: 'completed' },
      { pipeline: `${FX}:already-failed`, status: 'failed' },
    ]);
  });
});
