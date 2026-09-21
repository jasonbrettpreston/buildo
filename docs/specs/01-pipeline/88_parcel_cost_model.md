# Spec 88 — Parcel Renovation Cost Model

**Status:** ACTIVE (P1 shipped / DB-populated — committed `8a3a364` + pushed + dev DB populated, 2026-06-30). Design-of-record: `docs/reports/wf1-parcel-renovation-cost-model.md`.
**Domain:** Backend/Pipeline. **Advisory lock:** 117 (owning-spec lock 88 is taken by classify-permits.js — predates the spec-number convention; 117 assigned from the post-Wave-7 free range per the compute-phase-calibration precedent). **CORRECTED 2026-09-21 (batch-2 row 2.4 O1 peel):** the audit `phase` does NOT carry the spec number — see the as-built section below; the sentence above was itself a stale claim (`descriptor.identity.why_lock`'s own trailing sentence made the identical false claim and is likewise corrected).

## Implementation reconciliation (as-built — 2026-09-21)

### batch-2 row 2.4 — `compute-parcel-cost-estimates.js` converted onto the Spec 122 ENRICHER runner (18th converted step, ENRICHER 5/5)

Commits landing this conversion (COMPRESSED 3-commit form, Spec 124 R-PACE-1): ① assessment + red suite + PRE goldens + the legacy differential evidence, ② descriptor + compute + frozen shell + 19 seeded variables, 2c the output-panel peel (O1–O4 below), ③ cutover (this commit). What was a 752-line `pipeline.run` script is now a 9-line frozen shell (Spec 122 §5.1, `ADVISORY_LOCK_ID = 117` retained as a §5.4 source-text constant); the behaviour lives in `scripts/compute-parcel-cost-estimates.descriptor.json` (declared data) + `scripts/lib/compute/compute-parcel-cost-estimates.js` (the pricing pass, freshness/per-zone post-phase, and the 20 check observers) + `scripts/lib/step/` (pool, lock, ledger, config, the class-N write executor, verdict and emits).

- **`audit_table.phase` — fleet-standard renumbering, O1 ruled (grounded against 3 siblings' own PRE/POST goldens, not chosen unilaterally).** The legacy audit table's `phase` key carried this step's **owning spec number (88)** — a convention pre-dating the conversion programme. Every converted ENRICHER/LINK sibling renumbers `phase` at conversion time from that legacy value to the **chain phase index** declared in `sharing.varies_by_chain.phase` (e.g. `enrich_heritage` 62→13, `enrich_ravines` 60→12 — both measured against their own PRE/POST golden captures). This step's `phase` moves **88 → 1** (`varies_by_chain.phase.sources: 1`), conforming to the fleet standard rather than departing from it. Rendered to operators by `src/components/FreshnessTimeline.tsx` (`Phase {at.phase}`).
- **Run-ledger gate — CPCE-A1 RULED (Spec 124 R-AR.1), knowingly retired as a mechanism.** The legacy's Phase-B-B3 run-ledger gate (`runLedgerGateDecision` + `OWN_SLUGS`/`UPSTREAM_SLUGS` + `buildSkipGateRecordsMeta`) and its C1/C2 own-version-signal companion had no §2.11 documentation anywhere in this spec (D1 below) — `runEnrichPhase` has no `ledgerGatedSkip` call and this step has no lineage-stamp column to hold a Layer-2 predicate, so the enrich_heritage-style Layer-1→Layer-2 remedy is structurally unavailable here. Every scheduled run now streams the whole declared R% population; the 16-column `IS DISTINCT FROM` write guard keeps steady-state re-write cost low. The version-signal stamps (`rates_as_of`/`index_updated_at`) SURVIVE as `emits[]`-only observability. The cloud no-op cost of this retirement is UNMEASURED and carried as a declared risk (`limitations[]`), resolved at the end-of-batch cloud proof.
- **`--dry-run`/`--limit=N` argv flags and the `COMPUTE_PARCEL_COST_FORCE_FULL` env escape hatch — RETIRED as a declared deviation.** F15's only purpose (bypassing the run-ledger gate) no longer exists once CPCE-A1 retires the gate; `override.dry_run:"none"`/`force_full:"none"` match all five converted ENRICHER siblings. `manifest.json` still declares `supports_dry_run: true` for this slug — a declared, carried mismatch (batch row 2.5's pricing-surface interim and row 2.6's dry-run interim, per Spec 124's post-2.2 amendment, are where this reconciles; not this cutover).
- **Escalation-index atomic read — FOLD-V9(2) binding amendment.** The legacy's D#3 atomic co-read of the escalation-index VALUE and its version stamp (one query, inside the advisory lock) is narrowed: the PRICED value is now `ctx.config.cost_escalation_index` (declared, LM-D15-validated, hoisted above the lock per Spec 122 §1.2a P4 — a defaulted/ad hoc re-read would make the compute module's own literal-scan test and its engine signature contradict each other). `readCostContract`'s own re-read of the same `logic_variables` row is retained ONLY for the `index_updated_at` version stamp. Because `runEnrichPhase` itself executes inside `pipeline.withAdvisoryLock`, the contract-read hook still runs under the same lock the legacy's D#3 read did — the torn-read window this fence existed to close is not re-opened for the concurrent-edit case.
- **19 declared `config.logic_variables[]` (all `on_invalid:"fail"`):** 3 pre-existing-but-previously-unseeded keys (`cost_escalation_index`, `cost_rates_stale_months`, `cost_index_stale_months` — live in the DB since 2026-06-30 but absent from `scripts/seeds/logic_variables.json` until this conversion, the LM-D15 condition) + 16 new `compute_parcel_cost_*` keys (runner-profile, engine tunables threaded through `scripts/lib/parcel-cost.js`'s now-required `opts.config`, and 3 plausibility bounds).
- **20 declared checks**, incl. `cost_rates_stale`/`cost_index_stale` (numeric severity code for scoring, human-readable `detail` for the rendered audit row — `verdict.js#checkRow` prefers `observation.detail`), 13 `line_coverage_*` INFO checks (both-directions proof at load time against `PARCEL_COST_LINES`), 3 plausibility-derived bound checks, and (CPCE-D4, closed at the O3 output-panel peel) `fsi_implausible_count`/`new_build_fallback_count` — both computed by the engine but originally dropped by the conversion (reached neither `records_meta` nor the audit table); restored as INFO checks, matching the legacy's own audit-row shape exactly (an audit row, never a `records_meta` flat key — the legacy never put them there either).
- **Kill-mid-run guarantee:** unlike a shared-txn ENRICHER, this step has NO shared transaction (`execution.txn_scope:"none"`) — each `ctx.flushBatch` call is its own short transaction, so a run killed mid-stream leaves already-flushed batches COMMITTED (`execution.partial_fill:"staged"`). `recovery.interrupted:"none"` is the honest value: `staleness.scope` is unconditionally `"all"`, so the very next run re-streams and re-prices every row regardless of whether the prior run was interrupted. Proven by `src/tests/db/compute-parcel-cost-kill-mid-run.db.test.ts` (`pg_cancel_backend`, not a process kill).
- **Golden differential — a COMMITTED PERTURBATION COHORT, not a forced FULL** (the same class as `enrich_heritage`/`enrich_ravines`'s own differentials): `scripts/analysis/compute-parcel-cost-cohort-differential.js` + `docs/reports/golden/compute_parcel_cost_estimates/differential/cohort.json` (1,006 perturb ids + 50 negative-control ids), run against both the legacy (worktree) and converted (main-tree) arms, asserting `records_updated === 1006`, a whole-table projected hash back at baseline, and the negative control untouched, with an unconditional restore bracket.
- **Measured (2026-09-21, local dev DB):** legacy full-run ≈150s (corrected §11 budget); PRE/POST golden `table_state` hash byte-identical; differential baseline/perturbed hashes both arms match; kill-mid-run 1/1 PASS.

**The eight measured spec-vs-code disagreements found grounding this reconciliation (D1–D8) are CORRECTED IN PROSE below** — owner-spec reconciliation pass, 2026-09-21, re-verified against the LANDED descriptor / compute module / engine / POST golden rather than against the cutover-time notes (prose only; no behaviour change, no `checks[]`/descriptor edit):

| # | Was | Corrected in |
|---|---|---|
| **D1** | §2.11 never documented the Phase-B-B3 run-ledger gate / SKIP summary / `COMPUTE_PARCEL_COST_FORCE_FULL` escape hatch (only Spec 43 Core-Logic item 10 did), and never contemplated a `records_total: 0` SKIP run | **§2.11** — the gate is RETIRED (CPCE-A1, above), so the spec states the landed **no-skip** contract instead of documenting a mechanism that no longer exists |
| **D2** | `FSI_MAX_PLAUSIBLE = 99.999` (now `compute_parcel_cost_fsi_max_plausible`), the NULL-and-count disposition and `fsi_implausible_count` were undocumented | **§2.5** (the bound + disposition) and **§2.11** (the INFO row) |
| **D3** | §2.11's audit roster did not match what the step emits, and named `as_of_date` | **§2.11** — the roster is re-derived from the landed `descriptor.checks[]` + the POST golden's own `audit_table.rows`, and the relocated counters are named where they now live |
| **D4** | §2.11 implied `unmapped_residential_family_fallback_count` is a live WARN row | **§2.11** — it is a structurally-0 `records_meta` key, and the *vacuity itself* is named as an open defect, not blessed (see below) |
| **D5** | neither the empty-rates refuse-to-run (F1) nor the duplicate-archetype throw (F2) was in §2.9 | **§2.9** |
| **D6** | §2.9 implied a separate future-dated FAIL row; the code folds it tri-state into `cost_rates_stale` | **§2.9** |
| **D7** | §2.8 listed 6 logic variables; three of them belong to other steps | **§2.8** — replaced with the step's real, descriptor-declared 19-variable surface |
| **D8** | the `upper(zoning_class) LIKE 'R%'` population predicate and the `area <= 0 → line absent` rule were unstated | **§2.1** (population) and **§2.4** (line absence) |

> **D4 is half spec-staleness and half CODE DEFECT, and only the first half is corrected here.** The spec text ("a live WARN counter") was wrong and is fixed; the counter's *vacuity* — `const … = 0` while `parcelFamilyFromZoning`'s fall-through to `'all'`/`norm_basis:'pre_r2'` silently affects **105,595** R/RA/RAC parcels (measured live) — is **defect `CPCE-D3`** (`docs/reports/defect-ledger.md`, **OPEN · PIN**, P2 scope, declared in `descriptor.limitations[]` and locked by `src/tests/steps/compute_parcel_cost_estimates/violations.test.ts` test 11). §2.11 records it as a known gap; it is deliberately **not** rewritten to describe the zero as correct. Two further open pins are cross-referenced in place for the same reason: **`CPCE-D1`** (the undatable-rates-vs-undatable-index asymmetry, §2.9) and **`CPCE-D2`** (menus stranded outside the `R%` population by a later re-zoning, §2.1).

**Also corrected in this pass:** §6's Target Files read "lock 88" — the live constant is **`117`** (Spec 47 §A.5, re-measured); and `scripts/lib/parcel-cost-cols.js` (this spec's own §2.5/§2.10 column contract, shared with `enrich-permits.js`) was live but unlisted.

## 1. Goal & User Story
> As the future **lead cost model** (Spec 83) and the parcel/lead UI, I want **every residential parcel to carry a menu of priced renovation scenarios** — grounded in external industry costs, lot-type-aware — so a lead can be presented as a set of costed options (max build, CoA build, kitchen, bath, basement, gut, addition, suites, garage, solar) rather than an undifferentiated "house."

This is a **pure parcel model**, distinct from the permit/CoA cost model (Spec 83): **no permit, no applicant-declared cost, no Liar's Gate, no `scope_intensity_matrix` allocation.** **External industry cost is the ONLY cost basis — Buildo permit data (`est_const_cost`) is NEVER a cost source.**

## 2. Behavioral Contract

### 2.1 The model (top-down)
For each residential parcel × each of the 13 reno lines:
```
cost(line) = industry_rate_per_sqm(archetype)
             × MAX(1, cost_escalation_index ÷ escalation_index_base)   -- never deflate fresh rates
             × cost_adjustment_factor(archetype)                       -- 1.0 default; SOLAR = 0.75 (usable roof)
             × area(line)                                              -- the line→field map (§2.3)
             × neighbourhood_cost_premium                              -- 1.00–1.85, census-income (parcels col)
```
The **total** is the anchor (external-industry-grounded). The per-trade/per-product **breakdown is deferred to P3** — P1 emits `trades:null`/`products:null` (a documented not-yet-calibrated sentinel; the total is unaffected).

**The population — stated, not implied (D8).** "Residential parcel" is exactly `WHERE zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`, ordered by `id` (**437,279** parcels, measured 2026-09-21). There is **no incremental mode and no skip path**: every invocation streams that whole population and re-prices it (§2.11); the 16-column `IS DISTINCT FROM` write guard is what keeps a steady-state re-run's write count near zero, not a gate. A parcel re-zoned *out* of `R%` after a menu was written is neither refreshed nor nullified by a later run — the `WHERE` simply stops selecting it (defect **`CPCE-D2`**, OPEN · PIN; 2 such parcels measured 2026-09-21, both named in `descriptor.limitations[]`).

### 2.2 GFA is the key; footprint is capped; CoA goes to stories
The buildable **footprint is capped** at the max-build as-of-right coverage. The CoA build uses that *same* capped footprint, so realized-FSI density above as-of-right is achieved by **more storeys** ("up, not out" — hard mechanism). Therefore:
- **CoA build authoritative output = GFA + `coa_fsi`** (the SOLID priced quantity is the CoA GFA: `opt_coa_gfa_sqm` in P1 / `realized_fsi_p90 × lot` post-R2; `coa_fsi = opt_coa_gfa_sqm ÷ lot` accordingly — see §2.5). Footprint (= `max_buildable_footprint`, capped/shared) + stories (derived `GFA ÷ footprint`) are **reference-only, low-confidence**.
- This well-founds **Solar-CoA = Solar-Max** (footprint capped → same roof).
- **Known limitation:** the model does NOT capture footprint-*expanding* CoAs (reduced-setback/coverage variances) — a future investigation (parse CoA decisions for coverage relief) could, but needs clean variance data not available today.

### 2.3 The 13 lines → area field (cost-local map; NOT the shared `ARCHETYPE_GEOM_BASIS`)
`parcel-cost.js` carries its OWN line→field map (the shared `ARCHETYPE_GEOM_BASIS` + its JS=TS parity tests are UNTOUCHED):

| # | Line | area field | rate $/ft² | notes |
|---|---|---|---|---|
| 1 | Max build (new build) | `COALESCE(opt_aor_gfa_sqm, max_buildable_gfa_sqm)` | 450 | WF3: prices the **as-of-right** optimal config (not the max-build envelope) so `new_build ≤ coa_build`; envelope fallback when `opt_aor` NULL, counted `new_build_fallback_count` |

> **Constrained-envelope suppression contract (WF3 Phase 1 D-C).** On a `ravine_constrained` parcel (Spec 65 MB-3: sub-floor ravine residual — envelope + `opt_*` all NULL), the ENVELOPE-DERIVED cost lines (max build / CoA build / SOLAR — every `COALESCE` input NULL) suppress **automatically**: the Mutator full-streams the class and rewrites the stored values to NULL under `IS DISTINCT FROM`. Existing-structure lines (kitchen/bath/basement/underpin/gut/addition) survive on their `cur_*` drivers — the menu is reduced, never deleted. The permit-level Spec 83 ladder degrades T3→T4 holding coverage while values shift. Regression tripwire: the sanity audit's `ravine_constrained_carries_priced_cost` invariant (gate:true, zero-baseline).
| 2 | CoA build | `opt_coa_gfa_sqm` (R2 detached-grounded) | 450 | GFA-driven; `opt_coa ≥ opt_aor` invariant → coherent ladder |
| 3 | Solar — max | `max_buildable_footprint_sqm` (roof) | ~35/ft²·roof | ×0.75 adj |
| 4 | Solar — CoA | = #3 | = #3 | footprint capped |
| 5 | Garden suite | `max_garden_suite_gfa_sqm` | 500 | fit-gated |
| 6 | Laneway suite | `max_laneway_suite_gfa_sqm` | 525 | fit-gated |
| 7 | Kitchen | `cur_est_kitchen_gfa_sqm` (=footprint×`reno_kitchen_gfa_pct`) | 325 | |
| 8 | Bath | `cur_est_bath_gfa_sqm` (=footprint×`reno_bath_gfa_pct`) | 400 | |
| 9 | Garage | `max_garage_gfa_sqm` | 180 | fit-gated |
| 10 | Basement underpinning | `cur_floor_gfa_sqm` | 150 | same area as #11, higher rate (structural) |
| 11 | Basement reno | `cur_floor_gfa_sqm` (= footprint) | 70 | |
| 12 | Gut | `cur_pot_2story_gfa_sqm` (= footprint×2, **fixed-storey assumption** — no live existing-storey source) | 300 | |
| 13 | Addition + storey | `cur_floor_gfa_sqm` (one added storey) | 400 | |

New archetypes **`SOLAR`** + **`BAS_UNDERPIN`** live ONLY in `parcel-cost.js`'s local map — NOT added to `ARCHETYPE_BUNDLES`/`TAG_ARCHETYPE`/`deriveArchetypes`/the shared `ARCHETYPE_GEOM_BASIS` (would break the classifier parity tests + the closed `ArchetypeCode` union).

**Rate-key contract:** the `archetype` value in each `PARCEL_COST_LINES` entry is the **PK into `archetype_cost_rates`** (admin-tunable, Spec 86). The two rear-suite lines use **distinct** keys — **`LANE_GARDEN`** (#5) and **`LANE_LANEWAY`** (#6) — NOT a single `LANE`, so garden ($500/ft²) and laneway ($525/ft²) carry independent rows/rates. Full key set: `FB`, `CoA`, `SOLAR`, `LANE_GARDEN`, `LANE_LANEWAY`, `KIT`, `BTH`, `GAR`, `BAS_UNDERPIN`, `BAS`, `INT`, `ADD` (12 rate rows, §3). The 12 cost scalars are pinned to migration 205's seed literals by the `parcel_cost_model` block in `_contracts.json` (`contracts.infra.test.ts`).

### 2.4 `parcel_cost_menu` JSONB schema (parcel-scoped, like `optimal_config`)
Root: `{ "_schema_version": 1, "<line_id>": {…}, … }`. Per line:
- `total` (numeric, premium-inclusive — see §2.6), `per_sqm`, `area` (the geom_basis value used)
- `area_confidence` ∈ `high|medium|low` (§2.7) — **floor-AREA certainty, NOT a price range**
- `fits` (boolean) — present ONLY for fit-gated lines (LANE garden/laneway, GAR); driven by `rear_suite_permission`/`garage_permission ∈ {as_of_right, coa_required}` (NOT area-presence)
- `norm_basis` — **CoA-line-scoped only** (`pre_r2|r2_refined`; `n/a` for non-CoA lines). `r2_refined` once Spec 78 P2 R2 grounds `opt_coa` in realized detached FSI p90 — but R2 is **DETACHED-ONLY** (townhouse/multiplex/generic-R keep by-law logic), so `norm_basis` is family-aware: `r2_refined` for detached parcels, `pre_r2` otherwise (the compute passes `r2Grounded = parcelFamilyFromZoning(zoning_class) === 'detached'`).
- absent line key = geom_basis NULL (not computable); `fits:false` = fit-gated (doesn't fit here) — these are DISTINCT.
- **The absence rule, exactly (D8):** a line is omitted when `area === null || area <= compute_parcel_cost_min_priceable_area_sqm` (seed `0` ⇒ today precisely "NULL or non-positive"), or — defensively, since the rate rows are `NOT NULL`/`CHECK > 0` — when no `archetype_cost_rates` row exists for that line's archetype. A parcel on which *every* line is absent stores the bare `{"_schema_version": 1}` sentinel (never NULL, never `{}`) and is counted in `null_geom_basis_count` — **7,674 parcels / 1.755 %** of the population, measured 2026-09-21.

### 2.5 New parcel scalar columns (headline + FSI), all propagated (§2.8)
Headline totals/per-sqm: `cost_fb_total`, `cost_coa_total`, `cost_garden_suite_total`, `cost_laneway_suite_total`, `cost_garage_total`, `cost_gut_total`, `cost_addition_total`, `cost_solar_total`, `cost_kitchen_per_sqm`, `cost_bath_per_sqm`, `cost_basement_per_sqm`, `cost_basement_underpin_per_sqm`. FSI: **`max_build_fsi`** (= `max_buildable_gfa_sqm ÷ lot` — the *envelope* FSI reference; **WF3 note:** deliberately distinct from the `max_build` cost line's priced area, which is now `opt_aor_gfa` — the envelope FSI is a density reference, the cost line prices the as-of-right build), **`coa_fsi`** (= `opt_coa_gfa_sqm ÷ lot` — the density of the CoA build line actually being priced; non-NULL in P1. Post-R2 this **equals** `realized_fsi_p90`, because R2 grounds `opt_coa_gfa` in the realized detached FSI p90 — so the two converge but are distinct scalars: `coa_fsi` is always the priced-build FSI, `realized_fsi_p90` is the neighbourhood density basis), **`realized_fsi_p90`** (the density basis — **NULL in P1**, populated by the P2 family-aware norm read; legible "by-law max FSI → realized CoA FSI").

**Plausibility bound on the two derived FSI scalars (D8's sibling, D2).** `max_build_fsi` and `coa_fsi` are both produced by `plausibleFsi(gfa, lot, compute_parcel_cost_fsi_max_plausible)` — an admin logic variable, seed **`99.999`**, the `NUMERIC(6,3)` column ceiling; an FSI above it means a garbage `max_buildable_gfa_sqm` (the known tree-contaminated-massing artifact class). Three distinct dispositions:
- lot NULL or `<= 0`, or the GFA NULL → scalar **NULL**, **not** counted (simply not computable);
- FSI **above** the bound → scalar **NULL** *and* `fsi_implausible_count`++ (§2.11) — **dropped and counted, never clamped**, so it can neither overflow the column nor be mistaken for a real density;
- otherwise the FSI is stored, rounded to 3 dp.

The bound is a **required engine argument, not a default**: `plausibleFsi` throws if the caller passes no finite value (Rule 3 — no defaulted engine tunable). Measured 2026-09-21: it fires **0** times across the whole population. `realized_fsi_p90` bypasses all of this — it is a pure read-through (read from `parcels`, written back unchanged) and stays NULL until P2 populates it.

### 2.6 Premium contract (CROSS-LAYER — lock with Spec 83)
`parcel_cost_menu` totals are **premium-INCLUSIVE / FINAL**. The lead cost model (Spec 83) **MUST NOT re-apply** `neighbourhood_cost_premium`. Enforced by an integration test. (`neighbourhood_cost_premium` NULL → 1.0 fallback; never NULL in practice — income-tier default.) Behavioral flag — lives HERE, not `_contracts.json`.

### 2.7 `area_confidence` bands
Lot-driven envelope (max/CoA build, suite, garage) + SOLAR = **high**. `cur_floor`/`cur_est_kitchen`/`cur_est_bath`-derived (basement/addition/kitchen/bath) = **medium**. Storey-multiplied gut (footprint×2 fixed-storey) = **low**. `max_build_confidence=low` with non-NULL GFA → emit at **low** (never skip, never $0). Report/menu wording must state the band = *floor-area certainty driven by imagery-footprint reliability (±20–38%)*, not price range.

### 2.8 Externalization (Spec 26/35/86 — ALL variables admin-tunable, none hard-coded)
- **`archetype_cost_rates`** table (control-panel rows, Spec 86): `archetype` PK, `cost_per_sqm`, `cost_adjustment_factor`, `escalation_index_base`, `source`, `as_of_date`. **NOT NULL + CHECK (`cost_per_sqm>0`, `escalation_index_base>0`, `cost_adjustment_factor>0`)**.
- **`logic_variables`** (all NUMERIC — `variable_value` is DECIMAL). **CORRECTED 2026-09-21 (D7)** — the earlier list of six was wrong in both directions. `reno_kitchen_gfa_pct` and `reno_bath_gfa_pct` are **`enrich-parcels.js`'s** (Spec 65: they derive `cur_est_kitchen_gfa_sqm`/`cur_est_bath_gfa_sqm`, which this step only *reads* as area fields), and `min_comp_count` is **Spec 78's**. This step's real surface is the **19 keys its descriptor declares** (`config.logic_variables[]`, every one `on_invalid: "fail"` and hoisted above the lock — a missing or out-of-bounds row THROWS, it does not fall back):
  - **priced / engine tunables** (threaded into `scripts/lib/parcel-cost.js` through the now-REQUIRED `opts.config`, Rule 3): `cost_escalation_index` (100.0), `compute_parcel_cost_fsi_max_plausible` (99.999, §2.5), `compute_parcel_cost_min_priceable_area_sqm` (0, §2.4), `compute_parcel_cost_escalation_min_multiplier` (1 — the never-deflate floor, §2.1), `compute_parcel_cost_escalation_fallback_multiplier` (1 — missing/invalid index *or* base), `compute_parcel_cost_premium_default` (1 — the NULL `neighbourhood_cost_premium` fallback, §2.6), `compute_parcel_cost_adjustment_factor_default` (1, defensive — the column is `NOT NULL`);
  - **freshness thresholds** (§2.9, names deliberately left un-prefixed because they are consumed by name in raw SQL elsewhere): `cost_rates_stale_months` (3), `cost_index_stale_months` (4);
  - **runner profile:** `compute_parcel_cost_heartbeat_minutes`, `compute_parcel_cost_lock_timeout_ms`, `compute_parcel_cost_phase_timeout_minutes`, `compute_parcel_cost_batch_size`, `compute_parcel_cost_stream_batch_size`;
  - **check limits** (§2.11): `compute_parcel_cost_min_population`, `compute_parcel_cost_engine_error_max`, `compute_parcel_cost_menu_coverage_min_pct`, `compute_parcel_cost_empty_menu_max_pct`, `compute_parcel_cost_line_total_max_cad`.

  The first three (`cost_escalation_index`, `cost_rates_stale_months`, `cost_index_stale_months`) existed live in the DB from migration 205 but were **absent from `scripts/seeds/logic_variables.json`** until the row-2.4 conversion added them — a fresh cloud seed would have left them unset. Surfaced in the Admin Dashboard (Spec 26/86) under the **Cost Tuning** and **Data Quality Thresholds** groups, state per Spec 35; the live key count is carried by the generated `docs/reference/logic-variables-registry.md`, never retyped here. The index's as-of date is NOT a separate var (logic_variables holds numbers, not dates) — the index staleness clock reads the `cost_escalation_index` row's own **`updated_at`**, which refreshes automatically when an operator edits the index. Every resolved value is stamped into `records_meta.config` on every run.

### 2.9 Rate freshness
`cost_escalation_index` updated quarterly (manual, from StatCan BCPI Toronto CMA — NOT a live fetch). Escalation `MAX(compute_parcel_cost_escalation_min_multiplier, index_now ÷ base)` (never deflate); a missing/invalid *escalation base* on a rate row falls back to `compute_parcel_cost_escalation_fallback_multiplier` (1.0) rather than crashing.

**Two pre-phase HALTs — the step refuses to run rather than produce wrong data (CORRECTED 2026-09-21 — D5).** Both fire in `readCostContract`, on the step's own pool, inside the advisory lock, before a single parcel is streamed:
1. **`archetype_cost_rates` empty** → throw *"refusing to run (would produce 0 % coverage). Apply migration 205."* A silently rate-less run would blank every menu under the `IS DISTINCT FROM` guard — loud beats quiet.
2. **duplicate `archetype` in `archetype_cost_rates`** → throw, naming the archetype. The `archetype` is the PK into the rate table (§2.3); a duplicate makes the priced rate order-dependent.

A third, related change came with the conversion and is recorded here rather than in §2.8: a **missing or out-of-bounds `cost_escalation_index` row now THROWS** (`on_invalid: "fail"`, `min > 0`), where the legacy defaulted to a 1.0 multiplier + WARN. This is a declared, louder-never-quieter deviation, not an accident.

**Two staleness clocks, both folded into a numeric severity code (CORRECTED 2026-09-21 — D6).** There is **no separate future-dated FAIL row**; the future-dated case is the top tier of `cost_rates_stale` itself:
- **`cost_rates_stale`** — `MAX(as_of_date)` over `archetype_cost_rates` vs `cost_rates_stale_months`. Value is a severity code: **`0`** fresh (PASS) · **`1`** stale (WARN) · **`2`** `as_of_date > run_at` (**FAIL**). The human-readable `false` / `true` / `'future_dated'` string rides in the row's `detail` (which `verdict.js#checkRow` prefers over the value when rendering). The numeric form is load-bearing: a boolean or a bare string is not `Number.isFinite` and would score "unevaluable" rather than WARN/FAIL.
- **`cost_index_stale`** — the `cost_escalation_index` row's own `updated_at` vs `cost_index_stale_months`. **`0`** fresh · **`1`** stale **or undatable** (WARN, never a silent PASS — review fold OBS-12). It has no FAIL tier.
- Companion INFO values `cost_rates_age_months`, `cost_index_age_months` and `rates_max_as_of_date` are always recorded (§2.11).

> **Known gap — defect `CPCE-D1` (OPEN · PIN, `docs/reports/defect-ledger.md`).** The undatable arm is asymmetric: an undatable *index* WARNs, but an undatable *rate table* (`MAX(as_of_date) IS NULL`) silently PASSes. Ported byte-for-byte at the conversion rather than fixed in a conversion commit (Spec 123 §3.1). Both arms are unreachable today — the three underlying columns are `NOT NULL` and an empty rate table HALTs earlier — and a live-DB precondition lock reds if a future migration relaxes any of them. This is a defect to be fixed, **not** the intended contract.

### 2.10 Propagation to permits/coa (Spec 48 → Spec 49)
The `cost_*` + FSI scalars join the dominant-parcel propagation in `enrich-permits.js` via a new **`COST_PROP_COLS`** set (the §4D mechanism — like `OPT_COMP_PROP_COLS`). The `parcel_cost_menu` JSONB stays **parcel-scoped**. Propagation emits **Spec 48** per-column audit rows (enrich-permits step) → **Spec 49** `assert-global-coverage.js` rows on THREE surfaces: `parcels` (GATED ≥85% of residential-with-building — the ~9% building-less are an exclusion *filter*, not a numerator note), `permits` (Step 9b), `coa_applications` (CoA Step 4b — INFO, sparse where parcel-unlinked). Migrations add the `cost_*`/FSI cols to permits + coa (guarded ADD COLUMN, like mig 204).

### 2.11 Observability (`compute-parcel-cost-estimates.js`, Spec 47 §8 / Spec 48 §3.6)
**CORRECTED 2026-09-21 (D1/D3/D4) — this section now describes the landed converted step, re-derived from `descriptor.checks[]` and the POST golden's own `audit_table.rows`, not from the pre-conversion roster.**

**Every run is a full run (D1).** The step has **no skip path**: no `--dry-run`, no `--limit=N`, no `COMPUTE_PARCEL_COST_FORCE_FULL`, and — since CPCE-A1 (see the as-built section) — no run-ledger gate. A `records_total: 0` SKIP summary is therefore not a state this step can reach; `records_total` is always the full residential population (§2.1). What used to be the gate's input, the `rates_as_of` / `index_updated_at` version stamps, survives as `records_meta` observability only.

**Audit rows — 22 declared checks, all ALWAYS emitted including at value 0**, plus 2 declared row-level assertions (`no_priced_null_lot_parcel`, `new_build_cost_not_gt_coa_cost`) and the SDK-injected `sys_duration_ms` / `sys_velocity_rows_sec`:

| Row(s) | Severity | Meaning |
|---|---|---|
| `residential_parcels_examined` | FAIL below `compute_parcel_cost_min_population` | the population actually streamed |
| `engine_error_count` | FAIL above `compute_parcel_cost_engine_error_max` (0) | deliberately strict |
| `fsi_implausible_count` | INFO | FSI dropped above the §2.5 bound |
| `new_build_fallback_count` | INFO | new_build priced on the max-build envelope because `opt_aor_gfa` was NULL |
| `cost_rates_stale`, `cost_index_stale` | WARN / FAIL per the §2.9 severity codes | `{value, detail}` object-scored |
| `compute_parcel_cost_menu_coverage_min_pct` | WARN below the variable (99) | the write-completeness **collapse floor** |
| `compute_parcel_cost_empty_menu_max_pct` | WARN above the variable (5) | `null_geom_basis_count` as a % of the population |
| `compute_parcel_cost_line_total_max_cad` | WARN above the variable | a labelled **future-regression tripwire**, not a calibrated bound (today's max is itself a suspect upstream `cur_floor_gfa_sqm` artifact) |
| `line_coverage_<id>` × 13 | INFO | per-line coverage; zero = cold start. Proven both directions against `PARCEL_COST_LINES` at module load, not only in a test |

**Counters that are `records_meta` keys, not audit rows.** The conversion relocated these — same values, different home, no data loss: `null_geom_basis_count`, `area_confidence` (`{high, medium, low}`), `fit_gated_suite_count`, `fit_gated_garage_count`, `cost_rates_age_months`, `cost_index_age_months`, `rates_max_as_of_date` (**this is the correct name — never `as_of_date`**), `cost_escalation_index`, `records_updated`, `records_skipped`, `unmapped_residential_family_fallback_count`, plus the resolved `config` snapshot, the `rates_as_of`/`index_updated_at` stamps and a `cost_by_zone` block (7 named zones + `other`, each with `parcels`/`menus`/`empty_menus`/`p50_cost_fb`/`max_cost_gut`, whose Σ-identity against `residential_parcels_examined` is asserted in code, not merely declared). The legacy's `dry_run` row is retired with the flag; `parcels_with_menu_pct` is superseded by the two coverage checks above.

> **Known gap — defect `CPCE-D3` (OPEN · PIN).** `unmapped_residential_family_fallback_count` is **structurally `0`** (`const … = 0`) — P1 has no family mapping to fall back *from*; that is P2 scope. It is **not** a live WARN counter, and its zero is **vacuous, not reassuring**: `parcelFamilyFromZoning`'s fall-through to `'all'` / `norm_basis: 'pre_r2'` silently affects **105,595** R/RA/RAC parcels (measured live 2026-09-21). Declared in `descriptor.limitations[]`, locked by `src/tests/steps/compute_parcel_cost_estimates/violations.test.ts` test 11, and to be closed by P2 — not by re-reading the counter as a pass.

**Verdict = `rows.some(FAIL)?'FAIL':rows.some(WARN)?'WARN':'PASS'` — row-derived, NO parallel boolean.** **Counter scoping: `records_total` = residential parcels examined (NOT 13×); `records_updated` = parcels the 16-column `IS DISTINCT FROM` guard actually changed; `records_new` = 0 (the parcels pre-exist).** Per-parcel `try/catch` → log `{parcel_id, err}` + `engine_error_count`++ + an `error` sentinel in that parcel's JSONB, **continue** (one bad row must not crash a 437K run). The declared reads/writes (`emitMeta`'s successor) enumerate `archetype_cost_rates` and `logic_variables` by column, the `parcels` geom-basis columns + `neighbourhood_cost_premium`, and the writes `parcel_cost_menu` + each headline/FSI scalar.

## 3. Rate derivation & source confidence
Every rate is an **external industry $/ft²** (Toronto, 2025–26), stored as $/m² in `archetype_cost_rates` (admin-tunable §2.8, index-escalated §2.9, re-calibrated annually). $/m² = $/ft² × 10.764.

| Line (archetype) | $/ft² | $/m² | Industry range $/ft² | Primary sources (2025–26) | Source confidence |
|---|---|---|---|---|---|
| Max build (FB) | 450 | 4,844 | 400–650 | Xavieras, Woodcastle, Stonebrooke, Village Park | **High** — many concordant Toronto custom-home guides; $450 = conservative-mid |
| CoA build (FB rate) | 450 | 4,844 | 400–650 | (same basis — it's a new build, larger GFA) | **High** |
| Solar — max & CoA (SOLAR) | ~35 /roof-ft² | ~377 | *derived* | GreenBuildingCanada, Solar-X, Xolar (per-watt) | **Medium** — solid $2.40–3.50/W data, but per-ft² conversion + 0.75 usable-fraction add modeling |
| Garden suite (LANE_GARDEN) | 500 | 5,382 | 450–600 | DavidReno, BVM, Oriel, TGC | **Med-High** — concordant suite guides |
| Laneway suite (LANE_LANEWAY) | 525 | 5,651 | 450–600 | + Maserat, Heracon, Elevate | **Med-High** |
| Kitchen (KIT) | 325 | 3,498 | 250–400 (lux 500+) | 905reno, Rocpal, Sosna, KarReno | **Medium** — wide range; product-driven so $/ft² varies a lot |
| Bath (BTH) | 400 | 4,306 | 300–600 (total $15–40k) | EasyRenovation, HomeStars, Dupont, PAB | **Medium** — high per-ft² variance (small area); the *total* is the more stable figure |
| Garage (GAR) | 180 | 1,938 | 150–208 (Toronto) | TGC, Trusscore, HomeStars | **Medium** — Toronto rates notably above the generic $40–70 |
| Basement underpinning (BAS-UNDERPIN) | 150 | 1,615 | 105–200 finished (80–450 by scope) | StrongBasements, NuSite, DRV, CSG | **Medium** — wide scope-dependent range; $150 = mid finished-shell |
| Basement reno (BAS) | 70 | 753 | 45–95 (avg 55–75) | TrueForm, Harmony, MagicWindow, Lifetime | **Med-High** — concordant finish-cost range |
| Gut (INT) | 300 | 3,229 | 200–400 (lux 450–550) | Rocpal, Habitual, TorontoToday, Lighthaus | **Medium** — strongly finish-level-dependent |
| Addition (ADD) | 400 | 4,306 | 300–500 (≈ new build) | TGC; additions ≈ new-construction | **Medium** — fewer addition-specific $/ft² cites |

**Internal cross-check (floor only, NOT a calibration input):** permit-declared `est_const_cost ÷ residential_sqm` (110K permits) gives new-build $153/ft², addition $208, reno $274 — but declared values **understate ~2×** (the Liar's-Gate effect). They serve only as a *floor* and confirm the model is not over-stated (the new-build rate $450 sits in the actual $400–650 range, well above the understated declared $153). **To tighten before P1 Green Light:** add 1–2 authoritative sources per line (e.g. Altus Canadian Cost Guide, RSMeans) and record them in the `archetype_cost_rates.source` column.

## 4. Archetypes & their relationship to cost
The **archetype is the unit that binds (area field, rate, trade set, `area_confidence`)** — 11 archetypes cover the 13 lines (FB serves max + CoA build; LANE serves garden + laneway; SOLAR serves both solar lines). Unlike the permit cost model (Spec 83), which *infers* the archetype from `(permit_type × structure_type)` via the `scope_intensity_matrix`, here **the archetype IS the reno line** — we know exactly which renovation, so there's no inference: `cost = rate(archetype) × area(archetype) × premium`.

Archetypes group into four cost-character families:
- **New-construction (FB, ADD, LANE):** area from the lot-validated envelope → **high `area_confidence`**; rates from custom-home/suite guides ($400–650/$450–600).
- **Current-home reno (KIT, BTH, BAS, BAS-UNDERPIN, INT):** area from the *existing footprint* (imagery, ±20–38%) → **medium/low**; reno-specific rates; product-heavy lines (KIT/BTH) get the P3 product breakdown.
- **Accessory (GAR, LANE):** **fit-gated** by the permission field (`garage_permission`/`rear_suite_permission`) — `fits:false` where not permitted.
- **SOLAR:** roof-area (footprint × 0.75 usable); per-watt-derived rate.

Each archetype's **trade set** (`ARCHETYPE_BUNDLES`) is *not* used to compute the P1 total (top-down) — it becomes the **P3 allocation basis** (split the total into trades + products). The archetype's `area_confidence` (§2.7) reflects its area driver (§5).

## 5. Square-footage drivers per archetype
The cost is `rate × AREA`, so the **area driver is half the model**. Two driver classes: the **lot-validated envelope** (`max_build_*` / `opt_coa_*` — geometry + by-law, reliable) vs the **existing-structure imagery footprint** (`imagery_roof_footprint`, ±20–38%, the source of the lower confidence bands).

| Archetype (line) | area field | how the sq footage is derived | driver class | `area_confidence` |
|---|---|---|---|---|
| FB (max build / new build) | `COALESCE(opt_aor_gfa_sqm, max_buildable_gfa_sqm)` | as-of-right optimal config (`footprint × as-of-right storeys`); WF3 — the max-build **envelope** (`LEAST(footprint × stories, lot × bylaw_fsi)`) is only the NULL-opt_aor fallback. Envelope FSI is still surfaced via the `max_build_fsi` scalar (§2.5) | as-of-right config (envelope fallback) | **high** |
| CoA build | `opt_coa_gfa_sqm` | `realized_fsi_p90 × lot` (coverage-bounded, floored at as-of-right) | realized FSI × lot | **high** (GFA; footprint/stories reference-only) |
| SOLAR (max & CoA) | `max_buildable_footprint_sqm` | × `cost_adjustment_factor` 0.75 (usable roof) | lot envelope (roof) | **high** |
| Garden suite | `max_garden_suite_gfa_sqm` | by-law: `min(40% rear-yard, 60 m²)` footprint, single-storey | by-law + rear yard | **high** |
| Laneway suite | `max_laneway_suite_gfa_sqm` | by-law laneway cap (requires abutting lane) | by-law + lane | **high** |
| Garage (GAR) | `max_garage_gfa_sqm` | by-law-capped garage footprint that fits the rear yard | by-law + rear yard | **high** |
| Kitchen (KIT) | `cur_est_kitchen_gfa_sqm` | `imagery_roof_footprint × reno_kitchen_gfa_pct` (15%, tunable) | imagery footprint × % | **medium** |
| Bath (BTH) | `cur_est_bath_gfa_sqm` | `imagery_roof_footprint × reno_bath_gfa_pct` (7%, tunable) | imagery footprint × % | **medium** |
| Basement reno (BAS) | `cur_floor_gfa_sqm` | `= imagery_roof_footprint` (single floor) | imagery footprint | **medium** |
| Basement underpinning | `cur_floor_gfa_sqm` | same area as BAS (the structural premium is in the *rate*, not the area) | imagery footprint | **medium** |
| Addition (ADD) | `cur_floor_gfa_sqm` | one added storey = one footprint | imagery footprint | **medium** |
| Gut (INT) | `cur_pot_2story_gfa_sqm` | `imagery_roof_footprint × 2` — **FIXED storey assumption** (no live existing-storey source: `existing_stories` retired, `permits.storeys`=0, the storey norm is a *new-build* norm) | imagery footprint × 2 | **low** |

**Two uncertainty sources drive the band:** (1) the **footprint** — lot-envelope (`max_build_*`, validated) is reliable; the imagery footprint (±20–38%, tree-contaminated) is not; (2) the **multipliers** — the reno-% (kitchen 15% / bath 7%) and especially the gut's fixed ×2 storey assumption. The lot-envelope/by-law-driven lines are `high`; imagery-footprint lines are `medium`; the imagery-footprint-×-fixed-storey gut is `low`. This is exactly what `area_confidence` (§2.7) communicates — *certainty of the square footage, not a price range.*

## 6. Operating Boundaries

### Target Files
- `scripts/lib/parcel-cost.js` (pure — engine + local line→field map + `area_confidence` + SOLAR/BAS-UNDERPIN; since batch-2 row 2.4 it takes its tunables through a REQUIRED `opts.config`, §2.8), `scripts/lib/parcel-cost-cols.js` (the §2.5/§2.10 column contract — a dependency-free leaf shared by this step and `enrich-permits.js`'s §4D propagator), `scripts/compute-parcel-cost-estimates.js` (**advisory lock `117`**, not 88 — 88 is taken by `classify-permits.js`; Spec 47 §A.5. A Spec 122 §5.1 frozen shell since batch-2 row 2.4: the behaviour lives in `scripts/compute-parcel-cost-estimates.descriptor.json` + `scripts/lib/compute/compute-parcel-cost-estimates.js`, both owned by Spec 122's Operating Boundaries globs), `scripts/manifest.json` (sources chain, after `enrich_parcels` before `refresh_snapshot`), `scripts/enrich-permits.js` (`COST_PROP_COLS` propagation), `scripts/quality/assert-global-coverage.js` (Spec 49 rows × 3 surfaces).
- `migrations/NNN` — `archetype_cost_rates` table + seed; `parcels` cost/FSI cols; `permits`+`coa_applications` cost/FSI cols.
- `docs/specs/_contracts.json` (`parcel_cost_model` group — non-tunable constants + seed-migration literal lock), `contracts.infra.test.ts`, `scripts/seeds/logic_variables.json`.

### Out-of-Scope Files
- **P2 (separate phase):** `neighbourhood_*_norms` `structure_family` schema + the shared family-aware accessor + the 5 norm read-sites + R2 (`optimal-config.js` realized-FSI wiring) + R4 (comp family filter). This spec's P1 uses *current* `opt_coa_gfa`.
- **P3:** the product-cost dimension + the per-trade/product breakdown (`trades`/`products` JSONB sub-objects).
- ~~The permit/CoA cost model (`compute-cost-estimates.js`, `cost-model-shared.js`, `trade_sqft_rates`) — **untouched**; this is an additive parcel model.~~ **SEAM CLOSED (WF2 2026-07-06, Spec 83 §3-ARCHETYPE):** the permit/CoA cost model now CONSUMES this spec's archetype costs as its primary derivation for low-rise residential — the propagated scalars (premium-INCLUSIVE per §2.6, never re-premiumed) + `archetype_cost_rates`. The T4/legacy path (`trade_sqft_rates` build-up) survives only for mapper-null residential + non-residential leads.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 §4 (`max_buildable_gfa/footprint_sqm`, the `cur_*` scenario fields, `neighbourhood_cost_premium`), Spec 78 (`opt_coa_gfa_sqm` + the §4D `OPT_COMP_PROP_COLS` propagation pattern), Spec 47 (Mutator skeleton), Spec 48 §3.6 (verdict cascade), Spec 49 (completeness matrix), Spec 86 (Control Panel — rate/logic-var tuning), Spec 26/35 (admin surfacing).
- **Consumed by:** Spec 83 (lead cost model — selects an archetype + reads the propagated cost; MUST honor §2.6 premium-inclusive), Spec 87 (supplier audience — P3 product breakdown).
- `load-permits.js` — upstream loader; only the `permits` table columns matter here, not its loading logic
- `load-parcels.js` — upstream loader; only the `parcels` table rows matter here, not its loading logic
- `enrich-parcels.js` — chain-sequencing reference only (`scripts/manifest.json`: "after `enrich_parcels` before `refresh_snapshot`"); zoning/max-build behavior is owned by Spec 65
- `classify-permits.js` — advisory-lock-number footnote only (lock 88 predates the spec-number convention); no dependency on its classification logic
- `refresh-snapshot.js` — chain-sequencing reference only (runs immediately after this spec's step)

## 7. Phasing
**P1** cost engine + rates + propagation (this spec) → **P2** family-aware reads + R2 detached `opt_coa` + R4 type-aware comparables → **P3** products + breakdown. See `.cursor/active_task.md` for the phase execution plans.

## 8. Known limitations / future work
- Footprint-expanding (coverage-variance) CoAs not modeled (§2.2) — needs clean variance data.
- Per-trade/product breakdown deferred to P3 (`trades:null` until then) — requires a `product_rates` dimension; the top-down *total* is unaffected.
- Solar is build-roof-tied (max/CoA); a "solar on the *existing* roof" line (using `imagery_roof_footprint`) is a possible future addition.
- The `$/ft²` rate table to be tightened with 1–2 more sources (e.g. Altus Cost Guide) before P1 Green Light.
