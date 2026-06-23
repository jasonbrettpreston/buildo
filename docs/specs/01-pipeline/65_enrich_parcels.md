# Enrich: Parcel Zoning (Spec 58 WF2) — **v1.0**

**Version:** 1.0 — authored 2026-05-31 via WF1/Genesis. Second of Spec 58 §8a's three-WF sequence (WF1 ingest ✅ `58914fa` → **WF2 parcel enrich (this spec)** → WF3 permit/CoA enrich). Folds two adversarial plan-review rounds (Gemini + DeepSeek) and a live data-profiling spike (`docs/runbook/65_enrich_parcels_spike.md`).

## Cumulative design decisions

- **DEC-1 — Precedence (D4 + conservative tie-break).** Identity/categorical attributes (`zoning_class`, `zn_string`, `gen_zone`, `zn_holding`, `zone_status`, `exception_*`, `bylaw_chapter/section/exception_ref`) come from the **area-dominant** base zone. Each overlay **REPLACES** the base value for its own attribute (Spec 58 D4 — height ← `zoning_height_overlay`, coverage ← `zoning_lot_coverage_overlay`). When **multiple same-attribute polygons overlap** a parcel (boundary lot under 2 base zones, or 2 overlays of the same kind), numeric **ceilings take MIN, floors take MAX** (conservative) and the script emits a `<attr>_conflict` audit row + records all candidates in `parcels.zoning_overlays`. (Resolves Spec 58 D7, deferred from WF1.)
- **DEC-2 — Full bylaw feed.** Every bylaw-rule column on `zoning_bylaw_areas` is mapped onto `parcels` (excluded as non-bylaw: `source_id`, `geometry`, `geom`, `created_at`, `area_units`, `holding_id`), plus the two numeric overlays (`height`, `lot_coverage`), plus 7 indexable boolean overlay-membership flags, plus a `zoning_overlays` jsonb carrying full overlay detail + candidate provenance.
- **DEC-3 — Set-based, decomposed engine.** All precedence resolves in **SQL** (window functions + MIN/MAX aggregation). The pipeline builds a session `TEMP TABLE` of computed enrichment, then applies a single trivial `UPDATE parcels … FROM temp`. There is NO per-parcel JavaScript loop. `scripts/lib/zoning-precedence.js` is a *pure config + SQL-fragment builder* (attr → `min|max|dominant|overlay`), unit-tested in isolation.
- **DEC-4 — Honest, spike-derived gates.** `zoning_class` is the only hard coverage gate (~96.8% live). `fsi` (~5.1%), `coverage` (~56.7%), `height` (~89.8%) are **sparse by design** (Spec 58 D10) and surface as INFO null-rate rows, never as ≥90% gates. (Resolves plan-review G2/D3.)

---

<requirements>
## 1. Goal & User Story

Decorate every Toronto `parcels` row with its applicable zoning by-law context — zone class, FSI/coverage/height/density/setback ceilings, unit/frontage/area floors, Chapter 900 exception, and overlay memberships — by spatially joining `parcels.geom` against the 10 zoning tables Spec 58 ingested. This is the parcel-level half of the end objective (Spec 58 §8e): WF3 (`enrich-permits.js`) then propagates these fields from parcels → permits/CoA via `permit_parcels`/`lead_parcels`, so an operator opening a lead sees the full regulatory context and the Phase-3 cost model has bylaw-anchored inputs.

**This spec's scope:** the SECOND arrow only — `zoning tables → parcels` zoning columns. Pure enrichment; no new source ingestion.

**Out of scope (other specs that also write `parcels` columns):** `is_heritage` (Spec 61), `in_trca_regulated`/ravine (Spec 59), `on_major_street`/centreline (Spec 62), `corner_lot`. `enrich-parcels.js` is structured so those source specs can extend it later, but WF2 implements only the Spec-58-derived zoning fields.

**Success criterion:** after a run, `parcels_with_zone_class_pct ≥ 95%` (Spec 58 §10 WF2 gate); the script is idempotent (steady-state re-run updates 0 rows).
</requirements>

---

<architecture>
## 2. Technical Architecture

### Producer dependency (Spec 58 §9 + §11 — FROZEN contract this spec consumes)

Before any join, read `pipeline_runs.records_meta` for the **most-recent `load_zoning` step (chain `sources`) whose `records_meta.zoning_layers_loaded` is a non-null object** — Spec 58 §11 forwards the §9 contract on `no_op_refresh` skip runs, so this is the latest non-failed run. Then:

1. If the **latest** `load_zoning` run **FAILED** → HALT (dependency failure; do NOT silently fall back to older successful data).
2. If `records_meta.zoning_layers_loaded` is missing / not an object anywhere → HALT (zoning pipeline not initialised).
3. If `zoning_layers_loaded.base !== true` → HALT (WF2 cannot proceed without base zoning).
4. For each overlay key `=== false` → skip that overlay's join + emit `<layer>_overlay_stale` INFO/WARN audit row (degrade to base-only).
5. If `base_layer_committed_after_overlays_failed === true` → emit operator-visible WARN (base consistent, some overlays stale from a partial load).

*(In-chain this is largely redundant — Spec 43 stop-on-failure halts the chain before `enrich_parcels` if `load_zoning` fails — but it hardens standalone/manual runs.)*

### Database Schema — `migrations/165_parcels_zoning_columns.sql`

`ALTER TABLE parcels ADD COLUMN` × all below. **All nullable, no default → metadata-only on PG11+ (instant on 486K rows, no table rewrite; the script backfills).** No index in the migration (`validate-migration.js` Rule 2 forbids non-`CONCURRENTLY` indexes on >100K-row tables and `migrate.js` runs the file in one transaction where `CONCURRENTLY` is illegal — indexes ship via the out-of-band script in §2 Implementation). DOWN block **comments-only** (project migration-runner convention — `tasks/lessons.md`; matches mig 164).

