---
id: DRAFT-36
title: >-
  Task face: Rulings and Research sections on every task, written from the
  decisions and the referenced records
status: Draft
assignee: []
created_date: '2026-11-19T16:19:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - scripts/analysis/backlog-brief.mjs
  - >-
    backlog/tasks/task-69 -
    1.4-Search-parser-direction-guard-after-the-match-and-unit-token-strip-join-key-untouched.md
type: build
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (task-69 example): "I see the acceptance criteria and definition of done, dependancy graph, implementaiton notes. I dont see the rulings or research conducted." Grounded: yes - task-69 carries the ruling only as a note line (RR-0166, quote "ONE-12 a") while the ruling text sits in backlog/decisions/decision-36, and its research only as nine reference paths under ~/Buildo-scratch (gap-register REGISTER.md:26-27, SITTING.md:13, inc-plan/1-2/BUILD-PASS.md, BRIEFS.md, search-delta, holistic audit, readiness, avail-search) with no summary; the board shows neither section, only the lane context pack assembles them. Recommendation: a task-face enrichment tool that writes the two sections into the description from the same readers the context pack uses; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every task description carries a Rulings section (each decision naming the task: RR id, the operator quote, what was ruled, the cite) and a Research section (each referenced record: the path, the cited lines quoted, one line on what it found), written by a repo tool that reuses the context-pack readers, run once for the loaded tasks and at every decision or reference edit; red test first
- [ ] #2 References that point under ~/Buildo-scratch show the repo copy once draft-28 lands, so the Research section opens from the board
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
