// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2b (values-only batch family, CHAT-71.2), §3, §5 Dedup
//
// T-VAL — the values-only BATCH family of load_coa_notices: the manifest + batch contract (closed sets, fail
// closed), the offline builder's mapping, the committed manifest's integrity, and the step-side shaping that lets
// ONE reconcileNotices dedupe both families.
//
// RED BASELINE (Spec 08 §11.4, both directions): `COA_VALUES_IMPL=permissive` swaps both validators for `() => []`
// and the compute's `shapeValuesBatch` for an absent seam — the pre-amendment state. Every refusal / seam case
// FAILS against it and PASSES against the committed modules.
//
// EVERY fixture is SYNTHETIC (invented file numbers, labels and values); the committed-manifest cases read the
// committed batch files, which hold values only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS/ESM modules under test

const AIC = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/aic-values.js')) as Json;
const COMPUTE = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as Json;
const VOCAB = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/vocab.json')) as Json;
const TARGET_MAP = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/target-map.json')) as Json;
const TOOL = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/coa-notices/build-values-batch.mjs')).href)) as Json;

const RED = process.env.COA_VALUES_IMPL === 'permissive';
const validateValuesManifest: (m: unknown) => string[] = RED ? () => [] : AIC.validateValuesManifest;
const validateBatch: (b: unknown) => string[] = RED ? () => [] : AIC.validateBatch;
const shapeValuesBatch: ((b: unknown) => Json) | undefined = RED ? undefined : COMPUTE.shapeValuesBatch;

const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

// ---- synthetic builders ------------------------------------------------------------------------

function item(over: Json = {}): Json {
  return {
    item_ordinal: 1, cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.30.40(1)(A)',
    exception_ref: null, target: 'lot_coverage_pct', target_status: 'mapped', bound: 'max', required_value: 33, required_unit: 'pct',
    proposed_value: 39, proposed_unit: 'pct', parse_status: 'pair', parse_confidence: 'high', qualified: false, decision: 'approved', ...over,
  };
}
function notice(over: Json = {}): Json {
  return {
    application_number: 'A0100/26SC', doc_type: 'decision_notice', hearing_date: '2026-07-08', zoning_as_stated: 'RD (f9.0; a325)',
    decision: 'approved', items: [item()], ...over,
  };
}
function batch(over: Json = {}): Json {
  return {
    schema: 'coa-values-batch-1', batch_id: 'coa-2026-t', parser_version: 'coa-parse/1', vocab_version: VOCAB.version,
    target_map_version: TARGET_MAP.version, notices: [notice()], ...over,
  };
}
function manifest(over: Json = {}): Json {
  return {
    schema: 'coa-values-manifest-1', source_family: 'aic_values_batch',
    batches: [{ batch_id: 'coa-2026-t', path: 'scripts/seeds/coa-notices/aic-values/coa-2026-t.json', sha256: 'a'.repeat(64), notices: 1, items: 1, captured_on: '2026-10-22' }],
    excluded: [], ...over,
  };
}

// ---- T-VAL-1 manifest contract ------------------------------------------------------------------

describe('T-VAL-1 the values manifest contract fails closed', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateValuesManifest(manifest())).toEqual([]);
  });
  it.each([
    ['an unknown key', manifest({ note: 'x' }), 'not in the contract'],
    ['a wrong family', manifest({ source_family: 'toronto_ca_decision_pdf' }), 'source_family'],
    ['a bad sha', manifest({ batches: [{ ...manifest().batches[0], sha256: 'zz' }] }), 'sha256'],
    ['a path that is not the batch id path', manifest({ batches: [{ ...manifest().batches[0], path: '../x.json' }] }), 'path'],
    ['a duplicate batch id', manifest({ batches: [manifest().batches[0], manifest().batches[0]] }), 'duplicate batch_id'],
    ['a bad batch id', manifest({ batches: [{ ...manifest().batches[0], batch_id: 'Batch 1' }] }), 'batch_id'],
    ['an unreal captured_on', manifest({ batches: [{ ...manifest().batches[0], captured_on: '2026-02-30' }] }), 'captured_on'],
    ['an exclusion reason outside the set', manifest({ excluded: [{ application_number: 'A0100/26SC', batch_id: 'coa-2026-t', reason: 'because' }] }), 'reason'],
    ['no batches', manifest({ batches: [] }), 'batches'],
  ])('refuses %s', (_name, m, needle) => {
    const problems = validateValuesManifest(m);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(needle);
  });
});

// ---- T-VAL-2 batch contract (values only) ---------------------------------------------------------

