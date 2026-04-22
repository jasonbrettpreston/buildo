# Active Task: WF3 — CQA Tracing Gate Alignment + Phase-Past-Target Guard
**Status:** Implementation

## Context
* **Goal:** Two precise fixes based on post-zombie-gate WF5 audit results. (1) `assert-entity-tracing` is FAILing at 38.6% trade_forecasts coverage because its `eligiblePermits` denominator still counts permits > 3 years old that the engine now intentionally ignores — fix by mirroring the 3-year COALESCE recency gate in both the denominator and numerator queries. (2) `compute-trade-forecasts` still produces 70.6% expired urgency because permits within 3 years but whose target work phase has already passed still generate forecasts — fix by adding a Phase-Past-Target Guard (`currentOrdinal > targetOrdinal` → skip).
* **Target Specs:**
  - `docs/specs/product/future/85_trade_forecast_engine.md` §3 (Behavioral Contract — Bimodal Routing, SOURCE_SQL eligibility)
  - `docs/specs/pipeline/47_pipeline_script_protocol.md` §4 (state init), §8.1 (preRowCount), §11.1 (records_total), §R9 (atomic transaction)
* **Rollback Anchor:** `3652c27` (refactor: WF2 V1 timing removal)
* **Key Files:**
  - `scripts/quality/assert-entity-tracing.js` — eligiblePermits denominator + trade_forecasts numerator queries
  - `scripts/compute-trade-forecasts.js` — Phase-Past-Target Guard in bimodal routing loop
  - `src/tests/assert-entity-tracing.infra.test.ts` — test fix + new guardrail tests
  - `src/tests/compute-trade-forecasts.infra.test.ts` — new guardrail tests

## Investigation Summary (confirmed before planning)
* `eligiblePermits` denominator (lines 94–104): uses `AND p.phase_started_at IS NOT NULL` — excludes P1/P2 (now eligible via application_date Branch A) and does NOT exclude permits >3 years old. After zombie gate, engine skips those old permits; denominator still counts them → false low coverage.
* `trade_forecasts` numerator (lines 148–157): same `phase_started_at IS NOT NULL` filter — inconsistent with denominator after changes.
* `assert-entity-tracing.infra.test.ts` line 86: test checks SKIP_PHASES_SQL for 'P1' and 'P2' using `.toContain()` (substring match). After WF3 removed P1/P2 from SKIP_PHASES_SQL, this passes by accident ('P1' substring-matches 'P19', 'P2' substring-matches 'P20'). Semantically wrong; needs correction.
* `compute-trade-forecasts.js` Phase-Past-Target: bimodal routing for a P18 permit (ordinal 15) targets work_phase e.g. P7c (ordinal 0). `currentOrdinal=15 > targetOrdinal=0` but no skip guard exists — engine computes predictedStart = phase_started_at + median, which lands in the past (opportunity definitively gone), producing `expired` urgency. The 3-year zombie gate reduced this set but didn't eliminate it (permits 1–3 years old still reach the loop).
* `anchorFallbackCount` is incremented at line 437, BEFORE bimodal routing. After adding the phase-past-target guard, this increment will count fallbacks for rows that are then immediately skipped. Must move to after the guard.

## Technical Implementation

### Part 1 — assert-entity-tracing.js: 3-year COALESCE gate

**1a. eligiblePermits denominator (lines 94–104)**
Replace `AND p.phase_started_at IS NOT NULL` with the COALESCE recency gate:
```sql
SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num)::int AS eligible_permits
  FROM permits p
  JOIN permit_trades pt ON pt.permit_num = p.permit_num
                       AND pt.revision_num = p.revision_num
                       AND pt.is_active = true
 WHERE p.last_seen_at > NOW() - $1::interval
   AND p.lifecycle_phase IS NOT NULL
   AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
   AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'
```
*Rationale:* Mirrors compute-trade-forecasts SOURCE_SQL recency exclusion. `phase_started_at IS NOT NULL` was replaced because P1/P2 permits (now in the forecast engine via Branch A) have NULL phase_started_at but valid application_date. COALESCE covers all three anchor columns. The 3-year window deliberately uses a single gate rather than the hybrid 18-month/3-year dual-branch (P1/P2 currently have 0 rows; when PERT pipeline populates them, a slightly conservative 3-year gate on application_date is acceptable — it over-counts denominator for P1/P2 18–36 month window, making coverage readings conservative not optimistic).

**1b. trade_forecasts numerator (lines 148–157)**
Same replacement — remove `AND p.phase_started_at IS NOT NULL`, add COALESCE gate:
```sql
SELECT COUNT(DISTINCT tf.permit_num || '--' || tf.revision_num)::int AS matched
  FROM trade_forecasts tf
  JOIN permits p ON p.permit_num = tf.permit_num
                AND p.revision_num = tf.revision_num
 WHERE p.last_seen_at > NOW() - $1::interval
   AND p.lifecycle_phase IS NOT NULL
   AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
   AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'
```
*Rationale:* Numerator and denominator must use identical eligibility criteria. A permit excluded from the denominator by the recency gate cannot be in the numerator without causing a coverage ratio > 1.

### Part 2 — compute-trade-forecasts.js: Phase-Past-Target Guard

**2a. Add `skippedPastTarget` counter (alongside other counters ~line 281):**
```js
let skippedPastTarget = 0;
```

