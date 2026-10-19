# SPEC 130 — link_parcel_abutments (parcel abutments)

**Status:** PROPOSED 2026-10-08 (McBylaw Phase 2 inputs B; WF1 plan `.cursor/wf1_mcbylaw_phase2_inputs_active_task.md`, operator-approved 2026-10-08)

**Archetype:** LINK · **Advisory lock:** 130 · **Chain:** `sources` (phase 24, after `compute_parcel_cost_estimates`) · **Descriptor:** `scripts/link-parcel-abutments.descriptor.json` · **Migration:** `migrations/255_parcel_abutments.sql`

---

<requirements>
## 1. Goal & User Story

Build one junction of abutting lots — `parcel_abutments` — that serves three Phase 3 K9 structural causes at once: front-yard averaging under 10.5.40.70(1)(A)/(B) (**195,264** cells), an adjacent lot fronting a flanking street (**28,560** cells), and one abutting building (**9,468** cells). Today none of the three has a producer: the neighbouring lots of a parcel are not materialized anywhere, so McBylaw cannot average front yards or ask what sits beside a lot.

The step records **observations only**. Applicability — whether one, two, several or no abutting lots count for the clause — stays McBylaw's, derived on read from these rows and the logic variables. The plan is one junction for three consumers: the marginal cost of the second and third cause is a read, not another step.
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema

