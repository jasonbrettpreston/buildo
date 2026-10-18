// SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9b
// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (O-11 max-build consumers)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5, §8.1
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DF, R-DL
//
// Phase 4 wave 4 — `enrich_coa_zoning` (scripts/enrich-coa-zoning.js, the ① identity-split shell over
// scripts/enrich-permits.js with ENRICH_TARGET=coa), ENRICHER: copies the dominant linked parcel's feed onto
// `coa_applications` through `lead_parcels` (joined on the stored `coa.lead_id`). Same legacy module as
// enrich_permits, so it shares the legacy oracle `../enrich_permits/fixtures/legacy-harness` (the frozen
// enrich-permits text plus the frozen split shell). Commit form compressed (R-PACE-1).
// PART 1 = the legacy ORACLE PINS L1–L10 for the coa target: plain `it(...)`, GREEN today.
// PART 2 = the CONVERTED claims: D1–D4, D4b, D6 GREEN since ② (compute_ported); D5 (env), D7 (shell), D8 (registry) `it.fails` until ③.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, maxBuild, legacyCoaShellText, type LegacyOracle, type LegacyOpts } from '../enrich_permits/fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/enrich-coa-zoning.descriptor.json';
const COMPUTE_REL = 'scripts/lib/enrich-lead-zoning.js';
const SHELL_REL = 'scripts/enrich-coa-zoning.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-3-enrich-coa-zoning-assessment.md';
const LOCK_ID = 66;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };
type AllWriteCols = (t: string) => string[];

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ runAt: RUN_AT, target: 'coa', ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[enrich_coa_zoning ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[enrich_coa_zoning ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[enrich_coa_zoning ①] audit row ' + metric + ' missing');
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

describe('enrich_coa_zoning ① — legacy oracle pins A: identity split and the coa join (GREEN today)', () => {
  it('L1 — identity split (①, operator-approved 2026-10-18): manifest enrich_coa_zoning names its own file, and the split shell is a pass-through that forces ENRICH_TARGET=coa and runs enrich-permits main() under the same pipeline.run name', () => {
    const m = readJson<{ scripts: Record<string, { file: string; env?: Record<string, string> }> }>('scripts/manifest.json');
    expect(m.scripts.enrich_coa_zoning?.file).toBe(SHELL_REL);
    expect(m.scripts.enrich_permits?.file).toBe('scripts/enrich-permits.js');
    expect(m.scripts.enrich_coa_zoning?.env).toEqual({ ENRICH_TARGET: 'coa' });
    const shim = legacyCoaShellText();
    expect(shim).toMatch(/const \{ main \} = require\('\.\/enrich-permits'\);/);
    expect(shim).toMatch(/process\.env\.ENRICH_TARGET = 'coa';\npipeline\.run\('enrich-permits', main\);/);
    const shell = readText(SHELL_REL);
    if (/pipeline\.run\(/.test(shell)) expect(shell).toBe(shim);
  });

  it('L2 — lock 66 (shared with enrich_permits), one transaction for the preconditions + enrich; the link-table guard checks lead_parcels(lead_id, parcel_id)', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.events.filter((e) => e === 'BEGIN' || e === 'COMMIT')).toEqual(['BEGIN', 'COMMIT']);
    expect(sqlOf(o, /information_schema\.tables/)[0]?.params).toEqual(['lead_parcels']);
    expect((await run({ missingCols: { lead_parcels: ['lead_id'] } })).err?.message).toMatch(/link table "lead_parcels" missing\/renamed columns \[lead_id\] for target coa/);
  });

  it('L3 — the materialize joins lead_parcels on the STORED coa.lead_id (DEC-4, never re-derived) and builds variance_context (base + parcels)', async () => {
    const { o } = await run();
    const sql = sqlOf(o, /^\s*CREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP AS/)[0]?.sql ?? '';
    expect(sql).toMatch(/FROM coa_applications c\s+JOIN lead_parcels lp ON lp\.lead_id = c\.lead_id/);
    expect(sql).toMatch(/PARTITION BY c\.id/);
    expect(sql).toMatch(/'parcels', ag\.applicable_bylaws\) AS variance_context,/);
    expect(sql).not.toMatch(/overlay_summary/);
  });

  it('L4 — the UPDATE and orphan nullify target coa_applications keyed on c.id; the orphan test is NOT EXISTS lead_parcels on lead_id', async () => {
    const { o } = await run();
    const helpers = o.helpers;
    const upd = sqlOf(o, /^\s*UPDATE coa_applications c SET/);
    expect(upd).toHaveLength(2);
    expect(upd[0]?.sql).toMatch(/WHERE c\.id = e\.id/);
    for (const c of (helpers.allWriteCols as AllWriteCols)('coa')) expect(upd[0]?.sql).toContain(`c.${c} IS DISTINCT FROM e.${c}`);
    expect(upd[1]?.sql).toMatch(/AND NOT EXISTS \(SELECT 1 FROM lead_parcels lp WHERE lp\.lead_id = c\.lead_id\)/);
  });

  it('L5 — O-11 CONTRACT (Spec 78): the coa write set carries the same propagated max-build / existing / scenario / optimal-config / cost columns as permits; only the jsonb column differs (variance_context vs applicable_bylaws + overlay_summary)', async () => {
    const { o } = await run();
    const all = o.helpers.allWriteCols as AllWriteCols;
    const coa = all('coa');
    const permits = all('permits');
    const mb = maxBuild();
    for (const c of [...(mb.LOT_MAXBUILD_COLS ?? []), ...(mb.EXISTING_COLS ?? []), ...(mb.SCENARIO_COLS ?? [])]) expect(coa).toContain(c);
    expect(coa.filter((c) => !permits.includes(c))).toEqual(['variance_context']);
    expect(permits.filter((c) => !coa.includes(c))).toEqual(['applicable_bylaws', 'overlay_summary']);
  });
});

