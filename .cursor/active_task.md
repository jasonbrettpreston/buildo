# Active Task: WF3-12 — classify-lifecycle-phase.js Spec 47 Compliance Gaps
**Status:** Done
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3 (Bug Fix)
**Rollback Anchor:** `fe932ff9c2452644517ff66a906260ef7d819e0f`

## Context
* **Goal:** Fix 6 spec 47 violations in `scripts/classify-lifecycle-phase.js` identified by compliance review (3 CRITICAL, 3 WARNING).
* **Target Spec:** `docs/specs/pipeline/47_pipeline_script_protocol.md`
* **Key Files:**
  - `scripts/classify-lifecycle-phase.js` (primary target)
  - `src/tests/classify-lifecycle-phase.infra.test.ts` (update + add tests)

## Bugs to Fix

| # | Severity | Spec § | Issue | Fix |
|---|---------|--------|-------|-----|
| 1 | CRITICAL | §5.5 | Missing SIGTERM handler — advisory lock 85 orphaned on container preemption | Add `process.on('SIGTERM', ...)` + `lockClientReleased` flag |
| 2 | CRITICAL | §6.2 | `pool.query()` for dirty permits (L227) and dirty CoAs (L479) — mandatory streaming tables, OOM on backfill | Replace both with `pipeline.streamQuery`, process inline per batch |
| 3 | CRITICAL | §4.2 | `coa_stall_threshold` read from `logicVars` without Zod validation | Import `validateLogicVars`, define schema, throw on failure |
| 4 | WARNING | §14.1/14.2 | `NOW()` used in SQL batch loops — Midnight Cross drift risk | Capture `RUN_AT` from `SELECT NOW()` at startup; pass as `$N` param to all UPDATEs/INSERTs |
| 5 | WARNING | §3.0 | SPEC LINK points to `docs/reports/lifecycle_phase_implementation.md` (a report, not a spec) | Point to `docs/specs/product/future/84_lifecycle_phase_engine.md` |
| 6 | WARNING | §6.3 | `PERMIT_BATCH_SIZE = 500`, `COA_BATCH_SIZE = 1000` — hardcoded magic numbers | Replace with `Math.floor((65535-1)/N)` formula constants |

## Detailed Fix Notes

### Fix 1: SIGTERM handler + lockClientReleased flag
Register immediately after `pool.connect()`. Use `lockClientReleased` boolean to prevent double-release in finally/SIGTERM race:
```js
const lockClient = await pool.connect();
let lockClientReleased = false;
process.on('SIGTERM', async () => {
  pipeline.log.warn('[classify-lifecycle-phase]', 'Received SIGTERM. Releasing lock and shutting down gracefully...');
  try { await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]); } catch (e) {}
  if (!lockClientReleased) { lockClientReleased = true; lockClient.release(); }
  process.exit(143);
});
```
Skip path sets `lockClientReleased = true` before release. catch block sets flag. finally checks flag.

### Fix 2: Streaming dirty permits + dirty CoAs
**Reorder**: Build bldCmbByPrefix + inspByPermit maps BEFORE streaming (so maps are ready during stream).

Stream dirty permits — classify inline, flush per PERMIT_BATCH_SIZE:
```js
let dirtyPermitsCount = 0;
let permitBatch = [];
for await (const row of pipeline.streamQuery(pool, DIRTY_PERMITS_SQL)) {
  dirtyPermitsCount++;
  /* inline classify via bldCmbByPrefix + inspByPermit */
  permitBatch.push(classified);
  if (permitBatch.length >= PERMIT_BATCH_SIZE) {
    await flushPermitBatch(); // withTransaction: phase UPDATE + transitions INSERT + stamp UPDATE
    permitBatch = [];
  }
}
if (permitBatch.length > 0) await flushPermitBatch(); // flush remainder
```

Stream dirty CoAs — same per-batch inline pattern. Use `dirtyPermitsCount` / `dirtyCoAsCount` in place of removed `dirtyPermits.length` / `dirtyCoAs.length`.

### Fix 3: Zod validation
```js
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

const LIFECYCLE_CONFIG_SCHEMA = z.object({
  coa_stall_threshold: z.number().positive(),
});
// after loadMarketplaceConfigs:
const validation = validateLogicVars(logicVars, LIFECYCLE_CONFIG_SCHEMA, 'classify-lifecycle-phase');
if (!validation.valid) {
  throw new Error(`[classify-lifecycle-phase] config validation failed: ${validation.errors.join('; ')}`);
}
```

