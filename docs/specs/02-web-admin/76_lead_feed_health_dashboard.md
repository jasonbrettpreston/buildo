# Spec 76 — Admin Lead-Feed Tooling (Test Feed + Flight Center + Detail Inspectors)

<requirements>
## 1. Goal & User Story

**Goal:** provide a suite of lightweight admin tools that mirror the mobile read-side flows so admins can test the Lead Feed algorithm, exercise the saved-board UX, and inspect both detail-endpoint shapes — all without a mobile simulator or dummy user accounts.

The suite has four distinct sub-tools (added 2026-05-06 by Cycle 3 amendment):

| Sub-tool | Section | Mirror of mobile screen | Endpoint(s) probed |
|---|---|---|---|
| **Test Feed Tool** | §3.2, §3.3 | `(app)/index.tsx` lead feed | `GET /api/admin/leads/test-feed` |
| **Flight Center Tool** | §3.4 | `(app)/flight-board.tsx` saved board | `GET /api/leads/flight-board`, `POST /api/leads/save` |
| **Lead Detail Inspector** | §3.5 | `(app)/[lead].tsx` (Spec 91 §4.3) | `GET /api/leads/detail/:id` |
| **Flight Job Detail Inspector** | §3.6 | `(app)/[flight-job].tsx` (Spec 77 §3.3) | `GET /api/leads/flight-board/detail/:id` |

**User Story:** as an admin, I need to be able to (a) run a feed query without a mobile device to verify the algorithm, (b) save permits to my own admin-scoped flight board so I can validate the save → flight-board flow end-to-end, and (c) directly inspect either of the two detail endpoints by pasting a `lead_id` so I can spot-check the `cost_estimates` join (LeadDetail), the `temporal_group` classification (FlightBoardDetail), or the cold-boot deep-link path that WF1-B unblocked.

**Why two distinct detail inspectors:** mobile uses `/api/leads/detail/:id` (Spec 91 `LeadDetail`) for `[lead].tsx` and `/api/leads/flight-board/detail/:id` (Spec 77 `FlightBoardDetail`) for `[flight-job].tsx`. The two endpoints return overlapping but non-identical shapes — `LeadDetail` carries cost/neighbourhood blocks; `FlightBoardDetail` carries `temporal_group` + `updated_at`. A permit can render correctly through one and fail through the other, so two endpoints = two failure surfaces = two separately-debuggable inspector tools.
</requirements>

---

<architecture>
## 2. Technical Architecture

### 2.1 Backend Endpoint

**API endpoint:** `GET /api/admin/leads/test-feed`

An admin-only endpoint that bypasses the `trade_slug must match user profile` check. It accepts the same query params as the mobile feed but authenticates via admin auth (session cookie or X-Admin-Key) instead of a standard user context.

Returns the standard `{ data, meta }` envelope, plus a `_debug` block with scoring breakdown:

```typescript
interface TestFeedResponse {
  data: LeadFeedItem[];
  error: null;
  meta: { next_cursor: LeadFeedCursor | null; count: number; radius_km: number };
  _debug: TestFeedDebug;
}

interface TestFeedDebug {
  query_duration_ms: number;
  permits_in_results: number;
  builders_in_results: number;
  score_distribution: { min: number; max: number; median: number; p25: number; p75: number } | null;
  pillar_averages: { proximity: number; timing: number; value: number; opportunity: number } | null;
}
```

### 2.2 Shared Utilities (`test-feed-utils.ts`)
To prevent duplicating PostGIS checks between the production feed and the admin feed, a shared utility module houses:
* `isPostgisAvailable(pool)`
* `computeTestFeedDebug(leads, durationMs)`
* `sanitizePgErrorMessage(error)`

