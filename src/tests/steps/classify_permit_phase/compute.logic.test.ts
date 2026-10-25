// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (step 4, classify_permit_phase)
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.6, core.9, core.10 (R-EW), core.12, ingestor.5, x-stages.2
//
// classify_permit_phase ② — the compute fed the context the RUNNER builds (Spec 132 §core.10 (R-EW)), never a
// hand-built one: `pipeline.step(descriptor, compute).run({pool, chainId})` over the committed descriptor, with only
// the DB answers faked (the assert_lifecycle_phase_distribution ② fakePool form). The suite locks what the converted
// step does against the legacy oracle pins: the one guarded UPDATE (same statement as legacy except the cutoff form,
// L2), the bump of last_seen_at inside the guard's rows (CPP-Q1 option A, L2), the scopes (L3), the rerun (L4),
// the counters (L6), the four rows now numeric (L7, CPP-D7), the derived PASS verdict (L8, CPP-D2), the division
// guard (L9), the failure lanes (L10) and the contended lock (L12).
//
// RED on the parent (3c1a80a6): the compute module and the descriptor do not exist, so every test fails by name on
// MODULE_NOT_FOUND (docs/reports/red-evidence/classify_permit_phase/pre2-port-red.json).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { runnerVariableRows } from '../../helpers/runner-variables';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the CJS runner and its result objects */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
// Loaded lazily, inside each test, so a missing module reds every test by name.
const lib = () => ({
  compute: require(join(process.cwd(), 'scripts/lib/compute/classify-permit-phase.js')),
  DESCRIPTOR: require(join(process.cwd(), 'scripts/classify-permit-phase.descriptor.json')),
});
const SEED = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
/* eslint-enable @typescript-eslint/no-require-imports */

type Row = { metric: string; value: any; threshold?: any; status: string };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The legacy UPDATE (frozen oracle :53-63), normalised — the converted statement may differ only in the cutoff. */
const LEGACY_UPDATE =
  "UPDATE permits SET enriched_status = 'Examination', last_seen_at = $1::timestamptz WHERE status = 'Inspection' AND revision_num = '00' AND (issued_date IS NULL OR issued_date < '1970-01-02') AND enriched_status IS DISTINCT FROM 'Examination' RETURNING permit_num";

type Answers = { eligible?: number; updated?: number; totalExamination?: number; totalInspection?: number; lock?: boolean; updateFail?: boolean; statsFail?: boolean };

