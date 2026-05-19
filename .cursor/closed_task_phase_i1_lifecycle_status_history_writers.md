# Active Task: WF1 Phase I.1 — lifecycle_status_history writers (v2.3 PLAN LOCKED)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline
**Workflow:** WF1 — per Spec 42 §6.11 row "Phase I" item (1) + §6.7 status-level ledger + §6.6.B detected_by mandate

---

## Plan revision history
* **v1** — initial plan; ran 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree). 2 CRIT + 5 HIGH + 5 MED.
* **v2** — folded v1 findings + 3 user design decisions (Q1=status-only, Q2=matched_status-diff, Q3=populate-seq).
* **v2.1** — folded v2 4-reviewer round + 2 design decisions (SAVEPOINT + Option B migration).
* **v2.2** — folded v2.1 fail-first-test-plan reviewer round (4 CRIT + 9 HIGH + 6 MED). Verdict cascade + test layer restructure + Tier framework + RUN_AT inside lock + fault injection technique.
* **v2.3 (this revision)** — folded v2.2 reviewer round (3 CRIT + 6 HIGH + 6 MED + 4-reviewer convergence on fault injection). Major changes: (i) fault injection via BEFORE INSERT trigger (4-reviewer agreement); (ii) `LPAD` → `String(rev).padStart(2, '0')` (deterministic crash fix); (iii) load-coa.js verdict cascade gets rows-derived replacement; classifier NO change (E.2 already correct); (iv) Spec 47 §6.1 "FIRST query" mandate amended to permit inside-lock capture; (v) nested try/catch around `ROLLBACK TO SAVEPOINT`; (vi) tests #6/#7 parse stdout `PIPELINE_SUMMARY:` directly (standalone execSync doesn't write pipeline_runs); (vii) `.infra` tests reframed as presence-only (scope-aware regex impossible); (viii) Q1 negative regex replaced with positive `status IS DISTINCT FROM` assertion; (ix) Tier framework gets decision-rule procedure; (x) intra-second + timezone DB tests added; (xi) `coa_type_class` removed from emitMeta reads (it's batch-sourced, not DB); (xii) pre-deploy estimate query added to runbook; (xiii) NULL phase precision (`null` not `undefined`); (xiv) classifier 2-INSERT shares single SAVEPOINT.

---

## Context

* **Goal:** Add status-level ledger writes to `lifecycle_status_history` (mig 127) from the 3 scripts permitted by the table's CHECK constraint, with **symmetric coverage** of both lead streams. New migration NNN extends `permits` with `matched_status`/`matched_rule`/`unmapped_status` columns (mirrors mig 146's pattern for `coa_applications`) — completes the substrate that mig 127 + Spec 42 §6.7 anticipated.

* **3 writers:**
  1. `scripts/load-permits.js` — fires when `permits.status` (raw CKAN) IS DISTINCT FROM payload
  2. `scripts/load-coa.js` — fires when `coa_applications.status` (raw CKAN) IS DISTINCT FROM payload; decision is denormalized snapshot only
  3. `scripts/classify-lifecycle-phase.js` — fires when classifier-inferred `matched_status` differs from persisted (BOTH streams; permit-side enabled by new migration)

* **Why now (load-bearing):** F.4 cross-stream timeline currently returns empty. Phase I.1 unblocks F.4 substrate. Closes review_followups.md #110.

* **User design choices (settled across v1 + v2 triage):**
  - **v1-Q1 = status-only trigger** on CoA load
  - **v1-Q2 = matched_status diff** on classifier
  - **v1-Q3 = populate from_seq/to_seq** on classifier
  - **v2-A = SAVEPOINT pattern** for ledger atomicity (WARN-on-error is reachable; primary UPSERT survives ledger failure)
  - **v2-B = Option B: new migration** adding `matched_status` to permits for symmetric classifier coverage

## Substrate

* **Table:** `lifecycle_status_history` (mig 127). UNIQUE INDEX `uniq_lifecycle_status_history_natural_key` on `(lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))`. CHECK `detected_by IN ('load-permits.js', 'load-coa.js', 'classify-lifecycle-phase.js')`.
* **Existing indices:** lead_id, seq (partial), decision (partial), transitioned_at — sufficient for F.4.
* **F.4 reader:** `src/lib/leads/lead-inspect-query.ts:681-698` — `COA_CROSS_STREAM_SQL` 3-arm UNION ALL.
* **`data_hash` includes `status`** for both load scripts (Observability v1 Item 9 PASS) — status changes always trigger UPSERT.
* **Advisory locks** single-worker per script — pre-UPSERT SELECT race-free.

## Key files

### New migration

* `migrations/NNN_extend_permits_matched_status.sql` (NEW; ~30 lines):
  ```sql
  -- Mirror mig 146 (coa_applications) for permits. Closes substrate gap that
  -- prevented Phase I.1 classifier from writing permit-side lifecycle_status_history
  -- rows. Phase I.1 Option B per WF1 user authorization 2026-05-18.
  ALTER TABLE permits
    ADD COLUMN IF NOT EXISTS matched_status   VARCHAR(60),
    ADD COLUMN IF NOT EXISTS matched_rule     INTEGER,
    ADD COLUMN IF NOT EXISTS unmapped_status  VARCHAR(120);
  -- (no unmapped_decision — decisions are CoA-only per Spec 42 §6.6.A)
  COMMENT ON COLUMN permits.matched_status IS
    'Classifier-derived status (Phase I.1); NULL until first classify-lifecycle-phase.js run after migration.';
  ```
  - **No backfill** — classifier populates on next run. First-run produces a one-time spike in `lifecycle_status_history_inserted` (~280K rows: ~247K permits + ~33K CoAs that have NULL old_matched_status). Documented as expected first-deploy spike (Observability v2 Issue 8).

### Scripts (modified)

#### `scripts/load-permits.js` (~+95 lines)

