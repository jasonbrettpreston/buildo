# TRIAGE: one outcome per CONFIRMED finding of the grounder file (sha256 34e94394f389, 80 findings)
# forms: <id> fixed:<sha> <path> | <id> task:task-N (that task text names it) | <id> wontfix:"<reason>" (LOW and NIT only)
out-code-review#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-code-review#2 fixed:ac5884995 scripts/analysis/rule-lists.mjs
out-code-review#3 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-code-review#4 task:task-375
out-code-review#5 task:task-410
out-code-review#6 wontfix:"tests drive the hook as a process by suite design; chunkErrors is exercised through it by the planted cases"
out-compliance-agents-s5-1to3#1 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
out-compliance-agents-s5-1to3#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11-p1#1 task:task-375
out-compliance-agents-s7-s11-p1#2 wontfix:"lens-input on a diff that fits is not the route for the unsplit lens runs: the brief runs the lens on the diff file itself"
out-compliance-agents-s7-s11-p1#3 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-agents-s7-s11-p1#5 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-agents-s7-s11-p2#1 wontfix:"process note: the validation seats are the grounders that ran after the build; no code fix exists for it"
out-compliance-agents-s7-s11-p2#2 wontfix:"the plan block of the card is superseded by the dated notes and the lane report; nothing executable depends on it"
out-compliance-agents-s7-s11-p2#3 wontfix:"kept: the not-a-diff case also names the file in the missing-file line, so the assertion still fails if either refusal disappears"
out-compliance-agents-s7-s11-p3#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-agents-s7-s11-p3#2 wontfix:"the infra freeze lift for the V2 tasks is the operator approval of the McFix V2 launch recorded in the entry the task quotes; no hook requires a by-name line"
out-compliance-agents-s7-s11-p4#1 task:task-375
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
out-compliance-queue-137-p1#3 task:task-375
out-compliance-queue-137-p1#4 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p1#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
out-compliance-queue-137-p2#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p3#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p3#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p3#3 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p4#1 fixed:c8efb23f5 scripts/analysis/rule-lists.json
out-compliance-queue-137-p4#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p4#4 task:task-375
out-compliance-queue-137-p4#5 wontfix:"same as agents-s7-s11-p3#2"
out-error-paths#1 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#2 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#3 wontfix:"a diff header with a quoted name is refused in both orders; the order only changes which line the lane reads"
out-error-paths#4 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
out-error-paths#5 fixed:f5cc11a99 scripts/hooks/check-lane-close.mjs
plan-compliance-agents-s5-1to3#3 wontfix:"a clause over two files is judged per chunk by design; recorded as a known limit with its cheap improvement (the head could carry the full path list)"
plan-compliance-agents-s5-1to3#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note, same as agents-s7-s11-p2#1"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:7d1ae7a6c docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"same as eng-all-p5#3"
plan-compliance-inc-S#2 task:task-375
plan-compliance-inc-S#3 task:task-375
plan-compliance-orchestrator-doc17#1 task:task-375
plan-compliance-orchestrator-doc17#2 task:task-375
plan-compliance-orchestrator-doc17#3 task:task-375
plan-compliance-orchestrator-doc17#5 task:task-375
plan-compliance-orchestrator-doc17#6 task:task-375
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed); no change of the whole-change proof depends on it"
plan-error-paths#3 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs

