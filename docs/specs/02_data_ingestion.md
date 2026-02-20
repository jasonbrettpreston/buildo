# Spec 02 -- Data Ingestion Pipeline

## 1. User Story

> As a system, I need to download and parse the 220 MB Toronto Open Data JSON
> feed daily, mapping raw UPPER_CASE fields to clean snake_case database records
> so that the permits table always reflects the latest City of Toronto data.

## 2. Technical Logic

### Pipeline Overview

```
Toronto Open Data JSON (220 MB, ~237K records)
  -> stream-json parser (bounded memory)
    -> StreamArray (one object at a time)
      -> batch accumulator (5000 records)
        -> onBatch callback (field-mapping + DB upsert)
```

### Stream Parser (`parsePermitsStream`)

- Uses `stream-json` library with `StreamArray` streamer to parse root-level
  JSON arrays without loading the entire file into memory.
- Implements backpressure: when a batch is being processed, the readable stream
  is paused (`pipeline.pause()`), preventing unbounded buffering. Processing
  resumes via `pipeline.resume()` after the batch callback completes.
- Default batch size is **5000 records**. The final partial batch is flushed
  after the stream ends.
- Returns the total number of records processed as a `Promise<number>`.
- Error handling: stream errors reject the promise; batch processing errors
  propagate via `pipeline.destroy(err)`.

### Field Mapping (`mapRawToPermit`)

Maps all 30 fields from the `RawPermitRecord` (UPPER_CASE) interface to the
`Permit` (snake_case) interface:

| Raw Field (UPPER_CASE) | DB Column (snake_case) | Transform |
|------------------------|----------------------|-----------|
| `PERMIT_NUM` | `permit_num` | Direct pass-through |
| `REVISION_NUM` | `revision_num` | Direct pass-through |
| `PERMIT_TYPE` | `permit_type` | Direct pass-through |
| `STRUCTURE_TYPE` | `structure_type` | Direct pass-through |
| `WORK` | `work` | Direct pass-through |
| `STREET_NUM` | `street_num` | Direct pass-through |
| `STREET_NAME` | `street_name` | Direct pass-through |
| `STREET_TYPE` | `street_type` | Direct pass-through |
| `STREET_DIRECTION` | `street_direction` | `trimToNull()` -- trims whitespace, returns null if empty |
| `CITY` | `city` | Direct pass-through |
| `POSTAL` | `postal` | Direct pass-through |
| `GEO_ID` | `geo_id` | Direct pass-through |
| `BUILDING_TYPE` | `building_type` | Direct pass-through |
| `CATEGORY` | `category` | Direct pass-through |
| `APPLICATION_DATE` | `application_date` | `parseDate()` -- `Date.parse()` with null for empty/invalid |
| `ISSUED_DATE` | `issued_date` | `parseDate()` |
| `COMPLETED_DATE` | `completed_date` | `parseDate()` |
| `STATUS` | `status` | Direct pass-through |
| `DESCRIPTION` | `description` | Direct pass-through |
| `EST_CONST_COST` | `est_const_cost` | `cleanCost()` -- strips non-numeric chars, handles `"DO NOT UPDATE OR DELETE"` |
| `BUILDER_NAME` | `builder_name` | Direct pass-through |
| `OWNER` | `owner` | Direct pass-through |
| `DWELLING_UNITS_CREATED` | `dwelling_units_created` | `parseInt(..., 10) \|\| 0` |
| `DWELLING_UNITS_LOST` | `dwelling_units_lost` | `parseInt(..., 10) \|\| 0` |
| `WARD` | `ward` | Direct pass-through |
| `COUNCIL_DISTRICT` | `council_district` | Direct pass-through |
| `CURRENT_USE` | `current_use` | Direct pass-through |
| `PROPOSED_USE` | `proposed_use` | Direct pass-through |
| `HOUSING_UNITS` | `housing_units` | `parseInt(..., 10) \|\| 0` |
| `STOREYS` | `storeys` | `parseInt(..., 10) \|\| 0` |

