// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md ruling R-B (2026-08-28/29)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 12 / §5 R-B
//
// R-B's RUNTIME reader (LW-D20 / LG-19, closed 2026-08-29) — live-DB behavioral
// cases for `staleness.detectInterruptedRetraction` and its wiring into
// `staleness.selectMode`. "Recovery must be TRUE, not decorative": a step whose
// destructive retraction target was interrupted mid-run (a killed/crashed
// process, or a stuck `running` row) must resolve mode FULL on its next
// invocation, unconditionally — the measured defect this closes left
// `parcel_buildings` at 29,330/520,492 rows with the NEXT run reading
// "unchanged" (incremental), silently.
//
// T2 fixture discipline: FX-prefixed pipeline slugs, DELETE-by-prefix cleanup.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const staleness = require('../../../scripts/lib/step/staleness.js') as {
  detectInterruptedRetraction: (pool: Pool, descriptor: unknown, opts?: { ownRunId?: number | null }) => Promise<{ interrupted: boolean; row: { id: number; pipeline: string; status: string; started_at: string } | null }>;
  selectMode: (input: { descriptor: unknown; pool: Pool; prior: object | null; argv?: string[]; env?: Record<string, string>; ownRunId?: number | null }) => Promise<{
    mode: string;
    reason: string;
    interrupted_retraction: { id: number; pipeline: string; status: string; started_at: string } | null;
  }>;
};

const SLUG = 'FX_ir_link_massing';

function minutesAgo(anchor: Date, mins: number): Date {
  return new Date(anchor.getTime() - mins * 60_000);
}

async function insertRun(pool: Pool, opts: { pipeline: string; status: string; startedAt: Date; completedAt?: Date | null }) {
  const { pipeline, status, startedAt, completedAt = null } = opts;
  await pool.query(
    `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at) VALUES ($1,$2,$3,$4)`,
    [pipeline, status, startedAt, completedAt],
  );
}

/** A minimal descriptor declaring recovery.interrupted:"force_full_on_next_run" and a tri-state mode gate — everything detectInterruptedRetraction/selectMode read, nothing else. */
function descriptorWithInterruptedRecovery(recoveryInterrupted: string) {
  return {
    identity: { name: SLUG },
    staleness: { mode_select: 'tri_state', trigger: 'none' },
    recovery: recoveryInterrupted === 'none' ? { interrupted: 'none' } : { interrupted: recoveryInterrupted },
    execution: { invocation: 'none' },
    inputs: { reads: { steps: [] } },
  };
}

