// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2c (plan facts, CHAT-74.IN4), §3
//
// T-PF — PLAN FACTS ride the pinned values batch (batch.plan_facts) and are written by load_coa_notices as the DERIVED
// second target `coa_plan_facts` (Spec 124 R-DY, RE-FREEZE #40). Locks: the values-only record contract, the offline
// mapping, the derived rows (once, with slice 0), the table/descriptor/compute column parity, and the committed batches.
//
// RED BASELINE: `COA_PF_IMPL=absent` swaps the validator for `() => []` and removes the compute's `deriveRows` and
// the plan-facts mapping — the pre-amendment state. Every refusal / seam case FAILS against it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS/ESM modules under test

const AIC = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/aic-values.js')) as Json;
const COMPUTE = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as Json;
const DESCRIPTOR = require(path.join(REPO_ROOT, 'scripts/load-coa-notices.descriptor.json')) as Json;
const VOCAB = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/vocab.json')) as Json;
const TARGET_MAP = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/target-map.json')) as Json;
const TOOL = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/coa-notices/build-values-batch.mjs')).href)) as Json;

const RED = process.env.COA_PF_IMPL === 'absent';
const validatePlanFact: (f: unknown, who: string) => string[] = RED ? () => [] : AIC.validatePlanFact;
const deriveRows: ((t: string, s: unknown[], p: unknown, seam: Json) => Json[]) | undefined = RED ? undefined : COMPUTE.deriveRows;
const mapPlanFacts: ((r: Json) => Json) | undefined = RED ? undefined : AIC.mapPlanFacts;

