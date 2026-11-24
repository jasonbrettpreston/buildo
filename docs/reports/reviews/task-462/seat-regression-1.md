# Seat: regression: task-462 plan (PLAN-462-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head a12d535f5 (wf2/board). Read: backlog/tasks/task-462 card (description and the whole PLAN-462-v1), GROUNDER-PHONECHK.txt (the part the tool output showed; the middle of the file was cut off in my output, so UNVERIFIED for what I did not see), MD:1209-1214 and :2378-2394, .husky/pre-push, .husky/pre-push-checks.sh, `git log` on both files and on src/tests/hooks-composition.infra.test.ts, `git show 0c948a01d` (task-424), the task-424 card, docs/reports/reviews/task-424/seat-regression-1.md (titles), step-validate.mjs:1285-1312, CLAUDE.md:30-34, spec 98 section 5, and the greps named below. I ran no hook, no runner, no model. I checked the 20 worktrees by reading the plan's count only, not by listing them (UNVERIFIED).

History answer. `.husky/pre-push-checks.sh` has ONE commit, 0c948a01d (2026-11-23, task-424 STATION.ONELIST, RR-0370 option C, operator: "one list of push checks kept in the repo, used by both the hook and the station"). Before it, the six checks were one `&&` line in `.husky/pre-push`. The station kept its own copy, and the copies drifted: the push of 0f6ba8225 was refused after the station suite passed, because the station lacked the McBylaws gate. The "six plain lines" pin (hooks-composition :524-525, T2 LIST_LINES, T4 STEP_NAMES) is what keeps the hook and the station from differing again. It is not a ceiling on the number of checks. The card says "No new check" for task-424 only.

Checked and clean
- Both callers still run the same list. Adding two lines to the one file changes the hook and the station together (pre-push:42-45 sources it, and so does station.sh:45 per the plan). The protection task-424 bought, "they cannot differ", is kept.
- The pin strength is kept or raised. T2 compares the exact text of each line (`expect(lines).toEqual(LIST_LINES)`) and checks the `&&` ending. T4 loops every name in STEP_NAMES and shows each stops the chain. Both stay exact with 8 entries.
- The rest of task-424's locks are untouched by the new lines. T1 (the hook has only the four runner lines) is unchanged. T5 (each fork assignment appears once; `parseForkCapFromHookText`, step-validate.mjs:1297-1303) is unchanged, because the new lines carry no `VITEST_*_FORKS`. The no-comment rule from task-424 seat rg#3 holds only if open choice 1 stays "none". Keep it so.
- The string pins the plan names are not tripped. "npm --prefix mobile run test:ci" does not contain "npm run test" (:564 and :160 count that exact string). `invokesFullSuite` (:49-52) looks for `npm run test` or `vitest run`. `CHECKS` in T1 reads only PRE_PUSH, not the list.
- The gate stays first. The new lines come after `typecheck` and before the suite, so the McBylaws gate (reads stdin, asks the operator) is still ahead of everything. The ask still precedes the long steps.
- The protection of the path stays. `.husky/*` is protected, and an edit to the list is shown to the operator at push (task-424 plan section 3: protected-paths.json:51, HARD_FLOOR). Turning the steps off later goes through the same ask.
- The settled points are followed: two plain lines, phone typecheck included, off = remove the lines, no station.sh edit. RR-0462 (MD:2390-2392) and RR-0460 (MD:2381-2382) say what the plan quotes.
- Scheduled or automated pushers: `crontab -l` says "no crontab"; my grep of scripts/ and .github/ for `git push` or `station.sh push` found no pusher (test files excluded). I did not read ~/Library/LaunchAgents beyond that grep (no hit; the directory may not exist). The plan's "Only the operator pushes" is not sourced in the plan, but I found nothing against it.
- The old gate text is not silently left false: CLAUDE.md:33 says "pre-push runs the FULL `npm run test`". That stays true (the suite still runs). The plan adds a dated line after it. MD:1212 ("no station change") is a record of a past ruling, and RR-0462 (MD:2392) already says it replaces that line for the gate list. Nothing to edit there.