## ROUND 3 GROUNDER (file sha256 56b951b88aeef3e8, 51 CONFIRMED findings; ids are those of the round-3 outputs, positional)
out-code-review#2 wontfix:"documentation only: the JSDoc shape of closeErrors omits three optional fields that the code reads with defaults"
out-code-review#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
out-code-review#4 wontfix:"a one-letter parameter name inside a function of eight lines"
out-compliance-agents-s5-1to3-p1#1 task:task-375
out-compliance-agents-s5-1to3-p1#2 task:task-410
out-compliance-agents-s5-1to3-p1#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11-p1#1 task:task-375
out-compliance-agents-s7-s11-p1#3 wontfix:"the known limits sit in the task KNOWN LIMITS note, the lane report and the dated notes; review_followups.md is not read by any gate"
out-compliance-agents-s7-s11-p2#1 wontfix:"the grounder ran the green side through the real hook in a scratch clone and it closed"
out-compliance-agents-s7-s11-p2#2 wontfix:"process note: this ticket adversary is that cross-read; no code fix exists"
out-compliance-agents-s7-s11-p2#3 task:task-375
out-compliance-agents-s7-s11-p2#4 wontfix:"the grounder checked all nine globs against git ls-files; the test samples one real golden and three negatives by design"
out-compliance-eng-all-p1#2 wontfix:"the red outputs are in the lane scratch dir and their counts are in the lane report"
out-compliance-eng-all-p2#1 wontfix:"non-null assertions in new tests mirror the neighbouring test style of the file"
out-compliance-eng-all-p2#3 wontfix:"the chunk arithmetic is asserted on planted cases (missing chunk, edited stamp, last part dropped); no property test"
out-compliance-eng-all-p2#4 wontfix:"the dated notes and the behaviour land in one fold of the same lane; no hook requires one commit"
out-compliance-five-words-p1#3 wontfix:"a commit-msg script is a hook in the repo sense; the word check is wording only"
out-compliance-inc-S-p1#1 task:task-375
out-compliance-orchestrator-doc17-p1#1 task:task-375
out-compliance-plan-protocol-p1#3 wontfix:"if a lane narrows its Files line the material omits a launch-covered file and the check refuses it (fail closed); the brief reads the current line by design"
out-compliance-plan-protocol-p5#1 wontfix:"the infra freeze lift for the V2 tasks is the operator approval of the McFix V2 launch quoted in the task; no hook requires a by-name line"
out-compliance-queue-137-p1#1 task:task-410
out-compliance-queue-137-p1#2 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
out-compliance-queue-137-p1#5 wontfix:"a lane in a clone without the local board branch fails closed on the brief command; the worktrees of this repo always carry it"
out-error-paths#3 task:task-410
out-error-paths#4 wontfix:"a killed git child gives a failing status and the close is refused (fail closed); only the message is missing"
out-error-paths#5 wontfix:"a missing prompt builder kills the hook with a nonzero exit, so the close is refused (fail closed)"
plan-compliance-agents-s5-1to3#3 wontfix:"a clause over two files is judged per chunk by design; recorded as a known limit with its cheap improvement (the head could carry the full path list)"
plan-compliance-agents-s5-1to3#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note, same as agents-s7-s11-p2#2"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"no property test for the packing arithmetic: the invariants are asserted on the 300 and 141 file cases"
plan-compliance-inc-S#2 task:task-375
plan-compliance-inc-S#3 task:task-375
plan-compliance-orchestrator-doc17#1 task:task-375
plan-compliance-orchestrator-doc17#2 task:task-375
plan-compliance-orchestrator-doc17#3 task:task-375
plan-compliance-orchestrator-doc17#5 task:task-375
plan-compliance-orchestrator-doc17#6 task:task-375
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed); no change of the whole-change proof depends on it"
plan-error-paths#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs

