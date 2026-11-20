---
id: TASK-393
title: PAGE.SEARCH-W The web search page drawn from the same table rows
status: LATER
assignee: []
created_date: '2026-11-20T15:24:00Z'
updated_date: '2026-11-20T15:26:00Z'
labels:
  - McFix
milestone: m-1
dependencies: []
type: build
ordinal: 93012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WAITS on PAGE.SEARCH-M. Same rows, targets web; the existing render half of the web binding unchanged; the shared footer builder reused, not retyped; the parity test shrinks to what the shared rows no longer guarantee. Operator 2026-11-20 (verbatim): "approved ... 1. Go on the schema extension plus the semi pilot, with the stop rule. 2. Convert the other three pages only after the pilot passes. 3. Leave the reports as components ... - remember the app is not beign used - we are in development" and earlier "I think we should do things right in a standardized, modularized without spaggetti code type way." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 "Sizing: page structure as data" and "Operator APPROVES the conversion". Target form (Spec 126:59, :74, :921, :928; fe.02): page block order, texts, actions and which block shows under a named flag are DATA rows of the page table scripts/surfaces/_schema/static-page.json (schema static-page.schema.json), drawn by shared section-kind renderers; derivation, geometry, input state and fetch stay code; style class tables stay typed per platform; the report renderers are NOT converted. Acceptance: the page goldens are reproduced byte for byte by the generic builder from the table row (list every golden that moves and why; none should). Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/SearchBinding.tsx, src/tests/surfaces/search-parity.golden.test.ts
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
