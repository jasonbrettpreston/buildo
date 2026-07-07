# Spec 83: Surgical Estimation Engine — Valuation & Trade Slicing

**Status:** ARCHITECTURE LOCKED  
**Purpose:** Provide trade-specific contract estimates by auditing municipal data against building massing and permit-specific classified scope to eliminate "global slicing" errors.

---

## 1. Goal & User Story

**Goal:** Eliminate "stupid" global slicing where every trade gets a budget regardless of the job. This engine provides surgical, trade-specific contract estimates by intersecting building massing (physics) with classified permit scope (intent) to provide a "Geometric Truth" that overrides lowball city reporting.

**User Story:** A plumber sees a lead not just as a "house," but as a "$15,000 Rough-in Opportunity" validated by building volume and the specific plumbing scope identified in the permit, allowing for high-confidence bidding.

---

## 2. Technical Architecture

### Database Schema

To support the surgical approach, the following fields must be present or added via Migration 097:

**`cost_estimates` (The Output)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `permit_num` / `revision_num` | PK | Composite Primary Key. |
| `effective_area_sqm` | DECIMAL | The calculated $Area_{Eff}$ (Work Area). |
| `trade_contract_values` | JSONB | Object storing specific $$ values for active trades. |
| `is_geometric_override` | BOOLEAN | TRUE if city cost was discarded for our model. |
| `model_version` | INT | For tracking formula iterations. |

**`trade_sqft_rates` (The Rate Sheet - NEW)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `trade_slug` | PK | (e.g., 'electrical', 'plumbing'). |
| `base_rate_sqft` | DECIMAL | Standard $/sqft for the trade. |
| `structure_complexity_factor` | DECIMAL | Multiplier for multi-unit vs. SFD builds. |

**`scope_intensity_matrix` (The Triangle - NEW)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `permit_type` | INDEX | (e.g., 'Addition', 'New Build'). |
| `structure_type` | INDEX | (e.g., 'SFD', '4-Unit', 'Garden Suite'). |
| `gfa_allocation_percentage` | DECIMAL | % of total GFA the job touches (e.g., 0.25). |

### Implementation

The engine is split into "Muscle" (Execution) and "Brain" (Logic).

* **The Execution Engine (`scripts/compute-cost-estimates.js`)**: The "Muscle." Performs bulk valuation of 237k+ records by streaming data, joining classification results, and performing batch updates.
* **The Valuation Brain (`src/features/leads/lib/cost-model-shared.js`)**: The "Intelligence." A shared library providing a single source of truth for math used by both the Pipeline and the Mobile API.

#### Details (Avoiding W5, W8, W13)

**The Muscle (`compute-cost-estimates.js`)**:
* **Dual-Connection Model**: Must use a dedicated `const lockClient = await pool.connect()` to hold the Advisory Lock for the entire lifecycle. The DB writes must use `pipeline.withTransaction(pool, ...)` which safely checks out a *second* ephemeral connection for the batch. The lock client must remain isolated and idle.
* **Bulk INSERT**: Replace N+1 queries with multi-row `INSERT ... VALUES (...) ON CONFLICT` limited to ~4,600 rows per batch to stay under PostgreSQL parameter limits (83-W8).
* **The WAL Guard (Spec 47 §6.4)**: The bulk `INSERT ... ON CONFLICT` statement MUST include a `WHERE` clause verifying that the new payload is actually different from the existing DB row: 
  `WHERE EXCLUDED.effective_area_sqm IS DISTINCT FROM cost_estimates.effective_area_sqm OR EXCLUDED.trade_contract_values::text IS DISTINCT FROM cost_estimates.trade_contract_values::text`. 
  This prevents Write-Ahead Log (WAL) bloat on unchanged permits.
* **Stream Guard**: Wrap the `for await` stream in a dedicated `try/catch` to ensure final partial batches are flushed and errors aren't swallowed (83-W13).

**The Brain (`cost-model-shared.js`)**:
* Shared between JS and TS to solve Dual-path Drift (83-W4). The Liar's Gate logic must exist here so the API and Pipeline use the same override rules.

---

## 3. Behavioral Contract

### Inputs

* **Permit Metadata**: `est_const_cost`, `scope_tags`, `project_type`.
* **Classification Ledger**: Results of `classify-permits.js` (Step 13) identifying active trades.
* **Physical Data**: `footprint_area_sqm`, `height_m`, `lot_size_sqm`.
* **Neighborhood Data**: `avg_household_income`.

### §3-ARCHETYPE — The archetype cost ladder (WF2 2026-07-06 — the PRIMARY derivation for low-rise residential)

> **This section supersedes Steps A–D for archetype-mapped low-rise residential leads.** The evidence
> (`docs/reports/wf1-cost-estimate-findings.md`): the geometric path over-predicted additions 2–31×
> (whole-building massing GFA), under-predicted megaprojects 10–30× (mislinked massing), and the
> Liar's Gate overrode the model 50–85% of the time. The Spec 88 parcel archetype costs (lot-validated,
> bylaw-capped, premium-INCLUSIVE) replace it. The CKAN `est_const_cost` is NEVER the assigned cost on
> this path (recorded as the calibration signal only); costs are NEVER built up from per-trade rates.

**Entry gate:** `isLowRiseResidential(structure_type)` **AND** the archetype mapper
(`src/features/leads/lib/archetype-cost-map.js`) returns a non-null line. Mapper-null residential
(MEC/SITE/ENV-only, demolition, repair, tagless) and ALL non-residential remain on Steps A–D
(the "T4" path) **unchanged** — including its Liar's Gate, matrix safe-skips and placeholder rule.

**The mapper:** normalizes tags (strip any `word:` prefix — `alter:`/`new:`/etc.; fold
`finished-basement`/`basement-finish`→basement; `second-suite`→gut), maps tag→line, resolves
multi-scope via the dominance hierarchy `max_build > laneway > addition > gut > underpin > basement >
garage > kitchen/bath > solar`, with: FB-family tags → `max_build` ONLY when `project_type='new_build'`;
laneway `structure_type` override; CoA `NewConstruction`(+any accessory tag) → `coa_build`; CoA `Mixed`
→ dominance over its tags (tagless `Mixed` → `coa_build`); `foundation`→underpin, `structural-beam`→gut,
`balcony`/`canopy`→null. **Additive pairs** (`underpin+basement`, `kitchen+bath`, `gut+addition`) sum the
two lines' TOTALS (each per-sqm × its OWN area basis — never Σper-sqm × one area). **Reno-build
escalation (rule W7, cap-class-bounded — WF3 2026-07-06):** ≥9 active trades + a build-scope line
(gut/addition/FB) → the FB (`max_build`) line, so a hidden full-rebuild filed as a small reno gets the
larger build AREA basis. The escalated line carries an **origin cap class**: a GENUINE build signal
(an FB tag or `project_type='new_build'`) keeps the T2 **build** cap; a reno-origin escalation
(gut/addition only) is bounded by the T2 **reno** cap (both cap AND min), so an inflated `opt_aor` area
basis cannot blow a deck/interior-gut past the reno ceiling. W7 detection is preserved (archetype lines
price off real §4D area, not the legacy 0.25× scope-matrix multiplier W7 was written against, so a
bounded escalation cannot reintroduce that under-pricing); over-cap reno-origin rows fall to T4.

