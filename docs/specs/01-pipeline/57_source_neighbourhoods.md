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
| `id` | SERIAL | **Internal PK** — auto-incremented surrogate. FK targets across the codebase reference this column (e.g. `permits.neighbourhood_id` → `neighbourhoods.id` per migration 109 `fk_permits_neighbourhoods`). |
| `neighbourhood_id` | INTEGER | UNIQUE NOT NULL — natural city open-data identifier. Used as the upsert key by `load-neighbourhoods.js`. NOT the FK target. |
| `name` | TEXT | Neighbourhood name |
| `geometry` | JSONB | GeoJSON polygon/multipolygon |
| `geom` | GEOMETRY | PostGIS column (parallel to JSONB) |
| `median_household_income` | NUMERIC | From Census XLSX |
| `avg_household_income` | NUMERIC | From Census XLSX |
| `population` | INTEGER | From Census XLSX |

**Internal PK:** `(id)` (SERIAL surrogate — universal `id SERIAL PK` convention shared with `parcels`, `permit_parcels`, `parcel_buildings`, etc.)
**Natural identity:** `(neighbourhood_id)` UNIQUE — the city open-data integer the load script keys on.
**Upsert:** `ON CONFLICT (neighbourhood_id) DO UPDATE` with `IS DISTINCT FROM` on geometry — uses the UNIQUE constraint, NOT the SERIAL PK.

> **JOIN guidance (WF3 2026-05-08):** queries that consume `permits` MUST join via `n.id = p.neighbourhood_id` because `permits.neighbourhood_id` is a FK to the SERIAL `neighbourhoods.id` per migration 109 step 4. Joining via `n.neighbourhood_id = p.neighbourhood_id` silently miss-matches every row (both columns are INTEGER; PG never errors). Truth-rooted reference shapes: `src/lib/leads/lead-detail-query.ts`, `src/lib/leads/lead-inspect-query.ts`, `src/app/api/permits/[id]/route.ts`. Repaired sites in commit `<pending>`: `get-lead-feed.ts`, `compute-cost-estimates.js`, `market-metrics/queries.ts`. Regression-locked by `src/tests/neighbourhoods-fk-join.infra.test.ts` (Layer 1) and `src/tests/db/neighbourhoods-fk-join.db.test.ts` (Layer 2 live-DB).
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
