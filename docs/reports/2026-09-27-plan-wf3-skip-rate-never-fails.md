# Active Task: WF3 — `pct` checks that report a 0/1 flag can never FAIL (address_points + parcels `skip_rate_pct`; same class in both `null_address_*_pct`)
**Status:** Authorized 2026-09-27 (operator "y", all 11 recommendations accepted incl. ci_green_for_sha)
**Workflow:** WF3 (fix). One finding class, two computes, one commit.
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek drafted this plan: run `20260928T005619Z-8abc6a67` (ledger `%LOCALAPPDATA%\buildo-exec-runs\`). The orchestrator re-grounded and rewrote it. At implementation the provider is **claude**, because a converted step's compute changes and the fix needs a G8 golden recapture (Spec 08 §A).

## Context
* **Goal:** a declared FAIL check must be able to FAIL. Two converted INGESTORs declare `skip_rate_pct` with `limit: "pct <= N"` but report `violations: 0|1`. `verdict.js` then compares the flag (0 or 1) to N (5 or 10), so the check is PASS on every possible input. The audit row makes it worse: it renders the real ratio (`detail`) beside the threshold, so it looks like a working check. `load-parcels.notes.json:69` even names `skip_rate_pct` as one of "the two places" a dropped batch surfaces. Today that is not true.
* **Target Spec:**
  * Spec 122 §1.6 (declared checks; `on_check_error`) and §5.5 ("the pct checks report a ratio").
  * Spec 124 Rule 10 (verdict is row-derived) and Rule 3 (the bound is a registered variable).
  * Owner specs: `docs/specs/01-pipeline/54_source_address_points.md` and `55_source_parcels.md` (checks tables).
  * Spec 121 §12b.6 ("green because it never looked") and Spec 123 §3.1 (post-conversion fix = its own RED→GREEN commit).
* **Key Files:**
  * `scripts/lib/compute/load-address-points.js` (`function skip_rate_pct(` :230, `function null_address_number_pct(` :210)
  * `scripts/lib/compute/load-parcels.js` (`function skip_rate_pct(` :522, `function null_address_pct(` :501)
  * `scripts/seeds/logic_variables.json` (description text only)
  * the tests listed in §5
* **Database Impact:** NO. No schema change and no table write changes. Only the audit-row verdict changes, and only when a bound is breached.

## 1. Grounding: every claim executed
| # | Claim | Evidence |
|---|---|---|
| G1 | For `pct <= N`, `evaluateLimit` uses `measured = violations` when it is finite, and only otherwise `value`. So a flag is compared to N. | [READ `scripts/lib/step/verdict.js:156-170`]. The function's own docstring (:143-148) says a pct check must report the ratio as `value` and leave `violations` undefined. |
| G2 | The row renders `detail` first, so the value shown is not the value compared. | [READ `verdict.js` `checkRow`, `const observed = observation.detail !== undefined`] |
| G3 | address_points reports `violations: skipped / rowsRead > limit ? 1 : 0` with `limit = config.address_points_skip_rate_max_pct`. That compares a 0–1 ratio to 5, so it is never true. Then `0 <= 5` passes. **Two bugs:** a scale mismatch plus the flag. | [READ `compute/load-address-points.js:230-243`]; seed default 5 [READ `logic_variables.json:5070-5071`]; live value 5 [MEASURED `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key LIKE '%skip_rate%'` → `address_points_skip_rate_max_pct=5, parcels_skip_rate_max_pct=10`] |
| G4 | parcels reports `violations: skipped / rowsRead > limit / 100 ? 1 : 0`. The scale is right, but the flag (at most 1) is compared to 10, so it always passes. | [READ `compute/load-parcels.js:522-537`] |
| G5 | Live rows look healthy: `parcels` run 2013 `{value:0.598, threshold:"pct <= 10", PASS}`; `address_points` runs 1990–1992 `{value:0, "pct <= 5", PASS}`. | [MEASURED `SELECT id, pipeline, (SELECT x FROM jsonb_array_elements(records_meta->'audit_table'->'rows') x WHERE x->>'metric' ILIKE '%skip_rate%' LIMIT 1) FROM pipeline_runs WHERE pipeline IN ('address_points','parcels') AND status<>'running' ORDER BY id DESC LIMIT 4`] |
| G6 | Same pattern with limit 0.1: `null_address_number_pct` (address_points, limit `pct <= 0.1`, var default 0.1) and `null_address_pct` (parcels, `pct <= 0.1`). A flag of 1 is > 0.1, so they fire **by coincidence** and the result is correct today. The correctness depends on the variable staying < 1: an operator who sets it to 5 (meaning 5%) disables the check silently. | [READ `compute/load-address-points.js:210-222`, `compute/load-parcels.js:501-513`; seeds :4760-4761, :5080-5081] |
| G7 | Seed text contradicts the descriptor: `address_points_skip_rate_max_pct` says "WARN ceiling… Never FAIL", but the descriptor declares `severity: "FAIL"` (corrected at commit 9 against legacy `skipRate >= 5 ? 'FAIL'`). | [READ `logic_variables.json:5073`; `load-address-points.descriptor.json:358-372`] |

**Proof by fixture (the red test, §4):** feed each compute `acquired = {rows_read: 1000, records_skipped: 500}` (a 50% skip rate) through `verdict.checkRow(check, observation, 'fail_step', config)` with the real descriptor check and seed config. Today this returns `status: "PASS"` for both steps.

## 2. Fleet check: every `pct` check whose compute reports a flag
Method (reproducible; a scratchpad scanner, no repo write). For every `converted.json` descriptor, take each check whose `limit` or `warn_limit` starts with `pct `, find `ctx.report('<id>', {…})` in `scripts/lib/compute/<slug>.js`, and classify the observation as `violations:` or `value:`. Checks reported through a loop were traced through their evaluator table:
* assert_data_bounds `pctmax_cfg` → `evalPctMax` reports `value` [READ `compute/assert-data-bounds.js:543-552`; fields `assert-data-bounds-fields.js:181-197`].
* assert_global_coverage: all 120 pct checks are builder `coverage|calibrated|external|vocab` → `evalCoverageLike`/`evalVocab` report `value` [READ `compute/assert-global-coverage.js` `EVALUATORS`; MEASURED builder tally 96/17/2/5].

| Step | Check | Limit | Reports | Can FAIL? |
|---|---|---|---|---|
| address_points | `skip_rate_pct` | `pct <= 5` (FAIL) | **violations** | **never** (G3) |
| parcels | `skip_rate_pct` | `pct <= 10` (FAIL) | **violations** | **never** (G4) |
| address_points | `null_address_number_pct` | `pct <= 0.1` (WARN) | **violations** | only while the variable < 1 (G6) |
| parcels | `null_address_pct` | `pct <= 0.1` (WARN) | **violations** | only while the variable < 1 (G6) |

**Every other pct check reports `value`:** load_ravines ×5, link_massing ×3, link_wsib ×2, link_parcel_addresses ×3, compute_centroids ×1, link_parcels ×2, enrich_parcels ×3, assert_data_bounds ×4, link_neighbourhoods ×2, geocode_permits ×1, enrich_ravines ×1, enrich_heritage ×1, load_centreline ×2, assert_global_coverage ×120. The object-form `{warn,fail}` limits (compute_parcel_cost_estimates `cost_rates_stale`, `cost_index_stale`) are not `pct` and are out of scope.

**In flight, not converted:** massing ① (`../buildo-massing` @ `de106fa0`) booleanizes `skip_rate_pct`/`batch_error_rate_pct` but declares `limit: "viol == 0"`. A flag checked with `viol == 0` is evaluated correctly, so it is not this bug. The massing ② seat should still prefer `value` + `pct` so the threshold column shows the bound in force (see Q1).

## 3. Fix (simplest correct; no library change)
In each of the four compute functions, replace `violations: <flag>` with `value: <measured ratio on the variable's own scale>` and keep `detail` unchanged. Per variable:
* `skip_rate_pct` (both steps): `value = (skipped / rowsRead) * 100`, because the variables are 0–100 (5 and 10). This removes address_points' scale bug and parcels' `/100`.
* `null_address_number_pct` / `null_address_pct`: `value = nullRows / attempted`, because the variables are 0–1 (0.1).
* The short-circuit paths (no rows read) report `{ value: 0, detail: null }` in place of `{ violations: 0 }`. That is the `evalPctMax` precedent: "not applicable" reads as a PASS-safe measured 0, never omitted.

**Why this is byte-safe for the goldens:** `checkRow` renders `detail` before anything else, so every rendered `value` in the audit table is unchanged. Status changes only where a bound is breached, and on recorded data none is (G5; parcels null-address stays WARN at ~100%).

**Declared boundary delta:** the pct grammar is `<=` (no strict form). Legacy used `>=` for FAIL, so at exactly the bound (5.000%, 10.000%, 0.1) the new form PASSes where legacy FAILed. The converted flag already did this for skip_rate. For null_address it is a new change at exact equality, and it has zero measure on real data (~100%). One sentence in each check's `why` states it. We do not add a new grammar.

**Replaces / removes:** removes four hand-rolled comparators (the compute stops re-implementing the verdict; Rule 10). Replaces the `violations`-shaped unit tests that locked the wrong contract (§5). No gate is added.

**Also in this commit (doc truth):**
* the seed description of `address_points_skip_rate_max_pct` "Never FAIL" → "FAIL-severity, blocking:false" (G7);
* one sentence in Spec 54 and Spec 55 check tables: "pct checks report `value` on the variable's scale" (gate J: the spec is staged with the compute).

## 4. Red-first test (both directions, committed red evidence per gate K)
New `src/tests/steps/pct-checks-evaluate.logic.test.ts` (SPEC LINK: Spec 122 §5.5, 124 Rule 10, 54, 55). It drives the REAL descriptor check + REAL compute + REAL `verdict.checkRow`. This is the seam every existing test skipped: they asserted the compute's flag in isolation and never the row.
* `skip_rate_pct` × {address_points, parcels}: 50% skip ⇒ **FAIL** (RED today: PASS); 0.598% ⇒ PASS; exactly-at-bound ⇒ PASS (declared delta).
* `null_address_*`: fraction 1.0 ⇒ WARN; 0.05 ⇒ PASS. **Variable-scale lock:** with the variable set to 0.5, fraction 0.6 ⇒ WARN and 0.4 ⇒ PASS. Today 0.4 also WARNs, because the flag 1 > 0.5.
* **Class lock (no new gate: a test over existing data):** for every `converted.json` descriptor, every check whose limit starts `pct `, run its compute on a minimal `acquired` fixture and assert the reported observation has a finite `value` and no `violations` key. RED today on exactly the 4 checks in §2. This is the canary item for simplification WF item 11(b) ("a pct check reporting a flag"). Where a compute needs DB reads (assert steps), the test asserts on the evaluator table in place of running the compute (`EVALUATORS[builder]` ∈ value-reporting set).
* Red evidence: run the new file at HEAD before the fix and commit the vitest JSON under `docs/reports/red-evidence/wf3-pct-flag/` (gate K form).

## 5. Existing tests re-pointed IN PLACE (never weakened; Guardian states each fence)
* `src/tests/load-address-points.infra.test.ts:~180-205` returns `.violations` → assert `.value` on the ratio scale, with the same four boundary intents.
* `src/tests/steps/address_points/post-conversion-fixes.logic.test.ts` L5a/L5b/(:160) (AP-D8 locks) assert violations → assert `value` (0.2 / 0.01 / 0). The AP-D8 intent (reads the 0o counters) is preserved.
* `src/tests/steps/parcels/violations.test.ts:735-745` (`null_address_pct` over/under/empty) → `value`.
* Severity and `limit_from_config` locks (address_points `violations.test.ts:554-560`, parcels :757) are untouched.

## 6. Target file review (operator ruling 2026-09-28: the step's own registry)
Grep commands:
* `git grep -n -E "skip_rate_pct|null_address_pct|null_address_number_pct" -- src scripts docs/specs`
* `git grep -n "address_points_skip_rate_max_pct\|parcels_skip_rate_max_pct\|address_points_null_address_number_max_pct\|parcels_null_address_pct_max"`

| § | File | READ | Touched | Behaviour impact | Registration / spec same commit |
|---|---|---|---|---|---|
| FILES | `scripts/load-address-points.js` (shell) | full (frozen shell) | N | none | Spec 54 Target ✓ |
| FILES | `scripts/load-address-points.descriptor.json` | checks :336-372 | Y (two `why` sentences) | declared text only | 54 ✓ |
| FILES | `scripts/load-address-points.notes.json` | grep hits | N | none | 54 ✓ |
| FILES | `scripts/lib/compute/load-address-points.js` | :200-245 | Y | skip_rate can now FAIL; null check scale-correct | 54 ✓ |
| FILES | `scripts/load-parcels.js` (shell) | full | N | none | 55 ✓ |
| FILES | `scripts/load-parcels.descriptor.json` | checks :256-290 | Y (why) | text | 55 ✓ |
| FILES | `scripts/load-parcels.notes.json` | :69, :79 | N; :69 becomes TRUE after the fix | none | 55 ✓ |
| FILES | `scripts/lib/compute/load-parcels.js` | :60-70, :495-540 | Y | as above | 55 ✓ |
| DATA | tables `address_points`, `parcels` | writes unchanged (the compute's check functions only) | N | none | — |
| DATA | `pipeline_runs.records_meta.audit_table.rows[metric=skip_rate_pct\|null_address*]` | live rows G5 | status can change on breach | admin readers see a FAIL row that was previously impossible | — |
| DATA | `logic_variables` 4 rows | MEASURED G3 | description text of 1 seed | no value change; `apply-logic-variables.js` re-apply updates the description only | seeds file = Spec 54 Target ✓ |
| CONSUMERS | `consumer-registry.json` rows for address_points/parcels | :11-28 | N | keys `address_points_load`/`parcels_load`, not these metrics | ✓ |
| CONSUMERS | `scripts/lib/address-points-csv-drift.js:85,93`, `parcels-csv-drift.js:65,73` | hit lines | N | legacy-named metrics `*_null_address_*`: a different producer path, unaffected | ✓ |
| CONSUMERS | `scripts/lib/step/index.js:889,913` | hit lines (comments) | N | none | ✓ |
| CONSUMERS | `scripts/generate-logic-variable-groups.mjs:364`, `src/features/admin-controls/generated/logic-variable-groups.json:303` | hit lines | N | GROUPS unchanged | ✓ |
| TESTS | the 5 files in §4/§5 + `violations.test.ts` ×2 | hit lines | Y (re-point) / new file | locks move to `value` | SPEC LINK headers |
| TESTS | `chain.logic`, `control-panel.logic`, `*.csv-drift.logic` | grep hits | N | metric names only | — |

## 7. Goldens (G8) and recapture
* Changed compute ⇒ source fingerprint moves ⇒ recapture **POST** for `address_points` (`post/sources.json`, `post/standalone.json`) and `parcels` (`post/sources.json`, `post/standalone.json`). Expected G8: **0 unexplained diffs** (rendered values = `detail`, statuses unchanged on real data). Any diff is a finding, not a note.
* The four captures today have no `lib_fingerprint` and no nonzero write. Ledger rows `G lib_fingerprint` and `G nonzero:*` exist for both steps [READ `standard-gates-ledger.json`]. A fresh capture with a real write closes them, so **the same commit deletes those 4 rows** (R-BA: an orphan row is RED).
* **Forced-change proof (G#38) + two-run zero-writes (simplification item 7):** local DB only, orchestrator seat. Perturb 1,000 rows per table on a non-key declared column (`UPDATE … WHERE id IN (SELECT id … ORDER BY id LIMIT 1000)`; the method `6457e713`'s Step 5 used). Then POST run 1 must report `records_updated ≈ 1000`, and an immediate run 2 must report 0 changed rows. Record both in the capture.
* Capture command (per the landing plans; flags from each step's committed PRE `args`): `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-parcels.js --chain=sources --out=docs/reports/golden/parcels/post/sources.json --overwrite`, and the same for `--chain=none` and for address_points. Capture last: only after `step-validate --step=<slug>` is five-word PASS (simplification item 2).
* No other step's goldens change: `scripts/lib/step/**` is untouched, so `lib_fingerprint` does not move fleet-wide.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no new catch; the check loop is the boundary, Rule 2).
* **Unhappy Path Tests:** breach ⇒ FAIL/WARN; empty acquired ⇒ PASS-safe `value: 0`; variable on a non-default scale; exact-bound equality.
* **logError Mandate:** N/A.
* **UI Layout:** N/A.
* **Five words:** STANDARDIZED (A: bounds stay `limit_from_config` ✓) · OBSERVABLE (C: emits unchanged) · SCALABLE (B/E: no new literal; the `* 100` is a unit conversion → import from `scripts/lib/units.js` if gate E flags it) · UNDERSTANDABLE (F/J: spec 54/55 staged) · ACCURATE (G: recapture closes 4 ledger rows; K: committed red evidence). Zero new ledger rows.

## Execution Plan
- [ ] 0. `node scripts/ai-env-check.mjs`; re-verify G1–G7 at HEAD (`git grep` anchors, not line numbers).
- [ ] 1. RED: write `pct-checks-evaluate.logic.test.ts`, run it, commit the JSON red evidence (4 RED, the rest green).
- [ ] 2. Fix the 4 compute functions + the 2 descriptor `why` sentences + the seed description + Spec 54/55 sentences; re-point the §5 tests. `npx vitest run src/tests/steps/address_points src/tests/steps/parcels src/tests/steps/pct-checks-evaluate.logic.test.ts src/tests/load-address-points.infra.test.ts`.
- [ ] 3. Orchestrator: perturb → POST recapture ×4 with the two-run proof; `--compare` against the prior POST (0 unexplained); delete the 4 closed ledger rows; `node scripts/analysis/step-validate.mjs --step=address_points --write` and `--step=parcels --write`.
- [ ] 4. Panel (WF3 lean): Regression Guardian (the 4 comparators + the re-pointed locks: why each flag shape existed, e.g. AP-D8), Integration (verdict path end to end), Code Reviewer grounded. Reality-Check: not triggered (no derived field).
- [ ] 5. `npm run test` (pre-push, 1 fork) green. One commit: `fix(54_source_address_points): pct checks report the measured ratio, so skip_rate_pct can FAIL (address_points + parcels)`.

## Operator decisions
* **Q1 (recommend YES, deferred):** make `evaluateLimit`'s `pct` arm read `observation.value` only (as `value_min`/`value_max` already do), so a flag becomes `unevaluable` and renders at the declared severity, never PASS. That enforces the evaluator's own documented contract for every future step. **Cost:** it edits `scripts/lib/step/verdict.js`, which moves `lib_fingerprint` for every converted step (gate G #39 ⇒ fleet recapture, enrich_parcels ~1 h). **Recommendation:** do NOT pay that alone. Ride the simplification WF items 8/9, which already edit `scripts/lib/step/index.js` and force the same fleet recapture. Meanwhile the §4 class lock catches any new offender at commit time.
* **Q2:** keep the null_address pair in this WF3 (same class, same two files, one recapture), or split it into its own WF3 per the one-finding cadence? Recommendation: keep. Splitting doubles the recapture for a zero-behaviour change.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §11 note: the fix changes check shapes, not the verdict library. The library hardening is deliberately deferred to ride an already-scheduled fleet recapture (Q1).