## rg#1 MED: pre-push stays red for every push until task-461 is folded, and the plan does not name what a push before that point does
Plan: section 6 "Lands only after task-461 is folded"; section 8 "Order: task-461 folded, then this card".
Evidence: task-461 card status line is `status: BUILT` (not folded); the plan itself says lotForm.test.ts:71 is red until then. The new `mobile-tests` step runs on every push, including docs-only and pipeline pushes, because the list has no path filter (checks in pre-push-checks.sh:7-12 are unconditional).
Fix: add one line to the plan's sequencing: 462 must not be folded or pushed ahead of 461, and the build proof R3 must be run on a base that holds the 461 fix. The plan already has most of this; the gap is only that nothing blocks a wrong order at fold time.

## rg#2 MED: pushes from the 20 unlinked worktrees stop at mobile-typecheck AFTER the McBylaws gate has already asked the operator
Plan: section 4 (3)/(4) "the push stops loudly at mobile-typecheck"; section 6 "cannot push through the hook until they are linked".
Evidence: .husky/pre-push-checks.sh:8 `step mcbylaws-gate ... $GATE_MODE &&` is first and is interactive (the hook sets GATE_MODE=--push). The new lines sit after `typecheck`, so the operator answers y at the gate, then the web checks run (step-validate --all --fast, spec-split, typecheck), then the push dies at mobile-typecheck. The plan's claim that tsc exits non-zero when `expo/tsconfig.base` cannot resolve was read, not run (plan section 9 says the same). On the station the refusal is earlier (station.sh:32, per the plan), so it only costs the hook path.
Fix: say so in the plan's section 6, and add one line to the CLAUDE.md note ("a worktree without the mobile/node_modules link cannot push until linked"). No code change needed.

## rg#3 LOW: one spec line that lists the pre-push contents is not in the plan's file list
Plan: Files line (4 files); section 7 notes.
Evidence: docs/specs/00_claude_code_operating_model.md:305: `| **Husky pre-push** | step-validate --staged/--all --fast, spec-split-check, typecheck, then the FULL npm run test at 8 forks (R-CQ). | All | ~2-3 min (suite 68 s) |`. It names the steps one by one and gives a time. After this card the row omits the two phone steps (it already omits the McBylaws gate), and the +10-20 s is not in it. Other statements (CLAUDE.md:33, 132_step_standard_handbook.md:448 "The full suite runs at pre-push") stay true.
Fix: either add :305 to the card's Files with one dated clause, or record in the plan that the row was read and left, because it was already incomplete. The "nothing added the card did not name" rule (124a :988, DoD #8) means the choice should be written down.

## rg#4 LOW: the 8-step list changes what "a green push station" means for AC #1, and the pass file does not show it
Plan: section 4 (3) "The pass file (:48) does NOT list steps".
Evidence: the plan's own reading of station.sh:48. After this card a station PASS includes the phone result, but only steps.log in the run folder proves it. A future reader of a pass file cannot tell a pass from before the card from one after it.
Fix: none in the repo (station.sh is out of scope, settled). Add to the card's evidence note that the pass of record must cite the run folder's steps.log with both new `rc=0` lines.

## rg#5 LOW: node 24 locally against node 20 in Mobile CI is a new way for the local gate and CI to disagree
Plan: section 6 "Node 24 locally vs node 20 in Mobile CI" and section 9.
Evidence: GROUNDER-PHONECHK.txt (as shown) says the 8 s run was on node 24 and passed 865 of 866 at that time, and that CI uses node 20 (mobile-ci.yml:26). So a green local push does not imply a green Mobile CI run. RR-0460 row 2b already requires "the Mobile CI run after it", so the old second check stays, and the new step only adds an earlier one.
Fix: none needed; the plan states it. Keep the UNVERIFIED mark.

## rg#6 LOW: other open work that touches the same text
Plan: section 8.
Evidence: task-463 (status LATER) edits spec 98 section 5 (:118-119, the `npm run lint` line), and 462 adds its note after :123. The plan already says to land them one after the other. The branch `wf2/inc1b-proc460` exists (task-460, rule-lists files, not the .husky files). I did not diff it, so UNVERIFIED that it avoids hooks-composition.
Fix: none beyond the plan's own ordering line.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 2 MED, 4 LOW); no existing guard is weakened (task-424's lock keeps every protection), the real costs are an ordering dependency on task-461, a late stop for unlinked worktrees, and one unlisted spec row.
