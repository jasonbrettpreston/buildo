# Lead Feed Specifications Evaluation (Specs 70-75)

**Date**: April 2026
**Target Specs**: `70_lead_feed.md`, `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`, `74_lead_feed_design.md`, `75_lead_feed_implementation_guide.md`

This document evaluates the "Lead Feed" feature specs against an 8-point technical and product rubric to ensure engineering readiness, while highlighting systemic gaps that should be addressed before development begins.

---

## 1. Mobile-First Approach
**Rating: Excellent**
- **Strengths**: The design (`74`) explicitly targets a 375px viewport with edge-to-edge cards to maximize limited screen real estate. The interactions (pull-to-refresh, tap-to-expand) are native-feeling. The implementation guide (`75`) utilizes `vaul` for bottom-sheet filters, which provides a best-in-class iOS/Android native drawer feel without complex custom touch-math.
- **Potential Gap**: While touch targets are mandated to be `44px`, data density is very high. Truncating long permit descriptions or complex scopes on 320px devices (like older SEs) could break the layout.

## 2. Usability
**Rating: Strong**
- **Strengths**: The "Industrial Utilitarian" design direction is a phenomenal matching of UX to user context (tradespeople in bright outdoor light). Using high-contrast styling, monospace fonts for rapid number scanning, and progressive disclosure (collapsed → expanded cards) respects the user's short attention span.
- **Potential Gap (Offline Capabilities)**: Tradespeople frequently lose cell reception inside concrete foundations or basements. While `74` mentions showing cached results, the implementation in `75` configures TanStack Query with a `gcTime` of only 5 minutes (`5 * 60_000`). If a user opens the app in a basement 10 minutes after their last refresh, they will see an empty UI. 
  - *Recommendation*: Implement TanStack Query's `PersistQueryClient` using `IndexedDB` to ensure leads persist across completely cold disconnects.

## 3. Code Quality Snippets
**Rating: Very Strong**
- **Strengths**: The implementation guide (`75`) elegantly organizes code via Feature-Sliced Design. The state boundaries are cleanly defined: TanStack Query (Server State) vs. Zustand (Global Client State), with zero prop-drilling or messy Redux boilerplate. Zod is correctly used at the API boundary to sanitize inputs.
- **Potential Gap**: The API error handling in `route.ts` catches all errors and returns a generic `500` status. If the user loses GPS or sends invalid string coordinates, the Zod parser will throw, but the client won't know *why* it failed.
  - *Recommendation*: Wrap Zod validation errors to return a `400 Bad Request` with exact field error messages, reducing silent friction.

## 4. Integration
**Rating: Good**
- **Strengths**: Seamlessly weaves together pre-existing schemas (WSIB registry, inspections, parcels). The `71_lead_timing_engine` is particularly smart, leveraging historical inspection lags to provide dynamic "predictive" stages rather than just static ones.
- **Potential Gap**: Permit parent-child relationships. The timing engine assumes one linear track of inspections per permit. However, sites often have a Demolition permit followed by a New Building permit. 
  - *Recommendation*: If the app scores the timing based on an active Demolition permit without checking linked New Building permits on the same parcel, the trade recommendations might misfire. Ensure `entity_projects` or parcel linkages merge overlapping permits.

## 5. Scalability
**Rating: Moderate (Needs Review)**
- **Strengths**: Caching `cost_estimates` via a pipeline script (`scripts/compute-cost-estimates.js`) rather than doing heavy math during the API request is an excellent architectural decision (`72`).
- **Potential Gap (App-Level Scoring)**: Spec `70` mentions: *"Application-level scoring on top 50-100 candidates. Return top 20..."*. Fetching records into Node.js memory, scoring them via a JS loop, and then sorting them is dangerous if the pre-filter returns 1,000+ permits. 
  - *Recommendation*: The 4-pillar scoring formula (Proximity, Timing, Value, Opportunity) should be executed entirely inside the PostgreSQL database using SQL window functions, ensuring the Node server never OOMs (Out of Memory) under heavy load.

## 6. Security
**Rating: Good**
- **Strengths**: Clear role-based access limits protecting contact information logic (`70`, `73`). Using HTTP-Only methodologies implied by the broader context.
- **Potential Gap (SSRF Vulnerability)**: Spec `73` states: *"Attempt OG image from builder's website URL: fetch `<meta property="og:image">`"*. 
  - *Warning*: If the Node.js API server fetches arbirtary builder URLs dynamically upon user request, malicious users could construct fake entity websites that force the server to ping internal network IPs (SSRF). 
  - *Recommendation*: Moving OG image scraping entirely to the offline backend pipeline (`scripts/enrich-wsib.js`), safely sandboxed, and storing the absolute CDN URL in the database.

## 7. Database Integration
**Rating: Moderate**
- **Strengths**: Re-using `entities` and `wsib_registry` intelligently allows for rich relational queries without redundant data fetching.
- **Potential Gap (Geospatial Math)**: Spec `73` utilizes raw Haversine SQL math: `MIN(haversine(lat, lng, p.latitude, p.longitude))`. Running trigonometry functions across millions of rows on the fly will bottleneck the database.
  - *Recommendation*: Transition to **PostGIS** and use native geospatial indexing (`GIST` indexing with the `<->` KNN geographic distance operator). This guarantees sub-millisecond proximity queries regardless of database size.

## 8. Approach
**Rating: Outstanding**
- **Strengths**: The separation of domain concerns into discrete specs (Timing `71`, Cost `72`, Builders `73`) culminating in a unified design (`74`) and code execution plan (`75`) is an exemplary product management strategy. It breaks a massive epic down into fully digestible, hyper-focused engineering tasks. 
- **Summary**: The feature is mostly ready for immediate implementation once the SSRF protection, PostGIS query optimization, and offline caching gaps are rectified.
