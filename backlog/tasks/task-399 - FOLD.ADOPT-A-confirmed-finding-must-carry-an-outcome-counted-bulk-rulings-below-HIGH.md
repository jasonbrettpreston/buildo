---
id: TASK-399
title: >-
  FOLD.ADOPT A confirmed finding must carry an outcome; counted bulk rulings
  below HIGH
status: LATER
assignee: []
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-20T21:55:00Z'
labels:
  - McFix
  - McFix Z
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 99012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. The gap the operator named, verbatim: 'the compliance check would be done ... but not that the outcome would be adopted although the grounder worked'. Today a task can close with every finding CONFIRMED and nothing done (the verdict rule at check-lane-close.mjs near :184 asks nothing of a CONFIRMED line). Scope: (1) every CONFIRMED verdict line ends in one disposition the check verifies: fixed:<sha> (an ancestor of the branch head, not of the base, touching the cited path), task:task-N (the task file exists and is not DROPPED), or ruling:RR-NNNN (the decision file exists); else refused. (2) Bulk form: full verdicts with quote and disposition stay mandatory for CRITICAL and HIGH; for MED, LOW and NIT one line per lens output and severity, 'Bulk: <file> <severity> count:<n> REJECTED|DEFERRED <reason of 60+ characters>', the count recomputed from the file so it cannot undercount. Reason for the bulk form: lanes carry 195 to 864 findings each, most of them repeats; full verdicts on all of them invite skipping. This weakens MED and below (no per-finding quote): stated, not hidden. Own commit, before any close (the self-edit rule near :228). What stays unverifiable: that a fix fixes, that a follow-up task is done. Acceptance: planted-defect tests for a missing disposition, a fake sha, a DROPPED or unknown task id, an unknown ruling id, a bulk count that does not match. Files: scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 2026-11-20 from the operator words (MORNING-DECISIONS.md, entry "Operator AGREES: compliance documents attached to every task"): "citing not only the decision but the compliance rules ... compliance rules broken is listed in the response the fold fails". So: a CONFIRMED verdict from a compliance output names the rule it breaks (the rule-list id from the output file name plus the rule id or heading the finding cites), and check-fold prints, on refusal, the list of broken rules with their dispositions missing: one line per rule, rule list id, rule, file:line.

Grounder recommendation 2026-11-20 (STEP4-LEDGER.md PART C), to build AFTER task-410 folds and BEFORE task-375 (same function): this task already designs the per-finding disposition; three changes: (1) CONFLICT verdicts need an outcome too (only task: or ruling:, never wontfix:); (2) a task: outcome needs the named task's text to contain the finding id or the cited path; (3) the outcome lines live in the lane's TRIAGE.md (an existing form), one per id: '<id> fixed:<sha> <path>' (sha an ancestor of HEAD and not of the base, touching the path), '<id> task:task-N', '<id> ruling:RR-NNNN', '<id> wontfix:"<60+ chars>"' (LOW and NIT only). The close is refused naming every CONFIRMED or CONFLICT id without exactly one line. Measured need: 52 of 153 such findings on tasks 396, 407, 406, 387 had no change and no written reason.

