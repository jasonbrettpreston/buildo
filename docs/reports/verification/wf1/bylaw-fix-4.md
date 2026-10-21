# Verification report: verify-20, `wf1/bylaw-fix-4` @ `b6d8e710`

**Verdict: PASS-WITH-NOTES.** There are no blocking findings. Every check ran clean. Every red-first claim held when re-run. F-SC-5 is not applied anywhere in the branch. Four items need an operator decision: N1 to N4 below.

Scope: 22 commits from `ee5ed572` (pushed base) to `b6d8e710`. I wrote nothing to the repo. Scratch files are in `<scratchpad>/verify-20/`. All five worktrees I created were removed with plain `git worktree remove`, and none was refused. One cleanup command, which used shell variables, was blocked by a safety check; I re-ran it with literal paths as the brief requires. The lane worktree's HEAD is still `b6d8e710`, and the untracked `mobile/node_modules` there was already present.

## Check table

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Red first: 10 red → fix pairs | PASS | Method: the fix commit's test file was run on the red commit, then at the fix. All failure counts match the claims: F-SC-3 2/1, F-SC-4 3/2, F-SC-6 2/1, F-SC-6 family 2/1, F-SC-7 3/1, F-SC-8 2/2, front yard 2/4, F-SC-11/12 4/2, F-SC-13/14 3/1, F-SC-1 (2) 2/0. Every case is green at its fix. The red commits contain evidence only; the tests land in the fix commits. One evidence case name is stale (N7). |
| 1b | F-SC-9 `e0c00f70` (lock only) | PASS | Test and 69a only, no code change. It passes at every later fix. |
| 2 | Fixes match approved text | PASS-WITH-NOTES | See N1 to N6. |
| 2' | F-SC-5 not applied | PASS | There are no `blank_side_wall` or `10.10.40.70(4)` changes in `scripts/` or `src/`. The only mention is a test asserting F-SC-5 is absent from the log. |
| 3a | Raw record byte-identical | PASS | `cmp` identical; sha1 `b0bfad64…c03f` for both the committed raw file and `<scratchpad>/chat-decisions/2026-10-21-batch-g.json`. |
| 3b | Derived id tested; existing ids unchanged | PASS | `citationId` is covered by a unit test plus a routing test. It returns any id that already matches `ID_RE` unchanged. No existing decision log changed in the diff. `--check` re-verifies every log against its raw record. |
| 3c | `decision-log --check` | PASS | 13 logs, 71 decisions, 72 register rows, 0 owed. |
| 3d | Log recommendations verbatim | PASS | All 13 `recommendation` and `question` fields equal the raw record exactly. |
| 3e | Rows M-247…M-258 quote the recommendation verbatim | NOTE | None do. See N8. |
| 4a | eval-perf pin | PASS | I recomputed with `verify-15/scripts/cells.mjs` at base and tip. With the 9 new targets excluded, the tip hash equals the base pin `e4dca9ef…e218`: 0 cells changed. The full tip hash `3815ff0a…296d` equals the new pin. The only extra cells are 1,260 new ones (140 per new target × 9), matching the claimed 840 + 420. |
| 4b | INV-19 pin | PASS | No INV-19 pin moved in the branch. |
| 4c | Golden pins | PASS | The changes are exactly these. M-252: the x18/x125 houseplex checks now carry `dwelling_units: 4`, and three new duplex/triplex checks were added (x18 2-unit → 35 %, x18 3-unit → 11 m, x125 3-unit → 4 storeys). M-254/M-255: `keyed_disclosure` text changed on 10.5.40.50(2), 10.5.40.60(3)(A–C), RS 10.40.40.50(1)(A) and RM 10.80.40.20(2)(C). There is one observed-disclosure refresh on the RS 10.5.40.20(2) check. The case count stays 1137 and `tracker_counts` is unchanged. |
| 4d | Other test edits | PASS | `bylaw-answers-batch-5` drops "not modelled" from 4 sentences (M-254). `bylaw-validation-fixes` sweep goes 17 → 14: the (2)(C) units are now keyed. `bylaw-fix-3` excluded-estimate case changes 6.0 → null (M-256). All match the claims. |
| 5 | Line stability | PASS | Base 69a has 394 lines and the diff only appends rows at 395–406 (0 removed lines). Specs 68, 124 and 124a are untouched. Spec 78 is edited in place plus one inserted line at about 1309, and no `78:` cite above 1300 exists. `spec-split-check` is clean: 7,681 citations, 0 dangling. |
| 6 | Scorecard spot-checks | PASS | 58-notice flipped to MATCH, all confirmed in `blfix4-sc/scorecard.json`: A0201 v4 rear 7.5, A0201 v5 side 2.4, A0228 v1 coverage 35, A0231 v3 parapet 0.3, A0272 v1 platform side 1.8. 58-notice got worse, all confirmed: A0245 v4 and A0253 v6 platform encroachment 1.5 vs 0.3; A0533 v1 and A0594 v2 side 0.45 vs 0.9 (the F-SC-5 cause); A0573 v3 platform_count NOT MODELLED. Historical class totals equal `blfix4-sch/scorecard.json` (MATCH 2220, DIFFER 585, NO ANSWER 702, OWED 350). The worse-row sub-patterns recount exactly: stairs 13, platform side 3, (1)(E) 2. |
| 7 | Full checks at `b6d8e710` | PASS | suite: 818 files passed, 1 skipped; 19,502 tests passed. `tsc --noEmit` exit 0. spec-split-check, decision-log, report-schema (RS-5 WARN 54, pre-existing kind), report-fields (report-only gates), generate-answer-tracker (788 answers: 785 INCORPORATED, 3 UNFIXED), generate-maxbld-lineage, generate-bylaw-provisions and golden-lots `--check` all exit 0. golden-lots test: 1,144 passed. `step-validate --all --fast` exit 0. |
| 8 | Merge preview | See below | Clean onto `ee5ed572`. One conflict onto `e2c8e108`. |
| extra | F-SC-3 "9 units, not 8" | PASS | I re-ran `displacesOf` over all 4,418 units at base and tip: exactly 9 changed. They are 10.20.40.70(7)(A–D), which gain (2)–(5); 10.80.40.70(4)(A–D), which gain (2); and 10.5.60.20(4), which gains (6)–(10). |

