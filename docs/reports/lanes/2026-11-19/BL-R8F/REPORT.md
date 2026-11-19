# REPORT BL-R8F (task-314 R8f)
Commit e80f97485 (hooks ran: "GATE OK", "POLICY CHECKS OK (commit-msg)" in commit.out). No push, no DB, no code.

| RR id | register source | decision file | tasks named | G2 result |
|---|---|---|---|---|
| RR-0232 | operator | decision-71 | task-306, 311, 312, 313, 131, 293, 296, 297, 298, 303 | exit 0 (decisions.out) |
| RR-0233 | operator | decision-72 | same ten | exit 0 |
| RR-0235 | operator | decision-73 | task-309 | exit 0 |
| RR-0242 | operator | decision-74 | task-310 | exit 0 |
| RR-0248 | operator | decision-75 | task-3, 4, 5, 8, 11, 314 | exit 0 |
| RR-0223, 0225, 0227, 0238, 0240 | reading | NOT WRITTEN | (would map: task-1; 0225 task-1, task-305; 0238 task-1, task-309; 0240 task-310) | not run |

Why five are not written: register-table.txt shows kind ruling but source reading ("ORCHESTRATOR READING (NOT a ruling)" in the brief CONTEXT). G2 writes "Operator, verbatim" and source: operator (backlog-decision.mjs writeDecisionBody), which would misattribute orchestrator text (Spec 137 rule 4; RR-0190, MORNING-DECISIONS.md:813). Register: 32 rows RR-0220..RR-0251, 10 kind ruling, 22 entry, none had a decision file before.
Review r1: r1-plan.txt (verdict FAIL on pack quality); TRIAGE.md: 3 KEEP folded, rest REJECT with reasons.
Task-2 note appended in the same commit (commit stat shows task-2 file).
Side effect: G2 appends the M-246 dated note to every named task, so those task files are in the commit.
UNVERIFIED: that the task-309 context pack now lists decision-71..75 under "Decisions naming this task" (not regenerated).
Question: do you confirm the five reading rows should stay out, or give the operator's own words to enter them?
STATUS: BL-R8F built; 5 of 10 ruling rows written (decision-71..75), 5 held back as non-operator words.
