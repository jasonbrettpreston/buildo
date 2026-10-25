# `resolve_bylaws` — net-new MATERIALIZER assessment (Layer 2 by-law resolution, converted from day one)

**Commit form: full (R-AH)**. The ROWS arm has two converted members (`classify_coa_trades`, `compute_coa_cost_estimates`, both still pending past ②), so
the archetype's full-form count is not reached; the stated reason for full form is that this step is the first to write a one-row-per-lot table of
positional arrays with two closed dictionaries (operator CHAT-80.QP, option 4), and the first MATERIALIZER with a read-back view.

> **Status:** commit ① (Spec 124 R-IX: slices (b)-(d) land as one commit), 2026-10-22. Descriptor, shell, compute, notes, migration 282 (written,
> NOT applied), logic-variable seeds, tests and registrations are present. Pending stage `compute_ported`: no POST capture exists until the DB
> night that applies migration 282 (queued in the lane report). Chain placement is ③ (Spec 124 R-HD).

**Target spec:** `docs/specs/01-pipeline/134_resolve_bylaws.md` · **Governing plan:** `docs/reports/2026-10-21-layer2-build-plan.md` (operator rulings
CHAT-39, CHAT-41, CHAT-69 = Spec 124 R-JA (storage form superseded by CHAT-80.QP), CHAT-73, CHAT-75, CHAT-77.freeze, CHAT-80.QP) · **Script:** `scripts/resolve-bylaws.js` (frozen shell) · **Lock:** `134` (Spec 47 §A.5, the spec
number) · **Chain:** none yet (`sources`, after `enrich_parcels`, before `link_parcel_abutments`, at ③).

R-AS: N/A — no legacy predecessor (Spec 124 R-HC: R-DK covers both new steps; the R-AS adaptation is superseded).

## 1. PH-0 — Boundary freeze

* **Boundary:** three write tables (migration 282, operator CHAT-80.QP option 4): the closed dictionaries `bylaw_resolution_units` and
  `bylaw_resolution_texts` (guarded upserts, keyed by a 32-bit hash of their content) and `bylaw_resolution_lots` (one row per lot, results as
  positional arrays in scope-seed order; a `replace_keys` retraction then a guarded upsert, R-IU), plus the read view `bylaw_resolution_results`. The
  two dictionaries are also read once as `role: "lookup"` so a key collision with a stored row fails loud. Reads `parcels` only; Layer 1 arrives as the one generated file `docs/reference/bylaw-layer2-input.json`
  (R-IL), required statically by the compute. Never writes `parcels` (Spec 69a M-25).
* **Seed:** fourteen `resolve_bylaws_*` logic variables (the population list variable and thirteen numbers), all `on_invalid: "fail"`.
* **Columns written:** the result columns of each table (`RESULT_COLUMNS`); the lot row adds `row_sha`, `table_version`, `evaluator_version` and
  `resolved_at` (`run_at`), the dictionaries only `resolved_at`; `chain_run_id` stays NULL (`db_default`, Q-L).

**G2:** ASSESSMENT-INCOMPLETE — because this is a net-new step: no legacy script exists, so there is no churn history to plot.

## 3. PH-3 — Intent ledger (G3)

There is no legacy behaviour to preserve. The intents come from Spec 134, the operator rulings and the Layer 2 build plan; commit shas: the register tip
`bc5cd3af` (R-JA and the R-IX note), the part-A library `861f9700`, the list-variable type `daed754a`, and the operator rulings CHAT-75, CHAT-77.freeze and CHAT-80.QP.

