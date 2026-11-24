---
id: TASK-373
title: >-
  FIX.SEMI Semi page Continue goes through the query layer; the entitlement
  query key is registered; the report screen gate has its stability test (D5,
  D4, D12)
status: RUNNING
assignee:
  - '@lane-BL-FIXSEMI'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix A
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-FIXSEMI/REPORT.md
type: build
ordinal: 73012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D5 mobile/app/(app)/parcel-tool/semi-question.tsx:64 and :74 fetch and write the cache by hand (Spec 99:219 every server fetch goes through TanStack Query): wrap in a mutation or fetchQuery inside a hook, keeping the bounded wait and every behaviour of task-361. D4 the query key parcel-entitlement (mobile/src/hooks/useParcelLookup.ts:134) has no row in the Spec 99 registry (:226): add the row. D12 mobile/app/(app)/parcel-tool/[parcelId].tsx:35 has no isFetching stability test (Spec 99 section 8.3): one test. Files: mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/hooks/useParcelLookup.ts, docs/specs/03-mobile/99_mobile_state_architecture.md, mobile/__tests__/semiQuestionPage.behaviour.test.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 The semi page behaves as task-361 built it (busy state, bounded wait, empty-id guard): its existing cases stay as they are and pass on Mobile CI
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
1. AC1 confirm D5, D4, D12 on head with file:line (semi-question.tsx:64,:74; useParcelLookup.ts:134 vs Spec 99:226-235; [parcelId].tsx:35 vs Spec 99 8.3). 2. AC2 red first: add cases only (useParcelLookup.test.ts for the new pure mutation function; new reportScreen.gateStability test; semi page mock gets the new hook, assertions unchanged); red commit attempt into red.out. 3. Fix D5: useAnswerParcelLookup (useMutation, mutationFn = boundedWait(fetchParcelLookup semi answered, SEMI_CONTINUE_WAIT_MS)) in useParcelLookup.ts; page calls mutateAsync; busy latch, empty-id guard, unmount guard, navigation unchanged; 60 s constant not moved. 4. Fix D4: registry row in Spec 99 section 4 B1 table. 5. Fix D12: isFetching stability test per Spec 99 8.3. 6. AC3 lens set (compliance per rule list whole, code-review, error-paths, regression) at plan and output; findings by id; grounder owed. 7. AC4 green commit through real hooks; typecheck before/after; task stays RUNNING.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-FIXSEMI, worktree /Users/brettpreston_macmini/Buildo-wt-fixsemi, branch wf1/inc1b-fixsemi), RR-0240

BL-FIXSEMI: D5 mutation useAnswerParcelLookup, D4 registry row, D12 gate test built; typecheck mobile 16 before (13 env) / 14 after (13 env + new test file module line); phone tests unproven until Mobile CI; grounder owed; task left RUNNING.

Residual for the operator to accept (grounder ruling): the mount-gated storeLookup stays in the page on purpose (D5 named it at semi-question.tsx:74). Moving it into onSuccess would let an unmounted page store the result, which the existing case 'leaving the page while the lookup runs opens nothing' forbids. Grounder gap closed: useAnswerParcelLookup.hook.test.tsx asserts retry 0, networkMode always, mutationFn through a real QueryClient mutation cache; unrun until Mobile CI.

Retro review by a separate grounder 2026-11-20 (task-405; file ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXPROJ/RETRO-372-373.md), code as on the board: DEFECTS before a push: (1) mobile/app/(app)/parcel-tool/semi-question.tsx:76 storeLookup(id, result) is still a hand cache write in the page (D5 named it; the 'grounder ruling' accepting it exists only as a message): move the write into the mutation or record a ruling: this is also what FE-45 (confirmed by the operator 2026-11-20) forbids. (2) the Files line does not cover three phone test files. No lens output carries a REVIEW header; mobile-96, mobile-98, surface-126/127/128/135, agents, queue-137, inc-S and ux were never run. Phone tests read: none would plainly fail. The pilot branch rewrites this page as table rows and keeps the fix.
<!-- SECTION:NOTES:END -->