- **Pre-UPSERT capture** (NEW; inside `withTransaction`, BEFORE the existing UPSERT call):
  ```sql
  SELECT p.permit_num, p.revision_num, p.status
    FROM permits p
    JOIN UNNEST($1::text[], $2::text[]) AS v(permit_num, revision_num)
      ON p.permit_num = v.permit_num AND p.revision_num = v.revision_num
  ```
  Build `prevStatusByKey: Map<"PNUM:REV", string|null>`. Empty for NEW permits (Map.get returns undefined → treated as NULL `from_status`).
  - **Fix for Gemini v2 HIGH 4:** uses `JOIN UNNEST(...)` not the invalid `WHERE (col, col) IN ($1::text[], $2::text[])` syntax.
- **Capture JS vars BEFORE upsertBatch call** (DeepSeek v2 HIGH 3 ordering):
  1. `prevStatusByKey` SELECT — capture pre-UPSERT state into JS Map
  2. `upsertBatch(client, batch, RUN_AT)` — primary write
  3. Build `ledgerRows = batch.filter(b => prevStatusByKey.get(key(b)) !== b.status).map(...)` — JS comparison only
  4. **`lead_id` constructed in JS** (v2.3 Gemini CRIT 1 + DeepSeek NIT 1 fold — `LPAD` is SQL, NOT JS — would crash at runtime): `lead_id = 'permit:' + b.permit_num + ':' + String(b.revision_num).padStart(2, '0')`. Defensive: cast to string before padStart to handle numeric revision_num. The pre-UPSERT SELECT returns only the columns needed for the diff (`permit_num, revision_num, status`); lead_id is derivable from batch keys.
  5. **NO JS dedup** (Gemini v2.1 HIGH 2 fold) — ON CONFLICT DO NOTHING handles intra-batch + cross-batch dedup correctly. The redundant JS step is removed.
  6. SAVEPOINT + ledger INSERT (next bullet)
- **SAVEPOINT pattern** (v2-A fold + v2.3 Gemini HIGH 1 nested-rollback fold) per Spec 47 §R9 transaction safety:
  ```js
  if (ledgerRows.length > 0) {
    try {
      await client.query('SAVEPOINT ledger_write');
      const result = await client.query(`
        INSERT INTO lifecycle_status_history
          (lead_id, from_status, to_status, transitioned_at, detected_by, permit_type)
        SELECT * FROM UNNEST($1::text[], $2::varchar[], $3::varchar[],
                              $4::timestamptz[], $5::varchar[], $6::varchar[])
        ON CONFLICT (lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))
        DO NOTHING
      `, [...]);
      await client.query('RELEASE SAVEPOINT ledger_write');
      ledgerInsertedCount += result.rowCount;
    } catch (ledgerErr) {
      // v2.3 Gemini HIGH 1: nested try/catch — ROLLBACK TO SAVEPOINT can itself throw
      // (transient network, client state corruption). If it does, we MUST NOT re-throw —
      // re-throwing would propagate up the outer withTransaction and undo the primary UPSERT,
      // defeating the entire SAVEPOINT pattern's purpose.
      try {
        await client.query('ROLLBACK TO SAVEPOINT ledger_write');
      } catch (rollbackErr) {
        pipeline.log.error('[load-permits]',
          'ROLLBACK TO SAVEPOINT failed; transaction state may be unstable',
          { primaryError: ledgerErr.message, rollbackError: rollbackErr.message });
        // Do NOT re-throw — preserve primary UPSERT commit.
      }
      pipeline.log.warn('[load-permits]', 'ledger write failed; primary UPSERT preserved',
        { error: ledgerErr.message });
      ledgerWriteErrors.push(ledgerErr.message.slice(0, 200));
    }
  }
  ```
  Primary UPSERT survives. Ledger errors emit WARN audit row at end of run.
- **SAVEPOINT name `ledger_write` reused across batches** within the same transaction (DeepSeek v2.1 MED 4 — safe PG pattern; PostgreSQL releases the named savepoint on RELEASE and a fresh SAVEPOINT with the same name creates a new one).
- **RUN_AT** captured ONCE as the FIRST action INSIDE the `withAdvisoryLock` callback (Gemini v2.1 HIGH 3 fold + Spec 47 §R3.5/§14.1). This ensures the timestamp reflects the moment the script holds exclusive permission to begin work — prevents stale-timestamp race if process B waited 10min for the lock then used a pre-lock timestamp. Existing load-permits.js line 392 may need to move inside the lock callback (verify during implementation). All ledger rows in this run share the timestamp; SAVEPOINT `ledger_write` name reused across batches within the same transaction (DeepSeek v2.1 MED 4 — safe PG pattern).
- **detected_by** = literal `'load-permits.js'` (matches mig 127 CHECK constraint VERBATIM).
- **emitMeta**:
  - reads add: `permits: ['permit_num', 'revision_num', 'status']` (pre-UPSERT capture; lead_id derived via existing trigger)
  - writes add: `lifecycle_status_history: ['lead_id', 'from_status', 'to_status', 'detected_by', 'transitioned_at', 'permit_type']`
- **audit_table.rows** appends 2 entries (UNCONDITIONAL push — no `if` guard around `auditRows.push(...)`; verified by `.db.test.ts` zero-row-emission test):
  ```js
  // ALWAYS append both rows; do NOT wrap in if(ledgerInsertedCount > 0).
  auditRows.push({
    metric: 'lifecycle_status_history_inserted', value: ledgerInsertedCount,
    threshold: null, status: 'INFO'
  });
  auditRows.push({
    metric: 'lifecycle_status_history_errors', value: ledgerWriteErrors.length,
    threshold: '== 0', status: ledgerWriteErrors.length > 0 ? 'WARN' : 'PASS'
  });
  ```
  - INFO counter (always emitted, even when value=0)
  - WARN-grade error gate (NOT FAIL — preserves primary UPSERT verdict)
