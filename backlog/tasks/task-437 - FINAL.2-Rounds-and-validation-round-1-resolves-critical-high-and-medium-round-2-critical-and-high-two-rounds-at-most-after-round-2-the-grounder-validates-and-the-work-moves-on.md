---
id: TASK-437
title: >-
  FINAL.2 Rounds and validation: round 1 resolves critical, high and medium,
  round 2 critical and high, two rounds at most; after round 2 the grounder
  validates and the work moves on
status: BUILT
assignee:
  - '@lane-BL-ROUNDS437'
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-437/GROUNDER-PLAN.md
  - docs/reports/reviews/task-437/TRIAGE-PLAN.md
  - docs/reports/reviews/task-437/seat-integration-1.md
  - docs/reports/reviews/task-437/seat-reality-check-1.md
  - docs/reports/reviews/task-437/seat-regression-1.md
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
  - docs/reports/lanes/2026-11-22/BL-ROUNDS437/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-ROUNDS437/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-ROUNDS437/TRIAGE.md
type: build
ordinal: 137012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium."; "Validate the plan and the output as you mentioned as per your criteria." THIS TASK: a dated note in Spec 08 with the rule and the three things that still come to the operator (a critical or high still open after round 2; a decision that needs his word; every push); the close check accepts two output rounds (it supersedes the third round of RR-0371); the grounder brief says LOW and NIT are recorded, not folded. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md
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
# PLAN-437-v1: FINAL.2 Rounds and validation (task-437)