describe.skipIf(!dbAvailable())('staleness.detectInterruptedRetraction / selectMode — R-B runtime reader (LW-D20/LG-19), live-DB cases', () => {
  let pool: Pool;
  let anchor: Date;

  beforeAll(async () => {
    pool = getTestPool() as Pool;
    const { rows } = await pool.query('SELECT NOW() AS now');
    anchor = new Date(rows[0].now);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = $1`, [SLUG]);
  });

  it('SCOPE GATE — a step with recovery.interrupted:"none" is never checked, even with a real crashed row present', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'crashed', startedAt: minutesAgo(anchor, 5) });
    const d = descriptorWithInterruptedRecovery('none');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result).toEqual({ interrupted: false, row: null });
  });

  it('CLEAN — no prior run at all → not interrupted (nothing to recover from)', async () => {
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result).toEqual({ interrupted: false, row: null });
  });

  it('CLEAN — the only prior run completed normally → not interrupted', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result).toEqual({ interrupted: false, row: null });
  });

  it('RED — a "running" row more recent than the last completed run IS detected (the live kill-mid-run shape)', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 120), completedAt: minutesAgo(anchor, 119) });
    await insertRun(pool, { pipeline: SLUG, status: 'running', startedAt: minutesAgo(anchor, 5), completedAt: null });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result.interrupted).toBe(true);
    expect(result.row?.status).toBe('running');
  });

  it('RED — a "crashed" row more recent than the last completed run IS detected', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 120), completedAt: minutesAgo(anchor, 119) });
    await insertRun(pool, { pipeline: SLUG, status: 'crashed', startedAt: minutesAgo(anchor, 5), completedAt: null });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result.interrupted).toBe(true);
    expect(result.row?.status).toBe('crashed');
  });

  it('CLEAN — a stuck "running" row OLDER than the last completed run is NOT interrupted (recovered by a later completion)', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'running', startedAt: minutesAgo(anchor, 120), completedAt: null });
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result).toEqual({ interrupted: false, row: null });
  });

  it('CLEAN — a "failed" (not running/crashed) row more recent than the last completed run is NOT this predicate (a different, already-handled class)', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 120), completedAt: minutesAgo(anchor, 119) });
    await insertRun(pool, { pipeline: SLUG, status: 'failed', startedAt: minutesAgo(anchor, 5), completedAt: minutesAgo(anchor, 4) });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.detectInterruptedRetraction(pool, d);
    expect(result).toEqual({ interrupted: false, row: null });
  });

  it('END-TO-END — selectMode resolves FULL with reason "recover_interrupted_retraction" UNCONDITIONALLY, overriding forced=false/explicit_full=false/changed=false', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 120), completedAt: minutesAgo(anchor, 119) });
    await insertRun(pool, { pipeline: SLUG, status: 'running', startedAt: minutesAgo(anchor, 5), completedAt: null });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    // argv/env deliberately empty — no --full, no force-full env var. If the mode still
    // resolves FULL, it can ONLY be the interrupted-retraction branch.
    const result = await staleness.selectMode({ descriptor: d, pool, prior: { some_key: 'unchanged' }, argv: [], env: {} });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('recover_interrupted_retraction');
    expect(result.interrupted_retraction?.status).toBe('running');
  });

  it('END-TO-END RED->GREEN — the SAME descriptor resolves incremental once the stuck row is marked completed (the recovery closing the loop)', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 120), completedAt: minutesAgo(anchor, 119) });
    await insertRun(pool, { pipeline: SLUG, status: 'running', startedAt: minutesAgo(anchor, 5), completedAt: null });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const beforeRecovery = await staleness.selectMode({ descriptor: d, pool, prior: null, argv: [], env: {} });
    expect(beforeRecovery.mode).toBe('full');
    expect(beforeRecovery.reason).toBe('recover_interrupted_retraction');

    await pool.query(`UPDATE pipeline_runs SET status = 'completed', completed_at = $2 WHERE pipeline = $1 AND status = 'running'`, [SLUG, anchor]);
    const afterRecovery = await staleness.selectMode({ descriptor: d, pool, prior: null, argv: [], env: {} });
    expect(afterRecovery.reason).not.toBe('recover_interrupted_retraction');
    expect(afterRecovery.interrupted_retraction).toBeNull();
  });

  it('selectMode still returns interrupted_retraction: null on the ordinary (non-interrupted) path', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');
    const result = await staleness.selectMode({ descriptor: d, pool, prior: null, argv: [], env: {} });
    expect(result.interrupted_retraction).toBeNull();
  });

  // ⚠️ REGRESSION LOCK — a real bug found by a LIVE kill-and-rerun proof against
  // link_wsib (2026-08-29), not by reasoning about the code. Without excluding
  // ownRunId, THIS INVOCATION'S OWN just-opened `running` row (openLedgerRow
  // already ran before selectMode is ever called) satisfied detectInterruptedRetraction
  // on EVERY SINGLE RUN — finalizeLedgerRow had not stamped it 'completed' yet — which
  // read every run as "interrupted" and forced FULL forever, permanently defeating the
  // gated-skip/incremental path. Caught live: a real `LINK_WSIB_FORCE_FULL=1` invocation
  // printed "cascade mode gate: FULL (recover_interrupted_retraction)" as its VERY FIRST
  // log line, before any real work had a chance to be interrupted by anything.
  it('REGRESSION (found live) — a step\'s OWN currently-open running row (its own ownRunId) is EXCLUDED, never mistaken for an interrupted PRIOR run', async () => {
    await insertRun(pool, { pipeline: SLUG, status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    const ownRow = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at) VALUES ($1, 'running', $2) RETURNING id`,
      [SLUG, anchor],
    );
    const ownRunId = ownRow.rows[0].id as number;
    const d = descriptorWithInterruptedRecovery('force_full_on_next_run');

    // WITHOUT ownRunId (the bug's exact shape): the step's own row is indistinguishable
    // from a genuinely stuck prior run.
    const withoutExclusion = await staleness.detectInterruptedRetraction(pool, d);
    expect(withoutExclusion.interrupted, 'sanity: the own row DOES satisfy the raw predicate — proves the exclusion below is doing real work').toBe(true);
    expect(withoutExclusion.row?.id).toBe(ownRunId);

    // WITH ownRunId supplied (the fix): the SAME row must be excluded.
    const withExclusion = await staleness.detectInterruptedRetraction(pool, d, { ownRunId });
    expect(withExclusion).toEqual({ interrupted: false, row: null });

    // End-to-end through selectMode, the real call shape every phase function uses.
    const modeResult = await staleness.selectMode({ descriptor: d, pool, prior: null, argv: [], env: {}, ownRunId });
    expect(modeResult.reason).not.toBe('recover_interrupted_retraction');
    expect(modeResult.interrupted_retraction).toBeNull();
  });
});
