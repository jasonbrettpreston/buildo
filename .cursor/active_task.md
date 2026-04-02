# Active Task: WF1 — PostGIS Spatial Offloading (B10/B11/B12)
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `01a8348`

## Context
* **Goal:** Move heavy spatial operations from JavaScript (Turf.js + custom ray-casting) into PostgreSQL PostGIS, leveraging existing GiST indexes for O(log n) spatial queries instead of O(n) client-side loops.
* **Target Spec:** `docs/specs/pipeline/60_shared_steps.md`
* **Key Files:** `scripts/compute-centroids.js`, `scripts/link-neighbourhoods.js`, `scripts/link-parcels.js`, `scripts/link-massing.js`, `migrations/065_building_footprints_geom.sql` (new)

## Technical Implementation

### Migration: `065_building_footprints_geom.sql`
**Problem:** `parcels` and `neighbourhoods` already have `geom` GEOMETRY columns with GiST indexes (migration 039), but `building_footprints` only has JSONB `geometry`. link-massing needs a native PostGIS column for `ST_Contains`.

**Implementation:**
```sql
-- UP
ALTER TABLE building_footprints ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);
UPDATE building_footprints SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE geometry IS NOT NULL AND geom IS NULL;
CREATE INDEX IF NOT EXISTS idx_building_footprints_geom_gist ON building_footprints USING GiST (geom);
-- DOWN
DROP INDEX IF EXISTS idx_building_footprints_geom_gist;
ALTER TABLE building_footprints DROP COLUMN IF EXISTS geom;
```

### Fix 1: `compute-centroids.js` — Quick Win
**Current:** Fetches geometry as JSON, computes arithmetic mean of vertices in JS, bulk UPDATE.
**Fix:** Single SQL statement: `UPDATE parcels SET centroid_lat = ST_Y(ST_Centroid(geom)), centroid_lng = ST_X(ST_Centroid(geom)) WHERE geom IS NOT NULL AND centroid_lat IS NULL`
**Impact:** Eliminates entire JS loop. ~1 SQL query replaces ~200K row fetch + JS math + bulk UPDATE.

### Fix 2: `link-neighbourhoods.js` — Medium
**Current:** Loads 158 neighbourhood polygons into Turf objects, tests each permit against all 158 with BBOX pre-filter + `booleanPointInPolygon`.
**Fix:** Single SQL JOIN: `UPDATE permits p SET neighbourhood_id = n.id FROM neighbourhoods n WHERE ST_Contains(n.geom, ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326))`
**Impact:** Eliminates Turf.js dependency, BBOX pre-filter (GiST handles this), and 158-polygon loop.

### Fix 3: `link-parcels.js` — Medium
**Current:** Hand-coded ray-casting + haversine distance per permit, BBOX_OFFSET pre-filter.
**Fix:** PostGIS `ST_Contains(parcel.geom, permit_point)` for polygon match, `ST_DWithin` for nearest-centroid fallback.
**Impact:** Eliminates custom ray-casting code, haversine function, BBOX constants.

### Fix 4: `link-massing.js` — Heavy (Biggest Win)
**Current:** Loads ALL 400K+ building_footprints into V8 memory for in-memory grid index, then Turf `booleanPointInPolygon` per parcel.
**Fix:** PostGIS `ST_Contains(bf.geom, parcel_point)` with GiST index. Eliminates the entire in-memory grid + streamQuery load.
**Impact:** Removes the single largest memory consumer in the pipeline. O(log n) spatial index vs O(n) grid scan.

## Database Impact
**YES** — Migration 065: Add `geom` column + GiST index to `building_footprints`.
- Table size: ~400K rows
- Backfill: `ST_GeomFromGeoJSON(geometry::text)` — CPU-intensive but one-time
- Index: GiST spatial index for O(log n) queries

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK handles errors (§9.4)
* **Unhappy Path Tests:** NULL geometry handling, missing PostGIS extension fallback
* **logError Mandate:** N/A — pipeline SDK logging
* **Mobile-First:** N/A — backend scripts

## Execution Plan
- [ ] **Contract Definition:** N/A — no API routes
- [ ] **Spec & Registry Sync:** Update `docs/specs/pipeline/60_shared_steps.md` with PostGIS methods. Run `npm run system-map`.
- [ ] **Schema Evolution:** Write `migrations/065_building_footprints_geom.sql` (UP + DOWN). `npm run migrate`. `npm run db:generate`. `npm run typecheck`.
- [ ] **Test Scaffolding:** Source-level tests asserting ST_Contains/ST_Centroid usage, no Turf.js imports
- [ ] **Red Light:** Run tests — must fail
- [ ] **Implementation:** Rewrite 4 scripts to use PostGIS SQL
- [ ] **Auth Boundary & Secrets:** N/A
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
