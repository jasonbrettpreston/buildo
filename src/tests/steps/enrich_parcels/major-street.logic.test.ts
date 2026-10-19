// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 step 7 (major-street membership, operator 2026-10-19 Q-MS-1/Q-MS-2)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (dated note: "abut" a Major Street, 800.50(457))
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-DE (v) step-owned names, R-DF EXTERNALIZED, R-DL, R-EO)
// SPEC LINK: .cursor/major-street-audit-2026-10-19.md (measured gap: 21 of 440,093 residential lots)
//
// MS-1..MS-8: `on_policy_road` (the by-law's "lot abutting a major street") is derived from the lot's
// frontage street NAME plus proximity to the Major Streets line, OR a corner/through lot within the flank
// distance — never from the 5 m road_overlay_distance_m buffer, which sits inside every right-of-way.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

const desc = (): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-parcels.descriptor.json'), 'utf8'));
const lv = (): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const ep = (): any =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(ROOT, 'scripts/lib/compute/enrich-parcels.js'));

const VARS = {
  enrich_parcels_major_street_frontage_m: 20,
  enrich_parcels_major_street_flank_m: 13,
  enrich_parcels_major_street_res_pct_fail_floor: 2,
  enrich_parcels_major_street_res_pct_warn_ceiling: 15,
} as const;

/** The mem_on_policy_road CTE body out of the rendered pass-1 SQL. */
function policyRoadCte(sql: string): string {
  const m = sql.match(/mem_on_policy_road AS \(([\s\S]*?)\n\)/);
  expect(m, 'pass-1 SQL has a mem_on_policy_road CTE').toBeTruthy();
  return (m as RegExpMatchArray)[1] ?? "";
}

