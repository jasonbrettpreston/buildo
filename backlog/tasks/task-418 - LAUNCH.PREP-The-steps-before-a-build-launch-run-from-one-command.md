---
id: TASK-418
title: LAUNCH.PREP The steps before a build launch run from one command
status: BUILT
assignee:
  - '@lane-BL-PREP418'
created_date: '2026-11-21T00:24:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-375
references:
  - docs/reports/reviews/task-418/GROUNDER-PLAN.md
  - docs/reports/reviews/task-418/TRIAGE-PLAN.md
  - docs/reports/reviews/task-418/seat-integration-1.md
  - docs/reports/reviews/task-418/seat-reality-check-1.md
  - docs/reports/reviews/task-418/seat-regression-1.md
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
  - docs/reports/lanes/2026-11-21/BL-PREP418/REPORT.md
  - docs/reports/lanes/2026-11-21/BL-PREP418/FINDINGS.md
  - docs/reports/reviews/task-418/context-r2.md
  - docs/reports/lanes/2026-11-21/BL-PREP418/GROUNDER.md
  - docs/reports/lanes/2026-11-21/BL-PREP418/TRIAGE.md
type: build
ordinal: 118012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator, Spec 137 rule 2. Operator ruling RR-0345 (MORNING-DECISIONS.md:1600, verbatim: "5 yes.", to the question as put: the pre-launch steps are done by the orchestrator by hand for task-375, and scripting them is the first task after 375, before the other build tasks launch). Why: before a build or fix launch the plan is reviewed (compliance per governing rule list, the Integration, Reality-Check and Regression seats), ruled by a separate grounder, folded, the fold checked, and the evidence put on the task and committed (Spec 08 sections 6.4, 5.3, 11.2); the launch check of task-375 (folded at d9f2143a7) now refuses a launch without it. Scope (2026-11-21, PLAN-418-v2 in the Implementation Plan field governs; build exactly that plan, do not re-plan): ONE subcommand plan-prep of scripts/analysis/rule-lists.mjs with three phases (review, post, commit) that runs the mechanical steps only, reusing what exists (backlog-brief.mjs, lens-input, findings, the exported functions of check-lane-close.mjs, plant-evidence.mjs for tests); it never writes a ruling, a seat report, a grounder file, an outcome line or the Plan line, and it does not launch. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 (a) planted-defect tests red then green through the real hooks.
- [x] #2 (b) plan-prep review --task task-412 --lane <name> --dry-run: exit 0; 1 brief, 9 lens-input and 9 review commands; git status unchanged.
- [x] #3 (c) the same without --dry-run with 412's plan on the task: 9 plan-compliance-*.txt each starting "REVIEW template=lens-compliance.md", 9 in- files, FINDINGS-PLAN.md; paste counts and shell time.
- [x] #4 (d) the same on a task with an empty plan field: exit 3 one line.
- [x] #5 (e) the agent steps for real on 412 (seat-integration-1.md, seat-reality-check-1.md, seat-regression-1.md, grounder, fold), then post, commit, the grounder copies the printed Plan line, commit again: the dry run prints "plan gate ok: 9 lists, <M> findings, Plan sha256:<12>"; one word edited in the task: exit 3, new expected Plan line; revert.
- [x] #6 (f) backlog task view task-412 --plain shows the references (GROUNDER-PLAN.md, TRIAGE-PLAN.md if any, the three seats) and the "Plan review round 1" block; git log -1 --name-only on wf2/board shows exactly the folder.
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
PLAN-418-v2 (build plan, self-contained). Task: LAUNCH.PREP, the mechanical steps before a build launch run from one command. Basis: board branch wf2/board, head d9f2143a7 (task-375 parts A, B, D and task-399 folded). Every file:line below was opened at d9f2143a7 unless marked UNVERIFIED. v2 replaces v1 (whose 375 claims came from PLAN-375, not code).
Serves: supporting function of the compliance review of every Increment 1.B task; advances none of doc-2 elements A to G. Estimate: GUESS 0.5 lane day (smaller than v1: the real code already does more), not timed.

Files: scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts

