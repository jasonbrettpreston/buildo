# Review context for task-456 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 3)

## Task
task-456 SEARCHFIX.8 Tests: the missing search tests and a real-database test for migration 309
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SFX8 · labels: SEARCHFIX-LATER

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 8 (FIX.SEARCH-TESTS) and 9 (FIX.MIG309-DBTEST); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: tests only. The "reports left" state is rendered in a test; property tests for the massing numbers and the slice-number reader; a security test file for the parcel routes; typed test builders; the ledger tool fails on a missing folder; both constraints of migration 309 are refused in a real database.

Findings folded: X2, X4, X5, X6 (nav half), N3, R5, G2 D2, G2 D4, G2 D5.

Must not: edit migration 309. The database test runs on the local test stack only; whether that needs a GO is UNVERIFIED and is settled at the plan stage.

Runs after SEARCHFIX.4 (shared phone smoke test).

Files: mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts, src/tests/property/slice-number.property.test.ts, src/tests/parcel-routes.security.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs, src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts

## Acceptance criteria
- #1 The reports-left state renders in a test
- #2 Property tests hold coverage at or under 100 and the slice number in bounds
- #3 The parcel routes answer 401 with no session and ignore a uid parameter
- #4 Both CHECK constraints of migration 309 are refused in a real database

## Implementation Plan
Planner: Cairn-Plan-456
Plan id: PLAN-456-v1

Read at board head 9de5c2129 (wf2/board), after tasks 449 to 452 were pushed at 9fedd48cb. The planner wrote nothing, ran no test and used no database. The plan grounder (Cairn-Ground-P456) re-read the repo at a6a3fcb6d and ruled round 1 in docs/reports/reviews/task-456/GROUNDER-PLAN.md; since 9de5c2129 only board documents moved, until task-454 landed (fold commit 908b0252e, the merge of wf2/sfx6b); the lines 454 moved were re-read at 908b0252e (re-bind, Cairn-Ground-P456b), and every other file and line below was re-read at a6a3fcb6d, except where a fix below corrects it.

Every acceptance line and every folded finding is still missing on wf2/board (9de5c2129). Tasks 449 to 452 added none of these tests, so nothing gets rebuilt. One step needs the operator: running the migration 309 database test (question D1).

#### (A) FACTS
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

#### (B) PLAN
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

#### (C) FILES
The card's 12 entries are confirmed, and each needs a change. Nothing needs regenerating:
- The test harvest (`spec:tests`) is not enforced by any hook.
- The ledger scan skips src/tests (src-sql-ledger.mjs:159).
- No lock pins lists of security, property or db test files.
- The system map lists no test file named here.
- The text pin on the smoke file (search-follow-ups:64-65) is not affected.

Files: mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts, src/tests/property/slice-number.property.test.ts, src/tests/parcel-routes.security.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs, src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts. Also, through the CLI only: the task-456 file and its queue row.

src-sql-ledger.mjs is the only non-test file. It is not a protected path (rule-lists.json:23).

**Order with task-454: 454 lands first, then 456.** 454 has landed (fold commit 908b0252e), so 456 is built on its tip. The two Files lines share one file, customer-report-read.logic.test.ts: 454 edited its scripted pool (SEARCH_SETTINGS and isSearchSettings at :90-95) and one throw case (:342-349), 456 edits the builders from :77 (separate hunks). Task-454 also changes lookup/route.ts and entitlement/route.ts (rate limits read through readSearchSettings() after the parse, a new success log); step 7's scripted pool mocks and its 'ignores a uid' cases reach that code, and the new security file is not on 454's Files line, so 456 first would make 454 edit it. The fold plan's run order (section 3, :137 and :139) puts this card in wave 1 and 454 in wave 3 but names no order between them; RR-0447 item 4 asks for dependencies and order set against the remaining search tasks, and Spec 137 :21 says `dependencies` is what a card waits on. TASK-454 is in this card's `dependencies` (beside TASK-452); it is front matter, outside the Plan hash, and the launch gate does not read it. All steps are built on 454's tip (copy the mocks as 454 left them; the 39 `it(` lines of customer-report-read were counted again at 908b0252e and are unchanged). Task-454 changing sliceConfig.ts comments does not affect step 6.