## Findings

**N1. NOTE: F-SC-6 extension to RD 21/28/35/37/38 goes beyond the approved text.**
- **What was approved.** F-SC-6 covered exception RD 42 only: "Floor-area formula for exception RD 42 … `900.3.10(42)(A)(i)`".
- **Are the texts the same?** Checked in `ch900_3.txt`. All five siblings share the operative cap phrase "… square metres[,] plus 25% of the lot area, up to a maximum floor space index of 0.5". Base areas: x21 135, x28 165, x35 150, x37 150, x38 125. The full clauses are not word-for-word RD 42:
  - x38 matches RD 42's form ("plus the floor area of an attached or detached garage").
  - x35 says "including the floor area of an attached or detached garage".
  - x21, x28 and x37 have "is X square metres plus 25%… including: (i) the floor area of…", with no comma before "plus" and the garage moved to a sub-item.
  - So the corrections' wording "word for word the RD 42 text" holds for the cap phrase only.
- **It reverses a recorded operator answer.** On 2026-10-14, W1 queue answer Q-W1-1bc0a62a for x21 (C)(i), and Q-W1-9b5518ca for x42, explicitly rejected `min(…; 0.5 ratio × lot_area_m2)` as "a conversion (§7.4)". The operator's F-SC-6 approval overrides that for x42 only. For x21/28/35/37/38 it is overridden by the lane under the provision-family rule.
- **Attribution.** The new corrections are stamped `adjudicator: "operator"`.
- **Missed sibling.** RD 27 (D) has the same cap text ("165 square metres plus 25% … up to a maximum floor space index of 0.5") but has no authored units, so it is not covered. It should go in a PIN or the F-SC-1 list.

**N2. NOTE: the `private_garage` use was dropped on x28/x37 (C)(i) without its own operator ruling.**
- **What the lane cites.** M-175, M-171 and M-247 (2), recorded as M-75 corrections (`application.uses` → `[]`, plus evidence).
- **Before and after.** At base, x28 and x37 carried `uses: ["private_garage"]`, while their sibling x21 (C)(i) already had `uses: []`. After the change all three are consistent.
- **Effect.** The x28/x37 cap now binds the house. x37 FSI goes from the zone's 0.45 to 0.5, matching the City on four 2017 notices.
- **Why it needs the operator.** It is a reasonable family-consistency fix, but it is not in any batch-G recommendation text.

**N3. NOTE: M-247 row text goes beyond the F-SC-1 subject.**
- The approved subject is "the five exceptions … (x40, x225, x478, x863, x559)".
- The row adds x14 to the list in (1).
- It also adds part (2): the historical top three (x18/x21/x37), whose measurement-only DEFINE units take target `none`. That is 8 units in `f8d52ba2`, matching the claim.
- The operator's quote does mention "302 historical rows", so (2) is within its spirit, but it is not in the recommendation.
- Part (1), keying the five no-unit exceptions, is not applied and is recorded as owed.