Operator 2026-11-20, verbatim: "approved" (MORNING-DECISIONS.md entry "Operator APPROVES items 0 to 8"; item 0: "Append the two final notes to tasks 399 and 375"). FINAL BUILD NOTE from the four-step audit (FOUR-STEP-AUDIT.md, round 2 folded; file NOTE-399.md), appended verbatim; where it differs from earlier text of this task, this note governs:
BUILD-READY 2026-11-20 (audit ~/Buildo-scratch/lanes-20261119/inc1b/retro/FOUR-STEP-AUDIT.md, round 2 folded). This task ENFORCES rules that already exist; it adds no rule: Spec 08 section 7 rule 3 (08_agents.md:338 "fold survivors, file rejections with reasons"), rule 6 (:340 "BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons"), section 5.3 (:227 "Rejected findings are written to the plan with reasons"), section 10.3 (:452 "triage"). Operator, verbatim, MORNING-DECISIONS.md:1517: "don't makr the task complete until it actually works". Order: launch AFTER task-410 is folded onto wf2/board (the launch script cuts only from the board HEAD, backlog-lane.mjs:123; a branch cut from the 410 branch puts 410's files outside this task's Files line and the close refuses), BEFORE task-375.
Files line (unchanged): scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts. No other file, no new script. ("check-fold" in the earlier note means this check.)
SCOPE, all in check-lane-close.mjs (new block placed after the GROUNDER verdict block, pushing into `errors`, never returning early; the earlier returns at :144-:158 of the 410 head 065f85a02 are "gate cannot run" states, they refuse and never pass; the V2L15 change is NOT part of this task):
1. TRIAGE.md in the lane dir (the layout the check already reads). One line per CONFIRMED or CONFLICT id of GROUNDER.md, the id exactly as the grounder writes it (<file stem>#<n>, unique inside a lane dir because file names are):
   <id> fixed:<sha> <path>  (sha is an ancestor of HEAD, not of the range base, touches <path>, and no commit in the range carries "This reverts commit <sha>": git log --grep)
   <id> task:task-N  (the file exists, is not DROPPED, and its text contains the id or the cited path; a DEFER-class finding goes to a card: the review_followups.md home of rule 6 cannot be written by a lane today because docs/reports/review_followups.md matches no row of rule-lists.json: measured, `rule-lists.mjs resolve --files docs/reports/review_followups.md` is refused)
   <id> ruling:RR-NNNN  (the decision file exists)
   <id> wontfix:"<60+ characters>"  (a rejection with reasons, rule 3 and 5.3; LOW and NIT only)
   A CONFLICT id takes only task: or ruling:. The close is refused naming every id with no line or with two lines. On refusal print one line per missing id: rule list id (from the output file name), the rule the finding cites, file:line.
2. Bulk form for MED, LOW and NIT (CRITICAL and HIGH keep full lines): Bulk: <output file> <severity> count:<n> REJECTED "<60+ characters>"  or  Bulk: <output file> <severity> count:<n> DEFERRED task:task-N "<60+ characters>" (the card exists and is not DROPPED). n is recomputed from the file, so it cannot undercount.
3. At close the task's FINAL SUMMARY (backlog task edit --append-final-summary; not the notes, which the reviewer reads as rulings) holds: Review round N: <a> fixed, <b> task, <c> ruling, <d> wontfix, <e> bulk; grounder <path>; triage <path>. The counts must equal the counts recomputed from TRIAGE.md and GROUNDER.md; refused otherwise. The same line ends "; not reviewed (exempt): <k> paths", k recomputed by the check as the changed paths of the range that the table exempt globs leave out of the review material, so an exempt file is never silently unreviewed (Spec 08 section 11.1).
NOT IN SCOPE: judging that a fix fixes (a manual edit that undoes a fix without a revert commit is not detected: stated limit); the early-return change of V2L15; compliance references and the reviewer context (task-375); re-using unchanged chunks; any new tool or file form (TRIAGE.md is the lane file Spec 08 :347 already names).
ACCEPTANCE on real inputs, tests red first through the real hooks: (a) planted-defect tests with passing controls for: a missing line; a duplicate line; a fake sha; a sha not touching the path; a sha reverted by a later "This reverts commit" commit; a DROPPED or unknown task id; a task text without the id or path; an unknown ruling id; wontfix on a CONFLICT or a HIGH; a bulk count that does not match; a bulk DEFERRED without a task; a final summary whose counts differ. (b) Run the new block on task-381's real GROUNDER.md (branch wf1/inc1b-hooks3, ~/Buildo-scratch/lanes-20261119/inc1b/hooks3/GROUNDER.md): one error per CONFIRMED or CONFLICT line (35 CONFIRMED lines on that file; count the CONFLICT lines with grep) before a TRIAGE.md exists, and none after a real one. Own commit, before any close (the self-edit rule). Do not mark BUILT until the output of (b) is pasted on this task.
<!-- SECTION:NOTES:END -->