describe('enrich_parcels — major-street membership (on_policy_road)', () => {
  const sql = (): string => ep().buildEnrichmentSql({ full: true, bboxDivisor: 78000 });

  it('MS-1 frontage arm: the lot\'s primary frontage street name must match the Major Streets line, within $2', () => {
    const cte = policyRoadCte(sql());
    expect(cte).toMatch(/upper\(o\.road_name\)\s*=\s*upper\(s\.primary_frontage_street_name\)/);
    expect(cte).toMatch(/ST_DWithin\(s\.geom::geography,\s*o\.geom::geography,\s*\$2\)/);
  });

  it('MS-2 flank arm: a corner or through lot within $3 of a Major Streets line', () => {
    const cte = policyRoadCte(sql());
    expect(cte).toMatch(/\(s\.is_corner_lot OR s\.is_through_lot\)/);
    expect(cte).toMatch(/ST_DWithin\(s\.geom::geography,\s*o\.geom::geography,\s*\$3\)/);
  });

  it('MS-3 the policy-road arm no longer uses the 5 m road_overlay_distance_m ($1); priority retail still does', () => {
    const s = sql();
    expect(policyRoadCte(s)).not.toMatch(/\$1\b/);
    const pr = s.match(/mem_on_priority_retail AS \(([\s\S]*?)\n\)/);
    expect(pr).toBeTruthy();
    expect((pr as RegExpMatchArray)[1]).toMatch(/ST_DWithin\(s\.geom::geography,\s*o\.geom::geography,\s*\$1\)/);
  });

  it('MS-4 the bbox prefilter precedes the distance test and covers the larger of the two distances', () => {
    const cte = policyRoadCte(sql());
    expect(cte).toMatch(/o\.geom && ST_Expand\(s\.geom, \(GREATEST\(\$2, \$3\) \/ 78000\.0\)\)/);
    expect(cte.indexOf('ST_Expand')).toBeLessThan(cte.indexOf('ST_DWithin'));
  });

  it('MS-5 the scope CTE carries the three enrich_centreline columns the arms read', () => {
    const s = sql();
    const scope = (s.match(/\nscope AS \(([\s\S]*?)\n\),/) as RegExpMatchArray)[1];
    for (const c of ['primary_frontage_street_name', 'is_corner_lot', 'is_through_lot']) expect(scope).toContain(`p.${c}`);
  });

  it('MS-6 a stale policy-road layer still writes false, and every param is referenced (bind count stays 3)', () => {
    const s = ep().buildEnrichmentSql({ full: true, bboxDivisor: 78000, staleOverlays: new Set(['policy_road_overlay', 'priority_retail_overlay']) });
    expect(s).toMatch(/false AS on_policy_road/);
    for (const p of ['$1', '$2', '$3']) expect(s.includes(p), `${p} referenced`).toBe(true);
  });

  it('MS-7 runPass1 binds [road_overlay_distance_m, frontage_m, flank_m] from config', async () => {
    const seen: any[] = [];
    const ctx: any = {
      full: true, scopeWhere: 'TRUE', staleOverlays: new Set(),
      tempTable: async (o: any) => { seen.push(o.params); throw new Error('stop-after-bind'); },
    };
    const config = { road_overlay_distance_m: 5, enrich_parcels_bbox_degree_divisor: 78000,
      enrich_parcels_major_street_frontage_m: 21, enrich_parcels_major_street_flank_m: 12 };
    await expect(ep().runPass1({ query: async () => ({ rows: [{}] }) }, ctx, config)).rejects.toThrow('stop-after-bind');
    expect(seen[0]).toEqual([5, 21, 12]);
  });

  it('MS-8 the four step-owned variables are seeded, declared and read', () => {
    const seeds = lv();
    const declared = new Map((desc().config.logic_variables as any[]).map((v) => [v.name, v]));
    const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/compute/enrich-parcels.js'), 'utf8');
    for (const [k, def] of Object.entries(VARS)) {
      expect(seeds[k], `${k} seeded`).toBeDefined();
      expect(seeds[k].default).toBe(def);
      expect(declared.has(k), `${k} declared in config.logic_variables`).toBe(true);
      expect(seeds[k].description).toMatch(/CONSUMED by enrich_parcels/);
    }
    expect(src).toContain('config.enrich_parcels_major_street_frontage_m');
    expect(src).toContain('config.enrich_parcels_major_street_flank_m');
    const mig = fs.readdirSync(path.join(ROOT, 'migrations')).find((f) => /^277_/.test(f));
    expect(mig, 'migration 277 seeds them').toBeTruthy();
    const body = fs.readFileSync(path.join(ROOT, 'migrations', mig as string), 'utf8');
    for (const k of Object.keys(VARS)) expect(body).toContain(`'${k}'`);
  });

  it('MS-9 the residential-share plausibility bound: FAIL floor and WARN ceiling, limits from config', () => {
    const checks = desc().checks as any[];
    const f = checks.find((c) => c.id === 'major_street_residential_pct_fail');
    const w = checks.find((c) => c.id === 'major_street_residential_pct_warn');
    expect(f.severity).toBe('FAIL');
    expect(f.limit_from_config).toBe('enrich_parcels_major_street_res_pct_fail_floor');
    expect(f.limit).toBe('pct >= 2');
    expect(w.severity).toBe('WARN');
    expect(w.limit_from_config).toBe('enrich_parcels_major_street_res_pct_warn_ceiling');
    expect(w.limit).toBe('pct <= 15');
    expect(typeof ep().checks.major_street_residential_pct_fail).toBe('function');
    expect(typeof ep().checks.major_street_residential_pct_warn).toBe('function');
  });

  it('MS-10 descriptor declares the new reads (frontage name, overlay road_name)', () => {
    const tables = desc().inputs.reads.tables as any[];
    expect(tables.find((t) => t.table === 'parcels').columns).toContain('primary_frontage_street_name');
    expect(tables.find((t) => t.table === 'zoning_policy_road_overlay').columns).toContain('road_name');
  });
});
