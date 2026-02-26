# Feature: Permit Detail View

## 1. User Story
"As a user, I want to see full details for any permit including its history timeline, trade matches, builder info, and location on a map."

## 2. Technical Logic

### Overview
The permit detail page displays the complete record for a single building permit, organized into logical sections. It fetches data from the existing `GET /api/permits/{id}` endpoint (already implemented), which returns the permit record, trade matches, change history, and builder data in a single response.

### URL Structure
`/permits/{permitNum}--{revisionNum}` (e.g. `/permits/21%20234567--01`)

The composite ID uses double-dash (`--`) as separator, matching the existing API convention in `src/app/api/permits/[id]/route.ts`.

### Page Sections

**Section 1: Header**
* Permit number and revision
* Full address: `street_num street_name street_type street_direction, city postal`
* Status badge (color-coded, same as dashboard)
* Lead score badge (if user has matching trades)
* Save/track actions (same as dashboard PermitActions)

**Section 2: Location**
* Google Map embed with pin at permit's lat/lng coordinates.
* If lat/lng is null (not yet geocoded), show address text with "Map unavailable" placeholder.
* Ward number and council district.
* Link to Google Maps for directions.

**Section 2a: Property Visuals** (Street View)
*   **Goal:** Visual confirmation of building type (e.g., "Is this a teardown?").
*   **Source:** Google Street View Static API.
*   **Component:** `PropertyPhoto.tsx` — `'use client'` component.
*   **Env var:** `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (client-side).
*   **Implementation:**
    *   Dynamic image URL: `https://maps.googleapis.com/maps/api/streetview?size=600x400&location={lat},{lng}&fov=90&key={API_KEY}`.
    *   Displayed as a full-width card between the header and Trade Classification section.
    *   **Developer Mode:** When `NODE_ENV === 'development'`, renders a gray placeholder with camera icon and "Street View (Dev Mode)" text. No Google API calls are made, preserving the free 10,000 requests/month quota for production use.
    *   **Production Mode:** Renders `<img>` with the Street View Static API URL. Includes `onerror` fallback for API failures (e.g., ZERO_RESULTS).
    *   **Null coordinates:** Shows "Photo unavailable — not yet geocoded" with address text.
    *   **Cost Control:** Dev mode placeholder eliminates API usage during development.

**Section 3: Property Details** (from parcel data, residential permits only)
| Field | Source | Display |
|-------|--------|---------|
| Lot Size | `parcels.lot_size_sqft` | Formatted number + "sq ft" |
| Frontage | `parcels.frontage_ft` | Number + "ft". Shows "(est.)" suffix for irregular lots. |
| Depth | `parcels.depth_ft` | Number + "ft". Shows "(est.)" suffix for irregular lots. |
| Lot Size (metric) | `parcels.lot_size_sqm` | Formatted number + "sq m" |
| Parcel Type | `parcels.feature_type` | Text (COMMON / CONDO). Amber "Irregular Lot" badge shown when `parcels.is_irregular` is true. |

**Irregular Lot Detection:** Parcels with a rectangularity ratio (Shoelace polygon area / MBR area) below 0.95 are flagged as irregular (L-shaped, pie-shaped, curved lots). For these lots, frontage and depth are area-corrected estimates, hence the "(est.)" suffix.

Section is hidden entirely if no parcel is linked to the permit.

**Section 3a: Building Massing** (from building footprint data)
| Field | Source | Display |
|-------|--------|---------|
| Footprint Area | `building_footprints.footprint_area_sqft` | Formatted number + "sq ft" |
| Est. Stories | `building_footprints.estimated_stories` | Number (derived from MAX_HEIGHT / 3.0m) |
| Est. Height | `building_footprints.max_height_m` | Meters + feet (e.g. "9.5 m (31.2 ft)") |
| Building Coverage | Computed: `footprint_area / lot_size * 100` | Percentage |
| Accessory Structures | `parcel_buildings` where `is_primary = false` | List with type badge (Garage/Shed/Accessory) + area |

