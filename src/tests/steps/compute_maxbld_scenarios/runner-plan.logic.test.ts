// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (Phase-5 step identity); docs/specs/01-pipeline/124a_step_standard_policy_appendix.md
//            R-EH (the rows arm plans every write target before any write)
//
// MB-35 · MB35-COHORT b4 STOP (2026-11-11): the step exited before writing because the runner's write-discipline validator refuses
// retract "departed" on a composite key (scripts/lib/step/write.js buildWritePlan). No test had ever run the REAL descriptor through the
// runner. RED FIRST on 34520a43b. This lock runs the real descriptor and the real compute through the runner's own planning and one
// rows-arm batch on a fake pool (no DB): the write plan builds, the batch reads with only the runner's keyset binds, the compute's rows
// go to one guarded upsert of parcel_maxbld_scenarios, and nothing is deleted (retract "none": a lot that leaves the population keeps its
// rows, the recorded limitation; operator "option 2" 2026-11-11: no runner change).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const stepLib = req(path.join(ROOT, 'scripts/lib/step')) as Json;
const writeLib = req(path.join(ROOT, 'scripts/lib/step/write.js')) as Json;
const stalenessLib = req(path.join(ROOT, 'scripts/lib/step/staleness.js')) as Json;
const D = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
const S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
const G25 = 'src/tests/fixtures/layer3/golden-25';
const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };

/** The validated config at its seed defaults (the values migrations 276-310 insert). */
function seedConfig(): Json {
  const lv = readJson('scripts/seeds/logic_variables.json');
  return Object.fromEntries((D.config.logic_variables as Json[]).map((d) => [d.name, lv[d.name].default]));
}

/** Two golden lots in the batch statement's row shape, plus the lookup rows the runner reads (Layer 2 through the pure core). */
function goldenSource(): { rows: Json[]; lookups: Record<string, Json[]> } {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = (readJson(`${G25}/parcels-rows.json`) as unknown as Json[]).slice(0, 2);
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const rows = (out.rows.lots as Json[]).map((lot) => {
    const view = (d: Json) => ({ parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...d });
    return {
      id: lot.parcel_id,
      parcel: parcels.find((p) => p.id === lot.parcel_id),
      lot: { parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, permitted: lot.permitted, permitted_text_ids: lot.permitted_text_ids ?? null, table_version: lot.table_version, evaluator_version: lot.evaluator_version },
      cells: lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option).map(view),
      options: lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).map((d: Json) => { const { option_name: _n, ...rest } = d; return view(rest); }), // eslint-disable-line @typescript-eslint/no-unused-vars
      abutters: [], street: [], zone: [], ring_edges: [],
    };
  }).sort((a, b) => a.id - b.id);
  const lookups = {
    bylaw_resolution_units: out.rows.units as Json[],
    bylaw_resolution_texts: out.rows.texts as Json[],
  };
  return { rows, lookups };
}

/** A fake pool: the runner's lookup reads, the count, the keyset pages of the batch statement, and the write; every statement recorded. */
function fakePool(src: { rows: Json[]; lookups: Record<string, Json[]> }, batchSql: string, countSql: string) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const query = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    if (text === countSql) return { rows: [{ cohort_lots: 0 }] };
    if (text === batchSql) {
      const [last, size] = (values ?? []) as number[];
      return { rows: src.rows.filter((r) => r.id > Number(last)).slice(0, Number(size)) };
    }
    const lookup = /^SELECT (.*) FROM (\w+)$/.exec(text);
    if (lookup && src.lookups[lookup[2] as string]) return { rows: src.lookups[lookup[2] as string] };
    if (/^\s*INSERT INTO/i.test(text)) { const n = Array.isArray(values) && Array.isArray(values[0]) ? (values[0] as unknown[]).length : 0; return { rows: Array.from({ length: n }, () => ({ is_insert: true })), rowCount: n }; }
    return { rows: [], rowCount: 0 };
  };
  return { sql, params, query, connect: async () => ({ query, release: () => {} }) };
}

