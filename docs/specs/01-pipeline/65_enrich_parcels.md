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

<testing>
## 5. Testing Mandate
- **Logic** (`src/tests/zoning-parcels.logic.test.ts`): `zoning-precedence.js` attr→rule map completeness (every parcel column has a rule); `buildEnrichmentSql` emits MIN for ceilings / MAX for floors / dominant for identity; deterministic ORDER BY present; jsonb shape builder.
- **Infra** (`src/tests/parcels-zoning-columns.regression.test.ts`): migration 165 applied — all ~36 columns + exact types + CHECK-free nullability; assert **no** new index on `parcels` from the migration; `zoning_overlays` is JSONB.
- **DB integration** (`src/tests/db/enrich-parcels.db.test.ts`, gated `BUILDO_TEST_DB=1`): temp-table + `UPDATE … FROM`; gap parcel → NULLs + count; boundary parcel → dominant identity + MIN numeric + `<attr>_conflict` row + jsonb candidates; ambiguity flag at `share<0.60`; point-touch intersection excluded; incremental skip + idempotent re-run (0 rows); precondition HALT when GIST/PostGIS absent; skip-run `records_meta` forwarding honored.

Every test file carries the `SPEC LINK` header.
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/enrich-parcels.js` (NEW)
- `scripts/lib/zoning-precedence.js` (NEW)
- `scripts/one-time/backfill-parcels-zoning-index.js` (NEW)
- `migrations/165_parcels_zoning_columns.sql` (NEW)
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
