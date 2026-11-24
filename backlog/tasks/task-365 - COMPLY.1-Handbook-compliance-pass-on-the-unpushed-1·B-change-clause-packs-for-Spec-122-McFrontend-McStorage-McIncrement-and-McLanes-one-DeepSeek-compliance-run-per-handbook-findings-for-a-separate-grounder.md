---
id: TASK-365
title: >-
  COMPLY.1 Handbook compliance pass on the unpushed 1·B change: clause packs for
  Spec 122, McFrontend, McStorage, McIncrement and McLanes, one DeepSeek
  compliance run per handbook, findings for a separate grounder
status: BUILT
assignee:
  - '@lane-BL-COMPLY'
created_date: '2026-11-20T12:38:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-COMPLY/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-COMPLY/FINDINGS.md
type: build
ordinal: 65012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): 'Definitely, essential we have a non compliance build again - the entire reason for this approach. How do we get it right for the remainder of the increments and enrure its right'. Scope now: (1) one clause pack per handbook under .claude/review-templates/packs/: the binding clauses quoted VERBATIM with file:line, nothing paraphrased, nothing invented; (2) one DeepSeek compliance lens run per pack over the diff 9f04d9074..3a36e8b26 (src, mobile, scripts); (3) every finding listed untriaged for a separate grounder; no product code changed. Files: .claude/review-templates/packs/spec-122.md, .claude/review-templates/packs/mcfrontend.md, .claude/review-templates/packs/mcstorage.md, .claude/review-templates/packs/mcincrement.md, .claude/review-templates/packs/mclanes.md, .claude/review-templates/README.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each pack quotes only verbatim clauses, each with file:line that resolves
- [x] #2 One compliance lens output per handbook committed in the lane report dir
- [x] #3 FINDINGS.md lists every finding untriaged with the clause and the diff line
- [x] #4 No file under src, mobile or scripts changed
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
1. Locate handbooks; write five packs of verbatim clauses with file:line and mechanical check (AC1). 2. Cut the diff into parts (route+compute, mobile, surface content+schema, scripts) excluding generated/golden/fixtures; run compliance lens per pack and part, outputs into the lane report dir (AC2). 3. FINDINGS.md lists every finding untriaged with clause and diff line (AC3). 4. Confirm no file under src, mobile, scripts changed; README section; one docs commit (AC4).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-COMPLY, worktree /Users/brettpreston_macmini/Buildo-wt-comply, branch wf1/inc1b-comply), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Packs (24 files, whole handbook rule lists with source/generator/count headers) in .claude/review-templates/packs; 104 compliance lens runs (pass files) and FINDINGS.md (491 untriaged findings, coverage table, Airtight scope question) in docs/reports/lanes/2026-11-20/BL-COMPLY; README section added; no file under src, mobile or scripts changed. Commit sha in commit.out and the lane report. Hooks: see commit.out.
<!-- SECTION:FINAL_SUMMARY:END -->
