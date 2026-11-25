---
id: TASK-466
title: >-
  McWeb: plans, success and cancel pages (MF-86): the page after purchase
  directs people to the app; the landing plan boxes get their prices
status: LATER
assignee: []
created_date: '2026-11-25T19:41:00Z'
labels:
  - McWeb
milestone: m-2
dependencies: []
ordinal: 160210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opened by the operator's ruling RR-0498 item 5 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2593, verbatim '5. y') and RR-0496 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2583, verbatim 'Check-out/Account pages. Directing people to use the app after purchasing.'). Queue row MF-86 (.cursor/MCFRONTEND-QUEUE.md) had no board card. Contents: the plans page, the success page (now use the app) and the cancel page; the landing page's four plan boxes show their prices once the Stripe price ids exist (task-71, task-72; the ids are the operator's to supply). Not planned yet: no plan, no Files line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plans, success and cancel pages exist as designed in the approved small-pages mocks
- [ ] #2 The success page directs the buyer to the app
- [ ] #3 The landing plan boxes show prices
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
