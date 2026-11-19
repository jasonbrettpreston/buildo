# TRIAGE r1 (plan, review mode, r1-plan.txt) lane BL-R8e task-310
Opened: scripts/board/board-commit.zsh:11-12 (the job does `git add backlog` then one commit: wholesale by design, RR-0240), .gitignore:81 (.cursor/active_task* ignored) and :122 (.board/ ignored), scripts/analysis/backlog-lib.mjs:23-27 (args), :111-117 (readItems).

| # | Finding | Verdict | Reason / fold |
|---|---|---|---|
| 1 CRITICAL | no rollback after the take | KEEP in part | Fold: every input checked in preflight so nothing can fail for a missing input after the take; on a failure after the take the tool prints the exact recovery command (`backlog task edit task-N -s LATER -a ""`). REJECT the marker file and --abort (new surface, PLAN-PROTOCOL.md:3 no scope creep). |
| 2 CRITICAL | take commit is wholesale backlog/ | REJECT | That is how the job commits (board-commit.zsh:11-12); the ruling RR-0240 names the job; changing the job is outside task-310. |
| 3 HIGH | wait predicate does not prove this commit | KEEP | Fold: after the wait, re-read the task on the board HEAD and require RUNNING and the assignee, else refuse. |
| 4 HIGH | no lock between preflight and take | REJECT | Launches are serial by the orchestrator (Spec 08 rule 9); a lock is a new file and surface. |
| 5 HIGH | preflight checks too little | KEEP | Fold: board is a git repo; backlog-brief.mjs, brief.mjs, both node_modules sources exist; one-line refusal each. |
| 6 HIGH | TOCTOU on status | REJECT | Same as 4; the re-read after the wait catches a changed assignee. |
| 7 HIGH | signal handling | REJECT | The recovery line printed on failure covers the stopped case; no new machinery. |
| 8 MEDIUM | fixed 4 minute window | REJECT | The brief fixes 4 minutes; `--wait-ms` exists for tests; the refusal names the state. |
| 9 MEDIUM | no fetch, stale base | REJECT | RR-0240: the lane is cut from the board head; board-ff keeps it level (scripts/board/board-ff.zsh). |
| 10 MEDIUM | NO_LAUNCHD env leaks | KEEP | Fold: an explicit `--no-launchd` flag instead of an env var (it runs the job script inline, never silently waits). Same for `--wait-ms`. |
| 11 MEDIUM | --lane/--branch/--worktree validation | KEEP | Fold: lane regex as backlog-brief.mjs:21, `git check-ref-format` for the branch, worktree must be absolute after expansion. |
| 12 MEDIUM | dry-run print differs from run | KEEP in part | Fold: one step list (argv + cwd) printed as `cd <cwd> && <cmd>`; REJECT the re-parse test. |
| 13 MEDIUM | ln targets unverified | KEEP | Same fold as 5. |
| 14 MEDIUM | plan copy source/no-plan | KEEP | Fold: copy only when the board file exists (it is gitignored, .gitignore:81, so the worktree stays clean); dry-run always prints it. |
| 15 MEDIUM | --spec / env names vs AC | REJECT | --spec is named in the brief; env surfaces replaced by flags (10). |
| 16 MEDIUM | temp board has no hooks | REJECT | The AC asks the tool's logic be tested on a temp project; the repo commit goes through the real hooks. |
| 17 LOW | no plan artifact | REJECT | The plan is on the task (`--plan`) and appended to the context file. |
| 18 LOW | decisions block dumped | REJECT | A backlog-brief.mjs matter, not task-310. |
| 19 LOW | dogfood sequencing | REJECT | Stated in the brief: the dry-run proof refuses on RUNNING task-310, then a LATER id. |
| 20 LOW | BRIEF-FILE format | REJECT | Pinned by the brief and AC #1. |
| 21 NIT | red-proof method | REJECT | Pinned by RR-0225 (MORNING-DECISIONS.md:897). |
| 22 NIT | exit codes | KEEP | Fold: usage errors exit 2, refusals exit 3. |

# TRIAGE r2 (output review, one lens, r2-output.txt) on commit 67032d6a6
Opened: scripts/analysis/backlog-lane.mjs (lines as in diff.patch), backlog-lib.mjs:14 (sha256 takes a Buffer).
| Finding | Verdict | Fold |
|---|---|---|
| CRITICAL two refuse() after the take exit 3 | REJECT code, KEEP wording | The brief names the wait timeout a "clear refusal" (exit 3); header comment now says two checks after the take also exit 3 and name the undo command. |
| HIGH --wait-ms NaN loops forever | KEEP | usage error exit 2 unless finite and >= 0. |
| HIGH import.meta.url pathname encodes spaces | KEEP | fileURLToPath. |
| HIGH jobScript not preflighted | KEEP | checked when --no-launchd. launchctl label check REJECT (new surface). |
| HIGH active_task.md copy skipped silently | REJECT | Decided in plan triage 14: gitignored board file, copy when present; dry-run always prints it. |
| MEDIUM dry-run omits mkdir | KEEP | both mkdirs are printed steps. |
| MEDIUM undo command not runnable | KEEP | printed with fmt: cd board and the resolved binary (test regex updated to the quoted empty assignee). |
| MEDIUM spawn .error ignored | KEEP | fail() prints error.message. |
| MEDIUM unguarded fs after take | KEEP | try/catch after the take calls fail() with the undo line. |
| MEDIUM parse throws in preflight | REJECT | the try/catch covers post-take; preflight parse of a malformed board is a board defect that surfaces as a stack trace by design (no new machinery). |
| MEDIUM --stage unvalidated | KEEP | /^\d{1,3}$/ usage error. |
| LOW git status status unchecked | KEEP | refuse when git status fails. |
| LOW registered but deleted worktree | REJECT | rare; git worktree add reports it. |
| LOW --backlog-bin not home-expanded | KEEP | path.resolve(home()). |
| LOW ~ in quote class | KEEP | dropped from the safe class. |
| NIT dead isAbsolute / first line only / sha256 Buffer | REJECT | harmless; sha256 takes a Buffer (backlog-lib.mjs:14, crypto update). |