### 2.3 Admin UI
**Admin Page:** `/admin/lead-feed`
Renders a single `<TestFeedTool />` client component.
* **Input Form:** lat/lng (number inputs), trade_slug (native select), radius_km (native range slider).
* **Action:** "Run Test Query" button triggers the API.
* **Results Panel:** Displays the `_debug` stats in a summary grid, followed by a mapped list of the returned permits (showing permit_num and relevance_score).

### 2.4 File Map

**Test Feed Tool (existing — §3.2, §3.3):**
| File | Action |
|------|--------|
| `src/app/api/admin/leads/test-feed/route.ts` | The admin API endpoint |
| `src/lib/admin/test-feed-utils.ts` | Shared logic for the debug block and PostGIS pre-flight |
| `src/components/admin/TestFeedTool.tsx` | The UI form and result renderer |
| `src/app/admin/lead-feed/page.tsx` | The page mounting the tool |

**Flight Center Tool (NEW — §3.4):**
| File | Action |
|------|--------|
| `src/app/admin/lead-feed/flight-center/page.tsx` | Page mounting the tool |
| `src/components/admin/FlightCenterTool.tsx` | Admin-scoped flight board UI (save/view/tap-card) |
| `src/lib/admin/admin-uid.ts` | Resolves the canonical admin uid sentinel (`'admin-test'`) — single source for the synthetic user_id used by admin-scoped tools |

**Detail Inspectors (NEW — §3.5, §3.6):**
| File | Action |
|------|--------|
| `src/app/admin/lead-feed/inspector/page.tsx` | Page mounting both inspectors as tabs (LeadDetail / FlightBoardDetail) |
| `src/components/admin/LeadDetailInspector.tsx` | Spec 91 §4.3 LeadDetail probe |
| `src/components/admin/FlightJobDetailInspector.tsx` | Spec 77 §3.3 FlightBoardDetail probe |

**Reused from mobile (read-only — no edits):**
- `mobile/src/lib/schemas.ts` — `LeadDetailSchema`, `FlightBoardDetailSchema`, `FlightBoardItemSchema` are reused by the inspectors for runtime validation. (Web admin imports the Zod schemas via the shared `_contracts.json` boundary or a wrapper module; final mechanism decided at implementation plan-lock.)

### 2.5 Database Impact

**NO** — all data already exists in:
- `data_quality_snapshots` (cost/timing columns from migration 080)
- `lead_views` (migration 069/070/076/079)
- `cost_estimates` (migration 071)
- `timing_calibration` (migration 073)
- `permit_trades`, `permits` (existing)

No new tables or columns needed. The health endpoint performs read-only aggregate queries.

### 2.6 Auth

Both new endpoints use admin auth (inherits from `/api/admin/**` route classification):
- Browser: `__session` cookie (Firebase session)
- Scripts/CI: `X-Admin-Key` header

The test-feed endpoint does NOT require a `user_profiles` entry — it constructs a synthetic `LeadFeedInput` directly from query params, bypassing `getCurrentUserContext()`.

</architecture>

---

<behavior>
## 3. Behavioral Contract

### 3.1 Lead Feed Health Endpoint

- **Inputs:** Admin auth (cookie or header). No query params.
- **Core Logic:**
  1. Query `data_quality_snapshots` for latest row (cost/timing columns)
  2. Run 4 lightweight aggregate queries against `permits`, `permit_trades`, `cost_estimates`, `lead_views`
  3. Compute `feed_ready_pct` = permits with ALL THREE of (geocoding + trade + cost) / active_permits
  4. Aggregate `lead_views` by day for 7-day engagement window
  5. Group `lead_views` by `trade_slug` for trade breakdown
- **Outputs:** `LeadFeedHealthResponse` JSON
- **Edge Cases:**
  - Zero lead_views → engagement section shows all zeros (not an error)
  - cost_estimates table empty → `cost_coverage.total = 0`, `feed_ready_pct` drops (cost pillar missing)
  - timing_calibration empty → `timing_types_calibrated = 0`, `timing_freshness_hours = null`

### 3.2 Test Feed Endpoint

