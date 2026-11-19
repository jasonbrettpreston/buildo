---
id: TASK-91
title: '6c.1 Rule: Gemini tie-break, McProof three-way split (MCPROOF-13 vs 13N)'
status: LATER
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.1
  - plan:RULE-CONFLICTS:1
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
  - comp:MCP
  - comp:DDV
  - comp:FIT
milestone: m-8
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/RULE-CONFLICTS:1
  - docs/specs/00-architecture/08_agents.md#L480 sha256=f39ad81e668c
  - docs/specs/00-architecture/08_agents.md#L482 sha256=51650200fd2b
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: decision
project: McIncrement
ordinal: 9001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: READY to author; joins the push-6 records commit if ready, else push 7
planNote: 6: status READY to author; joins the push-6 records commit if ready, else push 7 (optimize-6c/decisions-6c-final.json 6c.1)
who (plan text): operator
plan source tags: ROW:RULE-CONFLICTS:1
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
