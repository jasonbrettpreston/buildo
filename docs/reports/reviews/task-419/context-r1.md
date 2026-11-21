# Review context for task-419 (no plan id) written 2026-11-21 by backlog-brief.mjs (round 1)

## Task
task-419 LAUNCH.GAPS The fold check leaves a record and a one-file review keeps one name
status: LATER · milestone: m-1 · assignee: none · labels: McFix, McFix V2

## Description
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (MORNING-DECISIONS.md:1651, verbatim: "Let's resolve 1 and 2 now."; :1653, verbatim: "ensure the plan is reviewed for the cards before moving forward"). Two gaps found on 2026-11-21 while task-418 and task-412 went through the pre-launch steps. GAP 1, the fold check leaves no record: after the confirmed plan findings are folded into the plan, a separate grounder checks the folded plan and adds the last line "Plan: <id> sha256:<12>" to GROUNDER-PLAN.md; the launch check proves only that line against the plan; the grounder's report of the check is written nowhere by rule, plan-prep neither asks for it nor stores it (on task-412 it was written after the fact, docs/reports/reviews/task-412/FOLD-CHECK.md, and the output review ruled the missing record a CONFIRMED HIGH; on task-418 it is only in a scratch log). GAP 2, the one-file name trap: when a diff fits one review input, lens-input writes it without a part suffix (scripts/analysis/rule-lists.mjs:425), while the close check reads an unsuffixed output as a review of the raw diff and only -pN outputs as tool-made inputs (scripts/hooks/check-lane-close.mjs:487, :509-513), so the tool's own output for a small diff is refused at close until the lane renames it -p1 (met by the task-418 lane). Wanted: the smallest change that (1) makes the fold check a committed record that the pre-launch steps carry and the launch check can see, written by the grounder and never by the script; (2) makes the tool and the close check agree on the name of a one-file review, without breaking outputs already committed. Reuse what exists; no new tool. NOT in scope: the cross-read adversary pass (operator, MORNING-DECISIONS.md:1647: not needed). The plan (to be written read-only and reviewed before any build) names the design and the final Files line. Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs

## Acceptance criteria
- #1 (a) Plan-prep fixture: a board whose folder lacks FOLD-CHECK.md: `backlog-lane.mjs --dry-run` exits 3, stderr "FOLD-CHECK.md". With the file (Checked by: Fold-G1, Verdict: PASS, correct Plan line) it prints "plan gate ok".
- #2 (b) Same board, the task body edited by one word: exit 3, FOLD-CHECK.md Plan line stale, expected line printed.
- #3 (c) `node scripts/analysis/rule-lists.mjs lens-input --template .claude/review-templates/lens-code-review.md --context <ctx> --material <one-file diff> --out <dir>/in-out-code-review` prints `<dir>/in-out-code-review-p1.txt` and writes only that.
- #4 (d) The close check on a lane with out-code-review-p1.txt made from (c): exit 0 (named test green).
- #5 (e) Existing close tests (a -p1 pair, the unsuffixed compliance control) still pass.
- #6 (f) The three test files green; git diff --stat shows only the Files line.

## Implementation Plan
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

## Implementation Notes
Dated note 2026-11-21 (M-246, prior text kept; RR-0351 · task-419 · Backlog; operator, verbatim: "Gap 3 we dont need the cross check.")

Dated note 2026-11-21 (M-246, prior text kept; RR-0352 · task-419 · Backlog; operator, verbatim: "Let's resolve 1 and 2 now.")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-419-v1, written read-only by a separate planner against the code at 7db3a81cc. The Files line is replaced by the plan's six paths (adds src/tests/backlog/backlog-lane.logic.test.ts and docs/reports/reviews/task-375/plant-evidence.mjs; open question 1 for the plan grounder). The planner found the card's gap 2 narrower than written: the name trap holds only for lenses with no rule list (check-lane-close.mjs:508-513); compliance outputs are accepted unsuffixed (check-lane-close.mjs:373-409). The plan is reviewed, ruled, folded and fold-checked before any launch (RR-0352).

## References
- (none)

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
- RR-0351 The cross-read adversary pass is not needed — "Gap 3 we dont need the cross check." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1647)
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first — "Let's resolve 1 and 2 now." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1651)
- RR-0353 The 29 scorecards are resolved the right way
- RR-0136 Operator: start Increment 1·A
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0140 Operator: faster pushes and GOs asked
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
- RR-0351 The cross-read adversary pass is not needed (names task-419, RR-0351) — "Gap 3 we dont need the cross check." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1647)
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first (names task-419, RR-0352) — "Let's resolve 1 and 2 now." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1651)

## Prior reviews and lane reports
### task-419 (this task)
- (none)
### task-418 (dependency)
- docs/reports/reviews/task-418/FINDINGS-PLAN.md
- docs/reports/reviews/task-418/GROUNDER-PLAN.md
- docs/reports/reviews/task-418/QUESTIONS-RULED.md
- docs/reports/reviews/task-418/TRIAGE-PLAN.md
- docs/reports/reviews/task-418/seat-integration-1.md
- docs/reports/reviews/task-418/seat-reality-check-1.md
- docs/reports/reviews/task-418/seat-regression-1.md
- docs/reports/lanes/2026-11-21/BL-PREP418/REPORT.md (lane report naming task-418)

