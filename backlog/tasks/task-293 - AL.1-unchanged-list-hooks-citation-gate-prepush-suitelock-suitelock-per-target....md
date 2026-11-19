---
id: TASK-293
title: >-
  AL.1 unchanged list (hooks citation gate, prepush suitelock, suitelock per
  target,...
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T04:58:00Z'
due_date: '2026-11-26'
labels:
  - AL
  - plan:AL.1
  - plan:INFRA-hooks-citation-gate
  - held-unruled
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
milestone: m-14
dependencies: []
references:
  - >-
    docs/reports/plan-import/raw/2026-11-19/sequence.json#AL/INFRA-hooks-citation-gate
  - ~/Buildo-scratch/panel-tools/check-cites.mjs#L2 sha256=8f9bdbc19879
  - ~/Buildo-scratch/panel-tools/check-quotes.mjs#L2 sha256=2eeeb7901b5b
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L121
    sha256=9aac4ba52441
  - ~/Buildo-scratch/inc6-guard/RULES.md#L7 sha256=65b3fdb86726
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PANEL-D7-OVERLAP-20261116.md#L17
    sha256=ff31adbaacd6
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L24
    sha256=22e6217b7688
  - ~/Buildo-scratch/lanes-20261117/NOW-A/REPORT.md#L37 sha256=f0633c16b155
documentation:
  - backlog/docs/increments/doc-15 - Increment-AL-requirements.md
priority: low
type: decision
project: McIncrement
ordinal: 15001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: AL.1 unchanged list (hooks citation gate, prepush suitelock, suitelock per target, gate copy drift, mig327 numbering, validatecatalogue runpath); the lane-tooling fixes are NOT in this list: they are INFRA.1-INFRA.6 in increment F

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS one sitting, after launch

Plan text at the snapshot: HELD to freeze lift
planNote: L: estimate GUESS one sitting, after launch (PLAN-PROTOCOL 5.5)
planNote: L: status HELD to freeze lift (optimize-L final status)
planNote: lane-tools: title unchanged list (hooks citation gate, prepush suitelock, suitelock per target, gate copy drift, mig327 numbering, validatecatalogue runpath); the lane-tooling fixes are NOT in this list: they are INFRA.1-INFRA.6 in increment F (operator "yes" to add the lane-tooling fixes as INFRA tasks and build them first (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:716); AL.1 held the six older items only)
planNote: lane-tools: note Lane-tooling items INFRA.1-INFRA.6 sit in F (not frozen: they block every lane; PLAN-PROTOCOL.md:41 promised them). AL.1 stays HELD to freeze lift for its own six items. (keep one plan: no item listed twice)
note: Includes INFRA-prepush-suitelock (Freeze exception: pre-push hook does not check SUITE.lock). Includes INFRA-suitelock-per-target (Freeze exception: machine-wide SUITE.lock versus a per-target). Includes INFRA-gate-copy-drift (Freeze exception: rehearsal-gate-optA.zsh is a copy that can drift from the). Includes INFRA-mig327-numbering (Freeze exception: migration 327 numbering defect class (a lower number erased). Includes INFRA-validatecatalogue-runpath (Freeze exception: validateCatalogue is not called on the run path).
who (plan text): operator
plan source tags: ROW:INFRA-hooks-citation-gate ROW:INFRA-prepush-suitelock ROW:INFRA-suitelock-per-target ROW:INFRA-gate-copy-drift ROW:INFRA-mig327-numbering ROW:INFRA-validatecatalogue-runpath
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One decision list to the operator, rule quoted, compliant options only, recommendation — "One decision list. Every ruling the map needs goes to the operator at once." (docs/specs/00-architecture/08_agents.md:489)
- [ ] #2 No rule found means a card with the search shown, not a decision — "If it is not in a handbook or spec, STOP" (.cursor/MCBYLAWS-QUEUE.md:226)
- [ ] #3 Scope grows only by a ruling — "scope may expand only by a ruling" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #4 Before it reaches the operator the cited lines are opened and any no-rule claim is grep-checked — "before any recommendation reaches the operator, the orchestrator opens the cited source lines itself" (~/Buildo-scratch/panel-tools/PROTOCOL.md:48)
- [ ] #5 The answer is recorded verbatim — "Operator, 2026-11-14, verbatim" (docs/specs/00-architecture/137_mcqueue.md:18)
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

## Comments

<!-- COMMENTS:BEGIN -->
author: plan-to-backlog
created: 2026-11-19T04:58:00Z

---

The plan text reads "HELD to freeze lift"; no ruling is on file, so none is invented. Open question for the operator.

---
<!-- COMMENTS:END -->
