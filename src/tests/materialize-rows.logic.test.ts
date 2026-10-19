// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EH (the MATERIALIZER ROWS arm; wave-4 Q-MZ,
//            operator y 2026-10-18; draft .cursor/v3-materializer-form-ruling-2026-10-18.md); Spec 122 §8 RE-FREEZE #37
//
// A MATERIALIZER declaring execution.materialize_form "rows" computes its rows in JavaScript; the runner owns every
// read, write and transaction. Per batch, ONE transaction, writes[] in order (rows / replace_keys keyed by the runner's 1-based targetKey, e1 = writes[0]): A (generated guarded upsert, which now
// honours guard "none"), F (generated keyed replace, retract "replace_keys", immediately followed by an A target on the
// same table), G (generated keyed update from compute rows, write_discipline.rows "compute"). key_prefix refuses an
// out-of-family row by name; role:"lookup" tables are read once, before the loop. Red-first: every case is RED on the
// pre-#37 runner (no arm, no schema field) — gate K evidence docs/reports/red-evidence/runner-lane/r-eh-materialize-rows.json.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-18T00:00:00Z');
const why = (text: string) => ({ text, liveness: { kind: 'file', ref: 'scripts/lib/step/index.js' } });

const COLUMN_TYPES: Record<string, string> = {
  'lead_products.lead_id': 'character varying',
  'coa_applications.id': 'integer',
  'coa_applications.trade_classified_at': 'timestamp with time zone',
  'coa_applications.cost_source': 'character varying',
};

function rowsDescriptor(): Record<string, any> {
  const prefix = { column: 'lead_id', prefix: 'coa:' };
  return {
    identity: { name: 'x_rows', archetype: 'MATERIALIZER', spec_version: '1.0' },
    inputs: {
      reads: {
        tables: [
          { table: 'coa_applications', columns: ['id', 'lead_id', 'trade_classified_at'] },
          { table: 'trades', columns: ['id', 'slug'], role: 'lookup', unique_on: ['slug'], on_empty: 'fail' },
        ],
      },
    },
    outputs: {
      writes: [
        {
          table: 'lead_trades', key: ['lead_id', 'trade_id'],
          columns: [{ name: 'lead_id', written: 'step', source: 'compute' }, { name: 'trade_id', written: 'step', source: 'compute' }, { name: 'tier', written: 'step', source: 'compute' }, { name: 'classified_at', written: 'step', source: 'run_at' }],
          write_discipline: { class: 'guarded_upsert', guard: 'none', guard_why: why('parity'), guard_columns: 'all_declared', scope: 'none', key_prefix: prefix },
          retract: 'none',
        },
        {
          table: 'lead_products', key: ['lead_id'],
          columns: [{ name: 'lead_id', written: 'step', source: 'compute' }],
          write_discipline: { class: 'link_full_retraction', guard: 'none', guard_why: why('a delete'), guard_columns: 'all_declared', scope: 'none', key_prefix: prefix },
          retract: 'replace_keys',
        },
        {
          table: 'lead_products', key: ['lead_id', 'product_id'],
          columns: [{ name: 'lead_id', written: 'step', source: 'compute' }, { name: 'product_id', written: 'step', source: 'compute' }, { name: 'classified_at', written: 'step', source: 'run_at' }],
          write_discipline: { class: 'guarded_upsert', guard: 'none', guard_why: why('parity'), guard_columns: 'all_declared', scope: 'none', key_prefix: prefix },
          retract: 'none',
        },
        {
          table: 'coa_applications', key: ['id'],
          columns: [{ name: 'id', written: 'step', source: 'compute' }, { name: 'cost_source', written: 'step', source: 'compute' }, { name: 'trade_classified_at', written: 'step', source: 'run_at' }],
          write_discipline: { class: 'set_based_scoped', guard: 'is_distinct_from', guard_columns: ['cost_source'], scope: 'none', rows: 'compute' },
          retract: 'none',
        },
      ],
      invalidates: [],
    },
    staleness: { trigger: 'none', mode_select: 'none' },
    guards: { srid: 'none', requires: [] },
    recovery: { interrupted: 'none' },
    override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
    execution: {
      shape: 'materialize', batch: 2, batch_size_from_config: 'x_batch',
      materialize_form: 'rows',
      materialize_source: { table: 'coa_applications', key: 'id', pending: { predicate: 'trade_classified_at IS NULL', invalidated_by: 'coa_applications.scope_classified_at' }, why: why('keyset over id') },
    },
  };
}

