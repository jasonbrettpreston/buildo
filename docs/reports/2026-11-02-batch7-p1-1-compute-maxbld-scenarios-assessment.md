# `compute_maxbld_scenarios` — net-new MATERIALIZER assessment (Layer 3 by-law calculation, increment 1, converted from day one)

**Commit form: full (R-AH)**. The ROWS arm has other converted members, so the archetype's full-form count is reached; the stated reason for full form is that this step is the first whose compute is a data catalogue of formula rows run through the one shared evaluator (`evaluate.mjs`, behind the layer `l3` hook), with no by-law number, zone or scenario name in code (Spec 69a M-61, Spec 124 R-KN).

> **Status:** commit ① (MB-31 increment 1), 2026-11-02. Descriptor, shell, compute, notes, the Layer 3 catalogue seeds, the evaluator hook, the settings seeds (migration 294, written, NOT applied), the 25-case acceptance test and its fixtures are present. Pending stage `compute_ported`: no POST capture exists until the first local run (migration 287, the results table, is not written yet; operator go), so the capture-dependent gates (emits equivalence, nonzero capture, explained diffs) have nothing to read: they pass in the whole-fleet run, where a pending step is not measured, and show as unledgered registry rows in the `--staged` run, which exits 0 (measured 2026-11-02; no ledger row is needed and the live gate tests count a row as an orphan). Chain placement is MB-35 (after migration 287 applies).

**Target spec:** `docs/specs/01-pipeline/78_optimal_lot_configuration.md` (Phase 5, D-1: the step reads only Layer 2 resolution rows) · **Governing plan:** `docs/reports/2026-10-22-batch6-p1-1-resolve-bylaws-assessment.md` for the Layer 2 side; the MB-31 plan and the increment 1 finish plan are operator-approved scratch plans (`~/Buildo-scratch/mcbylaws/MB-31/plan.md`, `inc1-plan.md`) · **Script:** `scripts/compute-maxbld-scenarios.js` (frozen shell) · **Lock:** `135` (Spec 47 §A.5, next id after resolve_bylaws 134) · **Chain:** none yet.

R-AS: N/A — no legacy predecessor (Spec 124 R-HC: R-DK covers new steps).

## 1. PH-0 — Boundary freeze

* **Boundary:** one write table, `parcel_maxbld_scenarios` (long format: one row per parcel, building type and field), keyed `(parcel_id, building_type, field_id)`, written by a guarded upsert on `content_sha`. Reads the stored Layer 2 tables (`bylaw_resolution_results`, `bylaw_resolution_lots`, `bylaw_resolution_units`, `bylaw_resolution_texts`), `parcels` and `parcel_abutments`, and the `logic_variables` settings. Never writes `parcels` (Spec 69a M-25).
* **Seed:** the Layer 3 catalogue (`scripts/seeds/bylaw/layer3-catalogue.json`), the switchboard and the building types; sixteen declared logic variables (the card-named settings, the population list and the batch size), all `on_invalid: "fail"`.
* **Evaluator:** `evaluate-l3.mjs` holds the value algebra, the readers and the expression walker; `evaluate.mjs` gains a three-line hook (`ctx.layer`), `dsl.mjs` the Layer 3 forms behind `{ layer: 'l3' }`. The Layer 3 words are data (the catalogue `lexicon`), not literals (R-LA).

**G2:** ASSESSMENT-INCOMPLETE — because this is a net-new step: no legacy script exists, so there is no churn history to plot.

## 3. PH-3 — Intent ledger (G3)

There is no legacy behaviour to preserve. The intents come from Spec 78, the operator rulings and the MB-31 plans; commit shas: the step build prereg `60321264b` and `a0b35a6ab`, the merge `e32addf6f` of MB-18 (k), the finish prereg `d996999f`, and the McProof fixes `3a31e2efc`.