#### (D) OPERATOR QUESTIONS
1. **Who runs the migration 309 database test, and where?** Lanes make no database connection. RR-0472 covers only the migration catch-up, and RR-0474 does not cover database work. Grounder D5 (g2/GROUNDER-B.md:79) says this "needs a decision on Docker-backed tests".
   - **Recommended:** the orchestrator runs the one file with `env -u DATABASE_URL -u BUILDO_TEST_DB_EXTERNAL npx cross-env BUILDO_TEST_DB=1 <the test runner of package.json:51> run src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts --no-file-parallelism`, never `npm run test:db -- <path>`: the script already carries its `.db.test.ts` filter and extra paths are OR-ed, so that would run all 136 db files (package.json:51). This uses a throwaway container per §12.10 (00_engineering_standards.md:360), not the test stack. The test stack route would migrate 55322, which is a write not covered by RR-0472.
   - Check disk space and the image first: it was at 0 GB earlier (MD:2453); the plan grounder read 23 GiB free, and the reality-check seat found the image postgres:17.6.1.167 present. The run starts its own container of that image and tears it down; it touches no stack and no dev database.
   - The lane commits the file, which self-skips in the normal suite and under BUILDO_TEST_DB_EXTERNAL=1. Acceptance #4 stays open until that run passes: it is ticked only with the run's saved output (db-green.out in the lane folder) showing every case green, the DROP CONSTRAINT cases being the red direction, and git diff showing migration 309 unchanged. The operator approved this run (RR-0475 item 4, MORNING-DECISIONS.md:2481: the one migration 309 db test may run in a throwaway container, not the test stack, not dev); Std 5.2 says a migration test is run before push.

#### (E) UNVERIFIED
- Whether reports_left renders in the smoke helper with no extra mocks (GROUNDER-A.md:131).
- Settled by the plan grounder: the widened nav lock finds one live compound case, sign-up.tsx:335 (step 3); the earlier grep that found none was wrong.
- Settled: the runner ORs extra paths with the script's own filter (reality-check seat), so step 10 does not use `npm run test:db -- <path>`.
- Whether the test image is already pulled locally.
- Whether a lane may run the single phone-test command.
- Settled: `parcels_m_to_ft` is pinned at 3.28084 (default, min and max, scripts/seeds/logic_variables.json:8212-8216).
- Whether CI runs the database test for this branch.
- Settled by the order rule in (C): 454 lands first, so step 7 is written against its routes.

#### Critical Files for Implementation
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

## Implementation Notes
2026-11-25 taken on the board at lane launch (lane BL-SFX8, worktree /Users/brettpreston_macmini/Buildo-wt-sfx8, branch wf2/sfx8), RR-0240

2026-11-25 red attempt (commit i): web tests of plan steps 3-9 staged with temporary unstaged source edits (geometry.ts cap and ft rounding, sliceConfig.ts clamp, entitlement route session bypass and uid parameter); D2 and X6 red with no edit; saved as red-web.out in the lane folder.

2026-11-25 red proven (red-web.out, lane folder): 10 named cases failed, nothing else (1101 passed); sources restored, git diff --exit-code 0 on geometry.ts, sliceConfig.ts, entitlement/route.ts. The entitlement session-bypass red was a typed fallback context instead of deleting the 401 line, which would not typecheck. Green: src-sql-ledger.mjs --confirm refuses no recorded statements; the NAV-1 lock climbs && / || chains; one sign-up disclosure entry (RR-0478).

2026-11-25 phone tests (commit ii, plan steps 1-2): smoke renders reports_left with its line text; gateStability adds the held unsure lot row. Phone typecheck passes. Red and green of these two are UNVERIFIED until the push station (the phone tests are outside the pre-commit related run and the lane runs no test runner, rule 18; precedent BL-SFX2 REPORT.md:21, BL-SFX3 REPORT.md:16). Red edits for the station: remove ...reportsLeft(s), at SearchBinding.tsx:238; change !ask to !(ask && isFetching) at [parcelId].tsx:34.

