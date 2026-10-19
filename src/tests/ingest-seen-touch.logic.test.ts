// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DZ (seen-touch column; runner-lane draft
//            R-DW, operator y 2026-10-18 ruling 5); Spec 122 §8 RE-FREEZE #37
//
// R-DZ — `columns[].written` gains "seen": the column is bound to the runner clock (run_at, never
// compute), inserted, set on conflict, EXCLUDED from the guard, and TOUCHED for every fed key whose row
// the guard skipped: `UPDATE <t> AS t SET <col> = $1 FROM UNNEST(<typed full-key arrays>) AS v(<keys>)
// WHERE <key match> AND t.<col> IS DISTINCT FROM $1`, per slice, after the upsert, in the same
// transaction. Counter `written.touched`; conservation adds touched <= carried - inserted - updated.
// At most one seen column per target; a compute-bound value for a seen column is refused.
// Red-first: RED on the pre-#37 runner ("seen" is not a `written` value; no touch statement) and flips at
// RE-FREEZE #37. Gate K evidence: docs/reports/red-evidence/runner-lane/r-dz-seen-touch.json.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const conservationLib = require(join(process.cwd(), 'scripts/lib/step/conservation.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
const LOAD_WSIB = require(join(process.cwd(), 'scripts/load-wsib.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-18T05:00:00Z');

const seenSpec = () => ({
  table: 'permits_x',
  key: ['permit_num', 'revision_num'],
  key_sql_type: 'TEXT',
  columns: [
    { name: 'permit_num', written: 'step' },
    { name: 'revision_num', written: 'step' },
    { name: 'status', written: 'step' },
    { name: 'last_seen_at', written: 'seen' },
  ],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: 'all_declared', scope: 'none' },
  retract: 'none',
});
const desc = (spec = seenSpec()) => ({ identity: { name: 'x', archetype: 'INGESTOR' }, outputs: { writes: [spec] }, guards: { srid: 'none' } });