| Intent | Source | Disposition (preserved-in-compute / encoded-as-descriptor-field / encoded-as-deviation / knowingly-retired) and why |
|---|---|---|
| The unauthored-exception gate is lot-wide, applied before `effective()`, written per target | Spec 134 §5; Spec 69a M-231 | preserved-in-compute — `resolveRow` / `gatedResult` in `scripts/lib/bylaw-materialize.js`; why: `gated_winner_violations` `checks[].why` and notes.json `suspicious_if` |
| `effective()` is the only reader of Layer 1; the evaluator stays pure | Spec 134 §2 | encoded-as-descriptor-field — compute closure (gate E) + the generated input file; why: `staleness.fingerprint_inputs` and the R-DET lock |
| One stored result per structure, target and that target's own read inputs | Spec 124 R-IN option B (CHAT-41) | knowingly-retired as a STORAGE shape by CHAT-80.QP (cells are no longer stored); the evaluator-side cell cache keeps the key (`cellKey`) for speed; why: notes.json `decisions[0]` |
| The lot link row points at its results through one profile key | Spec 124 R-JA (CHAT-69.Q1) | knowingly-retired by CHAT-80.QP (option 4): the lot row holds its results as positional arrays; why: notes.json `decisions[0]`, `lineage_violations` `checks[].why` |
| The logical row is the 11 frozen fields, whatever the physical form | operator CHAT-77.freeze | preserved-in-compute — `logicalRowsOf` / `traceResult` recompute `inputs_used`, `losers`, `disclosures` on read; why: `frozen-row.logic.test.ts` |
| Out-of-population parcels lose their link row | Spec 124 R-IU | encoded-as-descriptor-field — the `link_full_retraction` / `replace_keys` target before the lot upsert |
| Equal results across classes are not stored twice | Spec 124 R-IR | preserved-in-compute — `encodeLotResults` stores only the class positions that differ (`class_results`); why: `class_cap_violations` `checks[].why` (Q-C) |
| A missing input is never defaulted | Spec 134 I10 | encoded-as-descriptor-field — `inputs_defaulted` check, exact zero |
| Time budget for the equivalence check | Spec 134 I12 | encoded-as-deviation — Q-N: the sample size (`resolve_bylaws_equivalence_every_nth`) is the budget, because pure compute holds no clock (R-DET) |

## 4. Risk class (G4)

| Risk class | Chance | Impact | Guard |
|---|---|---|---|
| A stored result that disagrees with the evaluator, or an encoding slip (a wrong dictionary key, a shifted position) | low | high | every lot's results are stored per lot, never shared; `equivalence_disagreements` re-evaluates every Nth lot uncached for every class against what the row DECODES to; `lineage_violations` checks the array widths and every dictionary key |
| Storage growth past the Spec 78 §6.8 kill line | medium | high | `storage_within_budget` against `resolve_bylaws_storage_budget_mb` at POST. A random 3,000-lot sample averages 2,112 raw bytes per lot row, which models at about 1.0 GB for 440,093 lots (upper bound, no TOAST compression) against the 1,300 MB budget and about 1.35 GB of room; the interning build modelled at 2.8-6.0 GB (RB-D7) |
| Stale dictionary rows after a law change | medium | low | `unreferenced_rows` WARN; the reset arm rebuilds (Q-M) |
| A direct edit of a result row, or a dictionary key that is not the hash of its content | low | medium | `row_sha_mismatches` recomputed in SQL for the lot rows and both dictionary keys (Q-I) |
| Layer 3 or the admin trace reads `losers`, `inputs_used` or `disclosures` | medium | medium | they are recomputed on read through the uncached evaluator (CHAT-80.QP; `logicalRowsOf`), about 1 to 7 ms per class and pair; the frozen 11-field row is unchanged (`frozen-row.logic.test.ts`) |
| Run time (5 classes x 53 pairs per lot) | medium | medium | `step_timeout: 90m` is provisional; the first POST capture measures and seeds `execution.budget` (R-AJ) |

## 5. PH-5 — Seam map (G5)

* **DB seam:** the library (`materializeRowsArm`, `scripts/lib/step/write.js`); the compute returns SQL text (`buildSourceSql`, `buildPostSql`) and rows only.
* **Clock seam:** none in the compute; `resolved_at` is the library's `run_at` bind and the audit offset is derived from the `run_at` day number bound into the source statement.
* **Network seam:** none (`execution.network: "none"`).
* **argv / env seam:** none read by the step; `PIPELINE_CHAIN` is the runner's.

## 6. PH-6 — Defect ledger (G6)

Rows `RB-D1` … `RB-D7` in `docs/reports/defect-ledger.md`.

## 7. Red suite (PH-7)