2026-11-25 migration 309 database test written (commit iii, plan step 10): src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts; self-skips with no DATABASE_URL and under BUILDO_TEST_DB_EXTERNAL=1; one BEGIN/ROLLBACK, savepoints per case, both directions by DROP CONSTRAINT inside SAVEPOINT d. NOT RUN by the lane (no database connection); the orchestrator runs it in a throwaway container (RR-0475 item 4, MORNING-DECISIONS.md:2481). AC #4 stays open until db-green.out. Migration 309 unchanged.

2026-11-25 work commits 2606cb7ab (web tests, ledger, factories), 5580aaa76 (phone tests), f7498e8c5 (database test); the launch review context context-r2.md committed with the work as the brief asks. Station owed (RR-0467) before the output review.

2026-11-25 STATION PASS on 5e4d68bc1 (~/Buildo-scratch/push-station/pass/5e4d68bc1af5ea71a644e463ea8acffad67199ce.pass; output ~/Buildo-scratch/lanes-20261125/station-5e4d68bc1.out): 28,397 passed, 0 failed; phone tests and both typechecks rc=0, so the two new phone cases are green; their red runs remain unseen. The migration 309 db test is still to be run by the orchestrator in a throwaway container; AC #4 stays open.

## References
- docs/reports/reviews/task-456/GROUNDER-PLAN.md
- docs/reports/reviews/task-456/TRIAGE-PLAN.md
- docs/reports/reviews/task-456/seat-integration-1.md
- docs/reports/reviews/task-456/seat-reality-check-1.md
- docs/reports/reviews/task-456/seat-regression-1.md
- compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
- compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
- compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0465 task 455 (a confidence word per reading) moves to Increment 1·D beside task 76
- RR-0466 task 452 limit screen keeps the notice box, first line emphasised, new wording
- RR-0150 Infra freeze named list
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0468 task 452 failed-read notice on the limit screen: Something went wrong on our side. Please try again.
- RR-0469 task 452 the limit screen's own code file WallBinding.tsx is confirmed
- RR-0471 iPhone run: free Apple account, phone may reach the Mac on the home Wi-Fi, GO for a read-only test database check
- RR-0472 GO: bring the local test database up to the current migrations — "Test database - this is seperate from our local database - let's get it set up" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2449)
- RR-0473 Yes: install CocoaPods and copy the Google settings file, local only
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight — "Leave it alone.  I need to go to bed.  Can you work on the 3 remaing tasks now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2462)
- RR-0475 answers to the six morning questions — "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481)
- RR-0476 phone test next; two process questions asked
- RR-0477 phone test now; batching rule adopted
- RR-0152 Increment 1·A re-use and drops
- RR-0478 sign-up allow-list entry confirmed (task-456) — "yes on the entry sign up" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2502)
- RR-0479 brief lines and the batching line, without the lane process
- RR-0480 phone test: onboarding flag for one test user on the local test database
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack
- RR-0483 search box the Google way, Enter wired, a card for the report counter
- RR-0484 dev GO for the six task-454 settings rows
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line) — "if it a small change let's do it - we have the data - why not" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1099)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review (names RR-0467) — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0472 GO: bring the local test database up to the current migrations (names RR-0472) — "Test database - this is seperate from our local database - let's get it set up" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2449)
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight (names RR-0474) — "Leave it alone.  I need to go to bed.  Can you work on the 3 remaing tasks now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2462)
- RR-0475 answers to the six morning questions (names RR-0475) — "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481)
- RR-0478 sign-up allow-list entry confirmed (task-456) (names task-456, RR-0478) — "yes on the entry sign up" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2502)
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line) (names RR-0284) — "if it a small change let's do it - we have the data - why not" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1099)

