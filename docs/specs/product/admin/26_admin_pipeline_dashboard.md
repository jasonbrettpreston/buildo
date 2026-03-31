# Spec 26 -- Admin Panel

## 1. Goal & User Story
As an admin, I want a unified dashboard to monitor data pipeline health, trigger pipeline runs, and view system-wide metrics so I can keep all 7 data sources fresh and identify issues early.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full |

## 3. Behavioral Contract
- **Inputs:** Admin navigates to `/admin`; clicks "Update Now" on any pipeline; clicks nav links to Data Quality or Market Metrics sub-pages.
- **Core Logic:**
  - Admin home displays a hierarchical Data Health Overview with 7 HealthCards: permits (hero, full-width), builders (derived, indented), 4 enrichment sources (grid), CoA (standalone).
  - Each HealthCard shows record count, status dot (green/yellow/red per freshness thresholds), "Last updated" (relative time), "Next update" (computed from last run + interval, or "Overdue"), and an "Update Now" button.
  - Enrichment sources show "X permits linked (Y%)" counts for geocoding, parcels, massing, and neighbourhoods.
  - "Update Now" triggers `POST /api/admin/pipelines/{slug}`, enters polling state (5s interval on `GET /api/admin/stats`) until pipeline completes or fails.
  - 32 pipeline slugs supported: 28 individual + 4 chain orchestrators (`chain_sources`, `chain_permits`, `chain_coa`, `chain_entities`). Chains use 1-hour timeout; individual pipelines use 10-minute timeout. See `scripts/run-chain.js`.
  - **4-Pillar Architecture:** Chains are grouped by dependency hierarchy: (1) Source Data Updates (foundation, quarterly), (2) Permits Pipeline (fast daily ingestion), (3) CoA Pipeline (fast daily ingestion), (4) Corporate Entities Pipeline (slow daily enrichment via web scraping), (5) Deep Scrapes & Documents (continuous async workers, `comingSoon` — not yet wired). Enrichment scripts (`enrich_wsib_builders`, `enrich_named_builders`) are isolated in the entities chain to prevent slow external API calls from blocking core ingestion. Entities chain does NOT need `assert_schema`/`assert_data_bounds` — those validate raw CSV ingestion, not web scraping enrichment.
  - **Run All safeguards:** "Run All" button is disabled when: (a) chain is already running, (b) chain is marked `comingSoon`, or (c) all toggleable steps in the chain are disabled. This prevents triggering no-op chains.
  - Pipeline freshness tracked in `pipeline_runs` table (migration 033) with per-pipeline `started_at`, `completed_at`, `status`, record counts, and `error_message` (truncated to 4000 chars).
  - Pipeline schedules defined as client-side constants: permits/coa/builders/classify = Daily, address_points/parcels/massing = Quarterly, neighbourhoods = Annual. HealthCard shows `scheduleNote` for human context.
  - Active Sync Operations section: CoA summary card, builder summary card, permits sync log table (last 20 runs).
  - Data Quality & Linking Metrics section: 4 progress bars (geocoding, builder ID, builder contact enrichment, trade classification) colour-coded green >= 90%, yellow >= 70%, red < 70%.
  - `GET /api/admin/stats` returns 26+ fields plus `pipeline_last_run` map. See `AdminStats` in `src/lib/admin/types.ts`.
  - **Pipeline Toggle Controls:** Each pipeline step in FreshnessTimeline has an on/off toggle switch. Toggling fires `PATCH /api/admin/pipelines/schedules { pipeline, enabled }` which updates the `enabled` column in `pipeline_schedules` (migration 047). Disabled steps appear dimmed with strikethrough name and gray status dot. When a chain runs via `scripts/run-chain.js`, disabled steps are skipped and logged as `skipped` in `pipeline_runs`. `enrich_wsib_builders` and `enrich_named_builders` default to disabled (to be enabled at a later stage).
  - Planned but not yet built: Trade Rule Editor, Builder Enrichment Queue, System Metrics sparklines, User Management.
- **Outputs:** Rendered admin dashboard with live health status; pipeline trigger acknowledgement; polling-updated timestamps after pipeline completion.
- **Edge Cases:**
  - Concurrent trigger while pipeline running returns 409 Conflict.
  - Missing script file returns 500 from pipeline trigger route.
  - `pipeline_last_run` entry missing for a source shows "Not scheduled" for next update.
  - `stderr` from child process captured and stored (truncated to 4000 chars).

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`admin.ui.test.tsx`): Sync Run Status Formatting; Duration Formatting; Sync Run Record Counts; Latest Sync Stats Display; Data Coverage Stats; Active Permit Status Filter; Admin Page Navigation Hub; Pipeline Health Status Logic; Progress Bar Percentage Calculation; Health Dashboard Pipeline Definitions; CoA Summary Card Link Rate; Builder Enrichment Rate; Expanded AdminStats Interface Validation; Pipeline Schedule Constants; Relative Time Formatting; Next Scheduled Date Computation; Admin Stats Pipeline Freshness; Pipeline Trigger Endpoint; load-permits.js fetches live CKAN data; Cross-platform ZIP extraction in load-massing.js; Pipeline route captures stderr and validates script; Stale pipeline run auto-cleanup; Massing pipeline chains link-massing after load; FreshnessTimeline duration and error display; ScheduleEditModal; Pipeline schedules in DataQualityDashboard; FreshnessTimeline funnel accordion; Health Banner in DataQualityDashboard; FreshnessTimeline quality group; SLA badge in FreshnessTimeline; Permit link percentage calculation; Pipeline Toggle — disabled step filtering; Pipeline Toggle — PATCH endpoint contract; Pipeline Toggle — UI rendering logic; NON_TOGGLEABLE_SLUGS filtering; Pipeline controls always visible (no hover gating); Pipeline controls hidden for infrastructure steps; Chain error summary box; Mobile viewport (375px) — controls always visible; Chain trigger inserts pipeline_runs row before spawning process; run-chain.js accepts external run ID argument; Polling resilience — grace period for newly triggered pipelines; 4-Pillar Architecture — chain_entities registration; Deep Scrapes pipeline group; Run All disabled when all steps disabled or comingSoon
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/admin/page.tsx`
- `src/app/api/admin/stats/route.ts`
- `src/app/api/admin/pipelines/[slug]/route.ts`
- `src/app/api/admin/rules/route.ts`
- `src/app/api/admin/sync/route.ts`
- `src/lib/admin/helpers.ts`
- `src/lib/admin/types.ts`
- `scripts/run-chain.js`
- `src/tests/admin.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Admin may trigger classification but not modify the engine.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Admin may trigger sync but not modify the pipeline.
- **`src/lib/quality/`**: Governed by Spec 28. Quality dashboard is a separate spec.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Queries `pipeline_runs` and aggregate stats.
- Relies on **Spec 13 (Auth)**: Admin access control via route-guard.
- Consumed by **Spec 28 (Data Quality)**: Quality dashboard linked from admin nav.
- Consumed by **Spec 34 (Market Metrics)**: Market metrics linked from admin nav.
