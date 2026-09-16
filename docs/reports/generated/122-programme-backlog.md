# Spec 122 programme backlog (generated)

> **GENERATED — do not hand-edit.** Source of record: `scripts/steps/_schema/programme-items.json`.
> Regenerate: `npm run programme-backlog`. Drift-guarded by `src/tests/programme-backlog.infra.test.ts`.
> SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §10.3 (R-T)

## Counts

Total items: **120**

| status | count |
|---|---|
| ⬜ NOT_STARTED | 28 |
| ⚠️ PARTIAL | 16 |
| ✅ BUILT | 72 |
| ⏭️ SUPERSEDED | 4 |

**blocks batching: 0**

## Batching prerequisite — blocks "freeze after the eighth" (Spec 122 §8.2/§10.3) (6)

| id | spec | title | status | owner | blocks | last reviewed |
|---|---|---|---|---|---|---|
| `STD-7` | 122 §1.10 | archetype drives required-field profile, 8 archetypes dispatched | ✅ BUILT | pilot: pilot9_enrich_parcels | batching | 2026-09-10 |
| `LDG-4` | 122 §6.3 | stepUpstreams(slug) derived from the ledger | ✅ BUILT | wf: wf: cross-step ledger (WF1), commits 1-6, 2026-09-03 | batching | 2026-09-03 |
| `VAL-9` | 123 §6 R-R / 124 R-AG | the generated "Test suite (item iii)" line is re-derivable — the R-AG live-DB tier is out of runVitest()'s harvested set, and the line names what it harvested | ✅ BUILT | followup: docs/reports/review_followups.md — "MED | Regression Guardian, I3 commit 9 cutover (2026-09-14) | The regenerated assessment reports' 'Test suite (item iii)' line is not reproducible" | batching | 2026-09-15 |
| `FREEZE-1` | 122 §8.2 | freeze precondition satisfied — the batching_prereq set is genuinely empty | ✅ BUILT | wf: wf: programme-FREEZE-1 (phase 2 commit 5, 2026-09-11) — CLOSED | batching | 2026-09-11 |
| `WD-1` | 122 §1.4 | class-enum-without-write.js-branch lock | ✅ BUILT | wf: wf: programme-WD1, WD-1 WF5+WF2 commits 1-3 | batching | 2026-09-09 |
| `ADMIN-1` | 124 §2 Rule 3 | admin GROUPS reverse-coverage — every unclassified seed key gets a real group or a reviewed hidden reason | ✅ BUILT | wf: wf: programme-ADMIN-1 | batching | 2026-09-09 |

## Cutover prerequisite — blocks a specific pilot slug registering in converted.json (16)

