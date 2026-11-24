# REPORT: BL-SFX6 (task-461, SEARCHFIX.2b)

Status line (Spec 137 rule 3): BL-SFX6 lane · task-461 BUILT; round 1 grounded (Cairn-Ground-O461), records-only close; DONE owed to the orchestrator.

## What landed
- acc1affa0 test(100_mobile_parcel_cost_tool): mobile/__tests__/lotForm.test.ts (2+/2-), built per PLAN-461-v1 (8.1 A, 8.2 B). The extra-field line moved from the "refuses a block outside the contract" case to the "parses ..." case as toBe(true) (comment "task-450 L1 (GROUNDER-B D1): plain, a server-added field still parses"); case retitled "... with null and with a server-added field"; the two closed-enum refusals stay; schemas.ts untouched. Hooks: typecheck, lint, GATE OK, POLICY CHECKS OK; related-test run skipped (no src/ or scripts/ staged).
- 18c760bb5 docs(08_agents): round 1 lens inputs and outputs, TASK, FINDINGS.md, context-r3.md (records only).
- Closing commit: GROUNDER.md and TRIAGE.md (byte copies of the grounder hand-back, sha256 9585ec1b413c and 17bd62aab2b2), this REPORT.md, the task file at BUILT.

## Evidence
- Red (lane dir red.out): npx jest __tests__/lotForm.test.ts __tests__/schemas.test.ts --ci --coverage=false from mobile/: 1 of 40 failing at lotForm.test.ts:71:115 (expected false, received true).
- Green (lane dir green.out): same command, 2 suites, 40 of 40 tests.
- AC2 by grep (lane and grounder): git grep 'strict()' -- mobile/__tests__ finds no lot-form line; the schema name hits only lotForm.test.ts, schemas.test.ts:326, :335 and useParcelLookup.test.ts:23, :163, :200, all plain or valid payloads.
- Orchestrator's run (not the lane's): full local phone run from this worktree at 18c760bb5 with the shared phone packages completed: 58 of 58 suites, 866 of 866 tests (~/Buildo-scratch/lanes-20261124/phone-linked-sfx6-18c760bb5.out); phone typecheck exits 0.

## Review round 1
11 lens outputs, 23 findings; grounder Cairn-Ground-O461: 2 CONFIRMED (both LOW, piled: mobile-98#1 full run owed, mobile-99#1 task-450 note owed), 21 REJECTED, 0 CONFLICT. No CRITICAL, HIGH or MED stands: no fix round. Outcomes check: node scripts/hooks/check-lane-close.mjs --outcomes -> "checked 2 ids".

## Deviations and process note
- Plan section 7 task-450 note: refused by check-task-files (outside the Files line); restored; owed to the orchestrator.
- Queue row: none owed (grounder Q2, Spec 137 rule 2: the Backlog file is the row).
- Process note: the merge-before-lens step was not done. The board was not merged before the lens run or the close; the grounder found merge-tree clean and no cited path moved, so the lens inputs stay bound to this diff; the orchestrator folds at the push.

## Owed for DONE (orchestrator)
(a) full local phone run after the fold, before the push, in the gate worktree (RR-0460); (b) Mobile CI run after the push; (c) dated task-450 note through backlog task edit 450 --append-notes (sha acc1affa0).

STATUS: ready
