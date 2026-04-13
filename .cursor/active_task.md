# Active Task: WF3 — Accuracy Layer Bug Fixes
**Status:** Planning → Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `4dcc635` (feat(91_signal_evolution))
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Fix 4 bugs found by independent + adversarial review agents in the Accuracy Layer scripts (compute-cost-estimates.js, compute-trade-forecasts.js, compute-opportunity-scores.js).
* **Target Spec:** Valuation Engine + Opportunity Scoring

## Bugs

### Bug 1 (CRITICAL) — TRADE_ALLOCATION_PCT sums to 1.23
The 32 trade allocation percentages sum to 1.23, not ~1.0. Every `trade_contract_values` JSONB over-allocates by 23%. A $1M permit produces $1.23M in total trade values, systematically inflating opportunity scores by ~23%. Both reviewers flagged.

### Bug 2 (CRITICAL) — lead_analytics JOIN missing LPAD
`compute-opportunity-scores.js` concatenates `'permit:' || tf.permit_num || ':' || tf.revision_num` but the canonical key format uses `LPAD(revision_num, 2, '0')`. Revision `'0'` produces key `'permit:X:0'` but the actual lead_analytics row has `'permit:X:00'`. The LEFT JOIN silently fails → zero competition penalty → inflated scores.

### Bug 3 (HIGH) — emitMeta missing new cost_estimates columns
The `emitMeta` write declaration in compute-cost-estimates.js omits `is_geometric_override`, `modeled_gfa_sqm`, and `trade_contract_values` — all 3 are written in the UPSERT. Admin DataFlowTile shows incomplete write footprint.

### Bug 4 (HIGH) — Liar's Gate on fallback estimates
When `usedFallback=true` (building area from lot-size, not massing), the model has ±50% uncertainty. A $1,500 interior reno on a large lot → model = $368K → Liar's Gate triggers override. Legitimate small permits get flagged as liars. Fix: skip Liar's Gate when `usedFallback`.

## Standards Compliance
* **Try-Catch Boundary:** N/A — script-internal fixes.
* **Unhappy Path Tests:** Infra test already covers script shapes. No new tests needed for these fixes.
* **logError Mandate:** pipeline.log (unchanged).
* **Mobile-First:** N/A.

## Execution Plan

- [x] **Rollback Anchor:** `4dcc635`
- [x] **State Verification:** TRADE_ALLOCATION_PCT confirmed 1.23 via node. LPAD mismatch confirmed via code review. emitMeta confirmed missing columns. usedFallback confirmed in scope at the Liar's Gate check.
- [x] **Spec Review:** Valuation Engine spec (in active_task from prior WF1).
- [ ] **Reproduction:** Bug 1 verified numerically. Bug 2 would surface when lead_analytics has rows. Bug 3 visible in admin DataFlowTile. Bug 4 reproducible with any interior reno on a large lot.
- [ ] **Fix:**
  1. Normalize TRADE_ALLOCATION_PCT: divide each value by the sum (1.23) so they total 1.0
  2. Add LPAD to opportunity scores JOIN
  3. Add 3 columns to cost_estimates emitMeta
  4. Add `&& !usedFallback` guard to Liar's Gate condition
- [ ] **Pre-Review Self-Checklist:**
  1. Does the normalized sum equal exactly 1.0? (verify via node)
  2. Does LPAD match the canonical format in record-lead-view.ts?
  3. Are all 3 new columns in emitMeta?
  4. Does the fallback guard prevent false overrides without blocking real liars?
- [ ] **Green Light:** `npm run test && npm run typecheck`. Re-run cost estimates + opportunity scores on live DB.
- [ ] → Commit.

## Deferred to review_followups.md
- Elite tier unreachable (max score 75, elite threshold 80) — product formula calibration
- Competition penalty too aggressive (50 per tracker, 2 trackers = score 0) — product formula calibration

---

## §10 Compliance
- ✅ **DB:** No schema changes. Script-internal fixes only.
- ⬜ **API / UI:** N/A
- ⬜ **Shared Logic:** TRADE_ALLOCATION_PCT is pipeline-only (no dual path).
- ✅ **Pipeline:** All 3 scripts use Pipeline SDK. emitMeta corrected.