## ROUND 4 GROUNDER (file sha256 b18130880897, 52 CONFIRMED and 1 CONFLICT; ids are those of the round-4 outputs, positional; the CONFLICT is held for the operator)
plan-compliance-agents-s5-1to3#3 wontfix:"a clause over two files is judged per chunk by design; recorded as a known limit with its cheap improvement (the head could carry the full path list)"
plan-compliance-agents-s5-1to3#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note: the validation seats are the grounders that ran after the build"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"no property test for the packing arithmetic: the invariants are asserted on the 300 and 141 file cases"
plan-compliance-inc-S#2 task:task-375
plan-compliance-inc-S#3 task:task-375
plan-compliance-orchestrator-doc17#1 task:task-375
plan-compliance-orchestrator-doc17#2 task:task-375
plan-compliance-orchestrator-doc17#3 task:task-375
plan-compliance-orchestrator-doc17#5 task:task-375
plan-compliance-orchestrator-doc17#6 task:task-375
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed); no change of the whole-change proof depends on it"
plan-error-paths#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
out-code-review-p1#2 wontfix:"the brief names refs/heads/<base_ref> and the board branch of this repo is that local branch in every worktree; a clone without it fails closed in the hook"
out-code-review-p1#3 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed); no change of the whole-change proof depends on it"
out-code-review-p1#5 wontfix:"documentation only: the JSDoc shape omits three optional fields read with defaults"
out-code-review-p2#1 wontfix:"test hygiene: the first test already asserts the stamped paths"
out-code-review-p2#4 wontfix:"test helper returns NaN for a missing stamp, which fails the assertions that read it"
out-code-review-p2#5 wontfix:"test message text only"
out-code-review-p2#6 wontfix:"a non-null assertion on the first input in a test whose earlier assertion proves it exists"
out-compliance-agents-s5-1to3-p1#1 fixed:065f85a02 docs/specs/00-architecture/08_agents.md
out-compliance-agents-s5-1to3-p1#2 wontfix:"same as out-code-review-p1#2"
out-compliance-agents-s7-s11-p1#1 fixed:7116dabbc scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11-p1#2 task:task-410
out-compliance-agents-s7-s11-p1#3 fixed:a8a3ca2db scripts/analysis/rule-lists.mjs
out-compliance-agents-s7-s11-p1#5 fixed:065f85a02 docs/specs/00-architecture/08_agents.md
out-compliance-agents-s7-s11-p2#2 fixed:7116dabbc src/tests/backlog/check-lane-close.logic.test.ts
out-compliance-agents-s7-s11-p2#3 wontfix:"the grounder checked all nine globs against git ls-files; the test samples one real golden and negatives by design"
out-compliance-eng-all-p1#3 wontfix:"the dated notes and the behaviour land in one fold of the same lane; no hook requires one commit"
out-compliance-eng-all-p1#4 wontfix:"same as out-code-review-p1#2"
out-compliance-eng-all-p2#1 wontfix:"the chunk arithmetic is asserted on planted cases; no property test"
out-compliance-eng-all-p3#1 wontfix:"non-null assertions in new tests mirror the neighbouring test style"
out-compliance-eng-all-p3#3 wontfix:"no property test; the invariants are asserted on the 300 and 141 file cases"
out-compliance-five-words-p1#3 wontfix:"a commit-msg script is a hook in the repo sense; wording only"
out-compliance-orchestrator-doc17-p1#2 wontfix:"attaching doc-17 whole is the rule-list table row owned by the list tasks (404 and 406); the lens-input of this task renders whatever list the table names"
out-compliance-queue-137-p1#1 ruling:"agreed - The grounder's recommendation: amend Rule 3 for lane build and fix tasks to the two-commit close." (operator, MORNING-DECISIONS.md entry 2026-11-20 · Operator AGREES the Rule 3 amendment and RULES on material too large to review)
out-compliance-queue-137-p1#5 task:task-375
out-compliance-queue-137-p1#6 wontfix:"if a lane narrows its Files line the material omits a launch-covered file and the check refuses it (fail closed); the brief reads the current line by design"
out-error-paths-p1#1 fixed:f6f8b5944 scripts/hooks/check-lane-close.mjs
out-error-paths-p1#4 wontfix:"a failed git log gives no launch commit and the close is refused (fail closed); only the message wording is generic"
out-error-paths-p1#5 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed); no change of the whole-change proof depends on it"
out-error-paths-p1#6 wontfix:"a broken prompt builder kills the hook with a nonzero exit, so the close is refused (fail closed)"

