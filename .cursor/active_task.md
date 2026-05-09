# Active Task: WF2 #C — backfill `building_footprints.footprint_area_sqm` (and execute deferred cost-model runbook)
**Status:** Implementation
**Workflow:** WF2 (Enhance — add the missing backfill mechanism + fix `load-massing.js` so future loads populate the column correctly + execute the deferred operator runbook for `compute-cost-estimates.js`)
**Domain Mode:** Backend/Pipeline (migration + load-massing.js + post-merge operator runbook)
**Rollback Anchor:** `779ec88` (current HEAD on `main` — realtor sub-gating)
**Multi-Agent Review:** Default WF2 cadence (per project feedback) — Gemini + DeepSeek + worktree code-reviewer in parallel.

## Context

* **Bug:** `building_footprints.footprint_area_sqm` is NULL on all 427,077 rows. Same for `footprint_area_sqft`. Other columns (`max_height_m`, `min_height_m`, `estimated_stories`, `geometry`, `centroid_lat/lng`) are fully populated.
* **Root cause:** `scripts/load-massing.js:327-328` detects the shapefile's Web Mercator projection (EPSG:3857 — coords like `-8821751.236, 5428977.45`) and **explicitly nulls** the area:
  ```js
  const isProjected = ring[0] && (Math.abs(ring[0][0]) > 180 || Math.abs(ring[0][1]) > 180);
  const areaSqm = isProjected ? null : shoelaceArea(ring);
  ```
  The intent was "shoelaceArea only works on WGS84 — null when projected." The fallback (do something useful with the projected ring) was never written.
* **Downstream impact (Spec 83 §3):** `compute-cost-estimates.js` SOURCE_SQL reads `bf.footprint_area_sqm AS footprint_area_sqm` and feeds it into the Brain's `computeGfa()` via the surgical Triangle. With NULL areas across all rows, the Brain falls back to the lot-size path for every permit (`lot_size × coverage_ratio × FALLBACK_*_FLOORS`) — silently wrong for ~237K cost estimates.
* **PostGIS confirmed available** on the dev DB. Live verify: `ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography)` returns 168.12 m² for sample row `id=6347216` (a Toronto building at 43.76°N). Raw Web Mercator area was 322.44 m²; distortion factor ~1.92 = `1/cos²(43.76°)` matches expected.
* **Dependency chain unblocked by this WF:**
  1. Backfill the 427K NULL rows → cost model has true geometric inputs
  2. Re-run `compute-cost-estimates.js` (the WF3 73f3ae6 + 09e8828 + 779ec88 operator runbook step that has been deferred 3 commits) → ~237K `cost_estimates` rows rewrite with the corrected GFA path AND the corrected neighbourhood join AND the (already-shipped) Surgical Triangle gating
* **Target Spec:** `docs/specs/01-pipeline/56_source_massing.md` §2 — amend to note (a) the JSONB geometry is stored in EPSG:3857 Web Mercator, (b) area is computed via PostGIS `ST_Area` post-load, (c) cross-reference Spec 83 §3's GFA dependency.

## Technical Implementation

### Backfill mechanism: SQL migration (single UPDATE pass)

`migrations/122_building_footprints_area_backfill.sql` — idempotent, gated on `WHERE footprint_area_sqm IS NULL`. Runs once via the canonical migrate.js runner; subsequent loads can re-run safely (no-op for already-populated rows).

```sql
-- UP
UPDATE building_footprints
SET
  footprint_area_sqm = ROUND(
    (ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ))::numeric,
    2
  ),
  footprint_area_sqft = ROUND(
    (ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ) * 10.7639104167)::numeric,
    2
  )
WHERE footprint_area_sqm IS NULL;

-- DOWN — comment-only per Rule 6 (mig 121 / commit 8b1c10b precedent)
-- UPDATE building_footprints SET footprint_area_sqm = NULL, footprint_area_sqft = NULL
--   WHERE TRUE;  -- intentionally not transactional; would erase a corrected backfill.
```

Idempotency: re-running mig 122 is a no-op (`WHERE footprint_area_sqm IS NULL` is empty after the first run).

Performance: 427K rows × `ST_Transform + ST_Area` ≈ 30-60 seconds on the dev DB. PostGIS `ST_Area` on geography is C-side; the JSONB-to-geom parsing is the dominant cost. One transactional pass; WAL writes are bounded by the row count.

