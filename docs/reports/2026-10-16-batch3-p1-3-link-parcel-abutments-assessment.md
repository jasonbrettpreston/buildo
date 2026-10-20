# `link_parcel_abutments` — net-new LINK assessment (WF1, converted from day one)

**Commit form: compressed (R-PACE-1)**

> **Status:** H6 conformance pass, 2026-10-16. The step lands with its captures in one H6 commit (the `load_coa_notices`
> precedent): descriptor, shell, compute, notes, migration 255 and tests are present; the first captures and the cutover
> follow (H6 runbook step 5). Pending stage `shape_clean_pending_recapture`. The tag `batch3-p1-3` is provisional — the
> queue (`.cursor/QUEUE.md`) assigns it.

**Target spec:** `docs/specs/01-pipeline/130_link_parcel_abutments.md` · **Governing plan:** `.cursor/wf1_mcbylaw_phase2_inputs_active_task.md`
(plan B2, operator-approved 2026-10-08) · **Script:** `scripts/link-parcel-abutments.js` (frozen shell) · **Chain:** `sources`, phase 24,
after `compute_parcel_cost_estimates` (operator 2026-10-16) · **Lock:** `130` (Spec 47 §A.5, row present).

LINK has ≥ 2 converted members (`link_massing`, `link_parcels`, `link_neighbourhoods`, `link_parcel_addresses`, …) and is proven,
so the compressed form is the default; no full-form reason applies.

R-AS: N/A — no legacy predecessor (a net-new step has no legacy script to compare against).

## 1. PH-0 — Boundary freeze

* **Boundary:** one write target, `parcel_abutments` (migration 255), class `guarded_upsert` keyed `(parcel_id, neighbour_id)`,
  guard `IS DISTINCT FROM` over the seven value columns, `retract: "none"`, `txn_scope: batch`. Reads `parcels`, `parcel_buildings`,
  `building_footprints`, `toronto_centreline`. No other table is written. Pair existence is invalidated outside the step by the
  migration-255 trigger (a material `parcels.geom` change deletes both orientations) and the parcels FK cascade.
* **Seed:** six `abut_*` / `fya_est_*` logic variables (`abut_touch_tolerance_m`, `abut_min_shared_len_m`, `abut_bbox_pad_deg`,
  `abut_street_search_deg`, `fya_est_min_m`, `fya_est_max_m`), all `on_invalid: "fail"`.
* **Columns written:** the nine value/key columns of the compute's `classifyMatches` row + `linked_at` (`run_at`).

**G2:** ASSESSMENT-INCOMPLETE — because this is a net-new step: no legacy script exists, so there is no churn history to plot.

## 3. PH-3 — Intent ledger (G3)

There is no legacy behaviour to preserve. The intents below come from the authorized plan, the research note and the two
fold reviews, and each is encoded in the converted form. Commit shas: the base `51bad989` (the programme tip the H6 branch
started from) and `a3418800` (the sources-chain conversion window end the chain shape is measured against).

| Intent | Source | Disposition (preserved-in-compute / encoded-as-descriptor-field / encoded-as-deviation / knowingly-retired) and why |
|---|---|---|
| One row per ordered pair, both orientations, one shared length per unordered pair | plan B2; fold PA-F2 (LAB-D2) | preserved-in-compute — `buildPrimaryMatchSql` `u`/`m`/`kept`; why: asymmetric_pairs `checks[].why` and notes.json `read_this_way` |
| A corner touch is not an abutment | fold PA-F6 (LAB-D6) | encoded-as-descriptor-field — `abut_min_shared_len_m` min 0.1 (strictly positive) + the lineal-only intersection |
| Re-derive every pair on every run; no incremental ledger read in compute | Q-B3 (adjudicated full rescan 2026-10-14); R-BZ G1 (LAB-D1) | encoded-as-descriptor-field — `mode_select: "none"` + a `full_rescan` invalidator (R-BM, Spec 124 §5); no deviation, the keyed delete is optional in the library (H6 QA ruling 2026-10-16 item 5) |
| Front-setback estimate is advisory with a closed status | plan B2; Spec 69 M-26 | encoded-as-descriptor-field — `est_status` vocabulary (`on_unknown: fail`) mirrored by the migration CHECK |
| Residential neighbour = by-law zone families R/RD/RS/RT/RM | By-law 569-2013 | preserved-in-compute — `RES_ZONES`; why: notes.json `decisions[0]` (frozen vocabulary, not a tunable) |
| The prior tri-state incremental gate | 2026-10-08 build | knowingly-retired — its predicate read `pipeline_runs` from compute text (R-BZ G1) |

## 4. Risk class (G4)

| Risk class | Chance | Impact | Guard |
|---|---|---|---|
| Asymmetric or half-written pairs | low | medium | `asymmetric_pairs` WARN over the whole table; the shared-length decision is taken once per unordered pair |
| Pairs left stale after a tunable or method change | low | medium | declared limitation (`check_id: none`); `recovery.reset` rebuilds; LAB-D7 PIN |
| Estimate read as the by-law setback | medium | high | `est_status` closed vocabulary; notes `blind_spots` (fidelity `differs`, Q-B1 oracle not passed) |
| Full re-derive exceeds the run budget | medium | medium | `step_timeout: 45m`, GiST-indexed self-join; the budget (≤ 30 min) is measured at the first capture |
| Search pad narrower than the tolerance | low | medium | limitation on `parcels_with_abutments_pct`, both bounds declared |