## Prior reviews and lane reports
### task-456 (this task)
- docs/reports/reviews/task-456/FINDINGS-PLAN.md
- docs/reports/reviews/task-456/FOLD-CHECK.md
- docs/reports/reviews/task-456/GROUNDER-PLAN.md
- docs/reports/reviews/task-456/QUESTIONS-RULED.md
- docs/reports/reviews/task-456/TRIAGE-PLAN.md
- docs/reports/reviews/task-456/seat-integration-1.md
- docs/reports/reviews/task-456/seat-reality-check-1.md
- docs/reports/reviews/task-456/seat-regression-1.md
### task-452 (dependency)
- docs/reports/reviews/task-452/FINDINGS-PLAN.md
- docs/reports/reviews/task-452/FOLD-CHECK.md
- docs/reports/reviews/task-452/GROUNDER-PLAN.md
- docs/reports/reviews/task-452/QUESTIONS-RULED.md
- docs/reports/reviews/task-452/TRIAGE-PLAN.md
- docs/reports/reviews/task-452/seat-integration-1.md
- docs/reports/reviews/task-452/seat-reality-check-1.md
- docs/reports/reviews/task-452/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX4/REPORT.md (lane report naming task-452)
### task-454 (dependency)
- docs/reports/reviews/task-454/FINDINGS-PLAN.md
- docs/reports/reviews/task-454/FOLD-CHECK.md
- docs/reports/reviews/task-454/GROUNDER-PLAN.md
- docs/reports/reviews/task-454/QUESTIONS-RULED.md
- docs/reports/reviews/task-454/TRIAGE-PLAN.md
- docs/reports/reviews/task-454/seat-integration-1.md
- docs/reports/reviews/task-454/seat-reality-check-1.md
- docs/reports/reviews/task-454/seat-regression-1.md
- docs/reports/lanes/2026-11-25/BL-GENROW/REPORT.md (lane report naming task-454)
- docs/reports/lanes/2026-11-25/BL-SFX6B/REPORT.md (lane report naming task-454)

## Dependencies
- task-452 SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room) and reactivate screen for an expired subscription, phone first · status: BUILT
  final summary: SEARCHFIX.4 built on the phone: work commit 4cf68ec45 (hooks: related run Test Files 4 passed, Tests 147 passed; GATE OK; POLICY CHECKS OK), D15 cite e4a9eea86, dated notes 1ce7b88ae, review records aa6de17b3. AC1 errors.ts/apiClient.ts classes (apiClient.test.ts); AC2 limit wall on search and report (parcelSearchScreen.behaviour, reportPage.behaviour, reportScreen.mount, wallScreens.golden); AC3 reactivate only for expired, status null keeps the notice (parcelSearchMatch.test.ts searchWall); AC4 no web file in the diff. Phone: full local run 59 suites 905/905. Web files outside the related run unverified until the push station.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX4/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX4/TRIAGE.md

Review round 2: 0 fixed, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX4/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX4/TRIAGE.md
- task-454 SEARCHFIX.6 Search settings: the typed-in limits become registered settings; emitter, log and test fixes (needs the operator's typed GO to apply on dev) · status: BUILT
  final summary: Stage (i) landed on wf2/sfx6b: work commit 42b4b7932 (73 files; pre-commit related run 474 passed), the task-372 dated note e8043789e, the station fix a6315e3d8 (the consumer clause of four seed descriptions names the route in words). What landed: six seed rows with bounds (parcel_lookup_search_per_min 60, parcel_lookup_detail_per_min 30, parcel_entitlement_read_per_min 30, parcel_lookup_slow_query_ms 500, maxbld_page_candidate_cap 10, maxbld_page_recent_max 3; values unchanged); one server reader readSearchSettings (src/lib/admin/parcel-lookup.ts) read once per request by the lookup, entitlement and admin routes, failing closed with the generic 500; resolveAddress takes the cap as bound parameters; the phone slice keys candidate_cap and recent_max (SearchBinding.tsx, recentSearchesStore.ts through sliceNumber); the generator emits a schema-allowed 0 and --write removes stray files; the entitlement route logs success with uid and duration; the 500 bodies are tested free of database text. Push station PASS on a6315e3d8: 28,379 passed, 0 failed (phone tests and both typechecks rc 0). Evidence: docs/reports/lanes/2026-11-25/BL-SFX6B/ (red.out, red-x3-plant.out, restamp-fingerprint-only.txt, green.out). Open: stages (ii) rehearsal, (iii) dev apply on the operator typed GO, (iv) push, held until the rows are on dev (RR-0475 item 2).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 8 pile; grounder docs/reports/lanes/2026-11-25/BL-SFX6B/GROUNDER.md; triage docs/reports/lanes/2026-11-25/BL-SFX6B/TRIAGE.md
