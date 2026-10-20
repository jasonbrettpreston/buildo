# `load_bylaw_map_areas` — net-new INGESTOR assessment (WF1 McBylaw Phase 2 inputs A3, converted from day one)

**Commit form: compressed (R-PACE-1)**

> **Status:** built 2026-10-08 on the Phase 2 inputs branch, ported to H6 on 2026-10-14 and conformed on 2026-10-16
> (worktree `Buildo-wt-h6c`, branch `wf1/h6-p2-inputs-c`). Pending stage `shape_clean_pending_recapture`: everything except
> this step's own captures is present. The first load and its captures follow in the H6 runbook, step 3. The tag `batch3-p1-2`
> is provisional; the queue (`.cursor/QUEUE.md`) assigns it.

**Target spec:** `docs/specs/01-pipeline/58_source_zoning_bylaw.md` §11.3 · **Governing plan:** `.cursor/wf1_mcbylaw_phase2_inputs_active_task.md`
(A3) · **Script:** `scripts/load-bylaw-map-areas.js` (frozen shell) · **Chain:** `bylaw_maps`, position 1 of 1 (operator-triggered, the
`coa_notices` posture) · **Lock:** `127` (Spec 47 §A.5).

INGESTOR has ≥ 2 converted members (`load_ravines`, `load_coa_notices`, `address_points`, …) and is proven, so the compressed form is
the default; no full-form reason applies.

## 1. PH-0 — Boundary freeze

* **Boundary:** one write target, `bylaw_map_areas` (migration 254), class `upsert_scoped_departure_delete` keyed by `area_key`,
  `retract: "departed"`, `txn_scope: step`. Reads: the committed seed `scripts/seeds/bylaw/maps/600_60.geojson` (filesystem
  external) and its manifest. No other table is written.
* **Seed:** the adopted seed, 27 features (18 City GIS layer-80 areas + 9 CKAN wards), sha256 `b24cfb16…`, md5 `e28c4d8a…`,
  pinned by `scripts/seeds/bylaw/maps/manifest.json`; refreshed only through `map-seed.mjs --refresh` then `--adopt`.
  No logic variables (`config: "none"`): every bound is `viol == 0`.
* **Columns written:** `area_key`, `map_code`, `source`, `source_feature_id`, `area_type`, `area_name`, `seed_sha256`, `geom`.

**G2:** ASSESSMENT-INCOMPLETE — because this is a net-new step: no legacy script exists, so there is no churn history to plot.

## 3. PH-3 — Intent ledger (G3)

There is no legacy behaviour to preserve. The intents below come from the authorized plan (A3), the operator rulings of
2026-10-08 and the H6 conformance answers of 2026-10-16, and each is encoded in the converted form. Commit shas: the base
`51bad989` (the programme tip the H6 branch started from) and `a3418800` (the `load_zoning` ③ cutover, the first Spec 58
INGESTOR, whose shape this step follows).

| Intent | Source | Disposition (preserved-in-compute / encoded-as-descriptor-field / encoded-as-deviation / knowingly-retired) and why |
|---|---|---|
| The map is pinned; the pipeline never fetches the layer live | plan A3; Spec 68 §9 G-PROV | encoded-as-descriptor-field — `inputs.reads.externals[0]` is `kind: filesystem`; `seed_hash_matches_manifest` is a `pre_write` FAIL with an `order_guarantee` |
| A partial map is never written | plan A3 | encoded-as-descriptor-field — `source_counts_match_manifest`, `bad_key_count`, `duplicate_key_count`, `null_geometry_count`, `geometry_skipped_count` are `pre_write` FAIL checks |
| Map code, sources and area types are the manifest's data, never a second copy | H6 conformance 2026-10-16 (operator: static data) | preserved-in-compute — `MAP_CODE`, `SOURCES`, `AREA_TYPES` are derived from the static manifest; why: the `load_coa_notices` vocab posture (checks[] `seed_hash_matches_manifest` why) |
| The licence is recorded, never decided | operator Q-A1 2026-10-08 | encoded-as-descriptor-field — `dataset_source_license` INFO row + `limitations[1]`; the step runs only in its own operator-triggered chain |
| One seed file, text key `area_key = source:source_feature_id` | operator 2026-10-08 | encoded-as-deviation — `deviations[1]` |
| The plan's "seed missing → fail_error" posture | plan A3 | encoded-as-deviation — `deviations[0]` (the library's `no_source_file` skip; the infra test reddens a missing seed) |
| Reload on a code change with an unchanged seed | H6 conformance 2026-10-16 (fleet: 9 of 10 INGESTORs carry no `code_version` trigger) | knowingly-retired — declared in `limitations[2]`; `BYLAW_MAP_FORCE_RELOAD=1` is the deliberate reload |

## 4. Risk class (G4)

| Risk class | Chance | Impact | Guard |
|---|---|---|---|
| A partial or wrong map decides 600.60 membership | low | high | five `pre_write` FAIL checks; the seed hash pin; `txn_scope: step` (upsert + departure delete commit together) |
| The City republishes layer 80 and the seed goes stale | medium | medium | `source_counts_match_manifest`; notes `suspicious_if`; re-adopt is a reviewed commit |
| The unverified licence reaches a published artifact | low | high | operator-triggered chain only, never scheduled; `dataset_source_license` records the ruling every run (LBMA-D5 PIN) |
| The holes are read the wrong way downstream | medium | medium | loaded as published; the ruling is owned by Q-A2 (LBMA-D6 PIN) |
| A code change does not reload | low | low | declared limitation; `BYLAW_MAP_FORCE_RELOAD=1` (`recovery.force`) |

