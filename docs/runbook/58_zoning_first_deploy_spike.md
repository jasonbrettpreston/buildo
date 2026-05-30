# Runbook: Spec 58 `load_zoning` — First-Deploy Spike

**SPEC LINK:** `docs/specs/01-pipeline/58_source_zoning_bylaw.md` (v2.3) · Spec 48 §3.7
**Step:** `sources:load_zoning` · **Script:** `scripts/load-zoning.js` · **Lock:** 58
**Acquisition:** CKAN **DataStore API** (`datastore_search`, paginated per resource_id) — supersedes spec §2's "download SHP ZIP" note (the `_id` upsert key only exists in the DataStore). Spec §2 amendment owed.

---

## 1. Spike shape (first production load)

First run is a ~27K-row INSERT spike across 10 layers. Verified counts (spike 2026-05-30, against live CKAN):

| Layer | Table | Rows | Geometry |
|---|---|---:|---|
| base | `zoning_bylaw_areas` | 11,719 | MultiPolygon |
| height_overlay | `zoning_height_overlay` | 2,528 | MultiPolygon |
| lot_coverage_overlay | `zoning_lot_coverage_overlay` | 1,242 | MultiPolygon |
| building_setback_overlay | `zoning_building_setback_overlay` | 4 | MultiPolygon |
| policy_area_overlay | `zoning_policy_area_overlay` | 352 | MultiPolygon |
| policy_road_overlay | `zoning_policy_road_overlay` | 8,913 | MultiLineString |
| rooming_house_overlay | `zoning_rooming_house_overlay` | 558 | MultiPolygon |
| parking_zone_overlay | `zoning_parking_zone_overlay` | 913 | MultiPolygon |
| priority_retail_overlay | `zoning_priority_retail_overlay` | 643 | MultiLineString |
| queenstw_eat_overlay | `zoning_queenstw_eat_overlay` | 4 | MultiPolygon |
| **Total** | | **~26,876** | |

**Steady state:** by the 2nd run on unchanged source, every layer's `*_unchanged_skipped` ≈ its `loaded_count` and `*_orphans_removed_count` = 0 (IS DISTINCT FROM makes re-runs no-ops). Target: `records_unchanged > 99%` of `records_total` within one run after the first.

**Expected first-run audit characteristics (all INFO → verdict PASS):**
- `zoning_areas_loaded_count` = 11,719 (INFO; FAIL only if 0 — OB-2 gate)
- `zoning_areas_out_of_range_nulled_count` ≈ 78,744 (INFO) — Toronto's `-1` "not regulated" sentinel, nulled per the cell-null policy (refines P-H5; spec amendment owed)
- `zoning_areas_with_exceptions_count` ≈ 8,956 · `zoning_areas_distribution_top20` led by RD / CR / R / RM
- `*_repaired_polygon_count` small and non-zero (ST_MakeValid) · `*_invalid_polygon_count` = 0
- `dataset_version_age_days` ≈ 98 (INFO) — **publisher cadence, NOT bylaw freshness** (F-H10): the 2026-02-20 refresh covers amendments only through June 2023 (~2.5-yr semantic backlog). Cross-reference the dataset description's "amendments through" date for true freshness.

---

## 2. ⚠️ Exit criterion (corrected — supersedes spec §4)

Spec §4's exit SQL (`coverage_max_pct IS NOT NULL ≈ 11,719`) is **wrong against the real source**: Toronto leaves `COVERAGE` **null on every base row** (coverage lives in the `zoning_lot_coverage_overlay`, not the base layer). Use instead:

```sql
-- Base loaded at full count, FSI (the populated cost-model input) present where regulated:
SELECT
  (SELECT count(*) FROM zoning_bylaw_areas)                                AS base_rows,        -- expect 11,719 (±5%)
  (SELECT count(*) FROM zoning_bylaw_areas WHERE fsi_max IS NOT NULL)       AS base_with_fsi,    -- expect ~2,835 (sparse "where regulated")
  (SELECT count(*) FROM zoning_lot_coverage_overlay)                        AS coverage_overlay, -- expect 1,242 (the real coverage source)
  (SELECT count(*) FROM zoning_height_overlay WHERE height_max_m IS NOT NULL) AS height_rows;    -- expect ~2,528
```

`coverage_max_pct` on the base layer being ~0% populated is **expected**, not a spike failure. The downstream cost model (Phase 3) should read coverage from `zoning_lot_coverage_overlay.coverage_max_pct_override` and FSI from `zoning_bylaw_areas.fsi_max`. (Spec §4 amendment owed.)

---

## 3. Pre-ack instrument (for `docs/reports/observe-chain-acknowledgements.md`)

On first deploy, append this block so the observer treats the spike rows as acknowledged-expected, not anomalies:

```markdown
### load_zoning — first-deploy spike (acknowledged YYYY-MM-DD)
- ~27K INSERT spike across 10 layers is EXPECTED on first run (see runbook §1).
- `zoning_areas_loaded_pct` / all `*_loaded_pct` emit `_no_baseline: true` INFO on the first CHAINED run (no prior `sources:load_zoning` row yet) — acknowledged.
- `zoning_areas_out_of_range_nulled_count` ~78K INFO (the -1 sentinel) — acknowledged, not a data-quality regression.
- `dataset_version_age_days` reflects publisher cadence, not bylaw freshness — acknowledged.
```

---

## 4. Skip-run (no_op_refresh) behaviour

On a run where every layer's CKAN `last_modified` is unchanged vs the prior `sources:load_zoning` run, the step **exits early** emitting exactly: `no_op_refresh: true` (INFO), `dataset_source_license` (INFO), `dataset_version_age_days` (INFO) — and **no** layer-level rows. A sparse `audit_table.rows` on a `no_op_refresh` run is **expected**, not a broken pathway. (Skip is forced — full reload — if a layer lacks `Last-Modified`/`ETag`, or if the cached version is older than 730 days, F-M4.)

**Baseline caveat:** `pipeline.run` does not write a `pipeline_runs` row — only `run-chain.js` does, as `sources:load_zoning`. So baselines (`*_loaded_pct`, `*_duration_ms`, `*_with_exceptions`, NULL-count deltas) only populate after the **first chained run**; standalone `node scripts/load-zoning.js` invocations always show `_no_baseline`/INFO. `observe-chain.js`'s 7-day narrative window will also flag this quarterly step as "first-run" on most runs — treat as context, not regression.

---

## 5. Cross-WF triage path (Spec 58 §10)

Operator triaging a permit missing `zoning_class` (after the future WF2/WF3 land):

```
1. pipeline_runs → most-recent successful chain='sources' run.
2. step 'load_zoning' (this spec):
     records_meta.zoning_layers_loaded.base === false?   → root cause HERE (base failure; chain HALTS per D3)
     records_meta.zoning_partial_load truthy?            → which overlays missing
     records_meta.base_layer_committed_after_overlays_failed === true?  → base OK but overlays stale (partial load)
     records_meta.zoning_layer_versions                  → per-layer source freshness
3. step 'enrich_parcels' (WF2, future):  parcels_with_zone_class_pct < 95% → spatial-join failure
4. step 'enrich_permits' (WF3, future):  permits_zoning_class_coverage_pct FAIL → JOIN failure (permit_parcels)
```

---

## 6. Rollback

Tables are additive (migration 164). To remove: uncomment the `-- DROP TABLE … CASCADE` block in `migrations/164_zoning_bylaw_tables.sql` and run manually (Rule-6 commented DOWN; `migrate.js` does not auto-run it). The loader is idempotent — re-running after a partial/failed load is always safe.
