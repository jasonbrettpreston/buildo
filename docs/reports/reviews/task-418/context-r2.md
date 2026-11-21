# Review context for task-418 (no plan id) written 2026-11-21 by backlog-brief.mjs (round 2)

## Task
task-418 LAUNCH.PREP The steps before a build launch run from one command
status: RUNNING · milestone: m-1 · assignee: @lane-BL-PREP418 · labels: McFix, McFix V2

## Description
Card opened 2026-11-20 by the orchestrator, Spec 137 rule 2. Operator ruling RR-0345 (MORNING-DECISIONS.md:1600, verbatim: "5 yes.", to the question as put: the pre-launch steps are done by the orchestrator by hand for task-375, and scripting them is the first task after 375, before the other build tasks launch). Why: before a build or fix launch the plan is reviewed (compliance per governing rule list, the Integration, Reality-Check and Regression seats), ruled by a separate grounder, folded, the fold checked, and the evidence put on the task and committed (Spec 08 sections 6.4, 5.3, 11.2); the launch check of task-375 (folded at d9f2143a7) now refuses a launch without it. Scope (2026-11-21, PLAN-418-v2 in the Implementation Plan field governs; build exactly that plan, do not re-plan): ONE subcommand plan-prep of scripts/analysis/rule-lists.mjs with three phases (review, post, commit) that runs the mechanical steps only, reusing what exists (backlog-brief.mjs, lens-input, findings, the exported functions of check-lane-close.mjs, plant-evidence.mjs for tests); it never writes a ruling, a seat report, a grounder file, an outcome line or the Plan line, and it does not launch. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts

## Acceptance criteria
- #1 (a) planted-defect tests red then green through the real hooks.
- #2 (b) plan-prep review --task task-412 --lane <name> --dry-run: exit 0; 1 brief, 9 lens-input and 9 review commands; git status unchanged.
- #3 (c) the same without --dry-run with 412's plan on the task: 9 plan-compliance-*.txt each starting "REVIEW template=lens-compliance.md", 9 in- files, FINDINGS-PLAN.md; paste counts and shell time.
- #4 (d) the same on a task with an empty plan field: exit 3 one line.
- #5 (e) the agent steps for real on 412 (seat-integration-1.md, seat-reality-check-1.md, seat-regression-1.md, grounder, fold), then post, commit, the grounder copies the printed Plan line, commit again: the dry run prints "plan gate ok: 9 lists, <M> findings, Plan sha256:<12>"; one word edited in the task: exit 3, new expected Plan line; revert.
- #6 (f) backlog task view task-412 --plain shows the references (GROUNDER-PLAN.md, TRIAGE-PLAN.md if any, the three seats) and the "Plan review round 1" block; git log -1 --name-only on wf2/board shows exactly the folder.

## Implementation Plan
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

## Implementation Notes
2026-11-21 (M-246) Plan put on the task by the orchestrator by hand (RR-0345): PLAN-418-v2, written read-only against the code at d9f2143a7 after task-375 folded; the build is authorized by the operator (RR-0350, MORNING-DECISIONS.md:1638). The Files line is replaced by the plan's four paths (adds src/tests/backlog/rule-lists.logic.test.ts). The plan review of this task is made by hand under the launch check; its evidence is in docs/reports/reviews/task-418/.

2026-11-21 (M-246) Plan review round 1 of this task, made by hand under the launch check (RR-0345): 11 plan review outputs (compliance per governing rule list, plan-review-deepseek, error-paths), the Integration, Reality-Check and Regression seats on the plan, ruled by the separate grounder Cairn-Ground-P418: 92 findings, 71 CONFIRMED (2 HIGH, 36 MED, 29 LOW, 4 NIT), 21 REJECTED; 64 folded into the plan by 30 sentence edits (FOLD-418.json as the grounder wrote it, applied mechanically), 7 to the review pile. Six open questions were ruled by the grounder with grounds (docs/reports/reviews/task-418/QUESTIONS-RULED.md) and are taken as approved on the operator's authorization (RR-0350, MORNING-DECISIONS.md:1638), reported to him: Q1 one review round per prep run; Q2 the script makes the review calls without asking each time; Q3 this task is hand-prepared and is the gate proof, task-412 the first scripted proof; Q4 the plan stage also runs plan-review-deepseek and error-paths beside compliance (Spec 08 section 7 rule 4; MORNING-DECISIONS.md:1634 is his proposal, not a ruling); Q5 backlog-lane.mjs is left untouched and nothing is exported from it; Q6 the round block is read from the check's own refusal message.

2026-11-21 taken on the board at lane launch (lane BL-PREP418, worktree /Users/brettpreston_macmini/Buildo-wt-prep418, branch wf1/inc1b-prep418), RR-0240

## References
- docs/reports/reviews/task-418/GROUNDER-PLAN.md
- docs/reports/reviews/task-418/TRIAGE-PLAN.md
- docs/reports/reviews/task-418/seat-integration-1.md
- docs/reports/reviews/task-418/seat-reality-check-1.md
- docs/reports/reviews/task-418/seat-regression-1.md
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
- RR-0345 Pre-launch steps by hand for task-375 then scripted — "5 yes." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1600)
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved — "You are good to build them tonight! If the panel leaves an open question - ground it and then take that as approved and let me know in the morning.  Teh goal is to get all six steps working tonight" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1638)
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
- RR-0345 Pre-launch steps by hand for task-375 then scripted (names task-418, RR-0345) — "5 yes." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1600)
- RR-0350 Build authorized tonight open questions grounded and taken as approved (names RR-0350) — "You are good to build them tonight! If the panel leaves an open question - ground it and then take that as approved and let me know in the morning.  Teh goal is to get all six steps working tonight" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1638)