### Data Cleaning Functions

**`parseDate(value)`**
- Returns `null` for empty, undefined, or whitespace-only strings.
- Calls `Date.parse()` on trimmed input; returns `null` if result is `NaN`.
- Handles ISO 8601 format from the feed (e.g., `"2024-01-15T00:00:00.000"`).

**`cleanCost(value)`**
- Returns `null` for empty/undefined values.
- Returns `null` if value contains the literal `"DO NOT UPDATE OR DELETE"` (known data quality issue in the Toronto feed).
- Strips all non-numeric characters except `.` and `-` via regex `[^0-9.\-]`.
- Calls `parseFloat()`; returns `null` if result is `NaN`.

**`trimToNull(value)`**
- Returns `null` for falsy values.
- Trims whitespace; returns `null` if result is empty string.
- Used for `STREET_DIRECTION` which sometimes contains only whitespace.

### Sync Orchestrator (`runSync`)

1. Creates a `sync_runs` record with `status = 'running'`.
2. Calls `parsePermitsStream()` with a callback that invokes `processBatch()` per batch.
3. Aggregates `SyncStats` across all batches (`total`, `new_count`, `updated`, `unchanged`, `errors`).
4. On success: updates `sync_runs` to `status = 'completed'` with counts and `duration_ms`.
5. On failure: updates `sync_runs` to `status = 'failed'` with `error_message`.

## 3. Associated Files

| File | Role |
|------|------|
| `src/lib/sync/ingest.ts` | `parsePermitsStream()` -- stream-json parser with backpressure and batching |
| `src/lib/permits/field-mapping.ts` | `mapRawToPermit()`, `parseDate()`, `cleanCost()`, `trimToNull()` |
| `src/lib/permits/types.ts` | `RawPermitRecord` (30 UPPER_CASE fields), `Permit` (30 snake_case fields + metadata), `SyncRun`, `SyncStats` |
| `src/lib/sync/process.ts` | `processBatch()` -- per-record upsert logic; `runSync()` -- full sync orchestrator |
| `src/app/api/sync/route.ts` | POST endpoint to trigger sync via `runSync(filePath)` |
| `src/tests/permits.logic.test.ts` | Unit tests for field mapping |
| `src/tests/sync.logic.test.ts` | Unit tests for sync/batch processing |
| `src/tests/factories.ts` | `createMockRawPermit()` -- factory for test data |

## 4. Constraints & Edge Cases

- **Memory**: The 220 MB file must not be loaded entirely into memory. The stream-json parser keeps memory bounded. Batch size (5000) controls the working-set size.
- **`EST_CONST_COST` containing `"DO NOT UPDATE OR DELETE"`**: This is a known data quality issue in the Toronto Open Data feed. The `cleanCost()` function explicitly checks for this string and returns `null`.
- **Whitespace-only `STREET_DIRECTION`**: Some records have `" "` instead of an empty string. `trimToNull()` handles this.
- **Empty date strings**: The feed uses `""` for null dates. `parseDate()` returns `null`.
- **Integer fields defaulting to 0**: `DWELLING_UNITS_CREATED`, `DWELLING_UNITS_LOST`, `HOUSING_UNITS`, `STOREYS` all use `parseInt(..., 10) || 0` so non-numeric or empty strings become `0`.
- **Batch boundary**: The final batch may contain fewer than 5000 records and is flushed after the stream ends.
- **Backpressure**: If the `onBatch` callback is slow (e.g., waiting on DB writes), the stream is paused to avoid memory buildup. A boolean `processing` flag prevents re-entrant batch flushes.
- **Error isolation**: Each record in `processBatch()` runs in its own transaction. A single bad record does not roll back the entire batch.
- **File path validation**: The API endpoint requires `file_path` in the POST body; returns 400 if missing.

## 5. Data Schema

### RawPermitRecord (input)

