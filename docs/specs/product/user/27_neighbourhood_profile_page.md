# Spec 27 -- Neighbourhood Profiles

## 1. Goal & User Story
As a tradesperson viewing a permit, I want to see Census-based neighbourhood context (income level, tenure, construction era) so I can assess local market conditions at a glance.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read |
| Authenticated | Read |
| Admin | Read/Write |

## 3. Behavioral Contract
- **Inputs:** Permit's geocoded lat/lng coordinates; 158 Toronto neighbourhood boundary polygons (GeoJSON); Census 2021 demographic profiles (transposed CSV)
- **Core Logic:**
  - Batch point-in-polygon matching via `@turf/boolean-point-in-polygon` assigns each geocoded permit to a neighbourhood (first match wins); stored as `permits.neighbourhood_id` FK to `neighbourhoods.id`
  - Neighbourhood table stores boundary geometry (JSONB) and Census metrics: income (avg/median household, individual), tenure (owner/renter pct), construction era, education, immigration, language. See types in `src/lib/neighbourhoods/types.ts`.
  - Summary sentence generated from Census metrics: income tier (high >=100K, middle >=60K, lower <60K), tenure classification (owner-occupied >=60%, renter-majority <=40%, mixed), dominant construction period. See `src/lib/neighbourhoods/summary.ts`.
  - Permit detail API joins neighbourhood data into response; UI component renders summary or `null` if no neighbourhood linked (graceful degradation)
- **Outputs:** Neighbourhood profile card on permit detail page showing summary sentence and key Census metrics; neighbourhood data included in permit API response
- **Edge Cases:**
  - Permits outside urban Toronto boundaries may have no neighbourhood match; component renders nothing
  - Census data is static (2021); `census_year` column supports future updates
  - Point-in-polygon runs as batch offline process, not real-time
  - Boundary data covers 158 neighbourhoods with IDs 1-174 (gaps exist in Toronto's numbering)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`neighbourhood.logic.test.ts`): classifyIncome; classifyTenure; generateSummary; formatIncome; formatPct; formatPeriod; createMockNeighbourhood
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/neighbourhoods/summary.ts`
- `src/lib/neighbourhoods/types.ts`
- `src/components/permits/NeighbourhoodProfile.tsx`
- `scripts/load-neighbourhoods.js`
- `scripts/link-neighbourhoods.js`
- `migrations/013_neighbourhoods.sql`
- `migrations/014_permit_neighbourhood.sql`
- `src/tests/neighbourhood.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/permits/geocode.ts`**: Governed by Spec 05. Geocoding is consumed, not modified.
- **`src/lib/parcels/`**: Governed by Spec 29. Do not modify parcel matching.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `neighbourhoods` table and `permits.neighbourhood_id` FK.
- Relies on **Spec 05 (Geocoding)**: Point-in-polygon matching uses geocoded permit coordinates.
- Consumed by **Spec 18 (Permit Detail)**: Permit detail page displays neighbourhood context.
- Consumed by **Spec 34 (Market Metrics)**: Neighbourhood wealth tiers use income data from this module.
