// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EW (compute reads the dispatch's own ctx shape), R-DX, R-DY, R-DZ
// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §3
//
// coa — the compute fed the context the RUNNER builds (Spec 124 R-EW, operator y 2026-10-20), never a hand-built one.
//
// The coa descriptor names `externals[].target`, so runWithPool dispatches it to `ingestPrimaries` (0x, RE-FREEZE #29;
// union group R-DX (iii)). That path hands compute two shapes: the pre_write pass gets the group's flat acquired block
// with `ctx.primary` set, and the final pass gets `acquired.primaries[id]` and `written.by_target.<table>`
// (scripts/lib/step/index.js aggregatePrimaries, and the `{acquired: ingest.acquired, written: ingest.written}` hand-off
// in runWithPool). This suite builds both through the REAL dispatch: `ingestPrimaries` over the real descriptor, the real
// CKAN acquisition arm (a fake CKAN server), the real shape/dedupe/derive seams and the real executeWrite over a fake
// client, and the real `makePreWriteGate`. Only the DB answers are faked.
//
//   COA-D12: emits[0].skeleton had no per-member sub-blocks, so 0x B6 refused the step before any I/O.
//   COA-D13: the compute read the flat runIngestPhase shape (`acquired.rows_read`, `written.e1`) in the final pass,
//            so every counter and check value read 0 on a real run (Night P4 2026-10-20 evidence).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

import { ACTIVE_ID, CLOSED_ID, type CkanRecord } from './fixtures/legacy-harness';

