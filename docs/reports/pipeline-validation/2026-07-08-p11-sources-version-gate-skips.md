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

## Acceptance chain run (measured)

_Filled in on chain completion (background monitor). This run is NOT a clean unchanged re-run — the centreline source republished (see above), so centreline ran full; the measured wall-clock therefore reflects a changed-source quarterly run, not the ~69-min unchanged case. The unchanged-case win is proven by the standalone smoke (11.2 s vs 92 min) + the massing gate read (incremental)._

<!-- STEP TABLE + WALL CLOCK inserted post-run -->
