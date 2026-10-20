# Active Task: batch-2 row 3.4 — `load_heritage` conversion (INGESTOR, compressed ①②③, TWO primaries → TWO targets)
**Status:** Authorized 2026-09-27 (operator "y", all 11 recommendations accepted incl. ci_green_for_sha)
**Workflow:** WF2 (step conversion — Spec 122 architecture · 123 procedure · 124 policy; **Spec 121 §4.3 governs method**: zero behaviour change, pin-don't-fix).
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1) for descriptor/compute/notes/seeds/test/prose briefs (<5 KB writes, `write_scope`); **claude** for every verification seat, golden capture, `registry_reserved` edit and G8 landing (downgrade reason: verification seats + live DB + registry, Spec 08 §B/§C). Plan draft: engine run `20260928T003944Z-af286e6c` (skeleton; every claim below re-grounded by the orchestrator — draft errors corrected: 0p/0q/0r are already LANDED, not prerequisites; legacy has one txn PER dataset, not one shared txn; "UNKNOWN jurisdiction" is centreline, not heritage; HR-D2's real form is below).
**Uses (never re-describes) the conversion-simplification WF** `.cursor/wf2_conversion_simplification_active_task.md` items 1 (gates from ①), 2 (capture last), 3 (one resolver), 4 (`npm run cutover`), 5 (hook tests the index), 6 (brief gate-answers field), 7 (two-run zero-writes proof), 8 (row conservation), 9 (`code_sha`). **This plan starts only after that WF lands** (see §10).
**Layout (Spec 122 §4.1):** `scripts/load-heritage.js` (frozen `pipeline.step()` shell, path unchanged) + sibling `.descriptor.json`/`.notes.json` + `scripts/lib/compute/load-heritage.js`.

## Context
* **Goal:** convert the 808-line legacy loader [READ scripts/load-heritage.js, full] to the standard step with ZERO behaviour change; every divergence is closed by the ONE shared library rung 0x (§4), pinned as `HR-D<n>`, or a declared deviation with precedent.
* **Target Spec:** `docs/specs/01-pipeline/61_source_heritage_properties.md` (source owner; §3, §9 frozen contract, §12.3a) + `43_chain_sources.md` (chain owner, row 7 [READ 43:38], §5 Target [READ 43:277]). System map rows 43/61 are the INDEX of those Target lists [READ 00_system_map.md:43,:61].
* **Key Files:** `scripts/load-heritage.js` → shell; new descriptor/notes/compute; `src/tests/steps/load_heritage/violations.test.ts` (new); re-pointed in place: `src/tests/load-heritage.{logic,infra}.test.ts`, `src/tests/source-version.logic.test.ts`.
* **Database Impact:** NO schema change. `heritage_properties` 8,824 rows (part_iv 1,557 / part_v_member 7,267, all `ST_Point`), `heritage_districts` 29 rows (all `designated_district`, all `ST_MultiPolygon`) [MEASURED `SELECT status,COUNT(*) … GROUP BY 1`; `ST_GeometryType` group-by, 2026-09-27].
* **Archetype / write class:** INGESTOR (census row [READ step-archetype-census.json:324-328], R-AO re-derived: two external acquisitions → one write target EACH). Both targets class **B** (`guarded_upsert` + declared departure delete): upsert `ON CONFLICT (source_id) … WHERE IS DISTINCT FROM` [READ :404-416, :440-451] + `DELETE … WHERE source_id <> ALL($1::BIGINT[])` behind the F-C1 empty guard [READ :594-606]; schema census note already says "A -> B" for this file [READ step.schema.json:104].

## 1. Target file review (operator ruling: the step's OWN registry, four closed sections)
Reproducible greps (run 2026-09-27, all hits read):
```
git grep -l -E "heritage_properties|heritage_districts" -- scripts src ':!src/tests'
git grep -l "heritage_load" -- scripts src ':!src/tests'
git grep -l -E "load_heritage|load-heritage" -- scripts src ':!src/tests'
git grep -l -E "heritage_properties|heritage_districts|heritage_load|load_heritage|load-heritage" -- src/tests
git grep -l -E "heritage_properties|heritage_districts" -- migrations
grep -n heritage scripts/steps/_schema/consumer-registry.json
```
"Read" = **full** (whole file) or **hits** (every grep-hit line with context). Spec column = the owning spec edited in the SAME commit as the touch.

### 1a. FILES — Spec 122 §4.1 set derived from the slug (must each appear in Spec 61 §5 `### Target Files`)
| File | Read | Touched | Behaviour impact | Registration | Spec same commit |
|---|---|---|---|---|---|
| `scripts/load-heritage.js` | full | ② → 3-line shell | none (Rule 121 §4.3) | 61 §5 ✓ [READ 61:462], 43 §5 ✓ [43:277] | 61 as-built ② |
| `scripts/load-heritage.descriptor.json` | n/a (new) | ② create | declares today's behaviour | **absent from 61 §5** → add | 61 §5 ② |
| `scripts/load-heritage.notes.json` | n/a (new) | ② create | none | absent → add | 61 §5 ② |
| `scripts/lib/compute/load-heritage.js` | n/a (new) | ② create | pure port of `parseRegister`/`parseHcd`/classifiers/`buildLoadMeta` | absent → add | 61 §5 ② |
| `src/tests/steps/load_heritage/violations.test.ts` (+ fixtures) | n/a (new) | ① create | red suite | absent → add | 61 §5 ① |
| libs used/retired: `scripts/lib/source-version.js` (hits :13), `config-loader.js` (`loadMarketplaceConfigs(pool,'source-heritage')` [READ :667] → retired, `ctx.config`), `safe-math.js`, `geometry-validator.js` (NOT used — infra lock asserts no require [READ load-heritage.infra.test.ts:104-107]), `units.js` (full; new import) | as stated | no | none | geometry-validator + safe-math in 61 §5 ✓; source-version/config-loader/units **unregistered** under 61 → register at ② (runner-completion D8 precedent) | 61 §5 ② |
| runner `scripts/lib/step/{index,acquire,write,staleness}.js` | hits (index.js:631-1034 full read of `runIngestPhase`) | only via prerequisite 0x | 0x | Spec 122 ✓ | 122 (0x commit) |

### 1b. DATA — tables/columns read and written (legacy measured; descriptor mirrors at ②)
| Object | Read | Touched | Behaviour impact | Migration / registration | Spec |
|---|---|---|---|---|---|
| W `heritage_properties` (source_id BIGINT UNIQUE, status, geom Point 4326, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text NOT NULL, construction_year, source_dataset_version NOT NULL, created_at, updated_at) | full mig 170:49-72 + information_schema [MEASURED] | ② (writes via executor) | byte-identical projected golden | `migrations/170_create_heritage_tables.sql`; RLS `227_rls_class_b_default_deny.sql:53` → `guards.requires` | 61 ② |
| W `heritage_districts` (source_id BIGINT UNIQUE, name NOT NULL, hcd_type, geom MultiPolygon 4326, designated_date, bylaw_no, wards, source_dataset_version, created_at, updated_at) | full mig 170:79-94 + [MEASURED] | ② | same | mig 170; RLS 227:52 | 61 ② |
| GIST `idx_heritage_properties_geom_gist`, `_geog_gist`, `idx_heritage_districts_geom_gist` | [MEASURED pg_indexes] | no | consumer performance | `guards.requires` (enrich_heritage already declares two [READ enrich-heritage.descriptor.json:130-143]) | — |
| R externals: CKAN register zip (`REGISTER_URL`, key `ckan:heritage-register-wgs84`) + HCD zip (`HCD_URL`, `ckan:heritage-conservation-districts`), licence [READ :42-49] | full | ② declared | none | descriptor `inputs.reads.externals[]` ×2 | 61 ② |
| R `pipeline_runs` prior row `sources:load_heritage` completed, `started_at DESC` [READ source-version.js readPriorRunMeta :140-141] | hits | no | prior sub-blocks = DEC-K baseline | runner `staleness.readPriorEmitWithPosture` | — |
| R `logic_variables` — 0 of the loader's 6 knobs seeded (only `sources_heritage_{properties,districts}_floor`, consumed by assert_data_bounds) [MEASURED `SELECT variable_key … ILIKE 'heritage%'`] | — | ② +7 seed rows | defaults byte-equal ⇒ none | `scripts/seeds/logic_variables.json` | 61 §12.3a corrected ② |
| `migrations/171_parcels_heritage_columns.sql`, `172_permits_coa_heritage_columns.sql` | hits (:1-6) | no | none — enrich-side columns, not this step's data | 61 §5 ✓ | — |

### 1c. CONSUMERS — `consumer-registry.json` rows + grep for undeclared readers
`consumer-registry.json` has **zero** `load_heritage` rows today (2 heritage hits, both `producer: enrich_heritage` [READ :260,:335]) ⇒ gate D rows are GENERATED at ③ from the new `emits[0].consumers`; the completeness scan must find no undeclared reader.
| Consumer | Read | Touched | Contract / impact | Registration |
|---|---|---|---|---|
| `scripts/lib/compute/enrich-heritage.js` `readHeritageContract` | full :40-80 | no | FROZEN: reads last **completed** `sources:load_heritage` row `completed_at DESC`; halts unless `heritage_load.spec_version==='1.1'`, both sub-blocks present, each `feature_count>0`, `drift_check_passed!==false`, each `source_dataset_version` non-empty; both tables non-empty [READ :44-78]. Also reads both tables in the §11.1 join [:138,:145,:222,:227] | `emits[0].consumers:["enrich_heritage"]` at ② → registry row at ③ |
| `scripts/enrich-heritage.descriptor.json` | hits :6-25,:130-143,:184,:281-308,:444,:486 | no | `inputs.reads.steps [{load_heritage, version_pin:"exact"}]` [:21] — **the seam goes LIVE at ③** (step-seam test comments say "load_heritage is NOT itself converted" [READ step-seam.logic.test.ts:85-95,:364-367]) | 61 ✓ |
| `scripts/lib/compute/assert-data-bounds.js` :273-278; `lib/assert-data-bounds-fields.js` :148-149,:218-219; `quality/assert-data-bounds.descriptor.json` :67-71,:1030-1077,:1696-1702; `generate-assert-data-bounds-descriptor.js` :74-75 | hits | no | `COUNT(*)` floors 8000 / 20 (`limit_from_config`) | 61 §5 ✓ (assert-data-bounds.js) |
| `scripts/quality/assert-schema.descriptor.json` :321-322,:829-830 | hits | no | floor-var names only | 61 §5 ✓ |
| `src/lib/admin/funnel.ts` :662,:954 | hits | no | summary text + `load_heritage → heritage_properties` table map | gate D corpus (FUNNEL_SOURCES) |
| `src/components/FreshnessTimeline.tsx` :38 | hits | no | display label | UI, none |
| `scripts/enrich-permits.js` (61 §5 Target, lock 66) | hits (0 table hits) | no | indirect — reads `parcels.heritage_*` written by enrich_heritage, not this step | 61 ✓ |
| `scripts/analysis/enrich-heritage-cohort-differential.js` | hits (:6 SPEC LINK only) | no | none (no table read) | 61 ✓ |
| registries/generated: `manifest.json` :14,:102; `step-archetype-census.json` :324-328; `programme-items.json` :213 (LDG-3 BUILT), :1717/:2036/:2068 (cutover_prereq lists, all BUILT); `step.schema.json` :104; `seeds/lineage-meta-snapshot.json` :2726-2730,:3108-3130; `generate-logic-variable-groups.mjs` :422-423 + `src/features/admin-controls/generated/logic-variable-groups.json` :361-362; `seeds/logic_variables.json` :5250-5263; `src/lib/db/generated/schema.ts` :437-451; `scripts/surfaces/**` census/F16 descriptors (generic telemetry notes) | hits | ③ via `npm run cutover` (manifest parity, census reason, groups regen); rest no | none | registry_reserved → orchestrator |
| schema fixtures `fixtures/valid/enrich_heritage.descriptor.json`, `fixtures/invalid/enricher-pending-without-invalidator.json`, `fixtures/census/{bad-mismatched-archetype,missing-slug-totality}.json` | hits | no | test fixtures naming the tables/slug | — |

### 1d. TESTS
| Test | Read | Touched | Impact |
|---|---|---|---|
| `src/tests/load-heritage.logic.test.ts` (126 L, `require('../../scripts/load-heritage.js')` :8) | full | ② re-point IN PLACE at the compute (never deleted/weakened) | helpers move |
| `src/tests/load-heritage.infra.test.ts` (145 L, `readFileSync` of the script :11; pins lock 61, `PIPELINE_NAME`, `SPEC_VERSION`, spread ORDER :91-93, `Folder_Row` :119-120, mig 170 + manifest position :126-145) | full | ② re-point: script-text regexes → descriptor/compute assertions of the same facts | locks preserved, not dropped |
| `src/tests/source-version.logic.test.ts` :38,:64,:152-158,:267-278 | hits | ② re-point to `lib/step/staleness.js` (ravines precedent :58-64) | — |
| `src/tests/steps/load_heritage/violations.test.ts` | new | ① | red suite |
| `enrich-heritage.{infra,logic}.test.ts` (:29-31 / :36-38 pin `PRODUCER_NAME='sources:load_heritage'`), `enrich-heritage-418.logic.test.ts` (:47-83 `heritage_load` fixtures), `steps/enrich_heritage/violations.test.ts`, `db/enrich-heritage-418`, `db/enrich-heritage-kill-mid-run`, `db/enrich-permits-heritage`, `enrich-permits-heritage.logic` | hits | no | consumer-side contract locks — stay green UNEDITED (proof the contract held) |
| `db/migration-170-heritage` (22 hits), `-171`, `-172` | hits | no | schema locks |
| `pipeline-advisory-lock.infra.test.ts` :36-38 (`load-heritage.js: 61`), `step-seam.logic.test.ts` :85-95,:364-367, `quality.logic.test.ts` :511,:539,:637, `admin-manifest-utils.logic.test.ts` :53, `control-panel.logic.test.ts` :444-445, `steps/assert_data_bounds/violations.test.ts` :544 | hits | step-seam comment/expected pair count at ③ (derived list, simplification item 4); control-panel `EXPECTED_LOGIC_VAR_KEYS` +7 at ② | lock 61 must still be found via `identity.lock:61` |

**Unread rows: none.**

## 2. Current-behaviour ledger → converted seat
| # | Legacy [READ line] | Seat |
|---|---|---|
| 1 | Two CKAN zipped shapefiles, licence [:42-49] | two `externals[]` `{kind:"http_file", format:"shapefile_zip", key_property, cache:"revalidate", target:<table>}` — **0x** |
| 2 | DEC-K: each dataset skip-checked/loaded independently; sub-blocks `heritage_load.{heritage_register,heritage_districts}` [:697-698, :757-763] | 0x per-primary staleness/outcome; external `id` = sub-block key |
| 3 | HEAD failure ⇒ that dataset `failed`, the OTHER still loads [:475-480] | 0x per-primary failure posture (0r `on_head_error` is step-scoped today) |
| 4 | Download: md5 stream-hash, **no retry**, timeout 60 000 ms from Zod [:57, :504] | `acquire.downloadArchive` (md5) ✓; `network.retries_from_config:"none"` (0q's disable form [READ acquire.js:238-242]); `timeout_from_config` |
| 5 | Tier-1 `STYLE_VALIDATOR_EQUALITY`, `contentHashInNoValidatorsBail:false`, no prior sub-block ⇒ cannot skip [:190-195, :482] | `staleness.preAcquisitionDecision` per primary (centreline parity precedent) |
| 6 | Tier-2 `contentHashDecision` + `buildSkipReEmitMeta` DS4 re-emit, `spec_version` pinned after the prior spread [:509, :486-495, :518-527] | trigger `content_hash`; skipEmit per primary |
| 7 | L25 classify: `listed` → filtered, Part IV/V → `part_iv`/`part_v_member`, else unknown; HCD `under appeal/study` → filtered, `designated district` kept [:218-234, :322-326, :359-363] | `shapeRecord` returns reason strings (`filtered_listed`, `unknown_status`, …) → 0p `shaped_skipped_by_reason` (LANDED 70131022) |
| 8 | Key `Folder_Row` (#426) / `HCD_NO` → positive int, else `badSourceId` WARN [:334, :370, :197-201] | `compute.coerceKey` → `bad_key_count`; declared check |
| 9 | null geometry skipped; `coerceAddress` → `''` + coerced count; `DESIGNATED` 1899-11-30 → NULL [:336-337, :206-216] | parser null-geom count; `ctx.tag('address_coerced_empty')`; compute `normalizeDesignatedDate` |
| 10 | `dedupeBySourceId` keep-first + WARN [:147-156, :738-739] | `compute.dedupeBySourceId` + declared check |
| 11 | L14 zero features on first run ⇒ FAIL [:540-546] | `pre_write` check FAIL when `prior==null && feature_count==0` (`viol == 0`) |
| 12 | L7 count drift > 0.5 ⇒ FAIL + abort BEFORE validation; `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` proceeds, FAIL row kept, override WARN row [:549-558, :677-679] | `pre_write` + `order_guarantee`, `limit_from_config`; `override.accept_anomaly` |
| 13 | Validation SQL single call; point arm accepts only `ST_Point`; polygon arm MakeValid + CollectionExtract(3) + ST_Multi [:63-127, :563] | `write.validateGeometries` `geometry_kind:"point"` / `"polygon"` [READ write.js:283-291, :370-372] — single-member MultiPoint delta → HR-D9 |
| 14 | L8 skipped% > 0.05 ⇒ FAIL, abort before txn [:579-586] | `pre_write` + `order_guarantee` |
| 15 | ONE txn **per dataset**: upsert then F-C1-guarded departure DELETE [:594-606] | `executeWrite` per target (0x loops targets, one txn each) |
| 16 | L7c mass-delete% > 0.5 ⇒ FAIL **after commit**; `HERITAGE_ACCEPT_MASS_DELETE=1` ⇒ outcome ok [:607-613] | post-write check over `written.deleted` (keeps the order) — HR-D1 |
| 17 | L7b geometry-update% > 0.5 ⇒ WARN [:719-720] | post-write WARN check — HR-D2 |
| 18 | `datasetVersion = contentHash ‖ …` [:536] | `acquired.source_dataset_version = dl.contentHash` ✓ |
| 19 | Named audit rows computed over BOTH datasets (worst-of: `Math.max`) + license row [:675-746] | checks over per-primary acquired blocks; compute returns worst-of |
| 20 | Counters: total = combined `feature_count` (skipped dataset CARRIES prior count), new/updated combined [:748-755] | `counters.*` from compute `buildLoadMeta` (literal parity VERIFY-INT-3) |
| 21 | `heritage_load` frozen §9 block: per-dataset renames `filtered_out_listed`/`unknown_status_count`, `filtered_out_appeal_study`/`unknown_hcd_type_count` [:638-642, :757-763] | `emits[0].key:"heritage_load"`, `consumers:["enrich_heritage"]`, skeleton verbatim |
| 22 | Lock 61, DB clock, `PIPELINE_NAME` hard-coded chain name [:36, :41] | `identity.lock:61`; `ledgerPipelineName` — standalone name delta HR-D6 |
| 23 | Prior-read failure ⇒ warn + treat as first run [:684-689] | `staleness.on_prior_run_error:"warn_row"` (LANDED LR-D2 mechanism [READ index.js:780-788]) — HR-D3 |
| 24 | Per-dataset failure returns `{failed:true}`, which `pipeline.run` IGNORES ⇒ exit 0 ⇒ ledger `completed` with verdict FAIL; chain continues as `completed_with_errors` [READ pipeline.js:589-600, run-chain.js:907,:1067-1073] | terminal/status parity VERIFY-INT-3 — HR-D8 |

## 3. Defect ledger (Spec 121 §4.3 — PIN wrong-form in ①; fix only post-conversion)
Prefix `HR-D` is unused repo-wide [MEASURED `git grep -E "\bHR-D[0-9]"` → 0].
| ID | Finding [evidence] | Disposition |
|---|---|---|
| HR-D1 | L7c mass-delete FAIL is computed AFTER the DELETE committed [:594-613]; Spec 61 §3.6.1 knows ("the drift guard's DELETE is not rolled back"). And the consumer checks only `drift_check_passed`, not `mass_delete_check_passed` [READ enrich-heritage.js:67] ⇒ enrich proceeds over a depleted table | pin ①; ④ post-conversion: move to `pre_write` over a dry-run departure count (own RED→GREEN) — Q1 |
| HR-D2 | `source_dataset_version` sits inside the IS DISTINCT FROM guard [:416, :451] ⇒ every new CKAN version rewrites EVERY row (LS018 class), so L7b "geometry_update_pct" counts version-stamp rewrites, not geometry changes: run 1277 HCDs 28/28 updated → pct **1.0 WARN** [MEASURED run 1277 audit rows]. Attribute-only columns (bylaw_no, htg_conser_name, building_type, reason, construction_year) are absent from the guard but reach the table only via this rewrite | pin ①; ④: guard = data columns only, and L7b counts geometry diffs — Q2 |
| HR-D3 | Prior-read failure silently degrades to first run [:684-689] | `warn_row` (parity); ④a → `fail_step` (LR-D2 precedent) |
| HR-D4 | 0 of 6 loader knobs seeded; `loadMarketplaceConfigs('source-heritage')` returns none ⇒ Zod literals rule [MEASURED] | closed at ② by externalization (defaults byte-equal) |
| HR-D5 | Spec 61 §3.10 says bad `OBJECTID/HCD_NO` counts toward `invalid_geometry_skipped` and lock 62; code: separate WARN counter, lock 61 [READ 61:396-401 vs load-heritage.js:198, :36] | correct the SPEC at ② (AP-D1/LC-D1 precedent) |
| HR-D6 | Standalone runs read/write `load_heritage`, but the consumer reads only `sources:load_heritage` [READ enrich-heritage.js:28] | declared limitation (LC-D7 precedent) |
| HR-D7 | Spec 61 §3.2 "skip if ALL unchanged"; code skips per dataset (DEC-K) | correct the spec at ② |
| HR-D8 | A per-dataset failure (HEAD/acquire/drift/L8/mass-delete) lands a **completed** ledger row whose failed sub-block is `skeletonSub()` (feature_count 0, `source_dataset_version` null) [:478, :544-546, :555-557] ⇒ next `enrich_heritage` HALTs "ingested zero features", and the next load's drift baseline for that dataset is 0 ⇒ L7 vacuous for one run | pin ① (status + emitted shape asserted); ④: failed dataset re-emits its prior sub-block (DS4 shape) — Q3 |
| HR-D9 | Library point arm collapses a single-member MultiPoint to accepted; legacy skips it [write.js:370-379 vs :75-79]; 0 non-Point rows today | declared `limitations[]` + check over `geometry_collection_extracted` (LC-D8/Q2 ruling precedent) |
| HR-D10 | Source data: one register row `construction_year = 1250` (source_id 2433372, "525 BELLAMY RD N"); 4,434 NULL [MEASURED] — legacy has no bound | carried; Reality-Check row §7; post-conversion plausibility WARN — filed, not in scope |

## 4. Library prerequisite 0x (Spec 124 §7 rung (d); ONE rung for heritage AND zoning; own plan file + Integration/Guardian/Idempotency panel before code)
**Today:** `runIngestPhase` throws when `outputs.writes.length !== 1` [READ index.js:641-645] and drives only the FIRST url'd external [:650]; 0w adds refusal (i) ">1 url'd primary" and names 3.4 as the step that lifts it [READ wf2_ingest_prereqs_0v_0w_active_task.md:29, :67 O-B/CF-3].
**Design (simplest correct):**
1. `externals[].target: "<outputs.writes[].table>"` — each url'd primary binds exactly one write target; binding is 1:1 and total (refused by name otherwise, before any HEAD). External `id` doubles as the per-primary sub-block key under `emits[0].key` (heritage: `heritage_register`, `heritage_districts` — the frozen §9 names).
2. `runIngestPhase` loops the declared primaries in declared order, running today's body per (primary, target): its own prior sub-block, tier-1/tier-2 gate, acquire, shape, validate, `pre_write` gate, write txn. A single-primary descriptor is byte-identical (no loop, no sub-block).
3. Per-primary outcome carried on `acquired.primaries[id]`; checks read it; the compute assembles the emit.
**Beyond "one field + a loop" (⇒ operator decision D1):** heritage needs a per-primary failure posture — a failed primary lands its FAIL row while the other primary still loads (DEC-K), and zoning needs a different one (base failure aborts, overlay failure WARNs and continues [READ load-zoning.js:636-660]). That is a second declared field, `externals[].on_failure: "abort_step" | "fail_row_continue" | "warn_row_continue"`, plus zoning's all-or-nothing skip (skip only if EVERY layer unchanged) versus heritage's per-primary skip — a third (`staleness.scope`). RE-FREEZE number: next free at landing (#26 is taken by 27ca5bea [READ Spec 122:1140]; 0w will take the next).
0p/0q/0r are **already landed** (70131022, 9bc43b15, b4913395) — heritage needs no new retry/HEAD/tally rung beyond declaring `retries_from_config:"none"`, and 0x reuses 0r's `on_head_error` vocabulary inside `on_failure`.

## 5. Logic variables (Rule 3; all `on_invalid:"fail"`; defaults byte-equal to the Zod literals [READ :51-58])
| Legacy literal | Name | Consumer |
|---|---|---|
| `heritageSkipCheckThresholdYears` 2 | `load_heritage_dataset_age_warn_years` | check `heritage_dataset_age_years` (× `DAYS_PER_JULIAN_YEAR` from `units.js`) |
| `heritageAcceptFeatureCountDriftPct` 0.5 | `load_heritage_count_drift_fail_pct` | `heritage_count_drift_pct.limit_from_config` |
| `heritageInvalidGeometryFailPct` 0.05 | `load_heritage_invalid_geometry_fail_pct` | `heritage_geometry_skipped_pct` |
| `heritageMassDeletePct` 0.5 | `load_heritage_mass_delete_fail_pct` | `heritage_mass_delete_pct` |
| `heritageDriftGeometryUpdatePct` 0.5 | `load_heritage_geometry_update_warn_pct` | `heritage_geometry_update_pct` (WARN) |
| `heritageDownloadTimeoutMs` 60000 | `load_heritage_download_timeout_ms` | `network.timeout_from_config` |
| `round3` scale 1000 [:245] | `load_heritage_round_scale` | compute rounding (centreline 7f14e998 precedent) |
`86400000` and `365.25` [:176, :182, :726] become `MS_PER_DAY`/`DAYS_PER_JULIAN_YEAR` imports (gate E closed answer). L25 status/HCD-type sets and the 1899-11-30 sentinel are domain VOCABULARY, carried in compute and written down in `notes.json` + checks' `why`.

## 6. Five-word gate plan (Spec 124 §5 R-BA; gates run from ① — simplification item 1; **ZERO ledger rows**, hard stop)
| Word | Gate | Closed answer this step uses | First passes |
|---|---|---|---|
| STANDARDIZED | A closed bounds | every `checks[].limit` = `limit_from_config` (the 6 vars) or `viol == 0` (L14 first-run, F-C1, duplicate/bad-key counts, unknown-status/HCD-type WARNs) | ② (① has no descriptor; pending-as-converted validator holds ① at "no checks yet") |
| STANDARDIZED | I registries | census row exists; `staleness-disposition.json` row per declared `fingerprint_inputs` entry (`descriptive`); `HR-D` ids unique; banned-value coverage | ① (census/ids) · ② (disposition rows) |
| OBSERVABLE | C emits ≡ emitted | `emits[]` = `{heritage_load}` = POST golden keys minus `RUNNER_META_KEYS` | ② |
| OBSERVABLE | D consumer registry | generated rows `load_heritage → enrich_heritage` for `heritage_load.spec_version` and both sub-blocks' `feature_count`, `drift_check_passed`, `source_dataset_version` (dotted paths, one resolver — item 3); completeness scan finds no undeclared reader | ③ (`npm run cutover` regenerates) |
| SCALABLE | B on_invalid | all 7 vars `"fail"` | ② |
| SCALABLE | E compute literals | registered var or `units.js` import; no module numeric const | ② |
| UNDERSTANDABLE | F score floor + LF | ≥14/17, LF-only paths | ② |
| UNDERSTANDABLE | J spec staged | Spec 61 staged at ①② (as-built), Spec 43 at ③ | ① |
| ACCURATE | G forced-nonzero + explained diffs | PRE and POST each `records_new+records_updated > 0` on BOTH targets; every POST-compare diff in `explained-diffs.json` | ② |
| ACCURATE | K red evidence | committed vitest JSON artifact of the ② suite run against the ① tree (centreline 407dd91a precedent) | ② |
| ACCURATE | two-run zero-writes (item 7) | POST run 2 immediately after run 1: 0 rows changed on both targets (`idempotent_rerun:"zero_writes"` both) | ② |
| ACCURATE | row conservation (item 8) | per target: read = inserted + updated + unchanged(measured) + skipped | ② |
**Canaries this step's gates must catch (all RED under the standard):** #426 key rename (`OBJECTID`→`Folder_Row`: bad-key count must FAIL-visible, not zero-row PASS); write.js 0-rows on a BIGINT key (6457e713 class — 3/3 fixture round-trip); LS018 rewrite-every-row (HR-D2 — the two-run proof must show run 2 = 0, it does, because the version is unchanged; the defect is visible only on a NEW version, which the explained-diff of the forced run records); HR-D8 zero-skeleton completed row.
**No gate needs an exception** — none requires a ledger row. The only STOP condition is D1 (0x scope).

## 7. Reality-Check plausibility bounds (derived fields; no enriched field)
| Field | Bound | Measured 2026-09-27 |
|---|---|---|
| `status` split | part_iv / (part_iv+part_v_member) ∈ [0.10, 0.30] | 1,557/8,824 = 0.176 |
| `designated_date` | ∈ [1975-01-01, run date]; NULL share < 1% (sentinel → NULL) | 1975-11-12…2026-05-21, 15 NULL |
| `address_text` coerced-empty | = 0 (legacy WARN if > 0) | 0 |
| `construction_year` | ∈ [1700, run year] when non-NULL | 1 violation (1250, HR-D10) |
| geometry | 100% `ST_Point` in Toronto bbox (-79.64..-79.11, 43.58..43.86); HCDs 100% MultiPolygon | 0 outside; 29/29 |
| counts | ≥ `sources_heritage_properties_floor` 8000 / `_districts_floor` 20 (assert_data_bounds, unchanged) | 8,824 / 29 |
Invariants: `features_inserted+updated+unchanged+skipped = feature_count` per dataset; `Σ shaped_skipped_by_reason = shaped_skipped`.

## 8. Commits, captures, proofs
- [ ] **0x** (library WF2, own plan `.cursor/wf2_ingest_prereq_0x_multi_primary_active_task.md` after D1) — orchestrator-lands (RE-FREEZE; recapture every converted INGESTOR, which must be byte-identical).
- [ ] **① assessment + red suite + PRE goldens** — `feat(61_source_heritage_properties): batch2 row 3.4 ① — assessment + red suite + PRE goldens (load_heritage, INGESTOR, two primaries)`. Assessment report (compressed marker; PH-0 freeze = §2; PH-3 intent ledger with `git log -S` per fence: DEC-K, #426 re-key `78748a3`, lock 61, `'1.1'` pin, F-C1, L7/L8/L7b/L7c, tier-2 `0b230472`; PH-5 seams: DB, clock, network, env `HERITAGE_ACCEPT_*`; HR-D1..D10 → `docs/reports/defect-ledger.md`; non-determinism inventory BEFORE the first golden: `id` serial, `created_at/updated_at`, CKAN regen ⇒ `content_hash`, `sys_*` rows). Red suite (SPEC LINK header; each RED value stated): L25 classify both datasets; `Folder_Row`/`HCD_NO` key + bad id; 3-row BIGINT round-trip; dedupe keep-first; L14; L7 abort + override keeps FAIL row; L8 abort; F-C1 later-run WARN; tier-1/tier-2 per-dataset skip + DS4 re-emit; DEC-K (one skips, other loads); `spec_version:"1.1"` + every §9 key; HR-D1/D2/D8 pinned wrong-form. `converted.json.pending {stage:"red_suite"}` (orchestrator).
  **PRE goldens** (claude, capture-last guard satisfied only at POST):
  `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-heritage.js --chain=sources --table-columns="heritage_properties:source_id,status,geom,designated_date,bylaw_no,htg_conser_name,building_type,reason,address_text,construction_year,source_dataset_version;heritage_districts:source_id,name,hcd_type,geom,designated_date,bylaw_no,wards,source_dataset_version" --table-order=heritage_properties:source_id,heritage_districts:source_id --out=docs/reports/golden/load_heritage/pre/sources.json`, then `--chain=none` ⇒ `pre/standalone.json`.
  **Forced-change proof (G#38):** the legacy loader has NO force switch, so PRE writes only if CKAN moved since run 1470 (register `Last-Modified` Thu 04 Jun 2026, districts Wed 24 Jun 2026 [MEASURED run 1277/1470 sub-blocks]). Step 1 of ① HEADs both URLs; if either moved, that dataset's rewrite IS the proof (HR-D2 makes it a full rewrite); if neither moved ⇒ operator decision D2.
- [ ] **② descriptor + compute + frozen shell + seeds; POST goldens** — `feat(61_source_heritage_properties): batch2 row 3.4 ② — descriptor + compute + frozen shell + seeds; POST goldens (zero-diff, two targets)` — orchestrator-lands (G8). Briefs: `b2-row3.4-c2a-descriptor.md`, `-c2b-compute.md`, `-c2c-shell-notes-seeds.md`, `-c2d-repoints.md`, each with the **Gate answers** field (§9). Descriptor adds `override.force_run:"HERITAGE_FORCE_RELOAD"` (declared deviation — ravines/centreline precedent). Seeds applied locally, VALUES verified. POST: same flags + `HERITAGE_FORCE_RELOAD=1` ⇒ `post/sources.json`; `--compare=pre/sources.json,post/sources.json` data hash byte-identical on both tables (precondition: same `content_hash` per dataset, else recapture both back-to-back); **two-run proof** (item 7) + conservation (item 8) green; `pending` → `shape_clean`; suite GREEN (the flip = K artifact). Spec 61 as-built in THIS commit (§3/§3.10/§12.3a corrected, §5 Target Files += the 4 new files + unregistered libs).
- [ ] **③ cutover** — `feat(61_source_heritage_properties): batch2 row 3.4 ③ — load_heritage CUTOVER (INGESTOR, first two-target member)` — `npm run cutover -- --step=load_heritage` (item 4: converted.json + pending delete, census, freeze, groups, consumer registry, roadmap, system map, `step-validate --all --write`); Spec 43 row 7 as-built. Exit: `step:validate --all`, `step-conformance.infra.test.ts`, full `npm run test` (1 fork). Merge serially.
- [ ] **④a HR-D3 · ④b HR-D8 · ④c Q1/Q2 outcomes** — each its own RED→GREEN `fix(61_…)` with spec text, orchestrator-lands (recapture).

## 9. Gate answers (the brief field — every declared field a brief sets, with the gate it must satisfy)
* every `checks[].limit` → `limit_from_config:<one of §5>` or `"viol == 0"` (A); no bare number anywhere in the descriptor.
* every `config.logic_variables[].on_invalid` → `"fail"` (B); no `deviations[]` naming `on_invalid`.
* compute numerics → `ctx.config.<var>` or `require('../units')` (E); no `const X = <number>`.
* `emits[0]` → `{key:"heritage_load", consumers:["enrich_heritage"], skeleton:<§9 block>}` (C/D).
* both `outputs.writes[].write_discipline.idempotent_rerun` → `"zero_writes"` (item 7).
* `identity.lock` → 61; `identity.spec_version` → `"1.1"` (producer fence).
* `network.retries_from_config` → `"none"` (legacy has no retry — never add one in a conversion).

## 10. Ordering / coupling
One committer on the programme branch. Queue: simplification WF → massing ②③ → neighbourhoods (0w) → **0x** → `load_heritage` → `load_zoning` (reuses 0x; needs the D1 postures) — `load_wsib` is independent of 0x and may go before heritage. Shared registries (`converted.json`, census, freeze, consumer registry, system map) serialise every cutover. `enrich_heritage` (converted) is the contract fence: its unedited tests are the proof. `enrich_permits` propagation is indirect (via `parcels`), unaffected.

## 11. Panels (Spec 08 §6.4; §11 grounded)
PLAN: Integration (VERIFY-INT-1 0x binding vs `buildWritePlan`; -2 per-primary skip-emit shape; -3 per-terminal ledger status vs legacy `completed`+FAIL verdict (HR-D8); -4 standalone name; -5 golden `--table-columns` for two tables) · Idempotency Lens (per-dataset txn, two-run) · Schema-Fidelity (mig 170 columns/NOT NULL) · one DeepSeek spec lens grounded by Sonnet. Reality-Check runs at OUTPUT only on §7's bounds (derived fields, no enriched field). OUTPUT (②③④): Regression Guardian (every deleted line of 808 fenced; `enrich_heritage` contract), Code Reviewer grounded, Observability (audit rows ≡ Spec 61 §9 table), Op-Model Compliance at ③.

## Standards Compliance
* **Try-Catch / logError:** no new catch in compute (Rule 2); 0x's catches use `logError`.
* **Unhappy Path Tests:** HEAD 5xx on one dataset (other loads), download failure, bad zip, missing DBF field, L25 unknowns, L14, L7 ± override, L8, F-C1 later-run, mass-delete (HR-D1), prior-read error (HR-D3), lock contention — each a fixture in ①.
* **UI Layout:** N/A.
* **§11 checklist:** spec read first ✓; every test SPEC LINK ✓; no `any`/process.exit in compute ✓; DB impact NO ✓; zero literals (§5) ✓; row-derived verdict (Rule 10) ✓; spec updated in the same commit per touch ✓.

## Operator decisions (not resolvable from the Spec 124 register)
* **D1 (0x scope):** 0x needs three declared axes (target binding, per-primary failure posture, skip scope), not one field + a loop. Options: (a) build 0x with all three, once, for heritage + zoning; (b) split heritage into two slugs (`load_heritage_register`, `load_heritage_districts`) — changes the chain, the producer name and the frozen `heritage_load` contract (enrich_heritage edit) ⇒ not a zero-behaviour conversion. **Recommendation: (a)** — rung (d), one library fix every multi-source INGESTOR uses; (b) breaks the Spec 61 §9 freeze.
* **D2 (forced change if CKAN has not moved):** accept a one-time `HERITAGE_FORCE_RELOAD`-equivalent for the legacy PRE by capturing PRE on the first day CKAN moves (wait), or pin PRE as a skip-run and prove nonzero on POST only. **Recommendation:** wait for a move (register/districts both moved within the last 4 months), never fake a prior ledger row.
* **Q1 (HR-D1), Q2 (HR-D2), Q3 (HR-D8):** fix post-conversion as ④ commits (recommended), each with its own RED→GREEN lock and Spec 61 text.

> **PLAN LOCKED. Do you authorize this WF2 plan (0x after D1, then ①②③, then ④)? (y/n)**
> §11 note: failure posture is pinned to legacy (completed row + FAIL verdict) until ④b — changing it inside the conversion would stop the chain where it continues today.

## Re-grounding after 0x landed (2026-09-29)

**0x is LANDED.** Commit `61e83927`, merge `5c2da8bc`; its plan is `.cursor/wf2_ingest_prereq_0x_active_task.md` (Fold log + Fold log 2). The axis §4 forecast is now shipped library behaviour, pinned by Spec 122a §A18 [READ 122a:649-651] and logged as **RE-FREEZE #29** (next free is **#30** [READ 122:1142-1148]). Everything below re-reads THIS plan's rows against the landed mechanism; it does not re-derive 0x.

### A. Per-row verdicts

Legend: **valid** = assumption survives 0x as written; **changed** = the landed mechanism moves the assumption and the plan row must be reworded; **① decision** = a choice heritage must write down before ① and defend in notes/explained-diffs.

| Plan row | 0x assumption (as written) | Verdict | Evidence |
|---|---|---|---|
| §2 row 1 | two `externals[]` `{kind,format,key_property,cache,target:<table>}` | **still valid**; add `on_failure:"fail_row_continue"` to EACH primary and `execution.shape:"ingest"` | F1: ships `externals[].target` + `on_failure` (abort_step default \| fail_row_continue \| warn_row_continue), NO skip-scope field [READ index.js:655-706]; M2 `target` ⇒ `execution.shape:"ingest"` [READ step.schema.json:4518-4522] |
| §2 row 2 | external `id` = sub-block key (DEC-K) | **changed** — the external `id` MUST byte-equal the frozen §9 sub-block names `heritage_register` / `heritage_districts`, NOT the `ckan:` input keys. This DEPARTS from the `ckan:` id convention the precedents use (centreline/ravines) ⇒ **① decision**; the four triggers (source_validator pre + content_hash post, per primary) carry `external:"heritage_register"`/`"heritage_districts"` | B6: `emits[0].skeleton[<id>]` must be an object [READ index.js:660-706]; `subKey:id` selects the prior sub-block [READ :1217-1221]; trigger `external` names `externals[].id` [READ schema:2535-2538]; precedents `ckan:` ids [MEASURED node] |
| §2 row 3 | HEAD failure ⇒ that dataset `failed`, the OTHER still loads [:475-480] | **still valid via absent `on_head_error`** (throw) caught by `on_failure:"fail_row_continue"` ⇒ the failed primary lands a `primary_failed:<id>` FAIL row, the other loads | acquire.js rethrows unless `on_head_error:"warn_row"` [READ acquire.js:865]; catch-and-continue [READ index.js:746-750]; F6 [READ :857-880] |
| §2 rows 5-6 | tier-1 `preAcquisitionDecision` + tier-2 `contentHashDecision` per primary | **still valid** — each primary runs a NARROWED clone: `staleness.trigger` filtered to entries whose `external === <id>` or unscoped; `subKey:id` selects the prior sub-block | F3 [READ index.js:733-736, :1217-1221] |
| §2 row 12 | L7 drift > 0.5 ⇒ FAIL + abort before validation; `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` proceeds, FAIL kept, override WARN | **changed** — abort under 0x yields `outcome:"write_skipped"` on THAT primary (not "failed"), plus the L7 FAIL check row AND an extra library `primary_failed:<id>` row (`source:"gate"`, FAIL, `errored:true`). Audit-row DELTA vs legacy ⇒ **① decision**: explain in notes + `explained-diffs.json`. The `accept_anomaly` override at the `pre_write` gate must still let the write PROCEED — a red-suite assertion | F5 `write_skipped` outcome [READ index.js:760-826]; F6 `primaryFailureRows` [READ :857-880]; F4 failed primaries get NO re-emit [READ :898-915, :6058] |
| §2 row 14 | L8 skipped% > 0.05 ⇒ FAIL, abort before txn | **changed** — same as row 12: `write_skipped` + L8 FAIL row + extra `primary_failed:<id>` row; override-at-pre_write must still allow the write | F5/F6 [READ index.js:760-826, :857-880] |
| §2 row 15 | ONE txn per dataset | **still valid** — `ingestPrimaries` runs one narrowed `runIngestPhase` per primary, each with its own write txn + `rowConservation` | [READ index.js:708-755; 122a:651 "one txn per target"] |
| §2 rows 16-17 | L7c mass-delete over `written.deleted`; L7b over update% | **changed** — read the PER-TABLE `written.by_target.<table>.deleted` / `.updated` (and `.inserted`/`.rows_scanned`/`.rows_changed`), NEVER the SUMMED top-level `written.*` | F5 [READ index.js:760-826] |
| §2 row 18 | `source_dataset_version = dl.contentHash` | **changed** — the value now lives at `acquired.primaries.<id>.source_dataset_version` (per-primary), not a single `acquired.source_dataset_version` | F5 aggregated shape [READ index.js:760-826] |
| §2 row 19 | named audit rows worst-of over BOTH datasets | **still valid** — checks read the per-primary acquired blocks; the compute still returns worst-of | F5 [READ index.js:760-826] |
| §2 row 20 | counters: total = combined `feature_count` (skipped dataset CARRIES prior count) | **changed** — `acquired.feature_count` does NOT exist top-level; it resolves `null` under the closed pattern ⇒ **① decision (recommended)**: declare `counter.source` = the SUM `records_meta.heritage_load.heritage_register.feature_count + records_meta.heritage_load.heritage_districts.feature_count`, with the compute emitting BOTH sub-blocks (skipped ones carrying the prior count) so the counter never depends on the post-merge re-emit (the alternative — compute-returned `counters.*`, which still wins [READ index.js:270-272] — is compute-hidden; not recommended). `records_new`/`records_updated` = `written.inserted`/`written.updated` SUMS | F5 no top-level `acquired.feature_count`/`source_dataset_version` [READ index.js:760-826]; F8 `resolveCounterSource` executes a declared SUM `a.b + c.d`, any absent term ⇒ null; resolve scope = the COMPUTE's `records_meta`, BEFORE the skip re-emit merge [READ index.js:232-250, :258-275, :5979 vs :6058]; `counter.source` closed pattern [READ schema:1690] |
| §2 row 24 | per-dataset failure ignored by `pipeline.run` ⇒ exit 0 ⇒ ledger `completed` + FAIL verdict | **changed** — re-scoped by HR-D8(a) below: chain = parity (run-chain stamps `completed` on exit 0, rolls up `completed_with_errors`); standalone = FAILED vs legacy `completed`; 0x adds NO status override | F7 [READ 0x plan §3c; 122a:651] |
| §3 HR-D8 | failed dataset emits `skeletonSub()` (0 features) ⇒ next enrich HALTs | **changed (split)** — **(a)** standalone status deviation (FAILED vs legacy `completed`) pinned at ① and declared in the ② descriptor `deviations[]`; **(b)** the failed primary's sub-block becomes a compute-owned skeletonSub (chain parity, PINNED) with the ④b re-emit | F7 [READ 0x plan §3c; 122a:651]; F4 [READ index.js:898-915, :6058] |
| §3 HR-D1 | L7c FAIL after commit; consumer ignores `mass_delete_check_passed` | **still valid** — pin unchanged at ①; only the METRIC SOURCE moves to `written.by_target.<table>.deleted` (row 16) | F5 [READ index.js:760-826] |
| §3 HR-D2 | `source_dataset_version` inside the IS DISTINCT FROM guard ⇒ full rewrite per new version | **still valid** — pin unchanged; the per-primary version now sits at `acquired.primaries.<id>.source_dataset_version` | F5 [READ index.js:760-826] |
| §4 item 1 | `externals[].target` binding, 1:1 and total | **still valid** — shipped exactly so, plus `on_failure` (F1) | F1/F2 [READ index.js:655-706] |
| §4 item 2 | loop the declared primaries, today's body per (primary,target) | **still valid** — 0x implements it by running a NARROWED `runIngestPhase` clone per primary | F3 [READ index.js:733-736] |
| §4 item 3 | per-primary outcome on `acquired.primaries[id]`; compute assembles the emit | **still valid** — the aggregated shape is exactly F5 | F5 [READ index.js:760-826] |
| §4 "Beyond" | third axis named `staleness.scope` (per-primary vs all-or-nothing skip) | **retired** — the field name is taken and 0x ships NO skip-scope field (deferred to 0y, operator D1(a) approval). Heritage needs none: per-primary skip IS the default. Zoning's all-or-nothing moves to 0y `skip_scope` | F1: no skip-scope field [READ index.js:655-706; 122a:651] |
| §6 gate G | forced-nonzero + explained diffs | **still valid**; the "explained diff" set now also carries the row-12/14 audit-row delta and the row-20 counter source | F5/F6 [READ index.js:760-826, :857-880] |
| §8 0x checkbox | "0x … after D1" | **DONE** — land is `61e83927` (merge `5c2da8bc`); the checkbox is closed, first commits below start at ① | commit 61e83927 / merge 5c2da8bc [git log]; RE-FREEZE #29 row [READ 122:1148] |
| §10 ordering | 0x before ①②③ | **still valid** — 0x already sits in the queue, now landed, ahead of `load_heritage` | [git log] |
| §11 VERIFY-INT-1 | 0x binding vs `buildWritePlan` | **still valid** — assert the shipped binding + the per-table `written.by_target` | F2/F5 [READ index.js:660-706, :760-826] |
| §11 VERIFY-INT-2 | per-primary skip-emit shape | **still valid** — assert `multiPrimarySkipEmit` re-stamps only SKIPPED primaries' `emitBlock` over the compute's `records_meta[emitKey]`; failed primaries get NO re-emit | F4 [READ index.js:898-915, :6058] |
| §11 VERIFY-INT-3 | per-terminal ledger status vs legacy `completed`+FAIL verdict (HR-D8) | **still valid, re-scoped** — chain parity (exit 0 ⇒ completed, rolled up `completed_with_errors`); standalone FAILED. 0x adds no override | F7 [READ 0x plan §3c; 122a:651] |

**Net ① decisions added by 0x:** (1) external `id` = frozen sub-block names, not `ckan:` keys; (2) row-12/14 audit-row delta (extra `primary_failed:<id>` gate row) explained in notes + explained-diffs; (3) row-20 counter declared as the two-sub-block SUM over the compute's `records_meta`; (4) HR-D8 split (a) standalone-status deviation vs (b) chain-parity skeletonSub.

### B. Drifted cites in the §1 registry (re-grepped 2026-09-29 against HEAD 5c2da8bc; files changed since the plan was drafted: index.js, acquire.js, step.schema.json, consumer-registry, programme-items, seeds, groups, assert-schema descriptor, step-seam/control-panel/quality tests, Spec 122/43, system map)

**Drifted (update in place at ①):**
- `consumer-registry.json` `:260,:335` → **`:268,:359`**.
- `programme-items.json` `:1717/:2036/:2068` → **`:1754/:2073/:2105`**.
- `assert-schema.descriptor.json` `:321-322,:829-830` → **`:330-331,:847-848`**; **+ missed** `:29-30` (`heritage_register_zip`/`heritage_hcd_zip` ids) and `:454` (`http_head_ok` expect list), and `lib/compute/assert-schema.js` **`:95-98`** (the second URL copy).
- `seeds/logic_variables.json` `:5250-5263` → **`:5360-5373`**.
- `logic-variable-groups.json` `:361-362` → **`:363-364`**; `generate-logic-variable-groups.mjs` `:422-423` → **`:424-425`**.
- `step-seam.logic.test.ts` `:85-95,:364-367` → **`:84-91,:371-373`**.
- `lib/compute/enrich-heritage.js` `:67` → **`:68`**.
- `index.js` `runIngestPhase` `:631-1034` → **starts `:930`** (next fn `:1636`); `writes.length` throw `:641-645` → **`:944`**; primaries throw `:650` → **`:1000`**; `on_prior_run_error` `:780-788` → **`:1207`**.
- Spec 122 RE-FREEZE `:1140` → **`:1142-1148`** (**#29 taken**, next free **#30**).

**Unchanged (verified this run):** `43:38`, `43:277`, `61:462`, system map `:43`/`:61`, census `:324-328`, `step.schema.json:104`, `acquire.js:238-242`, control-panel `:444-445`, `quality.logic.test.ts:511/:539/:637`, `load-heritage.js:36/:41/:667`, manifest `:14/:102`, funnel `:662/:954`, `FreshnessTimeline.tsx:38`, `source-version.js:140-141`, `enrich-heritage.descriptor.json:21`.

### C. Four-section registry re-review (operator ruling: the step's OWN registry, four closed sections)

Every row of §1a FILES / §1b DATA / §1c CONSUMERS / §1d TESTS was re-read against the post-0x tree. **One new finding** (the only unread row left anywhere in the registry):

- **CONSUMERS, new row — `scripts/lib/compute/assert-schema.js:95-98,:109-110`** (not previously listed). It holds a **SECOND copy** of BOTH heritage URLs, used for the step's own HEAD-reachability check with externals `heritage_register_zip` / `heritage_hcd_zip` [READ `assert-schema.descriptor.json:29-30, :454`]. It is **byte-equal to `load-heritage.js:44-47` today** [MEASURED node]. Touched: **N** (no code change). **Behaviour impact:** the two URLs must stay byte-equal to the descriptor `inputs.reads.externals[].url`; if the descriptor re-spells a URL, the assert-schema copy silently diverges and the reachability check passes/fails against the wrong resource. Registration (orchestrator re-ground, corrects the engine draft): Spec 61 §5 lists only the SHELL `scripts/quality/assert-schema.js` [READ 61:476]; the URLs live in `scripts/lib/compute/assert-schema.js`, which is **unregistered under 61** ⇒ register at ②. Spec 61 :476 and :983 also claim assert-schema checks "OBJECTID + HCD_NO attribute + STATUS/HCD_TYPE allowed values", but the compute carries only URL reachability [READ assert-schema.js:95-110; `grep -i "OBJECTID\|HCD_NO\|Folder_Row"` → 0 hits] ⇒ **spec drift, corrected at ②** (HR-D5 class, not a new defect id). Spec same commit: **61 (②)**.

No other unread row. FILES gains one entry — **`docs/reports/golden/load_heritage/cohort.json`** (created at ②, see D).

### D. Airtight gate plan (restated, post-0x)

Five words, closed answers, **ZERO ledger rows** (Spec 124 R-BA [READ 124:256]; the hard stop from ① stands — `step-validate --step=load_heritage` evaluates the pending slug as if converted once a descriptor exists). §6's closed answers stand unchanged except where noted (G cohort.json, D counter terms). Worth restating because 0x moved WHERE some answers live:

- **STANDARDIZED** — **A** closed bounds (#28 closed bound) + **I** registries (#33 banned, #34 disposition, #35 census parity, #36 defect-id uniqueness).
- **OBSERVABLE** — **C** emits ≡ emitted (#30) + **D** consumer registry (#31, one row per SUM term — this is where the row-20 counter lands as T9c).
- **SCALABLE** — **B** `on_invalid` (#29) + **E** compute literals (#32).
- **UNDERSTANDABLE** — **F** score ≥14/17 + #37 LF-only paths + **J** spec staged.
- **ACCURATE** — **G** forced-nonzero + explained diffs (#38 via `docs/reports/golden/load_heritage/cohort.json` per table, #39 fresh, #40 explained) + **K** committed vitest JSON (#41).

Plus the commit-scoped **#43 OWNER-SPEC-DIFF** (F10, below). **Renaming an id/key/variable to satisfy a pattern is a BYPASS, not a pass** — the gate is satisfied only by the correct shape, never by a cosmetic rename.

**#43 (F10):** the commit appending `scripts/load-heritage.js` to `converted.json` (③) must stage EVERY spec whose system-map Implementation cell names it — rows **43 AND 61** [READ `00_system_map.md:43,:61`]. The plan stages 61 at ② and 43 at ③, so **③ must also stage 61**.

**Gate G extra input (F13):** #38 multi-target needs `docs/reports/golden/load_heritage/cohort.json` = `{contract_version:1, targets:[{table,capture,why}]}` per table [READ `gates/captures.mjs:16-20, :114-160`]. §6 and §8 do NOT name it — add it to §8's ② POST step and to the §1a FILES row.

**R-AQ.1 (F12):** no cloud dispatch until EVERY data-sources step is converted [READ 124:243] ⇒ **③ acceptance is LOCAL only**.

### E. ① work that can start now (non-DB) + briefs

**Startable immediately (no DB, no operator, no heavy slot):**
- Assessment report non-DB parts: PH-0 freeze (= §2), PH-3 `git log -S` fences, PH-5 seams, non-determinism inventory.
- HR-D1..D10 rows written to `docs/reports/defect-ledger.md` (orchestrator owns the registry edit).
- Red suite `src/tests/steps/load_heritage/violations.test.ts` written against the **post-0x** shape (do NOT run while the heavy verification slot is taken).

**Blocked on DB / operator / network:** PRE goldens (DB; capture-last guard), D2 CKAN HEAD check (network), `converted.json` pending stage (orchestrator).

**Briefs (each <5 KB, with the §9 Gate answers field):**
- **`b2-row3.4-c1a-red-classify-key.md`** — L25 classify (keys), dedupe, L14, BIGINT round-trip.
- **`b2-row3.4-c1b-red-multiprimary.md`** — descriptor ids/target/`on_failure`/`shape`, per-primary skip + DS4, DEC-K (one fails, other loads), `primary_failed` rows, `by_target` post checks, counters SUM.
- **`b2-row3.4-c1c-red-gates-pins.md`** — L7/L8 ± override, F-C1, `spec_version:"1.1"` + §9 keys, HR-D1/D2/D8 wrong-form.
- **`b2-row3.4-c1d-assessment.md`** — report prose.

**Cross-refs that changed with 0x:** F9 — 0fs (`externals[].path`) is unusable by heritage (refused by B9) and not needed (both sources are http). F11 — there is NO "#42 defect-prefix uniqueness" invariant; the gate is **#36 DEFECT-ID-UNIQUENESS** (gate I) [READ `gates/registries.mjs:49, :259-292`; `step-validate.mjs:2089-2100`] — no prefix-ownership check exists, and `HR-D` has 0 definition rows in defect-ledger/assessments while already being cited by landed `122a:651` ("HR-D8"); `LH-D` has 0 hits. **Keep `HR-D`.**

## Operator ruling 2026-10-01 — PRE capture force seam
Reuse the authorized zoning O2 ruling: additive `HERITAGE_FORCE_RELOAD=1` seam in the LEGACY `scripts/load-heritage.js` — unset = byte-identical behaviour (normal future runs unchanged; they load the City's revised data via the normal version check). Same key as the descriptor's `override.force_run`, so PRE and POST force identically. Amend the descriptor deviation that says "no force switch". Operator requirement: the step must run normally in the future on the revised data.
