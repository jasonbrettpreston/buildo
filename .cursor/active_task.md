# Active Task: WF2 #3 — gate Surgical Triangle cost model on `permit_type_class`
**Status:** Implementation
**Workflow:** WF2 (Enhance — wire `permit_type_class` taxonomy into the cost model so non-construction permits stop receiving GFA-based slicing)
**Domain Mode:** Cross-Domain (Backend/Pipeline + Web Admin) — `scripts/lib/permit-type-classifier.js` + `src/lib/classification/permit-type-class.ts` mirrors, `scripts/compute-cost-estimates.js` SOURCE_SQL JOIN, `src/features/leads/lib/cost-model-shared.js` short-circuit, `src/features/leads/lib/cost-model.ts` shim, parity battery + cost-model logic tests.
**Rollback Anchor:** `3c780e8` (current HEAD on `main` — WF3 staleness thresholds shipped)

## Context
* **Goal:** Eliminate the $29M-for-2-signs / $1.96B WESTON GOLF CLUB class of bug that surfaces when sign permits and other non-construction permit_types inherit a host-building GFA through the Surgical Triangle. Per Spec 83 §3 the cost model only applies the Surgical Triangle when `permit_type_class = 'construction'`. Non-construction classes (`administrative`, `safety_upgrade`, `unclassified`, plus the reserved `signage`) skip cost slicing entirely → `cost_source = 'none'`, `estimated_cost = null`, `trade_contract_values = {}`. This is the cost-model peer of WF2 #2 (commit `9fdd31e`) which already gates the trade matrix and the realtor append on `permit_type_class`.
* **Target Spec:** `docs/specs/01-pipeline/83_lead_cost_model.md` §3 (the existing "WF2 #3, forthcoming" callout — promote to "WF2 #3, implemented 2026-05-08") + `docs/specs/01-pipeline/80_taxonomies.md` §5 Consumer behaviors (append a Cost-model sub-table mirroring the Trade-matrix sub-table from WF2 #2).
* **Key Files:** `src/features/leads/lib/cost-model-shared.js`, `scripts/compute-cost-estimates.js`, `src/features/leads/lib/cost-model.ts`, `src/lib/classification/permit-type-class.ts`, `scripts/lib/permit-type-classifier.js`, `src/tests/parity-battery.test.ts`, `src/tests/cost-model.logic.test.ts`, `src/tests/permit-type-class.logic.test.ts`, plus the two specs above.
* **Behavioral expectation post-merge:** ~4.5% of permits (the non-construction tail per Spec 80 §5 coverage stats) emit `cost_source='none'`. Pre-existing wrong cost_estimates rows for those ~4.5% become orphans; an explicit one-shot DELETE pass is filed as a follow-up WF3 (orphan cleanup is intentionally NOT in scope here, mirroring WF2 #2's clean rollback boundary).

## Technical Implementation

### Gate location — the Brain (single source of truth)

The short-circuit lives in `estimateCostShared(row, config)` in `cost-model-shared.js`. Both the Muscle (`compute-cost-estimates.js`) and the TS shim (`cost-model.ts`) delegate to the Brain, so gating once at the Brain layer auto-applies to both surfaces with no drift risk.

Contract:
* New required-soft input: `row.permit_type_class` (string | null | undefined).
* Helper `shouldApplyCostSlicing(permitClass)` returns `true` only when `permitClass === 'construction'`. `null` / `undefined` / any non-construction class → `false` (mirrors Spec 80 §5 default-to-`unclassified` discipline; matches WF2 #2's `shouldAppendRealtor` semantics).
* When `shouldApplyCostSlicing(row.permit_type_class) === false` → `estimateCostShared` returns the same shape it returns today on Zero-Total Bypass (`cost_source: 'none'`, `estimated_cost: null`, `trade_contract_values: {}`, `is_geometric_override: false`, etc.) BEFORE running Step A (GFA), Step B (Area_Eff), Step C (trade valuation), or Step D (Liar's Gate). Only `complexity_score` is still computed from `row` for downstream lead-score telemetry (WF2 #2 already feeds this on non-construction permits via the trade-matrix gate; keeping the field non-null on `cost_source='none'` rows preserves Spec 81 score-distribution telemetry).

### Dual-path mirrors (Spec 7 §7.1)

| Surface | New export |
|---|---|
| TS — `src/lib/classification/permit-type-class.ts` | `function shouldApplyCostSlicing(permitClass: PermitTypeClass): boolean` |
| JS — `scripts/lib/permit-type-classifier.js` | `function shouldApplyCostSlicing(permitClass)` (also added to `module.exports`) |

Parity regression-locked by `src/tests/permit-type-class.logic.test.ts` (extend the existing JS↔TS parity assertions block — it already covers `filterTradesByClass` + `shouldAppendRealtor` from WF2 #2).

### Muscle — `scripts/compute-cost-estimates.js`

* **SOURCE_SQL** — add `LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type` and `COALESCE(ptc.class, 'unclassified') AS permit_type_class` to the SELECT. NULL safety: missing rows fall back to `'unclassified'` per Spec 80 §5.
* **Telemetry** — accumulate `permit_type_class_skipped` counter when the Brain returns `cost_source='none'` and the cause is the new gate (distinguish from existing Zero-Total Bypass via the new internal flag `_permitTypeClassSkipped`). Emit as a new audit_table row alongside `liar_gate_overrides` and `zero_total_bypass`.
* **emitMeta** — declare `permit_type_classifications: ['permit_type', 'class']` as a NEW read-table dependency.
* **Startup-load sanity check (Spec 47 §R5)** — on entry, query `SELECT COUNT(*) FROM permit_type_classifications`; if 0, throw immediately ("`permit_type_classifications` table is empty — refusing to run; apply migration 120 first"). This prevents a bad deploy from silently treating every permit as `unclassified` and wiping all cost estimates.

### TS shim — `src/features/leads/lib/cost-model.ts`

* Add `permit_type_class?: PermitTypeClass | null` to `CostModelPermitInput`.
* In the surgical-brain branch, pass `permit_type_class: permit.permit_type_class ?? null` into the `row` object handed to `estimateCostShared`.
* The legacy v1 inline path stays untouched (it doesn't run when `config.tradeRates` is provided, which is the post-WF2 #1 production path; legacy callers without `tradeRates` get unchanged behavior).

### Tests — Red Light first

| File | New / extended assertions |
|---|---|
| `src/tests/permit-type-class.logic.test.ts` | (extend) `shouldApplyCostSlicing('construction')` → `true`. All four other classes → `false`. `null`/`undefined` → `false`. JS↔TS surface parity (both export the same boolean for every class in `PERMIT_TYPE_CLASSES`). |
| `src/tests/cost-model.logic.test.ts` | (extend every existing fixture) add `permit_type_class: 'construction'` so existing tests stay green. (new) ≥4 fixtures asserting `administrative` / `safety_upgrade` / `unclassified` / `signage` short-circuit to `cost_source='none'`, `estimated_cost=null`, `trade_contract_values={}`. (new) 1 fixture with `permit_type_class: undefined` → also short-circuits (safe-skip default per Spec 80 §5). |
| `src/tests/parity-battery.test.ts` | (extend) every existing fixture sets `permit_type_class: 'construction'` so the JS↔TS Brain↔shim byte-parity stays green. (new) ≥2 fixtures with non-construction classes asserting both surfaces emit identical `cost_source='none'` outputs. |
| `src/tests/compute-cost-estimates.infra.test.ts` (or the closest existing infra test) | (extend) regression-lock that SOURCE_SQL contains `LEFT JOIN permit_type_classifications` AND emitMeta declares the table. Mirrors the regex-shape pattern used in `src/tests/assert-staleness.infra.test.ts`. |

### Database Impact

**NO migration.** The `permit_type_classifications` table already exists (mig 120, WF2 #1). The new SOURCE_SQL JOIN is the only schema-touching change and it reads the existing table. UPDATE strategy on the 237K permits row set: not applicable — `cost_estimates` rows for non-construction permits will be naturally rewritten to `estimated_cost=NULL` on the next `compute-cost-estimates.js` run (the `IS DISTINCT FROM` guard in the bulk UPSERT ensures the WAL writes only the ~10K rows that actually change). Pre-existing wrong rows (~10K) are explicitly out of scope; the follow-up WF3 will issue a one-shot `DELETE FROM cost_estimates WHERE permit_num IN (SELECT … WHERE permit_type_class != 'construction')` once both WF2 #2 and #3 have stabilized.

## Standards Compliance

* **§2 Error handling:** the new short-circuit returns the existing CostEstimate shape. No new throws. The startup-guard throw on empty `permit_type_classifications` matches Spec 47 §R5 fail-fast pattern.
* **§3 Database:** No DDL. SOURCE_SQL gains one LEFT JOIN against a 25-row table — measurably zero EXPLAIN ANALYZE impact.
* **§6 Logging:** `pipeline.log.info` records the `permit_type_class_skipped` count once at end-of-run alongside the existing counters.
* **§7 Dual Code Path:** new `shouldApplyCostSlicing` mirrored TS↔JS; parity regression-locked by `permit-type-class.logic.test.ts`.
* **§9.3 Idempotent Scripts:** unchanged — `compute-cost-estimates.js` was already idempotent; the gate is deterministic per `(permit_type, classification table state)`.
* **Spec 47 §R4:** No new logic_variables → no Zod schema changes.
* **Spec 47 §R5:** new startup guard ("permit_type_classifications empty → throw") added.
* **Spec 47 §R10:** audit_table extended with `permit_type_class_skipped` row.
* **Spec 47 §R11:** emitMeta extended with `permit_type_classifications: ['permit_type', 'class']`.
* **Spec 80 §5 default-discipline:** `null`/`undefined`/unknown → `unclassified` → cost slicing OFF (matches WF2 #2 trade-matrix discipline).
* **Spec 83 §3:** the existing "WF2 #3 forthcoming" callout becomes the implementation reference.
* **Spec 86 §1:** no new logic_variables → no GlobalConfigCard GROUP changes; no `LOGIC_VAR_DEFAULTS` parity drift.
* **No backwards-compat hacks:** all existing test fixtures gain `permit_type_class: 'construction'` explicitly. Same boundary churn WF2 #2 accepted in `classification.logic.test.ts`. No legacy "skip-the-gate" config flag.

## State Verification (DONE before plan-lock)

* Confirmed `scripts/compute-cost-estimates.js` does NOT yet load or read `permit_type_class` (grep across the file + `src/features/leads/lib/cost-model.ts` returned 0 hits).
* Confirmed `scripts/lib/permit-type-classifier.js` already exports `loadPermitTypeClassMap` + `classifyPermitType` (mig 120 + WF2 #1) and `filterTradesByClass` + `shouldAppendRealtor` (WF2 #2). Adding `shouldApplyCostSlicing` is the natural third sibling.
* Confirmed Spec 83 §3 already reserves the WF2 #3 contract verbatim — implementation matches the spec, not the other way round.
* Re-read Spec 47 §R1–R12 + §R10–R11 for the audit_table + emitMeta extension shape; re-read Spec 86 §1 to confirm no Control Panel UI work is required (no new logic_variables).

## Execution Plan
- [ ] **R1** — Rollback anchor confirmed: `3c780e8`. Branch: `main`.
- [ ] **R2** — State verification: re-confirm no pre-existing `permit_type_class` references in cost-model surfaces (grep cost-model-shared.js, cost-model.ts, compute-cost-estimates.js).
- [ ] **R3** — Spec Review: re-read Spec 80 §5 + Spec 83 §3 + Spec 47 §R4–R11 + Spec 7 §7.1 (dual code path).
- [ ] **R4** — Reproduction tests FIRST (Red Light). One file at a time:
  - extend `src/tests/permit-type-class.logic.test.ts` with `shouldApplyCostSlicing` parity assertions (TS + JS surface equivalence)
  - extend `src/tests/cost-model.logic.test.ts` with non-construction short-circuit fixtures + add `permit_type_class: 'construction'` to every existing fixture
  - extend `src/tests/parity-battery.test.ts` similarly
  - add SOURCE_SQL regression-lock (one new infra test or extend an existing one)
  - run vitest on those four files — MUST fail.
- [ ] **R5** — Implementation (one file at a time):
  - `src/lib/classification/permit-type-class.ts` — add `shouldApplyCostSlicing` export
  - `scripts/lib/permit-type-classifier.js` — add `shouldApplyCostSlicing` to module.exports
  - `src/features/leads/lib/cost-model-shared.js` — add short-circuit at top of `estimateCostShared`
  - `src/features/leads/lib/cost-model.ts` — add `permit_type_class?` to `CostModelPermitInput`; pass through to brain row
  - `scripts/compute-cost-estimates.js` — extend SOURCE_SQL with the JOIN + permit_type_class column, add startup guard, extend audit_table + emitMeta
  - `docs/specs/01-pipeline/80_taxonomies.md` §5 — append Cost-model behavior sub-table
  - `docs/specs/01-pipeline/83_lead_cost_model.md` §3 — promote callout to "implemented"
- [ ] **R6** — Green Light: all targeted tests pass + `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: re-run vitest twice; confirm deterministic.
- [ ] **R8** — Live verification: `node scripts/compute-cost-estimates.js --dry-run` (verifies SOURCE_SQL parses + JOIN works) followed by a small `--limit=500` real run; assert audit_table reports `permit_type_class_skipped > 0` and verdict stays PASS.
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. `shouldApplyCostSlicing` returns `true` ONLY for `'construction'` (verified by parity test) — null/undefined/non-construction all return `false`?
  2. `estimateCostShared` short-circuit fires BEFORE GFA/Area_Eff/Liar's Gate computation — no math runs on non-construction rows?
  3. Brain returns the canonical `cost_source='none'` shape (estimated_cost=null, trade_contract_values={}) — same as Zero-Total Bypass?
  4. SOURCE_SQL JOIN uses LEFT JOIN + COALESCE so an unclassified permit_type still gets a row (no INNER JOIN that would silently drop permits)?
  5. emitMeta + audit_table both updated; startup-guard throws on empty `permit_type_classifications`?
- [ ] **R10** — Multi-Agent Review (per project feedback memory: WF1/WF2 always run BOTH adversarial models + parallel worktree code-reviewer, all in a single message — three parallel tool calls). Files: `src/features/leads/lib/cost-model-shared.js` + `scripts/compute-cost-estimates.js`. Spec context: `docs/specs/01-pipeline/83_lead_cost_model.md` (Brain) and `docs/specs/01-pipeline/80_taxonomies.md` §5 + Spec 47 §R5/R10/R11 (Muscle).
  - Triage: BUG → file new WF3 before Green Light; DEFER → append to `docs/reports/review_followups.md`.
- [ ] **R11** — Atomic commit on `main`: `feat(83_lead_cost_model): WF2 #3 — gate Surgical Triangle on permit_type_class (Brain short-circuit + Muscle SOURCE_SQL JOIN)`. Spec 05 §5 footer.
- [ ] **R12** — Push `main`.

§10 note: gate lives in the Brain (single source of truth) so the byte-identical short-circuit applies to both the Muscle and the TS read-path with zero drift risk; explicit fixture-update churn in cost-model.logic + parity-battery tests (every fixture gains `permit_type_class: 'construction'`) is the deliberate cost of the no-legacy-bypass-flag policy that WF2 #2 already established.

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> §10 note: Brain-level gating + explicit-fixture-class on every test (no legacy bypass flag) — same discipline as WF2 #2.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
