# Seat: integration: task-456 plan (PLAN-456-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head a6a3fcb6d (wf2/board; the plan says it was read at 9de5c2129, later commits only moved board docs). Read-only: no test runner, no database, no dotenv. Files read: the task-456 and task-454 files, the pre-commit and pre-push hooks, check-partial-staging.sh, the vitest and mobile jest configs, tsconfig.json, package.json:11 and :51, setup-testcontainer.ts, the tests and sources named under "Checked and clean", and migrations/309:21-45.

## Checked and clean
- X2 helper and fixture. Every golden goes through `show(k)` (smoke:30-34). The fixture key `reports_left` exists with 6 of 10 and "9 Dec 2026". SearchBinding.tsx:99-103 renders testID `parcel-search-reports-left` from `search.reports_left` ("{left} of {allowance} reports left until {reset}"). `searchData` passes the entitlement block when `reportsLeftShown` holds (:253). So the line renders with no extra mock, and `...reportsLeft(s),` is at :236. The generic it.each assertions (header, input, BLD, tagline) hold for an idle situation. Resolves UNVERIFIED #1.
- X5 row shape and red. `needsSemiQuestion` (lotForm.ts:29) is true for `lotForm.unsure` when the semi param is absent, and `useLocalSearchParams` in the test returns only parcelId. The mutation `!ask` to `!(ask && isFetching)` gives the miss text with isFetching true and loading with it false, so the trees differ and the row goes red. The basis value `o4_two_parcel_abut` is at mount.behaviour:108. The router mock supplies replace, so the redirect effect is safe.
- X6. `unparen` (nav-by-route:67) climbs only parentheses. For `ready && view === 'b' && <p/>` the comparison's parent is the inner `&&` whose right side is the comparison (no JSX), so the lock misses it today. For `if (ready && view==='b') return <p/>` the parent is also an `&&`, not the IfStatement. Both planted cases are red with no edit. The planted list is :399-416 and `passing` starts at :419.
- X4 imports. `formatHeight(meters, feetPerMetre)` (geometry.ts:116-120) and `computeBuildingCoverage` (:157, `Math.min(Math.round(pct * 10) / 10, 100)`) are exported. sliceConfig.ts:22 is `Math.min(b.max, Math.max(b.min, v))`. fix-tune.logic.test.ts:15 already imports `mobile/src/lib/sliceConfig` from a web test. The vitest alias is only `@`, there is no `exclude` for mobile in the test include, and the file has no imports. The path `../../../mobile/src/lib/sliceConfig` from src/tests/property is right. fast-check and the pattern file report-sqft-rounding.property.test.ts exist. `parcels_m_to_ft` is 3.28084 (seed :8213), which resolves UNVERIFIED #6.
- Red by an unstaged edit. pre-commit builds RELATED_FILES from staged src/scripts files only and runs the related run on them. A staged test file runs itself against the working tree. check-partial-staging.sh blocks only a staged file that also has unstaged edits, so a wholly unstaged source edit passes. The temporary edits in steps 5 and 6 are type-valid, so typecheck and lint do not stop the hook before the related run. The red proof is workable for web tests.
- D2 callers. pre-commit runs only `src-sql-ledger.mjs --check` (pinned by hooks-composition.infra.test.ts:267). I found no `--confirm` caller in .husky, package.json, .github, scripts or src/tests. The only `--confirm` mentions are the script's own usage text and docs. No test calls `--confirm` on an empty folder on purpose. `main` is exported (ssl.main). The reader returns `[]` for a missing folder (:669-676), and the test at :308 pins that. Changing the exit code breaks no caller.
- D5. Constraint logic checked against migration 309:41-42. "computed with a null value" trips only value_iff_computed. "not_buildable with a value" trips only value_iff_computed. "not_evaluated or not_permitted with a null reason" trips only reason_iff_undecided. The gain_reasons exemption accepts a null value. `dbAvailable` and `getTestPool` are exported from setup-testcontainer.ts, and migration-070-xor.db.test.ts and enrich-parcels-scenarios.db.test.ts exist. The standard's rule at 00_engineering_standards.md:359 is quoted correctly, and the package.json:11 and :51 quotes are right.
- Pins on the touched files. The only reader of the smoke file is search-follow-ups:64-65 (`getByText('Lot Intelligence')`), which stays. The ledger scan skips src/tests (mjs:159).
- Route facts. entitlement route :29 `if (!ctx) return unauthorized();` and :39 `readParcelToolUsage(pool, ctx.uid)` are right. Neither route reads a uid parameter. The lookup rate keys use `ctx.uid`.

