# Source: Toronto Neighbourhoods

<requirements>
## 1. Goal & User Story
As the geographic aggregation layer, this script ingests 158 Toronto neighbourhood boundary polygons and Census income profiles — enabling the system to assign permits to neighbourhoods and render neighbourhood-level market analytics.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **Boundaries** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../neighbourhoods-4326.geojson` |
| **Profiles** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../nbhd_2021_census_profile_full_158model.xlsx` |
| **Format** | GeoJSON (boundaries) + XLSX (Census profiles) |
| **Schedule** | Annual (via `chain_sources`) |
| **Script** | `scripts/load-neighbourhoods.js` |

### Target Table: `neighbourhoods`
| Column | Type | Notes |
|--------|------|-------|
| `neighbourhood_id` | INTEGER | PK |
| `name` | TEXT | Neighbourhood name |
| `geometry` | JSONB | GeoJSON polygon/multipolygon |
| `geom` | GEOMETRY | PostGIS column (parallel to JSONB) |
| `median_household_income` | NUMERIC | From Census XLSX |
| `avg_household_income` | NUMERIC | From Census XLSX |
| `population` | INTEGER | From Census XLSX |

**PK:** `(neighbourhood_id)`
**Upsert:** `ON CONFLICT (neighbourhood_id) DO UPDATE` with `IS DISTINCT FROM` on geometry
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Fetch GeoJSON boundary file (158 neighbourhoods)
2. Parse each Feature, extract neighbourhood_id from properties
3. Upsert boundary polygons (both JSONB `geometry` and PostGIS `geom`)
4. Fetch Census XLSX profile, parse income characteristics
5. Map Census rows to neighbourhood_id, update income/population columns

### Edge Cases
- Neighbourhood count < 158 → data quality assertion catches this
- Census XLSX format changes → column mapping may need update
- MultiPolygon vs Polygon → both handled via Turf.js
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-neighbourhoods.js`
- **Consumed by:** `chain_sources.md` (step 9), `link_neighbourhoods` (point-in-polygon)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