type Pool = ReturnType<typeof fakePool>;
function fakePool(source: Array<Record<string, unknown>>, lookups: Record<string, Array<Record<string, unknown>>> = { trades: [{ id: 1, slug: 'plumbing' }] }) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const query = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    if (/information_schema\.columns/i.test(text) && Array.isArray(values)) {
      const t = COLUMN_TYPES[`${values[0]}.${values[1]}`];
      return { rows: t ? [{ data_type: t }] : [] };
    }
    if (text === 'STUB_COUNT') return { rows: [{ total: source.length }] };
    if (text === 'STUB_BATCH') {
      const last = Number((values ?? [])[0]);
      return { rows: source.filter((r) => Number(r.id) > last).slice(0, 2) };
    }
    if (text === 'STUB_POST') return { rows: [{ classified_total: 3 }] };
    if (text.startsWith('SELECT lead_id FROM lead_products WHERE')) return { rows: [{ lead_id: (values as string[][])[0]![0] }] };
    const lookup = /^SELECT .* FROM (\w+)$/.exec(text);
    if (lookup && lookups[lookup[1]!]) return { rows: lookups[lookup[1]!] };
    if (/^\s*INSERT INTO/i.test(text)) { const groups = (text.match(/\(\$\d+/g) || []).length; return { rows: Array.from({ length: groups }, () => ({ is_insert: true })), rowCount: groups }; }
    if (/^\s*(DELETE|UPDATE)/i.test(text)) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { sql, params, query, connect: async () => ({ query, release: () => {} }) };
}

function rowsCompute(extra: Record<string, unknown> = {}) {
  return {
    buildSourceSql: (_d: unknown, _c: unknown, { mode }: { mode: string }) => ({ count_sql: 'STUB_COUNT', count_binds: [], batch_sql: 'STUB_BATCH', batch_binds: ['last_key', 'batch_size'], mode }),
    materializeRows: (src: Array<{ id: number; lead_id: string }>, ctx: { lookups: Record<string, unknown[]> }) => ({
      rows: {
        e1: src.map((r) => ({ lead_id: r.lead_id, trade_id: 1, tier: 3 })),
        e3: src.filter((r) => r.id !== 2).map((r) => ({ lead_id: r.lead_id, product_id: 9 })),
        e4: src.map((r) => ({ id: r.id, cost_source: 'model' })),
      },
      replace_keys: { e2: src.map((r) => r.lead_id) },
      matched: { processed: src.length, lookups_seen: (ctx.lookups.trades ?? []).length, by_tier: { 3: src.length }, ids: src.map((r) => r.id) },
    }),
    ...extra,
  };
}

const SOURCE = [{ id: 1, lead_id: 'coa:1' }, { id: 2, lead_id: 'coa:2' }, { id: 3, lead_id: 'coa:3' }];
const run = (pool: Pool, compute: Record<string, unknown>, descriptor = rowsDescriptor()) => stepLib.runMaterializePhase({
  descriptor, pool, compute, config: { x_batch: 2 }, chainId: null, log: NOOP_LOG, tag: '[r-eg]', clockNow: RUN_AT, preWriteGate: null,
});