function planFact(over: Json = {}): Json {
  const f: Json = { application_number: 'A0100/26SC', corner_lot: false };
  for (const k of AIC.PLAN_FACT_NUMBERS) f[k] = null;
  f.lot_area_m2 = 334.1; f.lot_frontage_m = 9.14; f.proposed_height_m = 8.5; f.proposed_units = 2;
  return { ...f, ...over };
}
function rawPlan(over: Json = {}): Json {
  return {
    file_number: 'A0100/26SC', address: '1 Example St', corner_lot: true, established_grade: '152.3 (string)', lot_area_m2: 334.1, lot_frontage_m: 9.14,
    lot_depth_m: null, existing_storeys: 2, notes: ['free text'], files: ['Survey'], sources: [{ field: 'x', file_title: 'T.pdf', page: 3 }],
    lot_shape_note: 'irregular', neighbour_front_setbacks_m: [5, 6], ancillary: { type: 'garden suite' }, landscaping_areas_m2: { driveway: 12 },
    landscaping: { front_landscaped_pct: 40, front_soft_pct: null, rear_soft_pct: 55 },
    proposed_gfa_m2_by_floor: { basement: 100, first: 90, second: null, third: null }, proposed_setbacks_m: { front: 6, rear: 7.5, side_flank: null, side_left: 1.2, side_right: 0.9 },
    proposed_height_m: 8.5, proposed_units: 2, ...over,
  };
}
function notice(app: string): Json {
  return {
    application_number: app, doc_type: 'decision_notice', hearing_date: '2026-07-08', zoning_as_stated: 'RD', decision: 'approved',
    items: [{ item_ordinal: 1, cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.30.40(1)(A)', exception_ref: null, target: 'lot_coverage_pct', target_status: 'mapped', bound: 'max', required_value: 33, required_unit: 'pct', proposed_value: 39, proposed_unit: 'pct', parse_status: 'pair', parse_confidence: 'high', qualified: false, decision: 'approved' }],
  };
}
function batch(id: string, notices: Json[], plan_facts?: Json[]): Json {
  return { schema: 'coa-values-batch-1', batch_id: id, parser_version: 'coa-parse/1', vocab_version: VOCAB.version, target_map_version: TARGET_MAP.version, notices, ...(plan_facts ? { plan_facts } : {}) };
}
function batchDoc(id: string, b: Json, sha = 'b'.repeat(64)): Json {
  return { doc: { doc_id: id, sha256: sha, hearing_date: null, kind: 'committee', revision: 'original', family: 'aic_values_batch', parser_version: b.parser_version, vocab_version: b.vocab_version, target_map_version: b.target_map_version }, doc_status: 'parsed', result: COMPUTE.shapeValuesBatch(b) };
}
const CFG = { coa_notices_mail_lag_max_days: 60, coa_notices_doc_pair_rate_min_items: 1, coa_notices_oob_sample_max: 5 };

describe('T-PF-1 the plan-facts record is values only and fails closed', () => {
  it('accepts a well-formed record', () => {
    expect(validatePlanFact(planFact(), 'pf')).toEqual([]);
  });
  it.each([
    ['a text-bearing extra key', planFact({ lot_shape_note: 'irregular' }), 'not in the contract'],
    ['an address', planFact({ address: '1 Example St' }), 'not in the contract'],
    ['a missing key', (() => { const f = planFact(); delete f.lot_depth_m; return f; })(), 'missing'],
    ['a negative number', planFact({ lot_area_m2: -1 }), 'non-negative'],
    ['a string where a number belongs', planFact({ established_grade: '152.3' }), 'non-negative'],
    ['a non-boolean corner_lot', planFact({ corner_lot: 'yes' }), 'boolean'],
    ['a file number that is not a file number', planFact({ application_number: '1 Example St' }), 'file number'],
  ])('refuses %s', (_n, f, needle) => {
    const problems = validatePlanFact(f, 'pf');
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(needle);
  });
  it('a batch refuses a repeated plan-facts application', () => {
    const problems = AIC.validateBatch(batch('coa-2026-t', [notice('A0100/26SC')], [planFact(), planFact()]));
    expect(problems.join('\n')).toContain('repeats');
  });
  it('a batch with plan facts and no plan-fact problem is valid', () => {
    expect(AIC.validateBatch(batch('coa-2026-t', [notice('A0100/26SC')], [planFact()]))).toEqual([]);
  });
});

describe('T-PF-2 the offline mapping reads only the closed columns', () => {
  it('maps nested values, nulls a non-numeric grade, drops every text field', () => {
    const m = mapPlanFacts!(rawPlan());
    expect(m).toMatchObject({ application_number: 'A0100/26SC', corner_lot: true, established_grade: null, lot_area_m2: 334.1, front_landscaped_pct: 40, proposed_gfa_basement_m2: 100, proposed_setback_side_left_m: 1.2, proposed_units: 2 });
    expect(Object.keys(m).sort()).toEqual([...AIC.PLAN_FACT_KEYS].sort());
    expect(JSON.stringify(m)).not.toContain('Example');
    expect(JSON.stringify(m)).not.toContain('garden');
    expect(validatePlanFact(m, 'pf')).toEqual([]);
  });
});

describe('T-PF-3 the builder attaches plan facts and supplied hearing dates', () => {
  const raw = (app: string, over: Json = {}): Json => ({ file_number: app, kind: 'decision', hearing_date: '2026-07-08', outcome: 'Approved', parser_version: 'coa-parse/1', zoning: { label: 'RD' }, variances: [{ n: 1, bylaw: '569-2013', clause: '10.20.30.40(1)(A)', limit: 'max', requirement: 'The maximum permitted lot coverage is 33% of the lot area.', required: { unit: '%', value: 33 }, proposed: { unit: '%', value: 39 }, result: 'as_requested', required_all: [] }], ...over });
  it('puts a plan fact in the batch of its drop, and none for an application outside it', () => {
    const built = TOOL.buildBatch([raw('A0100/26SC')], { batchId: 'coa-2026-t', planFacts: [rawPlan(), rawPlan({ file_number: 'A0999/26SC' })] });
    expect(built.batch.plan_facts.map((f: Json) => f.application_number)).toEqual(['A0100/26SC']);
    expect(built.counts.plan_facts).toBe(1);
  });
  it('a plan fact of an application whose notice is excluded for a missing date is kept', () => {
    const built = TOOL.buildBatch([raw('A0100/26SC', { hearing_date: '' }), raw('A0105/26SC')], { batchId: 'coa-2026-t', planFacts: [rawPlan()] });
    expect(built.excluded).toEqual([{ application_number: 'A0100/26SC', batch_id: 'coa-2026-t', reason: 'hearing_date_unread' }]);
    expect(built.batch.plan_facts).toHaveLength(1);
  });
  it('a supplied hearing date fills an unread one; an unreal one does not', () => {
    const ok = TOOL.buildBatch([raw('A0100/26SC', { hearing_date: '' }), raw('A0105/26SC')], { batchId: 'coa-2026-t', hearingDates: { 'A0100/26SC': '2026-10-07' } });
    expect(ok.batch.notices.find((n: Json) => n.application_number === 'A0100/26SC').hearing_date).toBe('2026-10-07');
    expect(ok.excluded).toEqual([]);
    const bad = TOOL.buildBatch([raw('A0100/26SC', { hearing_date: '' }), raw('A0105/26SC')], { batchId: 'coa-2026-t', hearingDates: { 'A0100/26SC': '2026-02-30' } });
    expect(bad.excluded).toHaveLength(1);
  });
  it('a notice own date wins over a supplied one', () => {
    const b = TOOL.buildBatch([raw('A0100/26SC')], { batchId: 'coa-2026-t', hearingDates: { 'A0100/26SC': '2026-10-07' } });
    expect(b.batch.notices[0].hearing_date).toBe('2026-07-08');
  });
});

describe('T-PF-4 the derived coa_plan_facts rows', () => {
  it('reconcile hands the plan facts to the runner as DATA with provenance, a later batch superseding an earlier', () => {
    const a = batch('coa-2026-t', [notice('A0100/26SC')], [planFact(), planFact({ application_number: 'A0101/26SC' })]);
    const b = batch('coa-2026-u', [notice('A0102/26SC')], [planFact({ lot_area_m2: 500 })]);
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', a, '1'.repeat(64)), batchDoc('coa-2026-u', b, '2'.repeat(64))], { config: CFG });
    const rows = rec.derive_inputs.coa_plan_facts;
    expect(rows.map((r: Json) => r.application_number)).toEqual(['A0100/26SC', 'A0101/26SC']);
    expect(rows[0]).toMatchObject({ lot_area_m2: 500, source_batch: 'coa-2026-u', source_sha256: '2'.repeat(64) });
    expect(rec.stats).toMatchObject({ plan_facts_total: 2, plan_facts_superseded: 1, plan_facts_by_batch: { 'coa-2026-t': 1, 'coa-2026-u': 1 } });
    expect(JSON.stringify(rec.stats)).not.toContain('lot_area');
  });
  it('deriveRows emits the rows ONCE, with slice 0, exactly the write columns', () => {
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', batch('coa-2026-t', [notice('A0100/26SC')], [planFact()]))], { config: CFG });
    const seam = (i: number) => ({ derive_inputs: rec.derive_inputs, slice_index: i });
    const first = deriveRows!('coa_plan_facts', [], new Map(), seam(0));
    expect(first).toHaveLength(1);
    expect(Object.keys(first[0]!).sort()).toEqual([...COMPUTE.PLAN_FACT_COLUMNS].sort());
    expect(deriveRows!('coa_plan_facts', [], new Map(), seam(1))).toEqual([]);
    expect(deriveRows!('coa_plan_facts', [], new Map(), { derive_inputs: null, slice_index: 0 })).toEqual([]);
    expect(() => deriveRows!('coa_notice_variances', [], new Map(), seam(0))).toThrow('no rows for');
  });
  it('a batch without plan facts leaves the primary untouched and derives nothing', () => {
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', batch('coa-2026-t', [notice('A0100/26SC')]))], { config: CFG });
    expect(rec.derive_inputs.coa_plan_facts).toEqual([]);
    expect(rec.rows).toHaveLength(1);
    expect(rec.stats.plan_facts_total).toBe(0);
  });
});

describe('T-PF-5 table, descriptor and compute agree; the runner passes the seam', () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, 'migrations/285_coa_plan_facts.sql'), 'utf8');
  const block = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS coa_plan_facts'), sql.indexOf('COMMENT ON TABLE'));
  const sqlCols = Array.from(block.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+(?:VARCHAR|NUMERIC|BOOLEAN|TEXT|CHAR|TIMESTAMPTZ)\b/gm)).map((m) => m[1]!);
  it('the migration columns are exactly the write columns plus loaded_at (nothing text-like can be added)', () => {
    expect([...sqlCols].sort()).toEqual([...COMPUTE.PLAN_FACT_COLUMNS, 'loaded_at'].sort());
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });
  it('the descriptor declares the derived target from the primary, with the same columns and the RLS requirement', () => {
    const w = DESCRIPTOR.outputs.writes[1];
    expect(w).toMatchObject({ table: 'coa_plan_facts', key: 'application_number', retract: 'none' });
    expect(w.derive.from).toBe(DESCRIPTOR.outputs.writes[0].table);
    expect(w.columns.filter((c: Json) => c.written === 'step').map((c: Json) => c.name).sort()).toEqual([...COMPUTE.PLAN_FACT_COLUMNS].sort());
    expect(w.write_discipline.guard_columns.sort()).toEqual(COMPUTE.PLAN_FACT_COLUMNS.filter((c: string) => c !== 'application_number').sort());
    expect(DESCRIPTOR.guards.requires.map((r: Json) => r.name)).toContain('coa_plan_facts');
    expect(DESCRIPTOR.emits.map((e: Json) => e.key)).toContain('coa_plan_facts_written');
  });
  it('the runner hands slice_index and derive_inputs to deriveRows (RE-FREEZE #40)', () => {
    const idx = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/step/index.js'), 'utf8');
    const wr = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/step/write.js'), 'utf8');
    expect(idx).toContain('derive_inputs: deriveInputs, slice_index: sliceIndex');
    // both acquireExternal call sites (single primary, multi-primary) hand the values-batch seam over
    expect(idx.split("shapeValuesBatch: ext.format === 'pdf_document_set' ? compute.shapeValuesBatch").length - 1 + idx.split("shapeValuesBatch: external.format === 'pdf_document_set' ? compute.shapeValuesBatch").length - 1).toBe(2);
    expect(wr).toContain('derived.deriveRows(t.plan.table, slice, priorByKey, i / batchSize)');
  });
});