## BASIS
- RR-0385 item 3, MORNING-DECISIONS.md:1919: "round 1 resolves CRITICAL, HIGH and MED; round 2 CRITICAL and HIGH only; two rounds at most, plan and output ... Supersedes the third output round of RR-0371."
- RR-0385 item 4, :1920: after round 2 the grounder validates the fold and the work moves forward without the operator. It comes to him only for (i) a CRITICAL or HIGH still open after round 2, (ii) a decision that needs his word, (iii) every push.
- The operator's words, verbatim: :1910 "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium."; :1912 "Validate the plan and the output as you mentioned as per your criteria."; :1909 "We want to reomve any of the gates work we added"; "Keep those that are built" (:1910).
- Earlier rulings: RR-0369 (decision-154, :1782) is the same rule for the output. Its reading (3), :1783 (the orchestrator's, not his words), says round-2 MED is recorded with a reason. RR-0371 (decision-156, :1800-1806) set two plan rounds then to the operator, and three output rounds; RR-0385 item 3 supersedes only its third output round, and the two-round plan cap stands. RR-0364 (decision-149) says medium and low findings are recorded, not fixed; RR-0369 replaced its medium part (:1782), so it now holds for LOW and NIT. RR-0359 (decision-144) says nothing is folded before the grounder rules; it is unchanged.
- How a spec is changed: a dated note is added and the prior text is kept (M-246; model: 00_engineering_standards.md:308).

## FACTS
- F1. Outcome forms: check-lane-close.mjs:148 (FORM_WORDS) and :194. CRITICAL, HIGH and MED take fixed (folded at the plan) or ruling; task is allowed only for a DEFER finding. LOW and NIT take any form. `pile` and `wontfix` are refused for MED (:205).
- F2. `ruling:RR-NNNN` passes when a decision file's basename contains the id. Close check: gitFacts.decisionExists, :305. Launch gate: backlog-lane.mjs:102. "decision-170 - RR-0385-..." therefore satisfies `ruling:RR-0385` today, in both modes.
- F3. At the plan, nothing forces a LOW to be folded. Every CONFIRMED or CONFLICT id needs one outcome line (:186, :199), and `pile` is accepted for LOW and NIT in plan mode (:148, :194). Folding a LOW is practice, not code.
- F4. No round cap exists. The close check counts rounds as `n = 1 + prior "Review round N:" lines` (:272) with no bound; a second output round is accepted and locked (check-lane-close.logic.test.ts:730-731). The plan gate reads every "Plan review round N:" line (:662-667) with no bound.
- F5. plan-prep allows one review round per run (rule-lists.mjs:640). post refuses a second round line (:737), so a plan round 2 line is entered by hand; task-375, task-418 and task-423 hold "Plan review round 2".
- F6. The lane brief tells lanes "a later (fix) round (r2, r3, ...)" (backlog-lane.mjs:185) and says nothing about severities by round. backlog-brief.mjs:174 already prints `max_fix_rounds: 2`.
- F7. No grounder brief lives in the repo: the orchestrator writes it. The lane's description of the grounder is backlog-lane.mjs:186.
- F8. Spec 08 states the outcome forms in the notes at :354-355. No Spec 08 note states round limits or cites RR-0369 or RR-0371.

## WHAT
Today's code refuses none of the ruled behaviour:
- A round-2 MED can be recorded as `ruling:RR-0385` (F2).
- LOW and NIT can be piled (F3).
- Two rounds are already allowed (F4).

So check-lane-close.mjs and rule-lists.mjs (both protected paths) are NOT changed. "Build with existing components" (:1522); no new gate work (:1909).

Changes:
1. One dated note in Spec 08 after :355.
2. One brief edit at backlog-lane.mjs:185, plus one sentence of the rule.
3. Tests: one red test for the brief, and one lock test that proves the existing outcome behaviour in both directions.

## EXACT TEXT: dated note (new line after :355, indented three spaces)
 Dated note 2026-11-22 (M-246, prior text kept; task-437 FINAL.2, McFix Final; RR-0385 items 3 and 4, decision-170; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1910 "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium." and :1912 "Validate the plan and the output as you mentioned as per your criteria."): at the plan and at the output, round 1 resolves the CONFIRMED CRITICAL, HIGH and MED findings (RR-0359) and round 2, the second review round (not the grounder's 5.3 round-2 pass), resolves CRITICAL and HIGH only; two rounds at most. Two is the most: when a second round is run stays as RR-0363 and RR-0369 left it. This supersedes the third output round of RR-0371 (its two-round plan cap stands) and keeps RR-0369. LOW and NIT are recorded (pile or wontfix with a reason), not required to be fixed or folded (RR-0364, whose medium part RR-0369 replaced). A MED confirmed in round 2 is recorded with the outcome line `<id> ruling:RR-0385`, a form the close check and the launch gate already accept; pile stays LOW and NIT only. The grounder's verdict line for that id gives the reason and names the round (the round line on the card cannot), and the orchestrator lists it in MEDIUM-LATER-ROUNDS.md (his order, :1792). After round 2 the separate grounder validates the fold (plan: FOLD-CHECK.md, which the launch gate requires; output: GROUNDER.md, which the close reads; neither is a review round) and the work moves on without the operator. It comes to the operator only when (i) a CRITICAL or HIGH is still open after round 2, (ii) a decision needs his word (a product choice no spec settles, or an earlier answer of his that rests on a wrong fact or reads two ways), or (iii) a push is due. Not enforced: the cap and the round-2 MED rule are process; `scripts/hooks/check-lane-close.mjs` counts "Review round N" lines without a bound and accepts a recorded ruling id (RR-0385 included) for a finding of any severity, on any task, in any round, so it cannot tell a round-1 MED from a round-2 MED; plan-prep supports one round, and a second plan round line is entered by hand.

## CODE CHANGE (backlog-lane.mjs:185 only; not protected)
- Replace "a later (fix) round (r2, r3, ...) is filed beside them as" with "the second (fix) round (r2; two output rounds at most, RR-0385) is filed beside them as".
- Append to the `grounder` text (:186): " ROUNDS (RR-0385, Spec 08 dated note 2026-11-22): round 1 resolves CRITICAL, HIGH and MED findings; round 2 resolves CRITICAL and HIGH only, and a MED the grounder confirms in round 2 gets the outcome line `<id> ruling:RR-0385` in TRIAGE.md (the grounder decides it, the lane does not rule); LOW and NIT are recorded (pile or wontfix, 30+ character reason), not fixed or folded; there is no third round: a CRITICAL or HIGH still open after round 2 is reported with STATUS: blocked, for the operator."

## TESTS (red first)
- T1, backlog-lane.logic.test.ts, dry run: TASK-JSON `extra` contains "two output rounds at most", "ruling:RR-0385" and "not fixed or folded", and does not contain "r3, ...". Red on today's text.
- T2, check-lane-close.logic.test.ts, in the pure outcomeErrors block (:758), as a lock:
- A CONFIRMED MED with `pile:"<30+ chars>"` is refused in close mode and in plan mode (:699 and :702-707 already cover the close-mode ruling and HIGH or LOW pile cases).
- `ruling:RR-0385` passes when decisionExists is true. This is the control.
- The same line is refused when decisionExists is false. This plants the second direction.
- A LOW with `pile:` passes in plan mode.
- A survive-the-fix (green-both) lock, stated as such per 08_agents.md:485: green on today's code by design; both directions are inside it. The same line also passes for a HIGH, pinning the note's "any severity" sentence.

## ORDER
- After 436, since both edit backlog-lane.mjs in separate regions (436 at :174/:208/:223/:231, this task at :185-186).
- After 436 lands, the plan input for agents-s7-s11 is stale: the orchestrator re-makes it before launch, a second plan review round (task-423's round-2 note), so only CRITICAL and HIGH are folded.
- Before 438. This task leaves check-lane-close.mjs unchanged, so task-438's edits there do not meet this task's; its only shared file is the test file check-lane-close.logic.test.ts, and the new describe block is kept separate.

## LANDING
- Code commit: the tests, backlog-lane.mjs, the Spec 08 note, and the task file with `Task: task-437`. No status move in it. The lane appends docs/reports/generated/rule-lists-by-kind.md to the first Files line of its own task file in this commit (check-task-files.mjs reads the index copy), and after the note is final and 436 has landed runs `node scripts/analysis/rule-lists.mjs page --write` and stages the page (pre-commit runs `page --check`). The page resolves one more list, policy-124-s2-s5, so the output review owes one more out- compliance output for it. The note names no src/ path in backticks, so the system map is unchanged.
- Then the closing commit with the records (two-commit close, :185).

## ACCEPTANCE
- Spec 08 holds the note.
- Every brief states the two-round rule and the round-2 MED form.
- The lock test pins the forms.
- The suite is green.
- The rule applies from this landing (:1925 reading).

## NOT IN SCOPE
- No change to check-lane-close.mjs or rule-lists.mjs.
- No cap refusal. A one-line `n > 2` refusal would also block a third round the operator himself rules under case (i), and there is no escape short of new gate work, which he withdrew (:1909).
- No refusal of fixed or folded for LOW: "never fixed by rule" (:1783) does not forbid fixing.
- The orchestrator's own grounder brief is outside the repo (F7); the Spec 08 note and the :186 text are its repo source.
- The output rN-versus-rerun wording conflict between 08_agents.md:355 (3) and backlog-lane.mjs:185 is left as it is.

## QUESTION (ruled by the plan grounder)
Q1. Is a class ruling (`ruling:RR-0385`) an acceptable record for each round-2 MED?
- (A) Yes, as planned: zero code; the per-finding line "id MED ruling RR-0385" is still on the task page (:274).
- (B) Let `pile` count for MED in round 2 only: about 4 lines in a protected file, computing n before the outcome loop.
- RULED A (no operator word needed): RR-0385 item 5, :1921, "gates already built are kept; unbuilt gate cards are withdrawn", and :1909 "We want to reomve any of the gates work we added"; B changes a protected check.

## UNVERIFIED
- The record names no file for "validates the fold"; it is read as FOLD-CHECK.md at the plan (the launch gate requires it, check-lane-close.mjs:679-698) and the separate grounder's GROUNDER.md at the output (:566-568).
- The card's DoD cites 08_agents.md:462 and :490. The texts are now at :485 and :513.

## GUESS
About 1.5 hours of lane time; about 6 changed lines plus 2 tests.

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md

Plan review round 1: 42 folded, 0 task, 0 ruling, 0 wontfix, 16 pile; grounder docs/reports/reviews/task-437/GROUNDER-PLAN.md; triage docs/reports/reviews/task-437/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded neither is a review 
plan-compliance-agents-s5-1to3#2 MED folded LOW and NIT are reco
plan-compliance-agents-s5-1to3#3 MED folded RULED A (no operator
plan-compliance-agents-s5-1to3#4 MED folded RR-0369 replaced its
plan-compliance-agents-s5-1to3#5 MED folded a second output roun
plan-compliance-agents-s7-s11#4 MED folded RR-0369 replaced its
plan-compliance-agents-s7-s11#5 MED folded neither is a review 
plan-compliance-eng-all#1 MED folded LOW and NIT are reco
plan-compliance-eng-all#4 MED folded neither is a review 
plan-compliance-five-words#1 MED folded LOW and NIT are reco
plan-compliance-five-words#2 MED folded RR-0369 replaced its
plan-compliance-five-words#3 MED folded a second output roun
plan-compliance-five-words#4 MED folded round 1 resolves the
plan-compliance-inc-S#2 MED folded LOW and NIT are reco
plan-compliance-inc-S#4 MED folded RR-0369 replaced its
plan-compliance-inc-S#6 MED folded RULED A (no operator
plan-compliance-ms-S#1 MED folded RR-0369 replaced its
plan-compliance-ms-S#2 MED folded LOW and NIT are reco
plan-compliance-ms-S#3 MED folded LOW and NIT are reco
plan-compliance-ms-S#4 MED folded RULED A (no operator
plan-compliance-orchestrator-doc17#2 MED folded LOW and NIT are reco
plan-compliance-orchestrator-doc17#3 MED folded round 1 resolves the
plan-compliance-plan-protocol#1 MED folded LOW and NIT are reco
plan-compliance-plan-protocol#2 MED folded neither is a review 
plan-compliance-plan-protocol#3 MED folded RULED A (no operator
plan-compliance-plan-protocol#6 MED folded RR-0369 replaced its
plan-compliance-queue-137#3 MED folded LOW and NIT are reco
plan-compliance-queue-137#4 MED folded neither is a review 
plan-compliance-queue-137#6 MED folded supersedes only its 
plan-error-paths#6 MED folded neither is a review 
plan-plan-review-deepseek#4 MED folded a second output roun
plan-plan-review-deepseek#7 MED folded LOW and NIT are reco
plan-plan-review-deepseek#13 MED folded for a finding of any
ig#1 HIGH folded The lane appends doc
ig#2 MED folded the plan input for a
ig#3 MED folded the grounder decides
ig#4 MED folded for a finding of any
rc#1 MED folded neither is a review 
rc#2 MED folded for a finding of any
rg#1 MED folded when a second round 
rg#2 MED folded gives the reason and
rg#4 MED folded A survive-the-fix (g

Plan review round 2: 40 folded, 0 task, 0 ruling, 0 wontfix, 16 pile; grounder docs/reports/reviews/task-437/GROUNDER-PLAN.md; triage docs/reports/reviews/task-437/TRIAGE-PLAN.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-22 taken on the board at lane launch (lane BL-ROUNDS437, worktree /Users/brettpreston_macmini/Buildo-wt-rounds437, branch wf1/inc1b-rounds437), RR-0240

2026-11-22 tests first (lane BL-ROUNDS437): T1 (backlog-lane.logic.test.ts, dry-run extra states the two-round rule) written to be red on today's brief text; T2 (check-lane-close.logic.test.ts, new describe block) is a survive-the-fix (green-both) lock per 08_agents.md:485, green on today's code by design. Red attempt: only the tests and this task file staged.

2026-11-22 red seen (lane BL-ROUNDS437): the commit attempt with only the two test files and this task file staged was refused by the pre-commit related run at T1's first assertion (backlog-lane.logic.test.ts:169, expected extra to contain 'two output rounds at most'); 1 failed, 226 passed, so T2 (the survive-the-fix lock) was green as designed. Build: backlog-lane.mjs layout sentence replaced and the ROUNDS sentence appended to the grounder text, as the plan's CODE CHANGE says; the dated note added to 08_agents.md after the task-399 fix-round note (now :356); the generated page rule-lists-by-kind.md regenerated with rule-lists.mjs page --write and added to the description Files line (plan LANDING).

2026-11-22 STOPPED (lane BL-ROUNDS437): the plan cannot be built as written. The work commit was refused by the pre-commit related run: 1 failed, 226 passed; the failing test is the existing lock backlog-lane.logic.test.ts:280 (task-407 V2.LAYOUT fold, commit bbb0b31f2) expect(e).not.toContain('TRIAGE.md'), in 'a build on a surface: ... a separate grounder rules in GROUNDER.md; no security'. The sentence of the plan that breaks it is CODE CHANGE item 2, the grounder append: '... gets the outcome line `<id> ruling:RR-0385` in TRIAGE.md (the grounder decides it, the lane does not rule) ...' (wording from QUESTIONS-RULED.md Q7). Nothing is committed; the edits stay staged in the worktree. Needs a ruling: reword the appended sentence without the file name TRIAGE.md, or change the task-407 lock (outside the plan). Grounder or orchestrator owed; task stays RUNNING.

2026-11-22 resumed (lane BL-ROUNDS437) on the plan grounder ruling Q19 (QUESTIONS-RULED.md, board d8689023c): option (a), ' in TRIAGE.md' removed from the grounder append sentence in backlog-lane.mjs; no test line changed; the task-407 lock backlog-lane.logic.test.ts:280 stands and is the proof. post-build#1 CONFIRMED MED, recorded under RR-0385.

2026-11-22 ACCEPTANCE (lane BL-ROUNDS437, work commit 6e0d1d5a6):
(1) Spec 08 holds the note: 356:   Dated note 2026-11-22 (M-246, prior text kept; task-437 FINAL.2, McFix Final; RR-0385 items 3 and 4, decision-170; operator, verbatim ...
(2) Every brief states the two-round rule and the round-2 MED form (lensLine in backlog-lane.mjs, carried in every brief's extra; T1 asserts it on the dry run): 186:the second (fix) round (r2; two output rounds at most, RR-0385)
187:ROUNDS (RR-0385, Spec 08 dated note 2026-11-22): round 1 resolves CRITICAL, HIGH and MED findings; round 2 resolves CRITICAL and HIGH only, and a MED the grounder confirms in round 2 gets the outcome line `<id> ruling:RR-0385`
(3) The lock test pins the forms: the work commit's pre-commit related run (commit.out) 1092: Test Files  2 passed (2) 1093:      Tests  227 passed (227)  (T1 and T2 and the task-407 lock at backlog-lane.logic.test.ts:280 green).
(4) The suite is green: UNVERIFIED in the lane; the full suite runs only at the push station (brief rule 18).
(5) The rule applies from this landing: work commit 6e0d1d5a6 on wf1/inc1b-rounds437; not yet on the board or origin.

2026-11-22 output review round 1 done (lane BL-ROUNDS437): 13 lens outputs in docs/reports/lanes/2026-11-22/BL-ROUNDS437 (compliance per list x10, policy-124-s2-s5 in 2 parts; code-review-p1, error-paths-p1), context-r4.md; 54 ids + post-build#1 listed untriaged in FINDINGS.md. Close dry run on a throwaway clone: only the GROUNDER.md and reference refusals. Task stays RUNNING: grounder owed (RR-0359).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed in work commit 6e0d1d5a6 (lane BL-ROUNDS437): the lane brief (scripts/analysis/backlog-lane.mjs:186-187) states two output rounds at most (RR-0385), round 2 resolves CRITICAL and HIGH only, a round-2 MED takes ruling:RR-0385, LOW and NIT are recorded not fixed or folded; Spec 08 dated note 2026-11-22 at 08_agents.md:356; T1 (red first, red.out) and T2 (survive-the-fix lock) green in the related run (227 passed); generated page rule-lists-by-kind.md regenerated. Output review round 1: 13 lens outputs, 54 ids plus post-build#1 ruled by the separate grounder Cairn-Ground-O437 (10 CONFIRMED, 45 REJECTED; nothing CRITICAL or HIGH stands; no second round). Full suite: push station.

Review round 1: 1 fixed, 0 task, 0 ruling, 0 wontfix, 9 pile; grounder docs/reports/lanes/2026-11-22/BL-ROUNDS437/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-ROUNDS437/TRIAGE.md
post-build#1 MED fixed 6e0d1d5
<!-- SECTION:FINAL_SUMMARY:END -->
