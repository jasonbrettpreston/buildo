---
id: TASK-104
title: >-
  6c.15 + ; the ST-3 to ST-6 texts are the policy v2 amendments A-ST3, A-ST4,
  A-ST5,...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.15
  - plan:ST-NOTES
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
  - comp:STO
milestone: m-8
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/ST-NOTES
  - ~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md#L207 sha256=07d502fa18ef
  - >-
    ~/Buildo-scratch/lanes-20261117/owner-inputs/REPORT.md#L8
    sha256=335cecf3b966
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L577
    sha256=c5ee7c2a2c4f
  - >-
    ~/Buildo-scratch/queues-20261113/MB-MERGE-PLAN-20261117.md#L7
    sha256=ed9dfdaec259
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: record
project: McIncrement
ordinal: 9015
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: 6c.15 + ; the ST-3 to ST-6 texts are the policy v2 amendments A-ST3, A-ST4, A-ST5, A-ST6 (ST.N1), which supersede the unlanded 2026-11-17 and 2026-11-18 drafts

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: read-only audit now; the ST-3 to ST-6 texts ride ST.N1 (after push 6 and after the operator reads policy v2) unless the operator rules at sitting q9 that they join the push-6 records commit
planNote: 6: dependsOn  (optimize-6c/decisions-6c-final.json 6c.15)
planNote: 6: status READY to author (read-only audit first, now); joins the push-6 records commit if ready, else push 7 (optimize-6c/decisions-6c-final.json 6c.15)
planNote: storage-policy: title + ; the ST-3 to ST-6 texts are the policy v2 amendments A-ST3, A-ST4, A-ST5, A-ST6 (ST.N1), which supersede the unlanded 2026-11-17 and 2026-11-18 drafts (one policy, one batch)
planNote: holistic: status read-only audit now; the ST-3 to ST-6 texts ride ST.N1 (after push 6 and after the operator reads policy v2) unless the operator rules at sitting q9 that they join the push-6 records commit (policy v2 is a draft for the operator; ST.N1 says it lands after push 6 and after the operator has read it; 6c.15 says push 6)
who (plan text): lane
plan source tags: ROW:ST-NOTES
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The ruling is copied verbatim with date and row id, prior text kept — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #2 Entered the same day — "The orchestrator writes each ruling into the row's status line the same day." (docs/specs/00-architecture/137_mcqueue.md:87)
- [ ] #3 Where it is a register row, it cites its log entry and the log check is green — "RED (exit 1) when an approved decision has no citing register row" (scripts/analysis/decision-log.mjs:16)
- [ ] #4 The handbook line is cited, or a new register row is drafted — "every V3-step or by-law decision cites" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #5 The status line of the row changes in the same commit — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
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
