# Spec 04 -- Sync Scheduler

## 1. User Story

> As an operator, I need the daily Toronto Open Data sync to run automatically at
> 6 AM ET on weekdays with retry logic and failure alerts so that the permits
> database stays current without manual intervention.

## 2. Technical Logic

### Architecture

```
Cloud Scheduler (cron)
  -> Pub/Sub topic "sync-trigger"
    -> Cloud Function "sync-trigger"
      -> POST /api/sync { file_path }
        -> runSync(filePath)
          -> parsePermitsStream() + processBatch()
            -> sync_runs audit record
```

### Schedule

- **Cron expression**: `0 6 * * 1-5` (6:00 AM ET, Monday through Friday).
- **Timezone**: `America/Toronto`.
- Toronto Open Data typically publishes updated feeds overnight; 6 AM ensures the
  latest data is available before business hours.

### Trigger Flow

1. **Cloud Scheduler** fires the cron job and publishes a message to a Pub/Sub
   topic.
2. **Cloud Function** (`functions/sync-trigger/`, planned) receives the Pub/Sub
   message and:
   a. Downloads the Toronto Open Data JSON feed to a temporary Cloud Storage
      location (or `/tmp/` in the function).
   b. Sends a `POST /api/sync` request with `{ file_path }` to the Next.js API.
3. The **Next.js API** (`POST /api/sync`) dynamically imports `runSync()` and
   executes the full ingestion pipeline.
4. `runSync()` creates a `sync_runs` record, streams and processes the file, and
   updates the record on completion or failure.
5. **Data quality snapshot** (`captureDataQualitySnapshot()`) is captured after
   sync completes. This records matching coverage metrics across all 6 data
   linking processes into `data_quality_snapshots`. This step is non-fatal — if
   it fails, the sync itself still succeeds (logged as WARNING). See Spec 28.

### Retry Logic

- **Max attempts**: 3 (initial attempt + 2 retries).
- **Backoff strategy**: Exponential backoff with jitter.
  - Attempt 1: immediate.
  - Attempt 2: ~5 minutes delay.
  - Attempt 3: ~15 minutes delay.
- **Retry conditions**: HTTP 5xx from the API, network timeout, Cloud Function
  crash. HTTP 4xx (e.g., missing `file_path`) is not retried.
- **Dead letter**: After 3 failed attempts, the message is routed to a Pub/Sub
  dead-letter topic for manual investigation.

### Failure Alerts

- On sync failure (`sync_runs.status = 'failed'`):
  - Email alert sent to the ops distribution list.
  - Alert includes: sync run ID, error message, timestamp, records processed
    before failure.
- On dead-letter trigger (3 consecutive failures):
  - Escalation email with link to Cloud Logging.

### Sync Runs Audit Table

Every sync execution is recorded in `sync_runs` regardless of outcome:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-increment identifier |
| `started_at` | TIMESTAMP | When the sync began (defaults to `NOW()`) |
| `completed_at` | TIMESTAMP | When the sync ended (null while running) |
| `status` | VARCHAR(20) | `'running'`, `'completed'`, or `'failed'` |
| `records_total` | INTEGER | Total records processed |
| `records_new` | INTEGER | New permits inserted |
| `records_updated` | INTEGER | Changed permits updated |
| `records_unchanged` | INTEGER | Permits with identical hash (only `last_seen_at` touched) |
| `records_errors` | INTEGER | Records that failed individual transaction |
| `error_message` | TEXT | Error details (null on success) |
| `snapshot_path` | VARCHAR(500) | Path to the source file (for debugging) |
| `duration_ms` | INTEGER | Wall-clock duration in milliseconds |

### Current API Endpoints

**`GET /api/sync`** -- Returns the 20 most recent sync runs ordered by `started_at DESC`.

**`POST /api/sync`** -- Triggers a new sync run.
- Body: `{ file_path: string }` (required).
- Returns 400 if `file_path` is missing.
- Returns the `sync_run` record on success.
- Returns 500 with `error` and `message` on failure.

### Manual Trigger