0. THE OPERATOR'S WORDS (verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md; line numbers measured; the rest is orchestrator design)
:1517 "don't makr the task complete until it actually works"
:1522 "you are probaley rebuilding stuff that already exists you do this all the time. 1-5 y"
:1585 "yes hardening rounds.  Today's were warranted, but not endless."
:1600 "5 yes." (entry :1598): scripting the hand steps is the first task after 375.
:1630 "these only run on the plan" (the seats); :1634 (a proposal ending "Agreed?", MORNING-DECISIONS.md:1633; not a ruling) "Complaince on the plan and output. Let's start with that!"
:1638 "You are good to build them tonight! If the panel leaves an open question - ground it and then take that as approved and let me know in the morning."
Standards: simple, no over-engineering, no scope creep, no facades; check what exists first. This task scripts the mechanical half of steps 1 to 4 of the six (confirmed as read, :1580). It rules nothing.

1. WHAT IT DOES
Three phases of ONE subcommand, plan-prep, of rule-lists.mjs: review (context, a lens input and a review call per resolved list, a call per plan lens, findings list), post (references and the "Plan review round" block on the task), commit (evidence commit, then the launch dry run). No new script file, field or key. Not scripted, the code already does it: the take adds the compliance:<list id> references (backlog-lane.mjs:129, rule-lists.mjs:452); check-tasks prints the commands for open tasks (:567-576); the gate is the dry run.

2. WHAT EXISTS AT d9f2143a7 AND IS REUSED (each opened)
- docs/reports/reviews/task-375/plant-evidence.mjs (67 lines; run by backlog-lane.logic.test.ts:16). It ALREADY writes a whole valid evidence set into a fixture board and commits it: context-r1.md from fixture-context.md; each list's input via rl.buildLensInputs({id, list, root, material: extractSections(ctx, PLAN_SECTIONS), templateFile, context: extractSections(ctx, CONTEXT_SECTIONS)}) as in-plan-compliance-<id>[-pN].txt; the output with a REVIEW header whose prompt_sha256 is rl.lensPromptHash(...); GROUNDER-PLAN.md (Grounder, Lane, an rl.ruledLine per plan-*.txt, a Seat line per seat with the first 12 hex of the sha256, the Plan line last from planHash); seat-<name>-1.md with a line "### <3 letters>#1 LOW: ..."; the task edits --plan, --append-plan "Plan review round 1: 0 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder <rel>/GROUNDER-PLAN.md; triage <rel>/TRIAGE-PLAN.md" and one --add-ref per evidence file; git add -A and commit. It is a test fixture: SYNTHETIC outputs and ruling, 0 findings. Plan-prep rebuilds none of it: same library calls and forms, tests start from its state, its zero-finding block is the string post must reproduce. What plan-prep adds: the real review calls, real findings, the block for N findings, the real commit through the hooks.
- backlog-brief.mjs writes docs/reports/reviews/<task>/context-rN.md (:49-52 contextRound over the folder, never overwritten; :146-147 the Implementation Plan and Notes sections; :159 writeFileSync) from --task, --lane, --root; its stdout is the brief, not the context path: the caller computes N with the exported contextRound(dir) (scripts/lib/review-template.js:137).
- scripts/lib/review-template.js: CONTEXT_SECTIONS, PLAN_SECTIONS (Description, Acceptance criteria, Implementation Plan), extractSections, contextRound.
- rule-lists.mjs lens-input (:544-566): --list <id> --context <ctx> --material-from <ctx> --out <prefix>; --context is required (exit 2 without); --material-from is its own context and cuts PLAN_SECTIONS; it deletes older <prefix> files first. findings --dir (:588-593) prints a Ruled line per plan-*/out-* file and "<id>\t<line>" per finding.
- backlog-lane.mjs: the review command literal is const cmd at :180 inside lensLine (DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review); every lens passes --context <ctx> and one --section per CONTEXT_SECTIONS entry (:175-177). The gate call is :90-106; it prints "plan gate ok: <L> lists, <M> findings, Plan sha256:<12>" (:106), or one "backlog-lane: refused: plan gate: <error>" line per error to stderr and exits 3 (:105).
- check-lane-close.mjs: planGateErrors (:564, pure; exported), planHash (:552), PLAN_SEATS (:549: always integration and reality-check, conditional regression when a Files entry names a path tracked at the board head, :621), outcomeErrors (:161, exported; mode 'plan'; forms folded, task, ruling, wontfix, pile; folded needs a 20+ character quote present in the task text), parseVerdicts (:128), lensKindOf (:141), seatLines (:145). The round block is built INLINE at :266-276 and appears only in a refusal message ("the block is:\n<lines>\n(one command ...)"), only when the outcome errors are empty, there is at least one CONFIRMED or CONFLICT id, and a round line exists (planGateInner :630 passes summary null when the plan field has no "Plan review round N:" line). It is NOT exported.
- 08_agents.md:524 and 137_mcqueue.md:140 (dated notes 2026-11-21): seats run on the plan only; the gate "cannot prove that the grounder or any seat ran or is a different agent".
- board-commit.zsh commits only backlog/ (:10, :12) every 600 s; index.lock makes it skip (:11). check-backlog-task.mjs:3-4 exempts docs commits from the Task trailer; check-task-files.mjs:10, :70 always allows docs/reports/reviews/<this task id>/.

