# Feature: Supplier Dashboard

## 1. User Story
"As a material supplier, I want to see which projects need my materials and connect with the builders who are buying."

## 2. Technical Logic

### Overview
The supplier dashboard translates building permit data into material demand signals. Instead of showing trade-based leads like the tradesperson dashboard, it shows material demand grouped by the supplier's product categories, with builder contact information to facilitate outreach.

### Material-to-Trade Mapping
Suppliers select trades during onboarding (Step 2) that correspond to the materials they supply. The system maps these trades to material categories:

| Trade Slug | Material Categories |
|-----------|-------------------|
| `excavation` | Heavy equipment rental, soil removal, shoring materials |
| `concrete` | Ready-mix concrete, rebar, formwork, cement, aggregates |
| `structural-steel` | Steel beams, columns, connectors, welding supplies |
| `framing` | Lumber, engineered wood, nails, fasteners, trusses |
| `masonry` | Brick, block, morite, stone, masonry cement |
| `roofing` | Shingles, membranes, flashing, gutters, underlayment |
| `plumbing` | Pipe, fittings, fixtures, water heaters, valves |
| `hvac` | Ductwork, furnaces, AC units, thermostats, refrigerant |
| `electrical` | Wire, conduit, panels, breakers, switches, lighting |
| `fire-protection` | Sprinkler systems, fire alarms, extinguishers, rated materials |
| `insulation` | Batt insulation, spray foam, rigid board, vapor barrier |
| `drywall` | Gypsum board, joint compound, tape, metal studs, corner bead |
| `painting` | Paint, primer, brushes, rollers, caulking, sealant |
| `flooring` | Hardwood, tile, vinyl, carpet, underlayment, adhesive |
| `glazing` | Windows, doors, glass, frames, seals, hardware |
| `elevator` | Elevator components, hoistway materials, cab finishes |
| `demolition` | Dumpsters, disposal, hazmat containers |
| `landscaping` | Sod, plants, mulch, pavers, irrigation, fencing |
| `waterproofing` | Membranes, coatings, drainage board, sealants |
| `shoring` | Sheet piling, bracing, tie-backs, lagging |

### Material Demand Cards
Primary feed shows "demand cards" instead of individual permit cards:

Each demand card represents an aggregated view:
* **Material category name** (e.g. "Ready-Mix Concrete")
* **Active demand count:** Number of permits currently in the relevant construction phase for this material.
* **Volume indicator:** Estimated scale based on `est_const_cost` of matching permits (Low / Medium / High / Very High).
* **Geographic cluster:** Top 3 wards with highest demand for this material.
* **Trend:** Demand change vs. previous month (up/down/flat arrow with percentage).
* **Action:** "View Projects" expands to show individual permit list.

### Volume Estimation
Based on aggregate `est_const_cost` for permits matching the material's trade and currently in the relevant phase:

| Total est_const_cost | Volume Level |
|---------------------|-------------|
| < $1,000,000 | Low |
| $1,000,000 - $10,000,000 | Medium |
| $10,000,000 - $50,000,000 | High |
| > $50,000,000 | Very High |

### Builder Directory
A secondary view showing builders who are actively working on projects that need the supplier's materials.

* **Data source:** `builders` table enriched with contact data (Spec 11).
* **Builder card:** Name, phone, email, website, Google rating, number of active permits, total est_const_cost across their projects.
* **Sort options:** By active permit count, by total project value, by Google rating, alphabetical.
* **Filter:** By material category (show only builders working on projects needing specific materials).
* **Contact action:** Click-to-call (mobile), click-to-email, visit website.

