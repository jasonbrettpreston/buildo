# Active Task: Compute-purity plan A — the 44 pure-ban rows (CP-PLANA)
**Status:** Planning

**Domain Mode:** Backend/Pipeline (`scripts/lib/compute/`, sibling descriptors).
**Workflow:** WF2 (alters existing compute).
**68/69:** N/A (no by-law content).

## Context
* **Goal:** Close programme item CP-PLANA. Today 44 gate-E ledger rows (`closing_brief "CP-PLANA"`) allow 44 live purity findings. Each finding moves to a seam that already exists, so this item adds no new library or schema. 44 rows now, 0 after, then CP-PLANA goes BUILT.
* **Target Spec:** Spec 124 R-BZ (G6, G7, G10, G12, G13; C3 expiry), Rule 2, Rule 3 (one home per tunable), Rule 10 (verdicts are declared rows); R-CE (clock binding); Spec 122a §A26 code table; Spec 122 §5 seams, §8 recapture.
* **Key Files:** `scripts/lib/compute/{load-address-points,load-centreline,load-heritage,load-massing,load-neighbourhoods,load-parcels,load-ravines,load-zoning,assert-schema,assert-data-bounds,assert-global-coverage,refresh-snapshot}.js` and their descriptors; `scripts/steps/_schema/standard-gates-ledger.json`; `scripts/steps/_schema/programme-items.json`.
* **Execution Provider:** claude. Spec 08 §B downgrade, logged: operator directive 2026-10-14. The engine may take groups G1 and G4 as line-range briefs.

### Measured inventory (2026-10-14, tip 2d7b0d84; scratch gate-E run matched 44 of 44 rows to live findings, 0 stale)
| Group | Code (rule) | Rows | Sites (file:line) |
|---|---|---|---|
| A | G7 `compute-decides` | 12 | load-address-points:282 · load-centreline:560, 576 · load-heritage:495, 518 · load-massing:158, 206, 234 · load-neighbourhoods:551 · load-parcels:565 · load-ravines:362, 363 |
| B | G12 `compute-forbidden-require-descriptor` | 5 | load-heritage:31 · load-massing:272 · load-neighbourhoods:33 · load-parcels:629 · load-zoning:32 |
| C | G10 `compute-no-literal-url` | 9 | assert-schema:64, 88, 90, 92, 94, 96, 98, 100, 102 |
| D | G6 `compute-no-sql-clock` | 14 | assert-data-bounds:112, 117, 121, 125, 185, 370, 446 · assert-global-coverage:116, 206, 515, 555 · refresh-snapshot:66, 262, 613 |
| E | G13 `compute-no-swallow` | 4 | assert-data-bounds:435, 454 · load-address-points:85 · load-parcels:299 |

This equals the item's 2026-10-11 evidence (G6 14, G7 12, G10 9, G12 5, G13 4).

## Fix shape per group (each says what it replaces)
* **A. G7: the declared check decides (12).**
  * Replaces: compute-side `x < ctx.config.k ? 1 : 0` / `<=` comparisons, a parallel verdict next to the declared check.
  * With: compute reports the RAW measured value only. The check row declares `limit` (`value_min N`, `value_max N` or `pct <= N`) plus `limit_from_config: k`, and `verdict.js` `resolveLimit` + `evaluateLimit` decides.
  * Founding precedent: `load-parcels.descriptor.json` `rows_read_floor` already declares `limit: "value_min 450000"`, `limit_from_config: "sources_parcels_floor"`, yet the compute still also computes `violations`.
  * Two sites steer control flow, not just a flag: load-centreline:576 `if (skippedPct > …)` and load-heritage:495 `driftBreached`. Read each first. If the comparison gates a write, it becomes a `pre_write` check, and the runner's pre-write gate refuses the write (Rule 10). Otherwise it is a plain row.
* **B. G12: `ctx.descriptor` (5).**
  * Replaces: module-level `require('../../<step>.descriptor.json')`.
  * With: `ctx.descriptor` read inside the compute call.
  * load-massing:272 and load-parcels:629 use the require only for a require-time dispatch-key == declared-check-id assertion. First check whether the runner already enforces CHECKS keys == `checks[].id`. If it does, delete the assertion; if not, move it into the runner, never into a per-run compute throw.
  * load-heritage:31, load-neighbourhoods:33 and load-zoning:32 read `identity.spec_version` and similar into module constants. These become reads of `ctx.descriptor.identity.*`.
* **C. G10: `externals[].url` (9).**
  * Replaces: the CKAN base and 8 resource URLs in assert-schema compute.
  * With: the descriptor's `inputs.reads.externals[].url`, read via `ctx.descriptor`. The URLs move byte-identical.
* **D. G6: `ctx.clock` bound as a parameter (14).**
  * Replaces: `NOW()`, `CURRENT_DATE` and `INTERVAL` arithmetic on the DB clock.
  * With: `$n::timestamptz` bound from `ctx.clock` and, for calendar dates, `to_timestamp($ms / 1000) AT TIME ZONE $zone` with `pipeline_timezone` (R-CE, the founding AEH pattern).
  * The `INTERVAL` widths that are tunables already sit in logic variables; any that do not are a G9/Rule 3 finding to surface, not to invent here.
  * refresh-snapshot:66 is the INSERT that stamps the snapshot; it binds the same clock.
