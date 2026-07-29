# Chain: Sources (Spatial & Reference Data)

<requirements>
## 1. Goal & User Story
As a data pipeline operator, I need this quarterly chain to refresh all foundational spatial reference tables (address points, parcels, building footprints, neighbourhoods) and the WSIB registry — so that downstream permit-linking, geocoding, and builder verification remain accurate.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js sources` or `POST /api/admin/pipelines/chain_sources`
**Schedule:** Quarterly (address_points, parcels, massing, zoning + the enrich/cost cascade), Annual (neighbourhoods)
**Steps:** 27 (sequential, stop-on-failure) — count DERIVED from `manifest.chains.sources`, single source of truth
**Gate:** None — all steps always run

```
assert_schema → address_points → geocode_permits → parcels →
load_ravines → load_heritage → load_centreline → link_parcel_addresses →
compute_centroids → link_parcels → enrich_ravines → enrich_heritage → enrich_centreline →
massing → link_massing → neighbourhoods → link_neighbourhoods → load_wsib → link_wsib →
load_zoning → enrich_parcels → compute_parcel_cost_estimates →
assert_global_coverage → assert_parcel_sanity →
refresh_snapshot → assert_data_bounds → assert_engine_health
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `assert_schema` | `quality/assert-schema.js` | Validate CSV headers, GeoJSON keys, shapefile URLs | pipeline_runs |
| 2 | `address_points` | `load-address-points.js` | Ingest Toronto master address point geometries (~525K rows) | address_points |
| 3 | `geocode_permits` | `geocode-permits.js` | Re-geocode permits missing coordinates | permits |
| 4 | `parcels` | `load-parcels.js` | Ingest property lot polygons from city GIS (~486K rows) | parcels |
| 5 | `load_ravines` | `load-ravines.js` | Ingest Toronto Ravine & Natural Feature Protection Area polygons (Chapter 658) — zipped shapefile (854 polygons), advisory lock 59 (Spec 59 §8c) | ravines |
| 6 | `load_heritage` | `load-heritage.js` | Ingest Toronto Heritage Register (≈8,803 Part IV/V address points) + Heritage Conservation Districts (29 polygons) — two zipped shapefiles, Ontario Heritage Act Parts IV/V, advisory lock 61 (Spec 61 §8c) | heritage_properties, heritage_districts |
| 7 | `load_centreline` | `load-centreline.js` | Ingest Toronto Centreline (TCL) street-network LineStrings — zipped shapefile (~47K street-class segments after L25 filter), staging-table full-replace, advisory lock 63 (Spec 62 §8c) | toronto_centreline |
| 8 | `link_parcel_addresses` | `link-parcel-addresses.js` | Populate the parcels ↔ address_points spatial bridge via `ST_Within` (PK-ordered parcel batches, GIST index lookups, ~511K bridge rows); advisory lock 115 (Specs 54/55). The bridge is the sole data path for `link_parcels` Strategies 1+2 and `link_coa_to_parcels` Tier 1a/1b — a zero-link result FAIL-gates | parcel_address_points |
| 9 | `compute_centroids` | `compute-centroids.js` | Calculate centroid lat/lng for parcels missing them | parcels |
| 10 | `link_parcels` | `link-parcels.js` | Re-link permits to fresh parcel data. Runs in its default (incremental) mode — it does NOT receive `--full` in the sources chain (no `chain_args.sources` entry in the manifest; the chain runner only injects a script's `chain_args[chainId]`, never a blanket full flag) | permit_parcels, permits |
| 11 | `enrich_ravines` | `enrich-ravines.js` | Spatially join parcels against ravines; write Chapter-658 flag + signed ravine distance + lineage onto parcels (Spec 59 §8d, advisory lock 60) | parcels |
| 12 | `enrich_heritage` | `enrich-heritage.js` | Spatially join parcels against the heritage tables; write the Ontario Heritage Act designation flag (Part IV individual via ST_Intersects containment / Part V HCD via polygon intersect, Part IV wins, levenshtein tiebreak) + type + date + lineage onto parcels (Spec 61 §8d/§11.1, advisory lock 62) | parcels |
| 13 | `enrich_centreline` | `enrich-centreline.js` | Spatially join parcels against toronto_centreline; derive `is_corner_lot` (≥2 streets sharing an intersection), `is_through_lot` (≥2 parallel streets, no shared node) + `primary_frontage_street_name` (name/address-range/longest-intersect) + `abuts_laneway` + lineage onto parcels (Spec 62 §8d, advisory lock 64). **WF2 P11-1 version-skip gate:** unchanged producer `source_dataset_version` → recompute only NULL/stale-stamp parcels (reduced) or full skip (Spec 62 §3.11); changed version → full recompute. Reduced/skip still emit a `completed` row (assertCentrelineEnriched stays green) | parcels |
| 14 | `massing` | `load-massing.js` | Ingest 3D building footprint volumes (~427K rows) | building_footprints |
| 15 | `link_massing` | `link-massing.js` | Link parcels to building footprints via building-centroid-in-parcel PostGIS predicate. `--full` (via `manifest.scripts.link_massing.chain_args.sources`) now **permits** a full relink; the **WF2 P11-2 gate** does one only when the `building_footprints` count or `LINK_MASSING_CODE_VERSION` changed (Spec 56 §3), else incremental | parcel_buildings |
| 16 | `neighbourhoods` | `load-neighbourhoods.js` | Ingest neighbourhood boundaries + Census income profiles | neighbourhoods |
| 17 | `link_neighbourhoods` | `link-neighbourhoods.js` | Assign neighbourhood_id to permits via point-in-polygon (default/incremental mode — no `chain_args.sources` --full override). Carries a documented N+1 hot spot | permits |
| 18 | `load_wsib` | `load-wsib.js` | Load the Ontario WSIB contractor registry from a MANUAL annual download (wsib.ca — no download URL exists). In chain context with no `--file` the step emits a PASS/SKIPPED summary with operator instructions (`load-wsib.js:89-127`) and `wsib_registry` stays at its last snapshot; refresh = operator-run `node scripts/load-wsib.js --file data/BusinessClassificationDetails(YYYY).csv` (see runbook §WSIB annual refresh, Spec 52) | wsib_registry |
| 19 | `link_wsib` | `link-wsib.js` | Re-match builders against fresh WSIB data (default/incremental mode — no `chain_args.sources` --full override) | entities |
| 20 | `load_zoning` | `load-zoning.js` | Ingest Toronto Zoning By-law (569-2013) — 10 CKAN **DataStore** layers (not SHP ZIP; `_id` upsert key) into the zoning tables | `zoning_bylaw_areas` + 9 overlays |
| 21 | `enrich_parcels` | `enrich-parcels.js` | The multi-pass parcel enrichment engine (`--full` in sources chain via `manifest.scripts.enrich_parcels.chain_args.sources`): zoning by-law feed (class/FSI/coverage/height/overlays, Spec 58/65) + max-build envelope (footprint/box/GFA/suite/constraints, Spec 65 §4) + existing-structure & reno/build scenario GFAs (Spec 65) + optimal-lot-config + comparable-builds scalars (Spec 78) + `neighbourhood_id` (NULL-sentinel). Consumes the `load_zoning` §9 contract | `parcels` |
| 22 | `compute_parcel_cost_estimates` | `compute-parcel-cost-estimates.js` | Top-down EXTERNAL-cost menu of the reno scenarios per parcel (`parcel_cost_menu` JSONB + `cost_fb_total`/`cost_coa_total` scalars) off the max-build envelope + neighbourhood build norms (Spec 88 P1). Cascades a full recompute after `--full` enrich | `parcels` |
| 23 | `assert_global_coverage` | `quality/assert-global-coverage.js` | Sources-scoped completeness profile (Spec 49): gated `zoning_class` + the residential-with-building-scoped max-build/opt coverage floors (WARN<88/FAIL<75) + `parcel_cost_menu` gate + INFO population/distribution rows | pipeline_runs |
| 24 | `assert_parcel_sanity` | `quality/assert-parcel-sanity.js` | Value-CORRECTNESS gate (Spec 48 §3.6): zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION over all residential parcels; `gate:true` physical-impossibility/mislink checks FAIL the chain, known residuals WARN. Runs after enrich+cost so it reads FINAL values | pipeline_runs |
| 25 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics | data_quality_snapshots |
| 26 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Sources-scoped: magnitude floors (address_points ≥500K / parcels ≥460K / building_footprints ≥400K — catastrophic-load detectors), duplicate IDs, lot-size/height outliers, neighbourhoods ≥158, ravines/heritage/centreline floors | pipeline_runs |
| 27 | `assert_engine_health` | `quality/assert-engine-health.js` | Engine health for spatial tables | engine_health_snapshots |

### Chain-Specific Arguments
The chain runner (`scripts/run-chain.js`) injects extra CLI args ONLY from a script's per-script `chain_args[chainId]` array — there is NO blanket "full mode" applied to `supports_full` steps, and NO top-level `chain_args`. In the sources chain exactly **two** scripts carry a `chain_args.sources = ["--full"]` override in `manifest.json`:
- `link_massing` — full parcel↔building re-link. **WF2 P11-2:** `--full` now *permits* a full relink; the script's gate (`scripts/lib/massing-full-gate.js`) does one only when the `building_footprints` count or `LINK_MASSING_CODE_VERSION` changed (else incremental), retiring the always-on ~21.9-min cost. `LINK_MASSING_FORCE_FULL=1` forces it.
- `enrich_parcels` — full envelope/opt-config re-enrich; cascades a full `compute_parcel_cost_estimates` recompute (added WF2 2026-07-07). Safe because sources runs quarterly, not on the daily 6 AM job. **Not gated** (out of P11 scope — the dominant residual runtime).

**Runtime (WF2 P11):** on a genuinely-unchanged quarterly re-run the centreline (P11-1) + link_massing (P11-2) gates cut the chain from ~181.9 min (P6.7-D baseline, WITH `enrich_parcels --full`) to a projected **~61 min** — `enrich_parcels --full` (~46-53 min) is then the dominant residual. Measured (2026-07-08 acceptance run, `docs/reports/pipeline-validation/2026-07-08-p11-sources-version-gate-skips.md`): the massing gate fired live (`link_massing` 8.5 s vs 21.9 min); the centreline source happened to republish so its gate correctly ran full (87.1 min) — total 147.0 min for a changed-source run; the unchanged centreline path measured 11.2 s standalone. A real quarterly run with geometry churn recomputes only the churned centreline parcels (minutes, not 92) + a full link_massing only if the footprint corpus changed.

Every other step (including `link_parcels`, `link_neighbourhoods`, `link_wsib`, `geocode_permits`) runs in its script-default mode in the sources chain — it does NOT receive `--full` despite being `supports_full`-capable.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- Toronto Open Data GIS endpoints (address points CSV, parcels CSV, massing shapefiles, neighbourhood GeoJSON)
- Ontario WSIB registry CSV (manual annual download — the chain step SKIPs (PASS) without it; see Spec 52)
- Google Maps Geocoding API (fallback)

### Core Logic
1. **Schema validation** — CSV headers and GeoJSON property keys checked before bulk ingestion.
2. **Source loads** — Bulk load address points (~525K), parcels (~486K), ravines (854), heritage register + districts, centreline (~47K), massing footprints (~427K), neighbourhoods (158), zoning (10 DataStore layers), WSIB registry. Idempotent upserts (`ON CONFLICT DO NOTHING`/staging-replace).
3. **Address-point bridge** — `link_parcel_addresses` populates the parcels ↔ address_points `ST_Within` bridge (~511K rows); it is the sole data path for `link_parcels` Strategies 1+2 and `link_coa_to_parcels` Tier 1a/1b, so a zero-link result FAIL-gates.
4. **Centroids** — Compute `centroid_lat`/`centroid_lng` for parcels missing them via geometric calculation.
5. **Parcel linking** — Spatial match: permits → parcel via the address bridge + polygon containment; default (incremental) mode in the sources chain.
6. **Parcel enrichment (spatial joins onto parcels)** — `enrich_ravines` (Chapter-658 flag + signed distance, Spec 59), `enrich_heritage` (OHA Part IV/V designation via ST_Intersects containment + levenshtein tiebreak, Spec 61 §11.1), `enrich_centreline` (corner/through-lot + primary frontage + abuts_laneway, Spec 62).
7. **Massing linking** — `link_massing` associates parcels with building footprints via the building-centroid-in-parcel predicate; `--full` permits a full re-link, but the WF2 P11-2 gate does one only on a `building_footprints`-count or code-version change (else incremental).
8. **Neighbourhood + WSIB linking** — `link_neighbourhoods` (point-in-polygon), `link_wsib` (Levenshtein fuzzy match); default mode.
9. **Zoning + max-build + cost cascade** — `enrich_parcels` (**full re-enrich**, `chain_args.sources = --full`) writes the zoning feed + max-build envelope + existing/scenario GFAs + optimal-config + comparable-builds + neighbourhood_id (Specs 58/65/78); `compute_parcel_cost_estimates` then computes the per-parcel reno-scenario cost menu (Spec 88 P1). The `--full` enrich cascades a full cost recompute.
10. **Quality assertions** — three assert steps run AFTER the enrich+cost cascade so they read FINAL values:
    - `assert_global_coverage` (Spec 49): gated `zoning_class`, residential-with-building-scoped max-build/opt coverage floors (WARN<88/FAIL<75), `parcel_cost_menu` gate, INFO population/distribution rows.
    - `assert_parcel_sanity` (Spec 48 §3.6): zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION; `gate:true` physical-impossibility/mislink checks FAIL the chain, known residuals WARN.
    - `assert_data_bounds`: magnitude floors (address_points ≥500K / parcels ≥460K / building_footprints ≥400K — catastrophic-load detectors), duplicate IDs, lot-size/height outliers, neighbourhoods ≥158, ravines/heritage/centreline floors.

### Outputs
- `address_points` table refreshed (~525K rows)
- `parcels` table refreshed with centroids, zoning feed, max-build envelope, optimal-config + comparable-builds scalars, and the per-parcel cost menu
- `parcel_address_points` bridge refreshed (~511K rows)
- `building_footprints` table refreshed (~427K rows), `parcel_buildings` re-linked (full)
- `neighbourhoods` table refreshed (158 boundaries + income profiles)
- `ravines` / `heritage_properties` / `heritage_districts` / `toronto_centreline` reference tables refreshed
- `wsib_registry` table refreshed
- Permits re-linked to fresh spatial data

### Edge Cases
- City GIS portal returning 500 → chain halts (no partial spatial data)
- Neighbourhood boundary changes (rare, ~annual) → old permits may shift neighbourhoods
- WSIB CSV absent in chain context (the normal scheduled-runner case) → `load_wsib` SKIPs with PASS + instructions row; a truncated operator-supplied CSV could still drop previously matched builders (no rollback protection)
- `link_neighbourhoods` + `compute_centroids` N+1 patterns → performance hot spots (documented, not yet batched); the `--full` `enrich_parcels` + cascaded cost recompute is the dominant runtime contributor (~18 min enrich on a ~105 min chain)
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (sources chain definition, ordering invariants — incl. `compute_parcel_cost_estimates < assert_global_coverage < assert_parcel_sanity` — and `chain_args.sources` --full injection; step count DERIVED from the manifest, not pinned)
- **Logic:** `parcels.logic.test.ts`, `neighbourhood.logic.test.ts`, `massing.logic.test.ts`, `wsib.logic.test.ts`
- **Logic:** `geocoding.logic.test.ts`
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/manifest.json` (`chains.sources` array + the `link_massing`/`enrich_parcels` `chain_args.sources` overrides)
- All 27 scripts listed in the step breakdown

### Out-of-Scope Files
- `src/lib/parcels/`, `src/lib/spatial/` — TypeScript API paths
- `src/components/permits/NeighbourhoodProfile.tsx` — UI rendering

### Cross-Spec Dependencies
- **Relies on:** `40_pipeline_system.md` (SDK, orchestrator)
- **Consumed by:** `41_chain_permits.md` / `42_chain_coa.md` (depend on spatial + enriched-parcel tables being populated)
- **Enriched-parcel data specs:** `58_source_zoning.md` (zoning DataStore feed), `59_source_ravine_protection.md`, `61_source_heritage.md`, `62_source_centreline.md`, `65_enrich_parcels.md` (max-build envelope + existing/scenario), `78_optimal_lot_config.md` (optimal-config + comps), `88_parcel_cost_model.md` (parcel cost menu)
- **Shared steps:** See `60_shared_steps.md` for geocode_permits, link_parcels, link_massing, link_neighbourhoods, link_wsib, refresh_snapshot
</constraints>

---

## Step Details (Single-Chain Steps)

### Step 9: Compute Centroids (`compute-centroids.js`)

**Logic:**
1. Query parcels where `centroid_lat IS NULL` or `centroid_lng IS NULL`
2. Calculate geometric centroid from polygon coordinates
3. Update `parcels.centroid_lat`, `parcels.centroid_lng`

**Edge Cases:** Complex multipolygon → centroid may fall outside polygon (valid for approximate matching). Individual UPDATE per parcel (known N+1 performance issue).
