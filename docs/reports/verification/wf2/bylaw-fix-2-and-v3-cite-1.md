## verify-15: independent verification of wf1/bylaw-fix-2 @ 5a26c383 and wf2/v3-cite-1 @ 18574feb (rule R-EZ)

**Permission denial: I stopped before cleanup.** All checks finished. The final cleanup command was refused by a Claude Code safety check: the `rm` of the `node_modules` symlinks used shell-variable paths. As the brief requires, I stopped and did not retry. Nothing was written to either lane worktree or the main checkout. These are left for the operator to remove:

- **12 detached worktrees** under `/private/tmp/claude-501/-Users-brettpreston-macmini-Documents-Buildo/283db04f-d1a3-46ef-9c75-8feef36f0684/scratchpad/verify-15/`:
  - `wt` (at 5a26c383)
  - `v3wt` (at a7655cec, clean)
  - `rf-37d8c648`, `rf-02ccf852`, `rf-e8949e4e`, `rf-80bece11`, `rf-668ec285`, `rf-20582cea`, `rf-dd5b99e4`, `rf-34828e16`, `rf-00fee86c`, `rf-06f7fb6d`
- **Each worktree** has symlinked `node_modules` and `mobile/node_modules`.
- **Five red-parent worktrees** still hold the overlaid fix-commit test files:
  - `rf-37d8c648`: an untracked `src/tests/bylaw-fix-2.logic.test.ts`
  - `rf-e8949e4e`, `rf-dd5b99e4`, `rf-00fee86c`: that file, modified
  - `rf-668ec285`: that file and `src/tests/bylaw-evaluator-fixes.logic.test.ts`, modified
- **Not worktrees:** the scratch directory `verify-15/merged` and the file `verify-15/merged.index`.

To clean up:
1. Delete the symlinks using literal paths.
2. Rewrite each overlaid file from its own commit with `git show <sha>:<path> >`, or delete the untracked one.
3. Run plain `git worktree remove` on each.

---

### Verdicts
| Branch | Verdict |
|---|---|
| wf1/bylaw-fix-2 @ 5a26c383 (base 70ec6aed, 11 commits) | **PASS-WITH-NOTES** |
| wf2/v3-cite-1 @ 18574feb (base a7655cec, 1 commit) | **PASS** |

There are no blocking findings.