describe('T-VAL-2 a batch holds values only', () => {
  it('accepts a well-formed batch', () => {
    expect(validateBatch(batch())).toEqual([]);
  });
  it.each([
    ['a text-bearing extra item key', batch({ notices: [notice({ items: [item({ requirement: 'The maximum permitted lot coverage is 33%.' })] })] }), 'not in the contract'],
    ['a text-bearing extra notice key', batch({ notices: [notice({ purpose: 'To build a deck' })] }), 'not in the contract'],
    ['a decision outside the set', batch({ notices: [notice({ decision: 'Approved on Condition' })] }), 'decision'],
    ['a free-text regulation id', batch({ notices: [notice({ items: [item({ regulation_id_as_cited: 'the maximum height is 10 m' })] })] }), 'clause identifier'],
    ['a negative value', batch({ notices: [notice({ items: [item({ required_value: -1 })] })] }), 'non-negative'],
    ['a pair missing a unit', batch({ notices: [notice({ items: [item({ proposed_unit: null })] })] }), 'pair without'],
    ['an unmapped target that is not the sentinel', batch({ notices: [notice({ items: [item({ target: 'height_m', target_status: 'unmapped' })] })] }), 'incoherent'],
    ['a zoning label with prose characters', batch({ notices: [notice({ zoning_as_stated: 'Owner: J. Smith <jsmith@example.test>' })] }), 'zoning_as_stated'],
    ['a zoning label over the cap', batch({ notices: [notice({ zoning_as_stated: 'R'.repeat(VOCAB.segmentation.zone_label_max_chars + 1) })] }), 'zoning_as_stated'],
    ['a notice without a hearing date', batch({ notices: [notice({ hearing_date: null })] }), 'hearing_date'],
    ['a repeated application number', batch({ notices: [notice(), notice()] }), 'repeats'],
    ['a repeated ordinal', batch({ notices: [notice({ items: [item(), item()] })] }), 'repeats'],
    ['a file number that is not a file number', batch({ notices: [notice({ application_number: '12 Main St' })] }), 'file number'],
    ['a wrong schema', batch({ schema: 'x' }), 'schema'],
  ])('refuses %s', (_name, b, needle) => {
    const problems = validateBatch(b);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(needle);
  });
});

// ---- T-VAL-3 builder mapping ----------------------------------------------------------------------

function rawNotice(over: Json = {}): Json {
  return {
    file_number: 'A0100/26SC', kind: 'decision', hearing_date: '2026-07-08', outcome: 'Approved on Condition', parser_version: 'coa-parse/1',
    zoning: { label: 'RD (f9.0; a325)' },
    variances: [
      { n: 1, bylaw: '569-2013', clause: '10.20.30.40(1)(A)', limit: 'max', requirement: 'The maximum permitted lot coverage is 33% of the lot area.', required: { unit: '%', value: 33 }, proposed: { unit: '%', value: 39 }, result: 'as_requested', required_all: [{ unit: '%', value: 33 }] },
      { n: 2, bylaw: '569-2013', clause: '10.5.40.10(1)(A)', limit: 'max', requirement: 'The maximum permitted floor space index is 0.6 times the area of the lot.', required: { unit: '× lot area', value: 0.6 }, proposed: { unit: '× lot area', value: 0.76 }, result: 'refused', required_all: [] },
      { n: 3, bylaw: '7625 The maximum height is 8.8m. Extra sentence text.', clause: '13.2.6', limit: 'max', requirement: 'x', required: null, proposed: null, result: 'pending', required_all: [] },
    ],
    ...over,
  };
}

