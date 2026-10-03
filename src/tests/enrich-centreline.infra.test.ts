// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §11, §9, §8d
//
// Source-contract tests for enrich_centreline — lock the §11 SQL shape (the precedent
// fences: MATERIALIZED driver, geom-validity, the L30 cap, NULL-safe node guards, the
// 5-disjunct write-guard incl. lineage), the 4-tier producer contract + the declared
// preconditions, and the 5-column write-set.
//
// RE-POINTED batch-2 row 3.10 commit ② (the conversion): the legacy script is now a frozen
// `pipeline.step()` shell, so `ec` is an adapter over the compute module (SQL at the SEEDED
// defaults, byte-equal to the legacy strings — red test B4) and SCRIPT is the text of the
// shell + compute + descriptor. Same facts; the ones that moved into the descriptor, the
// seeds or the runner are asserted there.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../scripts/lib/compute/enrich-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdict = require('../../scripts/lib/step/verdict.js');
const DESCRIPTOR = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-centreline.descriptor.json'), 'utf8'));
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const CFG: Record<string, number> = Object.fromEntries(
  Object.entries(SEEDS).filter(([k]) => k.startsWith('enrich_centreline_')).map(([k, v]) => [k, (v as { default: number }).default]),
);
const ec = {
  ADVISORY_LOCK_ID: DESCRIPTOR.identity.lock,
  PRODUCER_NAME: compute.PRODUCER_NAME,
  BUILD_TEMP_SQL: compute.buildTempSql({ scoped: false }, CFG) as string,
  UPDATE_SQL: compute.UPDATE_SQL as string,
  verdictCascade: verdict.deriveVerdict,
};
const SCRIPT = ['scripts/enrich-centreline.js', 'scripts/lib/compute/enrich-centreline.js', 'scripts/enrich-centreline.descriptor.json']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const requires = (kind: string) => DESCRIPTOR.guards.requires.filter((r: { kind: string }) => r.kind === kind).map((r: { name: string }) => r.name);

