---
id: TASK-444
title: >-
  FINAL.1b The specs and docs that still state the old model rule are updated to
  the Opus and Sonnet split (dated notes, prior text kept)
status: BUILT
assignee:
  - '@lane-BL-DOCS444'
created_date: '2026-11-22T20:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix Final
  - dead
milestone: m-1
dependencies: []
references:
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
  - docs/reports/lanes/2026-11-22/BL-DOCS444/FINDINGS.md
  - docs/reports/lanes/2026-11-22/BL-DOCS444/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-DOCS444/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-DOCS444/TRIAGE.md
type: build
ordinal: 144012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0389 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1954), verbatim: "resolve this conflict by updating the key specs and docs". WHY: RR-0385 item 1 rules that the seat that writes a plan and the seat that builds run on Opus, seats and grounders on Sonnet, reviewers DeepSeek. Task-436 adds the Spec 08 note and names the sentence "Opus only for hard design adjudication" at .cursor/MCBYLAWS-QUEUE.md:247 as superseded without editing that file. THIS TASK: every spec and doc that still states the old rule gets its own dated note (M-246, prior text kept): .cursor/MCBYLAWS-QUEUE.md:247 first; the full list is found by a read of the repo at its plan (Spec 08, the queue documents, CLAUDE.md, .claude/workflows.md, the register copy 69a if a ruling row is the right home, review template packs). After task-436 lands. Scope and Files line at its plan review. Built on Opus through the six steps.

Files: .cursor/MCBYLAWS-QUEUE.md, .cursor/MCFRONTEND-QUEUE.md, src/tests/spec-notes-1b.logic.test.ts, docs/specs/01-pipeline/69a_mcbylaw_register.md
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
# PLAN-444-v1: FINAL.1b, the documents that still state the old model rule (task-444)

## BASIS
- RR-0385 item 1 (MORNING-DECISIONS.md:1917): "the seat that writes a plan and the seat that builds run on Opus; reality-check, integration, regression seats and grounders stay on Sonnet; reviewers DeepSeek". The operator's words: :1909 "Teh seat that writes the plan is opus and the seat that build is Opus"; :1912 "keep the current split with opus and sonnet". Recorded as decision-170.
- RR-0389, :1954 (operator's own words, per :1955): "resolve this conflict by updating the key specs and docs". Recorded as decision-174: the documents themselves get a dated note with the prior text kept.
- Form: M-246 dated note, prior text kept (137_mcqueue.md:125, rule 10). The wording follows the task-436 note (the task-436 card, EXACT TEXT).
- "Tehse should be small changes" (:1909). Gates already built stay; no new gate work (RR-0385 item 5).

## FACTS (board head 3c84de845; task-436 landed 836b5722b, its note is 08_agents.md:360)
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

## WHAT
1. Test first: add one describe block to src/tests/spec-notes-1b.logic.test.ts and run it red.
2. Add one dated note under C1 and one under C2, and one in the status cell of the 69a row M-506 (N3). Nothing is deleted.

## EXACT TEXT
Both notes use the same opening:
`- Dated note 2026-11-22 (M-246, prior text kept; task-444 FINAL.1b, McFix Final; RR-0385 item 1, decision-170; RR-0389, decision-174; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1909 "Teh seat that writes the plan is opus and the seat that build is Opus", :1910 "Change this to Opus - approved by operator.", :1912 "keep the current split with opus and sonnet", :1954 "resolve this conflict by updating the key specs and docs"): the seat that writes a task's plan and the lane that builds it run on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.`
- N1, new line 248 of MCBYLAWS-QUEUE.md, directly under :247. After the opening, add: ` This supersedes "Opus only for hard design adjudication" above for the plan seat and the building lane; "Seats run on Sonnet by default" stands. Spec 08 §7 rule 9 carries the same split (dated note, task-436).`
- N2, new line 19 of MCFRONTEND-QUEUE.md, after :18 (the last note on :13, which keeps the notes in date order). After the opening, add: ` This supersedes "Opus sparingly" in the paragraph above for the plan seat and the building lane; "Sonnet seats" stands. Spec 08 §7 rule 9 carries the same split (dated note, task-436).`
- N3, appended to the status cell of the M-506 row of 69a (:654) after "RULED 2026-11-06 (operator)": ` · *` + the same opening without its leading "- " + ` This supersedes "on Sonnet" in the Rule text above for the building lane only; Spec 08 §7 rule 9 carries the same split (dated note, task-436).` + `*`. No pipe, no word OWED, no line break.
- Neither queue insert moves :247 or :13, so task-436's citation of `.cursor/MCBYLAWS-QUEUE.md:247` stays correct. Each insert moves the later lines of its file by one (grep: 46 citations to MCBYLAWS-QUEUE.md past :247, 6 to MCFRONTEND-QUEUE.md past :13); card-cite-check.mjs reads a line as a hint within plus or minus 10 (:3, :19). The 69a note moves none.

## TESTS (red first; this extends the existing lock and adds no new gate)
One `describe` in spec-notes-1b.logic.test.ts. For each file:
- (a) the old sentence is still present (prior text kept);
- (b) the first line after it that starts with `- Dated note 2026-11-22 (M-246, prior text kept; task-444` comes before the next `#` heading;
- (c) that line contains "run on Opus", "every grounder run on Sonnet" and the :1954 words.
- The M-506 row of 69a gets the same three checks: its text still holds "on Sonnet", the note is in that row after it, and the note carries the same words.
The new block has not been run (this plan is read-only): it is written to fail on (b) before the notes and pass after, and the lane runs it red first and records the red output, so the lock is proven in both directions (08_agents.md:486).

## ORDER
Task-436 has landed (836b5722b); its note text is at 08_agents.md:360, and the opening of N1 to N3 equals its words after the colon. Then: test (red), notes (green), commit.

## LANDING
- One commit: the test, the two queue files, 69a and the task file, with the trailer `Task: task-444`, through the real hooks. The operator answers the push prompt (RR-0385 item 4 iii), never the lane. The queue edit rides this card: RR-0389 (decision-174) orders it and the orchestrator, who owns rulings (MCBYLAWS-QUEUE.md:125), opened the card; arm Q (queueCheck) is run before the edit and after it.
- The task file is always allowed (check-task-files.mjs:10). It is not put on the Files line because its name contains a comma.
- Plan seats on the plan: integration, reality-check, and regression (tracked paths) (08_agents.md:530).
- Close with the two-commit lane close.

## ACCEPTANCE
- All three notes are present (N1 and N2 each under the sentence it supersedes, N3 in the M-506 row), with the prior text unchanged.
- The test is red before the notes and green after; the suite is green.
- Arm Q passes at push.

## NOT IN SCOPE
- 08_agents.md (task-436).
- packs/spec08.md (FACTS: a verbatim copy, behind Spec 08).
- lane-guard.mjs (outside the repo).
- The AGREES and NOT A RULE lines.

## UNVERIFIED
- Hooks and tests were not run (read-only).
- That the handbook generator's own --check stays green with N3 (read from source and compared by rows in memory; not run).

## GUESS
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0389 · task-444 · Backlog; operator, verbatim: "resolve this conflict by updating the key specs and docs")

