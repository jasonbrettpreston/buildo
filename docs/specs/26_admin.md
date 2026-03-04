# 26 - Admin Panel

**Status:** In Progress
**Last Updated:** 2026-03-03
**Depends On:** `01_database_schema.md`, `02_data_ingestion.md`, `07_trade_taxonomy.md`, `08_trade_classification.md`, `11_builder_enrichment.md`, `13_auth.md`
**Blocks:** None

---

## 1. User Story

> "As an admin, I want to monitor data pipeline health, manage trade classification rules, and see system metrics."

**Acceptance Criteria:**
- [x] Admin dashboard at `/admin` is a navigation hub with links to Data Quality and Market Metrics
- [x] Pipeline trigger system supports 24 pipeline slugs (21 individual + 3 chain orchestrators)
- [x] Data Quality Dashboard at `/admin/data-quality` shows accuracy, coverage, and trend analysis
- [x] Market Metrics Dashboard at `/admin/market-metrics` (Spec 34)
- [ ] *(Planned)* Admin routes protected by role-based access control
- [ ] *(Planned)* Trade Rule Editor with full CRUD and live testing
- [ ] *(Planned)* Builder Enrichment Queue with retry/manual entry
- [ ] *(Planned)* System Metrics with sparkline trends
- [ ] *(Planned)* User Management with Firestore integration

---

## 2. Technical Logic

### Admin Role Check *(Planned — Not Yet Implemented)*

Admin role verification middleware is planned but not yet implemented. Currently
all admin routes are accessible without authentication.

```typescript
// Future: Firestore /users/{uid} includes role field
interface AdminUser {
  uid: string;
  email: string;
  role: 'user' | 'admin';
}
```

### Section 1: Sync Dashboard *(Integrated into Admin Home)*

Sync history is displayed as a table on the main `/admin` page (Sub-Section 4b)
rather than as a standalone page. Shows last 20 sync runs from the `sync_runs` table
with columns: ID, Started, Status, Total, New, Updated, Unchanged, Errors, Duration.
Status badges: `completed` (green), `running` (blue), `failed` (red). Duration formatted as "Xm Ys".

### Section 2: Trade Rule Editor *(Planned — API Exists, UI Not Built)*

API routes `GET/POST /api/admin/rules` exist for listing and creating trade mapping rules.
No dedicated `/admin/rules` page or `RuleEditorForm`/`RuleTester` components have been built yet.

### Section 3: Builder Enrichment Queue *(Planned — Not Yet Built)*

No dedicated enrichment queue UI. Builder stats are displayed in the Admin Home
"Active Sync Operations" section (Sub-Section 4b) showing total builders,
builders with contact info, and enrichment rate.

### Section 4: Data Sources & Health Dashboard (Admin Home) — IMPLEMENTED

The admin home page (`/admin`) is a comprehensive "Data Sources & Health" dashboard
covering all 7 data pipelines. It replaces the former permits-only sync view.

#### Sub-Section 4a: Data Health Overview (Hierarchical Layout)

7 `HealthCard` status indicators arranged in a visual hierarchy that communicates
data relationships:

**Row 1 — Primary Source (full-width hero card):**
Building Permits — large card spanning full width with `hero` styling. This is the
core dataset from which other data is derived or enriched.

**Row 2 — Derived Source (indented under permits):**
Builder Profiles — indented card (`ml-6 border-l-2`) with label "Extracted from
permits". Builder data is derived from permit applicant fields.

**Row 3 — Enrichment Sources (4-column grid):**
Address Points | Property Parcels | 3D Massing | Neighbourhoods — standalone
enrichment datasets that augment permit data with spatial context.

**Row 4 — External Daily Source:**
Committee of Adjustment — standalone card for CoA pre-permit variance applications.

##### Health Thresholds

