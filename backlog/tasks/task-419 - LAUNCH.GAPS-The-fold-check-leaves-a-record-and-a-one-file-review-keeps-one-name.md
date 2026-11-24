---
id: TASK-419
title: >-
  LAUNCH.GAPS The fold check leaves a record and a one-file review keeps one
  name
status: BUILT
assignee:
  - '@lane-BL-GAPS419'
created_date: '2026-11-21T14:40:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-418
references:
  - docs/reports/reviews/task-419/GROUNDER-PLAN.md
  - docs/reports/reviews/task-419/TRIAGE-PLAN.md
  - docs/reports/reviews/task-419/seat-integration-1.md
  - docs/reports/reviews/task-419/seat-reality-check-1.md
  - docs/reports/reviews/task-419/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-21/BL-GAPS419/REPORT.md
  - docs/reports/lanes/2026-11-21/BL-GAPS419/FINDINGS.md
  - docs/reports/lanes/2026-11-21/BL-GAPS419/TRIAGE.md
  - docs/reports/lanes/2026-11-21/BL-GAPS419/GROUNDER.md
type: build
ordinal: 119012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (MORNING-DECISIONS.md:1651, verbatim: "Let's resolve 1 and 2 now."; :1653, verbatim: "ensure the plan is reviewed for the cards before moving forward"). Two gaps found on 2026-11-21 while task-418 and task-412 went through the pre-launch steps. GAP 1, the fold check leaves no record: after the confirmed plan findings are folded into the plan, a separate grounder checks the folded plan and adds the last line "Plan: <id> sha256:<12>" to GROUNDER-PLAN.md; the launch check proves only that line against the plan; the grounder's report of the check is written nowhere by rule, plan-prep neither asks for it nor stores it (on task-412 it was written after the fact, docs/reports/reviews/task-412/FOLD-CHECK.md, and the output review ruled the missing record a CONFIRMED HIGH; on task-418 it is only in a scratch log). GAP 2, the one-file name trap: when a diff fits one review input, lens-input writes it without a part suffix (scripts/analysis/rule-lists.mjs:425), while the close check reads an unsuffixed output as a review of the raw diff and only -pN outputs as tool-made inputs (scripts/hooks/check-lane-close.mjs:487, :509-513), so the tool's own output for a small diff is refused at close until the lane renames it -p1 (met by the task-418 lane). Wanted: the smallest change that (1) makes the fold check a committed record that the pre-launch steps carry and the launch check can see, written by the grounder and never by the script; (2) makes the tool and the close check agree on the name of a one-file review, without breaking outputs already committed. Reuse what exists; no new tool. NOT in scope: the cross-read adversary pass (operator, MORNING-DECISIONS.md:1647: not needed). The plan (to be written read-only and reviewed before any build) names the design and the final Files line. Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, CLAUDE.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 (a) Plan-prep fixture: a board whose folder lacks FOLD-CHECK.md: `backlog-lane.mjs --dry-run` exits 3, stderr "FOLD-CHECK.md". With the file (Checked by: Fold-G1, Verdict: PASS, correct Plan line) it prints "plan gate ok".
- [x] #2 (b) Same board, the task body edited by one word: exit 3, FOLD-CHECK.md Plan line stale, expected line printed.
- [x] #3 (c) `node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context <ctx> --material <one-file diff> --out <dir>/in-out-code-review` prints `<dir>/in-out-code-review-p1.txt` and writes only that.
- [x] #4 (d) The close check on a lane with out-code-review-p1.txt made from (c): exit 0 (named test green).
- [x] #5 (e) Existing close tests (a -p1 pair, the unsuffixed compliance control) still pass.
- [x] #6 (f) The three test files green; git diff --stat shows only the Files line.
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
PLAN-419-v1. Task: LAUNCH.GAPS (fold check leaves a record; one-file review name). Operator: "Let's resolve 1 and 2 now." Gap 3 ("Gap 3 we dont need the cross check."): no cross-read pass after a fold; RR-0354 ("change the spec's wording") changes the Spec 08 wording here (section 4e).

Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md