Data comes from Toronto 3D Massing dataset (Spec 31). One parcel may have multiple building polygons — the largest is classified as primary, smaller ones as accessory structures (garage, shed, or other based on area thresholds).

Section shows "Building footprint data not available for this property." when no massing data is linked. Source attribution: "City of Toronto 3D Massing, 2025".

**Section 4: Project Details**
| Field | Source Column | Display |
|-------|-------------|---------|
| Permit Type | `permit_type` | Badge |
| Structure Type | `structure_type` | Text |
| Work Type | `work` | Text |
| Category | `category` | Text |
| Building Type | `building_type` | Text |
| Current Use | `current_use` | Text |
| Proposed Use | `proposed_use` | Text |
| Storeys | `storeys` | Number |
| Est. Construction Cost | `est_const_cost` | Formatted currency |
| Housing Units | `housing_units` | Number |
| Dwelling Units Created | `dwelling_units_created` | Number |
| Dwelling Units Lost | `dwelling_units_lost` | Number |
| Description | `description` | Full text (collapsible if > 200 chars) |

**Section 4: Timeline**
| Field | Source Column | Display |
|-------|-------------|---------|
| Application Date | `application_date` | Formatted date |
| Issued Date | `issued_date` | Formatted date |
| Completed Date | `completed_date` | Formatted date or "In Progress" |
| First Seen | `first_seen_at` | Formatted datetime |
| Last Updated | `last_seen_at` | Formatted datetime |
| Current Phase | Calculated via `determinePhase()` | Phase badge |

**Section 5: Builder / Owner**
* Builder name from `builder_name` field.
* If builder record found in `builders` table (via enrichment):
  * Phone, email, website (clickable links).
  * Google rating with star display and review count.
  * OBR business number.
  * WSIB status.
  * Total permits filed by this builder (link to filtered search).
* Owner name from `owner` field.
* If no enrichment data: show builder name only with "Not yet enriched" note.

**Section 6: Trade Matches**
List of matched trades from `permit_trades`, sorted by `lead_score` DESC:

Each trade match card shows:
* Trade name with icon and color (from `trades` table).
* Classification tier (1, 2, or 3).
* Confidence percentage.
* Whether trade is active in current phase (green check or gray X).
* Lead score for this trade match.

**Section 7: Change History Timeline**
Chronological timeline of changes detected by the change detection system (Spec 03):
* Each entry shows: date, field name, old value, new value.
* Most recent changes at the top.
* Maximum 50 entries displayed (API limit already enforced).
* Empty state: "No changes detected since first seen on {date}."

**Section 8: CoA Application Link**
If a matching Committee of Adjustment application exists (from `coa_applications` table, linked by address or permit number):
* Application number and status.
* Hearing date.
* Variance description.
* Link to City of Toronto CoA portal.
* If no CoA match: section is hidden entirely.

