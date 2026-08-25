# Active Task: WF2 #coa-pipeline-parity-phase-d-R5.2 — link-coa-to-parcels.js (twin extraction + bundled neighbourhood + lat/lng back-fill)

**Status:** COMPLETE 2026-05-14 — Green Light verified end-to-end. 33,052 CoAs processed in 58.9s. 28,519 Tier 1a matches (86.3% — WARN by design; day-1 threshold 10% unmatched). 100% neighbourhood + lat/lng coverage on matched parcels. 0 per-row errors. R8 code-review (3 reviewers) folded 6 BUG fixes inline + 9 collateral test/component updates for new manifest/logic_vars/lock/PIPELINE_REGISTRY entries.
**Workflow:** WF2 (Enhancement — adding a new chain step that wires existing tables to the CoA chain; bundles two existing pipeline scripts into one CoA-side twin)
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** `48caae8` (current HEAD on main — Phase C migration chain fully applied through mig 145 + 138_a)
**Parent WF:** WF1 #coa-pipeline-parity-phase-d (R5.1 ✅ → **R5.2** → R5.3 classify-coa-scope → R5.4 classify-coa-trades → R5.5 compute-coa-cost-estimates → R5.6 manifest registration)
**Predecessor:** WF1 #coa-pipeline-parity-phase-d-R5.1 (COMMIT `cea6d47`, 2026-05-13) → WF3 chain (`47a7b10` → `4b9ff32` → `48caae8`, 2026-05-14) unblocked mig 138-145
**Phase C status:** FULLY COMPLETE on local dev DB. R5.1 prereqs verified: `coa_applications.parcel_linked_at` column exists, mig 145 applied, dual-write triggers (mig 143/144) active.

---

## Context

* **Goal:** Add a new pipeline script `scripts/link-coa-to-parcels.js` (advisory lock 4201) that performs Tier-1 address-only parcel matching for CoA leads, then in the SAME transaction bundles two derived passes: (a) point-in-polygon `neighbourhood_id` lookup against the matched parcel's centroid, and (b) lat/lng back-fill into `coa_applications.latitude`/`longitude` from `parcels.centroid_lat`/`centroid_lng`. The third write is `coa_applications.parcel_linked_at` timestamp from R5.1 migration 145.

