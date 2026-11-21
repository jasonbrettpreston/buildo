# TRIAGE.proposed.md for the lane (task-418, round 2 at head 5790a5f08, grounder Cairn-Ground-O418). The lane copies it to docs/reports/lanes/2026-11-21/BL-PREP418/TRIAGE.md and writes its own outcome lines from it.
# fixed lines: sha 213342547 (feat(08_agents): plan-prep) touches both paths named; each such finding is a plan-stage defect whose fold is built and was driven by the grounder.
# pile lines: LOW or NIT only, each with a reason that is true of that finding. Nothing above LOW is piled. No CRITICAL, HIGH or MED output-stage finding is CONFIRMED at this head.
# The earlier MED (out-compliance-eng-all#3 of round 1, g418#1) was fixed in 6b0693a16 and the re-run outputs no longer carry it as a CRITICAL, HIGH or MED defect; the new lens ids are ruled in GROUNDER.md.
# The grounder's own LOW/NIT findings (g418#2 to g418#5 in GROUNDER.md) are not verdict ids; the lane may pile them in review_followups.md with the reasons given there.

plan-compliance-agents-s5-1to3#4 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-agents-s7-s11#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-agents-s7-s11#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-agents-s7-s11#5 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-agents-s7-s11#7 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-eng-all#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-five-words#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-five-words#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-five-words#4 fixed:213342547 src/tests/backlog/backlog-lane.logic.test.ts
plan-compliance-inc-S#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-inc-S#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-inc-S#6 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-ms-S#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-ms-S#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-ms-S#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-ms-S#4 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-orchestrator-doc17#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-orchestrator-doc17#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-orchestrator-doc17#4 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-plan-protocol#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-plan-protocol#6 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-queue-137#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-compliance-queue-137#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#3 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#4 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#5 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#6 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-error-paths#7 pile:"the same read-then-write race as out-error-paths#4 is still in post (no lock); two simultaneous posts could append two round lines; the gate then refuses (fail closed)"
plan-plan-review-deepseek#1 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#2 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#4 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#5 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#9 pile:"the folded in-memory build of the parts under --dry-run was not built (REPORT item 3): the dry run prints in-plan-compliance-<id>[-pN].txt; same as out-compliance-five-words#4"
plan-plan-review-deepseek#12 fixed:213342547 scripts/analysis/rule-lists.mjs
plan-plan-review-deepseek#14 pile:"no cap on the parts per list: a list that splits into many parts starts that many parallel review calls; lens-input never trims; the real lists split into at most one part today (9 inputs for 9 lists)"
out-code-review#2 pile:"the rev field is declared and set but never read in the test file; dead fixture state, harmless"
out-code-review#4 pile:"undo ignores its own exit status, so when restore fails (index.lock held) the message still says nothing is staged; the commit failure itself is reported and nothing is committed; needs a lock held across a failed commit"
out-compliance-five-words#4 pile:"the dry run prints in-plan-compliance-<id>[-pN].txt, a name that is not a file, so the printed review command is not runnable as printed and shows no output redirect; the deviation is ruled acceptable (counts and names right) but this cost is real; the gate does not read the dry run"
out-error-paths#1 pile:"this status call does not test its own exit status; the same git succeeded earlier (notDirty) and a wrong read skips only a commit that the launch dry run then shows missing; fail closed"
out-error-paths#2 pile:"the jobs come from files on disk and are never compared with the resolved lists, so a list that produced no input is skipped with a lower count and exit 0; the commit phase launch dry run then refuses naming the missing list (fail closed, caught late)"
out-error-paths#3 pile:"a crash or a full disk between these writes leaves partial plan files, and the retry says one review round per prep without telling which files to delete; needs a failing disk or a kill in a millisecond window"
out-error-paths#4 pile:"read then write without a lock; two simultaneous posts could append two equal round lines; the gate then reads N as 2 and refuses (fail closed); needs a simultaneous double invocation"
out-error-paths#5 pile:"the brief, lens-input, backlog task edit and the gate child processes have no timeout (only the review calls are bounded at 910 s), so a hung child blocks plan-prep; the operator can interrupt it"
out-error-paths#7 pile:"a missing or unspawnable backlog binary leaves stderr and stdout empty so the refusal reads backlog task edit failed with no cause (the reason is in e.error); the bin existence is checked by the same path elsewhere; cosmetic"
