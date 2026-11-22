---
id: TASK-437
title: >-
  FINAL.2 Rounds and validation: round 1 resolves critical, high and medium,
  round 2 critical and high, two rounds at most; after round 2 the grounder
  validates and the work moves on
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-22T20:31:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 137012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium."; "Validate the plan and the output as you mentioned as per your criteria." THIS TASK: a dated note in Spec 08 with the rule and the three things that still come to the operator (a critical or high still open after round 2; a decision that needs his word; every push); the close check accepts two output rounds (it supersedes the third round of RR-0371); the grounder brief says LOW and NIT are recorded, not folded. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md
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
- Earlier rulings: RR-0369 (decision-154, :1782) is the same rule for the output. Its reading (3), :1783, says round-2 MED is recorded with a reason. RR-0371 (decision-156, :1800-1806) set two plan rounds then to the operator, and three output rounds; RR-0385 replaces both caps. RR-0364 (decision-149) says LOW and NIT are recorded, not fixed. RR-0359 (decision-144) says nothing is folded before the grounder rules; it is unchanged.
- How a spec is changed: a dated note is added and the prior text is kept (M-246; model: 00_engineering_standards.md:308).

## FACTS
- F1. Outcome forms: check-lane-close.mjs:148 (FORM_WORDS) and :194. CRITICAL, HIGH and MED take fixed (folded at the plan) or ruling; task is allowed only for a DEFER finding. LOW and NIT take any form. `pile` and `wontfix` are refused for MED (:205).
- F2. `ruling:RR-NNNN` passes when a decision file's basename contains the id. Close check: gitFacts.decisionExists, :305. Launch gate: backlog-lane.mjs:102. "decision-170 - RR-0385-..." therefore satisfies `ruling:RR-0385` today, in both modes.
- F3. At the plan, nothing forces a LOW to be folded. Every CONFIRMED or CONFLICT id needs one outcome line (:186, :199), and `pile` is accepted for LOW and NIT in plan mode (:148, :194). Folding a LOW is practice, not code.
- F4. No round cap exists. The close check counts rounds as `n = 1 + prior "Review round N:" lines` (:272) with no bound. The plan gate reads every "Plan review round N:" line (:662-667) with no bound.
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
 Dated note 2026-11-22 (M-246, prior text kept; task-437 FINAL.2, McFix Final; RR-0385 items 3 and 4, decision-170; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1910 "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium." and :1912 "Validate the plan and the output as you mentioned as per your criteria."): at the plan and at the output, round 1 resolves CRITICAL, HIGH and MED findings and round 2 resolves CRITICAL and HIGH only; two rounds at most. This supersedes the round caps of RR-0371 (two plan rounds then the operator; three output rounds) and keeps RR-0369. LOW and NIT are recorded (pile or wontfix with a reason), not required to be fixed or folded (RR-0364). A MED confirmed in round 2 is recorded with the outcome line `<id> ruling:RR-0385`, a form the close check and the launch gate already accept; pile stays LOW and NIT only. After round 2 the separate grounder validates the fold (FOLD-CHECK.md at the plan, its round-2 GROUNDER.md at the output) and the work moves on without the operator. It comes to the operator only when (i) a CRITICAL or HIGH is still open after round 2, (ii) a decision needs his word (a product choice no spec settles, or an earlier answer of his that rests on a wrong fact or reads two ways), or (iii) a push is due. Not enforced: the cap and the round-2 MED rule are process; `scripts/hooks/check-lane-close.mjs` counts "Review round N" lines without a bound and accepts any recorded ruling id for a MED.

## CODE CHANGE (backlog-lane.mjs:185 only; not protected)
- Replace "a later (fix) round (r2, r3, ...) is filed beside them as" with "the second (fix) round (r2; two output rounds at most, RR-0385) is filed beside them as".
- Append to the `grounder` text (:186): " ROUNDS (RR-0385, Spec 08 dated note 2026-11-22): round 1 resolves CRITICAL, HIGH and MED findings; round 2 resolves CRITICAL and HIGH only, and a MED confirmed in round 2 is recorded as `<id> ruling:RR-0385`; LOW and NIT are recorded (pile or wontfix, 30+ character reason), not fixed; there is no third round: a CRITICAL or HIGH still open after round 2 is reported with STATUS: blocked, for the operator."

## TESTS (red first)
- T1, backlog-lane.logic.test.ts, dry run: TASK-JSON `extra` contains "two output rounds at most" and "ruling:RR-0385", and does not contain "r3, ...". Red on today's text.
- T2, check-lane-close.logic.test.ts, in the pure outcomeErrors block (:758), as a lock:
- A CONFIRMED MED with `pile:"<30+ chars>"` is refused in close mode and in plan mode. This is the planted defect.
- `ruling:RR-0385` passes when decisionExists is true. This is the control.
- The same line is refused when decisionExists is false. This plants the second direction.
- A LOW with `pile:` passes in plan mode.
- Proven in both directions (08_agents.md:485). T2 is green on today's code by design: it locks the behaviour the note relies on.

## ORDER
- After 436, since both edit backlog-lane.mjs in separate regions (436 at :174/:208/:223/:231, this task at :185-186).
- Before 438. This task leaves check-lane-close.mjs unchanged, so task-438's edits there do not meet this task's; its only shared file is the test file check-lane-close.logic.test.ts, and the new describe block is kept separate.

## LANDING
- Code commit: the tests, backlog-lane.mjs, the Spec 08 note, and the task file with `Task: task-437`. No status move in it.
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
- The grounder brief: it is the orchestrator's text, outside the repo (F7).
- The output rN-versus-rerun wording conflict between 08_agents.md:355 (3) and backlog-lane.mjs:185 is left as it is.

## OPEN QUESTION (the record cannot settle it)
Q1. Is a class ruling (`ruling:RR-0385`) an acceptable record for each round-2 MED?
- (A) Yes, as planned: zero code; the per-finding line "id MED ruling RR-0385" is still on the task page (:274).
- (B) Let `pile` count for MED in round 2 only: about 4 lines in a protected file, computing n before the outcome loop.
- Recommendation: A, because the operator ordered the existing gates kept and no new gate work (:1909, :1910).

## UNVERIFIED
- That FOLD-CHECK.md (task-419, check-lane-close.mjs:679) is what "validates the fold" means at the plan. The record names no file.
- The card's DoD cites 08_agents.md:462 and :490. The texts are now at :485 and :513.

## GUESS
About 1.5 hours of lane time; about 6 changed lines plus 2 tests.

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md
<!-- SECTION:PLAN:END -->
