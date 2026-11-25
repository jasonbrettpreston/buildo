---
id: TASK-456
title: >-
  SEARCHFIX.8 Tests: the missing search tests and a real-database test for
  migration 309
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-25T01:39:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-452
type: fix
ordinal: 150130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 8 (FIX.SEARCH-TESTS) and 9 (FIX.MIG309-DBTEST); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: tests only. The "reports left" state is rendered in a test; property tests for the massing numbers and the slice-number reader; a security test file for the parcel routes; typed test builders; the ledger tool fails on a missing folder; both constraints of migration 309 are refused in a real database.

Findings folded: X2, X4, X5, X6 (nav half), N3, R5, G2 D2, G2 D4, G2 D5.

Must not: edit migration 309. The database test runs on the local test stack only; whether that needs a GO is UNVERIFIED and is settled at the plan stage.

Runs after SEARCHFIX.4 (shared phone smoke test).

Files: mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts, src/tests/property/slice-number.property.test.ts, src/tests/parcel-routes.security.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs, src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reports-left state renders in a test
- [ ] #2 Property tests hold coverage at or under 100 and the slice number in bounds
- [ ] #3 The parcel routes answer 401 with no session and ignore a uid parameter
- [ ] #4 Both CHECK constraints of migration 309 are refused in a real database
<!-- AC:END -->

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
Planner: Cairn-Plan-456
Plan id: PLAN-456-v1

Read at board head 9de5c2129 (wf2/board), after tasks 449 to 452 were pushed at 9fedd48cb. The planner wrote nothing, ran no test and used no database.

Every acceptance line and every folded finding is still missing on wf2/board (9de5c2129). Tasks 449 to 452 added none of these tests, so nothing gets rebuilt. One step needs the operator: running the migration 309 database test (question D1).

### (A) FACTS
| Claim | file:line | Quote |
|---|---|---|
| X2: the smoke test never renders reports_left | mobile/__tests__/surfaceRenderer.smoke.test.tsx:35 | `GOLDEN_SITUATIONS = ['static', … 'error']` (no reports_left) |
| The fixture exists: 6 of 10, "9 Dec 2026" | mobile/__tests__/fixtures/parcelSearch.situations.json (key reports_left) | `"entitlement":{"reportsLeft":6,"reportsLimit":10,…}` |
| X2 ruling | reviews/mcfixreborn-g3/GROUNDER-A.md:102 | "add 'reports_left' to line 35, and add one getByText" |
| X5: no row for the held lot | mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx:32-38 | five rows; [parcelId].tsx:33 `data && !ask` |
| X5 ruling | g3/GROUNDER-B.md:89 | "add one row `['the held unsure lot', …unsure:true}}, false]`" |
| X6: the lock misses `&&` and `\|\|` | src/tests/surfaces/nav-by-route.logic.test.ts:154-157 | `const p = unparen(n); const jsxBranch = …` |
| X6 ruling | g3/GROUNDER-F.md:107 | "Mark the discriminant when the comparison is an operand of && or \|\|" |
| R5 stale headers | nav-by-route :2-3 (FE-36 "reserved"), :6, :48-50; search-follow-ups.logic.test.ts:8-10, :98 | g3/GROUNDER-C.md:123, GROUNDER-D.md:124, GROUNDER-H.md:96 |
| X4: no property test for these | src/tests/property/ holds 3 files; massing/geometry.ts:116-120 and :150-158; mobile/src/lib/sliceConfig.ts:13-28 | g3/GROUNDER-E.md:91; GROUNDER-F.md:109 |
| N3: no security test file | `ls src/tests \| grep security`: none for /api/parcels | g3/GROUNDER-E.md:95; fold plan :99 |
| The uid comes only from the session | entitlement/route.ts:39 `readParcelToolUsage(pool, ctx.uid)`; lookup/route.ts:64-65, :76-81, :87-88 | — |
| D2: an empty trace folder exits 0 | scripts/analysis/src-sql-ledger.mjs:810, :816 | `return r.rows.length > 0 ? 1 : 0;` |
| D2 ruling | g2/GROUNDER-B.md:67 | "in main after :810, if `readRecordedStatements(dir).length === 0` … `return 1`" |
| D4: untyped test data | customer-report-read.logic.test.ts:77-78, :80, :84; src-sql-ledger.logic.test.ts:51 | Std §5.1, 00_engineering_standards.md:100 |
| Types to reuse | src/lib/report-projection/project.ts:28 `StoredRow`, :48 `LotStamp` | — |
| D5: the two named CHECKs | migrations/309_parcel_maxbld_scenarios.sql:41, :42 | `…_value_iff_computed`, `…_reason_iff_undecided` |
| The rule for D5 | 00_engineering_standards.md:359 | "MUST land with a `*.db.test.ts` file under `src/tests/db/`" |
| How db tests run | package.json:51 | `"test:db": "cross-env BUILDO_TEST_DB=1 … .db.test.ts --no-file-parallelism"` |
| The normal suite skips them | package.json:11 `--exclude "**/*.db.test.ts"`; .husky/pre-commit:7-10 | — |
| Where they run | src/tests/db/setup-testcontainer.ts:11-13, :151-158 | throwaway container of the target image; never dev; test stack only with `BUILDO_TEST_DB_EXTERNAL=1` (and that migrates it) |
| CI | .github/workflows/db-tests.yml:9-18 | runs on a PR touching `src/tests/db/**`, or a push to main |
| How earlier lanes recorded red | lanes/2026-11-24/BL-SFX2/REPORT.md:20, BL-SFX3/REPORT.md:14, BL-PROC462/REPORT.md:11 | `red.out` = a commit attempt with only the test and task files staged, refused by the pre-commit related run |
| The past gap | lanes/2026-11-20/BL-FIXPROJ/REPORT.md:26 | "no mutation red was run, so it is UNVERIFIED" |

