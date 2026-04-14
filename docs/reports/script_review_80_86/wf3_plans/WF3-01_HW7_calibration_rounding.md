# Active Task: Fix PERCENTILE_CONT ::int truncation in calibration
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W7 · 86-W3

## Context
* **Goal:** Replace `::int` casts on `PERCENTILE_CONT` results with `ROUND(…)::int` so calibration medians are rounded rather than truncated. Current truncation introduces systematic downward bias (10.9 days → 10; compounds across multi-phase paths).
* **Target Spec:** `docs/specs/product/future/86_control_panel.md` (no direct spec — algorithm is currently orphan; also touches spec 85 consumer via `phase_calibration`)
* **Key Files:**
  - `scripts/compute-timing-calibration-v2.js` (L125–127, L167–169, L212–214, L245–247 — four call sites)

## Technical Implementation
* **New/Modified Components:** None.
* **Data Hooks/Libs:** `scripts/compute-timing-calibration-v2.js` only.
* **Database Impact:** NO — output column `phase_calibration.median_days` stays `INT`; only the application-side percentile computation changes.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no new API routes).
* **Unhappy Path Tests:** Test that non-integer percentile (e.g., 10.9 days) rounds to 11, not truncates to 10.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record current Git commit hash in active task.
- [ ] **State Verification:** Confirm `phase_calibration.median_days` is INT-typed in migration 087. Confirm no downstream consumer expects truncated behaviour (consumer `scripts/compute-trade-forecasts.js` L257 uses `cal.median` additively — rounding is safer than truncation).
- [ ] **Spec Review:** N/A — algorithm is undocumented (this is flagged in H-S40 as a separate spec update). The fix is a correctness one-liner independent of spec.
- [ ] **Reproduction:** Create `src/tests/compute-timing-calibration-v2.logic.test.ts` with a fixture of inspection pairs whose median gap is 10.5 days (e.g., gaps `[10, 10, 11, 11, 11]`). Assert the emitted median is 11, not 10.
- [ ] **Red Light:** Run `npx vitest run src/tests/compute-timing-calibration-v2.logic.test.ts`. MUST fail with "expected 11, got 10" to confirm reproduction.
- [ ] **Fix:** Replace 4 occurrences of `PERCENTILE_CONT(…)::int` with `ROUND(PERCENTILE_CONT(…)::numeric)::int` in the SQL queries at L125–127, L167–169, L212–214, L245–247.
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bugs that could share the root cause:
  1. Does `compute-cost-estimates.js` truncate any float→int conversions the same way? (grep for `::int` casts in SQL)
  2. Does `compute-trade-forecasts.js` floor division anywhere that should round? (L288: `Math.floor((predictedStart - today) / ms-per-day)` — intentional for daysUntil)
  3. Does `compute-opportunity-scores.js` truncate scores? (L85: `Math.round(raw)` — already rounds, OK)
  4. Are `p25_days` / `p75_days` cast the same way? (YES — they ARE in the same SQL; all three bounds need the same fix)
  5. Is there a parallel JS-side percentile in any sibling script that also truncates?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Output visible execution summary using ✅/⬜ for every step above. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: No migration needed · N/A for other §3 items
- ⬜ API: N/A
- ⬜ UI: N/A
- ✅ Shared Logic: Single file, 4 sites; paired p25/median/p75 must all land
- ✅ Pipeline: §9.1 N/A (read-only percentile math), §9.3 idempotency preserved, §3.2 N/A (no new queries)

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
