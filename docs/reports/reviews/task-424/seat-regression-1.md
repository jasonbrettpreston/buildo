# Seat: regression: task-424 plan (PLAN-424-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 77d54ecc7. Read: every site in hooks-composition.infra.test.ts that reads PRE_PUSH (lines 26, 98, 99-104, 139-143, 145-148, 150-157, 167-174, 481-490, 501-505); the fork-cap test whole; step-validate.mjs :1285-1330; install-hooks.infra.test.ts :30-110; grep of src/tests, scripts/ and docs for the hook text.

Coverage check (answer to "name every existing test the plan missed"): the plan's move list names every PRE_PUSH reader in hooks-composition. The sites are :98, :99-104, :139-143, :145-148, :150-157, :167-174, :481-490, :501-505, and the plan names all of them. The other tests that read hook files read only pre-commit (hook-partial-staging, spec133-bylaw-handbook) or hook names (install-hooks :35 and :90-110, which use a temp repo; hooks-path-guard). I found no existing test the plan missed. The weakening below is in the new pins, not in a missed test.

## rg#1 HIGH: the gate step and the suite step can be deleted from the chain with every pin still green
Plan: "These are moves, not removals ... so no pin is weakened." Also "(:481-485 (count of `${GATE} --push` is 1 in the list, before `--staged --fast`)" and ":487-490 (tamper `/node scripts\/analysis\/mcbylaws\/gate\.mjs --push; /`)".
Evidence: in the plan's text, `node scripts/analysis/mcbylaws/gate.mjs --push` and `VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test` appear only in the function bodies `mcbylaws_gate` and `full_suite`. The chain lines `step mcbylaws-gate mcbylaws_gate &&` and `step suite full_suite` are not pinned.
What goes wrong: delete either chain line and these still pass: count of `--push` = 1, gate before `--staged --fast` (:481-485); `invokesFullSuite` true (:150-152, the text is still in the function); the fork regex (:98). The old pins failed when the gate or the suite left the hook's executable line. The gate (first, reads stdin) or the full suite can silently stop running at push. The old tamper pin :487-490 removed the real `&&` link; the new one removes a function branch.
Smallest fix: pin the chain lines themselves: six `step <name> ...` lines in order, ending `step suite full_suite` with no trailing `&&`; plus tamper pins that remove each of the gate and suite chain lines.

## rg#2 MED: the `&&` continuity of the chain is no longer pinned
Plan: T2 uses indexOf of substrings; the tamper regex for :171-174 becomes `/step step-validate-all node scripts\/analysis\/step-validate\.mjs --all --fast &&\n/`.
Evidence: the old pins match `&& node ...step-validate.mjs --all --fast` and `node ...gate.mjs --push && `. They bind a command to the `&&` that links it to its neighbours. Only the one step-validate-all line keeps such a pin.
What goes wrong: change one `&&` to `;` (or `||`) at the end of any other chain line. A failing gate or typecheck no longer blocks the push, and no pin changes. T5 only fails the gate step.
Smallest fix: in T5 loop over each of the six steps, failing it in turn and asserting exit 1 and that no later fake call is logged; or pin each line's trailing `&&`.

## rg#3 MED: a fork assignment inside a comment in the list silently changes the cap
Plan: "scripts/analysis/step-validate.mjs parses it from THIS file, so no comment here may carry a fork assignment." and "The fork assignment appears exactly once. That keeps ... the first-match parse (step-validate.mjs:1300-1306) honest."
Evidence: step-validate.mjs:1301-1302 run `/\bVITEST_MIN_FORKS=(\d+)\b/.exec(...)` on the whole text, comments included, first match wins. The existing pins check `stripComments(...)`, so they cannot see a comment match.
What goes wrong: a later comment or edit above the real line (for example `# was VITEST_MAX_FORKS=2`) changes the default cap while the pins stay green. The plan relies on prose.
Smallest fix: add a pin that `parseForkCapFromHookText(PRE_PUSH_CHECKS)` equals the cap parsed from `stripComments(PRE_PUSH_CHECKS)`, and that the full text holds each assignment once.

## rg#4 LOW: the hook-level "exactly once" pin loses its meaning
Existing title (:150) "invokes the full suite exactly once per push" only asserts `invokesFullSuite(...)` is true. After the move the hook no longer runs it, and T1 asserts `checksIn(PRE_PUSH)` is `[]`. The list's `invokesFullSuite` is true through the function body even without a call (see rg#1).
Smallest fix: assert the count of `npm run test` in the list's executable text is 1 and that the `step suite` line exists.

## rg#5 LOW: the fork-cap test's fixtures keep their purpose, but its red state is a crash
The plan keeps :52-53, :58-60, :86 and :93 and changes the path at :33. The red run of that file is an ENOENT at import, not the assertion (see rc#3). No assertion is dropped.

## rg#6 LOW: adding `--staged --fast` to the station changes what the station tests
- On a clean station worktree the index is empty, so `--staged` falls back to `git diff HEAD~1 HEAD` (step-validate.mjs gitStagedFiles). The station now judges only the LAST commit's files, as the hook does at push time. This matches the hook, which is the point.
- Effects: a tip whose last commit changes a step with a red score is now a station FAIL where it used to PASS. A merge HEAD diffs against its first parent only, so a large set can be selected. A close-out commit that changes only the task file selects nothing.
- The 19 existing pass files are not invalidated. Behaviour of the other steps is unchanged.
Smallest fix: none; state the effect in the lane report.

## rg#7 LOW: output and process shape change in the hook
The hook now prints `== name` / `   rc=N` lines and nests an `sh` process. I found no test or script that reads the hook's output or its process tree. The exit status is the chain's (checked), and stdin still reaches the gate first.

## rg#8 NIT: header comments in `.husky/pre-push` lines 2-40 now describe checks that run in another file
The plan keeps lines 1-40 for history. The H6 test (shebang `#!/bin/sh`, mode 100755) is unaffected, and nothing pins those comments. Prose in the hook (for example "runs HERE") becomes stale.
Smallest fix: one added line in the hook comment pointing to the list (the plan's new comment line does this).

Checked and kept: the R-CQ never-above-10 pin (:99-104) keeps its PRE_PUSH member and adds the list; the no-skip-word pin (:501-505) matches the one line holding both `--push` and `--ci` and finds none of SKIP, BYPASS, MCBYLAWS_, HUSKY=, --no-, or `|| true`; the fork-cap tamper pins (:145-148, :154-157) stay valid on the list text; install-hooks tests are unaffected.

UNVERIFIED: that no other doc-reading test pins the sentence at CLAUDE.md:33 (grep of tests that read CLAUDE.md found none that matches "source of truth"); that step-validate --all --fast ignores comment edits in step-validate.mjs.
