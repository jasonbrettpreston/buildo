---
id: TASK-82
title: >-
  5.11 Speed up the garden-suite split pass
  (scripts/lib/compute/maxbld/split.js): same...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T04:58:00Z'
due_date: '2026-11-26'
labels:
  - '5'
  - plan:5.11
  - evidence:planned
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:AV3
  - comp:BYL
  - comp:RDG
  - comp:ID
  - comp:BLD
  - comp:HS
  - comp:FIT
  - comp:STO
  - comp:DN
milestone: m-6
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#5/5.11
  - >-
    ~/Buildo-scratch/lanes-20261117/storage-outcome/OUTCOME.md#L16
    sha256=f8d903a4e461
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/5/BUILD-PASS.md#L1
    sha256=1f5e65442637
documentation:
  - backlog/docs/increments/doc-7 - Increment-5-requirements.md
priority: medium
type: build
project: McIncrement
ordinal: 7010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: 5.11 Speed up the garden-suite split pass (scripts/lib/compute/maxbld/split.js): same candidate set, scoring and order, no search helper, no stored row added, outputs byte-identical on the whole D65 / key v2.1 candidate set (P5.10 outputs, INV-1, INV-3); timed on 100 lots (named list, fixed seed; includes random lots outside the cohort spread across zone-pool sizes, a proposal) before MB-38 (L.5); acceptance: stored-record reads p95 <= 1 s (ruled) and the first open inside the 35 s screen; no longer ahead of an all-lot fill

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS unmeasured (no speed-up built); MEASURED context: split 7.5 to 21 s per lot, 97 percent of the one-lot time (storage-outcome/measure.md:23); orchestrator re-measure lots 35714, 337023, 105234: 7,968 / 8,915 / 9,658 ms with the split, 244 / 215 / 188 ms without

Plan text at the snapshot: RULED ONE-4 a: keep, start right after push 6; pass mark first-open p95 well under 35 s on 100 random lots
landingPush: push 9 (8.33) if ready, else push 10 (9.11); before L.5; J9 does not wait for it
slicePart: S2 (supports (2) the stored fill and (3) the garden-suite face number)
planNote: storage-policy: title timed on 100 lots (named list, fixed seed; includes random lots outside the cohort spread across zone-pool sizes, a proposal) before MB-38 (L.5); acceptance: stored-record reads p95 <= 1 s (ruled) and the first open inside the 35 s screen; no longer ahead of an all-lot fill (there is no fill; the figure serves the first-open compute and the owner-input recompute)
planNote: holistic: status WAITING 6.43; kept by McStorage policy v2 (first open up to 33.6 s as built against the 35 s screen); no longer ahead of an all-lot fill (the storage ruling answered the sitting that this status waits on)
planNote: answers-738: status RULED ONE-4 a: keep, start right after push 6; pass mark first-open p95 well under 35 s on 100 random lots (ONE-4 a (operator answer page, MORNING-DECISIONS.md:738))
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
Dated note 2026-11-18 (M-246, prior text kept; RR-0164 · task-82 · Backlog; operator, verbatim: "ONE-4 a")
<!-- SECTION:NOTES:END -->
