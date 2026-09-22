# batch2 row 1.1 — `assert_parcel_sanity` → frozen step standard: assessment + execution record

**Commit form: compressed (R-PACE-1)** — ASSERT has 3 proven converted members (`assert_schema`, `assert_global_coverage`, `assert_data_bounds`) — the compressed form is eligible from the start (unlike I3/assert_engine_health, which reverted to the full nine-commit form after its own archetype ruling).

## 1. PH-0 — Boundary freeze (commit 1 → G0)

**Governing/Target spec** (G0): `docs/specs/01-pipeline/43_chain_sources.md` (owner, §3 item 11 + `### Target Files`) → `docs/specs/01-pipeline/49_data_completeness_profiling.md` §2 (boundary — Cross-Spec Dependencies, "only reads its output, does not govern it") → Specs 122/122a/123/124 (conversion mechanics). Grounding line satisfied: the file appears verbatim in Spec 43's `### Target Files` and in its own row of `docs/specs/00-architecture/00_system_map.md` (system map line 43).

**Boundary/seed** (PH-0): the pre-conversion boundary is `scripts/quality/assert-parcel-sanity.js` (89 lines) + `scripts/analysis/parcel-sanity-audit.js` (266 lines, the real compute) + `scripts/lib/step/plausibility.js`/`verdict.js` (shared library, already extracted from a prior WF2 — Rule 10 clean, no local `verdictCascade`). No other file reads or writes `assert_parcel_sanity`'s own data (it is a read-only Observer, `records_total: null` post-conversion — see §R below).

## 2. PH-3 — Intent Ledger (commit 1 → G1/G3)