## 5. PH-5 — Seam map (G5)

* **DB seam:** the library only (`scripts/lib/step/write.js` guarded upsert + scoped departure delete, the PostGIS validation
  SELECT); the compute holds no SQL.
* **Clock seam:** none in the compute; the library stamps the run.
* **Network seam:** none — the external is `kind: filesystem` (`execution.network: none`); the seed is fetched only by
  `map-seed.mjs --refresh`, an operator tool outside the step.
* **argv / env seam:** none read by the compute; `BYLAW_MAP_FORCE_RELOAD` is the declared `override.force_run`; `PIPELINE_CHAIN`
  (`bylaw_maps`) is the runner's.

## 6. PH-6 — Defect ledger (G6)

Rows `LBMA-D1` (CLOSED), `LBMA-D2` (CLOSED), `LBMA-D3` (CLOSED), `LBMA-D4` (CLOSED), `LBMA-D5` (PIN), `LBMA-D6` (PIN) in
`docs/reports/defect-ledger.md`.

## 7. Red suite (PH-7)

Red-first evidence, both directions, committed vitest JSON. Each red run applies one temporary, targeted mutation to
`scripts/lib/compute/load-bylaw-map-areas.js` (restored and verified byte-identical with `cmp` before the matching green run):
* `docs/reports/red-evidence/load_bylaw_map_areas/content-hash-red.json` — `BMA-16b the load block carries content_hash, the key the content-hash skip compares`
* `docs/reports/red-evidence/load_bylaw_map_areas/counter-refuse-red.json` — `BMA-F2 an unmeasured counter refuses; a measured zero passes`
* `docs/reports/red-evidence/load_bylaw_map_areas/feature-id-red.json` — `BMA-F3 shapeRecord refuses a non-integer / non-positive source_feature_id`
* `docs/reports/red-evidence/load_bylaw_map_areas/coerce-key-red.json` — `BMA-13 coerceKey`

The mutation behind each red, in the same order:
* content-hash: buildLoadMeta names the hash seed_md5 (the pre-conformance shape of LBMA-D1).
* counter-refuse: counterOrRefuse folds an unmeasured counter to 0.
* feature-id: the shapeRecord integer check on source_feature_id is reduced to a null check.
* coerce-key: the source half of the key is trimmed before the lookup.

`src/tests/steps/load_bylaw_map_areas/violations.test.ts` (BMA-1…20, BMA-16b, BMA-F1…F5), `bylaw-map-seed.logic.test.ts` and
`bylaw-maps.infra.test.ts`: 55 green on 2026-10-16.

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low confidence | What would raise it |
|---|---|---|
| The seed's area-type and hole counts (LBMA-D2) | measured from the seed file; the first capture confirmed 24 type-4 + 3 type-3 rows in the table (2026-10-16) | — (raised) |
| An emptied target is not reloaded while the seed is unchanged (LBMA-D7) | the content-hash skip compares the prior run only, never the table (measured 2026-10-16: run 1 skipped over an empty table) | the V3 programme fix (fleet-wide); until then `BYLAW_MAP_FORCE_RELOAD` |
| Holes meaning (Q-A2) | unruled; loaded as published | the operator ruling |
| Licence (Q-A1) | the City states none | the operator's confirmation |

### RECURRING / STANDARD-SHAPING table

| Pattern | Where else it applies |
|---|---|
| An emit block's skip key must be the key the library compares (`content_hash`), checked by a lock rather than by convention | every INGESTOR with a `content_hash` trigger and a named emit block |
| A declared consumer must be an observed reader of the block (R-BF); a watermark pin on a table is not a consumer of `records_meta` | every `emits[].consumers` entry naming a step |
| A "measured" note must name a query that can run today | every notes.json `measured` block written before its table exists |
| A net-new step stays `pending` (no PRE can exist; #22 covers `converted[]` only) — Spec 124 R-CS | load_coa_notices, link_parcel_abutments, every future net-new step |
| A content-hash skip must not hold over an empty target | every INGESTOR with a `content_hash` trigger (LBMA-D7) |

The generated validation scorecard is appended at capture (H6 runbook step 3) by `node scripts/analysis/step-validate.mjs --step=load_bylaw_map_areas --write`.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=load_bylaw_map_areas --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=7 vocab-hit rows=7; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=26 red-evidence-claims=4 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 net-new (R-DK) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=26 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | load_bylaw_map_areas | PASS | min_migration=254 <= migrations count=273 |
| 2 | load_bylaw_map_areas | PASS | 0 declared, missing from seeds: none |
| 3 | load_bylaw_map_areas | PASS | retired=0 overlap-with-declared=none |
| 7 | load_bylaw_map_areas | PASS | SPEC LINK header present=true |
| 8 | load_bylaw_map_areas | PASS | G-4: no declared logic_variables |
| 20 | load_bylaw_map_areas | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | load_bylaw_map_areas | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 568 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
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
| 3 | Tunables externalized | enforced-green | G-4: no declared logic_variables · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 1 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 6 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=24807B notes=4708B checks=8 rows records_meta=1325B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 1 · vacuous: 0

