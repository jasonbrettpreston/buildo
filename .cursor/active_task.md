# Active Task: Fix link-massing.js PostGIS argument order + partial unique index
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Domain Mode:** **Backend/Pipeline**
**Rollback Anchor:** `201dd1d`

## Context
* **Goal:** Fix 2 HIGH bugs from review_followups.md that corrupt `parcel_buildings` data.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/link-massing.js`, `migrations/081_parcel_buildings_single_primary.sql`

## Bug 1: PostGIS path argument order (line 226)
INSERT column order: `(parcel_id, building_id, is_primary, structure_type, match_type, confidence)`
Values pushed:       `(r.parcel_id, r.building_id, 'spatial_polygon', area, area > 0, true)`

Mapping:
- `is_primary` ← `'spatial_polygon'` (string coerced to `true` by PostgreSQL)
- `structure_type` ← `area` (float, coerced to string)
- `match_type` ← `area > 0` (boolean, coerced to string `'true'`/`'false'`)
- `confidence` ← `true` (boolean, coerced to `1.00`)

All 4 values are wrong. The JS fallback path (line 478-479) is correct and should be mirrored.

**Fix:** Rewrite to match the JS fallback's deterministic primary assignment pattern:
- Classify structures using `classifyStructure()` 
- Enforce single primary via largest `footprint_area_sqm` tie-breaker
- Correct column order: `parcel_id, building_id, isPrimary, structureType, 'centroid_in_polygon', 0.90`

## Bug 2: No partial unique index on `(parcel_id) WHERE is_primary = true`
Even after fixing the argument order, nothing prevents future code from inserting multiple `is_primary = true` rows per parcel. A partial unique index enforces this at the DB level.

**Fix:** New migration adding `CREATE UNIQUE INDEX idx_parcel_buildings_one_primary ON parcel_buildings (parcel_id) WHERE is_primary = true`.

**Pre-migration data repair:** Must first fix any existing rows with multiple primaries per parcel before the index can be created. Set `is_primary = false` on all but the largest-area building per parcel.

## Execution Plan
- [x] **Rollback Anchor:** `201dd1d`
- [x] **State Verification:** PostGIS path pushes wrong column order; JS fallback is correct
- [ ] **Fix 1:** Correct argument order in PostGIS path, mirror JS fallback's primary assignment logic
- [ ] **Fix 2:** Migration with data repair + partial unique index
- [ ] **Tests:** Verify existing tests pass
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
