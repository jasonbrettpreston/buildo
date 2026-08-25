# QUEUED: Optimal Lot Configuration — Phase 3 (Enrich Pass + New Fields)
**Status:** Queued (after Phase 2) · **Workflow:** WF1 · **Domain:** Backend/Pipeline · **Spec 78**
**Open items RESOLVED below** (through-lot, overlays, imagery rename + cost-model lockstep, comp-kNN, suite-fit envelope).

## Goal
`scripts/enrich-parcels.js` — a new optimal-config UPDATE pass (4th disjoint pass) writing the field-spec §A–§K new fields, consuming `optimal-config.js` (Phase 2) + `neighbourhood_build_norms` (Phase 1). Plus the degrade/retire/rebuild dispositions. Parcels migration (nullable adds + the comp index as a separate CONCURRENTLY/non-transactional migration).

## Resolved open items
1. **Through-lot suite guard (live bug fix):** add `is_through_lot` to the accessory CTE — `rear_yard_depth` uses the through-lot rear setback (= adjacent front-yard setback facing the rear street, by-law); `garden_fits`/`laneway_fits`/`rear_suite_permission` exclude through lots unless the through-lot rear rules are met. (Currently `enrich-parcels.js:522-528` ignores `is_through_lot` → phantom rear yard.)
2. **Overlay consumption (review #6):**
   - `zoning_holding = 'H'` → development suspended → `opt_binding_constraint='holding'`, as-of-right gated to `coa_required`-equivalent, lower confidence.
   - `in_building_setback_overlay` → fold its (larger) front/flankage setback into the max-build setback math (read the overlay's setback; if not modelled, flag confidence).
   - `exception_number IS NOT NULL` → site-specific exception may raise/lower FSI/height/setback → mark envelope `opt_config_confidence` lower (exception text not parsed).
3. **Imagery rename — LOCKSTEP migration (review B-4):** `RENAME COLUMN existing_footprint_sqm → imagery_roof_footprint_sqm` + `existing_gfa_sqm → imagery_roof_gfa_sqm` on **parcels + permits + coa_applications** in ONE migration; update `EXISTING_COLS` in `max-build.js` (array drives propagation + orphan-nullify); **in the SAME change** update `ARCHETYPE_GEOM_BASIS` (`src/lib/classification/archetypes.ts` ADD/BAS→`cur_floor`, INT→`cur_pot_2story`) + `assert-global-coverage.js` coverage rows, or ADD/BAS/INT cost estimates go NULL across 486K. Regression-lock the cost-model geom_basis read.
4. **Comp-kNN query (review B-5):** materialize a `permit_comp_candidates` set ONCE (permitted parcels only); per residential subject, `ORDER BY geom <-> subject.geom LIMIT ~50` (kNN over-fetch via GiST) → post-filter zoning + lot/frontage ±20% → re-rank similarity → top 10; EXCLUDE `build_ratio > 1.1` and decrement `comp_count`. NOT a 486K `ST_DWithin` cross-join. Index `(zoning_class, lot_size_sqm)` CONCURRENTLY (separate non-transactional migration). Stream subjects.
5. **Suite-fit envelope = the CURRENT building** (conservative, §P): open-pocket on `lot − existing_building`; `rear_yard_depth` behind the existing house, not the as-of-right envelope. (Avoids the optimistic over-offer.)
6. **§G current range** = `max_build_gfa × nbhd_existing_build_ratio_p25/p50` (old-stock ≈0.62), capped at max-build, NULL→citywide→0.62 fallback (`cur_gfa_range_basis='fallback'`).
7. **Kitchen/bath** = `cur_gfa × nbhd_reno_kitchen/bath_pct` (scope-classified KIT/BTH); **solar** sized from footprint.

## New fields (field-spec §A–§K) + dispositions (§L degrade / §M retire / REBUILD suite-garage)
Per the field spec. Garage capacity floor ≥1 (Phase-0). Suite sizing per the Phase-2 by-law constants.

## DB Impact: YES
- `parcels` nullable ADDs (opt_*, cur_gfa_low/high, resolved_*, position, nbhd_*, comparable_builds jsonb, etc.) — metadata-only.
- `RENAME COLUMN` ×3 tables (lockstep with EXISTING_COLS + ARCHETYPE_GEOM_BASIS + asserts).
- Comp index `(zoning_class, lot_size_sqm)` — **separate CONCURRENTLY non-transactional migration**.
- UP+DOWN, db:generate, factories, typecheck.

## Tests
enrich-parcels optimal-config db-test (through-lot→no-suite, holding→gated, suite-fit vs current building, §G old-stock range, comp-kNN top-10 + exclusion); regression locks: cost-model geom_basis still reads (rename), dedup no-ping-pong (Phase 1), Derwyn ground-truth (41/43/45 suite + 39 garage + footprint).

## Spec refs: 47/48 (pass observability), 65 (degrade/retire), 62 (through/corner), 59/61 (ravine/heritage), 83 (cost-model geom_basis lockstep).
