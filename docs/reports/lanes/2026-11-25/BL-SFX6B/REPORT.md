# BL-SFX6B · task-454 SEARCHFIX.6 · stage 1 report

STATUS: RUNNING, grounder owed. Output review round 1 is done and the lane rules none of its own findings. No database connection of any kind. Nothing pushed.

## What landed (branch wf2/sfx6b, worktree /Users/brettpreston_macmini/Buildo-wt-sfx6b; launch commit 1faff1554)
- 42b4b7932 fix(100_mobile_parcel_cost_tool): the work, 73 files. The pre-commit related run passed: "Test Files 13 passed | 2 skipped (15) Tests 474 passed | 14 skipped (488)". It also printed GATE OK and POLICY CHECKS OK. Trailers: Task: task-454, McFrontend-Task: MF-35.
- e8043789e docs(137_mcqueue): the task-372 dated note (D3, K3), in a commit of its own.
- a6315e3d8 fix(100_mobile_parcel_cost_tool): the station fix, which rewords the consumer clause of four seed descriptions (plan grounder ruling pg-ruling3).
- Push station: FAIL on e8043789e, with one assertion of 28,379 failing (step-conformance §1.2a P4). PASS on a6315e3d8 (~/Buildo-scratch/push-station/pass/a6315e3d82cc688ec09df5f9b20af161919364be.pass): 28,379 passed, 0 failed; the phone tests and both typechecks returned 0.
- Plan: PLAN-454-v1 Steps 1-7. There were two Files-line additions (rule-lists-by-kind.md and 127-surface-review-queue.md; plan grounder ruling pg-ruling2), made through the backlog CLI. The deviations, all ruled compliant, are in the task's Implementation Notes.

## Acceptance criteria (each test written first; red.out shows 35 refused before any code)
1. The six limits are seed rows with bounds, the code reads them, and a test fails when the code types a number:
   - The rows are in scripts/seeds/logic_variables.json and are read by readSearchSettings and through sliceNumber.
   - C-10 pins the seed rows and the slices.
   - The non-default row tests are in the gate test (7, 8, 50, 12), the entitlement test (9), the resolution test (cap 4) and the store test (recent_max 2).
   - The named-form scan carries a RED plant.
2. A setting of 0 that the schema allows is emitted: ENTRY_FROM in emit-mobile-surfaces.mjs; the C-10 L4 test checks the emitted slice config with debounce_ms 0 and no bounds.
3. The entitlement route logs success with uid and duration: parcels-entitlement.infra.test.ts expects logInfo('[api/parcel-entitlement]', 'parcel entitlement', {uid, duration_ms}).
4. The 500 bodies contain no database text: the gate and entitlement tests assert it. The red proof is red-x3-plant.out (the plant was reverted).

## Output review round 1 (the code-review lens only; no compliance lens: every list is output_off)
- The lens ran once on the whole change, 1faff1554..a6315e3d8, which lens-input split at file boundaries into 4 parts: in-out-code-review-p1..p4.txt and out-code-review-p1..p4.txt.
- Context: docs/reports/reviews/task-454/context-r3.md (written by backlog-brief.mjs before the round).
- FINDINGS.md lists 17 lines. As the lens rated them: 1 MED (p2#1), 11 LOW, 4 NIT, and p1#1, which rates nothing ("none applicable, this chunk is documentation only").
- Ruled: none. A separate grounder is owed (GROUNDER.md in this folder).

## Evidence (this folder)
- red.out: the tests-only red attempt.
- red-x3-plant.out: the no-database-text plant.
- restamp-fingerprint-only.txt: 23 golden files, all fingerprint-only.
- green.out: the landed work commit.
- green-attempt2.out and green-attempt3.out: the two refused attempts.
- commit-372.out: the task-372 note commit.
- fix-commit.out: the station fix commit. Its related run was skipped because only JSON and docs were staged; the station passed it.
- files-line.diff: the Files-line change made through the CLI.

## Not verified
- The db tests under src/tests/db: they are not run in a lane, and the station suite excludes them.
- Stages (ii) to (iv), which are not this lane's: the test-stack rehearsal, the dev apply on the operator's typed GO, and the push. The push is held until the rows are on dev (RR-0475 item 2).

STATUS: RUNNING, grounder owed
