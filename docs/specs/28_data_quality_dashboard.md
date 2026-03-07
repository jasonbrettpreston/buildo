# Spec 28 -- Data Quality Dashboard

## 1. Goal & User Story
As an admin, I want a Data Effectiveness Dashboard that shows completeness, accuracy, and freshness across all six matching processes so I can identify coverage gaps and prioritize enrichment work.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Read |

## 3. Behavioral Contract
- **Inputs:** Admin navigates to `/admin/data-quality`; clicks "Refresh Metrics"; clicks "Update Now" on any pipeline circle; pipeline chain completes (auto-capture).
- **Core Logic:**
  - Measures 6 matching processes: trade classification, builder enrichment, parcel linking, neighbourhood coverage, geocoding, CoA linking. Each has a coverage rate (matched/total).
  - Composite Data Effectiveness Score (0-100) is a weighted average: trades 25%, builders 20%, parcels 15%, neighbourhoods 15%, geocoding 15%, CoA 10%. Colour thresholds: green >= 80, yellow 60-79, orange 40-59, red < 40.
  - 30-day trend comparisons shown in health banner: violations, completeness, volume, and enrichment deltas. See `findSnapshotDaysAgo()` in `src/lib/quality/types.ts`.
  - Daily snapshot upserted to `data_quality_snapshots` table (migration 015, one row per day via `ON CONFLICT (snapshot_date) DO UPDATE`). `captureDataQualitySnapshot()` runs 9 parallel counting queries against live DB. See `src/lib/quality/metrics.ts`.
  - Snapshots captured automatically after daily sync (Cloud Function, non-fatal) and manually via `POST /api/quality/refresh`.
  - `GET /api/quality` returns latest snapshot + 30-day trends array.
  - Freshness section: 24h/7d/30d update counters, staleness warning, data source timeline.
  - Pipeline chain orchestrator (`scripts/run-chain.js`): 3 chains (permits=17 steps, coa=6, sources=14). All three chains bookend with CQA: `assert_schema` (Tier 1) runs first as pre-ingestion gate, `assert_data_bounds` (Tier 2) runs last as post-ingestion validation. Sequential execution with stop-on-failure. API chains use 1-hour timeout.
  - Continuous Quality Assurance (CQA): Tier 1 pre-ingestion schema validation (`scripts/quality/assert-schema.js`) checks CKAN datastore metadata for permits/CoA expected columns, CSV headers for address_points/parcels, GeoJSON property keys for neighbourhoods, and URL accessibility for massing shapefiles — runs before data load to catch upstream drift. Tier 2 post-ingestion data bounds (`scripts/quality/assert-data-bounds.js`) runs SQL checks after all processing: permits (cost outliers, null-rate thresholds, referential audits, duplicate PKs), source tables (address_points row count + duplicate IDs, parcels row count + duplicate IDs + lot size bounds, building_footprints row count + height bounds, neighbourhoods count >= 158 + duplicate IDs). Both log results to `pipeline_runs` table and appear as "Quality" group entries in FreshnessTimeline. Tier 3 (CI/CD migration linting) is out of scope for runtime pipelines.
  - Dashboard polls every 5s while any pipeline is running.
  - Permit loader (`scripts/load-permits.js`) fetches live from CKAN by default (paginated 10K/page), or from local file via `--file` flag.
  - CoA loader (`scripts/load-coa.js`) uses incremental mode by default (active resource, last 90 days via SQL endpoint), or full mode via `--full` flag.
  - Universal pipeline drill-downs: every pipeline step (all 25) renders as a distinct bordered tile card with an expandable accordion (44px touch-target chevron). Each tile has a proportional accuracy bar chart background (green/blue/yellow/red) for funnel sources. Drill-down layout stacks three zones as bordered white cards: (1) **Data Flow** — `DataFlowTile` component renders source → target visualization. Live column schema from `information_schema.columns` (returned as `db_schema_map` from stats API). Each script emits `PIPELINE_META:{json}` to stdout with its exact reads/writes; chain orchestrator stores in `records_meta.pipeline_meta`; DataFlowTile renders live reads (source cards with read columns) and writes (target card with highlighted columns). "Live Meta" badge shown when rendering from pipeline_meta. Falls back to static `STEP_DESCRIPTIONS.sources`/`writes` when no pipeline_meta available. Source tables show read columns, target table highlights written columns. External APIs (CKAN, Serper) render as blue badges. Self-referential steps (e.g., classify_scope_class reads/writes permits) show single table with highlighted writes + separate reads chip list. `DataFlowTile` and helpers extracted to `src/components/funnel/FunnelPanels.tsx`; (2) **All Time** — Baseline, Intersection, Yield (3-col grid, funnel sources only); (3) **Last Run** — either rich FunnelLastRunPanel (funnel sources) or basic status/duration/records stats (non-funnel steps). Both All Time and Last Run are shown simultaneously (no toggle). 13 funnel sources in pipeline chain execution order (permits → scope_class → scope_tags → trades_residential → trades_commercial → builders → wsib → builder_web → address_matching → parcels → neighbourhoods → massing → coa). Each funnel step shows a compact match % chip (color-coded: green >= 90%, blue >= 70%, yellow >= 50%, red < 50%). Non-funnel steps (infrastructure, quality gates, deep scrapes) show description + basic last-run stats. Funnel computation logic extracted to `src/lib/admin/funnel.ts` (pure logic, no React), config exported as `FUNNEL_SOURCES` and `STEP_DESCRIPTIONS` for testing. Former standalone `EnrichmentFunnel.tsx` and hub-and-spoke `DataSourceCircle.tsx` components removed.
  - Pipeline trigger concurrency: API force-cancels any existing 'running' rows for the slug before inserting a new run (no 409 rejection). Toggle PATCH uses UPSERT to handle pipelines without existing `pipeline_schedules` rows. Toggle UI uses optimistic local state for instant visual feedback. Migration 048 backfills missing pipeline_schedules rows.
  - Health banner is an actionable command center: gradient background, "Retry Failed" button, clickable issue count that scrolls to timeline, swipeable trend carousel on mobile (`overflow-x-auto snap-x`).