describe('T-PF-5b the derived write count is its own emit (gate G #38 count_path)', () => {
  it('reports written.e1 inserted + updated as coa_plan_facts_written, beside coa_notices_load', async () => {
    const ctx = { checks: [], descriptor: { identity: { name: 'load_coa_notices', spec_version: '1.0' } }, log: { error: () => {} }, report: () => {}, acquired: {}, written: { e1: { inserted: 3, updated: 2 } } };
    const out = await (COMPUTE as unknown as (c: Json) => Promise<Json>)(ctx);
    expect(out.records_meta.coa_plan_facts_written).toBe(5);
    expect(out.records_meta.coa_notices_load).toBeDefined();
  });
});

describe('T-PF-6 the committed batches', () => {
  const man = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/seeds/coa-notices/manifest-aic-values.json'), 'utf8')) as Json;
  const batches = man.batches.map((b: Json) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, b.path), 'utf8')) as Json);
  it('every plan fact validates, belongs to an application of its own batch, and appears once overall', () => {
    const seen = new Set<string>();
    let n = 0;
    for (const b of batches) {
      const apps = new Set([...b.notices.map((x: Json) => x.application_number), ...man.excluded.filter((e: Json) => e.batch_id === b.batch_id).map((e: Json) => e.application_number)]);
      for (const f of b.plan_facts || []) {
        expect(validatePlanFact(f, 'pf')).toEqual([]);
        expect(apps.has(f.application_number)).toBe(true);
        expect(seen.has(f.application_number)).toBe(false);
        seen.add(f.application_number);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});
