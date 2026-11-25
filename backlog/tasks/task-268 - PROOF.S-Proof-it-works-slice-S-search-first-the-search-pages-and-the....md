---
id: TASK-268
title: 'PROOF.S Proof it works, slice S (search first): the search pages and the...'
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T17:03:00Z'
due_date: '2026-11-26'
labels:
  - McFixV2
milestone: m-1
dependencies:
  - TASK-12
  - TASK-69
  - TASK-267
  - TASK-68
  - TASK-449
  - TASK-450
  - TASK-451
  - TASK-452
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/PROOF.S
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
ordinal: 150200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: PROOF.S Proof it works, slice S (search first): the search pages and the pick-to-report hand-off on a real lot (typed address, candidate list, lot map, semi question, loading screen from the search pick, the report opens). Pass criteria (each automatic where a check exists, else REVIEWED-PASS by a fresh reviewer): (a) the scenario page rendered for the 25 golden lots on the test stack through the admin/tester route (10a), one screenshot per lot as evidence; (b) every main and See-details element of the slice shows a number or the exact pending word "Not yet evaluated"; (c) every number equals the McProof key; (d) storage proof: a lot opened once is stored with its stamp, a stale stamp is recomputed, no record exists for an unopened lot; (e) compliance rows marked AUTO-PASS, REVIEWED-PASS or GAP (Airtight V3 / Spec 132, Spec 126/128, McStorage v2, key match, design fit, hooks plus full suite on the current tip); GAP not accepted by the operator means not DONE.

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day (no measured source; size at the build pass)

Plan text at the snapshot: PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18)
landingPush: none (evidence files; no repo change beyond the tool in PROOF.TOOL)
slicePart: (9) measured check + section 10 "Proof it works"
planNote: holistic-r1: status PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18) (operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
who (plan text): fresh lane (no builder context) with the page-proof tool; operator sees the screenshots and the pass lines only
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
2026-11-19 1·B validation (R10, RR-0257, task-316): dependency fixed: depends-on was 12, 69, 267, 68; now also 317 (LOAD.4), 318 (SRCH.ROUTE), 319 (SRCH.SEMI), 320 (SRCH.A6), 321 (SRCH.C12), 322 (SRCH.DAYLIGHT). Grounds: its text proves candidate list, lot map, semi question and the loading screen from the pick, and holistic-audit/AUDIT.md:159 'each PROOF.n waits for the slice's C-n check task, the slice's content tasks ... and PROOF.TOOL'. Chain to the report increment: 267 -> 266 -> 123 (1.3, m-3) and 265 (ST.P1, m-13); to 1·A: 68 -> 66 (BUILT), 67 (m-0). Open OPERATOR questions in m-1 (task-323, 324, 325) go to the answer page (RR-0154).

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-268 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-342 (PROOF.TOOL and CHK.6; and, through task-267, task-341); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0306 · task-268 · Backlog; operator, verbatim: "I would agree")

Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). PROOF.S now WAITS on the page conversion (McFix G: task-390, 391, 392, 393) and the legal-line move (task-389): both change the search pages, so the proof runs on the converted pages.

2026-11-24: ordered after the SEARCHFIX-PRIORITY cards (RR-0447, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308). The 29 typed-address cases of docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md join this proof's checklist (orchestrator reading; not yet ruled).

2026-11-24 (task-453 SEARCHFIX.5 ST5, GROUNDER-SEATS J): the CHK.3 proof row chk3-nothing-new in scripts/analysis/proof-slices.json is now notbuilt, reason "CHK.3 reads the staged diff; --all gives it no input". Commit 4c5bfa249.
<!-- SECTION:NOTES:END -->
