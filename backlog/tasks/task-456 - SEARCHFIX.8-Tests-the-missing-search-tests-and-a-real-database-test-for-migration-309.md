---
id: TASK-456
title: >-
  SEARCHFIX.8 Tests: the missing search tests and a real-database test for
  migration 309
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-25T16:26:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-452
  - TASK-454
references:
  - docs/reports/reviews/task-456/GROUNDER-PLAN.md
  - docs/reports/reviews/task-456/TRIAGE-PLAN.md
  - docs/reports/reviews/task-456/seat-integration-1.md
  - docs/reports/reviews/task-456/seat-reality-check-1.md
  - docs/reports/reviews/task-456/seat-regression-1.md
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

Read at board head 9de5c2129 (wf2/board), after tasks 449 to 452 were pushed at 9fedd48cb. The planner wrote nothing, ran no test and used no database. The plan grounder (Cairn-Ground-P456) re-read the repo at a6a3fcb6d and ruled round 1 in docs/reports/reviews/task-456/GROUNDER-PLAN.md; since 9de5c2129 only board documents moved, until task-454 landed (fold commit 908b0252e, the merge of wf2/sfx6b); the lines 454 moved were re-read at 908b0252e (re-bind, Cairn-Ground-P456b), and every other file and line below was re-read at a6a3fcb6d, except where a fix below corrects it.

Every acceptance line and every folded finding is still missing on wf2/board (9de5c2129). Tasks 449 to 452 added none of these tests, so nothing gets rebuilt. One step needs the operator: running the migration 309 database test (question D1).

### (A) FACTS
| Claim | file:line | Quote |
|---|---|---|
| X2: the smoke test never renders reports_left | mobile/__tests__/surfaceRenderer.smoke.test.tsx:35 | `GOLDEN_SITUATIONS = ['static', … 'error']` (no reports_left) |
| The fixture exists: 6 of 10, "9 Dec 2026" | mobile/__tests__/fixtures/parcelSearch.situations.json (key reports_left) | `"entitlement":{"reportsLeft":6,"reportsLimit":10,…}` |
| X2 ruling | reviews/mcfixreborn-g3/GROUNDER-A.md:102 | "add 'reports_left' to line 35, and add one getByText" |
| X5: no row for the held lot | mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx:32-38 | five rows; mobile/app/(app)/parcel-tool/[parcelId].tsx:34 `data && !ask` (the only `data && !` gate in mobile/app and mobile/src) |
| X5 ruling | g3/GROUNDER-B.md:89 | "add one row `['the held unsure lot', …unsure:true}}, false]`" |
| X6: the lock misses `&&` and `\|\|` | src/tests/surfaces/nav-by-route.logic.test.ts:154-157 | `const p = unparen(n); const jsxBranch = …` |
| X6 ruling | g3/GROUNDER-F.md:107 | "Mark the discriminant when the comparison is an operand of && or \|\|" |
| R5 stale headers | nav-by-route :2-3 (FE-36 "reserved"), :6, :48-50; search-follow-ups.logic.test.ts:8-10, :98 | g3/GROUNDER-C.md:123, GROUNDER-D.md:124, GROUNDER-H.md:96 |
| X4: no property test for these | src/tests/property/ holds 3 files; massing/geometry.ts:116-120 and :150-158; mobile/src/lib/sliceConfig.ts:13-28 | g3/GROUNDER-E.md:91; GROUNDER-F.md:109 |
| N3: no security test file | `ls src/tests \| grep security`: none for /api/parcels | g3/GROUNDER-E.md:95; fold plan :99 |
| The uid comes only from the session | entitlement/route.ts:52 `readParcelToolUsage(pool, ctx.uid)`; lookup/route.ts:65-66, :77-82, :96-97 | — |
| D2: an empty trace folder exits 0 | scripts/analysis/src-sql-ledger.mjs:816 (the one return site; :810 is the confirmRecorded call, the insertion point) | `return r.rows.length > 0 ? 1 : 0;` |
| D2 ruling | g2/GROUNDER-B.md:67 | "in main after :810, if `readRecordedStatements(dir).length === 0` … `return 1`" |
| D4: untyped test data | customer-report-read.logic.test.ts:77-78, :80, :84; src-sql-ledger.logic.test.ts:51 | Std §5.1, 00_engineering_standards.md:100 |
| Types to reuse | src/lib/report-projection/project.ts:28 `StoredRow`, :48 `LotStamp`; no `StoredParcelRow` exists (read-stored.ts:23-28 is the PARCEL_SQL text), so step 9 declares one in factories.ts | — |
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
- **Web tests:** stage the test file, leave the edited source file unstaged, and try to commit. The pre-commit related run reads the working tree, and `check-partial-staging.sh` only blocks files that are staged with unstaged edits, so a wholly unstaged edit is allowed. Save the refusal as `red-<id>.out`, put the source back, and record `git diff --exit-code <src>`. The saved output must name the new test file and the failing assertion: a refusal from lint, a lock or partial staging is not the red.
- **Phone tests:** `npm --prefix mobile run test:ci -- --coverage=false <file>` (the form of the pre-push step, .husky/pre-push-checks.sh:13) with the edit in place, then without it, then `git diff --exit-code <src>` after the restore. The phone tests are outside the related run. If the lane may not run that command, their red and green are recorded UNVERIFIED until the push station, as the earlier lanes did (BL-SFX2 REPORT.md:21, BL-SFX3 REPORT.md:16).

