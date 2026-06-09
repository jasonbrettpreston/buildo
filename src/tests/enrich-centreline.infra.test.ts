// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §11, §9, §8d
//
// Source-contract tests for enrich-centreline.js — lock the §11 SQL shape (the precedent
// fences: MATERIALIZED driver, geom-validity, the L30 cap, NULL-safe node guards, the
// 4-disjunct write-guard incl. lineage), the 4-tier producer contract + assertPreconditions,
// and the 4-column emitMeta write-set.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ec = require('../../scripts/enrich-centreline.js');
const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-centreline.js'), 'utf8');

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

  it('UPDATE: writes all 4 columns incl. lineage; 4-disjunct IS DISTINCT FROM write-guard', () => {
    expect(ec.UPDATE_SQL).toContain('centreline_dataset_version_when_enriched = $1');
    expect(ec.UPDATE_SQL).toMatch(/is_corner_lot\s+IS DISTINCT FROM/);
    expect(ec.UPDATE_SQL).toMatch(/centreline_dataset_version_when_enriched IS DISTINCT FROM \$1/); // lineage disjunct
  });

  it('contract read is 4-tier + extracts source_dataset_version with a null-guard (G1)', () => {
    expect(SCRIPT).toContain("spec_version !== SPEC_VERSION"); // tier b
    expect(SCRIPT).toContain('features_inserted'); // tier c
    expect(SCRIPT).toContain('source_dataset_version is null/empty'); // G1 null-guard throw
  });

  it('assertPreconditions checks the GIST index + 4 parcels columns + the M-1 functions (G2)', () => {
    expect(SCRIPT).toContain('idx_toronto_centreline_geom_gist');
    expect(SCRIPT).toContain('migration 174 not applied'); // 4 target columns
    expect(SCRIPT).toContain('normalize_address_number');
    expect(SCRIPT).toContain('address_match_status');
  });

  it('Enrich archetype emit + emitMeta writes the 4-column set incl. lineage (G3)', () => {
    expect(SCRIPT).toMatch(/records_total:\s*null/);
    expect(SCRIPT).toMatch(/records_updated:\s*result\.updated/);
    expect(SCRIPT).toMatch(/parcels:\s*\['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched'\]/);
    expect(SCRIPT).toContain('centreline_enrich'); // frozen §9 block
  });

  it('diagnostic audit rows wired with their grading thresholds (F5b/F5c/G4/L21)', () => {
    expect(SCRIPT).toContain('parcels_with_zero_centreline_intersections_pct'); // L21 FAIL/WARN
    expect(SCRIPT).toContain('parcels_street_name_normalized_pct'); // F5b
    expect(SCRIPT).toContain('centreline_intersection_id_null_pct'); // F5c
    expect(SCRIPT).toContain('parcels_address_number_null_pct'); // G4
    expect(SCRIPT).toMatch(/UNLINKED_FAIL_PCT\s*=\s*40/);
    expect(SCRIPT).toMatch(/NAME_COVERAGE_WARN_PCT\s*=\s*90/);
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
    expect(SCRIPT).toContain('idx_toronto_centreline_geog_gist');
    expect(SCRIPT).toContain('migration 175');
    // frozen P3 key renamed to reflect nearest-segment semantics
    expect(SCRIPT).toContain('parcels_frontage_priority3_nearest_segment_count');
    expect(SCRIPT).not.toContain('parcels_frontage_priority3_longest_intersect_count');
  });

  it('WF3: corner = share-node + abuts both streets; through = parallel opposite-sides + abuts both', () => {
    // The discriminator is "abuts BOTH streets" (≤ CENTRELINE_ABUT_M) — node-proximity alone over-flagged
    // adjacent lots that share the intersection node but sit ~18-20 m from the cross street.
    expect(SCRIPT).toContain('CENTRELINE_ABUT_M');
    expect(SCRIPT).not.toContain('CORNER_NODE_PROXIMITY_M'); // rejected approach fully removed
    expect(ec.BUILD_TEMP_SQL).toContain('ST_Distance(ps1.parcel_geom::geography, ps1.seg_geom::geography) AS c1_dist');
    expect(ec.BUILD_TEMP_SQL).toContain('ST_Distance(ps1.parcel_geom::geography, ps2.seg_geom::geography) AS c2_dist');
    // the abut cap fires in BOTH the corner and the through CTEs
    expect((ec.BUILD_TEMP_SQL.match(/c1_dist <= \d+ AND c2_dist <= \d+/g) || []).length).toBe(2);
    // corner still requires the two streets to SHARE A NODE (distinguishes corner from through)
    expect(ec.BUILD_TEMP_SQL).toContain('IS NOT DISTINCT FROM');
    // through: opposite-sides azimuths from a guaranteed-interior point (concave/L/U lots) + degenerate guard
    expect(SCRIPT).toContain('THROUGH_OPPOSITE_TOL_DEG');
    expect(ec.BUILD_TEMP_SQL).toContain('ST_PointOnSurface(ps1.parcel_geom) AS pos');
    expect(ec.BUILD_TEMP_SQL).toMatch(/ST_Distance\(pos, ST_ClosestPoint\(c1_geom, pos\)\) > 0/); // degenerate guard
    expect(ec.BUILD_TEMP_SQL).toMatch(/> pi\(\) - radians\(\d+\)/); // opposite ≈ 180°
    expect(ec.BUILD_TEMP_SQL).not.toContain('ST_Centroid(parcel_geom)'); // not centroid for azimuths
  });

  it('verdict cascade is row-derived FAIL > WARN > PASS', () => {
    expect(ec.verdictCascade([{ status: 'INFO' }])).toBe('PASS');
    expect(ec.verdictCascade([{ status: 'WARN' }, { status: 'INFO' }])).toBe('WARN');
    expect(ec.verdictCascade([{ status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
  });
});
