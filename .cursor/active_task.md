# Active Task: WF1 #coa-pipeline-parity-phase-a — Spec Amendments (FIRST, before any code)

**Status:** Implementation (authorized 2026-05-13 by user "B" — accept-as-is with documented known issues)
**Workflow:** WF1 (Genesis — plan a new feature; doc-only spec amendments delivered as the first phase of the larger WF2 #coa-pipeline-parity work)
**Domain Mode:** Backend/Pipeline (doc-only — touching pipeline + admin + mobile specs; per CLAUDE.md domain rules: "Doc-only changes, specs, reports → Either. Follow whichever domain the documented work belongs to." Backend/Pipeline applies because the implementation work that follows lands almost entirely in `scripts/`, `migrations/`, and `src/lib/leads/`.)
**Rollback Anchor:** `7d797a1` (current HEAD on main — WF2 #coa-pipeline-parity R0 review fixes + per-phase execution refs + CoA-only filter)
**Parent WF:** WF2 #coa-pipeline-parity (multi-phase work — Phases A through H per Spec 42 §6.11)

---

## Context

* **Goal:** Land all 13 spec amendments (§A.1–§A.13) enumerated in Spec 42 §6.10 Cross-Spec Changes + the `00_system_map.md` regeneration (§A.14) before any code, migration, or test work begins. This is **Phase A** of the CoA pipeline parity WF — the design contract for everything that follows in Phases B through H. After this Phase A ships, the spec text describes the post-implementation state; subsequent phases mechanically deliver against that contract.
* **Why now:** The user pinned spec-amendments-first as a deliberate sequencing constraint (see Spec 42 §6.11 Phase A — "FIRST, before any code"). Reason: every downstream phase depends on the specs defining the new schemas, the new scripts, and the new cross-spec contracts. If we ship code before the spec catches up, we accumulate drift; if the spec catches up first, the implementation is mechanical and reviewers have a clear target to validate against.
* **Target Spec:** This active task lands amendments across **12 specs** (listed in detail below in Execution Plan). Primary anchor specs:
  * `docs/specs/01-pipeline/42_chain_coa.md` §2/§3/§5 extension (this spec describes its own Phase A in §6.10 + §6.11)
  * `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` — most extensive amendment (§2.5.h.2 BUGS, §3 contract, §8 archive, 84-W11 namespace)
* **Key Files:** Spec markdown only (no `src/`, no `scripts/`, no `migrations/`). System map regenerated via `npm run system-map`. Test file updates ONLY where regression-locks assert specific spec text that we change.

---

## Spec 84 Investigation References (anchors for this work)

Phase A spec amendments are informed by the 8 investigations completed in Spec 84 §8 and committed under `b470f42`. Each amendment below references the investigation that justifies it:

* **§8.1 — Current Lifecycle Code Outputs.** Inventories every field the classifier writes. Used to justify the new granular columns added in §6.6.D/E of Spec 42 and to verify that the lifecycle ledger refactor (`permit_phase_transitions` → `lifecycle_transitions`) preserves every existing output.
* **§8.2 — Specs Consuming Lifecycle Data.** Lists 10 specs that read `lifecycle_phase`. Used as the seed list for §6.10 cross-spec changes (worktree review identified Spec 49 was missing — added in commit `7d797a1`).
* **§8.3 — Code Consumers of Lifecycle Data.** Inventories every code file touching the lifecycle surface. Confirms the blast radius of the lead_id refactor (Phase C) and informs the Phase F UI / mobile schema updates.
* **§8.4 — Drift: Current Code vs Granular Spec.** Identifies 5 categories of drift between today's classifier and the spec. Used to justify the bundled engine migration (Phase E) and to enumerate what the Spec 84 §3 Behavioral Contract amendment must include.
* **§8.5 — Universal Stream Review Findings.** Catalogues 3 internal-consistency BUGS (seq 14, seq 50, B9.C gap) and 6 QUESTIONABLE construction-sequencing items. **These BUGS must be resolved in Phase A as part of the Spec 84 §2.5.h.2 amendment** before the universal stream is locked into the `universal_stream_catalog` seed (Phase B).
* **§8.6 — Database Schemas: 11 Adjacent Specs.** Captures every table+column owned/read by the 11 adjacent specs. Cross-checked against the schema changes in Spec 42 §6.6 to ensure no shared columns are renamed without coordinating amendment.
* **§8.7 — Shared Fields Across Specs.** Catalogues 30+ shared columns between specs. Used to verify the cohort-key extension (Phase E) doesn't conflict with any existing field semantics.
* **§8.8 — Current Trade-Forecast Generation Mechanics.** Documents the bimodal routing + 5-tier urgency math + 5-level calibration cascade. Used to design the CoA-stage simplification (target always `bid_phase`; anchor priority `phase_started_at` → `decision_date` → `hearing_date` → application date) documented in Phase F.
* **§8.9 — Cross-reference to Spec 42 §6.** Notes Step 1 (this WF) delivers the schema + classifier + CoA parity. After this Phase A ships, §8 of Spec 84 gets archived (item §6.10 Spec 84 row, work item 4).

---

## Phase A Scope — Exhaustive Per-Spec Amendment List

For each spec below: the section(s) to amend, what to add/change/remove, references, and acceptance criteria.

### A.1 — `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` (FIRST — unblocks Phase B universal_stream_catalog seed)

**Why first:** Phase B Schema Migrations include seeding `universal_stream_catalog` from §2.5.h.2 + `universal_stream_trade_signals` from the per-trade signal columns. The 3 BUGS in §2.5.h.2 (per §8.5) must be resolved before the seed is locked. Plus 84-W11 namespace resolution informs Spec 80.

#### A.1.1 — Fix the 3 BUGS in §2.5.h.2 Universal Stream (per §8.5)

* **BUG 1 — seq 14 "Final & Binding".** Currently shows `Bid Value = 0` AND ✓ filled in all 37 non-realtor Bid columns. §2.5.h.9 line 905 explicitly states "Rows with `Bid Value ≤ 0.2` have NO bid checkmark." Decide: raise Bid Value to ~0.8 (strong bid moment — appeal window cleared) OR clear all Bid columns. **Recommended:** raise to 0.8 (semantically correct — the variance is now legally binding, GC may sequence the permit application imminently). Regenerate v10 CSV.
* **BUG 2 — seq 50 (row #31 Active Inspection) column-alignment shift.** `Work: excavation` ✓ where it should be blank (excavation works at #100/#101, not at the permit-status row); `Bid: Last Minute: excavation` blank where it should be ✓ (LM for excavation = row 31 per §2.5.h.9 line 944). Same shift on `temporary-fencing`. Regenerate from the script with corrected logic; verify against script output before committing.
* **BUG 3 — Block B9 sub-letter sequence `A→B→D` (missing B9.C).** Implementers building range-queries on Block will trip on the gap. Decide: assign B9.C (e.g., to time-bucketed P7a/P7b/P7c distinctions within "Permit Issued") OR document the gap as intentional with a `loop_marker` note. **Recommended:** assign B9.C to the "Construction Mobilization" sub-block covering rows 26 (Work Not Started) + 27 (Extension Granted) — this groups the post-issuance / pre-inspection states under one block. Reflow §2.5.h.2 accordingly.

Acceptance criteria for A.1.1: regenerated v10 CSV imports cleanly into a test `universal_stream_catalog` schema with all 110 rows, 174 columns, and zero internal-consistency BUGS per a re-run of the worktree code-reviewer's checklist.

#### A.1.2 — Review and accept-or-fix 6 QUESTIONABLE construction-sequencing items (per §8.5)

For each of the 6 QUESTIONABLE items below, decide: ACCEPT (with explicit "accepted limitation" note in §2.5.h.9) OR FIX (update the row in §2.5.h.2 + regenerate CSV). Construction-industry input not required for ACCEPT path.

* **Roofing / Windows / Glazing Work = #121 Exterior Final.** Reality: install RIGHT after framing for weather-seal. **Recommended:** ACCEPT with note — AIC has no dedicated stage; consumers should treat these as "Exterior Final marks the inspection of work that completed earlier."
* **Electrical Work = #106 HVAC Rough-in.** No dedicated electrical AIC stage. **Recommended:** ACCEPT with note.
* **Painting / Flooring / Tiling / Trim / Millwork / Stone / Security all Work = #118.** Six trades share one Work anchor. **Recommended:** ACCEPT with note — within-stage sequencing requires sub-stage data we don't have.
* **Landscaping / Paving / Decking / Decks / Fences / Patio Work = #122 Occupancy.** Landscaping + paving often pre-occupancy in Toronto residential. **Recommended:** FIX — split into landscaping/paving → #121 (Exterior Final), decks/fences/patio stay → #122 (Occupancy). Update §2.5.h.9 trade table accordingly.
* **Realtor Work = #39 Permit Closed, LM = #122.** Closure lags occupancy 30–180 days. **Recommended:** FIX — Work = #122 (Occupancy), LM = #121 (Exterior Final). Update §2.5.h.9 realtor row.
* **Drywall LM = #116 (1-row data-quality variant).** LM almost never fires. **Recommended:** FIX — LM = #114 (Insulation/Vapour Barrier, 8,775 rows). Update §2.5.h.9 drywall row.

Acceptance criteria for A.1.2: each QUESTIONABLE item has an explicit ACCEPT-with-note or FIX-with-amended-row decision documented in §2.5.h.9. CSV regenerated to v10.

#### A.1.3 — Update §3 Behavioral Contract

* Document the CoA P2/P3/P4 emission rules wired by the (future) Phase E lifecycle engine work:
  * dead decisions → NULL
  * `decision = 'Final and Binding'` → P4
  * `decision IN ('Approved', 'Approved with Conditions', 'Conditional Consent')` → P3
  * `status IN ('Internal Review', 'Public Hearing Scheduled')` → P2
  * intake statuses → P1
  * catchall (unknown CKAN status) → P1 + `unmapped_status` audit metric
* Document the granular-column emission rules (`lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value`) derived via JOIN against `universal_stream_catalog`.
* Document the `lifecycle_transitions` ledger replacing `permit_phase_transitions`, with both legacy `from_phase`/`to_phase` AND granular `from_seq`/`to_seq` populated.
* Cross-reference Spec 42 §6.7 for the implementation detail.

#### A.1.4 — Archive §8 Implementation Plan

* §8 currently contains 8 investigation results (§8.1–§8.8) + §8.9 cross-reference to Spec 42. After this WF ships, §8.9 is delivered. Action: add a header at top of §8 noting "Step 1 (CoA Pipeline Parity) delivered by Spec 42 §6 — WF1 #coa-pipeline-parity-phase-a through Phase H. Subsequent steps in the migration roadmap become follow-up WFs." Keep §8.1–§8.8 as historical investigation reference; mark §8.9 as DELIVERED with link to commits.

#### A.1.5 — Update §8.7 cohort-key blind spot description

* §8.7 currently describes the `(permit_type, phase)` cohort key collapsing every CoA-stage lead to `__ALL__`. After Phase E (lifecycle engine WF2), cohort key extends to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Action: add "RESOLVED IN WF2 #coa-pipeline-parity Phase E — see Spec 42 §6.7" note to §8.7; preserve the original blind-spot description as the motivation context.

#### A.1.6 — Resolve 84-W11 (P3/P4 namespace collision) — Granular-first deprecation

* §6 of Spec 84 includes bug 84-W11 (P3/P4 used for both CoA and Permit phases, string-identical codes colliding). **Resolution: this WF deprecates the legacy P-code namespace in favor of granular Universal Stream identity.** Phase A spec amendment adds §3 sub-section "Phase-Code Namespace Deprecation" documenting:

  * **`lifecycle_seq` is the authoritative phase identity going forward.** CoA P2 (seq range 1–21, lifecycle_group `C1`/`C2`/`C3`) and Permit P2 don't exist as a collision — they're different seq ranges. CoA P3 is seq 10–15; Permit P3 is seq 23–34. The collision is purely a legacy-namespace artifact.
  * **Legacy P-code is preserved during transition** (Phases C–G) on the `lifecycle_phase` column for backward compatibility with `compute-trade-forecasts.js` bimodal routing (which currently keys on P-code ordinals) and the existing `assert-lifecycle-phase-distribution.js` band check. Both consumers migrate to `lifecycle_seq` reading during their respective phases.
  * **Consumers MIGRATE to `lifecycle_seq` rather than disambiguate the P-code:**
    * `link-coa.js` SKIP_PHASES — currently excludes P1/P2 (CoA) from `last_seen_at` bump. Migrates to: `WHERE lifecycle_group NOT IN ('C4')` (excludes ONLY CoA terminal group — Withdrawn / Cancelled / Complete / Closed). **C1/C2/C3 must still bump** — these represent active CoA progression and the linked permit needs reclassification when the CoA decision lands (C2 → C3 transition). The original "exclude P1/P2" semantics from Spec 42 §2 lines 56-57 preserved by translating to group-level — `lifecycle_group='C4'` is the CoA equivalent of permit `lifecycle_phase IN ('P19','P20','O1','O2','O3')`. Spec 84 §3 SKIP_PHASES section updated to document the group-axis filter. (Fix per R2.v2 Worktree BUG-3 — earlier draft incorrectly excluded all CoA groups, which would have silently broken the CoA→Permit relink contract.)
    * `compute-trade-forecasts.js` source filter — currently filters `lifecycle_phase NOT IN ('P19','P20','O1','O2','O3')`. Migrates to: `WHERE lifecycle_seq IS NOT NULL AND lifecycle_group NOT IN ('C4','BP7')` (excludes CoA closure + Permit closure groups). Spec 85 amendment captures this.
    * `assert-lifecycle-phase-distribution.js` — see §A.1.7 below for full distribution-gate granular migration.

* **No `coa_p3`/`coa_p4` band-key patching.** The earlier reviewer suggestion to add `lifecycle_band_coa_p3_min/max` keys is rejected on architectural grounds — patching the legacy P-code system contradicts the granular-first move. Instead, the distribution gate pivots to validate `lifecycle_seq` / `lifecycle_block` distributions directly (see §A.1.7).

* **`lifecycle_phase` column deprecation roadmap:** populated through Phase H for backward compat. Drop in a future cleanup WF once `assert-lifecycle-phase-distribution.js` and `compute-trade-forecasts.js` no longer reference it.

#### A.1.7 — Distribution gate granular migration (NEW — was BUG-5 from R2 review)

* `scripts/quality/assert-lifecycle-phase-distribution.js` currently validates `lifecycle_phase` (P-code) row counts against `logic_variables.lifecycle_band_p{N}_min/max` (36 keys). When Phase E ships the 84-W12 fix, CoA rows start emitting P2/P3/P4 — roughly +27,000 CoA rows that didn't exist in the historical distribution. The existing permit-sized bands will blow on first chain run after Phase E.

* **Granular-first resolution:** the distribution gate pivots to validate **`lifecycle_block`** counts (~15 block keys) against new `logic_variables.lifecycle_band_block_<block_id>_min/max` keys. Block-level aggregation is the right granularity — per-seq bands (110 keys) are too noisy; per-phase bands (36 keys) collapse CoA + Permit into a single bucket which is exactly the bug. Block-level distinguishes CoA blocks (B1.A through B4.A) from Permit blocks (B5.A through B15.H) from Inspection blocks (B10.A through B13.C) naturally — no namespace patching needed.

* **Implementation across phases:**
  * Phase A (this task): document the new band-key contract in Spec 86 (`86_master_configuration_list.md`) — add `lifecycle_band_block_<block_id>_min/max` (×~15) and `lifecycle_band_seq_<seq>_min/max` (×110) keys to the `logic_variables` schema documentation. Note that block-level is the primary; seq-level is optional finer-grain check available for diagnostic queries.
  * Phase B (schema): migration adds the new `logic_variables` rows seeded with `NULL` (recalibration in Phase E).
  * Phase E (recalibration): after the classifier fix populates `lifecycle_block` on all rows, measure the actual block distribution, set `min/max` bands at median ± 30% per block (subject to operator tuning across 7-consecutive-green-runs gate).
  * Phase H: the legacy `lifecycle_band_p{N}_min/max` keys (36 entries) are removed in cleanup.

* **`Spec 86` amendment added to A.13 (cross-spec list):** see §A.13 below — was missing from §6.10 of Spec 42; was misclassified as Worktree DEFER1 ("§6.12 wording" — actually a deeper schema-key issue).

Acceptance criteria for A.1 (overall): 7 sub-edits land (A.1.1–A.1.7); regenerated v10 CSV manually patched (no production script changes — see §R0.5 below) at `docs/reports/spec_84_universal_stream_v10.csv`; §8.5 BUGS struck through with "RESOLVED IN PHASE A" notes; QUESTIONABLE items each have explicit ACCEPT/FIX status validated against live DB inspection-stage data (§R0.5).

### A.2 — `docs/specs/02-web-admin/80_permit_classification.md` (taxonomy — unblocks Spec 13 + Spec 42)

* Add new section "CoA Application Taxonomy" defining `coa_type_class` value set: `residential`, `commercial`, `institutional`, `mixed`. Match the conceptual structure of the existing `permit_type_class` taxonomy.
* Document the description-keyword decision tree for `coa_type_class`:
  * Keywords for residential: "dwelling", "single family", "semi-detached", "townhouse", "apartment", "duplex", "triplex"
  * Keywords for commercial: "retail", "restaurant", "office", "warehouse", "industrial", "commercial"
  * Keywords for institutional: "school", "church", "hospital", "library", "municipal"
  * Mixed: present in both residential + commercial keyword sets
  * Fallback: derive from `parcel_buildings.structure_type` if scope-tag keywords don't fire
* Document the description-keyword decision tree for `project_type` (CoA): `Addition`, `NewConstruction`, `Alteration`, `Demolition`, `Severance`, `Mixed`.
* Cross-reference the existing `trade_mapping_rules` Tier-3 patterns (already in DB) — CoA classifier reuses Tier-3 only.
* Add explicit note: 84-W11 P3/P4 namespace collision is resolved by `lifecycle_group` disambiguation (CoA C2 vs Permit BP5). Reference Spec 84 §3 Phase-Code Namespace Disambiguation.

Acceptance criteria: Spec 80 has a complete CoA Taxonomy section with explicit value sets, keyword maps, and fallback rules. Spec 42 §6.10 row for Spec 80 references this section by name.

### A.3 — `docs/specs/01-pipeline/13_classify_permits.md` (trade classification — unblocks Phase D scripts)

* Add new section "CoA Application Mode" documenting:
  * The new script `classify-coa-trades.js` (Phase D) uses `trade_mapping_rules` filtered to `tier=3 AND match_field='description'`.
  * Same rule set as permit-side; different execution context (CoA has only description, not `permit_type` or `work` fields).
  * Tier 1 (permit_type) rules: DO NOT APPLY to CoA — no permit_type.
  * Tier 2 (work field) rules: DO NOT APPLY to CoA — no work field.
  * Tier 3 (description ILIKE) rules: APPLY.
  * Output: unified `lead_trades` table with `lead_id = 'coa:' || application_number`.
  * Realtor inclusion gate: `shouldAppendRealtor()` adapted to use `coa_type_class` + CoA description in place of `permit_type_class` + permit `work`.
* Cross-reference Spec 42 §6.5 step 13 disposition.

Acceptance criteria: Spec 13 explicitly documents the Tier-3-only execution mode. Any future rule change documents which mode (permit or CoA) it affects.

### A.4 — `docs/specs/01-pipeline/41_chain_permits.md` (sibling chain — references unified tables + step 18 removal)

**Test regression-lock inventory (added per R2 worktree review BUG-2 + BUG-4):** Removing step 18 + the script body change touches 6+ existing tests. Phase A spec amendment work in this section does NOT modify any test code (that's Phase G's job when the script actually retires); but the spec text changes must be reflected in test assertions THIS phase since the spec is being edited now. Specifically:

| Test file | Line | Asserts | Phase A action? | Phase G action? |
|---|---|---|---|---|
| `chain.logic.test.ts` | ~33 (permits chain) | `chain!.steps.toHaveLength(30)` — current permits-chain step count | NO — step 18 removal lands in code in Phase G | YES — update to length 29 (or whatever the renumbered count becomes) |
| `chain.logic.test.ts` | ~119 (coa chain) | `chain!.steps.toHaveLength(12)` — current CoA-chain step count | NO — CoA chain step count grows from 12 to ~22 in Phase D code | YES (Phase D) — update to length matching new step count |
| `pipeline-sdk.logic.test.ts` | 879–882 | `create-pre-permits.js` emits `records_new: inserted` | NO (Phase G) — script becomes no-op shim then | YES — adjust assertion to match shim's emit shape, OR remove the assertion |
| `pre-permit-aging.infra.test.ts` | 52–57 | `create-pre-permits.js` reads `pre_permit_expiry_months` from logic_variables; no hardcoded 18-month interval | NO (Phase G) | YES — delete the entire test file (no longer applicable post-retirement) |
| `pipeline-advisory-lock.infra.test.ts` | 38 | `create-pre-permits.js` uses advisory lock 100 | NO (Phase G) | YES — if shim retains lock 100, assertion holds; if shim is a pure-DELETE without lock, remove the row from the asserted-locks list |
| `pipeline-logic-vars-coercion.infra.test.ts` | 23 | `create-pre-permits.js` is in script-list array for coercion validation | NO (Phase G) | YES — remove `create-pre-permits.js` from the script-list array |
| `assert-global-coverage.infra.test.ts` | ~305 | Asserts `assert-global-coverage.js` step 17 description matches pattern `Step 17[\s\S]{0,200}pre_permit_leads[\s\S]{0,200}coa_approved_unlinked` | NO (Phase G) — the assertion is on `assert-global-coverage.js` script content, which renumbers steps when step 18 leaves the chain | YES — update either the regex pattern or the underlying `assert-global-coverage.js` step 17 text |
| `quality.logic.test.ts` | ~1274 | `validSlugs` array includes `create_pre_permits` as valid pipeline trigger slug | NO (Phase G) | YES — prune `create_pre_permits` from the array |

Phase A consequence: in Spec 41 step breakdown table, mark step 18 as REMOVED IN PHASE G; do NOT renumber 19+ yet (renumbering lands when code does). This keeps the spec aligned with the still-live chain definition until Phase G ships, preventing the §2 step text from drifting ahead of the manifest. After Phase G ships, a follow-up minor spec amendment renumbers.

* §2 Step Breakdown table updates (~7 row edits):
  * Step 9 (`link_parcels`): writes `lead_parcels` not `permit_parcels`. Cross-reference Spec 42 §6.6.B for the unified table schema.
  * Step 13 (`classify_permits`): writes `lead_trades` not `permit_trades`. Cross-reference Spec 42 §6.6.B.
  * Step 14 (`backfill_realtor_permit_trades`): writes `lead_trades` not `permit_trades`. Same.
  * Step 15 (`compute_cost_estimates`): writes `cost_estimates` keyed on `lead_id`. Cross-reference Spec 42 §6.6.C.
  * Step 17 (`link_coa`): UPDATE — script now also writes `permits.linked_coa_application_number` back-ref. Cross-reference Spec 42 §6.6.E.
  * Step 18 (`create_pre_permits`): **REMOVED from chain** per Spec 42 §6.11 Phase G. Update §2 to delete this row; renumber 19+ to 18+. Update §3 Core Logic to remove "Pre-permits — Approved CoA applications without linked permits become predictive leads."
  * Step 22 (`classify_lifecycle_phase`): UPDATE — extends UPDATE branches with granular Universal Stream columns + 84-W12 fix + writes to `lifecycle_transitions` ledger (replaces `permit_phase_transitions`). Cross-reference Spec 42 §6.7 + Spec 84 §3 amendment.
  * Step 24 (`compute_phase_calibration`): UPDATE — `GROUP BY` cohort key extended. Cross-reference Spec 42 §6.9 modified scripts table.
  * Step 25 (`compute_trade_forecasts`): UPDATE — REKEY on `lead_id`; source SQL UNION-extended to `coa_applications`; CoA-stage anchor priority. Cross-reference Spec 42 §6.7 + Spec 85 amendment.
  * Step 26 (`compute_opportunity_scores`): UPDATE — REKEY on `lead_id`.
  * Step 27 (`update_tracked_projects`): UPDATE — REKEY on `lead_id`; CoA branch added. Cross-reference Spec 42 §6.9 + Spec 82 amendment.
* §5 Operating Boundaries: update target-files list — `scripts/create-pre-permits.js` becomes a one-shot DELETE shim (per Spec 42 §6.9). Add to shared-files cross-reference: `scripts/lib/leads/lead-id.js` (NEW per Phase C).

Acceptance criteria: Spec 41 step breakdown reflects post-WF state. Test file `chain.logic.test.ts` updated to match new step count (if it regression-locks on count).

### A.5 — `docs/specs/01-pipeline/42_chain_coa.md` (THIS SPEC) — §2/§3/§5 extension

* §2 Step Breakdown table expansion from 12 to ~22 steps. New rows mirror the permits chain (per Spec 42 §6.5 step-by-step comparison). Reference Spec 42 §6.11 phased rollout for sequencing.
* §3 Behavioral Contract extension:
  * Add "Core Logic" items for: CoA address geocoding, parcel linking, scope/project_type/coa_type_class classification, trade matrix application (Tier 3 only), geometric cost estimation, lifecycle phase classification (CoA P2/P3/P4 wired), trade forecast emission, opportunity scoring, CRM alerts.
  * Add "Outputs" section detailing the new columns on `coa_applications` and the new rows in `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `cost_estimates` (CoA-keyed), `trade_forecasts` (CoA-keyed), `tracked_projects` (CoA-keyed).
* §5 Operating Boundaries:
  * Add to target-files list: `scripts/link-coa-to-parcels.js`, `scripts/classify-coa-scope.js`, `scripts/classify-coa-trades.js`, `scripts/compute-coa-cost-estimates.js`, `scripts/lib/coa-classifier.js`, `scripts/lib/coa-cost-model.js`, `scripts/lib/leads/lead-id.js`.
  * Add to shared-files / cross-spec references: `scripts/classify-permits.js`, `scripts/link-parcels.js`, `scripts/compute-cost-estimates.js`, `scripts/compute-trade-forecasts.js`, `scripts/compute-opportunity-scores.js`, `scripts/update-tracked-projects.js`, `scripts/lib/lifecycle-phase.js`, `scripts/compute-phase-calibration.js` (all modified per Phase C–F).
  * Add to out-of-scope: front-end TS/TSX files (governed by separate UI specs).

Acceptance criteria: Spec 42 §2/§3/§5 are consistent with §6 implementation plan. No mention of `coa_parcels`/`coa_trades` (legacy split-table names). Step count change to ~22 in §2 is the Phase D success criterion (NOT Phase E — the chain expansion comes from Phase D CoA classification scripts). Test regression-lock: `assert-global-coverage.infra.test.ts` line 458 (current assertion: `/\*\*Steps:\*\*\s+12\b/`) must be updated at R6 of this active task when the Spec 42 §2 step-count wording changes; the test should match whichever wording lands. Verify all 5,223 tests pass at R6 before commit.

### A.6 — `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (NO CHANGE — adherence only)

* No spec change required. Phase A action: add a single sentence at end of §R1 documenting that lead_id-keyed scripts (introduced in Phase C/D of WF2 #coa-pipeline-parity) continue to follow §R1–§R12 with no exceptions. Pure adherence note; no behavioral change.

Acceptance criteria: Spec 47 reads as the contract being honored, not amended.

### A.7 — `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` (Lead Inspector CoA panel)

* §3.5 Lead Detail Inspector — add CoA Classification Panel sub-section. Panel renders when `lead_type='coa'` (or when permit row has a non-null `linked_coa_application_number`):
  * `coa_type_class` (residential/commercial/etc.)
  * `project_type`
  * `scope_tags[]`
  * `structure_type` (from `parcel_buildings` via `lead_parcels` JOIN)
  * `neighbourhood_id` → name lookup
  * `estimated_cost` + `modeled_gfa_sqm` + `cost_source='geometric'`
  * `lead_trades` rows for this CoA (filtered to `lead_id LIKE 'coa:%'`)
  * `lifecycle_seq` + group/block/stage with colors and icons (joined through `universal_stream_catalog`)
  * `bid_value`
* Reference Spec 42 §6.6.D for the exact CoA column list. Reference Spec 84 §2.5.h Color & Icon Strategy for the rendering specification.
* Note that the panel reads from `coa_applications` and `lead_*` tables on `lead_id` — Spec 42 §6.10 §41 amendment captures the back-reference for permits with linked CoAs.

Acceptance criteria: Spec 76 §3.5 documents the CoA panel with all field names. Cycle 8 amendment header (extending the existing Cycle 7 panel work).

### A.8 — `docs/specs/01-pipeline/81_opportunity_score_engine.md` (lead_id rekey)

* §3 Schema section: update PK from `(permit_num, revision_num, trade_slug)` to `(lead_id, trade_slug)`. Document that lead_id discrimination (`'permit:...'` vs `'coa:...'`) means the score engine produces values for BOTH stream types — permit-stage opportunity scores byte-equivalent to today; CoA-stage scores newly produced.
* §5 Operating Boundaries: update Cross-Spec Dependencies to reference unified `lead_trades` + `cost_estimates` (now lead_id-keyed). No behavior change to the asymptotic decay math.
* Document the realtor financial-base carve-out (already in place per WF3 2026-05-08): CoA-stage realtor leads use `cost_estimates.estimated_cost` (geometric total) since `trade_contract_values` JSONB may not have a per-trade slice for CoA cost path.

Acceptance criteria: Spec 81 reflects lead_id keying with no math changes documented (math is preserved as-is — only the key changes).

### A.9 — `docs/specs/01-pipeline/82_crm_assistant_alerts.md` (CoA Lead Handling)

* Add new section "CoA Lead Handling" documenting differences for `lead_type='coa'` rows:
  * Stall thresholds: 1–3 months at "Hearing Scheduled" is NORMAL, not a stall. Add `logic_variable` `coa_stall_threshold_p2_days` (default 90).
  * Imminent-alert window keyed on `hearing_date` (not `predicted_start`). Days-until-hearing < `coa_imminent_window_days` (default 7) triggers IMMINENT alert.
  * Decision-keyed auto-archive: `decision IN ('Refused', 'Withdrawn', 'Closed')` → archive immediately.
  * `tracked_projects.lead_id` discrimination — alerts dispatch per `lead_type`.
* Update Notifications table to support `lead_type='coa'` with new alert subtypes: `COA_HEARING_IMMINENT`, `COA_DECISION_RENDERED`, `COA_STALLED`.

Acceptance criteria: Spec 82 documents CoA-specific alert rules. `logic_variables` keys identified (to be added in Phase B migration / Phase E recalibration).

### A.10 — `docs/specs/01-pipeline/83_Lead_cost_model.md` (Geometric-Only Path for CoA)

* Add new section "Geometric-Only Path (CoA)" documenting:
  * CoA cost estimates always have `cost_source='geometric'`.
  * Surgical Triangle (GFA × trade_sqft_rates × scope_intensity_matrix) runs without applicant-cost anchor.
  * No Liar's-Gate equivalent for CoA — no declared cost to gate against.
  * Inputs: `coa_applications` (scope_tags, project_type, coa_type_class) ⋈ `lead_parcels` ⋈ `parcel_buildings` (modeled_gfa_sqm).
  * Output: `cost_estimates` row keyed on `lead_id = 'coa:' || application_number`.
* §3 Operating Boundaries: add `scripts/compute-coa-cost-estimates.js` to dependencies; reference Spec 42 §6.7.

Acceptance criteria: Spec 83 reflects the geometric path. Liar's Gate documented as permit-stage only.

### A.11 — `docs/specs/01-pipeline/85_trade_forecast_engine.md` (CoA-stage routing simplification)

* §3 Schema section: PK rekey to `(lead_id, trade_slug)`. Document the CoA-stage source UNION extension: `compute-trade-forecasts.js` reads from both `permits` and `coa_applications`, writes rows keyed on `lead_id`.
* §4 Behavioral Contract: document CoA-stage bimodal routing simplification — target always `bid_phase` (no work phase pre-construction). Anchor priority for CoA leads: `phase_started_at` → `decision_date` → `hearing_date` → application date.
* §6 Operating Boundaries: Cross-Spec Dependencies updated to reflect lead_id keying + `coa_applications` as a source.
* Reference Spec 84 §8.8 (current trade-forecast generation mechanics investigation) as motivation for the changes.

Acceptance criteria: Spec 85 reflects CoA-stage routing rules. Bimodal routing logic for permit-stage byte-equivalent to today.

### A.12 — `docs/specs/03-mobile/91_mobile_lead_feed.md` (filter + sort)

* §3 Backend Contract:
  * `LeadFeedItem` schema gets a `lead_id` field.
  * CoA-side fields surface when `lead_type='coa'`: `coa_type_class`, `project_type`, `scope_tags[]`, `estimated_cost`, `decision_date`, `hearing_date`.
  * **Add lead-type filter:** `?lead_type=coa` / `?lead_type=permit` / `?lead_type=all` (default).
  * **Add sort capability:** `?sort=lifecycle_seq` for chronological CoA browsing (ASC = early-stage first, DESC = late-stage first).
* §4 Mobile UI: add a "Path A (CoA-stage)" filter chip alongside existing filters. Existing `lead_type='realtor'` filter pattern is the precedent.

Acceptance criteria: Spec 91 documents the filter + sort + chip. Mirror schema in `mobile/src/lib/schemas.ts` (to be updated in Phase F).

### A.13a — `docs/specs/02-web-admin/86_master_configuration_list.md` (NEW — added per §A.1.7 distribution-gate migration)

* Was missing from §6.10 cross-spec list. Spec 86 owns `logic_variables` schema documentation; it must reflect the new band-key contract.
* Add to §X (logic_variables documentation): new band keys
  * `lifecycle_band_block_<block_id>_min/max` (~15 keys, one per block in `universal_stream_catalog`)
  * `lifecycle_band_seq_<seq>_min/max` (×110, optional finer-grain diagnostic — not consumed by the gate by default)
* Note that legacy `lifecycle_band_p{N}_min/max` keys (36) are retained during Phase C–G transition and removed in Phase H.
* Cross-reference Spec 42 §6.7 step 4 (distribution-gate granular migration) for the implementation detail.
* Update §6.10 of Spec 42 to include Spec 86 row.

Acceptance criteria: Spec 86 documents the new block-level band-key namespace. `scripts/seeds/logic_variables.json` referenced as the seed source (NULL initially, populated during Phase E recalibration).

### A.13 — `docs/specs/01-pipeline/49_global_data_completeness.md` (coverage matrix extension)

* Add to coverage matrix (Spec 49 §X.Y depending on layout) new field-level rows:
  * `coa_applications.scope_tags IS NOT NULL` ≥ 80%
  * `coa_applications.coa_type_class IS NOT NULL` ≥ 95%
  * `coa_applications.project_type IS NOT NULL` ≥ 90%
  * `coa_applications.estimated_cost IS NOT NULL` ≥ 80%
  * `coa_applications.lifecycle_phase IS NOT NULL` ≥ 95% (was permits-only — now both)
  * `coa_applications.lifecycle_seq IS NOT NULL` ≥ 95% (granular alignment)
  * `permits.lifecycle_seq IS NOT NULL` ≥ 95% (granular alignment, permits side)
* Add to entity-tracing 26-hour denominator matrix: `lead_trades WHERE lead_id LIKE 'coa:%'` (CoA-side count), `lead_parcels WHERE lead_id LIKE 'coa:%'` (CoA-side count).
* Cross-reference Spec 42 §6.3 success-criteria table for the thresholds.

Acceptance criteria: Spec 49 coverage matrix lists CoA classification fields with explicit thresholds.

### A.14 — Lifecycle status history (FULL traversal capture + decision field preservation) — added per user direction 2026-05-13

**Why this exists (user motivation):** The implementation plan as previously written captured *phase* transitions in `lifecycle_transitions` (P2→P3, etc.) but lost *status* granularity within a phase. A CoA that goes `Tentatively Scheduled` → `Postponed` → `Hearing Scheduled` → `Approved` writes only ONE row to `lifecycle_transitions` (the P2→P3 phase change) — the intermediate status traversal is lost. The CoA `decision` field is also overwritten in place on `coa_applications` rather than ledgered. Both gaps prevent accurate prediction modeling: the forecast engine can't learn "CoAs that hit Postponed first take 1.4× longer than CoAs that go straight to Hearing Scheduled" because the historical traversal pattern isn't stored.

**Phase A spec amendment work:**

* **Spec 42 §6.6.B** — `lifecycle_status_history` table is **already fully defined** in Spec 42 §6.6.B (committed `8d44375`). This §A.14 cross-references the existing definition. Writers per the schema's `detected_by` column comment: `load-permits.js` (permit-side CKAN status changes at ingest), `load-coa.js` (CoA-side CKAN status + decision changes at ingest), `classify-lifecycle-phase.js` (derived phase transitions on dirty rows). See §6.6.B for the full CREATE TABLE + indexes (preventing the schema duplication risk flagged by R2.v2 DeepSeek BUG-5).
* **Spec 42 §6.7** — extend lifecycle engine work to document the dual-ledger writes (status-level + phase-level) per detected change. Explain that the status-level ledger preserves the full traversal path through the 110-row Universal Stream and unlocks cohort segmentation by *traversal pattern*. _(Already drafted in the in-progress edit to Spec 42 §6.7 — verify the text lands as part of A.14.)_
* **Spec 84 §3** — add behavioral-contract item documenting `lifecycle_status_history` as a write target. Note that the legacy `lifecycle_phase` overwrite-in-place pattern is replaced by ledgered transitions, AND the legacy `coa_applications.decision` overwrite-in-place pattern is replaced by ledgered decision snapshots.
* **Spec 85 §3** — extend the forecast engine's input section to mention `lifecycle_status_history` as a future cohort-key source for traversal-pattern segmentation. (Phase F may extend `compute-phase-calibration.js` to GROUP BY traversal-pattern signatures derived from the status history; this is a Phase F or later optimization, not blocking Phase A.)
* **Spec 86 §X** — add `lifecycle_status_history` retention policy as a `logic_variable`: `lifecycle_status_history_retention_days` (default 1825 = 5 years of history per lead — enough to learn from CoAs filed in 2020 that issued permits in 2023).

**Why "decision" specifically is preserved:** the CoA `decision` field is the authoritative outcome signal (`Approved`, `Approved with Conditions`, `Conditional Consent`, `Refused`, `Withdrawn`, `Final and Binding`, etc.). Today it's overwritten when the decision changes (e.g., Approved → Refused on appeal, or Conditional Consent → Approved with Conditions on amendment). The `decision` column on `lifecycle_status_history` captures the snapshot at each transition, so the forecast engine can later compute things like:
* Conditional approval probability per neighbourhood / project_type
* Appeal-reversal rate by CoA decision-type
* Time-to-decision percentile by decision-class
* Permit-issuance probability conditional on CoA decision-class (currently only "approved → permit" is tracked at all)

**Spec 42 §6.10 cross-spec list updated:** Spec 84, 85, 86 amendments expanded for §A.14. Spec 84 §3 + Spec 85 §3 inputs + Spec 86 logic_variable.

**Why "permit/application — coa / permit lifecycle history" is one table, not two:** lead_id discrimination (`'permit:...'` vs `'coa:...'`) means a single `lifecycle_status_history` table serves both stream types. Per-permit and per-CoA queries are 1-line `WHERE lead_id LIKE 'permit:%'` or `WHERE lead_id LIKE 'coa:%'` filters. Avoids the dual-identity fork Option C was designed to eliminate.

Acceptance criteria for A.14: `lifecycle_status_history` table defined in Spec 42 §6.6.B (already added). Spec 42 §6.7 documents dual-ledger writes. Spec 84 §3 contract update. Spec 85 + Spec 86 cross-spec amendment notes. `npm run system-map` regeneration picks up the new table.

### A.15 — `docs/specs/00_system_map.md` (regenerate — was A.14)

* Run `npm run system-map` after all spec amendments land. This script auto-generates the system-map document from spec frontmatter, cross-references, and dependency declarations. Output: updated `docs/specs/00_system_map.md` reflecting the new pipeline shape + new shared libraries + new tables (`lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `universal_stream_catalog`, `universal_stream_trade_signals`).
* Commit the regenerated map in the final Phase A commit.

Acceptance criteria: `git diff docs/specs/00_system_map.md` shows additions for new scripts, new tables, and new cross-references. No regression in existing entries.

---

## Technical Implementation

* **New/Modified Components:** N/A (doc-only).
* **Data Hooks/Libs:** N/A (doc-only).
* **Database Impact:** NO (doc-only). Schemas described in spec text only; migrations land in Phase B.
* **External API:** N/A.
* **CSV regeneration (clarifies R2 DeepSeek BUG-1):** the §A.1.1 BUG fixes regenerate `spec_84_universal_stream_v10.csv` from a **`_tmp_*.mjs` local utility file at the repo root** (NOT a script under `scripts/`). The `_tmp_*` utilities are working scratch files used to derive the CSV from the spec markdown; they are NOT pipeline scripts, are not committed to `scripts/`, and have no Spec 47 compliance obligation. The CSV regeneration is a documentation-output step — equivalent to running a markdown-to-table converter — and does not constitute "code shipping." If the user prefers absolute zero script execution during Phase A, the alternative is to manually patch the affected cells in v9 → v10 (~76 cells for seq 50 fix + 3-row reflow for B9.C + the QUESTIONABLE FIX rows). Either path is documentation work, not pipeline-script work.

## Standards Compliance

* **Try-Catch Boundary:** N/A (doc-only).
* **Unhappy Path Tests:** N/A (doc-only).
* **logError Mandate:** N/A (doc-only).
* **UI Layout:** N/A (doc-only).
* **Multi-Agent Review:** REQUIRED per `00_engineering_standards.md` + memory `feedback_review_protocol.md`. WF1 cadence: Gemini + DeepSeek (plan-review templates) + worktree feature-dev:code-reviewer agent (cross-spec coherence). Findings triaged BUG/DEFER; BUGs fixed in spec text before commit; DEFERs go to `docs/reports/review_followups.md`.

## Execution Plan

- [ ] **R0 — Read prerequisite specs.** Re-read Spec 42 §6 (the implementation plan being delivered), Spec 84 §8 (the investigations informing it), Spec 47 §R1–§R12 (the protocol governing the future Phase C–F scripts), and `00_engineering_standards.md` (multi-agent review cadence, dual-path mirroring rules). _Already complete as part of WF2 #coa-pipeline-parity initial plan work._
- [ ] **R0.5 — Live-DB verification queries for construction-sequencing FIXes (per R2 DeepSeek BUG-2).** Before committing the §A.1.2 FIX decisions to the v10 CSV, run the following queries against the live DB to confirm that the proposed FIX assignments line up with actual AIC inspection-stage data:
  * `SELECT stage_name, COUNT(*) FROM permit_inspections GROUP BY stage_name ORDER BY 2 DESC;` — confirm landscaping/paving don't have a dedicated AIC stage (justifying the #121 vs #122 split decision).
  * `SELECT decision, COUNT(*) FROM coa_applications WHERE decision IS NOT NULL GROUP BY decision ORDER BY 2 DESC;` — confirm the CoA decision-set we're encoding in §A.1.3 (P2/P3/P4 emission rules + status catchall) covers ≥99% of historical decisions.
  * `SELECT description, COUNT(*) FROM coa_applications WHERE description IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 50;` — spot-check that the §A.2 keyword decision tree (residential / commercial / institutional / mixed) covers the most frequent CoA description patterns. Match each top-50 description against the proposed keyword sets; flag uncovered patterns for additions to the rule list. (Replaces the earlier permit_type_classifications query per R2.v2 Worktree BUG-11 — the permit-side taxonomy can't validate the new CoA-side 4-value set; only description-corpus sampling can.)
  * `SELECT permit_type_class, COUNT(*) FROM permit_type_classifications GROUP BY permit_type_class;` — secondary informational query (kept for cross-spec consistency check but not a §A.2 validator).
  * `SELECT lifecycle_phase, COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NOT NULL GROUP BY lifecycle_phase;` — measure the current CoA classification rate (expected: 0.6% non-NULL per bug 84-W12 baseline).
  * `SELECT lifecycle_phase, lead_type AS source FROM (SELECT lifecycle_phase, 'permit' AS lead_type FROM permits WHERE lifecycle_phase IS NOT NULL UNION ALL SELECT lifecycle_phase, 'coa' FROM coa_applications WHERE lifecycle_phase IS NOT NULL) x WHERE lifecycle_phase IN ('P3','P4') GROUP BY 1,2;` — confirm 84-W11 P3/P4 namespace collision is currently dormant (CoA rows mostly NULL); validates §A.1.6 framing.
  * Capture query output in a working notes file `_tmp_phase_a_verification_2026-05-13.md` (not committed). Use the results to validate or adjust the §A.1.2 ACCEPT/FIX decisions.

- [ ] **R0.6 — CSV regeneration validation (per R2.v2 DeepSeek BUG-8 / BUG-9).** Before any spec edit consumes the v10 CSV, validate the regenerated file:
  * Parse with the same csv-parse logic used in `_tmp_csv_v9.mjs` (proper quoted-field handling).
  * Assert row count = 110 (header + 110 data rows = 111 lines).
  * Assert seq column is contiguous 1–110, no gaps, no duplicates.
  * Assert column count = 174 (1 seq + 14 base + 1 Bid Value + 152 trade signals (38 × 4) + 6 colors/icons).
  * Assert all 38 trade × 4 signal column headers present (no typos).
  * Assert R2.v2 BUG fix landed: seq 14 `bid_value` cell = `0.8` (not `0`); seq 50 `Work: excavation` cell is empty AND `Bid: Last Minute: excavation` cell = `✓`; seq 50 `Work: temporary-fencing` empty AND `Bid: Last Minute: temporary-fencing` = `✓`; B9.C row exists with non-empty block_label.
  * **CSV column header → DB column name mapping** (per DeepSeek BUG-9): document the canonical bijection at top of `_tmp_csv_v10_validate.mjs` script: lowercase + replace ` ` with `_` (e.g., "Group Label" → `group_label`, "Bid: excavation" → `bid_excavation`, "Bid: Last Minute: excavation" → `bid_last_minute_excavation`). Assert no two CSV headers map to the same DB column name. Phase B seed migration uses the same mapping.
  * Output: `_tmp_phase_a_csv_validation_2026-05-13.md` (not committed; status report to verify before R5.1).

- [ ] **R1 — Write this active task.** _Complete (this file)._
- [ ] **R2 — Multi-Agent Review of this active task.** Run 3 parallel reviewers per CLAUDE.md Review Agent Reference and `feedback_review_protocol.md`:
  - Gemini plan-review (`.claude/review-templates/plan-review-gemini.md`) with --specs `42_chain_coa.md,84_lifecycle_phase_engine.md,47_pipeline_script_protocol.md,00_engineering_standards.md`
  - DeepSeek plan-review (`.claude/review-templates/plan-review-deepseek.md`) with same specs
  - Worktree feature-dev:code-reviewer agent with access to specs 42, 84, 47, 13, 41, 49, 76, 80, 81, 82, 83, 85, 91, 00_engineering_standards, and to the code surface that informs the plan: `scripts/classify-lifecycle-phase.js`, `scripts/lib/lifecycle-phase.js`, `scripts/compute-trade-forecasts.js`, `scripts/compute-phase-calibration.js`, `scripts/compute-opportunity-scores.js`, `scripts/compute-cost-estimates.js`, `scripts/classify-permits.js`, `scripts/classify-scope.js`, `scripts/link-parcels.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`, `scripts/load-coa.js`, `scripts/lib/leads/lead-id.js` (if present), `migrations/005_trade_mapping_rules.sql`, `migrations/006_permit_trades.sql`.
- [ ] **R3 — Triage review findings.** BUG → fix in spec text before commit. DEFER → `docs/reports/review_followups.md`. Re-read CLAUDE.md feedback memory before triaging to avoid the four common AI regressions (missing Multi-Agent Review step, banned §10 matrix, ✅/⬜ Green Light format, wrong "Mobile-First" field name — none should be present here).
- [ ] **R4 — Authorization gate.** Halt and present the plan + reviewer findings to the user. Use the explicit format: **PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**. Do NOT generate spec edits before "Yes."
- [ ] **R5 — Edit specs in dependency order:**
  - [ ] R5.0 — `docs/specs/00-architecture/01_database_schema.md` (NEW per R2.v2 Worktree BUG-10): add full CREATE TABLE statements + indexes for the 6 new tables and column additions to existing tables. Schema source-of-truth must precede other amendments since other specs reference table definitions here.
  - [ ] R5.1 — Spec 84 amendments (A.1.1 BUGS fix, A.1.2 QUESTIONABLE review, A.1.3 §3 contract, A.1.4 §8 archive, A.1.5 §8.7 update, A.1.6 84-W11 namespace — granular-first, A.1.7 distribution-gate granular migration). Regenerate `spec_84_universal_stream_v10.csv` for the locked Universal Stream.
  - [ ] R5.2 — Spec 80 CoA Taxonomy section.
  - [ ] R5.3 — Spec 13 CoA Application Mode section.
  - [ ] R5.4 — Spec 41 step breakdown — **Phase A action is ANNOTATION ONLY** (per R2.v2 Gemini BUG-CRIT): add `(REMOVED IN PHASE G)` annotation to step 18 row; DO NOT delete the row; DO NOT renumber steps 19+; DO NOT update tests. Phase G code-retirement will perform the deletion, renumbering, and test updates. Update step descriptions for steps 9, 13, 14, 15, 17, 22, 24, 25, 26, 27 to reference unified `lead_*` tables and lead_id keying.
  - [ ] R5.5 — Spec 42 §2/§3/§5 extension.
  - [ ] R5.6 — Spec 47 adherence note.
  - [ ] R5.7 — Spec 49 coverage matrix extension.
  - [ ] R5.7b — **Spec 86 amendments (NEW per R2.v2 DeepSeek BUG-6):** add `lifecycle_band_block_<block_id>_min/max` keys (~15), `lifecycle_band_seq_<seq>_min/max` keys (×110, optional diagnostic), and `lifecycle_status_history_retention_days` logic_variable. Note legacy `lifecycle_band_p{N}_min/max` keys are retained during Phase C–G transition and deprecated in Phase H.
  - [ ] R5.8 — Spec 76 §3.5 Lead Inspector CoA panel.
  - [ ] R5.9 — Spec 81 lead_id rekey documentation.
  - [ ] R5.10 — Spec 82 CoA Lead Handling section.
  - [ ] R5.11 — Spec 83 Geometric-Only Path (CoA) section.
  - [ ] R5.12 — Spec 85 CoA-stage routing simplification documentation.
  - [ ] R5.13 — Spec 91 filter + sort + UI chip.
  - [ ] R5.14 — `npm run system-map -- --dry-run` (validate frontmatter not broken by any of the 14 spec edits) THEN `npm run system-map` (regenerate). Commit the regenerated map.
- [ ] **R6 — Verify regression tests.** `npm run test` to catch any test that regression-locks on spec text we changed (e.g., `assert-global-coverage.infra.test.ts` which already trapped the §2 step-count framing change). Update tests where the new wording is more durable; never reverse a correct spec change to satisfy a brittle test.
- [ ] **R7 — Type/lint check.** `npm run typecheck && npm run lint`. Doc-only changes shouldn't trip either, but verify.
- [ ] **R8 — Multi-Agent Review of the changes.** Re-run Gemini + DeepSeek (this time using the spec-review mode `npm run review:gemini -- spec <amended-spec>`) + worktree code-reviewer per spec amendment. Goal: catch cross-spec inconsistency introduced by the edits.
- [ ] **R9 — Triage R8 findings.** Same BUG/DEFER triage as R3.
- [ ] **R10 — Commit cadence.** Bundle Phase A into one or two commits per memory `feedback_wf3_granularity.md` — for WF1 doc-only spec amendments, single bundled commit is appropriate when the amendments are interdependent (which they are — most of these specs reference each other). Suggested commit message: `docs(42_chain_coa): WF1 #coa-pipeline-parity-phase-a — land all 12 cross-spec amendments + 84-W11 resolution + Universal Stream BUG fixes + system map regen`.
- [ ] **R11 — User confirmation before push.** Per CLAUDE.md "Executing actions with care" — never push without explicit user approval.

## Plan Compliance Notes

* **§Multi-Agent Review present:** YES — R2 (plan review) + R8 (post-edit review).
* **§10 matrix:** NOT INCLUDED (per memory `feedback_wf_plan_format.md` regression to avoid).
* **Green Light format:** Uses bold prose ask `**PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**` (not ✅/⬜ checklist).
* **Field naming:** "Multi-Agent Review" not "Mobile-First" (memory note).
* **WF3 cadence:** N/A (this is WF1).
* **Domain mode:** Backend/Pipeline declared at top (per CLAUDE.md mandatory).
* **Spec 47 §R-compliance:** N/A for THIS task (doc-only); applies to Phase C–F scripts which inherit it.
* **Library docs (Context7):** N/A (no external library usage).

## Out of Scope (Explicitly Deferred to Subsequent Phases B–H)

This task delivers ONLY the spec amendments. The following are explicitly deferred:

- Migration SQL files (Phase B).
- `lead_id` backfill script + permit-side rekey (Phase C).
- New CoA classification scripts (Phase D).
- Lifecycle engine migration + 84-W12 fix + cohort-key extension + band recalibration (Phase E).
- Forecast / opportunity / CRM CoA extensions + UI (Phase F).
- PRE-permit retirement (Phase G).
- Legacy column drop (Phase H).

Each subsequent phase will get its own active task per CLAUDE.md WF cadence.

---

## Known Issues — Documented for Implementation (R2.v2 Multi-Agent Review, 2026-05-13)

Per user direction 2026-05-13 ("B — authorize as-is with documented known issues — fix in implementation"), the following 11 BUGs from R2.v2 reviewer findings are accepted as known and will be fixed during the R5 execution of this active task. Each item below cites the source reviewer + severity for traceability.

### CRIT / HIGH

1. **(Worktree, conf 95) — `load-permits.js` missing from `lifecycle_status_history` writers.** Spec 42 §6.6.B `detected_by` column comment lists only `classify-lifecycle-phase.js` + `load-coa.js`. Add `load-permits.js` as a third writer; add to §6.9 Modified Existing Scripts table. Symmetric to `load-coa.js`: detects permit-side status changes at CKAN ingest.

2. **(Worktree, conf 92) — Duplicate "step 4" headings in Spec 42 §6.7.** Distribution-gate pivot AND band-recalibration both numbered 4. Renumber: distribution-gate pivot stays as 4; band-recalibration becomes 5; `compute-phase-calibration.js` GROUP BY extension becomes 6; `compute-trade-forecasts.js` UNION extension becomes 7.

3. **(Worktree, conf 85) — §A.1.6 SKIP_PHASES migration over-corrects.** Currently proposes `lifecycle_group NOT IN ('C1','C2','C3','C4')`. This breaks the linked-permit reclassification contract — when a CoA decision lands (C2→C3 transition), `link-coa.js` won't bump the permit's `last_seen_at`. Correct to `lifecycle_group NOT IN ('C4')` only — preserves C1/C2/C3 bump behavior. Mirrors the original `P1/P2 only` exclusion, just translated to the group axis.

4. **(Gemini, CRIT) — §A.4 contradiction: "delete step 18" vs "mark as REMOVED IN PHASE G."** Phase A action clarified: ADD `(REMOVED IN PHASE G)` annotation to the step 18 row in Spec 41 §2 — do NOT delete the row, do NOT renumber 19+, do NOT update tests in Phase A. Phase G performs all three.

5. **(DeepSeek, HIGH) — §A.14 duplicates `lifecycle_status_history` schema.** Spec 42 §6.6.B already has the full table definition. Active task §A.14 should retain the "why this exists" + writers list + dual-ledger explanation, but remove the embedded CREATE TABLE block and cross-reference §6.6.B instead. Removes risk of schema drift between the two definitions.

6. **(DeepSeek, HIGH) — §A.13a Spec 86 missing from R5 execution plan.** R5.1–R5.14 covers Specs 84 → 80 → 13 → 41 → 42 → 47 → 49 → 76 → 81 → 82 → 83 → 85 → 91 → system map, but skips Spec 86. Add **R5.7b** between current R5.7 (Spec 49) and R5.8 (Spec 76): "Edit Spec 86 — add `lifecycle_band_block_<block_id>_min/max` keys (~15), `lifecycle_band_seq_<seq>_min/max` keys (×110, optional diagnostic), and `lifecycle_status_history_retention_days` logic_variable. Note legacy `lifecycle_band_p{N}_min/max` keys deprecated in Phase H."

7. **(Gemini, HIGH) — §A.1.1 Universal Stream BUG fixes lack named automated verification test.** Add `universal-stream-catalog.infra.test.ts` to Spec 42 §6.4 Test Strategy. Asserts: row count = 110, seq 1-110 contiguous, seq 14 `bid_value = 0.8`, seq 50 column-alignment correct (excavation/temp-fencing Work=NULL, LM=✓), B9.C row exists with correct block label, 174 columns total.

8. **(DeepSeek, HIGH) — §A.1.1 CSV regeneration lacks validation step.** Add **R0.6** between R0.5 and R1: "Validate regenerated v10 CSV before lock-in. Parse the file, assert row count = 110, seq numbers contiguous 1–110, column count = 174, sample seq 14 / seq 50 / B9.C cells match the §A.1.1 fix specifications. Output validation result to `_tmp_phase_a_csv_validation_2026-05-13.md`."

9. **(DeepSeek, HIGH) — CSV column header naming convention mapping unspecified.** CSV headers use spaces ("Group Label"); DB schema uses snake_case (`group_label`). Document the bijective mapping in §A.1.1: lowercase + `space → underscore`. Add to R0.6 validation: assert mapping is bijective (no duplicate target column names after transformation).

10. **(Worktree, conf 88) — `00-architecture/01_database_schema.md` not in §6.10 cross-spec list.** New `lifecycle_status_history` + `lifecycle_transitions` + `lead_trades` + `lead_parcels` + `universal_stream_catalog` + `universal_stream_trade_signals` all need to land in the canonical schema document. Add row to Spec 42 §6.10 and to R5 execution plan (as R5.0 — runs BEFORE other amendments since it's the schema source-of-truth).

11. **(Worktree, conf 82) — R0.5 query #3 doesn't validate `coa_type_class` taxonomy.** The `permit_type_classifications` query can't validate CoA-side values since they're a new 4-value set (`residential`/`commercial`/`institutional`/`mixed`), not derived from permits. Replace with: `SELECT description, COUNT(*) FROM coa_applications GROUP BY 1 ORDER BY 2 DESC LIMIT 50` to spot-check that the §A.2 keyword decision tree covers the most frequent CoA description patterns. Keep the `permit_type_classifications` query as a secondary informational query.

### DEFER

The following items are deferred to `docs/reports/review_followups.md` and will NOT be addressed during this WF1 active task:

- DeepSeek DEFER MED: R5 cross-ref consistency between sequential spec edits (mitigated by R8 multi-agent review covering the final state).
- DeepSeek DEFER MED: CoA "Deferred"/"Postponed" status explicit handling (already covered by §A.1.3 catchall rule + `unmapped_status` audit metric — verified during triage).
- DeepSeek DEFER LOW: P18/P19/P20 phase-label drift in Spec 84 §3 (pre-existing per bug 84-W1 family; defer to Phase H cleanup).
- Gemini DEFER LOW: §A.6 "NO CHANGE" header rename to "Adherence Note" (cosmetic; address opportunistically during R5.6).
- Gemini DEFER NIT: `coa-handoff.infra.test.ts` JOIN through `lifecycle_status_history` — confirmed working post-Phase C `lead_id` backfill (test runs in Phase F regardless).
- DeepSeek UNVERIFIED PREMISE: `npm run system-map` regeneration risk — add a dry-run check before final regeneration in R5.15.
- DeepSeek UNVERIFIED PREMISE: R0.5 doesn't profile overall data inventory — accept; the spec values come from the locked 2026-05-12 snapshot which is authoritative for this WF.

---

> **AUTHORIZED 2026-05-13.** PLAN LOCKED. Status: Implementation. R0 through R5.x execute in order; R5.x sub-steps absorb the 11 known issues above as inline fixes (not separate WF3 tasks).