describe('MB-35 b4 STOP: the real descriptor through the runner (no DB)', () => {
  beforeEach(() => {
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({});
    vi.spyOn(stalenessLib, 'resolveOverrides').mockImplementation((() => Object.freeze({ force_full: false, force_run: false, dry_run: false })) as (...a: unknown[]) => unknown);
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false });
    vi.spyOn(stalenessLib, 'ledgerGatedSkip').mockResolvedValue({ skip: false, reason: 'no_gate', gate: null });
    vi.spyOn(stalenessLib, 'readPriorEmit').mockResolvedValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('the runner builds the write plan of parcel_maxbld_scenarios (no retraction on its composite key)', () => {
    const w = D.outputs.writes[0] as Json;
    expect(w.table).toBe('parcel_maxbld_scenarios');
    expect(w.key).toEqual(['parcel_id', 'building_type', 'field_id']);
    expect(w.retract).toBe('none');
    expect(() => writeLib.buildWritePlan(w, D)).not.toThrow();
  });

  // MB-35 attempt 3 b4 STOP (2026-11-12): "invalid input syntax for type json" in executeUpsertBatch: node-pg sends a JS array as a
  // Postgres array literal ('{...}'), never JSON. Every jsonb column of migration 309 must reach the runner as JSON text (the
  // resolve-bylaws.js jsonText precedent). Checked with node-pg's own encoder (pg/lib/utils prepareValue), so the lock is pg-faithful.
  it('every jsonb column of migration 309 reaches pg as JSON text (node-pg prepareValue), equal to the computed content', () => {
    const migration = fs.readFileSync(path.join(ROOT, 'migrations/309_parcel_maxbld_scenarios.sql'), 'utf8');
    const block = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS parcel_maxbld_scenarios'), migration.indexOf('CREATE INDEX'));
    const jsonbCols = [...block.matchAll(/^\s+([a-z_]+)\s+JSONB\b/gim)].map((m) => m[1] as string);
    expect(jsonbCols).toEqual(['trace', 'switches']);
    const prepareValue = (req(path.join(ROOT, 'node_modules/pg/lib/utils.js')) as Json).prepareValue as (v: unknown) => unknown;
    const src = goldenSource();
    const rows = S.materializeRows(src.rows, { config: seedConfig(), lookups: src.lookups }).rows.e1 as Json[];
    expect(rows.length).toBe(2 * 169); // MB-27 increment 5 (lane B5B-1, FIT-a): +16 fitted rows per parcel (5 x 3 types + units_fit); was 2 * 153
    const bad: string[] = [];
    for (const r of rows) {
      for (const c of jsonbCols) {
        const wire = prepareValue(r[c]);
        let ok = typeof wire === 'string';
        if (ok) { try { ok = Array.isArray(JSON.parse(wire as string)); } catch { ok = false; } }
        if (!ok) bad.push(`${r.parcel_id}/${r.building_type}/${r.field_id}.${c}: ${String(wire).slice(0, 40)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // the text column flags stays a JS array (node-pg's array literal is right for TEXT[])
    expect(rows.every((r) => Array.isArray(r.flags))).toBe(true);
  });

  it('one rows-arm run: the batch binds only the keyset, the rows go to one guarded upsert, nothing is deleted', async () => {
    const config = seedConfig();
    const plan = S.buildSourceSql(D, config, { mode: 'incremental' }) as Json;
    const src = goldenSource();
    const pool = fakePool(src, plan.batch_sql, plan.count_sql);
    const out = await stepLib.runMaterializePhase({ descriptor: D, pool, compute: S, config, chainId: null, log: NOOP_LOG, tag: '[mb35-b4]', clockNow: new Date('2026-11-11T00:00:00Z'), preWriteGate: null }) as Json;
    const batchCalls = pool.sql.map((t, i) => [t, pool.params[i]] as [string, unknown[]]).filter(([t]) => t === plan.batch_sql);
    expect(batchCalls.length).toBeGreaterThanOrEqual(2); // the page, then the empty page that ends the keyset loop
    for (const [, p] of batchCalls) expect(p).toHaveLength(2);
    expect(pool.sql.some((t) => /^\s*DELETE/i.test(t))).toBe(false);
    expect(pool.sql.some((t) => /^\s*INSERT INTO parcel_maxbld_scenarios/i.test(t))).toBe(true);
    expect(out.matched.processed).toBe(2);
    expect(out.matched.rows_emitted).toBe(2 * 169); // MB-27 increment 5 (lane B5B-1, FIT-a): +16 fitted rows per parcel (5 x 3 types + units_fit); was 2 * 153
    expect(out.written.e1.scanned).toBe(2 * 169); // MB-27 increment 5 (lane B5B-1, FIT-a): +16 fitted rows per parcel (5 x 3 types + units_fit); was 2 * 153
  });
});
