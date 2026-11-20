---
id: TASK-375
title: >-
  FIX.TOOLS Review and proof tooling: the lens line passes the rule context, the
  security lens fires for admin and PII, the review template substitutes safely,
  proof-slice reads its limits from settings (D11, D10, two review-tool defects)
status: RUNNING
assignee:
  - '@lane-BL-FIXTOOLS'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-20T15:28:00Z'
labels:
  - McFix
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# PLAN task-375 FIX.TOOLS (lane BL-FIXTOOLS)

## Confirmed on the head (8383e9e4c), by defect
- D10a buffer: scripts/analysis/proof-slice.mjs:132 `maxBuffer: 16 * 1024 * 1024` (literal). Variable exists: scripts/seeds/logic_variables.json:9759 tooling_spawn_max_buffer_mb (256, pinned), reader scripts/analysis/gates/variables.mjs gateVariable() used the same way at scripts/analysis/gates/net-new.mjs:155.
- D10b timeout: proof-slice.mjs:21 `DEFAULT_TIMEOUT_MS = 120000`. No registered tooling_ variable for it exists (grep of the seed: only tooling_spawn_max_buffer_mb, tooling_precommit_budget_*). Registering one needs a migration number claim in ~/Buildo-scratch/ids (outside this lane's write scope) plus a migration, seed row, registry doc and the control-panel key list. NOT done in this lane; listed as an owed item.
- D11a plan lens commands: scripts/analysis/backlog-lane.mjs lensLine, "Plan review lenses: ... each `${cmd} ${ctx} --template ...`" has no --context (the output lens commands in the same line do). Plan lenses see "(no pasted context provided)" (scripts/deepseek-review.js:189).
- D11b security lens never fires for admin or PII: the regex is scripts/analysis/rule-lists.mjs:128 `/entitlement|auth|stripe|metered/i` inside lensSet (shared with the close check). The brief forbids changing rule-lists.mjs. NOT fixed; listed.
- D11c review-template dollar expansion: ALREADY FIXED by task-366: scripts/lib/review-template.js:74-78 one pass with a function replacer; test src/tests/review-template.logic.test.ts:193-198.
- D11d lens-compliance.md placeholder twice: ALREADY FIXED by task-366: one {{PLAN}} (line 34) and one {{SPECS}} (line 39); test src/tests/review-lens-template.infra.test.ts:101-103.

## Changes (smallest; existing components)
1. proof-slice.mjs: import gateVariable from ./gates/variables.mjs; realIo().run uses `maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024`; export realIo (so a test can spawn a real child). One move: the child-output ceiling 16 MiB -> 256 MiB (the registered value, "the largest former literal, so no limit shrinks", seed description). No stored value or golden moves; a row that wrote more than 16 MiB used to fail with ENOBUFS and now passes.
2. backlog-lane.mjs lensLine: the plan lens clause gets ` --context <pasted-context file>` (same token the output lenses carry), with one sentence naming it. No other text moves.
## Tests (red first through the real hooks)
- src/tests/proof-slice.logic.test.ts: realIo().run of a child writing 20 MiB to stdout returns status 0 and a 20 MiB stdout; red now (ENOBUFS at 16 MiB). And no `16 * 1024 * 1024` literal in the runner source.
- src/tests/backlog/backlog-lane.logic.test.ts: the plan-lens segment of the lens line contains --context for every plan lens command; red now.
## Not touched
check-lane-close.mjs, rule-lists.mjs, rule-lists.json; operator items C1-C5, 48/44 px, the 60 s wait value.
## Operator/orchestrator items owed
(1) D10b timeout variable needs a migration number claim (outside write scope). (2) D11b security regex lives in rule-lists.mjs (forbidden to change here).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-FIXTOOLS, worktree /Users/brettpreston_macmini/Buildo-wt-fixtools, branch wf1/inc1b-fixtools), RR-0240

Grounder verdict 2026-11-20 (separate read-only agent, launched by the orchestrator): SAFE TO FOLD as a PARTIAL fix; folded onto wf2/board. Fixed: D10 buffer (proof-slice.mjs reads tooling_spawn_max_buffer_mb). STILL OPEN, task not done: D10 timeout DEFAULT_TIMEOUT_MS = 120000 typed (needs a migration number from the ID ledger, seed row, registry doc; operator typed GO for the DB); D11b security lens terms for admin and PII at scripts/analysis/rule-lists.mjs:128; the plan-lens --context token is a placeholder, not a path. The commit subject "proof runner tunables registered" overstates: one existing variable is read, none registered.
<!-- SECTION:NOTES:END -->