```typescript
interface RawPermitRecord {
  PERMIT_NUM: string;
  REVISION_NUM: string;
  PERMIT_TYPE: string;
  STRUCTURE_TYPE: string;
  WORK: string;
  STREET_NUM: string;
  STREET_NAME: string;
  STREET_TYPE: string;
  STREET_DIRECTION: string;
  CITY: string;
  POSTAL: string;
  GEO_ID: string;
  BUILDING_TYPE: string;
  CATEGORY: string;
  APPLICATION_DATE: string;
  ISSUED_DATE: string;
  COMPLETED_DATE: string;
  STATUS: string;
  DESCRIPTION: string;
  EST_CONST_COST: string;
  BUILDER_NAME: string;
  OWNER: string;
  DWELLING_UNITS_CREATED: string;
  DWELLING_UNITS_LOST: string;
  WARD: string;
  COUNCIL_DISTRICT: string;
  CURRENT_USE: string;
  PROPOSED_USE: string;
  HOUSING_UNITS: string;
  STOREYS: string;
}
```

### Permit (output -- maps to `permits` table)

See Spec 01, Section 5.

### SyncStats (runtime aggregate)

```typescript
interface SyncStats {
  total: number;
  new_count: number;
  updated: number;
  unchanged: number;
  errors: number;
}
```

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Toronto Open Data | Read | JSON feed, ~220 MB, ~237K records. URL: `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/...` |
| Node.js `fs` | Read | `createReadStream(filePath)` for streaming |
| `stream-json` npm | Process | `parser()` + `streamArray()` for streaming JSON parse |
| PostgreSQL | Write | `processBatch()` writes to `permits`, `permit_history`, `permit_trades` tables |
| Next.js API | Trigger | `POST /api/sync` accepts `{ file_path }` and invokes `runSync()` |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | `mapRawToPermit()` maps all 30 fields | Output object has every expected key with correct value |
| L02 | `parseDate("")` returns null | Empty string yields null, not Invalid Date |
| L03 | `parseDate("2024-01-15T00:00:00.000")` returns valid Date | Date object with correct year/month/day |
| L04 | `parseDate("not-a-date")` returns null | Invalid input yields null |
| L05 | `cleanCost("150000")` returns 150000 | Numeric string parsed correctly |
| L06 | `cleanCost("$1,500,000.00")` returns 1500000 | Strips `$` and `,` |
| L07 | `cleanCost("DO NOT UPDATE OR DELETE")` returns null | Known bad data handled |
| L08 | `cleanCost("")` returns null | Empty string yields null |
| L09 | `cleanCost(null)` returns null | Null input yields null |
| L10 | `trimToNull("  W  ")` returns `"W"` | Trims whitespace |
| L11 | `trimToNull("   ")` returns null | Whitespace-only yields null |
| L12 | `trimToNull("")` returns null | Empty string yields null |
| L13 | Integer fields default to 0 for non-numeric input | `mapRawToPermit({ STOREYS: "abc" })` produces `storeys: 0` |
| L14 | Integer fields parse valid numbers | `mapRawToPermit({ HOUSING_UNITS: "5" })` produces `housing_units: 5` |

### B. UI Layer

N/A -- the ingestion pipeline has no visual component. The `POST /api/sync` endpoint is API-only (see Spec 06).

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Stream-parse a 220 MB JSON file | Memory usage stays below 512 MB (no OOM) |
| I02 | Batch size of 5000 is honored | `onBatch` receives arrays of exactly 5000 (except the final partial batch) |
| I03 | Backpressure pauses the stream | During slow batch processing, stream does not buffer unboundedly |
| I04 | `runSync()` creates a `sync_runs` record | Record exists with `status = 'running'` at start, `status = 'completed'` at end |
| I05 | `runSync()` records error on failure | `sync_runs.status = 'failed'` and `error_message` is populated |
| I06 | `runSync()` records `duration_ms` | Value is a positive integer |
| I07 | A single bad record does not abort the batch | Transaction rolls back for that record; `stats.errors` increments; remaining records process |
| I08 | `POST /api/sync` without `file_path` returns 400 | Response body contains `{ error: "file_path is required" }` |
