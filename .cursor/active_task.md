# Active Task: WF2 — B1/B3 Pagination & Loop State (Phase 2)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `7338b00`

## Context
* **Goal:** Fix B1 (OFFSET pagination trap) and add defensive max-iteration guards (B3) across pipeline scripts.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/reclassify-all.js`

## State Verification
Spot-check found only **1 of 7** scripts actually needs changes:

| Script | B1 (OFFSET) | B3 (Loop State) | Action |
|--------|------------|-----------------|--------|
| `reclassify-all.js` | **VULNERABLE** — SQL OFFSET at line 51 | SAFE (offset advances) | Rewrite to keyset pagination + SDK migration |
| `classify-scope.js` | SAFE (keyset) | SAFE | **No change** |
| `compute-centroids.js` | SAFE (keyset) | SAFE | **No change** |
| `link-massing.js` | SAFE (keyset) | SAFE | **No change** |
| `link-neighbourhoods.js` | SAFE (keyset) | SAFE | **No change** |
| `link-parcels.js` | SAFE (keyset) | SAFE | **No change** |
| `load-massing.js` | N/A (streaming) | SAFE | **No change** |

## Technical Implementation

### `reclassify-all.js` — Full rewrite to pipeline SDK + keyset pagination

**Current problems:**
1. **B1:** Uses `OFFSET $2` (line 51) — fragile if table mutated during run, O(N²) performance at scale
2. **Non-SDK:** Creates own `new pg.Pool()` instead of `pipeline.run()` — no structured logging, no pool cleanup on fatal
3. **Manual transactions:** `BEGIN`/`COMMIT`/`ROLLBACK` instead of `pipeline.withTransaction()`
4. **No telemetry:** No PIPELINE_SUMMARY/META emission

**Fix:**
* Replace `OFFSET $2` with keyset `WHERE (permit_num, revision_num) > ($2, $3) ORDER BY permit_num, revision_num LIMIT $1`
* Migrate to `pipeline.run()` for lifecycle management
* Use `pipeline.withTransaction()` for per-batch atomic writes
* Add `pipeline.emitSummary()` and `pipeline.emitMeta()`
* Add `pipeline.progress()` with velocity tracking
* Add max-iteration guard as defense-in-depth

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** pipeline.run() handles fatal errors
* **Unhappy Path Tests:** Source-level assertions on keyset pagination, pipeline SDK usage
* **logError Mandate:** N/A — pipeline SDK logging
* **Mobile-First:** N/A — backend script

## Execution Plan
- [ ] **State Verification:** 6 of 7 scripts already use keyset pagination — confirmed safe
- [ ] **Contract Definition:** N/A — no API routes
- [ ] **Spec Update:** N/A — existing SDK patterns
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add tests: no OFFSET in reclassify-all.js, uses pipeline.run, uses keyset WHERE
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:** Rewrite reclassify-all.js
- [ ] **UI Regression Check:** N/A — backend only
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