3. WHAT THE REAL GATE REQUIRES FOR A BUILD TASK, AND WHO WRITES IT
Folder docs/reports/reviews/<id>/ read from git HEAD (backlog-lane.mjs:92-95; the task body from the working file); stray names are ignored. Grounder checklist for task-418: ~/Buildo-scratch/lanes-20261119/inc1b/gate375/h/GROUNDER.md.new section F (the final GROUNDER.md in that folder has no task-418 section).
 | item (real name) | written by |
 | context-r1.md | plan-prep review (backlog-brief.mjs) |
 | in-plan-compliance-<list>[-pN].txt and plan-compliance-<list>[-pN].txt for EVERY resolved list (9 for 418: agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S) | plan-prep review (lens-input then the review command); the tool writes the REVIEW header |
 | FINDINGS-PLAN.md (ids for the grounder; a stray name, ignored by the gate) | plan-prep review (findings output) |
 | seat-integration-1.md, seat-reality-check-1.md, seat-regression-1.md, each with at least one line "### <id>#<n> CRITICAL|HIGH|MED|LOW|NIT: ..." (SEAT_LINE :142) | AGENTS: tool-having Sonnet seats. Never scripted |
 | GROUNDER-PLAN.md: Grounder (not the planned lane, not an assignee), Lane (the planned lane name), a Ruled line per plan-*.txt, a verdict per finding id (lens ids and seat ids), Seat lines "Seat: <name> <repo path> sha256:<12>" (path inside the folder), the Plan line last | AGENT: separate grounder. Never scripted |
 | TRIAGE-PLAN.md, one line per CONFIRMED or CONFLICT id (required only when there is one) | AGENT: orchestrator's fold. Never scripted |
 | references on the task: GROUNDER-PLAN.md, TRIAGE-PLAN.md when present, each seat path (gate :639) | plan-prep post |
 | "Plan review round N: <a> folded, <b> task, <c> ruling, <d> wontfix, <e> pile; grounder <path>; triage <path>" and one line "<id> <SEV> <word> <ref>" per CONFIRMED CRITICAL, HIGH or MED id, in the Implementation Plan field (gate :625-630) | plan-prep post |
 | the folder committed at the board HEAD | plan-prep commit |
 | Plan: <id> sha256:<12>, the hash of title plus body now (front matter excluded, so references do not change it; the round block does) | AGENT: the grounder copies the expected line the dry run prints, as its last act |
Only per-list compliance is required for a build task (:588 branch); a fix task needs one plan-<lens>.txt instead (:604-607). Any other plan-*.txt in the folder must also have a Ruled line and a verdict per finding.

4. DESIGN
4.1 Shape: node scripts/analysis/rule-lists.mjs plan-prep <review|post|commit> --task task-N --lane <planned lane name> [--board <dir>] [--dry-run]. In rule-lists.mjs, which owns lens-input, findings, check-tasks and resolveTask; check-lane-close.mjs imports rule-lists.mjs, so plan-prep post reaches outcomeErrors, parseVerdicts, lensKindOf, seatLines, PLAN_SEATS and planHash by a dynamic import inside an async plan-prep (a static import is a cycle: check-lane-close.mjs:40 imports rule-lists.mjs; no side effect, :819; probed at 093f6d0fa from rule-lists.mjs as the entry: exit 0).
4.2 Actor order (each phase refuses when its input is missing):
 a. AGENT: orchestrator puts the plan on the task (backlog task edit --plan, --ac, --append-notes, --description) and sets the Files line.
 b. SCRIPT: plan-prep review.
 c. AGENTS: three seats, separate grounder (GROUNDER-PLAN.md without the Plan line), fold into the task text, TRIAGE-PLAN.md, fold check (08_agents.md:475-476: a grounder re-executes each claim, a cross-read adversary checks the folds pairwise).
 d. SCRIPT: plan-prep post.
 e. SCRIPT: plan-prep commit (first run: the dry run prints the expected Plan line).
 f. AGENT: the grounder appends that line, last.
 g. SCRIPT: plan-prep commit again: the dry run prints "plan gate ok: 9 lists, <M> findings, Plan sha256:<12>".
 h. HAND: node scripts/analysis/backlog-lane.mjs --task task-N --lane <name>, without --dry-run.
 The expected Plan line is printed only when GROUNDER-PLAN.md is already at the HEAD without it (planGateInner prints it in the Plan-line branch, :635, which runs only after the file is found): so commit runs twice, as above. A later edit of the task title or body changes the hash and sends step f back.
