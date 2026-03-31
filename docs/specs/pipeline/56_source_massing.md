# Source: 3D Building Massing

<requirements>
## 1. Goal & User Story
As a spatial data dependency, this script ingests 3D building footprint volumes from Toronto Open Data shapefiles — enabling the system to understand existing building structures at permit locations and calculate construction scale.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../3dmassingshapefile_2025_wgs84.zip` |
| **Format** | Shapefile (ZIP archive, WGS84) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-massing.js` |

### Target Table: `building_footprints`
| Column | Type | Notes |
|--------|------|-------|
| `source_id` | TEXT | PK — from shapefile feature ID |
| `geometry` | JSONB | GeoJSON polygon |
| `height` | NUMERIC | Building height in meters |
| `centroid_lat` | NUMERIC | Footprint centroid |
| `centroid_lng` | NUMERIC | Footprint centroid |

**PK:** `(source_id)`
**Upsert:** `ON CONFLICT (source_id) DO UPDATE`
**Parameter safeguard:** Flushes INSERT at 30,000 params (§9.2)
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Download shapefile ZIP, extract to temp directory
2. Parse shapefile features, convert to GeoJSON
3. Calculate centroids for each footprint
4. Batch upsert with parameter flush threshold (30K params)
5. After load, automatically triggers `link-massing.js`

### Edge Cases
- Shapefile URL changes → `assert_schema` (Tier 1) checks URL accessibility
- Large parameter counts → flushed at 30K to stay under PostgreSQL 65,535 limit
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-massing.js`
- **Consumed by:** `chain_sources.md` (step 7), `link_massing` (spatial matching)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
