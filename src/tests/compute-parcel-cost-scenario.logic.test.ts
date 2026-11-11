// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.4, §2.11 (dated notes 2026-11-09, MB-86)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-67 (dated note 2026-11-09)
//
// MB-86 · McBylaws queue · lane E-COST · stage 7. The step half of the per-scenario lines
// (scripts/lib/compute/compute-parcel-cost-estimates.js + the descriptor), on fakes, no DB:
//   - the declared read of parcel_maxbld_scenarios refuses cleanly when the table is absent
//     (catalog columnCount 0: no scenario join, no stale query, scenario_source_absent = 1);
//   - present: the stream carries the scenario rows, the menu gains the scenario lines, the counters move;
//   - records_meta always carries the scenario counters, zero included;
//   - the descriptor declares the read, the three checks and the emits; expect_nonempty false carries no deviations[] entry
//     (operator 2026-11-11 "recommendation accepted", MB-86 E1: the form of the V3 descriptors that set it false).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const C = req(path.join(ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js')) as Json;
const P = req(path.join(ROOT, 'scripts/lib/parcel-cost.js')) as Json;
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/compute-parcel-cost-estimates.descriptor.json'), 'utf8')) as Json;

const SCENARIO_COUNTERS = [
  'scenario_source_present', 'scenario_parcels', 'scenario_lines_priced', 'scenario_lines_at_least', 'scenario_lines_refused',
  'scenario_lines_not_modelled', 'scenario_lines_no_rate', 'scenario_lines_malformed_rate', 'scenario_lines_exceed_coa',
  'scenario_gfa_computed_cost_missing', 'scenario_cost_stale',
];
const LINE_ROWS = P.PARCEL_COST_LINES.map((l: Json) => ({
  id: l.id, archetype: l.id === 'coa_build' ? 'CoA' : 'FB', base_confidence: 'high', fit_permitted_values: l.fitField ? ['as_of_right'] : null,
}));
const SCENARIO_ROWS = [
  { id: 'scenario:detached_house/gfa_max_m2', archetype: 'FB', base_confidence: 'high', fit_permitted_values: null },
  { id: 'scenario:detached_house/gfa_flat_m2', archetype: 'FB', base_confidence: 'high', fit_permitted_values: null },
  { id: 'scenario:detached_house/gfa_pitched_m2', archetype: 'FB', base_confidence: 'high', fit_permitted_values: null },
  { id: 'scenario:detached_houseplex/gfa_max_m2', archetype: 'HOUSEPLEX', base_confidence: 'low', fit_permitted_values: null },
];

function contractPool(lineRows: Json[]) {
  return {
    async query(sql: string) {
      if (/FROM archetype_cost_rates/.test(sql) && !/MAX\(updated_at\)/.test(sql)) return { rows: [{ archetype: 'FB', cost_per_sqm: 4844, cost_adjustment_factor: 1, escalation_index_base: 100 }] };
      if (/FROM parcel_cost_lines/.test(sql) && !/MAX\(updated_at\)/.test(sql)) return { rows: lineRows };
      return { rows: [{ rates_as_of: null, index_updated_at: null, cost_lines_updated_at: null }] };
    },
  };
}

describe('MB-86 readCostContract: the scenario catalogue and the absent-table probe', () => {
  it('absent table (catalog columnCount 0) -> scenarioSourcePresent false; the 13 lines merge untouched beside the scenario rows', async () => {
    const asked: string[] = [];
    const contract = await C.readCostContract({ pool: contractPool([...LINE_ROWS, ...SCENARIO_ROWS]), config: {}, catalog: { columnCount: async (t: string) => { asked.push(t); return 0; } } });
    expect(asked).toEqual(['parcel_maxbld_scenarios']);
    expect(contract.scenarioSourcePresent).toBe(false);
    expect(contract.lines).toHaveLength(13);
    expect(contract.scenarioLines.map((l: Json) => [l.id, l.archetype])).toEqual(SCENARIO_ROWS.map((r) => [r.id, r.archetype]));
  });
  it('present table -> scenarioSourcePresent true; before migration 298 the scenario lines carry archetype null (they state no_rate_line)', async () => {
    const contract = await C.readCostContract({ pool: contractPool(LINE_ROWS), config: {}, catalog: { columnCount: async () => 17 } });
    expect(contract.scenarioSourcePresent).toBe(true);
    expect(contract.scenarioLines.every((l: Json) => l.archetype === null)).toBe(true);
  });
});

