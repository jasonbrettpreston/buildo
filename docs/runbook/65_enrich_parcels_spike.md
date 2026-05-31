# Runbook — Spec 65 `enrich-parcels.js` first-deploy spike & data profiling

**SPEC LINK:** `docs/specs/01-pipeline/65_enrich_parcels.md`
**Profiled:** 2026-05-31, local dev DB (read-only sample probe `scripts/one-time/spike-65-profile.js`, n=5000 random parcels).
**Purpose:** set Spec 65's observability gate thresholds from real post-join availability rather than guesses (resolves adversarial-review G2/D3 — "coverage/fsi gate unachievable").

## 1. Source cardinality (live)

| Table | Rows |
|---|---|
| `parcels` (all have `geom`) | **486,530** |
| `zoning_bylaw_areas` (base) | 11,719 |
| └ base rows with non-null `fsi_max` | 2,835 (24%) |
| `zoning_lot_coverage_overlay` | 1,242 |
| `zoning_height_overlay` | 2,528 |
| `zoning_policy_road_overlay` | 8,913 |
| `zoning_priority_retail_overlay` | 643 |

## 2. Post-join field availability (n=5000 sample)

| Parcel field | Source | Real availability | Gate decision |
|---|---|---|---|
| `zoning_class` | dominant base zone | **96.8%** | **Hard gate** — `parcels_with_zone_class_pct`: PASS ≥95, WARN 90–95, FAIL <90 (Spec 58 §10). The ~3.2% gap = parks/federal/utility/ravine (expected; gap audit row, not a failure). |
| `bylaw_max_height_m` / `_stories` | height overlay | **89.8%** | INFO observability (`*_null_rate`); NOT a hard gate. |
| `bylaw_max_coverage_pct` | lot-coverage overlay | **56.7%** | INFO observability; NOT a hard gate (D10 — sparse by design). |
| `bylaw_max_fsi` | dominant base zone | **5.1%** | INFO observability ONLY. FSI regulates apartment/commercial zones; the vast residential majority has none. **A ≥90% fsi gate is impossible — do NOT set one** (this is the core G2/D3 correction). |

## 3. Dominant-zone resolution validation (DEC-1)

| Metric | Value | Implication |
|---|---|---|
| parcels intersecting >1 base zone | 1,104 / 5000 (22%) | boundary-sliver overlaps are common… |
| avg dominant-zone area share | **0.9972** | …but one zone almost always dominates (~99.7%). |
| parcels with dominant share < 0.60 (`zoning_is_ambiguous`) | **11 / 5000 (0.2%)** | genuine ambiguity is rare → the **0.60** threshold + area-rank approach are sound. |

The area-ranked `ST_Intersects` dominant-zone selection (F-C5) is well-justified: 96.8% coverage, 0.2% ambiguity. The 22% multi-zone rate is overwhelmingly boundary slivers, correctly resolved by `MAX(intersection_area)`.

## 4. Road-overlay buffer sensitivity (`road_overlay_distance_m`, default 5)

Validates whether the seeded 5 m buffer is right for the LineString overlays (Gemini-F/D7 — "5 m may be too small vs a 20–30 m right-of-way").

**Initial probe stalled** (no bbox prefilter → nested-loop over 8,913 lines). After the bbox-prefilter pattern landed in the script, the live measurement is:

| buffer (m) | % parcels near a policy road (20k sample) |
|---|---|
| **5** (seeded default) | **0.07%** (15 / 20,000) |
| 30 | 19.6% (3,922 / 20,000) |

**Finding (confirmed):** 5 m is far too small — the policy_road/priority_retail geometries are **centrelines**, so a 5 m buffer essentially never reaches a parcel. The full live run produced `on_policy_road = 107` across all 486K parcels. → follow-up #399; bump the seed default (Spec 58-owned) after domain validation. The mechanism itself (bbox prefilter + `::geography`) is correct.

**⚠ Load-bearing implementation note (PERF):** casting `parcels.geom` to `::geography` at query time **defeats the geometry GiST index** (`idx_parcels_geom_gist` is on `geometry(4326)`, not `geography`), so `ST_DWithin(::geography)` degrades to a nested-loop scan. At 486K parcels this LineString-overlay pass would be pathologically slow if written naïvely. **`enrich-parcels.js` MUST prefilter on the indexable geometry bbox before the geography refinement**, e.g.:
```sql
WHERE r.geom && ST_Expand(p.geom, 0.0006)            -- ~60 m bbox, uses GiST
  AND ST_DWithin(p.geom::geography, r.geom::geography, :road_overlay_distance_m)  -- exact metres (F-C2)
```
This keeps the F-C2 metre-accurate cast while restoring index usage. Spec 65 §2 Implementation references this; `enrich-parcels.db.test.ts` should include a road-overlay membership case so the pattern is exercised.

**Buffer-distance decision:** `road_overlay_distance_m` is a runtime logic-var (no code change to tune). Measure the 5/15/30 m sensitivity **after** the bbox-prefilter pattern is in place (it will then return quickly); if 5 m is implausibly low, raise the default in `scripts/seeds/logic_variables.json`. Road overlays feed only categorical membership (`on_policy_road`, `on_priority_retail` + jsonb), not the numeric gates — so this does not block WF2.

## 5. Steady-state expectations

- First run: full enrichment of ~486K parcels (one set-based pass; `--full`).
- Re-runs: incremental — only parcels whose intersecting zone `source_dataset_version` is newer than `zoning_enriched_at` (Gemini-C). Steady state (no zoning refresh) → **0 rows updated**.
- Exit criterion (revised per profile + D10): `parcels_with_zone_class_pct ≥ 95%`; fsi/coverage/height surface as INFO null-rate rows, NOT gates.

## 6. Spike scripts (throwaway)
`scripts/one-time/spike-65-profile.js`, `scripts/one-time/spike-65-buffer.js` — read-only, removed after thresholds are locked into the spec. Not registered in `manifest.json`; no advisory lock (read-only, no mutation).
