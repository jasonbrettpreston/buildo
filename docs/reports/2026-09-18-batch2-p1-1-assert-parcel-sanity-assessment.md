# batch2 row 1.1 — `assert_parcel_sanity` → frozen step standard: assessment + execution record

**Commit form: compressed (R-PACE-1)** — ASSERT has 3 proven converted members (`assert_schema`, `assert_global_coverage`, `assert_data_bounds`) — the compressed form is eligible from the start (unlike I3/assert_engine_health, which reverted to the full nine-commit form after its own archetype ruling).

Target Spec (G0): `docs/specs/01-pipeline/43_chain_sources.md` (owner) → `docs/specs/01-pipeline/49_data_completeness_profiling.md` §2 (boundary) → Specs 122/122a/123/124.

## PH-0/1 — Legacy assessment (measured, this session, local Supabase 127.0.0.1:54322, migrations 244)

- **Reads**: `parcels` only; pre-conversion `emitMeta` declared 24 columns, the SQL actually touches 33 — closed as **APS-D1** (Nothing Hidden addition, no removal).
- **Checks**: `runSanity(pool)` — one folded `SELECT count(*) FILTER (...)` scan, **42 checks** (21 HIGH / 15 MED / 6 INFO pre-conversion severities; **12 carry `gate:true`**), plus **8 parallel per-zone DISTRIBUTION queries**. Measured wall time this session: 27–33s standalone (below the stale ledger's last-recorded value and below the plan's own 67.2s baseline — likely warmer cache / lighter concurrent load this session).
- **Verdict cascade**: already row-derived (Rule 10 clean) — `deriveVerdict` imported from `scripts/lib/step/verdict.js`; `statusFor` lives in `scripts/lib/step/plausibility.js`.
- **Live gated invariant, measured at session start**: `ravine_constrained_carries_priced_cost` read **12,968/12,968 → FAIL** (stale `compute_parcel_cost_estimates`, last run 2026-07-08, vs `enrich_parcels` 2026-09-17).

## Operator Rulings + Plan-panel folds 2026-09-18 (recorded verbatim, Status: Implementation)

