# Review context for task-444 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 3)

## Task
task-444 FINAL.1b The specs and docs that still state the old model rule are updated to the Opus and Sonnet split (dated notes, prior text kept)
status: RUNNING · milestone: m-1 · assignee: @lane-BL-DOCS444 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0389 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1954), verbatim: "resolve this conflict by updating the key specs and docs". WHY: RR-0385 item 1 rules that the seat that writes a plan and the seat that builds run on Opus, seats and grounders on Sonnet, reviewers DeepSeek. Task-436 adds the Spec 08 note and names the sentence "Opus only for hard design adjudication" at .cursor/MCBYLAWS-QUEUE.md:247 as superseded without editing that file. THIS TASK: every spec and doc that still states the old rule gets its own dated note (M-246, prior text kept): .cursor/MCBYLAWS-QUEUE.md:247 first; the full list is found by a read of the repo at its plan (Spec 08, the queue documents, CLAUDE.md, .claude/workflows.md, the register copy 69a if a ruling row is the right home, review template packs). After task-436 lands. Scope and Files line at its plan review. Built on Opus through the six steps.

Files: .cursor/MCBYLAWS-QUEUE.md, .cursor/MCFRONTEND-QUEUE.md, src/tests/spec-notes-1b.logic.test.ts, docs/specs/01-pipeline/69a_mcbylaw_register.md

## Acceptance criteria

## Implementation Plan
#### PLAN-444-v1: FINAL.1b, the documents that still state the old model rule (task-444)