Red-first evidence, committed vitest JSON (a failed assertion in each; the suites are committed with the code that turns them green, the accepted
precedent). Each bullet cites one artifact:
* docs/reports/red-evidence/resolve_bylaws/part-a-red.json — R-LABEL, the lot vector, the class lot, the (since removed) form-C profile and pointer functions and the batch core (43 red before the code)
* docs/reports/red-evidence/resolve_bylaws/part-b-red.json — Q-H disclosure-set id and Q-I jsonb canonical text for the row hash
* docs/reports/red-evidence/resolve_bylaws/part-b-migration-red.json — the migration 282 locks against a stub file
* docs/reports/red-evidence/resolve_bylaws/part-c-audit-red.json — Q-N audit tallies (equivalence, candidate order) and the Q-F scenario-axis tally
* docs/reports/red-evidence/resolve_bylaws/part-c-intern-red.json — Q-O interning: losers, by_class and the permission map stored once per distinct payload as json sets (CHAT-75.QO)
* docs/reports/red-evidence/resolve_bylaws/part-e-option4-red.json — CHAT-80.QP option 4: the lot row encoding and dictionaries, the rewritten batch core, the migration and view, the SQL identity checks, the frozen 11-field logical row (82 of 132 red against the interning build)
* docs/reports/red-evidence/resolve_bylaws/list-config-red.json — Q-J the list arm of the runner config and the list_of schema field
* docs/reports/red-evidence/resolve_bylaws/list-type-red.json — the seed loader list type merged from lane L2-PREREQ
* docs/reports/red-evidence/resolve_bylaws/r-emit-red.json — the R-EMIT lock merged from lane L2-PREREQ
* docs/reports/red-evidence/resolve_bylaws/r-det-red.json — the R-DET extension merged from lane L2-PREREQ

Filled at capture (queued in the lane report): the POST capture with the `delete_reinsert` bracket keyed `parcel_id` (R-DP), the rerun-zero proof,
the measured run budget, the storage check, and the replacement of notes `expected_shape` ("inferred, not measured").

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low confidence | What would raise it |
|---|---|---|
| The lot row size and the 1,300 MB storage budget | inferred from a 3,000-lot random read-only sample (2,112 raw bytes per row, about 1.0 GB modelled, no TOAST compression); the real rows are compressed by Postgres above 2 kB | the first POST capture (`storage_within_budget`) |
| The class dimension as sparse `class_results` (Q-C) and the suite unit counts in `classLot` | the plain reading of Spec 134 §2 and the vocab; not ruled. About 80 % of sampled lots carry per-class differences (994 B of the 2,112 B row) | the operator's ruling on Q-C |
| Full-population size of the lot table (about 1.0 GB modelled) | a linear projection of a random 3,000-lot sample onto 440,093 rows; the dictionaries (426 units, 671 texts in the sample) are under 10 MB even at a generous upper bound | the first POST capture |
| The `uses` input is left out of the evaluator cache key | `cell-cache.mjs` cannot key it; constant (never set) in this step | the by-law lane adds it to `inputValue` (RB-D1) |

### RECURRING / STANDARD-SHAPING table

| Pattern | Where else it applies |
|---|---|
| A closed dictionary keyed by a SQL-recomputable hash of its content, so a rewrite is a no-op and a collision fails loud | any derived table whose rows repeat words across parents (reasons, references, unit ids) |
| A pure batch core in a library, wrapped by a thin compute that only maps rows to targets | any MATERIALIZER rows-arm step that needs fixtures through the real engine |
| A sample size as the budget when the compute holds no clock | any audit that would otherwise need a wall-clock bound |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=resolve_bylaws --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=3 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=9 vocab-hit rows=9; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 9 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=27 red-evidence-claims=10 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 net-new (R-DK) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=27 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | resolve_bylaws | PASS | min_migration=275 <= migrations count=282 |
| 2 | resolve_bylaws | PASS | 8 declared, missing from seeds: none |
| 3 | resolve_bylaws | PASS | retired=0 overlap-with-declared=none |
| 7 | resolve_bylaws | PASS | SPEC LINK header present=true |
| 8 | resolve_bylaws | PASS | G-4: 8 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | resolve_bylaws | PASS | HB-1: execution.shape="materialize" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | resolve_bylaws | PASS | CEIL-1: execution.shape="materialize" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 639 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 48 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 48 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 209 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3459/3459 passed (suite success=true)
- harvested: 138 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 8 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=49514B notes=9097B checks=19 rows records_meta=4778B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1