| id | spec | title | status | owner | blocks | last reviewed |
|---|---|---|---|---|---|---|
| `STA-1` | 120 §6 | 4 new state tables | ⬜ NOT_STARTED | wf: wf: programme-STA-1 | — | 2026-09-03 |
| `STA-2` | 120 §6b | reset generated per archetype | ✅ BUILT | wf: wf: programme-STA-2 | refresh_snapshot | 2026-09-03 |
| `STA-3` | 120 §6b | 3 destructive-reset guards | ✅ BUILT | wf: wf: programme-STA-2 | refresh_snapshot | 2026-09-03 |
| `CLOUDPARITY` | 122 R-D | cloud database must run apply-logic-variables.js before any cloud cutover | ✅ BUILT | followup: review_followups.md HIGH ops entry (filed 2026-08-27, peel 8c); EP-D13 (filed 2026-09-08, defect-ledger.md); pilot 9 commit 9 acceptance run (orchestrator, 2026-09-10) | cloud_deploy, enrich_parcels | 2026-09-10 |
| `EP-PIN-B45` | 78 §P3C.1/§3.0b | B4.5 pin — pass-4 comps UPDATE has no IS DISTINCT FROM; the comp_count IS NULL incremental predicate never refreshes | ✅ BUILT | pilot: pilot9_enrich_parcels | enrich_parcels | 2026-09-08 |
| `EP-PIN-D8` | 78 §P3C.2 | EP-D8 pin — comp_fsi_p50 has no structure_family/zone compatibility invariant | ✅ BUILT | pilot: pilot9_enrich_parcels | enrich_parcels | 2026-09-08 |
| `EP-PIN-D9` | 78 §P3C.2 | EP-D9 pin — pass-4 comps candidate selection has no deterministic tiebreak (comparable_builds jsonb instability) | ✅ BUILT | pilot: pilot9_enrich_parcels | enrich_parcels | 2026-09-08 |
| `EP-PIN-D10` | 122 §3.0b | EP-D10 pin — enrich_parcels_pass3_scope grows unbounded (append-only, never pruned) | ✅ BUILT | pilot: pilot9_enrich_parcels | enrich_parcels | 2026-09-08 |
| `EP-PIN-D14` | 78 §P3A.1 / 122 §3.0b | EP-D14 pin — pass-5 D4' recovery walks unconsumed enrich_parcels_pass3_scope rows one at a time (full-scan UPDATE per parcel, redundant under --full) | ✅ BUILT | pilot: pilot9_enrich_parcels | enrich_parcels | 2026-09-09 |
| `EP-PIN-D17` | 124 §7 / 48 §3.5 | EP-D17 pin — parcels post-run checks are unbounded serial full scans over a bloat-inflated heap | ⚠️ PARTIAL | pilot: pilot9_enrich_parcels | enrich_centreline | 2026-09-11 |
| `GOLD-PRE` | 122 §5.3 | Golden PRE-side capture completeness enforced per declared chain | ✅ BUILT | wf: wf: conversion-roadmap commit 3, 2026-09-10 | assert_global_coverage, assert_data_bounds, assert_engine_health, link_neighbourhoods, geocode_permits | 2026-09-10 |
| `C4-GATE` | 122 §5.3 / C4 plan §3.4 | C4 "every chain" capture gate is a CHECKER — completeness + freshness, both sides | ✅ BUILT | wf: C4 step H — c4_chain_completeness_gate (2026-09-11) — CLOSED | assert_global_coverage, assert_data_bounds, assert_engine_health, link_neighbourhoods, geocode_permits | 2026-09-11 |
| `HB-1` | 124 §2 Rule 12 | Heartbeat covers the WHOLE step, not only phase boundaries (EP-D15) | ✅ BUILT | wf: wf: conversion-roadmap commit 3, 2026-09-10 | — | 2026-09-10 |
| `CEIL-1` | 124 §2 Rule 12 | Statement/lock ceiling bound on EVERY phase incl. post_commit (EP-D16) | ✅ BUILT | wf: wf: conversion-roadmap commit 3, 2026-09-10 | — | 2026-09-10 |
| `VEL-1` | 124 R-AG (proposed) | Gate placement: full suite at pre-push, vitest related + fast invariants at pre-commit, live-DB infra tests in test:db | ✅ BUILT | wf: wf: conversion velocity (R-AG) | address_points, assert_parcel_sanity, compute_parcel_cost_estimates, enrich_centreline, enrich_heritage, enrich_ravines, load_centreline, load_heritage, load_wsib, load_zoning, massing, neighbourhoods, parcels, reconcile | 2026-09-14 |
| `VEL-2` | 124 R-AH (proposed) | Compressed 3-commit form is the default once an archetype has two full-form members | ✅ BUILT | wf: wf: conversion velocity (R-AH) | address_points, assert_parcel_sanity, compute_parcel_cost_estimates, enrich_centreline, enrich_heritage, enrich_ravines, load_centreline, load_heritage, load_wsib, load_zoning, massing, neighbourhoods, parcels, reconcile | 2026-09-14 |

## Nice-to-have — real gap, not currently blocking (98)