describe('MB-86 buildSourceSql: the scenario join only when the table exists', () => {
  it('without scenarios the source never names parcel_maxbld_scenarios and binds one parameter', () => {
    const sql = C.buildSourceSql();
    expect(sql).not.toContain('parcel_maxbld_scenarios');
    expect(sql).not.toContain('$2');
  });
  it('the scenario source equals the plain source outside its two scenario fragments (no drift between the two builders)', () => {
    const scen = C.buildScenarioSourceSql() as string;
    const stripped = scen
      .replace('      p.zoning_class,\n      sc.scenario_rows\n', '      p.zoning_class\n')
      .replace(/\n    LEFT JOIN LATERAL \([\s\S]*?\) sc ON true/, '');
    expect(stripped).toBe(C.buildSourceSql());
  });
  it('with scenarios: a LEFT JOIN LATERAL on parcel_id, filtered to the scenario keys ($2), aggregated per parcel', () => {
    const sql = C.buildScenarioSourceSql();
    expect(sql).toMatch(/LEFT JOIN LATERAL \(/);
    expect(sql).toMatch(/FROM parcel_maxbld_scenarios s\s+WHERE s\.parcel_id = p\.id/);
    expect(sql).toMatch(/= ANY\(\$2::text\[\]\)/);
    expect(sql).toContain('sc.scenario_rows');
  });
});

function engineConfig(): Json {
  return {
    cost_escalation_index: 100, compute_parcel_cost_fsi_max_plausible: 99.999, compute_parcel_cost_escalation_min_multiplier: 1,
    compute_parcel_cost_escalation_fallback_multiplier: 1, compute_parcel_cost_premium_default: 1, compute_parcel_cost_adjustment_factor_default: 1,
    compute_parcel_cost_min_priceable_area_sqm: 0, compute_parcel_cost_batch_size: 100, compute_parcel_cost_stream_batch_size: 100, product_scope_max_existing_gfa_sqm: 750,
  };
}

function passCtx(parcels: Json[], present: boolean, flushed: Json[]) {
  const streams: Json[] = [];
  const contract = {
    rates: { FB: { cost_per_sqm: 4844, cost_adjustment_factor: 1, escalation_index_base: 100 }, CoA: { cost_per_sqm: 4844, cost_adjustment_factor: 1, escalation_index_base: 100 }, HOUSEPLEX: { cost_per_sqm: 4306, cost_adjustment_factor: 1, escalation_index_base: 100 } },
    lines: P.mergeCostLines(P.PARCEL_COST_LINES, LINE_ROWS),
    scenarioLines: P.mergeScenarioLines(P.SCENARIO_COST_LINES, SCENARIO_ROWS),
    scenarioSourcePresent: present,
  };
  return {
    streams,
    ctx: {
      config: engineConfig(), contract, log: { error: () => undefined },
      retract: async () => 0,
      stream: async function* (sql: string, params: unknown[]) { streams.push({ sql, params }); for (const p of parcels) yield p; },
      flushBatch: async (_sql: string, params: unknown[]) => { flushed.push(params); return { rowCount: 1 }; },
    },
  };
}

const PARCEL = {
  id: 7, zoning_class: 'RD', lot_size_sqm: 500, max_buildable_gfa_sqm: 300, opt_aor_gfa_sqm: 250, opt_coa_gfa_sqm: 260,
  neighbourhood_cost_premium: 1, max_build_confidence: 'high',
};

describe('MB-86 runCostMenuPass: scenario lines ride the existing menu write', () => {
  it('absent: the plain source runs, no scenario line is written, the counters are zero', async () => {
    const flushed: Json[] = [];
    const { ctx, streams } = passCtx([{ ...PARCEL }], false, flushed);
    const res = await C.runCostMenuPass(null, ctx);
    expect(streams[0]!.sql).not.toContain('parcel_maxbld_scenarios');
    expect(streams[0]!.params).toEqual([750]);
    const menu = JSON.parse(flushed[0]![1] as string);
    expect(Object.keys(menu).some((k) => k.startsWith('scenario:'))).toBe(false);
    expect(res.scenarioSourcePresent).toBe(false);
    expect(Object.values(res.scenarioCounts).every((v) => v === 0)).toBe(true);
  });
  it('present: the scenario rows are priced into the menu, the coherence flag compares to coa_build, the counters move', async () => {
    const flushed: Json[] = [];
    const rows = [
      { building_type: 'detached_house', field_id: 'gfa_max_m2', status: 'computed', value: 300, reason: null, flags: [], content_sha: 's1' },
      { building_type: 'detached_house', field_id: 'gfa_flat_m2', status: 'computed', value: 240, reason: null, flags: ['headline_lower_bound:x'], content_sha: 's2' },
    ];
    const { ctx, streams } = passCtx([{ ...PARCEL, scenario_rows: rows }, { ...PARCEL, id: 8, scenario_rows: null }], true, flushed);
    const res = await C.runCostMenuPass(null, ctx);
    expect(streams[0]!.params).toEqual([750, P.SCENARIO_COST_LINES.map((l: Json) => `${l.buildingType}/${l.fieldId}`)]);
    const menu7 = JSON.parse(flushed[0]![1] as string);
    const menu8 = JSON.parse(flushed[0]![1 + 2 + 15] as string); // second VALUES tuple: id, menu, 15 scalars
    // coa_build = 260 x 4,844 = 1,259,440; the 300 m2 headline = 1,453,200 exceeds it -> the named exception.
    expect(menu7.coa_build.total).toBe(1259440);
    expect(menu7['scenario:detached_house/gfa_max_m2']).toMatchObject({ status: 'computed', total: 1453200, flags: ['l3_envelope_exceeds_old_coa'], l3_content_sha: 's1' });
    expect(menu7['scenario:detached_house/gfa_flat_m2']).toMatchObject({ status: 'at_least', total: 1162560 });
    expect(menu7['scenario:detached_house/gfa_pitched_m2']).toMatchObject({ status: 'not_evaluated', reason: 'no_area_row' });
    expect(menu7['scenario:detached_houseplex/gfa_max_m2']).toMatchObject({ status: 'not_evaluated', reason: 'no_area_row' });
    expect(Object.keys(menu8).some((k) => k.startsWith('scenario:'))).toBe(false);
    expect(res.scenarioCounts).toMatchObject({ parcels: 1, priced: 1, at_least: 1, refused: 2, exceed_coa: 1, gfa_computed_cost_missing: 0 });
  });
});

function postPool(staleN: number, asked: string[]) {
  return {
    async query(sql: string) {
      asked.push(sql);
      if (/l3_content_sha/.test(sql)) return { rows: [{ n: staleN }] };
      if (/rates_age_months/.test(sql)) return { rows: [{ rates_as_of: '2026-06-30', rates_age_months: 1, index_age_months: 1, rates_future: false }] };
      if (/AS pct/.test(sql)) return { rows: [{ pct: 100 }] };
      return { rows: [{ zone: 'RD', parcels: 1, menus: 1, empty_menus: 0, p50_cost_fb: 1, max_cost_gut: 1 }] };
    },
  };
}
const passRaw = (present: boolean, counts: Json = {}) => ({ cost_menu: { scanned: 1, updated: 1, lineCoverage: {}, scenarioSourcePresent: present, scenarioCounts: counts } });

describe('MB-86 computePostPhase + records_meta: zero always written, stale measured only when the table exists', () => {
  const config = { cost_rates_stale_months: 3, cost_index_stale_months: 4, cost_escalation_index: 100, product_scope_max_existing_gfa_sqm: 750 };
  it('absent: no stale query, scenario_source_absent = 1, every scenario counter present at 0', async () => {
    const asked: string[] = [];
    const out = await C.computePostPhase(postPool(9, asked), { passRaw: passRaw(false), config, runAt: '2026-11-09T00:00:00Z' });
    expect(asked.some((s) => s.includes('l3_content_sha'))).toBe(false);
    expect(out.matched.scenario_source_absent).toBe(1);
    const meta = C.buildCostMeta({ matched: out.matched, elapsed_ms: 1 });
    for (const k of SCENARIO_COUNTERS) expect(meta[k], k).toBe(0);
  });
  it('present: the stale count is measured after the write and reported; counters carry the pass values', async () => {
    const asked: string[] = [];
    const out = await C.computePostPhase(postPool(3, asked), { passRaw: passRaw(true, { parcels: 2, priced: 5, gfa_computed_cost_missing: 1 }), config, runAt: '2026-11-09T00:00:00Z' });
    expect(asked.filter((s) => s.includes('l3_content_sha'))).toHaveLength(1);
    expect(out.matched).toMatchObject({ scenario_source_present: 1, scenario_source_absent: 0, scenario_cost_stale: 3, scenario_parcels: 2, scenario_lines_priced: 5, scenario_gfa_computed_cost_missing: 1, scenario_lines_at_least: 0 });
  });
  it('the three checks report what the post-phase measured', () => {
    const reports: Json[] = [];
    const ctx = { matched: { scenario_source_absent: 1, scenario_gfa_computed_cost_missing: 2, scenario_cost_stale: 4 }, report: (id: string, v: Json) => reports.push({ id, ...v }) };
    C.checks.scenario_source_absent(ctx);
    C.checks.scenario_gfa_computed_cost_missing(ctx);
    C.checks.scenario_cost_stale(ctx);
    expect(reports).toEqual([
      { id: 'scenario_source_absent', violations: 0, detail: 1 },
      { id: 'scenario_gfa_computed_cost_missing', violations: 2 },
      { id: 'scenario_cost_stale', violations: 4 },
    ]);
  });
});

describe('MB-86 descriptor', () => {
  it('declares the Layer 3 read, turns off the input COUNT (the halts stay in guards.empty_source) with no deviations[] entry (MB-86 E1, 2026-11-11)', () => {
    const read = D.inputs.reads.tables.find((t: Json) => t.table === 'parcel_maxbld_scenarios');
    expect(read.columns).toEqual(['parcel_id', 'building_type', 'field_id', 'status', 'value', 'reason', 'flags', 'content_sha']);
    expect(D.inputs.expect_nonempty).toBe(false);
    expect(D.guards.empty_source).toEqual(['archetype_cost_rates', 'parcel_cost_lines']);
    expect(D.deviations.some((d: Json) => /expect_nonempty/.test(d.from))).toBe(false);
  });
  it('declares the three checks with their severities and every scenario counter as an emit', () => {
    const sev = (id: string) => D.checks.find((c: Json) => c.id === id)?.severity;
    expect([sev('scenario_source_absent'), sev('scenario_gfa_computed_cost_missing'), sev('scenario_cost_stale')]).toEqual(['INFO', 'WARN', 'WARN']);
    const emits = new Set(D.emits.map((e: Json) => e.key));
    for (const k of SCENARIO_COUNTERS) expect(emits.has(k), k).toBe(true);
  });
});