## Dependencies
- task-418 LAUNCH.PREP The steps before a build launch run from one command · status: BUILT
  final summary: plan-prep (review, post, commit) is built in scripts/analysis/rule-lists.mjs with its tests and the launch dry run it runs cannot be overridden; all six acceptance items are met, the task-412 proof (acceptance c, e, f) is pasted in the task notes, so the task is BUILT.

Review round 1: 34 fixed, 0 task, 0 ruling, 0 wontfix, 14 pile; grounder docs/reports/lanes/2026-11-21/BL-PREP418/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-PREP418/TRIAGE.md
plan-compliance-agents-s5-1to3#4 MED fixed 2133425
plan-compliance-agents-s7-s11#1 MED fixed 2133425
plan-compliance-agents-s7-s11#3 MED fixed 2133425
plan-compliance-agents-s7-s11#5 MED fixed 2133425
plan-compliance-eng-all#1 MED fixed 2133425
plan-compliance-five-words#2 MED fixed 2133425
plan-compliance-five-words#3 MED fixed 2133425
plan-compliance-inc-S#1 MED fixed 2133425
plan-compliance-inc-S#2 MED fixed 2133425
plan-compliance-ms-S#1 MED fixed 2133425
plan-compliance-ms-S#3 MED fixed 2133425
plan-compliance-ms-S#4 MED fixed 2133425
plan-compliance-orchestrator-doc17#2 MED fixed 2133425
plan-compliance-orchestrator-doc17#3 MED fixed 2133425
plan-compliance-plan-protocol#2 MED fixed 2133425
plan-compliance-queue-137#2 MED fixed 2133425
plan-compliance-queue-137#3 MED fixed 2133425
plan-error-paths#1 MED fixed 2133425
plan-error-paths#4 MED fixed 2133425
plan-error-paths#6 MED fixed 2133425
plan-plan-review-deepseek#1 MED fixed 2133425
plan-plan-review-deepseek#2 MED fixed 2133425
out-compliance-eng-all#3 MED fixed 6b0693a

Review round 2: 33 fixed, 0 task, 0 ruling, 0 wontfix, 12 pile; grounder docs/reports/lanes/2026-11-21/BL-PREP418/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-PREP418/TRIAGE.md
plan-compliance-agents-s5-1to3#4 MED fixed 2133425
plan-compliance-agents-s7-s11#1 MED fixed 2133425
plan-compliance-agents-s7-s11#3 MED fixed 2133425
plan-compliance-agents-s7-s11#5 MED fixed 2133425
plan-compliance-eng-all#1 MED fixed 2133425
plan-compliance-five-words#2 MED fixed 2133425
plan-compliance-five-words#3 MED fixed 2133425
plan-compliance-inc-S#1 MED fixed 2133425
plan-compliance-inc-S#2 MED fixed 2133425
plan-compliance-ms-S#1 MED fixed 2133425
plan-compliance-ms-S#3 MED fixed 2133425
plan-compliance-ms-S#4 MED fixed 2133425
plan-compliance-orchestrator-doc17#2 MED fixed 2133425
plan-compliance-orchestrator-doc17#3 MED fixed 2133425
plan-compliance-plan-protocol#2 MED fixed 2133425
plan-compliance-queue-137#2 MED fixed 2133425
plan-compliance-queue-137#3 MED fixed 2133425
plan-error-paths#1 MED fixed 2133425
plan-error-paths#4 MED fixed 2133425
plan-error-paths#6 MED fixed 2133425
plan-plan-review-deepseek#1 MED fixed 2133425
plan-plan-review-deepseek#2 MED fixed 2133425

Review round 3: 33 fixed, 0 task, 0 ruling, 0 wontfix, 12 pile; grounder docs/reports/lanes/2026-11-21/BL-PREP418/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-PREP418/TRIAGE.md
plan-compliance-agents-s5-1to3#4 MED fixed 2133425
plan-compliance-agents-s7-s11#1 MED fixed 2133425
plan-compliance-agents-s7-s11#3 MED fixed 2133425
plan-compliance-agents-s7-s11#5 MED fixed 2133425
plan-compliance-eng-all#1 MED fixed 2133425
plan-compliance-five-words#2 MED fixed 2133425
plan-compliance-five-words#3 MED fixed 2133425
plan-compliance-inc-S#1 MED fixed 2133425
plan-compliance-inc-S#2 MED fixed 2133425
plan-compliance-ms-S#1 MED fixed 2133425
plan-compliance-ms-S#3 MED fixed 2133425
plan-compliance-ms-S#4 MED fixed 2133425
plan-compliance-orchestrator-doc17#2 MED fixed 2133425
plan-compliance-orchestrator-doc17#3 MED fixed 2133425
plan-compliance-plan-protocol#2 MED fixed 2133425
plan-compliance-queue-137#2 MED fixed 2133425
plan-compliance-queue-137#3 MED fixed 2133425
plan-error-paths#1 MED fixed 2133425
plan-error-paths#4 MED fixed 2133425
plan-error-paths#6 MED fixed 2133425
plan-plan-review-deepseek#1 MED fixed 2133425
plan-plan-review-deepseek#2 MED fixed 2133425
