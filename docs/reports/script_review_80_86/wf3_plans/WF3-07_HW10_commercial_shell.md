# Active Task: Commercial Shell 0.60x multiplier on interior trade slices
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W10 · 83-W1

**Blocked by Decision D2:** Spec 83 §3 L55 states "If the permit is for a 'Shell,' a `0.60x` multiplier is applied to interior trade slices." Two ambiguities require decision before implementation:
- D2.1 — Which trades count as "interior"? Enumerate trade_slugs (e.g., drywall, electrical, plumbing, hvac, insulation, painting, flooring, tiling, millwork-cabinetry, trim-work) OR add `is_interior BOOLEAN` column to `trade_configurations` OR use a hardcoded Set.
- D2.2 — What defines a Shell permit? Substring match on `permit_type` / `work` for "shell"? A `structure_type` predicate? A combination?

## Context
* **Goal:** Implement the spec-mandated 0.60x multiplier on interior trade slices for Commercial Shell permits. Currently absent in both JS (`compute-cost-estimates.js`) and TS (`cost-model.ts`) code paths — Shell permits overstate interior trade values by ~67% (1.0 / 0.6), feeding inflated `trade_contract_values` JSONB that spec 81's opportunity score engine reads directly.
* **Target Spec:** `docs/specs/product/future/83_lead_cost_model.md` §3 Edge Cases + §6 trade matrix (extend with shell + interior_trade flag per H-S24)
* **Key Files:**
  - `scripts/compute-cost-estimates.js` (L83–86 isNewBuild, L205–213 sliceTradeValues — add Shell branch; needs helper `isShell(permit)`)
  - `src/features/leads/lib/cost-model.ts` (mirror byte-for-byte per §7.1)
  - `scripts/lib/config-loader.js` (if D2.1 choice is config-driven — no change if hardcoded Set)
  - Possibly `migrations/NNN_trade_configurations_is_interior.sql` (if D2.1 is DB-driven)

## Technical Implementation
* **New/Modified Components:**
  - `isShell(permit)` helper — `permit_type.toLowerCase().includes('shell')` or spec'd predicate.
  - Extension to `sliceTradeValues(totalCost, permit)` — takes the permit for Shell detection. Apply 0.60x to slices for interior trades only.
  - `INTERIOR_TRADE_SLUGS` Set in both JS + TS (§7.1 sync).
* **Data Hooks/Libs:** Either a hardcoded interior-trade Set OR a config-loader addition. Depends on D2.1.
* **Database Impact:** Conditional — YES if D2.1 chooses a `trade_configurations.is_interior BOOLEAN` column; NO if hardcoded Set or derived predicate.

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:** (a) Shell permit, interior trade (e.g., drywall) with `totalCost=100000, allocation_pct=0.05` → slice=5000 × 0.60 = 3000; (b) Shell permit, exterior trade (e.g., roofing) → slice unchanged; (c) non-Shell permit, any trade → slice unchanged (sanity/regression).
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Query `SELECT permit_type, COUNT(*) FROM permits WHERE permit_type ILIKE '%shell%' GROUP BY 1;` — quantify Shell permits. Query existing `cost_estimates.trade_contract_values` for those permits to show the current (inflated) values.
- [ ] **Spec Review:** Await D2. Confirm spec 83 §3 + §6 updates land alongside (or just before) this WF3.
- [ ] **Reproduction:** Extend `src/tests/cost-model.logic.test.ts` (TS). Three fixtures covering the unhappy-path list. Add JS parity test to `src/tests/compute-cost-estimates.logic.test.ts`.
- [ ] **Red Light:** Tests fail because the multiplier is never applied.
- [ ] **Fix:**
  1. Add `INTERIOR_TRADE_SLUGS` Set to both files (or equivalent mechanism per D2.1).
  2. Add `isShell(permit)` helper to both files (matching predicate per D2.2).
  3. Modify `sliceTradeValues` signature: `sliceTradeValues(totalCost, permit)`. When `isShell(permit)` is true, multiply each slice value by 0.60 for interior trades only.
  4. Update TS `estimateCost` similarly.
  5. If D2.1 chose DB-driven: write migration `trade_configurations.is_interior BOOLEAN` with backfill based on agreed trade list; update config-loader to surface the flag.
  6. Update SPEC LINK in both files if not already done by WF3-06.
- [ ] **Pre-Review Self-Checklist:**
  1. Does the existing Liar's Gate (per WF3-06) interact with Shell multiplier correctly? (Total cost may be overridden; slicer applies to `estimatedCost` which is post-gate — OK, but verify.)
  2. Does the 0.60x round cleanly? `Math.round(3000 * 0.60) = 1800`, fine.
  3. Should the multiplier also reduce `estimated_cost` (the top-line) or only the per-trade slices? Spec says slices only — verify.
  4. Does the downstream opportunity score (spec 81) recompute correctly with reduced slice values?
  5. Rollback plan: the next pipeline run recomputes cost_estimates; no data mutation needed at deploy time. On rollback: re-deploy old code, re-run pipeline.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: IF D2.1=DB-driven: migration with UP+DOWN; backfill plan for 237K rows (is_interior BOOLEAN is trivially backfillable from a constant list per trade)
- ⬜ API: N/A
- ⬜ UI: N/A
- ✅ Shared Logic: §7.1 dual-path sync · interior trade list is new shared enum — must match JS + TS
- ✅ Pipeline: §9 N/A; idempotent UPSERT preserves re-run safety

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