describe('R-EH — the MATERIALIZER ROWS arm (flips at RE-FREEZE #37)', () => {
  let persisted: Array<{ rows: unknown[]; table: string }> = [];
  let overrides = { force_full: false, force_run: false, dry_run: false };
  beforeEach(() => {
    persisted = [];
    overrides = { force_full: false, force_run: false, dry_run: false };
    vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(((rows: unknown[], table: string) => { persisted.push({ rows, table }); return { written: true, path: 'x', rows: rows.length }; }) as (...a: unknown[]) => unknown);
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({});
    vi.spyOn(stalenessLib, 'resolveOverrides').mockImplementation(() => Object.freeze({ ...overrides }));
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false });
    vi.spyOn(stalenessLib, 'ledgerGatedSkip').mockResolvedValue({ skip: false, reason: 'no_gate', gate: null });
    vi.spyOn(stalenessLib, 'readPriorEmit').mockResolvedValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('T1: the schema admits a three-target ROWS descriptor (A, F+A, G) with a lookup read — no AJV error touches a ROWS field', () => {
    const v = validateLib.compileStepSchema(validateLib.loadSchema());
    v(rowsDescriptor());
    const NEW = /materialize_form|materialize_source|replace_keys|key_prefix|unique_on|on_empty|\/role|\/rows\b|\/retract/;
    const touching = (v.errors || []).filter((e: { instancePath: string; params: unknown }) => NEW.test(`${e.instancePath} ${JSON.stringify(e.params)}`));
    expect(touching).toEqual([]);
  });

  it('T2: per batch — the source read, then A upsert, F delete, A upsert, G update inside ONE BEGIN/COMMIT, in writes[] order', async () => {
    const pool = fakePool(SOURCE);
    const out = await run(pool, rowsCompute());
    const s = pool.sql;
    const firstBatch = s.indexOf('STUB_BATCH');
    const begin = s.indexOf('BEGIN', firstBatch);
    const commit = s.indexOf('COMMIT', begin);
    const inTxn = s.slice(begin, commit).filter((x) => /^\s*(INSERT|DELETE|UPDATE)/i.test(x)).map((x) => x.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(inTxn).toEqual(['INSERT INTO lead_trades', 'DELETE FROM lead_products', 'INSERT INTO lead_products', 'UPDATE coa_applications AS']);
    expect(out.written.e1.inserted).toBe(3);
    expect(out.written.e2.deleted).toBe(2);
    expect(out.written.e4.rows_changed).toBe(2);
    expect(out.matched.processed).toBe(3);
    expect(out.matched.by_tier).toEqual({ 3: 3 });
    expect(out.matched.ids).toEqual([1, 2, 3]);
  });

  it('T3: guard "none" renders DO UPDATE SET with no WHERE; a guarded target still renders it', () => {
    const d = rowsDescriptor();
    const plain = writeLib.buildWritePlan(d.outputs.writes[0], d);
    expect(plain.upsert_sql).toMatch(/DO UPDATE SET [^\n]*\n/);
    expect(plain.upsert_sql).not.toMatch(/\n\s+WHERE /);
    d.outputs.writes[0].write_discipline.guard = 'is_distinct_from';
    expect(writeLib.buildWritePlan(d.outputs.writes[0], d).upsert_sql).toMatch(/\n\s+WHERE /);
  });

  it('T4: replace_keys deletes every key in replace_keys.e<i> (a key with zero new rows included), family-guarded, and before-images the rows', async () => {
    const pool = fakePool(SOURCE);
    await run(pool, rowsCompute());
    const at = pool.sql.findIndex((x) => x.startsWith('DELETE FROM lead_products'));
    expect(pool.sql[at]).toBe('DELETE FROM lead_products WHERE lead_id = ANY($1::character varying[]) AND starts_with(lead_id, $2);');
    expect(pool.params[at]).toEqual([['coa:1', 'coa:2'], 'coa:']);
    expect(persisted.some((p) => p.table === 'lead_products')).toBe(true);
  });

  it('T5: a G keyed update stamps run_at columns from the one RUN_AT capture and binds per-row values through typed arrays', async () => {
    const pool = fakePool(SOURCE);
    await run(pool, rowsCompute());
    const at = pool.sql.findIndex((x) => x.startsWith('UPDATE coa_applications AS'));
    expect(pool.sql[at]).toContain('FROM UNNEST($1::integer[], $2::character varying[], $3::timestamp with time zone[]) AS v(id, cost_source, trade_classified_at)');
    expect(pool.sql[at]).toContain('WHERE t.id = v.id AND (t.cost_source IS DISTINCT FROM v.cost_source)');
    expect(pool.params[at]).toEqual([[1, 2], ['model', 'model'], [RUN_AT, RUN_AT]]);
  });

  it('T5b (panel round 1): guard_columns "all_declared" on a G target expands to its non-clock set columns — never silently unguarded', () => {
    const d = rowsDescriptor();
    d.outputs.writes[3].write_discipline.guard_columns = 'all_declared';
    const g = writeLib.buildKeyedUpdateFromRowsSql(d.outputs.writes[3], { id: 'integer', cost_source: 'character varying', trade_classified_at: 'timestamp with time zone' });
    expect(g.sql).toContain('AND (t.cost_source IS DISTINCT FROM v.cost_source);');
  });

  it('T5c (panel round 1): a source batch whose last key does not advance refuses by name (no endless loop)', async () => {
    const stuck = fakePool(SOURCE);
    const q = stuck.query;
    stuck.query = async (text: string, values?: unknown[]) => (text === 'STUB_BATCH' ? { rows: [{ id: 1, lead_id: 'coa:1' }] } : q(text, values));
    await expect(run(stuck, rowsCompute())).rejects.toThrow(/did not advance/);
  });

  it('T6: a key_prefix violation refuses before the batch transaction, by name', async () => {
    const pool = fakePool([{ id: 1, lead_id: 'permit:1' }]);
    await expect(run(pool, rowsCompute())).rejects.toThrow(/key_prefix/);
    expect(pool.sql.some((x) => /^\s*(INSERT|DELETE|UPDATE)/i.test(x))).toBe(false);
  });

  it('T7: lookups are read once before the loop; a duplicate unique_on key, or an on_empty "fail" empty table, ends the run failed_missing_precondition with zero writes', async () => {
    const pool = fakePool(SOURCE);
    await run(pool, rowsCompute());
    expect(pool.sql.filter((x) => x === 'SELECT id, slug FROM trades')).toHaveLength(1);
    expect(pool.sql.indexOf('SELECT id, slug FROM trades')).toBeLessThan(pool.sql.indexOf('STUB_BATCH'));
    for (const lookups of [{ trades: [{ id: 1, slug: 'a' }, { id: 2, slug: 'a' }] }, { trades: [] }]) {
      const p = fakePool(SOURCE, lookups);
      const err = await run(p, rowsCompute()).catch((e: { status?: string }) => e);
      expect((err as { status?: string }).status).toBe('failed_missing_precondition');
      expect(p.sql.some((x) => /^\s*(INSERT|DELETE|UPDATE)/i.test(x))).toBe(false);
    }
  });

  it('T8: overrides.force_full hands mode "full" to buildSourceSql; dry_run issues zero DML and still reports matched', async () => {
    const modes: string[] = [];
    overrides = { force_full: true, force_run: false, dry_run: false };
    await run(fakePool(SOURCE), rowsCompute({ buildSourceSql: (_d: unknown, _c: unknown, o: { mode: string }) => { modes.push(o.mode); return { count_sql: 'STUB_COUNT', count_binds: [], batch_sql: 'STUB_BATCH', batch_binds: ['last_key', 'batch_size'] }; } }));
    expect(modes).toEqual(['full']);
    overrides = { force_full: false, force_run: false, dry_run: true };
    const pool = fakePool(SOURCE);
    const out = await run(pool, rowsCompute());
    expect(pool.sql.some((x) => /^\s*(INSERT|DELETE|UPDATE)/i.test(x))).toBe(false);
    expect(out.matched.processed).toBe(3);
  });

  it('T9 (GREEN pin): absent materialize_form keeps the insert-select arm (buildMaterializeSql, executeInsertSelectNoRetract)', async () => {
    const d = rowsDescriptor();
    delete d.execution.materialize_form;
    delete d.execution.materialize_source;
    const called: string[] = [];
    const compute = { buildMaterializeSql: () => { called.push('buildMaterializeSql'); return { pre_sql: 'STUB_PRE', batch_sql: 'INSERT INTO x SELECT 1 ON CONFLICT DO NOTHING', post_sql: 'STUB_PRE', invariants_sql: 'STUB_PRE', batch_size_config_key: 'x_batch' }; } };
    const exec = vi.spyOn(writeLib, 'executeInsertSelectNoRetract').mockResolvedValue({ new_links: 0, max_id: null, rows_in_batch: 0 });
    await run(fakePool(SOURCE), compute, d);
    expect(called).toEqual(['buildMaterializeSql']);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('T10: validate refuses — rows without materialize_source; replace_keys with no following A target on the same table; rows:"compute" off set_based_scoped; a lookup that is also the source', () => {
    const errs = (mut: (d: Record<string, any>) => void) => { const d = rowsDescriptor(); mut(d); return validateLib.materializeRowsFindings(d).join('\n'); };
    expect(errs(() => {})).toBe('');
    expect(errs((d) => { delete d.execution.materialize_source; })).toMatch(/materialize_source/);
    expect(errs((d) => { d.outputs.writes.splice(2, 1); })).toMatch(/replace_keys/);
    expect(errs((d) => { d.outputs.writes[0].write_discipline.rows = 'compute'; })).toMatch(/rows "compute"/);
    expect(errs((d) => { d.inputs.reads.tables[0].role = 'lookup'; d.inputs.reads.tables[0].unique_on = ['id']; d.inputs.reads.tables[0].on_empty = 'fail'; })).toMatch(/lookup/);
    expect(errs((d) => { d.execution.materialize_form = 'insert_select'; })).toMatch(/replace_keys|rows "compute"|key_prefix/);
  });
});