describe('T-VAL-3 the builder maps a coa-parse/1 notice to values only', () => {
  const mapped = RED ? null : AIC.mapNotice(rawNotice());
  it('maps units, bounds, the decision rule and the citation', () => {
    expect(mapped.notice.application_number).toBe('A0100/26SC');
    expect(mapped.notice.doc_type).toBe('decision_notice');
    const [a, b, c] = mapped.notice.items;
    expect(a).toMatchObject({ required_unit: 'pct', proposed_unit: 'pct', bound: 'max', parse_status: 'pair', decision: 'approved_with_conditions', citation_kind: 'chapter_regulation', cited_bylaw: '569-2013' });
    expect(b).toMatchObject({ required_unit: 'ratio', decision: 'refused' });
    expect(c).toMatchObject({ parse_status: 'no_required_value', required_value: null, decision: 'approved_with_conditions' });
  });
  it('cuts a contaminated by-law string at its first token (no sentence text survives)', () => {
    expect(mapped.notice.items[2].cited_bylaw).toBe('7625');
    expect(JSON.stringify(mapped.notice)).not.toContain('Extra sentence');
    expect(JSON.stringify(mapped.notice)).not.toContain('maximum permitted');
  });
  it('the mapped notice passes the values-only gate', () => {
    expect(AIC.validateBatch(batch({ notices: [mapped.notice] }))).toEqual([]);
  });
  it('an item the parser itself flags as ambiguous (check) is not claimed as a pair, its first-picked values stay', () => {
    const r = rawNotice({ variances: [{ ...rawNotice().variances[0], check: true }] });
    const it0 = AIC.mapNotice(r).notice.items[0];
    expect(it0).toMatchObject({ parse_status: 'multi_value_ambiguous', parse_confidence: 'low', required_value: 33, proposed_value: 39 });
  });
  it('a hearing notice with no readable date is excluded, not guessed', () => {
    const m = AIC.mapNotice(rawNotice({ kind: 'hearing', hearing_date: '', outcome: 'Pending' }));
    expect(m).toEqual({ excluded: 'hearing_date_unread' });
  });
  it('a hearing notice is a pending hearing_notice', () => {
    const m = AIC.mapNotice(rawNotice({ kind: 'hearing', outcome: 'Pending' }));
    expect(m.notice.doc_type).toBe('hearing_notice');
    expect(m.notice.decision).toBe('pending');
  });
  it('a pair whose unit family differs from the mapped target is not claimed (Spec 129 §5 WF3 rule)', () => {
    const r = rawNotice({
      variances: [{ n: 1, bylaw: '569-2013', clause: '10.20.40.70(1)', limit: 'max', requirement: 'The maximum permitted floor space index is 0.6 times the area of the lot.', required: { unit: 'm²', value: 200 }, proposed: { unit: 'm²', value: 250 }, result: 'as_requested', required_all: [] }],
    });
    const it0 = AIC.mapNotice(r).notice.items[0];
    expect(it0.target).toBe('fsi');
    expect(it0.parse_status).toBe('target_unit_mismatch');
  });
});

// ---- T-VAL-4 builder tool (pure parts) -------------------------------------------------------------

describe('T-VAL-4 the offline tool builds, pins and verifies', () => {
  it('builds a valid batch, a pinned manifest entry and a verifiable sha', () => {
    const built = TOOL.buildBatch([rawNotice(), rawNotice({ file_number: 'A0101/26SC', kind: 'hearing', hearing_date: '', outcome: 'Pending' })], { batchId: 'coa-2026-t' });
    expect(built.counts).toEqual({ notices: 1, items: 3, plan_facts: 0 });
    expect(built.excluded).toEqual([{ application_number: 'A0101/26SC', batch_id: 'coa-2026-t', reason: 'hearing_date_unread' }]);
    expect(built.sha256).toBe(sha(built.serialized));
    const next = TOOL.upsertManifest(null, built, '2026-10-22');
    expect(next.batches[0]).toMatchObject({ batch_id: 'coa-2026-t', sha256: built.sha256, notices: 1, items: 3 });
    expect(AIC.validateValuesManifest(next)).toEqual([]);
    const v = TOOL.verifyBatches(next, () => Buffer.from(built.serialized));
    expect(v.ok).toBe(true);
    expect(TOOL.verifyBatches(next, () => Buffer.from('{}')).results[0].status).toBe('sha_changed');
    expect(TOOL.verifyBatches(next, () => { throw new Error('ENOENT'); }).results[0].status).toBe('missing');
  });
  it('an operator exclusion carries its reason; hearing_date_unread cannot be claimed by hand', () => {
    const built = TOOL.buildBatch([rawNotice()], { batchId: 'coa-2026-t', excludes: {} });
    expect(built.counts.notices).toBe(1);
    const b2 = TOOL.buildBatch([rawNotice(), rawNotice({ file_number: 'A0102/26SC' })], { batchId: 'coa-2026-t', excludes: { 'A0102/26SC': 'in_pdf_allotment' } });
    expect(b2.excluded).toEqual([{ application_number: 'A0102/26SC', batch_id: 'coa-2026-t', reason: 'in_pdf_allotment' }]);
    expect(() => TOOL.buildBatch([rawNotice()], { batchId: 'coa-2026-t', excludes: { 'A0100/26SC': 'hearing_date_unread' } })).toThrow('COA_VALUES_E_EXCLUDE_REASON');
  });
  it('re-building a batch replaces its entry and exclusions, never duplicates', () => {
    const built = TOOL.buildBatch([rawNotice()], { batchId: 'coa-2026-t' });
    const once = TOOL.upsertManifest(null, built, '2026-10-22');
    const twice = TOOL.upsertManifest(once, built, '2026-10-23');
    expect(twice.batches).toHaveLength(1);
    expect(twice.batches[0].captured_on).toBe('2026-10-23');
  });
});