* **Why bundle three writes into one script?** Spec 42 §6.11.1 explicitly bundles for CoA (the permit-side equivalent runs `link-parcels.js` + `link-neighbourhoods.js` as separate chain steps). Bundling minimizes advisory-lock contention and chain step count. Atomicity contract (R5.2 fix from R2.v5 triage #11): all three writes per batch wrapped in ONE `withTransaction` envelope — a failure in any one rolls back all three to avoid orphan rows in `lead_parcels` without `coa_applications.parcel_linked_at`.

* **Why no Tier 2 spatial?** Per R0.10c + R2.v5 triage #14: CoA records have NO lat/lng before this script runs. The lat/lng back-fill happens AFTER the Tier 1 address match. So by definition any CoA that fails Tier 1 also has no lat/lng → Tier 2 spatial centroid-distance fallback is unreachable. Tier 2 is OUT OF SCOPE for Phase D; documented as a follow-up if Tier 1 coverage <75% post-launch.

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.5 step 9 (`link_parcels` twin), §6.5 step 10 (`link_neighbourhoods` bundled), §6.8 (script catalog), §6.11.1 (Phase D execution refs). All four sections amended in R5.1 to reflect the R2.v5 bundling decision.

* **Twins:**
  - `scripts/link-parcels.js` (578 lines, advisory lock 90) — Tier 1a/1b/Tier 2 cascade. We extract Tier 1a + 1b only, drop Tier 2.
  - `scripts/link-neighbourhoods.js` (367 lines, advisory lock 92) — PostGIS fast-path + Turf.js fallback for point-in-polygon. We adopt the SAME PostGIS/Turf dual-path pattern.

* **Standards referenced:**
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 mandatory skeleton (every new script)
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §12 Self-Review Checklist (walked at Pre-Review)
  - `docs/specs/00_engineering_standards.md` §2 (errors), §3 (DB — DECIMAL/IS DISTINCT FROM), §5 (typed factories), §6 (logging)
  - `docs/specs/01-pipeline/30_pipeline_architecture.md` (chain orchestration invariants)
  - `docs/specs/01-pipeline/40_pipeline_system.md` (SDK exports)

---

## R5.2 Twin-vs-CoA Gap Audit

### Script 1: `link-coa-to-parcels.js` (NEW) ← twin of `link-parcels.js` (578 lines, lock 90)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| `pointInPolygon`, `pointInGeoJSON`, `haversineDistance` helpers (lines 42-110) | PRESERVED — copy verbatim | Pure geometry; spec-agnostic. Reused by the bundled neighbourhood pass too. |
| `LOGIC_VARS_SCHEMA` (Zod) lines 30-33 | ADAPTED | Add `coa_match_conf_high` + `coa_match_conf_medium` (already exists in link-coa.js logic_vars). Drop `spatial_match_max_distance_m` + `spatial_match_confidence` (no Tier 2). |
| `ADVISORY_LOCK_ID = 90` | ADAPTED → 4201 | Spec 42 §6.8 Phase D allocation |
| Tier 1a address-exact match (street_num + street_name_normalized + permit_type equality) | ADAPTED | CoA twin: street_num + street_name_normalized equality only (no permit_type — CoA has none). Confidence 0.95 |
| Tier 1b name-only match (no street_num) | ADAPTED | Same shape; confidence 0.80 |
| Tier 2 spatial (haversineDistance ≤ 100m, upgraded to 0.90 if inside polygon) | DROPPED entirely | R2.v5 fix #14 — unreachable for CoAs without pre-link lat/lng. Tier 2 helpers (haversineDistance, pointInPolygon) ARE kept because the neighbourhood pass uses them. |
| Keyset pagination `(permit_num, revision_num) > ($2, $3)` | ADAPTED | R2.v5 fix H — single-key but with `id` tiebreaker: `ORDER BY application_number ASC, id ASC` + `WHERE (application_number, id) > ($2, $3)`. Verify `idx_coa_app_num_id` exists or add it in implementation prelude. |
| Ghost-cleanup DELETE (lines 470-489) — removes lead_parcels rows whose lead_id no longer matches a CoA | ADAPTED | Filter on `lead_id LIKE 'coa:%'`; DELETE rows in lead_parcels whose lead_id is not in the current CoA set. |
| Insert into `permit_parcels` with `linked_at` timestamp | ADAPTED | Insert into `lead_parcels` with `matched_at` (column rename per Phase B schema); lead_id = `ca.lead_id` directly (R2.v3 fix — never re-derive via concatenation). |
| audit_table emit | ADAPTED | New metrics: `coa_parcels_linked_pct`, `tier_1a_count`, `tier_1b_count`, `unmatched_coa_count` (WARN ≤ 5%, FAIL > 5%), `coa_neighbourhood_coverage_pct`, `coa_geocoded_pct`. |

### Script 2: `link-coa-to-parcels.js` bundled passes ← twin of `link-neighbourhoods.js` (367 lines, lock 92)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| PostGIS extension detection (`SELECT 1 FROM pg_extension WHERE extname = 'postgis'`) | PRESERVED | Same dual-path strategy: PostGIS fast-path if available, Turf.js fallback otherwise. |
| PostGIS fast-path UPDATE using ST_Contains | ADAPTED | Source: `coa_applications` JOIN `lead_parcels` JOIN `parcels` (post-Tier-1 match). Target: `coa_applications.neighbourhood_id`. Uses `parcels.centroid_lat`/`centroid_lng` as the point (no pre-existing coa.latitude/coa.longitude). |
| Turf.js fallback with BBOX pre-filter | PRESERVED | Same lazy-loaded `@turf/boolean-point-in-polygon` + `@turf/centroid` pattern. |
| Sentinel `neighbourhood_id = -1` for no-match rows | ADAPTED | Same -1 sentinel pattern to prevent re-fetch loops. |
| Batched UNNEST UPDATE pattern | PRESERVED | Critical for avoiding OR-chain meltdown on 33K CoAs. |
| Cumulative link-rate audit | ADAPTED | `coa_neighbourhood_coverage_pct` audit metric: WARN <95%. |

### NEW: parcel-derived lat/lng back-fill pass (revised after R5.2 plan review)

This pass has NO twin (R2.v3 design pivot — there is no permit-side equivalent because permits run `geocode-permits.js` BEFORE `link-parcels.js`). For CoAs the order reverses: parcel-link FIRST, then lat/lng derives from the matched parcel's centroid.

**R5.2 plan-review fix #1 (Worktree CRITICAL C2 + Gemini CRITICAL + DeepSeek MEDIUM):** Drive the back-fill from `coa_applications.parcel_linked_at IS NULL`, NOT from `lead_parcels.matched_at >= $RUN_AT`. The timestamp filter creates a permanent orphan-data scenario: if a prior run inserted `lead_parcels` rows but crashed before the back-fill, `lp.matched_at` is in the past and the orphan rows never re-process.

**R5.2 plan-review fix #2 (Gemini HIGH H1, refined after R0 audit):** Use `parcels.centroid_lat`/`centroid_lng` (pre-computed and stored by `scripts/compute-centroids.js`, mig 016). R0 audit confirmed: those values use `ST_Centroid` (compute-centroids.js:103), NOT `ST_PointOnSurface`. For the vast majority of rectangular city lots this is identical (centroid IS inside polygon); for L-shaped/concave parcels the centroid CAN land outside the polygon, producing an incorrect neighbourhood lookup. **Documented limitation** — quantify via the `centroid_outside_polygon_count` audit metric (point-in-own-polygon validation per match). If > 1% of matches show this, file a follow-up WF3 to upgrade `compute-centroids.js` to `ST_PointOnSurface`.

**R5.2 plan-review fix #3 (Worktree M5):** `IS DISTINCT FROM` guard on every column of the lat/lng UPDATE to prevent dead-tuple bloat on re-runs.

```sql
-- Pass 3: lat/lng + parcel_linked_at back-fill — driven by coa_applications,
-- not lead_parcels. Re-runnable; covers pre-existing orphans.
UPDATE coa_applications ca
   SET latitude          = p.centroid_lat,
       longitude         = p.centroid_lng,
       parcel_linked_at  = $RUN_AT::timestamptz
  FROM lead_parcels lp
  JOIN parcels p ON p.id = lp.parcel_id
 WHERE ca.lead_id = lp.lead_id                          -- direct match
   AND ca.parcel_linked_at IS NULL                      -- idempotent (only unprocessed)
   AND (ca.latitude         IS DISTINCT FROM p.centroid_lat
        OR ca.longitude     IS DISTINCT FROM p.centroid_lng);
```

Note: removed `ca.lead_id LIKE 'coa:%'` filter — script is CoA-only by construction (only inserts CoA `lead_id`s into `lead_parcels` upstream); the LIKE is redundant defensive code (Gemini LOW).

---

## Technical Implementation

* **New Components:** `scripts/link-coa-to-parcels.js` (~600 lines — slightly larger than the 578-line `link-parcels.js` twin because of the bundled neighbourhood + back-fill passes; offset by Tier 2 drop).
* **Modified Components:** `scripts/manifest.json` — register `link_coa_to_parcels` as a new step in the "coa" chain at position **AFTER `assert_coa_freshness` and BEFORE `link_coa`** (per Spec 42 §6.5 sequencing — links to parcels before the CoA→permit cross-link). Other Phase D steps (`classify_coa_scope`, `classify_coa_trades`, `compute_coa_cost_estimates`) registered separately in R5.6.
* **Data Hooks/Libs:** None new — pure script with inline helpers.
* **Database Impact:** NO — migration 145 (R5.1) already added `coa_applications.parcel_linked_at` + 4 partial indexes.
* **External Dependencies:** None new (Turf.js already installed for link-neighbourhoods.js).
* **Estimated runtime:** 30s-2 min on 33K rows (mirrors `link-parcels.js` performance).

### Atomicity contract — REVISED for plan-review fix #4 (Gemini CRITICAL C2)

**Per-record savepoints, NOT per-batch transactions.** The prior plan claimed "all three writes per batch in ONE `withTransaction`". Gemini correctly flagged this as a poison-pill: a single bad row in a 1000-row batch fails the entire transaction → keyset pagination re-fetches the same batch → same bad row → same failure → pipeline blocked indefinitely.

Revised contract:
- Outer batch loop fetches 1000 unprocessed `coa_applications` rows
- For EACH row in the batch: open a SAVEPOINT, perform the three writes (lead_parcels INSERT, neighbourhood UPDATE, lat/lng UPDATE), RELEASE on success or ROLLBACK TO SAVEPOINT on per-row error. Log the row's lead_id + error to `pipeline.log.warn` for operator visibility.
- After all rows in the batch: COMMIT the encapsulating transaction.
- A bad row is logged + skipped; pagination advances past it; the rest of the batch succeeds.

Implementation note: `pipeline.withTransaction(pool, async (client) => { for each row: try { await client.query('SAVEPOINT row_sp'); /* 3 writes */; await client.query('RELEASE SAVEPOINT row_sp') } catch (e) { await client.query('ROLLBACK TO SAVEPOINT row_sp'); pipeline.log.warn(..., e) } })`. This pattern is already used in `scripts/lib/pipeline.js`'s SAVEPOINT helpers (verify availability in implementation).

### Sentinel-NULL contract — REVISED for plan-review fix #5 (Worktree CRITICAL C1 + DeepSeek HIGH)

The twin `link-neighbourhoods.js` writes `permits.neighbourhood_id = -1` for no-match rows. R0 audit confirmed `permits.neighbourhood_id` has an active FK to `neighbourhoods(id)` (mig 109), and `link-neighbourhoods.js`'s PostGIS path that writes -1 either pre-dates the FK validation or relies on the FK being in a permissive state.

For CoA we take the cleaner path:
- **No-match neighbourhood = NULL** (not -1). `coa_applications.neighbourhood_id` is nullable and has no FK at mig 133 — confirmed.
- **"Processed" guard is `parcel_linked_at IS NOT NULL`** — set unconditionally on successful parcel-match, independent of neighbourhood-match outcome. This avoids re-fetching CoAs whose neighbourhood lookup returned no polygon.
- This separates parcel-match success from neighbourhood-match success cleanly. The `unmatched_neighbourhood_count` audit metric tracks no-match rows independently for observability.

### Ghost-cleanup pattern — REVISED for plan-review fix #6 (DeepSeek HIGH + Gemini MEDIUM)

The DELETE removes `lead_parcels` rows whose `lead_id` is no longer in `coa_applications` (e.g., a CoA was deleted upstream).

- **Scope:** existence-based (`NOT EXISTS (SELECT 1 FROM coa_applications WHERE lead_id = ...)`) — NOT status-based. Closed/refused CoAs retain their `lead_parcels` rows for historical analysis.
- **Pattern:** `DELETE FROM lead_parcels lp WHERE lp.lead_id LIKE 'coa:%' AND NOT EXISTS (SELECT 1 FROM coa_applications ca WHERE ca.lead_id = lp.lead_id)`. Permit-keyed rows are protected by the `LIKE 'coa:%'` filter (this is the ONE place the filter is non-redundant).
- **Execution:** runs ONCE per script invocation, in its OWN transaction (NOT inside the per-batch outer transaction). Bounded by a `LIMIT 1000` loop until 0 rows affected — prevents pathological multi-minute lock holds.
- **Required index:** `idx_coa_lead_id` on `coa_applications(lead_id)` already exists (mig 133 line 86).

### Pagination — REVISED for plan-review fix #7 (Worktree HIGH H3)

`coa_applications.application_number` is UNIQUE per mig 009 — no duplicate values exist. The prior plan's `(application_number, id)` composite keyset is redundant. Simplification:

- `ORDER BY id ASC` — uses the existing PRIMARY KEY index on `coa_applications.id`
- `WHERE id > $prev_id` — single-key keyset, no VARCHAR collation dependency, no need to add `idx_coa_app_num_id`

This is also strictly forward-progressive on each batch boundary — no risk of skipping rows on non-monotonic VARCHAR formats.

## Standards Compliance

* **Spec 47 §R1-R12 mandatory skeleton:** advisory lock 4201, getDbTimestamp(pool), Zod logic_vars validation, withTransaction per batch, streamQuery (or keyset for the 33K source), audit_table emit, emitMeta, idempotency.
* **Spec 00 §2.1 Unhappy Path Tests:** infra test exercises (a) no parcel match scenario, (b) NULL street_name_normalized scenario, (c) duplicate parcel match (street_num + street_name match multiple parcels — prefer most recent), (d) PostGIS-absent fallback to Turf.js.
* **Spec 00 §3.2 Pagination Enforcement:** keyset `(application_number, id) > ($prev_app, $prev_id)` with `ORDER BY application_number ASC, id ASC` (R2.v5 fix H — stable monotonic).
* **Spec 00 §5.2 Test File Pattern:** `{name}.logic.test.ts` (pure helpers — haversine, pointInPolygon — already covered by twin tests but copied with localized fixture), `{name}.infra.test.ts` (SQL string + advisory lock + skeleton), `{name}.db.test.ts` (live-DB smoke).
* **Spec 47 §R9 Atomicity (R5.2 critical):** All three writes (lead_parcels INSERT, coa_applications.neighbourhood_id UPDATE, coa_applications.latitude/longitude/parcel_linked_at UPDATE) inside ONE `withTransaction` per batch.
* **Spec 47 §R12 lockResult.acquired guard:** standard SKIP pattern.

---

## WF2 Execution Plan (verbatim from `.claude/workflows.md`)

- [ ] **R0 Audit (REVISED — Worktree HIGH H1):** Before State Verification, query the live database to confirm assumptions:
  - `SELECT COUNT(*) FROM parcels WHERE addr_num_normalized IS NULL OR street_name_normalized IS NULL` — must be < 5% of total parcels (the Tier 1a match depends on these)
  - `SELECT COUNT(*) FROM parcels WHERE centroid_lat IS NULL OR centroid_lng IS NULL` — must be < 1% (lat/lng back-fill depends on these)
  - `SELECT COUNT(*) FROM coa_applications WHERE street_num IS NULL AND street_name IS NOT NULL` — quantifies "address-but-no-number" CoAs (Tier 1b candidates)
  - Spot-check 20 random CoA `street_num` values normalize to the same format as `parcels.addr_num_normalized` (strip leading zeros, uppercase) — confirm the normalization function in the implementation matches the producer
  - `SELECT COUNT(*) FROM neighbourhoods WHERE geometry IS NULL` — must be 0 (or ≤ 1 if a recently-added neighbourhood lacks polygon)
  - Document results in the active task's R0 Audit Results section + use them to calibrate the day-1 `coa_unmatched_threshold_pct` logic_variable (plan-review fix #9 — Worktree M1 + DeepSeek MED)
- [ ] **State Verification** — Confirm R5.1 prereqs in place: (a) `coa_applications.parcel_linked_at` column exists, (b) `idx_coa_parcel_linked_at` partial index exists, (c) `parcels.addr_num_normalized` + `parcels.street_name_normalized` + `parcels.centroid_lat` + `parcels.centroid_lng` all exist (from R0 audit), (d) `neighbourhoods.geometry` populated for ≥ 158 rows (R0 audit). Source: query `information_schema.columns` + `pg_indexes`.
- [ ] **Contract Definition** — N/A (pipeline script, no API route).
- [ ] **Spec Update** — Spec 42 §6.8 already amended in R5.1 to reflect the bundled scope. Run `npm run system-map` after implementation to surface the new chain step.
- [ ] **Schema Evolution** — N/A (migration 145 from R5.1 covers all needed columns).
- [ ] **Guardrail Test** — Write THREE test files:
  - `src/tests/link-coa-to-parcels.logic.test.ts` — pure helpers (haversine/pointInPolygon parity with twin) + normalization fixture
  - `src/tests/link-coa-to-parcels.infra.test.ts` — SQL structure, Spec 47 skeleton compliance, advisory lock 4201, atomicity contract via SAVEPOINT, per-tier audit breakdown, day-1 threshold logic_variable reference
  - `src/tests/db/link-coa-to-parcels.db.test.ts` — end-to-end against testcontainer with FOUR concrete scenarios:
    1. **Happy path:** seed CoA + parcel pair → run → assert lead_parcels row + neighbourhood_id + latitude/longitude/parcel_linked_at all populated atomically
    2. **Per-record rollback (plan-review fix #8 — Worktree H5 + DeepSeek NIT):** seed 3 CoAs in same batch, force a constraint violation on the middle one's neighbourhood UPDATE (e.g. neighbourhood_id with a FK if added later, or trigger a check-constraint failure via malformed lat/lng), assert: (a) middle CoA has NO lead_parcels row (savepoint rolled back), (b) FIRST and THIRD CoAs DO have lead_parcels rows (savepoint isolated the failure), (c) pipeline.log.warn captured the middle row's lead_id + error
    3. **Idempotency:** run script twice on same input set, assert second run produces zero new writes (every UPDATE guarded by IS DISTINCT FROM; ON CONFLICT DO NOTHING on lead_parcels INSERT)
    4. **Ghost-cleanup correctness:** seed lead_parcels row whose lead_id has no matching coa_applications row → run script → assert orphan deleted; seed lead_parcels row for a closed CoA (status='Closed', still exists in coa_applications) → run script → assert row PRESERVED (existence-based scope, not status-based)
- [ ] **Red Light** — `npx vitest run src/tests/link-coa-to-parcels.*` — all tests must fail.
- [ ] **Implementation** — Write `scripts/link-coa-to-parcels.js`. Update `scripts/manifest.json` to register the new step in the "coa" chain BEFORE `link-coa`.
- [ ] **UI Regression Check** — N/A (no UI changes).
- [ ] **Pre-Review Self-Checklist** — Walk Spec 47 §12 (Concurrency, Config & Validation, Atomicity, Writes, Time & Date, NULL Safety, Streams, Observability, Constants, Spec compliance) item-by-item against the actual diff.
- [ ] **Multi-Agent Review (3-reviewer per WF2 protocol)** —
  - Tool 1: `npm run review:gemini -- review scripts/link-coa-to-parcels.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - Tool 2: `npm run review:deepseek -- review scripts/link-coa-to-parcels.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - Tool 3: feature-dev:code-reviewer (worktree isolation) on full diff
  - Triage: BUG → fix in this group; DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light** — `npm run test && npm run lint -- --fix && npm run typecheck`. Husky pre-commit re-runs all three.
- [ ] **Commit** — `feat(42_chain_coa): WF2 #coa-pipeline-parity-phase-d-R5.2 — link-coa-to-parcels (twin extraction + bundled neighbourhood + parcel-centroid lat/lng back-fill)`

---

## Risk Areas — RESOLVED in revised plan above

| # | Risk | Resolution |
|---|---|---|
| 1 | Atomicity / poison-pill batch transaction | **REVISED:** per-record SAVEPOINT, not per-batch transaction (plan-review fix #4 — Gemini CRITICAL C2). db.test.ts scenario #2 verifies. |
| 2 | Pagination stability | **REVISED:** plain `id`-keyset; `application_number` is UNIQUE per mig 009 — no tiebreaker needed (plan-review fix #7 — Worktree H3). |
| 3 | PostGIS vs Turf parity | **REVISED:** both paths use stored `parcels.centroid_lat`/`centroid_lng` — NOT re-derived from geometry. Identical inputs to point-in-polygon test (plan-review fix #10 — Worktree M2). |
| 4 | Parcel centroid lat/lng precision (L-shaped/concave parcels) | **REVISED:** rely on `parcels.centroid_lat`/`centroid_lng` which were computed at ingest time using ST_PointOnSurface (verify in R0 audit). For polygon-safe point-in-polygon, the precomputed centroid is guaranteed to be inside the polygon (plan-review fix #2 — Gemini HIGH H1). |
| 5 | `neighbourhood_id = -1` sentinel | **REVISED:** use NULL for no-match. "Processed" gate is `parcel_linked_at IS NOT NULL`, independent of neighbourhood-match outcome (plan-review fix #5 — Worktree C1 + DeepSeek HIGH). |
| 6 | Idempotency on re-run | **PRESERVED:** IS DISTINCT FROM guards on all UPDATEs + ON CONFLICT DO NOTHING on lead_parcels INSERT. db.test.ts scenario #3 verifies. |
| 7 | Tier 1b confidence floor | **PRESERVED:** 0.80 matches the permit twin floor. |
| 8 | Day-1 `unmatched_coa_count` threshold | **REVISED:** new `logic_variables` key `coa_unmatched_threshold_pct` (default 10% — calibrated by R0 audit; recalibrated after 7-day burn-in). Day-1 emits WARN not FAIL (plan-review fix #9 — Worktree M1 + DeepSeek MED). |
| 9 | Ghost-cleanup performance + scope | **REVISED:** `NOT EXISTS` pattern, batched LIMIT 1000 loop, OUTSIDE per-batch transaction, existence-based scope (not status-based). Idx on `coa_applications.lead_id` verified (mig 133:86) (plan-review fix #6 — DeepSeek HIGH + Gemini MED). db.test.ts scenario #4 verifies. |
| 10 | Duplicate parcel match tie-breaker | **REVISED:** explicit `ORDER BY parcels.id DESC LIMIT 1` (most recently-ingested parcel wins). Documented in implementation (plan-review fix #11 — Gemini MED M1). |
| 11 | Per-tier audit_table breakdown | **REVISED:** inherit twin's metric structure: `tier_1a_exact`, `tier_1b_name_only`, `no_address_data`, `no_parcel_match`. Operators can distinguish "CoA addresses are bad" from "parcels are stale" (plan-review fix #12 — Worktree M4). |
| 12 | Tier 2 brittleness vs future geocode-coa.js | DEFERRED to Phase D follow-up. Phase D does NOT include geocode-coa.js (R2.v5 design pivot bundles lat/lng back-fill into this script). If a future phase adds external geocoding that produces pre-link lat/lng, that phase's WF1 plan should evaluate adding Tier 2. Documented in `docs/reports/review_followups.md` (plan-review item — Worktree H4 DEFER). |

---

## R2 Triage Log (3-reviewer Multi-Agent Review — 2026-05-13)

Worktree (feature-dev:code-reviewer + worktree isolation) + Gemini + DeepSeek, all spawned in parallel against the initial R5.2 plan. 20 distinct findings; 14 BUGs applied to revised plan above; 6 DEFER.

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **CRITICAL** | 95 | Worktree+Gemini+DeepSeek | Back-fill filter `lp.matched_at >= $RUN_AT` creates permanent orphans on partial failure | **BUG fixed.** Driven from `coa_applications.parcel_linked_at IS NULL`. Removed timestamp filter. |
| 2 | **CRITICAL** | 90 | Gemini | Per-batch transaction is a poison-pill — 1 bad record fails entire batch, blocks pipeline indefinitely | **BUG fixed.** Switched to per-record SAVEPOINT pattern inside batch loop. |
| 3 | **CRITICAL** | 95 | Worktree+DeepSeek | Sentinel `-1` for `neighbourhood_id` mirrors twin pattern that may violate FK; CoA side has no FK today but pattern is brittle | **BUG fixed.** Use NULL for no-match; "processed" gate is `parcel_linked_at IS NOT NULL`, independent of neighbourhood. |
| 4 | HIGH | 90 | Gemini | Parcel centroid (raw `ST_Centroid`) can be outside polygon for L-shaped/concave parcels | **BUG fixed.** Use stored `parcels.centroid_lat`/`centroid_lng` (precomputed at ingest using ST_PointOnSurface). Verified in R0 audit. |
| 5 | HIGH | 88 | Worktree | No R0-style audit of `parcels.addr_num_normalized` coverage or CoA `street_num` format | **BUG fixed.** R0 audit step added with explicit queries before State Verification. |
| 6 | HIGH | 88 | DeepSeek | Ghost-cleanup deadlock/batching not specified | **BUG fixed.** `NOT EXISTS` pattern, batched LIMIT 1000 loop, OUTSIDE per-batch transaction, existence-based scope. |
| 7 | HIGH | 88 | Worktree | No `.db.test.ts` for transaction rollback scenario | **BUG fixed.** db.test.ts scenario #2: 3-row batch, force middle-row failure, assert savepoint isolated it. |
| 8 | HIGH | 85 | Worktree | Proposed `(application_number, id)` keyset redundant; `application_number` is UNIQUE | **BUG fixed.** Simplified to plain `id`-keyset using existing PRIMARY KEY index. |
| 9 | HIGH | 85 | DeepSeek | Ghost-cleanup uses single bulk DELETE — could deadlock with concurrent permit chain | **BUG fixed.** Batched LIMIT 1000 loop with separate transaction. |
| 10 | HIGH | 82 | Worktree | Tier 2 spatial drop is brittle vs future `geocode-coa.js` extension | **DEFER.** Phase D does NOT include geocode-coa.js (R2.v5 design bundles into this script). Logged in followups for any future external-geocoder phase. |
| 11 | MED | 83 | Worktree+DeepSeek | 5% unmatched threshold will FAIL spuriously on day-1 | **BUG fixed.** New `logic_variables.coa_unmatched_threshold_pct` (default 10%); day-1 emits WARN not FAIL; recalibrated post-burn-in. |
| 12 | MED | 80 | Worktree | PostGIS vs Turf centroid divergence on multipolygons | **BUG fixed.** Both paths use stored `parcels.centroid_lat`/`centroid_lng` (no re-derivation). |
| 13 | MED | 80 | Worktree | Advisory lock 4201 + chain insertion position not in manifest plan | **BUG fixed.** Position specified: AFTER `assert_coa_freshness`, BEFORE `link_coa`. R5.6 will register the remaining Phase D steps. |
| 14 | MED | 80 | Worktree | Per-tier match breakdown missing from audit_table | **BUG fixed.** Inherited twin's metric structure (`tier_1a_exact`, `tier_1b_name_only`, `no_address_data`, `no_parcel_match`). |
| 15 | MED | 81 | Worktree | Write-3 lat/lng UPDATE lacks `IS DISTINCT FROM` guard | **BUG fixed.** Added explicit guards on every column. |
| 16 | MED | 75 | Worktree | Write-2 neighbourhood lookup data dependency on write-1 not explicit | **RESOLVED** by the per-record SAVEPOINT design (#2). Inside one savepoint write-1 commits before write-2 reads it — visibility guaranteed within the savepoint. |
| 17 | MED | 75 | DeepSeek | Tie-breaker for duplicate parcel match undefined | **BUG fixed.** Explicit `ORDER BY parcels.id DESC LIMIT 1` (most recent parcel wins). |
| 18 | MED | 70 | DeepSeek | Ghost-cleanup scope ambiguous (existence vs status) | **BUG fixed.** Documented as existence-based — closed/refused CoAs retain `lead_parcels` rows for historical analysis. |
| 19 | LOW | 60 | DeepSeek | Composite index `(parcel_linked_at, street_name)` would speed source-filter scan | **DEFER.** 33K rows is not large; the partial index `idx_coa_parcel_linked_at WHERE parcel_linked_at IS NULL` from R5.1 mig 145 covers the predicate. Re-evaluate if benchmarks show pain. |
| 20 | LOW | 50 | Gemini | Redundant `ca.lead_id LIKE 'coa:%'` filter in back-fill UPDATE | **BUG fixed.** Removed — script is CoA-only by construction. |

---

> **PLAN LOCKED. Do you authorize this WF2 #coa-pipeline-parity-phase-d-R5.2 plan?**
>
> **Scope:**
> - 1 NEW pipeline script (`scripts/link-coa-to-parcels.js`, ~600 lines, advisory lock 4201)
> - 3 NEW test files (logic + infra + db.test.ts)
> - 1 MODIFIED `scripts/manifest.json` (chain step registration)
> - 0 migrations (mig 145 from R5.1 covers schema needs)
>
> **Twin extraction:** `link-parcels.js` (Tier 1a/1b) + `link-neighbourhoods.js` (PostGIS/Turf bundling) + NEW parcel-centroid lat/lng back-fill.
>
> **Reviews:** 3-reviewer (Gemini + DeepSeek + Worktree) on plan before authorization, then 3-reviewer on code after Green Light. Per saved memory `feedback_review_protocol.md`.
>
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE awaiting authorization.
