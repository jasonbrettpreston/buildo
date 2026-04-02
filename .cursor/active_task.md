# Active Task: WF2 — B20-B23 Deep Metrics SDK (Phase 4 Step 2)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `092f8ae`

## Context
* **Goal:** Add 4 remaining deep observability capabilities to the Pipeline SDK so all 32 non-Observer scripts automatically inherit them.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/lib/pipeline.js`, `scripts/manifest.json`, `src/tests/pipeline-sdk.logic.test.ts`

## State Verification
| Feature | Status | Work Needed |
|---------|--------|-------------|
| B19 (Velocity) | **DONE** — commit `55ad567` | None |
| B20 (Queue Age) | Missing | SDK helper + manifest schema |
| B21 (Null Rates) | 7/28 scripts declare `telemetry_null_cols` | Expand declarations in manifest |
| B22 (Semantic Bounds) | Partial — assert-data-bounds.js has domain-specific checks | Manifest-driven bounds schema |
| B23 (Error Taxonomy) | Missing | Error categorization in SDK |
| B24/B25 (Bloat Gate) | **DONE** — commit `55ad567` | None |

## Technical Implementation

### Feature 1: Error Taxonomy (B23) — in `pipeline.js`
**Problem:** All errors are logged as plain strings. No way to distinguish timeout vs network vs parse vs DB errors in dashboards.

**Implementation:** Enhance `log.error()` to auto-detect error category:
```js
function classifyError(err) {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') return 'network';
  if (err.code === 'ENOENT') return 'file_not_found';
  if (err.name === 'SyntaxError' || err.message?.includes('JSON')) return 'parse';
  if (err.code?.startsWith('23') || err.code?.startsWith('42')) return 'database'; // PG error codes
  if (err.code === 'ABORT_ERR' || err.message?.includes('timeout')) return 'timeout';
  return 'unknown';
}
```
Add `error_type` field to structured log output. Zero changes needed in scripts — they already use `pipeline.log.error()`.

### Feature 2: Queue Age Tracking (B20) — in `pipeline.js`
**Problem:** No visibility into how long items sit unprocessed in work queues.

**Implementation:** Add `checkQueueAge(pool, table, timestampCol, label)` helper that queries `MIN(timestampCol)` and logs the max queue age. Scripts that have queue-like patterns (incremental WHERE timestamp < X) can call this before processing.

### Feature 3: Null Rate Expansion (B21) — in `manifest.json`
**Problem:** Only 7 of 28 scripts declare `telemetry_null_cols`. Key tables missing coverage.

**Implementation:** Add `telemetry_null_cols` to 12 more scripts in manifest:
- `permits`: load_permits (add issued_date, description, builder_name)
- `builders/entities`: extract_builders (add phone, email)
- `permit_trades`: classify_permits (add classified_at)
- `parcels`: load_parcels (add centroid_lat)
- `building_footprints`: load_massing (add centroid_lat)
- `neighbourhoods`: load_neighbourhoods (add geometry)

### Feature 4: Semantic Bounds Schema (B22) — in `manifest.json` + SDK
**Problem:** Bounds checking only exists in assert-data-bounds.js for permits/CoA. No generalized system.

**Implementation:** Add optional `telemetry_bounds` to manifest.json script entries:
```json
"telemetry_bounds": {
  "permits": {
    "est_const_cost": { "min": 0, "max": 500000000 },
    "storeys": { "min": 1, "max": 100 }
  }
}
```
Add `checkBounds(pool, table, bounds)` to SDK that runs `SELECT COUNT(*) FILTER (WHERE col < min OR col > max)` and logs violations. Opt-in — only scripts with `telemetry_bounds` in manifest run the check.

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — SDK internal (no API routes)
* **Unhappy Path Tests:** Error classification unit tests, queue age edge cases
* **logError Mandate:** N/A — enhancing the SDK log itself
* **Mobile-First:** N/A — backend infrastructure

## Execution Plan
- [ ] **State Verification:** B19 + B24/B25 already done, 4 features remain
- [ ] **Guardrail Test:** Tests for classifyError categories, checkQueueAge, manifest null_cols coverage
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:**
  - [ ] Add `classifyError()` + `error_type` to `log.error()` (B23)
  - [ ] Add `checkQueueAge()` helper (B20)
  - [ ] Expand `telemetry_null_cols` in manifest.json (B21)
  - [ ] Add `telemetry_bounds` schema + `checkBounds()` (B22)
  - [ ] Update spec with new SDK exports
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