1. WHAT AND WHY
Gap 1: the grounder's fold check leaves nothing in the repo. The launch check proves only the Plan line. Fix: the grounder writes FOLD-CHECK.md beside GROUNDER-PLAN.md; the existing launch check requires it.
Gap 2: for a small diff, lens-input names a no-list lens input with no -pN, and the close check refuses that name. Fix: make the tool write -p1 for every no-list lens input (rule-list inputs keep their names).

2. FACTS VERIFIED
- Launch gate: planGateInner, scripts/hooks/check-lane-close.mjs:568-642: GROUNDER-PLAN.md (:609), seats (:620-622), the last Plan line (:634-636); nothing reads a fold-check file. planGateErrors is called only from backlog-lane.mjs (:87-116, exit 3).
- plan-prep commit, rule-lists.mjs:720-745: git add and git commit of docs/reports/reviews/<task> (:726-730), real hooks, then the gate dry run; any new file in that folder is carried; it refuses only if GROUNDER-PLAN.md is absent (:727).
- Flow: first commit exits 3 printing the expected Plan line; the grounder copies it; the second commit lands (backlog-lane.logic.test.ts:779-800). FOLD-CHECK.md is written after the Plan line, so it rides the second commit.
- Worked example: task-412/FOLD-CHECK.md has "Checked by:" with prose, no Verdict line, its Plan line in backticks: not conforming (not re-gated); 418 has none; 375 has FOLD-VALIDATION.md. Status: 375 RUNNING, 412 and 418 BUILT.
- Gap 2, tool: buildLensInputs, rule-lists.mjs:425: `suffix: files.length === 0 && chunks.length * parts.length === 1 ? '' : -pN`. `list` is null for code-review, error-paths, ux, security (:775-777). A diff is always stamped "LIST none ... chunk 1 of 1" (rule-lists.mjs:361-364).
- Gap 2, check, compliance: listProof (check-lane-close.mjs:380-413) accepts an unsuffixed ${base}.txt and reads its stamped input: not a trap; committed unsuffixed compliance pairs exist (BL-FIXTUNE, BL-COMPLY2).
- Gap 2, check, other lenses: unsuffixed out-<lens>.txt is bound to the raw diff (check-lane-close.mjs:508-513: file_sha256 must equal sha256 of the recomputed diff). A tool-made input is stamped, so its sha differs: refused. Only out-<lens>-pN.txt goes through the stamp path (:487-503).
- Brief, backlog-lane.mjs:185: the code-review, error-paths, ux and security lenses whose prompt passes the bound "are filed out-<lens>-pN.txt with their in-<same name>"; under it the lens runs on the diff file (raw-diff route, kept); the task-418 lane ran lens-input on a small diff and met the trap.
- Committed: no-list pairs are -p1 in BL-V2WHOLE, BL-F412, BL-GATE375, BL-PREP418 (grep over docs/reports/lanes at c442eec10: 14 files, all -pN; over scripts and src only check-lane-close.mjs and its tests read out-<lens>.txt). BL-MASSING holds an unsuffixed raw-diff input (pre-stamp), the :509-513 route, untouched here.