const req = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');
/* eslint-disable @typescript-eslint/no-explicit-any -- the CJS runner's own result objects */
const stepLib = req(path.join(REPO_ROOT, 'scripts/lib/step')) as any;
const writeLib = req(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as any;
const stalenessLib = req(path.join(REPO_ROOT, 'scripts/lib/step/staleness.js')) as any;
const compute = req(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa.js')) as any;
const DESCRIPTOR_PATH = path.join(REPO_ROOT, 'scripts/load-coa.descriptor.json');

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-17T12:00:00Z');
const VERSION = 'Mon, 14 Mar 2022 15:25:09 GMT';
const LEDGER_EXPRS = ['lead_id', 'to_status', "date_trunc('second'::text, (transitioned_at AT TIME ZONE 'UTC'::text))"];
const CONFIG = {
  coa_page_size: 2,
  coa_download_retries: 0,
  coa_download_retry_backoff_ms: 0,
  coa_skip_rate_max_pct: 5,
  coa_max_days_stale_warn: 45,
  coa_applications_dead_tuple_ratio_warn_max: 0,
};

function descriptor(): any {
  return JSON.parse(JSON.stringify(req(DESCRIPTOR_PATH)));
}

function rec(over: Partial<CkanRecord> = {}): CkanRecord {
  return {
    _id: 1, 'REFERENCE_FILE#': 'A0001/26TEY', C_OF_A_DESCISION: 'Approved', STATUSDESC: 'Hearing Scheduled',
    HEARING_DATE: '2026-10-01', STREET_NUM: '123', STREET_NAME: 'QUEEN', STREET_TYPE: 'ST', STREET_DIRECTION: 'E',
    WARD: '10', DESCRIPTION: 'To permit a rear addition.', SUB_TYPE: 'Minor Variance',
    ZONING_DESIGNATION: 'RD (f12.0; a370) (x5)', APPEAL_EXPIRY_DATE: '2026-10-21', ...over,
  };
}

/** Active: 4 records — one blank key (bad key), one duplicate of Closed's A3. Closed: 2 records. */
const ACTIVE = [
  rec({ _id: 1, 'REFERENCE_FILE#': 'A1' }),
  rec({ _id: 2, 'REFERENCE_FILE#': 'A2', ZONING_DESIGNATION: null }),
  rec({ _id: 3, 'REFERENCE_FILE#': 'A3' }),
  rec({ _id: 4, 'REFERENCE_FILE#': '' }),
];
const CLOSED = [
  rec({ _id: 11, 'REFERENCE_FILE#': 'A3', STATUSDESC: 'Closed' }),
  rec({ _id: 12, 'REFERENCE_FILE#': 'C9', STATUSDESC: 'Closed', FINALDATE: '2018-03-02T00:00:00' }),
];

/** A CKAN server for package_show + paged datastore_search, per resource id. */
function fakeCkan(byResource: Record<string, CkanRecord[]>) {
  return vi.fn(async (url: string) => {
    if (url.includes('package_show')) {
      return new Response(JSON.stringify({ success: true, result: { metadata_modified: VERSION, resources: Object.keys(byResource).map((id) => ({ id, last_modified: VERSION })) } }), { status: 200 });
    }
    const q = new URL(url).searchParams;
    const all = byResource[q.get('resource_id') ?? ''] ?? [];
    const limit = Number(q.get('limit'));
    const offset = Number(q.get('offset'));
    return new Response(JSON.stringify({ success: true, result: { records: all.slice(offset, offset + limit), total: all.length } }), { status: 200 });
  });
}

/**
 * The DB answers only. `executeWrite` runs for real: per slice it reads the prior status (`prior`), runs the
 * generated upsert (every key new → RETURNING is_insert), the R-DZ touch (`touchedPerSlice`) and the derived
 * ledger upsert (one RETURNING row per bound ledger row).
 */
interface PoolOpts { prior?: Record<string, string | null>; unchanged?: string[]; touched?: number; ledgerFail?: boolean }
function fakePool(opts: PoolOpts = {}) {
  let sliceKeys: string[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    // R-DY (c): the conflict_index catalog probe — the shape migration 278's unique index reports.
    if (/FROM pg_index/.test(sql)) return { rows: [{ is_unique: true, is_partial: false, table_name: 'lifecycle_status_history', exprs: LEDGER_EXPRS }] };
    // R-CX (ii): the key column type the touch / prior read cast their UNNEST arrays to.
    if (/SELECT data_type FROM information_schema.columns/.test(sql)) return { rows: [{ data_type: 'text' }] };
    if (/^\s*SELECT\b[\s\S]*\bFROM\s+"?coa_applications"?/i.test(sql) && Array.isArray(params[0])) {
      sliceKeys = (params[0] as unknown[]).map(String);
      return { rows: sliceKeys.filter((k) => opts.prior && k in opts.prior).map((k) => ({ application_number: k, status: opts.prior![k] })) };
    }
    if (/INSERT INTO\s+"?coa_applications"?/i.test(sql)) {
      // a new key RETURNs is_insert; a prior key RETURNs is_insert=false unless its data_hash is unchanged (no RETURNING row).
      const fed = sliceKeys.filter((k) => !(opts.unchanged ?? []).includes(k));
      return { rows: fed.map((k) => ({ is_insert: !(opts.prior && k in opts.prior) })) };
    }
    if (/^\s*UPDATE\s+"?coa_applications"?/i.test(sql)) return { rows: [], rowCount: opts.touched ?? 0 };
    if (/INSERT INTO\s+"?lifecycle_status_history"?/i.test(sql)) {
      if (opts.ledgerFail) throw new Error('ledger insert failed');
      const rows = (sql.match(/\(\$\d+/g) || []).length;
      return { rows: Array.from({ length: rows }, () => ({ is_insert: true })) };
    }
    return { rows: [] };
  };
  return { query, connect: async () => ({ query, release: () => {} }) };
}

function stubs() {
  return [
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({}),
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null }),
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false }),
  ];
}