| Column | Type | Source | Precedence |
|---|---|---|---|
| `zoning_class` | TEXT | base `zn_zone` | dominant |
| `zoning_zn_string` | TEXT | base `zn_string` | dominant |
| `zoning_gen_zone` | INTEGER | base `gen_zone` | dominant |
| `zoning_holding` | TEXT | base `zn_holding` | dominant |
| `zone_status` | INTEGER | base `zone_status` | dominant |
| `bylaw_max_fsi` | NUMERIC(6,3) | base `fsi_max` | MIN |
| `bylaw_max_coverage_pct` | NUMERIC(5,2) | `lot_coverage_overlay.coverage_max_pct_override` → base `coverage_max_pct` | overlay-replaces-base, then MIN |
| `bylaw_max_height_m` | NUMERIC(8,2) | `height_overlay.height_max_m` | overlay, MIN |
| `bylaw_max_stories` | INTEGER | `height_overlay.ht_stories` | overlay, MIN |
| `bylaw_max_units` | INTEGER | base `units_max` | MIN |
| `bylaw_max_density` | NUMERIC(10,2) | base `density_max` | MIN |
| `bylaw_min_frontage_m` | NUMERIC(8,2) | base `frontage_min_m` | MAX |
| `bylaw_min_area_sqm` | INTEGER | base `area_min_sqm` | MAX |
| `bylaw_standard_setback_m` | NUMERIC(8,2) | base `standard_setback` | MAX |
| `bylaw_pct_commercial_max` | NUMERIC(5,2) | base `pct_commercial_max` | MIN |
| `bylaw_pct_residential_max` | NUMERIC(5,2) | base `pct_residential_max` | MIN |
| `bylaw_pct_employment_max` | NUMERIC(5,2) | base `pct_employment_max` | MIN |
| `bylaw_pct_office_max` | NUMERIC(5,2) | base `pct_office_max` | MIN |
| `exception_number` | INTEGER | base `exception_number` | dominant |
| `exception_text` | TEXT | base `exception_text` | dominant |
| `bylaw_chapter` | TEXT | base `bylaw_chapter` | dominant |
| `bylaw_section` | TEXT | base `bylaw_section` | dominant |
| `bylaw_exception_ref` | TEXT | base `bylaw_exception_ref` | dominant |
| `in_policy_area` | BOOLEAN | `policy_area_overlay` membership | ST_Intersects |
| `on_policy_road` | BOOLEAN | `policy_road_overlay` (ST_DWithin) | within `road_overlay_distance_m` |
| `in_rooming_house_overlay` | BOOLEAN | `rooming_house_overlay` | ST_Intersects |
| `in_parking_zone_overlay` | BOOLEAN | `parking_zone_overlay` | ST_Intersects |
| `in_building_setback_overlay` | BOOLEAN | `building_setback_overlay` | ST_Intersects |
| `on_priority_retail` | BOOLEAN | `priority_retail_overlay` (ST_DWithin) | within `road_overlay_distance_m` |
| `in_queenstw_eat_overlay` | BOOLEAN | `queenstw_eat_overlay` | ST_Intersects |
| `zoning_overlays` | JSONB | all overlays + candidates | see shape below |
| `zoning_base_source_id` | INTEGER | dominant `zoning_bylaw_areas.source_id` | provenance |
| `zoning_dominant_area_share` | NUMERIC(5,4) | dominant ÷ total intersection area | provenance |
| `zoning_is_ambiguous` | BOOLEAN | `share < 0.60` (`docs/specs/_contracts.json`) | flag |
| `zoning_base_source_dataset_version` | TIMESTAMPTZ | dominant zone `source_dataset_version` | freshness |
| `zoning_enriched_at` | TIMESTAMPTZ | `pipeline.getDbTimestamp(pool)` | run stamp / incremental key |

**`zoning_overlays` jsonb shape (FROZEN — WF3 consumes):**
```json
{
  "base":                 [ { "source_id": 123, "zn_zone": "RD", "area_share": 0.6 }, ... ],
  "height_overlay":       { "applied": true, "height_max_m": 15.0, "stories": 5 },
  "lot_coverage_overlay": { "applied": true, "coverage_max_pct": 45.0 }
}
```
`base` is the ordered candidate list (dominant first) — captures boundary-lot provenance + the conflicting zones behind any `<attr>_conflict`. The two numeric overlays carry their applied value when present (omitted when not, via `jsonb_strip_nulls`). The 7 **categorical** overlay memberships live in the dedicated indexable boolean columns (`in_policy_area`, `on_policy_road`, …) — the source of truth — not duplicated in the jsonb. Keys use the Spec 58 §9 frozen snake-case.

### Implementation