describe('enrich_coa_zoning ① — legacy oracle pins B: gate, floors, audit and meta for the coa target (GREEN today)', () => {
  it('L6 — the coa coverage gate counts EVERY coa_applications row (no construction filter): PASS >= 83, WARN [80, 83), FAIL < 80; zero rows -> coa_row_count_zero', async () => {
    const pass = await run({ coverage: { denom: 33949, num: 29366 } });
    expect(row(pass.o, 'coa_zoning_class_coverage_pct')).toMatchObject({ value: 86.5, status: 'PASS' });
    expect(sqlOf(pass.o, /AS denom/)[0]?.sql).toBe('SELECT COUNT(*)::int AS denom, COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)::int AS num FROM coa_applications');
    expect(row((await run({ coverage: { denom: 100, num: 81 } })).o, 'coa_zoning_class_coverage_pct').status).toBe('WARN');
    expect(row((await run({ coverage: { denom: 100, num: 79 } })).o, 'coa_zoning_class_coverage_pct').status).toBe('FAIL');
    expect(rows((await run({ coverage: { denom: 0, num: 0 } })).o)[0]).toEqual({ metric: 'coa_row_count_zero', value: true, status: 'INFO' });
  });

  it('L7 — coa bylaw null floors: read by SQL with literal fallbacks 97 / 66; WARN only above the floor', async () => {
    const { o } = await run({ nulls: { fsi: '93.9', cov: '66.1', height: '18.9' } });
    expect(row(o, 'coa_bylaw_max_fsi_null_pct')).toMatchObject({ value: 93.9, threshold: '<= 97%', status: 'INFO' });
    expect(row(o, 'coa_bylaw_max_coverage_pct_null_pct')).toMatchObject({ value: 66.1, threshold: '<= 66%', status: 'WARN' });
    expect(sqlOf(o, /variable_key = ANY\(\$1\)/)[0]?.params).toEqual([['coa_bylaw_max_fsi_null_warn_pct', 'coa_bylaw_max_coverage_null_warn_pct']]);
  });

  it('L8 — audit table: phase 66, "CoA zoning enrichment", 54 rows (no permits-only disagreement rows), enrich_coa_zoning_duration_ms last', async () => {
    const { o } = await run();
    const t = meta(o).audit_table;
    expect([t?.phase, t?.name]).toEqual([66, 'CoA zoning enrichment']);
    const m = rows(o).map((r) => r.metric);
    expect(m).toHaveLength(54);
    expect(m.some((x) => x.startsWith('permit_type_'))).toBe(false);
    expect(m[m.length - 1]).toBe('enrich_coa_zoning_duration_ms');
    expect(sqlOf(o, /permit_type = 'RNFP'/)).toHaveLength(0);
  });

  it('L9 — summary: records_total = scope, records_new 0, records_updated = UPDATE rowCount; emitMeta reads coa_applications(id, lead_id) + lead_parcels and writes coa_applications', async () => {
    const { o } = await run({ scoped: 33400, updated: 59 });
    const s = o.summaries[0];
    expect([s?.records_total, s?.records_new, s?.records_updated]).toEqual([33400, 0, 59]);
    expect(o.metas[0]?.reads.coa_applications).toEqual(['id', 'lead_id']);
    expect(o.metas[0]?.reads.lead_parcels).toEqual(['lead_id', 'parcel_id', 'confidence']);
    expect(Object.keys(o.metas[0]?.writes ?? {})).toEqual(['coa_applications']);
  });

  it('L10 — the coa run uses the same preconditions as permits (WF2, ravine, heritage, centreline recency and coverage), with the same literal 0.90 fallback', async () => {
    expect((await run({ wf2: 0 })).err?.message).toMatch(/cannot enrich permits\/CoA/);
    expect((await run({ centrelineCov: 0.89 })).err?.message).toMatch(/89\.0% < 90\.0% min/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims. ② (compute_ported, 2026-10-18) flipped D1–D4 and D6 to `it`; D5 (the env
// selector retires with the shell), D7 (the frozen shell) and D8 (registry) stay `it.fails` until ③.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Col = { name: string; set_value?: boolean | null; source?: string };
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  outputs: { writes: Array<{ table: string; columns?: Col[]; write_discipline?: { class?: string; scope?: string } }> };
  guards?: { requires?: Array<{ kind: string; name: string }> };
  execution?: { phases?: Array<{ name: string; writes_ref: number; txn: string }> };
  checks: Array<{ id: string; limit_from_config?: string; warn_limit_from_config?: string }>;
  config: { logic_variables: Array<{ name: string }> };
};
type Core = {
  allWriteCols: (t: string) => string[];
  nullifyScope: (o: { target: string }) => string;
  checkIds: (t: string) => string[];
  buildEnrichmentSelectSql: (o: { target: string }) => string;
  buildUpdateSql: (o: { target: string }) => string;
};
const code = (rel: string): string => readText(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = (): Core => require(path.join(REPO_ROOT, COMPUTE_REL)) as Core;

describe('enrich_coa_zoning ② — converted claims (D1–D4, D6 GREEN at ②; D5/D7/D8 flip at ③)', () => {
  it('D1 — the descriptor exists: archetype ENRICHER, lock 66, spec "66", name enrich_coa_zoning; its compute entry is one line over the shared module (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'enrich_coa_zoning', archetype: 'ENRICHER', lock: LOCK_ID, spec: '66' });
    expect((d.execution?.phases ?? []).map((p) => [p.name, p.writes_ref, p.txn])).toEqual([['zoning_coa', 0, 'shared'], ['orphan_nullify_coa', 1, 'shared']]);
    expect(readText('scripts/lib/compute/enrich-coa-zoning.js')).toContain("module.exports = require('../enrich-lead-zoning').forTarget('coa');");
  });

  it('D2 — O-11 contract kept: writes[0] declares exactly the shared propagated columns (variance_context as the coa jsonb) + zoning_enriched_at, and coa_applications carries rls_bypass_or_policy (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const declared = (d.outputs.writes[0]?.columns ?? []).map((c) => c.name);
    expect(declared).toEqual([...core().allWriteCols('coa'), 'zoning_enriched_at']);
    const mb = maxBuild();
    for (const c of [...(mb.LOT_MAXBUILD_COLS ?? []), ...(mb.EXISTING_COLS ?? []), ...(mb.SCENARIO_COLS ?? [])]) expect(declared).toContain(c);
    expect((d.guards?.requires ?? []).some((r) => r.kind === 'rls_bypass_or_policy' && r.name === 'coa_applications')).toBe(true);
  });

  it('D3 — compute purity (R-BZ): the shared module has no logic_variables SQL, no information_schema, no pipeline_runs, no Date.now, no DDL (flips at ②)', () => {
    expect(code(COMPUTE_REL)).not.toMatch(/FROM logic_variables|information_schema|FROM pipeline_runs|Date\.now\(|CREATE TEMP|DROP TABLE/);
  });

  it('D4 — EXTERNALIZED (R-DF): every config name is enrich_coa_zoning_* (R-DE (v)), seeded byte-identical (80 / 83 / 97 / 66 / 0.9), carried by migration 273 (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const names = d.config.logic_variables.map((v) => v.name);
    const seeds = readJson<Record<string, { default: number }>>('scripts/seeds/logic_variables.json');
    expect(names.map((n) => [n, seeds[n]?.default])).toEqual([
      ['enrich_coa_zoning_zoning_coverage_fail_pct', 80], ['enrich_coa_zoning_zoning_coverage_pass_min_pct', 83],
      ['enrich_coa_zoning_bylaw_max_fsi_null_warn_pct', 97], ['enrich_coa_zoning_bylaw_max_coverage_null_warn_pct', 66],
      ['enrich_coa_zoning_centreline_coverage_min', 0.9],
    ]);
    const mig = readText('migrations/273_enrich_lead_zoning_logic_variables.sql');
    for (const n of names) expect(mig).toContain(`'${n}'`);
    expect(code(COMPUTE_REL)).not.toMatch(/fsiDefault|covDefault|CENTRELINE_COVERAGE_MIN_DEFAULT/);
  });

  it('D4b — SQL parity with the frozen oracle for the coa target: materialize SELECT, guarded UPDATE, nullify set/scope, and the check order (flips at ②)', async () => {
    const { o } = await run();
    expect('\nCREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP AS\n' + core().buildEnrichmentSelectSql({ target: 'coa' })).toBe(sqlOf(o, /^\s*CREATE TEMP TABLE lead_zoning_enrich/)[0]?.sql);
    expect(core().buildUpdateSql({ target: 'coa' })).toBe(sqlOf(o, /^\s*UPDATE coa_applications c SET/)[0]?.sql);
    const legacyNullify = sqlOf(o, /zoning_enriched_at = NULL\s+WHERE/)[0]?.sql ?? '';
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const w1 = d.outputs.writes[1];
    for (const c of w1?.columns ?? []) {
      if (c.name !== 'zoning_enriched_at') expect(legacyNullify).toContain(`${c.name} = ${c.set_value === false ? 'false' : 'NULL'}`);
    }
    expect(w1?.write_discipline?.scope).toBe(core().nullifyScope({ target: 'coa' }));
    expect(d.checks.map((c) => c.id)).toEqual(['coa_row_count_zero', ...rows(o).map((r) => r.metric)]);
  });

  it.fails('D5 — the ENRICH_TARGET env retires: manifest enrich_coa_zoning has no env once the frozen shell lands (flips at ③)', () => {
    const m = readJson<{ scripts: Record<string, { env?: Record<string, string> }> }>('scripts/manifest.json');
    expect(m.scripts.enrich_coa_zoning?.env).toBeUndefined();
  });

  it('D6 — the assessment report carries the generated validation scorecard (flips at ②)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — the frozen shell: pipeline.step() over ./lib/compute/enrich-coa-zoning (flips at ③)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).toContain("require('./lib/compute/enrich-coa-zoning')");
  });

  it.fails('D8 — registered: converted.json converted[] holds scripts/enrich-coa-zoning.js (③) (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });
});
