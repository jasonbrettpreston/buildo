---
id: TASK-287
title: >-
  LS.12 Web live switch: flip MAXBLD_WEB_LIVE and the W4 live lookup together at
  launch,...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T19:49:00Z'
due_date: '2026-11-26'
labels:
  - 1-2
  - plan:LS.12
  - evidence:planned
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:FIT
  - comp:BLD
  - comp:HS
  - comp:BYL
  - comp:DN
milestone: m-13
dependencies:
  - TASK-123
  - TASK-285
  - TASK-264
  - TASK-332
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#1-2/LS.12
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md#L33
    sha256=3cefae101b37
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/1-2/BUILD-PASS.md#L1
    sha256=f820d870862f
documentation:
  - backlog/docs/increments/doc-3 - Increment-1-2-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 3011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LS.12 Web live switch: flip MAXBLD_WEB_LIVE and the W4 live lookup together at launch, after MB-44 (gap S13); the N of 20 reports left line is bound (S12; the entitlement read route is a ruled build item); the report-incorrect-match buttons (S11) are populated when the operator sets the support inbox value (LS.6) + the reports-left line shows the allowance and the reset date from the entitlement read (design draws '6 of 10 reports left until 9 Dec 2026'; the numbers are data, not copy)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: WAITS on MB-44
landingPush: launch (see PUSHES.md)
slicePart: (5) public route; launch
planNote: integrate: title Web live switch: flip MAXBLD_WEB_LIVE and the W4 live lookup together at launch, after MB-44 (gap S13); the N of 20 reports left line is bound (S12; the entitlement read route is a ruled build item); the report-incorrect-match buttons (S11) are populated when the operator sets the support inbox value (LS.6) (LS-F: gap-register/REGISTER.md:57 "whose inbox setting is empty" (S11 is SERVED-NOT-POPULATED, not bound by a build))
planNote: integrate: dependsOn ["1.3","L.7","MB-44","L.13"] (MB-98 is "LATER (before MB-44 customer data)" (MCBYLAWS-QUEUE.md:875): the gated-lot reason display L.13 lands before the customer switch flip)
planNote: gaps: title + the reports-left line shows the allowance and the reset date from the entitlement read (design draws '6 of 10 reports left until 9 Dec 2026'; the numbers are data, not copy) (closes search A.6)
planNote: holistic: dependsOn [1.3, L.7, MB-44, L.13, PROOF.L] (the live switch flips only after the public-route proof (stage 10b))
who (plan text): lane
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0270 · task-287 · Backlog; operator, verbatim: "1. once  -approved")

2026-11-19 (task-359, RC-1, UX-1) before this task flips MAXBLD_WEB_LIVE: nothing counts a report even when pages are served (the evaluated-option gate, route.ts:163, no owner: task-343 new line) and the limit wall is not built (task-343 R17 line, no owner). Both need an owner first, or the flip shows free reports and a wrong limit message.

2026-11-25 (RR-0501, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608): moved to the last increment (launch gate) by the operator's ruling on the Increment 1-C plan.
<!-- SECTION:NOTES:END -->
