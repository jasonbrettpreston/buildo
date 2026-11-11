// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md Refresh Snapshot (dated note 2026-11-11, MF-62: the stored, dated citywide counts),
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (RECORDER), docs/specs/01-pipeline/124_step_standard_policy.md Rule 2,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35.
//
// MF-62 · McFrontend queue · lane E (operator 2026-11-11, X-1 a: "one stored dated citywide-counts row refreshed by the existing refresh_snapshot
// step"). One more OPTIONAL read `reportTrust` on the same pinned RECORDER, its six columns in the one write list, carried forward from the prior
// row on failure (the massing policy) and named by `optional_query_failed`; the descriptor declares every table and column it reads and the six
// written columns. Pure: no DB (the live run is the DB job's).
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS compute + descriptor */
const compute = require(join(process.cwd(), 'scripts/lib/compute/refresh-snapshot.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/refresh-snapshot.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- rows under test
const COLS = ['parcels_total', 'permits_active_distinct', 'map_areas_total', 'zoning_layer_version', 'permits_last_seen_at', 'coa_last_seen_at'];
const MAP_TABLES = [
  'zoning_bylaw_areas', 'zoning_building_setback_overlay', 'zoning_height_overlay', 'zoning_lot_coverage_overlay', 'zoning_parking_zone_overlay',
  'zoning_policy_area_overlay', 'zoning_policy_road_overlay', 'zoning_priority_retail_overlay', 'zoning_queenstw_eat_overlay',
  'zoning_rooming_house_overlay', 'ravines', 'heritage_districts',
];
const CONFIG = { snapshot_coa_conf_high: 0.8, coa_match_conf_medium: 0.5, refresh_snapshot_updated_24h_window_hours: 24, refresh_snapshot_updated_7d_window_days: 7, refresh_snapshot_updated_30d_window_days: 30, refresh_snapshot_cost_oor_min_cad: 1, refresh_snapshot_cost_oor_max_cad: 2, pipeline_timezone: 'America/Toronto' };
const RUN_AT = '2026-11-11T12:00:00Z';
const zero = (): Json[] => [new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k !== 'then' && k !== 'toJSON' ? 0 : undefined) })];
const baseResults = (): Json => {
  const plan = compute.buildReads(CONFIG, RUN_AT);
  const out: Json = {};
  for (const r of [...plan.main, ...plan.optional]) out[r.key] = r.catalog ? [] : zero();
  out.tagBreakdown = [];
  return out;
};
const TRUST = { parcels_total: '496536', permits_active_distinct: '160128', map_areas_total: '27759', zoning_layer_version: '2026-02-20T21:29:42Z', permits_last_seen_at: '2026-10-25T00:00:00Z', coa_last_seen_at: '2026-10-23T02:24:17Z' };

describe('the reportTrust optional read (X-1 a)', () => {
  const read = (): Json => compute.buildReads(CONFIG, RUN_AT).optional.find((r: Json) => r.key === 'reportTrust');
  it('is OPTIONAL (never a main read), and counts lots, distinct active builds and the map areas of the twelve tables', () => {
    const r = read();
    expect(r).toBeTruthy();
    expect(compute.buildReads(CONFIG, RUN_AT).main.some((m: Json) => m.key === 'reportTrust')).toBe(false);
    expect(r.sql).toMatch(/COUNT\(\*\) FROM parcels\b/);
    expect(r.sql).toMatch(/COUNT\(DISTINCT permit_num\) FROM permits WHERE status = ANY\(\$1\)/);
    for (const t of MAP_TABLES) expect(r.sql).toMatch(new RegExp(`COUNT\\(\\*\\) FROM ${t}\\b`));
    expect(r.sql).not.toMatch(/bylaw_map_areas/);
    expect(r.sql).toMatch(/MAX\(source_dataset_version\) FROM zoning_bylaw_areas/);
    expect(r.sql).toMatch(/MAX\(last_seen_at\) FROM permits/);
    expect(r.sql).toMatch(/MAX\(last_seen_at\) FROM coa_applications/);
    expect(r.sql).not.toMatch(/NOW\(\)|CURRENT_DATE/i);
    expect(r.params).toEqual([['Inspection', 'Permit Issued', 'Revision Issued']]);
    expect(compute.REPORT_TRUST_PERMIT_STATUSES).toEqual(['Inspection', 'Permit Issued', 'Revision Issued']);
  });
  it('buildRow writes the six columns from the read', () => {
    const res = baseResults();
    res.reportTrust = [TRUST];
    const { row, matched } = compute.buildRow(res, {}, null, CONFIG);
    expect(row.parcels_total).toBe(496536);
    expect(row.permits_active_distinct).toBe(160128);
    expect(row.map_areas_total).toBe(27759);
    expect(row.zoning_layer_version).toBe(TRUST.zoning_layer_version);
    expect(row.permits_last_seen_at).toBe(TRUST.permits_last_seen_at);
    expect(row.coa_last_seen_at).toBe(TRUST.coa_last_seen_at);
    expect(matched.optional_query_failed).not.toContain('reportTrust');
  });
  it('a failed read carries the six forward from the prior row (never a zero), and optional_query_failed names it', () => {
    const res = baseResults();
    res.reportTrust = null;
    const prev = { parcels_total: 1, permits_active_distinct: 2, map_areas_total: 3, zoning_layer_version: 'z', permits_last_seen_at: 'p', coa_last_seen_at: 'c' };
    const { row, matched } = compute.buildRow(res, prev, null, CONFIG);
    for (const c of COLS) expect(row[c]).toBe((prev as Json)[c]);
    expect(matched.optional_query_failed).toContain('reportTrust');
    const fresh = compute.buildRow({ ...res }, {}, null, CONFIG).row;
    for (const c of COLS) expect(fresh[c]).toBeNull();
  });
  it('the one write list carries the six columns (bound, never NOW())', () => {
    const res = baseResults();
    res.reportTrust = [TRUST];
    const { sql, params } = compute.buildWriteSql(compute.buildRow(res, {}, null, CONFIG).row, RUN_AT, CONFIG);
    for (const c of COLS) {
      expect(sql).toMatch(new RegExp(`\\b${c}\\b`));
      expect(sql).toMatch(new RegExp(`${c}=EXCLUDED\\.${c}`));
    }
    expect(params).toContain(496536);
    expect(sql).not.toMatch(/NOW\(\)/);
  });
  it('the descriptor declares the six written columns and every table and column the read touches', () => {
    const written = (DESCRIPTOR.outputs.writes[0].columns as Json[]).map((c) => c.name);
    for (const c of COLS) expect(written).toContain(c);
    const tables = new Map((DESCRIPTOR.inputs.reads.tables as Json[]).map((t) => [t.table, t.columns as string[] | undefined]));
    for (const t of [...MAP_TABLES, 'parcels', 'permits', 'coa_applications']) expect(tables.has(t), `inputs.reads.tables declares ${t}`).toBe(true);
    expect(tables.get('zoning_bylaw_areas')).toEqual(['source_dataset_version']);
    expect(tables.get('coa_applications')).toContain('last_seen_at');
    for (const c of ['permit_num', 'status', 'last_seen_at']) expect(tables.get('permits')).toContain(c);
  });
});
