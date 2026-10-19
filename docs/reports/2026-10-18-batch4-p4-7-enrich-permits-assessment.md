# Phase 4 wave 4 — `enrich_permits` (scripts/enrich-permits.js, ENRICH_TARGET=permits) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** ENRICHER. It copies the dominant linked parcel's feed onto its own input table `permits` through `permit_parcels`: a temp-table materialize, a guarded set-based UPDATE and an orphan nullify. Always full (Spec 66 DEC-3).
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptors, the one shared compute module, the notes and the seeds migration. Commit ③ is the cutover. The ENRICHER archetype has more than two full-form members (geocode_permits, enrich_heritage, enrich_ravines, enrich_centreline, enrich_parcels), so compressed is the default (#24).
**Why it converts in wave 4:** `enrich_permits` is a permits-chain step, but its legacy file is the same module as the coa-chain `enrich_coa_zoning`. The operator approved (2026-10-18, wave-4 plan question 9) two thin step shells over ONE shared compute module, with `enrich_permits` converted in the same series so no second implementation lives on. Its twin's assessment is `docs/reports/2026-10-18-batch4-p4-3-enrich-coa-zoning-assessment.md`.
**Frozen legacy oracle (shared by both slugs):** `src/tests/steps/enrich_permits/fixtures/legacy-enrich-permits.js.txt`. It is byte-identical to `scripts/enrich-permits.js` at the ① freeze (sha256 `9e204a01c0acec5f…`): the last behaviour change was `173f0d1e`, plus the ① `main` export the identity-split shell needs (behaviour-neutral, two added lines in `module.exports`).
**Owner specs:** 66 (`66_enrich_permits.md`, the step contract; SPEC LINK `enrich-permits.js:7`) and 41 (`41_chain_permits.md`, the chain). Spec 78 §4D (`78_optimal_lot_configuration.md:351-376`) is the propagation contract for the optimal-config and cost columns; Spec 65 for the max-build, existing-structure and scenario columns.
**Target spec:** Spec 66 (`identity.spec` "66"). **Governing specs:** 122 (§8.1 ladder), 124 (R-BA, R-BZ, R-DF, R-DL), 122a §A27.
**Chain:** `permits`, position 10 of 32 (`manifest.json` chains.permits index 9, right after `link_parcels`).
**Plan:** `.cursor/v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2.3 (all 15 recommendations operator-APPROVED 2026-10-18).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Target selection:** `validateTarget(process.env.ENRICH_TARGET)` (`:601`); outside `permits|coa` it throws before the lock.
- **Advisory lock 66** (lock = spec number, `:14`, `:604`).
- **One `withTransaction`** (`:607`) holds the 12 preconditions (`:608-619`) and the enrich (`:620-621`):
  - `assertWf2Ran`, `assertRavinesEnriched`, `assertHeritageEnriched`: lineage counts on `parcels` (`:130-157`);
  - seven column-set probes over `information_schema.columns`, two tables each (heritage, centreline, max-build, existing-structure, scenario, optimal-config, cost; `:163-302`);
  - `assertCentrelineEnriched`: recency against `pipeline_runs` (`:308-317`) and coverage against `logic_variables.centreline_propagation_coverage_min` read **by SQL**, falling back to the literal **0.90** (`:320-321`, `:73`);
  - `assertLinkTable`: `information_schema.tables` then `.columns` for `permit_parcels` (`:338-356`).
- **The enrich (`enrichLeads`, `:483-516`):**
  1. `DROP TABLE IF EXISTS lead_zoning_enrich`, then `CREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP AS` the dominant-parcel CTE (`:488-489`, builder `:362-461`);
  2. a stats read off the temp table and a scope COUNT (`:491-497`);
  3. `UPDATE permits p SET <write cols> = e.<col>, zoning_enriched_at = $1 FROM lead_zoning_enrich e WHERE <key> AND (<every write col> IS DISTINCT FROM)` (`:500`, builder `:463-478`);
  4. the orphan nullify: NOT NULL booleans to false, the rest to NULL, `zoning_enriched_at = NULL`, where no `permit_parcels` link remains (`:506`, builder `:518-549`).
- **After commit, on the pool:** the coverage gate (`:624`), null rates (`:625`), the bylaw floors read **by SQL** with literal fallbacks (`:650`, `:556-566`), eight `COUNT(*) FILTER` observability scans of `permits` (`:657-770`) and the two permits-only disagreement counts (`:774-779`).

### 1.2 Columns written (`permits`)
`allWriteCols('permits')` (`:122-125`): the 5 zoning scalars; `applicable_bylaws` and `overlay_summary` (jsonb); `zoning_parcel_count`, `zoning_dominant_parcel_id`, `zoning_dominant_parcel_method`; ravine (2), heritage (3), centreline (4); `mb.LOT_MAXBUILD_COLS`; `mb.EXISTING_COLS`; `mb.SCENARIO_COLS`; `OPT_COMP_PROP_COLS` (13); `COST_PROP_COLS` (15); plus `zoning_enriched_at`.
- **The max-build propagation (kept exactly):** the lot inputs and envelope outputs come from the dominant parcel, and `max_build_confidence` degrades to `'low'` when `zoning_parcel_count > 1` (`:449-452`). These columns are enrich_parcels' outputs (`scripts/lib/max-build.js`; the converted V3 `enrich_parcels` writes them, `scripts/lib/compute/enrich-parcels.js:90`). Every consumer of the lead-level max-build columns (Spec 78 §4D, Spec 65) depends on this copy, so the column set, the dominant pick and the `'low'` degrade are pinned (L7, L10) and declared at ② (D3).

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 66 (the lock id), "Permit zoning enrichment", 56 rows (`:626-782`):
  - `permits_zoning_class_coverage_pct` (F-H12: PASS ≥ 80 + 3, WARN [80, 83), FAIL < 80; a zero denominator gives `permits_construction_count_zero`);
  - five INFO counts (enriched, no parcel link, unlink cleared, multi-parcel, heterogeneous);
  - three null-rate rows (fsi and coverage WARN above their floor, height INFO);
  - 43 INFO observability counts;
  - `permit_type_geometry_disagreement`, `permit_type_heritage_disagreement` (WARN when > 0);
  - `enrich_permits_duration_ms` (from `Date.now()`).
- **Verdict:** the row cascade (`verdictCascade`, `:579-582`).
- **Summary:** `records_total = scope`, `records_new = 0`, `records_updated = UPDATE rowCount` (`:784-797`). `records_meta` holds only the audit table.
- **emitMeta:** reads permits, permit_parcels, permit_type_classifications and parcels (the dominant feed); writes `permits` (every write column plus `zoning_enriched_at`) (`:799-815`).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-18)
- **`permits`:** 254,082 rows; 240,183 carry `zoning_enriched_at`. `permit_parcels` ≈ 245,429 rows.
- **Latest run** `permits:enrich_permits` 1570 (2026-07-17): scope 254,082, updated 40,725, 33.5 s, verdict PASS; coverage 84.1 % (PASS), no-link 13,899, multi-parcel 989, heterogeneous 503, fsi-null 83 % (floor 88), coverage-null 66.2 % (floor 72).
- **Seeded variables (live):** `centreline_propagation_coverage_min` 0.9; `permits_bylaw_max_fsi_null_warn_pct` 88; `permits_bylaw_max_coverage_null_warn_pct` 72 — equal to the literal fallbacks, so deleting the fallbacks changes nothing on this DB.
- **RLS:** `relrowsecurity = true` on `permits`, 0 policies. Trap 2 applies (`rls_bypass_or_policy`, R-CT).

### 1.5 Consumers
- **`permits` zoning / max-build / existing / scenario / opt / cost columns:** refresh_snapshot, compute_cost_estimates, the lead cost model and the app (`src`); `permits` has 29 readers and 13 writers in the effective ledger.
- **Effect of conversion:** a converted producer edge on `permits` for its converted readers' skip gate; it can only make them run more.

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:49`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:674`), `PIPELINE_TABLE_MAP` `enrich_permits → permits` (`funnel.ts:958`), manifest `telemetry_tables: ["permits"]`. Nothing is missing; ② re-checks against the descriptor's writes.

---

## 2. Behaviour ledger
The red suite pins L1–L16 (§10), executing the frozen text.

## 3. Registry target review
- **(a) Files at ②:** `scripts/enrich-permits.js` becomes a frozen `pipeline.step()` shell; `scripts/enrich-permits.descriptor.json`; the ONE shared compute module `scripts/lib/compute/enrich-lead-zoning.js` (also required by `scripts/enrich-coa-zoning.js`); `scripts/enrich-permits.notes.json`; seeds migration 273 (wave-4 lane B).
- **(b) Tables:** reads permits, permit_parcels, permit_type_classifications, parcels (98 columns); writes permits.
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/enrich_permits/violations.test.ts` (this commit). Swept at ②: `src/tests/db/enrich-permits*.db.test.ts` (4 files, which `require('../../../scripts/enrich-permits')` exports), `src/tests/contracts.infra.test.ts` (the F-H12 pins), `src/tests/control-panel.logic.test.ts`.

## 4. PH-3 — Intent ledger
| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Dominant parcel by area, then confidence, then id; full list as jsonb in a fixed order | `:385-389`, `:397-401` (`ae56cecf`, DEC-1) | preserved-in-compute (the CTE; why in notes.json) |
| Always full, never incremental | header `:5-6` (`ae56cecf`, DEC-3) | encoded-as-descriptor-field (`staleness.mode_select: "none"`, `scope: "full"`) |
| Idempotent writes | `:463-478` IS DISTINCT FROM (`ae56cecf`) | preserved-in-runner (`set_based_join_update` guard) |
| Clear a lead that lost all links | `:518-549` (DeepSeek CRIT, `ae56cecf`; NOT NULL booleans `27d96901`, `32d94fe4`, `2b7bd46b`, `094be867`, `5caefad0`) | preserved-in-runner (`set_based_null_retract`, with the boolean resets declared per column) |
| Refuse to propagate an unenriched feed | `:130-157`, `:304-332` (`ae56cecf`, `27d96901`, `32d94fe4`, `2b7bd46b`) | encoded-as-descriptor-field: producer pins / pre-compute checks (EPM-D3) |
| Fail fast on a missing migration | `:163-302` (`32d94fe4` … `8a3a3644`) | encoded-as-descriptor-field: `guards.requires` column kinds |
| Max-build propagation from the dominant parcel, `'low'` on assembly | `:449-452` (`094be867`; scenario `ac78a95d`; existing `b695d206`, `432c24e9`, `51e65a3a`; opt/comp `efe10876`; cost `8a3a3644`) | preserved-in-compute (the CTE column lists from `max-build.js`; why in notes.json) |
| A regression gate, not an aspirational target | `:20-21`, `:637` (`ae56cecf`, DEC-5) | encoded-as-descriptor-field: a FAIL check with `limit_from_config` (EPM-D2) |
| Structural null rates WARN, never FAIL | `:556-566`, `:651-655` (`173f0d1e`) | encoded-as-descriptor-field: WARN checks reading the seeded floors (EPM-D1) |
| Geometry stays authoritative; flag type disagreements | `:771-780` (`27d96901`, `32d94fe4`) | encoded-as-descriptor-field: WARN checks `viol == 0` (EPM-D9) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| argv/env seam | `ENRICH_TARGET` selects the target | `:601` | the descriptor identity (one descriptor per slug); the env retires |
| clock seam | `Date.now()` duration row | `:605`, `:782` | runner telemetry (G6) |
| clock seam | `getDbTimestamp(client)` RUN_AT | `:620` | runner run clock |
| db seam | advisory lock 66 | `:604` | `identity.lock` 66 (both slugs) |
| db seam | `withTransaction` around preconditions + enrich | `:607` | runner `txn_scope: "step"` |
| db seam | 12 precondition queries and throws | `:130-356` | `guards.requires` + producer pins (EPM-D3) |
| db seam | `logic_variables` reads by SQL | `:320`, `:561` | declared `config.logic_variables` (EPM-D1) |
| db seam | DROP + CREATE TEMP TABLE | `:488-489` | runner `temp_materialize` |
| db seam | guarded UPDATE; orphan nullify | `:500`, `:506` | runner `set_based_join_update` + `set_based_null_retract` (geocode_permits precedent) |
| db seam | 11 post-commit pool reads | `:624-779` | declared post-write counters and checks (EPM-D7) |
| network seam | none (no fetch) | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| A propagated max-build column is dropped or renamed in the descriptor | low | high: the lead-level max-build fields go stale for every consumer | D3 lock over `max-build.js` lists; L10 pins the legacy set |
| The shared module drifts between the two slugs | medium | medium | one module, two descriptors; each suite runs the same oracle |
| The 12 HALTs change meaning when they become guards | medium | medium: a run proceeds that used to HALT | each HALT is a named check/guard; the POST capture compares |
| Post-commit observation moves inside the runner and changes counts | low | low (INFO rows) | golden-neutral at P4, else `explained-diffs.json` |

## 6. PH-6 — Classification and defect ledger (rows EPM-D1…EPM-D9 in `docs/reports/defect-ledger.md`; prefix EPM because the initials `EP` collide with `enrich_parcels`, `DEFECT_PREFIX_OVERRIDES` entry landed here, fast invariant #42)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

- **EPM-D1** (`:73`, `:320-321`, `:556-566`): logic_variables read by SQL with fallbacks 0.90 / 88 / 72 / 97 / 66 — ② declared config, fallbacks deleted.
- **EPM-D2** (`:20-21`, `:637`): the copied FAIL 80 and the `+ 3` margin — ② variables (migration 273).
- **EPM-D3** (`:130-356`): preconditions as compute probes and throws — ② guards and pins.
- **EPM-D4** (`:601`): one file, two slugs — ① split, ② two descriptors over one module.
- **EPM-D5** (`:488-489`): compute DDL — ② `temp_materialize`.
- **EPM-D6** (`:605`, `:782`): `Date.now()` duration row — ② runner telemetry.
- **EPM-D7** (`:624-779`): eleven post-commit full scans — ② declared counters.
- **EPM-D8** (`:696`, `:400`): `> 1.00` and `round(…, 4)` — ② declared constants.
- **EPM-D9** (`:775`, `:778`): permit_type vocabulary — ② declared WARN checks.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (migration 273, byte-identical) |
|---|---|---|
| 80 (permits FAIL) | `:20` | `enrich_permits_zoning_coverage_fail_pct` |
| 80 (coa FAIL) | `:21` | `enrich_coa_zoning_zoning_coverage_fail_pct` (twin) |
| 3 (PASS margin) | `:637` | `enrich_permits_zoning_coverage_pass_margin_pct` / `enrich_coa_zoning_zoning_coverage_pass_margin_pct` |
| 0.90 | `:73` | deleted; `centreline_propagation_coverage_min` is already seeded (0.9) |
| 88 / 72 / 97 / 66 | `:558-559` | deleted; the four `*_bylaw_max_*_null_warn_pct` variables are already seeded |
| 66 | `:14` | `identity.lock` |
| 1.00 premium cut, 4-decimal round | `:696`, `:400` | category (D) constants in notes (EPM-D8) |
| `'RNFP'`, `'Heritage'`, `'construction'`, `'part_iv_individual'`, `'part_v_hcd'`, `'max_area'`, `'low'` | various | vocabulary constants, declared in notes |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | `logic_variables` `:320`, `:561`; `pipeline_runs` `:308-310` | declared config; producer pins |
| G3 catalog | `information_schema` ×16 `:169-348` | `guards.requires` |
| G4 DDL/txn | DROP/CREATE TEMP `:488-489`; withTransaction `:607`; lock `:604` | runner |
| G5 direct write | UPDATE ×2 `:500`, `:506` | runner write seam |
| G6 clock | `Date.now()` `:605`, `:782` | runner telemetry |
| G7 compute decides | 12 HALT throws; coverage cascade `:637`; floors `:651-652`; disagreement `:776`, `:779` | declared checks / guards |
| G9 module const | `PERMITS_COVERAGE_FAIL`, `COA_COVERAGE_FAIL`, `CENTRELINE_COVERAGE_MIN_DEFAULT`, `ADVISORY_LOCK_ID` | variables / identity |
| G0 closure | `scripts/lib/max-build.js`, `optimal-config-cols.js`, `parcel-cost-cols.js` (and `cost-model-shared.js` through max-build) | already in converted enrich_parcels' closure; no new finding expected (plan §B.2.3 note 4) |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE capture** on the legacy code before any compute change (trap 7): the `permits` chain invocation, night P3 under the DB lock (R-CQ).
- **Nonzero POST (#38):** night P4. The UPDATE is guarded, so a plain re-run writes ~0; a bracket NULLs `zoning_enriched_at` and one propagated column on a deterministic permit cohort (the guard heals it), recorded in `docs/reports/golden/enrich_permits/recapture.json`.
- **Expected differential:** none for the write set (the shared module reproduces the CTE). The `enrich_permits_duration_ms` row retires (declared diff, EPM-D6).

## 10. Red suite (PH-7) — `src/tests/steps/enrich_permits/violations.test.ts`
- **Size:** 24 tests. L1–L16 are GREEN today (the shared legacy oracle). D1–D8 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/enrich_permits/pre2-artifacts-missing.json`, a vitest JSON run with D1–D8 as plain it(). It recorded 16 pass and 8 fail. D1 and D3–D6 fail as an ENOENT on the named artifact (descriptor or the shared compute module); D2 fails because the shared module does not exist yet (existsSync false); D7 fails because this report has no generated scorecard yet; D8 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness (shared):** `src/tests/steps/enrich_permits/fixtures/legacy-harness.ts`. It fakes `./lib/pipeline`, `process.env` and `Date.now`; `./lib/max-build`, `./lib/optimal-config-cols` and `./lib/parcel-cost-cols` are the real modules.

| Pins | Behaviour |
|---|---|
| L1–L6 | lock 66 and the single transaction; the target whitelist; the WF2 / ravine / heritage HALTs; centreline recency; the SQL-read 0.90 fallback; the 16 catalog probes |
| L7–L10 | the temp-table materialize and dominant pick; the guarded UPDATE; the orphan nullify; the O-11 / §4D propagated column set |
| L11–L16 | the F-H12 cascade; the zero-denominator rows; the SQL-read 88 / 72 floors; the 56-row audit table; summary and emitMeta; the contended lock and the oracle identity |
| D1–D8 | descriptor and shell; one shared module; the propagated columns plus RLS guard; purity; variables; guards; scorecard; registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/enrich-permits.js` at stage `red_suite`; the census row is `ENRICHER / pending` (owner specs 66 + 41, and the two census fixtures); `DEFECT_PREFIX_OVERRIDES` gains `enrich_permits: 'EPM'` (lock updated); EPM-D1…EPM-D9; ADOPTION `legacy_oracle_excluded`; the identity split (`scripts/enrich-coa-zoning.js`, the manifest repoint, the `main` export); the roadmap regenerated.
- **R-DU:** no descriptor yet, so the row prints red and does not block.
- **Owed at ②:** the descriptor, the shared compute module, notes, migration 273, the scorecard (D7 flips). Spec 66 DEC-2 ("one script, two chain modes") is amended in the ② commit's spec-diff.

## 12. Operator decisions — RULED 2026-10-18
1. **Identity split (question 9, y).** Two thin step shells over ONE shared compute module; `enrich_permits` converts in the same series. Drafted ruling text, "operator approved 2026-10-18, id at integration": *a legacy file that serves N slugs through an env selector is split at ① into N files (one pass-through shell per extra slug, the manifest repointed) so each slug carries its own descriptor, converted.json entry and census row; at ② each shell becomes `pipeline.step(descriptor, sharedCompute)` and the env selector retires.* The ① split is behaviour-neutral (the shell runs the same `main()` under the same run name with the same env).
2. **Keep the max-build propagation exactly** (operator brief 2026-10-18): the lead-level max-build columns, the dominant pick and the `'low'` degrade are pinned and declared; no change rides this conversion.

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ENRICHER descriptor + shell (D1) | Spec 122 §8.1; R-BA | geocode_permits | gates A–K | this report | archetype | red-first | precedent | — |
| one shared module, two descriptors (D2, EPM-D4) | §12 ruling 1 | — (first two-slug split; enrich-web-search is the next) | D2 lock | §12 | every multi-slug file | measured: 2 files with 2 slugs | one module | — |
| O-11 / §4D columns declared (D3) | Rule 1 | enrich_parcels writes | D3 lock | §12 ruling 2 | — | pinned L10 | data only | — |
| purity (D4) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | — |
| variables, fallbacks deleted (D5) | Rule 3; R-CV; R-DF | migration form | gate E; gate A | migration 273 | — | byte-identical | yes | **yes** |
| guards for preconditions (D6) | R-CB; R-CX | guards.requires | #46 | EPM-D3 | fleet | pinned L3-L6 | declared | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Two shells over one module and the shape gate.** No converted step yet shares a compute module between two shells; `check-step-shape.mjs` and gate E's G0 closure are expected to accept it (each shell requires one module), but that is verified only at ②.
- **The HALTs as guards.** The centreline coverage HALT is a ratio over `parcels`, not a presence probe; it may need a pre-compute check rather than `guards.requires`. Decided at ② from the R-CB pin vocabulary.
### RECURRING / STANDARD-SHAPING
- `scripts/enrich-web-search.js` has the same one-file-two-slugs shape; the §12 ruling 1 form applies to it unchanged.

## A. Measurement log (2026-10-18)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` session): `permits` counts; `pg_stat_user_tables` for the link tables; `pipeline_runs` 1570 audit rows; the five seeded variables; `pg_class` RLS and `pg_policies`.
- **A.F-CODE:** `scripts/enrich-permits.js` sha256 `9e204a01c0acec5f…` (836 lines with the ① export); `scripts/lib/max-build.js`; Spec 66 DEC-1…DEC-5; Spec 78 §4D.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/enrich_permits/violations.test.ts`: 24 / 24. The red-evidence run gave 16 pass / 8 fail.
