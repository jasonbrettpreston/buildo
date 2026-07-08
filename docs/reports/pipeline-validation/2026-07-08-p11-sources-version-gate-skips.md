# WF2 P11 — sources-run efficiency version-gate skips (validation)

**Date:** 2026-07-08 · **Branch:** auto-unblock/validation-2026-05-23 (local, unpushed)
**Scope:** P11-1 `enrich_centreline` row-level version-skip gate; P11-2 `link_massing` `--full` gate.

## What shipped

| Item | Mechanism | Commit |
|------|-----------|--------|
| P11-1 sub-step | `load-parcels.js` #418 DEC-FENCE2 gains a 3rd CASE arm NULLing `centreline_dataset_version_when_enriched` on geometry change (the load-bearing precondition — a moved parcel must become stale) | `fix(55…)` |
| P11-1 gate | `enrich-centreline.js`: producer `source_dataset_version` vs the last completed run's recorded version → unchanged ⇒ recompute only NULL/stale-stamp parcels (reduced) / full skip; changed ⇒ full. Reduced+skip emit a `status='completed'` row (Observer PASS, stamps preserved) so `assertCentrelineEnriched` stays green | `feat(62…)` |
| P11-2 gate | `link-massing.js` + `scripts/lib/massing-full-gate.js`: `--full` now *permits* a full relink; the gate does one only when `building_footprints` count or `LINK_MASSING_CODE_VERSION` changed. `LINK_MASSING_FORCE_FULL=1` forces | `feat(56…)` |

## Gate validation — both paths proven

### P11-1 centreline — UNCHANGED → reduced/skip (the win)
Standalone pre-chain smoke run (live DB, producer version == last recorded `79029bb3…`):
```
[enrich-centreline] version unchanged (79029bb3…) — reduced recompute of 14512 stale parcels (updated 0)
records_updated: 0, verdict PASS, mode=incremental, completed in 11.2s
```
→ **11.2 s vs the ~92 min full recompute.** The 14,512 stale parcels are the permanent zero-intersection tail (NULL stamp, no centreline within proximity), so an unchanged run lands in the *reduced* band (seconds), never a literal zero-skip — exactly what the acceptance permits ("SKIP/reduced, seconds-minutes, not 92 min"). No parcels updated, stamps preserved ⇒ `assertCentrelineEnriched` coverage (~97%) holds. Standalone `pipeline.run` emits to stdout only (no `pipeline_runs` row), so this had zero DB side effects.

### P11-1 centreline — CHANGED → full (proven live, in the acceptance chain)
The acceptance `run-chain.js sources` run happened to catch a **genuine source republish**: this chain's `load_centreline` re-downloaded a file with `last_modified: Tue, 07 Jul 2026 18:15:38 GMT`, whose md5 `content_hash` differs from the last enrich's recorded version:
```
prior enrich recorded: 79029bb3699abdec5ecb81e82f06a409
this chain load_centreline: 80496e679ef7a2ae8b2e87eb986142a0   (features_deleted 47368 / inserted 47363)
```
`decideCentrelineMode` → **`full`**, and Postgres showed the full `DROP…; CREATE TEMP TABLE … WITH parcel_segments …` (the unscoped build) executing — i.e. the gate correctly reverted to a full recompute on a changed source. This is the safe fallback: **a changed source is never skipped.**

> **Signal-stability note (honest limitation):** `source_dataset_version = md5(zip)` (`load-centreline.js:556`). A CKAN re-zip changes the md5 even when the street geometry is identical, which would force a full recompute. This is bounded by `load-centreline.js`'s HEAD `Last-Modified`/`ETag` skip-check (§3.2): when the upstream file is byte-stable the loader SKIPS the download, `contentHash` is null, and the version falls back to the stable `etag` → the enrich gate then sees "unchanged" and skips. So the optimization fires on any truly-unchanged quarterly run (etag stable); it correctly does full whenever the upstream file actually changes (new etag → re-download → new md5). This acceptance run hit the latter.

### P11-2 massing — UNCHANGED → incremental (the win)
Live gate read (pre-chain):
```
gate: {"changed":false,"reason":"unchanged","buildingCount":"427077"}
sources chain (--full) → FULL_MODE = false (incremental)
force env → FULL_MODE = true (escape hatch)
```
→ the sources-chain `link_massing` goes **incremental** (retiring the ~21.9-min always-full) whenever the `building_footprints` corpus count is unchanged and the code version matches. The b16c036-class guard (bump `LINK_MASSING_CODE_VERSION`) and a real count change both force a full relink incl. the ghost-link cleanup — regression-locked in `massing-full-gate.logic.test.ts`.

