// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 12, §6.6.D, §6.8 row 668
// SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (CoA: T2-or-T4), §Geometric-Only Path for CoA
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DF, R-DL
//
// Phase 4 wave 4 — `compute_coa_cost_estimates` (scripts/compute-coa-cost-estimates.js), MATERIALIZER: one
// derived cost row per priced CoA into cost_estimates (guarded upsert) + the coa_applications cost columns
// and cost_classified_at watermark; McDonald's Airtight V3 from ①. Commit form compressed (R-PACE-1).
// PART 1 = the legacy ORACLE PINS L1–L20 (GREEN today), executing the VERBATIM legacy text through
// `./fixtures/legacy-harness` with the REAL Brain (cost-model-shared) and coa-cost-model.
// PART 2 = the CONVERTED claims D1–D9: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② / ③.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOpts, type LegacyOracle, type SourceRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/compute-coa-cost-estimates.descriptor.json';
const NOTES_REL = 'scripts/compute-coa-cost-estimates.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/compute-coa-cost-estimates.js';
const SHELL_REL = 'scripts/compute-coa-cost-estimates.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-6-compute-coa-cost-estimates-assessment.md';
/** Spec 42 §6.8 Phase D advisory lock (`compute-coa-cost-estimates.js:78`). */
const LOCK_ID = 4204;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const brain = require(path.join(REPO_ROOT, 'src/features/leads/lib/cost-model-shared.js')) as { MODEL_VERSION: number };

/** The 13 max-build / geometry columns the source reads off coa_applications (`:468-482`) — the enrich_parcels
 *  max-build family copied onto CoA by enrich_coa_zoning. Spec 78 O-11 keeps these columns; this list is pinned
 *  so the conversion reads exactly the same ones. */
const MAX_BUILD_COLS = [
  'opt_aor_gfa_sqm', 'opt_coa_gfa_sqm', 'cur_floor_gfa_sqm', 'cur_pot_2story_gfa_sqm', 'max_garage_gfa_sqm',
  'max_laneway_suite_gfa_sqm', 'max_garden_suite_gfa_sqm', 'cur_est_kitchen_gfa_sqm', 'cur_est_bath_gfa_sqm',
  'max_buildable_footprint_sqm',
];