### Actions
* **Save Lead:** Save to `/users/{uid}/savedPermits/{permitId}` (same as dashboard).
* **Share:** Copy shareable URL to clipboard. URL contains full permit ID.
* **Export:** Download permit details as PDF (future feature placeholder).
* **View on Map:** Navigate to `/map?permit={permitId}` to see this permit in map context.
* **Search Builder:** Navigate to `/search?builder_name={builder_name}` to find all permits by this builder.

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/permits/[id]/page.tsx` | Planned | Permit detail page |
| `src/app/permits/[id]/loading.tsx` | Planned | Loading skeleton for permit detail |
| `src/components/permits/PermitDetail.tsx` | Planned | Main detail container component |
| `src/components/permits/PermitHeader.tsx` | Planned | Header with permit number, address, status |
| `src/components/permits/PropertyPhoto.tsx` | Exists | Street View photo with dev mode placeholder |
| `src/components/permits/PermitLocation.tsx` | Planned | Map embed and location details |
| `src/components/permits/PermitProject.tsx` | Planned | Project details section |
| `src/components/permits/PermitTimeline.tsx` | Planned | Date timeline section |
| `src/components/permits/BuilderCard.tsx` | Planned | Builder/owner contact card |
| `src/components/permits/TradeMatchCard.tsx` | Planned | Individual trade match display |
| `src/components/permits/TradeMatchList.tsx` | Planned | List of trade match cards |
| `src/components/permits/HistoryTimeline.tsx` | Planned | Change history timeline component |
| `src/components/permits/CoaLink.tsx` | Planned | CoA application link card |
| `src/components/permits/PermitActions.tsx` | Planned | Action buttons (save, share, export) |
| `src/app/api/permits/[id]/route.ts` | Exists | Permit detail API (returns permit, trades, history, builder) |
| `src/lib/classification/phases.ts` | Exists | `determinePhase()` for phase badge |
| `src/tests/permit-detail.logic.test.ts` | Planned | Permit detail logic unit tests |
| `src/tests/permit-detail.ui.test.tsx` | Planned | Permit detail component tests |
| `src/tests/permit-detail.infra.test.ts` | Planned | Permit detail integration tests |

## 4. Constraints & Edge Cases

### Constraints
* API returns all data in a single request (permit + trades + history + builder); no separate fetches needed.
* Google Maps embed requires API key and incurs costs per map load ($7 per 1,000 loads for Static Maps, $0 for embeds).
* Change history capped at 50 most recent entries per permit.
* CoA application matching depends on Spec 12 implementation. Until then, Section 8 is hidden.

### Edge Cases
* **Permit not found (404):** Show "Permit not found" page with search link.
* **Invalid ID format (missing double-dash):** API returns 400; show error message.
* **No lat/lng (not geocoded):** Hide map, show address text with "Map location pending geocoding" message.
* **No builder found in enrichment table:** Show `builder_name` text only; hide contact info section.
* **All trade matches have 0 lead score:** Still display trade matches but with "Cool" score badges.
* **Null fields:** Many fields can be null/empty. Each section handles gracefully: show "N/A" or "Not specified" for missing values.
* **Very long description:** Truncate to 200 characters with "Show more" toggle.
* **No change history:** Show "No changes detected" with first_seen_at date.
* **No CoA application:** Hide Section 8 entirely (do not show empty section).
* **Permit with 10+ trade matches:** Scroll within trade match section; do not let it dominate the page.
* **Cost is 0 or null:** Display "Not specified" instead of "$0".

## 5. Data Schema

### API Response: `GET /api/permits/{permitNum}--{revisionNum}` (existing)
```json
{
  "permit": {
    "permit_num": "21 234567",
    "revision_num": "01",
    "permit_type": "Building Permit",
    "structure_type": "New Building",
    "work": "New Construction",
    "street_num": "100",
    "street_name": "QUEEN",
    "street_type": "ST",
    "street_direction": "W",
    "city": "TORONTO",
    "postal": "M5V 2A1",
    "geo_id": "12345678",
    "building_type": "Commercial",
    "category": "Non Residential",
    "application_date": "2024-01-15",
    "issued_date": "2024-03-01",
    "completed_date": null,
    "status": "Issued",
    "description": "Construct a 12 storey mixed-use building...",
    "est_const_cost": 25000000,
    "builder_name": "ACME CONSTRUCTION LTD",
    "owner": "100 QUEEN WEST INC",
    "dwelling_units_created": 150,
    "dwelling_units_lost": 0,
    "ward": "10",
    "council_district": "Toronto Centre",
    "current_use": "Parking Lot",
    "proposed_use": "Mixed Use",
    "housing_units": 150,
    "storeys": 12,
    "latitude": 43.6519,
    "longitude": -79.3911,
    "data_hash": "abc123...",
    "first_seen_at": "2024-02-01T00:00:00Z",
    "last_seen_at": "2024-06-15T00:00:00Z"
  },
  "trades": [
    {
      "trade_id": 3,
      "trade_slug": "concrete",
      "trade_name": "Concrete",
      "icon": "Square",
      "color": "#9E9E9E",
      "tier": 1,
      "confidence": 0.95,
      "is_active": true,
      "phase": "early_construction",
      "lead_score": 85
    }
  ],
  "history": [
    {
      "field_name": "status",
      "old_value": "Application",
      "new_value": "Issued",
      "changed_at": "2024-03-01T12:00:00Z"
    }
  ],
  "builder": {
    "name": "ACME CONSTRUCTION LTD",
    "phone": "416-555-0123",
    "email": "info@acmeconstruction.ca",
    "website": "https://acmeconstruction.ca",
    "google_rating": 4.2,
    "google_review_count": 87,
    "permit_count": 34
  }
}
```

### PostgreSQL tables read (via existing API)
* `permits` - Core permit record
* `permit_trades` + `trades` - Trade match data
* `permit_history` - Change history
* `builders` - Builder enrichment data
* `permit_parcels` + `parcels` - Lot size, frontage, depth data
* `coa_applications` - Committee of Adjustment data (Spec 12, future)

## 6. Integrations

### Internal
* **Permit Data API (Spec 06):** `GET /api/permits/{id}` is already implemented and returns all needed data.
* **Trade Classification (Spec 08):** Trade matches displayed in Section 6.
* **Construction Phases (Spec 09):** `determinePhase()` calculates current phase for phase badge.
* **Lead Scoring (Spec 10):** Lead scores displayed on trade match cards.
* **Builder Enrichment (Spec 11):** Builder contact data displayed in Section 5.
* **CoA Integration (Spec 12):** CoA application data displayed in Section 8 (when available).
* **Geocoding (Spec 05):** Lat/lng used for map pin in Section 2.
* **Change Detection (Spec 03):** Change history entries displayed in Section 7.
* **Auth (Spec 13):** Save lead action requires authenticated user.
* **Dashboard (Specs 15/16/17):** Permit cards on dashboards link to this detail page.
* **Search & Filter (Spec 19):** Search results link to this detail page.
* **Map View (Spec 20):** Map marker popups link to this detail page.

### External
* **Google Maps Embed API:** Map display in Section 2 (free embed, no cost per load).
* **Cloud Firestore:** Save lead action writes to `/users/{uid}/savedPermits/`.
* **PostgreSQL (via API):** All permit data read from PostgreSQL.
* **City of Toronto CoA Portal:** External link in Section 8 (future).

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`permit-detail.logic.test.ts`)
* [ ] **Rule 1:** Field grouping: all 30+ permit fields are assigned to the correct section (Location, Project, Timeline, Builder).
* [ ] **Rule 2:** History sorting: change history entries sorted by `changed_at` DESC (most recent first).
* [ ] **Rule 3:** CoA link display logic: Section 8 renders when CoA data exists, hidden when null.
* [ ] **Rule 4:** Phase calculation: `determinePhase()` returns correct phase based on permit status and issued_date.
* [ ] **Rule 5:** Address formatting: `street_num + street_name + street_type + street_direction` concatenated correctly, handling null street_direction.
* [ ] **Rule 6:** Null field handling: null `est_const_cost` displays "Not specified"; null `completed_date` displays "In Progress".

### B. UI Layer (`permit-detail.ui.test.tsx`)
* [ ] **Rule 1:** All 8 sections render when data is complete (header, location, project, timeline, builder, trades, history, CoA).
* [ ] **Rule 2:** Timeline layout renders change history entries with date, field, old value, new value.
* [ ] **Rule 3:** Map pin renders at correct lat/lng; "Map unavailable" shown when coordinates are null.
* [ ] **Rule 4:** Empty states render for missing data: no builder enrichment, no history, no CoA.
* [ ] **Rule 5:** Trade match cards render with icon, name, tier, confidence, phase status, and lead score.
* [ ] **Rule 6:** Long description truncated with "Show more" toggle.

### C. Infra Layer (`permit-detail.infra.test.ts`)
* [ ] **Rule 1:** API call for permit detail returns permit, trades, history, and builder in single response.
* [ ] **Rule 2:** 404 response handled: "Permit not found" page rendered for non-existent permit ID.
* [ ] **Rule 3:** 400 response handled: error message shown for invalid ID format.
* [ ] **Rule 4:** Google Maps embed loads with correct coordinates.
* [ ] **Rule 5:** Save lead action writes to Firestore and updates UI to reflect saved state.
