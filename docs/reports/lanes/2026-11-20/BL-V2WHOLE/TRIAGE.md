# TRIAGE: one outcome per CONFIRMED finding of the grounder file (sha256 34e94394f389, 80 findings)
# forms: <id> fixed:<sha> <path> | <id> task:task-N (that task text names it) | <id> wontfix:"<reason>" (LOW and NIT only)
out-code-review#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-code-review#2 fixed:ac5884995 scripts/analysis/rule-lists.mjs
out-code-review#3 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-code-review#4 task:task-410
out-code-review#5 task:task-410
out-code-review#6 wontfix:"tests drive the hook as a process by suite design; chunkErrors is exercised through it by the planted cases"
out-compliance-agents-s5-1to3#1 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-agents-s5-1to3#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11-p1#1 task:task-410
out-compliance-agents-s7-s11-p1#2 wontfix:"lens-input on a diff that fits is not the route for the unsplit lens runs: the brief runs the lens on the diff file itself"
out-compliance-agents-s7-s11-p1#3 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-agents-s7-s11-p1#5 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-agents-s7-s11-p2#1 wontfix:"process note: the validation seats are the grounders that ran after the build; no code fix exists for it"
out-compliance-agents-s7-s11-p2#2 wontfix:"the plan block of the card is superseded by the dated notes and the lane report; nothing executable depends on it"
out-compliance-agents-s7-s11-p2#3 wontfix:"kept: the not-a-diff case also names the file in the missing-file line, so the assertion still fails if either refusal disappears"
out-compliance-agents-s7-s11-p3#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-agents-s7-s11-p3#2 wontfix:"the infra freeze lift for the V2 tasks is the operator approval of the McFix V2 launch recorded in the entry the task quotes; no hook requires a by-name line"
out-compliance-agents-s7-s11-p4#1 task:task-410
out-compliance-agents-s7-s11-p4#3 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-agents-s7-s11-p4#5 wontfix:"the Files line is read as the union of the launch copy and the current one, so widening it adds review and hides nothing"
out-compliance-eng-all-p1#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-eng-all-p1#3 wontfix:"non-null assertions in new tests mirror the neighbouring test style of the file"
out-compliance-eng-all-p2#2 wontfix:"the generated page is now checked in pre-commit (board c8efb23f5 page check)"
out-compliance-eng-all-p2#3 wontfix:"the test builds the prompt hash independently of lensPromptHash on purpose, so a drift in the tool shows as a red test"
out-compliance-eng-all-p2#5 wontfix:"the red output is in the lane scratch dir and its counts are in the lane report"
out-compliance-eng-all-p3#2 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-eng-all-p4#1 wontfix:"the self-skeptical checklist is an in-response artifact, not stored"
out-compliance-eng-all-p4#2 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-eng-all-p5#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-eng-all-p5#3 wontfix:"no property test for the packing arithmetic: the invariants (every path once, inside the bound) are asserted on 300 and 141 file cases"
out-compliance-eng-all-p6#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-eng-all-p6#5 wontfix:"the dated notes and the behaviour land in one fold of the same lane; no hook requires one commit"
out-compliance-five-words#2 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-orchestrator-doc17-p1#1 task:task-410
out-compliance-orchestrator-doc17-p1#2 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-orchestrator-doc17-p2#3 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-plan-protocol#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-plan-protocol#4 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-queue-137-p1#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p1#2 wontfix:"same as agents-s7-s11-p1#2: the unsplit lens run reads the diff file, bound to its sha256"
out-compliance-queue-137-p1#3 task:task-410
out-compliance-queue-137-p1#4 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p1#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-queue-137-p2#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p3#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p3#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p3#3 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p4#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p4#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p4#4 task:task-410
out-compliance-queue-137-p4#5 wontfix:"same as agents-s7-s11-p3#2"
out-error-paths#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#3 wontfix:"a diff header with a quoted name is refused in both orders; the order only changes which line the lane reads"
out-error-paths#4 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#5 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
plan-compliance-agents-s5-1to3#3 task:task-410
plan-compliance-agents-s5-1to3#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note, same as agents-s7-s11-p2#1"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"same as eng-all-p5#3"
plan-compliance-inc-S#2 task:task-410
plan-compliance-inc-S#3 task:task-410
plan-compliance-orchestrator-doc17#1 task:task-410
plan-compliance-orchestrator-doc17#2 task:task-410
plan-compliance-orchestrator-doc17#3 task:task-410
plan-compliance-orchestrator-doc17#5 task:task-410
plan-compliance-orchestrator-doc17#6 task:task-410
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 task:task-410
plan-error-paths#3 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
