# Seat: regression: task-453 plan (PLAN-453-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 9a10561ef (wf2/board). Read: the whole task-453 file; docs/reports/reviews/task-453/FINDINGS-PLAN.md (not repeated here); MD 1853-1981, 2140-2190, 2262-2345; scripts/hooks/check-lane-close.mjs (:133-150, :355-380, :432-458, :480-530, :625-690, :700-850); rule-lists.mjs :645-660; backlog-lane.mjs :175-190; backlog-brief.mjs :170-190; review-template.js :135-141; tests in src/tests/backlog/ (rule-lists-table, rule-lists.logic, backlog-lane, check-lane-close). Read-only git and node only. I made one slip: a `>` redirect wrote a small scratch file under $TMPDIR. It is outside the repo and I did not delete it. UNVERIFIED: whether the test harness can build a MERGE_HEAD scenario.

## Checked and clean
- S3 against real history: of the last 40 merges, 36 task-file status moves to BUILT/DONE (the folds of 448, 367, 442, 439, 441, 446, 424, 440, 445, 430, 431, 438, 444, 437, 436 and others) were checked with `git rev-parse <merge>:<f>` against `<merge>^2:<f>`. All 36 staged blobs equal MERGE_HEAD's. The "skip only when the blob equals MERGE_HEAD" rule would let every real fold through. None would be refused. A fold where the board edited the same task file after the lane branched is the one case that would now be refused. It has not happened yet.
- S2 only matters when a task move is staged (`if (moves.length === 0) return 0` comes first at check-lane-close.mjs:~752). No real lane branch lacks the table: the table was added 2026-11-20 in cb026342c.
- S5 anchoring: 3379 grounder verdict lines in docs/reports/lanes/*/GROUNDER.md. 1367 carry a severity word in the first 40 characters, and 1351 of those have it at the start. 16 would read differently (CRITICAL, stricter). Those are closed lanes and are not re-checked.
- S1 and S4: seat findings are already ruled with a quoted verdict line in practice (task-448 GROUNDER-PLAN.md:89-94 `in#1 CONFIRMED <file>:94 "..."`). Ids like `in#1` and `rc#1` match the SEAT_LINE regex. No existing seat id uses a hyphen or dot.
- The rule-lists.logic.test.ts:391-392 rewrite (plant plan-protocol instead of five-words) still locks verifyResolved. :346-347 and :377 keep real locks.
- The :684/:686 stub rename is only a sample id. The name test at rule-lists-table :372 stays green.
- The T7 bug is real: docs/reports/reviews/task-448/ holds context-r1.md and context-r3.md, so the count+1 rule gives 3 and clobbers r3 (review-template.js:138).
- No unlanded branch touches these files. wf1/inc1b-gates (11 ahead) and wf1/inc1b-mfrules (4 ahead) do not. wf1/inc1b-gate375 and wf1/inc1b-lenses are 0 ahead. No waiting task names backlog-lib.mjs on its Files line.
- RR-0450 (MD:2325-2326) supports Item 3: "the queue rules (Spec 137 list) and the orchestrator note are not reviewed against code". It is ruled.

## rg#1 HIGH: the fix-task plan-stage list change turns red two pinned prep tests the plan does not list
Plan: section 3 Item 1 (":654 plan-prep: a fix task also gets the output_off lists at the plan stage") and section 5 backlog-lane tests (only :684/:686, D4, D16 and the brief ids).
Evidence: src/tests/backlog/backlog-lane.logic.test.ts:739-745 `it('16: a fix task writes the plan lens outputs and no per-list inputs'` asserts `names(f, /^in-/)).toEqual([])` and plan files `['plan-error-paths.txt','plan-plan-review-deepseek.txt']`. :747-752 (B2, task-445) pins the exact plan file list again. prepFixture copies the real table, so after the change a fix task also writes in-plan-compliance-plan-protocol and plan-compliance-plan-protocol, and both tests fail. The old behaviour is written at rule-lists.mjs:654 (`a fix task needs the plan lens outputs only (check-lane-close.mjs:604)`) and Spec 08 §7 rule 1, 08_agents.md:342 (`WF3 runs a LEAN plan roster`).
Fix: list tests 16 and B2 in section 5 as rewritten, naming the new expected files. Say the change reverses "fix = lens outputs only, no per-list input". Cite RR-0440/0452 for it, or confirm the operator meant a plan-stage list for fix tasks. RR-0450 says "switches or text changes only", and this is new gate behaviour.

## rg#2 MED: waiting fix cards would be judged differently, and the plan does not say which or in what order
Plan: section 6, last bullet ("A fix card launched before this lands without it is refused at launch only").
Evidence: type: fix and LATER are task-449, 450, 451, 454, 455 and 456 (checked with grep on backlog/tasks). 449 and 450 already hold finished plan evidence with no plan-compliance file: docs/reports/reviews/task-449 has plan-error-paths, plan-plan-review-deepseek, plan-security, plan-ux, GROUNDER-PLAN.md and TRIAGE-PLAN.md. RR-0448 (MD:2334) says the first three cards (449, 450, 453) start together. After 453 folds, 449 and 450 would be refused at launch (check-lane-close.mjs:653-658 plus the new branch) until a plan-compliance-plan-protocol round exists. If the plan text was folded since context-r1, that means a new context round as well.
Fix: add to section 4 or 6 the order "449 and 450 launch before 453 is folded, or each gets one plan-protocol plan call", and list the six cards.

## rg#3 MED: the rule text is not updated where it lives
Plan: section 7 (rule 4 note "five-words is off and plan-protocol is plan-stage only"; lane-tools and backlog-lib only as a note on task-448's task file).
Evidence: 08_agents.md:357 (task-448 note, RR-0421/0426) says "the four every-task lists" and "Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137 and doc-17 stay on the lane-tools row only". After this card both statements are false, and that sentence stays in the spec. Line 342 (lean WF3 plan roster) is also contradicted (rg#1). rule-lists.json:7 `$comment` ("every_task ... the five words") is not on the plan's text-edit list.
Fix: the one short rule 4 note must also say: queue-137 and doc-17 are off lane-tools (RR-0450) and fix tasks now get a plan-stage plan-protocol (RR-0452). Add rule-lists.json:7 to the text edits. Putting these on task-448's file alone does not change the spec sentence.

## rg#4 MED: S9 would refuse a board archiving commit
Plan: Item 5 S9 (":735: accept backlog/(archive/)?tasks/task-\d+...").
Evidence: check-lane-close.mjs (moves loop, ~:736-745): `const was = git(['show', `HEAD:${f}`]); ... if (was.status === 0 && ...same status) continue;` A file at a path that is not in HEAD counts as a move. Moving a DONE or MERGED task into backlog/archive/tasks/ is a new path with a finished status, so it counts as a "close" and needs a lane report and a grounder. There is no archive dir yet (0 files), and RR-0447 (MD:2332) kept archiving as an option ("options to archive, close or label").
Fix: in S9, skip an archive path whose task id already holds the same finished status at HEAD under backlog/tasks/, and add that case to the S9 test.

## rg#5 MED: the F10 pin for output_off is an open choice and has no test
Plan: section 3 Item 1 (":842 pin output_off") and section 8 item 3 ("yes or no"); section 5 lists no pin test.
Evidence: check-lane-close.mjs:~842 `ownsTable ? { ...table, ...pin, every_task: baseTable.every_task }`. A lane whose Files line names the table is judged by its own branch table. Without the pin it can write `output_off` and switch off lists for its own review. The existing guard for every_task is the test at check-lane-close.logic.test.ts:531 ("F10 PLANTED DEFECT: a lane that trims every_task in its own table ... is still held to the range base").
Fix: make the pin decided (yes) and add a section 5 test copying :531 for output_off.

## rg#6 LOW: the card's Description and AC no longer match Option A
Plan: section 3 Item 2 (every_task drops five-words, off at both stages), section 7 (only an RR-0452 note is appended).
Evidence: the card Description says "plan reviews keep them (RR-0440, RR-0444)" and "off for plan reviews too would remove a lock made to fail closed". AC #2 says "Emptying the output_off line turns the lists back on". Under A, five-words is not in output_off, so emptying it brings back only plan-protocol. RR-0440 (MD:2266) left the plan-versus-output scope as a question for the plan. RR-0450 says "I agree with the five principles and plan protocols - already on the card", and the card meant output only.
Fix: record in the RR-0452 note that it takes five-words off at both stages (on the operator's "five principles off", MD:2339), and word AC #2 as plan-protocol only.

## rg#7 LOW: Item 3 weakens the task-448 lane-tools lock
Plan: section 3 Item 3 (":372 stays green"; new equality test).
Evidence: rule-lists-table.logic.test.ts:372 `if (r.id !== 'lane-tools') for (const l of ['queue-137', 'agents-s5-1to3', 'agents-s7-s11', 'orchestrator-doc17'])`. The title at :368 says "only the lane-tools row attaches the queue...". After the change queue-137 and doc-17 are still allowed on lane-tools by this loop, so only the new equality test catches a re-add. The reading that "code" includes lane-tools is the orchestrator's (MD:2327), and MD:1853 (RR-0378 era, "except for infastructure rules (spec 08 and the Mclane)") says the opposite.
Fix: drop the lane-tools carve-out for queue-137 and orchestrator-doc17 at :372, fix the :368 title, and add "confirm lane-tools" as section 8 choice 7.

## rg#8 LOW: S11 and the brief wording are outside the card's folded set
Plan: section 5 `S11` (tighten :656 and :367/:376/:380/:384-385); Item 6 T1.
Evidence: the card's "Findings folded" line omits S6-S8, S10 and S11 (GROUNDER-D.md:106 confirms S11 LOW). The T1 text cites `137_mcqueue.md:84`, but Rule 3 is at :98 now (:84 is a table row). backlog/config.yml:25 puts the old "same commit as the work" line in every task's Definition of Done. The brief will say one thing and the task's DoD checklist another.
Fix: either name S11 on the card or drop it. In T1, cite :98 and add a line to the 137 Rule 3 note about config.yml, or mark the DoD line as a known mismatch.

## rg#9 NIT: test titles the plan does not touch go false
Plan: Item 2 test list ("drop the id").
Evidence: rule-lists-table.logic.test.ts:29-30, :36-37, :243 titles say "the four every-task lists only (task-448, RR-0421 items 1 a and 4 a)", and `const four = [...]`. After the edit they hold three. rule-lists.logic.test.ts:344 title says "every_task = five-words ... and plan-protocol".
Fix: add the titles and the `four` name to the Item 2 edit list.

STATUS: 9 findings (1 HIGH, 4 MED, 3 LOW, 1 NIT); the lists switch-off breaks two fix-prep tests and changes launch for six waiting fix cards, and rule text at 08_agents.md:342/:357 and the table-owner pin need recording; the S3 merge change itself is safe on all 36 real fold merges.
