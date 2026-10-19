// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DY (derived secondary target with a
//            runner-owned prior-state lookup; runner-lane draft R-DV, operator y 2026-10-18, rulings 3, 4, 16);
//            Spec 122 §8 RE-FREEZE #37
//
// R-DY — an INGESTOR may declare, after its one primary-fed write, DERIVED targets
// `outputs.writes[i].derive {from: writes[0].table, prior_columns, why}`. Per R-CU slice, inside the
// ONE primary transaction, the runner (1) reads prior state of the slice's keys from `from`
// (prior_columns ⊆ inputs.reads.tables[from].columns), (2) runs the primary upsert, (3) runs the R-DZ
// touch if declared, (4) calls the pure compute export deriveRows(table, sliceRows, priorByKey, ctx),
// (5) writes the derived rows through the derived target's generated plan. A target may declare
// `write_discipline.conflict_index`: the runner probes pg_index (unique, on the table, not partial) and
// renders ON CONFLICT from pg_get_indexdef — a missing/non-unique/partial index refuses before any hook.
// (d): one transaction per target in R-CU slices (no per-batch transaction form).
// Red-first: the it.fails cases are RED on the pre-#37 runner (writes.length !== 1; executeWrite has no
// derived arm; no conflict_index; the schema refuses `derive`) and flip at RE-FREEZE #37. The Postgres
// acceptance of the expression conflict target (T4 db) and the legacy dataset equivalence (T6) are
// *.db.test.ts (R-DH), owed to the S5 test:db run. Gate K evidence:
// docs/reports/red-evidence/runner-lane/r-dy-derived-target.json.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
const LOAD_WSIB = require(join(process.cwd(), 'scripts/load-wsib.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
const LEDGER_INDEX = 'uniq_lifecycle_status_history_natural_key';
const LEDGER_EXPRS = ['lead_id', 'to_status', "date_trunc('second'::text, (transitioned_at AT TIME ZONE 'UTC'::text))"];

const primarySpec = () => ({
  table: 'permits_x',
  key: ['permit_num', 'revision_num'],
  key_sql_type: 'TEXT',
  columns: [
    { name: 'permit_num', written: 'step' },
    { name: 'revision_num', written: 'step' },
    { name: 'status', written: 'step' },
  ],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['status'], scope: 'none' },
  retract: 'none',
});

const ledgerSpec = () => ({
  table: 'lifecycle_status_history',
  key: ['lead_id', 'to_status', 'transitioned_at'],
  key_sql_type: 'TEXT',
  derive: { from: 'permits_x', prior_columns: ['status'], why: { text: 'a status transition is a ledger row', liveness: 'none' } },
  columns: [
    { name: 'lead_id', written: 'insert_only' },
    { name: 'from_status', written: 'insert_only' },
    { name: 'to_status', written: 'insert_only' },
    { name: 'transitioned_at', written: 'insert_only' },
    { name: 'event_date', written: 'step', on_empty: 'preserve_null' },
  ],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['event_date'], scope: 'none', conflict_index: LEDGER_INDEX },
  retract: 'none',
});

function derivedIngestor(): Record<string, any> {
  return {
    identity: { name: 'x_derived', archetype: 'INGESTOR', spec_version: '1.0' },
    inputs: {
      reads: {
        externals: [{ id: 'p', kind: 'http_api', format: 'csv', url: 'https://ex/p.csv', key_property: 'permit_num' }],
        tables: [{ table: 'permits_x', columns: ['permit_num', 'revision_num', 'status'] }],
      },
    },
    outputs: { writes: [primarySpec(), ledgerSpec()] },
    emits: [{ key: 'k', type: 'object', skeleton: 'none', consumers: [] }],
    staleness: { trigger: 'none', on_prior_run_error: 'warn_row' },
    guards: { srid: 'none', requires: [] },
    execution: { shape: 'ingest', network: { timeout: '30s', retries: 0, retry_backoff_from_config: 'none' } },
    terminals: [],
    invariants: 'none',
    plausibility: 'none',
  };
}

