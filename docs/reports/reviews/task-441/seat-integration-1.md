# Seat: integration: task-441 plan (PLAN-441-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file; no word of the findings below is the orchestrator's.

Basis: board head 18cc2752e. Read: .husky/pre-commit (:1-90) and .husky/commit-msg; scripts/hooks/validate-commit-msg.sh, check-backlog-task.mjs, check-task-files.mjs; mcbylaws/protected-paths.json (frontend and protected lists); scripts/analysis/mcbylaws/gate.mjs and card-cite-check.mjs (headers, grep); src/tests/system-map.infra.test.ts and scripts/generate-system-map.mjs (:100-111); eslint.config.mjs and its resolved config for a src/components/ui file; tsconfig.json; biome.json; vitest.config.ts; package.json lint-staged. FINDINGS-PLAN.md was read and is not repeated.

Verdict: no hook refuses the commits as planned, with one live risk (in#1: the pin and other branches).

Checked, no finding:
- System map: src/tests/system-map.infra.test.ts compares the committed map with `buildSystemMap()`. The generator builds rows from spec text (Target Files sections, and test names found inside spec text, generate-system-map.mjs:100-111), never from a test file's SPEC LINK header. A new test with a `00_engineering_standards.md` SPEC LINK adds no row and trips nothing. This settles the plan's UNVERIFIED and DeepSeek plan-review#2: acceptance #6 (no diff under docs/specs) is safe.
- No test or hook enumerates src/tests files or SPEC LINK paths for new test files: the SPEC LINK regexes found (scripts/analysis/step-validate.mjs:1735, and three steps/*/violations.test.ts) apply to step and compute files, not tests.
- Commit subject `test(00_engineering_standards): ...` matches validate-commit-msg.sh's `^(feat|fix|refactor|test|docs|chore)\([0-9]{2,3}[a-z]?_[a-z0-9_]+\)`. `Task: task-441` is what check-backlog-task.mjs reads (:25-26) and the task file is staged in the same commit.
- Protected paths: src/tests/*.logic.test.ts, src/components/ui/** and docs/reports/reviews/** are in none of `protected`, `frontend`, `layer23` or `literal_scope` of mcbylaws/protected-paths.json. No McFrontend-Task trailer or owner y is needed for the three tests; the plant is never in a landed commit. Arm D (card-cite-check) is not wired to backlog task files in gate.mjs (grep for backlog/tasks in scripts/analysis/mcbylaws finds none).
- The plant passes typecheck and lint, so the red comes from the designed assertions. tsconfig.json: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (the plant's `{ v?: { n: number } }` param is fine), no `noUnusedLocals`, `jsx: preserve`, `lib` has dom (so `alert` and `fetch` type-check). Resolved ESLint config for src/components/ui/Badge.tsx: `react-hooks/rules-of-hooks` on (a hook inside a capitalised component passes), `react/jsx-no-undef` on, `@typescript-eslint/no-unused-vars` warn; no `no-alert`, no non-null rule, no floating-promise rule, `no-console` only. So `void fetch(...)` is harmless but not needed. `next lint` has no `--max-warnings`, and Biome's lint-staged globs (src/features/leads, src/lib/observability, src/app/api) do not match src/components/ui.
- Importing the gate module: mobile-never-do.mjs ends with a guarded `main()` (`path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`), so importing it for SKIP has no side effect; gate-mobile-compliance.infra.test.ts does the same namespace import. (See rc#4: it never reads SKIP itself.)
- Files line vs staged paths: check-task-files.mjs always allows the task file, `docs/reports/reviews/task-441/` and `docs/reports/lanes/`. The commit that lands the work stages three tests, the task file and review records: all covered. The closing commit stages records only and no src, scripts, mobile or migrations file, so check-task-files and check-backlog-task both return early. The red attempt is refused in pre-commit before commit-msg runs, so the plant outside the Files line is never judged by check-task-files (this also settles compliance-ms-S#7). `docs/reports/lanes/` needs no Files entry (answers compliance-agents#7's "path to the Files line" ask for the check-task-files side).
- The `Files:` line parses: `filesEntries` reads the first line; the task file name has no comma or glob character.
- The related run: `.husky/pre-commit:85` pipes every staged `src|scripts` .ts/.tsx/.js/.mjs file (tests included) into the related run, so a staged new test is among the arguments. By reading the hook this runs the three tests; I did not execute it (see UNVERIFIED).

## in#1 MED: the pinned 166 will collide with other open branches when they land; two of them are on the McFrontend surface
Plan: section 8 "Any other lane that adds or removes a `!` in src or mobile turns 3.3 red ... The lander who lands second re-measures and edits the pin in its own commit."
Evidence: I counted undocumented non-null assertions (same rule as the plan) at each unmerged local branch tip against its merge-base with HEAD, over the same scope, for all 163 branches not merged into HEAD. Branches whose in-scope files change the count:
- mf83-daylight +9 (mobile/src/components/surfaces/ReportBinding.tsx +4, src/components/report/ReportPage.tsx +4, src/lib/surfaces/report/core.ts +1)
- wf1/mf83-g3 +10 (same files, plus src/lib/parcels/lot-view.ts +1)
- mf47-checkout +4 (src/app/api/admin/users/[uid]/route.ts +2, src/lib/stripe/parcel-checkout.ts +1, parcel-plans.ts +1)
- wf1/mf37-1109 +1 (src/lib/media/contract.ts), wf1/mf48-1111 +1 (ReportBinding.tsx)
- wf1/inc1b-thinroute -1 (src/app/api/parcels/lookup/route.ts): a fix, but it too turns the exact pin red until lowered.
- wf2/board-move shows -163 (its base is old and its tree differs; treat as noise, not a real removal).
- wf1/inc1b-hb446: 0 in scope (its diff against HEAD touches only src/tests/surfaces/handbook-rule-map.logic.test.ts). 47 of the 163 branches change in-scope files; the rest are zero-delta.
What goes wrong: whichever of the mf83 or mf47 branches lands after task-441 turns the new test red at pre-push, with +4 to +10 unpinned `!`. The mf83 files are under src/components/report/** (a McFrontend `frontend` glob), so their lanes are the ones that will have to open a second, unrelated test file and edit a pin. The count here is merge-base based and does not say whether each branch is alive.
Fix: in the plan's landing section, state the order (land task-441 after the mf83/mf47 groups, or measure the pin at the push head, not at launch) and name who edits the pin. DeepSeek plan-review#5 saw the launch-head issue; this measures that it is not hypothetical.

## in#2 LOW: the staged plant also trips the Biome and system-map-style structural tests only if a test enumerates src/components/ui; none does
Evidence: `git grep` over src/tests for `components/ui` finds no enumeration of that directory; the surface tests read src/components/surfaces and src/components/report. The plant is a no-importer file, so no related set reaches it beyond the three staged tests. This closes DeepSeek plan-review#6 as not observed. No action.

## in#3 LOW: pre-commit stage order means the red is the related run, not an earlier stage; keep red.out honest about which stage refused
Evidence: .husky/pre-commit runs partial-staging check, `mcbylaws/gate.mjs --staged`, about 30 `--check` generators, `system-map.infra.test.ts`, `step-validate.mjs --staged --fast`, lint-staged, typecheck, lint, then the related run (:85). The plant (new .tsx under src/components/ui) triggers none of the generators. The system-map test runs by itself at :47 before the related run and is green for new files, so the first red is the related run.
Fix: in step 1 of 3.4, have the lane record the failing stage name (the related run) in red.out beside the three assertion failures, so a reader can tell it was not typecheck or lint. This is a note, not a block.

UNVERIFIED (not checked by this seat):
- I did not run the pre-commit hook or the related run (no test runner allowed); the "staged test runs itself" step is read from the hook, not executed.
- scripts/analysis/step-validate.mjs `--staged --fast` and the generator `--check` steps were not read in full; I assumed none keys on src/components/ui or src/tests.
- check-lane-close.mjs, policy-checks.mjs and check-lesson-routing.sh were not read (the earlier task-440 seats covered them; compliance-queue-137#1-3 already ask about the lane-close arm).
- The branch scan is by merge-base tree, not by landing order, and does not tell which of the 47 branches are still alive or already patch-equal on the board.
- Whether `next lint` reaches src/tests (read from config, not run).