// ---- T-VAL-5 the committed manifest ------------------------------------------------------------------

describe('T-VAL-5 the committed values manifest is intact', () => {
  const man = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/seeds/coa-notices/manifest-aic-values.json'), 'utf8')) as Json;
  it('is valid and every pinned batch file hashes to its sha and passes the values-only gate', () => {
    expect(AIC.validateValuesManifest(man)).toEqual([]);
    for (const b of man.batches) {
      const bytes = fs.readFileSync(path.join(REPO_ROOT, b.path));
      expect(sha(bytes)).toBe(b.sha256);
      const parsed = JSON.parse(bytes.toString('utf8')) as Json;
      expect(AIC.validateBatch(parsed)).toEqual([]);
      expect(parsed.batch_id).toBe(b.batch_id);
      expect(parsed.notices).toHaveLength(b.notices);
      expect(parsed.notices.reduce((n: number, x: Json) => n + x.items.length, 0)).toBe(b.items);
      expect(parsed.vocab_version).toBe(VOCAB.version);
      expect(parsed.target_map_version).toBe(TARGET_MAP.version);
    }
  });
  it('no file number sits in two batches, and none excluded is also loaded', () => {
    const seen = new Map<string, string>();
    for (const b of man.batches) {
      const parsed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, b.path), 'utf8')) as Json;
      for (const n of parsed.notices) {
        expect(seen.has(n.application_number)).toBe(false);
        seen.set(n.application_number, b.batch_id);
      }
    }
    for (const e of man.excluded) expect(seen.has(e.application_number)).toBe(false);
  });
  it('no batch row can collide with the 2017 PDF allotment by file number year', () => {
    for (const b of man.batches) {
      const parsed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, b.path), 'utf8')) as Json;
      for (const n of parsed.notices) expect(n.application_number).not.toMatch(/\/17[A-Z]+$/);
    }
  });
});

// ---- T-VAL-6 step-side shaping + one reconcile -----------------------------------------------------------

