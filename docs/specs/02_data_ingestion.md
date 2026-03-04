# Spec 02 -- Data Ingestion Pipeline

## 1. Goal & User Story
Download and parse the 220 MB Toronto Open Data JSON feed daily, mapping raw UPPER_CASE fields to clean snake_case database records so that the permits table always reflects the latest City of Toronto data.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts) |

## 3. Behavioral Contract
- **Inputs:** A local JSON file path (220 MB, ~237K records) provided via `POST /api/sync` body or pipeline script.
- **Core Logic:** The stream parser in `src/lib/sync/ingest.ts` uses `stream-json` with `StreamArray` to parse the JSON array one object at a time with backpressure (pauses readable stream during batch processing). Records accumulate in batches of 5000 before invoking the `onBatch` callback; a final partial batch flushes after stream end. Field mapping in `src/lib/permits/field-mapping.ts` converts all 30 UPPER_CASE fields to snake_case via `mapRawToPermit()`. Date fields use `parseDate()` (returns null for empty/invalid strings). Cost uses `cleanCost()` which strips non-numeric characters and returns null for the known `"DO NOT UPDATE OR DELETE"` sentinel. `trimToNull()` handles whitespace-only `STREET_DIRECTION`. Integer fields (`STOREYS`, `HOUSING_UNITS`, `DWELLING_UNITS_*`) default to 0 for non-numeric input. The sync orchestrator `runSync()` in `src/lib/sync/process.ts` creates a `sync_runs` record, streams batches through `processBatch()`, aggregates stats, and finalizes status to completed/failed. See `RawPermitRecord`, `Permit`, `SyncStats` in `src/lib/permits/types.ts`.
- **Outputs:** Upserted rows in the `permits` table, a completed `sync_runs` audit record with counts (total, new, updated, unchanged, errors) and `duration_ms`.
- **Edge Cases:** Memory must stay bounded (stream-json, no full-file load); `cleanCost("DO NOT UPDATE OR DELETE")` returns null; whitespace-only `STREET_DIRECTION` becomes null; each record in `processBatch()` runs in its own transaction (single bad record does not abort batch); `POST /api/sync` returns 400 if `file_path` is missing.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`permits.logic.test.ts, sync.logic.test.ts`): Field Mapping; Permit Hashing; Permit Diff; Streaming JSON Parser
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/sync/ingest.ts`
- `src/lib/permits/field-mapping.ts`
- `src/lib/sync/process.ts`
- `src/app/api/sync/route.ts`
- `scripts/load-permits.js`
- `src/tests/permits.logic.test.ts`
- `src/tests/sync.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/permits/hash.ts`**: Governed by Spec 03. Do not modify change detection logic.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Imports `Permit`, `RawPermitRecord` from `src/lib/permits/types.ts` (read-only).
- Relies on **Spec 03 (Change Detection)**: `processBatch()` calls `computePermitHash()` and `diffPermitFields()`.
