// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/01-pipeline/83_lead_cost_model.md §7 (the dual-path
//             reference SOURCE_SQL pattern this test enforces consistency with)
//
// SQL-shape regression-lock for src/lib/leads/lead-inspect-query.ts.
//
// Why this test exists (WF3 2026-05-08):
//   The original WF2 #4 implementation (commit 6683477) aliased the
//   parcel_buildings LATERAL subquery as `pb` and SELECTed `pb.area_sqm`
//   and `pb.height_m` directly — but those columns DON'T EXIST on
//   parcel_buildings (it's a join table per migrations 024 + 026; the
//   geometry lives on building_footprints per migration 023). The bug
//   slipped because `admin-leads-inspect.infra.test.ts` mocks
//   fetchLeadInspect (so the SQL was never exercised) and
//   `admin-detail-inspectors.ui.test.tsx` mocks the API response.
//
//   The fix mirrors the SOURCE_SQL pattern in scripts/compute-cost-estimates.js:
//   the LATERAL fetches `building_id` only; a top-level
//   `LEFT JOIN building_footprints bf` resolves the geometry; SELECTs read
//   from `bf.footprint_area_sqm` / `bf.max_height_m`.
//
// What this test catches: any regression that re-introduces the broken
// shape (text-level). It does NOT exercise the SQL against a live DB —
// a live-DB infra harness for inspect SQL is filed as a follow-up in
// docs/reports/review_followups.md.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const QUERY_PATH = path.resolve(
  __dirname,
  '../../src/lib/leads/lead-inspect-query.ts',
);

describe('lead-inspect-query.ts — SQL-shape regression-lock (WF3 2026-05-08)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(QUERY_PATH, 'utf-8');
  });

  it('does NOT reference pb.area_sqm (the broken column on parcel_buildings)', () => {
    // parcel_buildings has no area_sqm column (migs 024 + 026 schema:
    // id, parcel_id, building_id, is_primary, structure_type, linked_at,
    // match_type, confidence). Geometry lives on building_footprints.
    expect(src).not.toMatch(/\bpb\.area_sqm\b/);
  });

  it('does NOT reference pb.height_m (the broken column on parcel_buildings)', () => {
    // Same root cause — height_m is on building_footprints, not parcel_buildings.
    expect(src).not.toMatch(/\bpb\.height_m\b/);
  });

  it('SELECTs bf.footprint_area_sqm aliased as pb_area_sqm (correct column from building_footprints)', () => {
    // Migration 023: building_footprints.footprint_area_sqm is the
    // canonical column. Aliasing to pb_area_sqm preserves the MainRow
    // TS interface so the JS-side mapper requires no edits.
    expect(src).toMatch(/bf\.footprint_area_sqm[\s\S]*?AS\s+pb_area_sqm/i);
  });

  it('SELECTs bf.max_height_m aliased as pb_height_m (correct column from building_footprints)', () => {
    expect(src).toMatch(/bf\.max_height_m[\s\S]*?AS\s+pb_height_m/i);
  });

  it('joins building_footprints via the building_id from the parcel_buildings LATERAL', () => {
    // Mirrors scripts/compute-cost-estimates.js SOURCE_SQL lines 86-92:
    // the LATERAL fetches building_id only; a top-level LEFT JOIN resolves
    // the geometry. Single source of truth — both surfaces stay aligned.
    expect(src).toMatch(/LEFT\s+JOIN\s+building_footprints\s+bf\s+ON\s+bf\.id\s*=\s*pb\.building_id/i);
  });

  it('LATERAL subquery selects building_id from parcel_buildings (not geometry columns)', () => {
    // Multiline aware — the LATERAL spans several lines.
    const lateralBlock = src.match(
      /LEFT\s+JOIN\s+LATERAL\s*\(\s*SELECT\s+building_id[\s\S]*?FROM\s+parcel_buildings[\s\S]*?\)\s+pb\s+ON\s+true/i,
    );
    expect(lateralBlock).toBeTruthy();
  });

  // ─── Drift #2: parc.area_sqm doesn't exist on parcels (mig 011: lot_size_sqm)

  it('does NOT reference parc.area_sqm (the broken column on parcels)', () => {
    // parcels (mig 011) has lot_size_sqm — there is no area_sqm column.
    expect(src).not.toMatch(/\bparc\.area_sqm\b/);
  });

  it('SELECTs parc.lot_size_sqm aliased as parcel_area_sqm (correct column from parcels)', () => {
    expect(src).toMatch(/parc\.lot_size_sqm[\s\S]*?AS\s+parcel_area_sqm/i);
  });

  // ─── Drift #3 (CORRECTED 2026-05-08): permits.neighbourhood_id is a
  // FK to neighbourhoods.id (SERIAL) per migration 109 fk_permits_neighbourhoods.
  // The earlier WF3 73f3ae6 commit incorrectly flipped this to n.neighbourhood_id
  // based on compute-cost-estimates.js — but that script is ALSO wrong (separate
  // WF3 deferred to review_followups.md). The truth: lead-detail-query.ts:101
  // uses `n.id = p.neighbourhood_id` and that's the FK-correct join.

  it('joins neighbourhoods on n.id = p.neighbourhood_id (the SERIAL FK per mig 109)', () => {
    // Mig 109 step 4a-c: ALTER TABLE permits ADD CONSTRAINT fk_permits_neighbourhoods
    //   FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id);
    // Step 4b nullified non-matching rows. Step 4c VALIDATEd. → permits.neighbourhood_id
    // CONTAINS SERIAL `id` values. Joining on n.neighbourhood_id (the city
    // open-data PK) returns the WRONG neighbourhood for every permit.
    expect(src).toMatch(/LEFT\s+JOIN\s+neighbourhoods\s+n\s+ON\s+n\.id\s*=\s*p\.neighbourhood_id/i);
  });

  it('does NOT join neighbourhoods on n.neighbourhood_id (regression-lock against the FK-wrong join)', () => {
    expect(src).not.toMatch(/JOIN\s+neighbourhoods\s+n\s+ON\s+n\.neighbourhood_id\s*=\s*p\.neighbourhood_id/i);
  });
});
