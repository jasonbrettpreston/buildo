---
id: TASK-102
title: 6c.13 MB-80 MB-64 increment-1 leftovers
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.13
  - plan:MB-80
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
milestone: m-8
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/MB-80
  - .cursor/MCBYLAWS-QUEUE.md#L496 sha256=b49c38c5ca5b ROW:MB-80
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L130
    sha256=3d0912216251
  - >-
    ~/Buildo-scratch/queues-20261113/MB-MERGE-PLAN-20261117.md#L60
    sha256=c0162c93e09f
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L591
    sha256=6799fe49f693
  - ~/Buildo-scratch/lanes-20261117/repanel/REPORT.md#L29 sha256=de7587a319af
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: record
project: McBylaws
ordinal: 9013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: DRAFTED (E28); audit READY (read only)
planNote: 6: dependsOn  (optimize-6c/decisions-6c-final.json 6c.13)
planNote: 6: status DRAFTED (E28); audit READY (read only) (optimize-6c/decisions-6c-final.json 6c.13)
who (plan text): lane
queue row: MB-80 (row status LATER · since 2026-11-17 · expires when the item audit (a-f against increments 1-5) is done · next: read-only audit, then merge the survivors into MB-104; O-12, O-13 and item (e) stay as operator asks); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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
