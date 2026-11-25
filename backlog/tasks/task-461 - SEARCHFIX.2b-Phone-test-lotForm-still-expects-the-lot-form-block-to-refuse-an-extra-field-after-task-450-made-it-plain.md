---
id: TASK-461
title: >-
  SEARCHFIX.2b Phone test lotForm still expects the lot-form block to refuse an
  extra field after task-450 made it plain
status: BUILT
assignee:
  - '@lane-BL-SFX6'
created_date: '2026-11-24T18:11:00Z'
updated_date: '2026-11-25T18:00:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-461/GROUNDER-PLAN.md
  - docs/reports/reviews/task-461/TRIAGE-PLAN.md
  - docs/reports/reviews/task-461/seat-integration-1.md
  - docs/reports/reviews/task-461/seat-reality-check-1.md
  - docs/reports/reviews/task-461/seat-regression-1.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:eng-front docs/specs/00_engineering_standards.md
  - compliance:eng-shared docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-24/BL-SFX6/REPORT.md
  - docs/reports/lanes/2026-11-24/BL-SFX6/GROUNDER.md
  - docs/reports/lanes/2026-11-24/BL-SFX6/TRIAGE.md
type: fix
ordinal: 155210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-11-24 by a local run of the phone tests on the board head 5af0f7be2 (output ~/Buildo-scratch/lanes-20261124/phone-5af0f7be2.out): mobile/__tests__/lotForm.test.ts:71 fails (expected false, received true). Cause by reading: task-450 (ee3634771) made ParcelLotFormSchema plain on purpose (mobile/src/lib/schemas.ts:423-425, dated note: prior text kept, the object ended in .strict()), and this older test line still expects an extra field to be refused. Task-450's lane could not run the phone tests. The fix follows task-450's ruled plan (GROUNDER-B D1): the test line states the plain form; the schema is not changed back. Orchestrator's reading, to be checked by the planner and grounder.

Files: mobile/__tests__/lotForm.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The phone test file lotForm passes in a local phone test run and states that an extra field in the lot-form block still parses
- [x] #2 No other phone test asserts the old strict form of the lot-form block
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-461
Plan id: PLAN-461-v1

Board head read: 492ef72c7 (wf2/board). `git diff --stat 5af0f7be2 HEAD -- mobile/` is empty, so the failure in phone-5af0f7be2.out still applies at this head. Line numbers below were read at 492ef72c7. The plan grounder re-read the mobile/ lines at 66ea5bb89 (no mobile/ change since 492ef72c7). Two cites into docs/ are corrected below: 08_agents.md :462 is now :496, and 137_mcqueue.md :84 is now :98.

