# Review context for task-424 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 2)

## Task
task-424 STATION.ONELIST One list of pre-push checks kept in the repo, used by the push hook and the push station
status: RUNNING · milestone: m-1 · assignee: @lane-BL-ONE424 · labels: McFix, McFix V2, McFix Final

## Description
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's ruling (RR-0370, verbatim: "The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today."; his rule "tools live in the repo"). Why: the push of 0f6ba8225 was refused by the pre-push gate after the station suite had passed, because the list of checks exists twice and the copies differed: .husky/pre-push:41 runs the McBylaws gate first, ~/Buildo-scratch/push-station/station.sh (suite branch) did not. THIS TASK: one list of the non-interactive pre-push checks lives in the repo (the smallest form: decided by the plan; reuse what exists); the push hook and the station both run it, so they cannot differ; the station outside the repo keeps only its plumbing (lock, pass file, tip check); the interactive parts of the gate (held patches, worktrees, the operator's y) stay in the hook. The plan measures the size and names the Files line; .husky/pre-push is a protected path. Proof: a replay of 0f6ba8225 stops at the gate step with id-no-row; 21adfde8a passes.

Files: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-*-fork-cap.infra.test.ts, CLAUDE.md

## Acceptance criteria

## Implementation Plan
#### PLAN-424-v1

**Task:** task-424 STATION.ONELIST. **Rule:** RR-0370, operator, verbatim: "The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today." (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1787). It was kept under RR-0385 item 5, "424 kept ("keep is quick")" (:1921), and it counts as a card on the board under RR-0392 (:1976-1977). **Principles served:** standardized (one list), accurate (the hook and the station cannot differ), observable (one log per step, kept). **Lane:** BL-ONE424; planner and builder Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1917, :1924). **Done-condition:** A1 to A8 pass; A9 is the operator's push. **max_fix_rounds:** 2 (RR-0385 item 3, :1919). Round 1 of the plan review is ruled in docs/reports/reviews/task-424/ (GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md); the plan below is the folded text.

#### 1. Scope
Move the six non-interactive pre-push checks into one POSIX shell file inside the repo: `.husky/pre-push-checks.sh`. It holds six `step <name> <command>` lines joined by `&&`, no function and no branch. Each caller defines `step()` (run the command and return its status), `GATE_MODE` and `SUITE_ARGS`, then sources that file:
- `.husky/pre-push` defines a plain `step`, `GATE_MODE=--push` and an empty `SUITE_ARGS`.
- `~/Buildo-scratch/push-station/station.sh` keeps its own logging `step`, and sets `GATE_MODE="--ci --base origin/$br"` and the suite's json-reporter `SUITE_ARGS`.

The callers differ in exactly these three things, each supplied by the caller and never by the list: `step()`, `GATE_MODE` and `SUITE_ARGS`. The list never changes which checks run or their order. The station keeps its plumbing: the clean check, the node_modules links, the fetch, the tip check, SUITE.lock, the run directory, its logging `step()`, the HEAD/dirty check after the run, the pass/fail files, the failure summary, and `push`. Its fork-cap parse in `scripts/analysis/step-validate.mjs` moves to the new file, so the cap still has one source.

**NOT in scope:**
- No new check.
- No change to what any check does. The gate, step-validate, spec-split, typecheck and the suite are untouched.
- No change to the gate's `--push` arms (held, worktrees, summary, the operator's y). They stay inside `gate.mjs --push` (gate.mjs:573-584, askTty :552-565). Only the hook sets `GATE_MODE=--push`.
- No change to `mcbylaws/protected-paths.json`.
- No CI change. test.yml does not run the hook (.github/workflows/test.yml:72 says the pre-push hook is local only).
- No post-run worktree check added to the hook.

#### 2. What runs today