- **Inputs:** Admin auth + query params: `lat`, `lng`, `trade_slug`, `radius_km` (default 10), `limit` (default 15)
- **Core Logic:**
  1. Validate params with Zod (same schema as `/api/leads/feed` minus the cursor)
  2. **Pre-flight:** verify PostGIS extension is installed via `isPostgisAvailable(pool)`. If missing (local dev without the extension), short-circuit to `503 DEV_ENV_MISSING_POSTGIS` with install instructions. Production Cloud SQL has PostGIS so this path is a cache hit in prod.
  3. Construct `LeadFeedInput` with a synthetic `user_id = 'admin-test'`
  4. Call `getLeadFeed(input, pool)` — same function the real feed uses
  5. Compute `_debug` block from results: score stats, pillar averages, coverage metrics
  6. Return full response with debug overlay
- **Outputs:** Feed results + debug scoring breakdown
- **Edge Cases:**
  - No permits in radius → `data: []`, `_debug.permits_in_radius: 0`
  - Invalid trade_slug → 400 with field-level error
  - Trade has no permits → empty results (valid, shows feed gap)
  - `is_saved` field on LeadFeedItem always `false` for admin-test user (the `lead_views.saved` DB column has no rows for synthetic user_id)
  - **PostGIS missing (dev only):** 503 with `code: 'DEV_ENV_MISSING_POSTGIS'` and a message describing OS-level install steps. The production Cloud SQL instance has PostGIS by default.
  - **Runtime query error:** 500 with sanitized dev-mode message (via `sanitizePgErrorMessage`), production returns the canned `"Feed query failed"`. Added WF3 2026-04-11 to close the last opaque-500 in the Lead Feed Health endpoints.

### 3.3 Dashboard UI

- **Inputs:** Admin navigates to `/admin/lead-feed`
- **Core Logic:**
  - Polls `/api/admin/leads/health` every 10 seconds (same pattern as DataQualityDashboard)
  - Test Feed form is on-demand (no polling)
  - Traffic light logic:
    - **GREEN** = `feed_ready_pct > 80` AND `timing_freshness_hours !== null` AND `timing_freshness_hours < 48`
    - **YELLOW** = `50 <= feed_ready_pct <= 80` OR `timing_freshness_hours === null` OR `timing_freshness_hours > 48`
    - **RED** = `feed_ready_pct < 50` OR `cost_coverage.total === 0`
  - `timing_freshness_hours === null` MUST produce YELLOW, never GREEN. Null indicates the `timing_calibration` cron has never run OR the table was truncated — both are failure states that must be surfaced, not hidden behind a green light. (External review 2026-04-10 Antigravity flagged this as "Missing-Cron Green Light" bug.)
- **Cost Coverage (Section 2)** shows TWO percentages:
  - **Permit coverage** (headline) = `permits_with_cost / active_permits` — fraction of active permits that have a cost estimate. Computed in the route handler from values already fetched by `getLeadFeedReadiness`, no extra DB round-trip.
  - **Cache coverage** (secondary) = `(cost_estimates.total - cost_estimates.null_cost) / cost_estimates.total` — cleanliness of the estimate cache itself.
  - Both metrics are displayed to expose divergence (e.g., 94% cache + 60% permits means the cache is clean but sparse, pointing to incomplete cost computation runs).
- **Outputs:** 4-section dashboard + interactive test feed tool
- **Edge Cases:**
  - API timeout → show stale data with "Last updated X ago" badge
  - Test feed timeout (>10s) → show loading spinner, warn if >30s
  - `active_permits === 0` (fresh DB) → `coverage_pct_vs_active_permits === 0` (no division by zero)

### 3.4 Flight Center Tool (NEW — Cycle 3 amendment 2026-05-06)

**Goal:** admin-side mirror of the mobile Flight Board UX (Spec 77 §3.2). Admins save permits to their own **admin-scoped flight board**, view it, and tap a card to open the Flight Job Detail Inspector (§3.6) inline — mirroring the mobile `[flight-job].tsx` navigation path 1:1.

