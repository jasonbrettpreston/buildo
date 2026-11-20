---
id: TASK-375
title: >-
  FIX.TOOLS Review and proof tooling: the lens line passes the rule context, the
  security lens fires for admin and PII, the review template substitutes safely,
  proof-slice reads its limits from settings (D11, D10, two review-tool defects)
status: LATER
assignee: []
created_date: '2026-11-20T13:33:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 75012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D11 scripts/analysis/backlog-lane.mjs:145 the plan lens commands carry no --context and :140 the security lens never fires for admin or PII (Spec 08 section 7 rule 4): fix both. scripts/lib/review-template.js:74-78 uses String.replace with the text as replacement (dollar sequences expand; tokens re-substituted); .claude/review-templates/lens-compliance.md:32 and :34 carry the plan placeholder twice so the material is sent twice: fix both. D10 scripts/analysis/proof-slice.mjs:21 and :132 a typed 120 s timeout and 16 MB buffer (Spec 132 core.8): read from tooling_ variables (scripts/seeds/logic_variables.json:9739 has tooling_spawn_max_buffer_mb). Waits on: task-366 (it edits backlog-lane.mjs and may already fix the review-template defects: take only what it left). Files: scripts/analysis/backlog-lane.mjs, scripts/lib/review-template.js, .claude/review-templates/lens-compliance.md, scripts/analysis/proof-slice.mjs
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 A lens run on a file containing dollar sequences and placeholder tokens sends the text unchanged, once (test, red first)
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
