---
id: TASK-432
title: >-
  INPUTS.4 Fresh review context every round: the reviewer sees the rulings and
  task state as they are at that round
status: BUILT
assignee:
  - '@lane-BL-CTX432'
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-432/GROUNDER-PLAN.md
  - docs/reports/reviews/task-432/TRIAGE-PLAN.md
  - docs/reports/reviews/task-432/seat-integration-1.md
  - docs/reports/reviews/task-432/seat-reality-check-1.md
  - docs/reports/reviews/task-432/seat-regression-1.md
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
  - docs/reports/lanes/2026-11-22/BL-CTX432/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-CTX432/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-CTX432/TRIAGE.md
type: build
ordinal: 132012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. Also measured on task-423 output round 2: 21 of 21 CRITICAL and HIGH lens findings were false, most because the lens read the round 1 context (rulings up to RR-0371 only, the old Files line). THIS TASK (step 5, A): the review context is re-made for each output round so it carries the decisions and the task text as they are then.

Files: scripts/analysis/backlog-brief.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, src/tests/backlog/backlog-brief-context.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
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
# PLAN-432-v1: task-432 INPUTS.4, a fresh review context every round

Principles served (DoD #9, .cursor/MCBYLAWS-QUEUE.md:104): accurate (the reviewer sees the rulings and task as they are), observable (the context is committed and its Decisions naming this task section is read from the board as it is then), simple and reuse (the tooling already makes a new context per run; one flag and one lens-line sentence, no new tool, no change to the close check).

## FINDING FIRST: what the code does today
1. The context file is made by `scripts/analysis/backlog-brief.mjs` on EVERY run. It reads the task from `--root` (:17, :24) and the decisions from `<root>/backlog/decisions` (:39-45). The file name is `context-r<N>.md`, N = the context-r*.md files already in `docs/reports/reviews/<task>/` + 1 (:51; `contextRound`, scripts/lib/review-template.js:137-139). It writes it at :159 and never overwrites. "Decisions naming this task" (:109-117) are the decisions whose title or body names the task id, plan id or ROW id, or an RR id that the task body names.
2. The reviewer is sent only five sections of that file, `CONTEXT_SECTIONS` = Task, Description, Acceptance criteria, Decisions naming this task, Implementation Notes (review-template.js:115). The brief's "Decisions in force" title list is NOT among them.
3. A new N is made by whoever runs the brief again. Today only `backlog-lane.mjs:161` does, once, at launch (`--root <worktree>`). Nothing in the brief text (:178-180) or the lens line (backlog-lane.mjs:176-187) tells the lane to re-run it. The lens commands bake in the launch file (`ctxRel`, backlog-lane.mjs:189). Of the brief's stdout only the `Ticket:` line and the lens line reach the lane's BRIEF.md (backlog-lane.mjs:190 and :208, task.json extra, panel-tools brief.mjs:29); the rest of the stdout is the G1 file, which BRIEF.md only names (:201). So the re-run instruction goes in the lens line.
4. The "round" in the file name is "brief runs", not "review rounds". For task-423 the board already held context-r1.md (the plan evidence); the launch run made context-r2.md. Output rounds 1 and 2 both used it, as the lane never re-ran the brief (docs/reports/reviews/task-423/ holds only context-r1.md and context-r2.md; GROUNDER.md:55,63 "the lens read the older context-r2.md Files line").
5. What the close binds: `lensContexts` (check-lane-close.mjs:320-327) takes EVERY committed context-rN.md of the task (read at :836 from the index and HEAD). An output passes when its prompt hash equals the hash made with ANY ONE of them (:70 `.some`); a placeholder context or a missing heading is refused (:324-326). The test src/tests/backlog/check-lane-close.logic.test.ts:813 already pins "one committed context file; the earlier round file is kept and still binds". So a second or third context per task is ALLOWED and ACCEPTED by the close today, with no check change. The close does not bind round N to the newest file.
6. Rules: the only rule on context files is the dated note at docs/specs/00-architecture/08_agents.md:529: "The review context file of a task is docs/reports/reviews/<task>/context-rN.md, one per review round and never overwritten (N = the context-r*.md files already there + 1), written by scripts/analysis/backlog-brief.mjs". Same words in .claude/review-templates/README.md:124. Spec 137 :140 (note of task-375) says the close recomputes the hash with the committed context. Spec 08 section 7 rule 10 is at :360 and says nothing on contexts; the brief's cite "(:341)" at backlog-brief.mjs:7 and :179 is stale (08_agents.md:341 is blank at HEAD). So a fresh context per round is within the rules and is what 08_agents.md:529 already says; the tooling lacks only the instruction.
7. Why the Files line was stale: the lane widened the task's Files line in its own fix commit 5d554f459 (a commit on branch wf1/inc1b-simple423; it was not on the board when the round ran, it is at the board head now), after the launch context was made. Re-running the brief in the lane worktree reads the lane's current task file, so the task half is solved by the re-run alone. The existing test backlog-brief-context.logic.test.ts:185-195 proves a later run puts new task text in context-r2 and leaves r1 as it was.
8. Why RR-0374 and RR-0375 were missing: decisions live on the board branch. `git ls-tree wf1/inc1b-simple423 backlog/decisions/` ends at decision-156 (RR-0371); decision-159 (RR-0374) and decision-160 (RR-0375) are only on wf2/board. A re-run with `--root <lane worktree>` would still read the lane's copy, so the re-run ALONE does not fix the decisions. Both decisions would be matched if read from the board: decision-159's text names task-423, decision-160's title names Task-423 (matched case-insensitively, :112), and the quote regex :41 reads "Operator, verbatim, 2026-11-22: "..."".
9. The lane does not merge the board before a round (nothing orders it). The retro recommendation (~/Buildo-scratch/lanes-20261119/inc1b/retro/GROUNDED-CAPS.md:154,163: "the lane merges wf2/board once, before the outputs are made") is a recommendation, not a ruling, and has a cost: a merge re-made 11 outputs for task-419 round 3 (GROUNDED-CAPS.md:89), and the close reads the lens template at the range base (check-lane-close.mjs:764), so a merge that pulls in a changed template breaks the hash (see PLAN-433).

So: partly "only the instruction is missing", partly one small code change (where the decisions are read from).

## BASIS
- "Let's add a dn b to the plan - we already do run the review twice - once on the plan and the output." and "Plan approved. We are running right now on this?" (RR-0378, decision-163; MORNING-DECISIONS.md:1850-1852, the entry "Operator APPROVES the review-inputs plan"). Step 5 (A) as put to him: "Fresh context every review round."
- "one per review round and never overwritten" (08_agents.md:529; README.md:124).
- "Nothing was added that the card or ruling did not name" (124a_step_standard_policy_appendix.md:992 at the board head, DoD #8): hence one flag, one sentence, one README sentence.
- Rule must be quoted first: .cursor/MCBYLAWS-QUEUE.md:107. Red tests first: 08_agents.md:485, :513 (the card's DoD rows cite :462, :490, stale at the board head). Status line: 137_mcqueue.md:98 (Rule 3), amended for lane build and fix tasks at :100 (two commits).

## WHAT
Every review round (the first output round and each fix round) starts with a brief re-run in the lane worktree that makes the next context-rN.md from (a) the task file in the lane worktree as it is then and (b) the decisions of the BOARD checkout as they are then. The re-run command is in the lens line of the lane's BRIEF.md (the one place the launcher puts a lane instruction), with the task id, lane, stage, worktree and board path filled in; the lane uses the highest-numbered file in every `--context` of that round and commits it.

"Decisions as they are then" for a lane branch: the files in `<board>/backlog/decisions` on disk at the moment of the re-run (the board is where rulings are recorded; the lane branch only holds the set from its cut). A ruling made after that moment is in the next round. "Task as it is then": the lane worktree's task file (the file the close reads, the lane's own edits included). Nothing is merged; the lane's diff range is untouched.

## EXACT EDITS
1. scripts/analysis/backlog-brief.mjs
 - :17 area: `const boardArg = a.board === undefined ? null : a.board === true ? die(...) : path.resolve(a.board);` and `die(...)` (exit 1, names the dir) if given and `<boardArg>/backlog/decisions` is not a directory; a bare `--board` with no value counts as given and dies too (backlog-lib.mjs:23 parses it to `true`). No silent fallback.
 - :39: `const decDir = path.join(boardArg ?? root, 'backlog/decisions');`. Default (no flag) is unchanged.
 - usage comment (:5) and the die text (:23): add `[--board <dir>]`.
 - no sentence is added to the brief's stdout (it reaches only the G1 file, FINDING FIRST 3); the instruction is edit 2, in the lens line.
2. scripts/analysis/backlog-lane.mjs
 - :161 is not edited (the launch run reads the lane worktree, which is the board head at launch; the test backlog-lane.logic.test.ts:115 pins the G1 call as `--date <d> > <G1 file>` with nothing between).
 - the lens line (:176-187): one sentence appended after `${layout}`, so it sits after the first colon and after ". Compliance lens" that the pinned segment regex at backlog-lane.logic.test.ts:266 reads, and it holds neither "plan review" nor "TRIAGE.md" (tests :216, :223): "Fresh context every review round (RR-0378 step 5, 08_agents.md:529). Before the lens inputs of each review round (the first output round and every fix round) run in the worktree `node scripts/analysis/backlog-brief.mjs --task ${task.id} --lane ${lane} --stage ${stage} --root ${wt} --board ${board} > /dev/null`, which writes the next docs/reports/reviews/${task.id}/context-rN.md from your task file and the decisions of the board as they are then; the file named in the commands above is the launch file, so use the highest-numbered context-rN.md instead in every --context of that round and commit it with the round." The commands keep `--context ${ctx} --section ...` so the pinned regexes (backlog-lane.logic.test.ts:270,276) and the g375#2 test still hold. The brief's launch call at :161 is unchanged.
3. .claude/review-templates/README.md:124: one sentence: the brief's re-run at each round, `--board`.
4. NOT edited: check-lane-close.mjs, review-template.js, any spec.

## TESTS (red first; each plant has a control)
In src/tests/backlog/backlog-brief-context.logic.test.ts (fixture at :12-26, decisions pattern at :116-118):
- T1 plant: root d holds RR-0501 naming the task; a second dir b holds RR-0900 naming the task; run the brief with `--root d --board b`; context-r1 "Decisions naming this task" and "Decisions in force" hold RR-0900. RED now (the flag is ignored).
Controls: (a) without `--board` RR-0900 is absent and RR-0501 present (default unchanged); (b) with `--board b` a decision only in root is absent (the board's set is the source, the ruled meaning).
- T2 plant: `--board <dir with no backlog/decisions>` exits 1 naming the dir and writes no context file; a bare `--board` with no value exits 1 and writes none. Control: a good board exits 0.
- T3 is dropped: the brief's stdout gets no new sentence; the existing test :34-44 (the context sha line, no plan lens) stays green and unedited.
- Control kept as is: the later-run test :185-195 (new task text in r2, r1 untouched).
In src/tests/backlog/backlog-lane.logic.test.ts:
- T4 plant: the lens line of a build brief and of a record brief holds the re-run command with `--task <id>`, `--lane`, `--stage`, `--root <worktree>` and `--board <the board dir>`, and the words "highest-numbered". RED now. Controls: the existing :115 (the G1 call, unedited), :216 and :223 (no "plan review", no "TRIAGE.md"), :266-270, :276 and the g375#2 test stay green.
No check-lane-close test is added: :813 already pins "any committed context binds".

## ORDER
tests T1, T2 and T4 written and shown red (T3 dropped); brief edit (the flag only); lane edit (the lens line only); README sentence; tests green; the named test files green; commit through the real hooks. Estimate (GUESS, no measure for this card): 1 to 2 hours, about 40 lines of code and 6 tests; for scale, task-418 took 76 minutes for 550 lines (docs/reports/reviews/task-423/GROUNDER-PLAN.md, rc#4).

## LANDING
- Files touched are not in the table's protected_paths (scripts/analysis/rule-lists.json: check-lane-close.mjs, rule-lists.mjs, rule-lists.json, deepseek-review.js, .husky/*). backlog-brief.mjs is not protected: the card text carries no such claim (read at the board head) and the table lists only those five paths; a search of scripts/, .husky/ and .claude/ at 202123397 finds it named in backlog-lib.mjs (a comment), backlog-lane.mjs, rule-lists.mjs:637 (the plan stage runs it with --root <board>; the new flag is optional, so unaffected), an error string at check-lane-close.mjs:477 and two review docs (README.md, packs/spec08.md), in no hook. check-lane-close.mjs is NOT touched by this plan.
- If run as a lane build: two commits (08_agents.md:529 note area, 137_mcqueue.md two-commit close): the work first (code, tests, README, task notes), then the closing commit with only the lane report directory, review context directory, task file and decision record. The status line moves in the closing commit, as Rule 3 is amended for lane build and fix tasks (137_mcqueue.md:100); outside a lane build it moves with the work (137_mcqueue.md:98). Launch order: this card launches before task-431 and task-433 land, because the plan gate recomputes the plan-compliance hash with the lens template and the table at the board head (check-lane-close.mjs:631), task-433 edits lens-compliance.md and task-431 changes the review table; if either lands first, the plan evidence of this card is re-made.

## ACCEPTANCE
1. T1, T2 and T4 red then green, with controls.
2. Replay on the real evidence, in a scratch checkout of wf1/inc1b-simple423 (never the board): the brief with `--root <checkout> --board ~/Buildo-wt-board` makes a context whose "Decisions naming this task" holds RR-0374 and RR-0375 and whose Description holds the widened Files line (12 entries, 5d554f459).
3. The close check on a fixture with contexts r1..r3 stays green (existing :813).
4. The lens line of a generated lane brief holds the re-run command with the board path (T4); README updated.
5. DoD 1-10 of the card, STATUS line.

## NOT IN SCOPE
Binding round N to the newest context in the close; merging the board into the lane; changing CONTEXT_SECTIONS; a flag to skip the brief's stdout; plan rounds (plan evidence is made on the board, where the decisions already are); any spec note.

## QUESTIONS RULED by the plan grounder (docs/reports/reviews/task-432/QUESTIONS-RULED.md; none left for the operator)
Q1 RULED A, by the rules (08_agents.md:360 (a); the rules are quoted in QUESTIONS-RULED.md): the decisions come from the board checkout read at each re-run (`--board`): one flag, no merge, no restart. The card says the context carries the decisions "as they are then"; a lane branch holds the decisions of its cut only (decision-156 is its last, DRIVEN with git ls-tree). B, a merge, moves the range and a changed lens template in it breaks the close's hash (check-lane-close.mjs:764); nothing orders a merge (the retro line is a recommendation).
Q2 RULED no: the close does not refuse a round whose outputs hash with an older context. It would change check-lane-close.mjs, a protected path (rule-lists.json:22) that the card's Files line does not name and that may not change in a commit that closes a task (check-lane-close.mjs:738); the file number is "brief runs" not "review rounds", so out-X-r2.txt cannot be mapped to a context; DoD #8 (nothing added that the card did not name). A card of its own, if the operator wants it.
Q3 RULED yes: round 1 is re-made too (RR-0378 step 5, "fresh context every review round"; the lane edited the Files line before round 1 on task-423); cost one extra brief run.

## UNVERIFIED
- Resolved by the grounder: backlog-brief.mjs is not protected (see LANDING).
- Whether a lane can read `~/Buildo-wt-board` from inside its sandbox: the launcher's write scope is the lane dir and the worktree (panel-tools brief.mjs:28) and no read limit is stated; the lens line already reads $HOME/Buildo/.env outside the worktree; not proved from inside a lane (acceptance 2 is run by the orchestrator).
- That RR-0374/RR-0375 come out in "Decisions naming this task" is argued from their text; acceptance 2 proves it.
- The stale cites at backlog-brief.mjs:7,:179 (08_agents.md:341) are out of scope (the card does not name them; 08_agents.md:341 is blank, rule 10 is at :360): recorded for the orchestrator, not built.

Files: scripts/analysis/backlog-brief.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, src/tests/backlog/backlog-brief-context.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts

Plan review round 1: 20 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/reviews/task-432/GROUNDER-PLAN.md; triage docs/reports/reviews/task-432/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#1 MED folded Q1 RULED A, by the r
plan-compliance-eng-all#2 MED folded Fresh context every 
plan-compliance-five-words#5 MED folded Q3 RULED yes: round 
plan-compliance-ms-S#2 MED folded Q3 RULED yes: round 
plan-compliance-ms-S#3 MED folded QUESTIONS RULED by t
plan-compliance-plan-protocol#3 MED folded Q1 RULED A, by the r
plan-compliance-queue-137#1 MED folded The status line move
plan-error-paths#1 MED folded with no value counts
ig#1 MED folded :161 is not edited (
ig#2 MED folded Fresh context every 
rg#1 MED folded :161 is not edited (
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-22 taken on the board at lane launch (lane BL-CTX432, worktree /Users/brettpreston_macmini/Buildo-wt-ctx432, branch wf1/inc1b-ctx432), RR-0240

2026-11-22 lane BL-CTX432 stage 1: read the task, plan review records and rule lists; tests T1, T2 (backlog-brief-context.logic.test.ts) and T4 (backlog-lane.logic.test.ts) written first, red commit attempt follows

2026-11-22 build: backlog-brief.mjs gains --board <dir> (decisions read from <dir>/backlog/decisions; bare flag or missing dir dies, exit 1, no fallback); backlog-lane.mjs lens line gains one sentence with the re-run command (:161 and check-lane-close.mjs untouched); README.md:124 one sentence. Red was five failing assertions (red.out); green is the landing commit through the real hooks.

2026-11-22 ACCEPTANCE 1 (T1, T2, T4 red then green with controls): red.out = five failing assertions at the designed place (T1 plant, T1 control b, T2 plant x2, T4); green = commit 3dc4e0c0a through the real hooks, tail in commit.out: 'Test Files 2 passed ... GATE OK ... POLICY CHECKS OK (commit-msg)'.
ACCEPTANCE 2 (replay, scratch git clone --shared of wf1/inc1b-simple423 at 70edbe60b, brief with --root <clone> --board ~/Buildo-wt-board, clone deleted): context-r3.md 'Decisions naming this task' lines: '- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2) (names task-423, RR-0374) ...' and '- RR-0375 Task-423 closes if it is verified (names task-423) ... MORNING-DECISIONS.md:1830)'; its Description holds 'Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts' (11 entries counted; the plan said 12: noted).
ACCEPTANCE 3 (close check on contexts r1..r3): check-lane-close.mjs and its test are not touched; the existing pin src/tests/backlog/check-lane-close.logic.test.ts:813 stands. Not run by this lane (no direct test runner): UNVERIFIED by a run here.
ACCEPTANCE 4: T4 green in the landing commit (lens line holds 'node scripts/analysis/backlog-brief.mjs --task <id> --lane <lane> --stage <N> --root <wt> --board <board> > /dev/null' and 'highest-numbered context-rN.md'); README.md:124 carries the sentence.

2026-11-22 output review (lens set, DeepSeek, context-r3.md made with --board ~/Buildo-wt-board): 11 outputs in docs/reports/lanes/2026-11-22/BL-CTX432 (nine per-list compliance, code-review, error-paths), 39 findings listed untriaged in FINDINGS.md; grounder owed, task left RUNNING.

2026-11-22 lane BL-CTX432 report copied to docs/reports/lanes/2026-11-22/BL-CTX432/REPORT.md; close check on a throwaway clone refuses only the grounder file and the two references (close-check.out)

2026-11-22 report correction: two (not three) findings are labelled BUG HIGH (out-compliance-inc-S#1, out-compliance-ms-S#1)

2026-11-22 corrections named by the grounder Cairn-Ground-O432 (records only): the findings count is 36 (rule-lists.mjs findings), not 39; acceptance 2: the Description Files line of task-423 holds 12 entries (the lane counted the Card A Files line inside the plan, 11); acceptance 3 is met by the unchanged test check-lane-close.logic.test.ts:813 and by the grounder's r1..r3 in-memory run; the sandbox read of ~/Buildo-wt-board stays UNVERIFIED and context-r3 proves nothing about it (grounder attack 7). Grounder files: GROUNDER.md, ATTACKS.md in the lane directory; TRIAGE.md holds the 8 outcome lines.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Task-432 INPUTS.4 built: backlog-brief.mjs --board flag, one re-run sentence in the lane brief lens line, README sentence, tests T1 T2 T4 (landing commit 3dc4e0c0a); output review grounded, 8 LOW/NIT findings piled, no fix owed.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 8 pile; grounder docs/reports/lanes/2026-11-22/BL-CTX432/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-CTX432/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
