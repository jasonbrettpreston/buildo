// SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (O-11 max-build consumers)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5, §8.1
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DF, R-DL
//
// Phase 4 wave 4 — `enrich_permits` (scripts/enrich-permits.js, ENRICH_TARGET=permits), ENRICHER: copies the
// dominant linked parcel's zoning / ravine / heritage / centreline / max-build / existing-structure /
// scenario / optimal-config / cost feed onto `permits` through `permit_parcels` (temp-table materialize ->
// guarded set-based UPDATE -> orphan nullify); McDonald's Airtight V3 from ①. It converts in the same
// series as its twin enrich_coa_zoning (operator-approved 2026-10-18, wave-4 plan question 9): two thin
// step shells over ONE shared compute module. Commit form compressed (R-PACE-1).
// PART 1 = the legacy ORACLE PINS L1–L16: plain `it(...)`, GREEN today, executing the VERBATIM legacy text
// via the shared `../enrich_permits/fixtures/legacy-harness` (never source-text assertions).
// PART 2 = the CONVERTED claims D1–D8: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② and ③.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, maxBuild, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/enrich-permits.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/enrich-lead-zoning.js';
const SHELL_REL = 'scripts/enrich-permits.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-7-enrich-permits-assessment.md';
/** Spec 66 lock (lock = spec number, `enrich-permits.js:14`). */
const LOCK_ID = 66;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ runAt: RUN_AT, target: 'permits', ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[enrich_permits ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[enrich_permits ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[enrich_permits ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[]; via: string }[] {
  return o.queries.filter((q) => re.test(q.sql));
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}
type AllWriteCols = (t: string) => string[];

describe('enrich_permits ① — legacy oracle pins A: lock, transaction and the cross-chain preconditions (GREEN today)', () => {
  it('L1 — lock 66, then ONE transaction holding the 12 preconditions and the enrich; every read after it runs on the pool', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.runNames).toEqual(['enrich-permits']);
    expect(o.events.filter((e) => e === 'BEGIN' || e === 'COMMIT')).toEqual(['BEGIN', 'COMMIT']);
    const firstPool = o.queries.findIndex((q) => q.via === 'pool');
    expect(o.queries.slice(0, firstPool).every((q) => q.via === 'client')).toBe(true);
    expect(o.queries.slice(firstPool).every((q) => q.via === 'pool')).toBe(true);
  });

  it('L2 — ENRICH_TARGET outside permits|coa throws before the lock', async () => {
    const { o, err } = await run({ target: 'parcels' });
    expect(err?.message).toBe('[enrich-permits] ENRICH_TARGET must be one of permits|coa — got "parcels"');
    expect(o.lockIds).toEqual([]);
  });

  it('L3 — the HALT preconditions throw by name: no WF2 parcel, no ravine lineage, no heritage lineage', async () => {
    expect((await run({ wf2: 0 })).err?.message).toMatch(/WF2 \(enrich-parcels\) has not run/);
    expect((await run({ ravine: 0 })).err?.message).toMatch(/enrich-ravines \(§8d\) has not run/);
    expect((await run({ heritage: 0 })).err?.message).toMatch(/enrich-heritage \(§8d\) has not run/);
  });

  it('L4 — centreline recency: no completed enrich_centreline run, or one older than the latest parcels load, HALTs', async () => {
    expect((await run({ centrelineAt: null })).err?.message).toMatch(/no successful enrich_centreline run/);
    expect((await run({ centrelineAt: '2026-10-01T00:00:00Z', parcelsAt: '2026-10-02T00:00:00Z' })).err?.message).toMatch(/predates the latest load-parcels/);
  });

  it('L5 — centreline coverage: compute reads logic_variables BY SQL, falls back to the literal 0.90 when the row is absent, and HALTs below it', async () => {
    const absent = await run({ centrelineCov: 0.85 });
    expect(absent.err?.message).toMatch(/centreline parcels coverage 85\.0% < 90\.0% min/);
    expect(sqlOf(absent.o, /FROM logic_variables WHERE variable_key = 'centreline_propagation_coverage_min'/)).toHaveLength(1);
    expect((await run({ centrelineMin: '0.80', centrelineCov: 0.85 })).err).toBeNull();
    expect((await run({ centrelineCov: null })).err?.message).toMatch(/no valid-geom parcels/);
  });

  it('L6 — eight information_schema guards (seven column-set probes, two tables each, plus the link table: 15 columns queries + 1 tables query); a missing column HALTs naming its migration', async () => {
    const { o } = await run();
    expect(sqlOf(o, /information_schema\.columns/)).toHaveLength(15);
    expect(sqlOf(o, /information_schema\.tables/)).toHaveLength(1);
    const miss = await run({ missingCols: { permits: ['is_corner_lot'] } });
    expect(miss.err?.message).toMatch(/permits missing centreline columns \[is_corner_lot\] — migration 176\/192 not applied/);
    expect((await run({ linkTable: false })).err?.message).toMatch(/link table "permit_parcels" does not exist for target permits/);
  });
});

