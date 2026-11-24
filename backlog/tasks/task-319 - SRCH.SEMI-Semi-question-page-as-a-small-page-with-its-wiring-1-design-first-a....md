---
id: TASK-319
title: >-
  SRCH.SEMI Semi question page as a small page, with its wiring: (1) design
  first: a...
status: BUILT
assignee:
  - '@lane-BL-SEMI2'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - plan:SRCH.SEMI
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-318
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/SRCH.SEMI
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - .cursor/MCFRONTEND-QUEUE.md sha256=011b1da71004
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md
  - .cursor/MCFRONTEND-QUEUE.md#L597
  - .cursor/MCFRONTEND-QUEUE.md#L649
  - .cursor/MCFRONTEND-QUEUE.md#L654
  - .cursor/MCBYLAWS-QUEUE.md#L94
  - docs/reports/lanes/2026-11-19/BL-SEMI/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-SEMI2/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: SRCH.SEMI Semi question page as a small page, with its wiring: (1) design first: a Daylight mock from the small-pages-v8 template (none exists today) for operator approval; (2) MF-89 wall-distance input, override control and assumption line (moved from increment 7); (3) the owner answer stored as owner input with its stamp (McStorage v2); (4) the report reads it and shows Not yet evaluated for the semi option until 7.25 computes it (the link)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: NEW: mock for operator approval first, then panel + build pass; storage of the owner answer needs a field (no ex_wall_distance_m today)
who (plan text): lane
element ids delivered: D.9, D.10
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
1. Pre-register: MF-93 and round 196 claimed in the id ledger, prereg-MF-93-1.json committed alone, queue row MF-93 with status line and dated notes on MF-84 and MF-92. 2. Failing tests first (route cases in parcel-lookup-gate.infra.test.ts, semi-question-design.logic.test.ts on the goldens, mobile jest cases), reviewed at plan altitude in the context file. 3. write_scope declared in the context file. 4. Repo review round on the plan (r1-plan.txt), triaged in TRIAGE.md. 5. Grounder: every claim in the fold re-executed on this head. 6. Build red first (red.out) then green through the real hooks (commit.out): page to the approved mock with the heading spanning the cards width, meter flag semi=answered in contract, route and client. 7. Output review (meter counts once, only for a produced report), panel record docs/reports/panels/MF-93.json with the work. 8. McFrontend row MF-93 first (step 1).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): promoted from draft-4 (was DRAFT-4) by R10; dependency DRAFT-3 rewritten to task-318. This is the semi page placeholder: RR-0182 and RR-0184 place the semi question page on the search flow (v8 mock for approval, then built, link to the report); 7.25 (task-209) now depends on this task (dependency fixed on task-209). Parts (2) wall-distance input and (3) owner-answer store conflict with MCBYLAWS-QUEUE.md:94 row 6c and task-213 GAP.12: scope raised as OPERATOR task-323 with a recommendation: page, mock and link only in 1·B. Rows MF-84 (:597 BUILT, awaiting DB job and push), MF-89 (:649), MF-90 (:654) linked.

Dated note 2026-11-19 (M-246, prior text kept; RR-0264 · task-319 · Backlog; operator, verbatim: "1 y")

Scope now: page, mock and link only in 1·B (RR-0264); the owner-input store stays at its later increment home (GAP.12 task-213)

2026-11-19 from SRCH.METER (task-334): the lookup route never counts an unsure lot (the semi answer is a client param); when the semi question is answered and the report produced, the count belongs to this page: add the meter call after the answer (RR-0278, one row per lot per month)

2026-11-19 taken on the board at lane launch (lane BL-SEMI, worktree /Users/brettpreston_macmini/Buildo-wt-semi1b, branch wf1/inc1b-semi), RR-0240

Grounded: the semi question page is already built, elements D.1 to D.7 (doc-2 lines 67-73): mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/components/surfaces/SemiQuestionBinding.tsx:29-117, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json; the link from search is proven by src/tests/search-routing.logic.test.ts:136; the v8 mock for approval is docs/reports/lanes/2026-11-19/BL-SEMI/semi-question.html with the delta list DELTA.md beside it (RR-0184 MORNING-DECISIONS.md:801, RR-0264 :1041-1043).
Recommendation: approve the mock as drawn and answer the four small questions in DELTA.md section 6 (Q1 chevron, Q2 info icon, Q3 curly apostrophes, Q4 v8 retry and loading form); stage 2 then builds the structural restyle and the meter call after the answer. Checked by one repo review round on the plan (r1-plan.txt, TRIAGE.md); the mock render and the device look are UNVERIFIED.

2026-11-19 taken on the board at lane launch (lane BL-SEMI2, worktree /Users/brettpreston_macmini/Buildo-wt-semi1b2, branch wf1/inc1b-semi2), RR-0240

Stage 2 (lane BL-SEMI2, MF-93): semi page built to the approved mock with the heading spanning the cards; meter flag semi=answered wired (contract, route, client). Red proven in red.out; green commit follows. Mobile jest cases written, not run (UNVERIFIED).

Output review r2 (meter lens): two findings kept and fixed (page left during the Continue fetch, replace outside the try); the rest rejected with lines in TRIAGE.md.

Dated note 2026-11-19 (M-246, prior text kept; RR-0308 · task-319 · Backlog; operator, verbatim: "Mock looks good")

Dated note 2026-11-19 (M-246, prior text kept; RR-0309 · task-319 · Backlog; operator, verbatim: "Mock approved. Looks good!")

2026-11-19 (R17, task-350): stage 1 questions 1, 2 and 4 are approved as drawn in the regenerated mock (RR-0309, decision-94; back chevron, info icon, secondary Try again, quiet loading line). Question 3 (curly apostrophes) is NOT answered and no string changed. Status not changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stage 2 built (MF-93): semi page to the approved mock with the heading spanning the cards, meter flag semi=answered in contract, route and client. Commits 02cbc5718 (prereg+row), 6df83425a (build), 7b25b61be (fix). Hooks: GATE OK, 182 passed in the related run; search and lot map goldens unmoved. Mobile jest cases UNVERIFIED (not run).
<!-- SECTION:FINAL_SUMMARY:END -->
