---
id: TASK-419
title: >-
  LAUNCH.GAPS The fold check leaves a record and a one-file review keeps one
  name
status: LATER
assignee: []
created_date: '2026-11-21T14:40:00Z'
updated_date: '2026-11-21T14:52:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-418
type: build
ordinal: 119012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (MORNING-DECISIONS.md:1651, verbatim: "Let's resolve 1 and 2 now."; :1653, verbatim: "ensure the plan is reviewed for the cards before moving forward"). Two gaps found on 2026-11-21 while task-418 and task-412 went through the pre-launch steps. GAP 1, the fold check leaves no record: after the confirmed plan findings are folded into the plan, a separate grounder checks the folded plan and adds the last line "Plan: <id> sha256:<12>" to GROUNDER-PLAN.md; the launch check proves only that line against the plan; the grounder's report of the check is written nowhere by rule, plan-prep neither asks for it nor stores it (on task-412 it was written after the fact, docs/reports/reviews/task-412/FOLD-CHECK.md, and the output review ruled the missing record a CONFIRMED HIGH; on task-418 it is only in a scratch log). GAP 2, the one-file name trap: when a diff fits one review input, lens-input writes it without a part suffix (scripts/analysis/rule-lists.mjs:425), while the close check reads an unsuffixed output as a review of the raw diff and only -pN outputs as tool-made inputs (scripts/hooks/check-lane-close.mjs:487, :509-513), so the tool's own output for a small diff is refused at close until the lane renames it -p1 (met by the task-418 lane). Wanted: the smallest change that (1) makes the fold check a committed record that the pre-launch steps carry and the launch check can see, written by the grounder and never by the script; (2) makes the tool and the close check agree on the name of a one-file review, without breaking outputs already committed. Reuse what exists; no new tool. NOT in scope: the cross-read adversary pass (operator, MORNING-DECISIONS.md:1647: not needed). The plan (to be written read-only and reviewed before any build) names the design and the final Files line. Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 (a) Plan-prep fixture: a board whose folder lacks FOLD-CHECK.md: `backlog-lane.mjs --dry-run` exits 3, stderr "FOLD-CHECK.md". With the file (Checked by: Fold-G1, Verdict: PASS, correct Plan line) it prints "plan gate ok".
- [ ] #2 (b) Same board, the task body edited by one word: exit 3, FOLD-CHECK.md Plan line stale, expected line printed.
- [ ] #3 (c) `node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context <ctx> --material <one-file diff> --out <dir>/in-out-code-review` prints `<dir>/in-out-code-review-p1.txt` and writes only that.
- [ ] #4 (d) The close check on a lane with out-code-review-p1.txt made from (c): exit 0 (named test green).
- [ ] #5 (e) Existing close tests (a -p1 pair, the unsuffixed compliance control) still pass.
- [ ] #6 (f) The three test files green; git diff --stat shows only the Files line.
<!-- AC:END -->

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
PLAN-419-v1. Task: LAUNCH.GAPS (fold check leaves a record; one-file review name). Operator: "Let's resolve 1 and 2 now." Cross-read pass is out of scope ("Gap 3 we dont need the cross check.").

Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs

1. WHAT AND WHY
Gap 1: the grounder's fold check leaves nothing in the repo. The launch check proves only the Plan line. Fix: the grounder writes FOLD-CHECK.md beside GROUNDER-PLAN.md; the existing launch check requires it.
Gap 2: for a small diff, lens-input names a no-list lens input with no -pN, and the close check refuses that name. Fix: make the tool always write -p1 for those lenses. The brief already says -pN.