1. **X2.** In surfaceRenderer.smoke.test.tsx, add `'reports_left'` to :35 and a new case `'reports_left: the line renders "6 of 10 reports left until 9 Dec 2026"'`. It asserts that `getByTestId('parcel-search-reports-left')` contains that text. Red: remove `...reportsLeft(s),` at SearchBinding.tsx:238.
2. **X5.** In gateStability, add the row `['the held unsure lot (semi question owed)', {...hit(null), lotForm:{detected:'semi_half',basis:'o4_two_parcel_abut',unsure:true}}, false]`. The basis value is copied from reportScreen.mount.behaviour.test.tsx:108. Red: at mobile/app/(app)/parcel-tool/[parcelId].tsx:34, change `!ask` to `!(ask && isFetching)`.
3. **X6 and R5 (nav).** In the planted list at :399-416, add three cases:
   - `'NAV-1 if with && picks the JSX'`: `if (ready && view === 'b') return <p/>`
   - `'NAV-1 && chain picks the JSX'`: `{ready && view === 'b' && <p/>}`
   - `'NAV-1 \|\| in a ternary'`
   Add passing siblings `'&& with no JSX'` and `'boolean && chain'`. These are red with no edit (the lock misses them today). Then widen :154: climb through the parents that are `&&`/`\|\|` binary expressions (parentheses skipped, as `unparen` does) and test the jsxBranch at each level. Run in memory on the real tree by the plan grounder, this gives 13 findings against 12 today; the one new is mobile/app/(auth)/sign-up.tsx:335 `onPress={() => setMethod('phone')}` (`method` becomes a discriminant through the `method === 'email' && …` chains at :234 and :274, while GROUNDER-F.md:107 said 'No live miss today'). The existing rules class that control like an allowed one: audit row 21 calls it a sheet (OK-disclosure), the entry at :321 for `setPhoneStage('otp')` cites the same row, and sign-in's `setMode('phone-input')` is a disclosure entry (a sheet, gated off by PHONE_AUTH_ENABLED). So the same commit adds one disclosure entry after :321 (confirmed by the operator, RR-0478, MORNING-DECISIONS.md:2502), which keeps the card inside the fold plan's X6 nav half: `{ file: SIGN_UP, rule: 'NAV-1', component: 'Pressable', handler: "setMethod('phone')", count: 1, kind: 'disclosure', audit: 21, why: 'opens the sign-up phone bottom sheet (a sheet is a self-contained task, ios.md:14), gated off by PHONE_AUTH_ENABLED; the same control as the sign-in phone button (audit 17)' }`. It is not an exception, so 'the list only shrinks' (:297 and :331, the six audited violations, EXCEPTION_AUDIT_ROWS) is not touched. The real-tree case at :361 is red after the widening alone and green with the entry; it must be green at the commit. Add dated notes (prior text kept) at :2-3, :6, :20-22 (compound && and || operands now count; GROUNDER-F.md:107) and :48-50. Spec 126 (§0b item 11 at :82, §5.3 item 5 at :461) is not edited and joins no Files line: it does not define the discriminant and already names the phone sheets as disclosure.