### Check table
| # | Command / check | Where | Result |
|---|---|---|---|
| 1 | `npx vitest run --exclude '**/*.db.test.ts'` | detached worktree at 5a26c383 | PASS: 813 files passed, 1 skipped; 19353 tests passed, 4 skipped, 936 todo; exit 0 |
| 2 | `npx tsc --noEmit` | 5a26c383 | PASS (exit 0) |
| 3 | `node scripts/analysis/spec-split-check.mjs --check` | 5a26c383 | PASS: 7453 citations, 0 dangling |
| 4 | `node scripts/analysis/decision-log.mjs --check` | 5a26c383 | PASS: 4 logs, 24 decisions, 25 rows (batch B not imported; see note N7) |
| 5 | `node scripts/analysis/report-schema.mjs --check` | 5a26c383 | PASS (RS-5 WARN 54, report-only) |
| 6 | `node scripts/analysis/bylaw/generate-answer-tracker.mjs --check` | 5a26c383 | PASS: 788 answers, 785 INCORPORATED, 3 UNFIXED |
| 7 | `node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --check` | 5a26c383 | PASS: 107 fields, 0 dangling, no drift |
| 8 | `node scripts/generate-bylaw-provisions.mjs --check` | 5a26c383 | PASS; code-findings current |
| 9 | `node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --check` | 5a26c383 | PASS: 174 PROVEN / 935 OWED / 16 NOT_EXERCISABLE |
| 10 | `node scripts/analysis/report-fields.mjs --check` (extra) | 5a26c383 | PASS: current, 34 fields |
| 11 | Red first: each fix commit's test files run on the red parent's tree, then at the fix commit (see the table below) | 10 detached worktrees | all 5 confirmed |
| 12 | Eval-perf per-cell recompute (my own script, using the test's own hash method) at 02ccf852, 80bece11, 20582cea, 34828e16, 06f7fb6d | scratch | all pins reproduced; moves as claimed |
| 13 | INV-19 ratchet diff from 70ec6aed to 5a26c383 | git diff | only the 3 RT `main_wall_height_m` entries removed (19 → 16) |
| 14 | `git merge-tree --write-tree a7655cec 5a26c383` | read-only | clean (tree 581052a6) |
| 15 | `git merge-tree --write-tree a7655cec 18574feb` | read-only | clean (tree 43040f34) |
| 16 | Combined merged tree, materialised in scratch (not a repo): checks 3–7, 9 and 10 | scratch | all PASS. bylaw-provisions exits 1 only because a witness commit cannot resolve outside a git repo; both render sha256s equal the 5a26c383 run |
| 17 | v3-cite: `step-validate.mjs --all --fast --v3-json=<scratch>` at a7655cec, then `v3-label.mjs --write <scratch>` | throwaway worktree | the output is byte-identical to the 18574feb file; restored afterwards |
| 18 | v3-cite: `step-validate --all --fast` with the 18574feb file in place | throwaway worktree | exit 0; "R-EY: 4/43 … E1 ratchet PASS (4 listed)" |
| 19 | v3-cite: vitest on `v3-label-enforcement.logic` and `step-validate-standard-label.logic` | throwaway worktree | 64/64 pass |

### Red-first results (bylaw-fix-2)
| Fix | Red parent: fix's tests on it | Claimed | At the fix |
|---|---|---|---|
| 02ccf852 (group 1) | 37d8c648: 10 failed, 3 passed | 12 red / 1 pass | 13/13 |
| 80bece11 (CHAT-7) | e8949e4e: 3 failed (all CHAT-7), 14 passed | 3 red / 1 pass | 17/17 |
| 20582cea (CHAT-8, with the evaluator-fixes file) | 668ec285: 3 failed (2 CHAT-8 + the INV-19 ratchet), 132 passed | 3 red / 1 pass | 135/135 |
| 34828e16 (CHAT-10) | dd5b99e4: 3 failed (all CHAT-10) | 3 red / 0 pass | 23/23 |
| 06f7fb6d (CHAT-9) | 00fee86c: 3 failed (all CHAT-9) | 3 red / 1 pass | 27/27 |

Group 1 counts differently from the evidence file, and both are consistent. The evidence was taken before the two N-3 cases became `it.fails`. Run with the fix commit's file, those two expected failures count as passes, so 10 red + 2 N-3 + G-AGREE matches the evidence's 12 red / 1 pass.

### Pinned-number moves (my own recompute, not the lane's)
- **Base and 02ccf852:** 8c8eca03… (group 1 does not touch the eval-units fixture).
- **80bece11 (CHAT-7):** e957100c….
  - With `upper_side_setback_m` excluded, the hash is 8c8eca03…, the previous pin.
  - Per-cell diff: 0 cells changed; 140 new cells, all `upper_side_setback_m`.
- **20582cea (CHAT-8):** 459ee9f1….
  - Exactly 40 cells changed, all RT `main_wall_height_m`.
  - Each went from `not_evaluated:no_candidate` to `unregulated` with ABS-2 evidence. Nothing else moved.
- **34828e16 (CHAT-10):** 459ee9f1…, unchanged; 0 cells moved.
- **06f7fb6d (CHAT-9):** 0baad134….
  - With the six new targets excluded, the hash is 459ee9f1…, the previous pin.
  - 0 cells changed; 840 new cells, 140 for each new target.

### Citation spot-check: 22 checked, all real
**By-law text** (checked against `scripts/seeds/bylaw/pages/*.txt`, whitespace-folded):
1. 150.8.60.20(3)(C): "beginning from a height of 4.0 metres, an ancillary building must be set back 1.5 metres from the side lot line that abuts the rear lot line of another lot" is in ch150_8. The full (3) text confirms the lane condition in (C): "the rear lot line abuts a lane".
2. x.40.10(2)(A): "for at least 70 percent of the total width of each side main wall" is in ch10_10, ch10_20, ch10_40 and ch10_80, and not in ch10_60, which supports ABS-2.
3. 10.5.60.70(1)(B): "the area of the lot covered by all ancillary buildings and structures may not exceed 10 percent" is in ch10_5.
4. 10.5.60.70(1)(C): "a detached houseplex, semi-detached houseplex or a residential building with a secondary suite" is in ch10_5.
5. 10.10.60.70(1): the 5 % stem with (A) the pool exclusion and (B) "to a maximum of one parking space per dwelling unit" is in ch10_10. This supports N-4.
6. 150.7.60.70(1)(B): "an ancillary building containing a garden suite" is in ch150_7.
7. 150.8.60.70(1): "an ancillary building containing a laneway suite" is in ch150_8.
8. 10.5.60.50(2)(B): "40.0 square metres in all other cases" is in ch10_5.
9. 10.5.40.40(1): the thresholds 1.4 m, 80 %, 2.0 m and 10.0 square metres are all in ch10_5.
10. ABS-2's present phrases "10.60.40.10 Height" and "(2) Maximum Number of Storeys" are in ch10_60. Its absent phrase "Maximum Height of Specified Pairs of Main Walls" is not in ch10_60.
11. 10.10.40.10(4): the roof-slope quote is in ch10_10.
12. 10.10.60.20(1)(A): "abutting a street or lane" is in ch10_10.
13. "If regulation 10.5.40.70(1) does not apply" is in ch10_10 through ch10_80.

**Register and spec rows:**

14. M-159, "A unit governs only its own subject": 69a line 257.
15. M-179(1), "All-ancillary coverage is its own target": 69a line 289.
16. M-171, "A deduction from a measure that needs building facts is disclosed, never evaluated": 69a line 275.
17. M-182(1): the clause phrase "A residential building with a secondary suite" is in the M-182 row title, 69a line 294.
18. M-186, "10.60.40.10 holds only (1) height and (2) storeys": 69a line 300.
19. M-198(4), "150.8.60.20(3)(C) (the 1.5 m step-back above 4.0 m) is a mandatory upper-storey rule": 69a line 327.
20. Spec 68 §11.1, "this list equals that block in both directions": Spec 68 line 481.
21. Spec 78 O-7: Spec 78 line 701 (RULED 2026-10-18). The max(estimate + 1.0 m, 6.0 m) floor of the M-205(1) note: 69a line 340.
22. v3-cite: 124a line 912 holds the R-EY row, and its E1 clause matches the commit's quote verbatim.

**Confirmed mis-cite (commit message only):** 5a26c383's message cites Spec 68 section 2 for "a gap is a drafted ruling, not a change". That section is "Intent — why this exists" (Spec 68 line 48) and says nothing of the kind. The real source is the lane CONSTRAINTS rule ("a gap → draft a rule … leave it for the operator"). The mis-cite is in the message only, not in the tree (`git diff 70ec6aed 5a26c383` has no such cite). It cannot be fixed without an amend, so it stays on record.

### Does each implementation match the operator's words?
- **CHAT-6: matches.** The disposition drops M-193 and closes on M-198 with `verified_by_lock`; the tracker goes from 784 to 785 INCORPORATED.
- **CHAT-13: matches.** 150.7.60.60(5)(A) becomes UNUSUAL with no target (6 records); its 150.8 twin was already UNUSUAL. The test confirms neither decides `height_m`.
- **CHAT-7: matches.**
  - New target `upper_side_setback_m`, laneway suite only, 4 records.
  - `side_setback_m` on a lane lot stays 1.0 m from (3)(D). The step-back geometry is left owed to Layer 3 (P5.5).
- **CHAT-10: matches.** Spec 68 §11.1 and the vocab change together, with a both-direction lock. The field level is unchanged.
- **CHAT-8: rule part matches; 16 of the 19 cells are deliberately not done.** See note N1.
- **CHAT-9: within "the operator approves the target shape", with gaps.** See notes N2 and N3.
- **N-1 / N-4 (Committee of Adjustment findings, not batch B):** applied under existing rulings (M-159, M-179(1), M-182(1), M-171, M-175). The knock-ons to 10.5.60.70(1)(B)/(C) are text-supported. N-3 is correctly left as `it.fails` with a drafted ruling.

### Findings
There are no blocking findings. Notes, ranked by importance:

**N1 — CHAT-8 is under-delivered against the operator's words, but this is disclosed.**
- The decision says to confirm absence for "R/RT length, RT depth and main wall (M-186), RM houseplex (M-204 not_applicable); R coverage and RD semi depth per the 19-cell ratchet list".
- Only RT main wall was done (ABS-2), taking the ratchet from 19 to 16.
- The lane's stated reason: the remaining cells are blocked by units the approved wording does not name. These are measurement-method DEFINE units and units for other principal types. RM houseplex also needs `not_applicable`, which an absence ruling cannot return.
- M-237 says PARTLY APPLIED, and a "rule 7a v2" ruling is drafted.
- The operator should see that 16 cells remain OWED.
- Small widening: `vocab.absence_ignore` also skips accessory-structure-use units (citing M-159(2)). The operator's wording was "lawfully-existing or ancillary-only".

**N2 — CHAT-9: the chosen shape amends ratified rules beyond what O-7 or M-223(3) authorise.**
- O-7 (Spec 78 line 701) only requires the numbers to be keyed. M-223(3) only records the missing targets. Neither authorises a shape.
- The authority is CHAT-9's "the operator approves the target shape" / "whichever the keying lane finds smaller".
- The shape adds two mechanisms:
  - a target-declared bound (`dsl_target.<t>.bound`, read by `evaluate.mjs` rule 4)
  - a G-SHAPE exception (a DEFINE may list targets when every one declares `exact`)
- Both are a reasonable minimal reading of "own minimum targets" and "four threshold-definition targets" on single-clause units.
- But M-239's conflict check names M-76 A10 and Spec 68 §7.5 rule 4 and omits M-102 and M-106.
  - M-102 (RATIFIED 2026-10-13): a unit with "mixed bound directions … in one unit" is UNUSUAL.
  - M-106: "one unit `bound` cannot carry" mixed directions.
  - The eight x.40.10(2) units now carry a max (`main_wall_height_m`) and a min (the share) on one LIMIT.
- The lane's own drafted D-3 ruling proposes amending M-106 with the M-239 bound, which shows the tension is known.
- Recommend adding M-102 and M-106 to the M-239 conflict check and its "Amends" cell, and telling the operator in plain words.

**N3 — Spec 68 §7.5 text is not amended, although the evaluator's behaviour changed.**
- M-237 says it "Amends Spec 68 §7.5 rule 7a"; M-239 says it amends "§7.5 rule 4".
- Spec 68's rule 7a text (about line 356: "when no candidate of any layer exists for the target"), its hardening line 379 ("no by-law unit (keyed or pending)"), and rule 4 are all unchanged.
- Spec 69 M-76 A10 (69a line 154: "A LIMIT unit may hold several statements") is also unchanged.
- The register rows carry the amendment, but the standard's text now disagrees with the code.

**N4 — R 10.10.40.10(2)(B) drops `frontage_band`** (5 records: lot_conditions, evidence and 3 others).
- This is a knock-on the decision did not mention.
- It is justified (no `condition.if`, Spec 68 §6) and harmless: (A) and (B) give the same main-wall height. The eval-perf corpus and golden counts are unchanged.
- It changes when an R unit applies, so the operator should be told.

**N5 — N-1 knock-ons go beyond the single finding:**
- 10.5.60.70(1)(B) is re-targeted from `lot_coverage_pct` to `ancillary_coverage_pct`, and that target's vocab licence patterns are extended.
- 10.5.60.70(1)(C) changes from `ancillary_building` to `secondary_suite`.
- Both are text-supported (item 4 in the citation list) and cite M-179(1) and M-182(1).

**N6 — mis-cite in the commit message of 5a26c383,** confirmed (see the citation section). It cannot be fixed without an amend, which is forbidden, so it stays on record.

**N7 — batch B is not imported into the decision log.**
- `settled` and `bug_fix` are not in the generator's meanings (approve, amend, reject, defer).
- So the M-235 to M-239 rows are generator skeleton text, hand-completed, with a prose pointer to the raw record. They are not under the coverage lock.
- The raw record `docs/reports/decisions/raw/2026-10-20-chat-batch-b/2026-10-20-batch-b.json` is byte-identical to the operator file in the scratchpad.
- Each row's "Approved:" text matches the operator's recommendation verbatim.
- A `no_ruling` meaning is drafted. Until the operator rules on it, CHAT-11's ten report rows stay pending, and the rows lack their log citation.

**N8 — merge-preview overlap on generated files.** Both sides touch `docs/reference/maxbld-report-field-inventory.{json,md}`. The text merges cleanly, and `report-fields --check` passes on the combined tree.

**Hygiene:**
- bylaw-fix-2 changes 28 files, all in scope: specs 68 / 69a / 78, bylaw seeds and scripts, generated references, red evidence, the raw decision record and tests. No `.env`, no stray files.
- adjudications.json is append-only: 0 removed lines, 61 new correction records (CHAT-9 = 34 as claimed; CHAT-7 = 4; group 1 = 23).
- Every commit ends with the Co-Authored-By line.
- `mobile/node_modules` in the lane worktree is an uncommitted symlink.

### wf2/v3-cite-1 @ 18574feb
- **Scope:** one commit, one file. `v3[]` goes from 2 to 4, adding `assert_engine_health` and `compute_centroids`. `converted_baseline` is unchanged. Nothing else changed.
- **Cite:** 124a line 912 is the R-EY row, and its E1 clause matches the quote verbatim.
- **Operator quote:** found in the session transcript as the operator's own message at 2026-10-20T21:36:11Z, "push complete continue with V3 as well". The cited "continue with V3 as well" is a verbatim substring.
- **Generator:** `v3-label.mjs` has only `--write`; there is no `--check` mode. I re-ran the stated pipeline at a7655cec in a throwaway worktree, and the output is byte-identical to the committed file.
- **Ratchet:** with the file in place, `step-validate --all --fast` reports "E1 ratchet PASS (4 listed)", and the two lock tests pass 64/64.

### Merge preview onto a7655cec (the pushed integrate-14 tip)
- 70ec6aed is an ancestor of a7655cec.
- **bylaw-fix-2 onto a7655cec:** clean, no conflicts (tree 581052a686d9859bdee79faec658dd2239850f33).
- **v3-cite-1 onto a7655cec:** clean, no conflicts (tree 43040f341338583ad4e22a22a6638e183636b4ed).
- **Both together:** the two branches share no files, so they merge cleanly.
- **Generated files on the combined tree:** report-fields, spec-split, decision-log, report-schema, answer-tracker, lineage and golden all pass `--check`; bylaw-provisions renders the same sha256s as at 5a26c383. Nothing is stale after the merge.

Scratch evidence is in `/private/tmp/claude-501/-Users-brettpreston-macmini-Documents-Buildo/283db04f-d1a3-46ef-9c75-8feef36f0684/scratchpad/verify-15/`:
- the suite and tsc output: `suite.out`, `tsc.out`
- the generator checks: `chk-*.out`, plus `m-*.out` for the merged tree
- the red/fix runs: `rf-*.out`
- the eval-perf cell dumps: `cells-*.json`
- the v3-cite runs and labels: `v3-sv*.out`, `v3-labels.json`
- the spec diff: `specdiff.txt`
- my scripts: `scripts/`
