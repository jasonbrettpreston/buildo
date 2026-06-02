# Runbook — `source-ravines` first-deploy spike (Spec 48 §3.7)

**Script:** `scripts/load-ravines.js` (chain slug `load_ravines`, advisory lock 59)
**Spec:** `docs/specs/01-pipeline/59_source_ravine_protection.md` (v1.2 §8c)
**Audience:** pipeline operator promoting the `sources` chain after the ravine ingest lands.

The first run of `load_ravines` inserts the entire dataset (~854 polygons) in one
pass. Every subsequent run is a near-no-op (HEAD skip-check, or 0 inserts / 0
updates via the `IS DISTINCT FROM` guard) until Toronto republishes the dataset
(10–20-year cadence). This runbook describes the expected first-run shape, how to
estimate it before deploy, the convergence criterion, the WKB round-trip
integrity spot-check, the operator override flags, and manual rollback.

## 1. Expected first-run spike shape + pre-deploy estimate query

- **`records_total ≈ 854`, `records_new ≈ 854`, `records_updated = 0`, `polygons_deleted = 0`, verdict `PASS`.**
- `invalid_geometry_repaired` is non-zero and expected (~65 on the May-2018 / Mar-2022 snapshot — self-intersecting polygons repaired by `ST_MakeValid`); `geometry_collection_extracted` is typically `0`; `invalid_geometry_skipped` must be `0` (any skip counts against the L8 5% gate).
- Runtime ~10–15 s (download 4.3 MB + 854-row batched validate + upsert).

**Pre-deploy estimate (confirm the live feature count before promoting):**
```bash
curl -sL "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ravine-natural-feature-protection-area" \
  | jq -r '.result.resources[] | select(.name=="ravine-natural-feature-protection-area-wgs84") | "\(.id)  \(.last_modified)  \(.url)"'
```
If the resource ID / URL has drifted from `scripts/load-ravines.js` (`CKAN_DOWNLOAD_URL`)
and `scripts/quality/assert-schema.js` (`RAVINE_URL`), update both before deploy.
If the published feature count is materially below ~854, lower the
`assert-data-bounds` `ravines >= 500` floor accordingly.

## 2. Convergence window (7 runs)

Run the `sources` chain (or the step standalone) up to 7 times across the
post-deploy window. Convergence criteria:
- Run 1: `records_new ≈ 854`.
- Runs 2–7: either the HEAD skip-check fires (`ravine_load_skipped`, `records_total=null`)
  OR `records_new = 0, records_updated = 0` (idempotent upsert). Either is convergence.
- Any run with `records_updated > 0` (without a republish) or a non-PASS verdict
  is a regression — investigate before acknowledging.

## 3. WKB round-trip integrity spot-check (first deploy only)

Geometry is validated by the §3.5 batched SQL (`ST_AsBinary(geom_final)`) and
re-bound at upsert via `ST_GeomFromWKB($N, 4326)`. Confirm the round-trip
preserved geometry on a 10-feature sample (Spec 59 §3.5):
```sql
-- Sanity: every stored geom is a valid MultiPolygon in SRID 4326, no empties.
SELECT COUNT(*)                                   AS total,
       COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) AS srid_ok,
       COUNT(*) FILTER (WHERE GeometryType(geom) = 'MULTIPOLYGON') AS multipolygon,
       COUNT(*) FILTER (WHERE ST_IsValid(geom))   AS valid,
       COUNT(*) FILTER (WHERE ST_IsEmpty(geom))   AS empty
  FROM ravines;
-- Expect: total = srid_ok = multipolygon = valid; empty = 0.
```
(`ST_AsText(pre) = ST_AsText(post)` equivalence is exercised by the
`GeometryCollection rescue` + round-trip cases in `load-ravines.infra.test.ts`.)

## 4. Operator override flags

Both overrides **enable execution but never suppress the FAIL verdict** (Spec 47
§8.2 cascade) — an operator must acknowledge the FAIL before chain promotion. The
script also emits a standing-WARN audit row whenever either override is present in
the environment, so an accidentally-left override surfaces in the audit table.

| Flag | When to set | Effect |
|---|---|---|
| `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1` | Genuine >50% feature-count change confirmed against CKAN (rare republish) | L7 proceeds; audit row stays `FAIL`; verdict `FAIL` |
| `RAVINE_ACCEPT_MASS_DELETE=1` | Full Esri reload where every OBJECTID rotated (feature count steady, all rows replaced) | L7c proceeds; audit row stays `FAIL`; verdict `FAIL` |

Keep them distinct: accept the rare full-reload (`RAVINE_ACCEPT_MASS_DELETE`) while
still treating genuine count drift as a signal (leave `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT` unset).

## 5. Manual rollback

Migration 167's `-- DOWN` block is commented out (validate-migration Rule 6 —
`migrate.js` runs every non-comment line). To roll back the table by hand:
```sql
DROP INDEX IF EXISTS idx_ravines_geog_gist;
DROP INDEX IF EXISTS idx_ravines_geom_gist;
DROP TABLE IF EXISTS ravines CASCADE;
```
(No FK dependencies exist in §8c; the `parcels`/`permits` ravine columns arrive in §8d/§8e.)
