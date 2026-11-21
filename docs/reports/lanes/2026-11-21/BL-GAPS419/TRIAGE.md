# TRIAGE BL-GAPS419 (task-419), rounds 1 to 4 (grounder Cairn-Ground-O419), after fix round 1; the closing round is records only
out-code-review-r1-p1#2 fixed:e5c3a48 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3-r1#2 fixed:e5c3a48 scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3-r1#3 fixed:f4c0a0b docs/specs/00-architecture/08_agents.md
out-compliance-eng-all-r1#2 task:task-426
out-compliance-eng-all-r1#3 fixed:f4c0a0b docs/specs/00-architecture/137_mcqueue.md
out-compliance-inc-S-r1#2 fixed:e5c3a48 scripts/hooks/check-lane-close.mjs
out-compliance-ms-S-r1#3 fixed:f4c0a0b docs/specs/00-architecture/137_mcqueue.md
out-compliance-orchestrator-doc17-r1#2 task:task-426
out-compliance-plan-protocol-r1#3 task:task-426
out-compliance-queue-137-r1#3 fixed:f4c0a0b docs/specs/00-architecture/137_mcqueue.md
g419#1 fixed:273d5bb docs/reports/lanes/2026-11-21/BL-GAPS419/plan-error-paths.txt
g419#2 pile:"usability only: the refusal quotes the whole parsed text and the name ends at the first comma or opening bracket by plan Q3; no defect gets through"
g419#3 fixed:e5c3a48 src/tests/backlog/backlog-lane.logic.test.ts
g419#4 fixed:e5c3a48 src/tests/backlog/check-lane-close.logic.test.ts
g419#5 ruling:decision-145
out-code-review-r2-p1#2 pile:"missing-file refusal omits the expected Plan line; a one-clause text change in check-lane-close.mjs, beyond the fix-round bound; the line is printed by the stale-line refusals"
out-code-review-r2-p1#3 pile:"a Plan line naming another task id is reported as a wrong hash; wording only, the expected line is printed in the same message; beyond the fix-round bound"
out-code-review-r2-p1#4 pile:"an indented Plan line (as inside a fenced block) passes, same tolerance as the GROUNDER-PLAN.md Plan check; NIT, beyond the fix-round bound"
out-compliance-eng-all-r2#2 task:task-426
out-compliance-ms-S-r2#2 task:task-426
out-compliance-orchestrator-doc17-r2#2 pile:"the 137 note states the FOLD-CHECK form without saying it is the plan grounder's design; wording only, a spec edit is beyond the fix-round bound"
out-compliance-orchestrator-doc17-r2#3 task:task-426
out-code-review-r3-p1#2 pile:"LOW, round 3: a Checked by name of the literal placeholder <name> or <> passes the form check; the gate cannot prove the name is a real separate agent (137 note, forgery routes tasks 401 and 402); a code change is outside this records-only closing round (RR-0364)"
out-error-paths-r3-p1#5 pile:"NIT, round 3: a git-ignored uncommitted FOLD-CHECK.md is refused with the word missing, the same wording as the GROUNDER-PLAN.md refusal; wording only, pinned by a test on purpose (g419#4); recorded not fixed (RR-0364)"
g419-r3#1 pile:"NIT, grounder round 3: the task file has a second, plan-time Files: line (line 77, eight paths) after the description line that every tool reads first (line 45, nine entries with CLAUDE.md); the tools agree, editing the task text would move its Plan hash; recorded (RR-0364)"
out-code-review-p1#5 pile:"NIT, round 4: a Plan line with the right hash and another task id gets the fold was checked on another text wording; same as out-code-review-r2-p1#3, wording only, a code change is outside this records-only closing round (RR-0364)"
out-error-paths-p1#3 pile:"NIT, round 4: the missing-file refusal does not print the expected Plan line; same as out-code-review-r2-p1#2, the stale-line refusals print it; wording only, recorded not fixed (RR-0364)"
out-compliance-inc-S#3 pile:"LOW, round 4: the 137 note does not say that the last of a repeated Checked by line counts, the rule the code applies and plan Q3 ruled; a note wording gap, no defect gets through; a spec edit is outside this records-only round (RR-0364)"
out-compliance-plan-protocol#5 pile:"LOW, round 4: the missing-file refusal prints the form but not the expected Plan line the 137 note says the refusal prints; same as out-code-review-r2-p1#2, wording only, recorded not fixed (RR-0364)"
