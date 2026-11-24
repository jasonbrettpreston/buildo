---
id: TASK-410
title: >-
  V2.WHOLE The compliance review covers the whole change and the close check
  proves it
status: BUILT
assignee:
  - '@lane-BL-V2WHOLE'
created_date: '2026-11-20T17:52:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-406
  - TASK-407
references:
  - docs/reports/lanes/2026-11-20/BL-V2WHOLE/REPORT.md
type: build
ordinal: 110012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry 'Operator APPROVES the McFix V2 launch'). Found by a separate grounder 2026-11-20 (verify each fact first): (1) the close check verifies nothing about the review MATERIAL beyond its hash (scripts/hooks/check-lane-close.mjs:100-125): a lane can commit any part of the diff as material and the close passes; lanes did so today (DIFF-core.patch). (2) the review tool refuses a prompt over 120,000 characters (scripts/deepseek-review.js:35, a cost and timeout choice per its comment at :33-34, not a stated model limit) and lens-input refuses a material that leaves no room for the list; task-390's diff (121,482 characters) cannot be reviewed whole at all. (3) four lens templates (code-review, error-paths, ux, security, line 32) still carry the plan placeholder in their prose, so the material is sent twice (lens-compliance.md was fixed). Grounder recommendation, to build: (a) fix the four templates' line 32 as lens-compliance.md was fixed. (b) lens-input gains a material-split mode: the diff is split at FILE boundaries into chunks by the tool (never by hand), each chunk against every list part, the input stamped with chunk i of m and its path list. (c) the close check recomputes the changed paths of the task range (minus the table's exempt paths) and refuses when the union of the chunks' paths is not that list, and compares each chunk's hash to the recomputed diff text for its paths: this is what stops a lane leaving a file out. (d) the brief sentence is updated to match. NOT built without the operator's word: excluding generated files from the material (no rule exempts them); raising the bound; a size limit on a task. Optional, measure first: routing each file only to the lists its own path resolves to. Cost stated plainly: about three times today's review calls for a change of this size (estimate 80 to 120 per phase for task-390; exact number to be measured and reported). Acceptance: planted-defect tests with passing controls (a chunk set missing one changed file is refused; a chunk whose text differs from the diff is refused); task-390's whole diff run through it for real, the call count reported. Protected paths: each check or tool edit in its own commit, no task status move in it. Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/lens-code-review.md, .claude/review-templates/lens-error-paths.md, .claude/review-templates/lens-ux.md, .claude/review-templates/lens-security.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN task-410 (V2.WHOLE). Rule: Spec 126 section 0a principle 1 and 11b.2; 08_agents.md section 7 rules 3 and 4 and section 11.1; PLAN-PROTOCOL.md:3 simple, no scope creep. Principles served: standardized, understandable, simple.
Verified facts (opened): (1) check-lane-close.mjs compliance block checks the material only by its stamped hash; (2) scripts/deepseek-review.js:35 bound 120000, lens-input refuses a material that leaves no room (rule-lists.mjs buildLensInputs) and an unsplittable list block; (3) part (a) the four templates carry {{PLAN}} once each (lens-code-review/error-paths/ux/security.md line 34): DONE by task-406, not redone.
(b) rule-lists.mjs lens-input: when buildLensInputs throws for room (material or unsplittable list block) and the material holds `diff --git` headers, the TOOL cuts the diff at those headers (file boundaries only) into chunks of at most the room left after the list part; each chunk gets every list part. Stamp: line 1 gains ` chunk c of m`, head line gains ` paths: <JSON array>`; files are -p1..-pN chunk-major (N = m x list parts). A single file over the room is refused with one line naming the file and its size. No --list (with --template of a non-compliance lens) writes the same chunk inputs with an empty list part: that is how code-review, error-paths, ux, security are split (same tool); the close check accepts out-<lens>-pN.txt for them, each with its committed in- input verified like a chunk.
(c) check-lane-close.mjs: expected paths = git diff --name-only --no-renames merge-base..HEAD minus table exempt globs; for out-phase inputs: each chunk's stamped paths must equal the paths of its own material, every part of a chunk carries the same chunk and material, the union of the chunk path lists must be exactly the expected list with no path in two chunks, and each chunk material must equal git diff --no-renames merge-base HEAD -- <its paths>. An unchunked input is chunk 1 of 1 (its paths read from its diff headers). Empty expected list: nothing to cover. Limit stated: a path staged only in the closing commit is not in the range (the closing commit is records only).
(d) backlog-lane.mjs brief sentence: says the diff is split by lens-input at file boundaries, the command to make the diff, chunk naming and the refusal for one file over the room; the review-files-go-here sentence kept.
Tests first (red as failing assertions through the pre-commit related run): rule-lists.logic.test.ts (chunking, file over room, no-list mode, non-diff material still refused), check-lane-close.logic.test.ts (control passes; chunk set missing a changed file refused; chunk text differing from the diff refused; hand-edited stamp refused; non-compliance parts), backlog-lane.logic.test.ts (sentence). Each protected-path edit in its own commit, no status move. NOT built: the always-attached lists checked at plan phase only for build tasks (measured), lens-input pasted context (measured), generated-file exclusion, bound change, task size limit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-V2WHOLE, worktree /Users/brettpreston_macmini/Buildo-wt-v2whole, branch wf1/inc1b-v2whole), RR-0240