**2b. Move `anchorFallbackCount++` to after the guard (currently at line 437):**
The comment states "only for rows that will produce a forecast" — the guard fires before forecast generation, so the increment must come after it.

**2c. Insert guard after `const targetOrdinal = PHASE_ORDINAL[targetPhase]` (currently line 464):**
```js
// Phase-Past-Target Guard: permit has moved PAST the target phase —
// the trade's opportunity window is definitively closed. Skip entirely
// rather than generating a forecast that will immediately be `expired`.
// Strict > (not >=): AT the target phase means the opportunity is RIGHT NOW
// (overdue urgency); strictly PAST means it is definitively gone.
if (currentOrdinal != null && targetOrdinal != null && currentOrdinal > targetOrdinal) {
  skippedPastTarget++;
  continue;
}
```

**2d. Update telemetry — audit_table rows (alongside `skipped_no_anchor` row ~line 628):**
```js
{ metric: 'skipped_past_target', value: skippedPastTarget, threshold: null, status: 'INFO' },
```

**2e. Update telemetry — records_meta (~line 663):**
```js
skipped_past_target: skippedPastTarget,
```

**Spec 47 Acid Radar — unaffected by Part 2:**
- §8.1: preRowCount before DELETEs — guard is in the stream loop, not purge step. No change.
- §11.1: records_total = streamed rows — `totalRows` increments at top of loop, before the guard. So skipped-past-target rows ARE counted in records_total (they were streamed from the DB). Intentional: records_total represents rows the engine EVALUATED, not rows that produced forecasts.
- §4: state init inside withAdvisoryLock — no change.
- §R9: DELETE + UPSERT in one withTransaction — no change.

### Part 3 — Test Fixes

**3a. assert-entity-tracing.infra.test.ts — fix semantically wrong SKIP_PHASES_SQL test (lines 81–89):**
The current test checks `.toContain('P1')` and `.toContain('P2')` for SKIP_PHASES_SQL. After WF3 removed P1/P2 from SKIP_PHASES_SQL, the test passes by accident (substring: 'P1' matches inside 'P19', 'P2' matches inside 'P20'). Fix: update the phase list to `['P19', 'P20', 'O1', 'O2', 'O3']` and add `.not.toContain()` assertions for P1 and P2 using exact regex matching.

**3b. assert-entity-tracing.infra.test.ts — add guardrail tests for COALESCE gate.**

**3c. compute-trade-forecasts.infra.test.ts — add guardrail tests for Phase-Past-Target Guard + `skipped_past_target` telemetry.**

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes; pipeline SDK handles errors
* **Unhappy Path Tests:** Guardrail tests cover the guard boundary (at-target vs. past-target). Existing tests cover NULL ordinal paths.
* **logError Mandate:** N/A — pipeline scripts use `pipeline.log.*`
* **Mobile-First:** N/A — backend-only

## Execution Plan

### Part 1: assert-entity-tracing.js — CQA Gate Alignment
- [ ] **Rollback Anchor:** `3652c27` (recorded above)
- [ ] **State Verification:** eligiblePermits query confirmed at lines 94–104; trade_forecasts numerator at lines 148–157; both have `phase_started_at IS NOT NULL` (wrong post-zombie-gate)
- [ ] **Spec Review:** spec 85 §3 SOURCE_SQL eligibility, spec 47 §8.1/§11.1/§R9
- [ ] **Guardrail Test (Part 1):** Add tests asserting COALESCE gate in both denominator and numerator queries; add test that `phase_started_at IS NOT NULL` is absent from both
- [ ] **Test Fix (3a):** Update SKIP_PHASES_SQL test to remove P1/P2 from expected list, add not-contains assertions
- [ ] **Red Light:** Confirm guardrail tests fail before implementation
- [ ] **Step 1:** `assert-entity-tracing.js` — replace `phase_started_at IS NOT NULL` with COALESCE gate in eligiblePermits denominator
- [ ] **Step 2:** `assert-entity-tracing.js` — replace `phase_started_at IS NOT NULL` with COALESCE gate in trade_forecasts numerator

### Part 2: compute-trade-forecasts.js — Phase-Past-Target Guard
- [ ] **Guardrail Test (Part 2):** Add tests asserting `skipped_past_target` in audit_table and records_meta; assert guard condition `currentOrdinal > targetOrdinal` exists in script
- [ ] **Red Light:** Confirm guardrail tests fail before implementation
- [ ] **Step 3:** Add `skippedPastTarget = 0` counter
- [ ] **Step 4:** Move `anchorFallbackCount++` to after the Phase-Past-Target guard position
- [ ] **Step 5:** Insert Phase-Past-Target Guard after `const targetOrdinal = ...`
- [ ] **Step 6:** Update audit_table rows with `skipped_past_target` INFO metric
- [ ] **Step 7:** Update records_meta with `skipped_past_target`

### Part 3: Green Light + Review
- [ ] **Pre-Review Self-Checklist (WF3 sibling-bug check):** 3–5 sibling bugs sharing same root cause
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` — all pass
- [ ] **Step 8:** Spawn independent review agent (isolated worktree) — spec 85 §3, spec 47 §4/§8.1/§11.1/§R9
- [ ] **Step 9:** Spawn adversarial review agents (Gemini + Deepseek) on the diff
- [ ] **Step 10:** Triage all findings — fix FAILs, defer pre-existing to `review_followups.md`
- [ ] **Step 11:** WF6 hardening sweep + atomic commits (Part 1 first, Part 2 second)
