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
//   5. run_stranded_after_minutes is honoured                 — a logic variable, both directions;
//                                                               out-of-bounds throws before the lock;
//                                                               a missing row → seed default + FAIL row
//   6. published_batch_rollback reports `not_armed`           — §7.4's ownerless half, visible
//   7. the ONE stranded rule (WF2 one-reaper-rule)            — fresh heartbeat spared, stale reaped,
//                                                               2 h floor kept, chain row spared under a
//                                                               live child, heartbeat_window_margin WARN
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

  async function seedRun(
    suffix: string,
    ageMinutes: number,
    status = 'running',
    heartbeatAgeMinutes: number | null = null,
    pipelineName?: string,
  ): Promise<number> {
    const res = await pool!.query<{ id: number }>(
      `INSERT INTO pipeline_runs (pipeline, started_at, status, records_meta)
       VALUES ($1, NOW() - ($2 * INTERVAL '1 minute'), $3,
               CASE WHEN $4::int IS NULL THEN NULL
                    ELSE jsonb_build_object('last_heartbeat_at', NOW() - ($4::int * INTERVAL '1 minute')) END)
       RETURNING id`,
      [pipelineName ?? `${FX}:${suffix}`, ageMinutes, status, heartbeatAgeMinutes],
    );
    return res.rows[0]!.id;
  }

  // The two reaper logic variables (WF2 one-reaper-rule). Every test starts from
  // the seed defaults so the rule is deterministic; afterAll restores them.
  const STRANDED_KEY = 'run_stranded_after_minutes';
  const FRESH_KEY = 'run_heartbeat_fresh_minutes';
  /** Fixture `*_heartbeat_minutes` key for the heartbeat_window_margin case. */
  const HB_FX_KEY = 'reconcile_fx_heartbeat_minutes';

  async function setVar(key: string, value: number): Promise<void> {
    await pool!.query(
      `INSERT INTO logic_variables (variable_key, variable_value) VALUES ($1, $2)
       ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value, updated_at = NOW()`,
      [key, value],
    );
  }

  async function deleteVar(key: string): Promise<void> {
    await pool!.query(`DELETE FROM logic_variables WHERE variable_key = $1`, [key]);
  }

  async function resetRule(): Promise<void> {
    await setVar(STRANDED_KEY, 120);
    await setVar(FRESH_KEY, 30);
    await deleteVar(HB_FX_KEY);
  }

  beforeEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1 OR pipeline = $2`, [`${FX}:%`, `chain_${FX}`]);
    // Deterministic baseline: park any OTHER `running` row so the counts below
    // measure this suite's fixtures and nothing else. Safe only because of the
    // loopback + opt-in guard above.
    await pool!.query(
      `UPDATE pipeline_runs SET status = 'completed', completed_at = NOW()
        WHERE status = 'running' AND pipeline NOT LIKE $1`,
      [`${FX}:%`],
    );
    await resetRule();
  });

  afterAll(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1 OR pipeline = $2`, [`${FX}:%`, `chain_${FX}`]);
    await resetRule();
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
    expect(names.slice(0, 7)).toEqual([
      'stranded_reaped',
      'stranded_remaining',
      'oldest_stranded_minutes',
      'runs_still_live',
      'stranded_after_minutes',
      'heartbeat_fresh_minutes',
      'published_batch_rollback',
    ]);
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(0);
    expect(metric(run.rows, 'stranded_reaped')?.status).toBe('INFO');
    expect(run.verdict).toBe('PASS');
    expect(run.recordsTotal).toBe(0);
  });

  it('honours the run_stranded_after_minutes logic variable, in both directions', async () => {
    await seedRun('threshold', 45);

    // 60-minute floor: a 45-minute-old row with no heartbeat is still live.
    await setVar(STRANDED_KEY, 60);
    const lenient = runScript();
    expect(metric(lenient.rows, 'stranded_after_minutes')?.value).toBe(60);
    expect(metric(lenient.rows, `rule_source_${STRANDED_KEY}`)?.status).toBe('INFO');
    expect(metric(lenient.rows, 'stranded_reaped')?.value).toBe(0);
    let res = await pool!.query<{ status: string }>(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1`, [`${FX}:threshold`],
    );
    expect(res.rows[0]!.status).toBe('running');

    // 30-minute floor (the seed minimum): same fixture, one variable apart — so a
    // green here cannot be green-because-it-never-looked.
    await setVar(STRANDED_KEY, 30);
    const strict = runScript();
    expect(metric(strict.rows, 'stranded_after_minutes')?.value).toBe(30);
    expect(metric(strict.rows, 'stranded_reaped')?.value).toBe(1);
    res = await pool!.query<{ status: string }>(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1`, [`${FX}:threshold`],
    );
    expect(res.rows[0]!.status).toBe('crashed');
  });

  it('refuses an out-of-bounds logic variable before acquiring the lock — zero rows reaped', async () => {
    const id = await seedRun('oob', 180);
    await setVar(STRANDED_KEY, 5); // seed min is 30
    const r = spawnSync('node', [SCRIPT], {
      env: childEnv as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/strandedAfterMinutes|greater than or equal to 30/i);
    const after = await pool!.query<{ status: string }>(`SELECT status FROM pipeline_runs WHERE id = $1`, [id]);
    expect(after.rows[0]!.status).toBe('running');
  });

  it('a MISSING logic-variable row reaps on the seed default and turns the verdict red, naming the key', async () => {
    const id = await seedRun('missing-var', 180);
    await deleteVar(FRESH_KEY);
    const run = runScript();
    expect(run.status, `exit ${run.status}\n${run.stderr}`).toBe(0);
    const src = metric(run.rows, `rule_source_${FRESH_KEY}`);
    expect(src?.status).toBe('FAIL');
    expect(String(src?.value)).toContain(FRESH_KEY);
    expect(metric(run.rows, 'heartbeat_fresh_minutes')?.value).toBe(30);
    expect(run.verdict).toBe('FAIL');
    const after = await pool!.query<{ status: string }>(`SELECT status FROM pipeline_runs WHERE id = $1`, [id]);
    expect(after.rows[0]!.status).toBe('crashed');
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

  // ── The ONE stranded rule (WF2 one-reaper-rule, folds A2/A3) ──
  const statusOf = async (id: number): Promise<string> =>
    (await pool!.query<{ status: string }>(`SELECT status FROM pipeline_runs WHERE id = $1`, [id])).rows[0]!.status;

  it('spares a 3 h row with a FRESH heartbeat (5 min) — counted, and no stranded_remaining FAIL', async () => {
    // RED before the rule: the wall-clock-only reaper crashed this row.
    const id = await seedRun('fresh-hb', 180, 'running', 5);
    const run = runScript();
    expect(await statusOf(id)).toBe('running');
    expect(metric(run.rows, 'spared_fresh_heartbeat')?.value).toBe(1);
    // A spared row is live, not stranded — runs_still_live counts it (only fixture row).
    expect(metric(run.rows, 'runs_still_live')?.value).toBe(1);
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(0);
    expect(metric(run.rows, 'stranded_remaining')?.value).toBe(0);
    expect(metric(run.rows, 'stranded_remaining')?.status).toBe('INFO');
  });

  it('reaps a 3 h row whose heartbeat is STALE (45 min) — branch named', async () => {
    const id = await seedRun('stale-hb', 180, 'running', 45);
    const run = runScript();
    expect(await statusOf(id)).toBe('crashed');
    expect(metric(run.rows, 'reaped_stale_heartbeat')?.value).toBe(1);
    expect(metric(run.rows, 'reaped_no_heartbeat')?.value).toBe(0);
    const msg = await pool!.query<{ error_message: string }>(
      `SELECT error_message FROM pipeline_runs WHERE id = $1`, [id],
    );
    expect(msg.rows[0]!.error_message).toMatch(/stale heartbeat/);
  });

  it('keeps the 2 h floor: a 40 min row with a 45 min-old heartbeat is NOT reaped', async () => {
    const id = await seedRun('floor', 40, 'running', 45);
    const run = runScript();
    expect(await statusOf(id)).toBe('running');
    expect(metric(run.rows, 'stranded_reaped')?.value).toBe(0);
  });

  it('no heartbeat: reaped at 3 h (branch named), spared at 1 h', async () => {
    const old = await seedRun('nohb-old', 180);
    const young = await seedRun('nohb-young', 60);
    const run = runScript();
    expect(await statusOf(old)).toBe('crashed');
    expect(await statusOf(young)).toBe('running');
    expect(metric(run.rows, 'reaped_no_heartbeat')?.value).toBe(1);
    expect(metric(run.rows, 'reaped_stale_heartbeat')?.value).toBe(0);
  });

  it('spares a chain row while a child step row has a fresh heartbeat; reaps it without one', async () => {
    // RED before the rule: the parent chain row was crashed under a live child.
    const chain = await seedRun('', 180, 'running', null, `chain_${FX}`);
    const child = await seedRun('chainstep', 180, 'running', 5);
    let run = runScript();
    expect(await statusOf(chain)).toBe('running');
    expect(await statusOf(child)).toBe('running');
    expect(metric(run.rows, 'spared_chain_live_child')?.value).toBe(1);
    expect(metric(run.rows, 'spared_fresh_heartbeat')?.value).toBe(1);
    expect(metric(run.rows, 'stranded_remaining')?.value).toBe(0);

    // The child finishes; the chain row has no live child left and is reaped.
    await pool!.query(`UPDATE pipeline_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`, [child]);
    run = runScript();
    expect(await statusOf(chain)).toBe('crashed');
    expect(metric(run.rows, 'spared_chain_live_child')?.value).toBe(0);
  });

  it('heartbeat_window_margin WARNs when fresh < 2 × the largest *_heartbeat_minutes, INFO otherwise', async () => {
    // Baseline assumes the seeded *_heartbeat_minutes are all ≤ 15 (defaults are 5).
    let run = runScript();
    expect(metric(run.rows, 'heartbeat_window_margin')?.status).toBe('INFO');
    await setVar(HB_FX_KEY, 20); // 2 × 20 = 40 > fresh 30
    run = runScript();
    const row = metric(run.rows, 'heartbeat_window_margin');
    expect(row?.status).toBe('WARN');
    expect(String(row?.value)).toContain('max_heartbeat=20');
  });

  it('treats a MALFORMED heartbeat as no heartbeat — reaped via that branch, run does not error', async () => {
    // RED before the guard: `'garbage'::timestamptz` aborted the whole reap transaction.
    const id = await seedRun('garbage-hb', 180);
    await pool!.query(
      `UPDATE pipeline_runs SET records_meta = jsonb_build_object('last_heartbeat_at', 'garbage') WHERE id = $1`,
      [id],
    );
    const run = runScript();
    expect(run.status, `exit ${run.status}\n${run.stderr}`).toBe(0);
    expect(await statusOf(id)).toBe('crashed');
    expect(metric(run.rows, 'reaped_no_heartbeat')?.value).toBe(1);
    expect(metric(run.rows, 'reaped_stale_heartbeat')?.value).toBe(0);
    const msg = await pool!.query<{ error_message: string }>(
      `SELECT error_message FROM pipeline_runs WHERE id = $1`, [id],
    );
    expect(msg.rows[0]!.error_message).toMatch(/no heartbeat/);
  });
});