`parcel_abutments` (**migration 255**), one row per **ORDERED** pair (both `(a, b)` and `(b, a)` are stored; the attributes are the neighbour's, seen from the subject):

| Column | Type | Notes |
|---|---|---|
| `parcel_id` | INTEGER NOT NULL | FK → `parcels(id) ON DELETE CASCADE` |
| `neighbour_id` | INTEGER NOT NULL | FK → `parcels(id) ON DELETE CASCADE` |
| `shared_len_m` | NUMERIC(10,2) NOT NULL | CHECK `>= 0`; shared boundary length in EPSG 2952 metres |
| `same_frontage_street` | BOOLEAN NULL | `parcels.primary_frontage_street_name` equal for both; NULL when either is NULL |
| `neighbour_residential` | BOOLEAN NOT NULL | neighbour `zoning_class` in the Residential Zone category (R, RD, RS, RT, RM) |
| `neighbour_building_id` | INTEGER NULL | the neighbour's primary building; FK-EXEMPT (an observation, rewritten by the next link run; a FK would block footprint reloads) |
| `bldg_to_subject_m` | NUMERIC(10,2) NULL | distance from the neighbour primary footprint to the subject lot; CHECK `>= 0` or NULL |
| `front_setback_est_m` | NUMERIC(10,2) NULL | advisory estimated neighbour front setback; NULL unless `est_status = 'estimated'` |
| `est_status` | TEXT NOT NULL | closed set, below |
| `linked_at` | TIMESTAMPTZ NOT NULL | run clock, never a guard term |

Keys and constraints: PRIMARY KEY `(parcel_id, neighbour_id)`; index `idx_parcel_abutments_neighbour` on `(neighbour_id)`; CHECK `parcel_id <> neighbour_id` (no self pair); CHECK `(est_status = 'estimated') = (front_setback_est_m IS NOT NULL)` (an estimate iff `estimated`); CHECK `est_status = 'no_building' OR neighbour_building_id IS NOT NULL` (a building is recorded unless the issue is that there is none).

`est_status` is a **closed** set of six values: `estimated` · `no_building` · `no_frontage_street` · `street_not_found` · `estimate_negative` · `estimate_out_of_bounds`.

Expected size: about **1.0 M rows** (2.3 pairs per lot, inferred) over roughly 440 K lots; the exact figure is measured at the first capture. The table is new and empty, so indexes are created non-CONCURRENTLY.

### Implementation

Step files (all new, under `scripts/`): the shell step, the descriptor above, `scripts/lib/compute/link-parcel-abutments.js`, and the notes file `scripts/link-parcel-abutments.notes.json` (the fleet convention: the notes sidecar sits beside its descriptor).

**Neighbour discovery.** Neighbours are found in the GiST bbox-pad join (`abut_bbox_pad_deg`) filtered by `ST_DWithin` on geography within `abut_touch_tolerance_m`; a pair qualifies only when its **symmetric shared length, buffer inflation `2·tol` subtracted**, is at least `abut_min_shared_len_m` — measured ONCE per unordered pair in EPSG 2952, so point-touch is excluded and the two orientations of a pair can never be kept and dropped independently. Every batch emits **both orientations** for each pair it derives.

**Neighbour attributes.** The neighbour's primary building is `parcel_buildings.is_primary` joined to `building_footprints`; `bldg_to_subject_m` is the distance from that footprint to the subject lot. `front_setback_est_m` is `dist(neighbour footprint, neighbour frontage centreline) - dist(neighbour lot, neighbour frontage centreline)` in EPSG 2952 metres, with the frontage centreline selected from `toronto_centreline` by `primary_frontage_street_name` (`abut_street_search_deg`). This is method **v2**, measured 2026-10-07 as 2 of 9 within 0.5 m on the CoA-notice oracle: it is **advisory**, fidelity `differs` (Spec 69 M-26 — a massing outline is not a main wall, 800.50), and its status is recorded per row in `est_status`.

### Step Shape

- **Slug** `link_parcel_abutments`; archetype LINK; `execution.shape: link`; advisory lock **130**; `txn_scope: batch`; batch 250 parcels (the library upsert binds one batch in one statement; at ~6.7 ordered pairs per parcel × 10 columns, 1,000 parcels = ~67 K parameters > the PostgreSQL 65,535 bind limit — measured 2026-10-16, H6 step 5; at 250 the worst batch measured 1,292 pairs ≈ 2,584 rows ≈ 25.8 K parameters, a 2.5× margin; the INGESTOR fleet sizes batches to the same limit). First capture (2026-10-16): 1,674,348 ordered rows over 495,920 parcels (3.38 per parcel; Spec 130 had inferred ~2.3 pairs/lot), max 251 neighbours on one parcel, 0 asymmetric; est_status estimated 1,510,411 · no_frontage_street 60,954 · estimate_out_of_bounds 50,629 · estimate_negative 47,716 · no_building 4,638; run 6.3 min, rerun 0 writes. `step_timeout: 45m`; `statement_timeout: none`.
- **Writes** `parcel_abutments` by **guarded upsert** keyed `(parcel_id, neighbour_id)`, guard `IS DISTINCT FROM` over every value column (`shared_len_m`, `same_frontage_street`, `neighbour_residential`, `neighbour_building_id`, `bldg_to_subject_m`, `front_setback_est_m`, `est_status`) — `linked_at` is the run clock and is never a guard term (LG-9). Distances are rounded to the column scale so the guard is stable. An unchanged re-run writes zero rows.
- **Full rescan (H6 port 2026-10-14; Q-B3 adjudicated full rescan 2026-10-14):** `staleness.mode_select: "none"` (O4 row 5 full_rescan): every run walks every parcel with geometry and re-derives every pair through the guarded upsert; `retract: none`, no incremental mode, no `FORCE_FULL` override (retired with the tri-state gate). The declared triggers (`code_version` + the `parcels` / `building_footprints` / `toronto_centreline` counts) are measured for observation only. Producer edges are declared as watermark `staleness.pins[]` (link_massing, enrich_centreline, enrich_parcels — not evaluated). A pair that stops qualifying only because a tunable or the method changed is not retracted by a re-run (recorded limitation; `recovery.reset`). Replaces the 2026-10-08 tri-state gate, whose incremental predicate read `pipeline_runs` from compute (Spec 124 R-BZ G1).
- **Junction-delete trigger (R-CR; a `guards.requires` presence precondition, not an `outputs.invalidates` row — the value columns are `full_rescan`; RLS enabled, Spec 114 Class B):** the migration-255 trigger `trg_parcels_abutments_invalidation` — an `AFTER UPDATE OF geom ON parcels` trigger with `WHEN (public.parcels_geom_materially_changed(OLD.geom, NEW.geom))` — deletes the parcel's pairs in **both** orientations; the full re-derive re-creates those that still abut. It is a separate trigger; the 242-254 function `trg_parcels_invalidate_on_geom_change()` is untouched.
- **Chain placement:** chain `sources`, phase 24, after `compute_parcel_cost_estimates` (operator 2026-10-16; `sharing.varies_by_chain.phase.sources: 24`, no renumbering) — it needs `parcels.primary_frontage_street_name` and `parcels.zoning_class`, both written by the enrichment cascade. `execution.invocation.sources` (`PIPELINE_CHAIN=sources`) carries no args.
- **Guards (fail):** PostGIS, `idx_parcels_geom_gist`, `idx_toronto_centreline_geom_gist`, and the invalidation trigger. SRID 4326.
- **Checks (all INFO/WARN, non-blocking):** `full_mode_gate` (PRE — records the gate: full / full_rescan); `parcels_processed`; `abutment_rows_written`; `asymmetric_pairs` (WARN — the pair set must be symmetric table-wide after every run); `est_status_counts`; `parcels_with_abutments_pct`. A WARN lands the `linked_with_warnings` terminal; every other path is `linked`, `no_eligible_parcels`, `failed_missing_precondition` or `lock_held_elsewhere`.

### Cutover (as-built 2026-10-18, phase-4 step 0)

`npm run cutover -- --step=link_parcel_abutments`: registered in `scripts/steps/_schema/converted.json` converted[], its `pending[]` entry deleted in the same commit; the census row RETAINED with `status: converted`, `converted_at: commit-3` (Spec 124 R-K, R-AO). Net-new: no legacy PRE (`legacy: "none"`, Spec 124 R-DK), so G8 compares each POST with the committed POST. Its 7 logic variables join `assert_schema`'s `declared_logic_variables_present` probe list (Spec 122 R-D), and assert_schema's four POSTs were retaken the same day. Admin surface registered (R-DL).

### Logic Variables

`abut_touch_tolerance_m`, `abut_min_shared_len_m`, `abut_bbox_pad_deg`, `abut_street_search_deg`, `fya_est_min_m`, `fya_est_max_m`, and (read by McBylaw, not by this step) `fya_neighbour_max_dist_m` = 15.0 and `fya_oracle_tol_m` = 0.5. Variables are hoisted above the gate; validation is strict.
</architecture>

---

<behavior>
## 4. Behavioral Contract

- **Inputs:** a chain run (or a direct invocation) of `link_parcel_abutments`; reads `parcels`, `parcel_buildings`, `building_footprints`, `toronto_centreline`; no network, no externals; `expect_nonempty: true`, `on_missing: halt`.
- **Core Logic:**
  1. Guards: advisory lock 130, extension/index/trigger preconditions, then the full_rescan gate.
  2. Select every parcel with geometry (keyset batches); no retraction.
  3. Per batch: find neighbour candidates by bbox pad + `ST_DWithin`, measure shared boundary length in EPSG 2952, drop pairs below `abut_min_shared_len_m`; emit both orientations.
  4. Per pair: resolve the neighbour's primary building and `bldg_to_subject_m`; measure the neighbour's frontage centreline and the advisory `front_setback_est_m`; stamp `est_status`; write through the guard.
  5. After the loop: the six checks, including the table-wide symmetry check.
- **Outputs:** rows in `parcel_abutments`; a `pipeline_runs` audit row with the mode reason, the processed/written counters and the `est_status` census.
- **Edge Cases:** no primary building for the neighbour → `no_building`, `neighbour_building_id` NULL; no frontage street name → `no_frontage_street`; no matching centreline within `abut_street_search_deg` → `street_not_found`; estimate below `fya_est_min_m` → `estimate_negative`; estimate above `fya_est_max_m` → `estimate_out_of_bounds`; a material parcel geometry edit mid-cycle → the trigger deletes both orientations and the next run re-derives the parcel; a relinked primary building or a renamed frontage street is picked up by the next run (every run is a full re-derive).

### Applicability Belongs to McBylaw, Not to This Step

This step stores observations. The front-yard-averaging question — which neighbours count, and how many — is derived **on read** by McBylaw from `parcel_abutments` and the logic variables:

- the closed applicability set is `fya_none` · `fya_one` · `fya_two` · `fya_ambiguous_multi` · `fya_input_missing`, derived on read;
- the neighbour distance test is `fya_neighbour_max_dist_m` = **15.0** m (`bldg_to_subject_m`, per 10.5.40.70(1));
- ~~Layer 2 emits `not_evaluated:front_averaging_unavailable` for `fya_one` and `fya_two` until **Q-B1** closes (the estimator is not trusted yet); the 6.0 m default applies only for `fya_none`.~~ **Amended 2026-10-19 (operator ruling; Spec 69a M-205(1) dated note; Spec 131 LC-58):** `fya_one` / `fya_two` with every estimate `estimated` take max(average + `fya_porch_allowance_m`, the zone default), basis `averaged_one` / `averaged_two`, always "needs survey" (`front_yard_needs_survey`); otherwise (and for `fya_ambiguous_multi`) the zone default, basis `zone_default_needs_survey`, `front_yard_not_measured`. Resolved on read by `scripts/analysis/bylaw/front-averaging.mjs`.
</behavior>

---

<testing>
## 5. Testing Mandate

<!-- TEST_INJECT_START -->
- **Infra:** `src/tests/migration-255-parcel-abutments.infra.test.ts` — SQL-shape regression-lock for migration 255: table, FKs, key, the three CHECKs, the index, the invalidation trigger + function body, the untouched 242-254 function, the comments-only DOWN, `validateMigration(...).ok === true`.
- **Logic:** `src/tests/steps/link_parcel_abutments/violations.test.ts` — the compute library's edges: shared-length threshold (point-touch excluded), both orientations emitted, each `est_status` arm, the guard's zero-write idempotent re-run, and the `asymmetric_pairs` check on a deliberately partial write.
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `link_parcel_abutments` — LINK · converted · owner specs: 130
  - `scripts/link-parcel-abutments.js`
  - `scripts/link-parcel-abutments.descriptor.json`
  - `scripts/link-parcel-abutments.notes.json`
  - `scripts/lib/compute/link-parcel-abutments.js`
  - `src/tests/steps/link_parcel_abutments/violations.test.ts`
  - `src/tests/steps/link_parcel_abutments/witness-adoption.logic.test.ts`
  - data (descriptor): `building_footprints` reads (migrations/023_building_footprints.sql); `parcel_abutments` writes (migrations/255_parcel_abutments.sql); `parcel_buildings` reads (migrations/024_parcel_buildings.sql); `parcels` reads (migrations/011_parcels.sql); `toronto_centreline` reads (migrations/173_create_toronto_centreline.sql)
  - upstream: enrich_centreline · enrich_parcels · link_massing · load_centreline · massing · parcels
  - downstream: none
  - consumers: link_parcel_abutments (records_meta building_footprints_count) · link_parcel_abutments (records_meta centreline_count) · link_parcel_abutments (records_meta code_version) · link_parcel_abutments (records_meta parcels_count)
<!-- /generated:target-files -->
- `migrations/255_parcel_abutments.sql`

### Out-of-Scope Files
- `src/lib/mcbylaw/**` — the on-read applicability derivation (`fya_*`) is Spec 68/69 work, not this step's. This step never decides whether a neighbour counts.
- `scripts/lib/compute/enrich-parcels.js` — the enrichment cascade this step reads; it is upstream, and this step adds nothing to it.
- `migrations/242_*`–`254_*` — earlier migrations are closed; migration 255 must not touch their objects.

### Cross-Spec Dependencies
- **Relies on:** Spec 55 (`parcels`), Spec 56 (`building_footprints`, `parcel_buildings`), Spec 62 (`toronto_centreline`, `primary_frontage_street_name`), Spec 65 (`enrich_parcels`, `zoning_class`), Spec 124 R-CR (the junction-delete trigger, a presence-checked precondition), Spec 124 (descriptor), Spec 47 §A.5 (lock 130).
- **Consumed by:** Spec 68 (the By-law Table Standard — this is a declared input row), Spec 69 (the McBylaw evaluator, M-26 fidelity), Spec 122/124 (step standard and descriptor), and downstream the Phase 3 K9 causes `front_yard_averaging`, `flanking_street_neighbour`, `one_abutting_building`.

### Open Questions
- **Q-B1** — the CoA-notice oracle tolerance for `front_setback_est_m` (`fya_oracle_tol_m` 0.5 m, n ≥ 100 parcels). Until it closes, one/two-neighbour front averaging is `not_evaluated:front_averaging_unavailable`. **Measured 2026-10-19 (`scripts/analysis/bylaw-validation/front-setback-oracle.cjs`, report `docs/reports/2026-10-19-front-setback-reliability.md`):** n = 219 CoA notices citing averaging: the estimate is at or below the examiner's figure 89.0 % of the time (median error 1.10 m, 26.9 % within 0.5 m); max(estimate + 1.0 m, 6.0 m) has mean error 1.39 m, 54.8 % within 1 m, and is below the examiner's figure (too generous) on 22.4 % (20.5 % by more than 0.05 m); 6.0 m alone: mean error 2.53 m, too generous on 63.9 %. The tolerance test is not met, so the estimate is used only as max(estimate + porch allowance, zone default) with "needs survey" (LC-58); Q-B1 stays open for a better estimator.
- **Q-B2** — the ≥ 3 same-street abutters case: does it widen or fail the front-average set, and does it need its own applicability token?
- ~~**Q-B3**~~ **CLOSED 2026-10-14 — full rescan** (orchestrator under the operator standing rule; QUEUE 2026-10-14). The LINK posture. H6 port (2026-10-14) implements the no-guess option: O4 row 5 full_rescan without the keyed per-batch delete (parcel_abutments has no primary-clear / lost-link flag for `resolveKeyedLinkTargets`); pair existence is invalidated by the migration-255 trigger and the FK cascade. No descriptor deviation (H6 QA ruling 2026-10-16 item 5: R-BM, Spec 124 §5, already allows a LINK with `mode_select: "none"` and a `full_rescan` invalidator, and the keyed delete is optional in the library; the no-retraction cost is the declared limitation, item 3). The full re-derive budget (≤ 30 min) is measured at the first capture.
</constraints>