* **E. G13: no swallow (4).**
  * Replaces: `catch` blocks that turn an error into a zero/`skip` value with no row.
  * assert-data-bounds:435, 454 (the cost_estimates and ghost branches) become a declared `on_check_error` on their checks, so an errored query is an errored FAIL row (`errored: true`, never accept-covered: `partitionFailedRows`).
  * load-address-points:85 and load-parcels:299 (geometry parse) keep their per-record tolerance. The swallow becomes a counted parse failure reported through the existing declared parse counter check (AP-D2 already counts it), and the `catch` body calls `ctx.report` / increments the reported counter, so G13 sees a report.

## Capture impact (measured rule, not a guess)
* A capture is stale when its `source_fingerprint` (sha256 over step file + descriptor + notes + `scripts/lib/compute/<step>.js`, `capture-step-golden.js#computeSourceFingerprint`, enforced by `src/tests/golden-fingerprint.infra.test.ts`) or its `lib_fingerprint` (`scripts/lib/step/**`, gate G #39) differs from the tree.
* Every group above edits a fingerprinted compute module or descriptor. Measured 2026-10-14 on the CP-S1 rewrite: a comment-plus-helper edit to `enrich-parcels.js` moved its source_fingerprint `7a2e18a1…` → `0cd7c226…`, with lib_fingerprint unchanged.
* So **no plan-A group is capture-neutral.** Groups B and C are runtime-neutral (they need a fingerprint-only recapture). A, D and E change audit rows or values (full recapture of the step).

| Group | Runtime change | lib_fingerprint | source_fingerprint (steps) | Recapture |
|---|---|---|---|---|
| A | YES (rows' value/threshold; violations field gone) | no | load_address_points, load_centreline, load_heritage, load_massing, load_neighbourhoods, load_parcels, load_ravines | full, rides the next fleet recapture |
| B | no | no | load_heritage, load_massing, load_neighbourhoods, load_parcels, load_zoning | fingerprint-only |
| C | no | no | assert_schema | fingerprint-only |
| D | YES (clock source: run clock instead of DB clock) | no | assert_data_bounds, assert_global_coverage, refresh_snapshot | full |
| E | YES (errored rows / counter rows) | no | assert_data_bounds, load_address_points, load_parcels | full |

## Technical Implementation
* **New/Modified Components:** the 12 compute modules above and their descriptors (checks `limit`/`limit_from_config`/`on_check_error`; `externals[].url`).
* **Data Hooks/Libs:** none new. Uses `ctx.descriptor`, `ctx.clock`, `ctx.report`, `verdict.js` and `checks[].on_check_error` (all present at 2d7b0d84, measured by grep).
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** group E is the boundary change. Errors become declared errored rows, never silent zeros.
* **Unhappy Path Tests:** per group A check, a value just past the bound gives FAIL/WARN by the declared severity, and an unresolvable logic variable gives an ERROR row. Group E: a query that throws gives an errored FAIL row that is not accepted. Parse failure increments the counter.
* **logError Mandate:** N/A (pipeline; `ctx.log`).
* **UI Layout:** N/A.

## Proposed Spec 124 rows (texts only; the orchestrator reserves ids)
1. None needed for A–E. Each shape is already ruled: A by Rule 10 + R-T `value_min`/`value_max` (`verdict.js`), B and C by R-BZ's own fix list (122a §A26 G10/G12), D by R-CE, E by R-BZ G13 + the POST-B1-1 errored-row rule.
2. Optional clarification, only if group A's two control-flow sites need it: *"A compute comparison that gates a write moves to a `pre_write` check; the runner refuses the write on its row (Rule 10). Compute never branches on a `ctx.config` bound."*

## Locks (both directions)
* **Gate E (all groups):** after each group, the scratch gate-E measure gives 0 unallowed and 0 orphans, with that group's rows deleted. Reverse: re-adding one banned line to a fixture fires the same code (the existing `compute-literals` / `compute-purity` self-tests; assert each code is still covered).
* **A:** per check, a stubbed `ctx.report` receives `{value}` and no `violations`. `verdict.js` with the resolved limit gives PASS at the bound and FAIL/WARN one past it (red-first: today the row carries a compute-computed `violations`).
* **B:** the module loads without the descriptor file on the require path (the require spy sees 0 descriptor requires), and the output with `ctx.descriptor` matches the output with the old require on a fixture.
* **C:** the URL set in the descriptor equals the URL set formerly in compute (a byte-equal snapshot of the 9 strings).
* **D:** with a fixed `ctx.clock`, the bound parameters equal the clock. A grep-free AST lock: `compute-no-sql-clock` finds 0 sites in the 3 files.
* **E:** a throwing stub pool gives an errored FAIL row for the cost_estimates and ghost checks, and acceptance does not cover it. A malformed geometry record increments the declared parse counter and the run continues.
* **C3 expiry:** CP-PLANA BUILT with any CP-PLANA row left → `item_built` RED.

## Execution Plan
- [ ] Step 1: Read the 2 control-flow G7 sites, the runner's dispatch-key check (for B), and the AP-D2 counter (for E). Fix each sub-shape.
- [ ] Step 2: Red locks per group.
- [ ] Step 3: Build groups in capture-cost order: B and C (fingerprint-only) can ride ANY recapture; A, D and E ride the next fleet recapture.
- [ ] Step 4: Delete each group's rows as its findings reach 0. Set CP-PLANA BUILT at 44 → 0. Run `npm run programme-backlog`.
- [ ] Step 5: H-lane owed: recapture the 14 affected steps, `step-validate --all --write`, full suite.
- [ ] Step 6: Panel: Gemini + DeepSeek lens set + Code Reviewer + Observability (A and E change audit rows) + Integration + Regression Guardian.
