---
id: TASK-436
title: >-
  FINAL.1 Opus seats: the launch script names the builder's model and Spec 08
  records the split (Opus plans and builds, Sonnet seats and grounders)
status: BUILT
assignee:
  - '@lane-BL-OPUS436'
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-436/GROUNDER-PLAN.md
  - docs/reports/reviews/task-436/TRIAGE-PLAN.md
  - docs/reports/reviews/task-436/seat-integration-1.md
  - docs/reports/reviews/task-436/seat-reality-check-1.md
  - docs/reports/reviews/task-436/seat-regression-1.md
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
  - docs/reports/lanes/2026-11-22/BL-OPUS436/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-OPUS436/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-OPUS436/TRIAGE.md
type: build
ordinal: 136012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "Teh seat that writes the plan is opus and the seat that build is Opus"; "keep the current split with opus and sonnet"; "Change this to Opus - approved by operator." The lane guard (the operator's hook, outside the repo) already allows opus since 2026-11-22. THIS TASK: the launch script's agent line and brief say the builder's model; a dated note in Spec 08 records the split and supersedes the Sonnet-only lines. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md
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
# PLAN-436-v1: FINAL.1 Opus seats (task-436)

## BASIS
- RR-0385 item 1, MORNING-DECISIONS.md:1917: "the seat that writes a plan and the seat that builds run on Opus; reality-check, integration, regression seats and grounders stay on Sonnet; reviewers DeepSeek". The operator's words, verbatim: (a) :1909 "Teh seat that writes the plan is opus and the seat that build is Opus"; (b) :1910 "Change this to Opus - approved by operator."; (d) :1912 "keep the current split with opus and sonnet". Decision record: backlog/decisions/decision-170.
- The orchestrator's reading, :1925: "the guard cannot tell a planner from a seat, so it allows "sonnet" or "opus" and the split is kept by the brief and this entry".
- How a spec is changed: a dated note is added and the prior text is kept (M-246). Model notes: docs/specs/00_engineering_standards.md:308 and 08_agents.md:150.
- Operator: "Tehse should be small changes" (:1909); "you are probaley rebuilding stuff that already exists" (:1522).

## FACTS
- F1. Spec 08 says lanes run on Sonnet in one place, 08_agents.md:359: "a multi-step build goes to the owning lane, on Sonnet". 08_agents.md:526 lists "(Sonnet seats, lane agents, ...)" as a scope phrase. It sets no model. 08_agents.md:35 lists the closed model set `sonnet | opus | haiku | fable`. There is no separate token-economy section: rule 9, :358-359, is the one.
- F2. No test reads 08_agents.md:359. src/tests/chat-rulings-register.logic.test.ts:1733 pins the same sentence in the register 69a (line 15 of that test reads docs/specs/01-pipeline/69a_mcbylaw_register.md), so a note in Spec 08 cannot affect it. The note adds one line and keeps the prior text; keeping it is a review check, not a test.
- F3. backlog-lane.mjs names no model anywhere (grep "sonnet|opus" finds nothing). Its last output line is `BRIEF-FILE: <path> sha256=<hex>` (:231 dry run, :232 real run). The header says the Agent call stays the orchestrator's (:11).
- F4. The tests pin the BRIEF-FILE line exactly. backlog-lane.logic.test.ts:117 anchors it with `$`, and :176 requires it to be the LAST line (`toBe`). The lane guard reads it with the regex `/BRIEF-FILE:\s*(\S+)\s+sha256=([0-9a-f]{64})/` (~/.claude/hooks/lane-guard.mjs:56). So the model goes on a new line printed BEFORE it, and the BRIEF-FILE line itself does not change.
- F5. ~/Buildo-scratch/panel-tools/brief.mjs prints every `spec.extra` entry under "## Task-specific rules" (its `body` array). backlog-lane fills `extra` (:208). One more extra entry therefore reaches the brief with brief.mjs unchanged. When `--spec` is given, the merge at :220-224 adds only the rule block and the lens line.
- F6. The lane guard rule A1 already allows "sonnet" or "opus" (lane-guard.mjs:11, :50-51). It is outside the repo and not part of this task.
- F7. The four seat files set `model: sonnet` (.claude/agents/*.md:9-10). That matches the ruling. .cursor/MCBYLAWS-QUEUE.md:247 ("Seats run on Sonnet by default") and 137_mcqueue.md:152 ("A Sonnet lane is named for the check") are about seats and read-only check lanes, so they do not conflict. The next sentence of MCBYLAWS-QUEUE.md:247, "Opus only for hard design adjudication", does conflict with RR-0385; the Spec 08 note supersedes it. CLAUDE.md and the README files do not mention Sonnet.

## WHAT
1. Add one dated note to Spec 08 after :359.
2. In backlog-lane.mjs, add one constant `MODEL_LINE`. Print `AGENT-MODEL: opus ...` just before BRIEF-FILE, on both the dry-run path and the real path. Add `MODEL_LINE` to `spec.extra`, and to the merged extra when the `--spec` merge does not already hold it.
3. Write the tests first and see them fail.

## EXACT TEXT: dated note (new line 360, indented three spaces like :359)
 Dated note 2026-11-22 (M-246, prior text kept; task-436 FINAL.1, McFix Final; RR-0385 item 1, decision-170; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1909 "Teh seat that writes the plan is opus and the seat that build is Opus", :1910 "Change this to Opus - approved by operator.", :1912 "keep the current split with opus and sonnet"): the seat that writes a task's plan and the lane that builds it run on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek. This supersedes "on Sonnet" in the note above for the building lane only, and the sentence "Opus only for hard design adjudication" at `.cursor/MCBYLAWS-QUEUE.md:247` for the plan seat and the building lane. `scripts/analysis/backlog-lane.mjs` prints `AGENT-MODEL: opus` on the line before its BRIEF-FILE line and writes the same split into the brief. Not enforced: the lane guard (outside the repo) allows "sonnet" or "opus" on every Agent call and cannot tell a planner or a builder from a seat or a grounder; the building lane's model is carried by that line and the brief, the plan seat's by this note alone.

## CODE CHANGE (backlog-lane.mjs only; not a protected path, rule-lists.json:22)
- Near :174, add `const MODEL_LINE = 'Model (RR-0385, decision-170): this lane is the building seat and runs on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.';`
- At :208, change to `extra: [ticket, MODEL_LINE, lensLine(...)]`. The lens line stays last, which the merge at :223 relies on.
- At :223, the merged `extra` adds `MODEL_LINE` when `!extra.includes(MODEL_LINE)`.
- Before :231 and before :232, print `AGENT-MODEL: opus (RR-0385: set model "opus" on the Agent call that takes the BRIEF-FILE line below)`.
- In the header comment, step 6 (:11), name the new line.

## TESTS (red first), in src/tests/backlog/backlog-lane.logic.test.ts
- T1, dry run: after `trim().split('\n')` the second-to-last line matches `/^AGENT-MODEL: opus \(RR-0385/` and the last line matches `/^BRIEF-FILE: /`. The TASK-JSON `extra` contains "runs on Opus" and "every grounder run on Sonnet". Red on today's script because neither text exists.
- T2, real launch: the line before the last is AGENT-MODEL, and BRIEF.md holds "runs on Opus" (the test's fake brief.mjs, :41, writes the spec into BRIEF.md). The last line is still exactly BRIEF-FILE; the existing assertion at :176 is the control and stays unchanged.
- T3, `--spec` path: task.merged.json `extra`: (a) a given spec with no `extra` ends with the model line once (red on the old script); (b) a given spec whose `extra` already holds the line ends with it once (green on the old script too, so a survive-the-fix lock, not a red test).
- No test pins :359 (F2): the note adds one line and keeps the prior text, which the review checks.
- Lock in both directions (08_agents.md:485): fails on the old script, passes on the new.

## ORDER
1. Tests, run red.
2. Code and Spec note, run green.
3. Close commit.
This task has no dependency on 437 or 438. It edits a different part of backlog-lane.mjs than 437 does: :174/:208/:223/:231-232 here, :185 in 437. Land 436 first so 437 rebases onto it.

## LANDING
- Code commit: the test, backlog-lane.mjs, the Spec 08 note, and the task file with `Task: task-436`, through the real hooks.
- Close: the two-commit lane close (backlog-lane.mjs:185 brief text).

## ACCEPTANCE
- Every launch prints `AGENT-MODEL: opus` before BRIEF-FILE.
- BRIEF.md carries the split.
- Spec 08 holds the note.
- The guard regex still matches the BRIEF-FILE line, and the suite is green.

## NOT IN SCOPE
- lane-guard.mjs: already changed and outside the repo.
- brief.mjs: needs no change (F5).
- The plan-writing seat: the orchestrator launches it without a script, so its model is stated only in the note. Nothing can print or enforce it.
- No guard and no new gate. Spec 137:152 gets no note (F7); MCBYLAWS-QUEUE.md:247 is named in the Spec 08 note, not edited.

## UNVERIFIED
- That the orchestrator reads stdout above the BRIEF-FILE line. It reads the whole output today, which is how the "plan gate ok" line at :106 is seen.
- The card's DoD cites 08_agents.md:462 and :490. The quoted texts are now at :485 and :513 (line drift).

## GUESS
About 1.5 hours of lane time; about 20 changed lines plus 3 tests.

Files: scripts/analysis/backlog-lane.mjs, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/08_agents.md

Plan review round 1: 12 folded, 0 task, 0 ruling, 0 wontfix, 12 pile; grounder docs/reports/reviews/task-436/GROUNDER-PLAN.md; triage docs/reports/reviews/task-436/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#3 MED folded the plan seat's by t
plan-compliance-eng-all#2 MED folded the second-to-last l
plan-compliance-five-words#4 MED folded the test's fake brie
plan-compliance-inc-S#5 MED folded the plan seat's by t
plan-compliance-queue-137#5 MED folded MCBYLAWS-QUEUE.md:24
plan-error-paths#4 MED folded the second-to-last l
plan-plan-review-deepseek#3 MED folded survive-the-fix lock
plan-plan-review-deepseek#12 MED folded No test reads 08_age
rc#1 MED folded No test reads 08_age
rc#2 MED folded MCBYLAWS-QUEUE.md:24
rg#1 MED folded survive-the-fix lock
rg#3 MED folded the second-to-last l
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-22 taken on the board at lane launch (lane BL-OPUS436, worktree /Users/brettpreston_macmini/Buildo-wt-opus436, branch wf1/inc1b-opus436), RR-0240

2026-11-22 lane BL-OPUS436 (Opus, building seat): tests T1, T2, T3 (a) and (b) written first in src/tests/backlog/backlog-lane.logic.test.ts; red attempt next.

2026-11-22 lane BL-OPUS436: red seen at the assertions (T1, T2, T3 (a) failed; T3 (b) passed as the plan says, a survive-the-fix lock; red.out in the lane dir). Build: MODEL_LINE in spec.extra and the --spec merge (once, after the lens line), AGENT-MODEL: opus printed before BRIEF-FILE on the dry-run and real paths, header step 6, and the Spec 08 dated note at 08_agents.md:360 with the exact text of the plan.

2026-11-22 acceptance on real inputs (lane BL-OPUS436, work commit 05b9de031; inputs and outputs in ~/Buildo-scratch/lanes-20261119/inc1b/opus436-lane/acc/):
(1) every launch prints AGENT-MODEL before BRIEF-FILE: a dry run of the committed script on a clone of this branch for the real LATER task task-102 ended, exit 0, with the two lines 'AGENT-MODEL: opus (RR-0385: set model "opus" on the Agent call that takes the BRIEF-FILE line below)' then 'BRIEF-FILE: .../acc/lane-never/BRIEF.md sha256=<sha256 of the brief>'; nothing written (wt-never and lane-never do not exist). The real (non-dry) path: tests T2 (green in 05b9de031, 64 passed (64)); not run on the real board (a real launch takes a task).
(2) BRIEF.md carries the split: its TASK-JSON extra holds the model line once (index 1 of 3, the lens line last); the real panel-tools/brief.mjs on that task.json wrote BRIEF-acc.md, line 51: '- Model (RR-0385, decision-170): this lane is the building seat and runs on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.'
(3) Spec 08 holds the note: 08_agents.md:360 '   Dated note 2026-11-22 (M-246, prior text kept; task-436 FINAL.1, ...', diff against the plan text: identical.
(4) the guard regex /BRIEF-FILE:\s*(\S+)\s+sha256=([0-9a-f]{64})/ (present in ~/.claude/hooks/lane-guard.mjs: true) on the two-line output captures the BRIEF-FILE path and a 64-hex sha; the AGENT-MODEL line names 'BRIEF-FILE line' without a colon, so it is not matched. Suite green: UNVERIFIED (the full suite runs only at the push station); the related run in the work commit: Tests 64 passed (64).

2026-11-22 lane BL-OPUS436: output review round 1 done (context-r3.md; 12 lens outputs, 44 findings, untriaged) in docs/reports/lanes/2026-11-22/BL-OPUS436/; grounder owed; task stays RUNNING.

2026-11-22 lane BL-OPUS436 close: grounder Cairn-Ground-O436 ruled 44 findings (2 CONFIRMED LOW/NIT piled per RR-0364, 42 REJECTED; GROUNDER.md, TRIAGE.md in docs/reports/lanes/2026-11-22/BL-OPUS436/); no fix round (RR-0385). Work 05b9de031, records 216efc2a7; tests T1-T3 red then green (64 passed); status BUILT.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog-lane.mjs prints AGENT-MODEL: opus on the line before BRIEF-FILE and writes the Opus/Sonnet split line into every brief; Spec 08 dated note 2026-11-22 at 08_agents.md:360 records the split (RR-0385, decision-170); rule-lists page regenerated (Q8). Work 05b9de031; tests T1, T2, T3 (a)/(b) red then green.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/lanes/2026-11-22/BL-OPUS436/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-OPUS436/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
