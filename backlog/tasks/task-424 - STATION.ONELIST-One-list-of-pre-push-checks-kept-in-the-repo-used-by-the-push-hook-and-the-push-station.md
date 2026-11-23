---
id: TASK-424
title: >-
  STATION.ONELIST One list of pre-push checks kept in the repo, used by the push
  hook and the push station
status: RUNNING
assignee:
  - '@lane-BL-ONE424'
created_date: '2026-11-21T22:20:00Z'
updated_date: '2026-11-23T14:29:00Z'
labels:
  - McFix
  - McFix V2
  - McFix Final
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-424/GROUNDER-PLAN.md
  - docs/reports/reviews/task-424/TRIAGE-PLAN.md
  - docs/reports/reviews/task-424/seat-integration-1.md
  - docs/reports/reviews/task-424/seat-reality-check-1.md
  - docs/reports/reviews/task-424/seat-regression-1.md
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
type: build
ordinal: 124012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's ruling (RR-0370, verbatim: "The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today."; his rule "tools live in the repo"). Why: the push of 0f6ba8225 was refused by the pre-push gate after the station suite had passed, because the list of checks exists twice and the copies differed: .husky/pre-push:41 runs the McBylaws gate first, ~/Buildo-scratch/push-station/station.sh (suite branch) did not. THIS TASK: one list of the non-interactive pre-push checks lives in the repo (the smallest form: decided by the plan; reuse what exists); the push hook and the station both run it, so they cannot differ; the station outside the repo keeps only its plumbing (lock, pass file, tip check); the interactive parts of the gate (held patches, worktrees, the operator's y) stay in the hook. The plan measures the size and names the Files line; .husky/pre-push is a protected path. Proof: a replay of 0f6ba8225 stops at the gate step with id-no-row; 21adfde8a passes.

Files: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-*-fork-cap.infra.test.ts, CLAUDE.md
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
# PLAN-424-v1

**Task:** task-424 STATION.ONELIST. **Rule:** RR-0370, operator, verbatim: "The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today." (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1787). It was kept under RR-0385 item 5, "424 kept ("keep is quick")" (:1921), and it counts as a card on the board under RR-0392 (:1976-1977). **Principles served:** standardized (one list), accurate (the hook and the station cannot differ), observable (one log per step, kept). **Lane:** BL-ONE424; planner and builder Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1917, :1924). **Done-condition:** A1 to A8 pass; A9 is the operator's push. **max_fix_rounds:** 2 (RR-0385 item 3, :1919). Round 1 of the plan review is ruled in docs/reports/reviews/task-424/ (GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md); the plan below is the folded text.

## 1. Scope
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

## 2. What runs today

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

## 3. Design

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
# task-424 (RR-0370, option C): the ONE list of the non-interactive pre-push checks, in order; the chain stops at the first failure.
# The caller defines step() (step <name> <command...>: run the command, return its status), GATE_MODE and SUITE_ARGS, then sources this file.
#   .husky/pre-push: a plain step(), GATE_MODE=--push (the gate reads git's ref pairs on stdin and may ask the operator), SUITE_ARGS empty.
#   the push station (outside the repo): its logging step(), the gate in --ci mode on origin/<br>, the json reporter arguments for the suite.
# Fork cap: R-CQ; scripts/analysis/step-validate.mjs parses it from THIS file, so no comment here may carry a fork assignment.
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
# task-424 (RR-0370 option C): the checks above run from ONE list, .husky/pre-push-checks.sh, which the push station sources too; this hook supplies the plain step runner and the gate mode.
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

## 4. The station (outside the repo)
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

## 5. Tests first
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

## 6. Files
Files: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-*-fork-cap.infra.test.ts, CLAUDE.md

Estimated size: about 15 new lines in the list (6 chain lines, 9 of comment), about 5 hook lines in place of 1, about 6 lines in step-validate, about 80 test lines added and 20 changed. The station change (about 3 lines in place of 6) is outside the repo and outside the Files line. The task file and docs/reports are always allowed by check-task-files.mjs:10.

Before launch the orchestrator removes the stale first `Files:` line from the card: the Description paragraph ends with ` Files: .husky/pre-push`, and rule-lists.mjs:172-173 and check-task-files.mjs take the FIRST such line, so the build commit would be refused for the other five files. The Description is edited through the backlog CLI (text in docs/reports/reviews/task-424/QUESTIONS-RULED.md, point in1) so that the six-entry line above is the only `Files:` line.

## 7. Landing
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

## 8. Order against open tasks
None of 445, 446, 439 or 430 shares a file with this task:
- 445 (RUNNING): rule-lists.mjs, backlog tests, 08_agents.md, review-templates README.
- 446 (LATER) and 430 (BUILT): surfaces, Spec 135 and 136, MCFRONTEND-QUEUE, 00_system_map.md.
- 439 (LATER): rule-lists.json, 08_agents.md, 137_mcqueue.md.

The only thing shared is the station and push window. Either run the section 7 steps 2-4 straight after one another, or let 424 ride one combined push with 430 and 445 (as RR-0392 did), where step 3's suite runs on the combined tip. Any branch suited after 424 lands must contain it (station.sh:36).

## 9. Acceptance
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

## 10. Questions for the grounder
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-23 taken on the board at lane launch (lane BL-ONE424, worktree /Users/brettpreston_macmini/Buildo-wt-one424, branch wf1/inc1b-one424), RR-0240

2026-11-23 taken on the board at lane launch (lane BL-ONE424, worktree /Users/brettpreston_macmini/Buildo-wt-one424b, branch wf1/inc1b-one424b), RR-0240

2026-11-23 BL-ONE424 build: tests first (plan section 5): T1-T5 added to src/tests/hooks-composition.infra.test.ts and the ten pins moved to the list text; fork-cap test reads .husky/pre-push-checks.sh with the existsSync guard. Red attempt: a commit with only the two test files and this task file staged (red.out in the lane dir).

2026-11-23 BL-ONE424 red seen (lane red.out, rc=1, 13 failed | 49 passed): T1 'expected [ Array(5) ] to deeply equal []', T2 'expected [] to deeply equal [ …(6) ]', T4 'FAIL_AT=mcbylaws-gate: expected [] to deeply equal [ 'mcbylaws-gate' ]', T5 'expected +0 to be 1'; T3 green (not in the failed list); the moved pins red on the absent list. Build: .husky/pre-push-checks.sh (the plan's exact text), .husky/pre-push line 41 replaced by the plan's five lines, step-validate.mjs PRE_PUSH_HOOK_PATH and error text and doc comments, CLAUDE.md:33 phrase. Status stays RUNNING (protected path in this commit; check-lane-close.mjs:35).
<!-- SECTION:NOTES:END -->
