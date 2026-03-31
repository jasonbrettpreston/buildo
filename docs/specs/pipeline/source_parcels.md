# Source: Toronto Property Parcels

<requirements>
## 1. Goal & User Story
As the spatial linking foundation, this script ingests property lot polygon boundaries from Toronto Open Data — enabling the system to determine exactly which land parcel a building permit falls within, calculate lot sizes, and link permits to 3D massing volumes.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../Property Boundaries - 4326.csv` |
| **Format** | CSV (~327 MB, WKT polygon geometries, WGS84) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-parcels.js` |

### Target Table: `parcels`
| Column | Type | Notes |
|--------|------|-------|
| `parcel_id` | TEXT | PK |
| `address` | TEXT | Property address |
| `geometry` | JSONB | WKT polygon converted to GeoJSON |
| `centroid_lat` | NUMERIC | Computed by `compute-centroids.js` |
| `centroid_lng` | NUMERIC | Computed by `compute-centroids.js` |
| `lot_area` | NUMERIC | Calculated from polygon |

**PK:** `(parcel_id)`
**Upsert:** `ON CONFLICT (parcel_id) DO UPDATE`
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Download 327 MB CSV from Toronto Open Data
2. Stream-parse with batch inserts to stay under memory limits
3. Parse WKT polygons to GeoJSON, compute lot area
4. Filter expired parcels (`date_expiry < today`)
5. Upsert to `parcels` table

### Edge Cases
- 327 MB file size → streaming parser required (§9.5)
- Expired parcels → filtered out before insert
- Missing centroid → computed by downstream `compute-centroids.js` step
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-parcels.js`
- **Consumed by:** `chain_sources.md` (step 4), `link_parcels` (spatial matching)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
