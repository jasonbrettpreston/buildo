# Runbook — Max-build envelope first deploy (Spec 65 §4, migrations 185/186)

**What ships:** a lot-validated max-build envelope on `parcels` (mig 185) computed by a SECOND pass
in `enrich-parcels.js`, propagated to `permits` + `coa_applications` (mig 186) by `enrich-permits.js`,
plus all-INFO observability rows in both audit tables + `assert-global-coverage.js`.

## Deploy order

1. **Apply migrations 185 + 186** (`node -r dotenv/config scripts/migrate.js`) — additive,
   metadata-only adds (PG11+); the two NOT-NULL booleans default `false`.
2. **For the heritage freeze to populate, `link-massing` should have run** (the freeze reads
   `parcel_buildings`→`building_footprints`). Heritage parcels without a primary building emit
   `envelope_constraint_reason='heritage_no_massing'` — benign, self-heals once massing is linked.
3. **Run `enrich-parcels.js --full`** (or let the `sources` chain run it). First run computes the
   envelope for every valid-geom parcel — `lot_size_confidence` goes 0→N across ~486K parcels and
   the ~14 max-build INFO metrics spike 0→N (expected, NOT a regression).
4. **Run the `permits` + `coa` chains** (or `enrich-permits.js` with `ENRICH_TARGET=permits` then
   `=coa`) to propagate onto leads. `assertMaxBuildColumns` HALTs clearly if mig 185/186 is unapplied.

## First-run posture (the 0→N spike)

Every max-build metric is `INFO` (no gate) — sparse-by-design coverage (FSI ~5% → most GFA is
`coverage_box`, not `fsi`; envelope NULL on `low` lot-confidence lots). **No metric should FAIL or
WARN from this work.** The observe-chain narrative will note the 0→N jump on first run; that is the
expected first-deploy transition, not a drop.

### Expected shape (parcels, post `--full`)
- `lot_size_confidence_{high,medium,low}_count` — sums to ~the valid-geom parcel count with lot data.
  Spike data: ~98% of frontage×depth within 15% of `ST_Area(geom)`, so `high`+`medium` dominates.
- `max_buildable_footprint_count` ≈ parcels with `lot_size_confidence ∈ {high,medium}` and a buildable buffer.
- `max_buildable_gfa_basis_fsi_count` ≪ `..._coverage_box_count` (FSI sparse — expected, not a gap).
- `max_build_confidence_{high,medium,low}_count` — `high` requires real `bylaw_standard_setback_m`
  + (FSI or real height); most parcels land `medium` (zone-default setback).
- `envelope_constrained_count` — ravine + heritage + lot_too_narrow + setback_exceeds_lot lots.

## Pre-deploy estimate query
```sql
-- parcels eligible for an envelope (have geom + at least one lot-area source):
SELECT COUNT(*) FROM parcels
WHERE geom IS NOT NULL AND (lot_size_sqm IS NOT NULL OR (frontage_m IS NOT NULL AND depth_m IS NOT NULL));
```

## Re-run / refresh notes
- Incremental: the max-build pass recomputes a parcel only when `lot_size_confidence IS NULL`
  (first-time) OR its zoning was re-enriched this run. **Run `enrich-parcels.js --full` after a
  lot-dimension or massing reload** — those inputs changing without a zoning change won't otherwise
  re-trigger. `IS DISTINCT FROM` keeps a steady-state re-run at 0 writes.
- If you only see `heritage_no_massing` on heritage parcels: run `link-massing`, then `--full`.