#### BASIS
- RR-0385 item 1 (MORNING-DECISIONS.md:1917): "the seat that writes a plan and the seat that builds run on Opus; reality-check, integration, regression seats and grounders stay on Sonnet; reviewers DeepSeek". The operator's words: :1909 "Teh seat that writes the plan is opus and the seat that build is Opus"; :1912 "keep the current split with opus and sonnet". Recorded as decision-170.
- RR-0389, :1954 (operator's own words, per :1955): "resolve this conflict by updating the key specs and docs". Recorded as decision-174: the documents themselves get a dated note with the prior text kept.
- Form: M-246 dated note, prior text kept (137_mcqueue.md:125, rule 10). The wording follows the task-436 note (the task-436 card, EXACT TEXT).
- "Tehse should be small changes" (:1909). Gates already built stay; no new gate work (RR-0385 item 5).

#### FACTS (board head 3c84de845; task-436 landed 836b5722b, its note is 08_agents.md:360)
I ran `grep -rniE "sonnet|opus"` over docs/specs, .cursor, .claude, CLAUDE.md, scripts, mcbylaws/, tasks/ and docs/ (excluding reports). Each hit is sorted below.
CONFLICTS (each needs a note):
- C1 .cursor/MCBYLAWS-QUEUE.md:247: "Opus only for hard design adjudication, with the reason logged." The next line, :248, is blank.
- C2 .cursor/MCFRONTEND-QUEUE.md:13 ends: "Seats per Spec 08 and the token-economy rule (DeepSeek exec and lenses, Sonnet seats, Opus sparingly)." Three dated notes already follow this paragraph, at :15, :17 and :18.
- 08_agents.md:359 "on Sonnet": task-436 handles it, so this task does not touch it.
AGREES (seats on Sonnet; leave as is):
- MCBYLAWS-QUEUE.md:247, first sentence: "Seats run on Sonnet by default".
- 137_mcqueue.md:152, and its copy in packs/queue.md:110 (a Sonnet check lane).
- 08_agents.md:530 (the tool seats are Claude Sonnet).
- .claude/agents/*.md:9-10 (`model: sonnet`).
- check-lane-close.mjs:583 (a comment about seats).
NOT A RULE (leave):
- 08_agents.md:35 is the harness's closed model enum.
- 08_agents.md:527 "(Sonnet seats, lane agents, ...)" names a scope and sets no model.
- 69a:653-656 contain the word "opus" only inside quoted chat text.
- .cursor/active_task.md:43 is a quote ("make sure opus actually uses the system").
- .cursor/wf1_spec08_deepseek_execution_active_task.md:23-24, :50 and :104 are an old plan's evidence tables.
- Hits in 101_notification_dispatch, 116, 93, supabase_migration_program_plan, the push scripts and loop-gate-context.mjs:239 are substring matches ("ExpoPush", "octopus", "corpus"), not model names.
- CLAUDE.md, .claude/workflows.md, the skills and the README files: no hits.
- 69a M-506 (:654) states "a multi-step build goes to the owning lane, on Sonnet" as live Rule text, so it is a document that still states the old rule (RR-0389, decision-174): it gets one dated note, in its own status cell, which inserts no line (69a:141). 69a still takes dated notes (:696-699, 2026-11-20). With the note after the status text the handbook line for M-506 is unchanged (bylaw-register.mjs rows compared in memory before and after: equal); 69a has no byte budget (122_split_manifest.json names 69, not 69a); the pin chat-rulings-register.logic.test.ts:1733 uses toContain on the Rule text, which stays.
- .claude/review-templates/packs/spec08.md is a hand-kept verbatim copy of Spec 08 ("Generator: hand-written, not generated", :3; its range :330-346 is out of date). Its :19 holds the 2026-11-06 E2 note ("on Sonnet") as prior text and it lacks the task-436 note; it has no "hard design adjudication" sentence. Only a manual command (.claude/review-templates/README.md:136-146) reads it; no test, hook or lane tool does. A note would make it no longer verbatim; the remedy is a fresh copy, which no ruling named. It is left, recorded as behind.
Hooks and generated files:
- The two queue files and 69a are on the McBylaws `protected` list (mcbylaws/protected-paths.json:57, :59 and :70). None is on the `layer23` or `frontend` lists, so the commit needs no trailer, no prereg file and no panel record. At push, the gate asks for a tty "y" (gate.mjs:568-583).
- Arm Q reads only `**MB-nn`/`**MF-nn` headings (mcbylaws-queue-check.mjs:4). The notes must therefore contain no MB-nn or MF-nn id.
- The tests that read these files pin only the MF header text (mcfrontend-status.infra.test.ts:59-60) and the increments table (web-landing.logic.test.ts:156). An added line breaks neither.
- The system map generator reads docs/specs and docs/reference (generate-system-map.mjs:18-30) and takes only each spec's title, status and src/ or scripts/ references; the 69a note adds none. The rule-lists page sizes only the list documents (none is edited). Arm K (decision-log.mjs:73-76) judges rows ADDED in a staged 69a diff, not an edit to an older row. So no generated file is regenerated.
- An earlier lock for dated notes already exists: src/tests/spec-notes-1b.logic.test.ts (task-376, "pins one confirmed stale line to the dated note", :7).
- Rule lists the Files line resolves (rule-lists.mjs resolve, letter S): queue-137, agents-s7-s11, eng-all, five-words, plan-protocol, inc-S, ms-S. eng-all is added only by the test file; 69a adds no list (run in memory with it on the Files line: the same seven, none unmatched).

#### WHAT
1. Test first: add one describe block to src/tests/spec-notes-1b.logic.test.ts and run it red.
2. Add one dated note under C1 and one under C2, and one in the status cell of the 69a row M-506 (N3). Nothing is deleted.

#### EXACT TEXT
Both notes use the same opening:
`- Dated note 2026-11-22 (M-246, prior text kept; task-444 FINAL.1b, McFix Final; RR-0385 item 1, decision-170; RR-0389, decision-174; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1909 "Teh seat that writes the plan is opus and the seat that build is Opus", :1910 "Change this to Opus - approved by operator.", :1912 "keep the current split with opus and sonnet", :1954 "resolve this conflict by updating the key specs and docs"): the seat that writes a task's plan and the lane that builds it run on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.`
- N1, new line 248 of MCBYLAWS-QUEUE.md, directly under :247. After the opening, add: ` This supersedes "Opus only for hard design adjudication" above for the plan seat and the building lane; "Seats run on Sonnet by default" stands. Spec 08 §7 rule 9 carries the same split (dated note, task-436).`
- N2, new line 19 of MCFRONTEND-QUEUE.md, after :18 (the last note on :13, which keeps the notes in date order). After the opening, add: ` This supersedes "Opus sparingly" in the paragraph above for the plan seat and the building lane; "Sonnet seats" stands. Spec 08 §7 rule 9 carries the same split (dated note, task-436).`
- N3, appended to the status cell of the M-506 row of 69a (:654) after "RULED 2026-11-06 (operator)": ` · *` + the same opening without its leading "- " + ` This supersedes "on Sonnet" in the Rule text above for the building lane only; Spec 08 §7 rule 9 carries the same split (dated note, task-436).` + `*`. No pipe, no word OWED, no line break.
- Neither queue insert moves :247 or :13, so task-436's citation of `.cursor/MCBYLAWS-QUEUE.md:247` stays correct. Each insert moves the later lines of its file by one (grep: 46 citations to MCBYLAWS-QUEUE.md past :247, 6 to MCFRONTEND-QUEUE.md past :13); card-cite-check.mjs reads a line as a hint within plus or minus 10 (:3, :19). The 69a note moves none.

#### TESTS (red first; this extends the existing lock and adds no new gate)
One `describe` in spec-notes-1b.logic.test.ts. For each file:
- (a) the old sentence is still present (prior text kept);
- (b) the first line after it that starts with `- Dated note 2026-11-22 (M-246, prior text kept; task-444` comes before the next `#` heading;
- (c) that line contains "run on Opus", "every grounder run on Sonnet" and the :1954 words.
- The M-506 row of 69a gets the same three checks: its text still holds "on Sonnet", the note is in that row after it, and the note carries the same words.
The new block has not been run (this plan is read-only): it is written to fail on (b) before the notes and pass after, and the lane runs it red first and records the red output, so the lock is proven in both directions (08_agents.md:486).

#### ORDER
Task-436 has landed (836b5722b); its note text is at 08_agents.md:360, and the opening of N1 to N3 equals its words after the colon. Then: test (red), notes (green), commit.

#### LANDING
- One commit: the test, the two queue files, 69a and the task file, with the trailer `Task: task-444`, through the real hooks. The operator answers the push prompt (RR-0385 item 4 iii), never the lane. The queue edit rides this card: RR-0389 (decision-174) orders it and the orchestrator, who owns rulings (MCBYLAWS-QUEUE.md:125), opened the card; arm Q (queueCheck) is run before the edit and after it.
- The task file is always allowed (check-task-files.mjs:10). It is not put on the Files line because its name contains a comma.
- Plan seats on the plan: integration, reality-check, and regression (tracked paths) (08_agents.md:530).
- Close with the two-commit lane close.

#### ACCEPTANCE
- All three notes are present (N1 and N2 each under the sentence it supersedes, N3 in the M-506 row), with the prior text unchanged.
- The test is red before the notes and green after; the suite is green.
- Arm Q passes at push.

#### NOT IN SCOPE
- 08_agents.md (task-436).
- packs/spec08.md (FACTS: a verbatim copy, behind Spec 08).
- lane-guard.mjs (outside the repo).
- The AGREES and NOT A RULE lines.

#### UNVERIFIED
- Hooks and tests were not run (read-only).
- That the handbook generator's own --check stays green with N3 (read from source and compared by rows in memory; not run).

#### GUESS
About 1 hour of lane time: 3 doc lines and about 30 test lines.

Files: .cursor/MCBYLAWS-QUEUE.md, .cursor/MCFRONTEND-QUEUE.md, docs/specs/01-pipeline/69a_mcbylaw_register.md, src/tests/spec-notes-1b.logic.test.ts

Plan review round 1: 26 folded, 0 task, 0 ruling, 0 wontfix, 18 pile; grounder docs/reports/reviews/task-444/GROUNDER-PLAN.md; triage docs/reports/reviews/task-444/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#5 MED folded it is written to fai
plan-compliance-eng-all#1 MED folded A note would make it
plan-compliance-eng-all#2 HIGH folded it gets one dated no
plan-compliance-eng-all#4 MED folded and the opening of N
plan-compliance-five-words#1 MED folded A note would make it
plan-compliance-five-words#5 MED folded and the opening of N
plan-compliance-inc-S#1 MED folded A note would make it
plan-compliance-inc-S#2 HIGH folded it gets one dated no
plan-compliance-inc-S#3 MED folded and the opening of N
plan-compliance-ms-S#1 HIGH folded it gets one dated no
plan-compliance-ms-S#3 MED folded A note would make it
plan-compliance-ms-S#4 MED folded and the opening of N
plan-compliance-plan-protocol#1 MED folded A note would make it
plan-compliance-plan-protocol#4 HIGH folded it gets one dated no
plan-compliance-queue-137#1 MED folded A note would make it
plan-compliance-queue-137#2 HIGH folded it gets one dated no
plan-error-paths#2 MED folded and the opening of N
plan-error-paths#3 MED folded Each insert moves th
plan-plan-review-deepseek#5 MED folded it is written to fai
ig#1 MED folded The operator answers
ig#7 MED folded Each insert moves th
rc#1 HIGH folded task-436 landed 836b
rc#2 HIGH folded it gets one dated no
rc#3 HIGH folded it gets one dated no
rg#3 MED folded arm Q (queueCheck) i

## Implementation Notes
Dated note 2026-11-22 (M-246, prior text kept; RR-0389 · task-444 · Backlog; operator, verbatim: "resolve this conflict by updating the key specs and docs")

2026-11-22 taken on the board at lane launch (lane BL-DOCS444, worktree /Users/brettpreston_macmini/Buildo-wt-docs444, branch wf1/inc1b-docs444), RR-0240

2026-11-22 red step (lane BL-DOCS444): one describe block added to src/tests/spec-notes-1b.logic.test.ts (FINAL.1b); commit attempted with only the test and this task file staged, expected refused at (b) before the notes.

2026-11-22 build (lane BL-DOCS444): red recorded (3 of 17 failed at (b), spec-notes-1b.logic.test.ts:152 and :161, commit refused, exit 1). Notes added with the plan's EXACT TEXT: N1 .cursor/MCBYLAWS-QUEUE.md:248, N2 .cursor/MCFRONTEND-QUEUE.md:19, N3 in the status cell of M-506 at 69a:654 (no line inserted). Nothing deleted. Arm Q before the edit at 707ddef32: MB PASS, MF PASS.

2026-11-22 acceptance on real inputs (lane BL-DOCS444, work commit 1ff0eb575):
(1) All three notes present, prior text unchanged. Output of a node comparison against the plan EXACT TEXT: 'N1 line 248 exact: true | :247 unchanged start: true | :249 blank: true'; 'N2 line 19 exact: true | :13 still has old sentence: true | :20 blank: true'; 'N3 in-cell exact: true'; 'prose after colon equals task-436 note (08_agents.md:360): true'. git diff --stat: MCBYLAWS-QUEUE.md 1 +, MCFRONTEND-QUEUE.md 1 +, 69a 2 +- (one line changed in place, no line inserted).
(2) Red before the notes: 'Tests  3 failed | 14 passed (17)', each at (b), e.g. 'AssertionError: .cursor/MCBYLAWS-QUEUE.md: no task-444 note after the old sentence: expected -1 to be greater than 246'; commit refused, exit 1. Green after: 'src/tests/spec-notes-1b.logic.test.ts (17 tests)', 'Tests  17 passed (17)', 'GATE OK', 'POLICY CHECKS OK (commit-msg)', '[wf1/inc1b-docs444 1ff0eb575]'. The full suite was not run (station only): UNVERIFIED until the push station.
(3) Arm Q (queueCheck) before at 707ddef32: 'arm Q MB .cursor/MCBYLAWS-QUEUE.md @ HEAD: PASS (no refusal)', 'arm Q MF .cursor/MCFRONTEND-QUEUE.md @ HEAD: PASS (no refusal)'; after at 1ff0eb575: the same two PASS lines. Arm Q at push itself is the operator's push: UNVERIFIED.
Plan UNVERIFIED item, now run: 'node scripts/generate-bylaw-handbook.mjs --check' printed '[bylaw-handbook] docs/specs/01-pipeline/133_bylaw_handbook.md is up to date (546 rules)', exit 0. No hook asked for a generated file.

## References
- docs/reports/reviews/task-444/GROUNDER-PLAN.md
- docs/reports/reviews/task-444/TRIAGE-PLAN.md
- docs/reports/reviews/task-444/seat-integration-1.md
- docs/reports/reviews/task-444/seat-reality-check-1.md
- docs/reports/reviews/task-444/seat-regression-1.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:eng-all docs/specs/00_engineering_standards.md
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
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
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
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves — "resolve this conflict by updating the key specs and docs" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1954)
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves (names task-444, RR-0389) — "resolve this conflict by updating the key specs and docs" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1954)

## Prior reviews and lane reports
### task-444 (this task)
- docs/reports/reviews/task-444/FINDINGS-PLAN.md
- docs/reports/reviews/task-444/FOLD-CHECK.md
- docs/reports/reviews/task-444/GROUNDER-PLAN.md
- docs/reports/reviews/task-444/QUESTIONS-RULED.md
- docs/reports/reviews/task-444/TRIAGE-PLAN.md
- docs/reports/reviews/task-444/seat-integration-1.md
- docs/reports/reviews/task-444/seat-reality-check-1.md
- docs/reports/reviews/task-444/seat-regression-1.md

## Dependencies
- (none)
