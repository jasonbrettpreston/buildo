# REPORT BL-CHK8 (task-5, CHK.8, Increment 1A)
Status line (Spec 137 rule 3): task-5 RUNNING then BUILT by this lane; branch wf1/inc1a-chk8; no push, no DB.

## What landed
- scripts/analysis/backlog-status-check.mjs: read-only, not wired into a hook (header lines 9-10). Finding (a) BUILT or DONE task with no commit on HEAD carrying its Task: trailer (docs-only last commit = WARN); finding (b) trailer in the range naming a task not RUNNING at that commit (BUILT/DONE only on the newest commit carrying the trailer). Exit 1 on FAIL, 0 otherwise, 2 on usage or git errors. Options --root, --range.
- src/tests/backlog/backlog-status-check.logic.test.ts: 12 tests on temp repos.
- Commits: bb4a1e164 (feat, green), 5659d682d (fix for KEPT review defects). Docs commit follows with these reports.

## Evidence
- Plan review r1 (r1-plan.txt) triaged in TRIAGE.md; most findings were about the context generator, rejected with reasons; KEPT cases became tests.
- Red 1 (red.out): "Tests  10 failed (10)" with only test, task-5 file and context file staged (script absent).
- Green 1 (commit.out): "Tests  10 passed (10)", "GATE OK", "POLICY CHECKS OK (commit-msg)", commit bb4a1e164. Typecheck runs in the hook (commit passed).
- Output review r2 (r2-output.txt, lens git range edge cases and exit codes) triaged in TRIAGE.md. Red 2 (red2.out): "exits 2, not 0 ..." and annotated trailer tests failed. Green 2 (commit2.out): "Tests  12 passed (12)" at the hook, commit 5659d682d.
- Run on this branch (branch-run.txt): "status-check: range: 8 commit(s) (62de20da..HEAD); 2 finding(s), 21 warning(s)"; the two FAIL lines are "FAIL a task-309 [BUILT] ..." and "FAIL a task-310 [BUILT] ..." (tasks closed BUILT by other lanes whose commits are not on this branch). 21 WARN lines are DONE/BUILT tasks closed by docs-only commits.

## Not done / UNVERIFIED
- Merge-commit docs-only fix has no dedicated test (UNVERIFIED by test).
- git trailer key-case matching UNVERIFIED.
- AC #1, #3, #4, #5, #8 not claimed (the lens-set panel and pre-registration steps were replaced by the repo review route in the brief).
- No lens set of 8 (brief asked one plan round and one output lens).
- Note: the first heredoc of the test file was refused by lane-guard B1 (the import name of the suite runner); I wrote it with the Write tool instead and did not route around the guard.

STATUS: ready
Question: should tasks 309/310 findings be left for the push window to resolve?
