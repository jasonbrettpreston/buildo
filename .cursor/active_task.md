# Active Task: Fix link_massing CRS mismatch — buildings in EPSG:3857, parcels in EPSG:4326
**Status:** Planning
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** link-massing.js fails with 0 parcels linked because building footprint geometries are in EPSG:3857 (Web Mercator, coords ~[-8817017, 5434034]) while parcel centroids/geometries are in EPSG:4326 (WGS84, coords ~[-79.2, 43.8]). Point-in-polygon tests always return false across coordinate systems.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/link-massing.js` — Phase 1 grid load query and geometry processing

## Technical Implementation
* **Root Cause:** Building footprint `geometry` JSONB column stores coordinates in EPSG:3857. Parcel `geometry` and centroid columns use EPSG:4326. The Turf.js point-in-polygon test compares points in different CRS, always returning false.
* **Fix:** Reproject building geometry coordinates from EPSG:3857 → EPSG:4326 during Phase 1 grid load. PostGIS is NOT available locally, so reproject using pure math (inverse Mercator):
  - `lng = x * 180 / 20037508.342789244`
  - `lat = atan(sinh(y * PI / 20037508.342789244)) * 180 / PI`
  - Apply to every coordinate in every polygon ring during grid construction
* **Database Impact:** NO — geometry column values unchanged, reprojection is in-memory only

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** N/A — pipeline script
* **logError Mandate:** N/A
* **Mobile-First:** N/A — backend only
* **Pipeline SDK:** Uses `pipeline.run`, `emitSummary`, `emitMeta` — no changes to SDK usage

## Execution Plan
- [ ] **Rollback Anchor:** `2076a65`
- [ ] **State Verification:** Confirmed building coords in EPSG:3857, parcel coords in EPSG:4326
- [ ] **Spec Review:** Data quality dashboard spec — link-massing behavior
- [ ] **Reproduction:** Tested: 149 candidate buildings found near sample parcel but 0 polygon matches (CRS mismatch)
- [ ] **Fix:** Add `reprojectMercator(geometry)` function to link-massing.js, apply during grid construction in Phase 1
- [ ] **Verify:** Run `node scripts/link-massing.js` — should produce > 0 parcels_linked
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