| id | spec | title | status | owner | blocks | last reviewed |
|---|---|---|---|---|---|---|
| `STD-1` | 122 §1.3 | 20 categories, schema-canonical | ✅ BUILT | wf: schema (R2), pre-existing | — | 2026-09-14 |
| `STD-2` | 122 §4.1 | descriptor is a data-only sibling JSON | ✅ BUILT | pilot: pilots 1-6 | — | 2026-08-29 |
| `STD-3` | 122 §5.1 | mandatory ast-grep shape rule | ✅ BUILT | wf: shape gate, all pilots | — | 2026-08-29 |
| `STD-4` | 122 §4.1 | step-0 reconcile becomes a reconcile step | ✅ BUILT | wf: manifest, pre-session | — | 2026-08-29 |
| `STD-5` | 122 §5.5 | the COMPUTE shape | ✅ BUILT | pilot: pilots 1-6 | — | 2026-08-29 |
| `STD-6` | 122 §4.2 | pipeline.step() is a factory, AJV-validates before compute runs | ✅ BUILT | wf: step library | — | 2026-08-29 |
| `STD-8` | 122 §8.2 | freeze the template after the eighth, never the first | ✅ BUILT | wf: wf: programme-STD-8, e029c37d | — | 2026-09-04 |
| `STD-9` | 122 §5.4 | ADVISORY_LOCK_ID kept textually | ✅ BUILT | pilot: pilots 1-6 | — | 2026-08-29 |
| `LDG-1` | 122 §6.0 | column-lineage generator | ✅ BUILT | wf: pre-existing infra | — | 2026-08-29 |
| `LDG-2` | 122 §6.1 | ledger table edges from outputs.writes -> inputs.reads | ✅ BUILT | wf: R-T addendum commit 5 (absorbed into VAL-WF2) | — | 2026-08-30 |
| `LDG-3` | 122 §6.2 | records_meta contracts HALT on violation | ✅ BUILT | wf: pre-existing infra | — | 2026-08-29 |
| `LDG-5` | 122 §6.4 | 4 invalidation mechanisms real today | ✅ BUILT | wf: pre-existing infra | — | 2026-08-29 |
| `LDG-6` | 122 §6.4a | the centroid invalidation gap | ✅ BUILT | pilot: pilot6_compute_centroids | — | 2026-08-29 |
| `LDG-7` | 122 §6.5 | descriptor reads/writes consistent with manifest.chains order | ✅ BUILT | wf: R-T addendum commit 5 (absorbed into VAL-WF2) | — | 2026-08-30 |
| `LDG-8` | 122 §6.1 | invalidation + counters scoped by writes.key | ✅ BUILT | pilot: pilot3_link_massing, pilot4_link_wsib | — | 2026-08-29 |
| `LDG-9` | 122 §1.7 | sharing.chains/shared/slug_forms are ~ derived | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `LC-1` | 122 §4.1 (Spec 120 §4) | ~35 step lifecycle behaviours | ✅ BUILT | pilot: pilot8_refresh_snapshot, 32eec17f | — | 2026-09-04 |
| `LC-1b` | 122 §4.1 | reap stale heartbeats -> crashed | ✅ BUILT | wf: A3, pre-session | — | 2026-08-29 |
| `LC-1c` | 122 §4.1 | a skip re-measures its checks live | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `LC-2` | 122 §4.1a | 5-part logic fingerprint | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `LC-3` | 122 §4.2b | --plan mode | ⬜ NOT_STARTED | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `LC-4` | 122 §4.6 | generated SQL only, no string surgery | ⬜ NOT_STARTED | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `LC-5` | 122 §4.1 (Spec 120 §4) | declaration_tiers badge + OpenLineage emit (split from LC-1, 2026-09-04) | ⬜ NOT_STARTED | followup: review_followups.md (split at WF2 'template freeze' C2, 2026-09-04) | — | 2026-09-04 |
| `VAL-1` | 120 §5 | 12 named check types as generators | ⏭️ SUPERSEDED | — | — | 2026-08-29 |
| `VAL-2` | 79 §2 | 12-item per-step evidence checklist | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `VAL-3` | 79 §3a' | Seam-Validation Pass | ✅ BUILT | wf: R-T addendum commit 5 (absorbed into VAL-WF2) | — | 2026-08-30 |
| `VAL-4` | 79 §3b | Chain-End Synthesis, 4-agent adversarial review | ✅ BUILT | wf: WF5 operator process | — | 2026-08-29 |
| `VAL-4b` | 79 §10 | Hidden-Failure Tripwires, per-risk-class profile | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `VAL-5` | 122 §7.1 | map-concerns.mjs and map-categories.mjs | ✅ BUILT | followup: R5 ongoing triage | — | 2026-08-29 |
| `VAL-6` | 122 R-R | step-validate.mjs is the ONE validation command | ✅ BUILT | wf: R-R, landed | — | 2026-08-29 |
| `VAL-7` | 121 §6.4 | stopping rule: saturation + gate + time-box | ⬜ NOT_STARTED | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `VAL-8` | 121 §7.3 | method_version stamp + MAJOR-bump re-audit | ⬜ NOT_STARTED | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `STA-4` | 120 §6c | admin surface: check-list-as-data etc. | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `PRG-1` | 122 R3 | clean cloud chain_sources run gates C1 | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `PRG-2` | 122 R4 | S2 is a vertical slice, not a monolith | ✅ BUILT | wf: ongoing | — | 2026-08-29 |
| `PRG-3` | 122 §7.2 | pilot order rulings | ✅ BUILT | pilot: pilot 8 cutover, 32eec17f | — | 2026-09-04 |
| `PRG-4` | 122a §12.2 | 6 missing P0 categories adjudicated | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `PRG-5` | 122a §B2 | 54 orphan claims triaged in batches | ⚠️ PARTIAL | followup: R5, ongoing | — | 2026-08-29 |
| `PRG-6` | 123 §6 G7 | mutation testing replaced by both-directions red-first locks | ✅ BUILT | followup: review_followups.md S6b entry (2026-08-25 ruling) | — | 2026-08-29 |
| `PRG-7` | 122 R-D | assert_schema gains declared_logic_variables_present | ✅ BUILT | pilot: R-D, exercised every pilot since 4 | — | 2026-08-29 |
| `PRG-8` | 122 R-A | config.retired[] declaration mechanism | ✅ BUILT | pilot: R-A, pilot 3+ | — | 2026-08-29 |
| `PRG-9` | 122 V7 | grandfathered.json rules[] array | ✅ BUILT | pilot: V7, pilots 3/5 | — | 2026-08-29 |
| `PRG-10` | 122 §8.2 | freeze after the eighth - no formal batching mechanism (repeat of STD-8) | ⏭️ SUPERSEDED | — | — | 2026-09-04 |
| `PRG-11` | 123 §4.8 | Two CI holes closed | ✅ BUILT | wf: P0c, landed pre-session | — | 2026-08-29 |
| `G0` | 123 §6 | Gate G0 - Boundary freeze | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `G1` | 123 §6 | Gate G1 - Archaeology / Intent Ledger | ⚠️ PARTIAL | followup: review_followups.md (2026-08-29 programme backlog filing) | — | 2026-08-29 |
| `G2` | 123 §6 | Gate G2 - Structure, churn x complexity plot | ✅ BUILT | wf: WF2 PH-2 churn x complexity BATCH (S6b, review_followups.md:2994), 2026-09-03 | — | 2026-09-03 |
| `G3-G5` | 123 §6 | Gates G3-G5 - Golden master, Differential, Cutover | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `G6` | 123 §6 | Gate G6 - Behaviour classification | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `G7` | 123 §6 | Gate G7 - Test adequacy | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `G8` | 123 §6 | Gate G8 - Golden differential | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `G9` | 123 §6 | Gate G9 - Reflection | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `CLAIM-1` | 123 §5.2 | claim register - plan-claims.mjs | ✅ BUILT | wf: pre-existing infra | — | 2026-08-29 |
| `CLAIM-2` | 123 §5.2 | spec:tests harvest | ✅ BUILT | wf: pre-existing infra | — | 2026-08-29 |
| `POLICY-MATRIX` | 124 §2 Rule 13 | Spec 124 policy coverage matrix, per-step, generated | ✅ BUILT | wf: R-R, step:validate | — | 2026-08-29 |
| `RT-CC3` | 122 §6.4a | compute_centroids drift + link_parcels Tier-3 join exposure - corrected measurement | ⚠️ PARTIAL | followup: review_followups.md HIGH entry, filed 2026-08-29 (supersedes the pilot-6-report 276 figure) — link_parcels.js join-strategy fix still OPEN, not this WF3's scope | — | 2026-08-30 |
| `LMD-RH` | 124 §2 Rule 10 addendum | LM-D6/LM-D11 R-H WARN promise not yet reflected in the ledger | ⚠️ PARTIAL | followup: review_followups.md R-R backfill entry, 2026-08-29 | — | 2026-08-29 |
| `PROSE-G1P3` | 124 §2 Rule 10 | Rule 10 step-library scope caveat + P3 disk-I/O measurement are intentionally prose-only | ✅ BUILT | wf: step-validate.mjs, by design | — | 2026-08-29 |
| `ZWP-56` | 123 §6 G8 | the real (non-SKIP) write path is barely live-exercised for pilots 5 and 6 | ⚠️ PARTIAL | followup: review_followups.md pilot5/pilot6 entries, 2026-08-29 | — | 2026-08-29 |
| `TCADB` | 124 §2 | database.assert_current_database is proven live once, not standing testcontainer-enforced | ⚠️ PARTIAL | followup: review_followups.md LOW entry (LW-D16 class) | — | 2026-08-29 |
| `REGEXSC` | 124 §2 Rule 13 | step-validate.mjs's regex-brittle report-scraping is superseded in design by VAL-WF2's structured-artifact scorecard | ⏭️ SUPERSEDED | — | — | 2026-08-30 |
| `VAL-WF2` | 124 §2 Rule 13 | Validator v2 - a DATA-plausibility validator, distinct from the process scorecard | ✅ BUILT | wf: R-T addendum, "The Step Validator, Data-First" (2026-08-30) | — | 2026-08-30 |
| `LG-21` | 122 §5.5 | runPhaseScaffold(descriptor, phaseBody) - shared phase-runner scaffold | ⏭️ SUPERSEDED | — | — | 2026-09-04 |
| `G-DEREGEX` | 124 §2 Rule 13 | Gates G0/G1/G3/G4/G5/G9 still prose-regex-scraped, not structured artifacts | ⬜ NOT_STARTED | followup: review_followups.md (R-T addendum commit 7 filing, 2026-08-30); Ask 3 | — | 2026-08-30 |
| `ASSERT-HEALTH-SHAPE` | 124 §2 | assert_health[] — a closed-shape category for health/liveness checks, left dormant | ⬜ NOT_STARTED | followup: review_followups.md (R-T addendum commit 7 filing, 2026-08-30); Ask 4 | — | 2026-08-30 |
| `PSA-CHECK-IDS` | 124 §2 Rule 13 | parcel-sanity-audit.js's 42 CHECKS[] entries have no per-check id — plausibility[] SQL is duplicated, not referenced | ⬜ NOT_STARTED | followup: review_followups.md (R-T addendum commit 7 filing, 2026-08-30); Fold A-4d | — | 2026-08-30 |
| `TRIPWIRE-T4T5` | 124 §8 | run-step.mjs tripwires T4/T5 stay N/A-MANUAL for both converted ingest_linkage steps | ⬜ NOT_STARTED | followup: review_followups.md (R-T addendum commit 7 filing, 2026-08-30); Fold A-4e | — | 2026-08-30 |
| `R-W` | 124 §2 Rule 2 addendum | Compute must not branch on PostGIS availability — guards.requires is the only legal form | ✅ BUILT | wf: WF6, docs(122_step_optimization) pilot7 ruling + R-W commit, 2026-08-30 | — | 2026-08-30 |
| `PILOT7-LP` | 122 §8.2 | Pilot 7 = link_parcels (LINK, 2nd member) — ruled 2026-08-30, implementation not started | ⚠️ PARTIAL | pilot: pilot 7 (link_parcels) | — | 2026-08-30 |
| `VRD-SKIP` | 124 §2 Rule 10 | a SELF_SKIPPED terminal must not verdict identically to a genuine PASS | ✅ BUILT | wf: wf: WF3 VRD-SKIP, 2026-09-09 — .cursor/wf3_vrd_skip_active_task.md; fix site scripts/lib/step/index.js skipRecordsMeta (+ scripts/analysis/step-validate.mjs checkSelfSkipNeverPass/selfTest); see docs/reports/review_followups.md for the closed HIGH entry, the new HIGH sibling followup (buildSkipGateRecordsMeta, Ask B2), and the two filed MED followups (compute-trade-forecasts pass_or_warn residual; the pre-existing FreshnessTimeline SKIP mis-render) | — | 2026-09-09 |
| `CRASH-BEHAV` | 124 §2 Rule 12 | live SIGTERM-and-recover behavioural proof for LINK, LINK_KEYED, MATERIALIZE (and, in the abstract, INGEST/BACKFILL/RECORDER) | ⬜ NOT_STARTED | followup: docs/reports/review_followups.md — 'WF2 Rule 12 behavioural half — no db.test.ts can spawn a REAL converted step against the ephemeral test container' (HIGH, 2026-09-03): a scoped WF2/WF3 adds a genuine, reviewed test-context escape hatch to assertDbTarget, then un-skips step-crash-posture.db.test.ts and extends its pattern to link_massing (link) and link_parcels (link_keyed), parameterized rather than copy-pasted a third time | — | 2026-09-03 |
| `EP-PIN-PERF` | 122 (WF3 enrich_parcels double-run/lock-fix commit chain) | converted enrich_parcels per-pass timing within 25% of the legacy PRE goldens (KFM 7) | ✅ BUILT | pilot: pilot9_enrich_parcels | — | 2026-09-08 |
| `EP-PHASE-DEADLINE` | 124 §5 R-AJ | execution.phases[] timeout is a per-STATEMENT bound, not a phase bound; execution.step_timeout/budget/txn_budget had no executor at all | ✅ BUILT | wf: wf: EP-PHASE-DEADLINE (WF3, 2026-09-15) | — | 2026-09-15 |
| `EP-PASS3-BACKLOG` | 122 §3.0b | enrich_parcels_pass3_scope accretes a full ~443K-row cohort per killed run and nothing ever retires it | ✅ BUILT | wf: wf: EP-PASS3-BACKLOG (WF3, 2026-09-15) | — | 2026-09-15 |
| `RM-1` | 122 §10.3 | Conversion roadmap is generated + drift-guarded, never hand-maintained | ✅ BUILT | wf: wf: conversion-roadmap (this plan) | — | 2026-09-10 |
| `CLOUD-PRE` | 123 §6 | Pre-dispatch cloud-state checklist — table sizes, index presence, stranded running rows measured BEFORE a cutover attempt | ⬜ NOT_STARTED | wf: wf: unassigned | — | 2026-09-10 |
| `ACC-1` | 122 §7.2 | Acceptance is per-slug and row-derived, never a GitHub run tick | ⬜ NOT_STARTED | wf: wf: unassigned | — | 2026-09-10 |
| `LAND-1` | 124 §R-8 | Landing discipline declared: derived-artifact regen, EOL normalisation, exact-command cloud-write allow rules | ⬜ NOT_STARTED | wf: wf: unassigned | — | 2026-09-10 |
| `PH2-EXT` | 123 §2 | PH-2 churn×complexity population widened from 27 sources steps to all 65 chain slugs | ⬜ NOT_STARTED | wf: wf: unassigned | — | 2026-09-10 |
| `ARCH-CENSUS` | 122 §1.10 | Archetype declared for the 36 non-sources unconverted files (blocks any C6 ordering) | ⬜ NOT_STARTED | wf: wf: unassigned | — | 2026-09-10 |
| `CLAIMS-MTX` | 123 §5 | Claims × steps matrix generated (plan-claims.mjs emits the 44/5/6 split today, not a per-step × per-claim grid) | ⬜ NOT_STARTED | followup: review_followups.md (WF1 'conversion roadmap' filing, 2026-09-10) | — | 2026-09-10 |
| `POST-B1-1` | 124 R-AE / 122 §5 | on_check_error "fail_step" enforced fleet-wide | ✅ BUILT | followup: review_followups.md: commit-8 HIGH row (verdict.js checkRow downgrades to WARN) — CLOSED 2026-09-15 | — | 2026-09-15 |
| `POST-B1-2` | 124 R-AE / 02-web-admin | admin engine health reads the pipeline's declared write | ✅ BUILT | followup: review_followups.md:3544 family (HIGH admin duplicate compute) | — | 2026-09-15 |
| `POST-B1-3` | 49 §heartbeat / 124 R-AE | engine_health_snapshots trend reader or retirement | ⬜ NOT_STARTED | followup: review_followups.md:3544 (MED no trend reader) | — | 2026-09-14 |
| `POST-B1-4` | 40 lineage-docs generator (data-lineage-map.md) | lineage map free of the overlay-table artifact | ⬜ NOT_STARTED | followup: review_followups.md:3456 (MED lineage anomaly) | — | 2026-09-14 |
| `POST-B1-5` | 120 pre-commit hook (run-chain-step-timeout.logic.test.ts) | run-chain-step-timeout kill-race test sequenced, not sleep-timed | ✅ BUILT | followup: review_followups.md:3457 (MED hook flake) | — | 2026-09-14 |
| `POST-B1-6` | 123 §7 / step-validate | deviations[] printed in the scorecard | ⬜ NOT_STARTED | followup: review_followups.md: commit-8 MED row (deviations read by no tooling) | — | 2026-09-14 |
| `POST-B1-7` | 54–62 source specs / 122 §5 | generated enforcement note per source spec | ⬜ NOT_STARTED | followup: operator direction 2026-09-14 (registry review) | — | 2026-09-14 |
| `POST-B1-8` | 43 / 124 rule 3 | one shared download helper with retry as logic vars | ⬜ NOT_STARTED | followup: review_followups.md:415 (refuted disposition + operator ruling: ride the LOAD conversion) | — | 2026-09-14 |
| `POST-B1-9` | 122 §5.3 | single descriptorPathFor definition | ⬜ NOT_STARTED | followup: review_followups.md:3459 (LOW) | — | 2026-09-14 |
| `POST-B1-10` | 49 / descriptor interpretation | captured_at freshness semantics documented | ⬜ NOT_STARTED | followup: review_followups.md: commit-8 LOW row | — | 2026-09-14 |
| `POST-B1-11` | 76 funnel.ts observability model | funnel mutation bounds match the fleet | ✅ BUILT | followup: review_followups.md: commit-8 LOW row | — | 2026-09-15 |
| `POST-B1-12` | 123 §7 G0 / registry | Step Registry generated in-repo | ⬜ NOT_STARTED | followup: Step Registry artifact built 2026-09-14 from scratch scripts outside the repo | — | 2026-09-14 |
| `VEL-3` | 124 R-AI (proposed) | Capture pairs only where sharing.varies_by_chain says the chain matters | ✅ BUILT | wf: wf: conversion velocity (R-AI) | — | 2026-09-14 |
| `POST-B1-14` | 122 §1.8 | Concern index audited against the 20-category correction | ⬜ NOT_STARTED | followup: Spec 122 §1.8 unaudited flag (2026-09-09) | — | 2026-09-14 |
| `POST-B1-15` | 122 §5.2 | Source-text test debt retired: 53 files / 85 readFileSync(scripts/*.js) assertions → descriptor/behaviour assertions | ⬜ NOT_STARTED | wf: wf: source-text test debt (POST-B1-15) | — | 2026-09-14 |
| `SPECTBL-1` | 43 §2 / 42 §2 / 41 §2 | Chain-spec Step Breakdown tables reconciled to manifest.chains + drift-locked | ✅ BUILT | wf: wf: chain-spec step tables (SPECTBL-1) | — | 2026-09-15 |
| `SPECTBL-GEN` | 122 batch-2 amendment item 5 | Step Breakdown tables generated rather than hand-authored | ⬜ NOT_STARTED | followup: .cursor/batch2_c5_active_task.md §Proposed policy amendments item 5 (batch-2 row 0.8) | — | 2026-09-15 |

---

*Freeze-readiness (Spec 122 §8.2/§10.3): the template may honestly "freeze after the eighth" only when the batching_prereq set above is EMPTY. Currently **0** item(s) block it.*
