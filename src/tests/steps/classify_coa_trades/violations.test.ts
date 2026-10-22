// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667, §6.11 Phase D R5.4
// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5 (realtor gate, §5.B products, §5.C inference)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DF, R-DL
//
// Phase 4 wave 4 — `classify_coa_trades` (scripts/classify-coa-trades.js), MATERIALIZER: derived per-lead
// rows into lead_trades + lead_products, watermark coa_applications.trade_classified_at; McDonald's Airtight
// V3 from ①. Commit form compressed (R-PACE-1): ① assessment + this suite, ② descriptor + compute + notes +
// shell + seeds (waits on the MATERIALIZER runner-built row form), ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L20: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions), so the conversion must reproduce
// the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D9: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② / ③.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type CoaRow, type LegacyOpts, type LegacyOracle } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/classify-coa-trades.descriptor.json';
const NOTES_REL = 'scripts/classify-coa-trades.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/classify-coa-trades.js';
const SHELL_REL = 'scripts/classify-coa-trades.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-5-classify-coa-trades-assessment.md';
/** Spec 42 §6.8 Phase D advisory lock (`classify-coa-trades.js:52`). */
const LOCK_ID = 4203;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

// The real classifier is the oracle's own module, so the expected rows are derived from it here,
// never retyped from the matrix.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const classifier = require(path.join(REPO_ROOT, 'scripts/lib/coa-trade-classifier.js')) as {
  classifyCoaTrades(row: unknown, opts?: { inferenceEnabled?: boolean }): { slug: string; confidence: number; attachment_basis: string }[];
  classifyCoaProducts(row: unknown, deprecated: Set<string>): { slug: string; confidence: number }[];
  TAG_TRADE_MATRIX: Record<string, [string, number][]>;
  DEPRECATED_TRADE_SLUGS: Set<string>;
};

/** Every slug the matrix or the inference complement can emit, with stable ids; realtor keeps 33. */
function tradeVocab(extra: string[] = []): { id: number; slug: string }[] {
  const slugs = new Set<string>(extra);
  for (const list of Object.values(classifier.TAG_TRADE_MATRIX)) for (const [s] of list) slugs.add(s);
  for (const s of ['caulking', 'millwork-cabinetry', 'stone-countertops', 'tiling', 'trim-work']) slugs.add(s);
  const sorted = [...slugs].sort();
  return [...sorted.map((slug, i) => ({ id: 100 + i, slug })), { id: 33, slug: 'realtor' }];
}
const TRADES = tradeVocab();
const TRADE_ID = new Map(TRADES.map((t) => [t.slug, t.id]));

function coa(over: Partial<CoaRow> = {}): CoaRow {
  return {
    id: 1,
    lead_id: 'coa:A0001/26TEY',
    scope_tags: ['kitchen', 'bathroom'],
    coa_type_class: 'residential',
    project_type: 'addition',
    structure_type: 'sfd',
    scope_classified_at: new Date('2026-10-17T00:00:00Z'),
    ...over,
  };
}
function productVocab(rows: CoaRow[]): { id: number; slug: string }[] {
  const slugs = new Set<string>();
  for (const r of rows) for (const p of classifier.classifyCoaProducts(r, classifier.DEPRECATED_TRADE_SLUGS)) slugs.add(p.slug);
  return [...slugs].sort().map((slug, i) => ({ id: 500 + i, slug }));
}

