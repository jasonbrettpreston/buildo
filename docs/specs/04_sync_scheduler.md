# Spec 04 -- Sync Scheduler

## 1. Goal & User Story
Run the daily Toronto Open Data sync automatically at 6 AM ET on weekdays with retry logic and failure alerts so that the permits database stays current without manual intervention.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts) |

## 3. Behavioral Contract
- **Inputs:** Cloud Scheduler cron trigger (`0 6 * * 1-5`, `America/Toronto` timezone) publishing to a Pub/Sub topic, or manual `POST /api/sync` with `{ file_path }` body.
- **Core Logic:** Cloud Scheduler fires weekday mornings, delivering a Pub/Sub message to a Cloud Function (planned in `functions/sync-trigger/`). The function downloads the ~220 MB Toronto Open Data feed to `/tmp/`, then calls `POST /api/sync` with the file path. The Next.js API invokes `runSync()` which creates a `sync_runs` audit record (status: running), streams and processes the file via Spec 02, then finalizes the record (completed/failed with counts and `duration_ms`). After successful sync, `captureDataQualitySnapshot()` runs (non-fatal on failure). Retry uses exponential backoff: 3 max attempts (immediate, ~5 min, ~15 min); HTTP 4xx is not retried; after 3 failures the message routes to a dead-letter Pub/Sub topic. Failure alerts email the ops team with sync run ID, error, and timestamp. `GET /api/sync` returns the 20 most recent runs ordered by `started_at DESC`. Re-running sync with the same data is safe due to hash-based change detection (Spec 03). See `SyncRun`, `SyncStats` in `src/lib/permits/types.ts`.
- **Outputs:** A `sync_runs` audit row per execution, updated permits data, optional data quality snapshot, failure alerts on error.
- **Current State (as of 2026-03-04):** Cloud Scheduler is NOT deployed. All pipeline execution is manual-only via the admin dashboard "Run" / "Run All" buttons (`POST /api/admin/pipelines/{slug}`). Schedule labels (Daily, Quarterly, Annual) shown in the UI indicate target refresh cadence, not automated triggers. The `syncTrigger` Cloud Function exists in `functions/src/index.ts` as an HTTP endpoint but is not wired to Cloud Scheduler.
- **Edge Cases:** Cloud Function not yet implemented (currently manual trigger only); no explicit concurrent-sync lock (soft check via `status = 'running'`); Cloud Functions Gen 2 `/tmp/` limited to 512 MB; function timeout up to 60 min (full sync takes 15-30 min); weekend scheduling skipped since Toronto Open Data may not update; `America/Toronto` timezone handles EDT/EST transitions.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`sync.logic.test.ts`): Streaming JSON Parser
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/sync/`
- `src/app/api/sync/route.ts`
- `functions/src/index.ts`
- `functions/src/config.ts`
- `src/tests/sync.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/permits/field-mapping.ts`**: Governed by Spec 02. Do not modify field mapping.
- **`src/app/api/permits/`**: Governed by Spec 06. Do not modify permit API routes.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 02 (Data Ingestion)**: Triggers `runSync()` orchestrator.
- Relies on **Spec 01 (Database Schema)**: Reads/writes `sync_runs` table.