describe('enrich_permits ① — legacy oracle pins B: the materialize, the guarded UPDATE and the orphan nullify (GREEN today)', () => {
  it('L7 — temp-table materialize: DROP then CREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP, dominant parcel = rn 1 by lot size, confidence, id', async () => {
    const { o } = await run();
    expect(o.events.filter((e) => /temp/.test(e))).toEqual(['DROP temp', 'CREATE temp']);
    const sql = sqlOf(o, /^\s*CREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP AS/)[0]?.sql ?? '';
    expect(sql).toMatch(/ORDER BY par\.lot_size_sqm DESC NULLS LAST, pp\.confidence DESC NULLS LAST, par\.id ASC\) AS rn/);
    expect(sql).toMatch(/JOIN permit_parcels pp ON pp\.permit_num = p\.permit_num AND pp\.revision_num = p\.revision_num/);
    expect(sql).toMatch(/CASE WHEN ag\.zoning_parcel_count > 1 THEN 'low' ELSE dom\.max_build_confidence END AS max_build_confidence/);
    expect(sql).toMatch(/WHERE dom\.rn = 1;$/);
  });

  it('L8 — the UPDATE sets every write column plus zoning_enriched_at = RUN_AT, guarded by IS DISTINCT FROM on every write column', async () => {
    const { o } = await run(); const helpers = o.helpers;
    const cols = (helpers.allWriteCols as AllWriteCols)('permits');
    const upd = sqlOf(o, /^\s*UPDATE permits p SET/)[0];
    expect(upd?.params).toEqual([RUN_AT]);
    for (const c of cols) {
      expect(upd?.sql).toContain(`${c} = e.${c}`);
      expect(upd?.sql).toContain(`p.${c} IS DISTINCT FROM e.${c}`);
    }
    expect(upd?.sql).toMatch(/zoning_enriched_at = \$1\s+FROM lead_zoning_enrich e/);
  });

  it('L9 — the orphan nullify: NOT NULL booleans reset to false, the rest to NULL, zoning_enriched_at NULL, only where no permit_parcels link remains', async () => {
    const { o } = await run();
    const sql = sqlOf(o, /zoning_enriched_at = NULL\s+WHERE/)[0]?.sql ?? '';
    for (const b of ['is_in_ravine_protection_area', 'is_heritage_designated', 'is_corner_lot', 'is_through_lot', 'abuts_laneway', 'garden_suite_fits', 'envelope_constrained', 'market_exceeds_bylaw']) {
      expect(sql).toContain(`${b} = false`);
    }
    expect(sql).toContain('zoning_class = NULL');
    expect(sql).toMatch(/WHERE p\.zoning_enriched_at IS NOT NULL AND \(TRUE\)\s+AND NOT EXISTS \(SELECT 1 FROM permit_parcels pp WHERE pp\.permit_num = p\.permit_num AND pp\.revision_num = p\.revision_num\)/);
  });

  it('L10 — O-11 CONTRACT (Spec 78): the write set carries every max-build, existing-structure, scenario, optimal-config and cost column from enrich_parcels, unchanged', async () => {
    const { helpers } = (await run()).o;
    const cols = new Set((helpers.allWriteCols as AllWriteCols)('permits'));
    const mb = maxBuild();
    const groups = [mb.LOT_MAXBUILD_COLS, mb.EXISTING_COLS, mb.SCENARIO_COLS, helpers.OPT_COMP_PROP_COLS as string[], helpers.COST_PROP_COLS as string[]];
    for (const g of groups) for (const c of g ?? []) expect(cols.has(c)).toBe(true);
    expect([...cols].slice(0, 10)).toEqual(['zoning_class', 'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'exception_number', 'applicable_bylaws', 'overlay_summary', 'zoning_parcel_count', 'zoning_dominant_parcel_id', 'zoning_dominant_parcel_method']);
    expect(cols.size).toBe((helpers.allWriteCols as AllWriteCols)('permits').length);
  });
});

describe('enrich_permits ① — legacy oracle pins C: the gate, the audit table and meta (GREEN today)', () => {
  it('L11 — the F-H12 coverage gate over construction permits: PASS at >= 80 + 3, WARN in [80, 83), FAIL below 80 (literal thresholds)', async () => {
    const pass = await run({ coverage: { denom: 1000, num: 830 } });
    expect(row(pass.o, 'permits_zoning_class_coverage_pct')).toMatchObject({ value: 83, status: 'PASS' });
    const warn = await run({ coverage: { denom: 1000, num: 829 } });
    expect(row(warn.o, 'permits_zoning_class_coverage_pct')).toMatchObject({ value: 82.9, status: 'WARN' });
    const fail = await run({ coverage: { denom: 1000, num: 799 } });
    expect(row(fail.o, 'permits_zoning_class_coverage_pct')).toMatchObject({ value: 79.9, status: 'FAIL' });
    expect(meta(fail.o).audit_table?.verdict).toBe('FAIL');
    expect(sqlOf(pass.o, /AS denom/)[0]?.sql).toMatch(/LEFT JOIN permit_type_classifications ptc ON ptc\.permit_type = p\.permit_type/);
  });

  it('L12 — a zero construction denominator emits permits_construction_count_zero (INFO) and a null coverage row', async () => {
    const { o } = await run({ coverage: { denom: 0, num: 0 } });
    expect(rows(o).slice(0, 2)).toEqual([
      { metric: 'permits_construction_count_zero', value: true, status: 'INFO' },
      { metric: 'permits_zoning_class_coverage_pct', value: null, status: 'INFO' },
    ]);
  });

  it('L13 — bylaw null floors are read from logic_variables BY SQL with literal fallbacks 88 / 72; WARN above the floor, never FAIL', async () => {
    const dflt = await run({ nulls: { fsi: '88.1', cov: '72.0', height: '30.0' } });
    expect(row(dflt.o, 'permits_bylaw_max_fsi_null_pct')).toMatchObject({ value: 88.1, threshold: '<= 88%', status: 'WARN' });
    expect(row(dflt.o, 'permits_bylaw_max_coverage_pct_null_pct')).toMatchObject({ value: 72, threshold: '<= 72%', status: 'INFO' });
    expect(sqlOf(dflt.o, /variable_key = ANY\(\$1\)/)[0]?.params).toEqual([['permits_bylaw_max_fsi_null_warn_pct', 'permits_bylaw_max_coverage_null_warn_pct']]);
    const seeded = await run({ nulls: { fsi: '88.1', cov: '72.0', height: null }, floors: [{ variable_key: 'permits_bylaw_max_fsi_null_warn_pct', variable_value: '90' }] });
    expect(row(seeded.o, 'permits_bylaw_max_fsi_null_pct').status).toBe('INFO');
  });

  it('L14 — audit table: phase 66 = the lock id, "Permit zoning enrichment", 56 rows with the two permits-only disagreement rows and the duration row last', async () => {
    const { o } = await run({ rnfpDisagree: 2 });
    const t = meta(o).audit_table;
    expect([t?.phase, t?.name]).toEqual([66, 'Permit zoning enrichment']);
    const m = rows(o).map((r) => r.metric);
    expect(m).toHaveLength(56);
    expect(m.slice(0, 6)).toEqual(['permits_zoning_class_coverage_pct', 'permits_enriched_count', 'permits_no_parcel_link_count', 'permits_unlink_cleared_count', 'permits_multi_parcel_count', 'permits_heterogeneous_assembly_count']);
    expect(m.slice(-3)).toEqual(['permit_type_geometry_disagreement', 'permit_type_heritage_disagreement', 'enrich_permits_duration_ms']);
    expect(row(o, 'permit_type_geometry_disagreement')).toMatchObject({ value: 2, status: 'WARN' });
    expect(row(o, 'enrich_permits_duration_ms').value).toBe(0);
  });

  it('L15 — summary: records_total = scope, records_new 0, records_updated = UPDATE rowCount; emitMeta writes permits(write cols + zoning_enriched_at)', async () => {
    const { o } = await run({ scoped: 254082, updated: 40725, stats: { enriched_leads: 240183, multi_parcel: 989, heterogeneous: 503 } }); const helpers = o.helpers;
    const s = o.summaries[0];
    expect([s?.records_total, s?.records_new, s?.records_updated]).toEqual([254082, 0, 40725]);
    expect(row(o, 'permits_no_parcel_link_count').value).toBe(13899);
    expect(o.metas[0]?.writes).toEqual({ permits: [...(helpers.allWriteCols as AllWriteCols)('permits'), 'zoning_enriched_at'] });
    expect(Object.keys(o.metas[0]?.reads ?? {})).toEqual(['permits', 'permit_parcels', 'permit_type_classifications', 'parcels']);
  });

  it('L16 — a contended lock returns with no SQL and no summary; the frozen oracle equals the shipped legacy file while it is still legacy', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
    const shell = readText(SHELL_REL);
    if (!/pipeline\.run\(/.test(shell)) return; // ② swapped the shell: the oracle stays frozen, this half retires
    expect(readText('src/tests/steps/enrich_permits/fixtures/legacy-enrich-permits.js.txt')).toBe(shell);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims D1–D8 (`it.fails` at ①); ② / ③ flip each to `it` in the commit that lands it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  outputs: { writes: Array<{ table: string; columns?: Array<{ name: string } | string> }> };
  guards?: { requires?: Array<{ kind: string; name: string }> };
};
const colName = (c: { name: string } | string): string => (typeof c === 'string' ? c : c.name);

describe('enrich_permits ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ENRICHER, lock 66, spec "66", name enrich_permits; shell is pipeline.step() over the shared compute module (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'enrich_permits', archetype: 'ENRICHER', lock: LOCK_ID, spec: '66' });
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).toContain("require('./lib/compute/enrich-lead-zoning')");
  });

  it.fails('D2 — ONE shared compute module serves both slugs: enrich_coa_zoning\'s shell requires the same module (wave-4 plan question 9) (flips at ②)', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, COMPUTE_REL))).toBe(true);
    expect(readText('scripts/enrich-coa-zoning.js')).toContain("require('./lib/compute/enrich-lead-zoning')");
  });

  it.fails('D3 — O-11 contract kept (Spec 78): the permits write declares every max-build / existing / scenario / optimal-config / cost column, plus an rls_bypass_or_policy guard on permits (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const w = d.outputs.writes.find((x) => x.table === 'permits');
    const declared = new Set((w?.columns ?? []).map(colName));
    const mb = maxBuild();
    for (const c of [...(mb.LOT_MAXBUILD_COLS ?? []), ...(mb.EXISTING_COLS ?? []), ...(mb.SCENARIO_COLS ?? [])]) expect(declared.has(c)).toBe(true);
    expect((d.guards?.requires ?? []).some((r) => r.kind === 'rls_bypass_or_policy' && r.name === 'permits')).toBe(true);
  });

  it.fails('D4 — compute purity (R-BZ): no logic_variables SQL (G1), no information_schema probe (G3), no Date.now, no pipeline require (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/FROM logic_variables|information_schema|Date\.now\(|require\(['"]\.\.\/pipeline['"]\)/);
  });

  it.fails('D5 — EXTERNALIZED (R-DF): the 80 % gate, the +3 PASS margin are enrich_permits_* variables; the 0.90 / 88 / 72 fallbacks are deleted (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/COVERAGE_FAIL\s*=\s*80|CENTRELINE_COVERAGE_MIN_DEFAULT|fsiDefault|covDefault|\+ 3\b/);
    const seeds = readText('scripts/seeds/logic_variables.json');
    for (const k of ['enrich_permits_zoning_coverage_fail_pct', 'enrich_permits_zoning_coverage_pass_margin_pct']) expect(seeds).toContain(k);
  });

  it.fails('D6 — the preconditions are declared guards, not compute throws: guards.requires for the parcel feeds and the link table (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const names = (d.guards?.requires ?? []).map((r) => r.name);
    expect(names).toContain('permit_parcels');
  });

  it.fails('D7 — the assessment report carries the generated validation scorecard (flips at ②)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D8 — registered: converted.json converted[] holds scripts/enrich-permits.js (③) (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });
});