2026-11-20 part (b) landed (713959765 rule-lists.mjs lens-input splits a diff at file boundaries into chunks stamped chunk c of m with paths; no --list serves the non-compliance lenses). Part (c) in progress: check-lane-close.mjs chunkErrors.

2026-11-20 part (c) landed (ba26e1b81 check-lane-close.mjs chunkErrors; closing commit may stage no path outside the task range). Part (d) in progress: backlog-lane.mjs brief sentence.

2026-11-20 part (d) landed (9bed06dbb backlog-lane.mjs brief sentence). Commits: 713959765 (b), ba26e1b81 (c), 9bed06dbb (d); part (a) verified done by task-406 (the four templates hold {{PLAN}} once, line 34). Real split runs (inputs only): see docs/reports/lanes/2026-11-20/BL-V2WHOLE/REPORT.md. Not built, measured for a grounder: build tasks require the always-attached lists at the output phase only (check-lane-close.mjs:159); lens-input never passes the task text or rulings (the review tool fills '(no pasted context provided)' without --context). Grounder owed; task stays RUNNING.

2026-11-20 fix round started after the grounder (attacks e, f, g binary, h, k; findings F1-F7). Tests first.

2026-11-20 fix round part 1: rule-lists.mjs (DIFF_ARGS --text --full-index, measured chunk room, renderLensInput, lensPromptHash, name refusal).

