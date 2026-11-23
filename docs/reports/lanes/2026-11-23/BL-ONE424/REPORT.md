# REPORT: BL-ONE424 (task-424 STATION.ONELIST), stage 1 build

1. What changed: the six non-interactive pre-push checks now live in one file, .husky/pre-push-checks.sh (the plan's exact text); .husky/pre-push runs none itself and only sets step(), GATE_MODE=--push, SUITE_ARGS= and sources that file; step-validate.mjs reads the fork cap from the new file; CLAUDE.md:33 names it.
2. Acceptance printed: A1 green through the real pre-commit related run (commit.out "Test Files  8 passed (8)", "Tests  137 passed (137)", rc=0); A2 printed 0; A3 printed 0 and 6.
3. Could not be built as the plan says: nothing; every plan sentence for the lane was built as written.
4. Unverified (not the lane's items): A4 full suite, A5 station edit checks, A6 station suite, A7 and A8 gate replays at 0f6ba8225 and 21adfde8a, A9 the operator push. They wait for the orchestrator and the operator (plan section 9).
5. Output review round 1 ran (11 DeepSeek outputs, 40 finding lines: 5 HIGH, 18 MED, 16 LOW, 1 NIT), listed untriaged in FINDINGS.md; the task stays RUNNING, grounder owed (RR-0359).

## Commits (wf1/inc1b-one424b, worktree ~/Buildo-wt-one424b, no push)
- 0c948a01d feat(124_step_standard_policy): task-424 one pre-push check list in the repo (RR-0370 option C). Build commit: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, the fork-cap test (glob src/tests/step-validate-*-fork-cap.infra.test.ts), CLAUDE.md, the task file. Status left RUNNING (protected path in the commit; check-lane-close.mjs self-edit rule). Hook tail: commit.out "rc=0".
- 0815f45aa docs(08_agents): task-424 output review round 1 records. Review inputs and outputs, TASK, FINDINGS.md, context-r2.md and context-r3.md, the task notes.
- A third records commit carries this REPORT.md copy and the --add-ref.

## Red first (red.out)
A commit attempt with only the two test files and the task file staged; the pre-commit related run refused it: "Test Files  2 failed (2)", "Tests  13 failed | 49 passed (62)", "rc=1". Each new case failed at its designed assertion, not at typecheck (npm run typecheck was clean before the attempt):
- T1: "AssertionError: expected [ Array(5) ] to deeply equal []" (checksIn of the old hook: line 41 ran all checks).
- T2: "AssertionError: expected [] to deeply equal [ …(6) ]" (list absent).
- T4: "AssertionError: FAIL_AT=mcbylaws-gate: expected [] to deeply equal [ 'mcbylaws-gate' ]" (list absent).
- T5: "AssertionError: expected +0 to be 1" (list absent).
- T3 green (not in the failed list), as the plan says (it proves the predicates).
- The moved pins were red on the absent list (the R-AG pre-push cases, the MB-67 gate --push case, the fork-cap :52-53 case). The fork-cap cases at :86 and :93 (assertions unchanged, as the plan says) failed red on parseForkCapFromHookText's own "could not parse" refusal (red.out line 987, step-validate.mjs:1304), the designed fail-closed contract; their assertions were not edited.
- No test the plan lists as unchanged went red in the green run: install-hooks.infra.test.ts was not touched; the green run passed every case of both named files (commit.out " ✓ src/tests/hooks-composition.infra.test.ts (54 tests)", the fork-cap file "(8 tests)").

## Built as the plan says (file:line)
- .husky/pre-push-checks.sh:1-12: the plan's exact text, six chain lines; the fork assignment occurs once (T5 green).
- .husky/pre-push:41-45: the plan's five lines replace old line 41; lines 1-40 unchanged.
- scripts/analysis/step-validate.mjs:1290 PRE_PUSH_HOOK_PATH is '.husky/pre-push-checks.sh'; :1304 error text names .husky/pre-push-checks.sh; doc comments :1294, :1313, :1317, :1323 say "the pre-push check list". No logic change.
- CLAUDE.md:33: the plan's phrase, exactly.
- src/tests/hooks-composition.infra.test.ts: the new describe "task-424 — one list of pre-push checks" (T1-T5) and the ten pins moved from PRE_PUSH to PRE_PUSH_CHECKS (the plan's :98, :99-104, :139-143, :145-148, :150-157, :167-169, :171-174 with the new tamper regex, :481-485, :487-490, :501-505).
- fork-cap test: path '.husky/pre-push-checks.sh' with the existsSync guard; titles and comments reworded; assertions at :52-53, :58-60, :86, :93 unchanged.
- Not edited: ~/Buildo-scratch/push-station/station.sh (outside scope; the orchestrator's plan section 4 edit).

## Acceptance (pasted on the task with --append-notes)
- A1 (lane): run only through the real pre-commit hook (the brief forbids a direct runner call): green, above.
- A2: `grep -v '^#' .husky/pre-push | grep -cE 'gate\.mjs|step-validate|spec-split|npm run'` -> 0.
- A3: `sh -n .husky/pre-push-checks.sh; echo $?` -> 0; `grep -cE '^step ' .husky/pre-push-checks.sh` -> 6.
- Extra: the hook's step() passes stdin to the command (the gate reads the ref pairs): printf of a ref line piped to `sh -c 'step() { shift; "$@"; }; step mcbylaws-gate cat'` printed the line, rc=0.
- A4: NOT run (a lane never runs the full suite; it runs at the station as A6). WAITS orchestrator.
- A5, A6, A7, A8: orchestrator. A9: operator. NOT run by the lane.

## Output review (round 1, fresh context)
- Ran `node scripts/analysis/backlog-brief.mjs --task task-424 --lane BL-ONE424 --stage 1 --root ... --board ~/Buildo-wt-board`, which wrote context-r3.md; every --context used context-r3.md.
- Diff: the brief's git diff command from the launch commit 90ae889dc to HEAD 0c948a01d, the six Files paths (26473 bytes); the board range 90ae889dc..310eee621 changes none of them (empty stat).
- Compliance once per list (agents-s5-1to3, agents-s7-s11, queue-137, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S), engineering eng-all, code-review and error-paths (lens-input made one part each: -p1). All 11 review runs rc=0. Verdicts: PASS 8, FAIL 3 (five-words, inc-S, plan-protocol).
- FINDINGS.md: 40 finding lines by id, untriaged; no verdicts by the lane. Most HIGH and MED findings name the station side and the replays (A5-A8), which the plan gives to the orchestrator.

## Close check on a throwaway clone (real scripts/hooks/check-lane-close.mjs, task staged BUILT, clone of 0815f45aa with wf2/board at 310eee621)
```
check-lane-close: task-424: the task's references lack the repo copy docs/reports/lanes/2026-11-23/BL-ONE424/REPORT.md: backlog task edit task-424 --add-ref docs/reports/lanes/2026-11-23/BL-ONE424/REPORT.md
check-lane-close: task-424: the task's references lack the repo copy docs/reports/lanes/2026-11-23/BL-ONE424/GROUNDER.md: backlog task edit task-424 --add-ref docs/reports/lanes/2026-11-23/BL-ONE424/GROUNDER.md
check-lane-close: task-424: GROUNDER.md is missing in docs/reports/lanes/<date>/BL-ONE424/ (a build or fix task always needs a separate grounder verdict)
rc=1
```
No refusal names the review material. The REPORT.md ref is added in the third commit; the re-run after it is below. The GROUNDER.md file and ref are owed by the separate grounder.

## Left for the orchestrator
- Launch the grounder on docs/reports/lanes/2026-11-23/BL-ONE424/ (GROUNDER.md with the Ruled lines that rule-lists.mjs findings prints).
- Then resume the lane for fixes and the close commit (records only, status BUILT).
- After the close: the station edit (plan section 4, after the cp backup), A5, A6, A7, A8; the operator's push A9.
