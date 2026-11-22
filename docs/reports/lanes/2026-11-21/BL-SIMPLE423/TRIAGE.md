# TRIAGE BL-SIMPLE423 (task-423), output round 1, fix round 1 (RR-0374). Written by the lane; one outcome line per CONFIRMED id.

out-code-review-p1#1 fixed:a7e366cbb scripts/hooks/check-lane-close.mjs
out-compliance-rules-p1#2 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p2#1 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p3#1 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p4#1 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p4#2 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p5#1 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p6#1 fixed:a7e366cbb scripts/analysis/backlog-lane.mjs
out-compliance-rules-p1#3 pile:"MED NOT FIXED: the plan review line at scripts/analysis/backlog-brief.mjs:178 stays; its test src/tests/backlog/backlog-brief-context.logic.test.ts is outside the Files line of task-423 (check-task-files refused the commit), so the line cannot change without a Files edit by the orchestrator"
out-code-review-p1#3 pile:"LOW, round 1: the as string cast in a test helper; the test still fails loudly, no defect gets through; test hygiene (RR-0364)"
out-code-review-p1#4 pile:"LOW, round 1: a cast through unknown in a test; a null throws and fails the test, never passes falsely; typing hygiene (RR-0364)"
out-compliance-rules-p1#4 pile:"LOW, round 1: the Spec 137 note says the coupling is two files only while the brief generators also carry the protocol text; wording; a spec edit moves the Spec 137 text and is not worth a round (RR-0364)"
out-compliance-rules-p12#1 pile:"LOW, round 1: the stitched-parts test compares with whitespace stripped, as the close recompute does; dies with the join if the join is dropped; recorded (RR-0364)"
out-compliance-rules-p2#2 pile:"LOW, round 1: a table list written with members would be read as a composed list; only a reviewed table edit can add one; a validate refusal for members is a small later hardening, join-dependent (RR-0364)"
out-compliance-rules-p4#4 pile:"LOW, round 1: the README item that introduces the joined form names only the per-list output; the joined name is in the Spec notes and the brief; wording; dies with the join (RR-0364)"
out-compliance-rules-p6#4 pile:"LOW, round 1: the findings command still lists plan-*.txt ids; harmless once the brief fix (D2) stops the lane from writing plan files; recorded (RR-0364)"
out-compliance-rules-p8#3 pile:"LOW, round 1: the task-419 and task-412 Files lines are read live by the pin test; both tasks are BUILT so the lines are stable; dies with the join (RR-0364)"
out-compliance-rules-p8#4 fixed:a7e366cbb scripts/hooks/check-lane-close.mjs
out-error-paths-p1#1 pile:"LOW, round 1: the skip is keyed on the task id, not the hash; the launch gate compared the hash at launch and the close reads the file at the launch commit; only a take made without the launch script could carry a wrong hash (RR-0364)"
out-error-paths-p1#3 pile:"LOW, round 1: a task launched before the join must delete its per-list files by hand and the refusal does not name them; exists only because of the join; a message improvement (RR-0364)"
g423#1 pile:"LOW, grounder own, round 1: the plan-file filter at check-lane-close.mjs:556 is not limited to build and fix; a record task with plan evidence at the launch commit would not have its plan findings read; not reachable because the launch gate runs for build and fix only; read, not driven (RR-0364)"
out-code-review-p1#5 pile:"NIT, round 1: planOnBoard is exported and used nowhere else; unused surface only (RR-0364)"
out-compliance-rules-p10#3 pile:"NIT, round 1: the plan-prep test has no upper bound on compliance files; the at-most-3 pin is held in the rule-lists tests (RR-0364)"
out-compliance-rules-p7#5 pile:"NIT, round 1: same whitespace-stripped comparison as out-compliance-rules-p12#1; dies with the join (RR-0364)"
out-error-paths-p1#4 pile:"NIT, round 1: lens-input --list rules --lists rules prints list rules is not in the table, which names the wrong cause; message only; dies with the join (RR-0364)"