3. DESIGN
Gap 1. Record: docs/reports/reviews/<task>/FOLD-CHECK.md. Form, the last of a repeated line counting: `Checked by: <name>` (the text after the colon up to the first comma or " (" or the line end, never empty); `Verdict: PASS`; `Plan: <task id> sha256:<12>` alone on its line, copied from the gate's expected output after plan-prep post and the first plan-prep commit. The GROUNDER-PLAN.md Plan line is added only after a PASS (375 D3, CROSS-READ.md:209), so FOLD-CHECK.md records that pass. Body free (the gate reads form, not the body). Writer: the separate plan grounder; never the script. Required: planGateInner, one new block at the end, outside the GROUNDER-PLAN.md branch (a folder lacking both files names both). One refusal per defect, each naming FOLD-CHECK.md and the form `write "Checked by: <name>", "Verdict: PASS" and last "Plan: <id> sha256:<12>"`: file missing; no name; a name clashing with the lane or an assignee other than the lane (the Grounder rule, check-lane-close.mjs:341-343; the card says a separate grounder); Verdict not PASS; Plan line missing or stale (message ends `expected: <line>`). The folder is read with git show HEAD (backlog-lane.mjs:93-98): an uncommitted file does not pass; a read error is a refusal line already (:564-566). Add the file to nothing else: plan-prep already commits it; the task references list is untouched (GROUNDER-PLAN.md, TRIAGE-PLAN.md, seats only).
Can prove: a committed file, signed by a name other than the lane and its assignees, naming the plan hash as it is now, saying PASS. Cannot prove: that the checks were run, that the name is a real separate agent, or that the PASS is true.
Existing tasks: the gate runs at launch only (backlog-lane.mjs:87-116); 375, 412, 418 are taken and not re-gated; no committed evidence of a taken task is edited (plant-evidence.mjs is a fixture program). Prepped but not launched: none (git ls-files GROUNDER-PLAN.md at c442eec10: task-412 and task-418, both BUILT), so no date cutoff. Task-419 launches under the gate before commit A; its fold-check grounder writes FOLD-CHECK.md in this form.
Rejected: a script-written stub (a record of nothing); a new Seat line (changes the committed form); a hash of GROUNDER-PLAN.md (circular); a new tool.
Gap 2. Change the TOOL only: the :425 expression becomes `list && files.length === 0 && chunks.length * parts.length === 1 ? '' : `-p${n}`` (files is the output array); with no list it is always -pN, a round file too (--out in-out-code-review-r2 gives -r2-p1, still read for findings: rule-lists.mjs:286). Compliance names are unchanged (lists keep unsuffixed for one file), so plan-prep (:620) and the compliance brief text stay true.
Rejected: teach the close check an unsuffixed stamped name (second route through :487-513, protected file); edit the brief (it names -pN where the tool is used); -p1 for compliance too (breaks committed names and fixtures).

4. EXACT EDITS
a. check-lane-close.mjs planGateInner: after the whole GROUNDER-PLAN.md branch, read textOf('FOLD-CHECK.md') and push the refusals of section 3, texts as written there. About 15 lines; the :580 message is not edited.
b. rule-lists.mjs:425: suffix expression as in section 3. Fix the docstring (:358-362) to say a no-list lens is always -pN.
c. Tests and fixture, section 5.
d. No edit to backlog-lane.mjs or to a committed review output; plant-evidence.mjs is a fixture program and is edited (section 5).
e. Specs, one dated note each in the M-246 form (RR-0351, RR-0352, RR-0354, operator words verbatim, MORNING-DECISIONS.md:1647, :1651, :1663), in commit A: 08_agents.md after 11.2: the cross-read adversary pass of 11.2 and of the roster row (:449) is no longer required after a fold, the agent stays in the roster and may be asked for, the grounder's re-execution stays and leaves FOLD-CHECK.md (scope: the orchestrator's reading, decision-139); 137_mcqueue.md after :140: the launch check also requires FOLD-CHECK.md, with the limits of section 8.