### Future-load fix: post-INSERT PostGIS pass in `load-massing.js`

Add a single SQL UPDATE pass at the end of the script's batch loop (after all `INSERT ... ON CONFLICT DO UPDATE` batches complete):

```js
// After batch loop completes — DB-side area computation handles BOTH WGS84
// and Web Mercator inputs uniformly (the previous JS-side `isProjected ?
// null` shortcut nulled all 427K rows because the shapefile is EPSG:3857).
// Idempotent: only updates rows where area is NULL.
await pool.query(`
  UPDATE building_footprints
  SET
    footprint_area_sqm = ROUND((ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ))::numeric, 2),
    footprint_area_sqft = ROUND((ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ) * 10.7639104167)::numeric, 2)
  WHERE footprint_area_sqm IS NULL
`);
```

Remove the JS-side `areaSqm = isProjected ? null : ...` shortcut; let the INSERT body emit `null` for the area columns and let the DB-side pass populate them. This fixes future loads without adding a JS reprojection dependency (proj4) and keeps the source of truth in PostGIS.

Alternative considered (rejected): JS-side proj4 reprojection. Rejected because (a) PostGIS is the project's canonical spatial library; (b) computation drift between JS and SQL would create a parity gap; (c) load-massing runs quarterly — perf cost of the post-INSERT UPDATE is negligible.

### Test layering

| File | New / extended assertions |
|---|---|
| **NEW** `src/tests/migration-122-building-footprints-area-backfill.infra.test.ts` | SQL-shape regression-lock — text regex over the migration body. Asserts (a) UPDATE references `building_footprints`, (b) reads `geometry::text`, (c) uses `ST_Transform` and `ST_SetSRID(..., 3857)` and `::geography`, (d) `WHERE footprint_area_sqm IS NULL` idempotency guard, (e) sets BOTH `footprint_area_sqm` and `footprint_area_sqft`, (f) sqft conversion factor `10.7639104167` is correct, (g) DOWN block is comment-only per Rule 6. Mirrors mig 121 test pattern. |
| **NEW** `src/tests/db/building-footprints-area.db.test.ts` | Layer 2 live-DB regression-lock. Seeds a `building_footprints` row with a known Web Mercator polygon (e.g., 100m × 100m square in Toronto-ish coordinates); runs the backfill UPDATE; asserts area is within tolerance of 10,000 m² (small distortion at that latitude is acceptable; assert within ±5%). Then a second test seeds a row with a WGS84 polygon (lat/lng coords, deg) and asserts area is computed correctly via the same SQL — confirming the EPSG:3857 SetSRID assumption is robust against accidentally already-WGS84 inputs. |
| **EXTEND** `src/tests/load-massing.infra.test.ts` (if exists; otherwise NEW) | SQL-shape regression-lock for the new post-INSERT UPDATE pass in load-massing.js — text regex assertion that the script contains the `UPDATE building_footprints SET footprint_area_sqm = ROUND(...)` pattern AND no longer contains the `isProjected ? null : shoelaceArea` shortcut. |
| **MODIFIED** `src/tests/db/lead-inspect-query.db.test.ts` | One assertion update: `building_footprints.footprint_area_sqm` is no longer always NULL → the inspector's `spatial.massing.area_sqm` field comes back populated for the seeded chain. The current test already expects `pb_area_sqm` to come through (commit 76dd665 schema fix); now it expects a non-null value. |

### Spec 56 amendment

`docs/specs/01-pipeline/56_source_massing.md` §2 — add a note:

> **Geometry projection (WF2 #C 2026-05-09):** the shapefile's GeoJSON polygon is stored in EPSG:3857 (Web Mercator pseudo-meters), not WGS84. Area columns (`footprint_area_sqm`, `footprint_area_sqft`) are computed at load-time via PostGIS `ST_Area(ST_Transform(ST_SetSRID(geom, 3857), 4326)::geography)` — the JS-side `shoelaceArea` only handles WGS84 and was previously skipping Web Mercator inputs (the 427K-NULL bug class repaired in mig 122). The post-INSERT UPDATE pass in `load-massing.js` covers all rows; mig 122 is the one-shot fix for the legacy NULL state. Cross-reference Spec 83 §3 — the cost model's Surgical Triangle depends on `footprint_area_sqm` for GFA Step A.

### Files (Modified / New)

- **NEW** `migrations/122_building_footprints_area_backfill.sql` — the UPDATE migration
- **MODIFIED** `scripts/load-massing.js` — remove `isProjected ? null` shortcut; add post-INSERT UPDATE pass; emitMeta declares the area columns as writes
- **NEW** `src/tests/migration-122-building-footprints-area-backfill.infra.test.ts` — SQL-shape regression-lock (~7 assertions)
- **NEW** `src/tests/db/building-footprints-area.db.test.ts` — Layer 2 live-DB regression-lock (2 fixtures: Web Mercator + WGS84; ±5% tolerance)
- **MODIFIED** `src/tests/load-massing.infra.test.ts` (or NEW if absent) — extend with the post-INSERT-UPDATE shape lock + forbid the `isProjected ? null` shortcut
- **MODIFIED** `src/tests/db/lead-inspect-query.db.test.ts` — flip the massing assertion to expect non-null area
- **MODIFIED** `docs/specs/01-pipeline/56_source_massing.md` §2 — add Geometry projection note + Spec 83 §3 cross-reference
- **MODIFIED** `docs/specs/01-pipeline/83_lead_cost_model.md` §3 — one-line note that the GFA Step A dependency is now end-to-end populated (footnote, not contract change)

### Database Impact

ONE migration (mig 122) updating 427,077 rows. Single transactional UPDATE; PostGIS-side computation. WAL impact: ~427K row updates with two NUMERIC columns each. Estimated runtime: 30-60s on the dev DB; CONCURRENTLY-style chunking is unnecessary because the UPDATE doesn't touch any unique index column or constraint.

After mig 122 lands, the operator runbook runs `node scripts/compute-cost-estimates.js`. The `IS DISTINCT FROM` UPSERT guard limits the WAL writes to rows whose `estimated_cost`/`premium_factor`/`effective_area_sqm`/`trade_contract_values` change under the corrected GFA path. Expected: a large share of the 237K rows rewrite (because nearly every cost estimate's GFA was on the lot-size fallback path).

## Standards Compliance

* **§3.1 Zero-downtime migration:** mig 122's UPDATE on 427K rows is a transactional pass — does not touch unique constraints, indexes, or PK; safe at scale; idempotent via `WHERE ... IS NULL`. Add-Backfill-Drop pattern doesn't apply (no column add/drop).
* **§9.1 Transaction Boundaries:** the new post-INSERT UPDATE in `load-massing.js` runs as a single statement (auto-commit); it doesn't need to be inside the existing batch transaction because it's idempotent and the rows are already committed.
* **§9.3 Idempotent scripts:** both the migration and the load-massing post-pass use `WHERE footprint_area_sqm IS NULL` — re-running is a no-op once populated.
* **Spec 47 §R*:** unchanged contract for load-massing.js — it remains a Pipeline SDK consumer; the new UPDATE is a single `pool.query` after the batch loop.
* **Spec 56 §2:** amended to document the projection handling and the PostGIS-driven area pipeline.
* **Rule 6 (commit 8b1c10b):** mig 122's DOWN block is comment-only.

## State Verification (DONE before plan-lock)

* Confirmed all 427,077 building_footprints rows have `geometry IS NOT NULL` (Web Mercator EPSG:3857 polygons), `max_height_m IS NOT NULL`, `centroid_lat/lng IS NOT NULL`, but `footprint_area_sqm IS NULL` and `footprint_area_sqft IS NULL`.
* Confirmed PostGIS extension is installed.
* Live verified `ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography)` returns 168.12 m² for sample row id=6347216 — a Toronto building at 43.76°N. Web Mercator distortion factor matches expected (~1.92 = `1/cos²(43.76°)`).
* Confirmed `load-massing.js:327-328` is the source of the NULL — `areaSqm = isProjected ? null : shoelaceArea(ring)`.
* Confirmed `Spec 56 §2` does not currently document the projection.

## Execution Plan

- [ ] **R1** — Rollback anchor confirmed: `779ec88`. Branch: `main`.
- [ ] **R2** — State verification: re-run the data-state queries for confirmation.
- [ ] **R3** — Spec Review: re-read Spec 56 §2, Spec 83 §3 (the GFA Step A consumer), Spec 47 §R3.5 + §R6 (no DDL but the migration runner conventions).
- [ ] **R4** — Reproduction tests FIRST (Red Light), one file at a time:
  - NEW `migration-122-building-footprints-area-backfill.infra.test.ts` — 7 assertions; run vitest → MUST fail (file doesn't exist yet).
  - NEW `src/tests/db/building-footprints-area.db.test.ts` — 2 live-DB fixtures; run with DATABASE_URL → MUST fail (mig 122 not yet applied; the SQL UPDATE doesn't exist; future-form schema mismatch).
  - EXTEND `src/tests/load-massing.infra.test.ts` (or NEW) — assertions on the post-INSERT UPDATE and forbidden `isProjected ? null` shortcut; MUST fail.
  - MODIFY `lead-inspect-query.db.test.ts` — flip massing area assertion to expect non-null; current state still NULL → MUST fail.
- [ ] **R5** — Implementation (one file at a time):
  - `migrations/122_building_footprints_area_backfill.sql` — UPDATE migration
  - `scripts/load-massing.js` — remove the `isProjected ? null` shortcut; add post-INSERT UPDATE pass; emit-meta entry
  - `docs/specs/01-pipeline/56_source_massing.md` §2 — Geometry projection note
  - `docs/specs/01-pipeline/83_lead_cost_model.md` §3 — one-line note about end-to-end GFA dependency
- [ ] **R6** — Green Light: targeted tests pass; `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: apply mig 122 against the dev DB; verify all 427K rows have non-null area; re-apply mig 122 → no-op (`UPDATE 0 rows`).
- [ ] **R8** — Live verification:
  - `npm run migrate` runs mig 122 successfully against dev DB; verify row sample (id=6347216) has the expected ~168 m².
  - Sample 5 random rows; verify computed areas are reasonable (10-10,000 m² range for typical Toronto buildings).
  - **Then execute the deferred runbook**: `node scripts/compute-cost-estimates.js` against the dev DB. Verify the audit_table reports a meaningful number of `permits_updated` rows (was likely 0-100 in prior runs since GFA was on lot-size fallback for everything; now should be meaningful).
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. Mig 122 idempotent (`WHERE ... IS NULL`); DOWN comment-only?
  2. `load-massing.js` post-INSERT UPDATE present; `isProjected ? null` shortcut removed; emit-meta declares the area columns?
  3. Layer 2 live-DB test confirms area within ±5% tolerance for the seeded fixture?
  4. `lead-inspect-query.db.test.ts` flipped expectation correctly (non-null area)?
  5. Commit message documents BOTH the runbook step (re-run compute-cost-estimates) AND the migration applied (mig 122)?
