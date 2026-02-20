# Buildo System Map
**Single Source of Truth - All Features Registry**

---

## Phase 1: Data Foundation

| # | Spec File | Feature | Status | Health |
|---|-----------|---------|--------|--------|
| 01 | `01_database_schema.md` | Database Schema | In Progress | -- |
| 02 | `02_data_ingestion.md` | Data Ingestion Pipeline | In Progress | -- |
| 03 | `03_change_detection.md` | Change Detection | In Progress | -- |
| 04 | `04_sync_scheduler.md` | Sync Scheduler | Planned | -- |
| 05 | `05_geocoding.md` | Address Geocoding | Planned | -- |
| 06 | `06_data_api.md` | Permit Data API | In Progress | -- |

## Phase 2: Intelligence

| # | Spec File | Feature | Status | Health |
|---|-----------|---------|--------|--------|
| 07 | `07_trade_taxonomy.md` | Trade Taxonomy | In Progress | -- |
| 08 | `08_trade_classification.md` | Classification Engine | In Progress | -- |
| 09 | `09_construction_phases.md` | Phase Model | In Progress | -- |
| 10 | `10_lead_scoring.md` | Lead Scoring | In Progress | -- |
| 11 | `11_builder_enrichment.md` | Builder Enrichment | Planned | -- |
| 12 | `12_coa_integration.md` | CoA Integration | Planned | -- |

## Phase 3: User Experience

| # | Spec File | Feature | Status | Health |
|---|-----------|---------|--------|--------|
| 13 | `13_auth.md` | Authentication | Planned | -- |
| 14 | `14_onboarding.md` | Onboarding | Planned | -- |
| 15 | `15_dashboard_tradesperson.md` | Tradesperson Dashboard | Planned | -- |
| 16 | `16_dashboard_company.md` | Company Dashboard | Planned | -- |
| 17 | `17_dashboard_supplier.md` | Supplier Dashboard | Planned | -- |
| 18 | `18_permit_detail.md` | Permit Detail View | Planned | -- |
| 19 | `19_search_filter.md` | Search & Filter | Planned | -- |
| 20 | `20_map_view.md` | Map View | Planned | -- |

## Phase 4: Growth

| # | Spec File | Feature | Status | Health |
|---|-----------|---------|--------|--------|
| 21 | `21_notifications.md` | Notifications | Planned | -- |
| 22 | `22_teams.md` | Team Management | Planned | -- |
| 23 | `23_analytics.md` | Analytics Dashboard | Planned | -- |
| 24 | `24_export.md` | Data Export | Planned | -- |
| 25 | `25_subscription.md` | Billing | Planned | -- |
| 26 | `26_admin.md` | Admin Panel | Planned | -- |
| 27 | `27_neighbourhood_profiles.md` | Neighbourhood Profiles | In Progress | -- |
| 28 | `28_data_quality_dashboard.md` | Data Quality Dashboard | In Progress | -- |

---

## Key Files Map

### Database
- `src/lib/db/client.ts` - PostgreSQL connection pool
- `src/lib/db/queries.ts` - Reusable query builders
- `migrations/001_permits.sql` - Core permits table
- `migrations/002_permit_history.sql` - Change tracking
- `migrations/003_sync_runs.sql` - Sync audit log
- `migrations/004_trades.sql` - Trade taxonomy
- `migrations/005_trade_mapping_rules.sql` - Classification rules
- `migrations/006_permit_trades.sql` - Permit-trade junction
- `migrations/007_builders.sql` - Builder directory
- `migrations/008_builder_contacts.sql` - Contact enrichment
- `migrations/009_coa_applications.sql` - Committee of Adjustments
- `migrations/010_notifications.sql` - Notification queue
- `migrations/011_parcels.sql` - Toronto Property Boundaries parcels
- `migrations/012_permit_parcels.sql` - Permit-parcel junction
- `migrations/013_neighbourhoods.sql` - Toronto neighbourhoods + Census data
- `migrations/014_permit_neighbourhood.sql` - Adds neighbourhood_id FK to permits
- `migrations/015_data_quality_snapshots.sql` - Data quality metrics snapshot table

### Business Logic
- `src/lib/permits/types.ts` - Permit TypeScript interfaces
- `src/lib/permits/field-mapping.ts` - Source JSON to DB mapping
- `src/lib/permits/hash.ts` - SHA-256 change detection
- `src/lib/permits/diff.ts` - Field-by-field diff engine
- `src/lib/sync/ingest.ts` - Streaming JSON parser + batch UPSERT
- `src/lib/sync/process.ts` - Sync orchestration
- `src/lib/classification/trades.ts` - Trade taxonomy data
- `src/lib/classification/classifier.ts` - 3-tier classification engine
- `src/lib/classification/phases.ts` - Construction phase model
- `src/lib/classification/scoring.ts` - Lead scoring formula
- `src/lib/quality/types.ts` - Data quality snapshot interfaces + effectiveness score
- `src/lib/quality/metrics.ts` - Snapshot capture SQL queries + trend retrieval

### API Routes
- `src/app/api/permits/route.ts` - GET permits (list, filter, search)
- `src/app/api/permits/[id]/route.ts` - GET single permit detail
- `src/app/api/sync/route.ts` - POST trigger sync, GET sync status
- `src/app/api/trades/route.ts` - GET trade taxonomy
- `src/app/api/quality/route.ts` - GET data quality snapshot + trends
- `src/app/api/quality/refresh/route.ts` - POST manual snapshot capture

### Tests
- `src/tests/factories.ts` - Mock factory functions
- `src/tests/fixtures/sample-permits.ts` - Sample permit data
- `src/tests/permits.logic.test.ts` - Permit logic tests
- `src/tests/classification.logic.test.ts` - Classification tests
- `src/tests/scoring.logic.test.ts` - Lead scoring tests
- `src/tests/sync.logic.test.ts` - Sync process tests
- `src/tests/api.infra.test.ts` - API route tests
- `src/tests/quality.logic.test.ts` - Data quality score + metric tests
- `src/tests/quality.infra.test.ts` - Data quality API + schema tests