## ROUND 5 GROUNDER (file sha256 1afa92a8a037, 54 CONFIRMED findings; ids are those of the round-5 outputs, positional)
plan-compliance-agents-s5-1to3#3 wontfix:"a clause over two files is judged per chunk by design; recorded as a known limit"
plan-compliance-agents-s5-1to3#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note: the validation seats are the grounders that ran after the build"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"no property test for the packing arithmetic; the invariants are asserted on the 300 and 141 file cases"
plan-compliance-inc-S#2 task:task-375
plan-compliance-inc-S#3 task:task-375
plan-compliance-orchestrator-doc17#1 task:task-375
plan-compliance-orchestrator-doc17#2 task:task-375
plan-compliance-orchestrator-doc17#3 task:task-375
plan-compliance-orchestrator-doc17#5 task:task-375
plan-compliance-orchestrator-doc17#6 task:task-375
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed)"
plan-error-paths#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
out-code-review-p1#2 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed)"
out-code-review-p1#4 task:task-375
out-code-review-p1#5 wontfix:"the brief builds the diff from refs/heads/<base_ref> and the current Files line; the board branch is that local branch in every worktree and a narrowed Files line makes the check refuse the missing file (fail closed)"
out-code-review-p2#1 wontfix:"test hygiene: the first test already asserts the stamped paths"
out-code-review-p2#4 wontfix:"a test helper returning NaN for a missing stamp fails the assertions that read it"
out-code-review-p2#5 wontfix:"test message text only"
out-code-review-p2#6 wontfix:"a non-null assertion on the first input in a test whose earlier assertion proves it exists"
out-compliance-agents-s5-1to3-p1#1 fixed:f6f8b5944 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3-p1#2 fixed:f6f8b5944 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3-p2#3 task:task-375
out-compliance-agents-s7-s11-p1#4 fixed:f6f8b5944 scripts/hooks/check-lane-close.mjs
out-compliance-eng-all-p1#2 wontfix:"the red outputs are in the lane scratch dir and their counts are in the lane report"
out-compliance-eng-all-p1#3 wontfix:"the dated notes and the behaviour land in one fold of the same lane; no hook requires one commit"
out-compliance-eng-all-p1#4 wontfix:"the brief builds the diff from refs/heads/<base_ref> and the current Files line; the board branch is that local branch in every worktree and a narrowed Files line makes the check refuse the missing file (fail closed)"
out-compliance-eng-all-p2#1 wontfix:"the chunk arithmetic is asserted on planted cases; no property test"
out-compliance-eng-all-p2#3 wontfix:"the chunk arithmetic is asserted on planted cases; no property test"
out-compliance-eng-all-p3#1 wontfix:"non-null assertions in new tests mirror the neighbouring test style"
out-compliance-eng-all-p3#2 wontfix:"no property test; the invariants are asserted on the 300 and 141 file cases"
out-compliance-eng-all-p3#3 wontfix:"no property test; the invariants are asserted on the 300 and 141 file cases"
out-compliance-five-words-p1#1 wontfix:"the brief builds the diff from refs/heads/<base_ref> and the current Files line; the board branch is that local branch in every worktree and a narrowed Files line makes the check refuse the missing file (fail closed)"
out-compliance-five-words-p1#2 wontfix:"the brief builds the diff from refs/heads/<base_ref> and the current Files line; the board branch is that local branch in every worktree and a narrowed Files line makes the check refuse the missing file (fail closed)"
out-compliance-orchestrator-doc17-p1#1 task:task-410
out-compliance-orchestrator-doc17-p1#2 wontfix:"same as orchestrator-doc17-p1#1: the attached list is a table row owned by the list tasks"
out-compliance-plan-protocol-p1#1 task:task-375
out-compliance-plan-protocol-p1#3 wontfix:"the brief builds the diff from refs/heads/<base_ref> and the current Files line; the board branch is that local branch in every worktree and a narrowed Files line makes the check refuse the missing file (fail closed)"
out-compliance-policy-124-s2-s5-p1#4 wontfix:"the correcting note directly follows the older sentence and says Rule 3 is amended for lane build and fix tasks"
out-compliance-queue-137-p1#3 wontfix:"the record paths in the Rule 3 note are what the check enforces; the operator agreed the two-commit close"
out-error-paths-p1#2 fixed:a8a3ca2db scripts/analysis/rule-lists.mjs
out-error-paths-p1#3 task:task-375
out-error-paths-p1#4 wontfix:"no timeout on the spawned git; a killed child is a failing status and the close is refused (fail closed)"

