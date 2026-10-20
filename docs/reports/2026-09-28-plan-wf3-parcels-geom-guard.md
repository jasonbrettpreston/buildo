# Active Task: WF3 — `parcels.geom` is never re-derived: 9,855 NULL + 16 unrepaired geoms that the write guard cannot see
**Status:** Authorized 2026-09-28 (operator "y"; D1 keep make_valid, D2 A+W, D3 cloud read-only measure first then heal via next cloud sources run)
**Workflow:** WF3 (fix). One finding (the parcels write cannot converge `geom` to its declared derivation) in one step, and one commit.
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** claude. The plan was grounded and written by a claude planning seat; the DeepSeek engine was not used (every claim below needed a live DB query or a git read). At implementation it stays **claude**, because the fix changes a converted step's write contract, needs local-DB red evidence, a G8 golden recapture, and a before/after data proof (verification seats, Spec 08 §A/§B). The test-file drafting may be routed to `deepseek` with `write_scope` = the two test files only.

## Context
* **Goal:** after one normal `parcels` run, every in-source parcel's stored `geom` should equal the step's own declared derivation of its source GeoJSON. Today 9,871 rows do not match, and nothing in the write path will ever change them.
* **Target Spec:** `docs/specs/01-pipeline/55_source_parcels.md` (owner). Consumers: `65_enrich_parcels.md` and `66_enrich_permits.md` (operator directive), plus Spec 59 §8d (#418 DEC-FENCE2 origin). The standard is Spec 122 §5.1 (declared write discipline) and Spec 124 §5 R-BA (five words).
* **Key Files:**
  * `scripts/load-parcels.descriptor.json`: `outputs.writes[0].write_discipline.guard_columns` and `outputs.invalidates[]`. This is the only production file that changes.
  * `scripts/load-parcels.notes.json`: the guard/DEC-FENCE2 prose (:39-43, :57-58, :123).
  * The tests listed in §6 and §7.
* **Database Impact:** NO schema change. There IS a one-time data change, made by the step's own next run and not by a script: 9,871 `parcels.geom` values are rewritten. Through migration 242/245's trigger and DEC-FENCE2, that rewrite also NULLs enrichment stamps on those rows. §3 measures this.

## 0. The finding, corrected by measurement
The trigger report (assessment `docs/reports/2026-09-24-batch2-p3-7-parcels-assessment.md` §"WF3 2026-09-28") says this is "geom written BEFORE the 0t repair fix (5ece69b1)". **The measurements refute both halves of that:**
* 0t `5ece69b1` changed only the `geometry_repair:"none"` arm. Its own body says "No converted step declares 'none' today … zero live data change" [READ `git show 5ece69b1`]. The default arm that parcels uses is unchanged since conversion ② `1414cb73`.
* The real mismatch has two populations, and both come from the **legacy loader**:
  1. **9,855 rows with `geom IS NULL`, whose `geometry` is a valid MultiPolygon that the current validator accepts.** The legacy `INSERT INTO parcels (…)` column list **never included `geom`**. `geom` was set only in the `DO UPDATE SET` via `${geomLine}` [READ `git show 1414cb73^:scripts/load-parcels.js` :293-305, :338]. So every parcel first INSERTed by the legacy loader landed with a NULL geom. The guard has no geom term, so an identical re-run never filled it. All 9,855 rows were created 2026-09-24 11:37:25Z–11:45:10Z (the same window also created 115 non-NULL rows), and no `pipeline_runs` row covers that window. The writer was a legacy-arm run (a PRE capture or differential). It is **not** the converted step: pre-`6457e713` it counted misses as skipped and wrote nothing [READ `git show 6457e713` validateGeometries]. The converted INSERT does write `geom` (`bindFor` → `ST_GeomFromWKB`, write.js `valuesGroup`), so this step creates no new NULLs.
  2. **16 rows with a stored, invalid, unrepaired geom.** Legacy wrote `ST_SetSRID(ST_GeomFromGeoJSON(…))`. The converted step writes `ST_Multi(COALESCE(ST_CollectionExtract(ST_MakeValid(g),3), ST_MakeValid(g)))` [READ write.js `geometryFinalExpr`, `geometryValidationSql`]. These rows' GeoJSON never changed, so the guard never fired. This is `review_followups.md:31` **P-D6** (HIGH, "DEFER — fix after 0t lands").
* The assessment's "2 of 100 diagnostic-cohort rows changed geom" were **not** invalid→valid repairs. `SELECT … WHERE NOT ST_IsValid(ST_GeomFromGeoJSON(geometry::text)) AND geom IS NOT NULL AND ST_IsValid(geom)` returns **0 rows** [MEASURED]. The 18 source-invalid rows are the 16 above plus 2 rows inside the NULL population. So the 2 cohort rows were NULL→filled [INFERRED; the cohort file was never committed]. The fix commit corrects that assessment sentence.

## 1. Grounding (every claim executed; local DB 127.0.0.1:54322, read-only, 2026-09-28)
| # | Claim | Evidence |
|---|---|---|
| G1 | Guard = the auto-added watched column `geometry` (rendered `parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb`, FIRST) + the 8 declared `guard_columns`. `geom` is in `update_columns` (SET `geom = EXCLUDED.geom`) but is not a WHERE term. | [READ descriptor `write_discipline.guard_columns` (8 entries) + its `why` ("geom is NOT itself a guard predicate: it is set unconditionally beside geometry whenever the guard passes"); write.js `changeOfGuardColumns` / `changeOfComparison` / the `tail` builder] |
| G2 | The guard is inherited verbatim from legacy (`WHERE parcels.geometry::jsonb IS DISTINCT FROM … OR <8>`). | [READ `git show 1414cb73^:scripts/load-parcels.js` :362-376] + the orchestrator's measurement (same) |
| G3 | Column types: `geom geometry(Geometry,4326)`, `geometry jsonb`. | [MEASURED `SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='parcels'::regclass AND attname IN ('geom','geometry')`] |
| G4 | Table: 496,510 rows, 486,655 geom non-NULL (all MULTIPOLYGON, 0 POLYGON), **9,855 geom NULL**, **16 `NOT ST_IsValid(geom)`**. | [MEASURED `SELECT count(*), count(geom), count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)), count(*) FILTER (WHERE GeometryType(geom)='MULTIPOLYGON') FROM parcels`] 12.7 s |
| G5 | **Blast radius (full scan, not a sample)**: stored `geom` vs the step's own validator expression over the stored `geometry` (identical to source for unchanged rows). Non-NULL rows differing: `IS DISTINCT FROM` = **16**, WKB = **16**, `NOT ST_Equals` = **5**. WKB differs but ST_Equals is true: **11**. Differing rows with a valid source: **0**. geom-NULL rows the validator would accept: **9,855 / 9,855**. | [MEASURED scratch `q3.js`: `CREATE TEMP TABLE d AS … ST_Multi(COALESCE(ST_CollectionExtract(ST_MakeValid(src),3),ST_MakeValid(src))) nw …` in a rolled-back txn; 496,510 rows, 24 s build + 5 s aggregate] |
| G6 | All 9,855 NULL-geom rows and all 16 invalid rows are in the current CSV (`data/property-boundaries-4326.csv`, 2026-09-24, 498,479 ids). The table holds 495,517 in-CSV rows and 993 departed-retained rows. | [MEASURED awk PARCELID extract ∩ `SELECT parcel_id …`, scratch `q8.js`] |
| G7 | The NULL-geom rows have **every** enrichment stamp NULL: ravine/heritage/centreline stamps 0/9,855, `zoning_enriched_at` NULL 9,855, centroid NULL 9,855, `max_buildable_gfa_sqm` NULL 9,855. Feature types are 9,488 COMMON and 367 CONDO. No `permit_parcels` row points at them (0). | [MEASURED scratch `q4.js`/`q7.js`] |
| G8 | The 16 invalid rows: 12 are `Ring Self-intersection` with area unchanged by the repair, and 4 are `Nested shells`, where stored area double-counts (e.g. 10527338: 1,478.1 → 1,151.9 m²). 6 of the 16 carry `lot_size_source='geom_backfill'` with `lot_size_sqm` NULL (Spec 55 :57, "6 invalid-geom rows remain NULL"). All 16 have `ravine_dataset_version_when_enriched` set; heritage, centreline and zoning stamps are NULL on all 16. | [MEASURED scratch `q9.js`] |
| G9 | Comparison cost: `geom IS DISTINCT FROM ST_GeomFromWKB(ST_AsBinary(geom),4326)` over all 496,510 rows takes **0.9 s** and returns **0 distinct**, so the WKB round-trip the write path uses is lossless under `=`. PostGIS 3.3.7 / GEOS 3.14.1. | [MEASURED scratch `q9.js`] |
| G10 | A trigger already treats a `geom` change as a real change: `trg_parcels_invalidate_on_geom_change()` fires `BEFORE UPDATE OF geom, geometry` and NULLs `massing_enriched_at`, `zoning_enriched_at`, `centroid_lat/lng` when `NEW.geom IS DISTINCT FROM OLD.geom OR NEW.geometry IS DISTINCT FROM OLD.geometry`. It does NOT touch the three `*_dataset_version_when_enriched` stamps. | [READ `migrations/242_parcels_geom_invalidation_trigger.sql:45-46`, `245_parcels_centroid_geom_invalidation.sql`] |
| G11 | The library already renders a geom-watched invalidation arm (`<t>.geom IS DISTINCT FROM EXCLUDED.geom`, no `::jsonb`), and it is locked on a ravines fixture. | [READ write.js `watchedCastsToJsonb`; `src/tests/step-library.logic.test.ts:6176,6194`] |

## 2. Prior attempts: the fences (history mined per operator directive)
Commands run: `git log --all -S "IS DISTINCT FROM" -- <4 parcels/write paths>` (13 hits), `git log --all -G "geom|geometry|ST_MakeValid|make_valid|invalid geom" -- <paths> migrations/ specs 55/65/66` (77 hits, all subjects read), bodies read for every parcels geometry/guard/repair/invalidation/envelope hit. Also searched: `review_followups.md`, `tasks/lessons.md`, `.cursor/*.md`, and memory.

| Date | Commit / record | What was done | Kept / why | What it means for this fix |
|---|---|---|---|---|
| 2026-03-04 | `c67a28a2` mig 039 | Adds `parcels.geom` as a "parallel geom column (keeps existing geometry JSONB intact)", backfilled once. | Kept. | Origin of the "geom is a derived column" design. The loader was given an *optional* `geomLine` for PostGIS-less DBs, and the INSERT list never gained `geom`. That omission is the root of population 1. |
| 2026-03-12 | `4ce9fffc` | First WHERE guard: "comparing geometry, lot_size_sqm, feature_type, address_number, and date_effective to skip no-op updates" (fixing ~486K false updates per run). | Kept. | **Fence:** the guard exists to stop no-op writes. geom was left out **not by a ruling** (no cost or noise argument recorded). geom = f(geometry) with a fixed f, so comparing the source covered it. The fix must keep a byte-identical rerun at zero writes. G5/G9 show 0 false positives. |
| 2026-03-17 | `6e058be5` | Casts both sides `::jsonb` "to prevent infinite updates from text normalization mismatch". | Kept. | **Fence:** geometry comparison must be structural. `geometry` is a `jsonb` column today (G3), so `parcels.geometry IS DISTINCT FROM EXCLUDED.geometry` is already structural. The red suite still proves a re-serialised identical GeoJSON causes 0 writes (§6 T-f). |
| 2026-04-11 | `f142bf4b` mig 083 | Replays 039 and re-backfills geom from jsonb (drift repair). | Kept. | The second one-off backfill. The legacy INSERT gap re-opened after each one, which is evidence that a one-off backfill does not stay fixed (§4, option B). |
| 2026-06-05 | `92ee03b9` (#418 DEC-FENCE2) | NULLs ravine+heritage stamps "via a geometry-change-gated CASE … Address-only updates are geom-invariant and preserve the stamp". Soundness of the enrich_ravines skip depends on it. | Kept, locked by `db/load-parcels-ravine-invalidation.db.test.ts`. | **Fence:** (a) a moved parcel MUST null the stamps; (b) an address-only update MUST NOT. Both are preserved by §5 and re-proven by §6 T-d/T-e. The fence's *intent* is "the stamp follows the shape the enricher reads", which is `geom` (every enricher joins on `p.geom`). |
| 2026-07-08 | `4b438c84` | Adds the centreline arm to DEC-FENCE2. | Kept. | Same fence, third stamp. |
| 2026-07-08 | `49dfd93e` P12-A1 | Backfills NULL `lot_size_sqm` from `ST_Area(geom)`; "6 invalid-geom rows remain NULL". | Kept. | Six of the 16 (G8). Repairing their geom does NOT refill `lot_size_sqm`; that is out of scope and named in §9. |
| 2026-08-23 | `43e1068b` mig 245 | Centroid arm on the geom-change trigger. It measured 0 stale centroids before choosing no backfill, and filed **HIGH `review_followups.md:211`**: the three `*_dataset_version` stamps have no trigger invalidator. That was scope-deferred to its own WF3. | Kept. | **Fence:** the per-arm trigger widening is 211's WF3, not this one. This plan does NOT touch the trigger. It makes the *upsert path's* stamps follow `geom` (§5), and 211 stays open for all other write paths. |
| 2026-08-25 | `1a440908` load_ravines conversion (+ followups:3171, D-19) | load_ravines declares `guard_columns: ["geom", …]`. Its forced reload rewrote 21 ravine geoms whose source bytes were identical: the same "stored ≠ current derivation" class, healed by a geom guard. | Kept. | **Direct fleet precedent** for guarding the derived geometry column. |
| 2026-09-23 | `a8c1a42f` address_points conversion | `guard_columns` includes `geom`. | Kept. | Second precedent. parcels is the only step-written-geom outlier (§8). |
| 2026-09-24 | `1414cb73` ② / `8c362325` ③ parcels conversion | Reproduced the legacy SQL "verbatim". Zero-diff was proven against a 0-write golden (the TEXT-key bug), and the derivation change (raw → make_valid+multi) was never observed. | Kept; bug fixed `6457e713`. | The massing plan's 0t bullet said "**VERIFY before parcels ③**" [READ `.cursor/batch2_p3_6_massing_active_task.md:72`]. Its Fold SF-2 measurement (:73: "426,857 ST_Polygon + 220 ST_MultiPolygon … 17 invalid") counts **building_footprints** (427,077 = massing's row count), not parcels. So the verification was aimed at the wrong table and never run on parcels. The fix commit records this as a lesson (§9). |
| 2026-09-24 | `.cursor/wf2_ingest_prereqs_0s_0t_0u_active_task.md:82` **O-B** | Measured the legacy raw write and "16 invalid geoms and 486,600 MultiPolygon of 496,500 rows". Pinned P-D6 with the default fix direction "declare `geometry_repair:"none"` (legacy parity) — or an operator ruling that repair is the intended improvement". | Pinned, not fixed. | Two points. (1) **Its own numbers contained the NULL population:** 496,500 − 486,600 = 9,900 rows that were neither Multi nor anything else, i.e. NULL. That went unrecognised. (2) The prior default direction was `none`. D1 recommends the opposite and states the new evidence: G8's Nested-shells area over-statement, and G5 showing `none` would not heal any of the 9,855 NULLs. |
| 2026-09-24 | `review_followups.md:31` **P-D6** HIGH | "Either declare `geometry_repair:"none"` … or take an explicit operator ruling to keep the repair arm (and re-validate the 16 rows under it). Do not silently pick one." | **OPEN**: never ruled. | **Fence → operator decision D1.** This plan does not pick silently. |
| 2026-09-24 | `cd9ec4f8` 0t / `5ece69b1` follow-on | Adds `geometry_repair`. Massing declares `none` for legacy parity (M-D2 KNOWN-DEFECT, F1 optional flip). | Kept. | A parity precedent in the *other* direction, on another step, with its own ledger row. It does not bind parcels. D1 weighs it. |
| — | `tasks/lessons.md:154` (compute_centroids CC-D3) | A NUMERIC-vs-double `IS DISTINCT FROM` guard produced false positives. | Lesson. | **Fence:** a derived-value guard must compare like with like. Here both sides are `geometry` built from the same WKB bytes (G9: 0 false positives over 496,510 rows). |
| — | `tasks/lessons.md:203` | "A 0-write golden on a step that SHOULD write is not zero-diff proof." | Lesson. | This WF3's proof is a *nonzero* run whose rewritten rows are classified one by one (§7). |

No prior attempt tried and ruled out a geom guard or a geom-watched invalidation for parcels. The two fleet steps that write geometry and do guard it are the accepted shape.

## 3. Downstream: what the one-time rewrite invalidates, and what recomputes it
The rewrite touches 9,871 rows: 9,855 NULL→geom and 16 invalid→repaired.
| Stamp / derived field | Nulled by | 9,855 NULL rows | 16 repaired rows | Recomputed by |
|---|---|---|---|---|
| `ravine_/heritage_/centreline_dataset_version_when_enriched` | DEC-FENCE2 CASE arm (upsert). **Today it watches `geometry` only, so a geom-only change would NOT null them.** | already NULL (G7) | ravine set on all 16 (G8). Stays stale unless §5's watch change lands. | `enrich_ravines` / `enrich_heritage` / `enrich_centreline` (stamp-NULL ⇒ stale ⇒ scoped recompute, #418) |
| `zoning_enriched_at`, `massing_enriched_at`, `centroid_lat/lng` | trigger 242/245 on `geom IS DISTINCT FROM` (G10) | already NULL | zoning already NULL; massing/centroid nulled | `enrich_parcels` passes 1–3, `link_massing`, `compute_centroids` |
| Spec 65 zoning / max-build / existing-structure / scenarios / C2 neighbourhood | read `p.geom` (Pass A/B `ST_Intersects`, MB-2 `ST_Area(geom::geography)`, MB-3 `ST_Buffer(geom::geography,…)`, C2 `ST_Centroid(p.geom)`) [READ Spec 65 §2 steps 1–3, §4 MB-2/MB-3, C2] | **9,855 parcels become enrichable for the first time** (every pass filters `p.geom IS NOT NULL`, `compute/enrich-parcels.js:280,479,873`) | 4 Nested-shells rows get a new ST_Area (G8) and are re-run | enrich_parcels (cloud runs `--full` every time, per its descriptor `staleness.scope`) |
| `parcel_address_points`, `permit_parcels`, `neighbourhood_id` | none (new links, not invalidations) | spatial link candidates for the first time | — | `link_parcel_addresses`, `link_parcels`, `link_neighbourhoods` |
| Spec 66 permit/CoA zoning | none (purely relational, DEC-3 always-full) | 0 permits link to these rows today (G7). Any permit linked later inherits zoning. | — | `enrich_permits` (next run, automatic) |

**One-time cost:** every consumer is stamp-scoped or `--full`, so the re-enrichment is about 9,871/486,655 ≈ **2%** of each enricher's full work. For example, the enrich_ravines scoped KNN runs over 9,871 parcels, where the full run is 77 min over 486K. That ratio is [INFERRED]. The real durations are MEASURED from each consumer's own `pipeline_runs` row at §7 step 7 and reported, never assumed.

**Coverage metrics move (expected, explained):** enrich_parcels and assert_global_coverage denominators use `geom IS NOT NULL`, so they grow by 9,855. Coverage percentages may shift. That shift is the explained diff for those steps' next captures, not a regression.

## 4. Fix options considered
| Option | What | Heals the 9,871 | Heals future drift (repair/SRID/kind change, off-path writer) | False positives | Stamps sound for geom-only change | Cost / ceremony |
|---|---|---|---|---|---|---|
| **A. Add `geom` to `guard_columns`** | 1 descriptor entry | yes (next normal run) | yes, structurally | 0 (G5, G9) | **no**: 16 ravine stamps go stale-by-lineage (a new issue the fix itself creates) | minimal |
| **A+W (RECOMMENDED). A, and DEC-FENCE2 watches `geom`** | `invalidates[0..2].set_null_on_change_of: "geometry"→"geom"`; `guard_columns` gains `"geometry"` (still refreshed, still a WHERE term) and `geom` becomes the watched guard term (codegen dedupes). | yes | yes | 0 | **yes**: the stamp follows the shape the enrichers read | 4 descriptor values. No library, migration or script change. |
| B. One-off backfill script + a lock | `UPDATE parcels SET geom = <derivation> WHERE geom IS DISTINCT FROM <derivation>`, run on local and cloud | yes, once | **no**: 039 and 083 were both one-off backfills and the gap re-opened after each (§2) | 0 | only with a separate stamp fix | new script, runbook entry, before-image, idempotency seat, run twice (local + cloud), plus a new lock. Violates "standard but simple": it adds a tool where a declared value suffices. |
| C. `ST_Equals` guard | topological compare | **no**: it misses 11 of the 16 invalid rows (G5: WKB differs, ST_Equals true) | partial | 0 | — | rejected by measurement |
| D. Hash / normalized-WKB column | new column + migration | yes | yes | 0 | — | migration on 496K rows. Rejected: A already compares exactly, at 0.9 s per full table (G9). |
| E. `geometry_repair:"none"` (legacy parity) | 1 descriptor value | **no**: the 9,855 NULLs remain, because the guard still cannot see geom | no | — | — | leaves invalid geoms (16, plus 2 inside the NULL population). Only relevant as D1's alternative, and it would still need A to fill the NULLs. |

**Why not the orchestrator's option B (one-time rederivation + lock):** A+W *is* that rederivation, done by the step's own next run and reported by the step's own counters (`records_updated`) and audit row. It is idempotent by construction (run 2 = 0 writes) and needs no new script or runbook entry. It also runs identically on cloud with no extra operator step. The "lock so a future derivation change cannot ship without the backfill" becomes a structural property: with geom in the guard, a derivation change re-derives on the next run. The class lock in §6 keeps it that way fleet-wide. B's only advantage is keeping the legacy-text pin byte-identical, but that pin encodes the defect. Retiring it knowingly is the trustworthy move (Guardian states the fence, §6).

## 5. The fix (A+W): `scripts/load-parcels.descriptor.json` only
* `outputs.writes[0].write_discipline.guard_columns`: the 8 existing entries + `"geometry"` (appended last). The WHERE keeps its structural jsonb refresh term: `parcels.geometry IS DISTINCT FROM EXCLUDED.geometry` on a `jsonb` column (G3), rendered by `columnGuardExpr`.
* `outputs.invalidates[0..2].set_null_on_change_of`: `"geometry"` → `"geom"`. The codegen then puts `parcels.geom IS DISTINCT FROM EXCLUDED.geom` FIRST in the WHERE (`changeOfGuardColumns`) and renders the three CASE arms on it (`watchedCastsToJsonb('geom') === false`, G11). `when` text is updated to "this write changes parcels.geom (the stored shape every enrich-* step reads)".
* Rendered WHERE after the fix: `parcels.geom IS DISTINCT FROM EXCLUDED.geom OR <8 unchanged terms> OR parcels.geometry IS DISTINCT FROM EXCLUDED.geometry`.
* `why` texts updated: the guard's "geom is NOT itself a guard predicate" sentence is replaced by "the guard compares the stored derived shape AND the raw source; see WF3 2026-09-28". `write_inventory` stays at 1 statement.
* `geometry_repair` is **unchanged** (absent = `make_valid`) **if D1 = keep**. If D1 = `none`, add `"geometry_repair": "none"`. A+W is still required, because the 9,855 NULLs need the geom guard either way.
* **Semantics preserved (fences):** a byte-identical re-run gives 0 writes. An address-only change writes, and the stamps stay (geom unchanged). A geometry move writes and nulls the stamps (geom changes). CKAN jitter (PR-D3) behaves as today (coordinates move, so geom moves). **Semantics changed, declared:** (i) a geom-only difference (NULL or stale derivation) now writes; (ii) a jsonb-only difference that yields an identical geom (e.g. a non-coordinate member) refreshes `geometry` but keeps the stamps. That is correct, because the enrichers never read `geometry`.
* **Replaces / removes:** removes the hidden assumption "geom = f(geometry) with a fixed f" (never declared, broken at ②). No gate, tool or ledger row is added. The class lock in §6 is a test over existing descriptors (the `pct-checks-evaluate` precedent), not a new gate.

## 6. Red-first tests (both directions; red evidence committed per gate K)
**New `src/tests/db/load-parcels-geom-guard.db.test.ts`** (`BUILDO_TEST_DB=1`; SPEC LINK Spec 55 + Spec 59 §8d). It drives the REAL `buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS)`: its `validation_sql` produces the WKB, and `upsertSqlFor(1)` does the write, inside BEGIN/ROLLBACK against a scratch parcel_id (the `load-parcels-ravine-invalidation.db.test.ts` pattern).
* **T-a (RED today):** row stored with `geom = ST_SetSRID(ST_GeomFromGeoJSON(<nested-shells fixture>),4326)` (invalid), all other columns identical to the incoming row. Upsert ⇒ 1 row RETURNed, `ST_IsValid(geom)` true, ravine/heritage/centreline stamps NULL. Today: 0 rows, geom still invalid.
* **T-b (RED today):** row stored with `geom NULL`, everything else identical ⇒ 1 row RETURNed, geom = validator output. Today: 0 rows.
* **T-c (GREEN both, the no-op fence 4ce9fffc):** row stored exactly as the converted step writes it ⇒ 0 rows RETURNed.
* **T-d (GREEN both, DEC-FENCE2 92ee03b9 (b)):** address-only change ⇒ 1 row, all three stamps preserved.
* **T-e (GREEN both, DEC-FENCE2 (a)):** coordinates moved ⇒ 1 row, all three stamps NULL.
* **T-f (GREEN both, the 6e058be5 fence):** the same GeoJSON re-serialised (different whitespace and key order) ⇒ 0 rows.

**`src/tests/steps/parcels/violations.test.ts`: logic locks re-pointed IN PLACE (Guardian states each fence):**
* :364 `guard_columns carry the 8-item DECLARED set` → a 9-item set (+ `geometry`). The watched term is `geom`. The runtime WHERE has 10 disjuncts.
* :500 `reproduces the legacy UPSERT tail` → "reproduces the legacy tail **except** the two declared WF3-2026-09-28 deltas (watched column `geom`; `geometry` a plain jsonb guard term)". The test asserts the exact two-delta text, so any third drift is still red. The fixture `fixtures/legacy-upsert.sql.txt` stays as the historical record.
* New: `upsertSqlFor(1)` contains `parcels.geom IS DISTINCT FROM EXCLUDED.geom` in the WHERE and in each of the three CASE arms (RED today).

**`src/tests/db/load-parcels-ravine-invalidation.db.test.ts` (A) regexes :57-65** → re-pointed to `CASE WHEN parcels.geom IS DISTINCT FROM EXCLUDED.geom`. Its (B) semantics block (:70-130) keeps both directions. The fence stated in its header is unchanged in intent.

**Class lock (no new gate):** new `src/tests/steps/geometry-guard-coverage.logic.test.ts`. For every `converted.json` descriptor, every write whose class carries an `is_distinct_from` guard and has a column with `bind: "wkb_geometry"` and `written: "step"` must name that column in `guard_columns` (or `all_declared`) or as a `set_null_on_change_of` watch. RED today on `parcels` only. address_points and load_ravines PASS. massing is exempt by `written:"insert_only"`. load_centreline is exempt as class C (no guard). *Replaces:* the manual "VERIFY before ③" note that missed this at ②.

**`step-library.logic.test.ts` T5/T7:** untouched. They pin their OWN fixture, not this descriptor.

**Red evidence:** run the three files at HEAD before the fix and commit the vitest JSON under `docs/reports/red-evidence/wf3-parcels-geom-guard/`.

## 7. Proof: recapture, forced change, two-run zero writes (orchestrator seat, local DB)
1. **Before-image** of `(parcel_id, md5(ST_AsBinary(geom)), md5(geometry::text), 3 stamps, zoning_enriched_at, massing_enriched_at, centroid_lat)` for all rows, to a scratchpad CSV. This is read-only, not a table.
2. **Pre-count** with G5's query: expect 9,855 NULL-accept + 16 differing + 0 other.
3. POST capture run 1 (`--chain=sources`): `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-parcels.js --chain=sources --out=docs/reports/golden/parcels/post/sources.json --overwrite`, and the same for `--chain=none` → `post/standalone.json`. The natural 9,871-row population IS the forced change (G#38 nonzero). No synthetic perturbation is needed, so no enriched row is touched beyond the defect population.
4. **Classify every changed row** against the before-image. Expected: geom-only change = 9,871 exactly. Geometry-changed rows = the CKAN delta between the 2026-09-24 CSV and the run's fresh download; each one is listed, never absorbed. Inserts = new CSV ids. `records_updated` = 9,871 + CKAN delta, and it must reconcile to the row.
5. **Run 2** in the same capture (`rerun_proof`): 0 writes.
6. `--compare` against the prior POST. The explained G8 diffs are `records_updated`/`records_unchanged` (+ `pipeline_runs[0].*` twins) and `table_state[0].content_hash`. The descriptor change moves `source_fingerprint`. Any other diff is a finding.
7. Downstream (local): run `enrich_ravines`, `enrich_heritage`, `enrich_centreline`, `compute_centroids`, `link_massing`, `enrich_parcels`, then `link_parcel_addresses`/`link_parcels`/`link_neighbourhoods`. Record each run's duration and `records_updated` (§3 cost, MEASURED).
8. `node scripts/analysis/step-validate.mjs --step=parcels --write` → five-word PASS, 0 new ledger rows. Capture happens last (simplification item 2).
9. No other step's goldens change: `scripts/lib/step/**` is untouched, so `lib_fingerprint` does not move.

**Reality-Check invariants (output altitude, `pipeline-reality-check`):**
* R1: `count(*) FILTER (WHERE geom IS NULL)` among in-CSV parcels = **0**. Table-wide it = departed-retained rows with NULL geom only (listed).
* R2: `count(*) FILTER (WHERE NOT ST_IsValid(geom))` = **0** (if D1 = keep; if `none`, = the 18 source-invalid, listed).
* R3: G5's scan re-run gives stored ≠ derivation = **0** in-source rows.
* R4: run 2 `records_updated` = 0.
* R5: geom-only rewrites = 9,871 ± the listed CKAN delta.
* R6: for the 9,855 new geoms, `ST_Area(geom::geography)` vs `lot_size_sqm` (where stated) sits within the sanity audit's zone-aware bounds (`scripts/analysis/parcel-sanity-audit.js`). Each new BOUND/INVARIANT hit is classified bug or source-tail. The 4 Nested-shells rows' repaired area is eyeballed with `parcel-field-dump.js`.
* R7: after step 7, the ravine/heritage/centreline stamps are non-NULL on the 9,871 (except rows a consumer legitimately cannot enrich, each counted), `zoning_enriched_at` is non-NULL, and the centroid is inside geom.

## 8. Fleet check: converted steps writing a geometry column
| Step | Table | Class | Geometry column | In guard? | Verdict |
|---|---|---|---|---|---|
| address_points | address_points | guarded_upsert | `geom` (step, point) | **yes** (`guard_columns` includes `geom`) | OK |
| load_ravines | ravines | upsert_scoped_departure_delete | `geom` (step, polygon) | **yes** (`["geom","source_dataset_version"]`) | OK. Precedent: D-19 healed 21 rows this way |
| load_centreline | toronto_centreline | staging_full_replace (class C) | `geom` (step, line) | n/a: every run rewrites the whole table | OK, not applicable |
| massing | building_footprints | guarded_upsert | `geom` **insert_only** (repair `none`) | n/a: the key is `hash_`+md5(geojson) [READ `compute/load-massing.js:27`], so a geometry change is a new key, i.e. an INSERT | OK. M-D2 (17 invalid, parity) is ledgered separately |
| **parcels** | parcels | guarded_upsert | `geom` (step, polygon) | **no** | **this WF3** |

[MEASURED: a node scan of every `scripts/*.descriptor.json` for `bind:"wkb_geometry"` columns, with class, guard, `guard_columns`, `written`, repair and watch.] **Scope recommendation:** parcels only. No other step has the defect, so no sibling WF3 is needed. The class lock (§6) keeps it that way.

## 9. Per-spec impact (operator directive)
| Spec | What the fix changes | What it must preserve | As-built update in the same commit? |
|---|---|---|---|
| **55** (owner) | The guard now includes the derived `geom` (plus the raw `geometry`). DEC-FENCE2 watches `geom`. The one-time heal of 9,871 rows. | Class A, no retraction, zero-write rerun, the five `on_empty` preservations, the DEC-FENCE2 two-direction contract, PR-D3 jitter semantics, PR-D4 centroid (now covered by trigger 245 anyway) | **YES**: one As-built bullet "WF3 2026-09-28 geom guard". It names the legacy-INSERT-omitted-geom defect (9,855), P-D6's ruling (D1), the §2 table row for `geom` ("derived from `geometry` by the library polygon arm: ST_MakeValid + ST_Multi"), and the corrected assessment attribution (not 0t). |
| **65** (consumer) | 9,855 parcels enter every pass that filters `p.geom IS NOT NULL`. The 4 Nested-shells rows get a correct `ST_Area(geom::geography)` into MB-2/MB-3. Coverage denominators grow. | Incremental gating (trigger 242 nulls `zoning_enriched_at`/`massing_enriched_at`), idempotency (IS DISTINCT FROM), `--full` cloud posture | **NO**: the consumer contract ("reads `parcels.geom`") is unchanged. The data consequence is recorded in enrich_parcels' next capture as an explained diff. |
| **66** (consumer) | Nothing directly: it does no spatial ops (§1) and reads zoning columns relationally (DEC-3). Indirect: a permit later linked to one of the 9,855 inherits zoning. | DEC-3 always-full, F-H12 gates | **NO** |
| 59 / 61 / 62 (DEC-FENCE2 consumers) | The stamp is now nulled on a `geom` change instead of a `geometry` change | "NULL stamp ⇒ recompute; address-only ⇒ preserve" (#418) | NO (their contracts cite the stamp, not the watched column). Spec 55 carries the note. |

## 10. Target-file review (the step's own registry, operator ruling 2026-09-27)
Grep: `git grep -n -E "guard_columns|set_null_on_change_of|geometry::jsonb IS DISTINCT" -- scripts src/tests docs/specs` and `git grep -l -E "\bp\.geom\b|par\.geom|pa\.geom|parcels.*\bgeom\b" -- scripts src/app src/lib`.
| § | Item | READ | Touched | Behaviour impact | Registration |
|---|---|---|---|---|---|
| FILES | `scripts/load-parcels.js` (frozen shell) | yes | N | none | Spec 55 Target ✓ |
| FILES | `scripts/load-parcels.descriptor.json` | writes/invalidates/why | **Y** | §5 | 55 ✓ |
| FILES | `scripts/load-parcels.notes.json` | :39-43 (guard_terms 9→10), :57-58, :105, :123 | **Y** (prose + `guard_terms`) | none | 55 ✓ |
| FILES | `scripts/lib/compute/load-parcels.js` | shapeRecord/checks | N | none | 55 ✓ |
| FILES | `src/tests/steps/parcels/**` | violations :364, :500; row-conservation | **Y** (§6) | locks | 55 ✓ |
| DATA | `parcels` writes: `geom` (mig 039/083), the 3 stamps (168/171/174), trigger 242/245 | G3, G10 | data only (9,871 rows) | §3 | — |
| CONSUMERS | `emits`: `audit_table`→assert_data_bounds, `parcels_load`→parcels; consumer-registry rows (same two) | yes | N | counters change in value only (`records_updated` once) | ✓ |
| CONSUMERS | undeclared `parcels.geom` readers (grep): compute/enrich-parcels, enrich-ravines(.js + compute), enrich-heritage(.js + compute), enrich-centreline.js, compute/link-massing, compute/link-parcel-addresses, compute/link-parcels, link-coa-to-parcels.js, assert-parcel-sanity-fields.js, compute-centroids/link-neighbourhoods descriptors, `src/app/api/permits/[id]/route.ts`, surfaces F02/F08 contracts | hit lines | N | gain 9,855 enrichable parcels (§3); route and surfaces read the stored value | — |
| TESTS | `db/load-parcels-ravine-invalidation.db.test.ts` (re-point), new `db/load-parcels-geom-guard.db.test.ts`, new `steps/geometry-guard-coverage.logic.test.ts`, `step-library.logic.test.ts` (untouched) | yes | Y | locks | SPEC LINK headers |
| DOCS | Spec 55 As-built; assessment "WF3 2026-09-28" attribution correction; `review_followups.md:31` P-D6 → CLOSED with the D1 ruling + sha; `tasks/lessons.md` + "a derivation change needs a derived-value guard; a VERIFY note that measured another table is not verification" | — | Y | — | gate J (spec staged with the change) |

## Standards Compliance
* **Try-Catch Boundary:** N/A (no new code path. The declared write is rendered by the unchanged library.)
* **Unhappy Path Tests:** T-a (invalid stored geom), T-b (NULL geom), T-f (re-serialised identical source ⇒ no write), T-d/T-e (fence both directions), class lock.
* **logError Mandate:** N/A (no catch added).
* **UI Layout:** N/A.

## Five-word gate table (Spec 124 §5 R-BA)
| Word | Gate(s) | Answer for this WF3 |
|---|---|---|
| STANDARDIZED | A closed bounds, D consumer registry | PASS: descriptor-only change. No literal, bound or consumer is added. The derived-geometry guard matches the 2 fleet precedents (§8). |
| OBSERVABLE | C emits≡declared, G nonzero capture | PASS: emits unchanged. The heal is visible as `records_updated` on the step's own audit row, reconciled row-by-row (§7.4). |
| SCALABLE | B on_invalid closed, E compute literals | PASS: no compute change. The guard adds 0.9 s per full table (G9) to a 30-min-budget step. |
| UNDERSTANDABLE | F LF-only, J spec staged | PASS: Spec 55 As-built + notes.json updated in the same commit. The descriptor `why` says what the guard compares and why. |
| ACCURATE | G8 explained diffs, K red evidence | PASS: red JSON committed. Every G8 diff is explained. R1–R7 Reality-Check invariants. |

## Gate answers
* **A (closed bounds):** no new bound. **B (on_invalid):** unchanged. **C (emits):** unchanged. **D (consumer registry):** unchanged rows. **E (literals):** none. **F (LF):** edits via the Edit tool, LF verified. **G (captures):** parcels POST ×2 recaptured, nonzero (9,871), rerun 0. No `G` ledger rows are added, and none are open for parcels. **I (staleness/census):** unchanged. **J (spec):** Spec 55 staged. **K (red evidence):** `docs/reports/red-evidence/wf3-parcels-geom-guard/`. **Ledger:** 0 rows added. Parcels already has dated ledger rows, and this WF3 adds none.

## §11 Plan Compliance Checklist (docs/specs/00_engineering_standards.md §11)
* DB Impact: NO schema. The data change is made by the step itself. The 100K+ row "backfill strategy" is §7 (the step's own run, before-imaged and classified). The `factories.ts` rows are unchanged (no new field). → **addressed**
* API / UI / Frontend: N/A.
* Shared logic touched: NO. `scripts/lib/step/**` is untouched, so there is no dual-path.
* Pipeline script: the frozen shell is unchanged (Pipeline SDK via `pipeline.step`). Streaming is n/a (same acquisition).
* Pre-Review self-checklist: generated from Spec 55 §3 + As-built at Green Light and walked against the diff.
* **WF3 siblings (same root cause):**
  1. the other converted steps' derived-geometry guards: §8, all OK;
  2. massing `geom` insert_only: n/a, hash key;
  3. the three stamps on non-upsert write paths: followups:211 (own WF3, unchanged);
  4. centroid staleness on a geom change: covered by trigger 245 (G10);
  5. the 6 `geom_backfill` NULL-lot rows: named, out of scope (their lot backfill is a separate P12-A1 follow-up).
* Cross-layer contracts: no threshold is introduced.
* Migration check: N/A.

## Execution Plan
- [ ] 0. `node scripts/ai-env-check.mjs`. Re-run G4/G5 at HEAD (scratch queries; this plan cites them by content, not line). **0b (operator/cloud, read-only):** `SELECT count(*) FILTER (WHERE geom IS NULL), count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)) FROM parcels` on cloud. The legacy INSERT gap means cloud may carry its own NULL-geom population, which the next cloud `sources` run will heal the same way.
- [ ] 1. RED: write the §6 tests and run them at HEAD. Expect T-a, T-b, the new SQL-shape lock and the class lock (parcels) RED, and the rest GREEN. Commit the vitest JSON as red evidence.
- [ ] 2. Apply §5 (descriptor) + notes.json. Re-point :364/:500 and the ravine-invalidation (A) regexes. Run `npx vitest run src/tests/steps/parcels src/tests/steps/geometry-guard-coverage.logic.test.ts` and `BUILDO_TEST_DB=1 npx vitest run src/tests/db/load-parcels-geom-guard.db.test.ts src/tests/db/load-parcels-ravine-invalidation.db.test.ts`, all green.
- [ ] 3. Spec 55 As-built, the assessment correction, P-D6 close (with the D1 ruling), and the lesson.
- [ ] 4. `step-validate --step=parcels` five-word PASS, then §7 steps 1–6 (captures last), then step 8 `--write`.
- [ ] 5. §7 step 7 downstream runs + Reality-Check R1–R7.
- [ ] 6. Panel (WF3 lean). PLAN altitude: Reality-Check (R1–R7 bounds), Integration (codegen render + trigger interplay + class lock over the real `converted.json`), DeepSeek idempotency lens (grounded). OUTPUT altitude: Regression Guardian (the fences in §2: 4ce9fffc, 6e058be5, 92ee03b9, the T7 legacy pin retired knowingly), Code Reviewer grounded, Reality-Check.
- [ ] 7. `npm run test` (pre-push, 1 fork) green. One commit: `fix(55_source_parcels): write guard compares the derived geom, so 9,855 NULL + 16 unrepaired parcel geoms converge (DEC-FENCE2 follows geom)`.

## Operator decisions
* **D1: P-D6 (`review_followups.md:31`): keep the `make_valid` repair arm, or declare `geometry_repair:"none"`? Recommend KEEP.** The repair arm has been live since cutover ③ (2026-09-24) and is what ravines and address_points use. Downstream spatial ops on invalid shapes are unsound: 4 Nested-shells rows over-state area by up to 28% (G8), and `ST_Buffer`/`ST_Intersection` in Spec 65 MB-3/Pass B assume valid input. `none` would keep 16 invalid (18 once the NULLs fill) for byte parity with a legacy loader that is already retired. Massing's `none` (M-D2) is a separate, ledgered parity choice. **This departs from O-B's (`wf2_ingest_prereqs_0s_0t_0u_active_task.md:82`) default direction of `none`.** The new evidence is G8's area over-statement, plus the fact that O-B's "latent" framing assumed geometry changes were the only trigger, when 9,871 rows are in fact already stale. Either way, §5 A+W is required.
* **D2: A+W (the guard plus DEC-FENCE2 watching `geom`) or A only? Recommend A+W.** A alone creates a new unsoundness: the 16 repaired rows keep a ravine stamp computed on the invalid shape, and `enrich_ravines`' #418 skip would never revisit them. W is 3 declared values with no library change. `followups:211` (trigger arms for non-upsert paths) stays its own WF3.
* **D3: let the next cloud `sources` run heal cloud's population (after step 0b measures it)? Recommend YES**, with Reality-Check R1–R3 on the cloud run's output and the §3 re-enrichment riding the existing cloud `--full` enrich_parcels.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §11 note: the fix is descriptor-only (no library change, so no fleet recapture). The one-time heal is done by the step's own next run instead of a backfill script (option B rejected, §4).
