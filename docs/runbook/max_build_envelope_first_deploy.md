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
- `max_buildable_gfa_basis_coverage_only_count` — WF3 Phase 1 D-C: parcels whose width/length fell
  below the `max_build_min_dimension_m` floor (default 3 m); dims NULL, envelope = coverage cap only
  (the degenerate box + buffer are excluded). `ravine_constrained_count` is the ravine sub-floor
  residual: the WHOLE envelope withheld (no coverage fallback — it is ravine-blind).
  `max_build_box_excluded_count` counts emitted parcels where the clamp NULLed a positive raw dim.
- `max_build_confidence_{high,medium,low}_count` — `high` requires real `bylaw_standard_setback_m`
  + (FSI or real height); most parcels land `medium` (zone-default setback).
- `envelope_constrained_count` — ravine (+ ravine_constrained) + heritage + lot_too_narrow + setback_exceeds_lot lots.

## Phase 1 rollback / cloud-abort (WF3 2026-08, D-A/D-C/D-D geometry fixes — DS-5)

Written BEFORE any cloud action, per the Phase 1 plan.

- **Rollback anchor:** `b4351297` (pre-Phase-1). Every envelope/optconfig/cost value is fully DERIVED
  — rolling back is `git checkout <anchor> -- scripts/ && node scripts/enrich-parcels.js --full &&
  node scripts/compute-parcel-cost-estimates.js` (then the step-10 propagation trio). No data is
  lost by either direction; the write path is `IS DISTINCT FROM`-guarded and idempotent.
- **Migration 239 rollback:** manual only (DOWN is all-comments per the migration-runner lesson):
  `DELETE FROM logic_variables WHERE variable_key = 'max_build_min_dimension_m';` AND revert the
  seed-JSON entry + `EXPECTED_LOGIC_VAR_KEYS` row in the same change, or a fresh DB will disagree.
  With the row absent, enrich falls back to the code default (3.0) — deleting the row alone does
  NOT disable the clamp; that requires the code rollback above.
- **Cloud apply order:** 238 rides first if still pending, then 239 — both are guarded/idempotent;
  `migrate.js` halting on 238 prevents 239 (expected, safe). A re-apply changes 0 rows.
- **Cloud abort mid-re-run:** an interrupted `--full` leaves a MIXED old/new envelope state (the txn
  boundary is per-pass, and optconfig streams post-commit). Recovery is ALWAYS re-running from the
  top (idempotent) — never partial manual patching. Between abort and re-run, the D-E
  `ravine_constrained_carries_priced_cost` gate stays quiet (the class doesn't exist until the
  enrich pass writes it) and `max_build_dim_below_floor` may show the old residual — expected.
- **Docker-buildo ledger drift (Schema-Fidelity flag, 2026-08-07):** the legacy Docker `buildo` data
  DB carries migration 239's EFFECTS (seed row present, applied via direct UP) but its
  `schema_migrations` ledger stops at 225 — it cannot run Supabase-era migrations (226+ need the
  `auth` schema). Any tooling diffing "applied vs directory" against Docker will report 226–239
  unapplied; do NOT "fix" it by replaying those migrations there. 239 itself is re-apply-safe
  (`ON CONFLICT DO NOTHING`).
- **Interleaving pins (R3-M7):** `chain-sources` stays `disabled_manually` until the step-14 verify
  completes (remember: re-enabling needs the GitHub UI toggle AND the cron text — repo-invisible
  state); nothing lands between the WF6 push and the cloud apply; no cloud incremental enrich runs
  in the window.

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