| # | Pipeline | Count Source | Freshness Source | Green | Yellow | Red |
|---|----------|-------------|------------------|-------|--------|-----|
| 1 | Building Permits | `total_permits` | `pipeline_last_run.permits` | sync < 36h ago | sync < 72h ago | sync > 72h or 0 permits |
| 2 | Builder Profiles | `total_builders` | `pipeline_last_run.builders` | total > 0 | — | 0 builders |
| 3 | Address Points | `address_points_total` | `pipeline_last_run.address_points` | count >= 500,000 | count > 0 | 0 rows |
| 4 | Property Parcels | `parcels_total` | `pipeline_last_run.parcels` | count > 0 | — | 0 rows |
| 5 | 3D Massing | `building_footprints_total` | `pipeline_last_run.massing` | count > 0 | — | 0 rows |
| 6 | Neighbourhoods | `neighbourhoods_total` | `pipeline_last_run.neighbourhoods` | count >= 158 | count > 0 | 0 rows |
| 7 | Committee of Adjustment | `coa_total` | `pipeline_last_run.coa` | total > 0 & sync < 36h | sync < 72h | 0 records or stale |

##### HealthCard Display

Each card displays:
- Pipeline name + status dot (green/yellow/red)
- Record count with detail text
- **Permits linked:** count of permits enriched by this source (enrichment sources only)
- **Last updated:** relative time from `pipeline_last_run` (e.g., "6h ago", "3 days ago")
- **Next update:** computed date from last run + frequency interval (e.g., "Mar 1, 2026"), or "Overdue" if past due
- **Update Now** button — triggers `POST /api/admin/pipelines/{slug}`, shows persistent "Running..." state with polling until pipeline completes or fails

##### Enrichment Source "Permits Linked" Counts

| Source | Stat Field | Query |
|--------|-----------|-------|
| Address Points | `permits_geocoded` | Permits with `latitude IS NOT NULL` (geocoded via address points) | Displayed as "X permits linked (Y%)" |
| Property Parcels | `permits_with_parcel` | Distinct permits in `permit_parcels` | Displayed as "X permits linked (Y%)" |
| 3D Massing | `permits_with_massing` | Distinct permits in `permit_parcels` joined to `parcel_buildings` | Displayed as "X permits linked (Y%)" |
| Neighbourhoods | `permits_with_neighbourhood` | Permits with `neighbourhood_id IS NOT NULL` | Displayed as "X permits linked (Y%)" |

Percentage calculated as `calcPct(permitsLinked, total_permits)`.

##### Update Now Button Behaviour

1. On click: `POST /api/admin/pipelines/{slug}` — creates `pipeline_runs` row, spawns script
2. Button enters "Running..." state (disabled, animated pulse)
3. Page polls `GET /api/admin/stats` every 5 seconds
4. When `pipeline_last_run[slug].status` is no longer `'running'`, polling stops
5. Stats auto-refresh to show updated "Last updated" timestamp

**Pipeline trigger route** (`POST /api/admin/pipelines/[slug]`):
- Validates script exists with `fs.existsSync` before spawning (returns 500 if missing)
- Captures `stderr` from `execFile` callback and stores in `error_message` (truncated to 4000 chars)
- Passes `env: process.env` explicitly to child process
- Logs script failures and stderr to server console

**Cross-platform scripts**: `scripts/load-massing.js` uses `os.platform()` to choose
`PowerShell Expand-Archive` on Windows or `unzip` on Unix for ZIP extraction.

##### Pipeline Schedules (Client-Side Constant)

```typescript
const PIPELINE_SCHEDULES: Record<string, { label: string; intervalDays: number; scheduleNote: string }> = {
  permits: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 2:00 AM EST' },
  coa: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 3:00 AM EST' },
  builders: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 4:00 AM EST (after permits)' },
  classify_scope_class: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily (after permits)' },
  classify_scope_tags: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily (after permits)' },
  classify_permits: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily (after permits)' },
  address_points: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  parcels: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  compute_centroids: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (after parcels)' },
  massing: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  neighbourhoods: { label: 'Annual', intervalDays: 365, scheduleNote: 'Annual (January)' },
};
```

HealthCard displays `scheduleNote` (not bare label) for human-readable schedule context.

##### Next Update Date Computation

