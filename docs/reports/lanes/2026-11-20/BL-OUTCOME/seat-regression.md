# Regression Guardian seat, task-399 (launch f1acea964..a7d7b8cdd)

Counts: CRITICAL 0, HIGH 0, MED 0, LOW 3, NIT 1.

## Findings
rg#1 LOW scripts/analysis/backlog-brief.mjs:171 "--final-summary \"<what landed, commit sha, hook result>\" --append-final-summary \"<the outcome block ...>\" -s BUILT" — the old Close line ended "-s DONE|BUILT" and the pin accepted "-s DONE"; both are gone. DONE is still a finished status (check-lane-close.mjs finished default BUILT/DONE/MERGED, board table decides), so a lane that closes DONE is still checked; only the brief no longer offers it. No other file greps "DONE|BUILT" (grep over scripts, src, docs/specs, .claude: none). Smallest restore: "-s BUILT (or DONE for a non-build task)" if non-build tasks are ever launched through this brief; else none.
rg#2 LOW scripts/analysis/backlog-brief.mjs:171 "--final-summary ... --append-final-summary" — --final-summary replaces the field; a second review round launched through this brief overwrites the earlier round lines on the task page. The check still counts N from the HEAD copy (headText, check-lane-close.mjs mv.headText), so the gate holds, but the earlier round lines are lost from the page. Smallest restore: tell round 2+ to use only --append-final-summary.
rg#3 LOW scripts/analysis/backlog-brief.mjs:166 "If the task's Implementation Plan field already holds a plan ... do NOT run --plan" — before: every lane ran --plan "<numbered steps>" as step 2, which overwrote the plan. Now a pre-planned task keeps its reviewed plan (this is the intent). Nothing in scripts/hooks or scripts/analysis relied on --plan having run (grep: none outside this file). A lane already running keeps the brief it was given, so nothing it relied on changes. Residual: "already holds a plan" is the lane's own reading, with no machine check. Smallest restore: none needed; optional wording "a non-empty Implementation Plan".
rg#4 NIT scripts/hooks/check-lane-close.mjs:654 "const abs = path.resolve(dir); ... fs.readdirSync(abs)" — new CLI only: a nonexistent lane dir throws an uncaught ENOENT (exit 1 with a stack) instead of a refusal line. Not an existing behaviour. Smallest fix: try/catch printing "no lane dir".

