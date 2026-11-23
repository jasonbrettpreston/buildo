---
id: TASK-321
title: >-
  SRCH.C12 C.12 "Not sure which lot? Get help with an address" link on the lot
  map,...
status: BUILT
assignee:
  - '@lane-BL-C12'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.C12
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/SRCH.C12
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md
  - .cursor/MCFRONTEND-QUEUE.md#L394
  - .cursor/MCFRONTEND-QUEUE.md#L438
  - docs/reports/lanes/2026-11-19/BL-C12/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: SRCH.C12 C.12 "Not sure which lot? Get help with an address" link on the lot map, prefilled to Help, bound to logic_variables.maxbld_support_inbox; McFrontend follow-up to MF-53

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: NEW: panel + build pass owed; needs the operator support inbox address (LS.6)
who (plan text): lane
element ids delivered: B.7, C.12
Files: .cursor/MCFRONTEND-QUEUE.md, mobile/app/(app)/parcel-tool/disambiguate.tsx, mobile/src/components/surfaces/LotMapBinding.tsx, mobile/src/constants/lotMap.ts, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_disambiguation_map.goldens.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, src/tests/fixtures/surfaces/mobile_parcel_disambiguation_map/, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, docs/reports/reviews/task-321/, docs/reports/lanes/2026-11-19/BL-C12/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [x] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [x] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [x] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [x] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [x] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [x] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [x] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [x] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Red tests first (lot-map-help-link.logic.test.ts) for C.12 and B.7, proven red through the commit hook.
2. Add two content keys and the help link/row parts in LotMapBinding.tsx (existing Button link + open_help action), open_help passed by disambiguate.tsx.
3. Regenerate goldens by lotmap-golden-capture and emit-mobile-surfaces; run every generator --check and surface-validate --check.
4. MF-53 dated note quoting RR-0299; no DB write, no setting, no placeholder value.
5. One output review (link goes to Help with the topic on every state, no data read), triage, report in repo, close BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): promoted from draft-2 (was DRAFT-2) by R10: RR-0182 builds C.12 help link as its own task; dependency added: task-15 (LS.6, the operator support inbox address the plan text says it needs). Elements B.7 C.12. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0299 · task-321 · Backlog; operator, verbatim: "C12 - is a fake email address until launch")

2026-11-19 (R13, RR-0299, MORNING-DECISIONS.md:1155): Scope now: the help link is built against the placeholder support address until launch (RR-0299); the real address is set at launch by LS.6 (task-15). Ground: the variable logic_variables.maxbld_support_inbox already exists (migrations/314_maxbld_support_inbox.sql:15-17 inserts it; SUPPORT_INBOX_KEY at src/lib/surfaces/maxbld-support.ts:13); the migration seeds it EMPTY ("" as JSONB, 314:7 and :17), so until a value is set the page shows no contact links; the built page web_help reads it (scripts/surfaces/parcel_product/F06/surfaces/web_help.descriptor.json:204). Status unchanged (LATER; the launch script takes it, RR-0298).

2026-11-19 taken on the board at lane launch (lane BL-C12, worktree /Users/brettpreston_macmini/Buildo-wt-c12, branch wf1/inc1b-c12), RR-0240

AC evidence (lane BL-C12): #1 not applicable as a separate commit: brief fixes one feat commit with the context file (plan and binding table) and the MF-53 note; #2 plan and failing tests in the context file, red.out 8 failed; #3 write scope in the brief; #4 one plan review round r1 (r1-plan.txt, TRIAGE.md) instead of a lens panel per the brief; #5 triage re-opened every cited line; #6 red.out then commit.out 70bf820bf green through the hooks; #7 r2-output.txt in docs/reports/lanes/2026-11-19/BL-C12/; #8 MF-53 row note in .cursor/MCFRONTEND-QUEUE.md. Operator items: placeholder inbox value is a DB job; Help page has no wrong-lot topic. Files: see commit 70bf820bf.

Follow-up 78056a5a4: Help topics lot_match (C.12) and address_match (B.7), an orchestrator reading under the build-with-existing-bindings rule flagged for the operator; S-sbind pins 422 -> 424 (help.lot.prompt, help.address.link). See docs/reports/lanes/2026-11-19/BL-C12/REPORT.md addendum.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
C.12 and B.7 help links built on the lot map (mobile), commit 70bf820bf, hooks green (16 tests); S-sbind 418 -> 420 on this head, pins untouched; reports in docs/reports/lanes/2026-11-19/BL-C12/.
<!-- SECTION:FINAL_SUMMARY:END -->
