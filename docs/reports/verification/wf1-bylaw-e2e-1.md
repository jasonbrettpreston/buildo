# Verification: wf1/bylaw-e2e-1

- Branch: `wf1/bylaw-e2e-1` @ `53a21030` (worktree `~/Buildo-wt-e2e`; parent `208e8a82`)
- Lane: verify-13 (R-EZ, independent, read-only). Date: 2026-10-20.
- Detailed content evidence is in `verify-13/e2e-content.md`. Probes: `e2e-probe.mjs`, `ans.cjs`, `e2e-dbcheck.cjs`; the OWED list is `e2e-owed-wrong.txt`.
- No tracked edits. The dblock was held by another lane from 14:25 for the whole window (I retried for about 85 minutes and never forced it), so **no DB query ran**.

## Verdict: **BLOCK** (one narrow finding, B1; small fix). Everything else is PASS-WITH-NOTES.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Full suite at tip | **19,182 passed / 4 skipped / 933 todo / 0 failed**. That is the int12 base of 18,052 plus 1,130 golden-lot `it`s |
| 2 | `tsc --noEmit` | exit 0 |
| 3 | `step-validate --all --fast` | exit 0 |
| 4 | `spec-split-check --check` | clean |
| 5 | `golden-lots-cases.mjs --check` | exit 0 (current). Check-level: PROVEN 158 / FAILS 19 / OWED 932 / NOT_EXERCISABLE 16 |
| 6 | Counts | All reproduce mechanically from `cases.json`: 170 lots; 317 answers (131 wrong + 186 disclose, = tracker) → 64 PROVEN / 10 FAILS / 239 OWED / 4 not exercisable, each answer in exactly one class; findings exactly E2E-F-01…06; 2,063 tests = 1,130 run + 933 todo; 19 `it.fails` |
| 7 | Production path | The helper imports only production modules: `validate.mjs`, `authored.mjs`, `agree.mjs`, `vocab.mjs`, `xref.mjs` and `evaluate.mjs` (`effective`, `applies`, `makeContext`, `loadCandidates`). `runCheck` reads only what the evaluator returns. **No by-law rule is re-implemented.** The generator's hand-written expectations (`sideGS`, `rear755`) are an independent oracle for expected values, never used as actuals |
| 8 | PROVEN sample (15, one per unit, across families) | 15/15: the expected value follows from the disposition and ruling, and the observed value is the evaluator's own winner |
| 9 | All 19 FAILS cases (10 answers, 6 findings) | Every observed value comes from `effective()` (one reproduced independently). F-03, F-04, F-05 and F-06 have correct expectations (F-05's by-law text was confirmed in `ch10_40.txt`). F-01 is arguable (N2). **F-02's expectation is wrong (B1)** |
| 10 | OWED-TO-① review | All 57 `wrong`-verdict OWED answers reviewed. Nearly all are cross-structure or composition fields, or P5.12 disclosure codes that cannot be emitted lot-level before ①. The classification holds; some parts could be asserted now (N6) |
| 11 | DB independence | No `pg`, `DATABASE_URL` or Client import in the helper, test or generator. The test runs green without a DB. `lots.json` is a snapshot |
| 12 | Lot existence (10 ids) | **NOT RUN.** The dblock was held throughout. Indirect evidence: the lane's pull scripts read `parcels` READ ONLY, and the fixture flags are internally consistent. The command is ready: `DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config <scratch>/verify-13/e2e-dbcheck.cjs src/tests/fixtures/bylaw-golden-lots/lots.json`, run from `~/Buildo-wt-e2e` under the dblock |
| 13 | Against wf1/bylaw-fix-1 (merge tree) | The golden test file still passes (1,130 / 933 todo; the 19 `it.fails` still fail). **`golden-lots-cases --check` goes RED, "cases.json is stale"**, because bylaw-fix-1 rewrites the tracker and the dispositions. See the integrate-13 plan §4.3 |

## Findings

**BLOCKING**
- **B1. The E2E-F-02 expectation contradicts ratified M-198(1).**
  - The case `150.7.60.20(3)#(3)(A)` (through lots 5370045 and 5397229) expects garden-suite `rear_setback_m = 1.5`, "the 1.5 m default answers".
  - M-198(1) (69a:326, RATIFIED 2026-10-18) says: *"Through lot, 150.7.60.20(3)(A): the neighbour's required front yard is approximated by the subject lot's Layer 2 `front_setback_m`, and the larger of (A) and (B) 1.5 m is taken."* So the target is max(front_setback_m proxy, 1.5), which is normally about 6 m, not 1.5.
  - The disposition (`fixed_by M-198`, `suite_lot_fact_unknown`) agrees: "On a through lot the rear setback equals the adjacent lot's required front setback; that neighbour fact is not held and is disclosed."
  - The golden lots carry no `front_setback_m` (probe: `not_evaluated map_area_not_held`).
  - Effect: the `it.fails` would "turn green when fixed" against the wrong value. The report also points the keying lane and bylaw-fix-1's lock at 1.5 m.
  - Fix (lane, via the generator): re-derive the expectation per M-198(1), or reclassify as OWED-TO-① (P5.13 Layer 2 proxy plus disclosure), then regenerate `cases.json` with `--write` and correct the F-02 text in `docs/reports/2026-10-20-bylaw-e2e-verification.md`.

**NOTE**
- **N1.** The helper's assembly is a line-for-line copy of `scripts/analysis/bylaw-validation/eval-lots.mjs:15-29`, not shared code, so the two can drift silently. `vectorOf` merging the vocab `default_overrides` into the flags is the lane's model of the unbuilt P5 step: an assumption, not a production path.
- **N2.** F-01 (150.7.60.20(6)(C) corner): the disposition records `owed: M-198 → P5.13` (the principal's side yard is needed), and the report leaves that out, so FAILS vs OWED is arguable. The expectation also skips M-198(2)'s "larger of (A) proxy … and (C)".
- **N3.** F-03's suggested owner action cites M-177(3) ("set aside as a disclosed design choice"). M-198(4) superseded that on 2026-10-18, ruling (3)(C) MANDATORY.
- **N4.** The report's "Operator answer:" lines quote the disposition's `corrected_value`, not the operator's own words. For F-01 the operator wrote "Minimum =1.5m . Critical - this is the default", while the quoted line says the opposite. Relabel the line as "Disposition (corrected value)" or quote the note.
- **N5.** The reason for 150.8.60.20(3)(A) says "as E2E-F-03", which refers to itself. Cosmetic.
- **N6.** Some OWED answers have parts that could be checked now.
  - The 11 `buildings_on_same_lot` answers: the "not bound on a single-building lot" half returns `no_candidate` today.
  - Five OWED cases already carry passing value checks under an empty reason: 10.5.40.10(3)(A), 10.10.40.10(6), 10.20.40.10(6), 10.40.40.10(2)(C) and 10.10.40.40(2)(A).

  These proven parts are not counted in the 64.
- **N7.** "No OWED case is left without a reaching lot" overstates: `150.7.60.70(2)#row` has no checks. The test correctly skips it.
- **N8.** A class `UNREACHED` can be emitted but has no describe block (0 such cases today). The non-pinned NOT_EXERCISABLE assertion `reason.length > 40` is tautological.
- **N9.** `golden-lots-cases.mjs --check` is not in pre-commit, and the suite does not run it. Tracker changes from other lanes, starting with bylaw-fix-1, make `cases.json` stale without anything turning red. Either wire it (R-DJ (1) precedent) or have the golden test assert freshness.
