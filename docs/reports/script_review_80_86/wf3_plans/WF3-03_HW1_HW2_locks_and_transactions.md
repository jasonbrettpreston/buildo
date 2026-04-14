# Active Task: Advisory locks + transaction boundaries across the 80-86 tail
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W1 + H-W2 (paired) · 81-W1/W4, 82-W13, 83-W5/W6/W7, 84-W3, 85-W2/W3, 86-W1/W2, RC-W7

**Scope note:** H-W1 and H-W2 are paired because transactions without locks still allow concurrent-run corruption; locks without transactions still leave crash-partial state. Land together as one coherent plan.

## Context
* **Goal:** Establish uniform concurrency safety across the 80-86 marketplace tail: (1) orchestrator-level advisory lock on run-chain; (2) per-script advisory locks on scripts 81, 82, 85, 86 (84 and 83 already lock, but 83's lock is broken and 84's is correct); (3) wrap multi-statement mutations in `pipeline.withTransaction` in scripts 81, 85, 86; (4) remove row-level try-catch INSIDE the transaction in 83 that defeats atomicity; (5) chunk 84's Phase 2c backfill INSERT.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` §9.1 (transaction boundaries) + §9 concurrent-run policy (spec update H-S10 likely needed in parallel)
* **Key Files:**
  - `scripts/run-chain.js` (orchestrator lock)
  - `scripts/compute-opportunity-scores.js` (81 — lock + txn wrap batch UPDATE)
  - `scripts/update-tracked-projects.js` (82 — lock; txn already exists)
  - `scripts/compute-cost-estimates.js` (83 — fix lock connection pinning; remove row-catch inside txn)
  - `scripts/classify-lifecycle-phase.js` (84 — chunk Phase 2c INSERT inside withTransaction)
  - `scripts/compute-trade-forecasts.js` (85 — lock + txn wrap DELETE+UPSERT)
  - `scripts/compute-timing-calibration-v2.js` (86 — lock + txn wrap N+1 UPSERT loop)
  - `scripts/lib/pipeline.js` (confirm `withTransaction` nested-rollback guard)

## Technical Implementation
* **New/Modified Components:**
  - Advisory lock ID convention: lock ID = spec number. Update 83 from `74` to `83`. New locks: 81, 82, 85, 86. Orchestrator: `hashtext('chain_' + chainId)`.
  - All locks acquired on a dedicated `pool.connect()` client (NOT `pool.query`) so the pg session lock lives on the right backend.
* **Data Hooks/Libs:** existing SDK `pipeline.withTransaction`, no SDK changes expected.
* **Database Impact:** NO — runtime-only. Advisory locks are session-scoped.

## Standards Compliance
* **Try-Catch Boundary:** N/A (pipeline scripts, not API routes).
* **Unhappy Path Tests:** For each script — (a) concurrent-run attempt exits cleanly when lock held; (b) injected crash mid-batch leaves table in valid pre-run state (transaction rollback verified by row-count assertion).
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan

*Large plan — break into PR-sized chunks. Recommend 3 PRs: (A) orchestrator lock + 85/86 locks+txn; (B) 81/82 locks+txn; (C) 83 lock-pin fix + remove row-catch; 84 Phase 2c chunking.*

- [ ] **Rollback Anchor:** Record Git SHA (applied per PR).
- [ ] **State Verification:** For each script, document what data is in-flight during the current (pre-fix) window. Confirm `pipeline.withTransaction` signature + nested-rollback guard.
- [ ] **Spec Review:** Read spec 40 §9.1. Propose spec update declaring advisory-lock-ID convention (lock ID = spec #) and orchestrator chain lock policy.
- [ ] **Reproduction — per script:**
  - Two concurrent test runs on a shared DB; assert second instance exits with "lock held" log and does not write.
  - Inject an exception mid-batch (mock `client.query` to throw on the Nth call); assert post-rollback state equals pre-run state.
- [ ] **Red Light:** All reproduction tests RED without fixes applied.
- [ ] **Fix — in dependency order:**
  1. **Orchestrator lock (run-chain.js):** acquire `pg_try_advisory_lock(hashtext('chain_' || chainId))` at chain entry on a `pool.connect()` client held for chain duration; release in `finally` before `pool.end()`.
  2. **Script 83 lock fix:** change `pool.query(acquire)` + `pool.query(release)` at L399/L551 to use `const lockClient = await pool.connect()`; acquire, run main body against other connections OR through lockClient, release on lockClient in finally, `lockClient.release()`. Change lock ID from 74 → 83.
  3. **Script 83 atomicity fix:** remove the per-row try-catch at `flushBatch` L375–381. Let `withTransaction` rollback the entire batch on any row failure; count the whole batch as failed in outer catch (L453–460).
  4. **Script 85 lock + txn:** add `pg_try_advisory_lock(85)`. Wrap DELETE (L329–344) + batch UPSERT loop (L386–405) in ONE `pipeline.withTransaction`.
  5. **Script 86 lock + txn + batching:** add `pg_try_advisory_lock(86)`. Replace N+1 UPSERT loop (L274–293) with single multi-row `INSERT … VALUES (…),(…) ON CONFLICT DO UPDATE` wrapped in `pipeline.withTransaction`. At 7 columns × 100 rows = 700 params — well under §9.2 limit.
  6. **Script 81 lock + txn:** add `pg_try_advisory_lock(81)`. Wrap multi-batch UPDATE loop (L114–137) in `pipeline.withTransaction`.
  7. **Script 82 lock:** add `pg_try_advisory_lock(82)`. Existing `withTransaction` blocks (L225, L273) already satisfy atomicity.
  8. **Script 84 Phase 2c chunking:** replace single INSERT L591–605 with chunked inserts in `withTransaction`, batches of 5000 via multi-row VALUES.
- [ ] **Pre-Review Self-Checklist:**
  1. Does every advisory lock acquisition pin the same client for release? (Common bug per 83-W5.)
  2. Are all `pool.query` calls inside locked regions converted to `client.query` where a lock client exists, or documented as safe to run on pool?
  3. Does the orchestrator's chain lock release before the `process.exit` on failure path?
  4. Does each script's `finally` block release the lock even on early-return (empty batch, advisory lock held)?
  5. Are there tests that verify concurrent-run second-instance exit and mid-batch crash rollback?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. ✅/⬜ per-step summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: No migrations · §3.1 N/A · §3.2 N/A · factories N/A
- ⬜ API: N/A
- ⬜ UI: N/A
- ✅ Shared Logic: Locks + transactions MUST use same SDK pattern across 6 scripts; drift is the whole reason this exists
- ✅ Pipeline: §9.1 is the primary target · §9.2 verify multi-row INSERT stays under parameter cap · §9.3 idempotency preserved (locks + transactions don't change data semantics)

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