Per Spec 123 §7.1 role split: a human adjudicates; the agent discovers and cites evidence only. Closed vocabulary: `preserved-in-runner` / `preserved-in-validator` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired`.

| # | Fence | Introducing/blame commit | Disposition |
|---|---|---|---|
| F1 | `parcel-sanity-audit.js` is BOTH the step's compute and the Reality-Check CLI (`runAudit`, `samples:true`, `makeCliPool`) | `e2baf7b8` (D-E six-item set) + P4-F0 fold C6 | **preserved-in-compute** — why: one bounds corpus (`scripts/lib/assert-parcel-sanity-fields.js`), the CLI re-imports (`buildChecks`/`resolveCliConfig`, commit 2b `03f6fa65`); grounded in the descriptor's `checks[]` (42 entries, same ids the CLI's `buildChecks` renders) and locked by the CLI output-identity proof (§CLI below). |
| F2 | `MAX_BUILD_MIN_DIMENSION_M = 3.0` pinned as a literal ("no config path") | the WF3 Phase 1 D-C commit | **knowingly-retired** — the audit is now descriptor-driven (`resolveCliConfig` → `resolveConfig`); reuses the registered `max_build_min_dimension_m` var instead (Ask A6(a)); `logic-var-parity.logic.test.ts` assertion 4 re-pointed. |
| F3 | `verdictCascade` must not be redefined in this step | Rule 10's WF2 C1 | **preserved-in-runner** — the converted step defines no verdict at all; `checkRow`/`deriveVerdict` own it. |
| F4 | DISTRIBUTION rows are INFO-only, never verdict-driving | the original audit docblock | **encoded-as-descriptor-field** — all 8 `plausibility[]` rows declare `severity: "INFO"`, locked by `violations.test.ts` §1. |
| F5 | `pop === 0 → INFO ('inert')`, D-E 4 | the D-E Phase 1 commit | **preserved-in-compute/validator** — why: moved into `scripts/lib/step/verdict.js` `checkRow`'s opt-in `observation.inert === true` branch (commit 2b `03f6fa65`), generic and backward-compatible; grounded in `checks[]` (every gate check's `why` text names F5) + `violations.test.ts` §4. |
| F6 | `accept:[ids]` exception lists (66 ids total) | P12-A2 | **encoded-as-descriptor-field** (descriptor DATA, Ask A2(a)) — inlined in the compute's SQL as `id <> ALL(ARRAY[...])`, re-verified post-cost-re-run (§F-RC1 below). |
| F7 | `samples: false` for the pipeline call | the WF2 commit that added `runSanity` | **preserved-in-compute** — why: `scripts/lib/compute/assert-parcel-sanity.js` never defaults `samples` on; grounded in `checks[]`'s own `expect.loader: "parcel_sanity"` (the one folded scan every check's row reads from). |
| F8 | The 12 `gate:true` assignments, each earned by a measured zero baseline | per-check, `git blame` at PH-0 | **preserved-in-compute** — why: pinned by name in `violations.test.ts` §1 (`the 12 gate ids carry severity FAIL`); grounded in `checks[]`'s own `severity: "FAIL"` field, one per gate id. |

Commit SHAs cited in this ledger and this session's own record: `86b55a0e` (commit 1), `4fc587b1` (commit 2a), `03f6fa65` (commit 2b), `db8fb751` (commit 2c, APS-D5), `309dbc32` (commit 2d, APS-D6).

## 3. PH-4 — Risk class (commit 1)

**Risk class: LOW.** Chance of a downstream regression from this conversion: LOW (read-only Observer, `records_total: null`, no writes; both PRE/POST goldens diff to 0 unexplained). Impact if wrong: MEDIUM (a mis-gated FAIL would redden the `sources` chain on every run) — mitigated by the verdict-parity regression lock (`violations.test.ts` §4, both directions) and the live gate-set pin (12 names).

## 4. PH-5 — Seam map (commit 1 → G5)

- **DB seam**: `ctx.pool` (injected by `scripts/lib/step/index.js`'s `runWithPool`) — the compute never constructs its own `pg.Pool`.
- **Clock seam**: not consumed (no timestamps written; `ctx.clock` available but unused).
- **Network seam**: not consumed (no `fetch`/external HTTP).
- **Argv/env seam**: `execution.invocation.sources.env.PIPELINE_CHAIN` — the only env this step reads, via the generic runner, never a bare `process.env` read in compute.

## 5. PH-6 — Classification (commit 1 → G6)

Every finding this session classified as a Defect Ledger row (`docs/reports/defect-ledger.md`, prefix `APS-D*`, mechanically derived from the slug `assert_parcel_sanity` → `A`+`P`+`S`): APS-D1 (declared-reads gap), APS-D2 (capture-tool SQL incompatibility), APS-D3 (corrected F-RC4 prediction, not a defect), APS-D4 (fieldExprById wiring bug), APS-D5 (compute dispatch-table shape), APS-D6 (plausibility fallback for a third caller), APS-D7 (retracted ungrounded F-RC1 claim, corrected with a live-DB cross-read + a new regression lock) — 7 rows, all `CLOSED`.

## PH-1 — Legacy assessment (measured, this session, local Supabase 127.0.0.1:54322, migrations 244)

- **Reads**: `parcels` only; pre-conversion `emitMeta` declared 24 columns, the SQL actually touches 33 — closed as **APS-D1** (Nothing Hidden addition, no removal).
- **Checks**: `runSanity(pool)` — one folded `SELECT count(*) FILTER (...)` scan, **42 checks** (21 HIGH / 15 MED / 6 INFO pre-conversion severities; **12 carry `gate:true`**), plus **8 parallel per-zone DISTRIBUTION queries**. Measured wall time this session: 27–33s standalone (below the stale ledger's last-recorded value and below the plan's own 67.2s baseline — likely warmer cache / lighter concurrent load this session).
- **Verdict cascade**: already row-derived (Rule 10 clean) — `deriveVerdict` imported from `scripts/lib/step/verdict.js`; `statusFor` lives in `scripts/lib/step/plausibility.js`.
- **Live gated invariant, measured at session start**: `ravine_constrained_carries_priced_cost` read **12,968/12,968 → FAIL** (stale `compute_parcel_cost_estimates`, last run 2026-07-08, vs `enrich_parcels` 2026-09-17).

## Operator Rulings + Plan-panel folds 2026-09-18 (recorded verbatim, Status: Implementation)

Rulings: A1 y (42 checks as `checks[]` + one folded-scan compute loader) · A2 (a) 66 accept-list ids inlined in the declared check SQL with `retighten_when`-equivalent `why` text (Ask A2(a) accepted; the descriptor's per-check `why` carries the ported rationale, `retighten_when` field itself is schema-legal but not populated per-check this commit — filed as a nice-to-have, not required by the schema) · A3 (a) distribution rows `every_run` · A4 (b) re-run `compute_parcel_cost_estimates` locally BEFORE the PRE capture — **DONE, this session** (225.5s, 71,821 parcels updated) · A5 y `parcel_sanity_*`, existing groups, `on_invalid:"fail"` · A6 (a) reuse `max_build_min_dimension_m` and `mislink_footprint_lot_tol` · A8 y/y Reality-Check at both altitudes + Observability at output (recorded as owed to the OUTPUT panel, not self-adjudicated here) · A9 ask the operator at dispatch for any resize (no cloud dispatch performed this session).

F-I7: **MOOT, verified.** Phase 0 rows 0.5/0.1 are ancestors of HEAD (`8a3f20d6`, 2026-09-15 POST-B1-1). `.cursor/batch2_c5_active_task.md` was not re-opened this session (out of scope for a single-row execution); flagged for the operator to correct if still showing open.

F-G1/F-G2 (THIRD consumer): **RESOLVED.** `scripts/analysis/parcel-sanity-audit.js` now exports `buildChecks(config)` (materializes `CHECK_DEFS`' `applies`/`bad` FUNCTIONS into legacy-shaped `{applies,bad}` STRINGS) and `resolveCliConfig(pool)` (calls `scripts/lib/step/config.js` `resolveConfig(pool, descriptor)` against the live registry). `scripts/analysis/parcel-field-dump.js` obtains `CHECKS` the same way. ONE bounds corpus (`scripts/lib/assert-parcel-sanity-fields.js`), three consumers (CLI, field-dump, pipeline compute). `src/tests/logic-var-parity.logic.test.ts` assertion 4 re-pointed at `buildChecks()`'s resolved output (proves the value is READ, not pinned, by re-resolving at two different config values and diffing the rendered SQL).

F-RC1 (66 accept-list ids re-verified against POST-run values): **CORRECTED — the original claim below was ungrounded; retracted as APS-D7.** The step's own (WITH-filter) output — `lowrise_cost_fb_gt_15m` 0/263,037, `cost_addition_gt_50m` 0/398,317 — was misreported as "0 with or without the accept-list filter". The "without filter" half was never actually queried until a Reality-Check cross-read caught it. **Re-queried directly this session:**
- `(LOWRISE) AND cost_fb_total IS NOT NULL AND cost_fb_total > 15000000` (raw predicate, NO exclusion) → **exactly 24 rows**, ids `7402,76620,240610,308831,393793,393848,393866,393872,393885,415256,417357,430889,430890,452644,452653,452655,452677,452682,452703,452936,452944,452950,474449,476327` — **byte-identical to `COST_FB_GT15M_LEGIT`**, range **$15,146,558.28–$17,559,952.91** (id 452936 = $15,353,566.62).
- `cost_addition_total IS NOT NULL AND cost_addition_total > 50000000` (raw, no exclusion) → **exactly 42 rows**, byte-identical to `COST_ADDITION_GT50M_LEGIT`, range **$51,683,977.14–$117,729,837.89**.
- **All 66 ids still trip their raw threshold post-re-run.** The lists are **100% load-bearing right now** — they are not inert, and the WITH-filter 0/0 reading is precisely BECAUSE the filter is excluding exactly these 66 rows, not because the population is naturally clean. **No STOP condition under the operator's rule** (no id fell OFF its list — all 66 still exceed the threshold; no NEW id crossed either list's threshold — the no-filter count exactly equals each list's own length) — but the original "continues to do nothing" characterization was false and is withdrawn. **Not editing the lists** (operator rules on membership). A pre-re-run snapshot of these specific 66 parcels' cost values was never captured (no ledger row, no `updated_at` column on `parcels` — see the ledger-gap finding below), so the pre-re-run comparison the operator asked for is **unrecoverable**; only the POST-re-run state is measured. Regression-locked both directions: `src/tests/db/assert-parcel-sanity.db.test.ts` "P12-A2 accept-list is a real, selective filter" (RED with `accept:[]` → viol=2; GREEN with the real list → viol=1, on a clean container, not the live DB's specific ids).

**Order of operations, corrected (no ledger row exists for the cost re-run — see the ledger-gap finding below — so exact clock times are not recoverable; order is reconstructed from artifact evidence):** (1) `PIPELINE_CHAIN=sources node -r dotenv/config scripts/compute-parcel-cost-estimates.js` run manually, this session, BEFORE any descriptor/fields work — real execution, `PIPELINE_SUMMARY` observed directly: `records_updated: 71821`, `records_skipped: 365458`, `engine_error_count: 0`, `duration: "225.4s"`, exit 0. **Zero `pipeline_runs` rows exist for this pipeline** (`SELECT * FROM pipeline_runs WHERE pipeline='compute_parcel_cost_estimates'` → 0 rows, none after id 1486/2026-07-08) — traced to a real gap: `scripts/lib/pipeline.js`'s legacy `run(name, fn)` (line 575) never opens a ledger row itself; only `run-chain.js` parses a script's `PIPELINE_SUMMARY:` stdout into one, and this was a manual (non-chain) invocation. Filed in `review_followups.md` (HIGH). (2) Descriptor/fields/generator/seeds built (no DB mutation). (3) The 66-id re-verification (F-RC1, corrected above) was NOT done between (1) and (4) as it should have been per the operator's original instruction — it was only performed just now, on request. (4) Golden PRE capture — `git_head: 6aeed5b2` embedded in the capture (the commit before this session's own commit ①), confirming it ran on the POST-cost-re-run data before any conversion code existed, satisfying Ask A4(b)'s ordering intent (cost re-run before PRE capture) even though the id re-verification step was skipped at the time. (5) Conversion (commits 2a-2d). (6) Golden POST capture.

F-RC2 (distribution sample-cap): the `array_agg(...)[1:6]` cap is a **display cap**, not a plausibility bound — ruled out of scope per the sibling precedent (`assert_data_bounds`'s own sample caps are likewise undeclared display truncation, not logic variables). Not externalized this commit.

F-RC3: **taken** (O3, output-panel fold, 2026-09-18) — `parcel_sanity_dim_lot_tolerance_m` max tightened **10 → 0.5** (default 0.01 unchanged) in `scripts/seeds/logic_variables.json` and `scripts/lib/assert-parcel-sanity-fields.js`'s `LOGIC_VAR_DEFS`: a mislink tolerance measured in TENS OF METRES on a gated tripwire (`max_build_dim_exceeds_lot_dim`) could mask a genuinely mislinked massing row, defeating the gate it exists to enforce — an operator could otherwise raise this specific bound past any real building's dimensions and silence the gate. The DB's `logic_variables` table carries no `min`/`max` columns (`variable_key, variable_value, description, updated_at, variable_value_json` only), so there is no live-row bound to update. `npm run logic-var-groups` + `npm run logic-vars-docs` regenerated. The descriptor DOES embed the bound (`config.logic_variables[].min`/`.max`), so it was regenerated via `node scripts/generate-assert-parcel-sanity-descriptor.js` — this moves the descriptor's own fingerprint (`max: 10` → `max: 0.5` on this one entry) but the bound is enforced only at config-validation time (out-of-range write rejected), never read by any check's SQL predicate, so no runtime behavior or captured value changes — POST golden re-captured to confirm zero data-affecting diff (see below).

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
- **Class A (structural, non-empty, explained):** (i) `threshold` renders the literal `"viol == 0"` for every one of the 42 checks (not `limit_from_config`-substituted — see the deviation above; this CORRECTS the plan's own draft prediction that threshold would show "the resolved variable value"); (ii) `metric` loses its `" (<fam>)"` suffix (family moves to `expect.family`); (iii) each row gains `source: "check"|"plausibility"|"context"`; (iv) `config` appears under `records_meta`, stamping 37 resolved variables; (v) `checks_failed`/`checks_warned`/`errors`/`warnings` appear; (vi) `distribution:<id>` rows re-render as `dist_<id>` under the plausibility row builder; (vii) the `residential_parcels_scanned` context row moves from array position 0 to the END of `rows` (`buildAuditTable` appends `extraRows` last) — position-only, value unchanged.
- **Class B (data drift, not caused by this change):** predicted EMPTY, conditional on no further `enrich_parcels`/`compute_parcel_cost_estimates` run between PRE and POST captures. **Condition verified**: every check's `viol`/`pop` count is byte-identical between PRE and POST (e.g. `max_build_width_gt_30m` reads `953 / 382569` in both) — the only value-level diffs are structural renders, never a changed count. Class B is EMPTY as predicted.
- **Class C (re-run noise):** `duration_ms`, `sys_*` rows scrubbed by the tool's own nondeterminism handling before compare; **3 differences under `stdout_lines`** (sources: the converted step's structured JSON logging + one added DB-target startup line, replacing the legacy step's single completion line — a fleet-wide conversion consequence, identical for every prior converted step) and `pipeline_runs[0]` (standalone only — the legacy standalone run opened NO ledger row at all; the converted step always owns one, `ledger_row:"owned"` — a structural IMPROVEMENT, not a regression: every run is now recorded, `terminal: "all_checks_passed"` on the healthy path, `pool_errors: 0` in both PRE and POST).
- **Class D (capture order):** predicted EMPTY, confirmed — neither `CHECK_DEFS` order nor `DIST_DEFS` order changed row ordering relative to declaration order.

**Measured, actual diff count: 260 (sources), 261 (standalone) — 0 unexplained.** Two Class-A diffs were NOT predicted in advance and are recorded here, corrected, rather than silently folded into the predicted list:
- **(viii) `audit_table.phase` changes `107` → `25`.** Legacy hardcoded `phase: ADVISORY_LOCK_ID` (the lock id, 107); the converted step's `resolvePhase()` reads `sharing.varies_by_chain.phase.sources` (25, the manifest chain POSITION) — matching every sibling ASSERT descriptor's own convention (`assert_data_bounds`: 22/11/27/5, none of which are lock ids either). Correct, not a defect.
- **(ix) WF3 S0.3 (2026-09-22) recapture — 8 differences measured** across `rows` (3, in `summary.records_meta.audit_table`) and `invariants` (1, in the golden `invariants.json` file — each of the 2 recaptured files, `sources.json`/`standalone.json`, contributing one `invariants[8]` diff and 3 `rows[51..53]` diffs = 8 total), all structural additions from this commit's own 3 new checks + 1 new invariant, none a Class B data-drift regression: the 3 new `rows` entries (`existing_structure_shared_with_other_parcel`, `existing_structure_borrowed_primary`, `ravine_constrained_carries_priced_reno`) land at the array's new tail per the SAME "declaration-order, `extraRows` last" convention item (vii) above already documents — byte-for-byte the identical mechanism, not a new one. The 1 new `invariants` entry (`existing_structure_onlot_share_low`) is appended after the 8 pre-existing `dist_*` distribution rows in the same file. All 4 are genuinely new declared checks this commit adds, not drift in an existing one.
- **(ix) `records_total`/`records_new`/`records_updated` go `1`/`0`/`0` → `null`/`null`/`null`.** The generic runner's ASSERT/Observer convention (`counters: "none"`) — matches `assert_data_bounds`/`assert_global_coverage`'s own precedent, not predicted in the plan's draft list but consistent with "records_total: 1 for an Observer — already the estate's ASSERT shape" (§1) being wrong about the literal value (it is `null`, not `1`, once counters:"none" applies generically — the plan's own text under-specified this).
- **(x) `meta[0].reads.parcels` list** changes from the 24 pre-conversion columns to the 33 measured ones (APS-D1, already explained at commit 1).

`meta[0].reads.parcels` sort order also changed (alphabetical vs declaration order) — cosmetic, same mechanism as (x).

- **(xi) Slice-0 output-panel peel (2026-09-22, finding O1) recapture — `parcel_sanity_onlot_share_rd_min` / `parcel_sanity_onlot_share_attached_min` disappear from `summary.records_meta.config` and the `stdout`-embedded config object (both `sources.json` and `standalone.json`, each contributing 2 removed keys).** The two variables were RETIRED at this peel: `INVARIANT_ONLOT_SHARE_SQL` never actually read them (`executeEntry` runs a `source:"invariant"` entry's `sql` verbatim, no runtime config-substitution seam exists for it), so they were declared-but-dead — a genuine Rule 3 violation the panel caught. Removed from `LOGIC_VAR_DEFS`/seed/GROUP_ORDER/probe-list; 0.90/0.50 now live as documented, non-tunable literals directly in the invariant's SQL. A structural REMOVAL from the config object, not data drift — `existing_structure_onlot_share_low`'s own measured value (59,661) is UNCHANGED by this peel (same SQL, same literals, only the fictional config-tunability is retired).

## Files landed this commit (①)

`scripts/lib/assert-parcel-sanity-fields.js` (new, 42 CHECK_DEFS / 35 LOGIC_VAR_DEFS / 8 DIST_DEFS) · `scripts/generate-assert-parcel-sanity-descriptor.js` (new, pure `buildDescriptor` + `--check` drift lock) · `scripts/one-time/measure-assert-parcel-sanity-distribution.js` (new, real `last_measured` grounder, 5 samples/field, single session — see Limitations) · `scripts/quality/assert-parcel-sanity.descriptor.json` (new) · `scripts/quality/assert-parcel-sanity.dist-measured.json` (new, generator input) · `scripts/seeds/logic_variables.json` (+35 rows) · `docs/reports/defect-ledger.md` (APS-D1/D2/D3) · `docs/reports/review_followups.md` (2 rows) · `scripts/steps/_schema/converted.json` (pending[] entry, `stage: "descriptor_only"`) · `scripts/steps/_schema/step-archetype-census.json` (`batch: "C5"` → `"pending"`) · `scripts/steps/_schema/programme-items.json` (`PSA-CHECK-IDS` → BUILT) · `src/tests/steps/assert_parcel_sanity/violations.test.ts` (new, red suite — 3 `it.fails()`, 20 plain `it()` for facts already true at commit 1).

**Not in commit ①** (deferred to 2a/2b, present in the working tree but not staged here): `scripts/lib/compute/assert-parcel-sanity.js`, the rewritten `scripts/quality/assert-parcel-sanity.js` frozen shell, `scripts/analysis/parcel-sanity-audit.js` (CLI re-point), `scripts/analysis/parcel-field-dump.js`, `scripts/lib/step/{plausibility,verdict,index}.js`, `src/tests/assert-parcel-sanity.infra.test.ts`, `src/tests/logic-var-parity.logic.test.ts`.

## Corrected finding vs the plan's premise — the assert_schema probe-list bump does NOT happen at commit ①

The plan's §2 text ("the list goes 148 → 183") assumed the probe-list generator scans descriptors eagerly. Measured this session: `scripts/lib/declared-logic-variables.js` `collectDeclaredLogicVariableNames()` reads **`converted.json`'s `converted[]` array only** — a `pending[]` entry (this step, today) is invisible to it. Running `node scripts/generate-assert-schema-probe-lists.js` at commit ① is a genuine no-op (confirmed: 148 → 148). This matches the fleet's own precedent (I3/I5/pilot 8's probe-list bumps all land at or after cutover, in `6aeed5b2`/`9abbdcc3`/similar — never at the assessment/red-suite commit). **The probe-list regen (148 → 183) and the assert_schema golden recapture are therefore prepared as part of commit ③'s materials, not commit ①**, and the cloud seed command (runbook §1a) must still run BEFORE any cloud dispatch of this step regardless of which commit registers the probe list.

## Second corrected finding — registering the pending compressed-form declaration at commit ① breaks the FLEET-WIDE scorecard staleness lock

`src/tests/step-conformance.infra.test.ts`'s "R-R / Rule 13" check compares every CONVERTED step's committed scorecard against a fresh `step:validate --fast` run. Fast invariants #23 (COMPRESSED-FORM-ELIGIBLE) and #24 (COMPRESSED-FORM-DEFAULT) are `(registry)`-scoped rows whose rendered text is embedded IDENTICALLY on every converted step's scorecard — and that text reads the whole `pending[]` array, not just `converted[]`. Registering this step's `pending[]` entry at commit 1 moved that shared line from `"not applicable (0 pending slugs...)"` to `"1 compressed-form declaration(s)..."` on all 14 already-converted steps' committed scorecards, none of which had been regenerated to match. Measured: `npx vitest run src/tests/step-conformance.infra.test.ts` (full fleet) went from clean at `HEAD~2` to **18 failing cases across 14 files** immediately after commit 1 landed. Same fault class as I4's own `a062eb79` ("repair the fleet-wide reds commit 1 landed"). **Repaired this session** via `node -r dotenv/config scripts/analysis/step-validate.mjs --all --write`, regenerating all 15 scorecards (14 converted + this pending one) — left as part of the ③ prepared-but-uncommitted materials (not folded into commit 2b, since the touched files belong to other steps' reports, not this step's own commit scope).

## CLI output-identity proof (F-G1)

Captured `node -r dotenv/config scripts/analysis/parcel-sanity-audit.js` from the pre-conversion source (`git show HEAD~2:scripts/analysis/parcel-sanity-audit.js`, temporarily swapped into place) and from the converted CLI (`buildChecks`/`resolveCliConfig`), same DB state, back-to-back. **Every count, percentage, status marker and outlier value is byte-identical.** The only diff is in the free-text `why`/description strings: (a) the fields sidecar appended a short "Bound: `<var>`"/"Reuses `<var>`" note to several checks' `why` text (informational, not present in the legacy inline comment), and (b) a handful of legacy Unicode characters (`≤ ≥ ⟺ – ²`) were normalised to ASCII (`<= >= == - 2`) when the strings were re-typed into the fields module. Not byte-for-byte identical, but **data-identical** — no count, threshold, or gate marker differs.

## §R. Reflection

Written this commit — `converted.json.pending[0].stage` reached `shape_clean` at commit 2b/2c/2d; cutover (commit 3) is prepared but uncommitted, per the operator's explicit instruction.

**LOW-CONFIDENCE findings** (measured this session, not fully closed):

| # | Finding | Why LOW-CONFIDENCE |
|---|---|---|
| 1 | Fleet-wide count-pins beyond this step's own file set (step-seam, write-class-disposition, assert_engine_health's own ASSERT-count assertion) were fixed by measurement, not by re-deriving every one of the ~23 originally-failing cases from a full fresh run each time — some pins may still disagree with a truly clean `--all --write` pass until commit 3 lands. |

**RECURRING/STANDARD-SHAPING** patterns this conversion reconfirms:

| # | Pattern | Where else it recurs |
|---|---|---|
| 1 | A shared-library change (verdict.js `observation.inert`, plausibility.js `kind:"distribution"`) is scoped opt-in and regression-locked against the WHOLE fleet, not just the one step that needed it | Every prior converted step's own library growth wave (I1-I5, pilot 9) |
| 2 | Registering a `pending[]`/`converted[]` entry has REGISTRY-WIDE side effects (probe list, fast invariants #23/24, scorecard staleness) that must be re-verified fleet-wide, not just for the one step | I4's `a062eb79` repair; this session's own APS-D5/D6 |

RED evidence: the whole `src/tests/steps/assert_parcel_sanity/violations.test.ts` red suite (3 `it.fails()` at commit 1, proven RED against the actual legacy code via a `git stash` swap, not simulated) — see §Files above.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_parcel_sanity --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=8 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=bottom-left window=39313d9 |
| G3 | 1 | 2 | table rows=9 vocab-hit rows=8 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 8 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=32 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=32 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | assert_parcel_sanity | PASS | min_migration=244 <= migrations count=244 |
| 2 | assert_parcel_sanity | PASS | 37 declared, missing from seeds: none |
| 3 | assert_parcel_sanity | PASS | retired=0 overlap-with-declared=none |
| 7 | assert_parcel_sanity | PASS | SPEC LINK header present=true |
| 8 | assert_parcel_sanity | PASS | G-4: 37 declared, 0 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | assert_parcel_sanity | PASS | HB-1: execution.shape=null — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | assert_parcel_sanity | PASS | CEIL-1: execution.shape=null — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 66 PRE capture(s) across 18 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 18 converted slug(s) — 10 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 41 declared counter source(s) across 14 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 573 · unexplained: 0

### Test suite (item iii)
- 1375/1378 passed (suite success=false)
- harvested: 23 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (3):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-massing.js (slug "link_massing") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-parcel-sanity.js (slug "assert_parcel_sanity") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-parcel-cost-estimates.js (slug "compute_parcel_cost_estimates") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 37 declared, 0 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 4 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted=null — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=77312B notes=0B checks=45 rows records_meta=9880B (newest post/ capture) |

**Enforced-green: 13/14**

