---
id: TASK-258
title: >-
  L.5 MB-38 headline list: decided at MB-38 and re-measured under ST-3; the
  MB-38 card...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - L
  - plan:L.5
  - plan:MB-38
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:FIT
  - comp:BLD
  - comp:HS
  - comp:BYL
  - comp:STO
milestone: m-13
dependencies:
  - TASK-82
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/MB-38
  - .cursor/MCBYLAWS-QUEUE.md#L732 sha256=66069d777fff ROW:MB-38
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L114
    sha256=7765fde436c0
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L568
    sha256=428ba8ffcb05
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L570
    sha256=9fe9a87d1331
  - ~/Buildo-scratch/lanes-20261117/owner-inputs/q.md#L714 sha256=e956054ed1dc
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: build
project: McBylaws
ordinal: 14005
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: L.5 MB-38 headline list: decided at MB-38 and re-measured under ST-3; the MB-38 card classifies each face value (size per option, cost join key, CoA size, notes count, confidence, garden-suite split outputs suite_gfa_sqm and main_gfa_with_suite_sqm, the two Tracked Lots values); cost stays the Spec 88 join; no field is added or removed now (ST-6 note) + ; no all-lot table exists to re-measure: the ST-3 measured write of 500 records is L.5a's (A-ST3) and the ceiling lot count is the operator's (policy v2 open point 1)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day (card, classification, re-measure); the 100-lot timing is the 5.11 gate

Plan text at the snapshot: WAITING 10.7 (MB-46) and 5.11 (split speed-up)
planNote: 1-2: dependsOn + split speed-up task from lane INC-PLAN-5 (storage-outcome/OUTCOME.md: MB-38 fill depends on the split speed-up)
planNote: 1-2: title list decided at MB-38 (re-measure under ST-3); cost stays the Spec 88 join; no field added or removed now (OUTCOME.md ST-6 note)
planNote: 5: dependsOn add 5.11 (the MB-38 headline fill is 54 to 66 days on one worker as built (sizes.md ESTIMATE); the split speed-up comes first (storage-outcome/OUTCOME.md:16))
planNote: 5: note ST-6 headline set must list suite_gfa_sqm and main_gfa_with_suite_sqm (RESOLVE.md section 2 row H; storage outcome landed: ST-6 stays decided at MB-38, the MB-38 card classifies each face value)
planNote: L: title MB-38 headline list: decided at MB-38 and re-measured under ST-3; the MB-38 card classifies each face value (size per option, cost join key, CoA size, notes count, confidence, garden-suite split outputs suite_gfa_sqm and main_gfa_with_suite_sqm, the two Tracked Lots values); cost stays the Spec 88 join; no field is added or removed now (ST-6 note) (optimize-L final wording (decisions-L-final.json))
planNote: L: estimate GUESS 1 day (card, classification, re-measure); the 100-lot timing is the 5.11 gate (PLAN-PROTOCOL 5.5)
planNote: L: status WAITING 10.7 (MB-46) and 5.11 (split speed-up) (optimize-L final status)
planNote: storage-policy: title + ; no all-lot table exists to re-measure: the ST-3 measured write of 500 records is L.5a's (A-ST3) and the ceiling lot count is the operator's (policy v2 open point 1) (the producer does not exist until after L.6)
planNote: holistic-r1: dependsOn 5.11 (L.5 classifies the face values for the record writer; with no all-lot fill it does not wait for Phase 3 to close (MB-46). L.6 shadow/switch-over keeps its own place after 10.7 | approved: operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
who (plan text): lane
queue row: MB-38 (row status WAITS · since 2026-11-17 · expires when MB-46 is recorded · next: G1 #12a · Hold until exit recorded (waits: MB-46)); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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