/** A priced low-rise addition (archetype T2 off cost_addition_total). */
function priced(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 1, lead_id: 'coa:A1', scope_tags: ['rear-addition'], structure_type: 'sfd', project_type: 'Addition',
    cost_addition_total: 250000, neighbourhood_cost_premium: 1.1, opt_aor_gfa_sqm: 40,
    parcel_id: 7, lot_size_sqm: 300, frontage_m: 10, active_trade_slugs: ['plumbing'],
    ...over,
  };
}
/** A CoA the Brain cannot price (severance; no cost scalar). */
function unpriced(over: Partial<SourceRow> = {}): SourceRow {
  return { id: 2, lead_id: 'coa:B2', scope_tags: ['severance'], structure_type: 'sfd', project_type: 'Severance', parcel_id: 7, active_trade_slugs: ['plumbing'], ...over };
}

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ runAt: RUN_AT, rows: [priced()], ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[compute_coa_cost_estimates ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[compute_coa_cost_estimates ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[compute_coa_cost_estimates ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[]; via: string }[] {
  return o.queries.filter((q) => re.test(q.sql));
}
function flat(s: string | undefined): string {
  // SQL line comments dropped first, so a pin reads the statement, not its annotations.
  return (s ?? '').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('compute_coa_cost_estimates ① — legacy oracle pins A: config, lock, guards (GREEN today)', () => {
  it('L1 — the config schema validates BEFORE the lock: a missing model_range_pct throws and the lock is never taken', async () => {
    const { o, err } = await run({ logicVars: { model_range_pct: undefined } });
    expect(err?.message).toMatch(/^logicVars validation failed: .*model_range_pct/);
    expect(o.lockIds).toEqual([]);
    expect(o.queries).toHaveLength(0);
  });

  it('L2 — advisory lock 4204; when not acquired, nothing is read or written', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
  });

  it('L3 — the migration-145 guard: no lead_id primary key on cost_estimates throws before any reference read', async () => {
    const { o, err } = await run({ mig145: false });
    expect(err?.message).toContain('migration 145 (lead_id PK swap) has not been applied');
    expect(o.queries).toHaveLength(1);
    expect(flat(o.queries[0]?.sql)).toContain("conname = 'cost_estimates_pkey'");
  });

  it('L4 — reference guards: empty trade_sqft_rates throws; a duplicate trade_slug or (permit_type, structure_type) throws', async () => {
    expect((await run({ tradeRates: [] })).err?.message).toContain('trade_sqft_rates is empty');
    const dupT = [{ trade_slug: 'plumbing', base_rate_sqft: 1, structure_complexity_factor: 1 }, { trade_slug: 'plumbing', base_rate_sqft: 2, structure_complexity_factor: 1 }];
    expect((await run({ tradeRates: dupT })).err?.message).toContain('duplicate trade_slug in trade_sqft_rates: plumbing');
    const dupS = [{ permit_type: 'a', structure_type: 'b', gfa_allocation_percentage: 1 }, { permit_type: 'a', structure_type: 'b', gfa_allocation_percentage: 2 }];
    expect((await run({ scopeMatrix: dupS })).err?.message).toContain('duplicate (permit_type, structure_type) in scope_intensity_matrix: a::b');
  });
});

describe('compute_coa_cost_estimates ① — legacy oracle pins B: the source (GREEN today)', () => {
  it('L5 — incremental cursor: cost_classified_at NULL or older than trade_classified_at, future-dated trades excluded ($1 = RUN_AT), ORDER BY ca.id', async () => {
    const { o } = await run();
    const src = o.queries.find((q) => q.via === 'stream');
    const s = flat(src?.sql);
    expect(s).toContain('WHERE ( ca.cost_classified_at IS NULL OR ca.cost_classified_at < ca.trade_classified_at )');
    expect(s).toContain('AND (ca.trade_classified_at IS NULL OR ca.trade_classified_at <= $1::timestamptz) ORDER BY ca.id ASC');
    expect(src?.params).toEqual([RUN_AT]);
  });

  it('L6 — the source reads the enrich_parcels max-build family off coa_applications (Spec 78 O-11 consumer), cast ::float8', async () => {
    const { o } = await run();
    const s = flat(o.queries.find((q) => q.via === 'stream')?.sql);
    for (const c of MAX_BUILD_COLS) expect(s).toContain(`ca.${c}::float8`);
    expect(s).toContain('ORDER BY lp.confidence DESC NULLS LAST, lp.parcel_id ASC LIMIT 1');
    expect(s).toContain('WHERE parcel_id = lp.parcel_id AND is_primary = true ORDER BY building_id ASC LIMIT 1');
    expect(s).toContain('ARRAY_AGG(t.slug ORDER BY t.slug) FILTER (WHERE lt.is_active = true) AS active_trades');
  });

  it('L7 — --full swaps the cursor for ca.trade_classified_at IS NOT NULL; --limit=N appends LIMIT N', async () => {
    const full = await run({ argv: ['--full'] });
    const s = flat(full.o.queries.find((q) => q.via === 'stream')?.sql);
    expect(s).toContain('WHERE ( ca.trade_classified_at IS NOT NULL )');
    expect(s).not.toContain('cost_classified_at IS NULL');
    const lim = await run({ argv: ['--limit=5'] });
    expect(flat(lim.o.queries.find((q) => q.via === 'stream')?.sql)).toMatch(/ORDER BY ca\.id ASC LIMIT 5\s*$/);
    expect(meta(lim.o).row_limit).toBe(5);
  });

  it('L8 — --dry-run: no transaction, no percentile or corpus query, records_meta.dry_run true', async () => {
    const { o } = await run({ argv: ['--dry-run'] });
    expect(o.txnStarts).toHaveLength(0);
    expect(sqlOf(o, /PERCENTILE_CONT|AS priced/)).toHaveLength(0);
    expect(meta(o).dry_run).toBe(true);
    expect(row(o, 'coa_corpus_total')).toMatchObject({ value: 'N/A' });
  });
});

describe('compute_coa_cost_estimates ① — legacy oracle pins C: writes (GREEN today)', () => {
  it('L9 — a priced CoA writes one 16-column cost_estimates row: permit_num/revision_num NULL, MODEL_VERSION, is_geometric_override false, JSON trade values, computed_at RUN_AT', async () => {
    const { o } = await run();
    const ins = sqlOf(o, /^\s*INSERT INTO cost_estimates/);
    expect(ins).toHaveLength(1);
    expect(ins[0]?.params).toEqual(['coa:A1', null, null, 250000, 'archetype_parcel', 'medium', 187500, 312500, 1.1, 0, brain.MODEL_VERSION, false, null, null, JSON.stringify({ plumbing: 250000 }), RUN_AT]);
  });

  it('L10 — the upsert is GUARDED: ON CONFLICT (lead_id) DO UPDATE … WHERE any of 12 columns IS DISTINCT FROM (computed_at excluded); RETURNING (xmax = 0)', async () => {
    const { o } = await run();
    const s = flat(sqlOf(o, /^\s*INSERT INTO cost_estimates/)[0]?.sql);
    expect(s).toContain('ON CONFLICT (lead_id) DO UPDATE SET');
    const guarded = [...s.matchAll(/EXCLUDED\.(\w+)\s+IS DISTINCT FROM cost_estimates\.\1/g)].map((m) => m[1]);
    expect(guarded).toEqual(['estimated_cost', 'cost_source', 'cost_tier', 'cost_range_low', 'cost_range_high', 'premium_factor', 'complexity_score', 'model_version', 'is_geometric_override', 'modeled_gfa_sqm', 'effective_area_sqm', 'trade_contract_values']);
    expect(s).toContain('RETURNING (xmax = 0) AS is_insert');
  });

  it('L11 — legacy defect (CCCE-D1): a NULL-cost CoA writes NO cost_estimates statement (a stale row survives) while coa_applications gets cost_source none', async () => {
    const { o } = await run({ rows: [unpriced()] });
    expect(sqlOf(o, /cost_estimates/).filter((q) => /^\s*(INSERT|DELETE|UPDATE)/.test(q.sql))).toHaveLength(0);
    const upd = sqlOf(o, /^\s*UPDATE coa_applications/)[0];
    expect(upd?.params.slice(0, 4)).toEqual([2, null, null, 'none']);
  });

  it('L12 — one transaction per flush: cost_estimates upsert THEN UPDATE coa_applications … FROM (VALUES …) with cost_classified_at = RUN_AT for EVERY processed row', async () => {
    const { o } = await run({ rows: [priced(), unpriced()] });
    expect(o.txnStarts).toHaveLength(1);
    const inTxn = o.queries.slice(o.txnStarts[0]).filter((q) => q.via === 'client').map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(inTxn).toEqual(['INSERT INTO cost_estimates', 'UPDATE coa_applications ca']);
    const upd = sqlOf(o, /^\s*UPDATE coa_applications/)[0];
    expect(flat(upd?.sql)).toContain('cost_classified_at = $9::timestamptz FROM (VALUES ($1::bigint, $2::numeric, $3::numeric, $4::varchar), ($5::bigint, $6::numeric, $7::numeric, $8::varchar)) AS v(id, modeled_gfa_sqm, estimated_cost, cost_source) WHERE ca.id = v.id');
    expect(upd?.params).toEqual([1, null, 250000, 'archetype_parcel', 2, null, null, 'none', RUN_AT]);
    expect(row(o, 'coa_applications_updated')).toMatchObject({ value: 2 });
  });

  it('L13 — records_new / records_updated from RETURNING; an unchanged row is records_skipped', async () => {
    const ins = await run({ rows: [priced()] });
    expect(ins.o.summaries[0]).toMatchObject({ records_total: 1, records_new: 1, records_updated: 0 });
    const upd = await run({ rows: [priced()], existing: ['coa:A1'] });
    expect(upd.o.summaries[0]).toMatchObject({ records_new: 0, records_updated: 1 });
    const same = await run({ rows: [priced()], unchanged: ['coa:A1'] });
    expect(row(same.o, 'records_skipped')).toMatchObject({ value: 1 });
    expect(row(same.o, 'total_cost_estimates_written')).toMatchObject({ value: 0 });
  });

  it('L14 — batching at min(1000, floor(65534/16)) = 1000 CoAs: 1001 rows commit in 2 transactions', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => unpriced({ id: i + 1, lead_id: 'coa:N' + String(i) }));
    const { o } = await run({ rows: many });
    expect(o.txnStarts).toHaveLength(2);
  });
});

