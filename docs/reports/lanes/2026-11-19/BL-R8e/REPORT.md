# REPORT lane BL-R8e task-310 (R8e, RR-0242): one-command lane launch
Ticket: task-310 (R8e) · lane BL-R8e · stage 8. Rules: RR-0242 (MORNING-DECISIONS.md:954), RR-0240 (:950), RR-0225 (:897), Spec 08 rule 9 (08_agents.md:339), PLAN-PROTOCOL.md:3.

## What landed
- scripts/analysis/backlog-lane.mjs (159 lines) and src/tests/backlog/backlog-lane.logic.test.ts (184 lines, 16 cases), plus the context file docs/reports/reviews/task-310/context-2026-11-19.md.
- Commit 67032d6a6 on wf2/r8e-lane-launch (commit.out: "Tests  16 passed (16)", "GATE OK", "POLICY CHECKS OK (commit-msg)", "4 files changed, 445 insertions(+), 1 deletion(-)"). A second commit carries the review fixes and the lane reports (hash in the STATUS section below; see git log).
- No push, no DB, no other worktree touched, no launchctl run (tests use --no-launchd).

## Red then green (RR-0225)
- red.out: first attempt stopped at typecheck (`backlog-lane.logic.test.ts(126,70): error TS1501` regex flag); after fixing the flag the related run gave red: "Test Files 1 failed (1) / Tests 16 failed (16)" with "Cannot find module '.../scripts/analysis/backlog-lane.mjs'" (red.out, tail).
- commit.out: same test file, script added: "Tests 16 passed (16)", commit landed through the real hooks, trailer `Task: task-310`, task-310 file in the diff.

## Review rounds (review mode of scripts/deepseek-review.js)
- r1 plan: r1-plan.txt, 22 findings; TRIAGE.md: 9 KEEP or KEEP-in-part folded (preflight of every input, recovery line, re-read after commit, --no-launchd and --wait-ms flags instead of env, lane/branch validation, exit 2 for usage), rest REJECT with opened lines.
- r2 output (one lens: refusals, dry-run completeness, quoting): r2-output.txt; TRIAGE.md r2 table: fixes folded (wait-ms validation, fileURLToPath for paths with spaces, job script preflight, printed mkdirs, runnable undo command, spawn error text, try/catch after the take, stage validation, git status check, backlog-bin home expansion, `~` out of the quote class).
- Found by the real dry-run, not by review: the real board has an untracked `mobile/node_modules` link (the .gitignore pattern has a trailing slash, a link is not a directory), so the dirty check refused the real board; node_modules paths are now ignored in the dirty check, with a test line.

## Refusal texts (observed, tests assert each: exit 3, exactly one stderr line)
- `backlog-lane: refused: task task-310 is not LATER or WAITS (status RUNNING); only a waiting task is launched` (dryrun.out)
- `... worktree parent <p> does not exist` · `... worktree <p> already exists` · `... branch wf2/t1 already exists` · `... board checkout <b> is dirty outside backlog/: <files>` · `... backlog binary not found at <p> (pass --backlog-bin)` · `... task-999 not found under <dir>` · `... lane name <x> is not a plain name` · `... node_modules source <p> not found (pass --main)` · `... <p>/brief.mjs not found` · `... board commit did not land within N ms (...); task-N is taken but not committed, undo with: cd <board> && <bin> task edit task-N -s LATER -a ''`. Usage errors exit 2.

## Dry-run proof against the real board (dryrun.out, from ~/Buildo-wt-r8e)
- task-310 (RUNNING): refusal above, exit 3.
- task-14 (LATER), lane BL-R8e-probe: prints in order the take (`backlog task edit task-14 -s RUNNING -a @lane-BL-R8e-probe --append-notes '2026-11-19 taken on the board at lane launch (...), RR-0240'`), `launchctl kickstart -k gui/501/com.maxbld.board-commit`, `git worktree add -b wf2/r8e-probe ... '<board HEAD after the take commit>'`, two `ln -s` (node_modules and mobile/node_modules to ~/Buildo), `mkdir -p .cursor`, `cp .../.cursor/active_task.md`, `mkdir -p` lane dir, the backlog-brief command redirected to G1-task-14.md, the TASK-JSON line, the brief.mjs command and `BRIEF-FILE: .../BRIEF.md sha256=<sha256 of the brief>`, exit 0. Verified nothing was created: `ls` of ~/Buildo-wt-r8e-probe and the probe lane dir: No such file or directory. The board checkout was only read.
- Sizes: script 159 lines, test 184 lines, dryrun.out about 20 lines.

## Design notes
- One code path prints and runs each command (`step()`); each printed line is `cd <dir> && <command>`; argv-only spawns, no shell strings; paths quoted by `q()`.
- Wait: polls the board for backlog/ clean and HEAD advanced (default 240000 ms), then re-reads the task and requires RUNNING with the lane assignee.
- generated task.json: goal = title + description; inputs = task view, G1 path, context file, references, documents; outputs = path-like tokens with an extension from the acceptance criteria (relative ones under the worktree) plus <lane dir>/REPORT.md; writeScope = lane dir and worktree (both directories); groups = the `[X]` letter of the milestone title (F when none, with a stderr note); extra = the Ticket line and the review command.

## UNVERIFIED
- A real run against the real board with launchctl (the brief limits the proof to --dry-run; tests exercise the same flow with --no-launchd and a fake panel-tools). `launchctl kickstart -k` behaviour while the job is mid-run is not checked.
- For task-310 itself the generated outputs would include `panel-tools/brief.mjs` (an AC path token that is an input, not an output); harmless to brief.mjs, a gate check would flag it. Not fixed (the tool cannot tell input from output paths).
- The default worktree/branch name rule (lane lowercased, `BL-` stripped) is my reading of `~/Buildo-wt-<name>`; the orchestrator may pass --worktree and --branch.

## Close
- AC 1-3 checked through the CLI with evidence; final summary set; status BUILT (see the task file in the second commit).
