# Seat: integration: task-424 plan (PLAN-424-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 77d54ecc7. Read: task-424 file and task-445, 446, 439, 440 and 430 Files lines; commit-msg hook and check-task-files.mjs; rule-lists.mjs `filesEntries`; check-lane-close.mjs (:35, :752); hold.mjs `holdForCommit`; mcbylaws/protected-paths.json; scripts/analysis/rule-lists.json `protected_paths`; pre-push-summary.mjs; paths.mjs; install-hooks.mjs; test.yml; station.sh; `git worktree list`; origin/wf1/mb-rulings tree.

## in#1 HIGH: the commit would be refused. The task file's first `Files:` line is `.husky/pre-push` only
Plan: "Files: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-vitest-fork-cap.infra.test.ts, CLAUDE.md" (section 6), and the task's "The plan measures the size and names the Files line".
Evidence:
- The task file, line 23, ends the Description with `... 21adfde8a passes. Files: .husky/pre-push`.
- The six-entry line is line 25 (and line 201 in the plan).
- scripts/analysis/rule-lists.mjs:172-173: `/(?:^|\s)Files:[ \t]*(.*)$/m.exec(...)` takes the FIRST match. check-task-files.mjs reads it ("the FIRST such line wins").
- Run read-only, `filesEntries(taskfile)` returns `[ '.husky/pre-push' ]`.
What goes wrong: the build commit touches scripts/ and src/, so check-task-files is armed. It refuses `.husky/pre-push-checks.sh`, `scripts/analysis/step-validate.mjs`, both tests and CLAUDE.md as "outside the Files: line". The matcher is a directory-boundary prefix, so `.husky/pre-push` does not cover `.husky/pre-push-checks.sh`. The plan's Files line is never read. The launch brief and lens set use the same first line (`filesText`).
Smallest fix: before the build commit, use the backlog CLI to remove the trailing "Files: .husky/pre-push" sentence from line 23 (or replace it with the six entries), so one Files line exists.

