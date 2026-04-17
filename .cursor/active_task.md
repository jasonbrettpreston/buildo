# Active Task: Pipeline Audit WF3 — CRITICAL/HIGH Bug Fixes
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `bd23aecde0da69171a5baf0ce88acfd3ff061dc4`

## Context
* **Goal:** Fix 10 CRITICAL/HIGH bugs identified by the 10-agent adversarial + independent pipeline audit across the permits and CoA chain scripts.
* **Target Spec:** `docs/specs/pipeline/47_pipeline_script_protocol.md`
* **Key Files:**
  - `scripts/compute-trade-forecasts.js` (2 bugs)
  - `scripts/classify-permits.js` (1 bug)
  - `scripts/link-parcels.js` (1 bug)
  - `scripts/link-massing.js` (1 bug)
  - `scripts/load-coa.js` (2 bugs)
  - `scripts/quality/assert-engine-health.js` (1 bug)
  - `scripts/quality/assert-data-bounds.js` (1 bug)
  - `docs/reports/review_followups.md` (new — MED/LOW/NIT deferrals)

## Technical Implementation

### Bug List (10 fixes)

| # | File | Bug | Severity | Root cause |
|---|------|-----|----------|------------|
| 1 | `assert-engine-health.js:30` | `PING_PONG_RATIO = 10` should be 2 per spec | HIGH | Wrong constant |
| 2 | `assert-data-bounds.js:98` | Cost outlier threshold `>= 20` should be `> 0`; WARN → FAIL | HIGH | Should be any single record |
| 3 | `compute-trade-forecasts.js:146` | `new Date()` instead of DB `SELECT NOW()` for `runAt` | CRITICAL | Midnight Cross drift |
| 4 | `compute-trade-forecasts.js:311` | `upserted += currentBatch.length` instead of `rowCount` | HIGH | Over-reports records_updated |
| 5 | `classify-permits.js:78,118,135` | `Date.now()` in scoring/phase helpers not using `RUN_AT` | HIGH | Midnight Cross drift |
| 6 | `link-parcels.js:419` | `linked_at` missing from INSERT column list → NULL on first link | CRITICAL | Column omitted from INSERT |
| 7 | `link-massing.js:143` | `linked_at` missing from INSERT column list → NULL on first link | CRITICAL | Column omitted from INSERT |
| 8 | `load-coa.js:208` | `computeHash(raw)` hashes CKAN metadata (`_id`, `_full_text`) → phantom updates | HIGH | Wrong hash input |
| 9 | `load-coa.js` | `last_seen_at` not updated for unchanged records (IS DISTINCT FROM blocks it) | HIGH | False staleness positives |
| 10 | `load-coa.js` | `upsertBatch` issues one INSERT per record in a loop (N+1) | CRITICAL | 33K sequential queries |

**Note on fix #10 (N+1):** This is architectural — a batch VALUES insert is needed. Given the scope, this is the largest single fix. Included here because it's CRITICAL severity.

### Deferred to `docs/reports/review_followups.md`
- `classify-lifecycle-phase.js`: ON CONFLICT on transitions INSERT (needs a migration + UNIQUE constraint first)
- `link-massing.js`: PostGIS vs JS fallback confidence mismatch (0.90 vs 0.95)
- `assert-engine-health.js`: dead tuple WARN → FAIL (spec ambiguous; auto-vacuum already runs)
- SPEC LINK rot across all scripts (non-functional, housekeeping)
- All MED/LOW/NIT findings from 10 agents

## Standards Compliance
* **Try-Catch Boundary:** N/A — modifying pipeline scripts that already have error handling
* **Unhappy Path Tests:** N/A — pipeline scripts have no vitest unit test harness
* **logError Mandate:** N/A — no API routes modified
* **Mobile-First:** N/A — backend-only

## Execution Plan
- [x] **Rollback Anchor:** `bd23aecde0da69171a5baf0ce88acfd3ff061dc4`
- [ ] **State Verification:** Read each script to confirm bug location before editing
- [ ] **Spec Review:** §47 §6.1 (RUN_AT), §6.3 (batch safety), §9.3 (IS DISTINCT FROM)
- [ ] **Reproduction:** N/A — no unit test harness; bugs confirmed by code inspection
- [ ] **Red Light:** N/A
- [ ] **Fix:** Apply all 10 fixes (bugs #1-10)
- [ ] **Pre-Review Self-Checklist:** 5 sibling checks after all fixes
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` — all pass
- [ ] **Append review_followups.md:** Write all MED/LOW/NIT findings
- [ ] **WF6 → Atomic commit per script**