- **Outputs:** Rendered dashboard with health banner, pipeline status timeline with inline funnel accordions, schedule controls; snapshot row upserted on refresh; API JSON with current snapshot and trends.
- **Edge Cases:**
  - `active_permits = 0` makes effectiveness score null (N/A).
  - `builders_total = 0` or `coa_total = 0` contributes 0% to score (no division error).
  - Coverage > 100% possible (inactive permits with trade matches); score clamped to 100.
  - Freshness ordering invariant: `permits_updated_24h <= permits_updated_7d <= permits_updated_30d`.
  - Cloud Function snapshot failure is WARNING, not ERROR; sync still succeeds.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`quality.logic.test.ts`): Data Effectiveness Score; Extract Matching Metrics; DataQualitySnapshot Shape Validation; parseSnapshot coerces NUMERIC fields from strings; Neighbourhood count must not exceed active permits; Builder accuracy uses permits_with_builder / active_permits; Builder tier percentages; Work Scope split: classification vs detailed tags; Pipeline Registry; Pipeline Chains; trendDelta(); findSnapshotDaysAgo(); Funnel computation (extracted to lib/admin/funnel); detectVolumeAnomalies(); detectSchemaDrift(); computeSystemHealth(); SLA_TARGETS; Enrichment Funnel; Snapshot includes null tracking and violation fields
- **Infra** (`quality.infra.test.ts`): GET /api/quality Response Shape; DataQualitySnapshot Schema Constraints; Snapshot Date Uniqueness; Confidence Value Validation; Coverage Rate Validation; Freshness Interval Validation; Sync Status Validation; Quality API includes anomalies and health keys; Pipeline schedules API route exists; Migration 015 DDL Expectations; CQA Script Files; Migration 041 records_meta; enrich-web-search.js writes records_meta; Stats API returns records_meta; Pipeline runs API route exists
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/quality/metrics.ts`
- `src/lib/quality/types.ts`
- `src/app/api/quality/route.ts`
- `src/app/api/quality/refresh/route.ts`
- `src/app/admin/data-quality/page.tsx`
- `src/components/DataQualityDashboard.tsx`
- `src/components/FreshnessTimeline.tsx`
- `src/lib/admin/funnel.ts`
- `scripts/refresh-snapshot.js`
- `scripts/quality/assert-schema.js`
- `scripts/quality/assert-data-bounds.js`
- `migrations/041_records_meta.sql`
- `migrations/048_pipeline_schedules_backfill.sql`
- `src/tests/quality.logic.test.ts`
- `src/tests/quality.infra.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Quality measures classification but does not modify it.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Quality measures sync but does not modify it.
- **`src/lib/builders/enrichment.ts`**: Governed by Spec 11. Quality measures enrichment but does not modify it.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `data_quality_snapshots` table.
- Relies on **Spec 26 (Admin)**: Quality dashboard linked from admin navigation.
- Measures all data linking specs: Spec 08 (trades), Spec 11 (builders), Spec 29 (parcels), Spec 27 (neighbourhoods), Spec 05 (geocoding), Spec 12 (CoA).