## ROUND 6 GROUNDER (file sha256 b3425b2c1d6c, 40 CONFIRMED findings; ids are those of the round-6 outputs, positional)
plan-compliance-agents-s5-1to3#3 wontfix:"a clause over two files is judged per chunk by design; recorded as a known limit"
plan-compliance-agents-s5-1to3#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-agents-s7-s11#6 wontfix:"process note: the validation seats are the grounders that ran after the build"
plan-compliance-eng-all#2 wontfix:"the checklist is an in-response artifact, not stored"
plan-compliance-eng-all#5 fixed:3852f74e9 docs/specs/00-architecture/08_agents.md
plan-compliance-eng-all#6 wontfix:"the four templates hold the placeholder once each (line 34); pinning them is the template test of task-406"
plan-compliance-eng-all#7 wontfix:"no property test for the packing arithmetic; the invariants are asserted on the 300 and 141 file cases"
plan-compliance-inc-S#2 task:task-375
plan-compliance-inc-S#3 task:task-375
plan-compliance-orchestrator-doc17#1 task:task-375
plan-compliance-orchestrator-doc17#2 task:task-375
plan-compliance-orchestrator-doc17#3 task:task-375
plan-compliance-orchestrator-doc17#5 task:task-375
plan-compliance-orchestrator-doc17#6 task:task-375
plan-compliance-plan-protocol#1 wontfix:"moot after the build: the commands are in the lane report"
plan-compliance-plan-protocol#5 wontfix:"the measured call counts replace the estimate in the lane report"
plan-error-paths#1 wontfix:"the estimate and the negative room figure only name the wrong cause in a refusal that is already a refusal (fail closed)"
plan-error-paths#3 fixed:98c9f9a8e scripts/hooks/check-lane-close.mjs
plan-error-paths#6 task:task-410
plan-plan-review-deepseek#2 fixed:c94a13754 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 task:task-410
plan-plan-review-deepseek#7 fixed:ac5884995 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#8 fixed:e028b1976 scripts/analysis/backlog-lane.mjs
plan-plan-review-deepseek#11 fixed:0b1c432d5 scripts/hooks/check-lane-close.mjs
out-code-review-p1#2 task:task-375
out-code-review-p1#3 wontfix:"a commit that moves a task to a status outside the default finished set in a clone without the board is not refused; a clone without the board branch is outside the repo worktrees, and such a task is not a close of a finished status"
out-code-review-p1#4 wontfix:"the measured-room estimate is a prompt-size count; harmless"
out-compliance-agents-s5-1to3-p1#1 wontfix:"lens-input on a diff that fits is not the route for the unsplit lens runs: the brief runs the lens on the diff file itself"
out-compliance-agents-s5-1to3-p1#2 wontfix:"changed docs/reports and backlog paths outside the Files line may sit in a chunk by design: their text is compared like any other chunk"
out-compliance-agents-s5-1to3-p1#4 fixed:4de8fb86f scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11-p1#2 task:task-375
out-compliance-eng-all-p1#1 fixed:bb08d47b5 scripts/analysis/backlog-lane.mjs
out-compliance-eng-all-p2#3 wontfix:"the chunk arithmetic is asserted on planted cases; no property test"
out-compliance-plan-protocol-p1#2 wontfix:"the infra freeze lift for the V2 tasks is the operator approval of the McFix V2 launch quoted in the task; no hook requires a by-name line"
out-compliance-policy-124-s2-s5-p4#6 task:task-375
out-compliance-queue-137-p1#2 fixed:bb08d47b5 scripts/analysis/backlog-lane.mjs
out-error-paths-p1#2 wontfix:"a launch search that returns nothing is refused by the check (fail closed); the brief command degrading to a working-tree diff only affects the lane that already cannot close"
out-error-paths-p1#3 task:task-410
out-error-paths-p1#4 wontfix:"round-2 files (out-<lens>-rN.txt) are read for findings only by design (the brief says so)"
out-error-paths-p1#5 wontfix:"a broken prompt builder kills the hook with a nonzero exit, so the close is refused (fail closed)"
