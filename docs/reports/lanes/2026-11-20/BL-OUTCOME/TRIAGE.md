# TRIAGE: BL-OUTCOME task-399, outcome of every CONFIRMED id of the grounder's file (fix round 1); code commit bf773dd, evidence commit 032525629
# MED: the task: form needs the finding id in the card (one defect, five lens ids)
out-code-review#1 fixed:bf773dd scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3#2 fixed:bf773dd scripts/hooks/check-lane-close.mjs
out-compliance-agents-s7-s11#1 fixed:bf773dd scripts/hooks/check-lane-close.mjs
out-compliance-plan-protocol#2 fixed:bf773dd scripts/hooks/check-lane-close.mjs
out-compliance-queue-137#1 fixed:bf773dd scripts/hooks/check-lane-close.mjs
# the grounder's own ids
g399#1 fixed:032525629 docs/reports/lanes/2026-11-20/BL-OUTCOME/out-compliance-policy-124-s2-s5-p1.txt
g399#2 fixed:032525629 docs/reports/lanes/2026-11-20/BL-OUTCOME/plan-compliance-399-airtight-v3-122.txt
g399#3 fixed:bf773dd docs/specs/00-architecture/08_agents.md
g399#4 pile:"task: and ruling: read the lane's own index; the close steps merge the board first, so a card opened after launch is found; message wording only"
g399#5 fixed:bf773dd scripts/hooks/check-lane-close.mjs
g399#6 pile:"a later REJECTED line hiding a CONFIRMED is a grounder-authored forgery route listed as a known limit; owned by tasks 401 and 402"
# LOW and NIT carried
out-compliance-queue-137#2 fixed:bf773dd scripts/hooks/check-lane-close.mjs
out-compliance-agents-s5-1to3#3 fixed:bf773dd docs/specs/00-architecture/08_agents.md
out-compliance-inc-S#2 fixed:bf773dd docs/specs/00-architecture/08_agents.md
out-code-review#2 pile:"seat id class [a-z0-9]+ is the plan 4.3 grammar; the three real seat files parse in full, a file with no matching line is refused loudly"
out-code-review#4 pile:"the line field on the seat kinds entry is unread data; a one-line removal is not worth a fix round, filed for the next touch of the function"
out-compliance-agents-s5-1to3#6 pile:"a Seat line with a wrong hex length is dropped without a refusal but its findings still need outcomes through their verdict lines; filed for task-375"
out-compliance-agents-s5-1to3#7 pile:"the --outcomes command checks outcomes only (plan 4.6); the Final Summary block is checked at the close, README and brief name the close command"
out-compliance-eng-all#2 pile:"non-null assertion in a test file without an inline reason (Eng 2.3); a one-line comment, filed for the next touch of the test file"
out-compliance-eng-all#4 pile:"the 30 and 20 character floors are new literals with no contracts row; the gate-literal registration is card task-416"
out-compliance-orchestrator-doc17#3 pile:"the dated notes cite the MORNING-DECISIONS lines but not the RR records decision-118 and decision-123; filed for the next touch of the notes"
