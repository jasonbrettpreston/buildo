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
- **(a) Files:** `scripts/enrich-coa-zoning.js` (① pass-through) becomes the frozen `pipeline.step()` shell at ②, requiring the shared `scripts/lib/compute/enrich-lead-zoning.js`; `scripts/enrich-coa-zoning.descriptor.json`; `scripts/enrich-coa-zoning.notes.json`; migration 273 carries this slug's variables too.
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
