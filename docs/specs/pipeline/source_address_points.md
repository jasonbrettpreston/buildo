# Source: Toronto Address Points

<requirements>
## 1. Goal & User Story
As the geocoding fallback source, this script ingests ~500K master address point geometries from Toronto Open Data — providing precise street-level coordinates for permit address matching before falling back to the Google Maps API.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../address-points-4326.csv` |
| **Format** | CSV (~500K rows, WGS84 coordinates) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-address-points.js` |

### Target Table: `address_points`
| Column | Type | Notes |
|--------|------|-------|
| `address_point_id` | INTEGER | PK |
| `address` | TEXT | Full street address |
| `municipality` | TEXT | City name |
| `latitude` | NUMERIC | WGS84 |
| `longitude` | NUMERIC | WGS84 |

**PK:** `(address_point_id)`
**Upsert:** `ON CONFLICT (address_point_id) DO UPDATE` with `IS DISTINCT FROM` on coordinates
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Download CSV from Toronto Open Data
2. Stream-parse rows, batch INSERT at configured batch size
3. Upsert — only updates if coordinates have changed (`IS DISTINCT FROM`)

### Edge Cases
- Coordinate system mismatch → CSV is pre-projected to WGS84 (EPSG:4326)
- Duplicate `address_point_id` within batch → `ON CONFLICT DO NOTHING` for extras
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-address-points.js`
- **Consumed by:** `chain_sources.md` (step 2), `geocode_permits` (address lookup)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