| # | `.husky/pre-push` (all on line 41, joined by `&&`) | station.sh suite branch |
|---|---|---|
| 1 | `node scripts/analysis/mcbylaws/gate.mjs --push` (reads ref pairs on stdin; asks y when a protected path changed, gate.mjs:580-583) | `:44` `gate.mjs --ci --base "origin/$br"` (no stdin, no tty; "held, worktree and tty: not evaluated in CI", gate.mjs:591) |
| 2 | `node scripts/analysis/step-validate.mjs --staged --fast` | **absent** |
| 3 | `step-validate.mjs --all --fast` | `:45` same |
| 4 | `spec-split-check.mjs --check` | `:46` same |
| 5 | `npm run typecheck` | `:47` same |
| 6 | `VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test` | `:48` same env, plus `-- --reporter=default --reporter=json --outputFile="$run/suite.json"` |

Other facts that matter:
- **Output.** The hook writes to the terminal. The station writes one `<name>.log` per step and appends `== name` / `rc=N` to `steps.log` (station.sh:41). It stops at the first failure through its own `rc` chain (:42-48).
- **Difference 1 (row 2).** The station does not run `--staged --fast`. At push time, and on a clean station worktree, `--staged` falls back to `git diff HEAD~1 HEAD` (step-validate.mjs:396-409). So it is not a no-op, and the station misses a check the hook runs. The one list gives the station that step: it then judges the last commit's files, as the hook does.
- **Difference 2 (row 1).** The gate mode differs. That is unavoidable: the station has neither ref pairs nor a tty. The judging arms are the same functions in both modes (gate.mjs:482-483, reached from summaryInput at :576 and :589); only the arms that ask the operator are `--push` only. Ruled in section 10, Q1.
- **History.** The two 2026-11-21 station runs of 0f6ba8225 and 21adfde8a show four steps and no gate (runs/0f6ba8225-20261121-105344/steps.log, runs/21adfde8a-20261121-114802/steps.log). The gate line :44 was added later as "the one line today".
- **Shell.** package.json:11 `"test": "vitest run --exclude \"**/*.db.test.ts\""`. `/bin/sh` on this host is GNU bash 3.2.57 (`/bin/sh --version`). The list uses only POSIX forms (no `set -u`, no function, no array); a function defined by the caller passes stdin to the command, and the chain's status is the last command's (checked with `/bin/sh -c`).

#### 3. Design

**Where the list lives: `.husky/pre-push-checks.sh`**
- `.husky/*` is in the `protected` list (mcbylaws/protected-paths.json:51) and `.husky/**` is in HARD_FLOOR (pre-push-summary.mjs:9). `globToRegExp` turns `*` into `[^/]*` (paths.mjs:90-92), so the new file is matched.
- An edit to the list therefore keeps the protection the checks have today: shown at push, owner y.
- Putting it under unprotected `scripts/hooks/` would weaken that, and changing the policy file is MB-67's job (policy $comment).
- git runs only hooks with known names, and the H6 test checks only the four hook names (hooks-composition.infra.test.ts:434-455). So an extra file in `.husky/` is inert.

**Why a shell script:**
- The hook is already `#!/bin/sh`, and the station's `step()` is shell.
- A node runner would add a process layer and would have to re-implement passing stdin to the gate.
- The script stops at the first failure through a single `&&` chain. Its exit status is the chain's.