5. TESTS FIRST
Fixture boards are real git repos; every git spawn takes gitFreeEnv() (rule-lists.mjs:53). Red = a failing assertion, never a thrown error. Each spawn asserts exit status first.
- check-lane-close.logic.test.ts planScenario (:~890-905): add an option set; default plants a good FOLD-CHECK.md. Control: full evidence passes (existing :912). Planted defects, each with the control green, asserting the refusal text (FOLD-CHECK.md, the form, expected: ... when stale): no file (also with GROUNDER-PLAN.md missing); no Checked by; empty name; name equal to the lane BL-COMPLY2, to an assignee; a sentence naming the lane after a comma or " (" beside a clean name (passes); Verdict: FAIL; two Verdict lines (last counts, both orders); stale Plan line; none; a Plan line inside prose does not count.
- plant-evidence.mjs: write FOLD-CHECK.md (Checked by: Fold-G1, Verdict: PASS, the Plan line of :65) between :66 and :67, one commit with the final hash. backlog-lane.logic.test.ts:779-800: c1 exit 3, both Plan lines stale, stderr names FOLD-CHECK.md; the grounder copies the expected line into both files; c2 exit 0, "plan gate ok" (:795); after the one-word edit (c3) exit 3, both stale, expected line printed. At :369-381 (--dry-run): FOLD-CHECK.md removed and committed gives exit 3 naming it; restored, plan gate ok. Controls: tests 7, 9, 12, 13, 14.
- rule-lists.logic.test.ts near :577: no --list, a one-file diff, small max: stdout path ends `-p1.txt`, no unsuffixed file written, stamp "chunk 1 of 1". Controls: with --list and one chunk the name stays unsuffixed (a new case pins it); multi-chunk unchanged; --out in-out-code-review-r2 gives -r2-p1.
- check-lane-close.logic.test.ts :420 area: a lane built by running the real lens-input on a one-file diff for code-review closes with out-code-review-p1.txt (control); the same pair renamed unsuffixed is still refused (planted defect keeps the lock).
ORDER. 0 the Pre-Review Self-Checklist (00_engineering_standards.md:287) over acceptance (a)-(f); 1 write the tests; 2 run the three named files (npm run test) and see the FOLD-CHECK and -p1 assertions fail; 3 edit.

6. LANDING
Two protected paths change, so: commit A = the two scripts, the tests, plant-evidence.mjs, the spec notes and this task file (a note line, status unchanged: a code commit carries its task file, check-backlog-task.mjs:3; the self-edit rule, check-lane-close.mjs:681-682, refuses only a status move), real hooks. Commit B: the lane's records only (report directory with the per-list compliance outputs re-made at that head and GROUNDER.md from a separate grounder, the review context directory, this task file to BUILT with the Final Summary round line); a plan task has no queue row (Spec 137 rule 2). Tasks naming the same scripts (366, 406, 407, 400, 404, 414) land one at a time, rebased on the board head. Run `rule-lists.mjs validate` before commit A.

7. ACCEPTANCE
(a) Plan-prep fixture: a board whose folder lacks FOLD-CHECK.md: `backlog-lane.mjs --dry-run` exits 3, stderr "FOLD-CHECK.md". With the file (Checked by: Fold-G1, Verdict: PASS, correct Plan line) it prints "plan gate ok".
(b) Same board, the task body edited by one word: exit 3, FOLD-CHECK.md Plan line stale, expected line printed.
(c) `node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context docs/reports/reviews/task-375/fixture-context.md --material <one-file diff> --out <dir>/in-out-code-review` prints `<dir>/in-out-code-review-p1.txt` and writes only that.
(d) The close check on a lane with out-code-review-p1.txt made from (c): exit 0 (named test green).
(e) Existing close tests (a -p1 pair, the unsuffixed compliance control) still pass.
(f) The three test files green; git diff --stat of commit A shows only the Files-line paths and this task file.

8. WHAT THIS CANNOT PROVE
That a fold check happened or was independent; only that a named, hash-bound PASS is committed. Old raw-diff outputs are neither blessed nor broken.

