# Seat: integration: task-462 plan (PLAN-462-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head a12d535f5 (wf2/board). Read: the whole task-462 card, RR-0462 and RR-0460 (MD:2380-2393), GROUNDER-PHONECHK.txt (size only), .husky/pre-push, .husky/pre-push-checks.sh, push-station/station.sh, src/tests/hooks-composition.infra.test.ts (:30-50, :100-110, :140-185, :490-610), step-validate.mjs:1285-1320, mobile/package.json, mobile/tsconfig.json, .github/workflows/mobile-ci.yml, CLAUDE.md:28-36, Spec 98 :113-138, task-463 card, npm 11.19.1 lib/commands/run.js and exec.js, jest-cli, yargs-parser. docs/reports/reviews/task-462/ held only context-r1.md, so there was no FINDINGS-PLAN.md to deduplicate against. I ran no test runner, hook or station. Two small read-only node -e checks: the yargs-parser one below, and a grep of jest-cli's arg types.

Checked and clean:
- Plan line cites match the files. checks.sh :7-12 (suite last, no `&&`). pre-push :42 `step() { shift; "$@"; }` and :45 the source line. station.sh :19, :32, :37, :41, :45, :46, :48, :66. mobile/package.json :11-12 and the jest block starting :82. hooks-composition :524, :541, :544-552, :559, :575. CLAUDE.md :33 is item 5; :32 is item 4. Spec 98 :118 is the lint line, :123 the last line of section 5, :125 is "## 6".
- Command strings:
  - run.js :44 is `#run(args, { path: this.npm.localPrefix })`, so `npm --prefix mobile run` executes in mobile/.
  - exec.js :51 is `runPath = process.cwd()`, so the grounder's `npm --prefix mobile exec -- jest` would have run at the repo root. The plan's correction is right.
  - jest-cli 30.3.0 types ci (:102), coverage (:137) and silent (:429) as boolean.
  - I ran `yargs-parser` 21.1.1 on `['--coverage','--ci','--coverage=false','--silent']` with those booleans. It gave `{"coverage":false,"ci":true,"silent":true}`, so the last value wins and no coverage is written.
  - Arguments after `--` reach the script unchanged. `--coverage=false` and `--silent` are not eaten by npm.
- The test pins hold with the new lines.
  - T2 counts "npm run test" once. `npm --prefix mobile run test:ci` does not contain that string (:560-564, :160).
  - :150 still finds `npm run typecheck`. The `invokesFullSuite` regexes find no "vitest run".
  - T5 and `parseForkCapFromHookText` read only VITEST_MIN/MAX_FORKS (step-validate.mjs:1300). The new lines carry none.
  - The gate-line scan (:513-518) looks for GATE, GATE_MODE= and SUITE_ARGS=. The new lines carry none of them.
  - T3 (noGate, semicolon) and T1 are unaffected. T4 is hermetic: it stubs step() and loops STEP_NAMES, so the longer list is covered by the planned edit.
- No other reader of the list. Grep across src, scripts, .husky and .github finds only hooks-composition, step-validate.mjs (fork cap) and station.sh. install-hooks.infra.test.ts only checks that the hook files exist.
- Hook path: step() runs the command from the repo root, and the gate step is first, so it still reads stdin before anything else. Station path: step() writes `== <name>` and `rc=` to steps.log and the output to `<name>.log`. Neither the hook nor the station gets a pass file entry per step, as the plan says. AC1 is read from steps.log.
- Root `typecheck` is not duplicated. The root tsconfig.json:27 excludes "mobile".
- Coverage: root .gitignore:12 is `/coverage`, anchored to the root, and mobile/.gitignore has no coverage entry. So `--coverage=false` is needed, and the plan says so. No .snap files exist under mobile.
- A worktree with no mobile/node_modules link:
  - The station refuses it at :32 before any step.
  - On the hook path, ~/Buildo/node_modules has `.bin/tsc` and no `.bin/jest`, and no `expo` folder. `tsc` therefore fails on the `expo/tsconfig.base` extends and the push stops at mobile-typecheck. It is not a silent pass.
  - mobile/node_modules here is a symlink to ~/Buildo/mobile/node_modules. tsc excludes node_modules by default (mobile/tsconfig.json has no exclude).
  - The plan's survey (136 linked, 20 not, none without a mobile/ folder) is consistent with the 156-line worktree list. I did not re-run the per-folder survey.
- CLAUDE.md and Spec 98 edits: no test or script pins their line numbers or lengths. Spec 98 is 138 lines and the added note is 2 lines. I found no per-file size cap for it in spec-split-check.mjs.
- task-463 clash:
  - Its card lists the same file, Spec 98, and says "Not planned yet; after PROC.PHONEGATE". Its edit is the lint line at :118. The plan's note goes after :123, so the two touch adjacent lines of section 5 and not the same line.
  - The plan's ordering advice (land one then rebase the other, and 463 must not drop this note) is sufficient.
- RR-0462 text: the plan quotes the operator's words and marks "off means removing the two lines" as the orchestrator's reading, as MD:2392 does.

## in#1 LOW: the CLAUDE.md dated line states "off = remove those two lines" as plain rule text
Plan: Section 7, CLAUDE.md line: "...after `typecheck` and before the web suite; off = remove those two lines."
Evidence: MD:2392 marks it: "Orchestrator's readings, not his words: "off means removing the two lines"". The plan itself repeats this in section 2. The same sentence also sits in CLAUDE.md, a rules file the agents read as operator text. The Spec 98 note, by contrast, quotes the operator verbatim and carries no "off" clause.
Fix: reword the CLAUDE.md line to "off = remove those two lines (orchestrator's reading of RR-0462)" or drop the clause there. Alternatively leave it and accept the card's own wording; the risk is low.

## in#2 NIT: the failure message in an unlinked worktree is a tsc error, not a plain "missing link"
Plan: Section 4, point (4): "tsc exits non-zero, and the push stops loudly at mobile-typecheck".
Evidence: .husky/pre-push has no link check and the new line adds none (station.sh:32 holds the only check). The first output the operator sees is a tsconfig error about `expo/tsconfig.base`, not the link message. The stop is real.
Fix: none needed. If wanted, say in the CLAUDE.md line that a TS5083 or missing expo/tsconfig.base error on this step means the mobile/node_modules link is missing. Do not add a check script (RR-0392).

## in#3 NIT: the plan's npm source line cites are approximate
Plan: Intro: "`lib/commands/run.js:44`, `path: this.npm.localPrefix`" and "exec.js sets runPath = process.cwd()".
Evidence: run.js:44 is correct. exec.js sets it at :51 inside callExec, as a default when no runPath is passed.
Fix: none. The conclusion stands.

UNVERIFIED (no run allowed):
- Neither new command was run, so the no-write claim and "58/58 suites" rest on the grounder's evidence file, which I did not open.
- `tsc --noEmit` in mobile/ exiting 0.
- Whether the "worker process failed to exit gracefully" warning keeps the exit code 0.
- Node 20 parity.
- The `no-such-test-path` exit code.

STATUS: 3 findings (0 CRITICAL, 0 HIGH, 0 MED, 1 LOW, 2 NIT); the plan matches the real codebase, the command strings and the test pins hold, and only wording nits remain
