# Seat: reality-check: task-424 plan (PLAN-424-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 77d54ecc7 (branch wf2/board, 18 commits ahead of origin/wf1/mb-rulings 6b3fc4ddf). Read: the whole task view; .husky/pre-push, .husky/pre-commit; station.sh whole; step-validate.mjs :385-415 and :1280-1335; hooks-composition.infra.test.ts (every PRE_PUSH site); the fork-cap test whole; gate.mjs :1-40 and :540-640; MORNING-DECISIONS.md :1787, :1905-1926, :1973-1978; push-station pass files and the two run steps.logs.
Shell checks ran inline with `/bin/sh -c` (bash 3.2.57 sh mode). No file was written and no test runner was run.

Verified true, no finding:
- /bin/sh is GNU bash 3.2.57.
- stdin reaches a command inside `step` through a function in an `&&` chain. Test: `echo refs-line | { step gate g && ...}`, where g is `cat`. It printed refs-line.
- `set --` inside a function with an empty "$@" gives n=0, and the call to the next command is clean.
- The exit status of the chain is the failed step's `rc` (1), and nothing after it runs. On success it is 0.
- The step lines in .husky/pre-push:41 and station.sh:44-48 are as the table says.
- The history is true: runs/0f6ba8225-20261121-105344/steps.log and runs/21adfde8a-20261121-114802/steps.log show four steps and no gate.
- Both pass files carry tip 3a36e8b26. 19 of 19 pass files say branch wf1/mb-rulings. 3a36e8b26 is an ancestor of 21adfde8a.
- The quote of RR-0370 matches :1787.
- Cites checked and correct: the gate.mjs:11 no-switch sentence, gate.mjs:591, protected-paths.json:51, HARD_FLOOR at pre-push-summary.mjs:9, test.yml:72, package.json:11.

## rc#1 HIGH: T2's order predicate cannot go green on the plan's own script text
Plan: "T2 | in the list's executable text, the indexOf of `gate.mjs --push` < `--staged --fast` < `--all --fast` < `spec-split-check.mjs --check` < `npm run typecheck` < `VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test`" and T4 "a list with the `step mcbylaws-gate` line removed fails the T2 order predicate".
Evidence: in the plan's script, `mcbylaws_gate()` and `full_suite()` are defined above the `step ... &&` chain. The `VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test "$@"` text sits in `full_suite`. The chain starts after it with `step step-validate-staged node ... --staged --fast`.
What goes wrong: indexOf(VITEST...) is smaller than indexOf(--staged --fast), so T2 is red on a correct list. T4's third assertion has the opposite fault. Removing the `step mcbylaws-gate mcbylaws_gate &&` line leaves `gate.mjs --push` inside the function, so the order predicate still passes.
Smallest fix: run the order predicate over the chain lines only (the lines that start `step `), by step name: mcbylaws-gate, step-validate-staged, step-validate-all, spec-split, typecheck, suite. Then T4's removal case is red for the right reason.

## rc#2 HIGH: A1 and the lane's green cannot hold. T3 needs the edited station, and the station is edited only after the lane closes
Plan: "A1 (lane). `npx vitest run src/tests/hooks-composition.infra.test.ts ... ` → all pass; T3 runs, not skipped, on this host". Section 7 puts the station edit at step 2, after the lane builds and closes.
Evidence: T3 reads ~/Buildo-scratch/push-station/station.sh, which exists on this host. Until the orchestrator edits it, station.sh:44-48 still runs the checks, so T3 stays red.
What goes wrong: the lane's A1 is red. The build commit's pre-commit hook (`vitest related` on the staged test file, .husky/pre-commit:56 onward) runs T3 and refuses the commit. The lane cannot finish "through the real hooks" (DoD #3). The same fault is also in#2.
Smallest fix: either the orchestrator edits station.sh before the lane commits (and the window of in#4 opens earlier), or T3 is kept out of the lane and run only as A5 after the edit.

## rc#3 MED: the fork-cap test fails by crash, not at its designed assertion, on the red tree
Plan: "Proven red on the tree with only the test edits" and "In `src/tests/step-validate-vitest-fork-cap.infra.test.ts:33`, the path becomes `.husky/pre-push-checks.sh`".
Evidence: the test reads the file at module load (:33-34 `const LIVE_PRE_PUSH = fs.readFileSync(PRE_PUSH_HOOK_PATH, 'utf8')`) with no existsSync guard. The plan gives the guard only to the hooks-composition reads.
What goes wrong: on the red tree the file is absent, so the whole file dies with ENOENT. Every case is red at import. The red is not at :52-53 or :86 or :93.
Smallest fix: apply the same `existsSync ? read : ''` guard there, or record that red as a load crash.

## rc#4 MED: the replay commands A7 and A8 name no working directory
Plan: "Run `sh <lane-wt>/.husky/pre-push-checks.sh station 3a36e8b26 r; echo $?` → `1`".
Evidence: the script calls `node scripts/analysis/mcbylaws/gate.mjs --ci --base "$base"` with a relative path, and the gate takes its repo from process.cwd() (gate.mjs `top(process.cwd())`).
What goes wrong: run from anywhere but the detached worktree at 0f6ba8225, the replay judges the wrong tree or fails to find the script. A7 then proves nothing about 0f6ba8225.
Smallest fix: write `cd <detached-wt> && sh <lane-wt>/.husky/pre-push-checks.sh station 3a36e8b26 "$PWD/r"`.

## rc#5 LOW: a stated shell fact is false on this host
Plan: "Under `set -u`, an empty `"$@"` is an error in bash 3.2, so the list must not use `set -u`."
Evidence: `/bin/sh -c 'set -u; set --; echo "[$@]"; echo ok'` prints `[]` and `ok` on 3.2.57, and so does `bash -c`.
What goes wrong: nothing breaks. The list still works without `set -u`. The reason the plan gives is wrong.
Smallest fix: drop the sentence, or say the list simply does not use `set -u`.

## rc#6 LOW: three line cites are off
- "(:1920)" for "424 kept": the line is MORNING-DECISIONS.md:1921 (:1920 is item 4).
- "askTty :553-566": the function is gate.mjs:552-565.
- "step-validate.mjs:396-407": `gitStagedFiles` and its doc are about :396-409.
Smallest fix: correct the numbers.

## rc#7 LOW: station replacement text works as claimed (checked), with one gap
- steps.log is still written by `tee -a`, so the failure summary at station.sh:54-55 (`cat "$run/steps.log"`, then suite.json) works.
- The :49 post-run check still appends to steps.log.
- The `trap` and the lock stay in station.sh, because a child `sh` inherits neither.
- Gap: if the list exits 2 (usage) before it writes anything, `cat "$run/steps.log"` at :54 prints an error into the .fail file. That is cosmetic.
Smallest fix: none needed.

UNVERIFIED: (a) that `gate.mjs --ci --base 3a36e8b26` at 0f6ba8225 prints `id-no-row` (needs a detached worktree; I made none); (b) that step-validate --all --fast does not fingerprint step-validate.mjs itself; (c) any run of the replay or of the real hook through git.