function pool(touchedRows = 2, insertRows: Array<Record<string, unknown>> = []) {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    // R-CX (ii): the catalog types the full key for the touch's UNNEST arrays
    if (/FROM information_schema\.columns/i.test(text)) return { rows: [{ data_type: 'text' }], rowCount: 1 };
    if (/^INSERT INTO permits_x/.test(text)) return { rows: insertRows, rowCount: insertRows.length };
    if (/^UPDATE permits_x AS t SET last_seen_at/.test(text)) return { rows: [], rowCount: touchedRows };
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const carried = [{ permit_num: 'P1', revision_num: '00', status: 'Issued' }, { permit_num: 'P2', revision_num: '01', status: 'Issued' }];
const runWrite = (p: ReturnType<typeof pool>) => writeLib.executeWrite(p, {
  plan: writeLib.buildWritePlan(seenSpec(), desc()), writeSpec: seenSpec(), carried,
  columnValues: (r: Record<string, unknown>) => ({ ...r, last_seen_at: RUN_AT }), shouldSkipDelete: () => false,
  log: noopLog, tag: '[r-dz]', runAt: RUN_AT,
});

describe('R-DZ — columns[].written "seen"', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the seen column is inserted and set on conflict, never guarded (also under all_declared), and the plan carries the touch (flips at RE-FREEZE #37)', () => {
    const plan = writeLib.buildWritePlan(seenSpec(), desc());
    expect(plan.step_columns).toContain('last_seen_at');
    expect(plan.upsert_sql).toContain('last_seen_at = EXCLUDED.last_seen_at');
    expect(plan.guard_columns).not.toContain('last_seen_at');
    expect(plan.upsert_sql).not.toMatch(/permits_x\.last_seen_at IS DISTINCT FROM EXCLUDED\.last_seen_at/);
    expect(plan.seen_column).toBe('last_seen_at');
  });

  it('composite key: the touch matches the full key from typed UNNEST arrays and skips rows already at run_at (flips at RE-FREEZE #37)', () => {
    const plan = writeLib.buildWritePlan(seenSpec(), desc());
    expect(plan.touch_sql).toBe(
      'UPDATE permits_x AS t SET last_seen_at = $1 FROM UNNEST($2::TEXT[], $3::TEXT[]) AS v(permit_num, revision_num) '
      + 'WHERE t.permit_num = v.permit_num AND t.revision_num = v.revision_num AND t.last_seen_at IS DISTINCT FROM $1;',
    );
  });

  it('unchanged keys are touched: after a guard-skipped upsert the touch runs with run_at and the key arrays; written.touched counts it (flips at RE-FREEZE #37)', async () => {
    const p = pool(2, []);
    const out = await runWrite(p);
    const touch = p.calls.find((c) => /^UPDATE permits_x AS t/.test(c.text))!;
    expect(touch.params).toEqual([RUN_AT, ['P1', 'P2'], ['00', '01']]);
    expect(out.touched).toBe(2);
    expect(out.inserted + out.updated).toBe(0);
  });

  it('the touch runs inside the write transaction, after the upsert (flips at RE-FREEZE #37)', async () => {
    const p = pool(0, [{ is_insert: true }, { is_insert: false }]);
    await runWrite(p);
    const order = p.calls.map((c) => (/^BEGIN/.test(c.text) ? 'BEGIN' : /^COMMIT/.test(c.text) ? 'COMMIT' : /^INSERT INTO permits_x/.test(c.text) ? 'UPSERT' : /^UPDATE permits_x AS t/.test(c.text) ? 'TOUCH' : 'OTHER'));
    expect(order).toEqual(['BEGIN', 'UPSERT', 'TOUCH', 'COMMIT']);
  });

  it('conservation: touched <= carried - inserted - updated, else RowConservationError (flips at RE-FREEZE #37)', () => {
    const acquired = { rows_read: 2 };
    expect(() => conservationLib.rowConservation(acquired, { inserted: 1, updated: 0, unchanged: 1, touched: 1 })).not.toThrow();
    expect(() => conservationLib.rowConservation(acquired, { inserted: 1, updated: 0, unchanged: 1, touched: 2 })).toThrow(/touched 2/);
  });

  it('a compute-bound value for a seen column is refused by name (the clock is the runner\'s) (flips at RE-FREEZE #37)', async () => {
    vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
      features: [{ permit_num: 'P1', record: { permit_num: 'P1' } }],
      acquired: { feature_count: 1, rows_parsed: 1, bad_key_count: 0, source_dataset_version: 'v', content_hash: 'h' },
    });
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({});
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null });
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false });
    const exec = vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({ inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0, touched: 0 });
    const d = { ...desc(), inputs: { reads: { externals: [{ id: 'p', kind: 'http_api', format: 'csv', url: 'https://ex/p.csv', key_property: 'permit_num' }], tables: [] } }, emits: [{ key: 'k', type: 'object', skeleton: 'none', consumers: [] }], staleness: { trigger: 'none', on_prior_run_error: 'warn_row' }, execution: { shape: 'ingest', network: { timeout: '30s', retries: 0, retry_backoff_from_config: 'none' } }, terminals: [] };
    const mk = (withSeen: boolean) => ({
      descriptor: d, pool: pool(), config: {}, fetchImpl: async () => { throw new Error('no network'); }, chainId: null, log: noopLog, tag: '[r-dz]', clockNow: RUN_AT, preWriteGate: null,
      compute: { shapeRecord: () => ({ revision_num: '00', status: 'Issued', ...(withSeen ? { last_seen_at: new Date(0) } : {}) }), dedupeBySourceId: (r: unknown[]) => ({ kept: r, duplicateCount: 0 }), shouldSkipDelete: () => false },
    });
    await expect(stepLib.runIngestPhase(mk(true))).rejects.toThrow(/written "seen"/);
    const ok = await stepLib.runIngestPhase(mk(false));
    expect(ok.reason).toBe('loaded');
    const a = exec.mock.calls[0]![1] as { columnValues: (r: Record<string, unknown>) => Record<string, unknown>; runAt: Date };
    expect(a.columnValues({ permit_num: 'P1' }).last_seen_at).toBe(RUN_AT);
    expect(a.runAt).toBe(RUN_AT);
  });

  it('validate: the schema admits "seen"; two seen columns on one target are refused (flips at RE-FREEZE #37)', () => {
    const d = clone(LOAD_WSIB) as Record<string, any>;
    d.outputs.writes[0].columns.find((c: { name: string }) => c.name === 'last_seen_at').written = 'seen';
    expect(() => validateLib.validateDescriptor(d)).not.toThrow();
    const two = clone(d);
    two.outputs.writes[0].columns.find((c: { name: string }) => c.name === 'is_gta').written = 'seen';
    two.outputs.writes[0].write_discipline.guard_columns = two.outputs.writes[0].write_discipline.guard_columns.filter((c: string) => c !== 'is_gta');
    expect(() => validateLib.validateDescriptor(two)).toThrow(/seen/);
  });
});