function pdfDoc(over: Json = {}): Json {
  return { doc_id: 'pdf-1', sha256: 'd'.repeat(64), hearing_date: '2017-07-13', kind: 'committee', revision: 'original', session: 'full', panel: 'etobicoke_york', ...over };
}
function pdfNotice(app: string, over: Json = {}): Json {
  return {
    application_number: app, page: 1, notice_status: 'variance_section_parsed', zoning_as_stated: 'R2', decision: 'approved', decision_mailed_on: '2017-07-20',
    consent_items_skipped: 0,
    items: [{ item_ordinal: 1, source_page: 1, cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.30.40(1)(A)', exception_ref: null, target: 'lot_coverage_pct', target_status: 'mapped', bound: 'max', required_value: 33, required_unit: 'pct', proposed_value: 39, proposed_unit: 'pct', parse_status: 'pair', parse_confidence: 'high', qualified: false, clause_count: 1, bylaw_rejected: false }],
    ...over,
  };
}
const CFG = { coa_notices_mail_lag_max_days: 60, coa_notices_doc_pair_rate_min_items: 1, coa_notices_oob_sample_max: 5 };
function batchDoc(id: string, b: Json, over: Json = {}): Json {
  return { doc: { doc_id: id, sha256: 'b'.repeat(64), hearing_date: null, kind: 'committee', revision: 'original', family: 'aic_values_batch', parser_version: b.parser_version, vocab_version: b.vocab_version, target_map_version: b.target_map_version, ...over }, doc_status: 'parsed', result: shapeValuesBatch!(b) };
}
const pdfResult = (app = 'A0001/17EYK') => ({ doc: pdfDoc(), doc_status: 'parsed', result: { doc_status: 'parsed', notices: [pdfNotice(app)], counts: { notices_by_status: {}, blocks: 1, ordinal_fallback_notices: 0 } } });

describe('T-VAL-6 one reconcile for both families', () => {
  it('exposes the shapeValuesBatch seam, and an invalid batch is extract_error with no notices', () => {
    expect(typeof shapeValuesBatch).toBe('function');
    const bad = shapeValuesBatch!(batch({ notices: [notice({ purpose: 'text' })] }));
    expect(bad.doc_status).toBe('extract_error');
    expect(bad.notices).toEqual([]);
  });
  it('writes batch rows under the batch family with doc_type, source_batch, null page and honest decision_source', () => {
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', batch())], { config: CFG });
    expect(rec.rows).toHaveLength(1);
    const row = rec.rows[0];
    expect(row).toMatchObject({
      variance_key: 'aic_values_batch|A0100/26SC|1', source_family: 'aic_values_batch', hearing_date: '2026-07-08', decision: 'approved', decision_source: 'unknown',
      doc_type: 'decision_notice', source_batch: 'coa-2026-t', source_page: null, source_sha256: 'b'.repeat(64), extractor_version: 'coa-parse/1', decision_mailed_on: null,
    });
    const shaped = COMPUTE.shapeRecord(row);
    expect(Object.keys(shaped).sort()).toEqual([...COMPUTE.ROW_COLUMNS].sort());
  });
  it('a PDF row is a decision_notice from the year allotment, with a page', () => {
    const rec = COMPUTE.reconcileNotices([pdfResult()], { config: CFG });
    expect(rec.rows[0]).toMatchObject({ source_family: 'toronto_ca_decision_pdf', doc_type: 'decision_notice', source_batch: 'coa-2017-decisions', source_page: 1, decision_source: 'committee' });
  });
  it('a decision notice supersedes a hearing notice of the same file, whichever batch arrives first', () => {
    const hearing = batch({ batch_id: 'coa-2026-t', notices: [notice({ doc_type: 'hearing_notice', decision: 'pending', hearing_date: '2026-09-09', items: [item({ decision: 'pending', proposed_value: 40 })] })] });
    const decided = batch({ batch_id: 'coa-2026-u', notices: [notice({ hearing_date: '2026-09-09' })] });
    for (const order of [[hearing, decided], [decided, hearing]]) {
      const docs = order.map((b) => batchDoc(b.batch_id, b));
      const rec = COMPUTE.reconcileNotices(docs, { config: CFG });
      const live = rec.rows.filter((r: Json) => !r.drop_reason);
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ doc_type: 'decision_notice', source_batch: 'coa-2026-u', proposed_value: 39 });
      expect(rec.rows.find((r: Json) => r.drop_reason)?.drop_reason).toBe('duplicate_superseded');
    }
  });
  it('same stage, same date, differing items stays a conflict (all dropped, counted)', () => {
    const a = batch({ batch_id: 'coa-2026-t' });
    const b = batch({ batch_id: 'coa-2026-u', notices: [notice({ items: [item({ proposed_value: 41 })] })] });
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', a), batchDoc('coa-2026-u', b)], { config: CFG });
    expect(rec.rows.every((r: Json) => r.drop_reason === 'duplicate_same_date_conflict')).toBe(true);
  });
  it('the batch family never moves the PDF extractor gates (C3 / C15) and is counted by family', () => {
    const base = COMPUTE.reconcileNotices([pdfResult()], { config: CFG });
    const both = COMPUTE.reconcileNotices([pdfResult(), batchDoc('coa-2026-t', batch())], { config: CFG });
    expect(both.stats.pair_rate_569).toBe(base.stats.pair_rate_569);
    expect(both.stats.items_569).toBe(base.stats.items_569);
    expect(both.stats.doc_pair_rates).toEqual(base.stats.doc_pair_rates);
    expect(both.stats.items_by_family).toEqual({ toronto_ca_decision_pdf: 1, aic_values_batch: 1 });
    expect(both.stats.batch_pair_rates).toEqual({ 'coa-2026-t': 1 });
    expect(both.stats.items_total).toBe(2);
    expect(both.stats.notices_total).toBe(2);
    const sum = (Object.values(both.stats.notices_by_status) as number[]).reduce((n, v) => n + v, 0);
    expect(sum).toBe(both.stats.notices_total);
  });
  it('a batch built under another target-map version is counted stale, not remapped', () => {
    const stale = batch({ target_map_version: 'coa-target-map-0' });
    const rec = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', stale)], { config: CFG });
    expect(rec.stats.batch_target_map_stale).toBe(1);
    expect(rec.rows[0].target).toBe('lot_coverage_pct');
    const fresh = COMPUTE.reconcileNotices([batchDoc('coa-2026-t', batch())], { config: CFG });
    expect(fresh.stats.batch_target_map_stale).toBe(0);
  });
  it('the stale-batch check reports through the compute dispatch', () => {
    const reported: Json[] = [];
    COMPUTE.checks.batch_target_map_stale({ acquired: { reconcile: { batch_target_map_stale: 2 } }, report: (id: string, v: Json) => reported.push({ id, ...v }) });
    expect(reported).toEqual([{ id: 'batch_target_map_stale', violations: 2, detail: 2 }]);
  });
});
