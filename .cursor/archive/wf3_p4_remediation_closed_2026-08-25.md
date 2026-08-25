# Active Task: WF3 — Pilot 1 P4 remediation: externalize assert_schema's 3 hidden knobs + enforce Spec 122 §1.2a P4 for every pilot
**Status:** Implementation (authorized 2026-08-25 "1) y")

## Context
* **Goal:** Close the first known §1.2a P4 violation (`assert_schema` declares `config: "none"` while compute hard-codes `limit=20` `:290`, `Range: bytes=0-2048` `:327`, `bytes=0-8192` `:343`) and land the enforcement so no later pilot can repeat it.
* **Target Spec:** Spec 122 §1.2a P4 (directive) + §5.5; Spec 47 §4.1–4.2 (operator-tunable → `logic_variables`, Zod-validated); Spec 99 registry (`docs/reference/logic-variables-registry.md`); Spec 86 control panel.
* **Premise (grounded 2026-08-25, investigation agent — every anchor executed):** table `logic_variables(variable_key PK, variable_value, variable_value_json, …)` migs 092/093; seed contract mig 099 → `scripts/seeds/logic_variables.json` `{key:{default,type,min,max,description}}` applied by `scripts/seeds/apply-logic-variables.js` at the end of `npm run migrate` (`ON CONFLICT DO NOTHING`) — **no migration for a new var**; loader `scripts/lib/config-loader.js` `loadMarketplaceConfigs(pool, tag)` (:75, one SELECT :185, fallback :226-236) + `validateLogicVars` (:263); registry generator `scripts/generate-logic-vars-docs.mjs` + drift test `logic-vars-registry.infra.test.ts`; admin `GET/PUT /api/admin/control-panel/configs` → `applyConfigUpdate` (`src/lib/admin/control-panel.ts:295-308`); UI `GlobalConfigCard.tsx` GROUPS hard-list (:23-174) — **a seeded var absent from GROUPS is invisible to operators**; `control-panel.logic.test.ts` asserts GROUPS ⊆ seed only. Schema `config` (`step.schema.json:1154-1192`) already expresses `logic_variables[{name,min,max,on_invalid}]`, `validation`, `hoisted_above_gate`; **`scripts/lib/step/index.js` never reads `descriptor.config`** (grep 0). Seed `min/max` has zero readers.
* **Key Files:** `scripts/lib/step/index.js` · `scripts/seeds/logic_variables.json` · `src/components/GlobalConfigCard.tsx` (GROUPS) · `scripts/quality/assert-schema.descriptor.json` · `scripts/lib/compute/assert-schema.js` · `scripts/ast-grep-rules/compute-shape.yml` · `src/tests/step-conformance.infra.test.ts` · `src/tests/steps/assert_schema/violations.test.ts` · `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (§5.5 addendum)

## Technical Implementation
* **Library:** `ctx.config` — before the advisory lock when `hoisted_above_gate`, else after: `loadMarketplaceConfigs(pool, slug)`, project to declared names, apply `min/max` + `on_invalid` (`fail` → throw before compute; `default` → seed default; `clamp`), freeze, expose `ctx.config.<name>`; missing-from-registry → throw at load; resolved values stamped into `records_meta.config` (observability, ~30 B/var). `validation: "strict"` = any consumed-but-undeclared name is unreachable (compute only sees the projection).
* **Seed (+ docs regen):** `assert_schema_type_sample_rows` 20 [1,1000] int · `assert_schema_csv_header_bytes` 2048 [256,65536] · `assert_schema_geojson_probe_bytes` 8192 [1024,1048576]; descriptions cite `CONSUMED by assert_schema`. `npm run logic-vars-docs`. Admin GROUPS "Data Quality Thresholds" += 3 keys.
* **Descriptor:** `config: {logic_variables:[…×3 with min/max, on_invalid:"fail"], validation:"strict", hoisted_above_gate:true}`; `permit_cost_type_sample.expect.sample` literal 20 → reference the var (no second copy).
* **Compute:** the three literals → `ctx.config.*`. `limit=0` (metadata-only sentinel `:250`) stays and is allow-listed as structural.
* **Enforcement (gates Pilot 2+):** conformance — for every converted descriptor: declared ⊆ seed∪migration-seeded keys; every `LOGIC_VARS_SCHEMA`/`CONSUMED by <step>` key ⊆ declared; declared ⊆ admin GROUPS. compute-shape rule: numeric literal in `ctx.fetch` options/headers, `limit=|sample=\d+` in URL strings, numeric threshold vs a violation count — unless from `ctx.config`; known-bad fixture proves it fires; allow-list `limit=0`.
* **Parity lock:** seed default ≡ old literal (pattern `logic-var-parity.logic.test.ts`); both-directions: removing a var from the seed reddens conformance; hard-coding a literal back reddens the shape rule.
* **Database Impact:** NO migration (mig-099 seed contract). Cloud/local DBs receive the 3 rows at next `npm run migrate` — until then `on_invalid: fail` would REFUSE the step → **ship `on_invalid: "default"` for these 3 in pilot 1** (seed default = old literal, so behaviour is identical pre-seed) and record the choice in the descriptor why; `fail` is the standard for vars with no safe default.
* **I/O (P3):** loader already fetches all rows once per run — flat in N; `records_meta.config` +~90 B/run. Accepted in plan.

## Standards Compliance
* **Try-Catch Boundary:** library `runWithPool` try/finally unchanged; config load failure is a pre-compute throw → ledger `failed` + `error_message`. No API route change (GROUPS is a UI constant; API untouched).
* **Unhappy Path Tests:** missing registry key; value below min with `fail`/`default`/`clamp`; non-finite value; descriptor declares a var the seed lacks (conformance red); compute reads a literal (shape red).
* **logError Mandate:** N/A (`scripts/` uses `pipeline.log.*`).
* **UI Layout:** GROUPS list edit only (desktop-first unchanged) — Cross-Domain touch is one constant; no layout change.

## Execution Plan
- [ ] Library `ctx.config` + tests (`step-library.logic.test.ts`)
- [ ] Seed + regen + GROUPS + parity lock
- [ ] Descriptor `config` + compute edits; differential ×4 vs `docs/reports/golden/assert_schema/post/` must show ONLY the `records_meta.config` stamp (declared)
- [ ] Conformance both-directions + compute-shape rule + known-bad fixture
- [ ] Spec 122 §5.5 addendum (config seam) — ≤8 lines
- [ ] Green: `npx vitest run` affected files + `node scripts/hooks/check-step-shape.mjs` + `npm run typecheck` + `npm run lint`
- [ ] OUTPUT panel: Regression Guardian + Integration (main tree) → fold → commit → land to main