**Architectural decision: admin-scoped, NOT impersonation.**
- Admin operates under a real `user_id` sentinel (canonical: `'admin-test'`, exposed via `src/lib/admin/admin-uid.ts`) with `is_admin = true` in `auth_users`.
- Admin's saves write `lead_views` rows where `user_id = 'admin-test'`. These rows do NOT count in `competition_count` for real users — the existing exclusion filter (`lv2.user_id != $9::text` at `src/features/leads/lib/get-lead-feed.ts:136`; `lv2.user_id != $4::text` at `src/lib/leads/lead-detail-query.ts:105`) naturally excludes the admin sentinel from any real user's view.
- No impersonation, no PIPEDA boundary crossing, no audit-log requirement beyond the standard `/api/admin/*` action logging.
- **Reuses existing mobile endpoints unmodified** (`GET /api/leads/flight-board`, `GET /api/leads/flight-board/detail/:id`) — admin's session cookie carries the admin uid; backend doesn't distinguish admin from user at the data layer.
- **Save endpoint** (`POST /api/leads/save`, `src/app/api/leads/save/route.ts`) was authored as part of WF2 Cycle 4 P5 (2026-05-06). The mobile app and Cycle 4 admin Flight Center both POST to this route to claim/un-claim permits. The endpoint uses `getCurrentUserContext` for auth, sources `trade_slug` from the user profile (NOT body), and translates the wire shape into a `recordLeadView` call internally. **Pre-existing bug closed:** the original spec language "reuses existing `POST /api/leads/save`" was wrong — that endpoint did not exist; mobile's claim/save/unsave callsites had been hitting a 404 since they were written. P5 closed the gap. **Wire contract:**

```
POST /api/leads/save
Body: { lead_id: string, lead_type: 'permit'|'builder', saved: boolean }

lead_id format (Spec 91 §4.3.1 canonical):
  permits  : `${permit_num}--${revision_num}`  (e.g., `24-101234-BLD--01`)
  builders : `builder-${entity_id}`            (e.g., `builder-12345`)

Action mapping: saved:true → action:'save'; saved:false → action:'unsave'.
The 'view' action stays exclusive to /api/leads/view (semantically distinct;
view consumes trial quota per Spec 95 §2.2.1, save/unsave do not).

Errors mirror /api/leads/view: 400 INVALID_JSON|VALIDATION_FAILED|INVALID_LEAD_ID;
401 UNAUTHORIZED; 415 INVALID_CONTENT_TYPE; 429 RATE_LIMITED (60/min per uid,
independent bucket from leads-view:); 500 INTERNAL_ERROR.

Response 200: { data: { competition_count: number }, error: null, meta: null }
```