/** One named §9 audit row. */
interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const rows = opts.rows ?? [coa()];
  const o = loadLegacy({ runAt: RUN_AT, trades: TRADES, products: productVocab(rows), ...opts, rows });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[classify_coa_trades ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[classify_coa_trades ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[classify_coa_trades ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[]; via: string }[] {
  return o.queries.filter((q) => re.test(q.sql));
}
/** lead_trades rows as 9-tuples, from the INSERT params. */
function tradeTuples(o: LegacyOracle): unknown[][] {
  const out: unknown[][] = [];
  for (const q of sqlOf(o, /^\s*INSERT INTO lead_trades/)) for (let i = 0; i < q.params.length; i += 9) out.push(q.params.slice(i, i + 9));
  return out;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('classify_coa_trades ① — legacy oracle pins A: config, lock, source (GREEN today)', () => {
  it('L1 — logic variables validate BEFORE the lock: an out-of-range threshold throws and the lock is never taken', async () => {
    const { o, err } = await run({ logicVars: { coa_trades_unmapped_threshold_pct: 101 } });
    expect(err?.message).toMatch(/^logicVars validation failed/);
    expect(o.lockIds).toEqual([]);
    expect(o.queries).toHaveLength(0);
    const bad = await run({ logicVars: { vocab_coverage_warn_pct: 90, vocab_coverage_pass_pct: 90 } });
    expect(bad.err?.message).toContain('vocab_coverage_warn_pct must be strictly less than vocab_coverage_pass_pct');
  });

  it('L2 — advisory lock 4203; when not acquired, nothing is read, written or summarised', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
  });

  it('L3 — reference reads in order: realtor probe (id 33, slug realtor), trades vocab, product_groups vocab, then the source stream', async () => {
    const { o } = await run();
    const heads = o.queries.slice(0, 4).map((q) => q.sql.trim().split('\n')[0]);
    expect(heads[0]).toBe('SELECT id, slug FROM trades WHERE id = $1 AND slug = $2');
    expect(o.queries[0]?.params).toEqual([33, 'realtor']);
    expect(heads[1]).toBe('SELECT id, slug FROM trades');
    expect(heads[2]).toBe('SELECT id, slug FROM product_groups');
    expect(o.queries[3]?.via).toBe('stream');
  });

  it('L4 — the source cursor: scope_tags and scope_classified_at NOT NULL, trade_classified_at NULL or older than scope_classified_at, ORDER BY id', async () => {
    const { o } = await run();
    const src = o.queries.find((q) => q.via === 'stream');
    const flat = (src?.sql ?? '').replace(/\s+/g, ' ');
    expect(flat).toContain('SELECT id, lead_id, scope_tags, coa_type_class, project_type, structure_type, scope_classified_at FROM coa_applications');
    expect(flat).toContain('WHERE scope_tags IS NOT NULL AND scope_classified_at IS NOT NULL AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at) ORDER BY id ASC');
    expect(src?.params).toEqual([]);
  });
});

describe('classify_coa_trades ① — legacy oracle pins B: lead_trades (GREEN today)', () => {
  it('L5 — one row per classified slug: tier 3, is_active true, phase null, lead_score round(confidence·100), basis, classified_at = RUN_AT', async () => {
    const c = coa({ coa_type_class: 'commercial' });
    const { o } = await run({ rows: [c] });
    const expected = classifier.classifyCoaTrades(c, { inferenceEnabled: false }).map((m) => [
      c.lead_id, TRADE_ID.get(m.slug), 3, m.confidence, true, null, Math.round(m.confidence * 100), m.attachment_basis, RUN_AT,
    ]);
    expect(tradeTuples(o)).toEqual(expected);
  });

  it('L6 — the upsert is UNGUARDED: ON CONFLICT (lead_id, trade_id) DO UPDATE rewrites all 7 non-key columns incl. classified_at, no WHERE, RETURNING (xmax = 0)', async () => {
    const { o } = await run();
    const ins = sqlOf(o, /^\s*INSERT INTO lead_trades/)[0]?.sql.replace(/\s+/g, ' ') ?? '';
    expect(ins).toContain('(lead_id, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis, classified_at)');
    expect(ins).toContain('ON CONFLICT (lead_id, trade_id) DO UPDATE SET tier = EXCLUDED.tier, confidence = EXCLUDED.confidence, is_active = EXCLUDED.is_active, phase = EXCLUDED.phase, lead_score = EXCLUDED.lead_score, attachment_basis = EXCLUDED.attachment_basis, classified_at = EXCLUDED.classified_at RETURNING (xmax = 0) AS is_insert');
    expect(ins).not.toMatch(/IS DISTINCT FROM|WHERE/);
  });

  it('L7 — realtor append: a residential CoA adds trade 33 at confidence 0.7 / score 70 / evidence; non-residential does not', async () => {
    const res = await run({ rows: [coa()] });
    const realtor = tradeTuples(res.o).filter((t) => t[1] === 33);
    expect(realtor).toEqual([['coa:A0001/26TEY', 33, 3, 0.7, true, null, 70, 'evidence', RUN_AT]]);
    expect(row(res.o, 'realtor_inclusion_pct')).toMatchObject({ value: '100.0%', status: 'INFO' });
    const com = await run({ rows: [coa({ coa_type_class: 'commercial' })] });
    expect(tradeTuples(com.o).filter((t) => t[1] === 33)).toEqual([]);
    expect(row(com.o, 'realtor_inclusion_pct')).toMatchObject({ value: 'N/A', threshold: 'N/A' });
  });

  it('L8 — realtor unavailable: a WARN log, no realtor row, the run continues (residential_count still counts)', async () => {
    const { o, err } = await run({ realtorAvailable: false });
    expect(err).toBeNull();
    expect(o.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('trades.id=33'))).toBe(true);
    expect(tradeTuples(o).filter((t) => t[1] === 33)).toEqual([]);
    expect(meta(o).residential_count).toBe(1);
    expect(meta(o).realtor_append_count).toBe(0);
  });

  it('L9 — the inference gate p16_inference_layer_enabled: 0 → evidence only; 1 → the classifier complement rows with basis inference', async () => {
    const c = coa({ coa_type_class: 'commercial' });
    const off = await run({ rows: [c] });
    expect(tradeTuples(off.o).map((t) => t[7])).not.toContain('inference');
    expect(row(off.o, 'inference_layer_enabled')).toMatchObject({ value: 0 });
    const on = await run({ rows: [c], logicVars: { p16_inference_layer_enabled: 1 } });
    const inf = classifier.classifyCoaTrades(c, { inferenceEnabled: true }).filter((m) => m.attachment_basis === 'inference');
    expect(inf.length).toBeGreaterThan(0);
    expect(tradeTuples(on.o).filter((t) => t[7] === 'inference')).toHaveLength(inf.length);
    expect(row(on.o, 'coa_inference_rows_emitted')).toMatchObject({ value: inf.length });
  });

  it('L10 — legacy defect (CCT-D1): a CoA whose matrix no longer emits a slug gets NO retraction — no DELETE FROM lead_trades is ever issued', async () => {
    const { o } = await run({ rows: [coa({ scope_tags: ['severance'], project_type: null, coa_type_class: 'commercial' })], existingTradeKeys: ['coa:A0001/26TEY|' + String(TRADE_ID.get('plumbing'))] });
    expect(sqlOf(o, /DELETE FROM lead_trades/)).toHaveLength(0);
    expect(sqlOf(o, /^\s*INSERT INTO lead_trades/)).toHaveLength(0);
    expect(row(o, 'coa_zero_trades')).toMatchObject({ value: 1 });
  });

  it('L11 — records_new / records_updated come from RETURNING (xmax = 0); every conflict counts as updated (no guard)', async () => {
    const c = coa({ coa_type_class: 'commercial' });
    const slugs = classifier.classifyCoaTrades(c).map((m) => m.slug);
    const { o } = await run({ rows: [c], existingTradeKeys: [c.lead_id + '|' + String(TRADE_ID.get(slugs[0] ?? ''))] });
    expect(o.summaries[0]?.records_new).toBe(slugs.length - 1);
    expect(o.summaries[0]?.records_updated).toBe(1);
    expect(row(o, 'total_lead_trades_written')).toMatchObject({ value: slugs.length });
  });
});

describe('classify_coa_trades ① — legacy oracle pins C: lead_products, watermark, batching (GREEN today)', () => {
  it('L12 — one transaction per flush, in order: lead_trades upsert → DELETE lead_products for EVERY processed lead → INSERT lead_products → watermark', async () => {
    const zero = coa({ id: 2, lead_id: 'coa:B2', scope_tags: ['severance'], project_type: null, coa_type_class: 'commercial' });
    const { o } = await run({ rows: [coa(), zero] });
    expect(o.txnStarts).toHaveLength(1);
    const inTxn = o.queries.slice(o.txnStarts[0]).map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(inTxn).toEqual(['INSERT INTO lead_trades', 'DELETE FROM lead_products', 'INSERT INTO lead_products', 'UPDATE coa_applications SET']);
    expect(sqlOf(o, /^\s*DELETE FROM lead_products/)[0]?.params).toEqual([['coa:A0001/26TEY', 'coa:B2']]);
    expect(sqlOf(o, /^\s*INSERT INTO lead_products/)[0]?.sql.replace(/\s+/g, ' ')).toContain('ON CONFLICT (lead_id, product_id) DO NOTHING');
  });

  it('L13 — product rows: [lead_id, product_id, confidence, RUN_AT] per classifier product hit; a product slug miss FAILs product_slug_miss_count', async () => {
    const c = coa();
    const { o } = await run({ rows: [c] });
    const ps = sqlOf(o, /^\s*INSERT INTO lead_products/)[0]?.params ?? [];
    const prods = classifier.classifyCoaProducts(c, classifier.DEPRECATED_TRADE_SLUGS);
    expect(ps.length).toBe(prods.length * 4);
    expect(ps.slice(0, 4)).toEqual([c.lead_id, 500, prods[0]?.confidence, RUN_AT]);
    expect(row(o, 'product_slug_miss_count')).toMatchObject({ value: 0, threshold: '== 0', status: 'PASS' });
    const miss = await run({ rows: [c], products: [] });
    expect(row(miss.o, 'product_slug_miss_count')).toMatchObject({ value: prods.length, status: 'FAIL' });
    expect(meta(miss.o).audit_table?.verdict).toBe('FAIL');
  });

  it('L14 — the watermark: UPDATE coa_applications SET trade_classified_at = RUN_AT WHERE id = ANY(ids), zero-trade CoAs included', async () => {
    const zero = coa({ id: 9, lead_id: 'coa:Z9', scope_tags: ['severance'], project_type: null, coa_type_class: 'commercial' });
    const { o } = await run({ rows: [coa(), zero] });
    const upd = sqlOf(o, /^\s*UPDATE coa_applications/);
    expect(upd).toHaveLength(1);
    expect(upd[0]?.sql.replace(/\s+/g, ' ').trim()).toBe('UPDATE coa_applications SET trade_classified_at = $2::timestamptz WHERE id = ANY($1::bigint[])');
    expect(upd[0]?.params).toEqual([[1, 9], RUN_AT]);
  });

  it('L15 — batching: a flush at 1000 CoAs (min(1000, floor(65535/9))), so 1001 CoAs commit in 2 transactions', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => coa({ id: i + 1, lead_id: 'coa:N' + String(i), scope_tags: ['severance'], project_type: null, coa_type_class: 'commercial' }));
    const { o } = await run({ rows: many, products: [] });
    expect(o.txnStarts).toHaveLength(2);
    const upd = sqlOf(o, /^\s*UPDATE coa_applications/);
    expect((upd[0]?.params[0] as unknown[]).length).toBe(1000);
    expect((upd[1]?.params[0] as unknown[]).length).toBe(1);
  });

  it('L16 — an empty cursor: no transaction at all, coa_eligible WARNs (> 0), unmapped_scope_pct PASSes at 0.0%', async () => {
    const { o } = await run({ rows: [] });
    expect(o.txnStarts).toHaveLength(0);
    expect(row(o, 'coa_eligible')).toMatchObject({ value: 0, threshold: '> 0', status: 'WARN' });
    expect(row(o, 'unmapped_scope_pct')).toMatchObject({ value: '0.0%', status: 'PASS' });
    expect(meta(o).audit_table?.verdict).toBe('WARN');
  });
});

