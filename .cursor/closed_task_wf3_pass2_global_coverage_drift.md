# Active Task: WF3 — assert-global-coverage.js pb aggregate column-drift (Pass-2 finding)
**Status:** Implementation
**Workflow:** WF3 — per-finding fix from Spec 79 §6 permits chain re-run (2026-05-19)
**Domain Mode:** Backend/Pipeline

## Context
- Permits chain step 28 (assert_global_coverage) FAILED with `column "area_sqm" does not exist` (PG 42703) at script line 373-374.
- Root cause: query reads `parcel_buildings.area_sqm` / `parcel_buildings.height_m`, but those columns live on `building_footprints` as `footprint_area_sqm` / `max_height_m`.
- Same bug class as WF2 #4 2026-05-08 fetchLeadInspect fix (commit 73f3ae6) — was repaired in `lead-inspect-query.ts` but not in `assert-global-coverage.js`.
- Verified via `\d parcel_buildings` (8 cols: id/parcel_id/building_id/is_primary/structure_type/match_type/confidence/linked_at — no dims) + `\d building_footprints` (has `footprint_area_sqm` + `max_height_m`).

## Fix
Replace the bare `parcel_buildings.area_sqm / height_m` columns with a LEFT JOIN to `building_footprints` on `parcel_buildings.building_id = building_footprints.id`, counting rows where `bf.footprint_area_sqm IS NOT NULL` and `bf.max_height_m IS NOT NULL`. Update the corresponding `coverageRow` labels in the rows.push block: `parcel_buildings.area_sqm` → `building_footprints.footprint_area_sqm`; same for height.

## Execution Plan
- [ ] Edit pb aggregate query (lines 365-376): JOIN to building_footprints, rename pop columns
- [ ] Edit rows.push for Step 11 — link_massing: update column labels
- [ ] Update infra test assertions (assert-global-coverage.infra.test.ts has tests for `parcel_buildings.area_sqm` / `parcel_buildings.height_m`)
- [ ] Run script directly to confirm green
- [ ] Re-trigger permits chain via UI; confirm Step 28 PASS/WARN (not FAIL)
- [ ] Commit + push

## Operating Boundaries
- Target: `scripts/quality/assert-global-coverage.js` (~6 LOC change in pb query + ~2 LOC in rows.push)
- Update: `src/tests/assert-global-coverage.infra.test.ts` (~2 assertions)
- Out of scope: any other column-drift findings; Pass-2 calibration band recalibration
