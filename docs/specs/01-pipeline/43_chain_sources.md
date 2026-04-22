# Chain: Sources (Spatial & Reference Data)

<requirements>
## 1. Goal & User Story
As a data pipeline operator, I need this quarterly chain to refresh all foundational spatial reference tables (address points, parcels, building footprints, neighbourhoods) and the WSIB registry — so that downstream permit-linking, geocoding, and builder verification remain accurate.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js sources` or `POST /api/admin/pipelines/chain_sources`
**Schedule:** Quarterly (address_points, parcels, massing), Annual (neighbourhoods)
**Steps:** 15 (sequential, stop-on-failure)
**Gate:** None — all steps always run

```
assert_schema → address_points → geocode_permits → parcels →
compute_centroids → link_parcels → massing → link_massing →
neighbourhoods → link_neighbourhoods → load_wsib → link_wsib →
refresh_snapshot → assert_data_bounds → assert_engine_health
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `assert_schema` | `quality/assert-schema.js` | Validate CSV headers, GeoJSON keys, shapefile URLs | pipeline_runs |
| 2 | `address_points` | `load-address-points.js` | Ingest Toronto master address point geometries | address_points |
| 3 | `geocode_permits` | `geocode-permits.js` | Re-geocode permits missing coordinates | permits |
| 4 | `parcels` | `load-parcels.js` | Ingest property lot polygons from city GIS | parcels |
| 5 | `compute_centroids` | `compute-centroids.js` | Calculate centroid lat/lng for parcels missing them | parcels |
| 6 | `link_parcels` | `link-parcels.js` | Re-link all permits to fresh parcel data (runs `--full` in sources chain) | permit_parcels |
| 7 | `massing` | `load-massing.js` | Ingest 3D building footprint volumes | building_footprints |
| 8 | `link_massing` | `link-massing.js` | Link parcels to building footprints (runs `--full` in sources chain) | parcel_buildings |
| 9 | `neighbourhoods` | `load-neighbourhoods.js` | Ingest neighbourhood boundaries + Census income profiles | neighbourhoods |
| 10 | `link_neighbourhoods` | `link-neighbourhoods.js` | Assign neighbourhood_id to all permits via point-in-polygon | permits |
| 11 | `load_wsib` | `load-wsib.js` | Download Ontario WSIB contractor registry | wsib_registry |
| 12 | `link_wsib` | `link-wsib.js` | Re-match all builders against fresh WSIB data | entities |
| 13 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics | data_quality_snapshots |
| 14 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Sources-scoped: row counts, duplicate IDs, lot size bounds | pipeline_runs |
| 15 | `assert_engine_health` | `quality/assert-engine-health.js` | Engine health for spatial tables | engine_health_snapshots |

### Chain-Specific Arguments
`link_massing` receives `--full` when run in the sources chain (via `manifest.scripts.link_massing.chain_args.sources`). This forces a full re-link instead of incremental.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- Toronto Open Data GIS endpoints (address points CSV, parcels CSV, massing shapefiles, neighbourhood GeoJSON)
- Ontario WSIB registry CSV
- Google Maps Geocoding API (fallback)

### Core Logic
1. **Schema validation** — CSV headers and GeoJSON property keys checked before bulk ingestion
2. **Address points** — Bulk load ~500K address point geometries. `ON CONFLICT (address_point_id) DO NOTHING`.
3. **Geocoding** — Re-process permits where `latitude IS NULL`. Address point lookup first, Google API fallback.
4. **Parcels** — Bulk load property lot polygons. Streaming CSV parser with batch inserts.
5. **Centroids** — Compute `centroid_lat`/`centroid_lng` for parcels missing them via geometric calculation.
6. **Parcel linking** — Spatial match: permits → nearest parcel within 0.001° bbox. Polygon containment check for precision upgrade.
7. **Massing** — Load 3D building footprints from city shapefiles. Parameter flush at 30K params (§9.2 safeguard).
8. **Massing linking** — Associate parcels with overlapping building footprints. Full re-link in sources chain.
9. **Neighbourhoods** — Load 158 Toronto neighbourhood boundaries + Census income characteristics from Excel profiles.
10. **Neighbourhood linking** — Point-in-polygon using Turf.js `booleanPointInPolygon`. Individual UPDATE per permit.
11. **WSIB** — Download registered contractor list. Upsert by firm name.
12. **WSIB linking** — Fuzzy match extracted builder entities against WSIB registry. Levenshtein distance threshold.
13. **Quality assertions** — Sources-scoped data bounds (address_points row count, parcels row count, duplicate IDs, building_footprints row count, height bounds, neighbourhoods count ≥ 158).

### Outputs
- `address_points` table refreshed (~500K rows)
- `parcels` table refreshed with centroids
- `building_footprints` table refreshed
- `neighbourhoods` table refreshed (158 boundaries + income profiles)
- `wsib_registry` table refreshed
- All permits re-linked to fresh spatial data

### Edge Cases
- City GIS portal returning 500 → chain halts (no partial spatial data)
- Neighbourhood boundary changes (rare, ~annual) → old permits may shift neighbourhoods
- WSIB download truncated → could drop previously matched builders (no rollback protection)
- `link_neighbourhoods` N+1 pattern for 237K permits → performance concern (documented bug, not yet batched)
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (sources chain definition, step count, --full arg injection)
- **Logic:** `parcels.logic.test.ts`, `neighbourhood.logic.test.ts`, `massing.logic.test.ts`, `wsib.logic.test.ts`
- **Logic:** `geocoding.logic.test.ts`
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/manifest.json` (sources chain array)
- All 15 scripts listed in the step breakdown

### Out-of-Scope Files
- `src/lib/parcels/`, `src/lib/spatial/` — TypeScript API paths
- `src/components/permits/NeighbourhoodProfile.tsx` — UI rendering

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Consumed by:** `chain_permits.md` (depends on spatial tables being populated)
- **Shared steps:** See `60_shared_steps.md` for geocode_permits, link_parcels, link_massing, link_neighbourhoods, link_wsib, refresh_snapshot
</constraints>

---

## Step Details (Single-Chain Steps)

### Step 5: Compute Centroids (`compute-centroids.js`)

**Logic:**
1. Query parcels where `centroid_lat IS NULL` or `centroid_lng IS NULL`
2. Calculate geometric centroid from polygon coordinates
3. Update `parcels.centroid_lat`, `parcels.centroid_lng`

**Edge Cases:** Complex multipolygon → centroid may fall outside polygon (valid for approximate matching). Individual UPDATE per parcel (known N+1 performance issue).
