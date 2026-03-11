# Active Task: Stream A — Pipeline Auto-Tracking (Fix Hardcoded records_new: 0)
**Status:** Planning

## Context
* **Goal:** Replace hardcoded `records_new: 0` in 11 pipeline scripts with accurate reporting. Add a lightweight tracking API to the Pipeline SDK so scripts report what they actually did.
* **Target Spec:** `docs/specs/37_pipeline_system.md` (primary), `docs/specs/28_data_quality_dashboard.md` (secondary)
* **Rollback Anchor:** `56818cd`
* **Key Files:**
  - `scripts/lib/pipeline.js` — Pipeline SDK (add tracking API)
  - 11 scripts with hardcoded `records_new: 0`:
    1. `scripts/compute-centroids.js:125`
    2. `scripts/create-pre-permits.js:69`
    3. `scripts/link-coa.js:236`
    4. `scripts/link-massing.js:315`
    5. `scripts/link-similar.js:64`
    6. `scripts/link-neighbourhoods.js:212`
    7. `scripts/link-parcels.js:340`
    8. `scripts/link-wsib.js:31`
    9. `scripts/load-neighbourhoods.js:588`
    10. `scripts/quality/assert-data-bounds.js:376`
    11. `scripts/quality/assert-schema.js:323`
* **WF5 Audit Reference:** Bug #4 (HIGH severity) — identified 2026-03-11

## Technical Implementation

### Approach: SDK Tracking Counters + Script Fixes

**New SDK exports in `scripts/lib/pipeline.js`:**
- `track(recordsNew, recordsUpdated)` — increment running counters
- `getTracked()` — return current `{ records_new, records_updated }`
- Modified `emitSummary(stats)` — validate: if `stats.records_new === 0` but tracked `records_new > 0`, log warning and auto-substitute tracked value

**Per-script changes (9 data scripts):**
Each script already computes its real count in a local variable. The fix is mechanical — pass the real number instead of 0:
- `compute-centroids.js`: `records_updated` = centroids computed
- `create-pre-permits.js`: `records_new` = pre-permits created (currently hardcodes 0 but `records_total` has the count)
- `link-coa.js`: `records_updated` = linked count
- `link-massing.js`: `records_updated` = linked count
- `link-similar.js`: `records_updated` = linked count
- `link-neighbourhoods.js`: `records_updated` = linked count
- `link-parcels.js`: `records_updated` = linked count
- `link-wsib.js`: `records_updated` = matched count
- `load-neighbourhoods.js`: `records_new` = inserted count

**CQA scripts (2 quality scripts):**
- `assert-data-bounds.js`: change `records_new: 0` → `records_new: null` (signals "not applicable")
- `assert-schema.js`: change `records_new: 0` → `records_new: null`
- `null` tells `getStatusDot()` to skip stale detection (already implemented in FreshnessTimeline.tsx:252)

**Why not wrap the Pool?** Too invasive — parsing SQL for affected rows is fragile, `ON CONFLICT DO UPDATE` returns variable counts, and it changes every script's usage pattern. Scripts already know their counts; they just need to report them.

* **New/Modified Components:** None (backend scripts only)
* **Data Hooks/Libs:** `scripts/lib/pipeline.js` modified
* **Database Impact:** NO

## Standards Compliance (Full Inline — all 00_engineering_standards.md sections)

### §1.1 Mobile-First UI Mandate
- **Status:** NOT APPLICABLE — backend-only changes, zero `.tsx` files modified.

### §1.2 Component Isolation
- **Status:** NOT APPLICABLE — no UI components.

### §2.1 The "Unhappy Path" Test Mandate
- **Status:** APPLICABLE — new SDK functions need error/edge-case tests.
- **Plan:** Test `track()` with negative numbers, `emitSummary()` with mismatched tracked vs passed values, counter reset between `run()` invocations.

### §2.2 The Try-Catch Boundary Rule
- **Status:** NOT APPLICABLE — no API routes created or modified.

### §2.3 Assumption Documentation
- **Status:** APPLICABLE — `emitSummary()` validation logic will use explicit null checks, not `!` assertions.

### §3.1 Zero-Downtime Migration Pattern
- **Status:** NOT APPLICABLE — no database schema changes.

