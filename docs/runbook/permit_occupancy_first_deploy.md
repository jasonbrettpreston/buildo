# Runbook: Spec 78 Phase 1 — Permit Occupancy + Build-Norms First-Deploy Spike

**SPEC LINK:** `docs/specs/01-pipeline/78_optimal_lot_configuration.md` §Phase-1 · Spec 48 §3.7
**Steps:** `permits:load_permits` (occupancy backfill) + `permits:compute_build_norms` (NEW)
**Scripts:** `scripts/load-permits.js`, `scripts/compute-build-norms.js` · **Locks:** existing / 78
**Migrations:** `198_permits_occupancy_columns.sql`, `199_neighbourhood_build_norms.sql`

---

## 1. Spike shape (first production run after deploy)

### 1a. `load-permits` — one-time full re-hash spike
Phase 1 adds 7 occupancy columns to the **hashed** `mapRecord` output (`residential_sqm` … ). On the
first run after deploy, **every** permit's `data_hash` changes (the hash input grew), so the
`data_hash IS DISTINCT FROM` guard updates **all ~250K rows** instead of the usual small delta.

- **Expected:** `records_updated ≈ total permit count` (one-time). `records_new ≈ 0`.
- This is the documented occupancy/GFA backfill — **not** a regression. Subsequent runs return to the
  normal small delta.
- The new columns are **nullable, metadata-only ADDs** (Postgres 11+: no table rewrite). The migration
  itself is fast; the spike is the streaming UPSERT, not the DDL.
- `~37%` of permits populate `residential_sqm` (CKAN raw fill). The rest stay `NULL` — expected.

### 1b. `compute_build_norms` — first snapshot
Truncate-replace snapshot. Writes **one row per neighbourhood + exactly one citywide row**
(`neighbourhood_id IS NULL`). On a freshly-backfilled DB expect ~150–160 rows total.

- Until `load-permits` has run with the new mapping, `residential_sqm` is `NULL` everywhere → FSI /
  build-ratio / old-stock columns are `NULL` and `build_ratio_null_rate_pct` audit row reads ~100%
  (**WARN, expected pre-backfill**). **Order matters: run `load-permits` BEFORE `compute_build_norms`.**

---

## 2. Pre-flight

1. `migrate --verify` clean; migrations 198 + 199 applied (`node scripts/migrate.js`).
2. `db:generate` regenerated `src/lib/db/generated/schema.ts` against the real DB — confirm
   `residentialSqm` + `neighbourhoodBuildNorms` are present (the `npm run` wrapper does **not**
   propagate `DATABASE_URL`; run `DATABASE_URL=… npx drizzle-kit introspect` directly).
3. `compute_storey_norms` has run (build-norms joins `neighbourhood_storey_norms` for `storeys_p50/p90`).

## 3. Run order (permits chain)

```
permits: … classify_permits → link_neighbourhoods → link_parcels → link_massing
         → compute_storey_norms → compute_build_norms → …
```

`load_permits` (occupancy backfill) runs at the head of the chain as usual; `compute_build_norms` is
new, slotted immediately after `compute_storey_norms`.

## 4. Post-run verification

- `SELECT count(*) FILTER (WHERE neighbourhood_id IS NULL) FROM neighbourhood_build_norms;` → **1**.
- `SELECT count(*) FROM permits WHERE residential_sqm IS NOT NULL;` → ~37% of total (non-zero).
- `compute_build_norms` audit table: `citywide_fallback_written == 1`; `build_ratio_null_rate_pct` WARN
  clears once `residential_sqm` is backfilled (drops well below 50%).
- Spot-check a known new build (e.g. 41 Derwyn): `residential_sqm` ≈ permit GFA; its neighbourhood's
  `realized_fsi_p50` is plausible (~0.6–1.2 for low-rise residential).

## 5. Rollback

Both migrations are **comments-only DOWN** (Rule 6, single-txn runner). Manual rollback only:
`neighbourhood_build_norms` can be dropped freely (recomputed snapshot); the `permits.*_sqm` columns
are nullable and safe to leave in place (orphaned, harmless) if a partial rollback is needed.