## in#1 MED: the plan says the Files lines share no file with task-454, but customer-report-read.logic.test.ts is on both
Plan: (C) "Overlap with task-454: the two Files lines share no file, but there is a code dependency."
Evidence: the task-454 file, line 190: "customer-report-read.logic.test.ts is in both Files lines. task-454 edits its db/client mock at :31-34; task-456 edits its builders at :77-78." Line 102 repeats it (customer-report-read:31-34,97 "unlisted mocks break"). Line 186 lists it under tests.
Fix: replace the sentence with "one shared file, customer-report-read.logic.test.ts: 454 edits the mock at :31-34 and :97, 456 edits the builders at :77-87 (separate hunks)". Order 456 commit (i) after 454's code commit and re-run the 39-case count on the merged tip. The same ordering covers the step 7 mocks, which 454's `readSearchSettings()` call (its line 142) can break.

## in#2 MED: the recommended `test:db` path would run every database test
Plan: (D1) "the orchestrator runs the `test:db` command with its file filter replaced by the new file's path"; (E) "Whether adding a path argument to `test:db` ORs with its `.db.test.ts` filter" is left UNVERIFIED.
Evidence: package.json:51 `"test:db": "cross-env BUILDO_TEST_DB=1 vitest run .db.test.ts --no-file-parallelism"`. A positional argument to the runner is a substring filter and extra positionals are ORed, so `npm run test:db -- <path>` still matches all `.db.test.ts` files. The globalSetup (the config's `globalSetup` entry) also starts a container for any run with BUILDO_TEST_DB=1. I have not run it, so this rests on how the runner treats positionals.
Fix: name the exact command in the plan: `npx cross-env BUILDO_TEST_DB=1 <the runner> run src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts --no-file-parallelism`. Do not use `npm run test:db -- <path>`.

## in#3 LOW: the step 7 red edit cannot be "feed `searchParams.get('uid')`" with the existing request mock
Plan: (B) step 7 "Red: delete `if (!ctx) return unauthorized();` at entitlement:29; feed `searchParams.get('uid')` into :39."
Evidence: parcels-entitlement.infra.test.ts:38 builds the request as `{ url, method, nextUrl: { pathname }, headers }` with no `nextUrl.searchParams`. The lookup route reads `new URL(request.url).searchParams` (lookup/route.ts:~74).
Fix: write the red edit as `new URL(request.url).searchParams.get('uid') ?? ctx.uid`. Otherwise the test goes red from a TypeError, not from the uid leak. The new file's request builder must put `?uid=OTHER` in `url`.

## in#4 LOW: step 9 names a StoredParcelRow type that does not exist
Plan: (B) step 9 "a typed `StoredParcelRow` builder for the parcels read (read-stored.ts:23-28)".
Evidence: `grep StoredParcelRow` over src, mobile/src and scripts finds nothing. read-stored.ts:22-28 is the `PARCEL_SQL` string, not a type. `StoredRow` (project.ts:28) and `LotStamp` (:48) do exist, and `SeedShas` (seed-shas.ts:23) matches the sha columns. The test's `row()` takes `extra: Json` (:80), so `Partial<StoredRow>` will fail typecheck if a caller passes a key that is not a StoredRow key.
Fix: say who defines the parcels-row type (a new interface local to factories.ts, derived from PARCEL_SQL's select list). Add a step: grep every `extra` argument in customer-report-read before the swap. Also note that staging factories.ts widens the related run to its 16 importer test files.

## in#5 NIT: two cited lines are off
Plan: (A) X5 "[parcelId].tsx:33 `data && !ask`"; (B) step 4 "following the pattern at smoke :68".
Evidence: the `data && !ask` text is at `mobile/app/(app)/parcel-tool/[parcelId].tsx:34`. The dated-note pattern with the prior title kept is at surfaceRenderer.smoke.test.tsx:76.
Fix: correct to :34 and :76.

## in#6 NIT: the phone-test red command may not turn coverage off
Plan: (B) "`npm --prefix mobile run test:ci -- --coverage=false <file>`".
Evidence: mobile/package.json:11 `"test:ci": "jest --coverage --ci"` puts `--coverage` first, so the appended flag depends on how the runner resolves a repeated flag. The jest config has no coverage threshold, so a stray coverage run does no harm, only time.
Fix: use `npm --prefix mobile exec jest -- --ci <file>`, or accept the coverage run.

UNVERIFIED: whether the widened `&&`/`||` climb stays green on the real tree (case at nav-by-route:361); I did not scan every compound condition under DIRS, so keep the plan's "must stay green" gate. Whether the Docker image is pulled locally and disk space is free: not checkable read-only.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 2 MED, 2 LOW, 2 NIT); the plan matches the real code (red proofs and the ledger exit-code change hold, no caller breaks), but it misstates the task-454 file overlap and names a command that would run all database tests.
