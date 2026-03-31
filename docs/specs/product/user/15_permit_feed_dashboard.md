# Spec 15 -- Tradesperson Dashboard

> **Status: PARTIAL** — Dashboard page and PermitCard/PermitFeed components exist. Trade-specific filtering (showing only permits matching user's selected trades) is NOT yet implemented. `src/lib/dashboard/merge-feeds.ts` referenced in spec does not exist. Dashboard currently shows global/admin-style permit feed.

## 1. Goal & User Story
A tradesperson (e.g., plumber) sees a dashboard of building permits matching their selected trades, sorted by lead score, so they can find and track work opportunities.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own data: view feed, save leads, update lead status) |
| Admin | None |

## 3. Behavioral Contract
- **Inputs:** User's selected trades from Firestore `/users/{uid}/preferences/trades`; permit data via `GET /api/permits?trade_slug={slug}&sort_by=lead_score&sort_order=desc`; user filter selections (ward, cost range, status, date range, phase)
- **Core Logic:**
  - Feed: fetches permits for each of the user's trade slugs, merges client-side, deduplicates by `permit_num--revision_num`, sorts by highest `lead_score`. Infinite scroll with 20 per page, 300ms debounce on filter changes, cancel in-flight requests on new filter. See `src/lib/dashboard/merge-feeds.ts` (planned)
  - Permit card displays: address, status badge, formatted cost, lead score badge (80-100 green/Hot, 60-79 orange/Warm, 40-59 yellow/Moderate, 0-39 gray/Cool), phase badge, days since issued, ward, trade match with confidence
  - Save & track pipeline: saved -> contacted -> quoted -> won|lost; any state -> archived. "Won" and "lost" are terminal (no reversal). Saved permits stored per-user in Firestore at `/users/{uid}/savedPermits/{permitId}`
  - Stats bar: total matching permits, new this week, saved leads count, conversion rate
  - Filters: ward dropdown (1-25), cost range slider, status multi-select, date range picker, phase multi-select
- **Outputs:** Filtered, scored permit feed with save/track actions; per-user saved permit collection in Firestore with status pipeline
- **Edge Cases:**
  - No matching permits: empty state with "No permits match your trades yet" message and link to edit trade preferences
  - User has no trades selected: defensive redirect to onboarding
  - Permit matches multiple trades: shown once with highest lead_score, all matching trades listed on card
  - Network error on feed load: error state with retry button, preserve cached data
  - Max 500 saved permits per user (Firestore subcollection consideration)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`dashboard.ui.test.tsx`): Dashboard StatCard Logic; Dashboard Navigation Links; Dashboard Filter State; Dashboard Stats Row; Dashboard Account Type Variants
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/dashboard/page.tsx`
- `src/components/permits/PermitCard.tsx`
- `src/components/permits/PermitFeed.tsx`
- `src/components/permits/SavedPermitsPipeline.tsx`
- `src/components/ui/ScoreBadge.tsx`
- `src/components/ui/Badge.tsx`
- `src/tests/dashboard.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/app/api/permits/`**: Governed by Spec 06. API is consumed, not modified.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.

### Cross-Spec Dependencies
- Relies on **Spec 06 (Data API)**: Consumes `GET /api/permits` endpoint.
- Relies on **Spec 10 (Lead Scoring)**: Sorts permits by lead score.
- Relies on **Spec 13 (Auth)**: Reads user trade preferences for filtering.
- Extended by **Spec 16 (Company Dashboard)** and **Spec 17 (Supplier Dashboard)**.
