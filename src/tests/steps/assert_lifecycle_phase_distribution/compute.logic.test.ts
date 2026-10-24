// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EW (compute reads the dispatch's own ctx shape), R-DC, R-EP, R-BZ
//
// assert_lifecycle_phase_distribution ② — the compute fed the context the RUNNER builds (Spec 132 §core.10 (R-EW)),
// never a hand-built one: `pipeline.step(descriptor, compute).run({pool, chainId})` over the committed descriptor, with
// only the DB answers faked (the step-library.logic fakePool form). The per-seq classification itself is Postgres
// (SEQ_CLASSIFY_SQL); its semantics are locked by seq-classify.db.test.ts (test:db). Here the fake answers stand in for
// that statement's rows, and the suite locks what compute and the runner do with them: the bind parameters (bands
// from the step-owned variables, NULL for the 33 unbounded seqs, the three flags), the WARN / FAIL routing into
// seq_bands_warn / seq_bands_failing, the halting classes, the inclusive cross-check tiers, the R-EP detail cap and
// the INFO context rows.
//
// RED on the parent (9fd4ca4f): the compute module and descriptor do not exist, so every test fails by name on
// MODULE_NOT_FOUND (docs/reports/red-evidence/assert_lifecycle_phase_distribution/pre2-port-red.json).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { runnerVariableRows } from '../../helpers/runner-variables';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the CJS runner and its result objects */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
// Loaded lazily, inside each test, so a missing module reds every test by name (gate K needs assertion-level red).
const lib = () => ({
  compute: require(join(process.cwd(), 'scripts/lib/compute/assert-lifecycle-phase-distribution.js')),
  DESCRIPTOR: require(join(process.cwd(), 'scripts/quality/assert-lifecycle-phase-distribution.descriptor.json')),
});
const SEED = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number | null }>;
/* eslint-enable @typescript-eslint/no-require-imports */

const S = 'assert_lifecycle_phase_distribution';
type Row = { metric: string; value: any; threshold?: any; status: string; source?: string };
type SeqRow = { seq: number; actual: number; in_catalog: boolean; banded: boolean; has_data: boolean; band_min: number | null; band_max: number | null; kind: string; posture: string | null };

const declared = (): string[] => lib().DESCRIPTOR.config.logic_variables.map((v: { name: string }) => v.name);

/** Every declared variable at its seed default, with overrides. */
function vars(over: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of declared()) out[n] = SEED[n]!.default as number;
  return { ...out, ...over };
}

function seqRow(over: Partial<SeqRow> & { seq: number }): SeqRow {
  return { actual: 10, in_catalog: true, banded: true, has_data: true, band_min: 1, band_max: 100, kind: 'in_band', posture: null, ...over };
}

type Answers = {
  logicVars?: Record<string, number>;
  seqRows?: SeqRow[];
  counts?: Partial<Record<'seqUnclPermits' | 'seqUnclCoa' | 'unclPermits' | 'unclCoa' | 'liveNull' | 'never' | 'stalled' | 'active' | 'issued', number>>;
};