- **VERDICT DERIVATION CASCADE** (Observability v2.1 CRIT 1 + v2.3 Observability HIGH 1 fold — Spec 47 §R10):
  - **`load-permits.js` line 511** (`permitAuditHasFails ? 'FAIL' : 'PASS'`) — REPLACE with row-derived cascade (was hardcoded boolean WITHOUT WARN; was the "original sin").
  - **`load-coa.js` lines 493-498** (parallel boolean `coaAuditHasFails`/`coaAuditHasWarns` derived independently from rows) — REPLACE with rows-derived cascade. The current parallel-boolean pattern means new rows added to `coaAuditRows` (e.g., `lifecycle_status_history_errors`) DON'T propagate to verdict; v2.3 Observability HIGH 1 caught this. Both load scripts get the same fix:
    ```js
    const verdict =
      auditRows.some(r => r.status === 'FAIL') ? 'FAIL' :
      auditRows.some(r => r.status === 'WARN') ? 'WARN' :
      'PASS';
    ```
  - **`classify-lifecycle-phase.js` lines 1452-1454** — **NO CHANGE NEEDED.** Phase E.2 already uses the rows-derived cascade correctly. v2.3 Independent MED 2 + Observability v2.2 ground-truth read confirmed. The v2.2 plan's "all 3 writers replace" was overstated; v2.3 corrects this.
  - Without these folds, the new `lifecycle_status_history_errors: status='WARN'` row is INVISIBLE to observe-chain.js's step-verdict display (line 213) — silent observability failure.
- **`records_total` / `_new` / `_updated` UNCHANGED** (Spec 47 §11.2 Overflow Rule).

#### `scripts/load-coa.js` (~+100 lines)

Same pattern as load-permits, plus:
- **CoA-side trigger on `status` only** (v1-Q1) — decision is snapshot at every status-change row.
- **Pre-UPSERT capture** via `JOIN UNNEST` on `application_number` array (NOT permit_num/revision_num).
- **upsertBatch threading** (Independent v2 CRIT 2): the pre-UPSERT SELECT runs as the FIRST statement inside the existing `pipeline.withTransaction` block (load-coa.js line 422-424). Result captured into `prevStatusByAppNum: Map<application_number, status>`. `upsertBatch` signature unchanged — ledger comparison happens AFTER `upsertBatch` returns, using `batch[i].status` (newly written) vs `prevStatusByAppNum.get(appNum)` (captured pre-UPSERT).
- **Snapshot fields**: ledger row carries `decision`, `decision_date`, `coa_type_class` from current CKAN payload.
- **detected_by** = literal `'load-coa.js'`.
- **emitMeta**:
  - reads add: `coa_applications: ['application_number', 'status']` (v2.3 DeepSeek MED 1 fold: `coa_type_class` is sourced from the CKAN batch payload, NOT from a DB SELECT — listing it as a DB read would be a false observability claim)
  - writes add: `lifecycle_status_history: ['lead_id', 'from_status', 'to_status', 'decision', 'decision_date', 'detected_by', 'transitioned_at', 'coa_type_class']`
- Same SAVEPOINT + audit_table pattern.

#### `scripts/classify-lifecycle-phase.js` (~+95 lines)

- **Permit-side dirty SELECT extension** (Independent v2 CRIT 1 resolved by Option B migration):
  ```sql
  -- Adds matched_status + lifecycle_seq to existing dirty permit SELECT (line 945-946):
  SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at,
         lifecycle_phase AS old_phase, lifecycle_stalled AS old_stalled,
         matched_status  AS old_matched_status,    -- NEW (mig NNN)
         lifecycle_seq   AS old_lifecycle_seq,     -- NEW (already exists per mig 132)
         permit_type, neighbourhood_id
  ```
- **CoA-side dirty SELECT extension** (Independent v2 HIGH 5):
  ```sql
  -- Adds matched_status to existing dirty CoA SELECT (lines 1110-1129):
  SELECT ca.application_number, ca.status, ca.decision, ca.decision_date,
         ca.lifecycle_seq    AS old_seq,
         ca.lifecycle_phase  AS old_phase,
         ca.matched_status   AS old_matched_status,  -- NEW (existing mig 146 column)
         ca.coa_type_class, ca.project_type, ca.neighbourhood_id
  ```
- **Order of operations within the classifier transaction** (DeepSeek v2 HIGH 3 explicit):
  1. Stream dirty rows (captures JS variables `row.old_matched_status`, `row.old_lifecycle_seq`, etc.)
  2. Compute classifier output per row (`result.matchedStatus`, `result.lifecycleSeq`, `result.phase`)
  3. Build `lifecycleStatusHistoryBatch` from rows where `result.matchedStatus !== row.old_matched_status` (Q2 zero-delta suppression) — captured JS values used, NOT re-queried from DB
  4. SAVEPOINT + INSERT `lifecycle_status_history` (uses `row.old_matched_status` and `row.old_lifecycle_seq` from step 1)
  5. INSERT `lifecycle_transitions` (CoA-side) / `permit_phase_transitions` (permit-side) — existing logic unchanged
  6. UPDATE permits/coa_applications with new values (existing logic; happens AFTER the ledger captures from JS vars)
- **Two separate INSERTs sharing one SAVEPOINT** (Independent v2 HIGH 6 + v2.3 DeepSeek HIGH 1 single-SAVEPOINT fold) — permit-side and CoA-side ledger rows have different cohort columns. Both INSERTs wrapped in ONE `SAVEPOINT ledger_write` block: if EITHER fails, both roll back atomically + WARN row emitted. Avoids partial ledger write where permit-side succeeded but CoA-side failed (or vice versa) silently. Pattern:
  ```sql
  -- Permit-side ledger INSERT (NULL coa_type_class implicit):
  INSERT INTO lifecycle_status_history
    (lead_id, from_status, to_status, from_seq, to_seq, from_phase, to_phase,
     transitioned_at, detected_by, permit_type)
  SELECT * FROM UNNEST(...) ON CONFLICT (...) DO NOTHING

  -- CoA-side ledger INSERT (populates coa_type_class + project_type):
  INSERT INTO lifecycle_status_history
    (lead_id, from_status, to_status, from_seq, to_seq, from_phase, to_phase,
     transitioned_at, detected_by, coa_type_class, project_type)
  SELECT * FROM UNNEST(...) ON CONFLICT (...) DO NOTHING
  ```
