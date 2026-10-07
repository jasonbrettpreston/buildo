// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b (run-status vocabulary: `captured`)
//
// WF3 capture-ledger gap, L5: the CONSEQUENCES of a `captured` row against real Postgres, each
// proven in BOTH directions (a `completed` control row in the same position MUST change the
// answer, so a pass is never vacuous):
//   (a) a captured upstream row turns the ledger gate's measured 2026-09-24 SKIP into RUN, with
//       counters present AND with NULL counters (a counter-less row must not read as "0 changes");
//   (b) a captured row is never a baseline: own_last (slug forms), readPriorRunMeta (bare name),
//       detectInterruptedRetraction's anchor, and enrich_centreline's readLastEnrichedVersion all
//       return what they returned before it;
//   (c) the DB stores NULL counters (not the column default 0) and records_meta.capture as a jsonb
//       object (the `$n::jsonb` cast), and a standalone run's own row is stamped, not re-statused.
// FX-prefixed slugs (except readLastEnrichedVersion, whose SELF_FORMS are fixed); every inserted id
// is deleted in afterEach. Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const require = createRequire(import.meta.url);
const { runLedgerGateDecision, readPriorRunMeta } = require('../../../scripts/lib/source-version.js');
const { slugForms } = require('../../../scripts/lib/ledger.js');
const { detectInterruptedRetraction } = require('../../../scripts/lib/step/staleness.js');
const { readLastEnrichedVersion } = require('../../../scripts/lib/compute/enrich-centreline.js');
const L = () => require('../../../scripts/analysis/capture-ledger.js');

const OWN = 'FX_capled_own';
const UP = 'FX_capled_up';
const T = (m: number) => new Date(Date.UTC(2026, 9, 6, 10, m, 0)).toISOString();

