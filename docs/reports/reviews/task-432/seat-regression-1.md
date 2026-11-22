# Seat: regression: task-432 plan (PLAN-432-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397. History read with `git log` on backlog-brief.mjs (5d554f459, 740ade03d, dfe326345, 053e01179, d7077c2f8, 777305125) and on the lane tests. Marks: DRIVEN means I ran a command; READ means I read the file. No tests run.

### rg#1 MED: the planned edit breaks an existing test the plan does not name, the one that pins the G1 command
Plan sentence: ":161: add `'--board', board` to the G1 brief call."
Evidence (DRIVEN with READ): src/tests/backlog/backlog-lane.logic.test.ts:115 pins `--root .*wt-t1 --date 2026-11-19 > .*G1-`. Any `--board` argument breaks it. The test came with the G1 launch (task-310).
What would go wrong: red test in the same commit; the plan promises "existing :270 and :276 stay green" and lists no other.
Smallest correction: see integration ig#1 and ig#2. Move `--board` into the lens-line command, or amend :115 in the plan.

### rg#2 LOW: the g375#2 ruling (dfe326345) is kept but its meaning shifts
Evidence (READ): backlog-lane.logic.test.ts:423-435 asserts the lens line names the file the launch brief wrote (context-r2.md) and not r1. That is the one shared count of dfe326345. After this plan the lane is told to use a newer file, so the launch file is a dead name from the first round on (with Q3 yes). The test still passes because the plan keeps the pinned text.
Smallest correction: none required; say in the clause that the named file is the launch file.

### rg#3 LOW: no reversal of the 423 ruling "the brief orders no plan review" (RR-0374; 5d554f459)
Evidence (READ): the brief tests at backlog-brief-context.logic.test.ts:43-44 assert the brief has no `plan-review-deepseek.md` and no `deepseek-review.js plan`. The planned sentence has neither. The new sentence contains the phrase "review round", which no test forbids. No regression.

### rg#4 LOW: the earlier ruling that contexts are never overwritten (task-375 A5, 08_agents.md:529) is kept
Evidence (DRIVEN): `contextRound` counts files (review-template.js:137-139) and the writer never overwrites, so a re-run only adds a file. The close keeps matching with `.some` over all committed contexts (check-lane-close.mjs:320-327, :836), pinned by check-lane-close.logic.test.ts:813. No earlier ruling is undone. The plan's honest limit is that nothing makes the close require the newest file (its Q2).

### rg#5 LOW: nothing in tasks 410, 418, 419 or 423 is undone
- The task-419 round-3 cost (11 outputs re-made after a board merge) is the reason the plan does not merge the board, and the plan avoids it.
- The joined-form and per-document rulings concern the compliance lens line and are untouched; the planned clause is in the lens line prefix only.
- No test other than :115 (rg#1) pins a changed text.
