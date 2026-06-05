# Runbook — `load_heritage` first-deploy spike (Spec 61 §8c)

**Owner:** pipeline on-call · **Spec:** `docs/specs/01-pipeline/61_source_heritage_properties.md` §12.7 (posture per Spec 48 §3.7) · **Script:** `scripts/load-heritage.js` (advisory lock 61)

`load_heritage` is a new source loader in the `sources` chain (after `load_ravines`). Its first production run writes two brand-new tables (`heritage_properties`, `heritage_districts`) and emits an `audit_table` + `heritage_load` block the chain has never seen — so the first-run counters spike from nothing. This runbook is the pre-ack + exit criteria for that first deploy.

## Pre-deploy (baseline)

Captured 2026-06-04 from a live download + parse (post-L25 filter):

| Dataset | Raw features | Kept (post-filter) | Filtered |
|---|---|---|---|
| Heritage Register (points) | 12,320 | **8,803** (Part IV 1,549 + Part V 7,254) | 3,517 Listed |
| Heritage Conservation Districts (polygons) | 32 | **28** Designated | 4 (2 Under Appeal + 2 Under Study) |

- Run `BUILDO_TEST_DB=1 npm run test` — `migration-170-heritage.db.test.ts` + `load-heritage.{logic,infra}.test.ts` green.
- Confirm migration 170 applied (`heritage_properties`, `heritage_districts`, `fuzzystrmatch`, `normalize_address` present).

## Deploy

`node scripts/run-chain.js sources` (or the scheduled sources run). `load_heritage` runs after `load_ravines`.

## Post-deploy exit criteria (PASS to proceed)

1. **Verdict PASS** on the `load_heritage` step.
2. **Counts within bounds** (also enforced by `assert_data_bounds`):
   - `heritage_properties` ≈ 8,803 and **≥ 8,000** (catastrophic floor).
   - `heritage_districts` ≈ 28 and **≥ 20**.
3. **Audit rows** all INFO except expected: `heritage_geometry_skipped_pct = 0`, `heritage_count_drift_pct = 0` (first run, no prior baseline → 0 by design), `heritage_unknown_status_count = 0`, `heritage_unknown_hcd_type_count = 0`, `heritage_address_coerced_empty_count = 0`.
4. **Idempotent re-run**: a second run reports `records_new = 0`, `records_updated = 0` (IS DISTINCT FROM guard) — or both datasets SKIP (unchanged validators).

## Roll-back / abort triggers

- `heritage_properties < 8000` or `heritage_districts < 20` → **roll back** (CKAN dataset truncation / wrong resource); do NOT let the chain proceed to `enrich_heritage` (§8d) on a partial load.
- `heritage_geometry_skipped_pct > 5%` (L8) → the loader already aborts before any write; investigate the source geometry.
- `heritage_count_drift_pct > 50%` (L7) without `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` → loader aborts that dataset's write; verdict FAIL. Set the override only after confirming the new count is legitimate.
- `heritage_mass_delete_pct > 50%` (L7c) → set `HERITAGE_ACCEPT_MASS_DELETE=1` only for an acknowledged full reload.

## #426 source_id re-key (Folder_Row) — one-time mass-delete on the next load

The Q2 2026 CKAN refresh dropped `OBJECTID`; `parseRegister` now keys `source_id` on `Folder_Row` (`169f22a`-era loader, re-keyed in the #426 fix). The first load after the fix replaces every `heritage_properties` row (old OBJECTID-keyed rows don't match the new Folder_Row keys → orphan-DELETE removes all ~8,800, then ~8,800 new INSERT).

- **The blocker is L7c mass-delete, NOT L7 count-drift** (the kept count is ~unchanged): `mass_delete_pct = deleted/prior ≈ 1.0 > 0.5` → FAIL + write suppressed. **The override is `HERITAGE_ACCEPT_MASS_DELETE=1`** (not `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT`). (A load with NO prior `sources:load_heritage` run has `prior=null` → `mass_delete_pct=0` → no FAIL; the override is only needed when a prior run exists to compare against.)
- **Before the re-key deploy:** `CREATE TABLE heritage_properties_backup AS SELECT * FROM heritage_properties;` — rollback = restore the backup + `git revert` the parseRegister change.
- After a clean re-key load, re-run §8d `enrich_heritage` + §8e `enrich_permits`/`enrich_coa_zoning` so the parcels/permits/coa heritage feeds reflect the Q2 data.

## Notes

- The two datasets skip-check **independently** (DEC-K): one may SKIP (unchanged) while the other reloads. A SKIPPED dataset carries its prior `feature_count` + `drift_check_passed` forward (never reset to false).
- Quarterly refresh cadence (both datasets); the `heritage_dataset_age_years > 2` WARN is the staleness tripwire.
