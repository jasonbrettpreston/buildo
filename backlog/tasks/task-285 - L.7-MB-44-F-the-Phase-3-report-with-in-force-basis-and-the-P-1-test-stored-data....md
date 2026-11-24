---
id: TASK-285
title: >-
  L.7 MB-44 F: the Phase 3 report with in-force basis and the P-1 test; stored
  data...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T00:29:00Z'
due_date: '2026-11-19'
labels:
  - L
  - plan:L.7
  - plan:MB-44
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:FIT
  - comp:AV3
  - comp:BLD
  - comp:HS
  - comp:BYL
  - comp:STO
milestone: m-13
dependencies:
  - TASK-258
  - TASK-259
  - TASK-274
  - TASK-123
  - TASK-122
  - TASK-188
  - TASK-272
  - TASK-277
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/MB-44
  - .cursor/MCBYLAWS-QUEUE.md#L775 sha256=7688fbb1fc8f ROW:MB-44
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L117
    sha256=1057fafb4411
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L568
    sha256=428ba8ffcb05
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L570
    sha256=9fe9a87d1331
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: build
project: McBylaws
ordinal: 14007
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: L.7 MB-44 F: the Phase 3 report with in-force basis and the P-1 test; stored data only, displayed only through the MF-14 report renderer with no hand-written screen; builds on W (1.3) and the text registry T1 (6c.8a); + ; the report reads the stored record (computing and storing it on first open through ST.P1, stamp checked by ST.P2); P-1 test runs on a sample of opened lots

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 days

Plan text at the snapshot: (record table live: L.5b; no fill)
planNote: L: dependsOn ["L.5","L.6","L.5b","1.3","6c.8a"] (optimize-L CHANGE: )
planNote: L: title MB-44 F: the Phase 3 report with in-force basis and the P-1 test; stored data only, displayed only through the MF-14 report renderer with no hand-written screen; builds on W (1.3) and the text registry T1 (6c.8a); the switch flip is LS.12 only (not doubled here) (optimize-L final wording (decisions-L-final.json))
planNote: L: estimate GUESS 2 days (PLAN-PROTOCOL 5.5)
planNote: L: status WAITING L.5, L.6, L.5b (MB-38 fill done); W (1.3) and T1 (6c.8a) land earlier (optimize-L final status)
planNote: coa: dependsOn ["L.5","L.6","CO.2"] (MB-44 binds the CoA rows (not their numbers); it waits CO.6 only if Q-COA (b) is ruled)
planNote: integrate: dependsOn ["L.5","L.6","L.5b","1.3","6c.8a","CO.2"] (L patch set plus the coa patch addition CO.2 (the coa patch carried a stale full set that drops L.5b, 1.3, 6c.8a))
planNote: storage-policy: dependsOn L.5,L.6,L.5b,1.3,6c.8a,CO.2,ST.P2,ST.C1 (the report reads only through the stamp check and binds cost from ST.C1)
planNote: storage-policy: title + ; the report reads the stored record (computing and storing it on first open through ST.P1, stamp checked by ST.P2); P-1 test runs on a sample of opened lots (stored data only stays true; the storage is per opened lot)
planNote: holistic: status (record table live: L.5b; no fill) (L.7 waited on a fill that no longer exists)
who (plan text): lane
queue row: MB-44 (row status WAITS · since 2026-11-12 · expires 2026-11-19 · next: G1 #12b · Hold (waits: MB-38)); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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
Dated note 2026-11-18 (M-246, prior text kept; RR-0165 · task-285 · Backlog; operator, verbatim: "ONE-5 "y"")

Dated note 2026-11-18 (M-246, prior text kept; RR-0178 · task-285 · Backlog; operator, verbatim: "1. it has to happen now - read the objectives")

2026-11-19 (BL-R7b, draft-18 part 2): queue row MB-44 (MCBYLAWS-QUEUE.md:776) NOT set DONE: no landing commit grounds it. The loader's LANDED flag rests on commits that mention MB-44 (status.json queueFlags; the commits are queue upkeep, partial parts or the tip, not a completing commit) and the row's own Status line still names open work (Spec 137 137_mcqueue.md:63 'The work landed and the evidence exists'). Row left as is; needs the operator or the row's lane.

2026-11-23 RR-0438 (operator, verbatim: 'okay great! We have answer - later', MORNING-DECISIONS.md:2253; task-349 D3 answer A): this task owns the public web report mount; it must exist before the web switch flips (LS.12). Estimate rises by about 1 day (a guess).
<!-- SECTION:NOTES:END -->