**UI:** `/admin/lead-feed/flight-center` page renders an admin-scoped flight board:
- Three temporal sections (action_required / departing_soon / on_the_horizon) per Spec 77 §3.2 grouping.
- Each card shows the same hero/status/timing as mobile FlightCard, in the web admin layout.
- Tap a card → opens §3.6 Flight Job Detail Inspector in a drawer/modal (NOT a route navigation — keeps the admin's context).
- Save / un-save controls at the bottom of each card row mirror the mobile SaveButton optimistic flow.

**Inputs:** admin auth (cookie or `X-Admin-Key`). No query params at the page level.

**Edge cases:**
- Admin has no saved permits → empty state with "Use Test Feed Tool to find permits, then save them here."
- Admin saves a permit that's already saved → idempotent (existing `POST /api/leads/save` semantics — no spec change).
- Admin saves a permit that's later removed from `permits` table (rare; data quality issue) → `flight-board` join short-circuits the row; the orphan `lead_views` row is harmless. No special handling.

**Cross-link:** card-tap opens §3.6 (Flight Job Detail Inspector), NOT §3.5 (Lead Detail Inspector). Mirrors mobile: tapping a flight-board card uses `/api/leads/flight-board/detail/:id` (Spec 77 §3.3.1), not `/api/leads/detail/:id` (Spec 91 §4.3.1). The two endpoints return different shapes; the routing per endpoint is normative.

### 3.5 Lead Detail Inspector (Cycle 7 amendment 2026-05-08 — SUPERSEDES Cycle 3 thin-shape pass-through)

**Cycle 7 expansion (this amendment):** the inspector now consumes a NEW admin-only endpoint `GET /api/admin/leads/inspect/:id` returning the `LeadInspect` shape (~70 fields, 8 panels) that mirrors the field-coverage matrix in `scripts/quality/assert-global-coverage.js` (step 27 of permits chain). The Cycle 3 thin pass-through to `/api/leads/detail/:id` (Spec 91 §4.3.1, ~15 fields) is retained for the public-mobile contract but no longer used by the admin inspector.

**Why the expansion:** the WF3 cost-accuracy investigation (2026-05-08) found systemic over-classification — sign permits with $5M plumbing slices, fee-deferral records with full trade matrices, $29M cost estimates for two-wall-sign installations. The previous inspector surface didn't have enough field depth to spot these without dropping to psql. The expanded inspector closes that gap: every input that any pipeline step produces, surfaced for one-click audit per lead.

**8 panels (chain-step grouped):**

| Panel | Source | Key fields |
|---|---|---|
| Identity | derived | `lead_id`, `lead_type` |
| Source | step 2 (`load_permits`) + step 4 (`classify_permit_phase`) | `permit_type`, `structure_type`, `status`, `enriched_status`, full `description` (NOT truncated — was the ZARA smoking gun), `est_const_cost` (city-reported, pre-Liar's-Gate), `builder_name`, `owner`, dates |
| Scope | step 5 (`classify_scope`) | `project_type`, `scope_tags[]` |
| Trades | step 13 (`classify_permits`) | All `permit_trades` rows with `confidence`; `is_default_fallback` flag (true when `confidence === 0.55` — signals tag-trade-matrix default with no permit-specific signal, the DST/ZARA over-classification pattern) |
| Entity | steps 6-7 (`extract_builders` + `link_wsib`) | `legal_name`, `name_normalized`, `wsib_registered` |
| Spatial | steps 8-11 | parcel (id, **`area_sqm`** — lot size), massing (**`area_sqm`** — footprint, **`height_m`**, `stories`), neighbourhood (id, name, `avg_household_income`, `period_of_construction`) |
| **Cost (the diagnostic centerpiece)** | step 14 (`compute_cost_estimates`) | `cost_source` (permit/model/none), `is_geometric_override`, **`estimated_cost_total`** (clearly labeled as TOTAL — the admin UI bug from Cycle 3 surfaced as the user-reported "cost.estimated applies to total not per-trade"), `modeled_gfa_sqm`, full `trade_contract_values` JSONB, **inputs panel** (lot_size_sqm, footprint_area_sqm, height_m, stories, permit_type_allocation_pct, structure_complexity_factor, neighbourhood_premium_tier — every Surgical Triangle input per Spec 83 §3), **liar_gate panel** (modeled_total, reported_total, ratio, path: surgical_only/proportional_slicing/none per Spec 83 §3D) |
| Lifecycle | step 21 (`classify_lifecycle_phase`) | `phase`, `stalled`, `classified_at`, `phase_started_at` |
| Forecast | steps 23-24 (`compute_trade_forecasts` + `compute_opportunity_scores`) | Per-trade rows: `target_window`, `urgency`, `predicted_start`, `p25_days`, `p75_days`, `opportunity_score`, **`trade_slice_dollar`** (clearly labeled per-trade slice — distinct from the panel-7 total) |
| Engagement | derived from `lead_views` | `competition_count`, `saved_by_admin` (admin-scoped, NOT mobile's `is_saved`) |

**Endpoint:** `GET /api/admin/leads/inspect/:id`. Admin-only — `verifyAdminAuth` (Spec 33 §5) on first line. **No** `lead_views.saved=true` LATERAL gate (admin can inspect any permit, not just saved ones — closes the Cycle 3 line 234 caveat).

**Goal (preserved from Cycle 3):** admin pastes a `lead_id` (or selects from the Test Feed Tool result set), sees the full Spec 91 §4.3 `LeadDetail` payload — `cost.modeled_gfa_sqm`, `cost.range_low`/`range_high`, `neighbourhood.avg_household_income`, `target_window`, `opportunity_score`, `competition_count`, `applicant`, `work_description`, `is_saved` (scoped to the admin uid).

**Endpoint:** `GET /api/leads/detail/:id` (Spec 91 §4.3.1). Reuses unmodified — admin auth bypass already exists per §2.6 pattern.

**Use cases:**
- Verify the `is_saved` SQL change from WF1-A (commit `657faf8`) for a known permit.
- Spot-check `cost_estimates` join quality for a specific permit (mirror of the data-quality dashboard but for the rendered shape).
- Confirm `target_window` / `opportunity_score` / `competition_count` for a permit an admin is investigating from a customer support ticket.
- Validate the `LeadDetailSchema` (Zod) parses cleanly against the actual server payload — catches schema-vs-server drift WF1-A's deploy-skew test guards in unit tests but doesn't catch in production.

**UI:** form with `lead_id` text input (accepts `${permit_num}--${revision_num}` for permits, `COA-${app_number}` for CoA — same shape Spec 91 §4.3.1 documents). "Inspect" button → renders the `LeadDetail` shape in a JSON tree view + a structured side-by-side rendering of the rendered fields.

**Edge cases:**
- Invalid `lead_id` shape → 400 from endpoint; UI shows the validation error verbatim.
- Permit not on user's saved board (404 from endpoint per Spec 91 §4.3.1 — backend uses `lead_views.saved=true` LATERAL filter): for the admin-scoped variant, the admin's own save state is what matters. **NOTE:** Spec 91 §4.3.1 `LeadDetail` endpoint is `lead_views`-scoped (returns 404 if the user hasn't saved the permit). The Lead Detail Inspector therefore inherits this scoping — admin must save the permit via §3.4 first, OR a future amendment relaxes the LATERAL gate for admin auth. For Cycle 3 the inspector documents this constraint; deeper change is out of scope.
- Schema drift (server returns malformed payload) → Zod parse fails; UI shows the parse error + raw response side-by-side for debugging.

### 3.6 Flight Job Detail Inspector (NEW — Cycle 3 amendment 2026-05-06)

**Goal:** admin pastes a `lead_id` (or taps a card from §3.4 Flight Center), sees the Spec 77 §3.3.1 `FlightBoardDetail` payload — list-item shape (permit_num, revision_num, address, lifecycle_phase, lifecycle_stalled, predicted_start, p25_days, p75_days, temporal_group) plus `updated_at`.

**Endpoint:** `GET /api/leads/flight-board/detail/:id` (Spec 77 §3.3.1). Reuses unmodified.

**Why distinct from §3.5:** the two detail endpoints return **different shapes** with overlapping but non-identical fields:

| Field | §3.5 LeadDetail | §3.6 FlightBoardDetail |
|---|---|---|
| `permit_num` / `revision_num` / `address` | ✓ | ✓ |
| `lifecycle_phase` / `lifecycle_stalled` | ✓ | ✓ |
| `predicted_start` / `p25_days` / `p75_days` | ✓ | ✓ |
| `cost` block (estimated/tier/range/modeled_gfa_sqm) | ✓ | ✗ |
| `neighbourhood` block (income/period_of_construction) | ✓ | ✗ |
| `target_window` / `opportunity_score` / `competition_count` | ✓ | ✗ |
| `applicant` / `work_description` | ✓ | ✗ |
| `is_saved` | ✓ | ✗ |
| `temporal_group` (action_required/departing_soon/on_the_horizon) | ✗ | ✓ |
| `updated_at` (drives Spec 77 §3.2 amber update flash) | ✓ | ✓ |

A permit can render correctly through one endpoint and fail through the other — e.g., `cost_estimates` row missing breaks `LeadDetail.cost` but doesn't affect `FlightBoardDetail`. Two separately-debuggable surfaces.

**Use cases:**
- Verify `updated_at` propagates correctly (Spec 77 §3.2 amber-flash dependency, Spec 92 §4.4 trigger rule).
- Confirm `temporal_group` classification (Spec 77 §3.2 grouping rule).
- Spot-check the cold-boot deep-link path that WF1-B unblocked (commits `4e2df49` + `3d5b47f`) — admin pastes a permit_id and confirms the endpoint returns 200 + valid shape, NOT 404.
- Validate the `FlightBoardDetailSchema` (which equals `FlightBoardItemSchema` post-WF1-C amendment) parses against the actual server payload.

**UI:** parallel to §3.5 — text input for `lead_id`, "Inspect" button, JSON tree + structured render side-by-side. Mounted under the same `/admin/lead-feed/inspector` page as a tab so admins can toggle between the two endpoint shapes for the same permit_id.

**Cross-link from §3.4:** when admin taps a card in the Flight Center Tool, that opens this inspector inline with the card's permit_id pre-filled. Mirrors the mobile `flight-board.tsx` → `[flight-job].tsx` navigation 1:1.

**Edge cases:** same as §3.5 (invalid id → 400; cold-boot 404 if not on user's saved board; schema drift → parse error displayed).

### 3.7 User-Type Filter (CLOSED — Cycle 6 amendment 2026-05-06)

**Status:** **CLOSED.** A `?user_type=` parameter is NOT a planned product feature. Realtors and tradespeople share Spec 91's feed/flight-board algorithm; differentiation flows through `trade_slug` (a parameter the admin Test Feed Tool already exposes), not through a separate `user_type` axis. Manufacturers are not customer-facing feed personas — they're admin-managed B2B accounts per Spec 94 §7.

**Resolution (Cycle 6, commit pending):** the persona model is now documented in Spec 91 §1.3 (persona coverage matrix) + Spec 95 §2.5.1 (persona vs `trade_slug` separation of concerns). The architectural rule:

- `account_preset` is a UX hint (drives onboarding, welcome copy, billing).
- `trade_slug` is the authoritative algorithm input.
- Persona-specific behavior is expressed via DB calibration only (a row in `trades` + a row in `trade_forecasts`), never via algorithm branching.

For the admin Test Feed Tool / Flight Center this means: there's nothing to expose. The existing `trade_slug` parameter already lets an admin synthesize "what would a realtor see?" by passing `trade_slug='realtor'` (once the realtor backend wire-up — Spec 91 §3.5 Cycle 7 — completes; today the realtor feed is empty by data-layer omission, not algorithm omission).

**Original deferral text (preserved for context):** "adding `?user_type=trade|realtor|manufacturer` to `/api/admin/leads/test-feed` would expose a UI parameter feeding an algorithm that ignores it — dead UI surface." Cycle 6 confirmed this concern was correct AND that the alternate path (`trade_slug`-as-axis) is sufficient. No `user_type` axis is needed.

</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `lead-feed-health.logic.test.ts` — readiness calculation (3-way intersection), engagement aggregation, cost coverage math, edge cases (empty tables, null values)
- **Infra:** `lead-feed-health.infra.test.ts` — API route shape (response envelope, auth enforcement, Zod validation on test-feed params)
- **UI:** `LeadFeedHealthDashboard.ui.test.tsx` — readiness gauge rendering, traffic light states, engagement chart data, test feed form interaction, loading/error states, mobile viewport (375px)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
**Existing (pre-Cycle 3):**
- `src/app/api/admin/leads/health/route.ts` — health endpoint
- `src/app/api/admin/leads/test-feed/route.ts` — test feed endpoint
- `src/lib/admin/lead-feed-health.ts` — query functions
- `src/lib/quality/types.ts` — DataQualitySnapshot interface extension
- `src/app/api/admin/stats/route.ts` — lead_views additions
- `src/app/admin/lead-feed/page.tsx` — admin page
- `src/components/LeadFeedHealthDashboard.tsx` — dashboard component

**Cycle 3 amendment additions (implementation lands in separate WF1):**
- `src/app/admin/lead-feed/flight-center/page.tsx` — Flight Center Tool page
- `src/components/admin/FlightCenterTool.tsx` — Flight Center Tool component
- `src/lib/admin/admin-uid.ts` — admin uid sentinel resolver (`'admin-test'`)
- `src/app/admin/lead-feed/inspector/page.tsx` — paired-tab page for both detail inspectors
- `src/components/admin/LeadDetailInspector.tsx` — Spec 91 §4.3 LeadDetail probe
- `src/components/admin/FlightJobDetailInspector.tsx` — Spec 77 §3.3 FlightBoardDetail probe

### Out-of-Scope Files
- `src/features/leads/lib/get-lead-feed.ts` — the feed SQL is read-only consumed, not modified
- `src/app/api/leads/feed/route.ts` — user-facing feed unchanged
- `src/app/api/leads/detail/[id]/route.ts` — Spec 91 §4.3.1 contract; consumed by §3.5 inspector unmodified
- `src/app/api/leads/flight-board/route.ts` — Spec 77 list endpoint; consumed by §3.4 Flight Center unmodified
- `src/app/api/leads/flight-board/detail/[id]/route.ts` — Spec 77 §3.3.1 contract; consumed by §3.6 inspector unmodified
- `src/app/api/leads/save/route.ts` — Spec 91 §4.4 save mutation; consumed by §3.4 Flight Center unmodified
- `mobile/src/lib/schemas.ts` — Zod schemas reused by inspectors via boundary shim; not modified
- `scripts/refresh-snapshot.js` — already writes cost/timing snapshot data
- `scripts/compute-cost-estimates.js` — pipeline step unchanged

### Cross-Spec Dependencies
- **Relies on:** `26_admin_dashboard.md` (admin auth, dashboard patterns, `/api/admin/stats`)
- **Relies on:** `70_lead_feed.md` (feed SQL, scoring pillars, LeadFeedItem types)
- **Relies on:** `71_lead_timing_engine.md` (timing_calibration table, freshness)
- **Relies on:** `72_lead_cost_model.md` (cost_estimates table, coverage metrics)
- **Relies on:** `41_chain_permits.md` (pipeline steps 14-15 that populate cost/timing data)
- **Relies on (Cycle 3):** `91_mobile_lead_feed.md` §4.3 + §4.3.1 (LeadDetail contract consumed by §3.5 inspector)
- **Relies on (Cycle 3):** `77_mobile_crm_flight_board.md` §3.2 + §3.3 + §3.3.1 (FlightBoardDetail contract consumed by §3.4 Flight Center + §3.6 inspector)
- **Open coordination (Cycle 3):** Spec 91 amendment for user-type-differentiated feed views is a precondition for §3.7 (currently DEFERRED).
- **Consumed by:** Admin users monitoring lead feed production health (§3.3) + Admin users testing the lead-feed read flows end-to-end (§3.4–§3.6).

### Mobile & Responsive Behavior
- Dashboard sections stack vertically on mobile (base = single column)
- Test Feed form: full-width inputs on mobile, inline on desktop (`md:flex-row`)
- Results cards: same PermitLeadCard/BuilderLeadCard components from the feed (reused)
- Touch targets >= 44px on all interactive elements
</constraints>
