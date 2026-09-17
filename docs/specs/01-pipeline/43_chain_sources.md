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
**Steps:** 28 (sequential, stop-on-failure) — count DERIVED from `manifest.chains.sources`, single source of truth
**Gate:** None — all steps always run

```
reconcile → assert_schema → address_points → geocode_permits → parcels →
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
| 1 | `reconcile` | `reconcile-runs.js` | **Chain-head infrastructure, not a domain step** (Spec 122 §7.4 A3). The Step-0 reaper (Spec 120 §4.1): reconciles the previous run ONCE at the head of the chain, before any work. Islands have no single start — `run-chain.js` spawns each step as its own child process — so this is the one step that owns the reap. It is the ONLY writer of `crashed`, and that is structural: `scripts/lib/step/ledger.js` finalizes from a `finally`, which by definition only runs while the process is still alive, so it can legitimately write `failed` but never `crashed` (Spec 120 §3.2b). Replaces the admin-stats auto-fail path (`src/app/api/admin/stats/route.ts`) that only fired on a human page load and conflated the two states | pipeline_runs |
| 2 | `assert_schema` | `quality/assert-schema.js` | Validate CSV headers, GeoJSON keys, shapefile URLs | pipeline_runs |
| 3 | `address_points` | `load-address-points.js` | Ingest Toronto master address point geometries (~525K rows) | address_points |
| 4 | `geocode_permits` | `geocode-permits.js` | Re-join EVERY permit with a numeric `geo_id` to `address_points` (guarded, not narrowed to missing coordinates) + clear coordinates whose `geo_id` vanished upstream | permits |
| 5 | `parcels` | `load-parcels.js` | Ingest property lot polygons from city GIS (~486K rows) | parcels |
| 6 | `load_ravines` | `load-ravines.js` | Ingest Toronto Ravine & Natural Feature Protection Area polygons (Chapter 658) — zipped shapefile (854 polygons), advisory lock 59 (Spec 59 §8c) | ravines |
| 7 | `load_heritage` | `load-heritage.js` | Ingest Toronto Heritage Register (≈8,803 Part IV/V address points) + Heritage Conservation Districts (29 polygons) — two zipped shapefiles, Ontario Heritage Act Parts IV/V, advisory lock 61 (Spec 61 §8c) | heritage_properties, heritage_districts |
| 8 | `load_centreline` | `load-centreline.js` | Ingest Toronto Centreline (TCL) street-network LineStrings — zipped shapefile (~47K street-class segments after L25 filter), staging-table full-replace, advisory lock 63 (Spec 62 §8c) | toronto_centreline |
| 9 | `link_parcel_addresses` | `link-parcel-addresses.js` | Populate the parcels ↔ address_points spatial bridge via `ST_Within` (PK-ordered parcel batches, GIST index lookups, ~511K bridge rows); advisory lock 115 (Specs 54/55). The bridge is the sole data path for `link_parcels` Strategies 1+2 and `link_coa_to_parcels` Tier 1a/1b — a zero-link result FAIL-gates | parcel_address_points |
| 10 | `compute_centroids` | `compute-centroids.js` | Calculate centroid lat/lng for parcels missing them | parcels |
| 11 | `link_parcels` | `link-parcels.js` | Re-link permits to fresh parcel data. Runs in its default (incremental) mode — it does NOT receive `--full` in the sources chain (no `chain_args.sources` entry in the manifest; the chain runner only injects a script's `chain_args[chainId]`, never a blanket full flag) | permit_parcels, permits |
| 12 | `enrich_ravines` | `enrich-ravines.js` | Spatially join parcels against ravines; write Chapter-658 flag + signed ravine distance + lineage onto parcels (Spec 59 §8d, advisory lock 60) | parcels |
| 13 | `enrich_heritage` | `enrich-heritage.js` | Spatially join parcels against the heritage tables; write the Ontario Heritage Act designation flag (Part IV individual via ST_Intersects containment / Part V HCD via polygon intersect, Part IV wins, levenshtein tiebreak) + type + date + lineage onto parcels (Spec 61 §8d/§11.1, advisory lock 62) | parcels |
| 14 | `enrich_centreline` | `enrich-centreline.js` | Spatially join parcels against toronto_centreline; derive `is_corner_lot` (≥2 streets sharing an intersection), `is_through_lot` (≥2 parallel streets, no shared node) + `primary_frontage_street_name` (name/address-range/longest-intersect) + `abuts_laneway` + lineage onto parcels (Spec 62 §8d, advisory lock 64). **WF2 P11-1 version-skip gate:** unchanged producer `source_dataset_version` → recompute only NULL/stale-stamp parcels (reduced) or full skip (Spec 62 §3.11); changed version → full recompute. Reduced/skip still emit a `completed` row (assertCentrelineEnriched stays green) | parcels |
| 15 | `massing` | `load-massing.js` | Ingest 3D building footprint volumes (~427K rows) | building_footprints |
| 16 | `link_massing` | `link-massing.js` | Link parcels to building footprints via building-centroid-in-parcel PostGIS predicate. `--full` (via `manifest.scripts.link_massing.chain_args.sources`) now **permits** a full relink; the **WF2 P11-2 gate** does one only when the `building_footprints` count or `LINK_MASSING_CODE_VERSION` changed (Spec 56 §3), else incremental | parcel_buildings |
| 17 | `neighbourhoods` | `load-neighbourhoods.js` | Ingest neighbourhood boundaries + Census income profiles | neighbourhoods |
| 18 | `link_neighbourhoods` | `link-neighbourhoods.js` | Assign neighbourhood_id to permits via PostGIS `ST_Contains` containment, ONE set-based join UPDATE (default/incremental mode — no `chain_args.sources` --full override, and as of the batch-2 I4 conversion no FULL mode at all, LN-D9). CONVERTED (Spec 122 §5.1) | permits |
| 19 | `load_wsib` | `load-wsib.js` | Load the Ontario WSIB contractor registry from a MANUAL annual download (wsib.ca — no download URL exists). In chain context with no `--file` the step emits a PASS/SKIPPED summary with operator instructions (`load-wsib.js:89-127`) and `wsib_registry` stays at its last snapshot; refresh = operator-run `node scripts/load-wsib.js --file data/BusinessClassificationDetails(YYYY).csv` (see runbook §WSIB annual refresh, Spec 52) | wsib_registry |
| 20 | `link_wsib` | `link-wsib.js` | Re-match builders against fresh WSIB data (default/incremental mode — no `chain_args.sources` --full override) | entities |
| 21 | `load_zoning` | `load-zoning.js` | Ingest Toronto Zoning By-law (569-2013) — 10 CKAN **DataStore** layers (not SHP ZIP; `_id` upsert key) into the zoning tables | `zoning_bylaw_areas` + 9 overlays |
| 22 | `enrich_parcels` | `enrich-parcels.js` | The multi-pass parcel enrichment engine (`--full` in sources chain via `manifest.scripts.enrich_parcels.chain_args.sources`): zoning by-law feed (class/FSI/coverage/height/overlays, Spec 58/65) + max-build envelope (footprint/box/GFA/suite/constraints, Spec 65 §4) + existing-structure & reno/build scenario GFAs (Spec 65) + optimal-lot-config + comparable-builds scalars (Spec 78) + `neighbourhood_id` (NULL-sentinel). Consumes the `load_zoning` §9 contract | `parcels` |
| 23 | `compute_parcel_cost_estimates` | `compute-parcel-cost-estimates.js` | Top-down EXTERNAL-cost menu of the reno scenarios per parcel (`parcel_cost_menu` JSONB + `cost_fb_total`/`cost_coa_total` scalars) off the max-build envelope + neighbourhood build norms (Spec 88 P1). Cascades a full recompute after `--full` enrich | `parcels` |
| 24 | `assert_global_coverage` | `quality/assert-global-coverage.js` | Sources-scoped completeness profile (Spec 49): gated `zoning_class` + the residential-with-building-scoped max-build/opt coverage floors (WARN<88/FAIL<75) + `parcel_cost_menu` gate + INFO population/distribution rows | pipeline_runs |
| 25 | `assert_parcel_sanity` | `quality/assert-parcel-sanity.js` | Value-CORRECTNESS gate (this spec §Core Logic item 11; coverage↔sanity boundary Spec 49 §2): zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION over all residential parcels; `gate:true` physical-impossibility/mislink checks FAIL the chain, known residuals WARN. Runs after enrich+cost so it reads FINAL values | pipeline_runs |
| 26 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics | data_quality_snapshots |
| 27 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Sources-scoped: magnitude floors (address_points ≥500K / parcels ≥460K / building_footprints ≥400K — catastrophic-load detectors), duplicate IDs, lot-size/height outliers, neighbourhoods ≥158, ravines/heritage/centreline floors | pipeline_runs |
| 28 | `assert_engine_health` | `quality/assert-engine-health.js` | Engine health for spatial tables | engine_health_snapshots |

**Table drift, corrected in part (batch1 I2 commit 9, 2026-09-13, PH-0/§5 spec-diff obligation):** row 26's step number is stale. Measured against `scripts/manifest.json.chains.sources` this session: `assert_data_bounds` sits at position **27 of 28** (0-indexed 26), directly after `refresh_snapshot` and before `assert_engine_health` — not position 26. Root cause: the whole table is uniformly off by one — the live `sources` chain's real position 1 is `reconcile`, a leading step this table omits entirely (position 2 onward then matches this table's rows 1 onward exactly, 1:1, through row 27). A full table rewrite (prepending `reconcile` with its own purpose/writes-to, renumbering all 28 rows) is out of scope for this commit — filed as a HIGH item in `docs/reports/review_followups.md` for a dedicated doc-fix pass alongside Spec 42's own table drift. This note corrects only the ONE claim this conversion's PH-0 measured and depends on (assert_data_bounds's true chain position), per plan §0 row 3 / §5. **SUPERSEDED by the reconciliation note below — the full table rewrite this note deferred landed in WF2 SPECTBL-1, 2026-09-15. Kept for the record; do not re-derive positions from it.**

**Table reconciled + drift-locked (WF2 SPECTBL-1, 2026-09-15, `.cursor/wf2_spec43_step_table_active_task.md`):** the whole table was uniformly **+1 off** because it omitted the live chain's real position 1, `reconcile` — every other slug matched 1:1 in order, none extra, none out of sequence. This pass prepends the `reconcile` row (Purpose from `scripts/reconcile-runs.js`'s own header + Spec 122 §7.4 A3), renumbers the remaining rows 2…28, retitles the stale `### Step 9: Compute Centroids` heading to **Step 10**, and re-points the two `Value-CORRECTNESS gate (Spec 48 §3.6)` citations — Spec 48 §3.6 is the *audit_table dual-pattern for ledger writers* (the row-derived verdict cascade + parallel-boolean ban) and carries no value-correctness or BOUNDS concept, so those two sites were miscitations; the ~66 other `Spec 48 §3.6` references in the repo are verdict-cascade uses and are correct as written. Positions were DERIVED by a `node` walk of `scripts/manifest.json.chains.sources`, never hand-counted. The next drift is now uncommittable: the `system-map.infra.test.ts` lock under `src/tests/` ("chain-spec Step Breakdown tables" describe) locks this table's `#` / Slug / Script columns against `manifest.chains` for all six chain specs, both directions, in the existing pre-commit hook. Purpose and Writes-To stay hand-authored prose and are deliberately NOT locked (a generator would re-home them into a sidecar — a Spec 124 R-AA content move; filed as `SPECTBL-GEN`, to be built only if prose drift is ever measured).

