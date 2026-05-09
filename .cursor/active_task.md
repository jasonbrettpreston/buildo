# Active Task: WF2 — add lead-inspect-query.db.test.ts to the existing live-DB harness
**Status:** Implementation
**Workflow:** WF2 (Enhance — adopt the existing live-DB testcontainer harness for the inspector SQL; would have caught the 3 column drifts repaired in commit `73f3ae6` at WF2 #4 commit time)
**Domain Mode:** Web Admin (Cross-Domain — admin API route's read-path SQL exercise against real schema)
**Rollback Anchor:** `73f3ae6` (current HEAD on `main` — lead-inspect column-drift fix shipped)

## Context

* **The deferral reframed:** The follow-up I filed at commit `73f3ae6` said *"no live-DB infra test exists for any read-only SQL endpoint"* — that's wrong. The harness DOES exist at `src/tests/db/setup-testcontainer.ts` with `getTestPool()` + `dbAvailable()` helpers and the `*.db.test.ts` convention (5 existing files: `lead-detail-saved-state.db.test.ts`, `lead-feed-saved-state.db.test.ts`, `109_fk_hardening.db.test.ts`, `lead-views-fk.db.test.ts`, `migration-067-geography.db.test.ts`). Each gates with `describe.skipIf(!dbAvailable())(...)`; CI provides `DATABASE_URL` from a `postgres:16 + PostGIS` service container; local opt-in via `BUILDO_TEST_DB=1` boots `postgis/postgis:16-3.4-alpine` via testcontainers.
* **The actual gap:** WF2 #4 (commit `6683477`) added the inspect SQL but no `lead-inspect-query.db.test.ts` adopter. The 3 column drifts (`pb.area_sqm`, `parc.area_sqm`, `n.id = p.neighbourhood_id`) shipped silent because the existing two test layers both mock the SQL. Adding one db-test file using the established pattern would have caught all three at commit time.
* **Goal:** Write `src/tests/db/lead-inspect-query.db.test.ts` that seeds the minimum chain (permit → permit_parcels → parcels → parcel_buildings → building_footprints → neighbourhood), calls `fetchLeadInspect`, and asserts the SQL parses + executes without throwing + returns each expected non-null field. This catches column drift (PG 42703) AND silent join-key drift (the `n.id` vs `n.neighbourhood_id` bug class) at commit time.
* **Target Spec:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 Cycle 7 (the inspector contract). No spec amendment required.

## Technical Implementation

### File: `src/tests/db/lead-inspect-query.db.test.ts` (NEW)

Mirrors `lead-detail-saved-state.db.test.ts` exactly — same imports, same `getTestPool()` + `dbAvailable()` gate, same `beforeAll` seed + `afterAll` teardown shape.

**Seed scope (minimum to exercise every LEFT JOIN in MAIN_SQL):**
- `trades(slug, name)` — needed by entities + trades panel + permit_trades FK chain
- `neighbourhoods(neighbourhood_id, name, avg_household_income, period_of_construction)` — exercises the `n.neighbourhood_id = p.neighbourhood_id` join
- `parcels(parcel_id, lot_size_sqm, centroid_lat, centroid_lng)` — exercises the `parc.lot_size_sqm` SELECT
- `building_footprints(id, footprint_area_sqm, max_height_m)` — exercises the new `bf.*` SELECT after the WF3 fix
- `parcel_buildings(parcel_id, building_id, is_primary, confidence, structure_type)` — exercises the LATERAL `building_id` fetch
- `permits(permit_num, revision_num, permit_type, structure_type, status, neighbourhood_id, builder_name, ...)` — primary row
- `permit_parcels(permit_num, revision_num, parcel_id, confidence)` — exercises the `pp` LATERAL
- `cost_estimates(permit_num, revision_num, ...)` — exercises the `ce` LEFT JOIN

Out of scope to seed (the LEFT JOIN tolerates NULL):
- `trade_forecasts` — forecasts panel; the `Promise.all` includes a separate `pool.query<ForecastRow>` against this table; an empty result is the expected shape for permits without forecasts
- `entities` — entity panel; same — JS-side `normalizedBuilder` short-circuits if `permit.builder_name` is null
- `permit_trades` — trades panel; empty array is fine
- `lead_views` — engagement; missing rows yield `competition_count: 0`, `saved_by_admin: false`
- `scope_intensity_matrix` — matrix lookup; missing yields `permit_type_allocation_pct: null`
- `logic_variables` (income_premium_tiers row) — `fetchNeighbourhoodPremiumTier` returns null cleanly when the row is absent
- `permit_type_classifications` — not read by the inspector SQL (read by the cost-model gate; orthogonal)

The inspector returns a populated envelope even with this minimum chain — the test asserts the SQL executes cleanly + the canonical fields the broken columns would have populated (`spatial.parcel.area_sqm`, `spatial.massing.area_sqm`, `spatial.neighbourhood.id`) come back as expected non-null values.

### Assertions (4 it() blocks per the 3 fixed bug classes + 1 baseline)

1. **`it('fetches a permit with full chain without throwing'`** — calls `fetchLeadInspect`, asserts `result !== null` and `result.lead_id === '<seeded>--00'`. The smoke test that fails on any column drift like `42703`.
2. **`it('populates spatial.parcel.area_sqm from parcels.lot_size_sqm'`** — asserts `result.spatial.parcel.area_sqm === <seeded lot_size_sqm value>`. Catches drift #2 from commit `73f3ae6` (`parc.area_sqm` → `parc.lot_size_sqm`).
3. **`it('populates spatial.massing.area_sqm from building_footprints.footprint_area_sqm'`** — asserts `result.spatial.massing.area_sqm === <seeded footprint_area_sqm>` and `result.spatial.massing.height_m === <seeded max_height_m>`. Catches drift #1 (`pb.area_sqm` → `bf.footprint_area_sqm`).
4. **`it('populates spatial.neighbourhood.id from neighbourhoods.neighbourhood_id (NOT the SERIAL)'`** — asserts `result.spatial.neighbourhood.id === <seeded city neighbourhood_id>` (not the SERIAL `parcels.id`). Catches drift #3 (the silent miss).

### What this test catches at commit time (the bug class that motivated this WF)

- ✅ Column-name drift in any joined table (PG 42703 surfaces immediately on the test pool's first query)
- ✅ Wrong join key (`n.id` vs `n.neighbourhood_id` — the silent miss bug)
- ✅ Schema-level type drift (`::text` cast against a missing column)
- ✅ Future migrations that drop/rename columns the inspector reads
- ❌ Logic-level drift (e.g., the JS-side mapper returns the wrong shape) — that's the existing `admin-detail-inspectors.ui.test.tsx` layer's job

### Files (Modified / New)

- **NEW** `src/tests/db/lead-inspect-query.db.test.ts` — the live-DB regression-lock per above (~120 lines, mirrors `lead-detail-saved-state.db.test.ts` line-for-line in shape)
- **MODIFIED** `docs/reports/review_followups.md` — strike the "no live-DB harness exists" deferred item (was misframed; harness already exists), file the smaller true follow-up: "extend live-DB coverage to other admin read-path endpoints" (lead-feed health, flight-board detail, etc.) as nice-to-have

### Database Impact

NONE in production. Test fixtures are seeded inside the per-test container, cleaned up in `afterAll`. No migration. No schema change. No production code edits.

## Standards Compliance

* **§5.1 Typed factories:** new test reuses the same fixture pattern as `lead-detail-saved-state.db.test.ts` — direct `INSERT` SQL with named constants for permit_num/parcel_id/etc. Existing convention; no change.
* **§5.2 Test file pattern:** new file follows the `*.db.test.ts` extension already established. SPEC LINK header per Prime Directive #3.
* **§9.3 Idempotent Scripts:** test fixtures seeded with `ON CONFLICT DO NOTHING` so `BUILDO_TEST_DB=1` re-runs don't fail on residual state.
* **Spec 47 §R5:** N/A — test code, not pipeline code.
* **No backwards-compat hacks:** the test file is brand-new; no shim, no removed-comment dance, no test-seam exports.
* **Scope discipline:** purely additive. No changes to `lead-inspect-query.ts`, no migrations, no production code.

## State Verification (DONE before plan-lock)

* Read `src/tests/db/setup-testcontainer.ts` — confirmed `getTestPool()` + `dbAvailable()` exist and gate on `process.env.DATABASE_URL`. Migrations run via `scripts/migrate.js` against the container.
* Read `src/tests/db/lead-detail-saved-state.db.test.ts` — confirmed pattern: `pool` from `getTestPool()`, `describe.skipIf(!dbAvailable())(...)`, `beforeAll` INSERT seed, `afterAll` DELETE + `pool.end()`.
* Confirmed all 5 existing `*.db.test.ts` files use this pattern uniformly.
* Confirmed vitest config (`vitest.config.ts`) has `globalSetup: ['src/tests/db/setup-testcontainer.ts']` so the harness fires automatically when `BUILDO_TEST_DB=1` or CI's `DATABASE_URL`.
* Confirmed `npm run test` will skip the new test gracefully when no DB is available (no CI failure surface).

## Execution Plan
- [ ] **R1** — Rollback anchor confirmed: `73f3ae6`. Branch: `main`.
- [ ] **R2** — State verification: read `lead-feed-saved-state.db.test.ts` for any pattern subtleties (multiple `it()` blocks reading same seeded data).
- [ ] **R3** — Spec Review: skim Spec 76 §3.5 to confirm no contract drift between WF2 #4 inspector + the live test.
- [ ] **R4** — Reproduction test FIRST (Red Light): write the new test file. Run with `BUILDO_TEST_DB=1`. **Sub-decision:** since the harness uses Docker testcontainers and may not be available locally, the Red Light proof is "the test runs and passes against the live dev DB" — equivalent to running the throwaway `debug-inspect-500.js` script we used during commit `73f3ae6`. If Docker isn't available we fall back to running against the dev DB by setting `DATABASE_URL` directly.
- [ ] **R5** — Implementation (one file at a time):
  - `src/tests/db/lead-inspect-query.db.test.ts` — the test (per spec above)
  - `docs/reports/review_followups.md` — strike the misframed follow-up; file the corrected smaller one
- [ ] **R6** — Green Light: new test passes; `npm run typecheck && npm run lint -- --fix && npm run test` (the test itself skips when `DATABASE_URL` unset; full suite stays green).
- [ ] **R7** — Idempotency: re-run the new test 2× consecutively — confirm fixture seed + cleanup is repeatable.
- [ ] **R8** — Live verification: with `DATABASE_URL` set, run `npx vitest run src/tests/db/lead-inspect-query.db.test.ts` and confirm 4/4 pass against the dev DB.
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. Test gates with `describe.skipIf(!dbAvailable())` so default `npm run test` (no DATABASE_URL) keeps passing?
  2. `afterAll` cleans up every seeded row + closes the pool? (Otherwise a `BUILDO_TEST_DB=1` retry would leak.)
  3. Per project feedback memory ("WF3 cadence — per-finding"): scope is purely additive — zero changes to production code in this commit?
  4. SPEC LINK header points to Spec 76 §3.5 + Spec 83 §3 (the dual-path reference)?
  5. The 4 assertions cover all 3 drift bug classes from commit `73f3ae6`, plus the baseline "doesn't throw" smoke?
- [ ] **R10** — Self-review: re-read the new test against `lead-detail-saved-state.db.test.ts` — assert shape parity (imports, gate, beforeAll/afterAll structure).
  - **No multi-agent review:** this is purely additive test code. Per feedback memory, WF2 normally runs both adversarial models, but this commit has zero production-code change → adversarial review on test fixtures isn't proportional. (If you want me to run it anyway, say so.)
- [ ] **R11** — Atomic commit on `main`: `test(76_lead_feed_health_dashboard): WF2 — add lead-inspect-query.db.test.ts (live-DB regression-lock against column drift)`. Spec 05 §5 footer.
- [ ] **R12** — Push `main`.

§10 note: live-DB harness already existed under `src/tests/db/`; this WF is the inspector adopting it. Zero production-code change; ~120 LoC of test fixtures + 4 assertions.

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> §10 note: zero production-code change; harness pre-exists; 4 assertions cover the 3 fixed drift bug classes + smoke.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