## (1) Deleted or altered lines, and the existing tests
Non-test deleted or altered lines (all 5 in scripts and 1 in the test list; the numstat has only these deletions in code):
- check-lane-close.mjs old inline verdict loop (const verdicts = new Map(); for ... VERDICT.exec ...) replaced by parseVerdicts(g). Body is character-identical (same VERDICT regex line 50, same replace of backtick and asterisk, same last-line-wins Map.set, same fields). Guard (task-410 verdict parse) holds. Verified by diff text.
- moves.push({... status }) gained headText. Additive field; nothing else reads moves differently.
- closeErrors call gained facts and headTaskText. Additive keys.
- last line: process.exitCode = check(process.argv[2]) became argv[2] === '--outcomes' ? outcomesCli(argv[3]) : check(argv[2]). See (2).
- README.md:109 step 2 and the generated rule-lists-by-kind.md (6 char-count rows regenerated for the two grown spec files): the README keeps the DeepSeek-lens sentence and the A5/Integration sentence; "KEEP or REJECT" is replaced by "CONFIRMED, REJECTED or CONFLICT" (matches the VERDICT regex words at check-lane-close.mjs:50, which never accepted KEEP) and TRIAGE.md/GROUNDER.md file names. That is a correction of a wording that was already out of step with the check, with no dated note (see rg in (4) below, not a regression).
- Task file backlog/tasks/task-399...: 2 deleted lines (updated_date stamp and the "Validated before writing by a separate read-only grounder" paragraph tail). This is the lane's own task, not shipped behaviour; the validation sentence is lost from the task text. Not rated.
Existing tests: the test diff has 5 deletions and no assertion line changed. Altered lines are all fixture builders: body() gained an optional second parameter defaulting to FINDING (same output for old callers); the TASK writer wrapped in a template string that appends nothing unless priorRound; OTHER likewise (status defaults to RUNNING); the two lens-output lines pass o.finding (undefined gives the default FINDING). New fixture code adds a decision file, TRIAGE.md and a Final Summary block to every default close, derived from the GROUNDER.md the test built. Every old test whose expectation is "refused with /re/" still asserts the same regex. Verdict: the 18 red tests were fixture updates (a valid close now needs TRIAGE.md, a Final Summary and a decision file), not loosened assertions. Residual risk (not a finding): an old refusal test that matches a broad regex could now be satisfied by an added outcome refusal; the fixtures are built to pass the outcome check, so the added refusals do not fire on the default path, and the control test asserts status 0 for the default close.
The brief test: toMatch(/-s DONE\|BUILT|-s DONE/) replaced by four pins (--append-final-summary, -s BUILT, check-lane-close.mjs --outcomes, do NOT run --plan). One weaker-in-form change: no pin for DONE (rg#1 LOW); the other assertions on that test remain.
The grounder block was not extracted into a new file; it is the parseVerdicts export, equal to the inline loop.

## (2) Early returns and ordering
- closeErrors: the new block is the last statement before "return errors" (line 486 vs 488), after the per-finding verdict loop, inside if (build). All earlier returns (lines 321/323 no lane assignee, 326/327 table errors, 335, 350 no TASK dir, 443 non-build without findings, 445 missing GROUNDER.md) are untouched and precede it, so they still return before any outcome work. The block uses errors.push(...), never return; an existing error is never overwritten or dropped.
- Scope: build or fix tasks only. A check-type task with lens findings goes through the older path and gets no outcome check (by design in the spec note; not a loss).
- Ordering: lens, Ruled and verdict refusals are appended first, outcome refusals after; on a lane with an earlier refusal the Final Summary check is skipped (summary && errors.length === 0 inside outcomeErrors, where errors is the local array only, so an earlier closeErrors refusal does not suppress it and does not need to). No refusal turned into a pass.
- Callbacks cannot throw out: call() catches. A missing i.facts gives a refusal line per id rather than a pass.
- Hook entry: .husky/commit-msg line 7 runs node scripts/hooks/check-lane-close.mjs "$1". argv[2] is the .git COMMIT_EDITMSG path, never the literal --outcomes, so the hook still goes to check(). Old-versus-new comparison (scratch old.mjs from git show f1acea964 against the branch file, same import resolution): old exports BOARD_REFS, chunkErrors, closeErrors, lensContexts; none missing in new; new adds gitFacts, lensKindOf, outcomeErrors, outcomesCli, parseVerdicts, seatLines. check() itself differs only in the headText field and the facts and headTaskText arguments. All fail-closed paths in check() (board ref unreadable, H1 board keys, H10 renumbered task) are outside the diff hunks.
- CLI differences from the hook (by design): no Final Summary check, reads disk not the index, L found from the board by -S@lane-<dir>.

## (3) Brief generator
Before: step 2 always told the lane to run --plan "<numbered steps...>" (overwriting any plan); Close was "--check-ac <n> ... --final-summary ... -s DONE|BUILT". After: step 2 keeps an existing reviewed plan (the plan-first flow where the plan was reviewed, ruled and checked before launch) and runs --plan only for a task with none; Close adds --append-final-summary with the outcome block, fixes the status at BUILT, and names the --outcomes command. A lane launched tomorrow is told to build the stored plan and to put outcome lines in TRIAGE.md first. A running lane's brief is already in its context; the close check is the only thing that changed under it, and the gate it now meets (TRIAGE.md, Final Summary) is not in its old brief: a lane running now with a CONFIRMED id will be refused at close until it adds them (intended by the lane, but a running lane has no instruction; refusal text prints the exact form that passes and the block). See rg#1 to rg#3.

## (4) README and spec notes
- 08_agents.md: +1 line only (rule 6 dated note 2026-11-20, "M-246, prior text kept", operator verbatim with MORNING-DECISIONS lines :1580 and :1517, both quotes found in the file at those lines). No existing line removed (numstat 1/0).
- 137_mcqueue.md: +2 lines (dated note plus blank). States "Rule 3 (the two-commit close) is otherwise unchanged", consistent with the task-410 correction note and the Rule 3 amendment; nothing contradicted.
- README.md: one line changed, see (1). The change has no dated note; the README convention for prior text was not the M-246 form, so NIT-level only; not raised as a finding.

## Verified preserved
- the verdict parser (identical body, now exported as parseVerdicts)
- every refusal and early return in closeErrors before the grounder block (lines 321 to 445 untouched)
- the Ruled: line sha and finding-count check, the cited-line and boilerplate (more than 3 occurrences) checks, the same-agent grounder clash checks
- H1 board-sourced keys, finished_statuses default, H10 renumbered-task refusal, null-board-copy refusal, protected-path and diff-pin code (outside every hunk)
- hook entry argument handling for .husky/commit-msg
- all prior assertions in check-lane-close.logic.test.ts (only builders touched)
- prior text of 08_agents.md and 137_mcqueue.md (additive only)

## UNVERIFIED
- No test run (no runner allowed); the 18-red-then-green claim rests on the diff and lane report only.
- git log -L history of each task-410 round (H1 to H10) was not replayed line by line; hunks outside the diff were taken as untouched by numstat and hunk headers.
- Whether any older test passes only because a broader regex now matches an added refusal was not run.
- Whether the Implementation Plan field is empty or filled for lanes launched under the old flow was not checked against the board.