## Prior reviews and lane reports
### task-418 (this task)
- docs/reports/reviews/task-418/FINDINGS-PLAN.md
- docs/reports/reviews/task-418/GROUNDER-PLAN.md
- docs/reports/reviews/task-418/QUESTIONS-RULED.md
- docs/reports/reviews/task-418/TRIAGE-PLAN.md
- docs/reports/reviews/task-418/seat-integration-1.md
- docs/reports/reviews/task-418/seat-reality-check-1.md
- docs/reports/reviews/task-418/seat-regression-1.md
### task-375 (dependency)
- docs/reports/reviews/task-375/CROSS-READ.md
- docs/reports/reviews/task-375/FILED-LOW.md
- docs/reports/reviews/task-375/FOLD-VALIDATION.md
- docs/reports/reviews/task-375/GROUNDER-PANEL2.md
- docs/reports/reviews/task-375/PLAN-375-v3.md
- docs/reports/reviews/task-375/PLAN-375-v4.md
- docs/reports/reviews/task-375/READBACK-375-v4.md
- docs/reports/reviews/task-375/fixture-context.md
- docs/reports/reviews/task-375/seat-ground-truth-2.md
- docs/reports/reviews/task-375/seat-integration-2.md
- docs/reports/reviews/task-375/seat-reality-check-2.md
- docs/reports/lanes/2026-11-20/BL-FIXTOOLS/REPORT.md (lane report naming task-375)
- docs/reports/lanes/2026-11-20/BL-V2LIST/REPORT.md (lane report naming task-375)
- docs/reports/lanes/2026-11-20/BL-V2WHOLE/REPORT.md (lane report naming task-375)
- docs/reports/lanes/2026-11-21/BL-GATE375/REPORT.md (lane report naming task-375)

## Dependencies
- task-375 FIX.TOOLS Review and proof tooling: the lens line passes the rule context, the security lens fires for admin and PII, the review template substitutes safely, proof-slice reads its limits from settings (D11, D10, two review-tool defects) · status: RUNNING
  final summary: WHAT IS BUILT: parts A (the reviewer's context is the task, sized), B (compliance references on each task and at close), D (the launch gate with the plan seats) and D11b (the security lens for admin and PII paths) are built and through the hooks. D10b's DB read and acceptance A8 are OPEN pending the operator's DB GO, so this task is NOT complete and stays RUNNING. src/tests/proof-slice.db.test.ts asserts a variable that is not registered, so the DB CI job is red by construction until the registration lands.

Review round 1: 19 fixed, 0 task, 0 ruling, 0 wontfix, 96 pile; grounder docs/reports/lanes/2026-11-21/BL-GATE375/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-GATE375/TRIAGE.md  (ruling on cb5eb3d08: 410 ids, 115 CONFIRMED = 19 MED + 94-0 LOW/NIT; fix commits dfe326345 and b4f4afc39)
out-code-review-p1#1 MED fixed dfe3263
out-compliance-agents-s5-1to3-p1#1 MED fixed dfe3263
out-compliance-agents-s5-1to3-p2#2 MED fixed b4f4afc
out-compliance-agents-s7-s11-p1#3 MED fixed dfe3263
out-compliance-airtight-124a-p1#1 MED fixed dfe3263
out-compliance-airtight-124a-p2#1 MED fixed dfe3263
out-compliance-airtight-v2-122-p1#2 MED fixed dfe3263
out-compliance-airtight-v3-122-p1#1 MED fixed dfe3263
out-compliance-eng-all-p1#2 MED fixed dfe3263
out-compliance-eng-all-p2#4 MED fixed dfe3263
out-compliance-five-words-p1#1 MED fixed dfe3263
out-compliance-inc-S-p1#1 MED fixed dfe3263
out-compliance-ms-S-p1#1 MED fixed dfe3263
out-compliance-orchestrator-doc17-p1#2 MED fixed dfe3263
out-compliance-plan-protocol-p1#1 MED fixed dfe3263
out-compliance-queue-137-p1#1 MED fixed dfe3263
out-compliance-step-132-p1#4 MED fixed dfe3263
out-compliance-step-132-p2#1 MED fixed dfe3263
out-error-paths-p1#1 MED fixed dfe3263

Review round 2: 4 fixed, 0 task, 0 ruling, 0 wontfix, 128 pile; grounder docs/reports/lanes/2026-11-21/BL-GATE375/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-GATE375/TRIAGE.md  (ruling on 87c647d26: 351 ids, 132 CONFIRMED = 4 MED + 124 LOW + 4 NIT; fix commit 0bf6c680d)
out-compliance-airtight-122a-p2#2 MED fixed 0bf6c68
out-compliance-inc-S-p3#3 MED fixed 0bf6c68
out-compliance-queue-137-p3#2 MED fixed 0bf6c68
out-compliance-step-132-p5#2 MED fixed 0bf6c68

Review round 3: 0 fixed, 0 task, 0 ruling, 0 wontfix, 167 pile; grounder docs/reports/lanes/2026-11-21/BL-GATE375/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-GATE375/TRIAGE.md  (final ruling on 3763cae90: 435 ids, 167 CONFIRMED all LOW or NIT)