## 1. Rule quoted first
- task-450 card, AC3 (backlog/tasks/task-450 ...md:59): "A lot form with one extra field parses; the closed enum lists stay".
- FOLD-PLAN (docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md:47): "(L1) A lot form with one extra field parses. Delete `.strict()` at schemas.ts:428. The closed enum lists stay as they are".
- GROUNDER-B D1 (docs/reports/reviews/mcfixreborn-g3/GROUNDER-B.md:86): "Fix: delete `.strict()` at schemas.ts:428 (closed enums are a design call, see LOW). ... Size: one line plus a lenient-parse case in the schema test." The same line also says "The server schema is also strict (types.ts:135-141), so it is a latent trap for the next additive change, not a live failure today." That is why the server block is not this card's work (see section 6).
- task-450 plan grounder (docs/reports/reviews/task-450/GROUNDER-PLAN.md:20, plan-error-paths#6): "every sibling schema in the file is already a plain object that strips unknown keys ... and AC3 keeps the enums closed."
- Schema dated note (mobile/src/lib/schemas.ts:423-424): "Dated 2026-11-24 (task-450 SEARCHFIX.2, L1; GROUNDER-B D1; prior text kept: the object ended in .strict()): plain, the MF-53 form above, so a server-added field never raises ParcelLookupSchemaError on an installed build. The closed enum lists stay."
- Contract (scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:70-71): "answer": "additive_only"; "adding fields does not" break shipped clients.
- Changing a test assertion counts as a ruling (.cursor/MCBYLAWS-QUEUE.md:107): "Changing a test assertion, a floor, an oracle case or a worked example is a ruling." The ruling for this change is the chain above: AC3, FOLD :47 and D1.
- Both directions (docs/specs/00-architecture/08_agents.md:496): "Every lock is proven in BOTH directions". No new mechanism (RR-0392, MORNING-DECISIONS.md:1975): "I don't think we need any other infastrcuture beyond this".

**Answer to question (1): fix the test line, not the schema.** task-450's ruled plan made the lot-form block plain on purpose: the card's AC3, FOLD :47, D1, and the schema's own dated note, landed in ee3634771 ("schemas.ts: the lot form is plain, not .strict(); the enums stay (L1)").

task-450's records never name lotForm.test.ts. A grep for "lotForm.test" across docs/reports/reviews/task-450/, the task-450 card, FOLD-PLAN.md and g3/GROUNDER-B.md finds nothing. task-450 put its lenient-parse lock in mobile/__tests__/schemas.test.ts:322-341, and its own close-out note says the mobile tests were "NOT PROVEN BY THE COMMIT HOOK" (task-450 card :314). So this line was missed, not kept on purpose. The plain form is: an extra field in the lot-form block still parses, and the closed enums still refuse unknown values.

## 2. What already exists and is reused
- mobile/__tests__/lotForm.test.ts:18-19 already has the `base` and `form(unsure, detected)` fixtures. The new assertion reuses them.
- mobile/__tests__/lotForm.test.ts:63-67 is the case "parses a payload with the block, without it (older server) and with null". The plain-form assertion goes here.
- mobile/__tests__/lotForm.test.ts:69-70 keep the closed-enum refusals ('maybe', 'x'). They are unchanged.
- mobile/__tests__/schemas.test.ts:324-341 is task-450's lock: an extra field parses at :329 and through the lookup result at :333-335; an unknown enum value throws at :339. It is not touched.
- mobile/src/lib/schemas.ts:425-429 (plain ParcelLotFormSchema) and :440 (`lotForm: ParcelLotFormSchema.nullable().optional()`) are not touched.

## 3. The change (one file, on the Files line)
mobile/__tests__/lotForm.test.ts. Nothing outside the Files line.
- Where: :71 inside the case `it('refuses a block outside the contract')` (:68-72), and the case at :63-67.
- Old behaviour: :71 expects `ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: { ...form(true), extra: 1 } }).success` to be `false`. It is red at this head (expected false, received true; phone-5af0f7be2.out, lotForm.test.ts:71:115).
- New behaviour: the same payload is expected to parse (`toBe(true)`).
- Smallest edit:
  - (a) Delete line :71 from the "refuses" case. That case keeps its title, which stays true: the enum refusals at :69-70 remain.
  - (b) Add one line to the "parses ..." case at :63-67: `expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: { ...form(true), extra: 1 } }).success).toBe(true);`
  - (c) Add a short trailing comment on that line: `// task-450 L1 (GROUNDER-B D1): plain, a server-added field still parses`. Retitle the case 'parses a payload with the block, without it (older server), with null and with a server-added field' (ruled 8.1 A). The "refuses ..." title stays: the enum refusals at :69-70 remain.
- Net change: one line moved and flipped, plus one comment. No new file, helper, fixture or setting.

## 4. Tests first: red, then green
- Red at the head, already proven: lotForm.test.ts › "the mobile mirror of the lookup block" › "refuses a block outside the contract". The input is a lotForm with semi_half, doubt_multi_parcel_abut, unsure true and extra 1. It expects false and receives true (phone-5af0f7be2.out lines 81-97 and 305+). The lane re-runs this one file before the edit and keeps the output as the red record for DoD #2.
- Green after the edit: "parses a payload with the block, without it (older server) and with null", same input, expects true. The "refuses ..." case keeps the 'maybe' and 'x' inputs, expecting false.
- Mapping to the card:
  - AC1 (passes in a local phone run and states that an extra field still parses) is met by the moved line.
  - AC2 (no other phone test asserts the strict form) is met by the search in section 5.
  - Fold section 2 line :47 (L1) is met, because the phone suite now agrees with the schema.
- The other direction (08_agents.md:496): the moved line goes red if `.strict()` is ever put back at schemas.ts:429. schemas.test.ts:329 locks the same thing. The lane does not prove this live: Option A is struck (ruled 8.2 B), so no file but lotForm.test.ts is edited, even for a moment.
- How the lane proves green: lotForm.test.ts imports only `@/lib/schemas` and `@/lib/lotForm`, which need neither missing package. In the 5af0f7be2 run it started and ran; only :71 failed. The 12 suites that could not start fail on '@testing-library/react-native' (11) and 'tailwind-merge' (1, reportScreens.golden). They are not this card.
  - Command, from mobile/: `npx jest __tests__/lotForm.test.ts __tests__/schemas.test.ts --ci --coverage=false`. The package script test:ci (mobile/package.json:11) adds --coverage, which writes mobile/coverage, and that folder is not ignored (.gitignore:12 is the root /coverage only); the lane stages no coverage folder. Expected: two suites pass.
  - schemas.test.ts runs in the same command to show task-450's lock is still green. It is not edited.
  - mobile/node_modules is a symlink to the main checkout (~/Buildo/mobile/node_modules), which is why the run resolves from ../../Buildo. Nothing is installed.
  - Record both outputs in the lane folder ~/Buildo-scratch/lanes-20261124/ as red and green evidence. The full run on a checkout with the packages (phone-full-0ab1aed72.out) is 1 failed suite (lotForm.test.ts:71), 57 passed, 866 tests; after the edit it should be 0 failed, 866 tests. That green is the runnable part only on this worktree: its symlinked node_modules still cannot start the 12 suites, so the two-file command is its proof (the section 5 search is by reading, so it covers them). Proof for this phone test is RR-0460 (MORNING-DECISIONS.md:2382): a full local run before the push, then the Mobile CI run after it.

## 5. Search for any other strict assertion (question 2)
- mobile/__tests__: `git grep` for lotForm|lot_form|LotFormSchema finds only lotForm.test.ts:71, which is this card, and schemas.test.ts:327-339, which already asserts the plain form. No other phone test asserts strict. A second `git grep -n ConsumerParcelLookupResultSchema -- mobile/__tests__/` (the schema parsed at :71) finds lotForm.test.ts, schemas.test.ts and useParcelLookup.test.ts:163 and :200; the last two parse valid payloads and expect true. `git grep -n 'strict()' -- mobile/__tests__` finds no lot-form line (only trackedLots.test.ts:192, another schema). The grep reads all 58 files, the 12 that cannot start included. phone-full-0ab1aed72.out shows no other red.
- src/tests: src/tests/parcel-lot-form.logic.test.ts:145-148 is the case "the block is strict and closed". It asserts the SERVER schema ConsumerLotFormSchema (src/app/api/parcels/lookup/types.ts:135-141, `.strict()` at :141), which shapes what the server sends. It is not the phone mirror. D1 names it as a latent trap and gives no fix. No web code parses the phone mirror: `git grep ParcelLotFormSchema` hits mobile/src/lib/schemas.ts only.
- Descriptors and contract notes:
  - contract_parcels_lookup.descriptor.json:171 lists lotForm, detected, basis and unsure as whitelist names; :70 says additive_only. No strict claim for the lot form.
  - The ".strict() at every level" sentence at :6 is about `page` on the server.
  - mobile_parcel_semi_question.descriptor.json:182 and census/mobile-product.json:7300 cite lotForm.test.ts for the "ask only when unsure" rule, which stays true.
  - docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:104 says "strict O-4", which is the detector rule, not the schema.
- Result: AC2 holds once :71 is moved. Nothing else changes.

## 6. Limits, and what could fail or surprise
- Not done:
  - No change to mobile/src/lib/schemas.ts.
  - No change to the server ConsumerLotFormSchema or to parcel-lot-form.logic.test.ts.
  - No package install, and no work on the 12 suites that cannot start.
  - No change to schemas.test.ts.
  - No full phone run is claimed green.
- Surprise 1: the commit hook may not run mobile tests. task-450 :314 says "the mobile jest tests ... are not reached by the pre-commit related run". So the hook passing is not the green proof. The local single-file run is, and it is owed again at the push station (CLAUDE.md:32, "Never declare a task done until `npm run test` passes").
- Surprise 2: the moved line duplicates schemas.test.ts:333-335. That is acceptable because the card asks this file to state the plain form (AC1). Deleting the line instead would not meet AC1.
- Surprise 3: the server's strict block and the phone's plain block now disagree on purpose. If a future card adds a field on the server, the server test at :147 goes red first. That is the intended guard and is not this card.
- Surprise 4: the lint rule on line length. The test file already carries lines this long (:69-71), so lint drift is unlikely. The hooks would catch it.

## 7. Notes owed (backlog CLI only, never a hand edit)
- task-461: notes with the red and green outputs, the commit sha and the hook result (DoD #7), and the status line in the same commit as the work (DoD #6). Use `node_modules/.bin/backlog task edit 461 --append-notes "..."`, plus the card's AC checks through the same CLI.
- task-450: a dated note recording that lotForm.test.ts:71 still asserted the strict form after ee3634771 and was moved and flipped by task-461 (sha). Use `backlog task edit 450 --append-notes`.
- The queue row in the board file named by Spec 137 (:98) is updated in the same commit, the way the board's other close-outs are.
- No operator ruling is needed: the ruling is AC3, FOLD :47 and D1, quoted above.
- Principles served (DoD #9): accurate (the test agrees with the ruled schema) and understandable (one statement of the plain form).

## 8. Open choices (all three ruled by the plan grounder, QUESTIONS-RULED.md)
- 8.1 Placement.
  - A: move the line into the "parses ..." case at :63-67 as true.
  - B: flip it in place at :71 and retitle the case to "refuses a block outside the closed enums; an extra field parses".
  - The rules: AC1 asks the file to "state" the plain form, and MCBYLAWS-QUEUE.md:107 makes any assertion change a ruling, which is already covered.
  - Ruled A: it keeps every case title true with the smallest wording change.
- 8.2 The other direction.
  - A: the lane re-adds `.strict()` at schemas.ts:429 for a moment, without committing it, runs the file to show the new line red, then restores it.
  - B: rely on the existing red at the head (:71 receives true, which proves the schema is plain) plus schemas.test.ts:329 as the lock.
  - The rules: 08_agents.md:496 asks for both directions. The card's Files line names only the test file.
  - Ruled B (RR-0460, MORNING-DECISIONS.md:2382: no extra old-code run). Option A is struck: it edits a file outside the Files line. The both-direction proof is the head red at :71 plus schemas.test.ts:329, recorded as implicit, not executed.
- 8.3 Whether the server-side "strict and closed" test (src/tests/parcel-lot-form.logic.test.ts:145) needs its own card. D1 calls it latent and no ruling asks for it.
  - Ruled: no card now (D1 calls it latent and no ruling asks for work on it; RR-0392, MORNING-DECISIONS.md:1975). The close-out mentions it in one line.

## 9. UNVERIFIED
- I did not run the test file (read-only brief). That the moved line is green rests on reading schemas.ts:425-429 (a plain z.object, so extra keys are stripped) and on the head run receiving true at :71.
- I did not check whether the pre-commit hook's related-test run reaches mobile/__tests__ for a test-only change. task-450 :314 says it did not for that lane.
- I did not read the exact queue-row file for DoD #6 for this card.

Plan review round 1: 9 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-461/GROUNDER-PLAN.md; triage docs/reports/reviews/task-461/TRIAGE-PLAN.md
plan-error-paths#1 MED folded Option A is struck (
plan-plan-review-deepseek#1 MED folded --ci --coverage=fals
plan-plan-review-deepseek#2 MED folded finds lotForm.test.t
plan-plan-review-deepseek#3 MED folded That green is the ru
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24 taken on the board at lane launch (lane BL-SFX6, worktree /Users/brettpreston_macmini/Buildo-wt-sfx6, branch wf2/inc1b-sfx6), RR-0240

2026-11-24 build (lane BL-SFX6, plan PLAN-461-v1 as ruled; 8.1 A, 8.2 B). Red before the edit: npx jest __tests__/lotForm.test.ts __tests__/schemas.test.ts --ci --coverage=false (from mobile/) -> 1 failed suite, 1 failed test of 40, lotForm.test.ts:71:115 expected false received true (lane dir red.out). Edit: the extra-field line moved from the 'refuses ...' case into the 'parses ...' case as toBe(true) with comment task-450 L1 (GROUNDER-B D1); case retitled '... with null and with a server-added field'; the 'refuses ...' case keeps the two closed-enum refusals. Green after the edit, same command: 2 suites passed, 40 tests passed (lane dir green.out). AC2 search: git grep 'strict()' -- mobile/__tests__ finds nothing; git grep ConsumerParcelLookupResultSchema -- mobile/__tests__ finds lotForm.test.ts (all plain or closed-enum now), schemas.test.ts:326-335 (plain form) and useParcelLookup.test.ts:163,:200 (valid payloads, true); no phone test asserts the strict lot form. Server strict block (src/tests/parcel-lot-form.logic.test.ts:145) left as D1's latent trap, no card (ruled 8.3). The pre-commit related run is not the green proof for mobile tests (task-450 :314); full phone run owed at the push station (RR-0460).

Deviation from plan section 7: the task-450 note could not ride this commit (check-task-files refuses a file outside the Files line of task-461); the task-450 note is owed to the orchestrator, not written.

2026-11-24 (orchestrator): pushed to origin wf1/mb-rulings at a12d535f5 by the operator. Proof per RR-0460: full local phone run on that tip before the push, 58 of 58 suites, 866 of 866 tests (~/Buildo-scratch/lanes-20261124/phone-full-a12d535f5.out); Mobile CI run after the push on a12d535f5: success, job Jest + TypeCheck success (GitHub Actions run 45469556482; the simulator job is skipped by design on a manual run).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed acc1affa0 (mobile/__tests__/lotForm.test.ts only): the extra-field line moved into the 'parses ...' case as true (plain lot-form block, task-450 L1, GROUNDER-B D1); the closed-enum refusals stay; schemas.ts untouched. Hooks: typecheck, lint, GATE OK, POLICY CHECKS OK (related run skipped, no src/scripts staged). Red: lotForm.test.ts:71 failing, 1 of 40 (red.out); green: 2 suites, 40 of 40 (green.out). AC2 holds by grep (no phone test asserts the strict lot form). Orchestrator's full local phone run from this worktree at 18c760bb5: 58 of 58 suites, 866 of 866 tests (~/Buildo-scratch/lanes-20261124/phone-linked-sfx6-18c760bb5.out); phone typecheck exits 0. Owed for DONE (orchestrator): the full local phone run after the fold (RR-0460), the Mobile CI run after the push, the task-450 dated note. Process note: the board was not merged before the lens run (merge-tree clean, no cited path moved).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX6/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX6/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