### (B) PLAN
Red proof: when the code under test already works, each new test is proven red by a **temporary edit that is never staged**. Two ways to run it:
- **Web tests:** stage the test file, leave the edited source file unstaged, and try to commit. The pre-commit related run reads the working tree, and `check-partial-staging.sh` only blocks files that are staged with unstaged edits, so a wholly unstaged edit is allowed. Save the refusal as `red-<id>.out`, put the source back, and record `git diff --exit-code <src>`.
- **Phone tests:** `npm --prefix mobile run test:ci -- --coverage=false <file>` with the edit in place, then without it. The phone tests are outside the related run.

1. **X2.** In surfaceRenderer.smoke.test.tsx, add `'reports_left'` to :35 and a new case `'reports_left: the line renders "6 of 10 reports left until 9 Dec 2026"'`. It asserts that `getByTestId('parcel-search-reports-left')` contains that text. Red: remove `...reportsLeft(s),` at SearchBinding.tsx:236.
2. **X5.** In gateStability, add the row `['the held unsure lot (semi question owed)', {...hit(null), lotForm:{detected:'semi_half',basis:'o4_two_parcel_abut',unsure:true}}, false]`. The basis value is copied from reportScreen.mount.behaviour.test.tsx:108. Red: at [parcelId].tsx:33, change `!ask` to `!(ask && isFetching)`.
3. **X6 and R5 (nav).** In the planted list at :399-416, add three cases:
   - `'NAV-1 if with && picks the JSX'`: `if (ready && view === 'b') return <p/>`
   - `'NAV-1 && chain picks the JSX'`: `{ready && view === 'b' && <p/>}`
   - `'NAV-1 \|\| in a ternary'`
   Add passing siblings `'&& with no JSX'` and `'boolean && chain'`. These are red with no edit (the lock misses them today). Then widen :154: climb through the parents that are `&&`/`\|\|` binary expressions before the jsxBranch test. The real-tree case at :361 must stay green. Add dated notes (prior text kept) at :2-3, :6 and :48-50.
4. **R5 (follow-ups).** search-follow-ups.logic.test.ts :8-10 gets a dated note saying C.5 and C.7 landed (RR-0284). The title at :98 is corrected, with the prior title kept in a comment, following the pattern at smoke :68. Text only, no red.
5. **X4, new file src/tests/property/massing.property.test.ts.** Follows the shape of report-sqft-rounding.property.test.ts.
   - `'coverage is at most 100 for positive areas'`
   - `'the ft figure is within 0.05 of m × 3.28084'`. The factor is typed in the test as an independent reference; M_TO_FT is passed in.
   - Red: remove the `Math.min(…,100)` at geometry.ts:157, and change `ft.toFixed(1)` to `Math.round(ft)` at :119.
6. **X4, new file src/tests/property/slice-number.property.test.ts.** Imports `../../../mobile/src/lib/sliceConfig`.
   - `'for any min ≤ max and finite v: the result is in [min,max] (and v itself when in range), or it throws only under fail'`. Silence console.warn with a spy.
   - Red: change sliceConfig.ts:22 to `Math.max(b.min, v)`.
7. **N3, new file src/tests/parcel-routes.security.test.ts.** Reuse the mocks of parcels-entitlement.infra.test.ts:16-21, parcel-lookup-gate.infra.test.ts and parcels-lot-size-route.infra.test.ts.
   - For GET lookup, GET entitlement and POST lot-size: `'<route>: no session → 401, no pool query, no rate-limit call'`.
   - `'<route>: a ?uid=<OTHER> parameter is ignored'`. The rate-limit key holds UID; `JSON.stringify(poolQuery.mock.calls)` does not contain OTHER; the lot-size insert gets UID.
   - Red: delete `if (!ctx) return unauthorized();` at entitlement:29; feed `searchParams.get('uid')` into :39.
