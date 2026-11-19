---
id: TASK-320
title: >-
  SRCH.A6 A.6 reports-left line on the app search page ("6 of 10 reports left
  until 9...
status: RUNNING
assignee:
  - '@lane-BL-A6'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T21:12:00Z'
labels:
  - S
  - plan:SRCH.A6
milestone: m-1
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/SRCH.A6
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md
  - .cursor/MCFRONTEND-QUEUE.md#L133
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: SRCH.A6 A.6 reports-left line on the app search page ("6 of 10 reports left until 9 Dec 2026", small-pages-v8 search.html) bound to the entitlement read (current_period_end, usage_events); McFrontend follow-up to MF-35; uses the MF-47 plan data

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: NEW: panel + build pass owed; waits the MF-47 plan data (Stripe price ids from the operator, DB job 322)
who (plan text): lane
element ids delivered: A.6
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. STEP A records: RR-0307 decision, task-340 closed, dependency on task-71 removed. 2. STEP B research (design states, rules, data and null cases, contract declaration sites, owning MF row) into the context file; binding table; one review round (r1) triaged. 3. STEP C only if no stop condition: red tests, line, goldens by repo scripts, generator checks before and after, pins as data, green commit through real hooks. 4. Output review (one lens), reports into docs/reports/lanes/2026-11-19/BL-A6/, close.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): promoted from draft-5 (was DRAFT-5) by R10: RR-0182 builds A.6 reports-left line as its own task; dependency task-71 (LS.1 MF-47 checkout, waits operator Stripe price ids) kept. Follow-up row to MF-35 claimed by the build lane. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-320 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-340 (A.6 and the web checkout); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

2026-11-19 taken on the board at lane launch (lane BL-A6, worktree /Users/brettpreston_macmini/Buildo-wt-a6, branch wf1/inc1b-a6), RR-0240

Dated note 2026-11-19 (M-246, prior text kept; RR-0307 · task-320 · Backlog; operator, verbatim: "it appears we will need it so we should build it")

Scope now: the line is built against the existing entitlement read; nothing of MF-47 checkout, no price ids, no DB job (RR-0307)

Files: mobile/app/(app)/parcel-tool/, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/hooks/, mobile/src/lib/parcelSearchCore.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/persistFilter.ts, mobile/src/lib/schemas.ts, mobile/src/generated/surfaces/, mobile/__tests__/fixtures/, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.*, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/_schema/census/mobile-product.json, src/tests/fixtures/surfaces/mobile_parcel_search/, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/surfaces/, .cursor/MCFRONTEND-QUEUE.md

2026-11-19 BL-A6 STEP B done: research, binding table and operator list in docs/reports/reviews/task-320/context-2026-11-19.md (Plan steps under review); r1 triaged (TRIAGE.md in the lane dir). Owning row: MF-35. Stop conditions do not hold. Red tests: src/tests/surfaces/search-reports-left.logic.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx (e).

Files (final): mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/lib/parcelSearchCore.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/persistFilter.ts, mobile/src/lib/schemas.ts, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.{content,descriptor}.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/_schema/census/{contracts,mobile-product}.json, src/tests/fixtures/surfaces/mobile_parcel_search/*, mobile/__tests__/fixtures/*, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reports/generated/127-surface-*.md, src/tests/surfaces/{search-reports-left.logic,search-web-binding.ui,surface-validate.logic,surface-conformance.logic}.test.ts, .cursor/MCFRONTEND-QUEUE.md
<!-- SECTION:NOTES:END -->
