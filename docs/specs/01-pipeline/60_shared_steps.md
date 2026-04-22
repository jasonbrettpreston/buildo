# Shared Pipeline Steps

<requirements>
## 1. Goal & User Story
These 8 transformation steps run in multiple chains — they can't live inside a single chain spec. Each links, enriches, or validates permit data using shared reference tables.
</requirements>

---

<architecture>
## 2. Step Registry

| Slug | Script | Chains | Reads | Writes |
|------|--------|--------|-------|--------|
| `geocode_permits` | `geocode-permits.js` | permits, sources | permits, address_points | permits (lat/lng) |
| `link_parcels` | `link-parcels.js` | permits, sources | permits, parcels | permit_parcels |
| `link_neighbourhoods` | `link-neighbourhoods.js` | permits, sources | permits, neighbourhoods | permits (neighbourhood_id) |
| `link_massing` | `link-massing.js` | permits, sources | parcels, building_footprints | parcel_buildings |
| `link_wsib` | `link-wsib.js` | permits, sources | entities, wsib_registry | entities |
| `link_coa` | `link-coa.js` | permits, coa | coa_applications, permits | coa_applications |
| `create_pre_permits` | `create-pre-permits.js` | permits, coa | coa_applications | — (read-only reporting) |
| `refresh_snapshot` | `refresh-snapshot.js` | all chains | 9 tables (parallel counts) | data_quality_snapshots |
</architecture>

---

<behavior>
## 3. Step Details

### Geocode Permits (`geocode-permits.js`)
**Modes:** Incremental (default: only NULL coords) / Full (`--full`: all permits)

1. Query permits where `latitude IS NULL`
2. Match against `address_points` table by street number + name
3. If no match: fall back to Google Maps Geocoding API
4. Update `permits.latitude`, `permits.longitude`

**Edge Cases:** Google API quota exhausted → permits left with NULL coords, skipped by downstream spatial linking. No address_points loaded → all falls to Google (expensive).

**Testing:** `geocoding.logic.test.ts`

---

### Link Parcels (`link-parcels.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour bbox (0.001°) + polygon containment upgrade

1. For each geocoded permit: find nearest parcels within bounding box
2. Check `booleanPointInPolygon` for precision upgrade
3. Record match type: `spatial_polygon` or `spatial_centroid`
4. Batch upsert to `permit_parcels`

**Edge Cases:** Permit outside all polygons → centroid-only match. No parcels in bbox → no link.

**Testing:** `parcels.logic.test.ts`

---

### Link Neighbourhoods (`link-neighbourhoods.js`)
**Method:** Turf.js `booleanPointInPolygon` for 158 neighbourhood boundaries

1. Load all 158 neighbourhood polygons as Turf features
2. For each permit with coordinates: test against each polygon
3. Update `permits.neighbourhood_id` (sentinel `-1` for unmatched)

**Edge Cases:** No coordinates → skipped. N+1 query pattern (individual UPDATE per permit — known perf issue).

**Testing:** `neighbourhood.logic.test.ts`

---

### Link Massing (`link-massing.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour spatial match within bbox
**Safeguard:** Parameter flush at 30,000 params (§9.2)

1. Process parcels in batches of 500 (keyset pagination)
2. For each parcel: find building footprints within spatial bbox
3. Associate via `parcel_buildings` junction table
4. Flush INSERT when approaching 30K parameter limit

**Edge Cases:** Dense urban areas → parameter flush prevents PG limit breach.

**Testing:** `massing.logic.test.ts`

---

### Link WSIB (`link-wsib.js`)
**Method:** Fuzzy string matching (Levenshtein distance)

1. Query entities without WSIB match (or stale)
2. Compare `normalized_name` against `wsib_registry.legal_name_normalized`
3. Exact match → high confidence. Fuzzy within threshold → lower confidence.
4. Update entity with WSIB status + match timestamp

**Edge Cases:** Generic names → may match wrong WSIB entry. WSIB refresh → re-run linking.

**Testing:** `wsib.logic.test.ts`

---

### Link CoA (`link-coa.js`)
**Method:** 3-tier cascade address matching

| Tier | Method | Confidence |
|------|--------|------------|
| 1 | Exact street_num + street_name + ward | 0.95 |
| 2 | Fuzzy stripped street name LIKE + ward | 0.60 |
| 3 | Description FTS (not yet implemented) | 0.30-0.50 |

1. Query unlinked CoA applications
2. Tier 1: exact match with `DISTINCT ON (ca.id) ORDER BY issued_date DESC`
3. Tier 2: fuzzy LIKE with wildcards escaped (`%`, `_` → `\%`, `\_`)
4. Update `linked_confidence` based on tier

**Edge Cases:** Street name with `%` or `_` → LIKE wildcards escaped. Multiple permits at same address → most recent wins.

**Testing:** `coa.logic.test.ts`

---

### Create Pre-Permits (`create-pre-permits.js`)
**Read-only reporting step** — queries and logs, does not mutate data.

1. Query approved CoA applications where `linked_permit_num IS NULL`
2. Filter to 18-month window (older = dead leads)
3. Report pre-permit pool size (~408 qualifying leads)

**Edge Cases:** Application gets linked later → drops from pool naturally. >18 months → flagged by `assert_pre_permit_aging`.

**Testing:** `coa.logic.test.ts`

---

### Refresh Snapshot (`refresh-snapshot.js`)
**Runs in ALL chains** — final infrastructure step.

1. Run 9+ parallel counting queries against live DB
2. Compute coverage rates and Data Effectiveness Score (0-100) as weighted average:
   trades 25%, builders 20%, parcels 15%, neighbourhoods 15%, geocoding 15%, CoA 10%
3. Upsert to `data_quality_snapshots` via `ON CONFLICT (snapshot_date) DO UPDATE`
4. Include inspection coverage metrics

**Edge Cases:** `active_permits = 0` → division by zero guarded. Massing query fails → caught, defaults to 0.

**Testing:** `quality.logic.test.ts`, `quality.infra.test.ts`
</behavior>

---

<constraints>
## 4. Operating Boundaries

### Target Files
- `scripts/geocode-permits.js`, `scripts/link-parcels.js`, `scripts/link-neighbourhoods.js`
- `scripts/link-massing.js`, `scripts/link-wsib.js`, `scripts/link-coa.js`
- `scripts/create-pre-permits.js`, `scripts/refresh-snapshot.js`

### Cross-Spec Dependencies
- **Consumed by:** `chain_permits.md`, `chain_coa.md`, `chain_sources.md`
- **Relies on:** `pipeline_system.md` (SDK), source specs (reference data tables)
</constraints>