```typescript
function getNextUpdateDate(lastRunAt: string | null, intervalDays: number): string {
  if (!lastRunAt) return 'Not scheduled';
  const next = new Date(new Date(lastRunAt).getTime() + intervalDays * 86400000);
  if (next <= new Date()) return 'Overdue';
  return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
```

##### Freshness Tracking: `pipeline_runs` Table (Migration 033)

Generic pipeline run tracking table used by all 7 data sources:

```sql
CREATE TABLE pipeline_runs (
  id SERIAL PRIMARY KEY,
  pipeline TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  records_total INT DEFAULT 0,
  records_new INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  error_message TEXT,
  duration_ms INT
);
CREATE INDEX idx_pipeline_runs_lookup ON pipeline_runs (pipeline, started_at DESC);
```

Backfilled on creation from existing per-table timestamps (permits from `sync_runs`,
others from `MAX(created_at)` of their respective tables).

#### Sub-Section 4b: Active Sync Operations
Two summary cards plus the sync history table (no standalone stat cards):

1. **CoA Summary Card:** `coa_total` applications, `coa_approved` approved, `coa_linked` linked, permit link rate = `coa_linked / coa_approved * 100%`.
2. **Builder Summary Card:** `total_builders` total, `builders_with_contact` with contact info, enrichment rate = `builders_with_contact / total_builders * 100%`.
3. **Permits Sync Log:** The existing `sync_runs` table (ID, Started, Status, Total, New, Updated, Unchanged, Errors, Duration).

#### Sub-Section 4c: Data Quality & Linking Metrics
4 progress bar components tracking platform enrichment health:

| Metric | Numerator | Denominator | Example |
|--------|-----------|-------------|---------|
| Geocoding Health | `permits_geocoded` | `total_permits` | 99.2% |
| Builder Identification | `permits_with_builder` | `active_permits` | 85% |
| Builder Contact Enrichment | `builders_with_contact` | `total_builders` | 45% |
| Trade Classification | `permits_classified` | `total_permits` | 96% |

Progress bars colour-code: >= 90% green, >= 70% yellow, < 70% red.

#### Expanded API Response: `GET /api/admin/stats`

New fields added to the existing endpoint:

```typescript
interface AdminStats {
  // Existing fields
  total_permits: number;
  active_permits: number;
  total_builders: number;
  permits_with_builder: number;
  permits_with_parcel: number;
  permits_with_neighbourhood: number;
  coa_total: number;
  coa_linked: number;
  coa_upcoming: number;
  total_trades: number;
  active_rules: number;
  permits_this_week: number;
  last_sync_at: string | null;
  notifications_pending: number;

  // New fields for Data Sources & Health Dashboard
  permits_geocoded: number;
  permits_classified: number;
  builders_with_contact: number;
  address_points_total: number;
  parcels_total: number;
  building_footprints_total: number;
  parcels_with_massing: number;       // parcels with building footprint data
  permits_with_massing: number;       // permits linked through parcels→parcel_buildings
  neighbourhoods_total: number;
  coa_approved: number;

  // Pipeline freshness (from pipeline_runs table)
  pipeline_last_run: Record<string, {
    last_run_at: string | null;
    status: string | null;
  }>;
}
```

### Section 5: System Metrics *(Planned — Not Yet Built)*

Key system metrics are exposed via `GET /api/admin/stats` but no dedicated
metrics page with sparkline trends exists yet. The stats endpoint already
provides: `total_permits`, `permits_classified`, `total_builders`,
`builders_with_contact`, `permits_geocoded`, `permits_with_parcel`,
`permits_with_massing`, `permits_with_neighbourhood`, etc.

### Section 6: User Management *(Planned — Not Yet Built)*

```
Data source: Firestore /users collection

Display:
  - Paginated table, 25 users per page
  - Columns: email, display_name, plan, team_name, saved_permits_count,
    last_login, created_at
  - Search by email or name
  - Filter by plan (free/pro/enterprise)
  - Sort by any column

Actions:
  - View user detail: expanded panel showing full profile, usage stats,
    notification preferences
  - No edit/delete actions (user management changes happen through
    Firebase Auth console or Stripe dashboard for safety)

Queries (Firestore):
  collection('users')
    .where('plan', '==', filterPlan)     // optional filter
    .orderBy(sortField, sortDirection)
    .limit(25)
    .startAfter(lastDoc)                 // pagination cursor
```