**Cutover note (batch1 I3 commit 9, 2026-09-14, PH-0/§5 spec-diff obligation):** `assert_engine_health` (row 28 — cited as "row 27" when written, against the then-off-by-one table; renumbered by WF2 SPECTBL-1, 2026-09-15) converted to the Spec 122 step standard, full nine-commit form (RECORDER archetype, Spec 124 R-AE — the `engine_health_snapshots` guarded upsert has no legal home under ASSERT's forced `outputs:"none"`). `scripts/quality/assert-engine-health.descriptor.json` is the behavioural contract from this commit forward; the chain-tail VACUUM loop described elsewhere in this spec (§ "chain-tail VACUUM owner") is preserved verbatim in `scripts/lib/compute/assert-engine-health.js`, disclosed as a `deviations[]` entry (Ask 2, EP-D17 DEFER — not hoisted). See `docs/reports/2026-09-14-batch1-i3-assert-engine-health-assessment.md` §6/§9 and `.cursor/batch1_i3_assert_engine_health_active_task.md` §2.

### Chain-Specific Arguments
The chain runner (`scripts/run-chain.js`) injects extra CLI args ONLY from a script's per-script `chain_args[chainId]` array — there is NO blanket "full mode" applied to `supports_full` steps, and NO top-level `chain_args`. In the sources chain exactly **two** scripts carry a `chain_args.sources = ["--full"]` override in `manifest.json`:
- `link_massing` — full parcel↔building re-link. **WF2 P11-2:** `--full` now *permits* a full relink; the script's gate (`scripts/lib/massing-full-gate.js`) does one only when the `building_footprints` count or `LINK_MASSING_CODE_VERSION` changed (else incremental), retiring the always-on ~21.9-min cost. `LINK_MASSING_FORCE_FULL=1` forces it.
- `enrich_parcels` — full envelope/opt-config re-enrich; cascades a full `compute_parcel_cost_estimates` recompute (added WF2 2026-07-07). Safe because sources runs quarterly, not on the daily 6 AM job. **Not gated at the P11 "skip the whole step" level** (out of P11 scope — the dominant residual runtime). **Phase B B2 adds a separate, narrower per-pass scope-defer check INSIDE the script** (Spec 40 §3.1.2 / Spec 47 §8.7) — this does not skip the `--full` run itself, it can cause the run to stop cleanly partway through if a pass's pre-transaction scope exceeds `logic_variables.enrich_parcels_defer_threshold_rows`. `ENRICH_PARCELS_FORCE_FULL=1` (env var, step-scoped `env:` on the chain step only — Spec 40 §3.1.2 defer-streak recovery path) forces the run past the check for a supervised force-full, mirroring `LINK_MASSING_FORCE_FULL` above but for a different mechanism (defer threshold, not version-skip gate).

**Runtime (WF2 P11):** on a genuinely-unchanged quarterly re-run the centreline (P11-1) + link_massing (P11-2) gates cut the chain from ~181.9 min (P6.7-D baseline, WITH `enrich_parcels --full`) to a projected **~61 min** — `enrich_parcels --full` (~46-53 min) is then the dominant residual. Measured (2026-07-08 acceptance run, `docs/reports/pipeline-validation/2026-07-08-p11-sources-version-gate-skips.md`): the massing gate fired live (`link_massing` 8.5 s vs 21.9 min); the centreline source happened to republish so its gate correctly ran full (87.1 min) — total 147.0 min for a changed-source run; the unchanged centreline path measured 11.2 s standalone. A real quarterly run with geometry churn recomputes only the churned centreline parcels (minutes, not 92) + a full link_massing only if the footprint corpus changed.

Every other step (including `link_parcels`, `link_neighbourhoods`, `link_wsib`, `geocode_permits`) runs in its script-default mode in the sources chain — it does NOT receive `--full` despite being `supports_full`-capable.

### Runbook — dispatching a PARTIAL run (`from` / `only`, WF2 2026-09-17)

**When.** The chain no longer fits in one GitHub Actions job. Run **35140032614** (`headSha
df61d453`, created 2026-09-16T19:21:08Z) reached step **14 of 28** — `enrich_centreline`, 59.6 min —
and was killed by `The action 'Run sources chain' has timed out after 300 minutes` at
2026-09-17T01:01:55Z, with `enrich_parcels` (step 22, ~87 min) never started; two earlier runs died
the same way. Raising the ceiling is not available: 300 = the 330-min job ceiling − 30 min of
measured job overhead, and 330 = the platform's 360 − a 30-min reserve. Gate-skip is disabled after
a failed predecessor (`run-chain.js` `prevChainFailed`), so every step processes FULL, which is why
the head consumes the entire budget.

**How.** `chain-sources.yml` takes two mutually-exclusive `workflow_dispatch` inputs, threaded to
`scripts/run-chain.js` as `--from=` / `--only=`. Still pinned by `expected_sha` (R-AL) — a partial
run is an acceptance record, so it obeys the same pinning rule as a full one:

```bash
# Dispatch 1 — the HEAD, steps 1..14. There is deliberately no `--to`/`--until`: the head half
# is spelled as an explicit `only` set, because a tail is the only shape `from` can express.
# THIS IS THE COPY-PASTE LINE; a typo is refused, but only after the runner has spun up.
gh workflow run chain-sources.yml -f expected_sha=$(git rev-parse HEAD) \
  -f only=reconcile,assert_schema,address_points,geocode_permits,parcels,load_ravines,load_heritage,load_centreline,link_parcel_addresses,compute_centroids,link_parcels,enrich_ravines,enrich_heritage,enrich_centreline

# Dispatch 2 — the contiguous TAIL, steps 15..28, beginning at `massing`:
gh workflow run chain-sources.yml -f expected_sha=$(git rev-parse HEAD) -f from=massing

# A narrower explicit SET (manifest order is still preserved — `only` filters, it never reorders):
gh workflow run chain-sources.yml -f expected_sha=$(git rev-parse HEAD) -f only=enrich_parcels,compute_parcel_cost_estimates
```

**BOTH HALVES MUST BE PARTIAL — this is not a stylistic preference.** If dispatch 1 is a FULL run
it is killed at the 300-minute cap again, which is what leaves a `running` chain row behind. The
concurrency guard (`scripts/check-chain-running.js`, 12 h TTL) runs BEFORE the chain, so that
stranded row then makes dispatch 2 **skip**, and because `from=massing` excludes `reconcile`
(position 1) nothing in dispatch 2 can reap it. That exact sequence is on record: run
`34971187164` was guard-skipped on stranded row 4861 (2026-09-15) and the operator cleared it by
hand. A bounded dispatch 1 terminates cleanly through run-chain's own path and includes
`reconcile`, so the cycle never starts.

**The rules, all enforced, none inferable:**
1. **Manifest order always wins.** `--only=refresh_snapshot,massing` runs `massing` first. Step
   order in this chain is a dependency order; selection filters, it never reorders.
2. **An unknown slug is refused before any DB write.** `resolveStepSelection` throws, the chain
   advisory lock is never taken, and no `pipeline_runs` row is opened (a pre-created external row
   is terminalized `failed`, the invalid-`chain_id` precedent).
3. **`from` + `only` together are REFUSED, not intersected** — at the workflow AND in the runner.
   `only` already fully determines the set; an intersection would silently narrow the `from` typed.
4. **A partial run says so in its own ledger row.** The chain row still opens and closes normally,
   and carries `records_meta.partial_selection = {from, only, steps_selected,
   steps_skipped_by_selection, chain_steps_total}`. The key's ABSENCE is the full-run claim — there
   is no parallel boolean, and it is unambiguous in both directions because no partial dispatch was
   possible before this landed, so every pre-existing row without the key genuinely was a full run.
   `step_completeness.expected` is the SELECTED set, so
   `check-chain-verdict.js#classifyStepCompleteness` adjudicates per-slug exactly what ran (Spec 48
   §3.9), and the job summary states the selection before anything runs.
   > ⚠️ **ONE KNOWN CONSUMER DOES NOT YET READ IT** (Observability seat, measured 2026-09-17):
   > `src/components/DataQualityDashboard.tsx#getChainVerdict` derives its chain chip from
   > `info.status` ALONE, so a successful partial run renders a green **PASS** on the admin
   > data-quality banner exactly as a full run would. That component is Admin domain and outside
   > this chain spec's Operating Boundaries, so it is FILED, not fixed here — see
   > `docs/reports/review_followups.md`. Until it lands, **the ledger row is truthful and the
   > dashboard chip is not**; read `records_meta.partial_selection` (or the run's job summary), not
   > the chip, when judging whether a `sources` run was complete. Every other consumer is clean:
   > `FreshnessTimeline` renders per-step rows (a deselected step's own row stays honestly stale),
   > and `check-chain-verdict.js`, `funnel.ts` and the admin pipelines APIs never read the key.
5. **A deselected step gets NO `pipeline_runs` row at all** — a third precedent, deliberately
   neither of the existing two. A budget-stop writes a `skipped` row per remaining step with a
   reason; a B2 defer writes none. Selection follows defer, and more strongly: a deselected step was
   never in THIS run's committed scope (the scope IS `steps_selected`), so a synthetic `skipped` row
   would misrepresent the run's own contract. This is not the P3 2026-08-24 null-reason "silent
   green" class — P3 was a FRESH row with no stated cause; here there is no fresh row, and the
   slug's prior row remains honestly dated.
6. **`reconcile` (step 1) is an ordinary selectable step.** A tail run does **not** reap stranded
   `running` rows. If a prior run was killed by the platform, close its row by hand FIRST —
   `docs/runbook/README.md` §3b — because `scripts/check-chain-running.js` runs BEFORE `reconcile`,
   so a stranded `chain_sources` row (12 h TTL, `scripts/lib/chain-concurrency.js`) makes the next
   dispatch skip before the reaper can reach it.

**Two things the mechanism deliberately does NOT guard — they are the operator's call:**
* **Dependency order is preserved, but dependency SATISFACTION is not checked.** An `only` set
  containing `refresh_snapshot` (position 26) but not `enrich_parcels` (position 22) refreshes the
  snapshot off stale enrichment. Nothing in `run-chain.js` knows which steps feed which; the step
  table above is the reference.
* **Gate-skip is inert for this chain either way** — `manifest.chain_gates` has keys `permits` and
  `coa` only, so no `sources` step is ever gate-skipped and the selection cannot interact with it.

Nothing else changes: step ordering, gate-skip semantics, the soft time budget, the defer mechanism,
the per-step ceilings and the SIGINT/SIGTERM handler are untouched, and a scheduled run (both inputs
empty) passes no flag at all.

> **Name collision, for greppers:** `scripts/wf8-worktree.mjs` also takes a `--from=` flag, where it
> names a queued-task filename. Unrelated to this one.
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
8. **Neighbourhood + WSIB linking** — `link_neighbourhoods` (point-in-polygon), `link_wsib` (Tier 3 fuzzy match via `pg_trgm` trigram `similarity()` — **not** Levenshtein; F3 correction, B3 output-panel remediation); default mode.
9. **Zoning + max-build + cost cascade** — `enrich_parcels` (**full re-enrich**, `chain_args.sources = --full`) writes the zoning feed + max-build envelope + existing/scenario GFAs + optimal-config + comparable-builds + neighbourhood_id (Specs 58/65/78); `compute_parcel_cost_estimates` then computes the per-parcel reno-scenario cost menu (Spec 88 P1). The `--full` enrich cascades a full cost recompute.
10. **Phase B B3 — run-ledger gate (no-op-run avoidance):** `link_wsib`, `link_parcel_addresses`, and `compute_parcel_cost_estimates` have no dataset-version signal of their own (unlike the CKAN loaders), so each is gated by `scripts/lib/source-version.js#runLedgerGateDecision` — a consumer-side "has anything happened upstream since MY OWN last completed run that I haven't accounted for?" check, run inside the advisory lock before any real work. SKIP fires only when the step has completed at least once AND every pipeline_runs row for its upstream producer(s) since then is `status='completed'` with zero `records_new`/`records_updated` (any non-completed status — including `deferred_to_full` — forces a RUN, fail-safe). A SKIP still emits a COMPLETED `pipeline_runs` summary (DS4) so the next evaluation's own-last anchor advances. `link_wsib`'s upstream is `load_wsib` (wsib_registry) ∪ `builders` (entities.name_normalized); wsib_registry linkage is MONOTONE (`load-wsib.js`'s UPSERT never touches `linked_entity_id`), so an upstream reload can only add newly-unlinked rows, never silently un-link an already-matched one. `link_parcel_addresses`'s upstream is `address_points` ∪ `parcels`. `compute_parcel_cost_estimates`'s upstream is `enrich_parcels`, PLUS an independent rate/index-bump check (`archetype_cost_rates`/`cost_escalation_index` have no `pipeline_runs` producer of their own — a bump is detected by diffing canonical ISO `rates_as_of`/`index_updated_at` keys, stamped into `records_meta` every run, against the live DB values); either signal forces a RUN. Escape hatch: `COMPUTE_PARCEL_COST_FORCE_FULL=1`.

    Separately, `enrich_heritage` gained its OWN incremental skip (the #418 mechanism, ported verbatim from `enrich_ravines`): a cheap pre-transaction `COUNT` of geom-bearing parcels whose `heritage_dataset_version_when_enriched` stamp is stale against the current heritage dataset version, scoped to the SAME eligibility ENRICH_SQL uses (`geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)`) — a small population of invalid-geometry parcels is permanently excluded from both the enrichment UPDATE and this stale-count, so they can neither force a stale count forever (the "wedge-open trap") nor silently satisfy one.

11. **Quality assertions** — three assert steps run AFTER the enrich+cost cascade so they read FINAL values:
    - `assert_global_coverage` (Spec 49): gated `zoning_class`, residential-with-building-scoped max-build/opt coverage floors (WARN<88/FAIL<75), `parcel_cost_menu` gate, INFO population/distribution rows.
    - `assert_parcel_sanity` (value-CORRECTNESS, this item; coverage↔sanity boundary Spec 49 §2): zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION; `gate:true` physical-impossibility/mislink checks FAIL the chain, known residuals WARN.
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
- `compute_centroids` N+1 pattern → performance hot spot (documented, not yet batched). `link_neighbourhoods`'s own N+1 was retired by `b1102cdb` (2026-04-01) and the step is now ONE set-based statement (batch-2 I4 conversion, 2026-09-16) — the claim survived here five months after it stopped being true; the `--full` `enrich_parcels` + cascaded cost recompute is the dominant runtime contributor (~18 min enrich on a ~105 min chain)
- **`enrich_parcels` scope-defer, chain-level lifecycle (Phase B B2, Spec 40 §3.1.2 / Spec 47
  §8.7).** A citywide-scale change (the founding case: a one-time upstream re-export that
  jittered every parcel geometry, tripping `IS DISTINCT FROM` citywide) makes `enrich_parcels`'
  pre-transaction scope count exceed its defer threshold. First occurrence: the chain stops
  cleanly at `enrich_parcels`, terminalizes `deferred_to_full` (green + `::warning`, Spec 40
  §3.1.2) — a normal, expected outcome, not an incident. Second CONSECUTIVE occurrence on the
  same step: the verdict step exits 1, "supervised force-full required" — the operator
  dispatches `chain-sources.yml` via `workflow_dispatch` with `ENRICH_PARCELS_FORCE_FULL=1` set
  on the `enrich_parcels` step only (bypassing the scope check for that one run; Spec 43 §Chain-
  Specific Arguments), never as a standing env var. **The quarterly SCHEDULED dispatch of this
  chain independently sets `LINK_MASSING_FORCE_FULL=1`** (Operator ruling D1′) regardless of
  whether a defer is in progress — that force-full covers `link_massing`'s own heights-only
  staleness bound and is unconditional on the defer lifecycle, not a response to it. Absent an
  operator-dispatched supervised force-full, an unresolved defer streak leaves `enrich_parcels`
  (and everything downstream of it: `compute_parcel_cost_estimates`, all three assert steps)
  un-refreshed — Phase B **B6.5**'s per-step staleness assert (Spec 115 §2.5) is the backstop
  that surfaces this even though the watchdog's absence check alone cannot (a defer counts as
  "ran").
- **`enrich_parcels`' pass-4 write bloats `parcels` mid-chain; the chain's own pre-flight bloat
  gate cannot see it (EP-D17, WF3, 2026-09-10).** `run-chain.js`'s Phase 0 (Spec 30 §4.1) samples
  `pg_stat_user_tables` dead-tuple ratios ONCE, at chain START, before step 1 runs — on run 4566
  it read PASS for `parcels` at 17:15Z, because the PREVIOUS run's own chain-tail
  `assert_engine_health` had just vacuumed it. `enrich_parcels`' pass 4 then bloated `parcels` to
  `dead_ratio` 0.697 by ~19:35Z, mid-chain, 2¼ hours after Phase 0 sampled — a gate that reads
  bloat only before step 1 can never see bloat the chain ITSELF creates that same run. This chain
  now carries an undocumented coupling: its own speed depends on the PREVIOUS run's last step
  (`assert_engine_health`, chain-tail VACUUM owner) having actually succeeded — if that step ever
  fails or is skipped, the NEXT dispatch inherits the bloat at chain start instead of at the tail,
  and the FIRST `parcels`-touching step pays the 150x scan-cost cliff instead of the last. Interim
  guard (this WF3, not a fix to the coupling itself): `enrich_parcels` now declares
  `execution.maintenance` — a library-owned VACUUM executor (`scripts/lib/step/plausibility.js`
  `runMaintenance`) that runs right after the step's own write phases, mid-chain, so the NEXT
  chain step (`link_neighbourhoods`/`link_wsib` per §2's ordering, or the next chain's own Phase 0)
  reads a heap `enrich_parcels` has already cleaned up itself, rather than waiting for
  `assert_engine_health` at the very end. Hoisting the chain-tail vacuum decision to the chain
  HEAD, and arming Phase 0's own warn-only gate with the Rule-3 tunables this WF3 filed HIGH, both
  remain OPEN — deliberately deferred to a WF2, per the operator's own no-scope-creep ruling.
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
- Every script in the manifest `chains.sources` array, listed explicitly so the generated system map carries an owner row for each step (Spec 123 G0; WF2 2026-09-14 — the prior "all N scripts" prose was invisible to `npm run system-map`):
- `scripts/reconcile-runs.js` — step 1 `reconcile`
- `scripts/quality/assert-schema.js` — step 2 `assert_schema`
- `scripts/load-address-points.js` — step 3 `address_points`
- `scripts/geocode-permits.js` — step 4 `geocode_permits`
- `scripts/load-parcels.js` — step 5 `parcels`
- `scripts/load-ravines.js` — step 6 `load_ravines`
- `scripts/load-heritage.js` — step 7 `load_heritage`
- `scripts/load-centreline.js` — step 8 `load_centreline`
- `scripts/link-parcel-addresses.js` — step 9 `link_parcel_addresses`
- `scripts/compute-centroids.js` — step 10 `compute_centroids`
- `scripts/link-parcels.js` — step 11 `link_parcels`
- `scripts/enrich-ravines.js` — step 12 `enrich_ravines`
- `scripts/enrich-heritage.js` — step 13 `enrich_heritage`
- `scripts/enrich-centreline.js` — step 14 `enrich_centreline`
- `scripts/load-massing.js` — step 15 `massing`
- `scripts/link-massing.js` — step 16 `link_massing`
- `scripts/load-neighbourhoods.js` — step 17 `neighbourhoods`
- `scripts/link-neighbourhoods.js` — step 18 `link_neighbourhoods`
- `scripts/load-wsib.js` — step 19 `load_wsib`
- `scripts/link-wsib.js` — step 20 `link_wsib`
- `scripts/load-zoning.js` — step 21 `load_zoning`
- `scripts/enrich-parcels.js` — step 22 `enrich_parcels`
- `scripts/compute-parcel-cost-estimates.js` — step 23 `compute_parcel_cost_estimates`
- `scripts/quality/assert-global-coverage.js` — step 24 `assert_global_coverage`
- `scripts/quality/assert-parcel-sanity.js` — step 25 `assert_parcel_sanity`
- `scripts/refresh-snapshot.js` — step 26 `refresh_snapshot`
- `scripts/quality/assert-data-bounds.js` — step 27 `assert_data_bounds`
- `scripts/quality/assert-engine-health.js` — step 28 `assert_engine_health`

### Out-of-Scope Files
- `src/lib/parcels/`, `src/lib/spatial/` — TypeScript API paths
- `src/components/permits/NeighbourhoodProfile.tsx` — UI rendering
- The partial-run MECHANISM the §Runbook above documents. `run-chain.js`'s `resolveStepSelection`
  is owned by Spec 40 (chain orchestrator) and the `from`/`only` dispatch inputs by Spec 115 §2.2
  (`chain-sources.yml`), both of which already carry those files in their own Target Files. This
  spec owns how to DISPATCH this chain partially, not the mechanism that makes it possible —
  listing either file here would give `npm run system-map` a second owner row for it.

### Cross-Spec Dependencies
- **Relies on:** `40_pipeline_system.md` (SDK, orchestrator)
- **Consumed by:** `41_chain_permits.md` / `42_chain_coa.md` (depend on spatial + enriched-parcel tables being populated)
- **Enriched-parcel data specs:** `58_source_zoning.md` (zoning DataStore feed), `59_source_ravine_protection.md`, `61_source_heritage.md`, `62_source_centreline.md`, `65_enrich_parcels.md` (max-build envelope + existing/scenario), `78_optimal_lot_config.md` (optimal-config + comps), `88_parcel_cost_model.md` (parcel cost menu)
- **Shared steps:** See `60_shared_steps.md` for geocode_permits, link_parcels, link_massing, link_neighbourhoods, link_wsib, refresh_snapshot
- `extract-builders.js` — permits-chain `builders` step named as `link_wsib`'s upstream run-ledger gate signal (`entities.name_normalized`), not governed here.
- `link-coa-to-parcels.js` — coa-chain step named as a downstream consumer of the `link_parcel_addresses` bridge (Tier 1a/1b), not governed here.
</constraints>

---

## Step Details (Single-Chain Steps)

### Step 10: Compute Centroids (`compute-centroids.js`)

**Logic:**
1. Query parcels where `centroid_lat IS NULL` or `centroid_lng IS NULL`
2. Calculate geometric centroid from polygon coordinates
3. Update `parcels.centroid_lat`, `parcels.centroid_lng`

**Edge Cases:** Complex multipolygon → centroid may fall outside polygon (valid for approximate matching). Individual UPDATE per parcel (known N+1 performance issue).