## in#2 HIGH: the lane's pre-commit would run T3 against an unedited station, and a green lane needs the station edit first
Plan: "T3 ... `describe.skipIf(!fs.existsSync(STATION))` ..." with the station edit at section 7 step 2, "The lane does not edit or commit it", and "A1 (lane) ... T3 runs, not skipped".
Evidence: .husky/pre-commit:56-80 runs `vitest related` on staged src/scripts files. The staged hooks-composition test is one of them, so T3 runs at commit time. station.sh:44-48 still carries the checks until the orchestrator edits it.
What goes wrong: the build commit is refused by its own pre-commit run. The sequence in section 7 is circular. Putting the edit first opens the window of in#4 before the lane has landed anything.
Smallest fix: make the station edit step 0 and have the lane commit after it (accept the window in in#4), or take T3 out of the repo test and keep only A5. The same fault appears as rc#2.

## in#3 MED: the lane's base is undecided, and the plan lives only on the board branch
Plan: "The lane builds and closes on a branch from origin/wf1/mb-rulings".
Evidence:
- origin/wf1/mb-rulings (6b3fc4ddf) holds task-424 with 0 occurrences of "PLAN-424".
- The board (wf2/board) is 18 commits ahead, and its upstream is wf1/mb-rulings.
- The build commit must carry the task file in the same diff (check-task-files reads the Files line from the index copy; check-backlog-task wants the trailer).
What goes wrong: a branch cut from the origin tip carries the old task file with no plan and the old Files line. The lane needs the plan's task file, or the plan would not be on the pushed branch at all.
Smallest fix: say the lane branches from the board head (the combined-push route in section 8), or name how the task file edit reaches the lane's diff.

## in#4 MED: the station's new refusal line blocks every other lane's suite, and the "no other suite in the window" cannot be enforced
Plan: "From then until step 4, a suite on a HEAD without the list is refused with the new die line. No other suite runs in that window."
Evidence: station.sh:36 is the only tip check. The new die line has no exception. `git worktree list` shows more than 25 live lane worktrees (wf1/inc1b-*), and task-445 is RUNNING (wf1/inc1b-sec445). Their HEADs all lack the file.
What goes wrong: a 445 or other lane station run during the window dies with STATION REFUSED, and its own pass is lost. The window also includes the operator's own timing before the y.
Smallest fix: make the station edit and the A6 run one orchestrator action just before the push, or have the die line name the exception rule (for example, refuse only when origin's tip already has the list).

## in#5 MED: check-lane-close treats `.husky/*` as a protected path, so the close cannot be one commit
Plan: "One build commit carrying `Task: task-424` and the task file in the same diff ... Then the two-commit close".
Evidence: check-lane-close.mjs:35 ("a commit that changes a protected path ... may not also move a task to finished"); scripts/analysis/rule-lists.json line 22 `"protected_paths": [..., ".husky/*"]`; check-lane-close.mjs:752.
What goes wrong: the plan already says two commits, but it does not say the build commit must keep the task status at RUNNING (not BUILT) while it carries `.husky/*`. A reader doing "task file in the same diff" per DoD #6 would set BUILT and be refused.
Smallest fix: state it: build commit keeps status RUNNING; the close commit carries only the status, evidence and lane report.

## in#6 MED: T3 couples a local suite run to a file outside the repo
Plan: Q3, "a repo test that reads `~/Buildo-scratch/push-station/station.sh` and skips when it is absent".
Evidence: the precedent files (coa-limits.logic.test.ts:93-95, bylaw-mb18l-scorer.logic.test.ts:12) read data, not a tool. station.sh is not a protected path, so edits to it are not shown at push.
What goes wrong, three points:
- In CI the test skips and is silently dead (acceptable, nothing breaks). Skipping is fine on ubuntu.
- On any host with the station, a legitimate station edit (a new step) turns the suite red for every worktree that has the test, with no commit to blame.
- Tool and test can drift apart only on this host.
Smallest fix: answer Q3 as "acceptable, skip in CI" and say the test must assert only the ONE line and the absence of check commands, which the plan already does. Record that a future station edit needs the test updated.

## in#7 LOW: stale pointers outside the Files line
`.husky/pre-push` is cited as the fork-cap source of truth in tasks/lessons.md, docs/specs/01-pipeline/124_step_standard_policy.md, 124a, 08_agents.md, .cursor/wf2_hygiene_active_task.md, .cursor/engine-briefs/hyg-h6-hooks.md and docs/reports/review_followups.md. The plan edits only CLAUDE.md. No test reads those pointers (checked: grep of src/tests and scripts/ finds readers only in step-validate.mjs, hooks-composition, fork-cap).
Smallest fix: name them as intentionally left (history), or add them.

## in#8 NIT: Files line coverage
- Every file the plan touches is on the Files line: the hook, the list, step-validate.mjs, the two tests, CLAUDE.md. The task file and docs/reports/lanes/ are always allowed.
- Nothing on the line is unneeded.
- The list's file mode (100644 vs 100755) is not stated. It is run with `sh`, so either works. The H6 test checks only the four hook names (hooks-composition :434-455).

Checked and fine:
- `.husky/*` is in protected-paths.json:51 and `.husky/**` is in HARD_FLOOR. The glob maps `*` to `[^/]*`, so the new file matches.
- holdForCommit does not apply (not layer23 or frontend). No trailer is needed at commit.
- Hook cwd is the worktree root, and each worktree uses its own `.husky` (install-hooks.mjs `HOOKS_PATH = '.husky'`, relative). A worktree whose HEAD lacks the file keeps its old hook, so no hook can look for a missing list.
- test.yml does not run the hook. T5 is POSIX and runs on dash.
- Files lines of 445, 446, 439, 440 and 430 do not overlap with 424's.

UNVERIFIED: whether 124a's rule-lists.json rows (compliance lists by Files line) match this Files line, and the rows' effect on the launch; whether a station run was in progress.