### API Endpoints

```
GET  /api/admin/sync-runs              - List last 20 sync runs
POST /api/admin/sync-runs/trigger      - Trigger manual sync
GET  /api/admin/sync-runs/{id}/errors  - Get errors for a sync run

GET    /api/admin/rules                - List all trade mapping rules
POST   /api/admin/rules                - Create a new rule
PUT    /api/admin/rules/{id}           - Update a rule
DELETE /api/admin/rules/{id}           - Delete/deactivate a rule
POST   /api/admin/rules/test           - Test rules against a sample permit

GET  /api/admin/enrichment             - List enrichment queue (with status filter)
POST /api/admin/enrichment/{id}/retry  - Retry a failed enrichment
POST /api/admin/enrichment/retry-all   - Retry all failed enrichments
POST /api/admin/enrichment/{id}/manual - Manual entry for builder contact

GET  /api/admin/metrics                - System metrics summary
GET  /api/admin/users                  - Paginated user list
GET  /api/admin/users/{uid}            - User detail

POST /api/admin/pipelines/{slug}      - Trigger manual pipeline run
                                        Individual: permits|coa|builders|address_points|parcels|massing|
                                          neighbourhoods|geocode_permits|link_parcels|link_neighbourhoods|
                                          link_massing|link_coa|enrich_google|enrich_wsib|
                                          classify_scope_class|classify_scope_tags|classify_permits|
                                          compute_centroids|link_similar|create_pre_permits|refresh_snapshot
                                        Chains:     chain_permits|chain_coa|chain_sources
```