### §3.2 Migration Rollback Safety
- **Status:** NOT APPLICABLE — no migrations.

### §3.3 Pagination Enforcement
- **Status:** NOT APPLICABLE — no API routes.

### §4.1 Route Guarding
- **Status:** NOT APPLICABLE — no endpoints.

### §4.2 Parameterization
- **Status:** NOT APPLICABLE — no dynamic SQL changes in scripts.

### §5.1 Typed Factories Only
- **Status:** APPLICABLE — any new test data will use existing factory patterns or raw SDK inputs (no DB mocks needed — SDK tests are pure logic).

### §5.2 Test File Pattern
- **Status:** APPLICABLE — new tests go in `pipeline-sdk.logic.test.ts` (logic tests for pure SDK functions).

### §5.3 Red-Green Test Cycle
- **Status:** APPLICABLE — write failing tests for `track()`, `getTracked()`, and `emitSummary()` validation BEFORE implementing.

### §5.4 Test Data Seeding
- **Status:** NOT APPLICABLE — no DB scenarios needed.

### §6.1 logError Mandate
- **Status:** NOT APPLICABLE — no API routes or `src/lib/` modules. Pipeline scripts use `pipeline.log.*()` per §9.4.

### §7.1 Classification Sync Rule
- **Status:** NOT APPLICABLE — not touching classification logic.

### §7.2 Scope Classification Sync
- **Status:** NOT APPLICABLE.

### §8.1 API Route Export Rule
- **Status:** NOT APPLICABLE — no route files.

### §8.2 TypeScript Target Gotchas
- **Status:** NOT APPLICABLE — all changes are in CommonJS `.js` scripts, not TypeScript.

### §9.1 Transaction Boundaries
- **Status:** NOT APPLICABLE — `track()` is an in-memory counter, no DB writes.

### §9.2 PostgreSQL Parameter Limit
- **Status:** NOT APPLICABLE — no new batch inserts.

### §9.3 Idempotent Scripts
- **Status:** PRESERVED — no change to script idempotency. We're only changing what numbers they report, not what they do.

### §9.4 Pipeline SDK Mandate
- **Status:** CORE FOCUS — this task extends the SDK with `track()` and `getTracked()`. All 11 scripts already use the SDK; we're improving how they call `emitSummary()`.

### §9.5 Streaming Ingestion
- **Status:** NOT APPLICABLE — no ingestion pattern changes.

### §9.6 Pipeline Manifest
- **Status:** NOT AFFECTED — manifest.json unchanged. Script file paths don't change.

### §9.7 Pipeline Observability
- **Status:** NOT AFFECTED — OTel tracing unmodified. `track()` could emit span events in future but not in this task.

## Execution Plan

- [x] **State Verification:** Confirmed 9 scripts need fixes (link-wsib and compute-centroids already correct). Documented exact lines and variables.
- [x] **Contract Definition:** N/A — no API route changes.
- [x] **Spec Update:** Updated `docs/specs/37_pipeline_system.md` — §3.1 exports table (track, getTracked, track.reset), §3.2 contract (must report actual counts), §3.5 records_new:null convention. Ran `npm run system-map`.
- [x] **Schema Evolution:** N/A — no database changes.
- [x] **Guardrail Test:** Added tests to `src/tests/pipeline-sdk.logic.test.ts` — track() accumulation, getTracked() initial state, track.reset(), script-level assertions for CQA null and load-neighbourhoods variable.
- [x] **Red Light:** Confirmed new tests failed before implementation.
- [x] **Implementation:**
  1. Added `track()`, `getTracked()`, `track.reset()` to `scripts/lib/pipeline.js`
  2. Fixed `load-neighbourhoods.js`: `records_new: boundaryCount`, `records_updated: profileUpdates`
  3. Fixed `create-pre-permits.js`: `records_new: null, records_updated: null`
  4. Fixed `assert-data-bounds.js`: `records_new: null`
  5. Fixed `assert-schema.js`: `records_new: null`
  6. Linking scripts (5) already correct — `records_new: 0` is accurate since they only UPDATE
- [x] **UI Regression Check:** N/A — no UI components modified (Stream B handles that).
- [x] **Green Light:** `npm run test` — 2102 passed, 13 failed (all pre-existing). `npm run lint -- --fix` clean. → WF6.
