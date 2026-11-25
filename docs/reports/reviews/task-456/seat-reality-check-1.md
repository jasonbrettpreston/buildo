# Seat: reality-check: task-456 plan (PLAN-456-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head a6a3fcb6d (wf2/board, working tree; the plan says it read 9de5c2129). Read: the task-456 file, FINDINGS-PLAN.md, the brief, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/src/components/surfaces/SearchBinding.tsx and SurfaceRenderer.tsx:89-91, mobile/src/lib/parcelSearchCore.ts, mobile/src/generated/surfaces/mobile_parcel_search.json:60, surfaceRenderer.smoke test, gateStability test, parcel-tool/[parcelId].tsx, src/lib/massing/geometry.ts, mobile/src/lib/sliceConfig.ts, scripts/seeds/logic_variables.json, migrations/309, src/tests/db/setup-testcontainer.ts, vitest.config.ts, package.json, scripts/analysis/src-sql-ledger.mjs. Ran node -e on geometry.ts and sliceConfig.ts in memory (nothing written). One read-only pg_constraint query on 127.0.0.1:55322. docker images and df.

## Checked and clean
- Fixture: situation reports_left has reportsLeft 6, reportsLimit 10, resetsOnDisplay "9 Dec 2026" (fixture :482-507).
- The renderer does no date formatting and has no time-zone logic. SurfaceRenderer.tsx:91 does `String(resolveValue(...))` and replaces `{name}` in the template "{left} of {allowance} reports left until {reset}" (generated slice :60). The server writes the Toronto date, so the phone prints the string as served. The line the binding builds is exactly "6 of 10 reports left until 9 Dec 2026". It is one Text node, testID `parcel-search-reports-left`, so one getByText or getByTestId works.
- `...reportsLeft(s),` is at SearchBinding.tsx:236. Removing it removes the node, so the planned red is real. `reportsLeftShown` draws the line for 0 too.
- Massing coverage: `computeBuildingCoverage` (geometry.ts:150-158). 2,000,000 random positive pairs gave 0 results above 100. Edge values: (1e9,1) gives 100, (MIN_VALUE,1e300) gives 0. Planned mutant, removing `Math.min(...,100)`: (2,1) gives 200, so it is red.
- ft figure: `formatHeight` (geometry.ts:119 is the `ft.toFixed(1)` line). With factor 3.28084 and m in 0 to 500, the worst error was 0.04999995 and 0 of 2,000,000 samples went over 0.05. Mutant `Math.round(ft)` gives an error up to about 0.5 (0.28 at 1 m), so it is red.
- Registered `parcels_m_to_ft` (scripts/seeds/logic_variables.json:8212-8216): default 3.28084, min 3.28084, max 3.28084. So the plan's UNVERIFIED line "equals 3.28084" is settled: yes, pinned.
- sliceNumber: 2,000,000 random calls (clamp and fail, valid bounds) gave 0 violations. The result is always in [min,max], v itself when in range, and a throw only for out-of-range under fail. min===max and 1e308 are fine. Mutant `Math.max(b.min, v)` at :22 (the real line is `Math.min(b.max, Math.max(b.min, v))`) gives 10 for v=10 in [0,5], so it is red, but only if the generator draws v above max under clamp.
- Migration 309 constraints (lines 41-42): `parcel_maxbld_scenarios_value_iff_computed`, `parcel_maxbld_scenarios_reason_iff_undecided`. There is also an unnamed inline status CHECK, auto-named `..._status_check`, with 9 statuses. Worked by hand: ACCEPT computed+value, ACCEPT gain_reasons computed+null value, ACCEPT not_evaluated+reason. REFUSE computed+null value (value_iff_computed), REFUSE not_buildable+value (value_iff_computed), REFUSE not_evaluated or not_permitted with null reason (reason_iff_undecided). Each refuse row trips only the named constraint if the other columns are kept consistent. The planned accept and refuse rows are right.
- Local test stack (:55322, one read): table parcel_maxbld_scenarios present (count 1); CHECK constraints there are `parcel_maxbld_scenarios_reason_iff_undecided`, `..._status_check`, `..._value_iff_computed`. Both planned names exist on the stack.
- Harness: setup-testcontainer.ts starts a testcontainers GenericContainer of `readDbTarget().test_image` = public.ecr.aws/supabase/postgres:17.6.1.167 (docs/specs/_contracts.json:126), runs all migrations in it, and tears it down. With BUILDO_TEST_DB_EXTERNAL=1 and a loopback DATABASE_URL that is not port 54322, the harness runs `runMigrations` against that target ('external-ci'). So the plan's claim "the test-stack route would migrate 55322" is true. Port 54322 is always refused.
- Image present locally: postgres:17.6.1.167 (1.76GB) and testcontainers/ryuk:0.14.0 are both there. Docker is running (OrbStack). Free disk is 25 GiB on / and /System/Volumes/Data (95% used on Data). The "0 GB" at MD:2453 is stale, so no pull and no space blocker now.
- test:db: `cross-env BUILDO_TEST_DB=1 vitest run .db.test.ts --no-file-parallelism` (package.json:51). The runner filters with `filters.some(...)` (node_modules vitest dist chunk, lines 10048-10051), so extra positional paths are OR'd. Adding a path does not narrow the run: all 136 `*.db.test.ts` files would run. Replacing `.db.test.ts` with the new file's path does narrow it. The plan's wording "file filter replaced by the new file's path" is right. globalSetup (vitest.config.ts:27) still boots the container and migrates everything even for one file.
- X5: `data && !ask` exists, and the mutant `!(ask && isFetching)` makes the two isFetching trees differ for the owed-question row, so it is red. unsureHit shape `{detected:'semi_half', basis:'o4_two_parcel_abut', unsure:true}` is at reportScreen.mount.behaviour.test.tsx:108.
- readRecordedStatements returns [] for a missing folder (src-sql-ledger.mjs:673-674, no throw), so the plan's length===0 branch covers both missing and empty. `main` is `export async function main(argv)` (:765), so the planned tests must await it. The only hook caller of the ledger is `--check` (.husky/pre-commit:23). No hook or script calls `--confirm`, so the exit-1 change breaks no caller.