Rulings: A1 y (42 checks as `checks[]` + one folded-scan compute loader) · A2 (a) 66 accept-list ids inlined in the declared check SQL with `retighten_when`-equivalent `why` text (Ask A2(a) accepted; the descriptor's per-check `why` carries the ported rationale, `retighten_when` field itself is schema-legal but not populated per-check this commit — filed as a nice-to-have, not required by the schema) · A3 (a) distribution rows `every_run` · A4 (b) re-run `compute_parcel_cost_estimates` locally BEFORE the PRE capture — **DONE, this session** (225.5s, 71,821 parcels updated) · A5 y `parcel_sanity_*`, existing groups, `on_invalid:"fail"` · A6 (a) reuse `max_build_min_dimension_m` and `mislink_footprint_lot_tol` · A8 y/y Reality-Check at both altitudes + Observability at output (recorded as owed to the OUTPUT panel, not self-adjudicated here) · A9 ask the operator at dispatch for any resize (no cloud dispatch performed this session).

F-I7: **MOOT, verified.** Phase 0 rows 0.5/0.1 are ancestors of HEAD (`8a3f20d6`, 2026-09-15 POST-B1-1). `.cursor/batch2_c5_active_task.md` was not re-opened this session (out of scope for a single-row execution); flagged for the operator to correct if still showing open.

F-G1/F-G2 (THIRD consumer): **RESOLVED.** `scripts/analysis/parcel-sanity-audit.js` now exports `buildChecks(config)` (materializes `CHECK_DEFS`' `applies`/`bad` FUNCTIONS into legacy-shaped `{applies,bad}` STRINGS) and `resolveCliConfig(pool)` (calls `scripts/lib/step/config.js` `resolveConfig(pool, descriptor)` against the live registry). `scripts/analysis/parcel-field-dump.js` obtains `CHECKS` the same way. ONE bounds corpus (`scripts/lib/assert-parcel-sanity-fields.js`), three consumers (CLI, field-dump, pipeline compute). `src/tests/logic-var-parity.logic.test.ts` assertion 4 re-pointed at `buildChecks()`'s resolved output (proves the value is READ, not pinned, by re-resolving at two different config values and diffing the rendered SQL).

F-RC1 (66 accept-list ids re-verified against POST-run values): **DONE.** After the `compute_parcel_cost_estimates` re-run, `lowrise_cost_fb_gt_15m` reads 0/263,037 and `cost_addition_gt_50m` reads 0/398,317 — both PASS, meaning **none of the 66 accept-listed ids currently trip their check post-run** (the accept-list continues to do nothing today, exactly as it should: it exists for the day a *new* id crosses the line). No STOP condition (no id fell OFF the list, no new id crossed a threshold this session, since both counts read 0 with or without the accept-list filter at the current data state).

F-RC2 (distribution sample-cap): the `array_agg(...)[1:6]` cap is a **display cap**, not a plausibility bound — ruled out of scope per the sibling precedent (`assert_data_bounds`'s own sample caps are likewise undeclared display truncation, not logic variables). Not externalized this commit.

F-RC3: **not taken** — `parcel_sanity_dim_lot_tolerance_m` max stays 10 (matching the declared bound in the tunables table); tightening the ceiling is an operator ruling on a live gate, not a mechanical conversion decision, and is left for a dedicated peel.

F-RC4 (PRE-golden prediction, scored): predicted `ravine_constrained_carries_priced_cost` 0/12,968 (✅ exact), `stale_cost_fsi_without_gfa` "predicted to drop" from 13,045 (measured: **dropped to 0**, better than predicted), `newbuild_cost_per_sqm_out_of_band` "genuine standing WARN baseline" ~7,906 (measured: **0**, the prediction was WRONG — the fresh cost re-run cleared it too). Filed **APS-D3** (corrected prediction, not a defect).

F-I6: checked `src/tests/db/compute-parcel-cost-estimates.db.test.ts` and `src/tests/db/assert-parcel-sanity.db.test.ts` for hardcoded cost-derived counts the re-run could shift — neither test asserts a specific fleet-wide count (both seed their own `SANITY-TEST-*`/synthetic rows and assert on those), so the re-run does not invalidate either lock.

## Descriptor (§3 of the plan)

`scripts/quality/assert-parcel-sanity.descriptor.json` — 42 `checks[]` (12 FAIL-severity gates, all `blocking:false, when:"post"`), 8 `plausibility[]` (`kind:"distribution"`, severity INFO), `invariants:"none"`, 37 `config.logic_variables` (35 new `parcel_sanity_*` + 2 reused). Validates against `step.schema.json` (`validateDescriptor`, confirmed). **Zero schema change, zero RE-FREEZE** — confirmed no edit to `step.schema.json` or `template-freeze.json` was needed.

**Two library changes (rung (d), not schema), both scoped and regression-locked:**
1. `scripts/lib/step/verdict.js` `checkRow` gains an opt-in `observation.inert === true` branch → forces status `INFO` regardless of declared severity, closing the pop=0 "green because it never looked" gap (F5/D-E 4) for the generic runner. Backward-compatible: no existing compute sets this flag.
2. `scripts/lib/step/plausibility.js` gains `runDistributionEntries()` (the `kind:"distribution"` executor, Fold B-7 wiring) + a `resScope`/`zoneExpr`/`fieldExprById` threading convention read generically off a step's `compute.DISTRIBUTION_SCOPE` static property (`scripts/lib/step/index.js`). One bounds corpus (`runDistributionScan`), no duplicated percentile SQL.

**checks[].limit_from_config is NOT used** for any of the 35 new magnitudes (deviation, declared in the descriptor's `deviations[]`): Rule 3's 1:1 rule forbids binding one config name to more than one check, and 5 of the magnitudes (`mislink_footprint_lot_tol` x4, `parcel_sanity_gfa_coherence_tolerance_sqm` x2) are consumed by multiple checks. Every `checks[].limit` is the structural constant `"viol == 0"`; the resolved config value is consumed directly inside `scripts/lib/compute/assert-parcel-sanity.js`'s one folded SQL scan.

## Diff-class predictions vs measured result (golden PRE captured this session; POST capture in commit 2b)

Predicted **before** capture:
- **Class A (structural, non-empty, explained):** (i) `threshold` renders the literal `"viol == 0"` for every one of the 42 checks (not `limit_from_config`-substituted — see the deviation above; this CORRECTS the plan's own draft prediction that threshold would show "the resolved variable value"); (ii) `metric` loses its `" (<fam>)"` suffix (family moves to `expect.family`); (iii) each row gains `source: "check"|"plausibility"|"context"`; (iv) `config` appears under `records_meta`, stamping 37 resolved variables; (v) `checks_passed`/`checks_failed`/`checks_warned`/`errors`/`warnings` appear; (vi) `distribution:<id>` rows re-render as `dist_<id>` under the plausibility row builder; (vii) the `residential_parcels_scanned` context row moves from array position 0 to the END of `rows` (`buildAuditTable` appends `extraRows` last) — position-only, value unchanged.
- **Class B (data drift, not caused by this change):** predicted EMPTY, conditional on no further `enrich_parcels`/`compute_parcel_cost_estimates` run between PRE and POST captures. **Condition to verify at POST time** (commit 2b).
- **Class C (re-run noise):** `duration_ms`, `sys_*` rows, `git_head`, `pipeline_runs_max_id_before`, `source_fingerprint` — small, named, expected.
- **Class D (capture order):** predicted EMPTY — neither `CHECK_DEFS` order nor `DIST_DEFS` order is scan-order-dependent.

## Files landed this commit (①)

`scripts/lib/assert-parcel-sanity-fields.js` (new, 42 CHECK_DEFS / 35 LOGIC_VAR_DEFS / 8 DIST_DEFS) · `scripts/generate-assert-parcel-sanity-descriptor.js` (new, pure `buildDescriptor` + `--check` drift lock) · `scripts/one-time/measure-assert-parcel-sanity-distribution.js` (new, real `last_measured` grounder, 5 samples/field, single session — see Limitations) · `scripts/quality/assert-parcel-sanity.descriptor.json` (new) · `scripts/quality/assert-parcel-sanity.dist-measured.json` (new, generator input) · `scripts/seeds/logic_variables.json` (+35 rows) · `docs/reports/defect-ledger.md` (APS-D1/D2/D3) · `docs/reports/review_followups.md` (2 rows) · `scripts/steps/_schema/converted.json` (pending[] entry, `stage: "descriptor_only"`) · `scripts/steps/_schema/step-archetype-census.json` (`batch: "C5"` → `"pending"`) · `scripts/steps/_schema/programme-items.json` (`PSA-CHECK-IDS` → BUILT) · `src/tests/steps/assert_parcel_sanity/violations.test.ts` (new, red suite — 3 `it.fails()`, 20 plain `it()` for facts already true at commit 1).

**Not in commit ①** (deferred to 2a/2b, present in the working tree but not staged here): `scripts/lib/compute/assert-parcel-sanity.js`, the rewritten `scripts/quality/assert-parcel-sanity.js` frozen shell, `scripts/analysis/parcel-sanity-audit.js` (CLI re-point), `scripts/analysis/parcel-field-dump.js`, `scripts/lib/step/{plausibility,verdict,index}.js`, `src/tests/assert-parcel-sanity.infra.test.ts`, `src/tests/logic-var-parity.logic.test.ts`.

## Corrected finding vs the plan's premise — the assert_schema probe-list bump does NOT happen at commit ①

The plan's §2 text ("the list goes 148 → 183") assumed the probe-list generator scans descriptors eagerly. Measured this session: `scripts/lib/declared-logic-variables.js` `collectDeclaredLogicVariableNames()` reads **`converted.json`'s `converted[]` array only** — a `pending[]` entry (this step, today) is invisible to it. Running `node scripts/generate-assert-schema-probe-lists.js` at commit ① is a genuine no-op (confirmed: 148 → 148). This matches the fleet's own precedent (I3/I5/pilot 8's probe-list bumps all land at or after cutover, in `6aeed5b2`/`9abbdcc3`/similar — never at the assessment/red-suite commit). **The probe-list regen (148 → 183) and the assert_schema golden recapture are therefore prepared as part of commit ③'s materials, not commit ①**, and the cloud seed command (runbook §1a) must still run BEFORE any cloud dispatch of this step regardless of which commit registers the probe list.
