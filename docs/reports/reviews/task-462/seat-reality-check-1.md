# Seat: reality-check: task-462 plan (PLAN-462-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board head a12d535f5 (wf2/board; the plan is in this worktree's staged card copy, and the gate375 copy of the card has no plan section). Files read: the task-462 card; GROUNDER-PHONECHK.txt; MD:1211-1213, 1975, 2202, 2380-2393; .husky/pre-push, .husky/pre-push-checks.sh; hooks-composition.infra.test.ts; step-validate.mjs:1296-1304; step-validate fork-cap test; station.sh; CLAUDE.md:33; Spec 98 s5; both evidence .out files; mobile/package.json, tsconfig, .gitignore (root and mobile). Installed sources under ~/Buildo-wt-gate375/mobile/node_modules (jest-cli, yargs-parser, babel-jest, jest-expo, expo). Local npm 11.19.1 at /opt/homebrew/lib/node_modules/npm. No database used, nothing run except two small node -e checks and read-only git. Neither new command could be run (read-only).

## Checked and clean
- npm exec runs in the current directory. exec.js:50-51 has `if (!runPath) { runPath = process.cwd() }` and :49 has the comment the plan quotes. The `--prefix` flag does not change it. The grounder's command would start jest in the repo root.
- npm run runs in the prefix folder. run.js:44 is `await this.#run(args, { path: this.npm.localPrefix })`. set-path.js walks up from the project path adding each ancestor's node_modules/.bin.
- jest-cli 30.3.0 declares `ci` (index.js:102), `coverage` (:137) and `silent` (:429) as `type: 'boolean'`. yargs-parser 21.1.1 sets `o[key] = value` for booleans. I ran it in memory with `["--coverage","--ci","--coverage=false","--silent"]` and got `{"coverage":false,"ci":true,"silent":true}`. The last value wins, so no coverage is written.
- npm appends the extra arguments after the script text, so `test:ci` becomes `jest --coverage --ci --coverage=false --silent`. The package.json scripts at :10-13 match the plan.
- Nothing else is written into the repo.
  - The jest block (package.json:82-93) has no coverage or cacheDirectory setting. jest-expo has no coverage or cacheDirectory settings either.
  - `find` shows no .snap file in mobile, and no test calls a snapshot matcher. The evidence files print `Snapshots: 0 total`.
  - `*.tsbuildinfo` is ignored at .gitignore:47 and mobile/.gitignore:42. mobile/coverage does not exist now.
  - Root .gitignore:12 is `/coverage`, anchored to the root, so mobile/coverage would be untracked.
  - station.sh:19 `dirty()` forgives only the two node_modules links. :46 turns anything else into "worktree changed during the run".
- Evidence files exist. phone-linked-sfx6-18c760bb5.out shows 58 suites, 866 tests, "Time: 8.544 s" and the worker-exit warning. phone-full-a12d535f5.out shows the same counts and the same warning.
- Pins read at the lines the plan cites:
  - hooks-composition :150, :160, :564, :513-518, :543-552, :559, :575-599 (T4 begins before :575, as the plan states), :601-603 (T5).
  - `invokesFullSuite` at :51: `\bnpm run test\b` does not match `npm --prefix mobile run test:ci`.
  - step-validate.mjs:1300-1301 parse only the `VITEST_MIN_FORKS` and `VITEST_MAX_FORKS` values.
- T4 on the old list: `FAIL_AT=mobile-typecheck` runs every step, so the status is 0 and not 1. T2 fails on 6 lines against 8. The red expectations are right.
- station.sh line cites are all correct: :32, :37, :41, :45, :46, :48, :66. .husky/pre-push:42-45 is correct. Spec 98 :113-123 is correct: lint at :118, the section's last line at :123, "## 6" at :125. CLAUDE.md :33 is item 5.
- task-461 status is BUILT. mobile/__tests__/lotForm.test.ts:71 is a real assertion.
- A worktree without the link:
  - The root node_modules has `tsc` and no `expo/tsconfig.base`, while the gate375 and ~/Buildo mobile installs both have it. So the plain-hook claim holds: tsc fails loudly there.
  - No worktree lacks a mobile/ folder. I counted 0 missing mobile/ folders.