/** Runs the real dispatch; returns the pre_write ctx(s) the gate built and the final-pass ctx runWithPool builds. */
async function dispatch(opts: PoolOpts & { full: boolean; d?: any; active?: CkanRecord[]; closed?: CkanRecord[]; newestHearing?: string | null }) {
  const d = opts.d ?? descriptor();
  const restore = stubs();
  if (opts.full) restore.push(vi.spyOn(stalenessLib, 'resolveOverrides').mockReturnValue(Object.freeze({ force_run: false, force_full: true, dry_run: false })));
  const preWrite: Array<Record<string, unknown>> = [];
  const sink: Record<string, unknown> = {};
  const checks = d.checks.map((c: { id: string }) => c.id);
  const stepCtx = { checks, descriptor: d, config: CONFIG, clock: () => RUN_AT.getTime(), log: noopLog };
  const realGate = stepLib.makePreWriteGate({ descriptor: d, chainId: null, stepCtx, compute, config: CONFIG, sink });
  const pool = fakePool(opts);
  try {
    const ingest = await stepLib.ingestPrimaries({
      descriptor: d, pool, compute, config: CONFIG, fetchImpl: fakeCkan({ [ACTIVE_ID]: opts.active ?? ACTIVE, [CLOSED_ID]: opts.closed ?? CLOSED }),
      chainId: null, log: noopLog, tag: '[coa-dispatch]', clockNow: RUN_AT,
      preWriteGate: async (s: Record<string, unknown>) => { preWrite.push(s); return realGate(s); },
    });
    // runWithPool's own hand-off for an ingest step: `{ acquired: ingest.acquired, written: ingest.written }`.
    const final = { ...stepCtx, pool: { query: async () => ({ rows: [{ newest_hearing: opts.newestHearing === undefined ? '2026-10-01' : opts.newestHearing }] }) }, acquired: ingest.acquired, written: ingest.written, prior: ingest.prior };
    return { ingest, preWrite, sink, final };
  } finally {
    for (const s of restore) s.mockRestore();
  }
}

async function runFinal(final: Record<string, unknown>) {
  const out: Record<string, { violations?: number; value?: number; detail?: unknown; inert?: boolean }> = {};
  const r = await compute({ ...final, report: (id: string, o: Record<string, unknown>) => { out[id] = o; } });
  return { out, meta: r.records_meta as Record<string, any> };
}

describe('COA-D12 — the union group keeps one emit sub-block per member (0x B6, R-DX (iii))', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the real descriptor passes 0x B6: emits[0].skeleton carries coa_active and coa_closed objects', async () => {
    const d = descriptor();
    expect(d.emits[0].skeleton.coa_active).toEqual({});
    expect(d.emits[0].skeleton.coa_closed).toEqual({});
    const { ingest } = await dispatch({ full: false });
    expect(ingest.acquired.primaries.coa_active.outcome).toBe('loaded');
  });

  it('control: without the sub-blocks the runner refuses at B6 before any I/O', async () => {
    const d = descriptor();
    delete d.emits[0].skeleton.coa_active;
    delete d.emits[0].skeleton.coa_closed;
    await expect(dispatch({ full: false, d })).rejects.toThrow(/B6/);
  });
});

