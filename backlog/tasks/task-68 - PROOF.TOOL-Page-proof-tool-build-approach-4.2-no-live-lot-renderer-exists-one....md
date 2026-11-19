---
id: TASK-68
title: >-
  PROOF.TOOL Page-proof tool (build-approach 4.2: no live-lot renderer exists):
  one...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T20:13:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:PROOF.TOOL
  - unverified
milestone: m-1
dependencies:
  - TASK-62
  - TASK-66
  - TASK-67
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/PROOF.TOOL
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L711
    sha256=a551450e6f8d
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/build-approach/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2005
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: PROOF.TOOL Page-proof tool (build-approach 4.2: no live-lot renderer exists): one script that, for a slice id and a lot list, renders the scenario page through the existing REPORT renderer on the test stack / admin preview route, saves a screenshot per lot, extracts every main and See-details element, asserts number-or-"Not yet evaluated", compares to the McProof key, runs the storage probes (open once, stale stamp recomputed, no unopened-lot record) and prints the compliance rows. Reuses the group F checks (CHK.4 no client maths, CHK.5 McStorage, CHK.6 design fit: it runs them, it does not rebuild them), the 1.6 harness, scripts/surfaces/report-checks.mjs, report-capture.ts and the admin report-preview; no new library or component kind; no hand-written screen

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 day (no measured source; size at the build pass)

Plan text at the snapshot: PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18)
landingPush: none (evidence files; no repo change beyond the tool in PROOF.TOOL)
slicePart: SUPPORT S3 proof and answer keys
planNote: holistic-r1: status PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18) (operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
who (plan text): one lane; claim an ID by mkdir before it starts (ID ledger)
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
2026-11-19 1·B validation (R10, RR-0257, task-316): dependency fixed: depends-on was 62, 65, 66, 67; now 62, 66, 67. TASK-65 CHK.4 is DROPPED (decision-69 'drop INFRA.2 guard.mjs and CHK.4', duplicate of report-no-maths MF-16; RR-0152); TASK-66 CHK.5 is BUILT and TASK-67 CHK.6 is LATER (kept); TASK-62 push 6 kept (the tool runs on the test stack after push 6, plan dependsOn 6.43). The description still says 'Reuses ... CHK.4': read it as the report-no-maths check MF-16, not a task. Proof task: no designed element (supporting function: PROOF slice S). Plan status 'approved S1/S2/Q-H4 a'; panel and build pass owed (readiness).

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-68 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-342 (PROOF.TOOL and CHK.6); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.
<!-- SECTION:NOTES:END -->