- **`scripts/enrich-parcels.js`** (NEW) — Spec 47 §R1–R12 skeleton; `ADVISORY_LOCK_ID = 65`; `require.main === module` guard (per `tasks/lessons.md` — loaders without it fire a real DB run when `require()`'d in tests).
- **`scripts/lib/zoning-precedence.js`** (NEW, pure) — exports the attr→rule map (`{ bylaw_max_fsi: 'min', bylaw_min_frontage_m: 'max', zoning_class: 'dominant', bylaw_max_height_m: 'overlay', … }`) and a `buildEnrichmentSql(config)` helper that assembles the CTE fragments. No DB access; unit-tested.
- **`scripts/one-time/backfill-parcels-zoning-index.js`** (NEW) — out-of-band `CREATE INDEX CONCURRENTLY` on `parcels (zoning_class)` + partial indexes on the boolean flags where useful; mig-116 precedent (one-time, not in `manifest.json`, registered only in the §A.5 lock-registry comment).

**Engine (executed inside one `pipeline.withAdvisoryLock(pool, 65, …)` → one `withTransaction`):**

1. **Precondition** — verify `idx_parcels_geom_gist` exists on `parcels(geom)` (confirmed present, mig 039) and PostGIS extension is loaded; HALT with an actionable error if either is absent.
2. **Pass A** — `ST_Intersects(p.geom, z.geom)` (GIST) collects each parcel's candidate base zones (and overlay memberships).
3. **Pass B (only multi-candidate parcels)** — compute `ST_Area(ST_Intersection(p.geom, z.geom)::geography) > 0` (`::geography` for true area; `> 0` drops point/edge-touch ties), rank `ROW_NUMBER() OVER (PARTITION BY p.parcel_id ORDER BY intersect_area DESC, z.zn_zone ASC, z.source_id ASC)` (fully deterministic). Single-candidate parcels short-circuit to `dominant_area_share = 1.0`.
4. **Aggregate** numerics (MIN ceilings / MAX floors) across intersecting base+overlay polygons; `FIRST_VALUE(… ORDER BY value, source_id)` for stable jsonb candidate provenance; overlay attrs replace base (D4).
5. **Stage** the result into `TEMP TABLE parcel_zoning_enrich (parcel_id, …) ON COMMIT DROP`, then `UPDATE parcels p SET … FROM parcel_zoning_enrich e WHERE p.parcel_id = e.parcel_id AND (e.zoning_class IS DISTINCT FROM p.zoning_class OR … /* every column */)` — `IS DISTINCT FROM` makes the write idempotent.
6. **Incremental default** — restrict Pass A to parcels whose intersecting zones' `source_dataset_version` > the parcel's `zoning_enriched_at` (full pass on first run or `--full`).
7. **LineString overlays (policy_road, priority_retail) — bbox-prefilter mandatory (PERF, spike finding).** `ST_DWithin(p.geom::geography, road.geom::geography, road_overlay_distance_m)` (F-C2 metre-accurate `::geography`) **defeats the geometry GiST index** and degrades to a nested loop over 8,913 lines. The query MUST prefilter on the indexable geometry bbox first: `WHERE road.geom && ST_Expand(p.geom, 0.0006) AND ST_DWithin(p.geom::geography, road.geom::geography, road_overlay_distance_m)`. `road_overlay_distance_m` logic-var seeded by Spec 58 WF1 (default 5). See `docs/runbook/65_enrich_parcels_spike.md` §4.
</architecture>

---

<behavior>
## 3. Behavioral Contract

- **Inputs:** `chain_sources` step `enrich_parcels` (immediately after `load_zoning`); or manual `node scripts/enrich-parcels.js [--full]`.
- **Core Logic:** consumer-protocol gate (§2) → precondition checks → Pass A/B spatial resolution (DEC-1/DEC-3) → temp-table stage → idempotent `UPDATE parcels` → emit summary/meta.
- **Outputs:** mutates the ~36 `parcels` zoning columns; emits `PIPELINE_SUMMARY` (`records_updated` = parcels changed; `records_total`/`_new` = null — Enrich archetype, not a loader) + `PIPELINE_META`.
- **Edge Cases:**
  - **Gap parcels** (no intersecting base zone — parks/federal/utility/ravine, ~3.2%) → all zoning cols stay NULL; counted in `parcels_no_base_zone_count` (INFO, not a failure).
  - **Boundary lot** (>1 base zone) → dominant for identity, MIN/MAX for numerics, `<attr>_conflict` audit row when candidates disagree, candidates in jsonb.
  - **Ambiguous dominant** (`share < 0.60`, ~0.2% live) → `zoning_is_ambiguous = true` + counted.
  - **Overlay stale** (`zoning_layers_loaded[x] === false`) → skip that overlay, base-only, `<layer>_overlay_stale` row.
  - **PostGIS / GIST absent** → HALT (precondition).
  - **Re-run** with no upstream zoning change → incremental selects 0 parcels; `IS DISTINCT FROM` writes 0 rows.

## 3a. Observability (Spec 47 §8.2 row-derived cascade; Spec 48 §3.6) — gates spike-derived (DEC-4)

| metric | threshold | status |
|---|---|---|
| `parcels_with_zone_class_pct` | PASS ≥95 / WARN 90–95 / FAIL <90 | **hard gate** (Spec 58 §10; live 96.8%) |
| `parcels_no_base_zone_count` | n/a | INFO (gap parcels) |
| `parcels_enriched_count` (= `records_updated`) | n/a | INFO |
| `parcels_ambiguous_zone_count` | n/a; WARN if > 5% of enriched | INFO (live 0.2%) |
| `parcels_multi_zone_count` | n/a | INFO |
| `bylaw_max_fsi_null_pct` | n/a | INFO (sparse by design — live ~95% null) |
| `bylaw_max_coverage_pct_null_pct` | n/a | INFO (live ~43% null) |
| `bylaw_max_height_m_null_pct` | n/a | INFO (live ~10% null) |
| `<attr>_conflict_count` (per numeric attr) | n/a; WARN if > prior-baseline ×2 | INFO |
| `<layer>_overlay_stale` | n/a | WARN if a needed overlay was skipped |
| `enrich_parcels_duration_ms` | n/a; WARN if > 2× prior | INFO |

**Counter compliance (Spec 47 §11):** `records_total`/`records_new` = null (Enrich archetype does not create rows); `records_updated` = parcels mutated this run (primary-entity = parcels only). Per-overlay counts are audit_table rows, not counters.

**Verdict cascade (Spec 47 §8.2):** `rows.some(r=>r.status==='FAIL') ? 'FAIL' : rows.some(r=>r.status==='WARN') ? 'WARN' : 'PASS'` — derived from the row array, never a parallel boolean.

## 3b. emitMeta contract (Spec 47 §R11)
```js
pipeline.emitMeta(
  { zoning_bylaw_areas: ['source_id','zn_zone','zn_string','gen_zone','zn_holding','zone_status','fsi_max','coverage_max_pct','units_max','density_max','frontage_min_m','area_min_sqm','standard_setback','pct_commercial_max','pct_residential_max','pct_employment_max','pct_office_max','exception_number','exception_text','bylaw_chapter','bylaw_section','bylaw_exception_ref','geom','source_dataset_version'],
    zoning_height_overlay: ['source_id','height_max_m','ht_stories','geom','source_dataset_version'],
    zoning_lot_coverage_overlay: ['source_id','coverage_max_pct_override','geom','source_dataset_version'],
    zoning_policy_area_overlay: ['source_id','geom','source_dataset_version'],
    zoning_policy_road_overlay: ['source_id','road_name','geom','source_dataset_version'],
    zoning_rooming_house_overlay: ['source_id','geom','source_dataset_version'],
    zoning_parking_zone_overlay: ['source_id','geom','source_dataset_version'],
    zoning_building_setback_overlay: ['source_id','geom','source_dataset_version'],
    zoning_priority_retail_overlay: ['source_id','geom','source_dataset_version'],
    zoning_queenstw_eat_overlay: ['source_id','geom','source_dataset_version'],
    parcels: ['parcel_id','geom','zoning_enriched_at'] },
  { parcels: ['zoning_class','bylaw_max_fsi','bylaw_max_coverage_pct','bylaw_max_height_m','bylaw_max_stories','bylaw_max_units','bylaw_max_density','bylaw_min_frontage_m','bylaw_min_area_sqm','bylaw_standard_setback_m','bylaw_pct_commercial_max','bylaw_pct_residential_max','bylaw_pct_employment_max','bylaw_pct_office_max','exception_number','exception_text','bylaw_chapter','bylaw_section','bylaw_exception_ref','zoning_zn_string','zoning_gen_zone','zoning_holding','zone_status','in_policy_area','on_policy_road','in_rooming_house_overlay','in_parking_zone_overlay','in_building_setback_overlay','on_priority_retail','in_queenstw_eat_overlay','zoning_overlays','zoning_base_source_id','zoning_dominant_area_share','zoning_is_ambiguous','zoning_base_source_dataset_version','zoning_enriched_at'] },
  // no external service
);
```
</behavior>

---

<failure_modes>
## 3c. Known Failure Modes
*(Populated as CRITICAL/HIGH guards land per `docs/specs/00-architecture/05_knowledge_operating_model.md` §4. Seeded with plan-review guards:)*

- **SRID-4326 area in degrees** — `ST_Area(ST_Intersection(...))` without `::geography` yields square-degrees; benign for single-parcel ranking but ambiguous. Guard: mandatory `::geography` cast on every area calc + `enrich-parcels.db.test.ts` asserting share ∈ [0,1].
- **Skip-run false HALT** — reading "latest run" instead of "latest run with non-null `zoning_layers_loaded`" HALTs on an innocuous `no_op_refresh`. Guard: §2 consumer protocol selects the latest run whose meta is present (Spec 58 §11 forwards it); db test simulates a skip-run row.
- **FSI/coverage over-gating** — a ≥90% gate on `bylaw_max_fsi` (live ~5%) or coverage (~57%) is impossible. Guard: DEC-4 — only `zoning_class` is a hard gate; spike runbook pins the rates.
- **Point-touch zone mis-tag** — zero-area boundary intersections tie the dominant rank. Guard: `NOT ST_Touches(...)` at the join (drops edge/point-only contacts) + `WHERE intersect_area > 0` + deterministic `zn_zone, source_id` secondary sort.
- **O(N) membership / all-pairs ST_Intersection** (caught: full-run perf, impl) — per-parcel correlated `EXISTS` membership subqueries and computing exact `ST_Intersection(...)::geography` for *every* candidate pair made the 486K-parcel run intractable (>9 min, no completion). Guard: (1) memberships are set-based `DISTINCT` join CTEs (one GiST spatial join each), never correlated per-row; (2) exact intersection area is computed ONLY for multi-candidate parcels via a lazy `CASE WHEN COUNT(*) OVER (…) = 1 THEN 1.0 ELSE ST_Area(ST_Intersection(...)::geography) END`. Full run → ~7–8 min (50K ≈ 45 s, benchmarked).
</failure_modes>

---

<maxbuild>
## 4. Max-build envelope (v1.1 — 2026-06-21, WF1/Genesis)

A SECOND set-based UPDATE pass in `enrich-parcels.js` computes, per parcel, the **maximum buildable structure** — a geometric footprint + a human-readable L×W×H box + GFA + garden-suite size — gated on a **lot-size confidence** cross-check, then `enrich-permits.js` propagates the feed onto permits + coa_applications (so every application shows both the lot-validation inputs and the computed envelope). Born from the user requirement: reason about "how big could this be" (new build / addition headroom / suite), location-dependent (ravine reduces, heritage freezes, narrow lots constrain). Inputs drawn from Specs 58 (FSI/coverage/height/`bylaw_standard_setback_m`/exceptions), 59 (ravine), 61 (heritage), 62 (corner/through lot).

### MB-DEC — design decisions (folded from two 6-panel plan-review rounds)
- **MB-1 Separate pass, separate columns.** The 16 new columns live in `scripts/lib/max-build.js` `MAX_BUILD_COLS` and are written by `buildMaxBuildSql`/`buildMaxBuildUpdateSql` — a SECOND `UPDATE parcels` that READS the already-written zoning feed (`bylaw_max_*`) + lot dims (`frontage_m`/`depth_m`, mig 011) + geom + the massing join. They are **NOT** in `ALL_WRITE_COLS` and **NOT** inside `buildEnrichmentSql`'s spatial CTE — protecting the migration-165 36-column regression lock + the stale-overlay / NOT ST_Touches / round-cast idempotency fences. Runs in the SAME transaction after the zoning pass (so `parcel_zoning_enrich` is still visible for incremental scoping).
- **MB-2 Lot-validation gate (Phase 1).** `lot_size_confidence` (high/medium/low) from a 3-way cross-check: stored `lot_size_sqm` vs inline `ST_Area(geom::geography)` vs `frontage_m × depth_m` (NO `stated_area_raw` re-parse — `lot_size_sqm` is already the parsed value). `high` = all 3 pairwise within 15%; `medium` = ≥1 pair agrees; `low` = none agree OR out-of-bounds (<50/>2000 m²). The envelope (Phase 2/3) emits ONLY when `lot_size_confidence ∈ {high, medium}` — else NULL + `envelope_constraint_reason='low_lot_confidence'`.
- **MB-3 Geometric footprint + rect box (Phase 2).** `max_buildable_footprint_sqm = LEAST(ST_Area(ST_Buffer(geom::geography, -(side_setback+ravine_red))), box_area, lot×coverage)` — the negative buffer is shape-aware (irregular/pie-safe) but directionally-blind; the `max_build_width/length_m` rect box (`max_build_basis='rect_approx'`) is directional but shape-blind; the two cross-check via `LEAST` (which ignores NULLs). Empty buffer (lot < 2×inset) → NULL + `setback_exceeds_lot`. Widths/lengths clamp `GREATEST(0,…)` → NULL + `lot_too_narrow`. Stories = `GREATEST(1, COALESCE(bylaw_max_stories, round(height/3.0)))`; both NULL → NULL (not floored to 1). GFA = `LEAST(footprint×stories, lot×FSI)`; basis `fsi`/`coverage_box`.
- **MB-4 Setbacks.** `bylaw_standard_setback_m` (from `STAND_SET`, front-aligned) is the FRONT setback when present; side/rear/flankage have NO source field → always from the coarse `zoning_class → {front,side,rear,flankage}` table in `scripts/lib/max-build.js` (`SETBACK_DEFAULTS`, documented approximations). `max_build_setback_basis` records `bylaw` vs `zone_default` (the rollup keys on it). Setbacks always resolve (the zone-default table has a DEFAULT row), so the front setback is never NULL — there is no `no_setback_data` outcome in practice.
- **MB-5 Location reductions (Phase 3).** Corner → `width = frontage − front − flankage`; through-lot → `length = depth − 2×front`. Ravine → subtract a FIXED `RAVINE_SETBACK_M` (10 m, Ch.658 stable-slope); `ravine_distance_m` is display-only, **NOT** a multiplier (Spec 59 L2: it is signed proximity, not a gradient). Heritage → FREEZE to existing structure (`SUM(footprint_area_sqm)`, `MAX(estimated_stories)` across primary `parcel_buildings`→`building_footprints`); no primary building → NULL + `heritage_no_massing`; **`bylaw_max_*` is never overwritten** (variance_context depends on it). Garden suite (rear-yard) gated on min lot area + usable rear yard, excluding ravine/heritage — NOT laneway (laneway-suite deferred #431-FU2).
- **MB-6 Single confidence rollup.** `max_build_confidence` (high/medium/low) covers the WHOLE envelope, is pure NUMBER-trust (decoupled from constraint status — a heritage freeze with real massing stays `high`), worst-input-wins: `high` = lot high + bylaw setback + (FSI or real height); `medium` = lot medium / zone-default setback / height-only; `low` = clamped / ambiguous_zone / multi-parcel assembly / lot low. (Replaces per-field footprint/GFA confidences — shared inputs.)
- **MB-7 Propagation = dominant parcel.** `enrich-permits.js` propagates lot INPUTS (`lot_size_sqm`/`frontage_m`/`depth_m`/`lot_size_confidence`/`lot_size_basis`) + envelope OUTPUTS from the **dominant parcel** (`rn=1`; an assembly has no coherent envelope) via the established §8e 4-surface pattern (`allWriteCols`, `cand`/`ag`+SELECT, `buildNullifyOrphansSql`, `buildUpdateSql`). `max_build_confidence` degrades to `low` when `zoning_parcel_count > 1`. The two NOT-NULL booleans (`garden_suite_fits`, `envelope_constrained`) reset to false on orphan-nullify. **Precondition:** `link-massing` should precede enrich-parcels for the heritage freeze; otherwise heritage parcels emit `heritage_no_massing`.
- **MB-8 Observability — all INFO, never gated.** Coverage of every envelope field is sparse-by-design (FSI ~5% → GFA largely `coverage_box`), so all rows are `infoRow` (no denominator): `lot_size_confidence` + `max_build_confidence` 3-tier distributions, per-output populated counts (footprint/gfa/box) + the `gfa_basis` split (keeps the footprint-OK/GFA-null gap visible behind the unified confidence), `garden_suite_fits`/`envelope_constrained` TRUE-subset counts — in enrich-parcels' audit_table, enrich-permits' audit_table, AND assert-global-coverage (parcels + propagated coa/permits). Verdict cascade stays row-derived. First-deploy 0→N spike: `docs/runbook/max_build_envelope_first_deploy.md` (§3.7).

## 5. Existing-structure fields (Phase 1 — 2026-06-22, WF1/Genesis)

The CURRENT dwelling's dimensions — the geometric truth the cost model (Spec 83 Step A) uses for renovation scenarios (a basement reno costs off the existing footprint, not the max-build). Data source = Spec 56 massing (`parcel_buildings` is_primary → `building_footprints`), now ~100% residential coverage after the [link-massing predicate fix](56_source_massing.md). Written by a **THIRD set-based UPDATE pass** in `enrich-parcels.js` (`buildExistingStructureSql`/`enrichExistingStructure`), propagated to permits + coa_applications from the dominant parcel.

- **ES-1 Separate pass (not the max-build CTE).** The max-build `massing` CTE is `SUM(footprint) FILTER(is_primary) GROUP BY` (feeds the heritage freeze) — incompatible with selecting the primary's `geom` (oriented envelope) + non-primary aggregates. So Phase 1 is its own pass with `prim` (one row/parcel by mig 081's partial unique index → no GROUP BY: geom/footprint/stories/height/`pb.confidence`) + `allb` (`COUNT/SUM FILTER(NOT is_primary)`) CTEs. The max-build/heritage code is byte-identical. Own `EXISTING_COLS` array, own idempotent IS-DISTINCT-FROM UPDATE.
- **ES-2 The 10 columns** (mig 187, all nullable; `ROUND(…,2)` on numerics for idempotency): `existing_footprint_sqm`, `existing_stories` (height-derived est.), `existing_height_m`, `existing_gfa_sqm` (= `footprint × GREATEST(1, COALESCE(stories,1))` — floored so a <3 m bungalow isn't GFA-zeroed), `existing_width_m`/`existing_length_m` (the two sides of `ST_OrientedEnvelope(bf.geom)` measured in **metres via `::geography`** at the point level; areal-geom guarded; NULL when geom NULL/non-areal), `existing_structure_confidence` (`high` if `pb.confidence >= 0.90` i.e. centroid-in-parcel, else `low` for nearest-fallback — a low link may be a neighbour's building), `existing_other_structures_count`/`_sqm` (non-primary buildings), `existing_greenspace_sqm` (`GREATEST(0, lot − primary − other)` — unbuilt open area; assumes non-overlapping footprints; not vegetation-verified, excludes unseen paving).
- **ES-3 Emit rule.** existing_* populate whenever a primary building is linked (carrying the confidence flag); NULL when no massing link, so vacant/park/no-building parcels read NULL (honest, not fabricated). Incremental: mirrors the max-build pass (first-time OR re-enriched-this-run); `--full` after a massing reload.
- **ES-4 Propagation + observability.** `enrich-permits.js` `EXISTING_STRUCTURE_COLS` through the 4 §8e surfaces (nullable TEXT confidence → generic `=NULL` orphan path; no NOT-NULL bools) + `assertExistingStructureColumns` guard (mig 187/188). Three-layer INFO (enrich-parcels + enrich-permits + assert-global-coverage), all `infoRow`, never gated; `existing_structure_confidence` as `_high_count`/`_low_count` buckets.
- **ES-5 Cost-model alignment.** `existing_gfa_sqm` IS Spec 83 Step A for the existing structure; the Phase-2 reno scenarios (basement/storey/kitchen/bath/interior) derive their Area_Eff from these fields via the archetype `geom_basis`. No cost-model change in Phase 1 (fields only).

### Incremental scope
The max-build pass recomputes a parcel when `lot_size_confidence IS NULL` (first-time) OR its zoning was re-enriched this run (present in `parcel_zoning_enrich`). `--full` recomputes all — **run `--full` after a lot/massing reload** (lot dims or massing changing without a zoning change won't otherwise re-trigger). `IS DISTINCT FROM` keeps steady-state re-runs at 0 writes.

### Migrations
- `migrations/185_parcels_max_build_columns.sql` — 16 parcels columns (nullable; 2 NOT-NULL bools).
- `migrations/186_permits_coa_max_build_columns.sql` — lot inputs + envelope outputs on permits + coa_applications (`is_through_lot` already on both via mig 176).
</maxbuild>

---

<scenarios>
## 6. Reno/build scenario GFAs + geom_basis + storey-height (Phase 2 — 2026-06-22)

Per-archetype renovation/build floor-area estimates so cost is project-type-aware (basement reno costs off the existing footprint, new build off max-build). Pure arithmetic off Phase-1 existing-structure + the shipped max-build — computed by a sibling UPDATE in the existing-structure pass; propagated to permits/coa. **B2 (broader trade-differentiated archetypes — `basement-underpinned`/`interior-gut`/`envelope-cladding`/`site`/`FB+COA` codes) is deferred to its own Spec-80 WF** (classifier/ArchetypeCode blast radius). **Garage → Phase 3** (accessory fit).

- **SC-1 The 6 scenario columns** (mig 189, nullable, `ROUND(…,2)`): `max_newbuild_coa_gfa_sqm` = `max_buildable_gfa × (1+reno_coa_uplift_pct)`; `cur_basement_gfa_sqm` = `existing_footprint`; `cur_storey_gfa_sqm` = `existing_footprint × (max_build_stories − existing_stories)` (**NULL — not 0 — when either storey count is unknown**); `cur_interior_reno_gfa_sqm` = `existing_gfa`; `cur_est_kitchen_gfa_sqm` = `existing_footprint × reno_kitchen_gfa_pct`; `cur_est_bath_gfa_sqm` = `existing_footprint × reno_bath_gfa_pct`. Envelope-expanding addition → reuse FB (`max_buildable_gfa_sqm`).
- **SC-2 Same pass, sibling UPDATE.** The existing-structure (`buildExistingStructureSql`) scope CTE additionally reads `max_buildable_gfa_sqm`/`max_build_stories` from the parcels row (written by the max-build pass earlier in the same txn); the 6 scenarios are SELECTed there; `buildScenarioUpdateSql` (distinct `SCENARIO_COLS` array + own IS-DISTINCT-FROM) writes them from the same `parcel_existing_struct` temp table — `EXISTING_COLS`/heritage/max-build stay byte-stable.
- **SC-3 Externalized factors.** `reno_coa_uplift_pct` (0.05), `reno_kitchen_gfa_pct` (0.15), `reno_bath_gfa_pct` (0.07), `storey_height_m` (3.0) → `logic_variables` (seeded in `scripts/seeds/logic_variables.json`; `control-panel.ts LOGIC_VAR_DEFAULTS` auto-derives; parity locked by `control-panel.logic.test`), read+Zod-validated in enrich-parcels (schema also covers the pre-existing `road_overlay_distance_m`). Resolved values surface as `*_applied` INFO provenance rows. Kitchen/bath %-of-footprint is the chosen model (footprint = single-floor denominator); high-footprint tail over-estimates — min/max clamps deferred to calibration.
- **SC-4 Storey-height refinement (Part C).** `max_build_stories` height→storey translation is use-class-aware (`buildStoreyHeightCase`: residential = externalized `storey_height_m` 3.0; commercial/employment/institutional ≈ 4.0) instead of a flat 3.0; new `max_build_stories_basis` (`'bylaw'` when the by-law gives a storey count, else `'derived'`, `'existing'` for heritage-frozen). Both `max_build_stories` and `existing_stories` use the same translation, so the add-storey headroom is robust to the absolute storey-height. (Re-touches the shipped max-build derivation; `MAX_BUILD_COLS` 16→17.)
- **SC-5 Archetype `geom_basis` (B1).** `archetypes.js` + `archetypes.ts` gain an additive `ARCHETYPE_GEOM_BASIS` map (NOT widening the bundle objects → bundle/parity tests unaffected): FB→`max_buildable_gfa_sqm`, ADD→`cur_storey_gfa_sqm`, BAS→`cur_basement_gfa_sqm`, KIT→`cur_est_kitchen_gfa_sqm`, BTH→`cur_est_bath_gfa_sqm`, INT→`cur_interior_reno_gfa_sqm`, LANE→`max_garden_suite_gfa_sqm`, ENV/MEC/SITE→`null`, GAR→`null` (Phase 3). The archetype = the bridge classify → geom_basis → parcel field → cost Area_Eff (Spec 83 Step B). Dual-path parity + a drift-proof test (every non-null geom_basis is a real `parcels` column). No cost-model wiring in Phase 2.
- **SC-6 Observability.** All scenario fields INFO, never gated (NULL on no-massing); per-field populated counts in all three layers (enrich-parcels audit + enrich-permits audit + assert-global-coverage pa/ca). The `reno_*_pct_applied` / `storey_height_m_applied` **provenance** rows appear at the **producer (enrich-parcels) layer only** — that is where the externalized factors are resolved and applied; enrich-permits merely propagates the already-computed scenario columns from the dominant parcel (it never re-applies the factors), so re-emitting `*_applied` there would assert a value it never used. Propagation via `SCENARIO_COLS` through the §8e 4 surfaces + `assertScenarioColumns` guard (mig 189/190); `max_build_stories_basis` rides the max-build propagation (now in `MAX_BUILD_COLS`).
- **Migrations:** `189_parcels_scenario_gfa_columns.sql` (6 scenario cols + `max_build_stories_basis`) + `190_permits_coa_scenario_gfa_columns.sql` (propagation).
</scenarios>

---

<accessory>
## 7. Garage + rear-suite accessory fit + CoA permission (Phase 3 — 2026-06-23)

By-law / space-fit for the two new-accessory archetypes — **garage** (GAR) and **rear suite** (LANE = laneway ⊕ garden) — each carrying an **as-of-right vs. CoA-variance permission**, so leads split by regulatory friction. Computed in the same max-build pass (`buildMaxBuildSql`, two new `accessory`/`accessory2` CTEs after `gfa`); propagated to permits/coa. Completes the archetype→`geom_basis` bridge for GAR/LANE. Closes Spec 62 #431-FU2 (`abuts_laneway`).

- **AF-1 `abuts_laneway` (Spec 62 #431-FU2).** `parcels.abuts_laneway` BOOLEAN NOT NULL DEFAULT false — written by `enrich-centreline.js` (`bool_or(seg_is_lane)` over the parcel's adjacent segments, `COALESCE(…,false)`, IS-DISTINCT-FROM guarded), reusing the §8d 20 m proximity model. The #431-FU `NOT c1_is_lane AND NOT c2_is_lane` corner/through guards are preserved byte-for-byte (regression-locked). Joins `CENTRELINE_COLS` for §8e propagation (orphan-nullify resets to false). Read by the max-build pass same-run (chain order: enrich_centreline → … → enrich_parcels).
- **AF-2 In-pass inputs.** The pass's own `massing` CTE gains `existing_total_footprint_sqm = SUM(all buildings)` (incl. sheds/detached garages) so yard/greenspace aren't optimistic; the heritage freeze keeps the **primary-only** `existing_footprint_sqm` (no regression). `rear_yard_depth = depth_m − front_setback − rear_setback` (the shipped garden-suite expr); `rear_yard_area = GREATEST(0, rear_yard_depth × buildable_width − existing_total_footprint_sqm)`.
- **AF-3 Garage.** `garage_permission` TEXT {as_of_right|coa_required|not_permitted|NULL} (nullable; subsumes a `*_fits` bool) · `max_garage_gfa_sqm` · `garage_capacity_cars` = `floor(gfa/car_footprint_sqm)` · `garage_constraint_reason` (ordered ELSE chain mirroring `envelope_constraint_reason`: low_lot_confidence→heritage→ravine→lot_too_small→no_rear_yard). Fit (emit-gated): lot ≥ `garage_min_lot_sqm` AND `rear_yard_area ≥ garage_min_footprint_sqm`, excl. heritage/ravine. `max_garage_gfa_sqm = LEAST(garage_max_gfa_sqm, accessory_max_coverage_pct × rear_yard_area)` (footprint **area** test). Garage is single-storey → footprint = GFA.
- **AF-4 Rear suite — STRICT laneway ⊕ garden.** A lane lot builds a laneway suite, a non-lane lot a garden suite — never both (by-law). `rear_suite_type` = `'laneway'` when `abuts_laneway AND laneway_fits`, `'garden'` when `NOT abuts_laneway AND garden_fits`, else NULL — **no garden fallback on a lane lot**. `max_rear_suite_gfa_sqm` = the chosen type's GFA (laneway `laneway_suite_max_gfa_sqm` 2-storey; garden `garden_suite_max_gfa_sqm`). `garden_suite_*` (shipped) unchanged. Suite footprint = `GFA / storeys` (`laneway_suite_storeys`/`garden_suite_storeys`) — ground coverage for greenspace.
- **AF-5 CoA permission (greenspace-driven).** `*_permission`: not-fits → `not_permitted` (emit) / NULL; else `greenspace_after ≥ min_soft_landscaping_pct × lot_size_sqm` ? `as_of_right` : `coa_required`, where `greenspace_after = GREATEST(0, lot − existing_total_footprint − accessory_footprint)`. **Scope-honest:** the as-of-right determination covers the **soft-landscaping (greenspace) standard only** — setback/height/angular-plane/FSI variances are NOT evaluated (documented in column COMMENTs).
- **AF-6 geom_basis (DEC-1 = Option C).** `GAR→max_garage_gfa_sqm`, `LANE→max_rear_suite_gfa_sqm` (the unified chosen-suite value). NULL on a no-fit lot → the cost model (Spec 83 Step B) safe-skips. Value-pinned + dual-path (`archetypes.js`+`.ts`).
- **AF-7 Externalization.** **Every by-law numeric is a `logic_variable`** (Spec 47 §4.2; provenance Spec 48) — zero hardcoded literals. 14 keys: garage (`garage_min_lot_sqm`/`garage_max_gfa_sqm`/`garage_min_footprint_sqm`/`accessory_max_coverage_pct`/`car_footprint_sqm`), laneway (`laneway_suite_max_gfa_sqm`/`laneway_suite_min_lot_sqm`/`laneway_suite_min_rear_yard_m`), `min_soft_landscaping_pct`, `laneway_suite_storeys`/`garden_suite_storeys`, and the now-externalized garden-suite trio (`garden_suite_min_lot_sqm`/`_min_rear_yard_m`/`_max_gfa_sqm`, defaults = prior hardcoded values → byte-stable). Zod-validated (bounds mirror the JSON); control-panel auto-derives; a two-source-sync test pins JSON defaults === JS fallbacks.
- **AF-8 Observability.** All accessory fields INFO, never gated; the **permission distribution** (as_of_right / coa_required counts) is emitted across the 3 layers (enrich-centreline `abuts_laneway` count + enrich-parcels audit + enrich-permits audit + assert-global-coverage pa/ca). All 8 max-build accessory cols **auto-ride** `MAX_BUILD_COLS`→`LOT_MAXBUILD_COLS` (nullable → generic =NULL orphan path); `assertMaxBuildColumns` cites mig 185/189/191 ÷ 186/190/192. `MAX_BUILD_COLS` 17→25; `MAX_BUILD_BOOL_COLS` unchanged.
- **Migrations:** `191_parcels_accessory_columns.sql` (abuts_laneway + 8 accessory cols) + `192_permits_coa_accessory_columns.sql` (propagation; `abuts_laneway` NN-DEFAULT-false matching `garden_suite_fits`).
- **Known limitations (DEFER → review_followups):** `abuts_laneway` inherits the 20 m-proximity model (not a strict shared-boundary test); accessory fields re-enrich on a zoning change only (a centreline/massing-only change needs `--full`); the max-build `massing` CTE is unscoped (whole-DB scan — incremental perf).
</accessory>

---

<testing>
## 5. Testing Mandate
- **Logic** (`src/tests/zoning-parcels.logic.test.ts`): `zoning-precedence.js` attr→rule map completeness (every parcel column has a rule); `buildEnrichmentSql` emits MIN for ceilings / MAX for floors / dominant for identity; deterministic ORDER BY present; jsonb shape builder.
- **Infra** (`src/tests/parcels-zoning-columns.regression.test.ts`): migration 165 applied — all ~36 columns + exact types + CHECK-free nullability; assert **no** new index on `parcels` from the migration; `zoning_overlays` is JSONB.
- **DB integration** (`src/tests/db/enrich-parcels.db.test.ts`, gated `BUILDO_TEST_DB=1`): temp-table + `UPDATE … FROM`; gap parcel → NULLs + count; boundary parcel → dominant identity + MIN numeric + `<attr>_conflict` row + jsonb candidates; ambiguity flag at `share<0.60`; point-touch intersection excluded; incremental skip + idempotent re-run (0 rows); precondition HALT when GIST/PostGIS absent; skip-run `records_meta` forwarding honored.
- **Max-build logic** (`src/tests/max-build.logic.test.ts`): `lookupSetback`/`buildSetbackCase` (longest-prefix wins, DEFAULT fallback, dims complete); constants present; **`MAX_BUILD_COLS` ∩ `enrich-parcels.ALL_WRITE_COLS` empty** (MB-1 regression lock); `LOT_MAXBUILD_COLS` shape; `MAX_BUILD_BOOL_COLS ⊂ MAX_BUILD_COLS`.
- **Max-build DB integration** (`src/tests/db/enrich-parcels-maxbuild.db.test.ts`, gated `BUILDO_TEST_DB=1`): lot-confidence tiers; geometric footprint vs coverage cap; corner (flankage) + through (2×front) reductions; ravine fixed-setback; heritage freeze with/without massing; narrow-lot clamp → `lot_too_narrow`; garden-suite gate (excludes ravine/heritage); NULL-on-low-confidence; idempotent re-run.
- **Propagation** (`src/tests/enrich-permits-maxbuild.logic.test.ts`): `MAXBUILD_COLS` on all 4 surfaces; orphan-nullify resets the 2 NOT-NULL bools to `false`; `max_build_confidence='low'` on assembly; `assertMaxBuildColumns` guard.

Every test file carries the `SPEC LINK` header.
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/enrich-parcels.js` (NEW; v1.1 adds the max-build second pass)
- `scripts/lib/zoning-precedence.js` (NEW)
- `scripts/lib/max-build.js` (NEW v1.1 — setback table, constants, `MAX_BUILD_COLS`, SQL fragments)
- `scripts/enrich-permits.js` (v1.1 — max-build §8e propagation; otherwise Spec 66)
- `scripts/quality/assert-global-coverage.js` (v1.1 — max-build INFO rows)
- `scripts/one-time/backfill-parcels-zoning-index.js` (NEW)
- `migrations/165_parcels_zoning_columns.sql` (NEW)
- `migrations/185_parcels_max_build_columns.sql` (NEW v1.1)
- `migrations/186_permits_coa_max_build_columns.sql` (NEW v1.1)
- `docs/runbook/max_build_envelope_first_deploy.md` (NEW v1.1)
- `scripts/manifest.json` — add `enrich_parcels` script + `chains.sources` step (after `load_zoning`)
- `src/components/FreshnessTimeline.tsx` — `PIPELINE_REGISTRY` + `PIPELINE_CHAINS.sources`
- `src/lib/admin/funnel.ts` — `STEP_DESCRIPTIONS` / `PIPELINE_TABLE_MAP` (NOT `LOADER_SLUGS` — enricher)
- `src/tests/pipeline-advisory-lock.infra.test.ts` — register lock 65
- `src/tests/chain.logic.test.ts` — sources step count 17 → 18 (+ `quality.logic.test.ts` if pinned)
- `docs/specs/01-pipeline/43_chain_sources.md` — document the `enrich_parcels` step
- `docs/specs/_contracts.json` — `zoning_ambiguous_dominant_share_max = 0.60`
- `docs/specs/01-pipeline/58_source_zoning_bylaw.md` — update §8c to point here
- `src/tests/factories.ts` — parcel factory zoning fields
- 3 test files (§5)

### Out-of-Scope Files
- `scripts/enrich-permits.js` / `permits` + `coa_applications` columns — Spec 58 WF3 (separate spec)
- `permit_parcels` / `lead_parcels` — owned by Specs 41/42/55; WF2 only reads parcels
- Heritage/ravine/centreline/corner-lot parcel columns — Specs 61/59/62
- Any cost-model, UI, or API code — downstream consumers

### Cross-Spec Dependencies
- **Relies on:** Spec 58 (zoning tables + frozen §9/§11 `records_meta` contract), Spec 55 (`parcels` + `idx_parcels_geom_gist`), Spec 47 (§R1–R12, §6.4 IS DISTINCT FROM, §8 audit, §11 counters), Spec 48 (§3.6 cascade), Spec 43 (`chain_sources` sequencing), Spec 30 (Enrich archetype).
- **Consumed by:** Spec 58 WF3 (`enrich-permits.js` — reads `parcels.zoning_*` + `zoning_overlays` via `permit_parcels`/`lead_parcels`), Phase-3 cost model, lead-detail UI.
</constraints>