**The price ladder (first rung that qualifies):**
| Rung | Price | Guards | `cost_source` |
|---|---|---|---|
| **T1** | line per-sqm (= propagated total ÷ propagated area basis) × the lead's OWN area (`residential_sqm` for FB/ADD classes; `interior_alterations_sqm` for gut/kitchen/bath) | area band `own/lot ∈ [archetype_t1_fsi_min, archetype_t1_fsi_max]`; absolute cap `archetype_t1_total_cap × max(1, dwelling_units_created)`; reject → T2, counted | `archetype_declared_area` |
| **T2** | the parcel's propagated line total | per-line plausibility bounds (`archetype_t2_reno_line_cap` / `archetype_t2_build_line_cap` / `archetype_t2_build_line_min` — parcel-side data poison falls through, counted per line); **`fits:false` → cost = null (a permissioning result, never a fallback)** | `archetype_parcel` |
| **T3** | `archetype_cost_rates[line] × MAX(1, esc) × adj × OWN area × neighbourhood_cost_premium` — only when an own area exists (no derived-area invention) | zero/absent rate or area → T4; **absolute cap `archetype_t3_total_cap × max(1, dwelling_units_created)` (WF3 F2 — an inflated own-area basis from an oversized/mislinked parent parcel falls to T4, counted `t3_cap`; CoA has no `dwelling_units_created` → effectively flat, intended)** | `archetype_rate` |
| any | zero/null total anywhere → `{cost_source:'none', estimated_cost:null}` (the Zero-Total-Bypass analog), counted `tier_none_count` | | `none` |

