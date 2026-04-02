# Active Task: WF2 — B4 Memory Overflow Migration (Phase 1 Step 2)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `509681f`

## Context
* **Goal:** Migrate 3 scripts with B4 memory overflow risk to use `pipeline.streamQuery()` or streaming patterns, preventing V8 OOM on large tables.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/link-massing.js`, `scripts/enrich-wsib.js`, `scripts/load-wsib.js`

## State Verification
Spot-check found only 3 of 6 scripts actually need migration:

| Script | Risk | Root Cause | Action |
|--------|------|-----------|--------|
| `link-massing.js` | **HIGH** | Line 163: loads ALL `building_footprints` into memory for grid index | Migrate to `streamQuery()` for grid build |
| `enrich-wsib.js` | **MEDIUM** | Line 270: full `SELECT` loads all unenriched entries | Migrate to `streamQuery()` for queue iteration |
| `load-wsib.js` | **MEDIUM** | Line 132: `seen` Map accumulates all Class G rows before upsert | Stream + batch: flush dedup window periodically |
| `compute-centroids.js` | LOW | Already uses keyset pagination + BATCH_SIZE | **No change needed** |
| `load-massing.js` | LOW | Already streams via shapefile reader | **No change needed** |
| `load-parcels.js` | LOW | Already streams via csv-parse | **No change needed** |

## Technical Implementation

### Fix 1: `link-massing.js` — Stream building footprints into grid (HIGH)
**Current (line 163):** `const bfResult = await pool.query('SELECT id, geometry, ... FROM building_footprints WHERE ...')` → all rows in memory
**Fix:** Replace with `for await (const row of pipeline.streamQuery(pool, sql))` to build the grid index incrementally. The grid Map itself must still be in memory (it's the spatial index), but the raw pg result buffer is freed row-by-row instead of holding the entire table.

### Fix 2: `enrich-wsib.js` — Stream enrichment queue (MEDIUM)
**Current (line 270):** `const { rows: entries } = await pool.query(...)` → all entries loaded
**Fix:** Replace with `pipeline.streamQuery()`. Process entries one-by-one inside the `for await` loop instead of indexing into an array. The LIMIT is already present, so the risk is bounded, but streaming avoids the upfront materialization.

### Fix 3: `load-wsib.js` — Streaming dedup with periodic flush (MEDIUM)
**Current (line 132):** `const seen = new Map()` accumulates all unique rows from CSV before batch insert.
**Fix:** This is a CSV streaming issue, not a DB query issue — `streamQuery` doesn't apply. Instead, flush the `seen` Map in batches (e.g., every 5000 rows) and rely on the `ON CONFLICT DO UPDATE` upsert to handle inter-batch duplicates. This caps peak memory at batch_size instead of total_unique_rows.

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline scripts, SDK handles errors
* **Unhappy Path Tests:** Source-level assertions on streamQuery usage in link-massing.js and enrich-wsib.js
* **logError Mandate:** N/A — uses pipeline SDK logging
* **Mobile-First:** N/A — backend scripts

## Execution Plan
- [ ] **State Verification:** 3 scripts confirmed, 3 already safe
- [ ] **Contract Definition:** N/A — no API routes
- [ ] **Spec Update:** N/A — no new SDK exports (streamQuery already documented)
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add source-level tests for streamQuery usage in link-massing.js and enrich-wsib.js; test for batch-flush pattern in load-wsib.js
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:**
  - [ ] Migrate `link-massing.js` grid build to `streamQuery()`
  - [ ] Migrate `enrich-wsib.js` queue fetch to `streamQuery()`
  - [ ] Refactor `load-wsib.js` dedup Map to flush in batches
- [ ] **UI Regression Check:** N/A — backend only
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