- **NULL from_phase/to_phase explicit handling** (Independent v2 HIGH 4 + v2.3 Gemini MED 1 precision): when a status change occurs but the lifecycle phase does NOT change, the corresponding `from_phase` and `to_phase` values in the JS data array passed to UNNEST will be **JavaScript `null`** (NOT `undefined` — the pg client may serialize undefined inconsistently). The INSERT statement lists these columns explicitly in its column list. Example: `fromPhaseArray.push(phaseChanged ? row.old_phase : null);`
- **from_seq/to_seq** (v1-Q3 + Independent v2 HIGH 3): populated from classifier's `old_lifecycle_seq` and `result.lifecycleSeq`. NULL when classifier first sees the row (acceptable per `idx_lifecycle_status_history_seq` partial index `WHERE from_seq IS NOT NULL`).
- **SAVEPOINT pattern** mirrors load-permits.js — try/catch with ROLLBACK TO SAVEPOINT on ledger error, primary UPSERTs survive.
- **detected_by** = literal `'classify-lifecycle-phase.js'`.
- **emitMeta**:
  - reads add: `permits: ['matched_status', 'lifecycle_seq']` + `coa_applications: ['matched_status', 'lifecycle_seq']` (both now valid after mig NNN)
  - writes add: `lifecycle_status_history: ['lead_id', 'from_status', 'to_status', 'from_seq', 'to_seq', 'from_phase', 'to_phase', 'detected_by', 'transitioned_at', 'permit_type', 'coa_type_class', 'project_type']`
- Same INFO+WARN audit row pattern.

### Tests (NEW — 5 files; ~33 tests total)

**v2.2 test layer restructure (Independent v2.1 CRITs):** semantic assertions that require runtime behavior (SAVEPOINT semantics, order of operations, zero-delta filter logic, RUN_AT consistency) are moved from `.infra` (source-grep only) to `.db.test.ts` (live DB execution). `.infra` tests are constrained to claims source-grep can ACTUALLY falsify.

#### `.infra.test.ts` files (source-grep, no DB)

* **NEW** `src/tests/migration-NNN-extend-permits-matched-status.infra.test.ts` (Independent v2.1 HIGH 1) — 6 tests:
  1. SQL file exists at migrations/NNN_*.sql
  2. 3 `ADD COLUMN IF NOT EXISTS` statements for `matched_status`, `matched_rule`, `unmapped_status`
  3. No NOT NULL constraints on new columns
  4. Column types match: `matched_status VARCHAR(60)`, `matched_rule INTEGER`, `unmapped_status VARCHAR(120)` (mirror mig 146)
  5. COMMENT ON COLUMN includes "Phase I.1"
  6. DOWN section is comment-only (per Buildo migration convention)