4. **R5 (follow-ups).** search-follow-ups.logic.test.ts :8-10 gets a dated note saying C.5 and C.7 landed (RR-0284). The title at :98 is corrected, with the prior title kept in a comment, following the pattern at smoke :76. Text only, no red.
5. **X4, new file src/tests/property/massing.property.test.ts.** Follows the shape of report-sqft-rounding.property.test.ts.
   - `'coverage is at most 100 for positive areas'`
   - `'the ft figure is within 0.05 of m × 3.28084'`. The factor is typed in the test as an independent reference; M_TO_FT is passed in. The ft figure is read from the string 'X.X m (Y.Y ft)' that `formatHeight` returns, m comes from `fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })` (the range of the sibling report-sqft-rounding.property.test.ts:24), and the tolerance is `0.05 + 1e-6`, the sibling's own slack (:30): a value on an exact rounding tie gives an error of 0.0500000000029 without it. For the coverage case both areas come from `fc.double({ min: 1e-6, max: 1_000_000, noNaN: true, noDefaultInfinity: true })`: NaN gives NaN and Infinity over Infinity gives NaN in computeBuildingCoverage (geometry.ts:155-157), so the generator must be positive and finite.
   - Red: remove the `Math.min(…,100)` at geometry.ts:157, and change `ft.toFixed(1)` to `Math.round(ft)` at :119.