describe('enrich-centreline.js — source contract (Spec 62 §8d)', () => {
  it('lock 64 + reads the chain-scoped producer sources:load_centreline, completed_at DESC', () => {
    expect(ec.ADVISORY_LOCK_ID).toBe(64);
    expect(ec.PRODUCER_NAME).toBe('sources:load_centreline');
    expect(SCRIPT).toMatch(/ADVISORY_LOCK_ID\s*=\s*64/);
    expect(SCRIPT).toMatch(/ORDER BY completed_at DESC/);
    expect(SCRIPT).toMatch(/SPEC_VERSION\s*=\s*'1\.1'/);
  });

  it('§11 precedent fences: parcel_segments AS MATERIALIZED + geom-validity filter + L30 cap', () => {
    expect(ec.BUILD_TEMP_SQL).toContain('parcel_segments AS MATERIALIZED');
    expect(ec.BUILD_TEMP_SQL).toMatch(/WHERE p\.geom IS NOT NULL AND ST_IsValid\(p\.geom\)/);
    expect(ec.BUILD_TEMP_SQL).toContain('rn <= 20'); // L30 Cartesian cap
  });

  it('§11 corner detection: base-name DISTINCT + NULL-safe node match + at-least-one-non-NULL', () => {
    expect(ec.BUILD_TEMP_SQL).toContain('c1_name IS DISTINCT FROM c2_name');
    expect(ec.BUILD_TEMP_SQL).toContain('IS NOT DISTINCT FROM'); // node-share NULL-safe guard
    expect(ec.BUILD_TEMP_SQL).toMatch(/c1_from IS NOT NULL OR c1_to IS NOT NULL/); // at-least-one-non-NULL
  });

  it('§11 through detection: cosine azimuth with 2π-wrap; frontage P1 name + P2 address_match_status', () => {
    expect(ec.BUILD_TEMP_SQL).toContain('cos(radians(15))');
    expect(ec.BUILD_TEMP_SQL).toContain('2 * pi() - abs('); // F-S8 wrap guard
    expect(ec.BUILD_TEMP_SQL).toMatch(/LOWER\(ps\.parcel_street_norm\) = LOWER\(ps\.seg_name_base\)/); // P1
    expect(ec.BUILD_TEMP_SQL).toContain('address_match_status(ps.parcel_addr_text, ps.parity_l'); // P2 try-both
    expect(ec.BUILD_TEMP_SQL).toContain('frontage_priority'); // §9 tally source
  });

  it('UPDATE: writes all 5 columns incl. lineage; 5-disjunct IS DISTINCT FROM write-guard', () => {
    expect(ec.UPDATE_SQL).toContain('centreline_dataset_version_when_enriched = $1');
    expect(ec.UPDATE_SQL).toMatch(/is_corner_lot\s+IS DISTINCT FROM/);
    expect(ec.UPDATE_SQL).toMatch(/centreline_dataset_version_when_enriched IS DISTINCT FROM \$1/); // lineage disjunct
  });

  it('contract read is 4-tier + extracts source_dataset_version with a null-guard (G1)', () => {
    expect(SCRIPT).toContain("spec_version !== SPEC_VERSION"); // tier b
    expect(SCRIPT).toContain('features_inserted'); // tier c
    expect(SCRIPT).toContain('source_dataset_version is null/empty'); // G1 null-guard throw
  });

  it('preconditions: the GIST index + 4 parcels columns + the M-1 functions (G2) — declared as guards.requires', () => {
    expect(requires('index')).toContain('idx_toronto_centreline_geom_gist');
    expect(requires('column')).toEqual(['parcels.is_corner_lot', 'parcels.is_through_lot', 'parcels.primary_frontage_street_name', 'parcels.centreline_dataset_version_when_enriched']); // EC-D5 carried
    expect(requires('function')).toContain('normalize_address_number');
    expect(requires('function')).toContain('address_match_status');
  });

  it('Enrich archetype counters + the 5-column write-set incl. abuts_laneway + lineage (G3)', () => {
    // A4 (ENRICHER precedent): records_total is the scanned population, records_new 0, records_updated the join UPDATE's rowCount.
    expect(DESCRIPTOR.counters.records_total.source).toBe('matched.compute.parcels_scanned');
    expect(DESCRIPTOR.counters.records_updated.source).toBe('written.e1.updated');
    // Phase 3 (Spec 65 §7 AF-1): abuts_laneway joins the centreline write-set.
    expect(DESCRIPTOR.outputs.writes[0].columns.map((c: { name: string }) => c.name)).toEqual(['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway', 'centreline_dataset_version_when_enriched']);
    expect(SCRIPT).toContain('centreline_enrich'); // frozen §9 block
  });

  it('diagnostic audit rows wired with their grading thresholds (F5b/F5c/G4/L21)', () => {
    expect(SCRIPT).toContain('parcels_with_zero_centreline_intersections_pct'); // L21 FAIL/WARN
    expect(SCRIPT).toContain('parcels_street_name_normalized_pct'); // F5b
    expect(SCRIPT).toContain('centreline_intersection_id_null_pct'); // F5c
    expect(SCRIPT).toContain('parcels_address_number_null_pct'); // G4
    expect(CFG.enrich_centreline_unlinked_fail_pct).toBe(40);
    expect(CFG.enrich_centreline_name_coverage_warn_min_pct).toBe(90);
  });

  it('WF2: proximity join (ST_DWithin geography), nearest-segment P3, NULL-name guard, geog-index precondition', () => {
    // join is proximity, NOT containment (centerlines sit ~10m off the lots)
    expect(ec.BUILD_TEMP_SQL).toMatch(/ST_DWithin\(p\.geom::geography, c\.geom::geography, \d+\)/);
    expect(ec.BUILD_TEMP_SQL).not.toMatch(/ON ST_Intersects\(p\.geom/);
    // P3 = nearest segment (ST_Distance ASC), and intersect_len_m is fully removed
    expect(ec.BUILD_TEMP_SQL).toMatch(/ST_Distance\(ps\.parcel_geom::geography, ps\.seg_geom::geography\)/);
    expect(ec.BUILD_TEMP_SQL).toContain('dist_m ASC');
    expect(ec.BUILD_TEMP_SQL).not.toContain('intersect_len_m');
    expect(ec.BUILD_TEMP_SQL).not.toContain('ST_Intersection(');
    // NULL-name guard in BOTH corner + parallel pair CTEs (count the occurrences)
    expect((ec.BUILD_TEMP_SQL.match(/c1_name IS NOT NULL AND c2_name IS NOT NULL/g) || []).length).toBe(2);
    // proximity needs the geography GIST (mig 175)
    expect(requires('index')).toContain('idx_toronto_centreline_geog_gist');
    expect(SCRIPT).toMatch(/[Mm]igration 175/);
    // frozen P3 key renamed to reflect nearest-segment semantics
    expect(SCRIPT).toContain('parcels_frontage_priority3_nearest_segment_count');
    expect(SCRIPT).not.toContain('parcels_frontage_priority3_longest_intersect_count');
  });

  it('WF3: corner = share-node + abuts both streets; through = parallel opposite-sides + abuts both', () => {
    // The discriminator is "abuts BOTH streets" (≤ enrich_centreline_abut_m) — node-proximity alone over-flagged
    // adjacent lots that share the intersection node but sit ~18-20 m from the cross street.
    expect(SCRIPT).toContain('enrich_centreline_abut_m');
    expect(SCRIPT).not.toContain('CORNER_NODE_PROXIMITY_M'); // rejected approach fully removed
    expect(ec.BUILD_TEMP_SQL).toContain('ST_Distance(ps1.parcel_geom::geography, ps1.seg_geom::geography) AS c1_dist');
    expect(ec.BUILD_TEMP_SQL).toContain('ST_Distance(ps1.parcel_geom::geography, ps2.seg_geom::geography) AS c2_dist');
    // the abut cap fires in BOTH the corner and the through CTEs
    expect((ec.BUILD_TEMP_SQL.match(/c1_dist <= \d+ AND c2_dist <= \d+/g) || []).length).toBe(2);
    // corner still requires the two streets to SHARE A NODE (distinguishes corner from through)
    expect(ec.BUILD_TEMP_SQL).toContain('IS NOT DISTINCT FROM');
    // through: opposite-sides azimuths from a guaranteed-interior point (concave/L/U lots) + degenerate guard
    expect(SCRIPT).toContain('enrich_centreline_through_opposite_tol_deg');
    expect(ec.BUILD_TEMP_SQL).toContain('ST_PointOnSurface(ps1.parcel_geom) AS pos');
    expect(ec.BUILD_TEMP_SQL).toMatch(/ST_Distance\(pos, ST_ClosestPoint\(c1_geom, pos\)\) > 0/); // degenerate guard
    expect(ec.BUILD_TEMP_SQL).toMatch(/> pi\(\) - radians\(\d+\)/); // opposite ≈ 180°
    expect(ec.BUILD_TEMP_SQL).not.toContain('ST_Centroid(parcel_geom)'); // not centroid for azimuths
  });

  it('WF3 #431-FU: laneways are excluded from BOTH the corner and through pair populations', () => {
    // seg_is_lane derived from feature_code_desc (LOWER() for CKAN case-robustness), carried into parcel_pairs.
    expect(ec.BUILD_TEMP_SQL).toMatch(/LOWER\(c\.feature_code_desc\) = 'laneway'\) AS seg_is_lane/);
    expect(ec.BUILD_TEMP_SQL).toContain('ps1.seg_is_lane AS c1_is_lane');
    expect(ec.BUILD_TEMP_SQL).toContain('ps2.seg_is_lane AS c2_is_lane');
    // the lane guard fires in BOTH CTEs (corner + through) — extends the WF2 unnamed-name guard to NAMED lanes
    expect((ec.BUILD_TEMP_SQL.match(/NOT c1_is_lane AND NOT c2_is_lane/g) || []).length).toBe(2);
    // the WF2 unnamed-name guard is untouched (still exactly twice — independent pattern)
    expect((ec.BUILD_TEMP_SQL.match(/c1_name IS NOT NULL AND c2_name IS NOT NULL/g) || []).length).toBe(2);
  });

  it('verdict cascade is row-derived FAIL > WARN > PASS', () => {
    expect(ec.verdictCascade([{ status: 'INFO' }])).toBe('PASS');
    expect(ec.verdictCascade([{ status: 'WARN' }, { status: 'INFO' }])).toBe('WARN');
    expect(ec.verdictCascade([{ status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
  });
});
