# Spec 18 -- Permit Detail View

---

<requirements>

## 1. Goal & User Story
As a user, I want to see full details for any permit including its history timeline, trade matches, builder info, property data, and location on a map so I can evaluate the opportunity.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read |
| Authenticated | Read |
| Admin | Read |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** URL path `/permits/{permitNum}--{revisionNum}`. Pre-permit (CoA) URLs encode slashes as tildes: `COA-A0246~23EYK--00`. API decodes tildes back to slashes.
- **Core Logic:**
  - Single API call to `GET /api/permits/{id}` returns permit record, trade matches, change history, builder data, parcel data, neighbourhood profile, massing data, CoA applications, and inspection stages (see `src/app/api/permits/[id]/route.ts`).
  - Page renders 10+ sections: Header (address, status badge, lead score), Property Photo (Street View with dev-mode placeholder), Trade Matches (sorted by lead_score DESC with tier, confidence, phase status), Inspection Progress (dynamic stage timeline with Pass/Fail/Outstanding/Partial status icons, hidden when no data, "last scraped" footer — Spec 38), Builder/Owner (enriched contact info, Google rating, WSIB), Property Details (lot size, frontage, depth from parcel data with irregular-lot detection), Building Massing (footprint, stories, height, coverage from Spec 31), Neighbourhood Profile (Spec 27), Project Details (all permit fields plus scope tags as badges), Linked Permits (same base number), CoA link (hidden if no match), Description with scope tag badges, Timeline (application/issued/completed dates), and Change History (chronological, max 50 entries).
  - Description truncates at 200 characters with "Show more" toggle.
  - Sections with no data are hidden entirely (CoA, parcel, massing) or show graceful fallbacks ("Not specified", "Map unavailable", "Not yet enriched").
- **Outputs:** Full permit detail page with all sections; monolithic implementation in `src/app/permits/[id]/page.tsx`.
- **Edge Cases:**
  - 404: permit not found page with search link.
  - 400: invalid ID format (missing `--` separator).
  - Null lat/lng: map hidden, "Map location pending geocoding" shown.
  - No builder enrichment: show `builder_name` only, hide contact section.
  - Cost is 0 or null: display "Not specified" instead of "$0".

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`permits.logic.test.ts`): Field Mapping; Permit Hashing; Permit Diff
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/permits/[id]/page.tsx`
- `src/components/permits/BuildingMassing.tsx`
- `src/components/permits/NeighbourhoodProfile.tsx`
- `src/components/permits/PropertyPhoto.tsx`
- `src/tests/permits.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/app/api/permits/[id]/route.ts`**: Governed by Spec 06. API is consumed, not modified.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/builders/`**: Governed by Spec 11. Builder data is consumed, not modified.

### Cross-Spec Dependencies
- Relies on **Spec 06 (Data API)**: Consumes `GET /api/permits/{id}` endpoint.
- Relies on **Spec 11 (Builder Enrichment)**: Displays builder contact info.
- Relies on **Spec 27 (Neighbourhood Profiles)**: Displays neighbourhood context.
- Relies on **Spec 31 (Building Massing)**: Displays building footprint data.

</constraints>