**Trade slicing (Decision 4):** `trade_contract_values` = the archetype total sliced by
`weight(slug) ∝ trade_sqft_rates.base_rate_sqft × structure_complexity_factor` over the lead's OWN
deduped `active_trade_slugs` (a rough allocation, not bottom-up — revisit at Spec 88 P3). Trade-less
lead → `{}`, counted. `modeled_gfa_sqm`/`effective_area_sqm` carry the archetype-basis area.
**Premium contract (Spec 88 §2.6):** T1/T2 values are premium-INCLUSIVE — the premium is NEVER re-applied.
**CoA:** same ladder minus T1; `is_geometric_override = false` (nothing was overridden); the PI-5 fence
holds (the CoA path never passes `permit_type` into the Brain's matrix machinery).

#### §3-ARCHETYPE rejection taxonomy — why a priceable-shaped lead stays `cost_source='none'` (WF2 P5, 2026-07-06)

A programmatic re-run of the live mapper + ladder over **all 7,073** residential-lowrise permits (`project_type ∈ {addition, new_build, renovation}`) and **all 13,831** CoA leads carrying `cost_source='none'` (script: `scripts/analysis/wf2-priceable-none-taxonomy.js`; report: `docs/reports/pipeline-validation/2026-07-07-priceable-none-taxonomy.md`). **No cost-model code bug was found** — every bucket is a CORRECT `'none'` for a documented reason. The distribution:

| Bucket | Permits | CoA (corpus) | Meaning — why `'none'` is CORRECT |
|---|---:|---:|---|
| `mapped_no_scalar` | 4,766 (67%) | 4,665 (34%) | The scope maps to an archetype line, but the parcel carries **no propagated §4D cost scalar** for it (≈50% of these permits have no `permit_parcels` link at all; the rest link a parcel whose cost-menu was never computed/propagated). No cost basis ⇒ no price. **NOT a mapper/ladder defect — a parcel cost-menu propagation-COVERAGE gap** (the single biggest lever for lifting cost coverage; tracked as a follow-up, not a code change here). |
| `fit_blocked` | 2,046 (29%) | 690 (5%) | Maps to a **fit-gated** accessory line (garage / laneway_suite / garden_suite) whose scalar is `NULL` = `fits:false` (Spec 88 §2.4). Verified genuine: 99.6% of these permits DO link a parcel and 99.3% carry a `NULL max_*_gfa_sqm` — the accessory-fit model (Spec 65 §7) returned no envelope, so cost is `null` **by design** (a permissioning result, never a fallback). *(Note: many are permits literally FOR a garage that the conservative fit-model declines to fit — a Spec 65 accessory-fit-conservatism follow-up, not a cost-model bug.)* |
| `ladder_rejected:t2_bound` | 214 (3%) | 178 (1%) | The propagated line total fell **outside** the T2 plausibility bounds (`archetype_t2_*_cap` / `_min`) — the data-poison guard firing as designed; the row correctly falls through rather than emit an implausible price. |
| `class_gate` | 33 (0.5%) | — | `permit_type_class ≠ 'construction'` (Spec 80 §5) — all verified administrative/safety/modifier permit_types (`AS Alternative Solution`, `Fire/Security Upgrade`, `Conditional Permit`, …), correctly non-priced. |
| `not_lowrise` | — | 2,628 (19%) | `structure_type` outside the low-rise gate (Apartment / Office / Mixed-Use / Commercial) — out of the archetype scope by design (Steps A–D territory; no low-rise archetype applies). |
| `mapper_null:t4` | — | 5,670 (41%) | No archetype line: `Severance`/`Demolition` (→ null by rule), tagless leads, or descriptor-only tags (`dwelling`/`residential`/`two-storey`) with a `NULL project_type` — no scope to price. |
| `now_priced:*` | 14 (0.2%) | 0 | The **current** code WOULD price these — they are STALE rows the cost step has not re-processed since the ladder shipped. **Not a bug**; they resolve on the P7 in-chain re-run. |

**Consequence:** cost coverage is bounded today by parcel cost-menu propagation coverage (`mapped_no_scalar`) and the accessory-fit model's conservatism (`fit_blocked`), NOT by the cost-model code. Both are logged as follow-ups (`docs/reports/review_followups.md`); expanding §4D propagation coverage is the highest-leverage next step.

### Core Logic (Three-Step Valuation) — the T4 / legacy path (mapper-null residential + non-residential)

> **permit_type_class gating (WF2 #3, implemented 2026-05-08, depends on mig 120 / Spec 80 §5):** the cost model only applies the Surgical Triangle when `permit_type_class = 'construction'`. Non-construction classes (`signage`, `administrative`, `safety_upgrade`, `unclassified`) short-circuit BEFORE Step A (GFA), Step B (Area_Eff), Step C (trade valuation), and Step D (Liar's Gate) → `cost_source = 'none'`, `estimated_cost = null`, `trade_contract_values = {}`. The gate is enforced at the Brain layer (`src/features/leads/lib/cost-model-shared.js`) so both the Muscle and the TS shim inherit the same byte-identical short-circuit. The Muscle's SOURCE_SQL gains `LEFT JOIN permit_type_classifications` with `COALESCE(ptc.class, 'unclassified')` and a startup guard refuses to run when the lookup table is empty (Spec 47 §R5). Eliminates the $29M-for-2-signs class of bug surfaced by the WF3 investigation 2026-05-08 (sign permits inheriting host-building GFA in the Surgical Triangle). Detailed behavior table: see Spec 80 §5 "Cost-model behaviors". The reserved `signage` class will be unlocked once a future WF3 adds description-level subtype detection inside `Designated Structures`.


#### Step A: Establish Geometric Truth (GFA)
Calculate the physical baseline of the structure.
* **Primary (Massing)**: $GFA = Footprint\ Area \times (Stories\ or\ Height\ Factor)$
* **Fallback (Parcel)**: $GFA = Lot\ Size \times Coverage\ Ratio \times Default\ Stories$
  * Urban Coverage: 0.7x
  * Suburban Coverage: 0.4x

> **WF2 #C 2026-05-09 — `footprint_area_sqm` is end-to-end populated.** Pre-fix, all 427K `building_footprints` rows had `footprint_area_sqm = NULL` (the load-massing.js Web Mercator nulling bug). The Brain's `computeGfa` consequently fell back to the parcel path for every permit. Mig 122 backfilled the legacy rows via PostGIS `ST_Area(ST_Transform(... 3857 → 4326)::geography)`; the load-massing.js post-INSERT UPDATE pass keeps future loads populated. See Spec 56 §2 "Geometry projection" for the projection handling.

#### Step B: Determine Effective Work Area (Area_Eff)
The "Surgical Triangle" lookup using `classify-scope.js` result, Permit Type, and Structure Type.
**Area_Eff** = GFA * Permit Type Allocation %

> **Archetype `geom_basis` (Spec 65 §6 SC-5 / Spec 80 §5.B.1, 2026-06-22):** the project's archetype selects WHICH parcel floor-area field feeds the `GFA` above — FB→`max_buildable_gfa_sqm` (new build), ADD→`cur_storey_gfa_sqm` (add-storey headroom), BAS→`cur_basement_gfa_sqm`, KIT/BTH→`cur_est_kitchen_gfa_sqm`/`cur_est_bath_gfa_sqm`, INT→`cur_interior_reno_gfa_sqm`, LANE→`max_rear_suite_gfa_sqm` (laneway⊕garden, Spec 65 §7), GAR→`max_garage_gfa_sqm` (Spec 65 §7); `null` (ENV/MEC/SITE) keeps today's permit-GFA path. NULL geom_basis value (e.g. LANE on a no-fit lot) → safe-skip. ~~Phases 2–3 ship the map + the parcel fields only; the cost-model read of `geom_basis` is a later WF (no wiring change here yet).~~ **DEFERRAL CLOSED (WF2 2026-07-06):** the archetype wiring shipped as §3-ARCHETYPE above — the mapper + ladder consume the parcel archetype costs directly; this Step-B geom_basis note now describes only the T4/legacy path.

> **Matrix-miss safe-skip (WF3 Pass-2.5 Finding D, 2026-05-21):** When the `scope_intensity_matrix` has no row for the `(permit_type, structure_type)` pair AND `permit_type_class = 'construction'` (Spec 80 §5), the cost model **safe-skips** with `cost_source = 'none'` and `estimated_cost = null` — instead of the previous "miss → default to 1.0 (full GFA)" behavior. The pre-fix behavior produced $14M-style cost balloons on trade-specific permits (a 119m² plumbing scope inside a 46K-sqm office got the full 46K sqm → $14M). The matrix-miss envelope is byte-symmetric with the existing `permit_type_class != 'construction'` short-circuit: `modeled_gfa_sqm = null`, `effective_area_sqm = null`, `trade_contract_values = {}`, `is_geometric_override = false`. Telemetry counters (`matrix_misses`, `matrix_miss_unique_keys`, `matrix_miss_top_keys`) emit to `audit_table` so operators can prioritize incremental matrix backfill — see §3.A Operator Runbook below.

#### §3.A Operator Runbook — Adding `scope_intensity_matrix` rows

Triggered when the `compute-cost-estimates` audit_table shows non-trivial `matrix_misses` (added by WF3 Pass-2.5 Finding D). Follow this runbook to incrementally improve coverage.

**(a) Discover top misses.** Query the most recent `compute-cost-estimates` run's audit_table:

```sql
SELECT records_meta->'audit_table'->'rows'
  FROM pipeline_runs
 WHERE pipeline = 'permits:compute-cost-estimates'
   AND status   = 'completed'
 ORDER BY started_at DESC
 LIMIT 1;
```

Look for the `matrix_misses`, `matrix_miss_unique_keys` (with `_truncated` flag), and `matrix_miss_top_keys` rows. The `matrix_miss_top_keys` value is a JSON object mapping `permit_type::structure_type` → miss count, sorted by frequency (top 10).

**(b) PRIMARY — admin Control Panel.** When the Spec 86 Control Panel surface for `scope_intensity_matrix` is available, use it to add rows. The Control Panel provides input validation (allocation percentage ∈ (0, 1]), audit logging via `admin_action` breadcrumb, and a diff-before-save preview.

**(c) FALLBACK — direct SQL with engineering review.** If the Control Panel surface is not yet live, operators can add rows via SQL after engineering review:

```sql
INSERT INTO scope_intensity_matrix (permit_type, structure_type, gfa_allocation_percentage)
VALUES
  ('Building Additions/Alterations', 'Office',         0.20),     -- 20% GFA allocation
  ('Building Additions/Alterations', 'Retail Store',   0.20)
ON CONFLICT (permit_type, structure_type) DO UPDATE
  SET gfa_allocation_percentage = EXCLUDED.gfa_allocation_percentage;
```

Allocation values MUST satisfy the CHECK constraint (`> 0 AND <= 1.0`).

**Vocabulary contract (WF1 §3.A re-key, 2026-05-24):** Use **exact production vocabulary** matching the values in the `permits` table — Toronto's CKAN feed values verbatim (Title Case + prefix format, e.g., `'SFD - Detached'`, `'Apartment Building'`, `'Building Additions/Alterations'`). The Brain looks up matrix rows by exact string match with defensive `.trim()` only — **NO case normalization**. The Brain's `computeEffectiveArea` and the Muscle's `scopeMatrix` pre-fetch use the same trim-only contract. See `src/features/leads/lib/cost-model-shared.js` NORMALIZATION CONTRACT comment.

**Producers of this `structure_type` vocabulary (2026-06-20):** This §3.A vocabulary is the canonical source of truth, owned here. Consumers/producers of it: (a) `permits.structure_type` — Toronto CKAN feed verbatim (load-permits); (b) `coa_applications.structure_type` — keyword-classified from the CoA `description` by `classify-coa-scope.js` (Spec 42 §6.6.D), which emits a subset of these exact values (a drift-lock test pins classifier output ⊆ migration 163 vocab). The CoA producer maps `description` → archetype because CoA has no CKAN `structure_type`; it deliberately does NOT use `parcel_buildings.structure_type` (a disjoint physical-role vocab: `primary`/`shed`/`garage`).

**Step 1 Input Sanitization (re-stated post-WF1):** Defensive `.trim()` only; case is preserved verbatim. Vocabulary mismatch is surfaced via the `matrix_miss_pct` audit row (OB-3b), not silently normalized.

**(d) Domain-research caveat.** Trade-specific permits (Plumbing(PS), Mechanical(MS), Electrical, Drain and Site Service, Demolition Folder (DM)) may NOT have a valid "fraction of GFA" semantic at all — system scope is typically not floor-area-proportional. A plumbing rough-in on a 46K-sqm office is NOT "X% of 46K sqm × $/sqft trade rate"; the actual cost is driven by fixture count, riser layout, etc. **The safe-skip IS the permanent correct behavior for trade-specific permit_types.** Operators MUST validate any proposed allocation_pct against historical declared costs (compare `est_const_cost` distributions for the permit_type) before adding matrix rows.

**(e) Expected coverage post WF1 §3.A re-key (2026-05-24).** Per PI-1/PI-3 (`docs/reports/wf1-cost-matrix-rekey-pis.md`): with the 32-row production-vocabulary matrix from migration 163, post-fix `model_coverage_pct` is anchored to PI-1 prediction ± 5pp. PI-1 predicted ~52% construction-permit coverage given the safe-skip-by-design exclusion of trade-specific permit_types (~50% of construction permits per §3.A(f)). Verification criterion is **single**: actual coverage = PI-1 predicted ± 5pp. Falling above the band signals matrix over-coverage (extra rows shouldn't be there); falling below signals under-seeding.

**(f) Operator-Documented Safe-Skip List (WF1, 2026-05-24).** The following permit_types intentionally have **NO matrix row** per §3.A(d) — they are scope-bounded by fixture count / riser layout / unit count / equipment, not by GFA fraction:

- `Plumbing(PS)` — plumbing system permit (fixture-count-bounded)
- `Mechanical(MS)` — mechanical system permit (equipment-bounded)
- `Drain and Site Service` — site servicing (linear-foot-bounded)
- `Demolition Folder (DM)` — demolition (cubic-volume-bounded, separate cost basis)
- `Electrical` — electrical system permit (panel/circuit-count-bounded)

A miss for any of these permit_types produces `cost_source='none'` deliberately. The `matrix_miss_pct` audit row reports them as Path B (matrix-miss), but operators should NOT add matrix rows for them — that would re-introduce the $14M class of bug §3.A(d) warns about.

#### Step C: Trade Valuation (The Constraint Filter)
The engine joins with `permit_trades`. If a trade was not identified during classification, Value = $0. For "Found" trades:
**Trade Value** = (Area_Eff * Base Trade Rate) * Structure Complexity Factor * Neighborhood Premium

*Note: The Structure Complexity Factor is pulled dynamically from `trade_sqft_rates` because multi-unit complexity affects trades disproportionately (e.g., plumbing vs. roofing).*

#### Step D: The "Liar's Gate" Validation
Final audit against city `est_const_cost`:
* **Zero-Total Bypass (CRITICAL)**: If `Surgical_Total === 0` (e.g., no active trades found), immediately return `$0` for all trades and set `cost_source: 'none'`. Do NOT attempt proportional slicing.
* **Default**: If Reported <= $1,000, use Surgical Total exclusively.
* **Override**: If Reported < (Surgical_Total * 0.25), use Surgical Total. Set `is_geometric_override = TRUE`.
* **Trust (Proportional Slicing)**: If Reported > (Surgical_Total * 0.25), use our $/sqft rates to determine Relative Weight:
  * **Benchmark**: Calculate what each trade should cost via Surgical model.
  * **Weight**: Calculate % each trade contributes to our theoretical total.
  * **Slice**: Apply those % weights to the city's reported total.

##### The three `cost_source = 'none'` paths (WF3 Pass-2.5 Finding E re-characterization, 2026-05-21)

The Brain emits `cost_source = 'none'` via three distinct paths. Their envelope shapes intentionally differ — operators distinguish causes by the populated/null pattern AND the `_`-prefixed telemetry flags (which flow into the Muscle's `audit_table` counters, not into `cost_estimates` rows).

| # | Cause | Brain location | `modeled_gfa_sqm` | `effective_area_sqm` | Telemetry flag | Audit counter |
|---|-------|----------------|-------------------|----------------------|----------------|---------------|
| **A** | `permit_type_class != 'construction'` short-circuit (Spec 80 §5 gate — signage / administrative / safety_upgrade / unclassified) | `estimateCostShared` lines ~488-522 | **null** | **null** | `_permitTypeClassSkipped: true` | `permit_type_class_skipped` |
| **B** | Matrix-miss safe-skip (Surgical Triangle has no row for the permit's `permit_type::structure_type` — WF3 #5 Finding D) | `estimateCostShared` lines ~544-565 | **null** | **null** | `_matrixMiss: true`, `_matrixMissKey: <key>` | `matrix_misses`, `matrix_miss_unique_keys`, `matrix_miss_top_keys` |
| **C1** | Zero-Total Bypass — matrix HIT + GFA > 0 but `surgicalTotal === 0` because no `active_trade_slugs` matched the `tradeRates` table | `applyLiarsGate` lines ~364-375 (Zero-Total Bypass branch) → main return in `estimateCostShared` at lines ~598-619 | **populated** (from Step A) | **populated** (`areaEff > 0`) | `_zeroTotalBypass: true` | `zero_total_bypass` |
| **C2** | Zero-Total Bypass — `gfa = 0` (no massing AND no lot-size data) → `areaEff = 0` → falls through matrix-miss check, `surgicalTotal = 0` via the `areaEff > 0 ?` short-circuit at the call-site | same as C1 (lines ~364-375 → ~598-619) | **null** (`modeledGfaSqm` is null when `computeGfa` returns `gfa=0`) | **null** (`areaEff > 0` is false) | `_zeroTotalBypass: true` | `zero_total_bypass` |

**Path C1 asymmetry is intentional, not a defect.** Path C1 preserves the computed geometry on the `cost_estimates` row because:
- Geometry IS knowable (matrix had an allocation; Surgical Triangle ran successfully).
- Scope IS knowable (`effective_area_sqm` reflects the surgical area).
- Only the cost is unknown (no active trades classified for this permit, or the classified trades don't have rate-table entries).

This gives operators a per-row debug signal distinguishing "we couldn't compute geometry at all" (Paths A/B/C2 → all null) from "we computed geometry and scope but no trades activated cost-slicing" (Path C1 → geometry preserved, cost null). The latter typically indicates an upstream `classify-permits.js` coverage gap or a missing `trade_sqft_rates` row, not a cost-model defect.

**Path C2 produces an all-null envelope identical to Paths A/B at the row level.** The reliable per-row distinguishing signal is the `_zeroTotalBypass: true` telemetry flag (visible in test fixtures + parity battery), and at the pipeline-run level the `zero_total_bypass` audit counter. Operators **MUST** read the audit_table counters to attribute null-cost permits to their cause when the row alone is ambiguous — Paths A, B, and C2 all produce the same row shape.

**Original Finding E observation:** The §7a Inspector spot-check (2026-05-20) found 5/12 permits with the partial-write pattern. Subsequent investigation (post-WF3 #5) determined these were predominantly Path B (matrix-miss permits getting modeled_gfa from the full building GFA). WF3 #5 Option A resolved Path B by switching to all-null. Residual Path C1 cases retain populated geometry by design; Path C2 cases (rare — no geometry inputs at all) are all-null.

**Aggregation rule for Pass-2.5 Inspector:** when auditing partial-write patterns, distinguish the four causes by reading the Muscle's audit_table counters in the most recent `compute-cost-estimates` pipeline_run — the per-counter cause is dispositive. Do NOT treat populated `modeled_gfa_sqm` + `cost_source='none'` as a defect on its own; cross-reference the `zero_total_bypass`, `matrix_misses`, and `permit_type_class_skipped` counters first.

### Edge Cases
* **Missing Massing**: Fallback to Lot Size $\times$ coverage ratios.
* **Mixed-Use**: Requires multi-variable intensity matching for commercial/residential split.
* **Shell Permits**: Applies an additional `commercial_shell_multiplier` (0.60x) to interior trades.

### Geometric-Only Path for CoA Leads (WF1 #coa-pipeline-parity-phase-a, 2026-05-13)

> **⚠️ SUPERSEDED by §3-ARCHETYPE (WF2 2026-07-06) — retained for history.** This section describes the ORIGINAL CoA cost path. **The live CoA cost path is the §3-ARCHETYPE ladder** (`cost_source='archetype_parcel'`), not the geometric path below. The legacy `'model'→'geometric'` transform priced **0.0%** of CoAs (every CoA matrix-missed the Surgical Triangle via the `::`-key bug) and was RETIRED in `compute-coa-cost-estimates.js` (the `transformCostSource` removal). The `'geometric'` `cost_source` enum value is PRESERVED (mig 209) for backward-compat with legacy rows and for downstream readers (`refresh-snapshot.js`, `lead-schemas.ts`, `CoaClassificationPanel.tsx`) — **do not prune** — but no code writes it for new CoA rows. Read §3-ARCHETYPE (CoA: same ladder minus T1) for the current behavior.

CoA applications carry no applicant-declared construction cost (the `est_const_cost` field is permit-side only). The CoA cost path is therefore **geometric-only** — there is no Liar's Gate equivalent for CoA leads because there is no applicant declaration to gate against.

**Inputs (CoA):**
- `coa_applications.scope_tags` (Phase D classifier output)
- `coa_applications.project_type` (Addition / NewConstruction / Alteration / Demolition / Severance / Mixed)
- `coa_applications.coa_type_class` (residential / commercial / institutional / mixed)
- `lead_parcels` (filtered to CoA leads) ⋈ `parcel_buildings.modeled_gfa_sqm` (the geometric anchor)
- `trade_sqft_rates` (base rates per trade per sqft)
- `scope_intensity_matrix` (allocation percentages — the Surgical Triangle)
- `neighbourhoods.avg_household_income` (income premium adjustment)

**Output (CoA):**
- `cost_estimates` row keyed on `lead_id = 'coa:' || application_number` per Spec 42 §6.6.C
- `cost_source = 'geometric'` ALWAYS (no applicant-declared anchor available)
- `is_geometric_override = true` ALWAYS
- `estimated_cost = effective_area_sqm × Σ(trade_rate × scope_intensity)` — no city-declared cost to weight against
- `trade_contract_values` JSONB populated via Surgical Triangle allocation across active CoA trades

**No-Liar's-Gate semantics:** the permit-side Liar's-Gate compares declared vs geometric within a `liar_gate_threshold_pct` window. With no declared CoA cost, the geometric output is the authoritative value — there is no rejection path. This means CoA estimates are inherently noisier than permit estimates (no double-check), but they fill a structural gap (cost estimates didn't exist for CoA-stage leads before this work).

**Per-trade slicing for realtor:** the realtor financial-base carve-out (existing per WF3 2026-05-08) applies — CoA-stage realtor rows use the total `estimated_cost` rather than a `trade_contract_values` per-trade slice (since CoA classifier may not always allocate to realtor explicitly). See Spec 81 §3 realtor carve-out.

**Acceptance (RE-DERIVED WF2 P5, 2026-07-06 — supersedes the stale "≥ 80%"):** The original ≥80% target assumed a geometric path that in fact priced 0.0% of CoAs; it never reflected reality and is retired. The archetype path's LIVE coverage, measured two ways:

- **Corpus:** 19,449 priced / 33,280 total = **58.4%** (`archetype_parcel` on every priced row). This figure is inflated by CLOSED CoAs (terminal `lifecycle_group='C4'`, 87.6% of the corpus), which skew toward being priced.
- **Feed-relevant OPEN subset** (geocoded AND non-terminal `lifecycle_group ∈ {C1,C2,C3}` — the CoAs that can actually surface as leads): 1,585 priced / 3,200 total = **49.5%**. This is the number the feed sees; it is LOWER than the corpus because the priced CoAs skew closed.

The remaining OPEN-subset `'none'` (1,615) decomposes per the §3-ARCHETYPE rejection taxonomy above — dominated by `mapper_null:t4` (988: severance/tagless/descriptor-only), `not_lowrise` (301: apartment/commercial), and `mapped_no_scalar` (228: §4D propagation-coverage gap). None is a cost-model code defect. **Acceptance is therefore the taxonomy itself** (every `'none'` accounted for by a correct reason), not a single percentage floor. *(Baseline is PRE-P6.6: the CoA fan-out fix (Phase 6.6) flips bundle-only `lead_trades` to `is_active=false`, which raises the CoA cost step's `null_reason_no_active_trades` counter on re-run; coverage impact ≈ 0 because the archetype ladder runs before any trade path — validated post-P6.6 in P7.)* Per Spec 42 §6.3 + Spec 49 coverage matrix.

### Step-by-Step Defense
**Step 1: Input Sanitization (Avoiding W12, W21)**
* **Numeric Guard**: Apply `Number.isFinite(row.est_const_cost)` to prevent NaN values from corrupting Path 2 logic.
* **String Cleaning**: All `scope_tags` strings must be `.toLowerCase().trim()` before comparison. `permit_type` and `structure_type` are `.trim()`-only — **case-preserved** per §3.A re-key (2026-05-24) to match the production-vocabulary matrix verbatim.

**Step 2: Data Deduplication (Avoiding W2, W3)**
* **The Set Rule**: All `scope_tags` must be wrapped in `new Set(tags)` before iteration. This prevents a duplicate "pool" tag from adding $80K twice in the DB while the API only shows it once.

**Step 3: The Surgical Triangle & Shell Multiplier (Avoiding W1)**
* **Shell Detection**: Detect "Shell" permits via `permit_type` or work description keywords.
* **Interior Sub-set**: Define a constant list of `INTERIOR_TRADE_SLUGS` (e.g., drywall, painting, electrical).
* **The 0.60x Rule**: If Permit = Shell AND Trade = Interior, apply a 0.60x multiplier to the trade's $/sqft rate.

**Step 4: The Liar's Gate & Pathing (Avoiding W9, W11)**
* **Path 3 (Null)**: If no estimate is possible, return `cost_source: 'none'` (NOT 'model') to avoid misleading display logic.
* **Float Guard**: Change the gate check to `modelCost >= PLACEHOLDER_COST_THRESHOLD` to prevent near-zero floats from triggering false overrides.

**Step 5: Trade Slicing (The Relative Weight)**
* Only perform "Weighted Slicing" for trades found in the `permit_trades` JOIN.
* **Constraint**: Any trade not in the classification list is hard-coded to $0.

---

## 4. Admin Control Panel

### Tunable Variables

| Variable Group | Variable Name | Description |
| :--- | :--- | :--- |
| GFA Defaults | `urban_coverage_ratio` | 0.7x default for high-density lots. |
| GFA Defaults | `suburban_coverage_ratio` | 0.4x default for low-density lots. |
| Liar's Gate | `trust_threshold_pct` | The 25% window before city data is discarded. |
| Surgical Scope | `effective_area_matrix` | Grid of Permit Type vs. Structure Type percentages. |
| Trade Costs | `base_trade_rates` | The $/sqft for all 32 trades. |
| Geography | `income_premium_tiers` | Multiplier (1.0x to 1.85x) based on neighborhood wealth. |

### Operating Variables (Avoiding W7, W10)

| Variable Group | Variable | Requirement |
| :--- | :--- | :--- |
| Infra | `ADVISORY_LOCK_ID` | Strictly set to 83 to avoid collision with other specs. |
| Logic | `liar_gate_threshold` | Must be added to `ZERO_IS_INVALID` to prevent silent disabling. |
| Telemetry | `liar_gate_overrides` | Counter must be emitted to the `audit_table`. |
| Telemetry | `matrix_misses` | Counter of construction-class permits that hit the `scope_intensity_matrix` miss path (WF3 Pass-2.5 Finding D). Gated on `> 0` to avoid zero-count audit noise. |
| Telemetry | `matrix_miss_unique_keys` | Count of distinct `permit_type::structure_type` keys observed in misses. Includes `_truncated`/`_total` flags when the bounded telemetry Map (cap = 200) drops new keys. |
| Telemetry | `matrix_miss_top_keys` | JSON object — top 10 missing `permit_type::structure_type` pairs by frequency. Operator runbook §3.A consumes this to prioritize matrix backfill. |
| Quality | `snapshots` | Script must populate `data_quality_snapshots` (from Migration 080). |

> **Per-permit audit surface (WF2 #4 2026-05-08):** the admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders every Surgical Triangle input from §3 (lot_size_sqm, footprint_area_sqm, height_m, stories, permit_type_allocation_pct, structure_complexity_factor, neighbourhood_premium_tier) plus the Liar's Gate decision tree (modeled_total, reported_total, ratio, path: surgical_only/proportional_slicing/none per §3D). When a single permit produces a "crazy number" (e.g., $29M for a sign install), the inspector exposes which input drove the divergence. This is the operator-facing dual to step 27 (`assert-global-coverage.js`) which measures field-coverage at the population level.

---

## 5. Testing Mandate

* **Logic**: `cost-model.logic.test.ts` — Asserts GFA precision, Surgical Triangle intensity weights, and Liar's Gate proportional slicing math.
* **Infra**: `cost-estimates.infra.test.ts` — Asserts `permit_trades` JOIN performance, batch-update integrity, and Migration 097 schema constraints.
* **Parity**: `parity-battery.test.ts` — Ensures `compute-cost-estimates.js` and `cost-model-shared.js` return identical values for 100+ permit scenarios.
* **Logic**: `cost-model.logic.test.ts` — Must test with duplicate `scope_tags` and verify 0.60x shell multipliers for interior trades.
* **Parity**: `parity-battery.test.ts` — Mandatory. Asserts that the Pipeline script and the API return the same values for "Liar's Gate" scenarios.
* **Infra**: `lock-integrity.test.ts` — Asserts that the advisory lock is released only at script end and uses a single pinned connection.

---

## 6. Operating Boundaries

**Target Files**
* `scripts/compute-cost-estimates.js` (The Muscle)
* `src/features/leads/lib/cost-model-shared.js` (The Brain)
* `migrations/097_surgical_valuation.sql`

**Out-of-Scope Files**
* `classify-permits.js`: This is an upstream dependency. The Slicer consumes this data but does not perform the classification itself.

**Operator-tunable surface**
* `scope_intensity_matrix` (DB table seeded via migration 096) — matrix completeness is operator-driven, not code-tunable. The Brain treats missing rows as a safe-skip signal (cost_source='none'), and operators add new rows via §3.A runbook as the telemetry surfaces hot misses.

**Cross-Spec Dependencies**
* **Relies on**: Spec 13 (Classify Permits) for trade identification and Spec 3 (Classify Scope) for project/structure types.
* **Consumed by**: Opportunity Scoring (Step 23) which uses the trade-specific dollar values for lead ranking.

---

## 7. Engine Mechanics Details

### 7.1 The Execution Engine (`compute-cost-estimates.js`)

**Objective**: This script is the "Muscle." Its goal is to perform bulk valuation of the entire permit database (237k+ records) by streaming data, invoking the valuation math, and performing high-speed database updates.

**How it Works**
1. **Concurrency Check**: It acquires an Advisory Lock to ensure only one instance of the engine is running.
2. **Pre-fetch Matrix (N+1 Guard)**: Before opening the stream, the script queries the entirety of `trade_sqft_rates` and `scope_intensity_matrix` and stores them in a standard JS `Map()` or object in memory.
3. **Streaming Query**: It opens a stream to the database, joining permits with `permit_trades` (Step 13 classification) and `permit_parcels`. (The loop performs synchronous memory lookups against the Map, never querying the DB per-row).
4. **The Loop**: For every permit in the stream, it calls the `cost-model-shared.js` library to calculate the surgical estimate.
5. **In-Loop Backpressure (Batch Flush)**: The script must NOT collect all 237,000 results in memory. The `batch` array must be evaluated *inside* the `for await` stream loop. As soon as `batch.length >= BATCH_SIZE`, the script pauses the stream, awaits `flushBatch()`, clears the array (`batch.length = 0`), and then resumes the stream to prevent Node V8 OOM crashes.

**Key Responsibilities**
* **Database I/O**: Managing the high-volume read/write operations for the valuation chain.
* **Context Gathering**: Providing the "Valuation Brain" with all raw inputs (Massing, Lot Size, Classification Tags).
* **State Management**: Updating `computed_at` timestamps to ensure incremental runs only process new or changed data.

**Required Tables & Fields**

| Table | Required Fields |
| :--- | :--- |
| `permits` | `permit_num`, `revision_num`, `est_const_cost`, `scope_tags`, `project_type`. |
| `permit_trades` | `trade_id`, `trade_slug` (ALL classified trades joined — no `is_active` filter; phase relevance is a lead-scoring concern, not a cost-distribution concern). |
| `permit_parcels` | `neighbourhood_id` (To route the geographic premium). |
| `neighbourhoods` | `avg_household_income` (Joined via permit_parcels to determine the premium tier). |
| `cost_estimates` | `effective_area_sqm`, `trade_contract_values` (JSONB), `is_geometric_override`. |

**Key Inputs & Outputs**
* **Inputs**:
  * `SOURCE_SQL` results: Raw permit data, parcel sizes, massing IDs, and `avg_household_income` (via `neighbourhoods` JOIN).
  * Classification Ledger: The results of `classify-permits.js` (Step 13) to know which trades are actually active.
  * Scope Metadata: The `project_type` and `scope_tags` from `classify-scope.js` (Step 3).
* **Outputs**:
  * `cost_estimates` table: Final values for `effective_area_sqm`, `is_geometric_override`, and the `trade_contract_values` JSONB.
  * Audit Metrics: Telemetry on how many city costs were overridden by the "Liar's Gate."

**Reusable Sections from Current Script**
* **The Pipeline Wrapper**: The `pipeline.run`, `ADVISORY_LOCK_ID`, and `BATCH_SIZE` logic are perfect and should stay.
* **The Database I/O**: The `flushBatch` function and the `SOURCE_SQL` query remain the backbone, though the SQL will need an additional JOIN with `permit_trades`.
* **Telemetry Boilerplate**: The `pipeline.emitSummary` and `audit_table` logic are already set up to handle the reporting we need.

### 7.2 The "Surgical" Logic Flow

To ensure this actually delivers reliable results, the logic inside the Valuation Brain will execute as follows:

**Step 1: Geometry (The Volume)**
We calculate the raw building size using the massing height or the story default:
$$\text{GFA}_{Total} = \text{Footprint Area} \times (\text{Stories or Height Factor})$$

**Step 2: Scope (The Intensity)**
We determine the "Effective Work Area" by applying the intensity multiplier from the Surgical Triangle (Permit Type $\times$ Structure Type $\times$ Use):
$$\text{Area}_{Eff} = \text{GFA}_{Total} \times \text{Intensity Matrix \%}$$

**Step 3: Trade Valuation (The Constraint)**
We check the list of Classified Trades. If a trade was found, we apply the $/sqft rate:
$$\text{Trade Value} = (\text{Area}_{Eff} \times \text{Trade Rate (\$sqft)}) \times \text{Neighborhood Premium}$$
*Note: We are removing the old SCOPE_ADDITIONS (the $80k pool/elevator logic) in favor of this trade-rate approach to ensure the numbers scale naturally with the size of the building.*

### 7.3 Required Database Fields (Migration 097)

To power these scripts, we need to add these fields to support the new surgical variables:
* **`trade_sqft_rates` Table:**
  * `trade_slug` (PK)
  * `base_rate_sqft` (The $/sqft for that trade)
  * `complexity_multiplier` (To account for multi-unit vs. SFD)
* **`scope_intensity_matrix` Table:**
  * `permit_type` + `structure_type` (Unique Index)
  * `gfa_allocation_pct` (e.g., 0.25 for an SFD Addition)
* **`cost_estimates` Table (Updated):**
  * `effective_area_sqm` (The result of Step 2 above)
  * `trade_contract_values` (JSONB)

---

## 8. Writing Script Checklist

### Part 1: `scripts/compute-cost-estimates.js` (The Muscle)
*Objective: High-speed, lock-safe, memory-efficient data streaming, batch writing, and operational resilience.*

- [ ] **Header**: Contains `* SPEC LINK` to this doc AND the Dual Path declaration note.
- [ ] **Runbook/Recovery Plan**: Top of the script includes a 2-sentence comment explaining how an operator resumes or restarts the script if it crashes mid-run.
- [ ] **Lock ID**: `const ADVISORY_LOCK_ID = 83;` is explicitly declared.
- [ ] **Pinned Client**: Lock is acquired using a dedicated client (`const lockClient = await pool.connect();`)—not `pool.query`.
- [ ] **Graceful Shutdown**: `process.on('SIGTERM', ...)` listener is implemented to release Lock 83 before `process.exit(143)`.
- [ ] **Lock Release**: The outer `try/finally` block guarantees `lockClient.release()` executes even if the script throws a fatal error.
- [ ] **Time Snapshot**: `const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');` is captured exactly once before the stream begins.
- [ ] **PII Guard**: `pipeline.log.warn/error` instances only pass primary keys (`permit_num`, `revision_num`) and the specific offending metric. `raw: row` is strictly prohibited.
- [ ] **Zod Validation**: All config values injected from the DB (urban coverage, suburban coverage, base rates, income premiums) are validated via Zod before the DB stream opens.
- [ ] **Zero-Invalid Guard**: `liar_gate_threshold` is explicitly added to the `ZERO_IS_INVALID` checks in the config loader to prevent silent disabling.
- [ ] **Batch Sizing**: `BATCH_SIZE` is computed programmatically based on column count to stay strictly under the 65,535 parameter limit.
- [ ] **Query Profiling**: `SOURCE_SQL` has been tested with `EXPLAIN ANALYZE` in staging.
- [ ] **Stream Query**: `pipeline.streamQuery` is used for the massive JOIN between `permits`, `permit_trades` (Spec 13), and `permit_parcels`.
- [ ] **Pre-fetch Guard (Part 1)**: `trade_sqft_rates` and `scope_intensity_matrix` are loaded into memory before the stream begins.
- [ ] **Demographic JOIN (Part 1)**: `SOURCE_SQL` successfully joins the `neighbourhoods` table to pass `avg_household_income` to the Brain.
- [ ] **Stream Guard**: The `for await` stream loop is wrapped in a `try/catch`.
- [ ] **Backpressure Guard (Part 1)**: `flushBatch` is awaited inside the `for await` loop and the array is cleared immediately after.
- [ ] **Atomicity**: `pipeline.withTransaction` wraps the `INSERT ... VALUES ... ON CONFLICT` execution.
- [ ] **WAL Bloat Guard (Part 1)**: The bulk UPSERT includes an `IS DISTINCT FROM` clause covering the area, the JSONB object, and the override flag.
- [ ] **Sequential Await**: No `Promise.all()` arrays are used inside the transaction block; DB writes are awaited sequentially.
- [ ] **Flags**: `--dry-run` and `--limit=N` flags are implemented.
- [ ] **Emit Summary**: `pipeline.emitSummary` is called exactly once.
- [ ] **Data Quality Snapshots**: Script explicitly populates `data_quality_snapshots` for data lineage tracing.
- [ ] **Audit Table**: `records_meta.audit_table` includes a specific row tracking the number of `liar_gate_overrides`.
- [ ] **Emit Meta**: `pipeline.emitMeta` correctly declares the read columns and write columns.

### Part 2: `src/features/leads/lib/cost-model-shared.js` (The Brain)
*Objective: Idempotent, mathematically pure, dual-path valuation logic with strict type contracts.*

- [ ] **Numeric Guard**: `Number.isFinite(row.est_const_cost)` is executed before any logic evaluation.
- [ ] **String Cleaning**: `scope_tags` is forced to `.toLowerCase().trim()` before evaluation; `permit_type` and `structure_type` are `.trim()`-only (case preserved) per §3.A re-key.
- [ ] **Set Deduplication**: `scope_tags` are mapped into a `new Set(tags)`.
- [ ] **Core Valuation Math**: Implements Geometry, Effective Area, and Trade Valuation properly.
- [ ] **Per-Trade Complexity (Part 2)**: The math logic applies the structure complexity factor at the trade level, not the global area level.
- [ ] **Shell Detection**: Implement the 0.60x rate multiplier for shell permits vs interior trades.
- [ ] **Div-By-Zero Guard (Part 2)**: Liar's Gate logic explicitly checks if `(Surgical_Total === 0)` before attempting division.
- [ ] **Float Guard**: Logic demands `modelCost >= PLACEHOLDER_COST_THRESHOLD` to prevent near-zero area floats from triggering false overrides.
- [ ] **Default Condition**: If city reported is $\le$ $1,000, model assumes total control.
- [ ] **Override Condition**: If city reported is $<$ (Surgical Total * 0.25), `is_geometric_override` is flagged TRUE.
- [ ] **Proportional Slicing**: If city reported is $>$ (Surgical Total * 0.25), the algorithm slices relatively.
- [ ] **Null Path**: Safely return `cost_source: 'none'`.
- [ ] **JSDoc Types**: Exhaustive JSDoc annotations (e.g., `@typedef`) explicitly define the expected input object to enforce `checkJs` compatibility.

### Part 3: Testing, Schema & Migration (The Glue)
*Objective: Enforce schema constraints and prove mathematical parity.*

- [ ] **Schema Enforcement (Migration 097)**: `cost_estimates`, `trade_sqft_rates`, and `scope_intensity_matrix` are properly configured.
- [ ] **Parity Test**: `parity-battery.test.ts` confirms API and Script yield same Liar's Gate slicing and JSONB object.
- [ ] **Logic Test**: `cost-model.logic.test.ts` explicitly tests the "duplicate scope tags" + 0.60x multiplier triggers.
- [ ] **Infra Test**: `cost-estimates.infra.test.ts` asserts parameter counts on the bulk UPSERT never exceed PostgreSQL's limits.
- [ ] **Lock Test**: `lock-integrity.test.ts` asserts `ADVISORY_LOCK_ID = 83` acts exclusively on a single pinned connection.

### Part 4: Deployment & Ops (The Release Gate)
*Objective: Protect production data integrity during rollout.*

- [ ] **Blast Radius Review**: SQL `UPDATE / ON CONFLICT` clauses have been reviewed to ensure no unintended rows or columns can be overwritten.
- [ ] **Telemetry Alerts**: A follow-up Jira/Linear ticket exists to wire the emitted `liar_gate_overrides` count to a monitoring alert.
