# Active Task: Pilot 9 — convert `enrich_parcels` to the Spec 122 step standard (ENRICHER, the last archetype)
**Status:** Implementation (AUTHORIZED 2026-09-04; folds A-G applied; Asks 1-9 ruled per Fold G — Ask 9 INFO-only per Spec 65 §4 MB-5)

## Context

* **Goal:** Convert `scripts/enrich-parcels.js` (2,391 lines, 5 passes) from `pipeline.run(...)` to a `enrich-parcels.descriptor.json` + `scripts/lib/compute/enrich-parcels.js` pair per Spec 122's step standard, via the nine-commit procedure (Spec 123 §7 as amended at `39313d92`). ENRICHER is the **8th and last unproven archetype** — `template-freeze.json`'s `archetype_profiles` row reads `{shapes: [], runners: [], first_step: null, proven: false}`, the ONLY false row of eight. `frozen_after_pilot: 9` (operator ruling, Spec 122 `:1174`): the template freeze is DECLARED after this pilot, gated on programme item `STD-7` (`status: PARTIAL`, `owner.ref: "pilot9_enrich_parcels"`, `gate.blocks: ["batching"]`) which this pilot alone can close.
* **Archetype fit — what this pilot must prove (five things, all first-time):**
  1. **A 5-pass step fits `pipeline.step()` at all.** Passes 1–4 are set-based SQL inside ONE `pipeline.withTransaction` (`:2032`); pass 5 streams on a **separate connection AFTER that transaction COMMITs** (Spec 78 §P3A.1 — a same-txn read would be invisible). No `phase_order` in `template-freeze.json` expresses a post-commit second phase. **Answer: a new `runEnrichPhase` runner + a new `execution.shape: "enrich"` — see Asks 1/2.**
  2. **`execution.shape` is `x-frozen: true` over 8 values** (`step.schema.json:1175`), none of which is ENRICHER-shaped. **A schema bump IS required** — and `template-freeze.json`'s own `does_not_freeze` clause makes the price explicit: the same commit must carry the `x-ruling` (Rule 1 G-1 ratchet, `generate-schema-baseline.mjs --check`), `generate-template-freeze.mjs --refresh`, and a Spec 122 §8 amendment.
  3. **Invalidator expressibility (claim #54).** The ENRICHER `x-profile` (`step.schema.json:1678-1693`) refuses any `staleness.scope` outside `{"all","none"}` unless `outputs.invalidates` has `minItems: 1`. Passes 1–3's lineage predicates ARE invalidated (mig 242's `trg_parcels_geom_invalidation`, verified live). **Pass 4's `comp_count IS NULL` is NOT** — Spec 78 §P3C.1 names it a "standing limitation" in prose. So #54 makes a REAL, currently-shipped gap unexpressible on its first contact with the schema. That is the archetype's headline result, and Ask 3.
  4. **Scope-defer** (`computeDeferScope` `:1777`, `enrich_parcels_defer_threshold_rows`, `enrich_parcels_pass3_scope` mig 240) — the only LOGGED recovery ledger in the estate (Spec 122 §3.0b) — has no analogue in any converted step.
  5. **The stall instrumentation moves from legacy script into descriptor/library.** `.cursor/wf3_enrich_parcels_cloud_stall_active_task.md` STEP 2.5 filed four items as **pilot-9 deliverables**: whole-step ticker (its 1.4 landed pass-5-only), passes-1–4 heartbeat (1.4, not landed), `stall_probe` naming + the INFO/WARN counter pair (1.5 landed as `records_meta.stall_diagnostic`, no counters), and a declared pass-timeout terminal. ⚠️ **Its 1.6 ("`passDurationsMs` never emitted") is STALE** — the five `enrich_parcels_passN_duration_ms` INFO rows ARE emitted at `:2247-2251` (re-executed this session; the same staleness class as lesson LDG-4).
* **Target Spec:** **Spec 122** (`docs/specs/01-pipeline/122_pipeline_step_optimization.md` — the standard) **+ Spec 55** (`55_source_parcels.md` — the `parcels` table SoT) **+ Spec 65** (`65_enrich_parcels.md` — this step's own behavioural spec, §2/§3 zoning · §4 max-build · §5 existing-structure · §6 scenarios · §7 accessory · §8 storey norms). Governing procedure: Spec 123 §7 · policy: Spec 124 Rules 1–13. **Finding — two of five passes write fields NEITHER 55 nor 65 defines:** pass 4 (`comparable_builds`/`comp_*`) and pass 5 (`opt_*`/`optimal_config`/`nearby_builds_summary`) are defined by **Spec 78** (`78_optimal_lot_configuration.md` §Phase-3A/§Phase-3C, grep-confirmed: `opt_aor_gfa_sqm` and `comparable_builds` appear in 78/88/89/100/01_database_schema, never in 55 or 65). Spec 65's own §6 Target Files list does not name them either. **Outside the operator-named governing set — G0 must add Spec 78 to the Target Spec line, or Spec 65 must absorb §Phase-3A/3C (Ask 6).**
* **Domain Mode:** Backend/Pipeline (`scripts/`). `scripts/CLAUDE.md` read this session. **Cross-Domain for the P5(d) admin stats reaper edit** (`src/app/api/admin/stats/route.ts` + the extracted `src/lib/admin/reap-stale-runs.ts`) — `.claude/domain-crossdomain.md` read (pilot 9 commit 8 P7, 2026-09-08). Closest fit is **Scenario A** (Admin UI + API Route, Same Admin-Only Feature) even though this peel has no literal UI component — the one rule that concretely applied: **"4. Both pre-commit gauntlets apply to their respective files."** In practice this repo runs ONE unified husky gauntlet (typecheck+lint+test) rather than separate Admin/Backend gauntlets, so "both apply" meant the SAME full-suite gate already covered both the route.ts change and the new `src/lib/admin/` file — verified together in commit 8 P5's own hook run (419 files / 10145 tests green), not two separate passes.
* **Key files (verified):** `scripts/enrich-parcels.js` (2,391 lines; `ADVISORY_LOCK_ID = 65` `:74`; `pipeline.run('enrich-parcels', main)` `:2343`) · `scripts/lib/max-build.js` · `scripts/lib/zoning-precedence.js` · `scripts/lib/optimal-config.js` · `scripts/lib/build-norms.js` · `scripts/manifest.json` (`scripts.enrich_parcels`, `chain_args.sources: ["--full"]`, `supports_full: true`, `supports_dry_run: false`) · `scripts/steps/_schema/step.schema.json` (`:1175` frozen shape enum, `:1678-1693` ENRICHER x-profile) · `scripts/steps/_schema/template-freeze.json` (`frozen_after_pilot: 9`) · `scripts/steps/_schema/converted.json` (8 entries, `enrich-parcels.js` absent) · `scripts/steps/_schema/programme-items.json` (`STD-7`, `FREEZE-1`) · `scripts/seeds/logic_variables.json:4210-4247` · 13 dedicated `src/tests/db/enrich-parcels-*.db.test.ts` files · exemplars: `link-parcels.descriptor.json` (multi-target ordered writes), `refresh-snapshot.descriptor.json` (newest, RECORDER).

## The 5-pass map (measured this session; governing spec per pass)

| # | Function / lines | Writes (table.columns) | Governing spec | Write class (§3.0b) | Guard | Batching / txn |
|---|---|---|---|---|---|---|
| **1** zoning | `enrichParcels` `:422`; SQL `:222`, temp `:294`, UPDATE `:375` | `parcels` — 36 zoning cols (`zoning_class`, `bylaw_max_*`, 7 overlay bools, `zoning_overlays` jsonb, `zoning_base_source_*`, `zoning_is_ambiguous`, `zoning_enriched_at`) | **Spec 65 §2 table** (mig 165), Spec 58 producer contract | **I** `temp_materialize` | `IS DISTINCT FROM` over every column (Spec 65 §2 Implementation step 5) | `CREATE TEMP TABLE parcel_zoning_enrich ON COMMIT DROP`; single `UPDATE…FROM`; shared txn |
| **2** max-build | `enrichMaxBuild` `:836`; SQL `:468`, temp `:501`, UPDATE `:814` + stamp `:831` | `parcels` — 29 `MAX_BUILD_COLS` (`max_buildable_footprint_sqm`, `max_build_width/length_m`, `max_build_stories(_basis/_aggressive)`, `max_buildable_gfa_sqm(_basis)`, `lot_size_confidence`, `envelope_constraint_reason`, `garage_*`, `rear_suite_*`, `garden_suite_*`, `neighbourhood_id`, `neighbourhood_cost_premium`) **+ `massing_enriched_at`** | **Spec 65 §4 (MB-1…MB-8), §7 (AF-1…AF-8), §8 (C2)** (migs 185/189/191/196) | **I** `temp_materialize` | `IS DISTINCT FROM ×29` `:812`. ⚠️ **the `massing_enriched_at` stamp `:831-833` is deliberately UNGUARDED** (documented `:824-828`) — a second class-G target | `CREATE TEMP TABLE parcel_max_build ON COMMIT DROP`; shared txn. **Dominant cost: 46.7 / 48.3 min measured on two real cloud runs** |
| **3** existing-structure + scenarios | `enrichExistingStructure` `:1045`; SQL `:909`, temp `:922`, UPDATEs `:1017` + `:1035` | `parcels` — 11 `EXISTING_COLS` (`imagery_roof_footprint_sqm`, `existing_width/length_m`, `existing_other_structures_*`, `existing_greenspace_sqm`, `existing_structure_confidence`, `existing_data_quality_flag`) + 10 `SCENARIO_COLS` (`cur_floor/pot_2story/pot_3story_gfa_sqm`, `cur_gfa_range_basis`, `max_newbuild_coa_gfa_sqm`, `cur_est_kitchen/bath_gfa_sqm`, …) | **Spec 65 §5 (ES-1…ES-6), §6 (SC-1…SC-7)** (migs 187/189/193/194) | **I** `temp_materialize` (two sibling UPDATEs off one temp table) | `IS DISTINCT FROM`, `ROUND(…,2)` for idempotency (ES-2) | `CREATE TEMP TABLE parcel_existing_struct ON COMMIT DROP`; shared txn; scope-deferred rows spooled to `enrich_parcels_pass3_scope` `:2078` |
| **4** comparable-builds kNN | `enrichComparableBuilds` `:1202`; cand `:1102/:1107`, UPDATE `:1146`, resets `:1213/:1220/:1229` | `parcels.comparable_builds` (jsonb), `comp_count`, `comp_dominant_build`, `comp_build_ratio_p50`, `comp_fsi_p50` | ⚠️ **Spec 78 §Phase-3C** (mig 202) — **NOT in 55 or 65** | **G/H hybrid — scoped but UNGUARDED** (see B4.5 below) | ⛔ **NONE.** `WHERE p.id = agg.id` only | `CREATE TEMP TABLE comp_cand ON COMMIT DROP` + GiST kNN LATERAL; shared txn. **Clock-relative gate `:1114`: `AND pr.issued_date >= (now()::date - interval '5 years')`** |
| **5** optimal-config | `enrichOptimalConfig` `:1644`; select `:1261`, flush `:1421/:1447`, reset `:1662` | `parcels` — 11 `OPTCFG_WRITE_COLS` (`opt_aor_storeys/gfa_sqm/units`, `opt_coa_storeys/gfa_sqm`, `opt_suite_type`, `opt_suite_fits_full`, `opt_binding_constraint`, `opt_config_confidence`, `optimal_config` jsonb, `nearby_builds_summary` jsonb) + `enrich_parcels_pass3_scope.consumed_at` | ⚠️ **Spec 78 §Phase-3A** (mig 204) — **NOT in 55 or 65** | **K** `derived_recompute` (batched `UPDATE…FROM (VALUES …)`) | `IS DISTINCT FROM ×10` `:1445` **OR** `nearby_changed` `:1454` — ⚠️ **the OR makes the guard effectively inert**: the file's own docblock `:1403-1411` records `nearby_builds_summary` differing on **88,575 / 88,575 rows every run** | `pipeline.streamQuery(batchSize: 200)`, flush 500/batch, **separate connection, AFTER COMMIT**. Heartbeat `:1543`, ticker `:1620`, diagnostic `:1579` |

**B4.5 — MEASURED, still live (2026-09-04).** `buildComparableBuildsUpdateSql` (`:1143`) has no `IS DISTINCT FROM`. Under `--full` — which `manifest.json` makes the **only** cloud mode (`chain_args.sources: ["--full"]`) — the incremental clause `AND sp.comp_count IS NULL` is empty, so every eligible parcel with ≥1 comp is rewritten. Live cloud: **354,679 parcels carry a non-null `comparable_builds`**; the file's own docblock `:1820-1829` says "~352K rows touched every run". ⚠️ **That docblock is true only of `--full`, and the incremental half hides a second, opposite defect:** the zero-fill `UPDATE parcels SET comp_count = 0 WHERE … comp_count IS NULL` (`:1229`) empties the `comp_count IS NULL` incremental predicate after the first run, so on an incremental run pass 4 touches ~0 rows — meaning **the rolling 5-year comps window at `:1114` NEVER refreshes except under `--full`** (Spec 78 §P3C.1's "standing limitation", now measured, not merely prose). Both halves feed **Ask 4** and ledger `EP-D1`.

⚠️ **Three further unguarded writes (Fold E1 adds `zoning_enriched_at`)**, both intentional-by-comment and both needing a `guard_why` + `grandfathered.json` entry (Rule 9): `massing_enriched_at` (`:831`) and the `--full`-only comp blanket reset (`:1220`).

## Database Impact — **NO new migration**

Every column, key and write target is unchanged; only the *declaration* changes. Measured live on the **cloud** DB (`current_database()='postgres'`, PG 17.6, `auth`+`storage` schemas present, `COUNT(*) FROM schema_migrations = 242`):

| Table | Rows | Note |
|---|---|---|
| `parcels` | **486,530** (all with non-null `geom`) | the sole enriched write target across all 5 passes |
| `parcels.comparable_builds` non-null | **354,679** | B4.5's blast radius; jsonb column, not a table (`comparable_builds` is not a relation) |
| `enrich_parcels_pass3_scope` | **0** | mig 240, LOGGED by design; empty = no deferred scope outstanding |

`converted.json`, `grandfathered.json`, `programme-items.json` and `template-freeze.json` are the only DB-adjacent artifacts touched (metadata, not schema). ⚠️ **Cloud prereq:** no new `logic_variables` rows are *required*, but Ask 5's externalizations would add up to 7 — if adopted, `scripts/seeds/apply-logic-variables.js` MUST run on cloud before cutover (the LM-D15 precedent).

## Every DML/DDL statement enumerated (LP-D10 per-statement disposition)

**27 statements**, full enumeration executed. **Zero DELETEs, zero TRUNCATEs, zero DDL against a permanent table.** Three tables written: `parcels`, `enrich_parcels_pass3_scope`, `pipeline_runs`.

| # | Line(s) | Statement | Target | Disposition |
|---|---|---|---|---|
| 1–8 | `:424/:425`, `:839/:840`, `:1047/:1048`, `:1107` (+ `:1138` GiST index, `:1139` ANALYZE) | 4 × `DROP TABLE IF EXISTS` + `CREATE TEMP TABLE … ON COMMIT DROP AS` | temp | CONTRACT — the §3c "set-based join CTE, never correlated `EXISTS`" performance fence (`lessons.md`:33) and Spec 78 §P3C.1 (>90 s → ~11 s) |
| 9 | `:375` (exec `:443`) | pass 1 UPDATE, 35 cols + `zoning_enriched_at` (stamp deliberately OUTSIDE the guard, `:122-123`) | `parcels` | CONTRACT, guarded ×35 |
| 10 | `:814` (exec `:893`) | pass 2 UPDATE, 29 cols | `parcels` | CONTRACT, guarded ×29 |
| 11 | `:831` (exec `:897`) | `massing_enriched_at` stamp | `parcels` | ⛔ **UNGUARDED by design** (`:824-828`) — needs `guard_why` + Rule 9 grandfather |
| 12–13 | `:1017`, `:1035` (exec `:1068`, `:1069`) | pass 3 EXISTING (11) + SCENARIO (10) UPDATEs | `parcels` | CONTRACT, guarded ×11 / ×10 |
| 14 | `:1213` (exec `:1212`) | comps ineligibility reset | `parcels` | CONTRACT — the "gated pass never revisits a row that loses its gate" fix (`lessons.md`:31) |
| 15 | `:1220` | `--full`-only comp blanket reset | `parcels` | ⛔ **UNGUARDED** |
| 16 | `:1146` (exec `:1225`) | pass 4 comps UPDATE | `parcels` | ⛔ **UNGUARDED — B4.5, `EP-D1`, Ask 4** |
| 17 | `:1229` (exec `:1228`) | `comp_count = 0` zero-fill | `parcels` | ⚠️ CONTRACT-with-a-consequence — it is what makes the incremental comps refresh a no-op |
| 18–19 | `:2047`, `:2048` | `SET LOCAL statement_timeout` / `lock_timeout` (only when >0) | txn | CONTRACT — the WF3 bounded-terminal fence; **scoped to passes 1–4 only** |
| 20 | `:2078` (exec `:2077`) | `INSERT INTO enrich_parcels_pass3_scope … ON CONFLICT DO NOTHING` | `enrich_parcels_pass3_scope` | CONTRACT — scope-defer ledger (mig 240) |
| 21 | `:1662` (exec `:1661`) | pass 5 ineligibility reset (11 cols → NULL) | `parcels` | CONTRACT — Spec 78 §P3A.1 |
| 22 | `:1447` (exec `:1464`) | pass 5 batched `WITH incoming(…) AS (VALUES …) … UPDATE` | `parcels` | CONTRACT — guard present but inert (see pass map) |
| 23–24 | `:1742`, `:1514` | `enrich_parcels_pass3_scope.consumed_at` bulk + per-parcel flip | `enrich_parcels_pass3_scope` | CONTRACT |
| 25–26 | `:1547`, `:1593` | heartbeat + stall-diagnostic `pipeline_runs.records_meta` UPDATEs | `pipeline_runs` | ⚠️ CONTRACT, but **`pipeline_runs` is ABSENT from `emitMeta`'s write map** (`:2327-2332`) — a producer/consumer contract gap, ledger `EP-D5` |
| 27 | `:1138`/`:1139` | `CREATE INDEX comp_cand_gix` / `ANALYZE` | temp | CONTRACT |

Also enumerated at commit 1: **44 `.query(` sites** · **13 raw `IS DISTINCT FROM`, of which 7 are executable** (`:373`, `:812`, `:1015`, `:1033`, `:1268`, `:1445`, `:1454`) and 6 comment-only — the comment/code split is itself the LW-D10 "a declared tunable is a runtime read, not a text mention" hazard · 6 `try {` / 5 `catch` / 2 `.catch(` / 1 `finally` · 1 `process.env` (`ENRICH_PARCELS_FORCE_FULL === '1'`, `:1876`) · **96 `auditRows.push` sites (Fold D1; branch-trace before PH-0)** in the normal path of which **only 3 can ever be non-INFO on the value axis** (`parcels_with_zone_class_pct` `:2109`, `opt_config_engine_errors` `:2230`, `opt_aor_without_max_gfa` `:2243`) · a hand-rolled `verdictCascade` `:1799` (⚠️ **Rule 10** — must route through `verdict.js#deriveVerdict`; the `checkVerdictSingleSource` corpus does not yet see this file) · `records_updated` is the **distinct union of passes 1/2/3/5's returned ids and DELIBERATELY EXCLUDES pass 4** (`computeAggregateRecordsUpdated` `:1834`, docblock `:1820-1829`) — a §11 counter-scoping decision that must survive conversion verbatim · **three spellings of the slug in one file**: `pipeline.run('enrich-parcels')` `:2343`, `PIPELINE_NAME='sources:enrich_parcels'` `:75` (**declared and never referenced — dead**), `DEFER_STEP_SLUG='enrich_parcels'` `:91` (what the defer marker emits) — ledger `EP-D6`.

## P4 tunable inventory (Rule 3 / R-G)

**25 declared** in `LOGIC_VARS_SCHEMA` (`:19-62`, `.strict()`; resolved `:1885-1912`, parsed `:1913` — throws on failure), each already Zod-bounded and traceable to a spec: `road_overlay_distance_m` (Spec 65 §2 Implementation ¶7) · `reno_coa_uplift_pct`/`reno_kitchen_gfa_pct`/`reno_bath_gfa_pct`/`storey_height_m` (§6 SC-3) · `mislink_footprint_lot_tol` (§5 ES-6.2) · `max_build_min_dimension_m` (§4 MB-3, D-C floor) · the 14 accessory keys (§7 AF-7) · `enrich_parcels_defer_threshold_rows` (Spec 122 §3.0b) · the 3 WF3 stall keys (`_heartbeat_minutes`, `_pass_statement_timeout_minutes`, `_lock_timeout_ms`, seeds `:4210-4247`). All are write-affecting → `on_invalid: "fail"` per R-G, matching the current hard-throw on Zod failure.

⚠️ **11 undeclared literals — Rule 3 exposures.** Seven in pass 4 (`:1088-1098`, `:1114`): `COMP_LOT_TOL = 0.2` · `COMP_KNN_OVERFETCH = 50` · `COMP_TOP_N = 10` · `COMP_OVER_CAPTURE_CLAMP = 1.1` · `COMP_FSI_MIN_PLAUSIBLE = 0.05` · `COMP_FSI_MAX_PLAUSIBLE = 8` · the `interval '5 years'` comps window. Each has a stated bound in Spec 78 §P3C.2 (±20%, 50, 10, >1.1, [0.05, 8]) — the *rule* is written down and the *value* is a literal, exactly Rule 3's target. Four more elsewhere: `OPTCFG_BATCH = 500` (`:1251`) · `streamQuery batchSize: 200` (`:1692`) · the bbox divisor `78000` (`:246`) · the 95/90 `zonePct` gate thresholds (`:2109`) — the last is verdict-affecting, so R-G makes `on_invalid:"fail"` mandatory once declared, and Spec 65 §3a states the bound. **Ask 5.** Separately, `scripts/lib/max-build.js`'s `SETBACK_DEFAULTS`/`COVERAGE_DEFAULTS`/`RAVINE_SETBACK_M` are named by Spec 65 MB-3/MB-4 as a *tracked follow-up* ("full logic_variables externalization … is a tracked follow-up") — that pre-existing deferral is honoured, not reopened here.

## Reality-Check plan-altitude requirements (bounds from Specs 65/78, not invented)

Every bound below is quoted from a spec; none is this plan's invention. Each becomes a descriptor `plausibility[]` or `invariants[]` row with its citation in `why`.

| Field(s) | Plausibility bound | Source |
|---|---|---|
| `zoning_dominant_area_share` | ∈ [0, 1]; `zoning_is_ambiguous ⟺ share < 0.60` | 65 §3c SRID guard; `_contracts.json` `zoning_ambiguous_dominant_share_max` |
| `parcels_with_zone_class_pct` | **PASS ≥95 / WARN 90–95 / FAIL <90** — the ONE hard gate | 65 §3a (live 96.8%) |
| `bylaw_max_fsi` | residential `zn_zone LIKE 'R%'` source rows with `fsi_max > 10` nulled pre-aggregation (RD/RS/RM ≤ ~2, RA ≤ ~8-10) | 65 §3 DEC-1 note, B2 guard |
| `max_build_width/length_m` | per-axis ≥ `max_build_min_dimension_m` (3.0) else NULL; buffer term ≥ minDim² | 65 §4 MB-3 (D-C) |
| height ÷ storeys | **asymmetric, zone-aware**: < 2.5 m/storey = bug; high = INFO (genuine low-density) | 65 §3c height-overlay weld |
| `max_build_width ≤ frontage_m`, `max_build_length ≤ depth_m` | the `max_build_dim_exceeds_lot_dim` invariant | 65 §3c wrong-axis setback (D-A) |
| primary footprint ÷ `lot_size_sqm` | ≤ `1 + mislink_footprint_lot_tol` (0.05) — else NULL the whole existing structure | 65 §5 ES-6.2 + §4 MB-5 heritage mislink |
| `lot_size_sqm` | envelope emitted only when confidence ∈ {high, medium}; <50 → `lot_too_small`, >2000 → `lot_too_large` (buildable, unmodelled) | 65 §4 MB-2 |
| `comp_build_ratio_p50` | comps with `build_ratio > 1.1` kept in the array, EXCLUDED from the p50 | 78 §P3C.2 |
| `comp_fsi_p50` | new-build comps only, `permit_fsi ∈ [0.05, 8]`; post-fix median 0.695 ≈ `realized_fsi_p50` 0.696 | 78 §P3C.2 |
| `opt_aor_gfa_sqm` | as-of-right may never exceed the max-build envelope (`opt_aor_envelope_capped_count`) | 78 §P2 |

**Cross-field invariants:** `envelope_constrained ⟹ envelope_constraint_reason IS NOT NULL` · `max_buildable_gfa_basis = 'heritage_existing' ⟹ no FSI cap applied` (65 MB-5) · `rear_suite_type` is laneway ⊕ garden, never both (65 AF-4) · the 20% all-ancillary cap is SHARED across suite+garage (78 §P2) · `max_buildable_footprint_sqm IS NULL ⟹ opt_* reset` (78 §P3A.1; `lessons.md`:31). **Audit-row counts for every cap/drop/default** (all already emitted, to be re-declared as `checks[]`): `zoning_fsi_source_nulled_count`, `max_build_coverage_defaulted_count`/`_binding_count`, `max_build_box_excluded_count`, `heritage_mislink_footprint_count`, `ravine_constrained_count`, `opt_aor_envelope_capped_count`, `opt_config_reset_ineligible_count`, `opt_config_engine_errors` (**gated `== 0`, else FAIL** — 78 §P3A.4).

## Gate ledger (measured, pre-conversion)

G0 NOT STARTED (Target Spec line blocked on Ask 6 — Spec 78) · **G1 measured this session: 35 revisions, 20 `fix(` = 57% fix density, the highest of any pilot** · G2 from the batch churn×complexity table · G3 NOT STARTED (top-right quadrant + fence>0 ⇒ full PH-3 owed) · G4 class **A** · G5 NOT STARTED · G6 NOT STARTED · G7 NOT STARTED (13 dedicated `db.test.ts` files to convert) · G8 NOT STARTED · G9 N/A. Ship bar ≥14/17 with G6/G7/G8 full.

## Commit ledger — the nine commits (Spec 123 §7 as amended)

| # | Phase | Deliverable | Done-test |
|---|---|---|---|
| 1 | PH-0 boundary freeze | Target Spec line filled from `00_system_map.md`'s owner row FIRST (verify one exists for `enrich-parcels.js`; add if absent) then 122/55/65 **+ 78 per Ask 6**; the 17-statement DML table, 44 query sites, all audit rows and exit codes enumerated; the stale WF3 1.6 claim corrected | `step-conformance.infra.test.ts` boundary-freeze assertions |
| 2 | PH-3 intent ledger | `git log -S` every non-obvious constant (the 7 comp literals, `RAVINE_SETBACK_M`, `STOREY_CLAMP_MAX`, `COVERAGE_DEFAULTS`); **discoverer ≠ adjudicator** (§7.1) — a separately-grounded reviewer rules B4.5 and the comps invalidator | Intent Ledger table with blame evidence; every `preserved-in-compute` row NAMES where its rule is written (Rule 4 / `checkPreservedInComputeHasWhy`) |
| 3 | PH-5 seam map | DB · clock (⚠️ `now()::date - interval '5 years'` `:1114`, the estate's first genuinely clock-relative gate) · network (none) · argv/env (`--full`, 1 `process.env`); `inputs.reads.steps` declared for the live producer seams (`load_zoning`, `link_massing`, `enrich_centreline`, `compute_storey_norms`, `link_neighbourhoods`) | seam count re-derivable via `chain-end-synthesis.mjs` |
| 4 | PH-6 classification | All 17 statements + every finding CONTRACT / INCIDENTAL / DEFECT with a ledger ID per DEFECT | `defect-ledger.md` entries — minimum `EP-D1` (B4.5: unguarded UPDATE under `--full` **and** a never-refreshing window incrementally), `EP-D2` (11 undeclared literals), `EP-D3` (hand-rolled `verdictCascade` `:1799`), `EP-D4` (pass-4 lineage predicate with no invalidator), `EP-D5` (`pipeline_runs` written but undeclared in `emitMeta`), `EP-D6` (three slug spellings, one dead), `EP-D7` (pass 5 outside `runPass` **and** outside the `SET LOCAL` timeouts) |
| 5 | **Golden master** | Capture `sources` (the only chain) + `standalone`, both `--full` and incremental. **Non-determinism inventory declared BEFORE the first diff:** (a) **the comps window is CLOCK-RELATIVE** (`now()::date - interval '5 years'`) — pin it by capturing pre/post **within one UTC day** AND recording `now()::date` in the capture header, so a day-boundary crossing is a *named* diff not an unexplained one; (b) `Date.now()` pass-duration rows — compared by presence/shape, never value; (c) `neighbourhood_build_norms` / `comp_cand` are snapshots of live permits — freeze by capturing pre and post back-to-back with no intervening `permits` chain run; (d) `run_id` in `enrich_parcels_pass3_scope`. Every descriptor is a fingerprint file (R-C) | 4 capture files under `docs/reports/golden/enrich_parcels/{pre,post}/` + `invariants.json` |
| 6 | PH-7 test design + prove red | Convert the 13 dedicated `src/tests/db/enrich-parcels-*.db.test.ts` files into `it.fails()` red-first locks under `src/tests/steps/enrich_parcels/`; declare the `converted.json.pending` entry with `stage: "red_suite"` (R-K.1) | red proven BOTH directions |
| 7 | **Descriptor + compute verbatim** | `scripts/enrich-parcels.descriptor.json` + `scripts/lib/compute/enrich-parcels.js` — **a genuine no-op diff**. Carries the **schema bump** (`execution.shape` += `"enrich"` with `x-ruling`), `generate-schema-baseline.mjs --write`, `generate-template-freeze.mjs --refresh`, the Spec 122 §8 amendment, and `runEnrichPhase` (LG-28) — all ONE commit (`does_not_freeze` requires it). **P4 checker fixture line:** any checker widened to accept the compute's read form ships a known-bad fixture proving the RED seed still fires (§4.4; precedent `32eec17f`) — here that is `compute-shape.yml`'s `compute-no-literal-threshold` rule against the 7 comp literals, plus `bad-compute-shape.js` gaining a multi-pass case | G2′ — byte-identical golden diff, both chains, both modes |
| 8 | Peel | gating → verdict/audit → thresholds/checks, one commit each. `verdictCascade` `:1799` routed through `deriveVerdict` (EP-D3). `grandfathered.json` entry for B4.5 if Ask 4 rules PIN. `config.tunables[]` with `on_invalid:"fail"`. The four WF3-filed stall deliverables land here (whole-step ticker, passes-1–4 heartbeat, `stall_probe` INFO/WARN pair, `terminals[]` timeout terminal) | green diff after EVERY peel |
| 9 | Differential + cutover | `converted.json` gains `scripts/enrich-parcels.js`; `pending` entry DELETED same commit; `node scripts/analysis/step-validate.mjs --step=enrich_parcels --write`. **(a) CLOUDPARITY** as a `cutover_prereq` with `applies_when` — seeds applied + one green cloud `chain-sources` run recorded (⚠️ the step has 2 recorded kills; see Ask 7). **(b) spec diff** present for Spec 122 §8, Spec 124 §9 ENRICHER row + §R-8, Spec 65, Spec 78 — or "N-A" stated in the body. `programme-items.json` `STD-7` → BUILT; `FREEZE-1` re-evaluated | G8, G4d, G-shape green; ≥14/17 |

## Asks — each a genuine ruling no Spec 124 rule answers

| # | Ask | Why not already answered |
|---|---|---|
| 1 | **New runner `runEnrichPhase` (LG-28), or force the 5 passes into `runCascadePhase`?** `runCascadePhase` is a tier-convergence loop over ONE write target inside one txn; this step has five heterogeneous passes and a post-commit streaming phase. Fork-over-share is RATIFIED (`template-freeze.json.lg21_decision`), but Spec 122 KFM 4 ("the library grows into the runner it replaced") is the standing counter-pressure, and this is the largest runner yet proposed. | The freeze ruling ratifies fork-over-share for the *existing* seven; it does not authorize an eighth by itself, and KFM 4's LOC budget is a judgment, not a threshold. |
| 2 | **The schema bump is unavoidable — confirm the shape name and that it rides commit 7.** `execution.shape` is `x-frozen` at 8 values. Adding `"enrich"` costs: `x-ruling` on the node, `--refresh` re-freeze, Spec 122 §8 amendment, all in one commit. Alternative: declare `shape: "backfill"` and carry the 5-pass structure entirely in compute — cheaper, but hides the archetype's real shape (Rule 1). | `does_not_freeze` states the price but does not decide which shape name, nor whether hiding the structure is preferable to paying it. |
| 3 | **Pass 4's `comp_count IS NULL` predicate has no invalidator — declare one now, or `applies_when`-exempt it as a `cutover_prereq`?** The #54 arm makes it unexpressible: the descriptor cannot declare `staleness.scope` for pass 4 without `invalidates[] minItems:1`. Spec 78 §P3C.1 calls it a standing limitation and defers a fix. **Options:** (a) declare mig 242's trigger as covering it (FALSE — the trigger fires on geom, comps go stale on a *permit* change); (b) add a real invalidator (a behaviour change inside a conversion — Spec 123 KFM 3); (c) `staleness.scope: "all"` for pass 4 (honest: `--full` is the only cloud mode anyway) and file the gap. | Claim #54 was designed to make exactly this unexpressible; nothing says what to do the first time it fires on a real, already-shipped gap. |
| 4 | **B4.5 disposition — FIX inline (add `IS DISTINCT FROM` over the 5 comp columns), or PIN + grandfather?** 354,679 parcels rewritten every cloud run. FIX is the same mechanism as passes 1–3 (LP-D9 precedent) and would materially cut the 107–126 min runtime; PIN keeps the differential zero-diff (Spec 123 §1.1/KFM 3) and needs a `grandfathered.json` entry (Rule 9) with a SHA-anchored approver. ⚠️ Note the jsonb-guard hazard: comparing `jsonb_agg` output with `IS DISTINCT FROM` risks the CC-D3 rounding class (a guard that structurally never excludes) — a red-first fixture stamped with the CORRECT value is mandatory either way. | Spec 124 §7 rung (e) permits an inline compute fix but does not mandate one; the eager-fix antibody argues for asking. |
| 5 | **Externalize the 7 pass-4 literals to `logic_variables` in this pilot, or file them?** Rule 3 says every threshold is a registered logic variable; these 7 are hard literals whose *rules* Spec 78 §P3C.2 already states. Externalizing adds 7 seed rows → a cloud `apply-logic-variables.js` prerequisite before cutover (LM-D15). | Rule 3 says they must be externalized eventually; nothing rules whether a conversion pilot is the right commit for it. |
| 6 | **Spec 78 governs 2 of 5 passes. Add it to the Target Spec line, or fold §Phase-3A/3C into Spec 65?** Neither Spec 55 nor Spec 65 defines `comparable_builds`, `comp_*`, `opt_*`, `optimal_config`, or `nearby_builds_summary` — grep-confirmed. Spec 65 §6's own Target Files list omits them. | The operator named 55 + 65 as governing; the code says otherwise. Which document becomes the owner is a ruling, not an inference. |
| 7 | **Runtime budget: what is the declared `step_timeout` / pass-timeout policy — and does pass 5 get one?** Measured: 107.0 and 126.2 min on the two successful cloud runs (pass2 46.7/48.3 min dominant); 2 runs killed at the 300-min platform wall; `enrich_parcels_pass_statement_timeout_minutes` defaults to 75 (measured max ×1.5). ⚠️ **Newly measured: pass 5 is OUTSIDE `runPass` (`:2090-2095` vs the four `runPass` sites `:2058/:2062/:2067/:2071`) AND outside the `SET LOCAL` pair (`:2047-2048`, txn-scoped to passes 1–4)** — so it inherits the session-level `statement_timeout = 0` and a hang there still dies unnamed at the platform wall, the exact failure the WF3 landed to close. **This step cannot survive a slowdown.** Options: (a) keep 75, extend the bound to pass 5, accept a loud FAIL; (b) declare a `terminals[]` `pass_timeout` terminal + `execution.partial_fill: "staged"` so a timed-out run resumes from `enrich_parcels_pass3_scope`; (c) B4.5's fix (Ask 4) as the actual budget remedy. | Spec 115 §2.2 says fail-safe-loud; it does not set this step's number, `manifest.json` carries no `step_timeout_minutes` for it, and the WF3 that landed the bound never ruled on pass 5's exclusion. |

## §11 compliance checklist
* **Try-Catch Boundary:** unchanged — 6 `try` / 13 `catch`, none empty, all log via `pipeline.log.warn`. No API routes touched. N/A for admin error handling.
* **Unhappy Path Tests:** commit 6's red suite covers precondition HALT (PostGIS/GIST absent), gap parcels → NULLs, boundary-lot conflict rows, ambiguity at share<0.60, mislink guard, below-floor clamp, `opt_config_engine_errors` per-row throw (caught, counted, stream continues), and a `57014`/`55P03` pass-timeout dying with the pass name.
* **logError Mandate:** N/A — `scripts/` uses `pipeline.log.*`, already conformant.
* **UI Layout:** N/A.
* **DB Impact:** NO migration (table above). ⚠️ **Ask 5, if adopted, creates a cloud seed prerequisite.**
* **R-W (no PostGIS branching):** the compute must NOT branch on `hasPostGIS`/`pg_extension`/`postgis_version`; `assertPreconditions` `:156` becomes `guards.requires: {kind:"extension", name:"postgis", on_missing:"fail"}`. Verified: zero `hasPostGIS` hits in the file today, so this is a port, not a retirement.

## Grounding — every executable claim, EXECUTED (2026-09-04, branch `wf2/deep-scrapes-restore-l0` @ `b4ddfc24`)

| Claim | Command | Result |
|---|---|---|
| file size | `wc -l scripts/enrich-parcels.js` | **2,391** (Spec 122 `:1142`'s "2,153" is stale) |
| slug, lock, entry point | `grep -n "ADVISORY_LOCK_ID = \|pipeline.run("` | `:74 = 65`; `:2343 pipeline.run('enrich-parcels', main)` |
| the 5 pass functions | `grep -n "^async function "` | `:422 enrichParcels` · `:836 enrichMaxBuild` · `:1045 enrichExistingStructure` · `:1202 enrichComparableBuilds` · `:1644 enrichOptimalConfig` |
| passes 1–4 share one txn; pass 5 after | `grep -n "pipeline.withTransaction\|passDurationsMs"` | `:2032` txn wraps `pass1…pass4` (`:2059-2072`); `pass5` timed at `:2096`, outside |
| DML/DDL enumeration | full-file read + `grep -n "UPDATE\|CREATE TEMP\|CREATE INDEX\|INSERT INTO\|DELETE FROM\|TRUNCATE\|SET LOCAL"` | **27 statements**, listed above; **zero DELETE, zero TRUNCATE**; 3 tables written |
| **B4.5 still unguarded** | `sed -n '1143,1200p'` | `UPDATE parcels p SET comparable_builds = … WHERE p.id = agg.id;` — no `IS DISTINCT FROM`; `incr` empty when `full` |
| **…and never refreshes incrementally** | `sed -n '1228,1229p'`, `sed -n '1144p'` | zero-fill sets `comp_count = 0`, emptying the `AND sp.comp_count IS NULL` incremental predicate forever after run 1 |
| **the clock-relative gate** | `sed -n '1102,1142p' \| grep -n INTERVAL` | `:1114` `AND pr.issued_date >= (now()::date - interval '5 years')` — the ONLY `NOW() − INTERVAL` in the file |
| two further unguarded writes | full-file read | `:831-833` `massing_enriched_at` stamp (by design, `:824-828`); `:1220-1221` `--full`-only comp blanket reset |
| pass-5 guard is inert | docblock `:1403-1411` + `:1445/:1454/:1462` | `nearby_builds_summary` differs on **88,575/88,575 rows every run**; the `OR nearby_changed` admits ~100% |
| **pass 5 is unbounded** | `grep -n "runPass(" ` + `sed -n '2047,2048p;2090,2095p'` | `runPass` wraps `:2058/:2062/:2067/:2071` only; `SET LOCAL` pair is txn-scoped; pass 5 runs on `pool` after COMMIT |
| `pipeline_runs` undeclared | `sed -n '2327,2332p'` vs `:1547`, `:1593` | `emitMeta` writes map names `parcels` + `enrich_parcels_pass3_scope` only |
| `records_updated` excludes pass 4 | `sed -n '1834,1842p'` + docblock `:1820-1829` | distinct union of pass 1/2/3/5 ids; comps deliberately omitted |
| three slug spellings | `grep -n "enrich-parcels'\|sources:enrich_parcels\|DEFER_STEP_SLUG"` | `:2343` · `:75` (dead) · `:91` |
| 96 `auditRows.push` sites (Fold D1; branch-trace before PH-0), 3 real gates | full-file read `:2107-2272` | only `parcels_with_zone_class_pct` `:2109`, `opt_config_engine_errors` `:2230`, `opt_aor_without_max_gfa` `:2243` |
| 11 undeclared literals | `grep -n "COMP_LOT_TOL\|COMP_KNN_OVERFETCH\|COMP_TOP_N\|COMP_OVER_CAPTURE\|COMP_FSI_M\|OPTCFG_BATCH\|batchSize"` | `:1088-1098`, `:1251`, `:1692`, `:246`, `:2109` — all bare literals |
| 25 declared tunables | `sed -n '19,62p'` | `LOGIC_VARS_SCHEMA` `.strict()`, 25 keys |
| defer gate is `--full`-exempt | `sed -n '1956p;1974p;2022p'` | `if (!full) {` `:1956` … `}` `:2022`; `computeDeferScope` called only inside → **never runs on the cloud sources chain** |
| the 3 stall tunables are seeded | `grep -n "enrich_parcels" scripts/seeds/logic_variables.json` | `:4210` defer_threshold · `:4220` heartbeat_minutes · `:4230` pass_statement_timeout · `:4240` lock_timeout |
| **WF3 1.6 is STALE** | `grep -n "passN_duration_ms"` | `:2247-2251` — all five INFO rows ARE pushed |
| hand-rolled verdict | `grep -n "verdictCascade"` | `:1799` — a second cascade outside `verdict.js` |
| counts | `grep -c` + full-file read | `.query(` **44** · `IS DISTINCT FROM` 13 raw / **7 executable** · `try {` 6 · `catch (err)` 5 · `.catch(` 2 · `finally` 1 · `process.env` 1 (`ENRICH_PARCELS_FORCE_FULL`, `:1876`) · argv: **`--full` only** (no `--dry-run`/`--force`) |
| churn / fix density | `git log --follow --oneline -- scripts/enrich-parcels.js` | **35 revisions, 20 `fix(` = 57%** |
| not converted, no descriptor | `cat converted.json`; `ls scripts/*enrich*descriptor*` | 8 entries, absent; `No such file` |
| **ENRICHER unproven** | `cat template-freeze.json` | `{archetype:"ENRICHER", shapes:[], runners:[], first_step:null, proven:false}`; `frozen_after_pilot: 9` |
| **shape enum is frozen, 8 values** | `sed -n '1173,1177p' step.schema.json` | `enum:[assert,ingest,link,link_keyed,cascade,materialize,backfill,recorder]`, `"x-frozen": true` |
| ENRICHER x-profile | `sed -n '1677,1693p' step.schema.json` | `staleness.scope ∉ {all,none}` ⇒ `outputs.invalidates minItems:1` |
| STD-7 owner | `node -e` over `programme-items.json` | `status:PARTIAL`, `owner:{kind:"pilot", ref:"pilot9_enrich_parcels"}`, `gate.blocks:["batching"]` |
| manifest: `--full` only on cloud | `node -e` over `manifest.json` | `chain_args.sources:["--full"]`, `supports_full:true`, chains: `sources` |
| live row counts | cloud pool, read-only | `parcels` 486,530 · `comparable_builds` non-null 354,679 · `enrich_parcels_pass3_scope` 0 |
| DB identity (lesson :87) | `select current_database()`, `information_schema.schemata` | `postgres`, PG 17.6, `auth`+`storage` present, `schema_migrations` = 242 ⇒ **CLOUD** |
| mig 242 trigger exists | `select tgname from pg_trigger where tgrelid='parcels'::regclass` | `trg_parcels_geom_invalidation` |
| `comparable_builds` is a COLUMN | `information_schema.columns` | `parcels.comparable_builds jsonb` — not a relation |
| **Spec 78 owns 2 passes** | `grep -rln "opt_aor_gfa_sqm\|comparable_builds" docs/specs/` | `78`, `88`, `89`, `100`, `01_database_schema` — **never `55` or `65`** |
| dedicated tests | `grep -rl "enrich-parcels" src/tests/` | 13 `db/enrich-parcels-*.db.test.ts` + logic/infra siblings |
| golden convention | `ls docs/reports/golden/refresh_snapshot/` | `pre/`, `post/` (one JSON per chain) + `invariants.json`; tool `scripts/analysis/capture-step-golden.js` |
| cloud runtime | `.cursor/wf3_enrich_parcels_cloud_stall_active_task.md` STEP 0 RESULTS | 107.0 / 126.2 min complete; pass2 46.7/48.3; 2 kills at the 300-min wall |

## Not in scope
* **Making `enrich_parcels` faster** beyond whatever Ask 4's ruling delivers — batching/index work is its own WF.
* **Raising the 300/330-min cloud ceiling or adding `step_timeout_minutes`** — blocked on the poisoned `pipeline_runs` duration statistics (`wf3_cloud_parity` FIX 3.2).
* **Settling H5 (dropped socket) / H3 (heavyweight lock)** — both UNDETERMINED; they need a live `pg_stat_activity` capture during a stall, owned by `wf3_enrich_parcels_cloud_stall` 0.1.
* **The `*_dataset_version_when_enriched` HIGH followup** (`review_followups.md:76`) — those three stamps are written by `enrich_ravines`/`_heritage`/`_centreline`, NOT by this step; `enrich_parcels` only READS them. **Not this step's invalidator; not in scope.** (Pass 4's own missing invalidator IS in scope — Ask 3.)
* **Externalizing `max-build.js`'s `SETBACK_DEFAULTS`/`COVERAGE_DEFAULTS`** — Spec 65 MB-3 files it as a tracked follow-up; honoured, not reopened.
* **Spec 78's §4D propagation onto permits/coa** (`enrich-permits.js`) — a different step, a different spec.
* **The `lifecycle_seq_band_*_max is non-finite` WARN storm** — separate WF3, filed LOW.

## Risks
1. **Commit 7 is the largest single commit in the programme** — a new shape, a new runner, a schema bump, a re-freeze, a spec amendment and a 2,391-line verbatim port. Spec 122 §8.3's kill criteria (descriptor >20 lines beyond declared categories · any per-step override · runner concepts leaking into compute · an unexplainable differential) must be checked *before* it is written, not after.
2. **The golden differential may not be reproducible across a UTC day boundary** because of the 5-year comps window. Mitigation is declared in commit 5; if it fails, the honest response is a named diff, never a widened comparator (lesson: "do not massage the score" — fix precision, not leniency).
3. **The FULL re-evaluation may surface a pre-existing defect this pilot did not cause** (LP-D9, HIGH). Budget for it as a live branch: run the change-neutrality differential FIRST (would the OLD code, today, produce this?) before assuming the diff is at fault.
4. **A cloud cutover run costs 107–126 min and has a 2-in-4 historical kill rate.** CLOUDPARITY (commit 9(a)) may block on a green run that does not arrive; `applies_when` is the declared escape, and using it is a ruling (Ask 7), not a workaround.
5. **`STD-7` and `FREEZE-1` both key on this pilot.** A partial pilot 9 leaves the template freeze declarable-but-not-declared indefinitely.

## Operating Boundaries
* **Target Files:** `scripts/enrich-parcels.js` → shell · `scripts/enrich-parcels.descriptor.json` (NEW) · `scripts/enrich-parcels.notes.json` (NEW) · `scripts/lib/compute/enrich-parcels.js` (NEW) · `scripts/lib/step/index.js` (`runEnrichPhase`) · `scripts/steps/_schema/{step.schema.json, schema-baseline.json, template-freeze.json, converted.json, grandfathered.json, programme-items.json}` · `src/tests/steps/enrich_parcels/**` · `docs/reports/golden/enrich_parcels/**` · `docs/reports/{defect-ledger.md, review_followups.md}` · Specs 122 §8, 124 §9/§R-8, 65, 78.
* **Out-of-Scope Files:** `scripts/manifest.json` (unchanged) · `migrations/**` · `.github/workflows/chain-sources.yml` · `scripts/enrich-permits.js` and the permits/coa propagation surfaces · `scripts/lib/pipeline.js` (extended by export only) · `src/` app code · every other step's descriptor.
* **Cross-Spec Dependencies:** 122 (architecture, governs the shape) · 123 (procedure) · 124 (13 rules; R-W, R-H) · 119 (governs on conflict) · 55 + 65 + **78** (domain) · 47 §R1–R12 · 48 §3.6/§3.7 · 58 (producer contract) · 56 (massing) · 115 §2.2 (fail-safe-loud).

---

## Folds A-E (plan panel, 2026-09-04) — BINDING; override earlier text where they conflict

**Fold A — Idempotency Lens.**
1. **CORRECTED (pilot 9 commit 4c/5, golden-master G1', 2026-09-04):** Commit 7/8 must name the mechanism per `outputs.writes[]` entry: pass 5's 10 genuine `OPTCFG` columns → `idempotent_rerun:"zero_writes"` (guard proven). `nearby_builds_summary` is **NOT** `"declared_drift"` — the "measured 88,575/88,575" figure this row originally cited is the file's own `:1403-1411` docblock claim, and it is **PRODUCTION DATA DRIFT, not code non-determinism**: three controlled back-to-back local `--full` re-runs (golden-master G1', no intervening `neighbourhood_build_norms`/permits ingest between them) measured `nearby_builds_summary` **byte-identical, 0/442,244 rows differing**, across all three. The docblock's "every run" framing is true only when calendar time passes and upstream data (permits, `neighbourhood_build_norms`) genuinely changes between runs — which every production run does, but this golden-master control did not. `nearby_builds_summary` therefore also gets `idempotent_rerun:"zero_writes"` (not `"declared_drift"`) at commit 7; the file's own `:1403-1411` comment should be read as a production-cadence observation, not a determinism claim, when commit 7 cites it. See `docs/reports/2026-09-04-pilot9-enrich-parcels-assessment.md` §5 for the measurement. Pass 4 takes Ask 4's ruling: fix (guard → `zero_writes`) or `guard:"none"`+`guard_why`+grandfathered.json paired with `idempotent_rerun:"not_idempotent"` — **and separately, EP-D9 (§5): the pass-4 comps candidate selection itself is genuinely non-deterministic (no tiebreak on the top-N `ORDER BY`), independent of Ask 4's B4.5 guard question — `comparable_builds` differs 248/486,530 (0.051%) even holding data fixed.**
2. Passes 4 and 5's ineligibility resets are `set_based_null_retract`-class → declare `recovery.interrupted` for them (Rule 12); add to the commit-7 ledger row.
3. `enrich_parcels_pass3_scope` rows are left inside the txn BY DESIGN (crash-recoverable trail, `:2073-2076`); state that in the descriptor `recovery` prose, not as a defect.

**Fold B — Regression Guardian.**
1. `zoning_dominant_area_share` guard uses `round(...::numeric,4)` (`:336`) because of the float8-vs-NUMERIC `IS DISTINCT FROM` trap (`tasks/lessons.md:28`, fence `7e130bff` HIGH). Commit 7 ports that cast VERBATIM; the guard SQL is never regenerated generically from a column list. Named here beside pass-map row 1.
2. Ask 7 gains a hard constraint: whatever bound pass 5 gets, it is applied via a live `SET LOCAL`/`SET` over the query interface on the actual session (Supavisor drops startup options and pool-level params — fence `fa9e984c2`, `lessons.md:82`) and the regression lock asserts it via `SHOW statement_timeout` on that session, never by inspecting a config value.
3. Commit 7 regenerates `docs/reports/generated/122-vocabulary.md` with the enum bump (pilot 8 `d7f1f983` precedent).

**Fold C — Reality-Check (plan altitude, LOCAL DB measured).**
1. **Golden master precondition:** every `massing_enriched_at` in the local DB is `2026-07-07T15:23:54Z`, a month BEFORE the D-C dimension-floor fix `23cbe89c`; `max_build_dim_below_floor` trips 27,984/27,984. Commit 5 is preceded by one fresh local `enrich-parcels --full` (≈2h) and a re-run of `parcel-sanity-audit.js`; the capture happens only when the max-build BOUND family reads post-fix. Otherwise the baseline enshrines pre-fix values.
2. **New KNOWN-DEFECT EP-D8 (Spec 123 §3.1 pin, filed HIGH):** pass 4 `comp_fsi_p50` has no structure-family/zone compatibility invariant (`:1164-1166` filters `work_type` + [0.05,8] only) — parcel 8244 (R, detached, 290 m²) carries `comp_fsi_p50 = 6.615` from apartment-scale comps (`structure_family:"all"`, 1,695 m² GFA). Converted VERBATIM in commit 7, pinned in the wrong form, fixed after green. Descriptor `plausibility[]` gains a small-N audit row (`comp_fsi_p50` from < 3 non-null comps) with count.
3. **New bound:** heritage-basis max-build (`max_buildable_gfa_basis='heritage_existing'`): 1,677/5,283 (31.7%) exceed 65% coverage; 10 rows at 1.046-1.049 of lot — passing only under the 1.05 mislink tolerance. Descriptor declares a heritage-specific coverage bound tighter than the mislink ceiling (value to be ruled at commit 7 from Spec 65 §5 text; WARN not FAIL until measured post-`--full`).
4. INVARIANT family measures 0/N clean today (incl. `opt_aor_gfa_gt_max_buildable_gfa` 0/424,123); `comp_count` zero-fill 89,572/486,530 and NULL 42,279 are genuine and are B4.5's never-refresh signature.

**Fold D — Integration + Ground-truth.**
1. `auditRows.push` count is 96 (not 92); re-derive with branch tracing before PH-0 locks the count. The "only 3 non-INFO" claim is exact.
2. Freeze-bump precedent reframed: pilot 8 SPLIT the enum edit (`d7f1f983`) from template-freeze population (landed 2026-09-04 by the freeze WF). Pilot 9 is the FIRST pilot gated by `checkFrozenSchemaConsistency`; "enum bump + x-ruling + `--refresh` + Spec 122 §8 amendment in ONE commit" is the forward rule, not a mirror of pilot 8.
3. `runEnrichPhase` takes `ownRunId` per the existing runner convention (`runCascadePhase`/`runLinkPhase`/`runMaterializePhase` call sites), not a step-local `pipelineRunId`. `recordHeartbeat`/`captureStallDiagnostic`/`startStallTicker` are first-of-kind (zero hits in `scripts/lib/`) and move into the library with the runner (LG-28), whole-step (passes 1-5), closing the stall WF3's deferred items.
4. Ask 3 confirmed: NO invalidator for pass-4 comps exists anywhere (trigger 242 nulls only `massing_enriched_at`/`zoning_enriched_at`; `load-parcels.js:353-361` covers only the three `*_dataset_version_when_enriched` stamps).

**Fold E — DeepSeek (grounder-confirmed items only).**
1. Third unguarded write: `zoning_enriched_at` (`:375/:443`) gets the same LG-9-style `guard:"none"`+`guard_why` run-clock disposition as `massing_enriched_at`; add to the DML summary.
2. Ask 4 gains a second half: rule whether the `comp_count IS NULL` incremental predicate (`:1229`, never refreshes — measured B4.5) gets a real invalidator or is PINned with the consequence named.
3. **Ask 1a (new):** declare the descriptor JSON shape that carries per-pass scope / invalidator / timeout before commit 7 — no converted descriptor has a per-phase structure; this is a schema decision and rides the same freeze-bump commit.
4. PH-5 seam map (commit 3) and `inputs.reads.tables` gain `permits` (pass 4 reads `permits pr` at `:1112`).
5. Commit 5 non-determinism inventory gains `zoning_enriched_at`/`massing_enriched_at` (run-clock stamps, excluded from the byte comparator, stated explicitly).
6. Ask 3 reworded: `applies_when` gates only `checkCutoverPrereqs`; it cannot make an AJV-invalid descriptor pass `pipeline.step()`. Only options (a)/(b) are real.
7. Commit 7 "verbatim" is imprecise: the compute must shed `Date.now()`/`process.env`/`../pipeline` per §5.5, with clock/txn/env injected by `runEnrichPhase` as the six existing runners already do (`index.js` `ctx.clock`/`ctx.fetch` precedent). State the seam rewrite explicitly; the no-op is proven by the golden 4-tuple, not by a textual diff.


**Fold F — Cross-read Adversary (2026-09-04), binding line fixes.**
1. ID collision fixed: the comps-family invariant defect is **EP-D8** (EP-D2 stays the 11-literals item).
2. Commit-ledger row 3 (PH-5 seam map) gains producer `permits` (`:1112`); `inputs.reads.tables` too.
3. Commit-ledger row 5 (golden master) is PRECONDITIONED on Fold C1 (fresh local `--full` ≈2h + post-fix `parcel-sanity-audit.js`) and its non-determinism inventory gains: (e) `zoning_enriched_at`/`massing_enriched_at` run-clock stamps (comparator exclusion), (f) `nearby_builds_summary` — drifts 88,575/88,575 per run by design (Fold A1 `declared_drift`), so it is EXCLUDED from the byte comparator and its drift is asserted as a row COUNT instead. Without (f) G2'’s byte-identical promise is unmeetable; with it, G2' holds for every other column.
4. Commit-ledger row 7 is retitled "descriptor + compute (seam-rewritten per §5.5, SQL verbatim incl. the `::numeric` cast), G2' proven by the 4-tuple not a textual diff"; it also lists `recovery.interrupted` for passes 4/5 resets (Fold A2) and `122-vocabulary.md` regeneration (Fold B3).
5. DML row 9 (`zoning_enriched_at`) mirrors row 11's disposition: UNGUARDED run-clock stamp → `guard:"none"` + `guard_why` + Rule 9 grandfather entry.
6. Ask 3's body is SUPERSEDED by Fold E6: options are (a) declare the invalidator now or (b) the schema-legal `staleness.scope` value that removes the `invalidates` requirement, with the consequence named; there is no `applies_when` option.
7. Asks 8 and 9 are full Asks (same format as 1-7): **Ask 8** — EP-D8 comps family invariant: convert verbatim + pin + file HIGH, fix after green (y/n); **Ask 9** — heritage-basis coverage bound: WARN threshold value at commit 7 from Spec 65 §5 (propose 0.65 WARN / 1.00 FAIL until post-`--full` measurement) (y/n or a value).

## Fold G — Grounded rulings (2026-09-04)

**G1 — Pin-expires-at-cutover mechanism (Asks 4 & 8).** Spec 123 §3.1 (`123_step_opt_assessment_validation.md:97`): *"Pin it anyway, in its current wrong form, annotated `KNOWN-DEFECT` with a Defect Ledger ID, and keep the differential gate at zero-diff. Fix it in a separate commit after the conversion is green..."* — pin-then-fix is the compliant disposition for both B4.5 (Ask 4) and EP-D8 (Ask 8); this fold makes "fixed after green" structural, not a promise. Spec 122 §10.3 (`:1246`): *"a slug whose descriptor cannot be resolved... is treated conservatively: it STILL BLOCKS — only a descriptor that resolves AND mismatches exempts the slug."* Spec 123 §6 (`:350`): *"Programme gates may not name a step in blocks without either a measured pilot of that archetype or an applies_when."* Pilot 9 IS the measured ENRICHER pilot, so `blocks:["enrich_parcels"]` is licensed with no `applies_when` escape needed. Mechanism: `docs/reports/defect-ledger.md` rows `EP-D1` and `EP-D8` gain `**PIN** (Spec 123 §3.1) — pinned_until: pilot9 commit 9` in the Status column (same convention as the live `AS-D11..13` rows); `scripts/steps/_schema/programme-items.json` gains `EP-PIN-B45` (spec `"78 §P3C.1/§3.0b"`, `status:"NOT_STARTED"`, `evidence`= the `EP-D1` row, `owner:{kind:"pilot",ref:"pilot9_enrich_parcels"}`, `gate:{kind:"cutover_prereq",blocks:["enrich_parcels"]}`) and `EP-PIN-D8` (spec `"78 §P3C.2"`, same shape, `evidence`=`EP-D8`) — schema per the live `STA-1` entry. `checkCutoverPrereqs` then hard-stops commit 9's `converted.json` registration until both flip `BUILT`. Commit 8 names the closing peels: **peel 8x — B4.5 predicate invalidator** (adds `IS DISTINCT FROM` over the 5 comp columns, RED-first on a fixture proving the pre-fix blanket rewrite, golden recapture named cause "B4.5 fix"); **peel 8y — EP-D8 family invariant** (adds a `structure_family`/zone compatibility filter to the comp-match predicate, RED-first on the parcel-8244 fixture, golden recapture named cause "EP-D8 fix" + a companion Spec 78 §P3C.2 amendment, since the fix states a rule the current spec text does not).

**G2 — Low-confidence #1: phase order (Ask 1a).** Correction to the task framing: no descriptor exists before commit 7 (commit-ledger row 7 is where it's created) — Fold E3 already places Ask 1a's per-pass shape decision at commit 7 ("rides the same freeze-bump commit"), not commit 4; PH-6 (commit 4) classifies statements, it declares no descriptor field. Commit 7 declares the phase structure as `execution.shape:"enrich"` (Rule 1) plus, only if a `when:"pre_write"` check is authored for the post-commit-read guarantee, `checks[].order_guarantee` (`step.schema.json:692-709`, `required:["guarantee","spec_ref","anchor"]`). ⚠️ Spec 124 §2 Rule 11's own "Enforced by" text ("nothing generic... GAP G-3 — no mechanism re-checks a step's governing spec for 'before X' language") is **STALE**: commit `b2a85079` (2026-09-03, "Rules 11+12 enforced") built `checkOrderGuaranteesCited` (`scripts/analysis/step-validate.mjs:1537-1544`), which requires and verifies `order_guarantee{guarantee,spec_ref,anchor}` on every `pre_write` check, anchor-checked literally against the cited spec file. But its own header comment narrows the claim honestly: *"GAP G-3's completeness half stays open — nothing proves the declaration is COMPLETE w.r.t. the spec's prose, and a future generic phase-order change is not re-audited automatically."* So the checker only does work if commit 7/8 actually authors a `pre_write` check citing Spec 78 §P3A.1's *"a same-txn read would be invisible"* — nothing forces that authorship to happen. Separately, the G-3 freeze assertion (STD-8, `template-freeze.json`, `template-freeze.infra.test.ts` R-E lock) is real and does cover the runner side — Spec 122 §8 (`:1171`): it snapshots "the 8-archetype/7-runner dispatch surface (`archetype_profiles`/`phase_runners`)" and hard-stops "a live schema edit with no matching re-freeze + spec amendment." Ruling: both mechanisms are real and non-vacuous, but neither is automatic — commit 7/8 must explicitly author the `pre_write` check for Rule 11's checker to do anything.

**G3 — Low-confidence #2: UTC boundary (clock injection).** Spec-supported and MANDATORY, not optional. Spec 122 §5.5 (`:857-859`): *"Every I/O call goes through an injected seam — `ctx.fetch`... `ctx.clock` (default `Date.now`). Banned outright: bare `fetch(`, `Date.now()`, `new Date(`..."* — replacing `now()::date - interval '5 years'` (`:1114`) with an injected `ctx.clock.asOfDate()` is the required seam rewrite, already implied by Rule 2/§5.5, not a new ask. Externalizing the default/override as `enrich_parcels_comps_as_of_date` is a reasonable but NOT literally mandated extension of Rule 3 — Rule 3's closed category list (Spec 124 §2, Rule 3) is *"threshold, sample size, byte window, timeout, retry count, limit, or rate"*; a clock-anchor date is not literally one of those seven, so this half is spec-silent-but-consistent, not spec-required — file the extension as the commit-7 body's own ruling, not as a Rule-3 citation. Both-directions lock: RED on a raw `now()::date`/`Date.now()` fragment surviving in compute (`compute-shape.yml`'s wall-clock rule already bans it structurally — the lock is that this file's own literal trips it pre-conversion and stops tripping post-conversion), GREEN once `ctx.clock.asOfDate()` is threaded through `runEnrichPhase`. Golden-fingerprint impact: capturing pre/post within one UTC day (commit-ledger row 5) becomes UNNECESSARY, not merely mitigated, once the as-of-date is injected and stamped into the capture header directly — the day-boundary risk in Risk #2 is closed by this ruling, not just hedged.

**G4 — Spec ownership, one line each.**
- **Ask 6** (Spec 78 governs passes 4/5): **spec-supported** — re-grepped this session: `comp_*`/`comparable_builds`/`opt_*`/`optimal_config`/`nearby_builds_summary` appear only in Specs 78/88/89/100/`01_database_schema`; zero hits in 55 or 65.
- **Ask 8** (EP-D8 family invariant): **spec-silent, confirmed a genuine gap.** Spec 78 §P3C.1/§P3C.2's comp-match predicate is `zoning_class` + lot/frontage ±20%, plus (for the FSI scalar only) `work_type='new_build'` AND `permit_fsi ∈ [0.05,8]` — no `structure_family` term anywhere in §Phase-3C. EP-D8 is not a spec violation; the eventual fix needs a Spec 78 §P3C.2 amendment (a new rule), not just a code patch.
- **Ask 4** (B4.5): the never-refresh half is **spec-supported as a disclaimed limitation** — Spec 78 §P3C.1 verbatim (`:278-282`): *"Standing limitation (WF3 D-D note): the `comp_count IS NULL` incremental predicate never revisits a parcel whose envelope later changed... a staleness predicate here is out of scope."* PIN is the spec-aligned disposition for that half. The unguarded-`UPDATE` blast-radius half has no spec text either way — spec-silent.
- **Ask 9** (heritage coverage bound): **spec CONTRADICTS the recommendation — stated plainly, not bent.** The relevant text is Spec 65 **§4 MB-5** (not §5 as Fold F cites — §5 is existing-structure, the heritage freeze is in max-build): *"Heritage GFA carries no FSI cap: frozen-real footprint × bounded storeys self-bounds, and a cap would understate a legitimately grandfathered structure."* MB-5's own rationale treats high heritage coverage as EXPECTED, not anomalous; Fold C3's measured 1,677/5,283 (31.7%) exceeding 65% coverage is the design working as stated, not evidence of a defect. A WARN that fires on ~32% of a class the spec calls legitimate repeats the exact over-gating pattern DEC-4 rejects elsewhere in the same spec (`:10`): *"only `zoning_class` is a hard coverage gate... sparse by design... surface as INFO null-rate rows, never as ≥90% gates."* Ruling: no WARN/FAIL bound at commit 7 — an INFO-only distribution row (mirroring MB-8's existing "all INFO, never gated" convention) is what the spec text supports; a gated bound requires the operator to rule a fresh Spec 65 §4 amendment overriding MB-5's stated intent, not a silent commit-7 default.
- **Pass 1/2/3 fields**: **spec-supported via Spec 55, which points to Spec 65.** Spec 55:59 names Spec 65 §2/§4/§5 as the SoT for the zoning/max-build/existing-structure columns it lists; Spec 55 itself defines nothing beyond parcels ingestion (zero `comp_`/`opt_`/scenario hits, re-grepped this session). Pass 3's `SCENARIO_COLS` are governed by Spec 65 **§6**, which Spec 55:59 does not name either — confirming the plan's own G0 finding that Spec 55's Target Spec role is "points at 65," not "co-defines."

**Asks after folds:** 1 (runner), 1a (descriptor per-pass shape), 2 (shape name / pay the freeze), 3 (pass-4 invalidator: schema options (a)/(b) only), 4 (B4.5 guard AND the never-refresh predicate), 5 (externalise 11 literals — values preserved), 6 (Spec 78 governs passes 4-5; operator named 55/65), 7 (runtime budget; pass-5 bound via live SET LOCAL), 8 (EP-D8 comps family invariant: pin-then-fix, confirm), 9 (heritage coverage bound: Fold G rules INFO-only, not WARN/FAIL, absent a fresh Spec 65 §4 amendment).

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> §11 note: Database Impact is NO (no migration; all 5 passes' targets, keys and columns are unchanged — only the declaration changes), **conditional on Ask 5**: externalizing the 7 pass-4 literals would add ≤7 `logic_variables` seed rows and therefore a cloud `apply-logic-variables.js` prerequisite before cutover (the LM-D15 precedent). Two non-obvious compliance choices are stated rather than assumed: (1) **the schema template freeze is unavoidably broken by this pilot** — `execution.shape` is `x-frozen` with no ENRICHER member, so commit 7 must carry the bump + `x-ruling` + `--refresh` re-freeze + Spec 122 §8 amendment together (Ask 2); (2) **Spec 78, not 55 or 65, governs 2 of the 5 passes** — the Target Spec line cannot be honestly filled at G0 until Ask 6 rules which spec owns them.

---

## Fold H — commit 7 split (2026-09-04)

Commit 7's own five-way split is recorded here, contemporaneous with 7b, per the same "declared, not silently done" convention this plan follows throughout:

- **7a** (`64c45463`, LANDED) — schema/freeze half: `execution.shape` enum gains `"enrich"` (9th value, `x-ruling`), `definitions.enrichPhase` (`execution.phases[]`, REQUIRED for archetype `ENRICHER`), the two array-level AJV rules (orders unique+contiguous, `post_commit` admitted at most once and only last), `generate-schema-baseline.mjs --write`, `generate-template-freeze.mjs --refresh` (`frozen_at -> c9534fbd`), Spec 122 §8 amendment. ONE `it.fails` flipped (the schema-enum-bump lock).
- **7b** (this commit) — the descriptor only: `scripts/enrich-parcels.descriptor.json` (7 write targets: zoning/max-build/existing+scenarios/comps/optimal-config/run-clock-stamps/pass3-scope-ledger; `execution.phases[]` 5 entries; 39 `config.logic_variables` = 25 pre-existing + 14 newly-externalized) + `scripts/enrich-parcels.notes.json` + a `grandfathered.json` entry (guard:"none" ×4 dispositions + `no_retraction` for the scope-ledger) + 14 new `scripts/seeds/logic_variables.json` rows + `scripts/generate-logic-variable-groups.mjs` GROUP_ORDER additions. 13 `it.fails` flipped to `it()` (descriptor shape, per-pass write class/guard/idempotency, invalidates, recovery, grandfathered.json, P4 tunables ⊆ registry, order_guarantee, EP-D8 small-N row, Ask-9 heritage row). `converted.json.pending.stage` advances `red_suite -> descriptor_landed` — see the vocabulary widening below. Compute/runner/golden `it.fails` (compute exists, §5.5 clock seam, `::numeric` cast, POST golden) correctly STAY red (their artifacts don't exist yet).
- **7c** (NOT STARTED) — `scripts/lib/compute/enrich-parcels.js`: the seam-rewritten port (Fold G3's `ctx.clock.asOfDate()` replacing the raw `now()::date - interval '5 years'` literal; the `::numeric` cast on `zoning_dominant_area_share` ported byte-for-byte, Fold B1).
- **7d** (NOT STARTED) — `runEnrichPhase` (LG-28) in `scripts/lib/step/index.js`, forked per Ask 1; `converted.json.pending.stage` advances `descriptor_landed -> shape_clean` once `conformanceFindings()` returns `[]`.
- **7e** (NOT STARTED) — the G2' golden-diff gate: one local `--full` run vs `golden/enrich_parcels/pre/sources_run1.json`, zero unexplained diffs (comparator honouring the declared non-determinism inventory (a)-(g) + the Fold A1 correction + the EP-D9/EP-D10 pins).

Precedent: pilot 8's own `d7f1f983` (schema-only) → `c19cf224` (descriptor+compute+runner in ONE commit) split commit 7 in two. Pilot 9 splits it in five because it is the first ENRICHER-shaped pilot whose descriptor's own shape (`execution.phases[]`) was itself the schema bump's reason for being — landing the descriptor cleanly required the schema to exist first (7a), and the descriptor is large and independently reviewable enough (7 write targets, 39 tunables, a `count_field` schema amendment of its own) to be its own commit ahead of compute.

**`converted.json.pending.stage` vocabulary widened, three values now (R-K.1 amendment, this commit):** `"red_suite" | "descriptor_landed" | "shape_clean"`. Every pilot before 9 landed descriptor+compute+runner in one commit, so `red_suite -> shape_clean` was always a single atomic jump and the middle state was never observable — R-K.1's own mechanical lock (`step-conformance.infra.test.ts`, "a `red_suite` pending file has NOT yet landed its sibling descriptor... the stage must advance in the same commit that lands the descriptor") forces an advance the instant a descriptor exists, but `shape_clean`'s own correctness check (`conformanceFindings()` returns `[]`, which requires `module.exports.compute` to exist on the shell) cannot be satisfied until 7c/7d land. `descriptor_landed` is the honest middle value: descriptor exists and independently validates (`validateDescriptor`), compute/runner do not yet. A new `step-conformance.infra.test.ts` check (`a descriptor_landed pending file has a descriptor that exists and independently validates, but is NOT yet shape-clean`) enforces both directions — including refusing a `descriptor_landed` declaration where `conformanceFindings()` is ALREADY clean (that would mean the stage under-advanced, not over-advanced).

**Schema note (this commit):** `plausibility[].count_field` (new optional field, EP-D8 small-N caveat, Fold C2) — nested inside the `plausibility` item definition, not a direct category field, so it does NOT trip the G-1 ratchet (`schema-baseline.json` tracks 18-category/direct-field grain only, confirmed live: `plausibility.*` has zero tracked direct fields). It DOES trip R-E (`template-freeze.json`'s `schema_sha256` hashes the WHOLE schema file) — paid: `--refresh` (`frozen_at` stays `64c45463`, i.e. 7a, since 7b had not yet landed when this ran) + `docs/reports/generated/122-vocabulary.md` regenerated.

**What the plan/schema got wrong (found this commit):** `checkOrderGuaranteesCited` (Rule 11, `step-analysis/step-validate.mjs`) hard-requires `checks[].order_guarantee.spec_ref` to resolve to the SAME file as `identity.spec` — a single-spec assumption. Pass 5's order guarantee genuinely cites Spec 78 (§P3A.1, "a same-txn read would be invisible"), while `identity.spec` is `"65"` (Ask 6's own ruling: Spec 78 governs 2 of 5 passes, but `identity.spec` is single-valued and the operator named 55/65 as the Target Spec line). This is Ask 6's multi-spec tension resurfacing in a checker nobody had exercised against a multi-spec ENRICHER before — `step:validate --fast` reports it as `enforced-red` for Rule 11 (see the pasted gate table below); the `violations.test.ts` lock itself is correct (it asserts `spec_ref === SPEC_78_REL` verbatim, matching Ask 6's ruling) and passes. Not fixed this commit (out of 7b's own scope — a generic checker widening or an `identity.spec` multi-value amendment is its own ruling); filed here so it is not silently absorbed into the hard-stop's already-expected G6/G7/G8 noise.

---

## Cloud acceptance run — backup plan (2026-09-09, pre-dispatch)

**Written BEFORE dispatch, executable immediately.** Domain: Backend/Pipeline. All cloud reads were
READ-ONLY, cloud-explicit (`PG_HOST=` cleared + `DATABASE_URL=$SUPABASE_DATABASE_URL`,
`NODE_PATH=node_modules`, target logged: `aws-0-ca-central-1.pooler.supabase.com:5432/postgres`,
`migrations=242`). No cloud writes were made by this pass. Clock at authoring: **2026-09-09T20:10:38Z**.

### 1. Measured timeline — expected shape for tonight

Source: cloud `pipeline_runs`, last 3 `chain_sources` runs + their `sources:%` step rows.

| chain run | started (UTC) | status | total min | steps 1-21 (reconcile→load_zoning) | `enrich_parcels` (step 22) | steps 23-28 tail |
|---|---|---|---|---|---|---|
| **4470** | 2026-09-09 03:23Z | **running (STRANDED)** | — | died in `address_points` (row 4473, `running` 1007 min) | never reached | never reached |
| **4407** | 2026-09-08 13:24Z | failed (306.5) | 306.5 | **58.4** | **248.1 — KILLED** (legacy script, EP-D13) | 0/6 ran |
| **4309** | 2026-09-06 16:01Z | completed_with_warnings | **278.4** | **111.1** | **125.6** (verdict WARN) | **41.7** |
| (3463, 08-24, 4th point) | 2026-08-24 21:22Z | completed_with_warnings | 202.8 | — | 113.8 (row 3485) | — |

`sources:enrich_parcels` measured history: **125.6 · 113.8 · 135.6 · 111.7** min completed; **248.1** killed;
two strands (5709.3, 2478.2 — ops-closed, not durations). Cloud tunables live and confirmed:
`enrich_parcels_pass5_stream_batch_size=2000`, `enrich_parcels_optcfg_batch_size=5000` (both `updated_at`
2026-09-09T03:10Z), `enrich_parcels_pass_statement_timeout_minutes=75`.

Other cost centres on the clean 09-06 run (min): `enrich_ravines` 30.8 · `enrich_centreline` 23.8 ·
`compute_parcel_cost_estimates` 16.5 · `enrich_heritage` 16.0 · `parcels` 11.3 · `assert_global_coverage` 9.5 ·
`assert_parcel_sanity` 7.5 · `link_parcel_addresses` 7.5 · `compute_centroids` 6.5 · `refresh_snapshot` 3.8.
Head variance is large and real: 58.4 min (09-08, incremental) vs 111.1 min (09-06).

**THE BUDGET RISK IS `enrich_parcels`, AND THE MARGIN IS ~11 MINUTES.** Ceilings (`chain-sources.yml`):
job `timeout-minutes: 330` · chain step `SOURCES_STEP_TIMEOUT_MINUTES: 300` (this is the whole-chain GH step,
NOT a per-pipeline-step budget — 4407's "300-min step budget" kill was chain-wide) ·
`CHAIN_TIME_BUDGET_MINUTES = 290` soft self-stop, checked BETWEEN steps only ·
`CHAIN_DURATION_BUDGET_MINUTES = 300` verdict tripwire (warns past 240).

Derived thresholds, with `T_pre` = steps 1-21 and the measured 33.5-min gap from `enrich_parcels` end to
`refresh_snapshot` start (`compute_parcel_cost_estimates` 16.5 + `assert_global_coverage` 9.5 + `assert_parcel_sanity` 7.5):

| what must hold | condition | at `T_pre`=111.1 (09-06) | at `T_pre`=58.4 (09-08) |
|---|---|---|---|
| `refresh_snapshot` (step 26, **a CONVERTED slug**) is reached at all | `T_EP < 256.5 − T_pre` | **`T_EP` < 145.4** | `T_EP` < 198.1 |
| all 28 steps finish with no budget-stop | `T_EP ≤ 248.3 − T_pre` | **`T_EP` ≤ 137.2** | `T_EP` ≤ 189.9 |
| last measured `T_EP` | 125.6 | margin **11.6 min** | margin 64.3 min |

⚠️ **The trap this exposes:** a soft-budget stop finalizes the chain `completed_with_warnings`, which is on
`check-chain-verdict.js`'s GREEN ALLOWLIST. **A GREEN GH run therefore does NOT imply all 9 converted slugs
ran** — `refresh_snapshot` (26), `assert_data_bounds` (27), `assert_engine_health` (28) can each be recorded
`skipped: chain time budget reached (…)` behind a green check. CLOUDPARITY evidence MUST be read from the
per-step `pipeline_runs` rows, never from the workflow's green tick.

**All 9 converted slugs are in `chains.sources`** — `assert_schema`(2), `load_ravines`(6),
`link_parcel_addresses`(9), `compute_centroids`(10), `link_parcels`(11), `link_massing`(16), `link_wsib`(20),
`enrich_parcels`(22), `refresh_snapshot`(26) — so ONE sources run can satisfy the gate. `refresh_snapshot` at
position 26 is the one behind the budget cliff.

### 2. Pre-dispatch state to know

* **Two STRANDED `running` rows exist right now:** `4470` (`chain_sources`) and `4473`
  (`sources:address_points`), both from a 2026-09-09T03:23Z dispatch, age 1007 min. They are **past the 12h
  `isChainRunning` TTL** (`scripts/lib/chain-concurrency.js:32-42`; 03:23Z+12h = 15:23Z < now), so
  `check-chain-running.js sources` will NOT skip tonight's dispatch, and the dead process holds no advisory
  lock. **No operator UPDATE is required:** `sources:reconcile` (Spec 122 §7.4, `scripts/reconcile-runs.js`)
  reaps any `running` row older than **120 min** to `status='crashed'` at the head of the next sources chain.
  This is a NEW incident not yet in Spec 115 §9's stranding log — file it after the run.
* **`chain_deep_scrapes` 4530 is LIVE** (started 18:18:53Z, age 111.8 min at authoring; peers finished at
  117.2 / 123.2 min → expect terminal ~20:16-20:25Z). `deep_scrapes` **shares `refresh_snapshot`,
  `assert_data_bounds`, `assert_engine_health`** with `sources` (manifest-verified). Dispatching before 4530
  terminalises is scenario (d) by construction. **DO NOT DISPATCH until 4530 has a terminal status.**
* **The pushed commit is correct:** `HEAD:scripts/enrich-parcels.js` is the 41-line thin shell
  (`module.exports = pipeline.step(descriptor, compute)`), so `f3bab336` genuinely executes `runEnrichPhase`.
  `converted.json` at HEAD still carries `enrich-parcels.js` in `pending` (stage
  `shape_clean_pending_recapture`) — that is an **enforcement-scope list for the shape rule, not a runtime
  switch**, so registration state cannot change which code path runs. Per `tasks/lessons.md:176`, still assert
  `gh run view <id> --json headSha` == `git rev-parse origin/wf2/deep-scrapes-restore-l0` before trusting the run.

### 3. Failure scenarios → immediate action

| # | Scenario | Detect | Immediate action | Evidence to capture | CLOUDPARITY still satisfiable? |
|---|---|---|---|---|---|
| **(a)** | `enrich_parcels` outruns the budget: soft self-stop at 290 min, or the 300-min GH step kill | Soft: chain row `completed_with_warnings` + `records_meta.budget_stopped = {elapsed_min, budget_min, steps_skipped}` and `error_message = 'skipped: chain time budget reached (…)'` on the tail rows. Hard: chain row left `running`/ops-closed, `enrich_parcels` row never terminal | **Do NOT re-dispatch blind.** Read `records_meta.current_pass` / `last_heartbeat_at` on the `sources:enrich_parcels` row (EP-D12's dedicated autocommit `heartbeatClient` makes these visible mid-run for the FIRST time) and record which pass consumed the time. Then choose: (i) re-dispatch in a clean window if a contention confounder is identified; (ii) raise `SOURCES_STEP_TIMEOUT_MINUTES` (330 job / 300 step / 290 soft move together — a step can never outlive its job) as a separate WF3 with measured evidence; (iii) take the laptop fallback in §4 for the *measurement*, not the gate | GH run id + `headSha`; chain row id + all `sources:%` row ids; `enrich_parcels` `records_meta` (`current_pass`, `last_heartbeat_at`, `budget_stopped`, `pool_errors`); which of the 6 tail steps carry the budget `error_message`; overlapping chains from `pipeline_runs` in the same window | **NO** if `enrich_parcels` never terminalises or `refresh_snapshot` is budget-skipped — the gate needs all 9. Partial evidence is still filed under EP-D13 as the first genuine converted-runner cloud measurement |
| **(b)** | A step FAILs its verdict or throws | Chain row `completed_with_errors` (verdict FAIL folded in, `run-chain.js:580-589`) or `failed` (throw); `check-chain-verdict.js` exits 1 → GH red. `records_meta.step_verdicts` names the slug | Triage by slug: a FAIL on one of the **9 converted** slugs is a conversion defect → new EP-D/defect-ledger row + WF3 before any re-dispatch. A FAIL on an **unconverted** slug (e.g. `parcels`, `geocode_permits` — both routinely WARN) is pre-existing and does **not** invalidate the other slugs' rows | GH run id; the failing row's `records_meta.audit_table.rows[]` (the FAIL row's `metric`/`value`/`threshold`); `errors[]`/`checks_failed` (R-Q: FAIL-only counters); chain `records_meta.step_verdicts` | **PARTIALLY** — if the FAIL is on an unconverted slug and all 9 converted slugs produced PASS/WARN rows in the same `chain_run_id`, the gate's own text ("a green cloud verdict names all 9 slugs") is arguably met but the run is NOT green. **Treat as an Ask, not a judgement call** (see §5 option 3) |
| **(c)** | Runner eviction / cancel / job timeout (SIGKILL class) | GH run `cancelled`/`failure` with no logs near the wall; cloud rows left `status='running'` (Spec 115 §4 item 6's SIGINT/SIGTERM handler has now failed twice across 5 rows — assume it did not fire) | **Nothing urgent.** The rows do not block: 12h TTL. Do NOT hand-close them unless a dispatch is needed inside 12h — `sources:reconcile` reaps anything >120 min to `crashed` at the next chain start. If a same-day re-dispatch IS needed, use runbook §3b's guarded UPDATE (`WHERE id IN (…) AND status='running'`, `completed_at` REQUIRED, ops-time noted in `error_message`) and record the exact matched row count | GH run id + conclusion; every `running` row id (`SELECT id, pipeline, started_at FROM pipeline_runs WHERE status='running' ORDER BY id` — REPO-WIDE, `findStaleRunningRow` matches `chain_<id>` only and is blind to `sources:%` step rows); append the incident to Spec 115 §9's stranding log | **NO** for this attempt. Re-dispatch is the only path |
| **(d)** | A converted step SELF_SKIPs on lock contention (**VRD-SKIP**) | `status='self_skipped'`, `records_meta.skipped=true`, `reason='advisory_lock_held_elsewhere'`, `records_meta.ledger_row` present — **and `audit_table.verdict` reads `PASS`**, row-derived from two INFO rows (`scripts/lib/step/index.js:2955`, `:3503`; LM-D8/LR-D6). The chain, the verdict check, and the golden harness all read GREEN. Highest-risk slug: `refresh_snapshot`, contended by `deep_scrapes` | **This is the scenario a green tick hides — check for it explicitly on every one of the 9 slugs, every time:** `records_meta->>'skipped'` must be NULL and `status` must be `completed` for each. A `self_skipped` converted slug means **its evidence for this run does not exist**, regardless of the PASS verdict. Re-dispatch in a window with no overlapping chain | The `self_skipped` row's id + full `records_meta` (`skipped`, `reason`, `ledger_row`, `chain_run_id`); the CONTENDING chain's own rows in the same window; the standing MED followup (the golden harness hashing a SKIPPED run as PASS off another process's table) applies here — do NOT accept a golden capture from a self-skipped run | **NO for the skipped slug.** The gate needs 9/9 genuinely-executed rows. This scenario is the strongest argument for waiting out `chain_deep_scrapes` 4530 |

### 4. LAPTOP-TO-CLOUD fallback — VERDICT: it genuinely executes the converted runner, and it does NOT satisfy the gate

**Does it work? YES — verified by reading the code, not assumed.**

* `run-chain.js:228` calls `pipeline.createPool()`, whose FIRST branch is
  `if (!process.env.PG_HOST && process.env.SUPABASE_DATABASE_URL)` → connection string + pinned CA
  (`scripts/lib/pipeline.js:160-175`). It **never consults `DATABASE_URL`** (that is `resolve-db.js`'s
  precedence, `DATABASE_URL` → `SUPABASE_DATABASE_URL`, used by `migrate.js` / `step-validate.mjs` / 35 other
  tools). So for the CHAIN path the load-bearing pair is `PG_HOST` cleared + `SUPABASE_DATABASE_URL` set.
* **`statement_timeout` behaves identically to cloud** — `withPipelineStatementTimeout` wraps `pool.connect`
  with a once-per-client awaited session-level `SET statement_timeout` (default 0, `PIPELINE_STATEMENT_TIMEOUT_MS`
  override). That is the exact mechanism `tasks/lessons.md:82` proved is the ONLY one that survives Supavisor
  (startup-packet `options` and pg config params are silently dropped; the cloud session default is **2 min**).
  Same pooler, same code, same result. `keepAlive: true` + `keepAliveInitialDelayMillis` are set on both
  `createPool` and `createResolvedPool` (a reaped socket errors rather than hanging). The per-pass
  `SET LOCAL statement_timeout` / `lock_timeout` inside `runEnrichPhase`, and pass 5's per-batch
  `BEGIN` / `SET LOCAL` / `COMMIT` (commit 8 P9), are on the phase's own pinned client → unaffected by the pooler.
* **`STEP_RUN_ID` / `ctx.runId` wiring is CHAIN-ONLY, and the laptop chain reproduces it exactly.**
  `run-chain.js:658` injects `STEP_RUN_ID` (and `CHAIN_RUN_ID`, R-U) into each spawned child — same code path
  locally — so `records_meta.chain_run_id` is stamped and EP-D12's heartbeats have a row to address.
* **Concurrency is safe in both directions.** The laptop run INSERTs its own `chain_sources` row and takes
  `pg_try_advisory_lock(2, hashtext('chain_sources'))` on a pinned client; a GH dispatch during it would see the
  `running` row via `check-chain-running.js` (<12h) and skip, and would also fail to take the lock. The reverse
  holds too. **No GH 300-min step budget applies** — `CHAIN_TIME_BUDGET_MINUTES` is unset locally →
  `run-chain.js:468` reads 0 → the soft self-stop is **inert**. That is the fallback's one real advantage: an
  `enrich_parcels` that needs 200 min can finish.
* **No `--from` / `--only` flag exists — VERIFIED.** `run-chain.js` reads `process.argv[2]` (chainId),
  `process.argv[3]` (a numeric `externalRunId`), `--force`, and `--manifest=<path>` (test-only). There is no
  way to resume a chain part-way. Confirmed by exhaustive grep of every `process.argv` use in the file.
* No `.py` steps in `chains.sources` (verified) → no `python`-vs-`python3` Windows seam on this chain.

**Exact command lines (Git Bash, cwd = repo root, cloud-explicit):**

```bash
# 0. PRE-FLIGHT — never skip. Both MISSING and DRIFT are blockers (runbook section 3 rule 2).
cd /c/Users/User/Buildo
PG_HOST= node -r dotenv/config scripts/migrate.js --verify              # expect "0 missing, 0 drift"
PG_HOST= node -r dotenv/config scripts/check-chain-running.js sources   # expect skip=false

# 1. THE RUN — detached, because the interactive harness kills a foreground shell at ~10 min
#    (runbook section 3 rule 3; docs/runbook/scope_intensity_matrix_rekey_baseline_spike.md).
LOG=/c/Users/User/AppData/Local/Temp/sources_laptop_run.log
PG_HOST= PG_PORT= PG_DATABASE= SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem \
  nohup node -r dotenv/config scripts/run-chain.js sources > "$LOG" 2>&1 &
echo "pid=$!  log=$LOG"

# 2. VERIFY THE TARGET before walking away — the run's first log line MUST read:
#    target: ...pooler.supabase.com:5432/postgres -> database=postgres ... migrations=242
head -5 "$LOG"

# 3. POLL VIA THE DB, not the log (read-only, cloud-explicit):
#    SELECT id, pipeline, started_at, completed_at, status,
#           round(EXTRACT(EPOCH FROM (coalesce(completed_at,now())-started_at))/60.0,1) AS min,
#           records_meta->>'skipped' AS skipped,
#           records_meta->'audit_table'->>'verdict' AS verdict,
#           records_meta->>'current_pass' AS pass, records_meta->>'last_heartbeat_at' AS hb
#      FROM pipeline_runs WHERE pipeline LIKE 'sources:%' AND started_at > now() - interval '8 hours'
#     ORDER BY started_at;
```

⚠️ **THE `PG_HOST=` FORM IS NOT PORTABLE BETWEEN SHELLS — a live foot-gun.** Verified against the installed
`dotenv@17.4.2`: a **present-but-empty** `PG_HOST` is NOT overridden by dotenv (it assigns only keys absent
from `process.env`; measured 35 injected vs 36), and `createPool`'s test is `!process.env.PG_HOST`, so `''`
correctly falls through to `SUPABASE_DATABASE_URL`. But **in cmd.exe a `set PG_HOST=` line DELETES the
variable**, after which `-r dotenv/config` restores `PG_HOST` from `.env` and the whole chain silently
rewrites the **LOCAL** database (`tasks/lessons.md:87`, three prior wrong-DB incidents). If a `.cmd` wrapper is
used for the detached launch, it must NOT rely on the empty-value trick. **Prefer the Git Bash form above and
confirm the logged target line.** Note also that a `node -e "require('./scripts/run-chain.js')"` bootstrap —
which would let you `delete process.env.PG_HOST` in JS — **does not work**: `run-chain.js`'s CLI body is
guarded by `require.main === module`.

**Abort / rollback:**

* **Graceful (preferred, no orphans):** `UPDATE pipeline_runs SET status='cancelled' WHERE id=<chain row id>`.
  `run-chain.js` polls this BETWEEN steps and stops cleanly (cancel wins over the budget check by design,
  Guardian 2026-08-09). Nothing is rolled back mid-step — each step's own transaction either committed or did not.
* **Hard kill:** `kill <pid>` (Git Bash) / `Stop-Process -Id <pid>`. Consequences, stated plainly: the
  chain-level advisory lock releases when the connection drops; the in-flight step's transaction ROLLBACKs
  (passes 1-4 are ONE transaction; pass 5's per-batch transactions leave every already-COMMITted batch in place,
  which is idempotent-by-design and re-derived on the next run); `pipeline_runs` rows are left `running`.
  **Do NOT hand-close them** — `sources:reconcile` reaps anything >120 min to `crashed` at the next chain start
  (Spec 122 §7.4). Hand-close only if you must re-dispatch inside 12h, via runbook §3b's guarded UPDATE.
  `enrich_parcels` declares `recovery.interrupted` for its passes 4/5 retraction (Fold A-2, R-B), so an
  interrupted retraction forces FULL on the next run automatically.
* **Data rollback:** none available or needed — this is an idempotent `--full` enrichment, not a migration.

**Evidence it yields:** cloud `pipeline_runs` rows `chain_sources` + 28 × `sources:<slug>`, each carrying
`records_meta.chain_run_id` (R-U), `ledger_row='chain_owned'`, the full `audit_table` (row-derived verdict,
R-Q per-severity counters), `current_pass` / `last_heartbeat_at` (EP-D12) and `pool_errors`; the chain row's
`step_verdicts` roll-up; plus `chain-end-synthesis.mjs`'s artifact. **What it does NOT yield: a GitHub run id**,
a GH job log, or the `migrate --verify` + guard trail inside an audited workflow run.

**Single-step laptop run (`node scripts/enrich-parcels.js`) after a partially-successful GH run — verdict: DIAGNOSTIC ONLY.**

* **Prerequisites (manifest order):** the declared producer edge is exactly ONE —
  `inputs.reads.steps = [{step: "link_massing", version_pin: "gte"}]`. `version_pin` is **declared-only**
  (grep: no consumer anywhere in `scripts/lib/step/`), so nothing gates at runtime. The real prerequisites are
  DATA: `inputs.expect_nonempty: true` + `on_missing: "halt"` over `parcels`, `zoning_bylaw_areas`,
  `zoning_height_overlay`, `zoning_lot_coverage_overlay`, `parcel_buildings`, `neighbourhood_build_norms`,
  `neighbourhood_storey_norms`, `neighbourhoods`, `permits`. In chain order that means positions **1-21** must
  have landed — critically `parcels`(5), `link_parcel_addresses`(9), `compute_centroids`(10), `link_parcels`(11),
  `massing`(15), `link_massing`(16), `neighbourhoods`(17), `link_neighbourhoods`(18), `load_zoning`(21).
  `guards.requires` additionally hard-fails without PostGIS (R-W — no fallback path exists to select).
* **`--full` must be passed by hand.** `chain_args: {"sources": ["--full"]}` is applied by `run-chain.js:661`
  only; a standalone invocation gets no argv. R-L's `assertForceFullAuthorized` reads the manifest's
  `chain_args.sources` declaration (satisfied for this slug), but `explicitFull` still needs the flag present.
* **The ledger rows CANNOT be satisfied by a standalone run.** `ownsLedgerRow(chainId)` is `!chainId`
  (`scripts/lib/step/ledger.js:48-50`) and `chainId` comes from `process.env.PIPELINE_CHAIN`
  (`scripts/lib/step/index.js:2922`). Standalone → `owns=true` → the step opens its OWN row under
  `pipeline='enrich_parcels'` (**not** `sources:enrich_parcels`), stamps `ledger_row='owned'`, and
  `records_meta.chain_run_id = null` (R-U's declared standalone posture). `STEP_RUN_ID` is also absent, so the
  heartbeat path takes its null-`runId` skip. **A standalone step row is structurally distinguishable from a
  chain row and cannot be presented as one.** Setting `PIPELINE_CHAIN=sources` by hand would suppress the ledger
  row entirely (the step would expect an enclosing chain to own it) — worse, not better. Do not do it.

### 5. The ruling the operator must make

**Gate text, quoted verbatim** (`scripts/steps/_schema/programme-items.json`, item `CLOUDPARITY`, `evidence`):

> "CLOUDPARITY evidence for enrich_parcels' own cutover remains UNMET: commit 9 does not land until a green
> cloud verdict names all 9 slugs + **the GH run id** + each step's cloud pipeline_runs row id, from a run that
> genuinely executes the converted runner."

And commit 9's own row in this plan: "**(a) CLOUDPARITY** as a `cutover_prereq` with `applies_when` — seeds
applied + **one green cloud `chain-sources` run** recorded".

**Reading:** "the GH run id" is named as a REQUIRED element of the evidence, and "a green cloud verdict" keys on
`check-chain-verdict.js`'s allowlist, which only a workflow run produces. A laptop-driven
`node scripts/run-chain.js sources` against the cloud DB produces every OTHER element — 9 genuine
`sources:<slug>` rows sharing one `records_meta.chain_run_id`, and a chain row whose status that same allowlist
would pass — but **no GH run id**. As written, it does **not** satisfy the gate.

**Proposed default (Spec 124 §4 protocol — this pass is the DISCOVERER and therefore does NOT adjudicate; §4.2
is a policy rule, not a procedure step):**

1. **Default: the GH run id stays MANDATORY.** A laptop-driven converted-runner cloud run is admitted as a
   **DIAGNOSTIC** — it is the cheapest way to get the first genuine converted-runner cloud measurement of pass 5
   under the new 2000/5000 batch sizes with NO 300-min guillotine, which is exactly what EP-D13's "corrected
   measurement plan" is still missing — recorded in `defect-ledger.md` under EP-D13, explicitly NOT as gate
   satisfaction, and `CLOUDPARITY` stays `PARTIAL`.
2. **If the operator instead rules the laptop run sufficient**, that is an AMENDMENT and carries the §4 price in
   the same commit: (a) discoverer proposes / **a different, named + dated party adjudicates** (the operator);
   (b) recorded — as an `EP-D` ledger row if pilot-local, or promoted into Spec 124 §5's register if it is
   expected to recur for the other 7 slugs (it is: "the other 7 already-converted steps have STILL never
   completed a converted-form cloud run under this gate either"), which makes it estate-wide and forces a
   Spec 124 §2 amendment per §4.5; (c) **a rule without a lock is not yet a rule** (§4.4) — the amended
   `programme-items.json` text needs a both-directions test in `src/tests/programme-backlog.infra.test.ts` (red
   on the old wording, green on the new); (d) the amended evidence shape must state what REPLACES the GH run id.
   Proposed replacement: orchestrator identity (host + detached log path + the chain row id) **plus** the
   assertion that all 9 `sources:<slug>` rows share one non-null `chain_run_id` and none carries
   `records_meta.skipped`.
3. **A third, narrower option worth naming:** accept a GH run that went RED **only** on an unconverted slug
   (scenario (b)) provided all 9 converted slugs produced non-skipped rows under one `chain_run_id`. This is a
   smaller amendment than (2) and would have salvaged more than one past attempt. Also an Ask, not a call this
   pass may make.

**ASK (blocks commit 9, not tonight's dispatch):** Does a laptop-driven converted-runner run against the cloud DB
satisfy CLOUDPARITY — **default NO** (diagnostic only, per 1) — and if the answer is YES, which of the §4
amendment obligations (2a-2d) rides which commit?

### 6. Timing — the window tonight

| fact | value |
|---|---|
| now | 2026-09-09 20:10Z |
| blocker: `chain_deep_scrapes` 4530 | started 18:18:53Z; peers 117.2 / 123.2 min → **expect terminal ~20:16-20:25Z** |
| next `chain-entities` | cron `0 8 * * *` → **2026-09-10 08:00Z** (observed starts drift later: 12:42Z / 12:49Z). Measured duration 0.0 min on both recent runs → contention risk ~nil |
| next `chain-coa-permits` | cron `0 11 * * *` → **2026-09-10 11:00Z** (observed starts 15:00Z / 15:03Z — a consistent ~+4h GH scheduling drift; plan against the CRON, not the observation). Measured `chain_permits` 134.9 / 198.0 min. **This is the binding constraint** — it was the 09-08 confounder |
| next `chain-deep-scrapes` | cron `0 15 * * 1-5` → 2026-09-10 15:00Z (weekday) — not binding |
| worst-case chain need | 330 min (job ceiling, incl. ~30 min reserved job overhead); 300 min chain-step ceiling; 290 min soft self-stop |
| **latest safe dispatch (worst case)** | 11:00Z − 330 min = **2026-09-10 05:30Z** |
| latest safe dispatch (300-min chain + ~8 min real overhead) | 05:52Z |
| latest safe dispatch (measured 278.4-min shape) | 06:14Z |
| **RECOMMENDED dispatch** | **as soon as 4530 terminalises, ~20:30Z tonight** → expected finish ~01:10Z on the measured shape, **~9.8 h of clearance** before the coa cron. Every hour of delay is spent margin, not saved |

### 7. Low-confidence list

1. **The ~+4h gap between the committed crons and observed scheduled start times** (coa 11:00Z vs 15:00-15:03Z;
   entities 08:00Z vs 12:42-12:49Z, twice each) is unexplained. Two samples per chain is not a pattern I would
   defend. Deliberately planned against the CRON as worst case; if the drift is real and stable the window is
   ~4h larger than stated. **Not verified out-of-band** (`gh api …/actions/workflows` not consulted this pass).
2. **`T_pre` (steps 1-21) is genuinely bimodal** — 58.4 vs 111.1 min across two consecutive runs — and which
   regime tonight lands in is unknown. The 33.5-min post-`enrich_parcels` gap and the 41.7-min tail are each from
   ONE clean run (4309). Every derived threshold in §1 inherits that.
3. **`enrich_parcels`'s cloud duration under the CONVERTED runner is completely unmeasured.** All 4 completed
   figures (111.7-135.6) are the LEGACY script. The 2000/5000 batch sizes are expected to cut pass-5 round trips
   ~2,200 → ~220, but the direction and size of the net effect on wall time is a prediction, not a measurement —
   and P9's per-batch transactions add a COMMIT per batch in exchange.
4. **Why 4470 died in `address_points` at 03:23Z today is unknown** — not investigated this pass (no GH log read,
   no `records_meta` inspection on row 4473). If that failure mode is systemic rather than a one-off, tonight's
   run may not even reach `enrich_parcels`, and none of §1's arithmetic applies.
5. **Whether a budget-stopped or partially-red run's evidence is *usable*** is exactly the §5 Ask — a default is
   stated, not a ruling; §4.2 forbids this pass from adjudicating its own finding.
6. **The cmd.exe `set PG_HOST=` foot-gun is reasoned** from dotenv's assign-if-absent semantics plus cmd's
   delete-on-empty semantics, and from the MEASURED Git Bash case (35 vs 36 injected). The cmd.exe path itself
   was NOT executed. Treat the Git Bash form as the proven one.
7. **`check-chain-verdict.js`'s treatment of a `self_skipped` step row** was read from its docblock and the green
   allowlist, not exercised. The claim "a VRD-SKIP reads green end-to-end" rests on the row-derived PASS verdict
   (`index.js:2955`, LM-D8's live 2026-08-27 demonstration) plus `completed_with_warnings` being allowlisted —
   the verdict checker was not run against a synthetic self-skipped row.


## Status at session close 2026-09-11
- CLOUDPARITY MET: GH run 34506962436 (headSha 0820685d) SUCCESS; chain completed_with_warnings 204 min; all 9 converted slugs completed, none skipped; enrich_parcels row 4588 completed 142.7 min, WARN (2 declared rows), checks_failed 0.
- Commit 8 complete; EP-D14/D15/D16/D17 landed (0820685d…bc81ac84). All 5 EP-PIN cutover_prereq BUILT except EP-PIN-D17 (PARTIAL: pre-dispatch dead_ratio=0 recorded 2026-09-11; flips on one green run).
- Commit 9 IN PROGRESS in worktree agent-a3c38533a6bc657eb (local --full golden recapture for G8), lands next session with RE-FREEZE #5 (§8 pointer line + 122a §A9 paragraph), STD-7 → BUILT, CLOUDPARITY → BUILT.
- Operator pre-approved the next production run (attempt #3) for the next session.

## Status 2026-09-11 — commit 9 landing in the MAIN tree (orchestrator session)
- Worktree `agent-a3c38533a6bc657eb` (base `0820685d`) NOT reused: 13 commits behind HEAD `bc81ac84`; its recapture fingerprint `501ce326` is stale against HEAD's `0501de76` because EP-D17 (`d9a90035`) edited the descriptor after it ran (Spec 122 §5.3 R-C; Spec 123 §7 row 5 — recapture with the named cause = EP-D17). Hand edits ported by patch; this plan file kept the main-tree version.
- Local recapture at HEAD, detached, target 127.0.0.1:54322/postgres (migration 247 applied locally first; `migrate --verify` 0 drift): `capture-step-golden --chain=sources --args=--full` → `post/sources_run1.json`, then `--chain=none` → `post/none_incremental.json`. Descriptor now emits 6 invariants (+`parcels_dead_tuple_ratio`), `sys_<entry>_duration_ms` rows and `sys_maintenance_parcels_*` rows — every new diff leaf is cited by name in the assessment report's commit-9 section (G8 rule).
- **Operator ruling (Spec 124 §4) — EP-PIN-D17 re-pointed:** `gate.blocks` `enrich_parcels` → `assert_data_bounds` (batch 1 lead). A dedicated third ~270-min chain-sources run solely to flip EP-PIN-D17 was REFUSED ("we just did this yesterday"): run 34506962436 (headSha `0820685d`) already proved CLOUDPARITY; EP-D17 is a cost fix; its cloud proof rides batch 1's own R-AB acceptance run. Crons untouched (no cloud window opened today). Recorded in `programme-items.json` EP-PIN-D17 evidence.
- RE-FREEZE #5 paid (`template-freeze.json` ENRICHER proven, frozen_at `bc81ac84`, snapshot = FREEZE-1 only; Spec 122 §8 line + 122a §A9 paragraph; test pin flipped). STD-7 → BUILT, CLOUDPARITY → BUILT. Census row for enrich_parcels retired (its own reason text named commit 9); roadmap 55 files / 57 slugs / 0 pending. Spec 65 §2 conversion bullet; Spec 78 = N-A (nothing in it changes). Blocks batching: 1.
- Still open before push: mig 247 cloud apply (dry-run 34544668362 waiting on the deployment gate — operator approves); FREEZE-1 phase 2 is the next WF after this commit.
- Cloud 12:24Z: migration 247 APPLIED on the cloud (run 34598594544, headSha bc81ac84; verify 0 drift; 244 migrations; reloptions live; parcels dead_ratio 0.000; no stranded rows). Evidence appended to EP-PIN-D17.