### Fix 4: RUN_AT — no NOW() in loops
- First query: `const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');`
- Replace `const now = new Date()` with `RUN_AT` (same JS Date, from DB clock)
- `buildPermitUpdateSQL(batchSize)`: `lifecycle_classified_at = $${batchSize*4+1}::timestamptz`, same param for `phase_started_at CASE THEN`
- `buildCoaUpdateSQL(batchSize)`: `lifecycle_classified_at = $${batchSize*3+1}::timestamptz`
- Transition INSERT: RUN_AT as param 5 per row → `j * 7` (7 params, not 6)
- Permit stamp UPDATE: `lifecycle_classified_at = $3::timestamptz`
- CoA stamp UPDATE: `lifecycle_classified_at = $2::timestamptz`
- Phase_started_at backfill: `$1::timestamptz` with `[RUN_AT]`
- Initial transitions backfill: `COALESCE(phase_started_at, $1::timestamptz)` with `[RUN_AT]`
- CoA dirty query days_since_activity: `EXTRACT(EPOCH FROM ($1::timestamptz - last_seen_at))` with `[RUN_AT]` as streamQuery param

### Fix 5: SPEC LINK
```js
 * SPEC LINK: docs/specs/product/future/84_lifecycle_phase_engine.md
```
Also update SPEC LINK in test file header.

### Fix 6: Batch size formula
```js
// Transition INSERT is the most param-dense query (7 cols): limits PERMIT_BATCH_SIZE
const PERMIT_TRANSITION_COLS = 7; // permit_num, revision_num, from_phase, to_phase, RUN_AT, permit_type, neighbourhood_id
const PERMIT_BATCH_SIZE = Math.floor((65535 - 1) / PERMIT_TRANSITION_COLS); // = 9362
// CoA UPDATE: 3 data cols + 1 RUN_AT appended = 4 params/row
const COA_COLS = 3; // id, phase, stalled
const COA_BATCH_SIZE = Math.floor((65535 - 1) / (COA_COLS + 1)); // = 16383
```

## Tests to Add / Update

### Update (existing tests broken by fixes):
- `'uses j * 6 (not j * 7)'` → change to `j * 7` (RUN_AT is now param 5)
- `'bumps lifecycle_classified_at ... NOW()'` → match `$3::timestamptz` pattern
- `'runs phase UPDATE and classified_at stamp in the same transaction'` → update NOW() regex to timestamptz
- `'conditionally stamps phase_started_at ... THEN NOW()'` → match `$N::timestamptz`
- `'uses per-batch small transactions'` → update regex for streaming loop pattern

### Add (new spec 47 requirements):
- SIGTERM handler registered after `pool.connect()`
- `lockClientReleased` flag prevents double-release
- `pipeline.streamQuery` used for dirty permits
- `pipeline.streamQuery` used for dirty CoAs
- `validateLogicVars` called with Zod schema for `coa_stall_threshold`
- `RUN_AT` captured from `SELECT NOW()` as first query
- PERMIT_BATCH_SIZE uses `Math.floor` formula, not magic number
- SPEC LINK points to spec file, not report

## Execution Plan
- [x] **Rollback Anchor:** `fe932ff9c2452644517ff66a906260ef7d819e0f`
- [ ] **State Verification:** Script uses `pool.query` for dirty permits/CoAs; no SIGTERM; no Zod; hardcoded batch sizes; NOW() in loops; spec link rot.
- [ ] **Spec Review:** Read §3, §4.2, §5.5, §6.2, §6.3, §14 of spec 47 — done above.
- [ ] **Reproduction:** Update/add failing tests locking in all 6 fixes.
- [ ] **Red Light:** `npx vitest run src/tests/classify-lifecycle-phase.infra.test.ts` — new tests MUST fail.
- [ ] **Fix:** Apply all 6 fixes to `scripts/classify-lifecycle-phase.js`.
- [ ] **Pre-Review Self-Checklist:** 5 sibling bugs checked below.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.

## Sibling Bug Check (WF3 Pre-Review)
| Sibling | Root cause shared? | Status |
|---------|-------------------|--------|
| Same NOW() pattern in compute-trade-forecasts.js | WF3-11 scope; addressed separately | Deferred |
| bldCmbByPrefix also queries permits table via pool.query | Single-column query, builds Map<string,Set<string>> ~5MB; bounded; not flagged by reviewer | Acceptable |
| Phase_started_at backfill UPDATE also uses NOW() | Yes — fixed in Fix 4 as part of this task | ✅ Covered |
| days_since_activity in CoA query uses NOW() | Yes — fixed in Fix 4 using RUN_AT as streamQuery param | ✅ Covered |
| Initial transitions backfill uses NOW() | Yes — fixed in Fix 4 | ✅ Covered |
