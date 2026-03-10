# Active Task: Pipeline SDK Extraction & A+ Rubric Compliance
**Status:** Complete

## Context
* **Goal:** Extract a shared Pipeline SDK (`scripts/lib/pipeline.js`) that standardizes pool management, transactions, error handling, logging, and PIPELINE_SUMMARY/META emission across all 21 pipeline scripts. Resolve all consistency violations, adopt Google SWE recommendations, and bring every audit dimension to A+.
* **Target Spec:** docs/specs/28_data_quality_dashboard.md + docs/specs/00_engineering_standards.md
* **Key Files:**
  - NEW: `scripts/lib/pipeline.js` — shared Pipeline SDK
  - MODIFY: All 21 pipeline scripts in `scripts/`
  - MODIFY: `scripts/refresh-snapshot.js` — fix DATABASE_URL → PG_* vars
  - MODIFY: `scripts/link-parcels.js` — replace N+1 queries with batch CTE
  - NEW: `src/tests/pipeline-sdk.logic.test.ts` — SDK unit tests
  - NEW: `src/tests/classify-sync.logic.test.ts` — dual-path sync gate

## Technical Implementation

### Phase 1: Pipeline SDK (`scripts/lib/pipeline.js`)
Create a shared module exposing:
- `createPool()` — standard PG_* env var pool creation
- `run(name, fn)` — top-level try/catch/finally with pool.end() + process.exit()
- `withTransaction(pool, fn)` — BEGIN/COMMIT/ROLLBACK with nested catch on rollback
- `emitSummary(stats)` — `PIPELINE_SUMMARY:{json}`
- `emitMeta(reads, writes, external)` — `PIPELINE_META:{json}`
- `progress(label, current, total, startTime)` — standardized progress logging
- `log` object — `{ info, warn, error }` structured JSON logging for scripts

### Phase 2: Migrate All 21 Scripts to SDK
Replace boilerplate in each script:
- Pool init → `const { pool } = pipeline.createPool()`
- Main wrapper → `pipeline.run('script-name', async (pool) => { ... })`
- PIPELINE_SUMMARY/META → `pipeline.emitSummary()` / `pipeline.emitMeta()`
- Bare console.error → `pipeline.log.error()`
- Add transaction wrapping via `pipeline.withTransaction()` for all write scripts

### Phase 3: Fix Specific Audit Findings
1. `refresh-snapshot.js` — switch from DATABASE_URL to PG_* vars
2. `link-parcels.js` — replace N+1 per-permit queries with batch CTE JOINs
3. `load-wsib.js` — ensure pool.end() in all paths
4. Standardize batch sizes (1000 default, document exceptions)
5. Standardize `--full` mode via CLI flag (remove LINK_MASSING_FULL env var)

### Phase 4: Classification Sync Gate
- Create `src/tests/classify-sync.logic.test.ts`
- Import tag-trade matrix from both `classifier.ts` and read `classify-permits.js`
- Assert identical trade assignment for representative permits

### Phase 5: Tests
- `src/tests/pipeline-sdk.logic.test.ts` — SDK function tests
- Update `src/tests/chain.logic.test.ts` if chain definitions change

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK enforces overarching try/catch on every script via `pipeline.run()`
* **Unhappy Path Tests:** SDK tests cover: pool creation failure, transaction rollback, malformed summary emission
* **logError Mandate:** N/A — scripts use `pipeline.log.error()` (scripts are not `src/app/api/`)
* **Mobile-First:** Backend Only, N/A

## Execution Plan
- [ ] **Standards Verification:** Backend-only pipeline refactor. No UI changes. §9.1 transaction compliance is the primary target.
- [ ] **State Verification:** 21 scripts, 7800 lines, all currently working. Must not break any existing behavior.
- [ ] **Spec Update:** Update `docs/specs/28_data_quality_dashboard.md` to document Pipeline SDK protocol.
- [ ] **Schema Evolution:** NO — no database changes needed.
- [ ] **Viewport Mocking:** Backend Only, N/A
- [ ] **Guardrail Test:** Create `src/tests/pipeline-sdk.logic.test.ts` + `src/tests/classify-sync.logic.test.ts`
- [ ] **Red Light:** Run new tests — must fail before implementation.
- [ ] **Phase 1:** Create `scripts/lib/pipeline.js` SDK
- [ ] **Phase 2:** Migrate all 21 scripts to use SDK (atomic commits per script)
- [ ] **Phase 3:** Fix specific audit findings (N+1, DATABASE_URL, batch sizes)
- [ ] **Phase 4:** Create classification sync gate test
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` — all pass
- [ ] **Atomic Commit:** Commit each phase separately
- [ ] **Founder's Audit:** No laziness placeholders, all exports resolve, test coverage complete
