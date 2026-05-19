# Active Task: WF1 Phase I.1.1a — close out I.1 deferrals (Deliverables 1-3) (v2 PLAN LOCKED)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline
**Workflow:** WF1 — per Spec 42 §6.11 row "Phase I" + Phase I.1 commit `d579bc0` Pending follow-up scope (split per v1 reviewer round)

---

## Plan revision history
* **v1** — initial plan; ran 4-reviewer round (Gemini + DeepSeek + Independent + Observability). **5 CRIT + 9 HIGH + 12 MED.** All 5 CRITs + most HIGHs concentrated in Deliverable 4 (Spec 84 permit classifier extension): matched_status compression strategy fundamentally wrong (3-way convergence), buildPermitUpdateSQL stride refactor scope underestimated (~50-80 lines not "+10"), classifyLifecyclePhase orphan/BldLed bifurcation can't be flat 9-rule.
* **v2 (this revision) — SPLIT per user authorization:** Phase I.1.1a ships Deliverables 1-3 (test + specs + runbook — all closure work for Phase I.1's ALREADY-shipped writers). Phase I.1.1b (separate future WF) handles Deliverable 4 (Spec 84 permit classifier extension) with its own focused design conversation.

---

## Context

* **Goal:** Close out 3 of 4 items Phase I.1 commit `d579bc0` deferred. Deliverable 4 (Spec 84 permit classifier algorithm extension) is split out to Phase I.1.1b (TBD) because v1 reviewers found 5 CRITs concentrated in that scope alone — matched_status derivation strategy, buildPermitUpdateSQL refactor approach, and rule precedence formalization all need clean design conversations that don't fit a "close out" WF.

* **3 deliverables in v2 (Phase I.1.1a):**
  1. **`.db.test.ts` semantic verification** — runtime tests for what's ALREADY shipped (load-permits.js, load-coa.js, CoA-side classifier) using BEFORE INSERT trigger fault injection for SAVEPOINT WARN path
  2. **Spec amendments** — Spec 42 + Spec 47 + Spec 48 — additive documentation of patterns Phase I.1 already implemented (NOT new mandates against existing scripts)
  3. **Operator runbook** — `docs/runbook/I1_first_deploy_spike.md` mirroring F.1's unnumbered-section format

* **What's explicitly NOT in I.1.1a (moved to Phase I.1.1b):**
  - Spec 84 permit classifier algorithm extension (`classifyLifecyclePhase` return shape change)
  - `buildPermitUpdateSQL` refactor for new column writes
  - `NORMALIZED_PERMIT_STATUS_TO_MATCHED_STATUS_MAP`
  - permits.matched_status startup guard (mirrors mig 146 CoA guard)
  - emitMeta dormant-vs-active permit-side note
  - Activation of dormant filter in `classify-lifecycle-phase.js` flushPermitBatch (lines 1046-1058)

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase I row.

## Substrate (Explore agent + v1 reviewer ground-truth reads)

* **`.db.test.ts` canonical pattern** (`src/tests/db/compute-opportunity-scores.db.test.ts`): uses `execSync('node scripts/...')` + `PG_*` env vars derived from `DATABASE_URL`; queries DOMAIN tables directly post-execution. Hermeticity via `DELETE FROM pipeline_runs` cleanup. `describe.skipIf(!dbAvailable())` for environments without Postgres.
* **`stdio: 'pipe'` required** (v1 Observability O7) for capturing `pipeline.log.warn` to stderr — `'inherit'` pipes to test runner and can't be asserted on.
* **F.1 runbook structure** (`docs/runbook/F1_baseline_quiet_period.md`): UNNUMBERED sections ("Why this runbook exists", "Metrics", "Annotation Protocol", "Exit criteria") — NOT §0-§5. Phase I.1.1a runbook mirrors this format (v1 Observability O3).
* **Spec 48 current sections**: §3.4 is "Error Handling", §3.5 is "PIPELINE_SUMMARY Emission". Dual-pattern subsection needs NEW §3.6 (v1 Observability O4).
* **Spec 47 §R10 + §R3.5 already exist as skeletons.** Phase I.1.1a additions are ADDITIVE documentation (cite Phase I.1's 3 writers as canonical examples), NOT new mandates. v1 Observability O5 + DeepSeek D4 fold.

## Key files

### Tests (NEW — Deliverable 1)

* `src/tests/db/lifecycle-status-history-writers.db.test.ts` (NEW; ~13 test cases). **Scoped to what's already shipped** — load-permits.js, load-coa.js, CoA-side classifier writes. Permit-side classifier dormant filter is verified to NOT fire (regression-lock until Phase I.1.1b activates it).

  - **Test infrastructure:**
    ```ts
    // Use stdio: 'pipe' (NOT 'inherit') to capture stderr for pipeline.log.warn verification
    const result = execSync(`node scripts/${scriptName}.js`, {
      env: childEnv,
      stdio: 'pipe',  // stdout + stderr captured as Buffer; result.stderr accessible
    });
    const stderr = result.toString('utf-8');  // or use spawnSync for separate streams
    ```

  - **`beforeEach` setup:**
    - Cleanup: `DELETE FROM lifecycle_status_history; DELETE FROM pipeline_runs WHERE pipeline IN (...);`
    - Seed fixtures via INSERT statements

  - **Test cases (13):**

    1. **NEW permit → from_status=NULL row written** (load-permits.js)
       - Seed `permits` row with status='Permit Issued' but no prior history
       - Run load-permits.js (with mock CKAN env or pre-seeded raw CKAN payload that matches existing permit unchanged → no status change)
       - **Actually:** since load-permits.js writes ledger rows when CKAN status differs from existing `permits.status`, the simplest test is: seed permit with status='Application'; pre-seed CKAN file fixture (via `LOAD_PERMITS_LOCAL_FILE` env var) with status='Permit Issued'; run; assert ledger row `(from='Application', to='Permit Issued')`. NEW permit (no prior row) — load-permits.js INSERT path → `prev_status` undefined → `from_status=NULL`. Verify the path.

    2. **STATUS-CHANGED permit → from_status=prev, to_status=new** (load-permits.js)
       - Same pattern as test 1; explicit prev → new transition assertion

    3. **UNCHANGED permit → no ledger row** (load-permits.js)
       - Seed permit + CKAN payload with identical status; run; assert COUNT(*) FROM lifecycle_status_history WHERE detected_by='load-permits.js' is 0

    4. **CoA STATUS-CHANGED → ledger row with decision snapshot** (load-coa.js)
       - Seed coa_applications + CKAN file fixture with different status; run load-coa.js; assert ledger row carries decision + decision_date snapshot from new payload

    5. **CoA decision-only change → NO ledger row** (load-coa.js — Q1 regression-lock)
       - Seed coa_applications with status='Hearing Scheduled', decision='Pending'; CKAN payload with same status but decision='Approved'; run; assert NO ledger row (decision-only changes don't fire per Q1 fold)

    6. **Classifier CoA matched_status DIFFERS → ledger row written**
       - Seed coa_applications with old matched_status, raw status producing different classifier result; run classify-lifecycle-phase.js; assert ledger row

    7. **Classifier CoA matched_status IDENTICAL → no ledger row** (Q2 zero-delta regression-lock)
       - Seed coa_applications with matched_status that re-derives identically; run; assert NO ledger row

    8. **Same-batch RUN_AT consistency** (load-permits.js — v1 Independent HIGH 4 fold)
       - Seed 5 permits all changing status; run load-permits.js; assert `COUNT(DISTINCT transitioned_at) FROM lifecycle_status_history WHERE detected_by='load-permits.js' AND lead_id IN (...)` returns 1

    9. **ON CONFLICT dedup within 1 second**
       - Seed permit + CKAN payload with status change; run load-permits.js twice in rapid succession; assert only 1 ledger row exists (the second run is dedup'd by `date_trunc('second')` UNIQUE index)
       - Caveat: if the two runs land in different seconds, the test produces 2 rows. To make the dedup deterministic: explicit timestamp manipulation OR run-twice-with-same-RUN_AT trick.

    10. **Zero-row emission preservation** (v1 Observability HIGH 3 fold)
        - Seed permit with no status change; run load-permits.js; query `pipeline_runs.records_meta->'audit_table'->'rows'`; assert row `{metric: 'lifecycle_status_history_inserted', value: 0, status: 'INFO'}` is present
        - (pipeline_runs IS written from standalone execSync per `compute-opportunity-scores.db.test.ts` precedent — this resolves v1 v2.2 Independent's earlier uncertainty about the populated path)

    11. **SAVEPOINT WARN path via BEFORE INSERT trigger** (v1 4-reviewer convergence on technique; Independent I4 syntax fold)
        - `beforeEach` runs BEFORE the test seed:
          ```sql
          CREATE OR REPLACE FUNCTION test_force_ledger_fail() RETURNS TRIGGER AS $$
          BEGIN
            IF NEW.lead_id = 'permit:TEST-FAIL:00' THEN
              RAISE EXCEPTION 'forced ledger error for SAVEPOINT WARN path test';
            END IF;
            RETURN NEW;
          END $$ LANGUAGE plpgsql;
          CREATE TRIGGER trg_test_force_fail
            BEFORE INSERT ON lifecycle_status_history
            FOR EACH ROW EXECUTE FUNCTION test_force_ledger_fail();
          ```
        - **Use `RETURNS TRIGGER`** (NOT `RETURNING trigger` — that's DML clause; SQL syntax error per v1 Independent I4)
        - Seed permit `permit_num='TEST-FAIL', revision_num='00', status='Application'`; CKAN payload with status='Permit Issued'
        - Run load-permits.js
        - Assertions:
          - `SELECT status FROM permits WHERE permit_num='TEST-FAIL'` returns 'Permit Issued' (primary UPSERT committed despite ledger error)
          - `pipeline_runs.records_meta->'audit_table'` has `verdict='WARN'` (verdict cascade locks here — Phase I.1's existing rows-derived cascade in load-permits.js)
          - `audit_table.rows` contains `{metric: 'lifecycle_status_history_errors', value: 1, status: 'WARN'}`
          - `stderr` (from execSync `stdio: 'pipe'`) contains `[load-permits]` + `ledger write failed` (proxy for `pipeline.log.warn` call — v1 Observability O7 fold)
        - **`afterEach` cleanup (order matters):**
          ```sql
          DROP TRIGGER IF EXISTS trg_test_force_fail ON lifecycle_status_history;
          DROP FUNCTION IF EXISTS test_force_ledger_fail();
          ```
          Drop trigger BEFORE function (FK dependency per v1 Independent I4). Wrap in `try/finally` to always run even on test failure.

    12. **CHECK constraint LIVE enforcement** (v1 Independent MED 2 + DeepSeek MED 9 fold)
        - Wrapped in transaction that ROLLBACKs to avoid state pollution:
          ```ts
          await pool.query('BEGIN');
          try {
            await pool.query(`
              INSERT INTO lifecycle_status_history
                (lead_id, to_status, transitioned_at, detected_by)
              VALUES ('permit:abc:00', 'X', NOW(), 'wrong-script.js')
            `);
            // Should not reach here
            await pool.query('ROLLBACK');
            throw new Error('Expected CHECK violation');
          } catch (err: any) {
            await pool.query('ROLLBACK');
            expect(err.code).toBe('23514');  // check_violation
          }
          ```

    13. **Timezone consistency** (v1 Gemini HIGH 2 fold)
        - `SET TIME ZONE 'America/New_York'`; seed permit + run load-permits.js
        - Assert `SELECT transitioned_at AT TIME ZONE 'UTC' FROM lifecycle_status_history WHERE lead_id = ...` returns the expected UTC value, independent of session timezone

  - **Tests EXCLUDED (deferred to Phase I.1.1b when Spec 84 extension lands):**
    - Permit-side classifier ledger writes (filter is dormant — verified by absence of rows post-classifier-run for permits with `matched_status IS NULL`)
    - Order-of-operations test for permit-side (no classifier writes to lock down)
    - Permit-side zero-delta filter logic test

* **Migration 155 test stays as-is** (already shipped in Phase I.1; doesn't change in I.1.1a).

### Spec amendments (Deliverable 2 — ADDITIVE documentation only)

* **`docs/specs/01-pipeline/42_chain_coa.md`**:
  - **§6.6.A** — add note: "Migration 155 (Phase I.1, commit `d579bc0`) mirrors `matched_status`/`matched_rule`/`unmapped_status` columns onto `permits` (minus `unmapped_decision` — CoA-only). Population of these columns by `classify-lifecycle-phase.js` is deferred to Phase I.1.1b pending Spec 84 algorithm extension."
  - **§6.11 Phase I row** — DELIVERED marker for item (1) with commit SHA `d579bc0`. Add sub-rows for I.1.1a (`[I.1.1a-COMMIT]` placeholder) covering Deliverables 1-3 and a forward-reference to I.1.1b for Spec 84 extension.

* **`docs/specs/01-pipeline/47_pipeline_script_protocol.md`** — ALL ADDITIVE (v1 DeepSeek D4 + Observability O5 fold):
  - **§R3.5 + §6.1 + §14.1 RUN_AT clarification** — ADDITIVE note (not new mandate): "Phase I.1's three writers (`load-permits.js`, `load-coa.js`, `classify-lifecycle-phase.js`) capture `RUN_AT` as the first action INSIDE the `withAdvisoryLock` callback (after lock acquisition) per Spec 47 §6.1's intent. This is the canonical reference for new scripts; existing scripts that capture `RUN_AT` before lock acquisition are grandfathered." Explicitly NOT a retroactive mandate.
  - **§R9** — NEW Tier framework subsection (v1 Independent MED 3 + Observability HIGH 2 fold for decision-rule procedure):
    - **Tier 1 — Core data** (SAVEPOINT FORBIDDEN): `permits`, `coa_applications`, `permit_trades`, `permit_parcels`, `lead_trades`, `lead_parcels`, `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_views`
    - **Tier 2 — Derived data** (SAVEPOINT FORBIDDEN by default): `phase_calibration`, `lifecycle_transitions`, `permit_phase_transitions`, `lead_analytics`
    - **Tier 3 — Audit/ledger** (SAVEPOINT PERMITTED): `lifecycle_status_history`, `pipeline_runs`, `engine_health_snapshots`
    - **Decision-rule procedure** for unclassified tables: (1) algorithm-critical primary output → Tier 1; (2) read by other pipeline scripts for computation → Tier 2; (3) consumed only by observers/audit/reports → Tier 3; (4) ambiguous defaults to Tier 1.
    - **SAVEPOINT pattern documentation** with Phase I.1's 4 SAVEPOINT blocks as canonical example, including nested ROLLBACK try/catch.
  - **§R10 — ADDITIVE note** (NOT new mandate per v1 Observability O5): "Phase I.1 demonstrates the row-derived verdict cascade (`rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'`) as a defense against silent observability failures (the original `load-permits.js` hardcoded `permitAuditHasFails ? 'FAIL' : 'PASS'` boolean omitted WARN entirely)." Existing scripts using boolean verdicts are grandfathered; new scripts SHOULD use the cascade.
  - **§11.2 Overflow Rule footnote** — "Phase I.1's `lifecycle_status_history` ledger counters (`lifecycle_status_history_inserted` INFO + `lifecycle_status_history_errors` WARN) are routed to `audit_table.rows`, NEVER summed into top-level `records_total`/`records_new`/`records_updated`."

* **`docs/specs/01-pipeline/48_pipeline_observability.md`** (v1 Observability O4 fold — slot at NEW §3.6, NOT §3.4):
  - **NEW §3.6 audit_table dual-pattern for ledger writers** — documents Phase I.1's INFO + WARN audit row pair. INFO counter (always emitted, value=0 in steady state). WARN-grade error gate (preserves primary verdict on ledger failures via SAVEPOINT). Verdict derivation MUST be rows-derived. Phase I.1 canonical example.
  - **NEW §3.7 first-deploy spike pattern** — first-deploy of new ledger writers produces a one-time spike; observe-chain 7-day baseline noise window; pre-deploy estimate query; operator pre-ack runbook reference.

### Operator runbook (Deliverable 3 — mirror F.1 unnumbered format per v1 Observability O3)

* `docs/runbook/I1_first_deploy_spike.md` (NEW; mirrors `docs/runbook/F1_baseline_quiet_period.md` structure):

  - **"Why this runbook exists"** — Phase I.1 ships `lifecycle_status_history` ledger writes from 3 writers (load-permits.js, load-coa.js, classify-lifecycle-phase.js CoA-side). The first chain run after deploy will produce a one-time spike in `lifecycle_status_history_inserted` from each writer because none have written before. observe-chain's 7-day baseline doesn't exist yet → DeepSeek narrative may flag CRITICAL/HIGH. Runbook is the operator's pre-ack instrument.

  - **"Metrics emitted by Phase I.1"** (table format mirror F.1):
    | Metric | Script(s) | First-7-days behavior | Steady state |
    |---|---|---|---|
    | `lifecycle_status_history_inserted` | load-permits.js, load-coa.js, classify-lifecycle-phase.js | First run: spike; subsequent: converges to per-run delta | ~10-50 rows/day (load scripts); ~5-30 rows/day (classifier CoA-side) |
    | `lifecycle_status_history_errors` | All 3 | Should be 0 always | 0; non-zero indicates SAVEPOINT WARN path fired (ledger INSERT failed; primary UPSERT survived) |

  - **"Pre-deploy estimate query"** (v1 Gemini G5 + DeepSeek D10 + Observability O2 — corrected math; permit-side classifier dormant pending Phase I.1.1b):
    ```sql
    -- Permit-side: load-permits.js fires on status change between syncs.
    -- First-run spike is permits whose persisted permits.status differs from
    -- CKAN's current status (not 247K — only those that changed since the
    -- table was last synced).
    -- CoA-side: load-coa.js fires similarly on coa_applications.status change.
    -- Classifier CoA-side: fires on matched_status diff (post-E.2 most CoAs
    -- already have matched_status populated; first-run spike is small unless
    -- E.2 hasn't run yet on this DB).
    -- Permit-side classifier: DORMANT until Phase I.1.1b (filter excludes all
    -- rows because permits.matched_status is null and result.matchedStatus is
    -- undefined).
    --
    -- Best upper bound for first-run spike (conservative — assumes ALL rows
    -- have a status change pending):
    SELECT (SELECT COUNT(*) FROM permits WHERE status IS NOT NULL)
         + (SELECT COUNT(*) FROM coa_applications WHERE status IS NOT NULL)
      AS conservative_upper_bound;

    -- Realistic estimate (only rows with stale status):
    SELECT (SELECT COUNT(*) FROM permits WHERE status IS NOT NULL
              AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '24 hours'))
         + (SELECT COUNT(*) FROM coa_applications WHERE status IS NOT NULL
              AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '24 hours'))
      AS realistic_upper_bound;
    ```

  - **"Operator annotation protocol"** (first 7 days):
    - Day 0 (pre-deploy): operator runs both queries; records `conservative_upper_bound` + `realistic_upper_bound`
    - Day 1 (first chain run post-deploy): operator verifies `pipeline_runs.records_meta->>'audit_table'->'rows'` shows `lifecycle_status_history_inserted` ≤ `conservative_upper_bound` for each of the 3 writers
    - Day 7: operator runs convergence query (below); confirms values match steady-state expectation
    - If observe-chain.js DeepSeek narrative flags CRITICAL during days 1-7: operator annotates the report with "Expected Phase I.1 first-deploy spike — within pre-deploy bound — no investigation needed."

  - **"Convergence verification query"** (day 7+):
    ```sql
    SELECT detected_by, COUNT(*) AS rows_last_7_days
      FROM lifecycle_status_history
     WHERE transitioned_at > NOW() - INTERVAL '7 days'
     GROUP BY detected_by
     ORDER BY detected_by;
    -- Expected: 3 detected_by values, each with steady-state row count.
    -- Permit-side classifier rows expected ≈ 0 until Phase I.1.1b ships.
    ```

  - **"Exit criteria"**:
    - observe-chain narrative no longer flags `lifecycle_status_history` first-deploy in 7 consecutive runs
    - Per-writer steady-state rows align with expected daily delta
    - No `lifecycle_status_history_errors` rows > 0 (SAVEPOINT path never fired)

## Technical Implementation

* **DB Impact:** NO new migrations; NO source code changes (Phase I.1 already shipped the writers). I.1.1a is test + docs only.

* **No code changes:** Phase I.1.1a deliverables 1-3 don't modify any `scripts/` or `src/` files. The `.db.test.ts` exercises ALREADY-deployed Phase I.1 code; spec amendments document patterns already in production; runbook describes the spike from already-active writers.

* **Test scaffolding caveats** (v1 fold-ins):
  - `stdio: 'pipe'` for stderr capture in test #11
  - BEFORE INSERT trigger uses `RETURNS TRIGGER` (not `RETURNING trigger`)
  - `afterEach` drops trigger BEFORE function (FK dependency)
  - Test #12 wraps INSERT in transaction with explicit ROLLBACK for isolation

## Standards Compliance
* **Try-Catch Boundary:** test scaffolding only; existing scripts unchanged.
* **Unhappy Path Tests:** SAVEPOINT WARN path; CHECK constraint live enforcement; intra-second dedup; first-observation NULL `from_status`.
* **logError Mandate:** N/A — tests assert on `pipeline.log.warn` via stderr capture.
* **Idempotency:** test scaffolding includes ROLLBACK isolation patterns.

## Execution Plan (WF1 verbatim — `.claude/workflows.md` §WF1)

- [x] **Contract Definition:** N/A — no API route.
- [x] **Spec & Registry Sync:** Spec 42 §6.6.A + Phase I row marker; Spec 47 §6.1 RUN_AT clarification, NEW §7.8 Tier framework, §8.2 row-derived cascade clarification, §11.2 ledger overflow; Spec 48 NEW §3.6 + §3.7.
- [x] **Schema Evolution:** N/A — no new migration.
- [x] **Test Scaffolding:** 1 NEW `.db.test.ts` (`src/tests/db/lifecycle-status-history-writers.db.test.ts`).
- [x] **Red Light:** test skips cleanly without `BUILDO_TEST_DB=1` (no Docker locally); semantic verification kicks in when DB available.
- [x] **Implementation:** .db.test.ts written; 3 specs amended; runbook `docs/runbook/I1_first_deploy_spike.md` created.
- [x] **Auth Boundary & Secrets:** N/A.
- [x] **Pre-Review Self-Checklist:** see §Pre-Review Self-Checklist below.
- [ ] **Multi-Agent Review (PLAN-STAGE 4-reviewer round done; DIFF-STAGE pending user authorization).**
- [ ] **Triage:** Fold BUGs; DEFER → `docs/reports/review_followups.md`.
- [x] **Green Light:** `npm run typecheck` PASS; `npm run lint` clean for new file; `npm run test` 6246 passed / 84 skipped / 230 test files.
- [ ] **WF6 close-out:** commit + docs follow-up filling `[I.1.1a-COMMIT]` in Spec 42 §6.11 row.

## Pre-Review Self-Checklist (v2 sketch — generate full list post-implementation)
1. `.db.test.ts` uses `stdio: 'pipe'` for execSync (NOT `'inherit'`); stderr captured + assertable for `pipeline.log.warn` verification.
2. Test #11 trigger uses `RETURNS TRIGGER` syntax (NOT `RETURNING trigger`).
3. Test #11 `afterEach` drops trigger BEFORE function; cleanup wrapped in try/finally.
4. Test #12 INSERT wrapped in transaction with explicit ROLLBACK for state isolation.
5. Test #13 SET TIME ZONE then verifies UTC consistency on stored `transitioned_at`.
6. Spec 47 §R3.5/§R10 amendments are ADDITIVE documentation (no retroactive mandate against existing scripts using boolean verdicts).
7. Spec 47 §R9 Tier framework lists 10 Tier 1 + 4 Tier 2 + 3 Tier 3 tables explicitly; `lead_analytics` classified.
8. Spec 48 dual-pattern subsection slots at NEW §3.6 (NOT §3.4 which is Error Handling).
9. Runbook mirrors F.1's UNNUMBERED-section format (NOT my v1 §0-§5 numbering).
10. Runbook pre-deploy estimate query has both conservative + realistic bounds; classifier permit-side rows expected ≈ 0 until Phase I.1.1b.
11. Phase I.1.1b explicitly out-of-scope; Spec 42 §6.11 row notes the split.

## Operating Boundaries
* **Target files** (above).
* **Out-of-scope (split to Phase I.1.1b):**
  - Spec 84 permit classifier algorithm extension (produces `result.matchedStatus`)
  - `buildPermitUpdateSQL` refactor (4→7 stride or unnest-array migration)
  - `NORMALIZED_PERMIT_STATUS_TO_MATCHED_STATUS_MAP`
  - permits.matched_status startup guard (mirror mig 146 CoA guard)
  - Activation of dormant filter in `classify-lifecycle-phase.js` flushPermitBatch
  - emitMeta dormant-vs-active distinction
  - Grace flag for permit-side classifier first-deploy spike
  - `lead_views`, `notifications`, `inspections`, `permit_inspections` Tier classification (if outside the 17 listed)
* **Deferred items** (separate WFs):
  - Phase I.2 — `records_total` fix + matched_rule IS NULL assertion
  - Phase I.3 — `computeWarnableAuditStatus` helper consolidation
  - `assert-data-bounds.js` `lifecycle_status_history` gate (Observability O8 — Tier 3 audit-only; deferred with rationale)
* **Cross-Spec Dependencies:**
  - **Relies on:** Phase I.1 ledger-writer code (commit `d579bc0`); mig 155 + mig 146 + mig 127.
  - **Forward dependency:** Phase I.1.1b unblocks permit-side classifier writes + closes Spec 84 §2.5 permit-side rule formalization gap.

---

> **PLAN LOCKED v2. Do you authorize this WF1 Phase I.1.1a plan? (y/n)**
> §10 compliance: all applicable items addressed. v1→v2 delta: removed all Deliverable 4 scope (5 CRITs disappeared); folded 12 v1 findings into Deliverables 1-3 (test scaffolding precision, runbook format, spec slot placement, additive-doc framing).
> Notable: smaller, lower-risk scope than v1. Spec 84 algorithm extension deferred entirely to Phase I.1.1b (separate future WF). I.1.1a is closure for what Phase I.1 already shipped — test + docs only, zero code changes to `scripts/` or `src/`.
> Scope: 1 NEW `.db.test.ts` (13 test cases) + 3 spec amendments + 1 NEW runbook.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