6. **X4, new file src/tests/property/slice-number.property.test.ts.** Imports `../../../mobile/src/lib/sliceConfig`.
   - `'for any min ≤ max and finite v: the result is in [min,max] (and v itself when in range), or it throws only under fail'`. Silence console.warn with a spy. Generators: min and max from fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true }), sorted so that min <= max, with min equal to max drawn sometimes; on_invalid from fc.constantFrom('clamp', 'fail'); v from a range wider than the bounds (fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })) mixed with fc.constantFrom(min, max, 0) so the endpoints and zero are tried. Under clamp the result is min or max when v is outside; under fail it throws exactly when v is outside. Add one case: NaN, Infinity, -Infinity, undefined and a string for v always throw (sliceConfig.ts:16 refuses them before the clamp, as the sibling's refusal case does).
   - Red: change sliceConfig.ts:22 to `Math.max(b.min, v)`.
7. **N3, new file src/tests/parcel-routes.security.test.ts.** Reuse the mocks of parcels-entitlement.infra.test.ts:22-26, parcel-lookup-gate.infra.test.ts and parcels-lot-size-route.infra.test.ts, with the settings answer 454 added: since 454 the lookup and entitlement routes read their limits through readSearchSettings (one shared ANY read on logic_variables, told from the other reads by its bound keys) and answer 500 when a row is missing, so the pool mock of the new file answers that read with the five seed default rows (copy SEARCH_DEFAULTS at parcels-entitlement.infra.test.ts:42 and isSearchSettings at :45-46), and every case that expects a served route also asserts the status is not 500, so a missing settings answer cannot pass as a handled request.
   - For GET lookup, GET entitlement and POST lot-size: `'<route>: no session → 401, no pool query, no rate-limit call'`.
   - `'<route>: a ?uid=<OTHER> parameter is ignored'`. The rate-limit key holds UID; `JSON.stringify(poolQuery.mock.calls)` does not contain OTHER; the lot-size insert gets UID.
   - Red: delete `if (!ctx) return unauthorized();` at entitlement:34; and change :52 to read new URL(request.url).searchParams.get('uid') ?? ctx.uid. The existing request builders carry url and no nextUrl.searchParams (parcels-entitlement.infra.test.ts:36), so the new file's builder puts ?uid=OTHER in url; an edit through request.nextUrl.searchParams would fail on a TypeError, not on the leak. The rate-limit keys are built from ctx.uid (entitlement route :45, lot-size :77, lookup :96-97), and no other route under src/app/api/parcels reads a uid parameter.
8. **D2.** In src-sql-ledger.logic.test.ts, add:
   - `'--confirm on a missing folder exits 1 and names it'`
   - `'--confirm on an empty folder exits 1'`
   Both await `ssl.main(['--confirm', dir])` (main is async, :765) and spy on stderr. These are red with no edit. Then the code change, before :810: read once, `const stmts = readRecordedStatements(dir)`; if `stmts.length === 0`, write `no recorded statements in <dir>` to stderr and return 1; else pass `stmts` to confirmRecorded. There is one return site (:816), so no second guard. A missing folder and an empty one give the same line, which names the folder (GROUNDER-B.md:67 asks for that line and no more). The reader (it returns [] for a missing folder, :673-675) and its test at :308 stay unchanged (per the ruling). The only caller is .husky/pre-commit:23, with --check; nothing passes --confirm.
9. **D4.** Add three builders to factories.ts:
   - `makeStoredScenarioRow(o: Partial<StoredRow> = {}): StoredRow`, defaults in the key order of the test's `row()`: building_type 'detached_house', field_id 'permitted', increment '1', status 'permitted', value null, unit null, reason null, flags [], content_sha 'c', catalogue_sha 'cat', switchboard_sha 'sw', settings_sha 's', layer2_table_version 'T1', switches []. The test keeps `row(field_id, status, value, extra: Partial<StoredRow> = {})` as a one-line wrapper over it that puts `...CURRENT_SEED_SHAS` before `...extra`, so the current shas stay in the test and factories.ts takes only a type import; `ROWS(extra: Partial<StoredRow>)`; and :201 reads `{ ...(rows[2] as StoredRow), catalogue_sha: OLD_SHA }`
   - `makeLotStamp(o: Partial<LotStamp> = {}): LotStamp`, default `{ lot_gate: null, table_version: 'T1', evaluator_version: 'E1' }`; the test's STAMP is `makeLotStamp()` and GATED_LOT's stamp is `makeLotStamp({ lot_gate: 'under_min_area' })`
   - `makeSqlCatalog(o: Record<string, string[]> = {}): Record<string, string[]>`, default `{ permits: ['id', 'status', 'name'], entities: ['id', 'name'] }` with `...o` after it; the ledger test's CATALOG is `makeSqlCatalog()`
   Also, in factories.ts, the interface `StoredParcelRow { id: number; parcel_id: string; zoning_zn_string: string | null; address: string | null; lot_size_sqm: string | number | null; is_corner_lot: boolean | null; is_heritage_designated: boolean | null; is_in_ravine_protection_area: boolean | null }` (no such type exists; read-stored.ts:23-28 is the PARCEL_SQL text, so the columns are copied from its select list) and `makeStoredParcelRow(o: Partial<StoredParcelRow> & Record<string, unknown> = {}): StoredParcelRow & Record<string, unknown>`, defaults id 7, parcel_id 'P-123', zoning_zn_string 'R', address '1 Test St', lot_size_sqm '395.6', is_corner_lot false, is_heritage_designated null, is_in_ravine_protection_area null. The test's PARCEL_ROW is `makeStoredParcelRow({ parcel_id: REF })`, and the leak case at :378 stays `use({ ...CURRENT_LOT, parcel: makeStoredParcelRow({ parcel_id: REF, estimated_cost_max: 999999, variance_prediction: 1.7 }) })`: both planted columns stay, and the `Record<string, unknown>` part is what lets them compile. The test's `Lot` becomes `{ parcel: StoredParcelRow | null; stamp: LotStamp | null; present: boolean; rows: StoredRow[] }`: every `rows` in the file is `ROWS(...)` or `[]`, so no malformed row needs the old `Json[]`. Replace :77-80/:84 and ledger-test :51 with them. Proof, a refactor with no behaviour red: the git diff of the two test files changes no `it(` or `expect(` line (every planted value and assertion text is kept), the 39 `it(` lines of customer-report-read remain and pass, and `npm run typecheck` passes (tsconfig.json includes src/tests). Staging factories.ts widens the related run to the test files that import it; that is expected.
10. **D5, new file src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts.** Wrapped in `describe.skipIf(!dbAvailable() || process.env.BUILDO_TEST_DB_EXTERNAL === '1')`: that flag points the harness at an existing database (setup-testcontainer.ts:191), the shared test stack, where `DROP CONSTRAINT` takes an ACCESS EXCLUSIVE lock; the file never runs there. One client, one `BEGIN` in beforeAll and one `ROLLBACK` in afterAll (guarded by `if (client)`, then `client.release()` and `pool.end()`), so no row and no DDL is ever committed, a crash leaves nothing behind and there is no delete step. Seed one parcel the way enrich-parcels-scenarios.db.test.ts:30-32 does (feature_type 'TEST', parcel_id from the range 997_000_000, which no file in src/tests uses; the enrich test uses 995_000_000) and read its integer id: parcel_maxbld_scenarios.parcel_id is parcels.id. Each scenario insert names every NOT NULL column of migration 309:21-39: parcel_id, building_type, field_id (distinct per accepted row, it is in the primary key), increment, status, trace '{}'::jsonb, content_sha, switches '[]'::jsonb, catalogue_sha, switchboard_sha, settings_sha, layer2_table_version, computed_at now(). A refused insert aborts the transaction, so each refused case runs between `SAVEPOINT s` and `ROLLBACK TO SAVEPOINT s`.
    - Accepts: computed with a value; gain_reasons computed with a null value; not_evaluated with a reason.
    - Refused, each with SQLSTATE 23514 and `err.constraint` equal to the name: computed with a null value; not_buildable with a value (value_iff_computed); not_evaluated and not_permitted with a null reason (reason_iff_undecided).
    - Both directions inside the database, in the last case of the file (the constraint is gone for the rest of the transaction): `SAVEPOINT d`, `ALTER TABLE parcel_maxbld_scenarios DROP CONSTRAINT <name>`, show the same row the check refused is now accepted, `ROLLBACK TO SAVEPOINT d`, then show the row is refused again and `pg_constraint` lists the name again (the drop did not persist). Do it for each of the two names.
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

**Order with task-454: 454 lands first, then 456.** 454 has landed (fold commit 908b0252e), so 456 is built on its tip. The two Files lines share one file, customer-report-read.logic.test.ts: 454 edited its scripted pool (SEARCH_SETTINGS and isSearchSettings at :90-95) and one throw case (:342-349), 456 edits the builders from :77 (separate hunks). Task-454 also changes lookup/route.ts and entitlement/route.ts (rate limits read through readSearchSettings() after the parse, a new success log); step 7's scripted pool mocks and its 'ignores a uid' cases reach that code, and the new security file is not on 454's Files line, so 456 first would make 454 edit it. The fold plan's run order (section 3, :137 and :139) puts this card in wave 1 and 454 in wave 3 but names no order between them; RR-0447 item 4 asks for dependencies and order set against the remaining search tasks, and Spec 137 :21 says `dependencies` is what a card waits on. TASK-454 is in this card's `dependencies` (beside TASK-452); it is front matter, outside the Plan hash, and the launch gate does not read it. All steps are built on 454's tip (copy the mocks as 454 left them; the 39 `it(` lines of customer-report-read were counted again at 908b0252e and are unchanged). Task-454 changing sliceConfig.ts comments does not affect step 6.

### (D) OPERATOR QUESTIONS
1. **Who runs the migration 309 database test, and where?** Lanes make no database connection. RR-0472 covers only the migration catch-up, and RR-0474 does not cover database work. Grounder D5 (g2/GROUNDER-B.md:79) says this "needs a decision on Docker-backed tests".
   - **Recommended:** the orchestrator runs the one file with `env -u DATABASE_URL -u BUILDO_TEST_DB_EXTERNAL npx cross-env BUILDO_TEST_DB=1 <the test runner of package.json:51> run src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts --no-file-parallelism`, never `npm run test:db -- <path>`: the script already carries its `.db.test.ts` filter and extra paths are OR-ed, so that would run all 136 db files (package.json:51). This uses a throwaway container per §12.10 (00_engineering_standards.md:360), not the test stack. The test stack route would migrate 55322, which is a write not covered by RR-0472.
   - Check disk space and the image first: it was at 0 GB earlier (MD:2453); the plan grounder read 23 GiB free, and the reality-check seat found the image postgres:17.6.1.167 present. The run starts its own container of that image and tears it down; it touches no stack and no dev database.
   - The lane commits the file, which self-skips in the normal suite and under BUILDO_TEST_DB_EXTERNAL=1. Acceptance #4 stays open until that run passes: it is ticked only with the run's saved output (db-green.out in the lane folder) showing every case green, the DROP CONSTRAINT cases being the red direction, and git diff showing migration 309 unchanged. The operator approved this run (RR-0475 item 4, MORNING-DECISIONS.md:2481: the one migration 309 db test may run in a throwaway container, not the test stack, not dev); Std 5.2 says a migration test is run before push.

### (E) UNVERIFIED
- Whether reports_left renders in the smoke helper with no extra mocks (GROUNDER-A.md:131).
- Settled by the plan grounder: the widened nav lock finds one live compound case, sign-up.tsx:335 (step 3); the earlier grep that found none was wrong.
- Settled: the runner ORs extra paths with the script's own filter (reality-check seat), so step 10 does not use `npm run test:db -- <path>`.
- Whether the test image is already pulled locally.
- Whether a lane may run the single phone-test command.
- Settled: `parcels_m_to_ft` is pinned at 3.28084 (default, min and max, scripts/seeds/logic_variables.json:8212-8216).
- Whether CI runs the database test for this branch.
- Settled by the order rule in (C): 454 lands first, so step 7 is written against its routes.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/surfaces/nav-by-route.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/src-sql-ledger.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/factories.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/db/setup-testcontainer.ts
- /Users/brettpreston_macmini/Buildo-wt-board/migrations/309_parcel_maxbld_scenarios.sql

Plan review round 1: 26 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-456/GROUNDER-PLAN.md; triage docs/reports/reviews/task-456/TRIAGE-PLAN.md
plan-error-paths#3 MED folded The saved output mus
plan-plan-review-deepseek#2 HIGH folded so no row and no DDL
plan-plan-review-deepseek#3 MED folded after the restore. T
plan-plan-review-deepseek#4 MED folded extra paths are OR-e
plan-plan-review-deepseek#5 MED folded names every NOT NULL
plan-plan-review-deepseek#13 MED folded rounding tie gives a 
plan-plan-review-deepseek#14 MED folded mixed with fc.consta
plan-plan-review-deepseek#16 MED folded diff of the two test 
in#1 MED folded share one file, cust 
in#2 MED folded so that would run al
rc#1 MED folded (the one return site
rc#3 MED folded the sibling's own sl
rc#4 MED folded so the generator mus
rg#1 HIGH folded the one new is mobil
rg#2 MED folded dated notes (prior t
rg#3 MED folded both planted columns
rg#4 MED folded 454 lands first, the
<!-- SECTION:PLAN:END -->