2. FACTS VERIFIED
- Launch gate: planGateInner, scripts/hooks/check-lane-close.mjs:569-642. It reads GROUNDER-PLAN.md (:609), seats (:620-622), the last Plan line (:634-636). Nothing reads a fold-check file. grep finds planGateErrors called only from scripts/analysis/backlog-lane.mjs (gate at :87-116, exit 3); the close check does not run it.
- plan-prep commit, scripts/analysis/rule-lists.mjs:720-745: `git add -- <ev>` and `git commit -- <ev>` (:726-730, ev = docs/reports/reviews/<task>), real hooks, then the gate dry run. Any new file in that folder is carried; no edit needed. It refuses only if GROUNDER-PLAN.md is absent (:727).
- Flow: first commit exits 3 printing the expected Plan line; the grounder copies it; the second commit lands (backlog-lane.logic.test.ts:779-800). FOLD-CHECK.md is written after the Plan line, so it rides the second commit.
- Worked example: task-412/FOLD-CHECK.md has "Checked by:" but no Verdict or Plan line; 418 has none; 375 has FOLD-VALIDATION.md. Status: 375 RUNNING, 412 and 418 BUILT.
- Gap 2, tool: buildLensInputs, rule-lists.mjs:425: `suffix: files.length === 0 && chunks.length * parts.length === 1 ? '' : -pN`. `list` is null for code-review, error-paths, ux, security (:777-778). A diff is always stamped "LIST none ... chunk 1 of 1" (rule-lists.mjs:361-364).
- Gap 2, check, compliance: listProof (check-lane-close.mjs:373-409) accepts an unsuffixed `${base}.txt` (names, :381-384), reads its stamped input, kOf null counts as 1 (:125, :105). NOT a trap. Committed unsuffixed compliance pairs exist (BL-FIXTUNE, BL-COMPLY2).
- Gap 2, check, other lenses: unsuffixed out-<lens>.txt is bound to the raw diff (check-lane-close.mjs:508-513: file_sha256 must equal sha256 of the recomputed diff). A tool-made input is stamped, so its sha differs: refused. Only out-<lens>-pN.txt goes through the stamp path (:487-503).
- Brief, backlog-lane.mjs:185 (and :183 for compliance): code-review/error-paths/ux/security "are filed out-<lens>-pN.txt with their in-<same name>"; compliance "[-pN]". The brief already says -pN. The tool is the odd one out.
- Committed: no-list pairs are -p1 in BL-V2WHOLE, BL-F412, BL-GATE375, BL-PREP418. BL-MASSING holds an unsuffixed raw-diff input (pre-stamp), the :509-513 route, untouched here.