**Note:** Chain slugs (`chain_permits`, `chain_coa`, `chain_sources`) trigger `scripts/run-chain.js`
with the chain ID as argument, running all steps sequentially with 1-hour timeout.
Individual pipelines use 10-minute timeout. See Spec 28 Section 2.7 for chain details.

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/app/admin/page.tsx` | Admin home — hierarchical Data Health Overview, sync operations, quality metrics | Implemented |
| `src/lib/admin/types.ts` | Shared types: AdminStats, SyncRun, PipelineRunInfo, HealthStatus | Implemented |
| `src/lib/admin/helpers.ts` | Pure helpers: pipeline schedules, health computation, formatting, scheduling | Implemented |
| `src/app/admin/data-quality/page.tsx` | Data Quality Dashboard (Spec 28) | Implemented |
| `src/app/admin/market-metrics/page.tsx` | Market Metrics Dashboard (Spec 34) | Implemented |
| `src/app/api/admin/stats/route.ts` | Comprehensive admin stats endpoint (26 fields + pipeline freshness) | Implemented |
| `src/app/api/admin/pipelines/[slug]/route.ts` | Pipeline trigger — 24 slugs (21 individual + 3 chains) | Implemented |
| `src/app/api/admin/sync/route.ts` | Sync runs history and manual trigger | Implemented |
| `src/app/api/admin/builders/route.ts` | Builder enrichment stats and batch trigger | Implemented |
| `src/app/api/admin/rules/route.ts` | Trade mapping rules list and create | Implemented |
| `src/app/api/admin/market-metrics/route.ts` | Market metrics aggregation API | Implemented |
| `src/components/DataQualityDashboard.tsx` | Comprehensive quality dashboard with trends | Implemented |
| `src/components/FreshnessTimeline.tsx` | Pipeline chain visualization with per-step Run buttons | Implemented |
| `src/components/DataSourceCircle.tsx` | Visual pipeline status indicator circles | Implemented |
| `scripts/run-chain.js` | Chain orchestrator — runs permits/coa/sources chains end-to-end | Implemented |
| `migrations/033_pipeline_runs.sql` | Generic pipeline run tracking table with backfill | Implemented |
| `src/lib/quality/types.ts` | Data quality TypeScript interfaces | Implemented |
| `src/lib/quality/metrics.ts` | Quality snapshot capture and DB queries | Implemented |
| `src/tests/admin.ui.test.tsx` | Admin UI tests (sync formatting, duration, status colours) | Implemented |
| `src/tests/quality.logic.test.ts` | Quality logic tests (effectiveness, metrics, chains) | Implemented |
| `src/tests/quality.infra.test.ts` | Quality infrastructure tests | Implemented |
| `src/tests/chain.logic.test.ts` | Chain definition tests (step counts, completeness, slug extraction) | Implemented |
| `src/app/admin/layout.tsx` | Admin layout with sidebar and role check | Planned |
| `src/app/admin/rules/page.tsx` | Trade Rule Editor UI | Planned |
| `src/app/admin/enrichment/page.tsx` | Builder Enrichment Queue UI | Planned |
| `src/app/admin/metrics/page.tsx` | System Metrics page with sparklines | Planned |
| `src/app/admin/users/page.tsx` | User Management page | Planned |
| `src/lib/admin/middleware.ts` | Admin role verification middleware | Planned |

---

## 4. Constraints & Edge Cases

- **Admin role assignment:** Admin roles are assigned manually in Firestore or via Firebase Admin SDK. There is no self-service admin promotion. Initial admin is the project creator.
- **Concurrent sync trigger:** If a sync is already running, the "Trigger Sync" button should be disabled and show "Sync in progress." Attempting to trigger via API while a sync is running returns 409 Conflict.
- **Rule priority conflicts:** Two rules with the same priority and conflicting trades are resolved by the rule with the lower ID (created first). The admin UI should warn about priority conflicts.
- **Rule deletion safety:** Deleting a rule that has matched permits (match_count > 0) requires confirmation. The matches are not undone retroactively; re-classification requires a manual "reclassify all" action.
- **Enrichment retry limits:** Failed enrichments have a maximum retry count of 3. After 3 retries, the item is marked as 'permanently_failed' and requires manual resolution or skip.
- **Metrics query performance:** Counting 237K permits is fast with COUNT(*), but joining for classification rate may be slower. Use approximate counts from `pg_stat_user_tables` for real-time display, with exact counts refreshed every 5 minutes.
- **User management read-only:** Admins can view user data but cannot modify plans, reset passwords, or delete users through the admin panel. These actions require direct access to Stripe dashboard or Firebase console, respectively, for audit trail purposes.
- **Error log storage:** Sync error logs can be verbose. Store only the first 100 errors per sync run. Full error logs are available in Cloud Logging.
- **Admin audit trail:** All admin actions (trigger sync, CRUD rules, retry enrichment) are logged with admin UID, action, timestamp, and affected resource ID. Stored in Firestore `/admin_audit_log/{logId}`.

---

## 5. Data Schema

### Existing Tables (Referenced)

The admin panel reads from these existing tables (defined in their respective specs):

```
sync_runs       - Spec 04: id, started_at, completed_at, status, permits_new,
                  permits_updated, permits_unchanged, errors_count, error_log
trade_mapping_rules - Spec 08: id, trade_slug, rule_type, pattern, priority,
                      is_active, created_at, updated_at
builders        - Spec 11: id, name, enrichment_status, last_attempted,
                  retry_count, error_message
builder_contacts - Spec 11: id, builder_id, phone, email, website
permits         - Spec 01: all columns
permit_trades   - Spec 08: permit_id, trade_id, rule_id
pipeline_runs   - Migration 033: id, pipeline, started_at, completed_at, status,
                  records_total, records_new, records_updated, error_message, duration_ms
```

### Firestore: `/admin_audit_log/{logId}`

```typescript
interface AdminAuditEntry {
  id: string;
  admin_uid: string;
  admin_email: string;
  action: 'trigger_sync' | 'create_rule' | 'update_rule' | 'delete_rule' |
          'test_rule' | 'retry_enrichment' | 'retry_all_enrichment' |
          'manual_enrichment' | 'skip_enrichment';
  resource_type: 'sync_run' | 'trade_mapping_rule' | 'builder';
  resource_id: string | number;
  details: Record<string, any>;      // action-specific metadata
  created_at: Timestamp;
}
```

### TypeScript Interfaces

```typescript
interface SyncRunSummary {
  id: number;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  status: 'running' | 'completed' | 'failed';
  permitsNew: number;
  permitsUpdated: number;
  permitsUnchanged: number;
  errorsCount: number;
}