describe('compute_coa_cost_estimates ① — legacy oracle pins D: audit and meta (GREEN today)', () => {
  it('L15 — null reasons in priority order no_parcel > no_scope_tags > no_active_trades > no_matching_rate, plus the additive tally', async () => {
    const { o } = await run({ rows: [
      unpriced({ id: 1, lead_id: 'coa:1', parcel_id: null, scope_tags: [] }),
      unpriced({ id: 2, lead_id: 'coa:2', scope_tags: [] }),
      unpriced({ id: 3, lead_id: 'coa:3', active_trade_slugs: [] }),
      unpriced({ id: 4, lead_id: 'coa:4' }),
    ] });
    expect(meta(o).null_cost_reasons).toEqual({ no_parcel: 1, no_scope_tags: 1, no_active_trades: 1, no_matching_rate: 1 });
    expect(meta(o).null_cost_reasons_additive).toEqual({ no_parcel: 1, no_scope_tags: 2, no_active_trades: 1 });
  });

  it('L16 — the coverage row: 0 processed INFO N/A; coverage <= coa_cost_coverage_fail_pct FAIL ("> 5%"); >= threshold PASS; between WARN', async () => {
    const none = await run({ rows: [] });
    expect(row(none.o, 'cost_estimate_coverage_pct')).toMatchObject({ value: 'N/A', status: 'INFO' });
    expect(row(none.o, 'coa_eligible')).toMatchObject({ value: 0, status: 'INFO' });
    const zero = await run({ rows: [unpriced()] });
    expect(row(zero.o, 'cost_estimate_coverage_pct')).toMatchObject({ value: '0.0%', threshold: '> 5%', status: 'FAIL' });
    expect(meta(zero.o).audit_table?.verdict).toBe('FAIL');
    const full = await run({ rows: [priced()] });
    expect(row(full.o, 'cost_estimate_coverage_pct')).toMatchObject({ value: '100.0%', threshold: '>= 65%', status: 'PASS' });
    const half = await run({ rows: [priced(), unpriced()] });
    expect(row(half.o, 'cost_estimate_coverage_pct')).toMatchObject({ value: '50.0%', status: 'WARN' });
  });

  it('L17 — post-run reads: PERCENTILE_CONT over coa: rows with computed_at = RUN_AT, formatted en-CA; corpus priced / total coverage', async () => {
    const { o } = await run({ corpus: { priced: 3, total: 12 } });
    const p = sqlOf(o, /PERCENTILE_CONT/)[0];
    expect(flat(p?.sql)).toContain("WHERE lead_id LIKE 'coa:%' AND computed_at = $1::timestamptz AND estimated_cost IS NOT NULL");
    expect(p?.params).toEqual([RUN_AT]);
    expect(row(o, 'cost_distribution_p25_p50_p75')).toMatchObject({ value: '$100,000 / $250,000 / $400,000' });
    expect(row(o, 'coa_corpus_cost_coverage_pct')).toMatchObject({ value: '25.0%', status: 'INFO' });
  });

  it('L18 — the kill switch ARCHETYPE_COST_DISABLED=1: a WARN log and no archetype pricing (the T4 path only)', async () => {
    const { o } = await run({ env: { ARCHETYPE_COST_DISABLED: '1' } });
    expect(o.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('ARCHETYPE_COST_DISABLED=1'))).toBe(true);
    expect(row(o, 'archetype_t2_parcel')).toMatchObject({ value: 0 });
  });

  it('L19 — the §9 audit table: phase 42, "CoA Cost Estimation", 32 rows in this order; tier telemetry counts the T2 row', async () => {
    const { o } = await run();
    expect(meta(o).audit_table).toMatchObject({ phase: 42, name: 'CoA Cost Estimation' });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'coa_eligible', 'coa_with_cost', 'coa_without_cost', 'cost_estimate_coverage_pct', 'coa_corpus_cost_coverage_pct',
      'coa_corpus_priced', 'coa_corpus_total', 'null_reason_no_parcel', 'null_reason_no_scope_tags', 'null_reason_no_active_trades',
      'null_reason_no_matching_rate', 'cost_with_fallback_pct', 'cost_distribution_p25_p50_p75', 'archetype_t1_declared_area',
      'archetype_t2_parcel', 'archetype_t3_rate', 'archetype_additive_pairs', 'archetype_coverage_pct', 'tier_none_count',
      'archetype_fit_blocked', 'archetype_zero_total', 'archetype_tradeless_count', 'archetype_unpriceable_t4',
      't4_nonresidential_count', 't4_processed', 'archetype_map_nofit_residential_pct', 'phase_h_gap_active', 'records_new',
      'records_updated', 'records_skipped', 'coa_applications_updated', 'total_cost_estimates_written',
    ]);
    expect(row(o, 'archetype_t2_parcel')).toMatchObject({ value: 1 });
    expect(row(o, 'phase_h_gap_active')).toMatchObject({ value: true, status: 'INFO' });
  });

  it('L20 — emitMeta reads 11 tables (coa_applications incl. the max-build family) and writes cost_estimates (16) + coa_applications (4)', async () => {
    const { o } = await run();
    const m = o.metas[0];
    expect(Object.keys(m?.reads ?? {})).toEqual(['coa_applications', 'lead_parcels', 'parcels', 'parcel_buildings', 'building_footprints', 'neighbourhoods', 'lead_trades', 'trades', 'trade_sqft_rates', 'scope_intensity_matrix', 'archetype_cost_rates']);
    for (const c of MAX_BUILD_COLS) expect(m?.reads.coa_applications).toContain(c);
    expect(m?.writes.cost_estimates).toHaveLength(16);
    expect(m?.writes.coa_applications).toEqual(['modeled_gfa_sqm', 'estimated_cost', 'cost_source', 'cost_classified_at']);
  });
});