/** A pool whose pg_index probe answers per index name, and whose client records every statement. */
function recordingPool(opts: { index?: { unique: boolean; partial: boolean; exprs: string[] } | null; priorRows?: Array<Record<string, unknown>>; failOn?: RegExp; failRollback?: boolean } = {}) {
  const calls: string[] = [];
  const answer = (text: string) => {
    if (/FROM pg_index/i.test(text)) {
      return { rows: opts.index === null ? [] : [{ is_unique: opts.index?.unique ?? true, is_partial: opts.index?.partial ?? false, table_name: 'lifecycle_status_history', exprs: opts.index?.exprs ?? LEDGER_EXPRS }] };
    }
    // R-CX (ii): the catalog types the full key for the prior read's UNNEST arrays
    if (/FROM information_schema\.columns/i.test(text)) return { rows: [{ data_type: 'text' }] };
    if (/^\s*SELECT .* FROM permits_x/i.test(text)) return { rows: opts.priorRows ?? [] };
    if (/INSERT INTO/i.test(text)) return { rows: [{ is_insert: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const query = async (text: string) => {
    calls.push(text);
    if (opts.failOn && opts.failOn.test(text)) throw new Error(`forced failure on ${text.slice(0, 40)}`);
    if (opts.failRollback && /ROLLBACK TO SAVEPOINT/i.test(text)) throw new Error('rollback to savepoint failed');
    return answer(text);
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const keyOf = (row: Record<string, unknown>) => JSON.stringify([String(row.permit_num), String(row.revision_num)]);

describe('R-DY — derived secondary target', () => {
  afterEach(() => vi.restoreAllMocks());

  it('T1: a two-write INGESTOR whose second write declares derive runs; the derived target reaches executeWrite (flips at RE-FREEZE #37)', async () => {
    vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false, reason: 'fresh' }, tier2: { skip: false, reason: 'fresh' }, emitBlock: null,
      features: [{ permit_num: 'P1', record: { permit_num: 'P1', revision_num: '00', status: 'Issued' } }],
      acquired: { feature_count: 1, rows_parsed: 1, bad_key_count: 0, source_dataset_version: 'v', content_hash: 'h' },
    });
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({});
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null });
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false });
    const exec = vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({ inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0, e1: { inserted: 1, updated: 0, errors: 0 } });
    const compute = {
      shapeRecord: (r: Record<string, unknown>) => ({ revision_num: r.revision_num, status: r.status }),
      dedupeBySourceId: (rows: unknown[]) => ({ kept: rows, duplicateCount: 0 }),
      deriveRows: () => [],
      shouldSkipDelete: () => false,
    };
    const out = await stepLib.runIngestPhase({
      descriptor: derivedIngestor(), pool: recordingPool(), compute, config: {}, fetchImpl: async () => { throw new Error('no network'); },
      chainId: null, log: noopLog, tag: '[r-dy]', clockNow: new Date('2026-10-18T00:00:00Z'), preWriteGate: null,
    });
    expect(out.reason).toBe('loaded');
    const a = exec.mock.calls[0]![1] as { derived: { targets: Array<{ index: number; plan: { upsert_sql: string } }> } };
    expect(a.derived.targets.map((t) => t.index)).toEqual([1]);
    expect(a.derived.targets[0]!.plan.upsert_sql).toContain(`ON CONFLICT (${LEDGER_EXPRS.join(', ')})`);
  });

  it('T2: inside ONE transaction, per slice: prior read, then the primary upsert, then the derived write (flips at RE-FREEZE #37)', async () => {
    const d = derivedIngestor();
    const pool = recordingPool({ priorRows: [] });
    const plan = writeLib.buildWritePlan(d.outputs.writes[0], d);
    const ledgerPlan = writeLib.buildWritePlan(d.outputs.writes[1], d, { conflictTarget: LEDGER_EXPRS });
    const out = await writeLib.executeWrite(pool, {
      plan, writeSpec: d.outputs.writes[0], carried: [{ permit_num: 'P1', revision_num: '00', status: 'Issued' }],
      columnValues: (r: unknown) => r, shouldSkipDelete: () => false, log: noopLog, tag: '[r-dy]',
      derived: {
        prior: writeLib.buildPriorReadSql({ from: 'permits_x', keys: ['permit_num', 'revision_num'], keyTypes: ['text', 'text'], priorColumns: ['status'] }),
        keyOf,
        deriveRows: (_t: string, slice: Array<Record<string, unknown>>) => slice.map((r) => ({ lead_id: `${String(r.permit_num)}--${String(r.revision_num)}`, from_status: null, to_status: r.status, transitioned_at: '2026-10-18', event_date: null })),
        targets: [{ index: 1, plan: ledgerPlan, onError: 'fail_step' }],
      },
    });
    const order = pool.calls.map((c) => (/^BEGIN/.test(c) ? 'BEGIN' : /^COMMIT/.test(c) ? 'COMMIT' : /FROM permits_x/.test(c) ? 'PRIOR' : /INSERT INTO permits_x/.test(c) ? 'UPSERT' : /INSERT INTO lifecycle_status_history/.test(c) ? 'DERIVED' : 'OTHER'));
    expect(order).toEqual(['BEGIN', 'PRIOR', 'UPSERT', 'DERIVED', 'COMMIT']);
    expect(out.e1).toEqual({ inserted: 1, updated: 0, errors: 0 });
    expect(out.inserted).toBe(1);
  });

  it('T3: deriveRows receives prior state for an existing key and undefined for a new key (legacy "treat as NULL") (flips at RE-FREEZE #37)', async () => {
    const d = derivedIngestor();
    const pool = recordingPool({ priorRows: [{ permit_num: 'P1', revision_num: '00', status: 'Issued' }] });
    const seen: unknown[] = [];
    await writeLib.executeWrite(pool, {
      plan: writeLib.buildWritePlan(d.outputs.writes[0], d), writeSpec: d.outputs.writes[0],
      carried: [{ permit_num: 'P1', revision_num: '00', status: 'Inspection' }, { permit_num: 'P2', revision_num: '00', status: 'Issued' }],
      columnValues: (r: unknown) => r, shouldSkipDelete: () => false, log: noopLog, tag: '[r-dy]',
      derived: {
        prior: writeLib.buildPriorReadSql({ from: 'permits_x', keys: ['permit_num', 'revision_num'], keyTypes: ['text', 'text'], priorColumns: ['status'] }),
        keyOf,
        deriveRows: (_t: string, slice: Array<Record<string, unknown>>, priorByKey: Map<string, Record<string, unknown>>) => { for (const r of slice) seen.push(priorByKey.get(keyOf(r))?.status); return []; },
        targets: [{ index: 1, plan: writeLib.buildWritePlan(d.outputs.writes[1], d, { conflictTarget: LEDGER_EXPRS }), onError: 'fail_step' }],
      },
    });
    expect(seen).toEqual(['Issued', undefined]);
  });

  it('T4: conflict_index renders ON CONFLICT from the probed index expressions; the guard stays preserve_null on event_date (flips at RE-FREEZE #37)', async () => {
    const d = derivedIngestor();
    const probed = await writeLib.probeConflictIndex(recordingPool(), 'lifecycle_status_history', LEDGER_INDEX);
    expect(probed.expressions).toEqual(LEDGER_EXPRS);
    const plan = writeLib.buildWritePlan(d.outputs.writes[1], d, { conflictTarget: probed.expressions });
    expect(plan.upsert_sql).toContain("ON CONFLICT (lead_id, to_status, date_trunc('second'::text, (transitioned_at AT TIME ZONE 'UTC'::text))) DO UPDATE SET event_date = COALESCE(EXCLUDED.event_date, lifecycle_status_history.event_date)");
    expect(plan.upsert_sql).toContain('(EXCLUDED.event_date IS NOT NULL AND lifecycle_status_history.event_date IS DISTINCT FROM EXCLUDED.event_date)');
  });

  it('T5: a missing, non-unique or partial conflict_index is refused by name (failed_missing_precondition), before any acquisition (flips at RE-FREEZE #37)', async () => {
    await expect(writeLib.probeConflictIndex(recordingPool({ index: null }), 'lifecycle_status_history', LEDGER_INDEX)).rejects.toThrow(/conflict_index "uniq_lifecycle_status_history_natural_key".*not found/);
    await expect(writeLib.probeConflictIndex(recordingPool({ index: { unique: false, partial: false, exprs: LEDGER_EXPRS } }), 'lifecycle_status_history', LEDGER_INDEX)).rejects.toThrow(/not unique/);
    await expect(writeLib.probeConflictIndex(recordingPool({ index: { unique: true, partial: true, exprs: LEDGER_EXPRS } }), 'lifecycle_status_history', LEDGER_INDEX)).rejects.toThrow(/partial/);
    const acq = vi.spyOn(acquireLib, 'acquireExternal');
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({});
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null });
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false });
    const err = await stepLib.runIngestPhase({
      descriptor: derivedIngestor(), pool: recordingPool({ index: null }), compute: { shapeRecord: () => ({}), dedupeBySourceId: (r: unknown[]) => ({ kept: r, duplicateCount: 0 }), deriveRows: () => [] },
      config: {}, fetchImpl: async () => { throw new Error('no network'); }, chainId: null, log: noopLog, tag: '[r-dy]', clockNow: new Date(), preWriteGate: null,
    }).catch((e: Error & { status?: string }) => e);
    expect(String(err && (err as Error).message)).toMatch(/conflict_index/);
    expect((err as { status?: string }).status).toBe('failed_missing_precondition');
    expect(acq).not.toHaveBeenCalled();
  });

  it('T7: the schema admits writes[i].derive on an INGESTOR at index >= 1 from writes[0].table, and refuses it on writes[0] (flips at RE-FREEZE #37)', () => {
    const base = clone(LOAD_WSIB) as Record<string, any>;
    base.inputs.reads.tables = [{ table: 'wsib_registry', columns: ['legal_name_normalized', 'mailing_address', 'trade_name'] }];
    const w0 = base.outputs.writes[0];
    const derived = {
      ...clone(w0),
      table: 'wsib_registry_history',
      derive: { from: 'wsib_registry', prior_columns: ['trade_name'], why: { text: 'a trade-name change is a history row', liveness: 'none' } },
    };
    const good = clone(base);
    good.outputs.writes.push(derived);
    expect(() => validateLib.validateDescriptor(good)).not.toThrow();
    const bad = clone(base);
    bad.outputs.writes[0].derive = { from: 'wsib_registry', prior_columns: ['trade_name'], why: { text: 'not allowed on the primary', liveness: 'none' } };
    expect(() => validateLib.validateDescriptor(bad)).toThrow(/derive/);
    const badFrom = clone(good);
    badFrom.outputs.writes[1].derive.from = 'elsewhere';
    expect(() => validateLib.validateDescriptor(badFrom)).toThrow(/derive\.from/);
    const badPrior = clone(good);
    badPrior.outputs.writes[1].derive.prior_columns = ['undeclared_col'];
    expect(() => validateLib.validateDescriptor(badPrior)).toThrow(/prior_columns/);
  });
});