## rc#1 MED: plan's step-8 line citation is wrong, and one lens finding rests on it
Plan: (A) FACTS D2 "src-sql-ledger.mjs:810, :816 `return r.rows.length > 0 ? 1 : 0;`"; (B) step 8 "after :810".
Evidence: `grep -n "rows.length > 0 ? 1 : 0"` gives only :816. Line :810 is `const r = confirmRecorded(ledger, readRecordedStatements(dir));`. There is one return site, so plan-error-paths#1 ("a second return site at :816") is not real.
Fix: cite :816 for the return and :810 for the insertion point (the guard goes before `const r`, or right after it using the same reader result). Note that plan-error-paths#1 has a false premise.

## rc#2 LOW: wrong line for the gate in [parcelId].tsx
Plan: (A) X5 "[parcelId].tsx:33 `data && !ask`"; (B) step 2 "at [parcelId].tsx:33".
Evidence: mobile/app/(app)/parcel-tool/[parcelId].tsx:34 holds `reportScreenState({ data: data && !ask ? ...`; :33 is the second line of a comment. The file is under parcel-tool/, not report/.
Fix: cite parcel-tool/[parcelId].tsx:34.

## rc#3 MED: the 0.05 ft property can fail at the rounding boundary, and needs a bounded generator
Plan: step 5 "'the ft figure is within 0.05 of m × 3.28084'".
Evidence: node -e on `ft.toFixed(1)` with inputs on exact tie points (m = (k/10+0.05)/3.28084) gave a worst error of 0.0500000000029, which is above 0.05. The existing sibling property adds `+ 1e-6` (report-sqft-rounding.property.test.ts: `<= 0.5 + 1e-6`). Random sampling (2,000,000 values) never hit it, so a strict `<= 0.05` is a rare flake, not a constant fail.
Fix: assert `<= 0.05 + 1e-6`, and bound m (for example 0 to 1,000,000). Without a bound, `toFixed` goes exponential from 1e21 up, and fc.double can produce 1e300.

## rc#4 MED: coverage generator must exclude NaN and Infinity
Plan: step 5 "'coverage is at most 100 for positive areas'".
Evidence: in-memory: `computeBuildingCoverage(Infinity,1)` gives 100, but `(NaN,1)` gives NaN (NaN passes the `<= 0` guards, and `Math.min(NaN,100)` is NaN), and Infinity/Infinity is NaN. `NaN <= 100` is false, so a default fc.double breaks the property today. This is not a defect in the planned claim (it says "positive areas"), but the generator needs `{min: 1e-6, noNaN: true, noDefaultInfinity: true}` as the sibling test does.
Fix: state the generator options in step 5, and bound it to positive finite values.

## rc#5 NIT: slice-number mutant is only caught if the generator draws out-of-range values under clamp
Plan: step 6 red "change sliceConfig.ts:22 to `Math.max(b.min, v)`".
Evidence: sliceConfig.ts:22 `const clamped = Math.min(b.max, Math.max(b.min, v));`. The mutant differs only when v is above max and on_invalid is 'clamp'. In my run 41.6% of calls threw, so out-of-range draws are common, but the generator must pick on_invalid and v freely (not v inside [min,max]) for the red to hold.
Fix: add to step 6 "draw v from a range wider than [min,max] and on_invalid from {clamp, fail}". This is distinct from lens finding 14 (boundary cases).

## UNVERIFIED
- Whether reports_left renders in the smoke helper with no extra mocks: not run (no test runner). The `show()` helper uses the same SEARCH_SLICE.content and `searchProps`/`searchData` as the golden test, which already pins the node, so it is likely fine. Settle it by the red run.
- Whether the widened nav lock finds a live compound case, and the planted nav cases (not read at :399-416).
- Whether the plan's seed insert (enrich-parcels-scenarios.db.test.ts:30-32 pattern) satisfies today's parcels columns. I did not run it. The pattern needs `parcels` (parcel_id, feature_type, geometry, geom, lot_size_sqm ...) and `parcel_maxbld_scenarios` has many NOT NULL columns (increment, trace, content_sha, switches, the 4 shas, layer2_table_version, computed_at) that the plan's row text does not list.

STATUS: 5 findings (0 CRITICAL, 0 HIGH, 3 MED, 1 LOW, 1 NIT); the plan's numbers, the fixture text, migration 309 facts, the local image and the OR-filter behaviour all check out, and the mutations are real.