- MD cites 2380-2383 (RR-0460), 1211-1213, 1975 and 2202 are correct.
- task-463 exists and edits Spec 98 :118. task-460 and task-452 exist.

## rc#1 LOW: the worktree counts are right in total but wrong in kind
Plan: section 4, "136 worktrees have the link, 20 lack it".
Evidence: `git worktree list` gives 156 worktrees, 136 where `[ -e mobile/node_modules ]` is true and 20 where it is false. That matches the plan. But of the 136, 3 are real installs (~/Buildo, ~/Buildo-wt-gate375, ~/Buildo-wt-mf35-spike) and 133 are working links. Of the 20, 6 have a dangling link (-L true, -e false): Buildo-wt-binding-std, -cost2, -mf38, -mf54, -navlock, -queue2. Only 14 have no entry. The plan names -navlock and -queue2 as lacking the link, but both hold a dangling one.
Fix: say "133 working links, 3 real installs, 20 unusable (14 absent, 6 dangling)". The station's `-e` test at :32 treats dangling and absent the same, so the behaviour claim stands.

## rc#2 LOW: MD line cites for RR-0462 are each one line early
Plan: section 2, "RR-0462, MD:2391 (operator, verbatim)", "Step 4 as put to him (MD:2390)", "MD:2392 ruled", "MD:2392 ... off means removing the two lines".
Evidence: MD:2390 is the `## ... RR-0462 ...` heading. MD:2391 is "Put to him: the revised phone-checks plan ...". MD:2392 is `Operator, verbatim: "Let's just move forward with the basic quick plan. Approved."`. MD:2393 is `- Ruled (RR-0462): ... Step 4 includes the phone typecheck ...` and carries the orchestrator's-reading text.
Fix: use :2391 for the put text, :2392 for the verbatim, :2393 for the ruled and reading text. The card's own cite of :2392 for the verbatim is correct, so the plan contradicts the card. The RR-0460 cites (:2381, :2382) are correct.

## rc#3 LOW: the "exit stays 0" and "before PASS" claims are not in the evidence files
Plan: section 6, "That evidence file prints 'A worker process has failed to exit gracefully' before PASS. It is a warning and the exit stays 0."
Evidence: phone-linked-sfx6-18c760bb5.out is 399 bytes and holds the warning, then `Tests: 866 passed, 866 total`, `Time: 8.544 s`, `Ran all test suites.` No PASS word and no exit code are recorded (neither file has an rc line). Jest does exit 0 when all tests pass, but nothing here shows it. Also, phone-full-a12d535f5.out says `Time: 2.713 s, estimated 7 s`, so the card's "about 9 seconds" is the first file's 8.5 s only. The second run was cached and fast.
Fix: write "exit code not recorded in either file; the warning is printed before the result block", and keep the plan's "watch the first station runs". Give the timing as 2.7-8.5 s.

## rc#4 NIT: the babel-jest cite does not carry the reason given
Plan: section 1, "babel-jest also takes its cwd from transformOptions.config.cwd (mobile/node_modules/babel-jest/build/index.js:160)".
Evidence: line 160 is `cwd: transformOptions.config.cwd,` inside the istanbul plugin options, with the comment "files outside `cwd` will not be instrumented". It governs coverage instrumentation only, not Babel's config lookup. The exec.js reason (no jest block at the root, so the preset is missing) is enough on its own.
Fix: drop the babel-jest sentence, or word it as "coverage instrumentation only".

## rc#5 NIT: the 124a:988 cite is copied from the card's DoD and points at the wrong row
Plan: section 2, "124a appendix :988 (card DoD #8): 'no change adds a tool, field or rule its card or ruling did not name'".
Evidence: line 988 of docs/specs/01-pipeline/124a_step_standard_policy_appendix.md is row R-IV. The quoted text is in row R-IZ at :992 (`(1) no change adds a tool, field or rule its card or ruling did not name`).
Fix: cite :992. The cite is shared with the card's DoD #8, so fix both.

UNVERIFIED (as the plan also says): neither new command was run; `tsc --noEmit` in mobile was not run; the `no-such-test-path` exit code (expected 1) was read from behaviour only; node 20 parity; "only the operator pushes" was not checked.

STATUS: 5 findings (0 CRITICAL, 0 HIGH, 0 MED, 3 LOW, 2 NIT); every behavioural claim checked is true, and only counts and cites need fixing.