8. **D2.** In src-sql-ledger.logic.test.ts, add:
   - `'--confirm on a missing folder exits 1 and names it'`
   - `'--confirm on an empty folder exits 1'`
   Both call `ssl.main(['--confirm', dir])` and spy on stderr. These are red with no edit. Then the code change: after :810, if `readRecordedStatements(dir).length === 0`, write `no recorded statements in <dir>` to stderr and return 1. The reader and its test at :308 stay unchanged (per the ruling).
9. **D4.** Add three builders to factories.ts:
   - `makeStoredScenarioRow(o: Partial<StoredRow>): StoredRow`
   - `makeLotStamp(o: Partial<LotStamp>): LotStamp`
   - `makeSqlCatalog(o?: Record<string,string[]>)`
   Also a typed `StoredParcelRow` builder for the parcels read (read-stored.ts:23-28). Replace :77-80/:84 and ledger-test :51 with them. Proof: the same case count passes before and after (39 in customer-report-read), and `npm run typecheck` passes. This is a refactor, so no behaviour red.
10. **D5, new file src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts.** Wrapped in `describe.skipIf(!dbAvailable())`. Seed one parcel the way enrich-parcels-scenarios.db.test.ts:30-32 does, and delete it in afterAll.
    - Accepts: computed with a value; gain_reasons computed with a null value; not_evaluated with a reason.
    - Refused, each with SQLSTATE 23514 and `err.constraint` equal to the name: computed with a null value; not_buildable with a value (value_iff_computed); not_evaluated and not_permitted with a null reason (reason_iff_undecided).
    - Both directions inside the database: in a transaction, `DROP CONSTRAINT <name>`, show the same row is accepted, then ROLLBACK.
    - Plus `pg_constraint` lists both names.
    - Migration 309 is never edited. Pattern: migration-070-xor.db.test.ts.

Checks: the hooks only (no full suite from the lane); then the push station, which also runs the phone tests (pre-push :13).

Commit shape:
- (i) web tests, the ledger change and factories (steps 3-9);
- (ii) phone tests (steps 1-2);
- (iii) the database test, plus the task file and queue row via the CLI (Definition of Done #6).

Each commit ends with `Task: task-456`. The `red-*.out` files go in the lane folder.

### (C) FILES
The card's 12 entries are confirmed, and each needs a change. Nothing needs regenerating:
- The test harvest (`spec:tests`) is not enforced by any hook.
- The ledger scan skips src/tests (src-sql-ledger.mjs:159).
- No lock pins lists of security, property or db test files.
- The system map lists no test file named here.
- The text pin on the smoke file (search-follow-ups:64-65) is not affected.

Files: mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts, src/tests/property/slice-number.property.test.ts, src/tests/parcel-routes.security.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs, src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts. Also, through the CLI only: the task-456 file and its queue row.

src-sql-ledger.mjs is the only non-test file. It is not a protected path (rule-lists.json:23).

**Overlap with task-454:** the two Files lines share no file, but there is a code dependency. Task-454 changes lookup/route.ts and entitlement/route.ts (rate limits read from settings, a new success log). That can break step 7's scripted pool mocks. Recommendation: build in parallel, but land 456's commit (i) after 454's code commit, and re-run step 7 on that tip. Task-454 changing sliceConfig.ts comments does not affect step 6.

### (D) OPERATOR QUESTIONS
1. **Who runs the migration 309 database test, and where?** Lanes make no database connection. RR-0472 covers only the migration catch-up, and RR-0474 does not cover database work. Grounder D5 (g2/GROUNDER-B.md:79) says this "needs a decision on Docker-backed tests".
   - **Recommended:** the orchestrator runs the `test:db` command with its file filter replaced by the new file's path. This uses a throwaway container per §12.10 (00_engineering_standards.md:360), not the test stack. The test stack route would migrate 55322, which is a write not covered by RR-0472.
   - Check disk space first: it was at 0 GB earlier (MD:2453).
   - The lane commits the file, which self-skips in the normal suite. Acceptance #4 stays open until that run passes.

### (E) UNVERIFIED
- Whether reports_left renders in the smoke helper with no extra mocks (GROUNDER-A.md:131).
- Whether the widened nav lock finds a live compound case (the grounder grepped and found none).
- Whether adding a path argument to `test:db` ORs with its `.db.test.ts` filter and so runs every db test.
- Whether the test image is already pulled locally.
- Whether a lane may run the single phone-test command.
- Whether the `parcels_m_to_ft` value equals 3.28084.
- Whether CI runs the database test for this branch.
- That 454's route change actually breaks step 7.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/surfaces/nav-by-route.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/src-sql-ledger.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/factories.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/db/setup-testcontainer.ts
- /Users/brettpreston_macmini/Buildo-wt-board/migrations/309_parcel_maxbld_scenarios.sql
<!-- SECTION:PLAN:END -->
