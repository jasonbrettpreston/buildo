# Active Task: Cost-model dual-path convergence (dedup + Liar's Gate)
**Status:** Planning
**Domain Mode:** Backend/Pipeline (touches `src/features/leads/lib/` TS module — technically cross-domain but lib module is shared logic, no UI work)
**Finding:** H-W8 + H-W9 · 83-W2, 83-W3, 83-W4

## Context
* **Goal:** Close the CLAUDE.md §7.1 dual-path drift between `scripts/compute-cost-estimates.js` (pipeline writer) and `src/features/leads/lib/cost-model.ts` (API read path). Two specific drifts: (1) JS `sumScopeAdditions` and `computeComplexityScore` iterate raw `scope_tags` array without dedup, TS uses `new Set()` — duplicate `['pool','pool']` tags inflate DB-stored cost by $80K vs. API recompute; (2) Liar's Gate (permit-cost underreporting override) exists in JS L237–244 but is entirely absent from TS `estimateCost` — API returns raw permit cost, DB stores model-overridden cost, `is_geometric_override`/`cost_source='model'` fields become lies.
* **Target Spec:** `docs/specs/product/future/83_lead_cost_model.md` (document Liar's Gate as authoritative algorithm; add dedup semantics; clarify producer-consumer cost contract)
* **Key Files:**
  - `scripts/compute-cost-estimates.js` (L165–176 sumScopeAdditions, L186–202 computeComplexityScore, L230–244 Liar's Gate)
  - `src/features/leads/lib/cost-model.ts` (mirror functions — exact line numbers to verify)
  - Both SPEC LINK headers point to wrong spec (72 instead of 83) — fix as part of this plan

## Technical Implementation
* **New/Modified Components:**
  - Dedup: add `new Set(tags)` in JS `sumScopeAdditions` + `computeComplexityScore` (mirrors TS).
  - Liar's Gate: port the entire gate logic block from JS L226–244 into TS `estimateCost` at the equivalent Path-1 branch.
  - Optional follow-up (not blocking): extract shared constants to `scripts/lib/cost-model-shared.js` consumed by both (tracked in 83-D14 defer list).
* **Data Hooks/Libs:** `cost-model.ts` is the TS read-path; keep byte-for-byte sync with JS writer per §7.1.
* **Database Impact:** NO direct schema change. Recomputation will land corrected values on the next run.

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:** (a) `scope_tags=['pool','pool']` → cost adds $80K (once), not $160K; (b) permit with `est_const_cost=1000, modeled_cost=100000, liar_gate_threshold=0.25` → TS `estimateCost` returns `100000` with `is_geometric_override=true, cost_source='model'`; (c) permit with `est_const_cost=80000, modeled_cost=100000` → TS returns raw permit cost 80000 (gate doesn't fire).
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Grep `permits.scope_tags` for actual duplicates — quantify how many rows have duplicate tags today. Query `cost_estimates WHERE is_geometric_override = true` to count how many permits are currently overridden in DB but would return a different value via API.
- [ ] **Spec Review:** Read spec 83 §3 (edge cases + Liar's Gate). Verify spec authorizes both the gate and dedup. Draft spec §3 update declaring the dedup-set semantics explicitly.
- [ ] **Reproduction:** Extend `src/tests/cost-model.logic.test.ts` (TS unit test file). Three fixtures per unhappy-path list. Also test that JS + TS produce identical outputs for a battery of 10+ permit shapes (parity test).
- [ ] **Red Light:** Tests fail for (a) dedup in TS (it passes — only JS lacks dedup; but the parity test fails) and (b) Liar's Gate in TS (it doesn't fire).
- [ ] **Fix:**
  1. **JS dedup**: in `compute-cost-estimates.js`, wrap `tags` in `new Set(tags)` at L168 (sumScopeAdditions) and L194 (computeComplexityScore). Mirror the TS implementation line-for-line.
  2. **TS Liar's Gate port**: in `cost-model.ts`, add the gate at the equivalent Path-1 branch. Load `liar_gate_threshold` via the same config loader used elsewhere in TS lib OR accept as a function parameter. Match JS semantics including the `!usedFallback` carve-out.
  3. **SPEC LINK fix**: update both files' headers to `docs/specs/product/future/83_lead_cost_model.md` (they currently reference `72_lead_cost_model.md`).
  4. Add parity test: random 50 permit fixtures, assert `estimateCostInline(JS)` equals `estimateCost(TS)` output byte-for-byte.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `computePremiumFactor` drift between JS/TS? Compare L134–142 (JS) vs TS equivalent.
  2. Does `determineBaseRate` drift (JS L131 fallback vs TS branch order per 83-adv finding)? 
  3. Does `determineCostTier` use identical boundaries in both files?
  4. Does the `PREMIUM_TIERS` / `BASE_RATES` / `SCOPE_ADDITIONS` / `COST_TIER_BOUNDARIES` / `COMPLEXITY_SIGNALS` constant set match byte-for-byte? (Grep + diff.)
  5. Does the `computeComplexityScore` ?? vs || drift (83-D16) matter for this fix?
  6. Does the test cover the `usedFallback` case where Liar's Gate is intentionally suppressed?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: None
- ⬜ API: No route changes · read-path recomputation only
- ⬜ UI: Front-end out of scope
- ✅ Shared Logic: §7.1 is THE primary target · JS + TS must land in same commit · SPEC LINK in both files updated
- ✅ Pipeline: §9 N/A

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
