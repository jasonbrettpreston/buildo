---
id: TASK-188
title: >-
  CO.2 CoA mechanism, built once: Layer 3 catalogue rows for the five fields
  (coa_form,...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '1'
  - plan:CO.2
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
milestone: m-3
dependencies:
  - TASK-62
  - TASK-94
  - TASK-187
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#1/CO.2
  - >-
    docs/specs/01-pipeline/131_lot_configuration_policy.md#L90
    sha256=5a9a66acc6be
  - >-
    docs/specs/01-pipeline/78_optimal_lot_configuration.md#L1192
    sha256=5568c40b26a9
  - docs/specs/01-pipeline/69a_mcbylaw_register.md#L480 sha256=038af3f9a3c7
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/coa/BUILD-PASS.md#L1
    sha256=d135bbb42913
documentation:
  - backlog/docs/increments/doc-4 - Increment-1-requirements.md
priority: medium
type: build
project: McIncrement
ordinal: 4006
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CO.2 CoA mechanism, built once: Layer 3 catalogue rows for the five fields (coa_form, coa_factor as a present NULL row, the CoA size row, coa_increment_sqm, coa_status), status form as the permitted row and expr form for the rest, no number in an expression and u read through lv(); absent u gives not_evaluated:coa_factor_unfitted:<form>; closed list layer3.not_applicable_reason = [no_coa_form, no_suite] in vocab (M-341, build OWED; the word coa_factor_unfitted is already in vocab); the lock over the real catalogue: no as-of-right field reads a coa_* field AND the CoA size is main_gfa_sqm x u or NULL with a status reason (both halves of INV-23), and applies is unreachable before the audit; a reachability assertion so a lock cannot pass over an unwired module; the u bound is NOT coded here (CO.6). Replaces SL-COA-LOCK

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1.5 days (a Layer 3 step change: descriptor, golden, witness; not measured)

Plan text at the snapshot: FOLDED into CO.2 (coa: the lock is part of the mechanism build (red first))
landingPush: push 9a (seed-window commit 8.20a) if Q-COA (a); else with L.6
slicePart: SLICE (7) CoA per option; SUPPORT S1, S3
planNote: coa: absorbs SL-COA-LOCK: CoA mechanism, built once: Layer 3 catalogue rows for the five fields (coa_form, coa_factor as a present NULL row, the CoA size row, coa_increment_sqm, coa_status), status form as the permitted row and expr form for the rest, no number in an expression and u read through lv(); absent u gives not_evaluated:coa_factor_unfitted:<form>; closed list layer3.not_applicable_reason = [no_coa_form, no_suite] in vocab (M-341, build OWED; the word coa_factor_unfitted is already in vocab); the lock over the real catalogue: no as-of-right field reads a coa_* field AND the CoA size is main_gfa_sqm x u or NULL with a status reason (both halves of INV-23), and applies is unreachable before the audit; a reachability assertion so a lock cannot pass over an unwired module; the u bound is NOT coded here (CO.6). Replaces SL-COA-LOCK
who (plan text): lane
element ids delivered: B12
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