Operators can trigger a sync manually via the API:

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"file_path": "/data/permits-2024-03-01.json"}'
```

## 3. Associated Files

| File | Role |
|------|------|
| `functions/sync-trigger/` | Cloud Function entry point (planned -- not yet implemented) |
| `src/app/api/sync/route.ts` | Next.js API route: `GET` (sync history), `POST` (trigger sync) |
| `src/lib/sync/process.ts` | `runSync(filePath)` -- full sync orchestrator |
| `src/lib/sync/ingest.ts` | `parsePermitsStream()` -- stream parser |
| `migrations/003_sync_runs.sql` | `sync_runs` table DDL |
| `src/lib/permits/types.ts` | `SyncRun`, `SyncStats` interfaces |
| `src/tests/sync.logic.test.ts` | Unit tests for sync process |
| `src/tests/factories.ts` | `createMockSyncRun()` factory |
| `src/lib/quality/metrics.ts` | `captureDataQualitySnapshot()` -- called after sync (Spec 28) |

## 4. Constraints & Edge Cases

- **Cloud Function not yet implemented**: The `functions/sync-trigger/` directory
  is planned. Currently, syncs are triggered manually via the API endpoint.
- **Concurrent sync prevention**: There is no explicit locking mechanism to
  prevent two sync runs from executing simultaneously. The `sync_runs` table can
  be queried for `status = 'running'` as a soft lock, but this is not enforced.
- **File download**: The Cloud Function must download the ~220 MB feed. Cloud
  Functions have a `/tmp/` directory with limited disk space (default 512 MB in
  Gen 2). The download must complete before the function timeout.
- **Function timeout**: Cloud Functions Gen 2 supports up to 60-minute timeout.
  A full sync of 237K records at ~5000/batch could take 15-30 minutes depending
  on DB latency.
- **Idempotency**: Re-running the sync with the same data file is safe -- the
  hash-based change detection (Spec 03) ensures unchanged records are skipped.
- **Weekend data**: Toronto Open Data may not update on weekends, so weekday-only
  scheduling avoids unnecessary processing.
- **Timezone**: The cron runs in `America/Toronto` which observes EDT/EST
  transitions. 6 AM local time shifts UTC offset accordingly.
- **`runSync` duration_ms calculation**: Uses `Date.now() - Date.parse(syncRun.started_at)` which could be slightly off if the DB clock and app clock diverge.

## 5. Data Schema

### SyncRun

```typescript
interface SyncRun {
  id: number;
  started_at: Date;
  completed_at: Date | null;
  status: string;           // 'running' | 'completed' | 'failed'
  records_total: number;
  records_new: number;
  records_updated: number;
  records_unchanged: number;
  records_errors: number;
  error_message: string | null;
  snapshot_path: string | null;
  duration_ms: number | null;
}
```

### SyncStats (in-memory aggregate)

```typescript
interface SyncStats {
  total: number;
  new_count: number;
  updated: number;
  unchanged: number;
  errors: number;
}
```

### API Response Shapes

**`GET /api/sync`**
```json
{
  "runs": [SyncRun, ...]
}
```

**`POST /api/sync`**
```json
{
  "sync_run": SyncRun
}
```

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Google Cloud Scheduler | Trigger | Cron job at `0 6 * * 1-5` America/Toronto |
| Google Cloud Pub/Sub | Message | Delivers trigger message to Cloud Function; dead-letter topic for failed messages |
| Google Cloud Functions | Execute | Downloads feed, calls `POST /api/sync` |
| Toronto Open Data | Download | ~220 MB JSON feed |
| Next.js API | Endpoint | `POST /api/sync` invokes `runSync()` |
| PostgreSQL | Write | `sync_runs` table records every execution |
| Email / alerting | Notify | Failure alerts to ops team (planned) |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | `runSync()` creates a `sync_runs` record at start | Record exists with `status = 'running'` before batch processing begins |
| L02 | `runSync()` updates to `'completed'` on success | `sync_runs.status` is `'completed'` and `completed_at` is set |
| L03 | `runSync()` updates to `'failed'` on error | `sync_runs.status` is `'failed'` and `error_message` is populated |
| L04 | `runSync()` aggregates stats across batches | For a file with 12,000 records (3 batches of 5000 + 1 of 2000), `records_total = 12000` |
| L05 | `runSync()` records `duration_ms` | Value is a positive integer reflecting actual processing time |
| L06 | Retry logic respects max 3 attempts | After 3 failures, the message goes to dead-letter (Cloud Function level) |
| L07 | Retry backoff is exponential | Delay between retries increases (5 min, then 15 min) |
| L08 | HTTP 4xx errors are not retried | `POST /api/sync` returning 400 does not trigger a retry |

### B. UI Layer

N/A -- the scheduler is a backend/infrastructure concern. The `GET /api/sync` endpoint exposes history for potential admin dashboards (see Spec 06).

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Cloud Scheduler fires at 6 AM ET on weekdays | Verify cron expression `0 6 * * 1-5` in `America/Toronto` timezone |
| I02 | Cloud Function receives Pub/Sub message | Function invocation logged in Cloud Logging |
| I03 | Cloud Function downloads the feed successfully | File exists at expected temp path before calling API |
| I04 | `sync_runs` record is created for every execution | No "ghost" runs -- every trigger produces exactly one row |
| I05 | `GET /api/sync` returns recent runs | Returns up to 20 runs ordered by `started_at DESC` |
| I06 | `POST /api/sync` without `file_path` returns 400 | Response: `{ error: "file_path is required" }` |
| I07 | `POST /api/sync` with valid path returns sync_run | Response contains `sync_run` object with final status |
| I08 | Dead-letter topic receives messages after 3 failures | Message lands in dead-letter Pub/Sub topic |
| I09 | Failure alert email is sent | Email contains sync run ID, error message, and timestamp |
