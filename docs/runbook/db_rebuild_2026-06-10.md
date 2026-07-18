# Runbook: Full DB Rebuild — 2026-06-10 drift recovery

> **Note (2026-07-18):** `buildo_pgdata` (Docker) remains the authoritative dev DB until the Supabase migration program's Phase 0.8 cutover (`.cursor/active_task.md`); post-cutover the local dev DB is `supabase start` — see Spec 113 §12.

**Status:** PLAN — awaiting authorization
**Domain:** Backend/Pipeline (ops/recovery — no `src/` code change)
**Context:** The persistent dev DB (`localhost:5432/buildo`, container `buildo-postgis`, named volume `buildo_pgdata`) holds only 45 of 70 expected tables and an out-of-order partial schema (ravine parcels cols present; zoning/heritage/centreline + ~25 core lead/lifecycle/cost/calibration tables absent; `logic_variables` AND `cost_estimates` + `scope_intensity_matrix` absent). The state matches no clean migration point, so incremental catch-up is unreliable. Rebuild the schema cleanly and restore the irreplaceable data. See [[feedback_db_drift_prevention]].

**END GOAL (downstream, NOT this rebuild):** improve **cost estimates**, which currently DON'T WORK. The Spec 58/59/61/62 enrichment is the FOUNDATION/inputs for that improvement — adding it will NOT by itself make cost estimates work. **This rebuild's success gate = DB to present + spec data present + existing pipeline runs clean.** Cost computation (Phase D′) is run only to confirm it executes to its current baseline, NOT as a pass/fail gate. The cost-estimate improvement is separate future work built on this foundation.

## Verified by Integration agent (a119f87c) 2026-06-10
- postgis SAFE (mig 039 `CREATE EXTENSION` before any native geom). No flag needed.
- Restore as superuser (`postgres` ✓) with `--disable-triggers` (suppresses RI + BEFORE-INSERT triggers).
- EXCLUDE from data-only restore: `schema_migrations` (ledger), PostGIS-managed (`spatial_ref_sys`, `topology`, `layer`, `pagc_*`), migration-seeded (`trades`/004,028,118,131; `product_groups`/031; `trade_mapping_rules`/005). All else → re-seeded/derived.
- Lead-layer reconstructable post-restore: re-run mig 132/133 lead_id UPDATEs + mig 143/144 lead_parcels/lead_trades mirror INSERTs.
- Post-restore: `setval` all SERIAL sequences to MAX(id); `REFRESH MATERIALIZED VIEW mv_monthly_permit_stats`.
- Phase D chains via `node scripts/run-chain.js <chain>`; specs load+enrich in `sources` chain, then `permits`+`coa`. `assert_schema` hits CKAN → needs internet. `CENTRELINE_LOCAL_ZIP` skips the 117MB download.

## Safety nets (all in place BEFORE any destructive step)
- `backups/buildo_prerebuild_2026-06-10.dump` — 327 MB custom-format dump of current data (verified readable, 57 table entries).
- Named volume `buildo_pgdata` (current live).
- Anonymous volume `8be4df…` — untouched original copy of pre-rebuild state.

## Irreplaceable data to preserve (scraped / large external)
permits (241,307), coa_applications (32,744), parcels (486,530), address_points, building_footprints, neighbourhoods, permit_parcels, ravines, trades/product_groups (+ any other of the 45 present tables with rows). The ~25 missing tables were never populated here → start empty, filled by seeds + pipeline.

## Plan

### Phase A — Pre-checks (non-destructive)
- [ ] A1. Confirm dump integrity (`pg_restore --list`) and capture current row counts for the populated tables (golden numbers to verify against after restore).
- [ ] A2. Confirm `migrate.js` establishes the `postgis` extension on a fresh DB (migration 001/early `CREATE EXTENSION IF NOT EXISTS postgis`). If NOT, add a pre-step `CREATE EXTENSION` before migrate. **[agent to verify]**
- [ ] A3. Identify any migration that adds NOT NULL / CHECK / FK / UNIQUE constraints to the POPULATED tables (permits, coa_applications, parcels, permit_parcels, address_points, building_footprints, neighbourhoods, trades, product_groups, scope tables) where the dump's old rows might violate the new constraint. **[agent — highest-risk item]**

