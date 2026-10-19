# Phase 4 wave 4 — `enrich_coa_zoning` (scripts/enrich-coa-zoning.js → scripts/enrich-permits.js, ENRICH_TARGET=coa) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF): zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** ENRICHER. The coa target of the shared enrich module: it copies the dominant linked parcel's feed onto `coa_applications` through `lead_parcels`, joined on the stored `coa.lead_id` (Spec 66 DEC-4). The same temp-table materialize, guarded set-based UPDATE and orphan nullify as `enrich_permits`. Always full (DEC-3).
**Commit form: compressed (R-PACE-1)**. Commit ① is this report, the red suite and the identity split. Commit ② adds the descriptor over the one shared compute module, the notes and the seeds migration. Commit ③ is the cutover. ENRICHER has more than two full-form members, so compressed is the default (#24).
**Identity split (landed at ①, operator-approved 2026-10-18, wave-4 plan question 9):** this slug now has its own file, `scripts/enrich-coa-zoning.js`, a legacy pass-through that forces `ENRICH_TARGET=coa` and runs `scripts/enrich-permits.js`'s own `main()` under the same `pipeline.run('enrich-permits', …)` name. `manifest.scripts.enrich_coa_zoning.file` now names it; the manifest env is unchanged. Behaviour is byte-identical to `ENRICH_TARGET=coa node scripts/enrich-permits.js`.
**Frozen legacy oracle (shared):** `src/tests/steps/enrich_permits/fixtures/legacy-enrich-permits.js.txt` (the module, sha256 `9e204a01c0acec5f…`, last behaviour change `173f0d1e`) and `src/tests/steps/enrich_permits/fixtures/legacy-enrich-coa-zoning.js.txt` (the ① split shell). The twin assessment, which carries the module-level detail, is `docs/reports/2026-10-18-batch4-p4-7-enrich-permits-assessment.md`.
**Owner specs:** 66 (`66_enrich_permits.md`) and 42 (`42_chain_coa.md` §6.5 step 9b, the step table row 5). Spec 78 §4D and Spec 65 govern the propagated columns.
**Target spec:** Spec 66 (`identity.spec` "66"). **Governing specs:** 122 (§8.1), 124 (R-BA, R-BZ, R-DF, R-DL), 122a §A27.
**Chain:** `coa`, position 5 of 16 (right after `link_coa_to_parcels`; the order is load-bearing, Spec 42 §6.5 step 9b).
**Plan:** `.cursor/v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2.3.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions (coa target)
- **Lock 66**, shared with `enrich_permits` (the two chains run apart and are chain-locked, Spec 66 DEC-2).
- **One transaction** holds the 12 preconditions (the same lineage, catalog and centreline checks as permits; the link-table guard checks `lead_parcels(lead_id, parcel_id)`, `enrich-permits.js:338-356`) and the enrich.
- **Materialize:** `CREATE TEMP TABLE lead_zoning_enrich` over `coa_applications c JOIN lead_parcels lp ON lp.lead_id = c.lead_id JOIN parcels par` (CFG.coa `:97-112`), partitioned by `c.id`, building `variance_context` (`base` scalars plus the per-parcel list) instead of the permits `applicable_bylaws` / `overlay_summary`.
- **UPDATE** `coa_applications c … WHERE c.id = e.id AND (<every write col> IS DISTINCT FROM)`, `zoning_enriched_at = RUN_AT` (`:463-478`, `:500`).
- **Orphan nullify** where no `lead_parcels` row has the CoA's `lead_id` (`:518-549`, `:506`).
- **After commit:** the coa coverage gate over **every** CoA (`:595-597`), null rates, the coa bylaw floors read by SQL (fallbacks 97 / 66, `:559`), the eight observability scans. No permits-only disagreement rows.

### 1.2 Columns written (`coa_applications`)
`allWriteCols('coa')`: the same set as permits except the jsonb column (`variance_context` in place of `applicable_bylaws` + `overlay_summary`), plus `zoning_enriched_at`. The propagated max-build, existing-structure, scenario, optimal-config and cost columns are identical to the permits set (pinned L5): the coa leads carry the same enrich_parcels max-build feed, and that copy is kept exactly.

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 66, "CoA zoning enrichment", 54 rows: `coa_zoning_class_coverage_pct` (PASS ≥ 83, WARN [80, 83), FAIL < 80; zero rows give `coa_row_count_zero`), five INFO counts, three null-rate rows (floors 97 / 66), 43 INFO counts, `enrich_coa_zoning_duration_ms`.
- **Verdict:** the row cascade. **Summary:** `records_total = scope`, `records_new = 0`, `records_updated = UPDATE rowCount`.
- **emitMeta:** reads `coa_applications(id, lead_id)`, `lead_parcels(lead_id, parcel_id, confidence)` and parcels; writes `coa_applications`.

### 1.4 Live facts (A.F-DB, read-only, 2026-10-18)
- **`coa_applications`:** 33,949 rows; 29,694 carry `zoning_enriched_at`.
- **Latest run** `coa:enrich_coa_zoning` 1548 (2026-07-17): scope 33,400, updated 59, 28.3 s, PASS; coverage 86.5 %, no parcel link 3,706, multi-parcel 0, fsi-null 93.9 % (floor 97), coverage-null 59.6 % (floor 66).
- **Seeded:** `coa_bylaw_max_fsi_null_warn_pct` 97, `coa_bylaw_max_coverage_null_warn_pct` 66, `centreline_propagation_coverage_min` 0.9 — equal to the literal fallbacks.
- **RLS:** `relrowsecurity = true` on `coa_applications`, 0 policies (trap 2, R-CT).
- **Upstream:** `lead_parcels` holds 29,627 `coa:` rows (one per lead) from link_coa_to_parcels, whose ruled re-check (LCTP-D3) will change some of them (ECZ-D4).

### 1.5 Consumers
- **`coa_applications` zoning / max-build columns:** classify_coa_scope, compute_coa_cost_estimates (`variance_context`, the max-build fields), refresh_snapshot and the app. `coa_applications` has 19 readers and 8 writers.
- **Effect of conversion:** a converted producer edge on `coa_applications`, feeding converted readers' skip gates (P4 replays them).

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:50`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:675`), `PIPELINE_TABLE_MAP` `enrich_coa_zoning → coa_applications` (`funnel.ts:958`), manifest `telemetry_tables: ["coa_applications"]`. Complete; ② re-checks it against the descriptor.

---

## 2. Behaviour ledger
L1–L10 (§10) pin the coa target; the module behaviour shared with permits is pinned once, in the twin suite (L1–L16 there), on the same oracle.

## 3. Registry target review
- **(a) Files:** `scripts/enrich-coa-zoning.js` (① pass-through) becomes the frozen `pipeline.step()` shell at ②, requiring the shared `scripts/lib/enrich-lead-zoning.js`; `scripts/enrich-coa-zoning.descriptor.json`; `scripts/enrich-coa-zoning.notes.json`; migration 273 carries this slug's variables too.
- **(b) Tables:** reads coa_applications, lead_parcels, parcels; writes coa_applications.
- **(c) Consumers:** §1.5. **(d) Tests:** `src/tests/steps/enrich_coa_zoning/violations.test.ts` (this commit), plus the shared `src/tests/db/enrich-permits*.db.test.ts` swept at ②.

## 4. PH-3 — Intent ledger
| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Join the CoA on the stored lead key | CFG.coa `:103` (`ae56cecf`, DEC-4) | preserved-in-compute (the coa CFG of the shared module; why in notes.json) |
| A variance context for the CoA (base + parcels) | CFG.coa `:106-110` (`ae56cecf`) | preserved-in-compute (the coa jsonb builder; why in notes.json) |
| Coverage over every CoA (no construction filter) | `:595-597` (`ae56cecf`, DEC-5; row honesty `173f0d1e`) | encoded-as-descriptor-field: a FAIL check with `limit_from_config` (ECZ-D2) |
| Structural null floors per target | `:559` (`173f0d1e`) | encoded-as-descriptor-field: WARN checks reading the seeded coa floors (ECZ-D3) |
| One file, two slugs | `:601` (`ae56cecf`, DEC-2) | knowingly-retired: the ① split and ② descriptor identity (ECZ-D1; amends Spec 66 DEC-2) |
| Max-build feed onto the CoA, `'low'` on assembly | `:449-452` (`094be867`, `ac78a95d`, `b695d206`, `efe10876`, `8a3a3644`) | preserved-in-compute (shared column lists; why in notes.json) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| argv/env seam | `ENRICH_TARGET=coa` (manifest env; the ① shell forces it) | `enrich-coa-zoning.js`; `enrich-permits.js:601` | the descriptor identity; the env retires (ECZ-D1) |
| clock seam | `Date.now()` duration; `getDbTimestamp` RUN_AT | `:605`, `:782`; `:620` | runner telemetry; runner run clock |
| db seam | lock 66, the one transaction, preconditions, `logic_variables` SQL, temp DDL, UPDATE, nullify, post-commit reads | as the twin §5 | as the twin §5 (guards, config, `temp_materialize`, `set_based_join_update`, `set_based_null_retract`, declared counters) |
| network seam | none | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| The P4 re-check of link_coa_to_parcels changes lead_parcels before this step's POST | certain | medium: coa re-enrich / orphan counts move | run P4 in chain order; ECZ-D4 explained diff |
| The coa jsonb shape (`variance_context`) drifts in the shared module | low | medium (compute_coa_cost_estimates reads it) | L3 pin; the POST golden |
| The split shell's env force differs from the manifest env | none today (both `coa`) | low | L1 pin; ② retires both |

## 6. PH-6 — Classification and defect ledger (rows ECZ-D1…ECZ-D5 in `docs/reports/defect-ledger.md`; prefix ECZ from the initials convention, no collision, fast invariant #42; the module-level rows are EPM-D1…EPM-D9 on the twin)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

- **ECZ-D1:** the ① split keeps the env selector — ② descriptor identity.
- **ECZ-D2** (`:21`, `:637`): the coa FAIL 80 and `+ 3` — ② `enrich_coa_zoning_*` variables (migration 273).
- **ECZ-D3** (`:559`): the 97 / 66 fallbacks — ② deleted.
- **ECZ-D4** (CFG.coa): the feed follows a lead_parcels set the ruled re-check will change — P4 explained diff.
- **ECZ-D5** (`:605`, `:782`): the duration row — ② runner telemetry.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (migration 273, byte-identical) |
|---|---|---|
| 80 (coa FAIL) | `:21` | `enrich_coa_zoning_zoning_coverage_fail_pct` |
| 3 (PASS margin) | `:637` | `enrich_coa_zoning_zoning_coverage_pass_margin_pct` |
| 97 / 66 | `:559` | deleted (already seeded) |
| 0.90 | `:73` | deleted (already seeded) |
| 66 | `:14` | `identity.lock` |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
The coa target runs the same module, so its purity rows are the twin's §8 (G1 config SQL, G3 catalog probes, G4 temp DDL, G5 writes, G6 clock, G7 HALTs and cascades, G9 module constants), all removed by the one shared compute module. **Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE capture** on the legacy code (trap 7): the `coa` chain invocation, night P3, **after** link_coa_to_parcels' PRE (chain order). The PRE runs through the ① split shell, which is behaviour-identical to the old manifest entry.
- **Nonzero POST (#38):** night P4, after link_coa_to_parcels' POST. A bracket NULLs `zoning_enriched_at` and one propagated column on a deterministic CoA cohort; recorded in `docs/reports/golden/enrich_coa_zoning/recapture.json`.
- **Expected differential:** the duration row retires (ECZ-D5); any re-enrich caused by link_coa_to_parcels' re-check is ECZ-D4.

## 10. Red suite (PH-7) — `src/tests/steps/enrich_coa_zoning/violations.test.ts`
- **Size:** 17 tests. L1–L10 are GREEN today. D1–D7 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/enrich_coa_zoning/pre2-artifacts-missing.json`, a vitest JSON run with D1–D7 as plain it(). It recorded 10 pass and 7 fail. D1–D3 fail as an ENOENT on the descriptor or the shared compute module; D4 fails because the seeds hold no enrich_coa_zoning_* variable; D5 fails because the manifest still passes ENRICH_TARGET; D6 fails because this report has no generated scorecard yet; D7 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness:** the shared `src/tests/steps/enrich_permits/fixtures/legacy-harness.ts`.

| Pins | Behaviour |
|---|---|
| L1 | the identity split: manifest file, the pass-through shell text, the unchanged env |
| L2–L5 | lock 66 and the lead_parcels link guard; the stored-key join and `variance_context`; the coa UPDATE / nullify keys; the propagated columns equal the permits set except the jsonb column |
| L6–L10 | the coa coverage gate over every CoA; the 97 / 66 floors; the 54-row audit table; summary and emitMeta; the shared preconditions |
| D1–D7 | descriptor and shell over the shared module; propagated columns plus RLS guard; purity; variables; the env retires; scorecard; registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `scripts/enrich-coa-zoning.js` (pass-through) and `manifest.scripts.enrich_coa_zoning.file` repointed; `converted.json` `pending[]` holds `scripts/enrich-coa-zoning.js` at stage `red_suite`; the census row is `ENRICHER / pending` with `file: scripts/enrich-coa-zoning.js` (owner specs 66 + 42, and the two census fixtures); ECZ-D1…ECZ-D5; ADOPTION `legacy_oracle_excluded`; the roadmap regenerated.
- **R-DU:** no descriptor yet, so the row prints red and does not block.
- **Owed at ②:** the descriptor over the shared module, notes, migration 273, the scorecard (D6 flips).

## 12. Operator decisions — RULED 2026-10-18
1. **Identity split** (question 9, y): see the twin §12 ruling 1 (drafted text, "operator approved 2026-10-18, id at integration").
2. **Keep the max-build propagation exactly** onto `coa_applications` (operator brief 2026-10-18).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| own file + descriptor (L1, D1) | twin §12 ruling 1 | geocode_permits shell | D1 lock; R-DL lock | §12 | multi-slug files | pinned L1 | one shell | — |
| propagated columns declared (D2) | Rule 1 | enrich_parcels writes | D2 lock | §12 ruling 2 | — | pinned L5 | data only | — |
| purity (D3) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | shared module | — |
| variables, fallbacks deleted (D4) | Rule 3; R-CV; R-DF | migration form | gate E; gate A | migration 273 | — | byte-identical | yes | **yes** |
| env retires (D5) | Rule 1 | descriptor identity | D5 lock | ECZ-D1 | multi-slug files | pinned L1 | removes code | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Shared module, two descriptors.** The first converted pair to share a compute module; verified against the shape gate and gate E at ② (twin §R).
### RECURRING / STANDARD-SHAPING
- Chain order matters for captures: this step's PRE and POST follow link_coa_to_parcels' on the same night, or its golden records a lead_parcels state the chain never produces.

## A. Measurement log (2026-10-18)
- **A.F-DB** (read-only): `coa_applications` counts; `pipeline_runs` 1548 audit rows; the coa seeded variables; RLS flags.
- **A.F-CODE:** `scripts/enrich-permits.js` sha256 `9e204a01c0acec5f…`; `scripts/enrich-coa-zoning.js` (① split shell).
- **A.F-ORACLE:** `npx vitest run src/tests/steps/enrich_coa_zoning/violations.test.ts`: 17 / 17. The red-evidence run gave 10 pass / 7 fail.

## 14. Commit ② — compute_ported (2026-10-18)
**Landed:** `scripts/enrich-coa-zoning.descriptor.json`, `scripts/enrich-coa-zoning.notes.json`, the one-line entry `scripts/lib/compute/enrich-coa-zoning.js` over the ONE shared module `scripts/lib/enrich-lead-zoning.js` (the twin report §14 carries the module-level table), this slug's half of migration 273, and the stage flip `red_suite → compute_ported`. The ① pass-through shell stays live until ③.
**Coa-specific forms:** writes[0] declares the shared propagated columns with `variance_context` as the coa jsonb; writes[1] (the orphan nullify) scopes `NOT EXISTS (SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = coa_applications.lead_id)`; 55 declared checks in the legacy order (the zero-denominator row `coa_row_count_zero` now always renders — drafted deviation); reads.steps is `link_coa_to_parcels` plus the four pinned lineage producers (#44 (e): `coa` derives no producer edge because this step reads only `id`/`lead_id` and its own columns from `coa_applications`).
**Variables (migration 273):** `enrich_coa_zoning_zoning_coverage_fail_pct` 80, `enrich_coa_zoning_zoning_coverage_pass_min_pct` 83, and the value-preserving copies `enrich_coa_zoning_bylaw_max_fsi_null_warn_pct` (97), `enrich_coa_zoning_bylaw_max_coverage_null_warn_pct` (66), `enrich_coa_zoning_centreline_coverage_min` (0.9). ECZ-D2 and ECZ-D3 close at ②; ECZ-D5 (duration) closes as runner-measured.
**Drafted rulings:** the twin report §14 (catalog probes → `database.min_migration`; run-ledger stamps through the `contract_read` hook; an always-present check row; the shared module in `scripts/lib/`).
**Admin (#51, R-DL):** complete, unchanged (`PIPELINE_TABLE_MAP enrich_coa_zoning → coa_applications`).
**step-validate at ②:** hard-stop false; G8, #30, #38, #40 stage-gated, so `standard` prints V2 until the P4 POST.
**Owed at ③:** the frozen shell (D7), the manifest `ENRICH_TARGET` env removed (D5, ECZ-D1), converted[] (D8).

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=enrich_coa_zoning --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 13/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=11 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 1 | 2 | table rows=7 vocab-hit rows=6 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 5 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=3 it-count=20 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 — stage-gated (compute_ported) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=3 lock-it-count=20 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | enrich_coa_zoning | PASS | min_migration=204 <= migrations count=269 |
| 2 | enrich_coa_zoning | PASS | 5 declared, missing from seeds: none |
| 3 | enrich_coa_zoning | PASS | retired=0 overlap-with-declared=none |
| 7 | enrich_coa_zoning | PASS | SPEC LINK header present=true |
| 8 | enrich_coa_zoning | PASS | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | enrich_coa_zoning | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | enrich_coa_zoning | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 4 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 4 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 495 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
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
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (8 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 28 take effect at cutover, 9 not read; admin badges current |

### Captures (item iv)
- missing invocations (POST): coa::, none::
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=112448B notes=7903B checks=55 rows records_meta=(no capture) |

**Enforced-green: 11/14** · not-run: 1 · vacuous: 1