describe('COA-D13 — compute reads the ctx the ingestPrimaries dispatch builds (Spec 124 R-EW)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('full mode (union of Active + Closed): the final pass reports the real counters, never 0', async () => {
    const { final, ingest } = await dispatch({ full: true });
    expect(ingest.acquired.primaries.coa_active.union).toEqual(['coa_active', 'coa_closed']);
    const { out, meta } = await runFinal(final);
    // 6 raw records; 1 blank key never reaches shapeRecord (runner bad key); 5 shaped; A3 deduplicated once → 4 rows.
    expect(meta.coa_load).toEqual({
      records_fetched: 6, records_mapped: 5, records_skipped: 1, skip_reasons: { missing_app_num: 1 },
      records_deduplicated: 4, schema_mismatch_count: 0,
    });
    expect(out.records_fetched?.value).toBe(6);
    expect(out.zero_records?.violations).toBe(0);
    expect(out.records_inserted?.value).toBe(4);
    expect(out.records_updated?.value).toBe(0);
    // every key is new (no prior status) → one ledger row per written application (R-DY), counted from by_target.e1
    expect(out.lifecycle_status_history_inserted?.value).toBe(4);
    expect(meta.lifecycle_status_history_written).toBe(4);
    expect(out.zoning_designation_null?.violations).toBe(0);
    expect(out.max_days_stale?.inert).not.toBe(true);
  });

  it('incremental mode (Active only, Closed unselected): the final pass reads the selected member', async () => {
    const { final, ingest } = await dispatch({ full: false, prior: { A1: 'Hearing Scheduled', A2: 'Approved' } });
    expect(ingest.acquired.primaries.coa_closed).toEqual({ selected: false, reason: 'mode', target: 'coa_applications' });
    const { out, meta } = await runFinal(final);
    expect(meta.coa_load).toMatchObject({ records_fetched: 4, records_mapped: 3, records_skipped: 1, records_deduplicated: 3 });
    expect(out.records_inserted?.value).toBe(1);
    expect(out.records_updated?.value).toBe(2);
    // A2 changed status (Approved → Hearing Scheduled) and A3 is new; A1 is unchanged
    expect(meta.lifecycle_status_history_written).toBe(2);
  });

  it('the R-DZ touch count reaches compute through written.by_target (records_touched, the R-EX rerun-proof source)', async () => {
    const { final } = await dispatch({ full: false, prior: { A1: 'Hearing Scheduled', A2: 'Hearing Scheduled', A3: 'Hearing Scheduled' }, unchanged: ['A1', 'A2', 'A3'], touched: 3 });
    expect(final.written.by_target.coa_applications.touched).toBe(3);
    const { out } = await runFinal(final);
    expect(out.records_touched?.value).toBe(3);
  });

  it('the pre_write pass (real makePreWriteGate) scores schema_mismatch_count over the union members\' own headers', async () => {
    const { preWrite, sink } = await dispatch({ full: true });
    expect(preWrite).toHaveLength(1);
    expect(preWrite[0]!.primary).toBe('coa_active+coa_closed');
    expect(sink.schema_mismatch_count).toEqual({ violations: 0, detail: [] });
  });

  it('skip_rate is a percent of fetched; zoning_designation_null fires only when every written row is null', async () => {
    const { final } = await dispatch({ full: true });
    const { out } = await runFinal(final);
    expect(out.skip_rate?.value).toBeCloseTo(100 / 6, 10);
    const allNull = await dispatch({ full: false, active: ACTIVE.map((r) => ({ ...r, ZONING_DESIGNATION: null })) });
    expect((await runFinal(allNull.final)).out.zoning_designation_null).toEqual({ violations: 1, detail: 3 });
  });

  it('schema_mismatch_count (pre_write) names the CRITICAL field a member\'s own header lacks, and the write is refused (max_days_stale inert)', async () => {
    const closed = CLOSED.map((r) => { const { STATUSDESC: _drop, ...rest } = r; return rest; });
    const { sink, final, ingest } = await dispatch({ full: true, closed });
    expect(sink.schema_mismatch_count).toMatchObject({ violations: 1, detail: ['STATUSDESC'] });
    expect(ingest.acquired.primaries.coa_active.outcome).toBe('write_skipped');
    const { out } = await runFinal(final);
    expect(out.max_days_stale?.inert).toBe(true);
    expect(out.records_inserted?.value).toBe(0);
  });

  it('R-DM: a failed ledger write is counted in by_target.e1.errors and rolled back to its savepoint; the upsert stands', async () => {
    const { final } = await dispatch({ full: false, ledgerFail: true });
    const { out, meta } = await runFinal(final);
    expect(out.lifecycle_status_history_errors?.violations).toBe(1);
    expect(meta.lifecycle_status_history_written).toBe(0);
    expect(out.records_inserted?.value).toBe(3);
  });

  it('COA-D6: max_days_stale reads the newest hearing on/before the run date; inert without one', async () => {
    const d6 = await dispatch({ full: false, newestHearing: '2026-08-01' });
    expect((await runFinal(d6.final)).out.max_days_stale).toEqual({ value: 78, detail: '2026-08-01' });
    const none = await dispatch({ full: false, newestHearing: null });
    expect((await runFinal(none.final)).out.max_days_stale?.inert).toBe(true);
  });

  it('R-ET: lifecycle_status_history_written is the same count the check row reports (one source); an undeclared check id is refused', async () => {
    const { final } = await dispatch({ full: true });
    const { out, meta } = await runFinal(final);
    expect(meta.lifecycle_status_history_written).toBe(out.lifecycle_status_history_inserted?.value);
    await expect(runFinal({ ...final, checks: ['nope'] })).rejects.toThrow(/no function in the compute dispatch table/);
  });
});