| Intent | Source | Disposition (preserved-in-compute / encoded-as-descriptor-field / encoded-as-deviation / knowingly-retired) and why |
|---|---|---|
| The step reads only stored Layer 2 rows, never the provisions | Spec 78 D-1 | encoded-as-descriptor-field — `inputs.reads` lists the Layer 2 tables; the compute holds no `effective()` call |
| A formula row never re-derives a limit; a number comes from a stored Phase 2 cap, a declared fact or a setting | Spec 69a M-61, M-72 | preserved-in-compute — `evaluate-l3.mjs` reads cells through `readL2`, `lv()` and declared names only; grounded in checks[] `closure_violations` (a trace entry naming an undeclared name is counted) |
| Rows are data: no zone, scenario, regulation id or by-law number in code | Spec 124 R-KN, R-LA | encoded-as-descriptor-field — arm L runs on the evaluator files; the words are in the catalogue lexicon |
| A missing or unlimited input is never defaulted; `not_evaluated` propagates with its reason and flags | Spec 69a M-72, plan E8 | preserved-in-compute — `arith`, `minMax` and `compare` return the first decisive ne with the unioned flags; grounded in checks[] `flags_missing` and `numbers_without_trace` |
| The front setback is one catalogue row applying the ruled chain (user figure, averaging, ring, street, zone, stored fallback) | Spec 69a M-245, M-256, M-414 | encoded-as-descriptor-field — the row `front_setback_used_m` and its settings; always flagged needs survey |
| Storeys from a height use cited settings and carry a theoretical-maximum flag | Spec 69a M-404, M-425 | preserved-in-compute — `storeys_max` reads `s1_*` and `s2_*` through `lv()`; flag `storeys_from_minimum_ceiling`; the why is written in notes.json (S-1 and S-2 are logic variables with citations, the storey count is flagged a theoretical maximum) |
| Settings are logic variables an operator can see and change | Spec 132 core.8 (R-CV) | encoded-as-descriptor-field — `config.logic_variables`, seeds and migration 294 |
| The 25 golden cases are the increment 1 acceptance, against McProof-checked answers | operator, `CARD-mb31-inc1-plan` | encoded-as-deviation — the acceptance test runs on a frozen fixture (Layer 2 recomputed by the pure core) because the first night is later |
| Nothing is carried from the old engine or Spec 78 P5.9 | queue increment 1 | knowingly-retired — the P5.9 wide-table schema and its variables are superseded by the long format (M-384) |

## 4. Risk class (G4)

| Risk class | Chance | Impact | Guard |
|---|---|---|---|
| A wrong number from a catalogue row or a setting, hidden behind a plausible value | medium | high | the 25 golden cases compare 175 cells against McProof-checked answers; seven checks on the stored rows (`closure_violations`, `flags_missing`, ...) |
| A formula that silently re-derives a by-law limit | low | high | rows are data, the evaluator reads cells only; the closure lock walks the step's imports; arm L forbids literals |
| A stale fixture hides a Layer 2 change | medium | medium | the fixture carries sha256 and provenance in `manifest.json`; the generator `--check` is run at each round |
| The first run finds a defect no fixture could (reads 5 and 6, the table DDL) | medium | medium | listed in the defect ledger as PIN; the capture-dependent gates read the first run's captures |
| Settings changed by an operator outside their bounds | low | medium | every declared variable is `on_invalid: "fail"` with bounds; the run refuses before compute |

## 5. PH-5 — Seam map (G5)

* **DB seam:** the library (`materializeRowsArm`, `scripts/lib/step/write.js`); the compute returns row objects and the declared read statements only (`READ_SQL`).
* **Clock seam:** none in the compute; `computed_at` is the library's `run_at` bind.
* **Network seam:** none (`execution.network: "none"`).
* **argv / env seam:** none read by the step; `PIPELINE_CHAIN` is the runner's.

## 6. PH-6 — Defect ledger (G6)

Rows `CMS-D1` … `CMS-D8` in `docs/reports/defect-ledger.md`.

## 7. Red suite (PH-7)