* `src/tests/load-permits.lifecycle-status-history.infra.test.ts` — 7 tests (source-grep only):
  1. Pre-UPSERT SELECT uses `JOIN UNNEST(...)` pattern (NOT invalid `IN ($1::text[], $2::text[])`) — explicit regex match
  2. detected_by literal `'load-permits.js'` appears in ledger INSERT site
  3. ON CONFLICT clause is ledger-scoped: `lifecycle_status_history[\s\S]{0,500}ON CONFLICT[\s\S]{0,200}DO NOTHING` (Independent v2.1 HIGH 3 fold — narrow regex prevents pass-by-accident)
  4. ON CONFLICT expression matches mig 127 verbatim: `(lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))`
  5. `auditRows.push({metric: 'lifecycle_status_history_inserted'...` is PRESENT in source (v2.3 Independent HIGH 3 + Observability CRIT 4 reframe — source-grep cannot reliably verify "outside any if" since scope-aware regex is structurally impossible; presence-only check at infra layer; behavioral verification of unconditional emission moved to `.db.test.ts` test #6)
  6. `auditRows.push({metric: 'lifecycle_status_history_errors'...` is PRESENT in source (same reframing — behavioral check at `.db.test.ts` test #6)
  7. **NEW emitMeta assertion** (Observability v2.1 HIGH 4 fold): emitMeta call includes `lifecycle_status_history` in writes-list AND `permits: ['permit_num', 'revision_num', 'status']` in reads-list
  8. RUN_AT capture is INSIDE `withAdvisoryLock` callback (Gemini v2.1 HIGH 3): regex finds `pipeline.getDbTimestamp(pool)` call between `withAdvisoryLock` opening and any UPSERT
  9. SAVEPOINT pattern present: `SAVEPOINT ledger_write` + `ROLLBACK TO SAVEPOINT ledger_write` + `RELEASE SAVEPOINT ledger_write` all appear
  10. NO JS dedup (Gemini v2.1 HIGH 2 fold): regex confirms NO `Map`-based deduplication of `ledgerRows` before INSERT

* `src/tests/load-coa.lifecycle-status-history.infra.test.ts` — 8 tests:
  1-10. Same source-grep patterns as load-permits adapted for CoA
  11. **Q1 POSITIVE assertion** (v2.3 Independent HIGH 4 fold — replaces v2.2's inverted negative regex which would false-positive on the existing primary-UPSERT `decision IS DISTINCT FROM` clause): assert the ledger-trigger condition references `prevStatusByAppNum.get(...) !== b.status` (or equivalent JS comparison on `status`, NOT decision). Source-grep: `expect(src).toMatch(/prevStatusByAppNum\.get\([^)]+\)\s*!==\s*b\.status/)` — proves the JS-level trigger keys on status, not decision.

* `src/tests/classify-lifecycle-phase.lifecycle-status-history.infra.test.ts` — 8 tests (semantic tests moved to .db; source-grep tests remain):
  1. Dirty SELECT extended to include `matched_status AS old_matched_status` on BOTH permit and CoA arms
  2. Dirty SELECT extended to include `lifecycle_seq AS old_lifecycle_seq`
  3. TWO separate INSERT statements (permit-side without coa_type_class, CoA-side with coa_type_class + project_type)
  4. detected_by literal `'classify-lifecycle-phase.js'` appears in both INSERT sites
  5. ON CONFLICT verbatim expression on both INSERTs
  6. emitMeta reads include `matched_status` AND `lifecycle_seq` for both permits + coa_applications
  7. emitMeta writes include `lifecycle_status_history` for the classifier
  8. **Verdict derivation cascade**: source-grep confirms `audit_table.verdict` is derived from `rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'` — NOT hardcoded `permitAuditHasFails ? 'FAIL' : 'PASS'`.

#### `.db.test.ts` files (live DB execution — semantic verification)

* **NEW** `src/tests/db/lifecycle-status-history-writers.db.test.ts` — **expanded scope per Independent v2.1 + Observability v2.1 fold-ins; ~10 test cases**:
  - **Helpers required:** `seedPermits()`, `seedCoaApplications()`, `runScript(scriptPath)` via execSync, `pgQuery()` for verification. Pattern matches existing `src/tests/db/compute-opportunity-scores.db.test.ts`.

  1. **NEW permit → from_status=NULL row written.** Seed permit with no prior, run load-permits, assert `SELECT from_status, to_status FROM lifecycle_status_history WHERE lead_id = ...` returns `(NULL, 'Permit Issued')`.

  2. **STATUS-CHANGED → from_status=prev, to_status=new.** Seed permit with status='Application'; UPDATE its status='Permit Issued' between sync ticks (simulating CKAN change); run load-permits; assert row `(Application, Permit Issued)`.

  3. **UNCHANGED → no row.** Run load-permits twice without changing status; assert lifecycle_status_history count is 0.

  4. **Same-batch RUN_AT consistency** (moved from .infra per Independent v2.1 HIGH 4): seed 5 permits all changing status; run load-permits; assert all 5 ledger rows share `transitioned_at` value (exact equality).

  5. **ON CONFLICT dedup** (within 1 second): seed permit; run load-permits; re-run load-permits within same second-truncated timestamp; assert only 1 row exists.

  6. **Zero-row-emission preservation** (Observability v2.1 HIGH 3 fold + v2.3 Independent HIGH 2): seed permit with no status change; run load-permits via execSync; **parse `PIPELINE_SUMMARY:` line from stdout** (NOT query `pipeline_runs.records_meta` — standalone execSync doesn't invoke `run-chain.js`, so `pipeline_runs` row is never inserted). Assert parsed JSON's `records_meta.audit_table.rows` contains `{metric: 'lifecycle_status_history_inserted', value: 0, status: 'INFO'}` — explicit row presence on zero-state.

  7. **SAVEPOINT WARN path — fault injection via BEFORE INSERT trigger** (v2.3 4-reviewer convergence — Gemini MED 2 + DeepSeek HIGH 2 + Independent CRIT 1 + Observability CRIT 3 all agreed pre-seed + DROP COLUMN don't work; trigger is the only reliable technique):
     ```sql
     -- beforeEach test #7: create a trigger that rejects the sentinel lead_id
     CREATE OR REPLACE FUNCTION test_force_ledger_fail() RETURNS TRIGGER AS $$
     BEGIN
       IF NEW.lead_id = 'permit:TEST-FAIL:00' THEN
         RAISE EXCEPTION 'forced ledger error for SAVEPOINT test';
       END IF;
       RETURN NEW;
     END $$ LANGUAGE plpgsql;
     CREATE TRIGGER trg_test_force_fail BEFORE INSERT ON lifecycle_status_history
       FOR EACH ROW EXECUTE FUNCTION test_force_ledger_fail();

     -- Seed permit with permit_num='TEST-FAIL', revision_num='00', status='Application'.
     -- Run load-permits via execSync (which detects the new status='Permit Issued' from
     -- a manipulated CKAN fixture). The ledger INSERT for 'permit:TEST-FAIL:00' triggers
     -- the trigger's EXCEPTION → SAVEPOINT rolls back → primary UPSERT survives.

     -- afterEach test #7:
     DROP TRIGGER trg_test_force_fail ON lifecycle_status_history;
     DROP FUNCTION test_force_ledger_fail();
     ```
     Assertions (parsing execSync stdout per v2.3 Independent HIGH 2):
     - `SELECT status FROM permits WHERE permit_num='TEST-FAIL'` reflects the NEW status='Permit Issued' (primary write committed)
     - Parsed `PIPELINE_SUMMARY:` JSON's `records_meta.audit_table.rows` contains `{metric: 'lifecycle_status_history_errors', value: 1, status: 'WARN'}`
     - Parsed `audit_table.verdict === 'WARN'` (verdict derivation locked here)
     - execSync's stderr contains `[load-permits]` + `ledger write failed` (proxy for `pipeline.log.warn` call — v2.3 DeepSeek NIT 2: can't mock logger under execSync, so verify via stdout/stderr capture)

  8. **Order of operations** (Independent v2.1 CRIT 2 fold, moved from .infra): seed permit with `matched_status='OLD'`; run classifier (which UPDATEs matched_status to 'NEW' as part of its work); assert ledger row's `from_status === 'OLD'` (proves JS capture survives the subsequent UPDATE, not freshly-queried).

  9. **Q2 zero-delta filter logic** (Independent v2.1 MED 4 fold, moved from .infra): seed CoA with `matched_status='X'`; run classifier in a configuration where the classifier re-derives same `matched_status='X'`; assert NO ledger row written.

  10. **F.4 substrate unblock**: seed cross-stream linked permit+CoA pair; run all 3 writers; assert F.4's `COA_CROSS_STREAM_SQL` returns ≥1 row from each of the 3 UNION arms.

  11. **CHECK constraint enforcement** (v2.3 Independent MED 2 fold — distinguishes from migration-127's source-grep test): attempt manual INSERT with `detected_by = 'wrong-script.js'`; assert `pool.query(...)` rejects the promise with PostgreSQL `23514` (check_violation) error code. This is LIVE enforcement verification (vs migration-127's source-grep that only confirms the constraint exists in the SQL definition).

  12. **Intra-second data-loss documented limitation** (v2.3 Gemini HIGH 2): seed permit; force two status changes for the same lead to the same `to_status` within the same second (e.g., status='A' → load → status='B' → load → status='A' → load, all within `date_trunc('second')` window). Assert only the FIRST and SECOND inserts succeeded; the THIRD was deduped by ON CONFLICT. Documents the intentional limitation that flapping within 1s loses intermediate states. Spec 42 §6.6.B notes this trade-off.

  13. **Timezone consistency** (v2.3 Gemini HIGH 2): `SET TIME ZONE 'America/New_York'` in the test session; run load-permits; assert `SELECT transitioned_at AT TIME ZONE 'UTC' FROM lifecycle_status_history` returns the expected UTC value (not the New York-local). Confirms the UNIQUE INDEX's `AT TIME ZONE 'UTC'` is respected.

### Spec amendments (expanded scope per Option B + reviewer-fold patterns)

* **`docs/specs/01-pipeline/42_chain_coa.md`:**
  - **§6.6.A `coa_applications` substrate paragraph** — add a sub-note that the matched_status/matched_rule/unmapped_status columns added by mig 146 are now MIRRORED on `permits` (mig NNN) as of Phase I.1, completing the symmetric-writer substrate that mig 127's CHECK constraint anticipated.
  - **§6.6.B `lifecycle_status_history` table description** — clarify that classifier writes are symmetric across both streams (permit + CoA), reading from `{permits, coa_applications}.matched_status` to detect derived status transitions.
  - **§6.7 9-rule classifier precedence** — add a paragraph clarifying that the same 9-rule precedence applies to both permit-side and CoA-side derivations; `matched_status` is the output column on both tables; ledger writes fire when classifier-derived status diff-compares to persisted value.
  - **§6.11 Phase I row item (1)** — DELIVERED marker with `[I.1-COMMIT]` placeholder + Phase I.1 COMPLETE sub-status. Document the Option B migration as substrate completion (not a scope expansion).

* **`docs/specs/01-pipeline/47_pipeline_script_protocol.md`:**
  - **§R3.5 + §6.1 + §14.1 RUN_AT relocation** (v2.3 Gemini CRIT 2 + DeepSeek MED 2 fold): currently §6.1 mandates "FIRST query — before config load, before lock acquisition." Amend to mandate **"first action INSIDE the `withAdvisoryLock` callback"** — captures timestamp at the moment of exclusive permission to begin work, prevents stale-timestamp race when a process waits N minutes for the lock then uses a pre-lock timestamp. Phase I.1's three writers are the canonical reference for the new convention.
  - **§R9 transaction safety — NEW Tier framework subsection (Gemini v2.1 CRIT 1 + v2.3 Observability HIGH 2 fold):** Define explicit table-tier classification for SAVEPOINT eligibility:
    - **Tier 1 — Core data** (`permits`, `coa_applications`, `permit_trades`, `permit_parcels`, `lead_trades`, `lead_parcels`, `cost_estimates`, `trade_forecasts`, `tracked_projects`): SAVEPOINT pattern **FORBIDDEN**. Writes MUST be inside primary `withTransaction` and MUST fail-fast on any error. No try/catch swallowing.
    - **Tier 2 — Derived data** (`phase_calibration`, `lifecycle_transitions`, `permit_phase_transitions`): SAVEPOINT **FORBIDDEN** by default. Exceptions require WF1 with explicit spec amendment for the specific table.
    - **Tier 3 — Audit / observability ledgers** (`lifecycle_status_history`, future audit-only tables): SAVEPOINT pattern **PERMITTED**. Criteria for Tier 3: (a) Behaves as append-only from application code (writes are `INSERT ... ON CONFLICT DO NOTHING`, not `UPDATE`s of existing rows — v2.3 Gemini NIT 1 wording refinement); (b) no FKs pointing INTO it from Tier 1/2 tables; (c) not a source-of-truth for any algorithm — only consumed for human display / audit queries.
    - **Decision-rule procedure** (v2.3 Observability HIGH 2 fold): for any new table not in the Tier 1/2/3 lists above, classify by answering: (1) Does any algorithm depend on this table's contents to produce a primary output? If YES → Tier 1. (2) Does any other pipeline script READ from this table to drive computation? If YES → Tier 2. (3) Is the table consumed only by observers, audit queries, or human-facing reports? If YES → Tier 3. (4) Ambiguous cases default to Tier 1 (most conservative; SAVEPOINT FORBIDDEN by default).
    - Edge-case reference (also v2.3 Observability HIGH 2): `pipeline_runs` (Tier 3 — observability infrastructure; `observe-chain.js` reads it but no algorithm depends on it for primary output); `lead_views` (Tier 1 — user-engagement source-of-truth for feed ranking); `lead_analytics` (Tier 2 — derived from `tracked_projects` for analytics queries); `engine_health_snapshots` (Tier 3 — audit ledger).
    - **SAVEPOINT pattern documentation** with Phase I.1's three writers as canonical example. Includes the standard pattern WITH NESTED try/catch around ROLLBACK TO SAVEPOINT (v2.3 Gemini HIGH 1 fold): `try { SAVEPOINT s; INSERT ...; RELEASE SAVEPOINT s; } catch (err) { try { ROLLBACK TO SAVEPOINT s; } catch (rollbackErr) { pipeline.log.error(...); /* swallow — primary write must survive */ } pipeline.log.warn(...); auditRows.push({status: 'WARN'}); }`.
    - **Verdict derivation cascade requirement** (v2.3 Observability CRIT 1 + HIGH 1): `rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'` — never hardcoded boolean, never parallel boolean variables independent of rows.
  - **§R10 verdict derivation — STRENGTHEN existing item** (Observability v2.1 CRIT 1 fold): add explicit failure mode example — "Phase I.1 caught load-permits.js hardcoding `permitAuditHasFails ? 'FAIL' : 'PASS'`, which made WARN-grade rows invisible to observe-chain.js." Mandate row-derived cascade for all writers, with a self-checklist item.
  - **§11.2 Overflow Rule** — add a footnote with Phase I.1 as an example of secondary writes routed to `audit_table.rows` (not `records_total`).

* **`docs/specs/01-pipeline/48_pipeline_observability.md`:**
  - Document the **first-deploy spike pattern** (~280K rows on first run, dropping to ~100-300/day steady state) as a known observe-chain noise source. Mirrors F.1's `coaFirstDeployGrace` documentation. Note that 7-day baseline self-resolves the noise.
  - Add a subsection on the **INFO + WARN audit row dual-pattern** for ledger writers: INFO row tracks count (always emitted), WARN row tracks error count (PASS when zero, WARN when nonzero, never FAIL — preserves primary write verdict).

* **`docs/runbook/I1_first_deploy_spike.md`** updated to include the **pre-deploy estimate query** (v2.3 Observability MED 8 + DeepSeek v2.1 LOW 5 fold) — replaces the hardcoded "~280K" with a query-derived upper bound:
  ```sql
  -- Pre-deploy: estimate first-run ledger row count (upper bound for spike)
  SELECT (SELECT COUNT(*) FROM permits WHERE status IS NOT NULL)
       + (SELECT COUNT(*) FROM coa_applications WHERE status IS NOT NULL)
    AS expected_first_run_max_rows;
  -- Operator records this value pre-deploy; verifies first chain run after deploy
  -- emits a `lifecycle_status_history_inserted` value <= this bound.
  ```

* **`docs/specs/00-architecture/01_database_schema.md`** (if it exists and is maintained):
  - Add `permits.matched_status`, `permits.matched_rule`, `permits.unmapped_status` to the `permits` schema table.

* **`docs/runbook/I1_first_deploy_spike.md`** (NEW; mirrors `docs/runbook/F1_baseline_quiet_period.md`):
  - Operator pre-ack procedure for the ~280K-row spike on first post-deploy chain run.
  - Annotation template for observe-chain.js DeepSeek output ("expected first-deploy ledger spike; self-resolving after 7-day baseline forms").
  - Verification queries: `SELECT COUNT(*) FROM lifecycle_status_history GROUP BY detected_by` should converge to per-writer steady-state within 1 week.

* **`docs/reports/review_followups.md`:**
  - Mark item #110 FOLDED with `[I.1-COMMIT]` placeholder.
  - Add new deferred items: (a) CHECK constraint filename brittleness (Gemini v1 MED); (b) Composite `(lead_id, transitioned_at)` index (DeepSeek v1 HIGH 3); (c) Sentry breadcrumb on first-cross-stream-row-rendered (Observability over-engineering).

## Technical Implementation

* **DB Impact:** YES — new migration adds 3 columns to permits (additive, nullable). Ledger INSERTs are additive only. First-deploy ledger spike ~280K rows expected, then ~100-300/day steady state.
* **Idempotency:** verbatim `ON CONFLICT (lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC')) DO NOTHING` matches mig 127's UNIQUE INDEX expression.
* **Transaction safety (SAVEPOINT pattern):** ledger errors do NOT cascade to primary UPSERT rollback. WARN audit row emitted; operator notified via observe-chain.js next 7-day baseline pass.
* **First-deploy spike** (Observability v2 Issue 8): expected ~280K ledger rows on first run (permits + CoAs that have NULL old_matched_status). observe-chain.js will flag as anomalous for ~7 days until baseline forms. Operator pre-ack via `docs/runbook/I1_first_deploy_spike.md` (NEW; mirror F.1 baseline-quiet-period runbook).
* **Backfill:** no migration backfill. Classifier populates `permits.matched_status` on first post-mig run; ledger rows reflect first-observation transitions.

## Standards Compliance
* **Try-Catch Boundary:** SAVEPOINT pattern wraps each ledger INSERT; primary writes survive.
* **Unhappy Path Tests:** SAVEPOINT rollback, NULL transitions, intra-batch dedup, decision-only suppression, zero-delta suppression all covered.
* **logError Mandate:** N/A — scripts use `pipeline.log`.
* **Idempotency (Spec 47 §R12):** verbatim ON CONFLICT expression; ROLLBACK TO SAVEPOINT on ledger error.

## Execution Plan (WF1 verbatim)

- [ ] **Contract Definition:** N/A — F.4 reader contract unchanged.
- [ ] **Spec & Registry Sync:** Spec 42 §6.11 Phase I row + review_followups.md #110. Run `npm run system-map`.
- [ ] **Schema Evolution:** NEW migration NNN (3 columns on permits, nullable, no backfill). UP + DOWN parity. Run `npm run migrate` against staging.
- [ ] **Test Scaffolding:** 4 NEW files (3 `.infra.test.ts` + 1 `.db.test.ts`).
- [ ] **Red Light:** Run two commands and BOTH must show failures (Independent v2.1 MED 2 fold — explicit on the `.db.test.ts` Docker dependency):
  - `npx vitest run "src/tests/migration-NNN-*.infra.test.ts" "src/tests/*lifecycle-status-history*.infra.test.ts"` — runs the migration test + 3 writer infra tests; must fail.
  - `BUILDO_TEST_DB=1 npm run test:db -- lifecycle-status-history-writers` — requires Docker + Postgres running locally; must fail (NOT skip — if Docker is down, this command should error visibly rather than silently pass).
  - **NOTE:** if `.db.test.ts` skips due to missing Docker, CI is the authoritative Red Light gate.
- [ ] **Implementation:** new migration + edit 3 scripts (~+290 lines total).
- [ ] **Pre-Review Self-Checklist:** generate ~14 items (sketch below).
- [ ] **Multi-Agent Review (diff-stage 4-reviewer round):** all 4 reviewers on full diff.
- [ ] **Triage + Green Light:** `npm run test && npm run typecheck && npm run lint -- --fix`.
- [ ] **WF6 close-out:** commit feat + docs follow-up filling `[I.1-COMMIT]`.

## Pre-Review Self-Checklist (v2.2 — 17 items)

1. **New migration NNN** UP creates 3 columns nullable; DOWN comment-only per Buildo convention.
2. **Migration NNN paired test** `src/tests/migration-NNN-*.infra.test.ts` exists and asserts column types VARCHAR(60)/INTEGER/VARCHAR(120) + nullability.
3. **detected_by literals** match mig 127 CHECK constraint VERBATIM (`'load-permits.js'`, `'load-coa.js'`, `'classify-lifecycle-phase.js'`).
4. **ON CONFLICT expression** reproduces mig 127's UNIQUE INDEX expression VERBATIM with `AT TIME ZONE 'UTC'`.
5. **RUN_AT captured INSIDE `withAdvisoryLock` callback** (not before lock acquisition); single timestamp per script run.
6. **CoA writer fires on `status IS DISTINCT FROM` ONLY**; decision is denormalized snapshot.
7. **Classifier writer compares** `result.matchedStatus !== row.old_matched_status` on BOTH streams.
8. **Classifier writer populates** `from_seq` + `to_seq` from `old_lifecycle_seq` + `result.lifecycleSeq`.
9. **Classifier writer uses TWO INSERTs** (permit-side without `coa_type_class`; CoA-side with `coa_type_class` + `project_type`).
10. **Pre-UPSERT SELECT uses `JOIN UNNEST(...)`** pattern (NOT invalid `IN ($1::text[], $2::text[])`).
11. **NO JS dedup** of ledgerRows — ON CONFLICT DO NOTHING handles dedup correctly.
12. **SAVEPOINT pattern** wraps each ledger INSERT: try / SAVEPOINT / INSERT / RELEASE; catch / ROLLBACK TO SAVEPOINT / log.warn / push WARN audit row. Primary UPSERT survives.
13. **JS variables captured at SELECT time**, never re-queried; ledger INSERT uses captured vars (NOT freshly-UPSERTed values).
14. **`records_total` / `_new` / `_updated` UNCHANGED** on all 3 writers (Spec 47 §11.2 Overflow Rule).
15. **`audit_table.rows` always emits BOTH rows unconditionally** — `lifecycle_status_history_inserted` (INFO; value can be 0) + `lifecycle_status_history_errors` (PASS when 0, WARN when >0). The `auditRows.push(...)` calls are NOT inside `if (count > 0)` guards.
16. **Verdict derivation cascade** replaces hardcoded boolean: `rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'` applied in all 3 writers.
17. **`emitMeta`** writes-list adds `lifecycle_status_history` × 3 writers; reads-list adds `permits/coa_applications: ['status']` for load scripts AND `['matched_status', 'lifecycle_seq']` for classifier AND `coa_applications: ['coa_type_class']` for load-coa.
18. **`lead_id` constructed in JS** from batch keys (`'permit:' + b.permit_num + ':' + String(b.revision_num).padStart(2, '0')`) — uses JS `padStart`, NOT SQL `LPAD`; NOT returned from pre-UPSERT SELECT.
19. **NULL phase precision**: classifier `.map()` returns JS `null` (not `undefined`) for `from_phase`/`to_phase` when phase unchanged.

## Operating Boundaries
* **Target files** (above).
* **Out-of-scope (deferred):**
  - Historical backfill of `lifecycle_status_history` rows (pre-live; first-observation NULL `from_status` acceptable)
  - Decision-only-change tracking on CoA (would need separate table; Phase I.1.1)
  - CHECK constraint filename brittleness (Gemini v1 MED; would need migration)
  - Composite `(lead_id, transitioned_at)` index (existing indices acceptable)
  - F.4 first-data Sentry breadcrumb (acceptable convention; pipeline scripts use pipeline.log + audit_table)
* **Cross-Spec Dependencies:**
  - **Relies on:** Spec 47 §R3.5/R10/R11/R12, §11.2 Overflow Rule; Spec 48 audit_table; mig 127 + mig 126 + mig 132 + mig 146 + new mig NNN.
  - **Consumed by:** Spec 76 §3.5 Cycle 8 F.4 cross-stream timeline.

---

> **PLAN LOCKED v2.3. Do you authorize this WF1 plan? (y/n)**
> §10 compliance: all items addressed. v2.2→v2.3 delta: 15 fold-ins from v2.2 reviewer round (3 CRIT + 6 HIGH + 6 MED). Most-significant changes: (1) BEFORE INSERT trigger for fault injection (4-reviewer convergence: Gemini+DeepSeek+Independent+Observability all agreed v2.2's pre-seed/DROP-COLUMN technique was unimplementable); (2) `LPAD` → `String(rev).padStart(2, '0')` (would have crashed at runtime); (3) load-coa.js verdict cascade gets rows-derived replacement; classifier confirmed NO change needed (E.2 already correct — v2.2 plan was overstated); (4) Spec 47 §6.1 "FIRST query" mandate amended (was contradicted by v2.2 RUN_AT-inside-lock change); (5) nested try/catch around ROLLBACK TO SAVEPOINT; (6) tests #6/#7 parse stdout `PIPELINE_SUMMARY:` directly (standalone execSync doesn't write pipeline_runs); (7) `.infra` tests reframed as presence-only (scope-aware regex impossible); (8) Q1 negative regex replaced with positive JS-level assertion; (9) Tier framework gets decision-rule procedure for ambiguous tables; (10) intra-second + timezone DB tests added; (11) classifier 2-INSERT shares single SAVEPOINT atomically; (12) `coa_type_class` removed from emitMeta reads (batch-sourced, not DB); (13) pre-deploy estimate query added to runbook; (14) NULL phase precision (JS `null` not `undefined`).
> Plan trajectory: v1 → v2 → v2.1 → v2.2 → v2.3, 4 reviewer rounds total. Matches Phase F.4's 4-round pattern; comparable plan-stage rigor. Ready for implementation.
> Scope: 1 new migration + 3 modified scripts (~+290 lines) + 4 new test files (~36 tests across 3 `.infra` + 1 `.db`) + 5 modified specs + 1 new runbook.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