**Exact text of `.husky/pre-push-checks.sh`:**
```sh
#!/bin/sh
#### task-424 (RR-0370, option C): the ONE list of the non-interactive pre-push checks, in order; the chain stops at the first failure.
#### The caller defines step() (step <name> <command...>: run the command, return its status), GATE_MODE and SUITE_ARGS, then sources this file.
####   .husky/pre-push: a plain step(), GATE_MODE=--push (the gate reads git's ref pairs on stdin and may ask the operator), SUITE_ARGS empty.
####   the push station (outside the repo): its logging step(), the gate in --ci mode on origin/<br>, the json reporter arguments for the suite.
#### Fork cap: R-CQ; scripts/analysis/step-validate.mjs parses it from THIS file, so no comment here may carry a fork assignment.
step mcbylaws-gate node scripts/analysis/mcbylaws/gate.mjs $GATE_MODE &&
step step-validate-staged node scripts/analysis/step-validate.mjs --staged --fast &&
step step-validate-all node scripts/analysis/step-validate.mjs --all --fast &&
step spec-split node scripts/analysis/spec-split-check.mjs --check &&
step typecheck npm run typecheck &&
step suite env VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test $SUITE_ARGS
```
Notes on the script:
- No function and no branch is in the file: the six lines are the whole list. `step()` is defined by each caller and returns the command's status, so the `&&` chain stops at the first failure.
- The gate inherits the hook's stdin through the hook's plain `step` (it shifts the name off and runs the command), and its tty prompt opens `/dev/tty` itself (gate.mjs:554). So the y prompt is unchanged.
- `GATE_MODE=--push` is a literal assignment in the hook text, set right before the list is sourced, so an exported `GATE_MODE` in a pusher's environment is overwritten. There is no environment switch: gate.mjs:11 forbids one, and the pin at hooks-composition.infra.test.ts:501-505 is extended to cover this file and the hook's assignment lines.
- The fork assignment appears exactly once in the whole file text, comments included. T5 pins that, so the first-match parse (step-validate.mjs:1300-1306) stays honest.
- The station sources the list inside a subshell, `( . ./.husky/pre-push-checks.sh )`, so the list cannot change the station's own variables; the station's cwd is the worktree root (station.sh:14).

**`.husky/pre-push`.** Lines 1-40 stay as they are; the history they record still holds through the list. Line 41 is replaced by:
```sh
#### task-424 (RR-0370 option C): the checks above run from ONE list, .husky/pre-push-checks.sh, which the push station sources too; this hook supplies the plain step runner and the gate mode.
step() { shift; "$@"; }
GATE_MODE=--push
SUITE_ARGS=
. ./.husky/pre-push-checks.sh
```
git runs the hook at the worktree root; today's relative `scripts/...` paths already rely on that. The hook's output is the checks' own output, as today.

**`scripts/analysis/step-validate.mjs`:**
- :1290 becomes `const PRE_PUSH_HOOK_PATH = path.join(REPO_ROOT, '.husky/pre-push-checks.sh');`.
- In the error text at :1304, `.husky/pre-push` becomes `.husky/pre-push-checks.sh`.
- The doc comments at :1294, :1313, :1317 and :1323 are reworded to "the pre-push check list". No logic changes.

**CLAUDE.md:33.** "`.husky/pre-push` is the source of truth and `step-validate.mjs` parses its value" becomes "`.husky/pre-push-checks.sh` (the one pre-push check list, run by `.husky/pre-push` and the push station) is the source of truth and `step-validate.mjs` parses its value". Ruled yes (Q4). The other mentions of `.husky/pre-push` as the fork cap source (tasks/lessons.md, Specs 124, 124a, 122, 122a and 08, the .cursor briefs) are dated history read by no test or script (grep); they are left as they are.

#### 4. The station (outside the repo)
The lane does not edit or commit it. The orchestrator makes the edit, at the step in section 7, and first copies the file: `cp ~/Buildo-scratch/push-station/station.sh ~/Buildo-scratch/push-station/station.sh.pre-424` (the station is not in git, so this copy is the rollback).

1. Keep :1-42 as they are, including the `step()` function at :41 and `rc=0` at :42. No check and no refusal line is added to the station: a tree without the list fails at the `.` call below with a plain No such file error and a FAIL file, and is re-run once it contains the list.
2. Replace :43-48 (the :43 comment and the five step lines) with:
```bash
  # task-424 (RR-0370 option C): the checks are the repo's one list, the same file .husky/pre-push sources; this file keeps the plumbing (step() above, the gate mode, the suite arguments).
  GATE_MODE="--ci --base origin/$br"; SUITE_ARGS="-- --reporter=default --reporter=json --outputFile=$run/suite.json"
  ( . ./.husky/pre-push-checks.sh ) || rc=1
```
3. Leave everything else as it is: :49-58 (post-run HEAD/dirty check, pass/fail files, the `suite.json` failure summary at :55, which already guards on the file existing), `status` and `push`.