**N4. NOTE: approved items applied only in part, all disclosed in the status cells.**
- M-254: the recommendation says to extend the D-3 form to 10.5.40.60(1)–(8). Only (3)(A)–(C) were keyed; (2)(A) and (7)(A) were triaged as PIN.
- M-255: "add the 10.5.50.10(5) unit" was not applied, because the row is out of scope under M-56 (G-UNIVERSE `--accept` owed). The suite stair rule stays UNUSUAL. The extension clearance was also applied to RS and RM twins (provision family, consistent with the parallel-chapters rule).
- M-249: also keys (4)(D)(iv), `side_setback_street_m = 3.0 m`, which the recommendation did not mention. It is the clause's own text.
- M-251: uses a new input `proposed_storeys` where the recommendation names `height_storeys`. The deviation is documented in the row.
- M-257 and M-258: no code change. The lane drafted rulings R-SH-12 and R-SH-13 for the operator.

**N5. NOTE: front yard (M-256).** It matches the recommendation. The re-measure on the oracle basis is still OWED, because the dblock was held. Only the 58-notice scorecard figure was given: 6 → 4 too-generous lots, out of 13 → 10 valued lots.

**N6. NOTE: F-SC-3 reaches beyond the approved example.** The xref change also expands RD 10.20.40.70(7) to (1)–(6) and 10.5.60.20(4) to (5)–(11). This follows from the approved mechanism. No fixture cell moved (eval-perf check, 4a).

**N7. NOTE: one stale red-evidence case name.** In `bylaw-fix-4-fsc13-14-red.json`, the case is named "RD / RS 10.x.40.20(2)(C)…", but the committed test is "RD / RS / RM …". The RM twin was added after the evidence was captured. Run under its committed name, the case fails at `34b90f4f` and passes at `b86246ec`.

**N8. NOTE: rows M-247…M-258 do not quote the recorded recommendations verbatim.** Each row cites its log id and paraphrases, with formulas and by-law quotes. This matches earlier rows such as M-244. The verbatim text exists only in the generated log, `docs/reports/decisions/2026-10-21-chat-batch-g.json`, where it is exact. If verbatim quoting in the row is required, that is a gap in all 12 rows.

**N9. NOTE: some "worse" rows deserve a look.** On the historical scorecard, 45 rows went NO ANSWER → DIFFER. 13 of them are `stairs_clearance_m` with the City at 2 m and ours at 0.6. That 2.0 m may be the City citing the stair-width arm, which would make it a mapping issue rather than an error in our answer. Worth checking before treating these as accuracy losses.

## Operator attention

1. **Family extension of F-SC-6 (N1).** Do you accept `min(X + 25 % × area; 0.5 × area)` for RD 21, 28, 35, 37 and 38? It reverses your 2026-10-14 W1 answers on x21 (and the x42 one) that called this form a conversion. Also: should RD 27 (D), with the same cap text but no units, be added to a PIN or to F-SC-1?
2. **`private_garage` dropped on x28/x37 (N2).** Do you accept it? It aligns them with x21 and moves x37 FSI from 0.45 to 0.5 (the City's figure).
3. **M-247 scope (N3).** Confirm x14 and the measurement-only DEFINE → `none` correction (8 units in x18/x21/x37) as within F-SC-1.
4. **Drafted rulings left for you:** R-SH-12 (keep the label-frontage reading where the text does not support the City), R-SH-13 (keep 25 %), and the M-247 (1) keying owed through keyer A/B.
5. **Front-yard re-measure still owed (N5):** it is waiting on the dblock.
6. **F-SC-5 is still unrecorded** (orchestrator bug). The 58-notice side-yard DIFFERs at 0.45 vs 0.9 (A0533, A0594) stay until it is recorded and applied.

## Merge preview (`git merge-tree --write-tree`, read-only)

- **Onto `ee5ed572`:** clean. `ee5ed572` is an ancestor, so this is a fast-forward; the result tree `67f80a76…` equals `b6d8e710^{tree}`.
- **Onto `e2c8e108` (night-1):** **1 conflict**, in `src/tests/decision-log.logic.test.ts`. The merge base is `ee5ed572`, and night-1 has 2 commits (CHAT-27/28, batches E/F). Both sides edit the `GREEN` count, 58→60 and 58→71, and both add `it` blocks after it. To resolve, set `expect(r.decisions).toBe(73)` and keep both sets of `it` blocks. There are no other overlapping files: night-1 touches 124a and rule-map, this branch touches 69a and 78. The decision ids don't collide (CHAT-27/28 vs CHAT-29.*). After resolving, re-run `decision-log --check` on the merged tree.