- [ ] **R10** — **Multi-Agent Review (default WF2 cadence per project feedback):**
  - Gemini: review `scripts/load-massing.js` against `docs/specs/01-pipeline/56_source_massing.md`
  - DeepSeek: review `migrations/122_building_footprints_area_backfill.sql` against `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (migration conventions) + Spec 56
  - Worktree code-reviewer: full diff against migration 109 / Rule 6 / Spec 56 amended contract; generate own checklist
  - Triage: BUG → file new WF3 before Green Light; DEFER → append to `docs/reports/review_followups.md`.
- [ ] **R11** — Atomic commit on `main`: `feat(56_source_massing): WF2 — backfill 427K NULL footprint_area_sqm rows via PostGIS ST_Area + fix load-massing.js Web Mercator nulling`. Spec 05 §5 footer with operator runbook.
- [ ] **R12** — Push `main`.

§10 note: 2 sites bundled (mig 122 + load-massing.js) — same root cause (Web Mercator nulling); atomic revert is simpler than 2 commits. Multi-agent review default WF2 cadence; 3 parallel reviewers. Operator runbook step (post-merge re-run of compute-cost-estimates.js) is the deferred dependency this WF unblocks.

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> §10 note: SQL backfill mig 122 + load-massing.js post-INSERT UPDATE; deferred compute-cost-estimates runbook executed at R8; multi-agent review.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
