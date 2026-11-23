---
id: TASK-69
title: >-
  1.4 Search parser: direction guard after the match and unit-token strip (join
  key...
status: BUILT
assignee:
  - '@lane-BL-PARSER'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-23T16:06:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:1.4
  - evidence:planned
  - unverified
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/1.4
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md#L26
    sha256=377a9fbb2292
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md#L27
    sha256=0f20cbd07b18
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/SITTING.md#L13
    sha256=ec47e268cc0c
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/1-2/BUILD-PASS.md#L1
    sha256=f820d870862f
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md#L55
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/avail-search/SEARCH-AVAILABILITY.md
  - docs/reports/lanes/2026-11-19/BL-PARSER/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: high
type: build
project: McIncrement
ordinal: 2007
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: 1.4 Search parser: direction guard after the match and unit-token strip (join key untouched)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day

Plan text at the snapshot: RULED ONE-12 a: fix both parser defects before launch, two labels + one dated note on Spec 89 line 33; panel + build pass owed; waits push 6
landingPush: push 7 (after gap Q1)
slicePart: (8)
planNote: order: moved from 1 to S (operator 2026-11-18: search pages before increment 1)
planNote: answers-738: status RULED ONE-12 a: fix both parser defects before launch, two labels + one dated note on Spec 89 line 33; panel + build pass owed; waits push 6 (ONE-12 a (operator answer page, MORNING-DECISIONS.md:738))
who (plan text): lane
element ids delivered: A.4, A.5

Files: src/lib/admin/parcel-lookup.ts, src/tests/search-parser-guard.logic.test.ts, docs/specs/02-web-admin/89_parcel_cost_model_tool.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/reports/reviews/task-69/, docs/reports/lanes/2026-11-19/BL-PARSER/
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
1. Pre-register expected moves (context file + task file, committed with red tests) [AC1]. 2. Failing tests written into plan: direction guard cases and unit-strip cases (case table in context file), reviewed at plan altitude, one DeepSeek round triaged [AC2,AC4,AC5]. 3. Write_scope declared in brief [AC3]. 4. Red tests via pre-commit attempt (red.out), then unit strip and direction guard after the match, green real commit (commit.out) [AC6]. 5. Output review on diff, report and review record committed under docs/reports/lanes [AC7]. 6. AC8 not applicable: no surface path touched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-18 (M-246, prior text kept; RR-0166 · task-69 · Backlog; operator, verbatim: "ONE-12 a")

2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (deps task-62 push 6; inc-6 protection RR-0186 keeps origin moving only by push 6): the doc-2 Elements rows A.4 and A.5 NOT-BUILT are right: src/lib/parcels/address.ts:39 'Directional suffixes (N, S, E, W) are stripped from the name' and fe-built/BUILT.md:55 'parseFreeTextAddress has no direction guard'; the search-delta current table row A.4 'AVAILABLE' is stale. RR-0166 'ONE-12 a': two labels and one dated note on Spec 89 line 33. Panel and build pass owed (readiness: panel, open item).

2026-11-19 taken on the board at lane launch (lane BL-PARSER, worktree /Users/brettpreston_macmini/Buildo-wt-parser, branch wf1/inc1b-parser), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A.4 direction guard after the match and A.5 unit strip landed in src/lib/admin/parcel-lookup.ts; commits e8a3de62b and d8a99e254, hooks GATE OK, 43 guard tests plus parity test green; join key and normalizers unchanged; Spec 89 line 33 and Spec 100 dated notes. AC1-5 are the imported generic form: met by the r1 plan round (DeepSeek review, triaged) in place of the retired panel; AC8 not applicable (no surface path). Report docs/reports/lanes/2026-11-19/BL-PARSER/REPORT.md. Live DB behaviour UNVERIFIED.
<!-- SECTION:FINAL_SUMMARY:END -->
