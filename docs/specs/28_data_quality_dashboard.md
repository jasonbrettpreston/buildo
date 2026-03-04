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
  - Hub-and-spoke circle diagram: Building Permits as central hub, enrichment sources (4-column grid: address matching, parcels, 3D massing, neighbourhoods), derived sources (5-column grid: CoA, builders, scope class, scope tags, trades residential, trades commercial). Each `DataSourceCircle` shows progress ring, counts, confidence, tier breakdown, timestamps, and "Update Now" button.
  - 30-day trend arrows on each circle: compares current % to snapshot ~30 days ago (minimum 7-day gap to avoid self-comparison). Positive = green up arrow, negative = red down arrow, zero = gray flat, null = hidden. See `findSnapshotDaysAgo()` and `trendDelta()` in `src/lib/quality/types.ts`.
  - Latest record dates shown for permits (`MAX(first_seen_at)`) and CoA (`MAX(hearing_date)`) as formatted calendar dates.
  - Daily snapshot upserted to `data_quality_snapshots` table (migration 015, one row per day via `ON CONFLICT (snapshot_date) DO UPDATE`). `captureDataQualitySnapshot()` runs 9 parallel counting queries against live DB. See `src/lib/quality/metrics.ts`.
  - Snapshots captured automatically after daily sync (Cloud Function, non-fatal) and manually via `POST /api/quality/refresh`.
  - `GET /api/quality` returns latest snapshot + 30-day trends array.
  - Freshness section: 24h/7d/30d update counters, staleness warning, data source timeline.
  - Pipeline chain orchestrator (`scripts/run-chain.js`): 3 chains (permits=16 steps, coa=5, sources=10). Permits and coa chains end with CQA validation (`assert_schema`, `assert_data_bounds`); sources ends with `refresh_snapshot`. Sequential execution with stop-on-failure. API chains use 1-hour timeout.
  - Continuous Quality Assurance (CQA): Tier 1 pre-ingestion schema validation (`scripts/quality/assert-schema.js`) checks CKAN metadata for expected columns and type coercion. Tier 2 post-ingestion data bounds (`scripts/quality/assert-data-bounds.js`) runs SQL checks: cost outliers, null-rate thresholds (description 5%, builder 20%, status 0%), referential audits (orphaned permit_trades/permit_parcels/coa links), duplicate PK detection. Both log results to `pipeline_runs` table and appear as "Quality" group entries in FreshnessTimeline.
  - Dashboard polls every 5s while any pipeline is running.
  - Permit loader (`scripts/load-permits.js`) fetches live from CKAN by default (paginated 10K/page), or from local file via `--file` flag.
  - CoA loader (`scripts/load-coa.js`) uses incremental mode by default (active resource, last 90 days via SQL endpoint), or full mode via `--full` flag.
- **Outputs:** Rendered dashboard with effectiveness score gauge, 10 data source circles with trend arrows, freshness timeline; snapshot row upserted on refresh; API JSON with current snapshot and trends.
- **Edge Cases:**
  - `active_permits = 0` makes effectiveness score null (N/A).
  - `builders_total = 0` or `coa_total = 0` contributes 0% to score (no division error).
  - Coverage > 100% possible (inactive permits with trade matches); score clamped to 100.
  - Freshness ordering invariant: `permits_updated_24h <= permits_updated_7d <= permits_updated_30d`.
  - Cloud Function snapshot failure is WARNING, not ERROR; sync still succeeds.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`quality.logic.test.ts`): Data Effectiveness Score; Extract Matching Metrics; DataQualitySnapshot Shape Validation; parseSnapshot coerces NUMERIC fields from strings; Neighbourhood count must not exceed active permits; Builder accuracy uses permits_with_builder / active_permits; Builder tier percentages; Work Scope split: classification vs detailed tags; Pipeline Registry; Pipeline Chains; trendDelta(); findSnapshotDaysAgo(); DataSourceCircle field annotations; detectVolumeAnomalies(); detectSchemaDrift(); computeSystemHealth(); SLA_TARGETS; Snapshot includes null tracking and violation fields
- **Infra** (`quality.infra.test.ts`): GET /api/quality Response Shape; DataQualitySnapshot Schema Constraints; Snapshot Date Uniqueness; Confidence Value Validation; Coverage Rate Validation; Freshness Interval Validation; Sync Status Validation; Quality API includes anomalies and health keys; Pipeline schedules API route exists; Migration 015 DDL Expectations; CQA Script Files; Pipeline runs API route exists
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/quality/metrics.ts`
- `src/lib/quality/types.ts`
- `src/app/api/quality/route.ts`
- `src/app/api/quality/refresh/route.ts`
- `src/app/admin/data-quality/page.tsx`
- `src/components/DataQualityDashboard.tsx`
- `src/components/DataSourceCircle.tsx`
- `src/components/FreshnessTimeline.tsx`
- `scripts/refresh-snapshot.js`
- `scripts/quality/assert-schema.js`
- `scripts/quality/assert-data-bounds.js`
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