2026-11-22 taken on the board at lane launch (lane BL-DOCS444, worktree /Users/brettpreston_macmini/Buildo-wt-docs444, branch wf1/inc1b-docs444), RR-0240

2026-11-22 red step (lane BL-DOCS444): one describe block added to src/tests/spec-notes-1b.logic.test.ts (FINAL.1b); commit attempted with only the test and this task file staged, expected refused at (b) before the notes.

2026-11-22 build (lane BL-DOCS444): red recorded (3 of 17 failed at (b), spec-notes-1b.logic.test.ts:152 and :161, commit refused, exit 1). Notes added with the plan's EXACT TEXT: N1 .cursor/MCBYLAWS-QUEUE.md:248, N2 .cursor/MCFRONTEND-QUEUE.md:19, N3 in the status cell of M-506 at 69a:654 (no line inserted). Nothing deleted. Arm Q before the edit at 707ddef32: MB PASS, MF PASS.

2026-11-22 acceptance on real inputs (lane BL-DOCS444, work commit 1ff0eb575):
(1) All three notes present, prior text unchanged. Output of a node comparison against the plan EXACT TEXT: 'N1 line 248 exact: true | :247 unchanged start: true | :249 blank: true'; 'N2 line 19 exact: true | :13 still has old sentence: true | :20 blank: true'; 'N3 in-cell exact: true'; 'prose after colon equals task-436 note (08_agents.md:360): true'. git diff --stat: MCBYLAWS-QUEUE.md 1 +, MCFRONTEND-QUEUE.md 1 +, 69a 2 +- (one line changed in place, no line inserted).
(2) Red before the notes: 'Tests  3 failed | 14 passed (17)', each at (b), e.g. 'AssertionError: .cursor/MCBYLAWS-QUEUE.md: no task-444 note after the old sentence: expected -1 to be greater than 246'; commit refused, exit 1. Green after: 'src/tests/spec-notes-1b.logic.test.ts (17 tests)', 'Tests  17 passed (17)', 'GATE OK', 'POLICY CHECKS OK (commit-msg)', '[wf1/inc1b-docs444 1ff0eb575]'. The full suite was not run (station only): UNVERIFIED until the push station.
(3) Arm Q (queueCheck) before at 707ddef32: 'arm Q MB .cursor/MCBYLAWS-QUEUE.md @ HEAD: PASS (no refusal)', 'arm Q MF .cursor/MCFRONTEND-QUEUE.md @ HEAD: PASS (no refusal)'; after at 1ff0eb575: the same two PASS lines. Arm Q at push itself is the operator's push: UNVERIFIED.
Plan UNVERIFIED item, now run: 'node scripts/generate-bylaw-handbook.mjs --check' printed '[bylaw-handbook] docs/specs/01-pipeline/133_bylaw_handbook.md is up to date (546 rules)', exit 0. No hook asked for a generated file.

2026-11-22 output review round 1 (lane BL-DOCS444): fresh context docs/reports/reviews/task-444/context-r3.md; lens set on DeepSeek: compliance per list (7 outputs), code-review, error-paths; 36 finding lines (HIGH 8, MED 12, LOW 15, NIT 1), listed untriaged in docs/reports/lanes/2026-11-22/BL-DOCS444/FINDINGS.md. Grounder owed (RR-0359); the task stays RUNNING.

2026-11-22 lane report committed (docs/reports/lanes/2026-11-22/BL-DOCS444/REPORT.md); close check on a throwaway clone with the task staged BUILT refuses only on GROUNDER.md (missing, owed) and its reference. Task stays RUNNING: grounder owed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three dated notes (M-246, prior text kept) for the Opus and Sonnet split: N1 .cursor/MCBYLAWS-QUEUE.md:248, N2 .cursor/MCFRONTEND-QUEUE.md:19, N3 in the status cell of 69a M-506; lock in src/tests/spec-notes-1b.logic.test.ts, red then green (work commit 1ff0eb575). Output review round 1 grounded by Cairn-Ground-O444: 5 CONFIRMED LOW/NIT piled, 31 REJECTED, no fix owed.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 5 pile; grounder docs/reports/lanes/2026-11-22/BL-DOCS444/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-DOCS444/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