### Geographic Demand Map
An embedded map showing clusters of material demand (shared component with Map View, Spec 20):
* Color-coded markers by material category.
* Cluster bubbles showing demand density.
* Ward boundaries overlaid.
* Click cluster to see list of projects in that area.

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/dashboard/supplier/page.tsx` | Planned | Supplier dashboard page |
| `src/app/dashboard/supplier/builders/page.tsx` | Planned | Builder directory page |
| `src/components/supplier/MaterialDemandCard.tsx` | Planned | Material demand aggregation card |
| `src/components/supplier/MaterialDemandFeed.tsx` | Planned | Feed of material demand cards |
| `src/components/supplier/BuilderCard.tsx` | Planned | Builder contact card |
| `src/components/supplier/BuilderDirectory.tsx` | Planned | Scrollable builder directory |
| `src/components/supplier/VolumeIndicator.tsx` | Planned | Volume level badge component |
| `src/components/supplier/DemandTrend.tsx` | Planned | Demand trend arrow + percentage |
| `src/components/supplier/GeoDemandMap.tsx` | Planned | Embedded demand map |
| `src/lib/supplier/material-mapping.ts` | Planned | Trade-to-material mapping data |
| `src/lib/supplier/demand-aggregation.ts` | Planned | Demand calculation and aggregation logic |
| `src/lib/supplier/volume-estimation.ts` | Planned | Volume level calculation from cost data |
| `src/app/api/suppliers/demand/route.ts` | Planned | GET material demand aggregation |
| `src/app/api/suppliers/builders/route.ts` | Planned | GET builders by material/trade |
| `src/tests/supplier.logic.test.ts` | Planned | Supplier logic unit tests |
| `src/tests/supplier.ui.test.tsx` | Planned | Supplier component tests |
| `src/tests/supplier.infra.test.ts` | Planned | Supplier integration tests |

## 4. Constraints & Edge Cases

### Constraints
* Builder enrichment data (phone, email, website) depends on Spec 11 completion. Until then, only `builder_name` and permit count are available.
* Material-to-trade mapping is a static lookup table; not ML-driven.
* Geographic clustering uses ward boundaries (available in data) rather than precise lat/lng clustering (which depends on geocoding completeness, Spec 05).
* Demand trend calculation requires at least 2 months of historical sync data.

### Edge Cases
* **No builder enrichment data yet:** Show builder name and permit count only; display "Contact info coming soon" placeholder for phone/email/website.
* **Supplier selects trades with no active permits:** Show demand card with "0 active projects" and volume "None".
* **Builder has permits across multiple material categories:** Builder appears in multiple filtered views; aggregate stats reflect all their permits.
* **Permit cost is null:** Exclude from volume calculation; include in demand count.
* **Very new supplier (first month):** No trend data available; show "New" badge instead of trend arrow.
* **Ward boundary data unavailable:** Fall back to postal code FSA grouping.
* **Builder name variations:** Normalized via `name_normalized` field in `builders` table (UPPER, trimmed, collapsed whitespace).
* **Seasonal demand patterns:** December-February typically lower; note this in trend context.

## 5. Data Schema

### API Response: `GET /api/suppliers/demand`
```json
{
  "data": [
    {
      "material_category":   "Ready-Mix Concrete",
      "trade_slug":          "concrete",
      "active_permit_count": 847,
      "total_est_cost":      125000000,
      "volume_level":        "Very High",
      "top_wards":           ["10", "13", "04"],
      "trend_pct":           12.5,
      "trend_direction":     "up",
      "phase_filter":        "early_construction"
    }
  ]
}
```

### API Response: `GET /api/suppliers/builders?trade_slug=concrete`
```json
{
  "data": [
    {
      "builder_name":        "ACME CONSTRUCTION LTD",
      "name_normalized":     "ACME CONSTRUCTION LTD",
      "phone":               "416-555-0123",
      "email":               "info@acmeconstruction.ca",
      "website":             "https://acmeconstruction.ca",
      "google_rating":       4.2,
      "google_review_count": 87,
      "active_permit_count": 12,
      "total_est_cost":      45000000,
      "wards":               ["10", "11", "13"]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 342 }
}
```

### Firestore: `/users/{uid}/preferences/trades` (read by supplier dashboard)
```
{
  selected_trade_slugs:  string[]   // Trades the supplier provides materials for
  updated_at:            timestamp
}
```

### PostgreSQL: Demand aggregation query (executed server-side)
```sql
SELECT
    t.slug as trade_slug,
    t.name as trade_name,
    COUNT(DISTINCT p.permit_num || '--' || p.revision_num) as active_permit_count,
    COALESCE(SUM(p.est_const_cost), 0) as total_est_cost,
    ARRAY_AGG(DISTINCT p.ward ORDER BY COUNT(*) DESC) as top_wards
FROM permits p
JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
JOIN trades t ON t.id = pt.trade_id
WHERE t.slug = ANY($1)
  AND p.status IN ('Issued', 'Under Inspection', 'Application')
GROUP BY t.slug, t.name
```

## 6. Integrations

### Internal
* **Tradesperson Dashboard (Spec 15):** Shares `PermitCard` and `PermitFeed` components for the "View Projects" expanded view.
* **Auth (Spec 13):** `account_type === "supplier"` routes to supplier dashboard.
* **Onboarding (Spec 14):** Supplier selects trades in Step 2 (with "materials you supply" context label).
* **Trade Classification (Spec 08):** `permit_trades` table provides trade matches used for demand aggregation.
* **Builder Enrichment (Spec 11):** `builders` and `builder_contacts` tables provide contact data for builder directory.
* **Construction Phases (Spec 09):** Phase determines which materials are currently in demand (e.g. concrete in `early_construction`).
* **Permit Detail (Spec 18):** Clicking a project in expanded demand card navigates to permit detail.
* **Map View (Spec 20):** Geographic demand map uses shared map component.
* **Geocoding (Spec 05):** Lat/lng data used for geographic demand clustering on map.

### External
* **Cloud Firestore:** User preferences read for trade selection.
* **PostgreSQL (via API):** Permit data, trade matches, builder data queried via API routes.
* **Google Maps JavaScript API:** Embedded demand map (shared with Spec 20).

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`supplier.logic.test.ts`)
* [ ] **Rule 1:** Material-to-trade mapping: each trade slug maps to correct material categories.
* [ ] **Rule 2:** Volume estimation: total est_const_cost thresholds produce correct volume levels (Low/Medium/High/Very High).
* [ ] **Rule 3:** Builder aggregation: builders are correctly grouped by their permit's matching trades, with accurate active_permit_count and total_est_cost.
* [ ] **Rule 4:** Demand trend calculation: current month vs. previous month produces correct percentage and direction.
* [ ] **Rule 5:** Phase filtering: demand cards only count permits in the construction phase relevant to the material.
* [ ] **Rule 6:** Top wards calculation: wards ranked by permit count descending, top 3 returned.

### B. UI Layer (`supplier.ui.test.tsx`)
* [ ] **Rule 1:** Material demand cards render category name, active count, volume badge, top wards, and trend.
* [ ] **Rule 2:** Builder directory list renders builder name, contact info, rating, and permit count.
* [ ] **Rule 3:** Geographic demand map renders with colored markers and ward boundaries.
* [ ] **Rule 4:** Volume indicator displays correct color and label for each level.
* [ ] **Rule 5:** "View Projects" expands demand card to show individual permit list.
* [ ] **Rule 6:** Builder contact actions (call, email, website) render as clickable links.

### C. Infra Layer (`supplier.infra.test.ts`)
* [ ] **Rule 1:** Demand API: `GET /api/suppliers/demand?trade_slugs=concrete,plumbing` returns aggregated demand data.
* [ ] **Rule 2:** Builder API: `GET /api/suppliers/builders?trade_slug=concrete` returns enriched builder records.
* [ ] **Rule 3:** Builder enrichment data access: builder records include phone, email, website when available.
* [ ] **Rule 4:** SQL aggregation query executes within 2 seconds for full dataset.
* [ ] **Rule 5:** Geographic clustering falls back to ward grouping when lat/lng data is missing.
