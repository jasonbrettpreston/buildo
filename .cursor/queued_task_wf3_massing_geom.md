# Active Task: WF3 — Massing source pipeline: populate `building_footprints.geom`
**Status:** Complete (validated — pending WF6 commit)
**Domain Mode:** Backend/Pipeline (`scripts/load-massing.js`, `migrations/`, `scripts/link-massing.js`)
**Workflow:** WF3 Fix — foundational data-pipeline correctness (NOT a cost-model change).

## Context
* **Goal:** Make the massing source pipeline populate `building_footprints.geom` correctly so `link-massing` produces `parcel_buildings`. Every other massing field is already fully populated (geometry, footprint_area, max/min_height, elev_z, estimated_stories, centroid all at 427,077); `geom` is the sole gap (0/427,077).
* **Target Spec:** `docs/specs/01-pipeline/56_source_massing.md` (§2 — `geometry` is EPSG:3857; area derived via `ST_Transform(3857→4326)`), `docs/specs/01-pipeline/60_shared_steps.md` (`link_massing` PostGIS fast path needs `bf.geom`). Adhere to: Spec 47 (script skeleton), Spec 48 (observability gate).
* **Root cause (confirmed in code):** `load-massing.js:390-401` derives `footprint_area_sqm` via `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text),3857),4326)::geography` but **never populates the `geom` column**. `geom` is only set by one-time migrations 065/098, which (a) run on the empty table during `migrate` (no-op for real data, since data loads after) and (b) use `ST_SetSRID(geometry,4326)` WITHOUT transforming — labeling EPSG:3857 Mercator coords as 4326. Net: `geom`=0/427K (or, on a fresh-DB-with-data path, mislabeled) → `link-massing.js:247` `ST_Contains(bf.geom, ST_SetSRID(ST_MakePoint(lng,lat),4326))` gets 0 matches → `parcel_buildings`=0 → cost model forced onto lot-size GFA fallback.
* **Why silent:** `link-massing` emits a WARN (not FAIL) when the PostGIS fast path yields 0 matches (`link-massing.js:604` — `massingHasFails = !hasPostGIS && totalBuildings===0`), so a fast-path CRS mismatch never trips the gate.
* **Key Files:**
  * `scripts/load-massing.js` — add post-INSERT geom pass + VACUUM ANALYZE (MODIFY).
  * `scripts/one-time/backfill-building-footprints-geom.js` — one-time geom backfill, outside-txn + VACUUM (NEW; mirrors `backfill-address-points-geom.js`). NO migration (geom column already exists; large backfill must not run in migrate's txn — RG R2).
  * `scripts/link-massing.js` — fast-path threshold FAIL gate (MODIFY).
  * `docs/specs/01-pipeline/56_source_massing.md` — add `geom GEOMETRY(Geometry,4326)` to the §2 column table (currently undocumented; DeepSeek-HIGH R2) + note it's `ST_Transform(3857→4326)`-derived at load.
  * Tests: `src/tests/massing.logic.test.ts` (+geom pass) + `src/tests/load-massing.infra.test.ts` (SQL-shape regression lock — `ST_Transform` not `ST_SetSRID`), `src/tests/db/migration-177-*.db.test.ts` (NEW), `src/tests/massing.logic.test.ts` link-massing gate test. [Independent: `load-massing.logic.test.ts` does not exist — corrected.]

## Technical Implementation
* **`load-massing.js` post-INSERT geom pass** (mirrors the area pass at L390, minus `::geography` since `geom` is `geometry(4326)`):
  ```sql
  UPDATE building_footprints
  SET geom = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)
  WHERE geom IS NULL AND geometry IS NOT NULL
  ```
  Idempotent (`geom IS NULL`); makes every load self-contained. Log rowCount like the area pass. Follow with `VACUUM ANALYZE building_footprints` (matches the existing post-mutation precedent at `load-massing.js:198-199,211-212`) so the GiST fast path is performant on the first link run [Independent].
* **One-time backfill script** `scripts/one-time/backfill-building-footprints-geom.js` (NOT a migration — [Regression-Guardian R2]: a 427K-row UPDATE inside `migrate.js`'s single BEGIN/COMMIT holds `ROW EXCLUSIVE` for minutes + bloats, and `migrate.js` forbids VACUUM in-txn. Mirrors the existing `scripts/one-time/backfill-address-points-geom.js` precedent (mig 162 moved its 525K geom backfill out for this exact reason). The `geom` column already exists (mig 065) → no schema migration needed.):
  ```sql
  -- runs outside any transaction (pool.query), so it can VACUUM after
  UPDATE building_footprints
  SET geom = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)
  WHERE geometry IS NOT NULL
    AND (geom IS NULL OR NOT ST_Within(geom, ST_MakeEnvelope(-180,-90,180,90,4326)));
  -- then:
  VACUUM ANALYZE building_footprints;
  ```
  `geom IS NULL` covers the current all-NULL state; the envelope guard catches any Mercator-mislabeled-4326 rows (fresh-DB-then-restore-pre-fix-dump case) and is idempotent (correct 4326 rows are `ST_Within` the envelope → skipped, never double-transformed — [RG R2 confirmed]). Production SQL carries clean comments (no review-artifact tags) [DeepSeek-NIT].
* **Migrations 065/098** left as-is (effectively dead — they run on the empty table during `migrate`; the `load-massing` pass + this script are now the authority). Editing applied migrations would trip checksum-drift; note as superseded in the commit.
* **`link-massing.js` gate (Spec 48) — threshold, not binary [Gemini/DeepSeek-MED]:** wire a fast-path arm into `massingHasFails`: `hasPostGIS && processed > 0 && massingLinkRate < 50` → FAIL (currently `!hasPostGIS && totalBuildings===0` never fires on the PostGIS path → silent WARN; `===0` alone would miss a 1-match catastrophic failure). Use the REAL vars: `processed` (per-run parcel count, `link-massing.js:302`) for the `>0` guard, and the existing **cumulative** `massingLinkRate` (`:601-603`) reusing its `>=50%` threshold [Independent R2: `parcels_queried` doesn't exist; rate is cumulative — gate is most meaningful on a `--full` run]. Row-derived (rate from a DB COUNT), not parallel-boolean. NOTE [RG R2]: a FAIL verdict does NOT halt the chain (`run-chain.js` only halts on throw/non-zero exit) — this is observability/dashboard signal, intended.
* **Database Impact:** YES (data only, no schema change — geom column exists since mig 065). One-time script UPDATEs `geom` on ~427K rows OUTSIDE a transaction then `VACUUM ANALYZE` (reclaims the dead tuples + refreshes GiST stats — the mig-162 precedent). Idempotent/re-runnable.

## Standards Compliance (§9 Pipeline Safety, §2, §10)
* **Try-Catch Boundary:** additions sit inside existing `pipeline.run`/`withAdvisoryLock`; no new bare catch.
* **Unhappy Path Tests:** geom pass with NULL geometry (skipped); mig 177 idempotent re-run = 0 rows; link-massing FAIL on 0-match fast path; mixed valid/invalid geometry.
* **Regression locks:** geom expression uses `ST_Transform` NOT `ST_SetSRID` (lock test); link-massing 0-match → FAIL.
* **DB integration test:** real-PostGIS migration-177 test under `BUILDO_TEST_DB=1` (verifies geom SRID=4326 + coords in WGS84 range + ST_Contains against a parcel works).
* **logError / UI:** N/A (pipeline; `pipeline.run` owns error emission).

## Execution Plan
- [ ] **Step 0 — projection verify [Gemini-CRITICAL guard]:** confirm a sample `building_footprints.geometry` coord is Mercator range (≫±180, e.g. `-8.8M`) NOT WGS84 (`-79/43`) before any transform. (Already observed `[-8863232, 5423546]` + centroids `43.7/-79.6`; this step locks it in the commit.)
- [ ] `load-massing.js`: post-INSERT geom pass + `VACUUM ANALYZE` + log; SQL-shape regression lock in `load-massing.infra.test.ts` (`ST_Transform` not `ST_SetSRID`).
- [ ] `scripts/one-time/backfill-building-footprints-geom.js` (mirror address-points one): run it → verify geom=427K, SRID 4326, coords in WGS84 range, `ST_Contains` vs a known parcel returns true. + db test (`src/tests/db/building-footprints-geom.db.test.ts`, with `🔗 SPEC LINK` header per CLAUDE.md §3).
- [ ] `link-massing.js`: threshold FAIL gate (`hasPostGIS && processed>0 && massingLinkRate<50`) + test.
- [ ] Spec 56 §2: document the `geom` column.
- [ ] Re-run `link-massing --full` (PIPELINE_CHAIN=sources) → confirm `parcel_buildings` populates at healthy link rate.
- [ ] **Green Light:** typecheck + lint + `npm run test` + `BUILDO_TEST_DB=1` DB tests.
- [ ] **Multi-Agent OUTPUT Review** (WF3 = Independent + Regression Guardian on the diff; plan-altitude review already DONE — see Review Outcome).
- [ ] WF6 commit `fix(56_source_massing): populate building_footprints.geom via ST_Transform (link-massing fast-path threshold gate)`.

## Review Outcome — plan-altitude (4 reviewers, 2026-06-10)
**Verdict: PASS with required fixes (all folded in above).** Core diagnosis + fix expression confirmed correct by all 4.
- **Independent (PASS):** test paths corrected (`load-massing.logic.test.ts` → `massing.logic.test.ts` + `.infra.`); add `ANALYZE` for GiST stats; dead `ST_SRID<>4326` clause dropped. Confirmed full chain: geom→`ST_Contains`→`parcel_buildings`→`compute-cost-estimates` LATERAL on `footprint_area_sqm`.
- **Regression Guardian (PASS, 1 mandatory fence):** 065/098 `ST_SetSRID(4326)` was an *error* (geometry believed WGS84 — file is literally `…wgs84.zip`; WF2 #C 2026-05-09 / mig 122 established 3857; 065/098 never updated). NO consumer depends on the mislabeled geom (0/427K; JS fallback reads raw `geometry`, not `geom`). No regression lock pins the old expression. **Mandatory:** the silent-gate fix MUST ship with mig 177 (it does).
- **DeepSeek (HIGH):** `SET LOCAL lock_timeout` needed an interval → `'5s'` (fixed). MED: NULL-geometry rows stay NULL (same as area pass — accepted); verify-after-load ordering (Step 0 + post-load verify).
- **Gemini (CRITICAL refuted + HIGH/MED):** CRITICAL SRID-corruption risk → refuted by evidence (Mercator coords confirmed), Step 0 guard added. Gate made threshold-based not `===0`. **DEFER → `review_followups.md`:** dual-column (geometry JSONB 3857 + geom 4326) single-source-of-truth redesign; mig UPDATE micro-optimization (JSONB-coord pre-filter / `source_id IN`); per-row invalid-GeoJSON exception handling (area pass has none either); antimeridian envelope edge (negligible for Toronto).

## Known risks / fences
* **Chesterton's fence:** WHY did 065/098 use `ST_SetSRID(4326)` not `ST_Transform`? Likely pre-WF2#C the `geometry` WAS WGS84 (4326), so `ST_SetSRID` was correct; the 2026-05-09 switch to EPSG:3857 (Spec 56 §2) broke the assumption but 065/098 were never updated. Regression Guardian to confirm geom was correct pre-3857 and that no consumer depends on the (broken) mislabeled geom.
* `link-massing` also has a working JS fallback (reprojects Mercator itself, `link-massing.js:54-84,310-579`) used only when no `geom` column — out of scope; the fast path is what's broken.
* §8e centreline propagation active task preserved → `.cursor/queued_task_spec62_8e_propagation.md`.

## Review Outcome — plan-altitude ROUND 2 (revised plan, 2026-06-10)
**Verdict: PASS — converged.** Round-1 fixes verified correct (lock_timeout, ANALYZE-in-txn, envelope guard, dead-clause drop, test paths, Step 0). New round-2 changes folded in:
- **[Regression Guardian — structural]** 427K UPDATE must NOT run in a migration transaction (`migrate.js` single BEGIN/COMMIT → long `ROW EXCLUSIVE` + no in-txn VACUUM). Codebase precedent: mig 162 moved its 525K geom backfill to `scripts/one-time/backfill-address-points-geom.js`. → **Dropped migration 177; using a one-time backfill script.** RG also confirmed: gate-FAIL does NOT halt the chain (safe); envelope guard cannot double-transform correct rows.
- **[Independent]** gate vars corrected (`processed` + cumulative `massingLinkRate`, not `parcels_queried`); db-test needs `SPEC LINK` header.
- **[DeepSeek]** `geom` added to Spec 56 doc; review-artifact comments stripped from production SQL.
- **DEFER → `review_followups.md`:** invalid-GeoJSON per-row tolerance (area pass shares it — fix both together or not at all), combine area+geom into one UPDATE pass, dual-column single-source-of-truth redesign, antimeridian envelope edge, configurable/min-parcel gate threshold. (Gemini's "VACUUM in the migration" refuted — can't VACUUM in migrate's txn; the one-time-script pivot is the correct resolution.)

> **PLAN LOCKED (round-2 validated, converged). Do you authorize this WF3 plan? (y/n)**
> §10 note: geom backfill is a tracked migration (177) mirroring `load-massing`'s existing area transform — not one-off SQL.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