2026-11-20 fix round part 2: check-lane-close.mjs (F1 qualified base ref and status read and empty range refused, F3 unsplit lens bound and prompt hash and regenerated inputs, F4 late-staged only for lane build or fix, F7 exempt and base_ref from the range base's table).

2026-11-20 fix round part 3: backlog-lane.mjs brief (git -c core.quotepath=false, refs/heads base, glob exclusions from the table exempt).

2026-11-20 operator ruling, verbatim (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry '2026-11-20 · Operator RULES on five more items (reviewer inputs and the whole-change check)'): "1-5 y"; item 4 as put to him: "Keep the split for code review, error paths, UX and security" (the no-list split of lens-input stays; the four CONFLICT findings on that scope are settled by it). Item 3 as put to him: "Exempt generated snapshots from review material": existing lists found (table exempt = docs/reports/lanes/**, docs/reports/reviews/**; golden folders src/tests/fixtures/surfaces/<id>/<state>.<target>.json validated by report-checks.mjs goldenProblems and screen-checks.mjs screenArm; generated-docs gate list; no .gitattributes in the repo); NOT landed in the table: widening exempt in this lane is refused by the new base-table rule (F7), halted for the orchestrator.

2026-11-20 fix round landed: f82b84339 (rule-lists.mjs), a92c11503 (check-lane-close.mjs), de431c6d7 (backlog-lane.mjs), 406bbb5af (dated notes in 08_agents.md and 137_mcqueue.md). Lens set re-run on the new whole diff; superseded round-1 outputs listed in SUPERSEDED.txt. Task stays RUNNING, grounder owed.

2026-11-20 round 3 started (grounder r2: F8-F13). Tests first.

2026-11-20 round 3 part 1: rule-lists.mjs F13 (chunk when the final prompt overflows).

2026-11-20 round 3 part 2: check-lane-close.mjs (F8 launch commit coverage, F9 no-list regenerate and lens prompt hashes, F10 table and templates from the range base, F11 type from the launch copy, F12 records only). Hook point for task-375: lensContexts().

2026-11-20 round 3 part 3: backlog-lane.mjs brief (diff from the launch commit, Files pathspecs).

2026-11-20 rebased onto wf2/board d17fc7499 (task-406 folded: nine golden exempt globs); item 3 test added; lists re-resolved: now also policy-124-s2-s5.

2026-11-20 KNOWN LIMITS (dated, owners named; grounder r2 findings recorded as task:task-410 in TRIAGE.md): (1) the reviewer context: a compliance or lens output made with a real --context is refused today because the check hashes the tool's no-context placeholder; task-375 builds the context option and the check's hook point is lensContexts() in scripts/hooks/check-lane-close.mjs (findings out-code-review#4, out-compliance-agents-s7-s11-p1#1, out-compliance-agents-s7-s11-p4#1, out-compliance-queue-137-p1#3, out-compliance-queue-137-p4#4, plan-compliance-inc-S#2, plan-compliance-inc-S#3, plan-compliance-orchestrator-doc17#5). (2) a hand-written output whose author computed the public hashes passes, and a board ref moved by a forbidden command (git update-ref) is refused by the lane guard, not by this check. (3) the head text rendered for every list says 'Judge the material under review against the rules in this part' including doc-17 whose body is readings (out-compliance-orchestrator-doc17-p1#1). (4) a list block that cannot be split makes the oversized-file refusal name the biggest file with a negative room figure (out-code-review#5, plan-error-paths#1). (5) a repo file over about 115,000 characters of diff, such as the golden before-images under docs/reports/golden, can never be reviewed: the operator-gated generated-file question beyond the nine golden globs (plan-error-paths#6, plan-plan-review-deepseek#4). (6) a clause spanning two files is judged in two chunk runs (plan-compliance-agents-s5-1to3#3). (7) the context file the brief generator writes lists reading rows as decisions and ends two rows with the word undefined: owner the backlog-brief generator (plan-compliance-orchestrator-doc17#1, #2, #3, #6). The plan-phase compliance gap stays with task-404.

2026-11-20 round 3 landed: ac5884995 (F13), f5cc11a99 (F8-F12), ad487121f (brief), 54f15abe8 (item 3 test), 7d1ae7a6c (notes). Rebased onto wf2/board d17fc7499. Lens set re-run on the final range; TRIAGE.md in the lane report dir. Task stays RUNNING, grounder owed.

2026-11-20 round 4 started (grounder r3: H1, H3, H4). Tests first.

2026-11-20 round 4: check-lane-close.mjs reads base_ref, finished_statuses, protected_paths and exempt from refs/heads/wf2/board and searches the launch commit there (H1); milestone from the launch copy (H4); prompt builder and review tool may not differ from the base unless the launch Files line covers them (H3).

2026-11-20 correcting dated note added to 08_agents.md (what the close check enforces after round 4).

2026-11-20 round 4 landed: 98c9f9a8e (check-lane-close.mjs H1 H3 H4), 3852f74e9 (correcting dated note). Lens set re-run on the final range. Task stays RUNNING, grounder owed.

2026-11-20 KNOWN LIMITS added after grounder round 3 (task:task-410 lines of the TRIAGE.md round 3 section; the operator rules on owners): out-compliance-agents-s5-1to3-p1#1, out-compliance-agents-s5-1to3-p1#2, out-compliance-agents-s7-s11-p1#1, out-compliance-agents-s7-s11-p2#3, out-compliance-inc-S-p1#1, out-compliance-orchestrator-doc17-p1#1, out-compliance-queue-137-p1#1, out-error-paths#3, plan-compliance-agents-s5-1to3#3, plan-compliance-inc-S#2, plan-compliance-inc-S#3, plan-compliance-orchestrator-doc17#1, plan-compliance-orchestrator-doc17#2, plan-compliance-orchestrator-doc17#3, plan-compliance-orchestrator-doc17#5, plan-compliance-orchestrator-doc17#6, plan-error-paths#1, plan-error-paths#6, plan-plan-review-deepseek#4. Additional limits named: the path maps (mcbylaws/protected-paths.json) that resolve lists are read from the branch tree (out-compliance-agents-s5-1to3-p1#2); after a fold a lane's code outside its Files line is in neither the coverage set nor the outside-Files range (out-compliance-queue-137-p1#1); a task whose Files line names the table is judged by its branch rows and lists, the table edit being in its own reviewed diff (out-error-paths#3); the reviewer context stays with task-375 (lensContexts() hook).

2026-11-20 round 5 started (grounder r4: H8 and the board read after the moves check). Tests first.

2026-11-20 round 5: check-lane-close.mjs takes the lane assignee from the staged copy else the HEAD copy and the type from the launch copy, so dropping the assignee or retyping cannot hide the lane (H8); the board is read only when a task moves.

2026-11-20 second correcting dated note added to 08_agents.md (the assignee sentence; a close needs the board ref).

2026-11-20 round 5 landed: 7116dabbc (check-lane-close.mjs H8 and the board read after the moves check), 065f85a02 (second correcting dated note). Lens set re-run on the final range. Task stays RUNNING, grounder owed.

2026-11-20 operator ruling on the CONFLICT, verbatim (MORNING-DECISIONS.md entry '2026-11-20 · Operator AGREES the Rule 3 amendment and RULES on material too large to review'): put to him "amend Spec 137 Rule 3 so a lane task closes in a separate commit after its code — yes (recommended) or no?"; "agreed - The grounder's recommendation: amend Rule 3 for lane build and fix tasks to the two-commit close." Dated notes added in 137_mcqueue.md (Rule 3 and a correction of this task's earlier note). The material-too-large half of his sentence is not built here.

2026-11-20 round 5 final: 7116dabbc, 065f85a02, 13dd26b45 (Rule 3 note). Lens set re-run on the final range.

2026-11-20 round 6 started (grounder r5: H9, diff config keys). Tests first.

2026-11-20 round 6 part 1: rule-lists.mjs DIFF_ARGS pins --diff-algorithm=myers --indent-heuristic --inter-hunk-context=0.

2026-11-20 round 6 part 2: check-lane-close.mjs reads type and lane assignee from the board copy of the task, the id from the file number, the rule lists from the union Files line, the grounder clash set from all assignees (H9).

2026-11-20 third correcting dated note added to 08_agents.md (type and lane assignee from the board copy).

2026-11-20 round 6 landed: a8a3ca2db (rule-lists.mjs diff pins), f6f8b5944 (check-lane-close.mjs H9), b808b371b (third correcting dated note). Lens set re-run on the final range.

2026-11-20 round 7 started (grounder r6: H10). Tests first.

2026-11-20 round 7: check-lane-close.mjs refuses a null board copy (no fallback), finds the board task by number and takes the launch commit from the board path, and refuses a close from a branch whose tree lacks a board lane build or fix task file whose lane directory it carries (H10).

2026-11-20 round 7: the brief layout sentence on the two-commit close (backlog-lane.mjs).

2026-11-20 fourth correcting dated note added to 08_agents.md: the check is an omission guard; forgery routes owned by task-401 and task-402. Operator entry quoted: put to him 'after this round, fold 410 as an omission guard, named as that, with the forgery routes recorded on tasks 401 and 402 — yes (recommended) or no?'; his words 'Finsih it!'.

2026-11-20 round 7 landed: 4de8fb86f (check-lane-close.mjs H10), bb08d47b5 (brief two-commit sentence), 4d105c3f6 (fourth correcting dated note, omission guard), 67fef6b93 (forgery routes on task-401 and task-402). Lens set re-run on the final range. Task stays RUNNING, grounder owed; the closing commit follows the grounder's ruling.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rounds 7, findings 190, CONFIRMED 48 (grounder file docs/reports/lanes/2026-11-20/BL-V2WHOLE/GROUNDER.md, sha256 05d57a49caf71db5df8a2b8406eafaffb8fb024d5be7c72b104b60cd56c279d2). The close check is an omission guard: it refuses a skipped review, rule list, changed file, stale input or a close without a separate grounder's file; forgery routes are owned by task-401 and task-402.
<!-- SECTION:FINAL_SUMMARY:END -->