4.3 review. Refusals (exit 3, one line, before any write, wording after backlog-lane.mjs:29): task not found; status not LATER or WAITS; Files do not resolve or lists incomplete (resolveTask, verifyResolved as backlog-lane.mjs:76-79); Implementation Plan field empty; board dirty outside backlog/ and the folder (the backlog-lane.mjs:84 filter, node_modules links ignored; one prep at a time); type not build or fix; a plan-*.txt already in the folder (one review round per prep; a second re-makes every input and output, 08_agents.md:352, by hand or task-414; Q1 ruled by the plan grounder, RR-0350). Then, each command printed as "cd <dir> && <cmd>" and run unless --dry-run:
 1. node scripts/analysis/backlog-brief.mjs --task N --lane <lane> --root <board> (writes the context; N from contextRound before the call).
 2. build: per resolved list L, node scripts/analysis/rule-lists.mjs lens-input --root <board> --list L --context <ctx> --material-from <ctx> --out <folder>/in-plan-compliance-L (the checklist's form). Plan lenses: no input file; each lens of lensSet(...).plan (rule-lists.mjs:162) takes the context file as the file under review (backlog-lane.mjs:187), template plan-review-deepseek.md or lens-<lens>.md, output plan-<lens>.txt (:607 expects plan-plan-review-deepseek.txt for a fix); a fix task has no per-list inputs.
 3. per input: the review command of backlog-lane.mjs:180 <in file> --template .claude/review-templates/lens-compliance.md --context <ctx> + one --section per CONTEXT_SECTIONS entry, cwd the board, output <folder>/plan-compliance-L[-pN].txt (input name without in-), written only on exit 0 (backlog-lane.mjs:118 precedent). The tool runs as argv with DOTENV_CONFIG_PATH in the env, no shell string, printed with q and fmt quoting (:31, :110); --dry-run builds the inputs in memory to name the parts. Calls run concurrently (each bounded at 900 s, deepseek-review.js:36); a failed call is listed by name, exit 1, and the phase deletes the in- and plan- files it wrote (the re-run starts empty).
 4. every output written in this run holds, in its first 15 lines, "REVIEW template=<template asked for>" (a dotenv banner comes first; check-lane-close.mjs:57-59) and a "VERDICT:" line (:70), else exit 1 naming the file; skipped under --dry-run.
 5. rule-lists.mjs findings --dir <folder>, its output written to <folder>/FINDINGS-PLAN.md only on exit 0 (the lane FINDINGS.md precedent).
 The plan lenses run beside compliance (08_agents.md:347 "Run the set at plan AND output for WF1/WF2"; tasks 375 and 399 did; his :1634 is a proposal; Q4 ruled by the plan grounder, RR-0350); the gate requires only compliance, the grounder rules every plan-*.txt.
4.4 post. Refuses, naming each: GROUNDER-PLAN.md absent; a Seat line missing for a name of PLAN_SEATS (integration, reality-check, plus regression when a Files entry is tracked: git ls-files, the gate's own test, :621); a seat file named by a Seat line absent on disk; a CONFIRMED or CONFLICT id of the grounder with no TRIAGE-PLAN.md line. Then it calls outcomeErrors in mode 'plan' on the on-disk files (verdicts from parseVerdicts, lens kinds from findingsIn and lensKindOf, seats from seatLines read from disk, which also refuses a seat file edited after its Seat line, facts: git HEAD readers as the gate's) with a summary of empty text, so that clean outcomes return the "the block is:" message; post authors no outcome: the block is the gate's own text from the verdicts and TRIAGE-PLAN.md lines (the card's outcome lines are those); post takes the text between "the block is:" and "(one command" (Q6), prefixes "Plan " to its first line (:627) and refuses, task unchanged, unless that line has the five counts and each other line is "<id> <SEV> <word> <ref>". With zero ids outcomeErrors returns no block: post writes the zero form plant-evidence writes. Any other outcome error is printed and post exits 1: the fold is not finished. Then ONE command: backlog task edit task-N --append-plan "<block>" with one --add-ref per repo path of GROUNDER-PLAN.md, TRIAGE-PLAN.md when present and each seat path that the task does not carry (one argument per path: a comma splits it). Idempotent: when every block line is in the plan field and every reference on the task, "nothing to post", exit 0; a different "Plan review round" line refuses naming it (a second round line moves the gate's N; task-399 notes: one round line holds the latest counts), removed by hand. Tests 9, 10 and 11 pin the scrape.
 Not shared (Q5): backlog-lane.mjs is not edited (the gate is out of scope, 9). post builds taskOf and decisionExists over git HEAD as :100-103 does; the commit phase's dry run catches drift. The review command stays at backlog-lane.mjs:180, :208 and backlog-brief.mjs:178; test 15 pins the printed one. The Files line stays as the card has it (end-to-end tests sit beside plantEvidence).
4.5 commit. Refuses: index.lock present (board-commit.zsh :11; say retry; checked again before git add); anything staged or dirty outside the folder and backlog/; GROUNDER-PLAN.md absent. If the folder changed: git add docs/reports/reviews/<id>; git commit -m "docs(08_agents): plan review evidence for task-N" -- docs/reports/reviews/<id> through the real hooks (no --no-verify; a pathspec commit: board-commit.zsh runs git add backlog and a bare commit every 600 s); any git failure, a hook refusal included, leaves nothing committed, prints its first lines, exit 1. Then node scripts/analysis/backlog-lane.mjs --task N --lane <lane> --dry-run, output and exit code passed through.
4.6 --dry-run on any phase prints every command and writes nothing.

5. NEVER SCRIPTED (agent work)
Plan text, acceptance criteria, dated notes, decision records; the three seats; the grounder's rulings and Plan line; TRIAGE-PLAN.md and the fold; the fold check; the lane name; the launch; every ruling.

6. TESTS (red first through the real hooks, DoD #2; each lock proven both ways, 08_agents.md 11.3; each spawned-CLI test first asserts exit status, no signal and the first output line before any absence assertion, R-CP 124a:296). Fixture: the temp board of backlog-lane.logic.test.ts and its plantEvidence helper (:15-16), which runs plant-evidence.mjs; no second evidence writer is built.
Seam, documented like backlog-lane's --backlog-bin: --review-bin <script> (test-only) replaces scripts/deepseek-review.js in tests; the REAL tool with --dry-run and a dummy DEEPSEEK_API_KEY prints the real banner and header with no API call and no VERDICT line (deepseek-review.js :39, :161-179).
Planted defects, each with a control:
 1 empty plan field: exit 3, nothing written / plan present proceeds.
 2 task not LATER, Files not resolving, type record: refused / resolving build task.
 3 dirty file outside backlog/ and the folder: refused / dirty only in backlog/ passes; a node_modules link passes.
 4 plan-*.txt present: refused, bytes unchanged / empty folder.
 5 one call exits 1 (stub): names it, its run's files are deleted, the re-run succeeds / all succeed.
 6 output without a REVIEW header in its first 15 lines or without a VERDICT line (stub): exit 1 / stub with banner, header on line 2 and VERDICT passes.
 7 inputs equal byte for byte the files plant-evidence writes from the same context (control); another Description gives different inputs (planted).
 8 context round: with context-r1.md present the phase writes context-r2.md and r1 is untouched.
 9 post: from plant-evidence's state with the round line and references stripped (backlog task edit --plan and --remove-ref), post restores the exact zero-form line and the references; run twice, one block (nothing to post).
 10 post with a CONFIRMED id lacking a TRIAGE-PLAN.md line: refused naming the id, task unchanged / with folded:"<20+ characters in the task>" it posts.
 11 post for a CONFIRMED HIGH folded: commit, then the real dry run prints "plan gate ok" (the end-to-end test; skipped in v1, now runnable).
 12 seats: Regression Seat line removed where a Files path is tracked: post refuses naming it / all-new Files need none; integration or reality-check removed: refused; a seat file edited after the grounder: refused.
 13 commit: staged file outside the folder refused; hook exit 1: nothing committed; index.lock refused; the commit holds exactly the folder (git show --name-only).
 14 one-word edit of the task after the Plan line: the dry run refuses with the new expected Plan line.
 15 --dry-run on each phase: commands printed, tree byte-identical.
 16 a fix task: review writes the plan-lens outputs, no per-list inputs.
Existing tests stay green: rule-lists.logic.test.ts (804 lines), backlog-lane.logic.test.ts (454 lines; its pins on the lens-line text, :263 and :335, are unchanged: backlog-lane.mjs is not edited). The usage line of cli() (rule-lists.mjs:594) gains "plan-prep"; grep "usage: rule-lists" in src/tests/backlog found no pin.

7. ACCEPTANCE (commands on a real not-started build task; output pasted on the task; after the Pre-Review Self-Checklist (00_engineering_standards.md:287, before the tests; do not mark BUILT until all are pasted, :1517)
Real task: task-412 (FOLLOWUPS.ROW; LATER, type build, 9 resolved lists at d9f2143a7). Its launch is not part of this acceptance.
 (a) planted-defect tests red then green through the real hooks.
 (b) plan-prep review --task task-412 --lane <name> --dry-run: exit 0; 1 brief, 9 lens-input and 9 compliance review commands plus one per plan lens (2 for 412); git status unchanged.
 (c) the same without --dry-run with 412's plan on the task: 9 plan-compliance-*.txt each holding "REVIEW template=lens-compliance.md" as its header line (line 2), the plan-lens outputs, 9 in- files, FINDINGS-PLAN.md; paste counts and shell time.
 (d) the same on a task with an empty plan field: exit 3 one line.
 (e) the agent steps for real on 412 (seat-integration-1.md, seat-reality-check-1.md, seat-regression-1.md, grounder, fold), then post, commit, the grounder copies the printed Plan line, commit again: the dry run prints "plan gate ok: 9 lists, <M> findings, Plan sha256:<12>"; one word edited in the task: exit 3, new expected Plan line; revert.
 (f) backlog task view task-412 --plain shows the references (GROUNDER-PLAN.md, TRIAGE-PLAN.md if any, the three seats) and the "Plan review round 1" block; git log -2 --name-only -- docs/reports/reviews/task-412 shows the folder, then GROUNDER-PLAN.md.

8. WHAT THIS CANNOT PROVE
That the seats or grounder ran or differ from the lane (the gate compares names and hashes); that rulings are right; that the fold is complete (only "every CONFIRMED has an outcome and a folded quote is present"); that review content is good; latency or cost; that the plan is unchanged after launch; forgery (401, 402). It proves the mechanical steps ran in order on real inputs and left what the gate reads.

9. NOT IN SCOPE
Scripting a ruling, seat, grounder, fold or fold check; a second round's storage; output-side lenses (the lane close, 399, has them); the launch; record, check and doc types; lane close (399); compliance references (the take does it); a backlog task edit wrapper; changing the gate, the context or plant-evidence.mjs.

10. LANDING
Red tests first, then code: one code commit ("Task: task-418", task file in the diff); a records-only closing commit (Spec 137 Rule 3).

11. LEFT FOR THE LANE TO MEASURE
Per-call time and counts: measured on task-418's 56 KB context, 9 files for 9 lists, 81 to 171 s per call; the dynamic import works (4.1).

Plan review round 1: 64 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-418/GROUNDER-PLAN.md; triage docs/reports/reviews/task-418/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#4 MED folded ; probed at 093f6d0f
plan-compliance-agents-s7-s11#1 MED folded ; probed at 093f6d0f
plan-compliance-agents-s7-s11#3 MED folded plan lenses run besi
plan-compliance-agents-s7-s11#4 MED folded a cross-read adversa
plan-compliance-agents-s7-s11#5 MED folded output <folder>/plan
plan-compliance-eng-all#1 MED folded post authors no outc
plan-compliance-eng-all#2 MED folded after the Pre-Review
plan-compliance-eng-all#3 MED folded Q1 ruled by the plan
plan-compliance-five-words#2 MED folded a dynamic import ins
plan-compliance-five-words#3 MED folded output <folder>/plan
plan-compliance-inc-S#1 MED folded post authors no outc
plan-compliance-inc-S#2 MED folded ; probed at 093f6d0f
plan-compliance-inc-S#4 MED folded Not shared (Q5): bac
plan-compliance-ms-S#1 MED folded output <folder>/plan
plan-compliance-ms-S#3 MED folded ; probed at 093f6d0f
plan-compliance-ms-S#4 MED folded post authors no outc
plan-compliance-orchestrator-doc17#2 MED folded post authors no outc
plan-compliance-orchestrator-doc17#3 MED folded skipped under --dry-
plan-compliance-plan-protocol#2 MED folded post authors no outc
plan-compliance-queue-137#2 MED folded ; probed at 093f6d0f
plan-compliance-queue-137#3 MED folded post authors no outc
plan-error-paths#1 MED folded the phase deletes th
plan-error-paths#4 MED folded checked again before
plan-error-paths#6 MED folded refuses, task unchan
plan-plan-review-deepseek#1 MED folded the phase deletes th
plan-plan-review-deepseek#2 MED folded ; probed at 093f6d0f
plan-plan-review-deepseek#6 MED folded Not shared (Q5): bac
int#1 HIGH folded a dotenv banner come
int#2 MED folded one review round per
int#3 MED folded the backlog-lane.mjs
int#4 MED folded a pathspec commit: b
rc#1 HIGH folded as its header line (
rc#2 MED folded and a "VERDICT:" lin
rc#3 MED folded With zero ids outcom
rg#1 MED folded the backlog-lane.mjs
rg#2 MED folded plan lenses run besi
rg#3 MED folded a different "Plan re
rg#4 MED folded one review round per
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-21 (M-246) Plan put on the task by the orchestrator by hand (RR-0345): PLAN-418-v2, written read-only against the code at d9f2143a7 after task-375 folded; the build is authorized by the operator (RR-0350, MORNING-DECISIONS.md:1638). The Files line is replaced by the plan's four paths (adds src/tests/backlog/rule-lists.logic.test.ts). The plan review of this task is made by hand under the launch check; its evidence is in docs/reports/reviews/task-418/.

2026-11-21 (M-246) Plan review round 1 of this task, made by hand under the launch check (RR-0345): 11 plan review outputs (compliance per governing rule list, plan-review-deepseek, error-paths), the Integration, Reality-Check and Regression seats on the plan, ruled by the separate grounder Cairn-Ground-P418: 92 findings, 71 CONFIRMED (2 HIGH, 36 MED, 29 LOW, 4 NIT), 21 REJECTED; 64 folded into the plan by 30 sentence edits (FOLD-418.json as the grounder wrote it, applied mechanically), 7 to the review pile. Six open questions were ruled by the grounder with grounds (docs/reports/reviews/task-418/QUESTIONS-RULED.md) and are taken as approved on the operator's authorization (RR-0350, MORNING-DECISIONS.md:1638), reported to him: Q1 one review round per prep run; Q2 the script makes the review calls without asking each time; Q3 this task is hand-prepared and is the gate proof, task-412 the first scripted proof; Q4 the plan stage also runs plan-review-deepseek and error-paths beside compliance (Spec 08 section 7 rule 4; MORNING-DECISIONS.md:1634 is his proposal, not a ruling); Q5 backlog-lane.mjs is left untouched and nothing is exported from it; Q6 the round block is read from the check's own refusal message.

2026-11-21 taken on the board at lane launch (lane BL-PREP418, worktree /Users/brettpreston_macmini/Buildo-wt-prep418, branch wf1/inc1b-prep418), RR-0240

2026-11-21 (M-246) Lane BL-PREP418 build stage 1: tests for plan-prep written first (16 planted defects with controls in src/tests/backlog/backlog-lane.logic.test.ts, beside plantEvidence); red attempt follows, then the code.

2026-11-21 (M-246) BL-PREP418 acceptance on real inputs (scratch clone --shared of the lane worktree at 213342547, deleted afterwards; task-412 on the board untouched).
(a) planted-defect tests red then green through the real hooks: red attempt with only the tests and the task file staged failed at assertions (18 failed, red.out in the lane dir: 'AssertionError: rule-lists: usage: rule-lists.mjs validate | ...: expected 2 to be 3'); green = commit 213342547 through the real hooks (3 test files, 265 passed; commit.out).
(b) plan-prep review --task task-412 --lane BL-FOLLOWROW --board <clone> --dry-run (a scratch plan set on 412 in the clone only): exit 0; counts: backlog-brief 1, lens-input 9, compliance review commands 9, plan-lens review commands 2 (plan-review-deepseek.md, lens-error-paths.md); git status --porcelain before and after identical (only the scratch plan edit under backlog/). DEVIATION from the plan sentence 'builds the inputs in memory to name the parts': the dry run names each input file as in-plan-compliance-<id>[-pN].txt, because the part count comes from the context the brief writes and the dry run writes nothing.
(d) the same without --dry-run on task-412 with its empty plan field: 'plan-prep: refused: task-412: the Implementation Plan field is empty (backlog task edit task-412 --plan ...): there is nothing to review', exit 3, one line, nothing written.
(c), (e) and (f) NOT RUN: they need real DeepSeek calls and agent steps on task-412 (owed after the fold; task-412 is the first scripted proof).

2026-11-21 (M-246) BL-PREP418 fix round 1 (grounder Cairn-Ground-O418, g418#1 = out-compliance-eng-all#3 MED): --launch-args could carry --dry-run and the identity flags and turn the commit phase's launch dry run into a real launch. Red test first (commit phase with --launch-args '["--dry-run","x","--no-launchd",...]': expect refusal, task LATER, no worktree, no branch).

2026-11-21 (M-246) Acceptance (c), (e), (f) proof on task-412, PASTED FROM THE ORCHESTRATOR'S RUN: it was run by the orchestrator on the real board with separate seats and the separate plan grounder (Cairn-Ground-P412) and verified by the output grounder (Cairn-Ground-O418); it was NOT run by this lane.
(b) dry412.out: 21 printed commands (1 brief, 9 lens-input, 9 compliance review, 2 plan-lens review); last line: $ cd /Users/brettpreston_macmini/Buildo-wt-board && DOTENV_CONFIG_PATH=/Users/brettpreston_macmini/Buildo/.env node -r /Users/brettpreston_macmini/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review docs/reports/reviews/task-412/context-r1.md --template .claude/review-templates/lens-error-paths.md --context docs/reports/reviews/task-412/context-r1.md 
(c) review412.out (real run, exit 0, 83 s measured by the orchestrator's shell): plan-prep review: 11 outputs (9 compliance, 2 plan lens), 46 findings, docs/reports/reviews/task-412/FINDINGS-PLAN.md
(e) post: 'plan-prep post: block and 5 reference(s) added to task-412' then 'plan-prep post: nothing to post (the round block and every reference are on the task)'.
commit412a.out (exit 3): plan-prep commit: committed 9fee1df4d (docs/reports/reviews/task-412/); backlog-lane: refused: plan gate: GROUNDER-PLAN.md: no last "Plan: <task id> sha256:<12 hex>" line; expected: Plan: task-412 sha256:73d02e7e8f80
commit412b.out (exit 0): plan-prep commit: committed f16f100d3 (docs/reports/reviews/task-412/); plan gate ok: 9 lists, 53 findings, Plan sha256:73d02e7e8f80
commit412c.out (one word of the task edited, exit 3): backlog-lane: refused: plan gate: GROUNDER-PLAN.md: the Plan line "Plan: task-412 sha256:73d02e7e8f80" is not the hash of the task as it is now ...; expected: Plan: task-412 sha256:108e95ebec24
(f) git log -2 --name-only -- docs/reports/reviews/task-412: f16f100d3 (GROUNDER-PLAN.md), then 9fee1df4d (the folder: FINDINGS-PLAN.md, GROUNDER-PLAN.md, QUESTIONS-RULED.md, TRIAGE-PLAN.md, context-r1.md, 9 in-plan-compliance-*, 9 plan-compliance-*, plan-error-paths.txt, plan-plan-review-deepseek.txt).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
plan-prep (review, post, commit) is built in scripts/analysis/rule-lists.mjs with its tests and the launch dry run it runs cannot be overridden; all six acceptance items are met, the task-412 proof (acceptance c, e, f) is pasted in the task notes, so the task is BUILT.

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
<!-- SECTION:FINAL_SUMMARY:END -->
