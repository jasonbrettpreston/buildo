1. A build or fix launch is now refused unless its plan was checked: evidence folder, one plan compliance output per rule list over the committed context, a separate grounder's GROUNDER-PLAN.md, the integration and reality-check seat reports (and regression when the Files line names a tracked path), an outcome for every confirmed plan finding, the round block and references on the task, and the Plan hash line; one refusal line per missing item, nothing taken (A9: 11 errors before evidence, "plan gate ok: 9 lists, 2 findings" with it, a new expected Plan line after a one-word edit).
2. Acceptance printed: A0 both headings present; A1 dry-run 0 hits of the placeholder in the context slot (6 hits inside the diff text, which quotes the string), 1 hit of "yes to all", the five heading lines present once each, 24,823 characters; A2 task-381 17 calls (expected 17), task-410 11, task-267 21, none refused; A3 surface-135, policy-124-s2-s5 and bylaw-133 exit 0 with 3 parts each; A4 and A4b: printed command for task-101 (6 entries = 6 lists), after running it check-tasks printed nothing for it; A5 to A7 green in the commits; A8 OPEN (no DB); A9 as in line 1.
3. Not built as the plan says: D10b's DB read (the runner still uses the typed 120000 ms; no variable is registered, no migration, no id claim); the D4 counts are not recomputed when the grounder file holds no confirmed finding (only the round line must exist).
4. Unverified: the full suite was not run; the "today exit 1" half of A3 on the old head; A9 and A4b ran on a scratch clone, not on this worktree; the plan-stage lens outputs the close requires in this lane directory (plan-<lens>.txt) are not yet written; the output review was made over context-r1.md, which was written before the last notes of this run.
5. Operator item: the DB GO for D10b after the MCINC-7 rehearsal (variable registration); a grounder (not this lane) must rule all 410 findings in GROUNDER.md; the task stays RUNNING, no closing commit.

STATUS: ready for the grounder (build and output review done; D10b open, task not complete).

## Branch head
wf1/inc1b-gate375 at b0cdae61a before this records commit.

## Commits (this lane, oldest first)
7b7d6f5f7 D11b; ef574eb02 A2; 777305125 A1 and A5 brief; 204da6718 A4 lens-input and A6; 958a25bf3 A4 close, A5, B2; d7077c2f8 A3; d3d363f9e README; db8172ddb B1; fe57628b1 D10b (function, DB read open); c9dd6f462 Files-line deviation and rule-lists-table tests; f598cc0ff D1-D3 planGateErrors; 55b8018da D5 launch gate wiring (the last commit of backlog-lane.mjs; rollback = git revert of it); 053e01179 D6; 574378f22 dated notes; b0cdae61a acceptance outputs. Red and green output files: red*.out and c*.out in ~/Buildo-scratch/lanes-20261119/inc1b/gate375/.

## Output review (rule-lists.mjs lens-input over the whole-range diff of 19 files, 170,582 bytes, context context-r1.md; each call: DOTENV_CONFIG_PATH form, scripts/deepseek-review.js review, the five --section flags)
Lens set for these Files: compliance once per list (14 lists), code-review, error-paths (no ux, no security: lensSet prints out [code-review, error-paths]). 80 calls, all exit 0, 80 of 80 with a REVIEW header and a VERDICT line.

| rule list or lens | output files | REVIEW header | VERDICT line |
| --- | --- | --- | --- |
| compliance agents-s5-1to3 | out-compliance-agents-s5-1to3-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance agents-s7-s11 | out-compliance-agents-s7-s11-p1.txt to -p6.txt (6 files) | yes 6 of 6 | yes 6 of 6 |
| compliance queue-137 | out-compliance-queue-137-p1.txt to -p6.txt (6 files) | yes 6 of 6 | yes 6 of 6 |
| compliance eng-all | out-compliance-eng-all-p1.txt to -p10.txt (10 files) | yes 10 of 10 | yes 10 of 10 |
| compliance orchestrator-doc17 | out-compliance-orchestrator-doc17-p1.txt to -p6.txt (6 files) | yes 6 of 6 | yes 6 of 6 |
| compliance step-132 | out-compliance-step-132-p1.txt to -p10.txt (10 files) | yes 10 of 10 | yes 10 of 10 |
| compliance airtight-124a | out-compliance-airtight-124a-p1.txt to -p10.txt (10 files) | yes 10 of 10 | yes 10 of 10 |
| compliance airtight-v3-122 | out-compliance-airtight-v3-122-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance airtight-v2-122 | out-compliance-airtight-v2-122-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance airtight-122a | out-compliance-airtight-122a-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance five-words | out-compliance-five-words-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance plan-protocol | out-compliance-plan-protocol-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| compliance inc-S | out-compliance-inc-S-p1.txt to -p5.txt (5 files) | yes 5 of 5 | yes 5 of 5 |
| compliance ms-S | out-compliance-ms-S-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| code-review | out-code-review-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |
| error-paths | out-error-paths-p1.txt to -p3.txt (3 files) | yes 3 of 3 | yes 3 of 3 |

Findings: 410 (BUG 144, DEFER 266), listed by id in FINDINGS.md, untriaged, no verdicts.

## What the plan got wrong or left unsaid (the six items)
1. D4's counts are not recomputed when the grounder file holds no CONFIRMED or CONFLICT finding: outcomeErrors skips its summary check at zero ids, so the gate only requires a "Plan review round" line to exist.
2. The planned round line starts "Plan review round", outcomeErrors expects "Review round": the summary check runs on a rewritten copy of the Plan field, and its error text is rewritten to "Implementation Plan field".
3. Test helpers had to live in docs/reports/reviews/task-375/ (the one folder always allowed off the Files line): fixture-context.md and plant-evidence.mjs.
4. The regression-seat signal in backlog-lane.mjs uses git ls-files in the board working tree, not the board HEAD tree.
5. The close and launch checks need a real committed context for every output, so every scenario() test of check-lane-close.logic.test.ts was changed.
6. Two red lines were typecheck refusals, not failing tests (B1, and the first part of D1 to D5); a third (D10b) too.
Also: the Files line omitted src/tests/backlog/rule-lists-table.logic.test.ts (recorded as a deviation note and fixed in c9dd6f462).

## Incident: three tracked files deleted and restored
After A0 and A2 I ran a cleanup (rm -rf of docs/reports/reviews/task-381, task-410 and task-267) meant for the context files the brief had just written. It also deleted three TRACKED files: docs/reports/reviews/task-267/context-2026-11-19.md, docs/reports/reviews/task-410/context-2026-11-20.md and docs/reports/reviews/task-410/pasted-2026-11-20.md. Nothing was staged or committed with the deletion (git status showed them as unstaged " D"). Restored with, for each path P: mkdir -p $(dirname P); git show HEAD:P > P. Proof they equal HEAD: git diff --quiet HEAD -- P reports "same" for all three, and sha256 prefixes are equal to the HEAD blobs (fb38b1ab608ed4b0, 12ef4f399a94c6ed, 17c8ac478d1e72ba). A later cleanup of docs/reports/reviews/task-381/context-r1.md removed only that one untracked file.

## Denied or not run
A1 on the first attempt was run without the dotenv form and failed for want of the key (no data lost); the sanctioned DOTENV_CONFIG_PATH form was denied once by the permission classifier on the third run and allowed on this run. An rm of the lane-dir *.err files was refused by the safety check and re-run as rm -f "${LD:?}"/*.err. A9 and A4b on a scratch clone (removed). Not run: A8 (DB), the full suite, plan-stage lens outputs, GROUNDER.md, TRIAGE.md.