Verification is A5 and A6 in section 9. No repo test reads the station file (Q3): the station is outside the repo and not in git, so A5's three outputs and A6's `steps.log` are the standing proof, and the orchestrator records them in the lane's close record. A later station edit is checked by A5 again.

#### 5. Tests first
Proven red on the tree with only the test edits, run recorded in the lane report, then green.

**New describe block in `src/tests/hooks-composition.infra.test.ts`: "task-424 — one list of pre-push checks".**
- Read `.husky/pre-push-checks.sh` with `existsSync ? read : ''`. A missing file then fails the named cases instead of crashing the file.
- Pure predicate: `checksIn(text) = CHECKS.filter(re => re.test(stripComments(text)))`, where CHECKS is `/mcbylaws\/gate\.mjs/`, `/step-validate\.mjs/`, `/spec-split-check\.mjs/`, `/\bnpm run typecheck\b/`, `/\bnpm run test\b/`, `/\bvitest\b/`, `/\btsc\b/`.

| Case | Assertion | Red today because |
|---|---|---|
| T1 | `checksIn(PRE_PUSH)` is `[]`, and the hook's non-blank executable lines equal `['step() { shift; "$@"; }', 'GATE_MODE=--push', 'SUITE_ARGS=', '. ./.husky/pre-push-checks.sh']` | line 41 runs all six checks |
| T2 | the list's non-blank executable lines (comments stripped) equal exactly the six chain lines of the script text above, in that order, each but the last ending in ` &&`; `npm run test` occurs once in them | the file is absent |
| T3 (planted, CI-safe) | `checksIn(PRE_PUSH + '&& npm run typecheck\n')` is non-empty; the list text with the `step mcbylaws-gate` line removed, and the list text with one ` &&` changed to `;`, each no longer equal T2's six lines | n/a (proves the predicates) |
| T4 (behaviour, hermetic) | `spawnSync('sh', ['-c', 'step() { echo "$1" >> "$CALLS"; [ "$1" != "$FAIL_AT" ]; }; GATE_MODE=x; SUITE_ARGS=; . "$LIST"'])` in a temp dir, `LIST` the list path. For each of the six step names as `FAIL_AT`: exit status 1 and `calls.log` holds the names up to and including that step and no later one. With `FAIL_AT` unset: status 0 and the six names in order | file absent |
| T5 (fork cap, pure) | `parseForkCapFromHookText(PRE_PUSH_CHECKS)` equals the parse of its comment-stripped text, and the full text holds `VITEST_MIN_FORKS=` once and `VITEST_MAX_FORKS=` once | file absent |

