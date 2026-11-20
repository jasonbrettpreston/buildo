---
id: TASK-399
title: >-
  FOLD.ADOPT A confirmed finding must carry an outcome; counted bulk rulings
  below HIGH
status: LATER
assignee: []
created_date: '2026-11-20T16:34:00Z'
labels:
  - McFix
  - McFix Z
milestone: m-1
dependencies: []
type: build
ordinal: 99012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. The gap the operator named, verbatim: 'the compliance check would be done ... but not that the outcome would be adopted although the grounder worked'. Today a task can close with every finding CONFIRMED and nothing done (the verdict rule at check-lane-close.mjs near :184 asks nothing of a CONFIRMED line). Scope: (1) every CONFIRMED verdict line ends in one disposition the check verifies: fixed:<sha> (an ancestor of the branch head, not of the base, touching the cited path), task:task-N (the task file exists and is not DROPPED), or ruling:RR-NNNN (the decision file exists); else refused. (2) Bulk form: full verdicts with quote and disposition stay mandatory for CRITICAL and HIGH; for MED, LOW and NIT one line per lens output and severity, 'Bulk: <file> <severity> count:<n> REJECTED|DEFERRED <reason of 60+ characters>', the count recomputed from the file so it cannot undercount. Reason for the bulk form: lanes carry 195 to 864 findings each, most of them repeats; full verdicts on all of them invite skipping. This weakens MED and below (no per-finding quote): stated, not hidden. Own commit, before any close (the self-edit rule near :228). What stays unverifiable: that a fix fixes, that a follow-up task is done. Acceptance: planted-defect tests for a missing disposition, a fake sha, a DROPPED or unknown task id, an unknown ruling id, a bulk count that does not match. Files: scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

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