9. SETTLED BY THE PLAN GROUNDER (QUESTIONS-RULED.md): 1. the Files line above is final (the card's six paths plus the two specs; resolve gives the same nine rule lists); docs/reports is exempt (check-lane-close.mjs:453). 2. Prepped but not launched: none, no cutoff.

Plan review round 1: 62 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-419/GROUNDER-PLAN.md; triage docs/reports/reviews/task-419/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#1 MED folded the Files line above
plan-compliance-agents-s7-s11#5 MED folded at c442eec10: 14 fil
plan-compliance-agents-s7-s11#6 MED folded the :425 expression 
plan-compliance-eng-all#2 MED folded Specs, one dated not
plan-compliance-eng-all#3 MED folded the Pre-Review Self-
plan-compliance-eng-all#4 MED folded Plan line missing or
plan-compliance-five-words#1 MED folded Plan line missing or
plan-compliance-five-words#2 MED folded the Files line above
plan-compliance-five-words#3 MED folded plant-evidence.mjs i
plan-compliance-inc-S#1 MED folded plant-evidence.mjs i
plan-compliance-inc-S#2 MED folded Plan line missing or
plan-compliance-ms-S#1 MED folded Plan line missing or
plan-compliance-ms-S#2 MED folded the Files line above
plan-compliance-ms-S#4 MED folded its fold-check groun
plan-compliance-orchestrator-doc17#1 MED folded only the Files-line 
plan-compliance-plan-protocol#1 MED folded the Files line above
plan-compliance-plan-protocol#2 MED folded Prepped but not laun
plan-compliance-queue-137#1 HIGH folded a code commit carrie
plan-compliance-queue-137#2 MED folded a plan task has no q
plan-compliance-queue-137#3 MED folded report directory wit
plan-compliance-queue-137#4 MED folded the Files line above
plan-error-paths#1 MED folded the last of a repeat
plan-error-paths#2 MED folded or the line end, nev
plan-error-paths#7 MED folded Prepped but not laun
plan-plan-review-deepseek#1 MED folded each naming FOLD-CHE
plan-plan-review-deepseek#2 MED folded Prepped but not laun
plan-plan-review-deepseek#5 MED folded over scripts and src
int#1 MED folded the text after the c
int#2 MED folded the launch check als
int#3 MED folded each naming FOLD-CHE
rc#1 MED folded the text after the c
rg#1 MED folded the text after the c
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-21 (M-246, prior text kept; RR-0351 · task-419 · Backlog; operator, verbatim: "Gap 3 we dont need the cross check.")

Dated note 2026-11-21 (M-246, prior text kept; RR-0352 · task-419 · Backlog; operator, verbatim: "Let's resolve 1 and 2 now.")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-419-v1, written read-only by a separate planner against the code at 7db3a81cc. The Files line is replaced by the plan's six paths (adds src/tests/backlog/backlog-lane.logic.test.ts and docs/reports/reviews/task-375/plant-evidence.mjs; open question 1 for the plan grounder). The planner found the card's gap 2 narrower than written: the name trap holds only for lenses with no rule list (check-lane-close.mjs:508-513); compliance outputs are accepted unsuffixed (check-lane-close.mjs:373-409). The plan is reviewed, ruled, folded and fold-checked before any launch (RR-0352).

Dated note 2026-11-21 (M-246, prior text kept; RR-0354 · task-419 · Backlog; operator, verbatim: "change the spec's wording")

Dated note 2026-11-21 (M-246, prior text kept; RR-0355 · task-419 · Backlog; operator, verbatim: "Agreed. Let's push as soon as possible! Also recolve the scorecards issue now. The gaps are closed in parellel.")

2026-11-21 (M-246) Plan review round 1 of this task, the second made with plan-prep (task-418): 11 plan review outputs written by plan-prep review, the Integration, Reality-Check and Regression seats on the plan, ruled by the separate grounder Cairn-Ground-P419: 79 findings, 63 CONFIRMED (1 HIGH, 31 MED, 26 LOW, 5 NIT), 16 REJECTED, 0 CONFLICT; 62 folded into the plan by 27 sentence edits (FOLD-419.json as the grounder wrote it, applied mechanically), 1 to the review pile; block and references added by plan-prep post. Eight open questions were ruled by the grounder with grounds (docs/reports/reviews/task-419/QUESTIONS-RULED.md) and are reported to the operator: Q1 the Files line is final at eight paths (the six of the card plus docs/specs/00-architecture/08_agents.md and 137_mcqueue.md for the RR-0354 wording and the gate note; no new rule list, the nine lists are unchanged); Q2 no task is prepped and unlaunched (task-412 and task-418, both BUILT), no date cutoff; Q3 the Checked by name is the text up to the first comma or " (" or the line end, the last of a repeated line counts; Q4 plant-evidence.mjs is edited (a fixture program, 3 lines between :66 and :67); Q5 two dated spec notes in commit A (08_agents.md after 11.2: the cross-read adversary pass is no longer required after a fold, the grounder's re-execution stays and leaves FOLD-CHECK.md, RR-0354; 137_mcqueue.md after :140: the launch check also requires FOLD-CHECK.md); Q6 the clash with the lane and the assignees is kept (the Grounder line rule); Q7 the FOLD-CHECK Plan line is copied from the gate's expected output after post and the first commit; Q8 a round file made by lens-input is named -rN-p1. Not ruled, for the operator: the scope of RR-0354 (the orchestrator's reading is that the pass is no longer required anywhere), the copies of the 11.2 wording in CLAUDE.md, .claude/workflows.md, packs/spec08.md and Spec 119 that this task does not edit, and whether the raw-diff route of a one-file review stays.

2026-11-21 taken on the board at lane launch (lane BL-GAPS419, worktree /Users/brettpreston_macmini/Buildo-wt-gaps419, branch wf1/inc1b-gaps419), RR-0240

2026-11-21 lane BL-GAPS419: tests written first (check-lane-close, rule-lists, backlog-lane logic tests and the plant-evidence fixture), red attempt through the real pre-commit hook, output in the lane dir red.out; no code edit yet.

2026-11-21 lane BL-GAPS419: red proven through the real pre-commit hook (12 failing assertions, red.out). Build commit A1 = the two scripts, the three test files, plant-evidence.mjs (green: 279 tests in the three files, commit.out). The spec notes could not ride the same commit as the plan's LANDING says: the pre-commit refuses a spec edit unless docs/reports/generated/rule-lists-by-kind.md is regenerated (the rule-list character counts move), and check-task-files refuses that page in a code commit because it is outside the Files line. Precedent: task-375 commit 574378f22 landed its spec notes and the page as a docs-only commit (no code file staged). So the two dated spec notes land in commit A2, docs-only, with the regenerated page; reported to the orchestrator.

2026-11-21 lane BL-GAPS419: commit A2 (docs-only) carries the two dated spec notes (08_agents.md after 11.2, 137_mcqueue.md after :140; RR-0351, RR-0352, RR-0354) and the regenerated docs/reports/generated/rule-lists-by-kind.md.

2026-11-21 lane BL-GAPS419 ACCEPTANCE ON REAL INPUTS (commits 571b6d999 code and tests, 89119b6ff spec notes). (a) and (b) run by the named tests through the real pre-commit hook (the fixture board is a real git repo, the real backlog-lane.mjs dry run): backlog-lane.logic.test.ts "task-419 (a): a board whose evidence folder lacks FOLD-CHECK.md (committed) is refused at the launch dry run naming the file; with the file back the dry run prints plan gate ok" PASS (exit 3 stderr FOLD-CHECK.md is missing; then exit 0 and plan gate ok), and "D: with the evidence the dry-run prints plan gate ok ... a one-word edit refuses" PASS with the FOLD-CHECK.md Plan line stale and expected: Plan: task-N sha256:<12>; the end to end "11 and 14" PASS (first commit exit 3 naming both Plan lines, the grounder copies the line into both files, second commit exit 0 plan gate ok, one-word edit exit 3). (c) real run: node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context docs/reports/reviews/task-375/fixture-context.md --material <one-file diff of scripts/analysis/rule-lists.mjs, 2323 chars> --out <dir>/in-out-code-review printed exactly "<dir>/in-out-code-review-p1.txt", exit 0, ls of the dir: c.out, in-out-code-review-p1.txt, onefile.diff (only that input written). (d) check-lane-close.logic.test.ts "task-419 (d): a one-file diff reviewed with lens-input and no list closes with out-code-review-p1.txt (control); the same pair renamed unsuffixed is still refused" PASS. (e) the existing close tests (the -p1 pair, the unsuffixed compliance control, V2.WHOLE) all PASS in the same run. (f) the pre-commit run of the three named files: "Test Files 3 passed (3), Tests 279 passed (279)". git diff --stat of the two commits: 10 files, the eight Files-line paths, this task file and docs/reports/generated/rule-lists-by-kind.md (regenerated by the hook's own demand, a derived page the spec edits move; it is outside the Files line, landed in the docs-only commit 89119b6ff as task-375 did in 574378f22). rule-lists.mjs validate: ok 55 lists, 23 rows.

2026-11-21 lane BL-GAPS419 fix round 1 (grounder Cairn-Ground-O419): tests first for g419#3, g419#4 and the three looseness findings; red attempt output red2.out.

2026-11-21 lane BL-GAPS419 fix round 1: check-lane-close.mjs reads Checked by, Verdict and Plan with [ \t] instead of whitespace so each is one line (out-code-review-p1#2, agents-s5-1to3#2 in part, inc-S#2 in part); tests for g419#3 and g419#4 added.

2026-11-21 (M-246) Operator RR-0360, verbatim: "change the claude.md to remove the cross check.  The agent stays available on request is fine froma wording perspective": CLAUDE.md added to the Files line by the lane on the orchestrator's relay of this ruling; lines 139 and 143 edited; the other copies of the wording are not edited.

2026-11-21 lane BL-GAPS419 fix round 1 landed: e5c3a4818 (check-lane-close.mjs one-line reads, tests), f4c0a0b42 (spec notes with RR-0360, CLAUDE.md :139 and :143, regenerated page, Files line plus CLAUDE.md). Round 2 output review made at that head, 11 outputs, 32 findings, plant-evidence.mjs and CLAUDE.md in the material.

Dated note 2026-11-21 (M-246, prior text kept; RR-0360 · task-419 · Backlog; operator, verbatim: "change the claude.md to remove the cross check.  The agent stays available on request is fine froma wording perspective")

Dated note 2026-11-21 (M-246, prior text kept; RR-0370 · task-419 · Backlog; operator, verbatim: "if so approved. 2. The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today. Also want to add the spec rules section as a later task to the board.")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed: the launch check requires the grounder's FOLD-CHECK.md (Checked by, Verdict PASS, last Plan line) and lens-input names a no-list lens input -pN always. Commits: 571b6d999 (code and tests, hook run green: Tests 279 passed), e5c3a4818 (fix round 1: one-line reads, tests; hook run Tests 280 passed), f4c0a0b42 (spec notes with RR-0360, CLAUDE.md lines 139 and 143, Files line plus CLAUDE.md, regenerated page). Acceptance (a) to (f) evidence is in the Implementation Notes. Grounder rounds 1 to 4 in GROUNDER.md; the cross-check wording copies outside CLAUDE.md go to task-426.

Review round 1: 10 fixed, 6 task, 1 ruling, 0 wontfix, 12 pile; grounder docs/reports/lanes/2026-11-21/BL-GAPS419/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-GAPS419/TRIAGE.md
out-compliance-eng-all-r1#2 MED task task-426
out-compliance-orchestrator-doc17-r1#2 MED task task-426
g419#1 HIGH fixed 273d5bb
g419#5 MED ruling decision-145
out-compliance-eng-all-r2#2 MED task task-426
out-compliance-ms-S-r2#2 MED task task-426
<!-- SECTION:FINAL_SUMMARY:END -->
