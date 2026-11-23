# Seat: reality-check: task-448 plan (PLAN-448-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head daf3f7201 (the plan says it read a75713110; `git diff a75713110 HEAD` touches only the task-448 file: adds `updated_date`, the Files line and the plan). Read: the whole task-448 file, scripts/analysis/rule-lists.json, rule-lists.mjs (resolveTask, checkTasks, verifyResolved), backlog-lane.mjs:10-14,78,188, check-lane-close.mjs (:274-275, :502, :692-712, :720-721, :753, :766-767, :840-842), 08_agents.md (:229, :355-361, :486-490), 137_mcqueue.md:134-137, MORNING-DECISIONS.md (:1517-1520, :1687, :1917-1919, :1975, :2140-2171), backlog/decisions (203-208), the three test files and a grep of every other test, .husky/pre-commit, and the committed lane folder docs/reports/lanes/2026-11-23/BL-HB367 on wf1/inc1b-hb367 (9f47c3454). I ran only read-only git and file reads, plus in-memory node scripts that import rule-lists.mjs on an in-memory copy of the table. I wrote no file and ran no test runner.

## Checked and TRUE
- **3.1 table rows.** All 16 old `lists` lines are exact at the cited line numbers (:88, :120, :126, :132, :139, :151, :157, :170, :176, :182, :188, :193-194, :200, :206, :212, :218). The `:163` (lane-tools) lists line is unchanged. The `not` inserts after :93 and :162 and the panel-records glob apply cleanly. `validateTable` returns [] before and after. The 16 changed rows are the 16 the plan names.
- **Resolved lists and characters (new table vs old).**

| Files line | before | after |
|---|---|---|
| task-367 | 16 lists, 961,597 | 6 lists, 113,259 (surface-136, eng-all, five-words, plan-protocol, inc-S, ms-S) |
| task-442 | 13 lists, 707,152 | the same 6 lists, 113,259 |
| mobile/src/app/ | 12 lists, 307,917 | 10 lists, 216,326 |
| docs/specs/03-mobile/100_mobile_parcel_cost_tool.md | 13 lists, 395,116 | 9 lists, 222,253 |
| prereg-MF-96-1.json | 10 lists, 344,495 | 4 lists, 37,570 (the four every-task lists) |
| prereg-MB-18-1.json | 10 lists, 344,495 | unchanged, still has bylaw-133 |
| docs/reports/panels/MF-94.json | 8 lists, 452,423 | 4 lists, 37,570 |
| docs/reports/review_followups.md | 6 lists, 118,842 | 4 lists, 37,570 |
| task-448's own Files line | 10 lists, 301,813 (includes policy-124-s2-s5) | 9 lists, 211,730 (all eight lane-tools-row and every-task ids) |

  Both pre-registration files exist and are tracked.
