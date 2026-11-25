---
id: TASK-313
title: >-
  MF-49 MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116
  section 3)
status: LATER
assignee:
  - '@operator'
created_date: '2026-11-19T13:07:00Z'
updated_date: '2026-11-25T19:49:00Z'
labels:
  - queue-row
  - McApp
milestone: m-2
dependencies: []
references:
  - .cursor/MCFRONTEND-QUEUE.md#L347 ROW:MF-49
type: decision
project: McFrontend
ordinal: 22012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: MF-49 MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)

queue row: MF-49 (lane E; row status LATER · since 2026-11-09 · expires 2026-11-16 · next: G1 #11 · Plan when MF-47 and MF-51 settle); the row stays the record (Spec 137 rule 2) and a lane edits the row and this task in the same commit (rule 3). Mirrored by task-306 (R8a, RR-0232) because the row expired 2026-11-16 and waits on the operator's renew, drop or answer word.

Grounded: yes. Row MF-49 'MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)', Status: LATER since 2026-11-09, expires 2026-11-16, next 'G1 #11 Plan when MF-47 and MF-51 settle' (.cursor/MCFRONTEND-QUEUE.md:347-348). Expired under Spec 137 rule 7 (137_mcqueue.md:112). MF-47 is WAITS, expires 2026-11-24 (:334); MF-51 is WAITS 'expires when MF-49 ships ... waits: MF-49 app' (:375): the two rows wait on each other. Milestone m-8 (Increment 6c) is placed by the plan items 6c.24 and 6c.26 (task-110, task-112, milestone m-8) that carry the refresh of these expired rows (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:21), not by the row itself: UNVERIFIED as increment ownership. The mirror shows the row as waiting on the operator's renew, drop or answer word (Spec 137 rule 7), not the row's own status word.
Recommendation: renew with a named event, `expires when MF-47 is DONE` (Spec 137 rule 12, 137_mcqueue.md:129). Proposed follow-up, not part of R8a: MF-51 itself waits on MF-49 (.cursor/MCFRONTEND-QUEUE.md:375), so the row's wait on MF-51 is circular. UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.
<!-- SECTION:DESCRIPTION:END -->

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
Dated note 2026-11-19 (M-246, prior text kept; RR-0232 · task-313 · Backlog; operator, verbatim: "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified).")

Dated note 2026-11-19 (M-246, prior text kept; RR-0233 · task-313 · Backlog; operator, verbatim: "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions")

2026-11-25 (RR-0499, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2598, operator '1a'; RR-0496 :2583): the MaxBLD app lives INSIDE the one project for now: sign-in goes straight to search with no lead-app onboarding, the MaxBLD bar is the only bar, the gate checks the MaxBLD plan, and the app gets its own start-up screen; the lead-app screens stay in the code, unreachable, kept for the other app. This departs from Spec 116 section 3 (a separate Expo project); a dated note in Spec 116 is owed by the build. The separate project is a later decision, when the lead app is ready. First card of McApp; planned after the five 1-B cards.

2026-11-25 (RR-0501, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608): McApp card 1 of 4 (front door), moved into Increment 1-C; built first after the five 1-B cards.
<!-- SECTION:NOTES:END -->