Red-first evidence, committed vitest JSON (a failed assertion in each; the suites are committed with the code that turns them green, the accepted precedent). Each bullet cites one artifact:
* docs/reports/red-evidence/compute_maxbld_scenarios/golden-25-red.json — the 25-case acceptance test against the base (no evaluator hook, no settings seeds): every Layer 3 row answers layer3_hooks_missing
* docs/reports/red-evidence/compute_maxbld_scenarios/b5-evaluator-hook-red.json — the footprint, clause-switch, ring-audit and determinism suites against the base: 19 red before the hook
* docs/reports/red-evidence/compute_maxbld_scenarios/c1-settings-seeds-red.json — the settings seeds, the run refusals and the catalogue invariants against the base: 9 red before the seeds

Filled at the first local run (queued): the POST capture with its rerun-zero proof, the measured run budget, the `explained-diffs.json` entries, and a check that the gates for emits, nonzero captures and explained diffs now read the capture.

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low confidence | What would raise it |
|---|---|---|
| The results table DDL (migration 287) and the apply order | the draft exists but is not written into `migrations/`, and 287 sits below the applied 290-292 | MB-35 confirms the order on a dump copy before it is applied |
| Reads 5 and 6 (street/zone pools and the neighbour ring) | the ring read does not parse as drafted (a recursive CTE inside a subquery) and uses planar distance in degrees | the runner batch-binds build; the acceptance test does not exercise them (it passes the pools as data) |
| Increment 1 on the stored table | the acceptance run is on a recomputed fixture, not on the night's stored rows | the first local run compares the stored rows with the fixture |
| The 21 flag sets of the answer key | the key was corrected to the step's flags by an operator ruling; McProof never checked flags | lane T extends the key check to flags |

### RECURRING / STANDARD-SHAPING table

| Pattern | Where else it applies |
|---|---|
| Formula rows as data with one generic evaluator hook and a lexicon file, so code holds no vocabulary | any later Layer 3 increment and any other rule-driven step |
| An acceptance fixture whose Layer 2 half is regenerated by the pure core and whose sha is pinned in a manifest | any step whose first database night is later than its first acceptance |
| A pending step landed before its first capture: the capture-dependent gates stay unmeasured (not ledger-excused) until the first run | any net-new step landed before its first capture |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=compute_maxbld_scenarios --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 14/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

### Five-word verdict (Spec 124 §5 R-BA — "McDonald's Airtight")

| Word | Status | Detail |
|---|---|---|
| STANDARDIZED | PASS | PASS |
| OBSERVABLE | PASS | PASS |
| SCALABLE | PASS | PASS |
| UNDERSTANDABLE | PASS | PASS |
| ACCURATE | PASS | PASS |

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=5 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=9 vocab-hit rows=9; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 8 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=8 red-evidence-claims=3 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=1 missing-pre-invocations=1 stale-fingerprints=0 unexplained-diffs=0 — stage-gated (compute_ported) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=8 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | compute_maxbld_scenarios | PASS | min_migration=0 <= migrations count=304 |
| 2 | compute_maxbld_scenarios | PASS | 27 declared, missing from seeds: none |
| 3 | compute_maxbld_scenarios | PASS | retired=22 overlap-with-declared=none |
| 7 | compute_maxbld_scenarios | PASS | SPEC LINK header present=true |
| 8 | compute_maxbld_scenarios | PASS | G-4: 27 declared, 0 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | compute_maxbld_scenarios | PASS | HB-1: execution.shape="materialize" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | compute_maxbld_scenarios | PASS | CEIL-1: execution.shape="materialize" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 9 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 9 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 650 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 49 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 18.51 s <= 25.3 s; registry-input 27.36 s <= 27.5 s; measured 2026-10-30T19:01:39.937Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 560 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 49 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 218 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): none::
- missing invocations (PRE, GOLD-PRE): none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 27 declared, 0 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=31729B notes=3844B checks=7 rows records_meta=(no capture) |

**Enforced-green: 11/14** · not-run: 1 · vacuous: 1

