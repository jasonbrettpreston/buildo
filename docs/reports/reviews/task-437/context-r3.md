# Review context for task-437 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 3)

## Task
task-437 FINAL.2 Rounds and validation: round 1 resolves critical, high and medium, round 2 critical and high, two rounds at most; after round 2 the grounder validates and the work moves on
status: RUNNING · milestone: m-1 · assignee: @lane-BL-ROUNDS437 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium."; "Validate the plan and the output as you mentioned as per your criteria." THIS TASK: a dated note in Spec 08 with the rule and the three things that still come to the operator (a critical or high still open after round 2; a decision that needs his word; every push); the close check accepts two output rounds (it supersedes the third round of RR-0371); the grounder brief says LOW and NIT are recorded, not folded. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md

## Acceptance criteria

## Implementation Plan
#### PLAN-437-v1: FINAL.2 Rounds and validation (task-437)

#### BASIS
- RR-0385 item 3, MORNING-DECISIONS.md:1919: "round 1 resolves CRITICAL, HIGH and MED; round 2 CRITICAL and HIGH only; two rounds at most, plan and output ... Supersedes the third output round of RR-0371."
- RR-0385 item 4, :1920: after round 2 the grounder validates the fold and the work moves forward without the operator. It comes to him only for (i) a CRITICAL or HIGH still open after round 2, (ii) a decision that needs his word, (iii) every push.
- The operator's words, verbatim: :1910 "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium."; :1912 "Validate the plan and the output as you mentioned as per your criteria."; :1909 "We want to reomve any of the gates work we added"; "Keep those that are built" (:1910).
- Earlier rulings: RR-0369 (decision-154, :1782) is the same rule for the output. Its reading (3), :1783 (the orchestrator's, not his words), says round-2 MED is recorded with a reason. RR-0371 (decision-156, :1800-1806) set two plan rounds then to the operator, and three output rounds; RR-0385 item 3 supersedes only its third output round, and the two-round plan cap stands. RR-0364 (decision-149) says medium and low findings are recorded, not fixed; RR-0369 replaced its medium part (:1782), so it now holds for LOW and NIT. RR-0359 (decision-144) says nothing is folded before the grounder rules; it is unchanged.
- How a spec is changed: a dated note is added and the prior text is kept (M-246; model: 00_engineering_standards.md:308).

#### FACTS
- F1. Outcome forms: check-lane-close.mjs:148 (FORM_WORDS) and :194. CRITICAL, HIGH and MED take fixed (folded at the plan) or ruling; task is allowed only for a DEFER finding. LOW and NIT take any form. `pile` and `wontfix` are refused for MED (:205).
- F2. `ruling:RR-NNNN` passes when a decision file's basename contains the id. Close check: gitFacts.decisionExists, :305. Launch gate: backlog-lane.mjs:102. "decision-170 - RR-0385-..." therefore satisfies `ruling:RR-0385` today, in both modes.
- F3. At the plan, nothing forces a LOW to be folded. Every CONFIRMED or CONFLICT id needs one outcome line (:186, :199), and `pile` is accepted for LOW and NIT in plan mode (:148, :194). Folding a LOW is practice, not code.
- F4. No round cap exists. The close check counts rounds as `n = 1 + prior "Review round N:" lines` (:272) with no bound; a second output round is accepted and locked (check-lane-close.logic.test.ts:730-731). The plan gate reads every "Plan review round N:" line (:662-667) with no bound.
- F5. plan-prep allows one review round per run (rule-lists.mjs:640). post refuses a second round line (:737), so a plan round 2 line is entered by hand; task-375, task-418 and task-423 hold "Plan review round 2".
- F6. The lane brief tells lanes "a later (fix) round (r2, r3, ...)" (backlog-lane.mjs:185) and says nothing about severities by round. backlog-brief.mjs:174 already prints `max_fix_rounds: 2`.
- F7. No grounder brief lives in the repo: the orchestrator writes it. The lane's description of the grounder is backlog-lane.mjs:186.
- F8. Spec 08 states the outcome forms in the notes at :354-355. No Spec 08 note states round limits or cites RR-0369 or RR-0371.

#### WHAT
Today's code refuses none of the ruled behaviour:
- A round-2 MED can be recorded as `ruling:RR-0385` (F2).
- LOW and NIT can be piled (F3).
- Two rounds are already allowed (F4).

So check-lane-close.mjs and rule-lists.mjs (both protected paths) are NOT changed. "Build with existing components" (:1522); no new gate work (:1909).

Changes:
1. One dated note in Spec 08 after :355.
2. One brief edit at backlog-lane.mjs:185, plus one sentence of the rule.
3. Tests: one red test for the brief, and one lock test that proves the existing outcome behaviour in both directions.

#### EXACT TEXT: dated note (new line after :355, indented three spaces)
 Dated note 2026-11-22 (M-246, prior text kept; task-437 FINAL.2, McFix Final; RR-0385 items 3 and 4, decision-170; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1910 "2b is round one is Med. High and Critical amd Round 2 High and Critical 2c. Round one stil fixes Critical, Hihg and Medium." and :1912 "Validate the plan and the output as you mentioned as per your criteria."): at the plan and at the output, round 1 resolves the CONFIRMED CRITICAL, HIGH and MED findings (RR-0359) and round 2, the second review round (not the grounder's 5.3 round-2 pass), resolves CRITICAL and HIGH only; two rounds at most. Two is the most: when a second round is run stays as RR-0363 and RR-0369 left it. This supersedes the third output round of RR-0371 (its two-round plan cap stands) and keeps RR-0369. LOW and NIT are recorded (pile or wontfix with a reason), not required to be fixed or folded (RR-0364, whose medium part RR-0369 replaced). A MED confirmed in round 2 is recorded with the outcome line `<id> ruling:RR-0385`, a form the close check and the launch gate already accept; pile stays LOW and NIT only. The grounder's verdict line for that id gives the reason and names the round (the round line on the card cannot), and the orchestrator lists it in MEDIUM-LATER-ROUNDS.md (his order, :1792). After round 2 the separate grounder validates the fold (plan: FOLD-CHECK.md, which the launch gate requires; output: GROUNDER.md, which the close reads; neither is a review round) and the work moves on without the operator. It comes to the operator only when (i) a CRITICAL or HIGH is still open after round 2, (ii) a decision needs his word (a product choice no spec settles, or an earlier answer of his that rests on a wrong fact or reads two ways), or (iii) a push is due. Not enforced: the cap and the round-2 MED rule are process; `scripts/hooks/check-lane-close.mjs` counts "Review round N" lines without a bound and accepts a recorded ruling id (RR-0385 included) for a finding of any severity, on any task, in any round, so it cannot tell a round-1 MED from a round-2 MED; plan-prep supports one round, and a second plan round line is entered by hand.

#### CODE CHANGE (backlog-lane.mjs:185 only; not protected)
- Replace "a later (fix) round (r2, r3, ...) is filed beside them as" with "the second (fix) round (r2; two output rounds at most, RR-0385) is filed beside them as".
- Append to the `grounder` text (:186): " ROUNDS (RR-0385, Spec 08 dated note 2026-11-22): round 1 resolves CRITICAL, HIGH and MED findings; round 2 resolves CRITICAL and HIGH only, and a MED the grounder confirms in round 2 gets the outcome line `<id> ruling:RR-0385` in TRIAGE.md (the grounder decides it, the lane does not rule); LOW and NIT are recorded (pile or wontfix, 30+ character reason), not fixed or folded; there is no third round: a CRITICAL or HIGH still open after round 2 is reported with STATUS: blocked, for the operator."

#### TESTS (red first)
- T1, backlog-lane.logic.test.ts, dry run: TASK-JSON `extra` contains "two output rounds at most", "ruling:RR-0385" and "not fixed or folded", and does not contain "r3, ...". Red on today's text.
- T2, check-lane-close.logic.test.ts, in the pure outcomeErrors block (:758), as a lock:
- A CONFIRMED MED with `pile:"<30+ chars>"` is refused in close mode and in plan mode (:699 and :702-707 already cover the close-mode ruling and HIGH or LOW pile cases).
- `ruling:RR-0385` passes when decisionExists is true. This is the control.
- The same line is refused when decisionExists is false. This plants the second direction.
- A LOW with `pile:` passes in plan mode.
- A survive-the-fix (green-both) lock, stated as such per 08_agents.md:485: green on today's code by design; both directions are inside it. The same line also passes for a HIGH, pinning the note's "any severity" sentence.

#### ORDER
- After 436, since both edit backlog-lane.mjs in separate regions (436 at :174/:208/:223/:231, this task at :185-186).
- After 436 lands, the plan input for agents-s7-s11 is stale: the orchestrator re-makes it before launch, a second plan review round (task-423's round-2 note), so only CRITICAL and HIGH are folded.
- Before 438. This task leaves check-lane-close.mjs unchanged, so task-438's edits there do not meet this task's; its only shared file is the test file check-lane-close.logic.test.ts, and the new describe block is kept separate.

#### LANDING
- Code commit: the tests, backlog-lane.mjs, the Spec 08 note, and the task file with `Task: task-437`. No status move in it. The lane appends docs/reports/generated/rule-lists-by-kind.md to the first Files line of its own task file in this commit (check-task-files.mjs reads the index copy), and after the note is final and 436 has landed runs `node scripts/analysis/rule-lists.mjs page --write` and stages the page (pre-commit runs `page --check`). The page resolves one more list, policy-124-s2-s5, so the output review owes one more out- compliance output for it. The note names no src/ path in backticks, so the system map is unchanged.
- Then the closing commit with the records (two-commit close, :185).

#### ACCEPTANCE
- Spec 08 holds the note.
- Every brief states the two-round rule and the round-2 MED form.
- The lock test pins the forms.
- The suite is green.
- The rule applies from this landing (:1925 reading).

#### NOT IN SCOPE
- No change to check-lane-close.mjs or rule-lists.mjs.
- No cap refusal. A one-line `n > 2` refusal would also block a third round the operator himself rules under case (i), and there is no escape short of new gate work, which he withdrew (:1909).
- No refusal of fixed or folded for LOW: "never fixed by rule" (:1783) does not forbid fixing.
- The orchestrator's own grounder brief is outside the repo (F7); the Spec 08 note and the :186 text are its repo source.
- The output rN-versus-rerun wording conflict between 08_agents.md:355 (3) and backlog-lane.mjs:185 is left as it is.

#### QUESTION (ruled by the plan grounder)
Q1. Is a class ruling (`ruling:RR-0385`) an acceptable record for each round-2 MED?
- (A) Yes, as planned: zero code; the per-finding line "id MED ruling RR-0385" is still on the task page (:274).
- (B) Let `pile` count for MED in round 2 only: about 4 lines in a protected file, computing n before the outcome loop.
- RULED A (no operator word needed): RR-0385 item 5, :1921, "gates already built are kept; unbuilt gate cards are withdrawn", and :1909 "We want to reomve any of the gates work we added"; B changes a protected check.

#### UNVERIFIED
- The record names no file for "validates the fold"; it is read as FOLD-CHECK.md at the plan (the launch gate requires it, check-lane-close.mjs:679-698) and the separate grounder's GROUNDER.md at the output (:566-568).
- The card's DoD cites 08_agents.md:462 and :490. The texts are now at :485 and :513.

#### GUESS
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

## Implementation Notes
2026-11-22 taken on the board at lane launch (lane BL-ROUNDS437, worktree /Users/brettpreston_macmini/Buildo-wt-rounds437, branch wf1/inc1b-rounds437), RR-0240

## References
- docs/reports/reviews/task-437/GROUNDER-PLAN.md
- docs/reports/reviews/task-437/TRIAGE-PLAN.md
- docs/reports/reviews/task-437/seat-integration-1.md
- docs/reports/reviews/task-437/seat-reality-check-1.md
- docs/reports/reviews/task-437/seat-regression-1.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork — "There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1718)
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review — "1. yes 2. yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1723)
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only — "Let's make this easy the first round of MEdiums on the outputs are corrected with Highs and criticals and then the second round is just highs and criticals." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1781)
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output — "Let's start with 2 rounds on the plan then it comes to me and three rounds on the output." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1803)
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0359 Nothing is folded before the grounder has ruled (names RR-0359) — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork (names RR-0363) — "There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1718)
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review (names RR-0364) — "1. yes 2. yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1723)
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only (names RR-0369) — "Let's make this easy the first round of MEdiums on the outputs are corrected with Highs and criticals and then the second round is just highs and criticals." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1781)
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output (names RR-0371) — "Let's start with 2 rounds on the plan then it comes to me and three rounds on the output." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1803)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)

## Prior reviews and lane reports
### task-437 (this task)
- docs/reports/reviews/task-437/FINDINGS-PLAN.md
- docs/reports/reviews/task-437/FOLD-CHECK.md
- docs/reports/reviews/task-437/GROUNDER-PLAN.md
- docs/reports/reviews/task-437/QUESTIONS-RULED.md
- docs/reports/reviews/task-437/TRIAGE-PLAN.md
- docs/reports/reviews/task-437/seat-integration-1.md
- docs/reports/reviews/task-437/seat-reality-check-1.md
- docs/reports/reviews/task-437/seat-regression-1.md
- docs/reports/lanes/2026-11-22/BL-OPUS436/REPORT.md (lane report naming task-437)

## Dependencies
- (none)
