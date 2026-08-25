# Sources Chain — Incremental Architecture & Cadence Design

**Date:** 2026-08-04 · **Type:** design investigation (read-only; no code changed)
**Trigger:** GH run 30861473506 (weekly `chain-sources.yml` cron, Sun 13:00 UTC) hit the 180-min chain-step ceiling (`.github/workflows/chain-sources.yml:72`) with `enrich_parcels --full` still running — steps 1–20 finished in ~57 min; `enrich_parcels` ran 00:11→02:14 UTC (**>123 min, did not finish**); the 6 steps after it (cost estimates, 4 asserts, snapshot) never ran.

---

## 0. Headline recommendations

1. **Drop the forced `--full`.** `scripts/manifest.json` → `scripts.enrich_parcels.chain_args.sources = ["--full"]` makes the weekly run recompute all 5 passes over 486K parcels even when *nothing upstream changed* (this run: zoning skip, centreline skip, ravines skip, heritage skip, massing 4/428K rows changed). All five passes already implement incremental predicates; what's missing is a `link-massing`-style upstream-version gate so `--full` self-downgrades when the producers are unchanged (`scripts/lib/massing-full-gate.js` is the exact template).
2. **Port the ravines/centreline version-skip to `enrich-heritage`** — the outlier that spends **8.8 min/run doing provably nothing**: it writes `heritage_dataset_version_when_enriched` but never reads it as a skip predicate (`enrich-heritage.js:212-228`); all three required pieces (producer version in `pipeline_runs.records_meta`, per-row stamp, load-parcels NULL-on-geometry-change fence) already exist. Same-day port.
3. **Gate the other two big unconditional recomputes**: `link_parcel_addresses` (10.2 min, no skip logic at all, `ON CONFLICT DO NOTHING` writes) and `compute_parcel_cost_estimates` (streams ~380–437K residential parcels through the JS cost engine every run, "Idempotent full-rewrite" by design, no watermark).
4. **The slow-moving sources already skip cheaply** (ravines/heritage/centreline/zoning loaders: ~2 s each on unchanged `Last-Modified`/CKAN metadata). Extend the CKAN `package_show` check (the `load-zoning.js` pattern — cheapest, one JSON call) to massing/address-points/parcels; for massing it also fixes the resource-id-rotation 404 (`load-massing.js:29-35`).
5. **Cadence**: weekly incremental chain (~35–45 min steady state, vs ~4 h today that never completes) + a **monthly full-recompute safety pass** run as a separate dispatch/cron variant with a raised ceiling (GitHub job max is 360 min; today's chain step is capped at 180).

---

## 1. Observed step timings — run 30861473506 (2026-08-03 23:13 UTC)

From `PIPELINE_SUMMARY` `sys_duration_ms` rows in the GH log (`gh run view 30861473506 --log`).

| # | Step | Duration | What happened this run |
|---|------|---------:|------------------------|
| 1 | assert_schema | 4 s | upstream drift probe (Range requests + HEAD, no full downloads) |
| 2 | address_points | 216 s | full CSV stream+upsert: 525,467 read, **0 changed** |
| 3 | geocode_permits | 5 s | set-based, self-limiting |
| 4 | parcels | **820 s** | full 327 MB CSV stream+upsert: 498,443 read, **0 ins / 0 upd** |
| 5 | load_ravines | 2 s | **SKIP** `unchanged_last_modified` (HEAD validators) |
| 6 | load_heritage | 2 s | **SKIP** — both datasets `unchanged_last_modified` |
| 7 | load_centreline | 2 s | **SKIP** `unchanged_last_modified` |
| 8 | link_parcel_addresses | **615 s** | full ~486-batch spatial join re-run; writes `DO NOTHING` |
| 9 | compute_centroids | 49 s | NULL-scoped set-based UPDATE |
| 10 | link_parcels | 6 s | early-skip: "No unlinked permits" |
| 11 | enrich_ravines | 45 s | **version-skip** — 0 stale parcels at current ravine version |
| 12 | enrich_heritage | **527 s** | **no skip exists** — full 486K × 2-LATERAL spatial join, 0 rows written |
| 13 | enrich_centreline | 181 s | **version-skip incremental** — version unchanged, recomputed only 14,510 stale parcels, wrote 0 |
| 14 | massing | 181 s | full shapefile stream+upsert: 428,184 read, 4 updated |
| 15 | link_massing | 155 s | `--full` **self-downgraded** → `incremental:gate_unchanged`; 1,395 never-linked parcels processed |
| 16 | neighbourhoods | 6 s | full reload (158 rows — trivial) |
| 17 | link_neighbourhoods | 6 s | NULL-watermark, 0 to process |
| 18 | load_wsib | 0 s | self-skip (manual annual CSV, `load-wsib.js:89-126`) |
| 19 | link_wsib | 165 s | re-attempts the permanently-unmatchable ~121K registry rows (skip predicate never fires) |
| 20 | load_zoning | 2 s | **SKIP** — one CKAN `package_show` call, all 10 layer versions unchanged |
| 21 | enrich_parcels `--full` | **>7,380 s DNF** | 5-pass full recompute; killed by the 180-min ceiling |
| 22 | compute_parcel_cost_estimates | never ran | would have streamed ~380–437K parcels through the JS engine |
| 23–27 | assert_global_coverage, assert_parcel_sanity, refresh_snapshot, assert_data_bounds, assert_engine_health | never ran | est. 5–10 min combined |

Steps 1–20 ≈ 50 min compute (~57 min wall). **~85 % of the completed time is six steps — parcels (13.7 m), link_parcel_addresses (10.2 m), enrich_heritage (8.8 m), address_points (3.6 m), massing (3 m), enrich_centreline (3 m) — which together changed 4 rows.**

---

## 2. Per-source inventory

Two loader architectures coexist:

- **Group A — version-aware:** `load-ravines.js`, `load-heritage.js`, `load-centreline.js`, `load-zoning.js`. Cheap **pre-download** skip check (HEAD `Last-Modified`/`ETag`, or for zoning one CKAN `package_show` call); prior validators stored in **`pipeline_runs.records_meta` of the last `status='completed'` row** for the chain-scoped slug (e.g. `sources:load_ravines`). There is **no `source_versions` table** — the run ledger is the version store. A skip run re-emits the full prior `records_meta` block so downstream "read latest completed run" consumers don't break (`load-ravines.js:314-327`, `load-zoning.js:604-619`).
- **Group B — legacy full-stream:** `load-address-points.js`, `load-parcels.js`, `load-massing.js`, `load-neighbourhoods.js`, `load-wsib.js`. No source-version awareness; re-stream 100 % of rows each run, relying on per-row `IS DISTINCT FROM` upsert guards. Only download-avoidance is `fs.existsSync` on a gitignored `data/` path — which never revalidates freshness and actively masked the massing resource-id rotation 404 until a clean CI checkout hit it (`load-massing.js:29-35`).

Note: `skipCheckDecision` is copy-pasted **four times with three divergent semantics** (ravines `:163-171`, heritage `:186-193`, centreline `:247-255` adds contentHash to the no-validators bail, zoning `:328-337` is CKAN-metadata equality + a 730-day force-reload). No `scripts/lib/source-version.js` exists.

| Step | Source & volume | Current behavior | Cheapest delta signal | Runtime full / skip |
|------|-----------------|------------------|----------------------|---------------------|
| address_points | CKAN CSV ~185 MB, 525K rows (`load-address-points.js:37`) | full stream + 15-col `IS DISTINCT FROM` upsert (`:192-243`); no version skip | CKAN `package_show` `last_modified` (refresh **Daily** — see caveat §5) | 216 s / ~2 s |
| parcels | CKAN CSV ~327 MB, 498K rows (`load-parcels.js:36`) | full stream + 8-predicate upsert (`:362-376`); **NULLs the ravine/heritage/centreline enrich watermarks on geometry change** (`:341-361`) — the existing invalidation channel | same | 820 s / ~2 s |
| load_ravines | CKAN zip, 854 polys | **skip-before-download** on HEAD vs `records_meta.ravine_load` (`:163-171`, `:281-327`) | done | ~1 min / 2 s |
| load_heritage | 2 CKAN zips (8,824 + 29) | per-dataset skip, same pattern (`:186-193`) | done (**Quarterly**) | ~1 min / 2 s |
| load_centreline | CKAN zip ~117 MB, 47K segments | skip on HEAD (`:247-255`); non-skip = full DELETE+INSERT staging replace (`:559-596`) | done (**Daily** file regen) | ~4 min / 2 s |
| massing | CKAN zip, 428K footprints, **Annual vintage** | full stream + upsert, no version skip; hardcoded resource URL rotates on re-upload | CKAN `package_show` (also resolves newest resource id) | 181 s / ~2 s |
| neighbourhoods | 158 polys + census XLSX (CKAN `6e19a90f…`) | full reload, blind census UPDATEs + VACUUM (158-row table) | not worth gating | 6 s |
| load_wsib | manual annual CSV | self-skips in chain without `--file` (`:89-126`) | fine | 0 s |
| load_zoning | CKAN DataStore, 10 layers | **skip on one `package_show` call** (`:328-337`, `:591-620`); all-or-nothing across layers; 730-day staleness force-reload (`:53`) | done — the model pattern | ~30–45 min reload / 2 s |

### CKAN-declared refresh cadence (polled 2026-08-04 via `package_show`)

| Dataset | `refresh_rate` | `last_refreshed` | Practical change rate |
|---------|----------------|------------------|----------------------|
| Address points | Daily | 2026-08-04 | file regenerates daily; row deltas ≈ 0/week |
| Property boundaries | Daily | 2026-08-04 | same — 0 ins / 0 upd this run |
| Toronto centreline | Daily | 2026-08-03 | file daily; meaningful change rare |
| Ravines | As available | **2022-03** (4 yrs old) | effectively frozen |
| Heritage register / HCDs | Quarterly | 2026-06 | quarterly |
| 3D massing | **Annually** | 2025-12-05 | yearly vintage |
| Neighbourhoods | As available | 2026-02-20 | ~yearly |
| Census profiles XLSX | As available | 2026-05-27 | static until next census |
| Zoning by-law | As available | 2026-02-20 | a few times/year |

---

## 3. Derived/link steps — current skip behavior

| Script | Skip mechanism today | Watermark / gate store | Cost when nothing changed |
|---|---|---|---|
| link-parcel-addresses | **none** — full spatial join every run, `ON CONFLICT DO NOTHING` (`:101-124`) + 2 full anti-join coverage COUNTs (`:162-173`) | — | **HEAVY (10.2 min)** |
| compute-centroids | `centroid_lat IS NULL` count == 0 → SKIPPED (`:64-88`) | target column NULL-ness | CHEAP |
| link-parcels | `parcel_linked_at IS NULL OR < geocoded_at` + 0-row early return (`:159-206`) | `permits.parcel_linked_at`/`geocoded_at` | CHEAP |
| enrich-ravines | Layer-1 `countStale()==0` full skip (`:95-102`, `:274-278`) + Layer-2 stale-scoped CTE (`:155`) | `parcels.ravine_dataset_version_when_enriched` (mig 168) vs producer version in `records_meta.ravine_load` | CHEAP (45 s incl. coverage aggregates) |
| **enrich-heritage** | **none — stamp written (`:191`), never read as predicate** | stamp (mig 171) + load-parcels fence exist, unused | **HEAVY (8.8 min) unconditionally** |
| enrich-centreline | 3-way `skip` / `incremental` / `full` (see §3.1) | `parcels.centreline_dataset_version_when_enriched` (mig 174) vs own last run's `records_meta.centreline_enrich` | CHEAP when skip (2 queries) |
| link-massing | `decideMassingFull` gate → `incremental:gate_unchanged` (see §3.2) | `records_meta.{code_version, building_footprints_count}` + live footprint COUNT | CHEAP–MED (2.6 min; incremental = never-linked only) |
| link-neighbourhoods | `neighbourhood_id IS NULL` + `-1` no-match sentinel (`:88-153`) | `permits.neighbourhood_id` | CHEAP |
| link-wsib | `linked_entity_id IS NULL` count == 0 — **never fires** (~121K permanently unmatchable rows re-attempted every run, incl. the trigram tier) | none — no `attempted_at` | MEDIUM (2.7 min) |
| **compute-parcel-cost-estimates** | **none** — "Idempotent full-rewrite" (`:14`); streams all `zoning_class LIKE 'R%'` parcels (`:263`) through the JS engine; write-side `IS DISTINCT FROM` only (`:207-221`); no `--full`, no `chain_args` | none | **HEAVY (~380–437K JS recompute) unconditionally** |
| refresh-snapshot | none by design (REPEATABLE READ point-in-time snapshot) | — | MEDIUM (called by all 3 chains) |
| assert-schema | n/a — network Range/HEAD probes | — | CHEAP |
| assert-global-coverage | chain-branching only; sources branch ≈ 3 full parcels scans + 2 correlated EXISTS (`:519-615`) | — | MEDIUM |
| assert-parcel-sanity | none; single-scan fold + parallel percentile queries (~15 s) | — | MEDIUM-CHEAP |
| assert-data-bounds | chain-branching + 24 h windows; 2 GROUP-BY dup scans over 525K/486K rows | `permits.last_seen_at` | MEDIUM |
| assert-engine-health | n/a (pg_stat catalog) + **auto-VACUUM of bloated tables** (`:131-144`) | — | CHEAP + variable |

**Chain-level fact:** `run-chain.js` gate-skip plumbing (`:320-346`, `:521-531`) never fires for sources — `manifest.chain_gates` defines gates only for permits/coa (`manifest.json:120-123`). All skipping in sources is per-script. Also, only `enrich_parcels` and `link_massing` receive `chain_args.sources = ["--full"]`; other scripts advertising `supports_full` either never receive it or ignore it.

### 3.1 The `enrich-centreline` version-skip — the pattern to generalize

Run 30861473506 logged: *"version unchanged (9d19afa…) — reduced recompute of 14510 stale parcels (updated 0)"*. Mechanism (all in `scripts/enrich-centreline.js`):

1. **Producer version**: `readCentrelineContract` (`:318-338`) reads the last completed `sources:load_centreline` run's `records_meta.centreline_load.source_dataset_version` (content hash of the zip).
2. **Own last-enriched version**: `readLastEnrichedVersion` (`:289-301`) reads its **own** last completed run (`sources:enrich_centreline`) — deliberately the run ledger, not the per-parcel column, so a stray row can't defeat the gate (`:285-288`).
3. **Stale set**: `countStaleParcels` (`:305-313`) — `centreline_dataset_version_when_enriched IS DISTINCT FROM $1` over valid-geom parcels. The set is exactly {new, moved, never-enriched} **because** `load-parcels.js:341-361` NULLs the stamp whenever a parcel's geometry changes (the load-bearing fence).
4. **3-way decision** `decideCentrelineMode` (`:420-424`): version changed/no prior → `full`; unchanged + stale>0 → `incremental` (scoped CTE `:277-283`); unchanged + 0 stale → `skip`. An unchanged-version run costs **two queries**.
5. **Skip still emits a completed run row** (`emitReducedSummary` `:445-484`) re-stamping the version — required because `enrich-permits.js` HALTs the daily chains unless a completed `enrich_centreline` post-dates the latest `load-parcels` (`:438-444`).

Observed oddity worth a one-off: the 14,510 "stale" parcels are recomputed **every week and update 0 rows** — they never converge to the current stamp (likely geometry-invalid or no-write-guard interactions). ~3 min/week of permanent churn; diagnose before generalizing the pattern.

### 3.2 The `link-massing` full-gate — how `--full` is made safe

`link-massing.js:176-183` + `scripts/lib/massing-full-gate.js:29-58`: `FULL_MODE = forceFull || (explicitFull && gateChanged)` where `gateChanged` compares (a) live `COUNT(*) FROM building_footprints` and (b) `code_version` against the last completed link_massing run's `records_meta`. So the manifest can keep passing `--full` while the script only pays for it when massing actually changed (or the algorithm version bumped). Escape hatch: `LINK_MASSING_FORCE_FULL=1`. Caveat: its incremental mode is *link-existence* (`NOT EXISTS parcel_buildings`) — a moved parcel with an existing link is not re-evaluated; a version-stamp variant would close that.

---

## 4. enrich-parcels decomposition (the 180-min step)

`scripts/enrich-parcels.js` (1,624 lines) runs **five passes** (`main()` `:1389-1408`): four SQL set-based passes in one transaction, then a JS-streaming pass after commit. The chain forces `--full` (`manifest.json` scripts.enrich_parcels.chain_args), so every pass's incremental predicate is bypassed weekly.

| Pass | Function | Upstream deps | Incremental predicate (already coded) | Invalidation gap |
|------|----------|---------------|----------------------------------------|------------------|
| 1. Zoning spatial join | `enrichParcels` / `buildEnrichmentSql` (`:173`) | 10 zoning tables × parcels.geom | `zoning_enriched_at IS NULL OR EXISTS (zoning row with source_dataset_version > zoning_enriched_at)` (`:177-182`) | predicate is a correlated spatial EXISTS per parcel — needs a cheap short-circuit ("zoning version unchanged since my last completed run → scope = never-enriched only") |
| 2. Max-build envelope | `enrichMaxBuild` (`:389`) | pass-1 output + massing link + ravine/heritage/centreline flags + nbhd norms | `lot_size_confidence IS NULL OR parcel IN parcel_zoning_enrich` (`:393-395`) | **blind to massing/centreline/heritage/ravine/norm changes** — the documented reason `--full` was pinned (`:391-392`: "--full recomputes all (use after a massing/lot reload)") |
| 3. Existing structure + scenarios | `enrichExistingStructure` (`:755`) | massing link + pass-2 output | `imagery_roof_footprint_sqm IS NULL OR parcel IN parcel_max_build` (`:756-758`) | same massing blind spot |
| 4. Comparable builds (kNN) | `enrichComparableBuilds` (`:1040`) | pass-2 output + **permits/coa decisions** (change daily!) | `comp_count IS NULL` (`:982`); under `--full` NULLs and re-kNNs **every eligible parcel** (`:1050-1053`) — 50-NN overfetch × hundreds of K subjects = a major share of the 123 min | comps go stale as permits land; needs scoped refresh (permit-adjacent parcels), not weekly citywide |
| 5. Optimal config (JS engine) | `enrichOptimalConfig` (`:1259`) | passes 2–4 output + neighbourhood_build_norms | `opt_config_confidence IS NULL` (`:1093`); `--full` streams all eligible through the per-row engine in 500-row batches | same |

**Existing substrate for change-scoping:**
- Watermarks on parcels: `zoning_enriched_at` (timestamptz), `ravine/heritage/centreline_dataset_version_when_enriched` (TEXT; migs 168/171/174). **No massing or norms watermark; parcels has no `updated_at` column** (schema doc, 158 cols).
- Invalidation channel precedent: `load-parcels.js:341-361` NULLs the three enrich watermarks on geometry change.
- Gate precedent: `massing-full-gate.js` (§3.2).

---

## 5. Downstream cascade

- **Within sources:** `enrich_parcels` → `compute_parcel_cost_estimates` → asserts/snapshot. The cost step's inputs are ~18 parcel columns written by enrich_parcels + `archetype_cost_rates` + `cost_escalation_index`; when enrich touched 0 rows and the rate tables are unchanged, the entire 380–437K-row JS recompute is provably a no-op — gate it on (enrich records_updated + rate-table version) and skip.
- **Cross-chain:** parcel-field propagation to permits/coa (Spec 78 §4D, Spec 62 §8e) lives in the **daily permits/coa chains** (`enrich_permits`, `enrich_coa_zoning`), so a skipped weekly sources step does not strand propagation. Conversely `enrich-permits.js` HALTs unless a *completed* `enrich_centreline` run post-dates the latest `load-parcels` — any new skip path MUST emit a completed run row with re-stamped versions (the `emitReducedSummary` pattern, §3.1.5).
- **Skip cascade map:** zoning unchanged → pass 1 scope ≈ 0 → passes 2–3 scope ≈ 0 (they key off pass-1's temp table). massing unchanged (gate) → link_massing incremental → passes 2–3 have no massing-driven work (once a massing watermark exists). address-points+parcels 0 changed → link_parcel_addresses skippable → compute_centroids already self-skips. Everything-skipped → cost step skippable → asserts still run (they are the safety net and are only MEDIUM).

---

## 6. Recommended target architecture

### Phase 1 — quick wins (one small WF2, no schema change, no new tables)
1. **Upstream-version gate inside `enrich-parcels.js`** (mirror `massing-full-gate.js`): read the latest completed producer versions (`sources:load_zoning` layer versions, `building_footprints` count/code-version, `load_centreline`/`load_heritage`/`load_ravines` versions) and compare to the set recorded by the last completed `sources:enrich_parcels` run in its own `records_meta`; unchanged → treat `--full` as incremental (and short-circuit pass 1's correlated EXISTS to "never-enriched only"); changed → escalate only the affected passes. Manifest keeps `--full` (safe now).
2. **Port ravines' Layer-1/Layer-2 skip to `enrich-heritage.js`** — all pieces exist; saves 8.8 min/run.
3. **Gate `link_parcel_addresses`**: skip when the latest `address_points` and `parcels` loads both report 0 inserted/updated (readable from `pipeline_runs.records_meta` of the same chain run); saves 10.2 min/run.
4. **Gate `compute_parcel_cost_estimates`**: skip when enrich_parcels updated 0 rows AND `archetype_cost_rates`/`cost_escalation_index` versions are unchanged since its own last completed run; saves ~10–25 min/run.
5. **`link_wsib` attempted-watermark**: add `attempt_round`/`attempted_at` (or key off the registry's `last_seen_at`) so the ~121K permanently-unmatchable rows aren't trigram-matched weekly; saves ~2.5 min.

Phase-1 total saving: the weekly run completes at roughly **35–45 min** instead of DNF.

### Phase 2 — structural
6. **CKAN `package_show` skip for Group-B loaders** (address_points, parcels, massing) using the `load-zoning.js` pattern (one JSON call, version in `records_meta`). For massing, resolve the newest resource id at runtime (kills the rotation-404 class). Caveat: address-points/parcels/centreline regenerate **daily**, so `last_modified` may change with identical content — observe for 2 weeks; if noisy, fall back to keeping the stream (their combined 17 min is tolerable) or stream-hash the download before parsing.
7. **Massing watermark for enrich passes 2–3**: either a 4th/5th `*_version_when_enriched` column (matches the existing pattern) or a `parcels_dirty(parcel_id, reason, marked_at)` side table written by `link-massing` when a parcel's building set changes. This closes the blind spot that motivated the pinned `--full`, and also fixes link-massing's own moved-parcel gap (§3.2).
8. **Decouple passes 4–5 (comps/optconfig) from the weekly full**: their real upstream is permits/coa (daily). Scoped refresh = parcels within X m of a permit/CoA decision landed since the last run, plus `comp_count IS NULL` — as a `--refresh-comps` mode or a separate manifest step (possibly in the permits chain).
9. **Monthly full safety pass**: `workflow_dispatch` + monthly cron variant of chain-sources passing real `--full` (via `LINK_MASSING_FORCE_FULL`-style env or a `--force-full` chain arg), with `timeout-minutes` raised toward the 360-min GitHub ceiling — or split the chain into two jobs at `enrich_parcels` so loaders and enrichment each get their own 180 min.
10. **One-off**: diagnose the 14,510 permanently-stale centreline parcels (recomputed weekly, 0 updates — ~3 min/wk of churn).

### Phase 3 — shared plumbing
11. Extract the 4 copy-pasted `skipCheckDecision` variants + the 3-line prior-version reader + the re-emit-prior-meta helper into `scripts/lib/source-version.js`; adopt in new gates so semantics stop diverging.

---

## 7. Cadence recommendation

| Source / step | Check cadence (cheap poll) | Load/recompute cadence | Note |
|---------------|---------------------------|------------------------|------|
| Address points, property boundaries | weekly, with chain (2 s `package_show` each) | on change; keep weekly stream as fallback if `last_modified` proves noisy (Daily regeneration) | 17 min/wk worst case — acceptable floor |
| Centreline | weekly (2 s HEAD — done) | on change | |
| Ravines | weekly (2 s — done); dataset frozen since 2022 | on change | |
| Heritage | weekly (2 s — done) | on change (~quarterly) | |
| 3D massing | weekly (2 s `package_show` — to build) | on change (~annual); new vintage ⇒ escalate enrich passes 2–3 + link_massing full | |
| Neighbourhoods + census | leave the 6 s reload | any | |
| Zoning | weekly (2 s — done) | on change (~2-3×/yr) ⇒ pass-1 full escalation (already coded via `source_dataset_version > zoning_enriched_at`) | |
| WSIB | manual annual | manual | |
| enrich_parcels | — | **weekly incremental** (never-enriched ∪ dirty ∪ version-escalated passes); **monthly full** | full also auto-fires on zoning/massing vintage change via the gate |
| comps/optconfig (passes 4–5) | — | weekly scoped (permit-adjacent); monthly full | candidate to move to permits chain |
| compute_parcel_cost_estimates | — | only when enrich touched rows or rate tables changed; monthly full | |
| asserts + snapshot | — | every run (safety net; MEDIUM cost) | |

---

## 8. Compute budget

| Scenario | Estimate | Basis |
|----------|----------|-------|
| **Today (weekly full)** | ~3.5–4 h/wk intended; **currently DNF** at the 180-min step ceiling | 57 min steps 1–20 + >123 min enrich_parcels (incomplete) + est. 15–30 min for the 6 unreached steps |
| **Steady state, Phase 1 only** | **~35–45 min/wk** | loaders unchanged-skip (~10 s) + AP/parcels streams kept (17 min) + link_parcel_addresses gate (~10 s) + centroids/links (~4 min) + enrich_heritage ported (~10 s) + enrich_centreline (~3 min until the 14.5K-stale fix) + link_massing incremental (2.6 min) + link_wsib (2.7 min → ~10 s with item 5) + enrich_parcels incremental (~3–8 min) + cost gate (~10 s) + asserts/snapshot (~6–10 min) + runner setup (~2 min) |
| **Steady state, Phase 2** | **~20–25 min/wk** | AP/parcels metadata-gated; wsib watermarked; stale-centreline fixed |
| **+ monthly full safety pass** | ~2.5–3.5 h once/month (amortized ~+40 min/wk) | needs the raised ceiling or the 2-job split |
| **Worst case (everything changed: new massing vintage + zoning update + boundary redraw)** | ~4.5–5 h, a few times/yr max | zoning 10-layer reload (~30–45 min) + massing reload/link full (~25 min) + AP/parcels (~17 min) + centreline reload+full enrich + enrich_parcels full + comps/optconfig full + cost full |

Weekly saving vs. intent: **~3 h of Actions/DB compute (~85–90 %)** — and the chain actually finishes, restoring cost estimates + the 4 assert gates + snapshot, which have silently not run whenever the ceiling fires.

---

## 9. Open design questions for the operator

1. **Monthly-full mechanics**: raise `timeout-minutes` for a dedicated full variant (360-min GH ceiling allows ~5 h) vs split chain-sources into two jobs (loaders | enrich+cost) each with its own budget? The split also isolates loader failures from enrichment failures.
2. **Daily-regenerated CSVs**: is CKAN `last_modified` stable when content is unchanged for address-points/property-boundaries? Needs a 2-week observation before trusting the gate; otherwise accept the 17-min stream floor or add a download-side content hash.
3. **Comps/optconfig ownership**: move passes 4–5 out of `enrich_parcels` into the daily permits chain (their true upstream), leaving sources with passes 1–3? Affects Spec 65/78 spec boundaries.
4. **Dirty-substrate shape**: more `*_dataset_version_when_enriched` columns (matches precedent, but 486K-row UPDATE churn on invalidation) vs a `parcels_dirty` side table (cheap to mark, new table + join)?
5. **Safety-recompute frequency**: monthly (+~40 min/wk amortized) vs quarterly (leans harder on the invalidation fences being airtight)? Reality-Check's parcel-sanity audit runs every chain either way.
6. **The 14,510 permanently-stale centreline parcels**: investigate now (cheap one-off) or fold into the Phase-1 WF2?