function fakePool(a: Answers = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const c = { seqUnclPermits: 0, seqUnclCoa: 0, unclPermits: 0, unclCoa: 0, liveNull: 0, never: 0, stalled: 0, active: 0, issued: 0, ...a.counts };
  const n = (v: number) => ({ rows: [{ n: v }] });
  const answer = (text: string) => {
    if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    if (text.includes('FROM logic_variables')) {
      return { rows: [...runnerVariableRows(), ...Object.entries(a.logicVars ?? vars()).map(([variable_key, variable_value]) => ({ variable_key, variable_value, variable_value_json: null }))] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (text.includes('GROUP BY lifecycle_phase') && text.includes('FROM permits')) return { rows: [{ lifecycle_phase: 'P7a', n: 40 }, { lifecycle_phase: 'P12', n: 30 }, { lifecycle_phase: null, n: 5 }] };
    if (text.includes('GROUP BY lifecycle_phase') && text.includes('FROM coa_applications')) return { rows: [{ lifecycle_phase: 'P1', n: 20 }, { lifecycle_phase: 'P2', n: 10 }, { lifecycle_phase: null, n: 1 }] };
    if (text.includes('FROM unnest(')) return { rows: a.seqRows ?? [seqRow({ seq: 1 }), seqRow({ seq: 2, kind: 'catalog_null', band_min: 0, band_max: null, actual: 0, has_data: false })] };
    // The cross checks first: two of them also say `lifecycle_phase IS NULL`.
    if (text.includes("'stalled'")) return n(c.stalled);
    if (text.includes("'active inspection'")) return n(c.active);
    if (text.includes("'permit issued'")) return n(c.issued);
    if (text.includes('lifecycle_seq IS NULL') && text.includes('FROM permits')) return n(c.seqUnclPermits);
    if (text.includes('lifecycle_seq IS NULL') && text.includes('FROM coa_applications')) return n(c.seqUnclCoa);
    if (text.includes('matched_rule IS NULL')) return n(c.liveNull);
    if (text.includes('lifecycle_phase IS NULL') && text.includes('FROM permits')) return n(c.unclPermits);
    if (text.includes('lifecycle_phase IS NULL') && text.includes('FROM coa_applications')) return n(c.unclCoa);
    if (text.includes('lifecycle_classified_at IS NULL')) return n(c.never);
    if (text.includes('COUNT(bid_value)')) return { rows: [{ p_total: 200, p_cov: 0, c_total: 50, c_cov: 50 }] };
    return { rows: [] };
  };
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    return answer(text);
  };
  return { sql, params, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

async function run(a: Answers = {}, chainId = 'permits') {
  const pool = fakePool(a);
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
  const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  let out: any = null;
  let err: Error | null = null;
  try {
    const { DESCRIPTOR, compute } = lib();
    out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId });
  } catch (e) {
    err = e as Error;
  } finally {
    spy.mockRestore();
    quiet.forEach((q) => q.mockRestore());
  }
  const sumLine = lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
  const summary = sumLine ? JSON.parse(sumLine.slice('PIPELINE_SUMMARY:'.length)) : null;
  const rows: Row[] = summary ? summary.records_meta.audit_table.rows : [];
  const row = (metric: string) => {
    const r = rows.find((x) => x.metric === metric);
    if (!r) throw new Error(`audit row ${metric} missing`);
    return r;
  };
  return { pool, out, err, summary, rows, row, verdict: summary && summary.records_meta.audit_table.verdict };
}

describe('assert_lifecycle_phase_distribution ② — the compute through the real dispatch (R-EW)', () => {
  it('a clean estate: PASS, every declared check reported once in descriptor order, then the INFO context rows', async () => {
    const r = await run();
    expect(r.err).toBeNull();
    expect(r.verdict).toBe('PASS');
    const checkIds = lib().DESCRIPTOR.checks.map((c: { id: string }) => c.id);
    const checkRows = r.rows.filter((x) => checkIds.includes(x.metric)).map((x) => x.metric);
    expect(checkRows).toEqual(checkIds);
    expect(r.row('lifecycle_seq_01_count')).toMatchObject({ value: 10, threshold: '1..100', status: 'INFO' });
    expect(r.row('lifecycle_seq_02_count')).toMatchObject({ value: 0, threshold: 'no upper bound (catalog rows_count=0)', status: 'INFO' });
    expect(r.row('seq_bands_passing')).toMatchObject({ value: 2, status: 'INFO' });
    expect(r.row('seq_bands_null_catalog_count')).toMatchObject({ value: 1, status: 'INFO' });
    expect(r.row(`${S}_seq_band_promote_to_fail_band_violation`)).toMatchObject({ value: 0, status: 'INFO' });
    expect(r.row('bid_value_coverage')).toMatchObject({ value: 'permits 0.0% / coa 100.0%', status: 'INFO' });
    // WF3 Bug #6: shared keys SUM (null 5 + 1), then the P9-P17 aggregate (P12 30).
    expect(r.row('phase_distribution').value).toEqual({ P7a: 40, P12: 30, null: 6, P1: 20, P2: 10, 'P9-P17': 30 });
    expect(r.row('seq_distribution').value).toEqual({ 1: 10 });
  });

  it('SEQ_CLASSIFY_SQL binds the declared bands from the step-owned variables: 110 seqs, NULL max for exactly the 33 seed-unbounded seqs, then the three flags', async () => {
    const r = await run({ logicVars: vars({ [`${S}_seq_band_1_min`]: 3, [`${S}_seq_band_promote_to_fail_no_band_configured`]: 1 }) });
    const idx = r.pool.sql.findIndex((s) => s.includes('FROM unnest('));
    const [seqs, mins, maxs, f1, f2, f3] = r.pool.params[idx] as [number[], number[], (number | null)[], number, number, number];
    expect(seqs).toHaveLength(110);
    expect(seqs[0]).toBe(1);
    expect(mins[0]).toBe(3);
    const unbounded = seqs.filter((_, i) => maxs[i] === null);
    const seedUnbounded = Object.keys(SEED).map((k) => /^lifecycle_seq_band_(\d+)_max$/.exec(k)).filter((m) => m && SEED[m[0]]!.default === null).map((m) => Number(m![1])).sort((x, y) => x - y);
    expect(unbounded).toEqual(seedUnbounded);
    expect(unbounded).toHaveLength(33);
    expect([f1, f2, f3]).toEqual([0, 1, 0]);
  });

  it('WARN-routed violations: seq_bands_warn counts seqs (one kind each) and lists them; the verdict is WARN and nothing halts', async () => {
    const r = await run({
      seqRows: [
        seqRow({ seq: 1, actual: 5000, kind: 'band_violation', posture: 'warn' }),
        seqRow({ seq: 3, actual: 0, has_data: false, kind: 'expected_data_missing', posture: 'warn' }),
        seqRow({ seq: 7, actual: 9, in_catalog: false, banded: false, band_min: null, band_max: null, kind: 'no_band_configured', posture: 'warn' }),
      ],
    });
    expect(r.err).toBeNull();
    expect(r.verdict).toBe('WARN');
    expect(r.row('seq_bands_warn').status).toBe('WARN');
    expect(r.row('seq_bands_failing').status).toBe('PASS');
    expect(r.out.status).toBe('completed_with_warnings');
    const detail = JSON.stringify(r.row('seq_bands_warn').value);
    expect(detail).toContain('"kind":"band_violation"');
    expect(detail).toContain('"kind":"expected_data_missing"');
    expect(detail).toContain('"kind":"no_band_configured"');
  });

  it('FAIL-routed violations (posture flag 1): seq_bands_failing is a blocking FAIL — the audit table is emitted, then the run halts', async () => {
    const r = await run({ seqRows: [seqRow({ seq: 1, actual: 5000, kind: 'band_violation', posture: 'fail' })] });
    expect(r.summary).not.toBeNull();
    expect(r.row('seq_bands_failing').status).toBe('FAIL');
    expect(r.verdict).toBe('FAIL');
    expect(r.err?.message).toMatch(/blocking checks failed: seq_bands_failing/);
  });

  it('unclassified_count is inclusive at its max (PASS) and a blocking FAIL above it (L10 parity)', async () => {
    const at = await run({ counts: { unclPermits: 60, unclCoa: 40 } });
    expect(at.row('unclassified_count')).toMatchObject({ value: 100, status: 'PASS' });
    expect(at.err).toBeNull();
    const over = await run({ counts: { unclPermits: 61, unclCoa: 40 } });
    expect(over.row('unclassified_count').status).toBe('FAIL');
    expect(over.err?.message).toMatch(/blocking checks failed: unclassified_count/);
  });

  it('cross checks never halt: 0 PASS, up to the threshold WARN (inclusive, R-FD), above it FAIL; the verdict is FAIL and nothing throws', async () => {
    const r = await run({ counts: { stalled: 1001, active: 500, issued: 0 } });
    expect(r.err).toBeNull();
    expect(r.row('cross_check_stalled').status).toBe('FAIL');
    expect(r.row('cross_check_active_inspection').status).toBe('WARN');
    expect(r.row('cross_check_permit_issued').status).toBe('PASS');
    expect(r.verdict).toBe('FAIL');
    // No throw: the chain continues (run-chain folds a FAIL verdict to completed_with_errors).
  });

  it('a lone cross_check_permit_issued WARN now reads WARN (row-derived verdict, ALPD-D3)', async () => {
    const r = await run({ counts: { issued: 3 } });
    expect(r.row('cross_check_permit_issued').status).toBe('WARN');
    expect(r.verdict).toBe('WARN');
  });

  it('R-EP: the violation list is capped by assert_lifecycle_phase_distribution_max_detail_keys and the truncation is read from the slice', async () => {
    const three = [1, 2, 3].map((seq) => seqRow({ seq, actual: 5000, kind: 'band_violation', posture: 'warn' }));
    const r = await run({ seqRows: three, logicVars: vars({ [`${S}_max_detail_keys`]: 2 }) });
    const v = r.row('seq_bands_warn').value;
    const detail = typeof v === 'string' ? JSON.parse(v) : v;
    expect(detail.seq_violations).toHaveLength(2);
    expect(detail.seq_violations_truncated).toBe(true);
  });

  it('a catalog seq without a declared band WARNs seq_bands_total; an orphan band is a blocking FAIL', async () => {
    const unbanded = await run({ seqRows: [seqRow({ seq: 1 }), seqRow({ seq: 111, banded: false, has_data: false, actual: 0, band_min: null, band_max: null, kind: 'unbanded' })] });
    expect(unbanded.row('seq_bands_total').status).toBe('WARN');
    expect(unbanded.err).toBeNull();
    const orphan = await run({ seqRows: [seqRow({ seq: 1 }), seqRow({ seq: 120, in_catalog: false, kind: 'orphan_band' })] });
    expect(orphan.row('seq_band_orphan_count').status).toBe('FAIL');
    expect(orphan.err?.message).toMatch(/blocking checks failed: seq_band_orphan_count/);
  });

  it('an empty catalog WARNs seq_bands_total (ALPD-D4, the empty-but-present lane)', async () => {
    const r = await run({ seqRows: [] });
    expect(r.row('seq_bands_total').status).toBe('WARN');
  });

  it('runs identically in the coa chain (both invocations declared)', async () => {
    const r = await run({}, 'coa');
    expect(r.err).toBeNull();
    expect(r.verdict).toBe('PASS');
  });
});