- **check-tasks.** 0 bad before and after. The counts are 103 resolve and 200 not yet resolvable in both states (see rc#2 for 102 vs 103).
- **3.2 anchors.** All 21 anchors are present on their cited line, exactly once on that line. The two-occurrence anchor (`gets them through the specs-web-admin row (RR-0383, decision-168)"`) appears on :146 and :152, twice in the file. Every other anchor is unique in the file. The `$comment` old text is at :6. The `:152` opening anchor is exact.
- **3.3.** The old sentence at backlog-lane.mjs:188 matches the quote exactly (grep -c = 1). The new text has no backtick and no `${`. It keeps `out-<lens>[-<list id>]-rN.txt` (backlog-lane.logic.test.ts:290 and :298 stay green) and `two output rounds at most` (:169). Nothing else greps "the round-1 file stays", "is filed beside them" or "each finding needs a verdict". The new text contains "under the SAME names" exactly once, so A10 holds.
- **3.4-3.6 insertion points.** 08_agents.md:356 is the task-439 note and :357 is `5. **Panel sizing...`. :488 is blank, :489 is the task-419 dated note and :490 is blank. :486 contains "one grounder re-executes every claim in the fold". 137_mcqueue.md:136 is the task-439 note and :137 is blank.
- **Superseded phrases.** `(a record-only task gets the queue lists)` is at :229, `the mobile row keeps its five mobile lists` is at :356, and `the specs-web-admin row and the importer, census-route, panel-record and generated-127 rows keep them` is at 137:136. The :356 specs-web-admin phrase is also present but not exact (rc#3).
- **Operator quotes and decisions.** Quotes at :2140, :2144, :2149, :2161 and :2171 match. The plan's :2166 quote is a true prefix (rc#4). :2155 is the RR-0420 text. Decisions 203-208 exist in backlog/decisions with the matching RR numbers (203=0418, 204=0419, 205=0421, 206=0420, 207=0422, 208=0423). MD:1917 is RR-0385 item 1, :1919 item 3, :1687 the grounder-before-fold ruling and :1975 the "no other infrastructure" ruling.
- **Section 4 old text.** The old text matches at every cited line in all three test files (rule-lists.logic :38-39, 49, 53, 55, 61, 67, 69, 71, 73; table :29-30, 32, 34-37, 43, 48, 100, 103, 115, 117-118, 239-240, 243, 336, 344, 356, 358-361; lane :298, 400, 405, 548, 552, 575). :346 is the `addFour` line and :345 is the `arrayContaining(MOBILE)` line, so inserting after :345 is correct.
- **Section 4 assertions.** I evaluated 30 of the new or edited assertions in memory on both tables. All hold on the after-table, and the changed ones fail on the before-table, so the red is real. The proof covers rule-lists.logic :38, 53, 61, 67, 69, 71, 73; table :29/30, 34, 36, 43, 48, 103, 117, 240, 243, 344, 358, 359; lane :405 and :552 (no 137_mcqueue.md, and plan-protocol.md present).
- **Pipe order.** The `pipe` list for `docs/specs/01-pipeline/132_step_standard_handbook.md` at letter 1 is exactly `['eng-all','five-words','plan-protocol','inc-1','ms-1']`.
- **FILES_423.** It resolves to 9 lists before and after, so :934 `toHaveLength(9)` holds.
- **Unchanged assertions.** :146 (deepseek-review.js keeps agents-s5-1to3 and not step-132), :119, :342, :207, :288 and the prep-fixture `plan-compliance-queue-137` at :681-683 (default Files scripts/analysis/thing.mjs, lane-tools row) hold unchanged.
- **Other tests.** None of the other tests that read the real table or the brief text break. I grepped every test file for the turned-off ids, `137_mcqueue`, `draft, operator`, the old brief sentence and the `queue lists` wording. Only those three files carry hits. check-lane-close.logic.test.ts uses its own table (:94) and hooks-composition runs only `page --check`. I found no assertion that would go red and is missing from the plan.
- **Section 0 measurements.** On wf1/inc1b-hb367 (9f47c3454) the BL-HB367 folder holds 78 out- files and 285 finding lines. Keeping only the new lists (surface-136 2, eng-all 3, five-words 2, plan-protocol 4, inc-S 2, ms-S 1, code-review, error-paths, security and ux 1 each) gives 18 files and 63 findings. So 78 to 18 and 285 to 63 are true.
- **Section 0 judge facts.** backlog-lane.mjs:78 reads the table through `--rule-lists` or DEFAULT_TABLE. check-lane-close.mjs:753 is the self-edit rule. :766-767 reads the table at the base with `git show`. :840-842 pins exempt, base_ref, finished_statuses and protected_paths, and takes every_task from the base table when the task owns the table. rule-lists.json is in `protected_paths` at rule-lists.json:22. :720-721 skips merges. :274-275 counts `Review round N:` lines. :502 is the refusal text still naming `-rN`. :692-712 is the FOLD-CHECK form check.

## rc#1 MED: the 3.4 note says the Spec 124 list stays on the lane-tools row, but it is attached to no row after the edit
Plan: 3.4: "Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137, doc-17 and the Spec 124 list stay on the lane-tools row only."
Evidence: `scripts/analysis/rule-lists.json:163` lane-tools `"lists": ["agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"]` has no policy-124-s2-s5. Before the edit only generated-reports (:170) and generated-127 (:176) carried it. In memory, no row of the after-table carries `policy-124-s2-s5`. This is why task-448's own output stage drops from 10 to 9 lists, as plan section 6 itself says. The note as written would be a false dated record in Spec 08.
Fix: In 3.4 change that sentence to "Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137 and doc-17 stay on the lane-tools row only; the Spec 124 list (policy-124-s2-s5) is attached to no row (the generated-reports and generated-127 rows lost it; Rule 13 stays enforced by gate J)."

## rc#2 LOW: the check-tasks figure is 103 now, not 102, and section 6 tells the lane to add a Files line that is already there
Plan: 0 and A6: "`check-tasks`: 102 resolve, 0 bad, before and after" and "102 resolve, 0 bad (re-measure at the work head)". Section 6: "The Files line to add to the task description before plan-prep".
Evidence: In-memory `checkTasks` at daf3f7201 gives resolve 103, notYet 200, bad 0, before and after. The extra one is task-448 itself. The Files line is now in the task file (`git diff a75713110 HEAD` adds `Files: scripts/analysis/rule-lists.json, ...` after the description). Plan section 0 says the board was read at a75713110, and the head is now daf3f7201.
Fix: Change 102 to 103 in section 0 and A6, or make A6 say "0 bad, resolve count unchanged from the launch head". Mark section 6's "to add" as already done at daf3f7201. Optionally restate the board head.

## rc#3 LOW: the :356 phrase the 3.4 note says it supersedes is not quoted exactly
Plan: 3.4: the words "The specs-web-admin row keeps all five surface lists, so a task that edits a spec under docs/specs/02-web-admin/ is reviewed with that spec".
Evidence: 08_agents.md:356 reads "...so a task that edits a spec under `docs/specs/02-web-admin/` is reviewed with that spec", with backticks around the path. A character-for-character grep of the plan's quote on :356 gives 0 hits. The other two phrases (:229, :356 "five mobile lists") match.
Fix: Put the backticks around docs/specs/02-web-admin/ in the quoted words of 3.4. If the note text is wrapped in a code span, split the quote around the path.

## rc#4 NIT: the :2166 operator quote in notes and card is a prefix, but labelled verbatim
Plan: 3.4 and the card: `:2166 "Minimum and 1a. Let's add these small fixes to the cost review task."` (verbatim).
Evidence: MORNING-DECISIONS.md:2166 continues: `...to the cost review task. Is there anything else - small fix to be made?`. The plan's text is a true substring; the apostrophe is ASCII in both.
Fix: Either add "(the line goes on with the orchestrator's own question)" or quote through the end of the line.

## rc#5 NIT: the new planted assertion at table :361 is also true on the old table, so it is not a red line
Plan: 4 "Designed red: every edited `not.toContain` and `toEqual` line... fail on the unchanged table".
Evidence: The new `:361 expect(planted, ...).toContain('surface-128')` holds on both tables, because the plant appends the four to a row that already holds them. In memory it was true on the before-table. It is a `toContain`, so it is outside the plan's literal list. The real red for N2 comes from :358 and :359, which do fail before. :72 and :146 are unchanged controls and are not red either.
Fix: Say in 4 that :361 is a survive-the-fix control, true before and after, and that N2's red comes from :358 and :359.

## rc#6 LOW (UNVERIFIED): "the FE-51 defect was also raised by 20 kept-list findings"
Plan: 0 known loss, task-367.
Evidence: I counted finding lines in the kept 18 outputs of BL-HB367 that match `fe[-. ]?51` loosely: 24, not 20. How the plan reached 20 (strict id match, or a narrower file set) cannot be told from the plan. The conclusion that a fix would still be forced survives. I did not check task-442's "stale next: field" finding (out-compliance-orchestrator-doc17#2 on branch wf1/inc1b-fedb442) or the "other three wording defects" claim, so those are UNVERIFIED.
Fix: Give the count method, or say "about 20".

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 1 MED, 3 LOW, 2 NIT); every table line, anchor, number and test line re-measures true on daf3f7201, and the one real defect is the false Spec 124 sentence in the 3.4 note.