### Phase B — Fresh schema
- [ ] B1. Terminate connections to `buildo` (`pg_terminate_backend`), `DROP DATABASE buildo`, `CREATE DATABASE buildo`.
- [ ] B2. `npm run migrate` (creds inline) → full clean schema 001→175 + `schema_migrations` ledger + auto logic-variable seeds.
- [ ] B3. `node scripts/migrate.js --verify` → 0 missing, 0 drift. Confirm 70 tables present.

### Phase C — Data restore (data-only, superuser, triggers off)
INCLUDE (restore, incl. derived to avoid re-geocode/re-link): permits, coa_applications, parcels, address_points, building_footprints, neighbourhoods, parcel_buildings, permit_parcels, permit_trades, permit_inspections, permit_history, wsib_registry, ravines, entities, entity_contacts, entity_projects, data_quality_snapshots, engine_health_snapshots, pipeline_runs, pipeline_schedules, sync_runs.
EXCLUDE: schema_migrations, spatial_ref_sys, topology, layer, pagc_gaz, pagc_lex, pagc_rules, trades, product_groups, trade_mapping_rules.
- [ ] C1. Generate dump TOC list, filter to INCLUDE set, `pg_restore -L <list> --data-only --disable-triggers --no-owner --no-privileges` as `postgres`.
- [ ] C2. Reconstruct trigger-derived lead layer (triggers were off): re-run mig 132 (`UPDATE permits SET lead_id='permit:'||…`) + mig 133 (`UPDATE coa_applications SET lead_id='coa:'||…`) + mig 143/144 mirror INSERTs (lead_trades, lead_parcels). Backfill `permits.location`/geom if needed (restored geom should carry over).
- [ ] C3. `setval` every SERIAL-PK table to MAX(id). `REFRESH MATERIALIZED VIEW mv_monthly_permit_stats`.
- [ ] C4. Verify row counts == golden (parcels 486530, permits 241307, coa 32744, permit_parcels 223598, …). Verify lead_parcels/lead_trades populated.

### Phase D — Spec enrichment (parcels already carry RAVINE enrichment via restore)
- [ ] D1. Spec 58 zoning: `load-zoning.js` (CKAN, 10 tables) → `enrich-parcels.js` (parcels zoning + overlays).
- [ ] D2. Spec 61 heritage: `load-heritage.js` (CKAN) → `enrich-heritage.js` (parcels).
- [ ] D3. Spec 62 centreline: `load-centreline.js` (CKAN or `CENTRELINE_LOCAL_ZIP`) → `enrich-centreline.js` (parcels corner/through/frontage).
- [ ] D4. (Ravine already enriched on parcels via restore; optionally refresh `load-ravines`+`enrich-ravines`.) 
- [ ] D5. Propagate to leads: `enrich-permits.js` ENRICH_TARGET=permits, then =coa → writes zoning+ravine+heritage onto permits + coa_applications. (Centreline propagation = §8e, the NEXT task — not part of this rebuild.)
- [ ] D6. Verify spec cols populated on parcels + permits + coa.

### Phase D′ — Cost estimates (the END GOAL)
- [ ] D′1. Confirm `scope_intensity_matrix` (mig 163) seeded + the cost-model inputs present.
- [ ] D′2. Run `compute-cost-estimates.js` (permits) + `compute-coa-cost-estimates.js` (coa).
- [ ] D′3. Verify `cost_estimates` populates with sane values — the success criterion. Run `src/tests/cost-estimates.infra.test.ts` + the cost regression tests on this branch.

### Phase E — Close-out
- [ ] E1. `migrate --verify` green; `node scripts/ai-env-check.mjs` clean (DB in sync).
- [ ] E2. Confirm §8e prerequisites exist + populated: `lead_parcels`, `permit_type_classifications`, parcels centreline cols.
- [ ] E3. Remove temp `scripts/reconcile-ledger.mjs`. Update [[project_spec62_centreline]] + [[feedback_db_drift_prevention]] memory. Proceed to §8e (`.cursor/active_task.md`).

## Rollback
If Phase B/C fails irrecoverably: `DROP DATABASE buildo; CREATE DATABASE buildo;` then `pg_restore` the FULL dump (schema+data) to return to the exact pre-rebuild state. The anonymous volume `8be4df…` is a second fallback (recreate container against it).

## Known risks
- Old data violating constraints added by later migrations (A3) — primary risk.
- `postgis`/extension setup on fresh DB (A2).
- Phase D external downloads (CKAN) slow/flaky — centreline loader already hardened (retry + `CENTRELINE_LOCAL_ZIP`).
