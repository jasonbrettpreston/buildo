# Feature: Neighbourhood Profiles

## 1. User Story
"As a tradesperson viewing a permit, I want to see Census-based neighbourhood context so I can assess market conditions — e.g. 'This permit is in a high-income, owner-occupied neighbourhood built in the 1970s.'"

## 2. Technical Logic

### Overview
Adds Census 2021 neighbourhood data to the permit detail page. Two Toronto Open Data sources provide neighbourhood boundaries (GeoJSON polygons for 158 neighbourhoods) and demographic profiles (income, housing, education, etc.). Permits are matched to neighbourhoods via point-in-polygon using their existing lat/lng coordinates.

### Data Sources
1. **Neighbourhood Boundaries** — GeoJSON with 158 polygons, fields: `AREA_S_CD` (neighbourhood ID), `AREA_NAME`
2. **Neighbourhood Profiles** — Transposed CSV (rows = characteristics, columns = neighbourhoods). Column headers like `"Agincourt North (129)"`

### Matching Strategy
- Direct FK: `permits.neighbourhood_id` → `neighbourhoods.id` (1:1, unlike parcels M:N)
- Point-in-polygon via `@turf/boolean-point-in-polygon` on geocoded permits
- 158 polygons tested per permit; first match wins

### Summary Sentence
Generated from Census metrics: `"High-income, owner-occupied, built 1961-1980"`
- Income: high (≥$100K avg household), middle (≥$60K), lower (<$60K)
- Tenure: owner-occupied (≥60%), renter-majority (≤40%), mixed-tenure
- Era: dominant construction period from Census data

## 3. Associated Files

| File | Purpose |
|------|---------|
| `migrations/013_neighbourhoods.sql` | Neighbourhoods table |
| `migrations/014_permit_neighbourhood.sql` | FK column on permits |
| `src/lib/neighbourhoods/types.ts` | TypeScript interfaces |
| `src/lib/neighbourhoods/summary.ts` | Summary generation + formatters |
| `scripts/load-neighbourhoods.js` | Load boundaries + Census profiles |
| `scripts/link-neighbourhoods.js` | Point-in-polygon matching |
| `src/app/api/permits/[id]/route.ts` | Add neighbourhood to API response |
| `src/components/permits/NeighbourhoodProfile.tsx` | UI component |
| `src/app/permits/[id]/page.tsx` | Integrate component |

## 4. Constraints
- Census data is static (2021); table has `census_year` column for future updates
- Neighbourhood boundaries cover urban Toronto; some permits may fall outside
- Point-in-polygon is batch-processed offline, not real-time
- Component renders `null` if no neighbourhood linked (graceful degradation)

## 5. Data Schema

### neighbourhoods table
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| neighbourhood_id | INTEGER UNIQUE | Toronto's numbering (1-174) |
| name | VARCHAR(100) | |
| geometry | JSONB | GeoJSON polygon |
| avg_household_income | INTEGER | Census 2021 |
| median_household_income | INTEGER | Census 2021 |
| avg_individual_income | INTEGER | Census 2021 |
| low_income_pct | DECIMAL(5,2) | LIM-AT % |
| tenure_owner_pct | DECIMAL(5,2) | |
| tenure_renter_pct | DECIMAL(5,2) | |
| period_of_construction | VARCHAR(50) | Dominant era |
| couples_pct | DECIMAL(5,2) | |
| lone_parent_pct | DECIMAL(5,2) | |
| married_pct | DECIMAL(5,2) | |
| university_degree_pct | DECIMAL(5,2) | |
| immigrant_pct | DECIMAL(5,2) | |
| visible_minority_pct | DECIMAL(5,2) | |
| english_knowledge_pct | DECIMAL(5,2) | |
| top_mother_tongue | VARCHAR(50) | |
| census_year | INTEGER DEFAULT 2021 | |
| created_at | TIMESTAMP | |

### permits table addition
| Column | Type | Notes |
|--------|------|-------|
| neighbourhood_id | INTEGER | FK to neighbourhoods.id |

## 6. Integrations
- Toronto Open Data: Neighbourhood Boundaries, Neighbourhood Profiles
- `@turf/boolean-point-in-polygon` + `@turf/helpers` for spatial matching
- Permit detail API (`GET /api/permits/[id]`)

## 7. Triad Tests
- **Logic** (`neighbourhood.logic.test.ts`): classifyIncome, classifyTenure, generateSummary, formatIncome, formatPct, formatPeriod
- **UI** (`ui.test.tsx`): NeighbourhoodProfile display formatting, summary validation
- **Infra** (`api.infra.test.ts`): neighbourhood response shape, field validation