function fakePool(a: Answers = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const declared = (lib().DESCRIPTOR.config.logic_variables as Array<{ name: string }>).map((v) => v.name);
  const answer = (text: string) => {
    if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    if (text.includes('FROM logic_variables')) {
      return { rows: [...runnerVariableRows(), ...declared.map((k) => ({ variable_key: k, variable_value: SEED[k]!.default, variable_value_json: null, updated_at: null }))] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.startsWith('SELECT NOW() AS now')) return { rows: [{ now: new Date('2026-10-25T12:00:00Z') }] };
    if (text.includes('pg_try_advisory')) return { rows: [{ acquired: a.lock ?? true, pg_try_advisory_lock: a.lock ?? true }] };
    if (text.includes('rolbypassrls') || text.includes('relrowsecurity')) return { rows: [{ present: true, bypass: true, rolbypassrls: true, relrowsecurity: true, policies: 0 }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (text.includes('pg_backend_pid')) return { rows: [{ pid: 1 }] };
    if (text.startsWith('UPDATE permits')) {
      if (a.updateFail) throw new Error('update failed');
      return { rowCount: a.updated ?? 2, rows: [] };
    }
    if (text.includes('SELECT COUNT(*) AS cnt FROM permits')) return { rows: [{ cnt: String(a.eligible ?? 7) }] };
    if (text.includes('AS total_examination')) {
      if (a.statsFail) throw new Error('stats read failed');
      return { rows: [{ total_examination: String(a.totalExamination ?? 40), total_inspection: String(a.totalInspection ?? 160) }] };
    }
    return { rows: [], rowCount: 0 };
  };
  const record = async (text: string, values?: unknown[]) => {
    sql.push(norm(text));
    params.push(values ?? []);
    return answer(norm(text));
  };
  return { sql, params, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

async function run(a: Answers = {}, chainId: string | undefined = 'permits') {
  const pool = fakePool(a);
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
  const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  let err: Error | null = null;
  try {
    const { DESCRIPTOR, compute } = lib();
    await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId });
  } catch (e) {
    err = e as Error;
  } finally {
    spy.mockRestore();
    quiet.forEach((q) => q.mockRestore());
  }
  const sumLine = lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
  const summary = sumLine ? JSON.parse(sumLine.slice('PIPELINE_SUMMARY:'.length)) : null;
  const rows: Row[] = summary?.records_meta?.audit_table?.rows ?? [];
  const row = (metric: string) => {
    const r = rows.find((x) => x.metric === metric);
    if (!r) throw new Error(`audit row ${metric} missing (rows: ${rows.map((x) => x.metric).join(', ')})`);
    return r;
  };
  const updates = pool.sql.map((s, i) => ({ s, p: pool.params[i] })).filter((q) => q.s.startsWith('UPDATE permits'));
  return { pool, summary, rows, row, err, updates };
}

describe('classify_permit_phase ② — the converted step through the real dispatch (Spec 132 §core.10 (R-EW))', () => {
  it('C1 — one guarded UPDATE: the legacy statement except the cutoff form (issued_date <= make_date(floor_year,1,1)) and no RETURNING; params [run clock, 1970] (L2; CPP-D3)', async () => {
    const { updates, err } = await run();
    expect(err).toBeNull();
    expect(updates).toHaveLength(1);
    const converted = updates[0]!.s;
    const expected = LEGACY_UPDATE
      .replace("issued_date < '1970-01-02'", 'issued_date <= make_date($2::int, 1, 1)')
      .replace(' RETURNING permit_num', '');
    expect(converted).toBe(expected);
    expect(updates[0]!.p![0]).toBeInstanceOf(Date);
    expect(updates[0]!.p![1]).toBe(1970);
    expect(SEED.classify_permit_phase_issued_date_floor_year!.default).toBe(1970);
  });

  it('C2 — the eligible count is the UPDATE scope without the guard; the stats denominator drops the issued_date clause (L3)', async () => {
    const { pool } = await run();
    const eligible = pool.sql.filter((s) => s.startsWith('SELECT COUNT(*) AS cnt FROM permits'));
    expect(eligible).toEqual(["SELECT COUNT(*) AS cnt FROM permits WHERE status = 'Inspection' AND revision_num = '00' AND (issued_date IS NULL OR issued_date <= make_date($1::int, 1, 1))"]);
    const stats = pool.sql.filter((s) => s.includes('AS total_examination'));
    expect(stats).toEqual(["SELECT COUNT(*) FILTER (WHERE enriched_status = 'Examination') AS total_examination, COUNT(*) AS total_inspection FROM permits WHERE status = 'Inspection' AND revision_num = '00'"]);
    // order: eligible count, then the UPDATE, then the stats read
    const idx = (p: (s: string) => boolean) => pool.sql.findIndex(p);
    expect(idx((s) => s.startsWith('SELECT COUNT(*) AS cnt'))).toBeLessThan(idx((s) => s.startsWith('UPDATE permits')));
    expect(idx((s) => s.startsWith('UPDATE permits'))).toBeLessThan(idx((s) => s.includes('AS total_examination')));
  });

  it('C3 — counters: records_total = the eligible pool, records_new = 0, records_updated = the UPDATE rowCount; records_meta keeps the legacy count keys (L6)', async () => {
    const { summary } = await run({ eligible: 7, updated: 2, totalExamination: 40, totalInspection: 160 });
    expect([summary.records_total, summary.records_new, summary.records_updated]).toEqual([7, 0, 2]);
    expect(summary.records_meta).toMatchObject({ examination_classified: 2, total_examination: 40, total_inspection: 160 });
    expect(typeof summary.records_meta.duration_ms).toBe('number');
  });

  it('C4 — a rerun with nothing to change still issues the one UPDATE and counts zero (L4)', async () => {
    const { summary, updates } = await run({ eligible: 5, updated: 0 });
    expect(updates).toHaveLength(1);
    expect([summary.records_total, summary.records_updated]).toEqual([5, 0]);
    expect(summary.records_meta.audit_table.verdict).toBe('PASS');
  });

  it('C5 — the four legacy rows are INFO and examination_rate is a NUMBER (L7 legacy form "25.0%" → 25, CPP-D7); the runner derives PASS (L8, CPP-D2)', async () => {
    const { row, summary } = await run({ updated: 1, totalExamination: 40, totalInspection: 160 });
    const table = summary.records_meta.audit_table;
    expect([table.phase, table.name]).toEqual([4, 'Permit Phase Classification']);
    expect(table.verdict).toBe('PASS');
    for (const m of ['examination_classified', 'total_examination', 'total_inspection', 'examination_rate']) expect(row(m).status).toBe('INFO');
    expect(row('examination_classified').value).toBe(1);
    expect(row('total_examination').value).toBe(40);
    expect(row('total_inspection').value).toBe(160);
    expect(row('examination_rate').value).toBe(25);
  });

  it('C6 — zero base-revision Inspection permits gives examination_rate 0 (the division guard, L9)', async () => {
    const { row } = await run({ eligible: 0, updated: 0, totalExamination: 0, totalInspection: 0 });
    expect(row('examination_rate').value).toBe(0);
  });

  it('C7 — failure lanes (L10): an UPDATE failure fails the run with no committed write; a stats failure after COMMIT fails the run', async () => {
    const upd = await run({ updateFail: true });
    expect(upd.err?.message).toBe('update failed');
    expect(upd.summary).toBeNull();
    const afterUpdate = upd.pool.sql.slice(upd.pool.sql.findIndex((s) => s.startsWith('UPDATE permits')));
    expect(afterUpdate).toContain('ROLLBACK');
    expect(afterUpdate).not.toContain('COMMIT');
    const stats = await run({ statsFail: true });
    expect(stats.err?.message).toBe('stats read failed');
    expect(stats.summary).toBeNull();
    // the UPDATE's shared transaction committed before the post-commit stats read threw (the legacy lane, pinned L10)
    const i = stats.pool.sql.findIndex((s) => s.startsWith('UPDATE permits'));
    expect(stats.pool.sql[i + 1]).toBe('COMMIT');
  });

  it('C8 — a contended advisory lock self-skips: no UPDATE, no stats read (L12)', async () => {
    const { updates, pool } = await run({ lock: false });
    expect(updates).toHaveLength(0);
    expect(pool.sql.some((s) => s.includes('AS total_examination'))).toBe(false);
  });
});