describe('classify_coa_trades ① — legacy oracle pins D: audit, meta, vocab (GREEN today)', () => {
  it('L17 — the §9 audit table: phase 42, "CoA Trade Classification", 22 rows in this order', async () => {
    const { o } = await run();
    expect(meta(o).audit_table).toMatchObject({ phase: 42, name: 'CoA Trade Classification' });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'coa_eligible', 'coa_with_trades', 'coa_zero_trades', 'unmapped_scope_pct', 'realtor_inclusion_pct',
      'avg_trades_per_lead', 'avg_active_trades_per_lead', 'median_active_trades_per_lead_nonzero', 'coa_with_active_trades',
      'avg_evidence_trades_per_lead', 'median_evidence_trades_per_lead_nonzero', 'inference_layer_enabled', 'coa_inference_rows_emitted',
      'slug_resolution_miss_count', 'records_new', 'records_updated', 'total_lead_trades_written', 'coa_trades_strong_signal',
      'coa_trades_inference', 'coa_with_products', 'lead_products_written', 'product_slug_miss_count',
    ]);
  });

  it('L18 — unmapped_scope_pct boundary: <= threshold PASS, above it WARN (threshold text "<= 20%")', async () => {
    const zero = (id: number): CoaRow => coa({ id, lead_id: 'coa:U' + String(id), scope_tags: ['severance'], project_type: null, coa_type_class: 'commercial' });
    const ok = await run({ rows: [coa(), coa({ id: 2, lead_id: 'coa:2' }), coa({ id: 3, lead_id: 'coa:3' }), coa({ id: 4, lead_id: 'coa:4' }), zero(5)] });
    expect(row(ok.o, 'unmapped_scope_pct')).toMatchObject({ value: '20.0%', threshold: '<= 20%', status: 'PASS' });
    const over = await run({ rows: [coa(), zero(2)] });
    expect(row(over.o, 'unmapped_scope_pct')).toMatchObject({ value: '50.0%', status: 'WARN' });
  });

  it('L19 — avg_active_trades_per_lead WARNs above coa_active_trades_warn_max; a slug miss FAILs and lists the slug (cap 50, sorted)', async () => {
    const c = coa();
    const active = classifier.classifyCoaTrades(c).length + 1;
    const warn = await run({ rows: [c], logicVars: { coa_active_trades_warn_max: active - 1 } });
    expect(row(warn.o, 'avg_active_trades_per_lead')).toMatchObject({ value: active.toFixed(2), threshold: '<= ' + String(active - 1), status: 'WARN' });
    const noPlumbing = TRADES.filter((t) => t.slug !== 'plumbing');
    const miss = await run({ rows: [c], trades: noPlumbing });
    expect(row(miss.o, 'slug_resolution_miss_count')).toMatchObject({ value: 1, threshold: '== 0', status: 'FAIL' });
    expect(meta(miss.o).slug_resolution_misses).toEqual(['plumbing']);
  });

  it('L20 — vocab coverage from manifest telemetry_vocab_cols; emitMeta reads 3 tables and writes lead_trades, lead_products, coa_applications[trade_classified_at]', async () => {
    const { o } = await run();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require(path.join(REPO_ROOT, 'scripts/manifest.json')) as { scripts: Record<string, { telemetry_vocab_cols?: unknown }> };
    expect(o.vocabSpecs).toEqual([manifest.scripts.classify_coa_trades?.telemetry_vocab_cols]);
    expect(o.summaries[0]?.telemetry_context).toMatchObject({ vocab_coverage_thresholds: { pass: 90, warn: 70 } });
    expect(Object.keys(o.metas[0]?.reads ?? {})).toEqual(['coa_applications', 'trades', 'product_groups']);
    expect(Object.keys(o.metas[0]?.writes ?? {})).toEqual(['lead_trades', 'lead_products', 'coa_applications']);
    expect(o.metas[0]?.writes.coa_applications).toEqual(['trade_classified_at']);
  });
});