3. DESIGN
Gap 1. Record: docs/reports/reviews/<task>/FOLD-CHECK.md. Minimum content: a line `Checked by: <name>`; a line `Verdict: PASS`; a last line `Plan: <task id> sha256:<12>` (same form as GROUNDER-PLAN.md). Body free (the grounder's report, pasted). Writer: the grounder; the script never writes it. Required: planGateInner, one new block after the Plan-line check: file missing -> refusal; Checked-by missing or clash() with lane or any assignee -> refusal (reuse clash, same rule as the grounder); Verdict not PASS -> refusal; last Plan line missing or not equal to `line` -> refusal (a fold check of an older plan). Add the file to nothing else: plan-prep already commits it; the task references list is untouched (GROUNDER-PLAN.md, TRIAGE-PLAN.md, seats only).
Can prove: the file is committed at board HEAD, a name other than the lane and its assignees signed it, it names the plan hash as it is now, and says PASS. Cannot prove: that the checks were run, that Checked-by is a real separate agent, or that the PASS is true.
Existing tasks: the gate runs at launch only (backlog-lane.mjs:87-116); 375, 412, 418 are taken and not re-gated; no committed file is edited. A prepped-not-launched task needs the file (intended).
Rejected: a script-written stub (a record of nothing); a new Seat line (changes the committed form); a hash of GROUNDER-PLAN.md (circular); a new tool.
Gap 2. Change the TOOL only: suffix is '' only when `list` is set and there is one file; with no list it is always -pN. Compliance names are unchanged (lists keep unsuffixed for one file), so plan-prep (:620) and the compliance brief text stay true.
Rejected: teach the close check an unsuffixed stamped name (second route through :487-513, protected file); edit the brief (already says -pN); -p1 for compliance too (breaks committed names and fixtures).
Committed outputs still pass: the close check is not edited for gap 2; -p1 pairs keep their path (:487-503); unsuffixed compliance keeps listProof; BL-MASSING keeps :509-513.

4. EXACT EDITS
a. check-lane-close.mjs planGateInner: after `const pl = ...` block (:634-636), read textOf('FOLD-CHECK.md') and push the four refusals above. About 12 lines. Update the "missing evidence" message at :580 to name FOLD-CHECK.md.
b. rule-lists.mjs:425: suffix expression as in section 3. Fix the docstring (:358-362) to say a no-list lens is always -pN.
c. Tests and fixture, section 5.
d. No edit to backlog-lane.mjs, the specs, or any committed evidence.

5. TESTS FIRST
Fixture boards are real git repos; every git spawn takes gitFreeEnv() (rule-lists.mjs:53). Red = a failing assertion, never a thrown error. Each spawn asserts exit status first.
- check-lane-close.logic.test.ts planScenario (:~890-905): add an option set; default plants a good FOLD-CHECK.md. Control: full evidence passes (existing :912). Planted defects, each with the control green: no file; no Checked-by; Checked-by equal to the lane BL-COMPLY2 and one equal to an assignee; Verdict: FAIL; Plan line of an edited task (stale); no Plan line.
- plant-evidence.mjs: write FOLD-CHECK.md after GROUNDER-PLAN.md (:36-37) and commit it with the rest. backlog-lane.logic.test.ts:779-800: after the grounder copies the expected Plan line, write FOLD-CHECK.md with that line; c1 stays exit 3 and its stderr names FOLD-CHECK.md; c2 exit 0; after the one-word edit (c3) exit 3 with both lines stale.
- rule-lists.logic.test.ts near :577: no --list, a one-file diff, small max: stdout path ends `-p1.txt`, no unsuffixed file written, stamp "chunk 1 of 1". Controls: with --list and one file the name stays unsuffixed (existing tests keep passing); multi-chunk unchanged.
- check-lane-close.logic.test.ts :420 area: a lane built by running the real lens-input on a one-file diff for code-review closes with out-code-review-p1.txt (control); the same pair renamed unsuffixed is still refused (planted defect keeps the lock).
RED: write tests, run the named files, see FOLD-CHECK assertions and the -p1 assertion fail, then edit.

6. LANDING
Two protected paths change, so: commit A = the two scripts, the tests and plant-evidence.mjs, through the real hooks, no task move (self-edit rule :681-682); commit B (later) = task file and queue row to DONE with evidence. Other table editors land one at a time. Run `rule-lists.mjs validate` before commit A.

7. ACCEPTANCE
(a) Plan-prep fixture: a board whose folder lacks FOLD-CHECK.md: `backlog-lane.mjs --dry-run` exits 3, stderr "FOLD-CHECK.md". With the file (Checked by: Fold-G1, Verdict: PASS, correct Plan line) it prints "plan gate ok".
(b) Same board, the task body edited by one word: exit 3, FOLD-CHECK.md Plan line stale, expected line printed.
(c) `node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context <ctx> --material <one-file diff> --out <dir>/in-out-code-review` prints `<dir>/in-out-code-review-p1.txt` and writes only that.
(d) The close check on a lane with out-code-review-p1.txt made from (c): exit 0 (named test green).
(e) Existing close tests (a -p1 pair, the unsuffixed compliance control) still pass.
(f) The three test files green; git diff --stat shows only the Files line.

8. WHAT THIS CANNOT PROVE
That a fold check happened or was independent; only that a named, hash-bound PASS is committed. Old raw-diff outputs are neither blessed nor broken.

9. OPEN QUESTIONS FOR THE GROUNDER
1. Files line: may it grow by backlog-lane.logic.test.ts and plant-evidence.mjs (card lists four)? (docs/reports is exempt: check-lane-close.mjs:453).
2. Which tasks are prepped (evidence committed) but not launched? They will need a FOLD-CHECK.md; is that acceptable, or should the check apply only from a given date?
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-21 (M-246, prior text kept; RR-0351 · task-419 · Backlog; operator, verbatim: "Gap 3 we dont need the cross check.")

Dated note 2026-11-21 (M-246, prior text kept; RR-0352 · task-419 · Backlog; operator, verbatim: "Let's resolve 1 and 2 now.")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-419-v1, written read-only by a separate planner against the code at 7db3a81cc. The Files line is replaced by the plan's six paths (adds src/tests/backlog/backlog-lane.logic.test.ts and docs/reports/reviews/task-375/plant-evidence.mjs; open question 1 for the plan grounder). The planner found the card's gap 2 narrower than written: the name trap holds only for lenses with no rule list (check-lane-close.mjs:508-513); compliance outputs are accepted unsuffixed (check-lane-close.mjs:373-409). The plan is reviewed, ruled, folded and fold-checked before any launch (RR-0352).

Dated note 2026-11-21 (M-246, prior text kept; RR-0354 · task-419 · Backlog; operator, verbatim: "change the spec's wording")

Dated note 2026-11-21 (M-246, prior text kept; RR-0355 · task-419 · Backlog; operator, verbatim: "Agreed. Let's push as soon as possible! Also recolve the scorecards issue now. The gaps are closed in parellel.")
<!-- SECTION:NOTES:END -->
