# Active Task: Fix assert-entity-tracing denominator + audit table n column
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `1efd17e`

---

## Context
* **Goal:** Two related fixes:
  (A) False FAIL on no-new-records permit runs — assert-entity-tracing metric 3
      (trade_forecasts) uses the wrong denominator: all permits in 26h window,
      including SKIP_PHASES permits bumped by link-coa.js that compute-trade-forecasts
      explicitly skips. Fix: split denominator into windowPermits (metrics 1,2,4) and
      eligiblePermits (metric 3 only, mirroring compute-trade-forecasts eligibility).
  (B) Audit table UI shows coverage % but not the raw count, making 5% on 8 permits
      look identical to 5% on 8000. Fix: add "n" column (matched/denominator) to the
      audit table in FreshnessTimeline.tsx.
* **Target Spec:** `docs/specs/pipeline/41_chain_permits.md` §4 (step 26)
* **Key Files:**
  - `scripts/quality/assert-entity-tracing.js` — backend fix A
  - `src/components/FreshnessTimeline.tsx` — frontend fix B (audit table render)

---

## Technical Implementation
* **Backend (assert-entity-tracing.js):**
  1. Keep existing base query as `windowPermits` — used for metrics 1, 2, 4
  2. Add `eligiblePermits` query: `lifecycle_phase IS NOT NULL AND phase_started_at IS NOT NULL
     AND lifecycle_phase NOT IN ('P19','P20','O1','O2','O3','P1','P2')`
  3. Metric 3 (trade_forecasts): use `eligiblePermits` as denominator; add same phase
     filter to the numerator SQL for consistency
  4. When `eligiblePermits = 0`: emit SKIP row for metric 3 (not FAIL)
  5. `traceRow()`: add `denominatorType` param; rename `new_permits` → `denominator`
  6. Metric 5 (opportunity_score): add `matched` and `denominator` fields to its
     manually-built audit row (`denominator_type: 'forecast_rows'`)
  7. `emitSummary records_total`: keep as `windowPermits`; add `eligible_permits`
     to `records_meta` for transparency
* **Frontend (FreshnessTimeline.tsx):**
  1. Update audit row TypeScript cast (line 1144) to include `matched?: number`,
     `denominator?: number`
  2. Add "n" column between Value and Threshold in BOTH audit table renders
     (non-funnel line ~1175; funnel line ~1252)
  3. Render `matched/denominator` in new cell; "—" when absent
* **Database Impact:** NO

---

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** eligiblePermits=0 → SKIP not FAIL; windowPermits=0 → whole skip; denominator field present; UI column renders
* **logError Mandate:** N/A
* **Mobile-First:** Audit table has `overflow-x-auto`; new column is `tabular-nums text-[10px]`

---

## Execution Plan
- [x] **Rollback Anchor:** 1efd17e recorded
- [ ] **State Verification:** Confirm SKIP_PHASES set matches exclusion list
- [ ] **Spec Review:** Read 41_chain_permits.md §4 step 26
- [ ] **Reproduction tests:** chain.logic.test.ts + admin.ui
- [ ] **Red Light:** npx vitest run src/tests/chain.logic.test.ts — MUST fail
- [ ] **Backend Fix:** Modify assert-entity-tracing.js
- [ ] **Frontend Fix:** Modify FreshnessTimeline.tsx
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bug check
- [ ] **Green Light:** npm run test && npm run lint -- --fix → WF6
- [ ] **Adversarial Review:** Gemini + Independent worktree agent
- [ ] **WF3 Triage:** Fix FAILs in-scope; defer rest to review_followups.md
- [ ] **Atomic Commit:** fix(41_chain_permits): WF3 — eligible-permit denominator + audit table n column
