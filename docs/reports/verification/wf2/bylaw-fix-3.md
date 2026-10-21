# verify-18: `wf1/bylaw-fix-3` @ `04ba1b5c` (base `885c2ad2`)

**Verdict: PASS-WITH-NOTES** for the lane on its own base.

There is one **BLOCKING finding for integration only**: merging onto `0e0c9f4b` (`wf2/steps-rulings-1`) leaves one textual conflict and one semantic break, and `decision-log --check` fails on the merged tree. Details are in F-1 and the merge preview.

I wrote nothing in the repo. All scratch files are under `scratchpad/verify-18/`. Every throwaway worktree was removed with plain `git worktree remove`, and none was refused. The lane worktree is unchanged (HEAD `04ba1b5c`; the only untracked entry is `mobile/node_modules`). I did not run the golden puller against the DB.

## Check table

| # | Check | Result |
|---|---|---|
| 1 | Red first: R-DV-1 (`fe75f253`→`f4ffdf41`) | 6/6 named cases fail at red and pass at the fix. Two more real-tree tests also fail at red because the batch-B data is not there yet (N-5) |
| 1 | Red first: R-7a-v2 (`a594138c`→`dbbd31ca`) | 8 red / 1 pass at red, 9/9 at the fix. Two case names were renamed in the fix (N-6) |
| 1 | Red first: N-3 (`6da087fd`→`df434e5c`) | 8/8 match the evidence (7 red / 1 pass), then 8/8 pass |
| 1 | Red first: D-1 (`6c3d8dbb`→`4acb171f`) | 5/5 red, then 5/5 pass |
| 1 | Red first: M-205(1)-floor (`36dfe50d`→`81c23a9d`) | 9/9 match (5 red / 4 pass; the commit subject's "2 pass" is corrected in the fix message), then all pass |
| 1 | Red first: N-2 (`e3e34d18`→`462c7474`) | 8/8 match (6 red / 2 pass), then 8/8 pass |
| 1 | Red first: D-3 (`37ee62ee`→`166d1201`) | 7/7 red, then 7/7 pass |
| 2 | Implementation matches the approved drafts | Yes for all eight rulings. Items for the operator are in the Operator attention section |
| 3 | eval-perf pins | Recomputed with the test's own hash method (`verify-15/scripts/cells.mjs`): `0baad134` at `81ba1080`, `8cba529b` at `dbbd31ca` through `462c7474`, `e4dca9ef` at `166d1201` and `04ba1b5c`. All match the pins |
| 3 | Moved cells | R-7a-v2: 42 top-level cells moved (RT `building_depth_m` 40, RT `building_length_m` 2, all `no_candidate` → `value` unregulated). 137 other cells changed below top level: 90 `per_type`, 28 `inputs[]`, 19 trace-only, all as claimed. N-3, D-1, M-245 and N-2 each moved 0 cells. D-3 moved 0 existing cells and added 14 new targets × 140 = 1,960 cells, all `no_candidate` |
| 3 | INV-19 | Ratchet list 16 → `[]` (`bylaw-evaluator-fixes.logic.test.ts`), and it passes in the suite |
| 3 | eval-vectors | Exactly three changed: `p5071306` and `bijou` RT depth now expect unregulated (ABS-5), and V22 is withdrawn to `no_expected:building_type_dependent` |
| 4 | `decision-log --check` | Clean: 8 logs, 42 decisions, 39 register rows, 2 no_ruling |
| 4 | Raw records | Batch B, the page export and `drafts.md` are byte-identical (`cmp`) to the scratchpad sources. The batch-C split keeps CHAT-14 and CHAT-21 verbatim, every top-level field is unchanged, and the only addition is the declared `split` key |
| 4 | `rests_on` | CHAT-12 → M-229 and CHAT-13 → M-175 / M-235. All three are real 69a rows (lines 374, 283, 381) |
| 4 | CHAT-11 | 10 rows moved `pending:operator_confirm:Q-7` → `pending:spec100_amendment:Q-7` (counts 10/22 → 0/32). RS-5 stays WARN (54) |
| 4 | R-HK amendment and §1a | R-HK is amended by appending text inside its cell, with the prior text kept as prefix and no line added. The §1a sentence is appended to the existing line (line 139). Both follow CHAT-14 |
| 5 | Line stability | Every hunk in 69a, 124, 78, 130 and 131 replaces n lines with n lines. 69a grows only by the 7 rows appended after line 387. 68, 69 and 124a are untouched (0 bytes). `spec-split-check`: 7,553 citations, 0 dangling, budgets held |
| 6 | Golden puller | No DB writes: one `SELECT … from parcels` inside `BEGIN READ ONLY` … `ROLLBACK`. Its one file write is `lots.json` in `--add` mode (N-7). The 8 parcel ids match the commit. All 29 CoA expected values equal the City figures in `coa-intake/samples` |
| 7 | Merge preview | Onto `885c2ad2`: clean (fast-forward). Onto `0e0c9f4b`: one textual conflict and one semantic break (F-1) |
| 8 | Suite (`vitest run --exclude **/*.db.test.ts`) | 816 files passed, 1 skipped. 19,427 tests passed, 4 skipped, 936 todo |
| 8 | `tsc --noEmit` | rc 0 |
| 8 | `spec-split-check --check` | Clean |
| 8 | `decision-log --check` | Clean (as in check 4) |
| 8 | `report-schema --check` | Current; RS-5 WARN (54), all other RS gates PASS |
| 8 | `report-fields --check` | Current, 34 fields. The RF gates are report-only, as on base |
| 8 | `generate-answer-tracker --check` | Clean |
| 8 | `generate-maxbld-lineage --check` | Clean, 107 fields |
| 8 | `generate-bylaw-provisions --check` | rc 0, no drift |
| 8 | golden-lots `--check` and its test | rc 0: 182 PROVEN / 935 OWED / 16 NOT_EXERCISABLE / 4 FAILS. The test passes in the suite |
| 8 | `step-validate --all --fast` | rc 0. Five "descriptor validation FAILED" lines (permits, `assert_entity_tracing`, `assert_network_health`, `assert_staleness`, `assert_lifecycle_phase_distribution`) are marked non-blocking (R-DU no-descriptor pending). The lane touched no descriptor, so these predate it |

## Findings

**F-1: BLOCKING for integration with `0e0c9f4b`; not a defect on `885c2ad2`.** The `quote_ref` change and the steps lane's batch-C record do not fit together.
- The `quote_ref` resolution added in `f4ffdf41` (`decision-log.mjs` `importChat`) fails when a decision names a quote the record does not hold.
- The steps lane's raw record `docs/reports/decisions/raw/2026-10-20-chat-batch-c-steps/2026-10-20-batch-c-steps.json` (at `0e0c9f4b`) renamed the source's `operator_quote_2` to `operator_quote`. Its decisions still say `"quote_ref":"operator_quote_2"`.
- On the exported merge tree (`git archive` of `merge-tree` tree `2fd8e9fa`), `decision-log --check` reports: `RED — 2026-10-20-chat-batch-c-steps: raw export does not import (CHAT-15: quote_ref "operator_quote_2" names no quote in the record)`.
- The integrator must fix this on one side. One option is for the steps record to keep the source key `operator_quote_2` verbatim, which is also more byte-faithful to `chat-decisions/2026-10-20-batch-c.json`.

**N-1: NOTE.** M-245's rule cell says "Re-measured on the n = 219 notices"; the re-measure ran on n = 220. The status cell and the commit both state 220 correctly. The one notice not in the 2026-10-19 set is A0253/17EYK.

**N-2: NOTE.** M-243 quotes "Approve (amends M-106)" as though the operator said it. That text is the page's recommendation label. The operator's answer was `choice: approve` with an empty note.

**N-3: NOTE.** 166 appended `adjudications.json` records carry `adjudicated_on: "2026-10-21"`, a day after the commits (2026-10-20 local time). The prefix of 5,651 records is unchanged.

**N-4: NOTE.** In the M-235…M-239 rows, the rule-cell placeholder "the `<log>#<id>` citation is written here when the log imports…" was replaced in place rather than appended to. The approved R-DV-1 draft says "write the `<log>#<id>` citations into those rows", and the placeholder itself announced this, so it is sanctioned. It is still the one non-append edit to existing 69a rows.

**N-5: NOTE.** At R-DV-1 red, 8 tests fail rather than the evidence's 6. The two extras are real-tree tests ("batch B (R-DV-1)…" and "GREEN… expected 26 to be 34"), which need data that the fix itself adds. The evidence covers only the R-DV-1 describe block, as its note says.

**N-6: NOTE.** The R-7a-v2 red evidence names two cases by their pre-rename titles. The fix appended "on a major street" to the ABS-3 and ABS-4/5 titles, as disclosed in `dbbd31ca`. By count, red is 8 fail / 1 pass, matching the evidence, and the fix is 9/9.

**N-7: NOTE.** The golden puller makes no DB writes. It does write `lots.json` (`fs.writeFileSync`) in `--add` mode, which is by design. `--verify` writes nothing.

**N-8: NOTE.** The `04ba1b5c` commit message says "12 cases / 30 checks". The code and `cases.json` have 12 cases and **29** checks (8 PROVEN, 4 FAILS), which matches the brief.

**N-9: NOTE.** Case A0625 lists `cited: 10.10.60.70(1)(B)` (the City's citation) but checks unit `10.10.60.70(1)#(1)(A)`. The value is 5 % on both, but the unit differs from the clause the City cited.

**N-10: NOTE.** Withdrawing V22's expectation (Spec 67 vector RT length, "confirm NOT 17.0") is a consequence of R-7a-v2 that the draft does not mention. The test still asserts the answer is never 17.0 m.

**D-3 scope.** The 161 records are within the draft. They are 119 records on the 17 card units the draft lists (10.5.40.60 (1)–(8), 10.5.60.60(1), 150.8.60.60(7), including the @1075-2026 variants) and 42 records (target and expression only) moving 21 element-naming units to element targets. Those 21 are 10.5.40.60 (1)(D), (1)(F), (4)(B), (6)(A), (8)(E) and (8)(C)@1075-2026, plus the 150.7 / 150.8.60.60 twins. Moving them is arm (2): "`encroachment_m` keeps only clauses that name no element." `encroachment_m` keeps 900.2.10(735)[SSP](E) and 10.5.75.1(7)@1075-2026, both stated.

## Merge preview (`git merge-tree --write-tree`, read-only)

- **Onto `885c2ad2`:** clean (tree `a7a18e20`, a fast-forward descendant).
- **Onto `0e0c9f4b`:** the only file both lanes touched is `src/tests/decision-log.logic.test.ts`, which gives 1 conflicted file with 2 hunks (merge tree `2fd8e9fa`):
  1. Around line 392 of the merged file, both lanes added a sibling `it(...)` in the same place: the steps-rulings-1 logs test (v3-exception-rulings + chat-batch-c-steps) and this lane's batch-B (R-DV-1) test. Resolution: keep both.
  2. Around line 424: `expect(r.decisions).toBe(38)` (steps) versus `toBe(42)` (this lane). Merged, this should be 54 decisions across 10 logs (26 at base + 12 + 16), and `no_ruling` stays 2. Re-derive it with `--check` after resolving.
- **Semantic break:** see F-1. `decision-log.mjs` auto-merges, since only this lane changed it, but the merged tree fails `--check` on the steps lane's batch-C record.
- The two batch-C splits complement each other: this lane holds CHAT-14 and CHAT-21; steps holds CHAT-15…20 and CHAT-22.
- `spec-split-check` on the merged tree is clean (7,663 citations, 0 dangling).

## Operator attention

**M-205(1)-floor / M-245: the no-floor rule makes the estimate too generous far more often.** I recomputed these from the committed `docs/reports/2026-10-20-front-setback-no-floor-remeasure.json` rows, using the oracle's own formulas (`front-setback-oracle.cjs` lines 117–128), read-only. All numbers are confirmed exactly:

| n = 220 | Mean error | Within 1 m | Too generous (ruled < examiner) |
|---|---|---|---|
| Before: max(est + 1.0, 6.0) | 1.39 m | 54.5 % | 22.3 % |
| After: est + 1.0 | 1.15 m | 67.3 % | **48.2 %** |

- 89 notices change. Of those, 71 now fall below the examiner's figure, 35 of them by more than 1 m (median shortfall 0.98 m, worst 11.07 m).
- Removing the floor makes the average closer but roughly doubles the share of answers that understate the required front yard. Those answers overstate the buildable depth.
- **Adoption was not made conditional on the result.** The draft and CHAT-21 say "re-measure on the 219 notices before adoption" without setting an acceptance threshold. The lane re-measured and adopted in the same commit (`81c23a9d`), whatever the result. It recorded the 48.2 % in M-245's status cell and the commit, but did not stop for an operator decision.
- The operator should confirm M-245 stands given the 48.2 %, or say otherwise. The two golden FAILS (COA-F-01: 453 Durie 2.90 m against the City's 3.91 m; 24 Gardens Cres 5.07 m against 4.86 m) show the estimator error either way.

**N-2 / M-241: Norwood's "side 1.0 m" is answered as a lane setback.**
- The City (A0625/26TEY, variance 2) states "The minimum required side yard setback for an ancillary building or structure is 1 m" under 10.10.60.20(1)(A).
- The lane keys (1)(A) as:
  - rear = `if(holds(abuts_lane); 1.0 m; unregulated)`
  - side-street = `if(holds(corner_lot); …)`
  - lane = `if(holds(abuts_lane); …)`
- The golden case checks Norwood through `lane_setback_m` = 1.0, with the rationale "which line abuts the lane is the ML-1 lot-line classification (owed), so the lane arm answers it".
- This is consistent with draft arm (2), "side lot line abutting a street or lane" → `lane_setback_m`, read as covering a side line on a lane. But it is a reading: the draft's own words for (3) were "a golden-lot case for 20 Norwood (side 1.0 m)".
- Side effect: because the rear arm also fires on the lot-level `abuts_lane` flag, Norwood's garage also answers rear 1.0 m (the `bylaw-fix-3` test asserts "1.0 m from the lane line and the rear line"). The City cited only a side yard there.
- On 474 Beresford (A0510/26TEY) the City did cite a 1.0 m rear yard, and the rear arm matches.
- Until ML-1 can tell which lot line abuts the lane, any lane lot gets both rear and lane 1.0 m for a garage. The draft accepted the `abuts_lane` proxy for the rear arm explicitly. The operator should confirm that the side-as-lane reading, and the rear 1.0 m on a side-lane lot, are acceptable.

## Evidence files (`scratchpad/verify-18/`)

- `scripts/rg.sh`, `scripts/cmp.mjs`: red/green runner and comparator.
- `red-*.json`, `green-*.json`, `ev-*.json`: vitest JSON results and the evidence files compared.
- `scripts/cls.mjs`, `cells-<sha>.json`: per-cell classification and the cells at each commit.
- `chk-*.out`, `suite.out`, `tsc.out`, `sv.out`: full-check outputs.
- `mt.out`, `merged-dl-test.ts`, `merged/`: the merge-tree output, the conflicted test file, and the exported merge tree (a plain directory, not a worktree).

I also wrote a stray `/tmp/x1` by mistake and deleted it straight away.