**Existing pins that move, with the same strength, from `PRE_PUSH` to the list text (`PRE_PUSH_CHECKS`):**
- hooks-composition.infra.test.ts:98 (fork regex).
- :99-104 (loops; add `PRE_PUSH_CHECKS`, keep `PRE_PUSH`).
- :139-143.
- :145-148.
- :150-157 (the count of `npm run test` in the list's executable text is 1).
- :167-169.
- :171-174. The tamper regex becomes `/step step-validate-all node scripts\/analysis\/step-validate\.mjs --all --fast &&\n/`.
- :481-485 (count of `${GATE} $GATE_MODE` is 1 in the list, before `--staged --fast`; the hook text holds `GATE_MODE=--push` once and no `--ci`).
- :487-490 (tamper `/step mcbylaws-gate node scripts\/analysis\/mcbylaws\/gate\.mjs \$GATE_MODE &&\n/` removed: the count of `${GATE} $GATE_MODE` is 0).
- :501-505 (add `PRE_PUSH_CHECKS` to the loop, and the hook's `GATE_MODE` and `SUITE_ARGS` lines).

These are moves, not removals. T1 adds that the hook itself runs nothing else, and T2 pins the six chain lines themselves with their `&&`, so the gate or the suite cannot leave the chain unseen. No pin is weakened.

**Fork-cap test.** In `src/tests/step-validate-*-fork-cap.infra.test.ts:33` (the one existing fork-cap test file; a glob is written so that the card's Files line, which the launch copies into the brief, holds no runner name), the path becomes `.husky/pre-push-checks.sh`, and the read at :33-34 gets the same `existsSync ? read : ''` guard, so the red run fails at its assertions, not at import. The titles and comments at :11-25, :50, :51 and :56 are reworded. The assertions at :52-53, :58-60, :86 and :93 stay as they are.

**Unaffected:** install-hooks.infra.test.ts:35 and :99-110 (hook names only).

#### 6. Files
Files: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-*-fork-cap.infra.test.ts, CLAUDE.md

Estimated size: about 15 new lines in the list (6 chain lines, 9 of comment), about 5 hook lines in place of 1, about 6 lines in step-validate, about 80 test lines added and 20 changed. The station change (about 3 lines in place of 6) is outside the repo and outside the Files line. The task file and docs/reports are always allowed by check-task-files.mjs:10.

Before launch the orchestrator removes the stale first `Files:` line from the card: the Description paragraph ends with ` Files: .husky/pre-push`, and rule-lists.mjs:172-173 and check-task-files.mjs take the FIRST such line, so the build commit would be refused for the other five files. The Description is edited through the backlog CLI (text in docs/reports/reviews/task-424/QUESTIONS-RULED.md, point in1) so that the six-entry line above is the only `Files:` line.

#### 7. Landing
**Commits:**
- One build commit carrying `Task: task-424` and the task file in the same diff. This is Spec 137 rule 3 as built (137_mcqueue.md:23): the commit touches `scripts/` and `src/`. It leaves the status RUNNING: the commit changes `.husky/*`, a protected path, and check-lane-close.mjs:35 refuses a commit that also moves a task to a finished status.
- Then the two-commit close for lane build tasks (137_mcqueue.md:100). The close commit holds records only, no path outside docs/reports and backlog: the status line and evidence, the repo copy of the lane report with TRIAGE.md in docs/reports/lanes/<date>/BL-ONE424/, the per-list compliance and engineering outputs for the lists the Files line resolves to, and GROUNDER.md by a separate grounder (until it exists the lane leaves the task RUNNING with grounder owed).
- Red evidence (T1, T2, T4, T5 red; T3 green) is recorded in the lane report before the code. The commit goes through the real hooks.

**Protected path.** `.husky/pre-push` and `.husky/pre-push-checks.sh` are `protected`. No commit-time trailer is needed: trailers apply to `layer23` and `frontend` paths (cite-arms.mjs:14). At push the summary shows both files and the gate asks for the owner's y (gate.mjs:580-583).

**Sequence (chicken-and-egg):**
1. The lane branches from the board head at launch (wf2/board, which holds this plan in the task file; origin/wf1/mb-rulings holds the task without it), builds and closes there, and the orchestrator folds its branch into the board by merge, as for the other lanes. Every station push goes to wf1/mb-rulings: 19 of 19 pass files say `branch: wf1/mb-rulings`, and the board branch's upstream is wf1/mb-rulings.
2. The orchestrator makes the section 4 edit (after the `cp` backup) only when the operator is ready to push, and runs A5 and A6 straight after. A suite run by another lane in that short window, on a tree without the list, fails at the station's `.` call with No such file and a FAIL file; it is re-run once it contains the list. No board note and no refusal line is needed.
3. The orchestrator runs `station.sh suite` on the final tip (A6). This is the new station plus the new list. It must PASS before any push.
4. The operator runs `station.sh push`. git runs the hook in the pushed worktree, which is the NEW `.husky/pre-push` from that tree: core.hooksPath `.husky` is relative to each worktree (scripts/hooks/install-hooks.mjs:18, :46). So the new list, sourced by the hook, runs, the gate asks y, and then the five steps run.
5. After the push, the tip check at station.sh:36 means every later candidate contains the list, so the list is never missing from a candidate again.

**Rollback:** restore the station from the copy made at step 2 (`cp station.sh.pre-424 station.sh`), then revert the commit.

**The 2026-11-22 incident** (hook's suite saw the worktree move mid-run). The record entry is UNVERIFIED: not found by grep. The nearest are :921 and :1126, which are station-side "worktree changed during the run" cases. The one list changes nothing there:
- The hook still runs the suite in place in the pushing worktree, with no post-run check, as today.
- The station keeps its own check at :49.
- The guard is the same as now: nothing commits in the worktree being pushed or tested.

#### 8. Order against open tasks
None of 445, 446, 439 or 430 shares a file with this task:
- 445 (RUNNING): rule-lists.mjs, backlog tests, 08_agents.md, review-templates README.
- 446 (LATER) and 430 (BUILT): surfaces, Spec 135 and 136, MCFRONTEND-QUEUE, 00_system_map.md.
- 439 (LATER): rule-lists.json, 08_agents.md, 137_mcqueue.md.

The only thing shared is the station and push window. Either run the section 7 steps 2-4 straight after one another, or let 424 ride one combined push with 430 and 445 (as RR-0392 did), where step 3's suite runs on the combined tip. Any branch suited after 424 lands must contain it (station.sh:36).

#### 9. Acceptance
Each item is a command and its expected output.
- **A1 (lane).** `npx vitest run src/tests/hooks-composition.infra.test.ts src/tests/step-validate-*-fork-cap.infra.test.ts` → all pass (T1 to T5).
- **A2.** `grep -v '^#' .husky/pre-push | grep -cE 'gate\.mjs|step-validate|spec-split|npm run'` → `0`.
- **A3.** `sh -n .husky/pre-push-checks.sh; echo $?` → `0`; `grep -cE '^step ' .husky/pre-push-checks.sh` → `6`.
- **A4 (lane).** `npm run test` → green, through the real hooks.
- **A5 (orchestrator, after the station edit):**
  - `bash -n ~/Buildo-scratch/push-station/station.sh; echo $?` → `0`.
  - `sed -n '/^suite)/,/^  ;;/p' ~/Buildo-scratch/push-station/station.sh | grep -cE 'gate\.mjs|step-validate|spec-split|npm run'` → `0`.
  - `grep -c 'pre-push-checks.sh' ~/Buildo-scratch/push-station/station.sh` → `1`.
- **A6 (orchestrator, never the lane).** `bash ~/Buildo-scratch/push-station/station.sh suite <final-wt> wf1/mb-rulings` (<final-wt> is the worktree whose HEAD is pushed, the board after the merge) → `STATION PASS <short>`. Its `runs/<short>-*/steps.log` shows mcbylaws-gate, step-validate-staged, step-validate-all, spec-split, typecheck and suite, each `rc=0`, and `suite.json` exists.
- **A7 (orchestrator, replay of 0f6ba8225, the gate step).** `cd` into a detached worktree at 0f6ba8225 (the gate judges the tree it runs in; node_modules are not needed), then `node scripts/analysis/mcbylaws/gate.mjs --ci --base 3a36e8b26; echo $?` → the output holds `FAIL:Q:id-no-row:mig-334:migrations/334_precommit_budget_registry_repin.sql` and `GATE FAIL`, then `1`. The base 3a36e8b26 is the `tip:` in both pass files of 2026-11-21 (checked). The grounder ran the decisive arm in memory: `idLedgerErrors` on the diff 3a36e8b26..0f6ba8225 returns exactly that FAIL line, and the gate calls the same function for `--ci` and `--push` (gate.mjs:483, :511-514). If the real run does not print it, the card's proof fails and the orchestrator reports that; the chain stopping at a failed step is proved by T4.
- **A8 (orchestrator, replay of 21adfde8a, the gate step).** The same command from a detached worktree at 21adfde8a → `GATE OK`, then `0` (the grounder's in-memory run of the same arm returns no FAIL line for 21adfde8a). The whole list passing is A6 on the final tip; a full-suite replay of an old commit would add nothing to A6 (Q2).
- **A9 (operator, the release action only).** `station.sh push`. Every push is his own y (RR-0385 item 4); A1 to A8 are the validation. The hook's summary lists the two `.husky` files and asks for y, the five other steps' output follows, and push.log records `rc=0`.
- **Pre-review self-check (engineering standards section 11, always applies; the WF3 sibling item does not apply to a build).** Each walked PASS or FAIL against the actual diff before Green Light: (1) the list holds six `step` lines and nothing else executable (T2, A3); (2) the hook holds no check command, `GATE_MODE=--push` once and no `--ci` (T1, A2); (3) the station holds no check command and sources the list once (A5); (4) the chain stops at the first failure for each of the six steps (T4); (5) the fork cap has one text and one parse (T5, A4); (6) the gate, the step-validate logic, the moved pins' strength, the hook's output and the y prompt are unchanged (A1, A4, A9).

#### 10. Questions for the grounder
- **Q1. RULED (plan grounder, round 1): yes.** The gate runs `--push` in the hook and `--ci --base origin/<br>` at the station. The card keeps the interactive gate arms in the hook; the station has no ref pairs and no tty (askTty returns FAIL:S:no-tty without one, gate.mjs:554); the judging arms are one function in both modes (gate.mjs:482-483, reached from summaryInput at :576 and :589). The callers differ only in `step()`, `GATE_MODE` and `SUITE_ARGS`, each named in section 1.
- **Q2. RULED: the card's proof is the gate step.** A7 and A8 run the gate in a replay worktree; the whole list passing is A6 on the final tip. Run in memory by the grounder: the id-ledger arm returns FAIL:Q:id-no-row:mig-334 for 0f6ba8225 and nothing for 21adfde8a, for base 3a36e8b26, and `--ci` reaches that arm as `--push` does.
- **Q3. RULED: no repo test reads the station file.** The test that read it (the first draft's T3) is dropped: it could not be green for the lane before the station is edited, it reaches outside the repo, and it skips off this host. The station is held by A5 and A6 (section 4).
- **Q4. RULED: yes, in scope.** CLAUDE.md:33 names `.husky/pre-push` as the source of truth, which the move makes false; the one-phrase edit stays on the Files line. No new rule or tool is added.
- **Q5. RULED: `.husky/pre-push-checks.sh`.** It is protected (mcbylaws/protected-paths.json:51, pre-push-summary.mjs:9): an edit is shown at push and needs the owner's y; scripts/hooks/ is not protected.

Checked by the plan grounder: the id-ledger arm on 0f6ba8225 and 21adfde8a (A7, A8); that step-validate.mjs is not fingerprinted (gate G #39 covers scripts/lib/step); the pointer cites in this plan. Not checked: that the gate `--ci` run on the landing tip is free of other FAIL lines; that the replay worktrees reproduce their 2026-11-21 results (A7 and A8 check them).

Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/reviews/task-424/GROUNDER-PLAN.md; triage docs/reports/reviews/task-424/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded the repo copy of the
plan-compliance-agents-s5-1to3#2 MED folded FAIL:Q:id-no-row:mig
plan-compliance-agents-s5-1to3#3 MED folded No repo test reads t
plan-compliance-agents-s7-s11#1 MED folded FAIL:Q:id-no-row:mig
plan-compliance-five-words#1 MED folded FAIL:Q:id-no-row:mig
plan-compliance-five-words#2 MED folded A1 to A8 are the val
plan-compliance-five-words#3 MED folded No repo test reads t
plan-compliance-inc-S#1 MED folded the judging arms are
plan-compliance-inc-S#2 MED folded A7 and A8 run the ga
plan-compliance-ms-S#1 HIGH folded No repo test reads t
plan-compliance-ms-S#2 MED folded FAIL:Q:id-no-row:mig
plan-compliance-ms-S#3 MED folded No check and no refu
plan-compliance-ms-S#4 MED folded No repo test reads t
plan-compliance-orchestrator-doc17#1 MED folded FAIL:Q:id-no-row:mig
plan-compliance-plan-protocol#1 MED folded gate judges the tree
plan-compliance-plan-protocol#2 MED folded FAIL:Q:id-no-row:mig
plan-compliance-queue-137#1 MED folded FAIL:Q:id-no-row:mig
plan-compliance-queue-137#3 MED folded the repo copy of the
plan-compliance-queue-137#5 HIGH folded Before launch the or
plan-engineering-eng-all#1 MED folded Pre-review self-chec
plan-engineering-eng-all#3 MED folded No repo test reads t
plan-plan-review-deepseek#1 MED folded the station is not i
plan-plan-review-deepseek#2 MED folded FAIL:Q:id-no-row:mig
plan-plan-review-deepseek#3 MED folded The whole list passi
plan-plan-review-deepseek#6 MED folded only when the operat
rc#1 HIGH folded equal exactly the si
rc#2 HIGH folded No repo test reads t
rc#3 MED folded and the read at :33-
rc#4 MED folded gate judges the tree
in#1 HIGH folded Before launch the or
in#2 HIGH folded No repo test reads t
in#3 MED folded The lane branches fr
in#4 MED folded No check and no refu
in#5 MED folded It leaves the status
in#6 MED folded A later station edit
rg#1 HIGH folded equal exactly the si
rg#2 MED folded pins the six chain l
rg#3 MED folded the parse of its com

## Implementation Notes
2026-11-23 taken on the board at lane launch (lane BL-ONE424, worktree /Users/brettpreston_macmini/Buildo-wt-one424, branch wf1/inc1b-one424), RR-0240

2026-11-23 taken on the board at lane launch (lane BL-ONE424, worktree /Users/brettpreston_macmini/Buildo-wt-one424b, branch wf1/inc1b-one424b), RR-0240

## References
- docs/reports/reviews/task-424/GROUNDER-PLAN.md
- docs/reports/reviews/task-424/TRIAGE-PLAN.md
- docs/reports/reviews/task-424/seat-integration-1.md
- docs/reports/reviews/task-424/seat-reality-check-1.md
- docs/reports/reviews/task-424/seat-regression-1.md
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
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks — "if so approved. 2. The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today. Also want to add the spec rules section as a later task to the board." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1787)
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
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
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks (names RR-0370) — "if so approved. 2. The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today. Also want to add the spec rules section as a later task to the board." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1787)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)

## Prior reviews and lane reports
### task-424 (this task)
- docs/reports/reviews/task-424/FINDINGS-PLAN.md
- docs/reports/reviews/task-424/FOLD-CHECK.md
- docs/reports/reviews/task-424/GROUNDER-PLAN.md
- docs/reports/reviews/task-424/QUESTIONS-RULED.md
- docs/reports/reviews/task-424/TRIAGE-PLAN.md
- docs/reports/reviews/task-424/seat-integration-1.md
- docs/reports/reviews/task-424/seat-reality-check-1.md
- docs/reports/reviews/task-424/seat-regression-1.md

## Dependencies
- (none)