interface SyncHealthSummary {
  successful7d: number;
  failed7d: number;
  avgDurationSec: number;
  lastSyncAt: Date;
  lastSyncStatus: string;
}

interface RuleTestResult {
  input: string;                     // permit description tested
  matchedRules: {
    ruleId: number;
    tradeSlug: string;
    tradeName: string;
    ruleType: string;
    pattern: string;
    priority: number;
  }[];
  finalClassification: string[];    // trade slugs after priority resolution
}

interface SystemMetrics {
  totalPermits: number;
  classifiedPermits: number;
  classificationRate: number;
  totalUsers: number;
  proSubscribers: number;
  enterpriseSubscribers: number;
  activeRules: number;
  buildersEnriched: number;
  apiRequests24h: number;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Database Schema (`01`) | Upstream | Permits and permit_trades tables for metrics |
| Data Ingestion (`02`) | Upstream | Sync pipeline triggered and monitored |
| Sync Scheduler (`04`) | Upstream | sync_runs table for sync history |
| Trade Taxonomy (`07`) | Reference | Trade names and slugs for rule editor dropdowns |
| Classification Engine (`08`) | Upstream | trade_mapping_rules CRUD, classification testing |
| Builder Enrichment (`11`) | Upstream | Enrichment queue monitoring and retry |
| Authentication (`13`) | Reference | Admin role verification, user data for user management |
| Subscription (`25`) | Reference | Plan data displayed in user management |
| Firebase Auth | External | Admin role stored in Firestore user document |
| Cloud Logging | External | Full sync error logs beyond the first 100 |

---

## 7. Triad Test Criteria

### A. Logic Layer (`src/tests/quality.logic.test.ts`, `src/tests/chain.logic.test.ts`)

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| Quality effectiveness score | Various accuracy/coverage inputs | Weighted score 0-100 | Implemented |
| Pipeline chain definitions | 3 chains exist (permits, coa, sources) | Correct step counts (14, 4, 10) | Implemented |
| All chains end with refresh_snapshot | Check last step of each chain | `refresh_snapshot` slug | Implemented |
| Chain step completeness | Every step slug in chain | Exists in PIPELINE_REGISTRY | Implemented |
| Chain slug extraction | `chain_permits` | `permits` chain ID | Implemented |
| run-chain.js file existence | Check scripts/ directory | File exists | Implemented |
| Sources chain completeness | Sources chain steps | Includes compute_centroids + refresh_snapshot | Implemented |

### B. UI Layer (`src/tests/admin.ui.test.tsx`)

| Test Case | Verification | Status |
|-----------|-------------|--------|
| Sync run duration format | `formatDuration(154000)` → "2m 34s" | Implemented |
| Sync run short duration | `formatDuration(5000)` → "5s" | Implemented |
| Sync status badge colour | `completed` → green, `running` → blue, `failed` → red | Implemented |
| Sync run date formatting | ISO timestamp → human-readable | Implemented |

### C. Infra Layer (`src/tests/quality.infra.test.ts`)

| Test Case | Verification | Status |
|-----------|-------------|--------|
| Quality metrics DB queries | Snapshot capture and retrieval | Implemented |
| Stats endpoint response shape | All 26 fields returned | Implemented |

### Planned Tests (Not Yet Implemented)

| Test Case | Layer | Notes |
|-----------|-------|-------|
| Admin role check - admin/user/unauth | Logic | Requires auth middleware |
| Rule CRUD operations | Logic + Infra | Requires rule editor UI |
| Enrichment retry / retry limit | Logic | Requires enrichment queue |
| Pipeline trigger / 409 conflict | Infra | Integration test |

---

## Operating Boundaries

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