## Regression locks
- `enrich-centreline.logic.test.ts` — `decideCentrelineMode` (changed/no-prior→full, unchanged+stale→incremental, unchanged+0→skip), scoped-SQL predicate, Observer-style reduced emission (completed, source_dataset_version, no writes on skip).
- `massing-full-gate.logic.test.ts` — `decideMassingFull`, data/code/bootstrap change-detection, and the source contract that a FULL run still runs the ghost-link cleanup.
- `load-parcels-ravine-invalidation.db.test.ts` — the #418 centreline stamp NULLs on geom change, preserved on address-only change.

## Acceptance chain run (measured — 2026-07-08, detached `run-chain.js sources`)

**Terminal: `completed_with_warnings` · wall-clock 8,821.9 s = 147.0 min · all 27 steps landed `pipeline_runs` rows.**

This run is NOT a clean unchanged re-run: the centreline source **genuinely republished mid-window** (Last-Modified 2026-07-07 18:15; content hash `79029bb3…`→`80496e67…`, 47,368 deleted / 47,363 inserted features), so the centreline gate CORRECTLY chose `full` — the live proof of the changed-version→full safety path. The **massing gate fired live**: `link_massing` ran **8.5 s** (`incremental:gate_unchanged`) instead of the pre-P11 ~21.9 min full relink — the measured P11-2 win.

| Step | Status | Secs | Gate note |
|------|--------|------|-----------|
| assert_schema | completed | 4.4 | |
| address_points | completed | 42.9 | |
| geocode_permits | completed | 12.2 | WARN (pre-existing) |
| parcels | completed | 79.8 | |
| load_ravines | completed | 0.7 | |
| load_heritage | completed | 0.8 | |
| load_centreline | completed | 33.5 | source REPUBLISHED (new hash `80496e67…`) |
| link_parcel_addresses | completed | 199.4 | |
| compute_centroids | completed | 7.0 | |
| link_parcels | completed | 7.8 | |
| enrich_ravines | completed | 8.9 | |
| enrich_heritage | completed | 38.9 | |
| **enrich_centreline** | completed | **5,225.7 (87.1 min)** | **mode=full — gate correctly detected the changed version**; 472,002 re-stamped; new version recorded for the next-run gate |
| massing | completed | 50.2 | |
| **link_massing** | completed | **8.5** | **incremental:gate_unchanged (count 427,077, code v2)** — vs ~21.9 min pre-P11 |
| neighbourhoods | completed | 12.8 | |
| link_neighbourhoods | completed | 3.2 | WARN (94.8% known residual) |
| load_wsib | completed | 0.3 | |
| link_wsib | completed | 99.7 | |
| load_zoning | completed | 0.8 | |
| enrich_parcels | completed | 2,790.6 (46.5 min) | `--full` (P6.7-chosen, out of P11 scope) |
| compute_parcel_cost_estimates | completed | 74.7 | |
| assert_global_coverage | completed | 12.4 | |
| assert_parcel_sanity | completed | 17.6 | WARN (known watches) |
| refresh_snapshot | completed | 36.0 | |
| assert_data_bounds | completed | 5.2 | WARN (known residuals) |
| assert_engine_health | completed | 47.5 | WARN (pre-existing) |

WARNs are the documented known-residual set (link_neighbourhoods 94.8%, sanity/bounds watches, engine health) — stable residuals, not regressions.

### Runtime accounting vs the P6.7-D baseline (181.9 min)
- **This run: 147.0 min** = baseline − ~21.7 min (massing gate, live) − ~5.5 min (centreline full ran 87.1 vs 92.6) − ~6.5 min (enrich_parcels 46.5 vs 53.0 run-to-run variance).
- **Projected genuinely-unchanged re-run:** 147.0 − 87.1 (full centreline) + ~0.2-1 (reduced centreline; standalone measured 11.2 s) ≈ **~61 min** — comfortably under the plan's ~69-min target; `enrich_parcels --full` (46.5-53 min) is the dominant residual, as scoped.

### assertCentrelineEnriched — direct SQL predicate verification (permits chain NOT run, per plan)
```
L24b recency: enriched_at 2026-07-08 15:27:46 >= parcels_at 2026-07-08 13:55:44 → TRUE
L24c coverage: 0.9701 >= centreline_propagation_coverage_min 0.90 → TRUE
```
The daily permits/coa chain would NOT be halted. Next-run gate inputs verified in the run rows: `centreline_enrich.source_dataset_version = 80496e67…` (enrich) and `code_version=v2-building-centroid-in-parcel / building_footprints_count=427077` (link_massing) — an unchanged next run fires BOTH gates.