## 5. PH-5 — Seam map (G5)

* **DB seam:** the library (`runLinkPhase`, `scripts/lib/step/write.js` guarded upsert); the compute returns SQL text only.
* **Clock seam:** none in the compute; `linked_at` is the library's `run_at` bind.
* **Network seam:** none (`execution.network: "none"`).
* **argv / env seam:** none read by the step; `PIPELINE_CHAIN` is the runner's.

## 6. PH-6 — Defect ledger (G6)

Rows `LAB-D1` … `LAB-D6` (CLOSED, fold 2 + H6 port) and `LAB-D7` (PIN) in `docs/reports/defect-ledger.md`.

## 7. Red suite (PH-7)

Red-first evidence, both directions, committed vitest JSON. Each red run applied ONE targeted mutation to
`scripts/lib/compute/link-parcel-abutments.js`, ran `src/tests/steps/link_parcel_abutments/violations.test.ts`, then restored
the module byte-for-byte (`cmp`) and re-ran green; the matching green file sits beside each red one:
* `docs/reports/red-evidence/link_parcel_abutments/pa-f2-symmetric-red.json` — `PA-F2 shared length is symmetric, measured once per unordered pair` (mutation: u keeps ordered pairs, SELECT a AS lo, b AS hi FROM nb)
* `docs/reports/red-evidence/link_parcel_abutments/pa-f4-empty-street-red.json` — `PA-F4 an empty street union is not a found street` (mutation: street_found drops NOT ST_IsEmpty(st.g))
* `docs/reports/red-evidence/link_parcel_abutments/pa-f5-fail-open-red.json` — `PA-F5 the asymmetric check fails open on an unmeasured count` (mutation: the non-finite branch disabled)
* `docs/reports/red-evidence/link_parcel_abutments/pa-f6-point-touch-red.json` — `PA-F6 the shared-length minimum excludes point touch` (mutation: kept filters shared_len_m >= 0)
* `docs/reports/red-evidence/link_parcel_abutments/pa-10-est-status-red.json` — `PA-10 classifyMatches est_status` (mutation: a negative estimate is stamped estimated)
* `docs/reports/red-evidence/link_parcel_abutments/pa-q2-share-floor-red.json` — `PA-Q2 the abutment share is a WARN floor from config, reported as a value` (red-first: run before the change, when the check was INFO with no config floor; H6 QA ruling 2026-10-16 item 2)

Filled at capture (H6 runbook step 5): the zero-write idempotent second run, the measured run budget, and the first
measurement replacing notes `expected_shape` ("inferred, not measured").

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low confidence | What would raise it |
|---|---|---|
| `est_status` is domain output, not a verdict (orchestrator ruling 2026-10-16, operator-chosen option) | `classifyMatches` compares the estimate to `fya_est_min_m` / `fya_est_max_m`; the purity gate does not see a config value passed as a parameter, so V3's zero-finding result here rests on this ruling | the purity-gate fix for parameter-passed config (orchestrator, separate change) |
| `sqlNumber` repeats the library's finite/bounds check | `config.js:85` already refuses non-finite values under `on_invalid: "fail"`; the compute copy stays because the PA-F3 lock asserts it | a QA ruling to drop the copy and re-point PA-F3 at `config.js` |
| Pair counts and the abutment share | inferred from the parcel count (about 2.3 neighbours per lot); never measured | the first capture |
| Front-setback estimate accuracy | method v2 within 0.5 m on 2 of 9 CoA-notice oracle parcels | Q-B1 (oracle tolerance, n ≥ 100) |

### RECURRING / STANDARD-SHAPING table

| Pattern | Where else it applies |
|---|---|
| A symmetric relation measured once per unordered pair, expanded to both orientations after the keep/drop test | any future junction of mutually-related rows (adjacency, overlap) |
| Existence invalidated by a DB trigger, values by full rescan, no retraction | any derived junction whose existence depends only on geometry |
| A limitation declared with `check_id: "none"` instead of a check that cannot see the case | any step whose failure mode is invisible to its own table invariants |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=link_parcel_abutments --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=2 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-left window=b87f62d |
| G3 | 2 | 2 | ledger rows=6 vocab-hit rows=6; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=21 red-evidence-claims=6 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 net-new (R-DK) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=21 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | link_parcel_abutments | PASS | min_migration=255 <= migrations count=273 |
| 2 | link_parcel_abutments | PASS | 7 declared, missing from seeds: none |
| 3 | link_parcel_abutments | PASS | retired=0 overlap-with-declared=none |
| 7 | link_parcel_abutments | PASS | SPEC LINK header present=true |
| 8 | link_parcel_abutments | PASS | G-4: 7 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | link_parcel_abutments | PASS | HB-1: execution.shape="link" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | link_parcel_abutments | PASS | CEIL-1: execution.shape="link" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 7 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 7 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 497 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 24.65 s <= 25.3 s; registry-input 24.41 s <= 27.5 s; measured 2026-10-18T18:40:16.223Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 532 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 169 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (5 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 40 take effect at cutover, 9 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 7 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=29786B notes=5112B checks=6 rows records_meta=2499B (newest post/ capture) |

**Enforced-green: 11/14** · not-run: 1 · vacuous: 1

