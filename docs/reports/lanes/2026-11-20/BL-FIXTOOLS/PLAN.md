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