describe.skipIf(!dbAvailable())('capture ledger: a `captured` row against the real ledger readers (live DB)', () => {
  let pool: Pool;
  const ids: number[] = [];

  async function insertRun(o: { pipeline: string; status: string; started: string; completed?: string | null; recordsNew?: number | null; recordsUpdated?: number | null; meta?: unknown }) {
    const r = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_new, records_updated, records_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
      [o.pipeline, o.status, o.started, o.completed === undefined ? o.started : o.completed, o.recordsNew === undefined ? 0 : o.recordsNew, o.recordsUpdated === undefined ? 0 : o.recordsUpdated, o.meta === undefined ? null : JSON.stringify(o.meta)],
    );
    ids.push(Number(r.rows[0].id));
    return Number(r.rows[0].id);
  }

  /** Record one run through the real recorder, exactly as the harness does (in-chain unless chain given). */
  async function capture(slug: string, o: { started: string; completed: string | null; summary?: unknown; chain?: string; maxIdBefore?: number }) {
    const session = [{
      run: 1, kind: 'pre', chain: o.chain ?? 'sources', maxIdBefore: o.maxIdBefore ?? 0, started_at: o.started, completed_at: o.completed,
      child: { exit_code: 0, signal: null, stderr: '', summary: o.summary === undefined ? null : o.summary, meta: [] },
    }];
    const rows = await L().flushSession(session, { pool, ctx: { slug, harness: 'L5', out: null, git_head: null, worktree_dirty: null, descriptor: null } });
    for (const r of rows) if (r.recorded_by === 'harness') ids.push(r.id);
    return rows;
  }

  const gate = () => runLedgerGateDecision(pool, { ownSlugs: slugForms(OWN, ['sources']), upstreamSlugs: slugForms(UP, ['sources']) });

  beforeAll(() => { pool = getTestPool() as Pool; });
  afterEach(async () => {
    if (ids.length) await pool.query('DELETE FROM pipeline_runs WHERE id = ANY($1::int[])', [ids.splice(0)]);
  });
  afterAll(async () => { await pool.end(); });

  it('(a) the 2026-09-24 replay: SKIP before, RUN after a captured upstream row (counters present)', async () => {
    await insertRun({ pipeline: `sources:${OWN}`, status: 'completed', started: T(0), completed: T(1) });
    await insertRun({ pipeline: UP, status: 'completed', started: T(2), completed: T(3), recordsNew: 0, recordsUpdated: 0 });
    expect((await gate()).skip).toBe(true);
    await capture(UP, { started: T(4), completed: T(5), summary: { records_total: 9, records_new: 0, records_updated: 0, records_meta: {} } });
    const after = await gate();
    expect(after.skip).toBe(false);
    expect(after.reason).toBe('upstream_activity_since_last_run');
  });

  it('(a) NULL counters: a counter-less captured row still forces RUN; a counter-less COMPLETED row would SKIP (control)', async () => {
    await insertRun({ pipeline: `sources:${OWN}`, status: 'completed', started: T(0), completed: T(1) });
    await insertRun({ pipeline: UP, status: 'completed', started: T(2), completed: T(3), recordsNew: null, recordsUpdated: null });
    expect((await gate()).skip).toBe(true); // control: the fail-open a counter-less row reading as "0 changes" would cause under option B
    await capture(UP, { started: T(4), completed: T(5) });
    expect((await gate()).skip).toBe(false);
  });

  it('(b) own_last and readPriorRunMeta: a captured row is never the baseline; a completed row in its place is', async () => {
    await insertRun({ pipeline: OWN, status: 'completed', started: T(0), completed: T(1), meta: { v: 'old' } });
    const before = await gate();
    expect(await readPriorRunMeta(pool, OWN)).toEqual({ v: 'old' });
    await capture(OWN, { started: T(4), completed: T(5), summary: { records_meta: { v: 'captured' } } });
    expect((await gate()).ownStarted).toEqual(before.ownStarted);
    expect(await readPriorRunMeta(pool, OWN)).toEqual({ v: 'old' });
    await insertRun({ pipeline: OWN, status: 'completed', started: T(6), completed: T(7), meta: { v: 'new' } }); // control
    expect((await gate()).ownStarted).not.toEqual(before.ownStarted);
    expect(await readPriorRunMeta(pool, OWN)).toEqual({ v: 'new' });
  });

  it('(b) detectInterruptedRetraction: a captured row never moves the anchor that exposes a prior crash; a completed one does', async () => {
    const descriptor = { identity: { name: OWN }, execution: { invocation: { sources: {} } }, recovery: { interrupted: 'force_full_on_next_run' } };
    await insertRun({ pipeline: OWN, status: 'completed', started: T(0), completed: T(1) });
    await insertRun({ pipeline: `sources:${OWN}`, status: 'crashed', started: T(2), completed: T(3) });
    expect((await detectInterruptedRetraction(pool, descriptor)).interrupted).toBe(true);
    await capture(OWN, { started: T(4), completed: T(5) });
    expect((await detectInterruptedRetraction(pool, descriptor)).interrupted).toBe(true);
    await insertRun({ pipeline: OWN, status: 'completed', started: T(6), completed: T(7) }); // control
    expect((await detectInterruptedRetraction(pool, descriptor)).interrupted).toBe(false);
  });

  it('(b) enrich_centreline readLastEnrichedVersion: a captured row never becomes the version baseline; a completed one does', async () => {
    const base = await readLastEnrichedVersion(pool);
    await insertRun({ pipeline: 'sources:enrich_centreline', status: 'completed', started: '2099-01-01T00:00:00Z', completed: '2099-01-01T00:01:00Z', meta: { centreline_enrich: { source_dataset_version: 'FX-v1' } } });
    expect(await readLastEnrichedVersion(pool)).toBe('FX-v1');
    await capture('enrich_centreline', { started: '2099-01-01T00:02:00Z', completed: '2099-01-01T00:03:00Z', summary: { records_meta: { centreline_enrich: { source_dataset_version: 'FX-v2' } } } });
    expect(await readLastEnrichedVersion(pool)).toBe('FX-v1');
    await insertRun({ pipeline: 'enrich_centreline', status: 'completed', started: '2099-01-01T00:04:00Z', completed: '2099-01-01T00:05:00Z', meta: { centreline_enrich: { source_dataset_version: 'FX-v3' } } }); // control
    expect(await readLastEnrichedVersion(pool)).toBe('FX-v3');
    expect(base === null || typeof base === 'string').toBe(true);
  });

  it('(c) the DB stores NULL counters (not the default 0) and records_meta.capture as a jsonb object', async () => {
    const [{ id }] = await capture(UP, { started: T(4), completed: T(5) });
    const r = await pool.query(
      `SELECT status, pipeline, records_total, records_new, records_updated, jsonb_typeof(records_meta->'capture') AS t
         FROM pipeline_runs WHERE id = $1`, [id]);
    expect(r.rows[0]).toEqual({ status: 'captured', pipeline: UP, records_total: null, records_new: null, records_updated: null, t: 'object' });
  });

  it('(c) OUTPUT-roster #1: a NULL completed_at (failed clock read) is stamped now(), never NULL', async () => {
    const [{ id }] = await capture(UP, { started: T(4), completed: null });
    const r = await pool.query('SELECT completed_at IS NOT NULL AS ok FROM pipeline_runs WHERE id = $1', [id]);
    expect(r.rows[0].ok).toBe(true);
  });

  it('(c) standalone: the row the step wrote itself is stamped as a jsonb object and keeps its own status; no second row', async () => {
    const maxBefore = Number((await pool.query('SELECT COALESCE(max(id), 0)::int AS m FROM pipeline_runs')).rows[0].m);
    const own = await insertRun({ pipeline: OWN, status: 'completed', started: T(1), completed: T(2), meta: { ledger_row: 'owned' } });
    const rows = await capture(OWN, { started: T(0), completed: T(3), chain: 'none', maxIdBefore: maxBefore });
    expect(rows).toEqual([{ id: own, recorded_by: 'step' }]);
    const r = await pool.query(
      `SELECT status, records_meta->>'ledger_row' AS lr, jsonb_typeof(records_meta->'capture') AS t, records_meta->'capture'->>'recorded_by' AS by
         FROM pipeline_runs WHERE id = $1`, [own]);
    expect(r.rows[0]).toEqual({ status: 'completed', lr: 'owned', t: 'object', by: 'step' });
    const n = await pool.query('SELECT count(*)::int AS n FROM pipeline_runs WHERE pipeline = $1 AND id > $2', [OWN, maxBefore]);
    expect(n.rows[0].n).toBe(1);
  });
});