// PART 2 — the converted claims D1–D9 (`it.fails` at ①). D1–D8 flip at ② (which waits on the MATERIALIZER
// runner-built row form, .cursor/v3-materializer-form-ruling-2026-10-18.md); D9 flips at ③.
interface WriteSpec { table: string; write_discipline: { class: string; scope?: string; why?: { text: string } } }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  execution: { shape: string; batch_size_from_config?: string; invocation?: unknown };
  inputs: { reads: { tables: { table: string; columns: string[] }[] } };
  outputs: { writes: WriteSpec[] };
  guards: { requires?: { kind: string; name: string }[] };
  config: { logic_variables: { name: string }[] };
  checks: { id: string; limit?: string; limit_from_config?: string; warn_limit_from_config?: string; severity: string }[];
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('compute_coa_cost_estimates ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
// Full-form row 7 lands at stage compute_ported (Spec 123 §7; W4A-R6 / Spec 124 R-EF; operator Q5 y 2026-10-19):
// descriptor, compute, notes and the seeds migration only — the legacy shell stays the live step until the cutover, as
// the enrich_coa_zoning ② (a9011b83) and the assert_coa_freshness ② (ffec8296). So every frozen-shell assertion is split
// out as an it.fails that flips at the cutover (row 9 / ③), and the descriptor halves flip here.
  it('D1 — identity: archetype MATERIALIZER, lock 4204, spec "42", shape "materialize"; notes exist (flipped at row 7)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'compute_coa_cost_estimates', archetype: 'MATERIALIZER', spec: '42', lock: LOCK_ID });
    expect(d.execution.shape).toBe('materialize');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
  });

  it.fails('D1b — frozen shell: pipeline.step() (flips at the cutover)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it('D2 — two write targets (cost_estimates scoped lead_id LIKE \'coa:%\', coa_applications), each with rls_bypass_or_policy (flipped at row 7)', () => {
    const d = loadDescriptor();
    expect(d.outputs.writes.map((w) => w.table).sort()).toEqual(['coa_applications', 'cost_estimates']);
    expect(d.outputs.writes.find((w) => w.table === 'cost_estimates')?.write_discipline.scope ?? '').toContain("lead_id LIKE 'coa:%'");
    const req = (d.guards.requires ?? []).filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name).sort();
    expect(req).toEqual(['coa_applications', 'cost_estimates']);
  });

  it('D3 — the declared read keeps the enrich_parcels max-build family on coa_applications exactly (Spec 78 O-11 consumer list) (flipped at row 7)', () => {
    const ca = loadDescriptor().inputs.reads.tables.find((t) => t.table === 'coa_applications');
    for (const c of MAX_BUILD_COLS) expect(ca?.columns).toContain(c);
  });

  it('D4 — every legacy literal and operator knob is declared (R-DF EXTERNALIZED, R-BD): batch size registered and executed from config (flipped at row 7)', () => {
    const d = loadDescriptor();
    expect(d.config.logic_variables.map((v) => v.name)).toContain('compute_coa_cost_estimates_batch_size');
    expect(d.execution.batch_size_from_config).toBe('compute_coa_cost_estimates_batch_size');
  });

  it.fails('D4b — the shell reads no argv / env knob (--full is override.force_full; --dry-run / --limit / ARCHETYPE_COST_DISABLED retired) (flips at the cutover)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).not.toMatch(/process\.argv|process\.env/);
  });

  // The post-run distribution read is SQL TEXT the compute authors and the runner executes once after the loop
  // (Spec 124 R-EH (e) buildPostSql; CCCE-D6), so PERCENTILE_CONT may appear there and nowhere else in the compute.
  it('D5 — compute is pure (R-BZ): no .query, no transaction, no Date.now, no pg_constraint probe, no LIMIT interpolation; PERCENTILE_CONT only in buildPostSql (flipped at row 7)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/\.query\(|withTransaction|streamQuery|Date\.now\(/);
    expect(c).not.toMatch(/pg_constraint/);
    expect(c).not.toMatch(/LIMIT \$\{/);
    const post = c.slice(c.indexOf('function buildPostSql'));
    expect(c.slice(0, c.indexOf('function buildPostSql'))).not.toMatch(/PERCENTILE_CONT/);
    expect(post.slice(0, post.indexOf('\n}\n'))).toMatch(/PERCENTILE_CONT/);
    expect(post.slice(post.indexOf('\n}\n'))).not.toMatch(/PERCENTILE_CONT/);
  });

  it('D6 — the verdict is row-derived (G7): coverage FAIL / WARN bounds and the nofit WARN are declared checks reading their own variables; compute holds no PASS/WARN/FAIL (flipped at row 7)', () => {
    const d = loadDescriptor();
    const byId = new Map(d.checks.map((c) => [c.id, c]));
    // Spec 124a R-AD: `limit` is the PASS bound and `warn_limit` the looser one (one row PASS/WARN/FAIL), so the coverage
    // threshold binds `limit` and the fail floor `warn_limit` (the ① claim had them swapped, which left the WARN tier
    // unreachable; parity with the legacy row is pinned in post-read-parity.logic (3)).
    expect(byId.get('cost_estimate_coverage_pct')?.limit_from_config).toBe('compute_coa_cost_estimates_coverage_threshold_pct');
    expect(byId.get('cost_estimate_coverage_pct')?.warn_limit_from_config).toBe('compute_coa_cost_estimates_coverage_fail_pct');
    expect(byId.get('archetype_map_nofit_residential_pct')).toBeDefined();
    expect(readText(COMPUTE_REL)).not.toMatch(/'(PASS|WARN|FAIL)'/);
  });

  it('D7 — the legacy parity defect CCCE-D1 (a stale cost_estimates row survives a NULL cost) is a declared deviation on the cost_estimates write (flipped at row 7)', () => {
    const ce = loadDescriptor().outputs.writes.find((w) => w.table === 'cost_estimates');
    expect(ce?.write_discipline.why?.text ?? '').toContain('CCCE-D1');
  });

  // FLIPPED at RE-FREEZE #37 / replay night N1 (operator y 2026-10-19): step-validate --all --write writes the generated
  // scorecard into the assessment report of EVERY registry step — converted[] and pending[] alike, red_suite included —
  // as designed by Spec 124 R-R / Rule 13 (step-validate.mjs is the ONE command that generates the Spec 123 §6
  // scorecard, over the registry derived from converted.json + pending). The block now exists before ②.
  it('D8 — the assessment report carries the generated validation scorecard (written by step-validate --all --write at N1, R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D9 — registered: census archetype MATERIALIZER and converted.json converted[] holds scripts/compute-coa-cost-estimates.js (③) (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/compute-coa-cost-estimates.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "compute_coa_cost_estimates",[\s\S]{0,400}"archetype": "MATERIALIZER"/);
  });
});
