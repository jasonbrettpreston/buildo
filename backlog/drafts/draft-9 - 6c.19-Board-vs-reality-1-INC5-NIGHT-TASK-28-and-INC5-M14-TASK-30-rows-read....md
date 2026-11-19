---
id: DRAFT-9
title: >-
  6c.19 Board vs reality 1: INC5-NIGHT (TASK-28) and INC5-M14 (TASK-30) rows
  read...
status: Draft
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
labels:
  - 6c
  - plan:6c.19
  - plan:BOARD-1
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
milestone: m-8
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/BOARD-1
  - >-
    ~/Buildo-scratch/queues-20261113/QUEUE-DIGEST-20261117.md#L263
    sha256=9b8bbefa5840
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
ordinal: 9019
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: 6c.19 Board vs reality 1: INC5-NIGHT (TASK-28) and INC5-M14 (TASK-30) rows read RUNNING on the board (now finished: push 5 landed, D6 closed) + ; becomes the ONE BOARD-RECORDS item: the other open board-vs-reality rows (6c.20 to 6c.24, 6c.26, 7.18, 7.19, 8.6) fold into it (all are queue-row text edits; the board is generated from the queue)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: DRAFTED (E1-E3); lands with push 6
planNote: 6: dependsOn  (optimize-6c/decisions-6c-final.json 6c.19)
planNote: 6: status DRAFTED (E1-E3); lands with push 6 (optimize-6c/decisions-6c-final.json 6c.19)
planNote: review-fix: title Board vs reality 1: INC5-NIGHT (TASK-28) and INC5-M14 (TASK-30) rows read RUNNING on the board (now finished: push 5 landed, D6 closed) (finding 6c-3)
planNote: holistic: title + ; becomes the ONE BOARD-RECORDS item: the other open board-vs-reality rows (6c.20 to 6c.24, 6c.26, 7.18, 7.19, 8.6) fold into it (all are queue-row text edits; the board is generated from the queue) (relevance sweep FOLD list, extended to the three board rows added later)
planNote: holistic: absorbs 6c.20: Board vs reality 2: MB-27 (TASK-27) next step still reads "Finish
planNote: holistic: absorbs 6c.21: Board vs reality 3: No board or queue rows for INC6-NIGHT
planNote: holistic: absorbs 6c.22: Board vs reality 4: MF-47 (TASK-2), MF-83 (TASK-4), MF-19 (TASK-162) are
planNote: holistic: absorbs 6c.23: Board vs reality 5: Rows whose "waits on" is already met, so
planNote: holistic: absorbs 6c.24: Board vs reality 6: Expired and not refreshed: INC-9 (11-16), MF-08
planNote: holistic: absorbs 6c.26: Board vs reality 8: MF-49 sits in the board's Focus column with
planNote: holistic: absorbs 7.18: Board vs reality 9: Ids with no queue row: mig-326 (inc-7 semi
planNote: holistic: absorbs 7.19: Board vs reality 13: Increments 7, 8, 9 have pre-build work that
planNote: holistic: absorbs 8.6: Board vs reality 12: Increment 8 plan (and inc 7 mig-326) was
planNote: holistic-r1: absorbs 6c.20: Board vs reality 2: MB-27 (TASK-27) next step still reads "Finish
planNote: holistic-r1: absorbs 6c.21: Board vs reality 3: No board or queue rows for INC6-NIGHT
planNote: holistic-r1: absorbs 6c.22: Board vs reality 4: MF-47 (TASK-2), MF-83 (TASK-4), MF-19 (TASK-162) are
planNote: holistic-r1: absorbs 6c.23: Board vs reality 5: Rows whose "waits on" is already met, so
planNote: holistic-r1: absorbs 6c.24: Board vs reality 6: Expired and not refreshed: INC-9 (11-16), MF-08
planNote: holistic-r1: absorbs 6c.26: Board vs reality 8: MF-49 sits in the board's Focus column with
planNote: holistic-r1: absorbs 7.18: Board vs reality 9: Ids with no queue row: mig-326 (inc-7 semi
planNote: holistic-r1: absorbs 7.19: Board vs reality 13: Increments 7, 8, 9 have pre-build work that
planNote: holistic-r1: absorbs 8.6: Board vs reality 12: Increment 8 plan (and inc 7 mig-326) was
who (plan text): lane
plan source tags: ROW:BOARD-1
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