// PART 2 — the converted claims D1–D9 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT, never a
// TS/import error. D1–D8 flip at ② (which waits on the MATERIALIZER runner-built row form, drafted in
// .cursor/v3-materializer-form-ruling-2026-10-18.md); D9 flips at ③.
interface WriteSpec { table: string; retract?: string; write_discipline: { class: string; scope?: string; why?: { text: string } } }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  execution: { shape: string; batch_size_from_config?: string };
  outputs: { writes: WriteSpec[] };
  guards: { requires?: { kind: string; name: string }[] };
  config: { logic_variables: { name: string }[] };
  checks: { id: string; limit?: string; limit_from_config?: string; severity: string }[];
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('classify_coa_trades ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
// Full-form row 7 lands at stage compute_ported (Spec 123 §7; W4A-R6 / Spec 124 R-EF; operator Q5 y 2026-10-19):
// descriptor, compute, notes and the seeds migration only — the legacy shell stays the live step until the cutover, as
// the enrich_coa_zoning ② (a9011b83) and the assert_coa_freshness ② (ffec8296). So every frozen-shell assertion is split
// out as an it.fails that flips at the cutover (row 9 / ③), and the descriptor halves flip here.
  it('D1 — identity: archetype MATERIALIZER, lock 4203, spec "42", shape "materialize"; notes exist (flipped at row 7)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'classify_coa_trades', archetype: 'MATERIALIZER', spec: '42', lock: LOCK_ID });
    expect(d.execution.shape).toBe('materialize');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
  });

  // FLIPPED at the shell swap (Spec 124 R-EQ, P4-SWAP: a step whose ② landed at compute_ported moves to runner_wired in its swap commit); the legacy-name retirement and converted[] registration stay at ③.
  it('D1b — frozen shell: pipeline.step(), not pipeline.run() (flipped at the R-EQ shell swap)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it('D2 — three write targets, each with rls_bypass_or_policy (R-CT); lead_trades / lead_products writes are scoped lead_id LIKE \'coa:%\' (trigger co-writer) (flipped at row 7)', () => {
    const d = loadDescriptor();
    expect([...new Set(d.outputs.writes.map((w) => w.table))].sort()).toEqual(['coa_applications', 'lead_products', 'lead_trades']);
    const req = (d.guards.requires ?? []).filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name).sort();
    expect(req).toEqual(['coa_applications', 'lead_products', 'lead_trades']);
    for (const w of d.outputs.writes.filter((x) => x.table !== 'coa_applications')) expect(w.write_discipline.scope ?? '').toContain("lead_id LIKE 'coa:%'");
  });

  it('D3 — the live mirror trigger trg_mirror_permit_trades_to_lead_trades is declared as a co-writer of lead_trades (the ledger undercounts) (flipped at row 7)', () => {
    expect(readText(DESCRIPTOR_REL) + readText(NOTES_REL)).toContain('trg_mirror_permit_trades_to_lead_trades');
  });

  it('D4 — every legacy literal is a registered logic variable (R-DF EXTERNALIZED): tier, realtor confidence, lead-score scale, batch size, slug-miss detail cap (flipped at row 7)', () => {
    const d = loadDescriptor();
    const names = d.config.logic_variables.map((v) => v.name);
    for (const n of ['classify_coa_trades_tier', 'classify_coa_trades_realtor_confidence', 'classify_coa_trades_lead_score_scale', 'classify_coa_trades_batch_size', 'classify_coa_trades_max_detail_keys']) {
      expect(names).toContain(n);
    }
    expect(d.execution.batch_size_from_config).toBe('classify_coa_trades_batch_size');
  });

  it('D5 — compute is pure (R-BZ): no .query, no transaction, no Date.now, no manifest require, no literal 0.7 / tier 3 / ·100, no `?? 18` fallback (flipped at row 7)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/\.query\(|withTransaction|streamQuery|Date\.now\(/);
    expect(c).not.toMatch(/manifest\.json/);
    expect(c).not.toMatch(/0\.7\b|\?\?\s*18|\*\s*100\b/);
  });

  it('D6 — the verdict is row-derived from declared checks (G7): slug and product misses viol == 0 FAIL; unmapped and fan-out bounds limit_from_config; compute holds no PASS/WARN/FAIL decision (flipped at row 7)', () => {
    const d = loadDescriptor();
    const byId = new Map(d.checks.map((c) => [c.id, c]));
    expect(byId.get('slug_resolution_miss_count')).toMatchObject({ limit: 'viol == 0', severity: 'FAIL' });
    expect(byId.get('product_slug_miss_count')).toMatchObject({ limit: 'viol == 0', severity: 'FAIL' });
    expect(byId.get('unmapped_scope_pct')?.limit_from_config).toBe('classify_coa_trades_unmapped_threshold_pct');
    expect(byId.get('avg_active_trades_per_lead')?.limit_from_config).toBe('classify_coa_trades_active_trades_warn_max');
    expect(readText(COMPUTE_REL)).not.toMatch(/'(PASS|WARN|FAIL)'/);
  });

  it('D7 — the legacy parity defect CCT-D1 (stale lead_trades never retracted) is a declared deviation on the lead_trades write, not a silent gap (flipped at row 7)', () => {
    const lt = loadDescriptor().outputs.writes.find((w) => w.table === 'lead_trades');
    expect(lt?.retract).toBe('none');
    expect(lt?.write_discipline.why?.text ?? '').toContain('CCT-D1');
  });

  // FLIPPED at RE-FREEZE #37 / replay night N1 (operator y 2026-10-19): step-validate --all --write writes the generated
  // scorecard into the assessment report of EVERY registry step — converted[] and pending[] alike, red_suite included —
  // as designed by Spec 124 R-R / Rule 13 (step-validate.mjs is the ONE command that generates the Spec 123 §6
  // scorecard, over the registry derived from converted.json + pending). The block now exists before ②.
  it('D8 — the assessment report carries the generated validation scorecard (written by step-validate --all --write at N1, R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D9 — registered: census archetype MATERIALIZER and converted.json converted[] holds scripts/classify-coa-trades.js (③) (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/classify-coa-trades.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "classify_coa_trades",[\s\S]{0,400}"archetype": "MATERIALIZER"/);
  });
});
