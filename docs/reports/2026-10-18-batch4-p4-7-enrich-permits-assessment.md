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
- **(a) Files at ②:** `scripts/enrich-permits.js` becomes a frozen `pipeline.step()` shell; `scripts/enrich-permits.descriptor.json`; the ONE shared compute module `scripts/lib/enrich-lead-zoning.js` (also required by `scripts/enrich-coa-zoning.js`); `scripts/enrich-permits.notes.json`; seeds migration 273 (wave-4 lane B).
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

## 14. Commit ② — compute_ported (2026-10-18)
**Landed:** `scripts/enrich-permits.descriptor.json`, `scripts/enrich-permits.notes.json`, the ONE shared compute module `scripts/lib/enrich-lead-zoning.js` and the one-line per-slug entry `scripts/lib/compute/enrich-permits.js` (the tooling resolves a step's compute by its shell's basename, `capture-step-golden.js` computePathFor, so each slug keeps a basename entry that only binds the target), migration `273_enrich_lead_zoning_logic_variables.sql` (lane B owns 272–273; 273 is used here, 272 by link_coa_to_parcels), the seeds/groups/docs for the new variables, and the stage flip `red_suite → compute_ported`. The legacy shell stays live until ③, so the night-P3 PRE capture still runs the legacy code (trap 7).
**Where the shared module lives.** `scripts/lib/enrich-lead-zoning.js`, a compute CLOSURE module, not `scripts/lib/compute/`: step-conformance §5.5 pairs every compute entry to a manifest step file by basename (33 modules, 32 paired, when it sat in `scripts/lib/compute/`), and `capture-step-golden.js` resolves a step's compute by its shell's basename. Gate E scans it as closure (G0, G1–G4, and G2 against its exported `DECLARED`); G5/G7/G8 judge compute entries only, so the move is recorded as a drafted deviation (ruling 4 below). The per-slug entries carry nothing but the target binding.
**What moved, and how (R-BZ, gate E #32 = 0 findings for the module):**
| Legacy form | `file:line` | ② form |
|---|---|---|
| `DROP` + `CREATE TEMP TABLE` | `:488-489` | `ctx.tempTable` (G4) |
| guarded UPDATE | `:500` | `ctx.joinUpdate(0, …)`, the SQL byte-identical (lock D6b) |
| orphan nullify | `:506`, builder `:518-549` | `ctx.retract(1, [])` — `set_based_null_retract` with declared `set_value` (false for the 8 NOT NULL booleans, NULL otherwise), scope `NOT EXISTS (… permit_parcels …)`, guard `zoning_enriched_at IS DISTINCT FROM NULL`; generated before image (R-M) |
| 16 `information_schema` probes | `:163-356` | `database.min_migration: 204` (the migration count through 207) — **drafted deviation** |
| `logic_variables` SQL reads + fallbacks | `:320-321`, `:556-566` | declared `config.logic_variables`, no fallback (EPM-D1 closed at ②) |
| `pipeline_runs` recency read | `:308-317` | `contract_read` hook `readFeedContract` through `hookCtx.producer` (G1); it returns the stamps and never throws (G8); the pass compares and HALTs with the legacy message — **drafted deviation** |
| WF2 / ravine / heritage / centreline-coverage HALTs | `:130-157`, `:318-332` | kept as named HALTs inside the enrich pass (the enrich_centreline `assertCentrelineNonEmpty` precedent; terminal `failed_missing_precondition`); the centreline floor is compared in SQL against the bound variable; the four lineage stamps are declared `staleness.pins` (watermark form) so #44 (e)/(h) see the producer edges |
| audit table (56 rows) | `:626-782` | 57 declared checks in the legacy order; the zero-denominator row now always renders (**drafted deviation**); the duration row is runner-measured (EPM-D6 closed at ②, the row is kept) |
| 80 / +3 | `:20-21`, `:637` | `enrich_permits_zoning_coverage_fail_pct` 80 (warn_limit) and `enrich_permits_zoning_coverage_pass_min_pct` 83 (limit), severity FAIL (EPM-D2 closed at ②) |
| post-commit observation reads | `:624-779` | the `post_phase` hook `computePostPhase`, on the pool after commit (same position) |

**Step-owned names (R-DE (v)).** The three seeded variables the legacy read (`centreline_propagation_coverage_min`, `permits_bylaw_max_*_null_warn_pct`) are not `enrich_permits_*` and are not grandfathered, so migration 273 COPIES them (value-preserving, reading the live row) to `enrich_permits_centreline_coverage_min`, `enrich_permits_bylaw_max_fsi_null_warn_pct`, `enrich_permits_bylaw_max_coverage_null_warn_pct`. The legacy keys stay until ③, because the legacy shell still reads them by SQL; the ③ migration deletes them.
**Drafted rulings (operator approved 2026-10-18 for the split itself; these four are lane-B drafts, "id at integration"):**
1. *Catalog probes → migration floor.* A step's "the migration that added my columns has run" probes are declared as `database.min_migration` (the runner's `assertDbTarget` floor), never `information_schema` reads in compute.
2. *Run-ledger stamps for a compute-side precondition* are read by the `contract_read` hook through `hookCtx.producer` and RETURNED; the pass decides. (G1 and G8 both stay 0.)
3. *A declared check always renders a row*, so a legacy row that appeared only on one branch becomes an always-present row with the branch value (here `permits_construction_count_zero` false/true) — a declared deviation, not a new rule.
4. *A shared compute module of N slugs lives in `scripts/lib/` with an exported `DECLARED` set*, the N per-slug entries in `scripts/lib/compute/` bind the target only; the gate-E G5/G7/G8 coverage of the shared body is owed by a closure-scan widening (PIN, owner: the runner/gate lane).
**Admin (#51, R-DL):** unchanged and complete — `PIPELINE_REGISTRY`, `STEP_DESCRIPTIONS`, `PIPELINE_TABLE_MAP enrich_permits → permits`, `telemetry_tables ["permits"]` ⊇ the descriptor's writes (`admin-step-registration.logic` reads the descriptor now that it exists).
**step-validate at ②:** hard-stop false; the stage hides G8, #30, #38, #40 (all capture-derived), so `standard` prints V2 by R-DT until the night-P4 POST capture lands.
**Owed at ③:** the frozen `pipeline.step()` shell (D8), `contracts.infra.test.ts` re-pointed from `PERMITS_COVERAGE_FAIL` to the variable, Spec 66 DEC-2 amended, the five legacy variable keys deleted, converted[] (D9).

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=enrich_permits --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=26 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=10 vocab-hit rows=10; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 9 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=3 it-count=28 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 — stage-gated (compute_ported) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=3 lock-it-count=28 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | enrich_permits | PASS | min_migration=204 <= migrations count=282 |
| 2 | enrich_permits | PASS | 5 declared, missing from seeds: none |
| 3 | enrich_permits | PASS | retired=0 overlap-with-declared=none |
| 7 | enrich_permits | PASS | SPEC LINK header present=true |
| 8 | enrich_permits | PASS | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | enrich_permits | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | enrich_permits | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
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
- missing invocations (POST): permits::, none::
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

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
| 3 | Tunables externalized | enforced-green | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=114291B notes=7844B checks=57 rows records_meta=(no capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1

