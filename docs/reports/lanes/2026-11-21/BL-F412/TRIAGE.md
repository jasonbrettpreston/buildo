# TRIAGE.proposed.md for the lane (task-412, grounder Cairn-Ground-O412). The lane copies it to docs/reports/lanes/2026-11-21/BL-F412/TRIAGE.md and writes its own outcome lines from it.
# fixed lines: sha 52a49566e (feat(08_agents): the review-followups row) touches the path named; each is a plan-stage finding whose fold is built in that commit.
# ruling lines: decision-135 (RR-0350) for the Q3 order question. pile lines: LOW or NIT only, each with a reason true of that finding. Nothing above LOW is piled.
# The two commented lines are the two CONFIRMED HIGH and MED output findings that need a RECORDS fix (FIX ROUND 1): they have no outcome line until the fix commit exists; then the lane writes: out-compliance-agents-s7-s11#1 fixed:<sha> docs/reports/reviews/task-412/FOLD-CHECK.md and out-compliance-agents-s7-s11#2 fixed:<sha> backlog/tasks/task-412 - FOLLOWUPS.ROW-review_followups.md-gets-a-rule-list-row-so-a-deferral-has-its-Spec-08-home.md

plan-compliance-agents-s5-1to3#1 ruling:decision-135
plan-compliance-agents-s5-1to3#2 fixed:52a49566e scripts/analysis/rule-lists.json
plan-compliance-eng-all#1 ruling:decision-135
plan-compliance-eng-all#3 fixed:52a49566e src/tests/backlog/rule-lists-table.logic.test.ts
plan-compliance-five-words#1 ruling:decision-135
plan-compliance-five-words#2 fixed:52a49566e scripts/analysis/rule-lists.json
plan-compliance-inc-S#1 ruling:decision-135
plan-compliance-inc-S#2 fixed:52a49566e scripts/analysis/rule-lists.json
plan-compliance-inc-S#3 fixed:52a49566e scripts/analysis/rule-lists.json
plan-compliance-ms-S#1 ruling:decision-135
plan-compliance-ms-S#3 fixed:52a49566e scripts/analysis/rule-lists.json
plan-compliance-orchestrator-doc17#1 ruling:decision-135
plan-compliance-plan-protocol#1 ruling:decision-135
plan-compliance-queue-137#1 fixed:52a49566e backlog/tasks/task-412 - FOLLOWUPS.ROW-review_followups.md-gets-a-rule-list-row-so-a-deferral-has-its-Spec-08-home.md
plan-compliance-queue-137#5 ruling:decision-135
plan-error-paths#2 fixed:52a49566e src/tests/backlog/rule-lists-table.logic.test.ts
plan-plan-review-deepseek#3 fixed:52a49566e backlog/tasks/task-412 - FOLLOWUPS.ROW-review_followups.md-gets-a-rule-list-row-so-a-deferral-has-its-Spec-08-home.md
plan-plan-review-deepseek#6 fixed:52a49566e scripts/analysis/rule-lists.json
plan-plan-review-deepseek#7 fixed:52a49566e scripts/analysis/rule-lists.json
out-compliance-eng-all#2 pile:"the SPEC LINK comment cites Spec 08 section 7 rule 6 only, while the row also attaches queue-137 (Spec 137 rule 2); incomplete citation, no behaviour"
out-compliance-agents-s7-s11#1 fixed:90eebe679 docs/reports/reviews/task-412/FOLD-CHECK.md
out-compliance-agents-s7-s11#2 fixed:90eebe679 backlog/tasks/task-412 - FOLLOWUPS.ROW-review_followups.md-gets-a-rule-list-row-so-a-deferral-has-its-Spec-08-home.md
