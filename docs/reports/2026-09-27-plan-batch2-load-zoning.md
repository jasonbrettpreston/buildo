# Active Task: batch-2 — `load_zoning` conversion (INGESTOR, compressed ①②③, 10 CKAN DataStore layers → 10 targets)
**Status:** Authorized 2026-09-27 (operator "y", all 11 recommendations accepted incl. ci_green_for_sha)
**Workflow:** WF2 (step conversion — Spec 122 architecture · Spec 123 procedure · Spec 124 policy; Spec 121 §4.3 zero-behaviour, pin-don't-fix).
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1) for mechanical writes (briefs <5 KB, `write_scope` front matter, "Gate answers" field per simplification item 6); **claude** for every verification seat, every golden capture, every `registry_reserved` edit, `npm run cutover`, and every compute-changing landing (G8). Downgrade reason: verification seats + live DB + registry. Plan skeleton drafted by engine run `20260928T004726Z-74c16599` (5 iterations, 1 blocked non-allowlisted command, no commits); every claim below re-grounded by the orchestrator.
**Layout:** Spec 122 §4.1 — `scripts/load-zoning.js` (path unchanged → frozen `pipeline.step()` shell) + sibling `.descriptor.json` / `.notes.json` + `scripts/lib/compute/load-zoning.js`.
**Uses (never re-describes) the conversion-simplification WF (`.cursor/wf2_conversion_simplification_active_task.md`):** item 1 gates from ①; item 2 capture last (`capture-guard.js` exists [READ ls scripts/analysis]); item 3 one resolver; item 4 `npm run cutover -- --step=load_zoning` (`scripts/analysis/cutover.mjs` + `cutover-generators.json` exist; `package.json:37` [READ]); item 5 hook tests the index; item 6 brief gate-answers field; item 7 two-run zero-writes proof (`capture-rerun-proof.js` exists); item 8 row conservation; item 9 `code_sha`. If any of these has not landed when ① starts, ① waits — it does not re-implement them.

## Context
* **Goal:** convert the 739-line legacy loader [MEASURED `wc -l`] to the standard step with ZERO behaviour change; every divergence is either reproduced by a library rung, pinned wrong-form as `ZN-D<n>`, or a declared deviation with precedent.
* **Target Spec:** `docs/specs/01-pipeline/58_source_zoning_bylaw.md` (source owner, v2.3) + `docs/specs/01-pipeline/43_chain_sources.md` (chain owner, row 21 [READ 43:52], Target Files [READ 43:291]); index: system map rows 43 + 58 [READ 00_system_map.md:43,:58]. Consumer spec: `65_enrich_parcels.md` §2 consumer protocol [READ 65:33-41]. Lock registry: Spec 47 row 58 [READ 47:1965].
* **Key Files:** `scripts/load-zoning.js` → shell; new descriptor/notes/compute; `src/tests/steps/load_zoning/violations.test.ts` (new); re-pointed in place: `src/tests/zoning.logic.test.ts`, `src/tests/source-version.logic.test.ts`.
* **Database Impact:** NO schema change. 10 tables row-identical on the projected golden: base 11,719 · height 2,528 · lot_coverage 1,242 · building_setback 4 · policy_area 352 · policy_road 8,913 · rooming_house 558 · parking_zone 913 · priority_retail 643 · queenstw_eat 4 [MEASURED `SELECT COUNT(*)` ×10, 2026-09-27].
* **Archetype + write class:** INGESTOR (census row [READ step-archetype-census.json:368-372] `INGESTOR/C5`). Per target: class B `upsert_scoped_departure_delete`, `guard:"is_distinct_from"`, `txn_scope:"step"` per target (legacy D2: one `withTransaction` per layer [READ load-zoning.js:485-530]). The NOT EXISTS anti-join over a keys-only temp table [READ :487, :520-523] IS class B read by intent, not class C — already ruled in the schema census note [READ step.schema.json:105, :131-132]. Ravines is the class-B INGESTOR precedent [READ load-ravines.descriptor.json write_discipline].

## 1. Target file review (closed set per the operator ruling: FILES · DATA · CONSUMERS · TESTS)
Reproduce: `T='zoning_bylaw_areas|zoning_height_overlay|zoning_lot_coverage_overlay|zoning_building_setback_overlay|zoning_policy_area_overlay|zoning_policy_road_overlay|zoning_rooming_house_overlay|zoning_parking_zone_overlay|zoning_priority_retail_overlay|zoning_queenstw_eat_overlay|zoning_layers_loaded|zoning_layer_versions|zoning_partial_load|load_zoning|load-zoning'` then `git grep -l -E "$T" -- scripts src ':!src/tests'`, `git grep -l -E "$T" -- src/tests`, `git grep -l -E "$T" -- docs/specs`, plus `git grep -l -E "geometry-validator|zoning-attr-drift" -- scripts src`. READ legend: **full** = whole file; **hits** = every grep hit line ±context.

### FILES (Spec 122 §4.1 set from the slug; must appear in Spec 58 `### Target Files` [READ 58:399-410], which today lists only `load-zoning.js`)
| File | READ | Touched | Behaviour impact | Registration | Spec updated same commit |
|---|---|---|---|---|---|
| `scripts/load-zoning.js` | full (739 L) | ② → frozen shell | none (zero-diff) | 43 + 58 Target ✓ | 58 §3/§11 as-built at ② |
| `scripts/load-zoning.descriptor.json` | n/a (new) | ② create | declares everything below | add to 58 Target at ② | 58 at ② |
| `scripts/load-zoning.notes.json` | n/a (new) | ② create | none | add to 58 Target at ② | 58 at ② |
| `scripts/lib/compute/load-zoning.js` | n/a (new) | ② create | pure: `shapeRecord` (column map, `coerceColumn`, HT_LABEL parse, drift tags), `coerceKey`, `dedupeBySourceId` (reject-ALL form, R2-17), `validatorCounterDelta`, checks, `buildLoadMeta` | add to 58 Target at ② | 58 at ② |
| `src/tests/steps/load_zoning/**` | n/a (new) | ① create | red suite | add to 58 Target at ① | 58 at ① (Target list only) |
| `scripts/lib/zoning-attr-drift.js` | full (60 L) | no (compute imports `checkAttrDrift` — pure, no I/O) | none | 58 Target ✓ | — |
| `scripts/lib/geometry-validator.js` | hits + L1-80 | no; becomes UNUSED by any step at ② (library `write.validateGeometries` replaces it; only `load-zoning.js` requires it [MEASURED grep: other hits are comments/negative locks]) | none | 58, 59, 61, 62 Target | 58 at ②: "retained for `zoning.logic.test.ts`/`zoning.db.test.ts`; retirement filed" |
| `scripts/lib/source-version.js` | hits (:137-197) | no (shell stops requiring it; library `staleness.js` calls it) | none | map row 62 ✓ | — |
| `scripts/manifest.json` | hits (:17, :107) | ③ via `npm run cutover` (invocation parity only) | none | 43, 58 ✓ | 43 at ③ |
| `scripts/quality/assert-schema.js` + `scripts/lib/compute/assert-schema.js` | hits (:138-143) | no | none — assert_schema keeps its own resource probe (`zoning_resource_columns`) | 58 Target ✓ | — |
| `scripts/seeds/logic_variables.json` | hits (:15) | ② add §5 rows | none (defaults byte-equal) | 58 Target ✓ | 58 §5 as-built at ② |
| `migrations/164_zoning_bylaw_tables.sql` | hits (types/CHECKs) | no | — | 58 Target (as `NNN_…`) | — |

### DATA (legacy measured reads/writes; each with its migration)
| Table / key | READ | Touched | Behaviour impact | Registration | Spec updated |
|---|---|---|---|---|---|
| 10 zoning tables — `source_id INTEGER UNIQUE NOT NULL`, `geometry JSONB NOT NULL`, `geom GEOMETRY(MultiPolygon×8 / MultiLineString×2, 4326) NOT NULL`, `source_dataset_version TIMESTAMPTZ`, `created_at DEFAULT NOW()` | migration 164 hits [READ :33-240]; RLS enabled mig 227 [READ :101-103] | written (class B ×10) | none | 58 | — |
| `pipeline_runs` (prior read `sources:load_zoning`, `status='completed'`, `started_at DESC`) | [READ source-version.js:137-145] | read | none | 47/122 | — |
| records_meta §9 keys `zoning_layers_loaded`, `zoning_partial_load`, `source_dataset_version`, `base_layer_committed_after_overlays_failed` + additive `zoning_layer_versions` + `audit_table` | [READ load-zoning.js:680-693; 58:554-576, :621] | emitted (`emits[]`) | FROZEN contract | 58 §9 | — |
| CKAN `package_show` (package `34927e44…`) + 10 `datastore_search` resources | [READ :40-41, :350-385; 58:105-118] | read | acquisition via 0y | 58 §2 | 58 §2/§11 at ② |
| `logic_variables` | none read by legacy (no config loader in the file [READ whole file]) | ② starts reading §5 vars | none | — | 58 at ② |

### CONSUMERS (emits[].consumers + `consumer-registry.json` rows + grep for undeclared readers)
`consumer-registry.json` has **0** zoning rows today [MEASURED node scan of the file] — gate D's completeness scan must therefore see `enrich_parcels` declared in `emits[].consumers` at ②.
| File | READ | Touched | Behaviour impact | Registration | Spec updated |
|---|---|---|---|---|---|
| `scripts/lib/compute/enrich-parcels.js` `readZoningContract` | hits [READ :165-200, :219-260, :296-310] | no | HALTs if the latest `sources:load_zoning` run is `failed`, if no completed run carries an object `zoning_layers_loaded`, or if `.base!==true`; overlay keys `false` ⇒ overlay skipped (`staleOverlays`); incremental scope compares `zv.source_dataset_version > p.zoning_enriched_at` | 65 | — (Guardian fences the producer contract) |
| `scripts/enrich-parcels.descriptor.json` | hits (:23-25, :84, :541) | no | reads base/height/lot_coverage tables | 65 | — |
| `scripts/seeds/lineage-meta-snapshot.json` | hits (:2806-2911, :3207-3405) | ③ regenerated if its generator is in `cutover-generators.json`, else untouched | none | generated | — |
| `src/lib/admin/funnel.ts` | hits (:280, :667, :953) | no | slug/table labels | 26/30 | — |
| `src/components/FreshnessTimeline.tsx` | hits (:42) | no | label | 26 | — |
| `scripts/analysis/step-validate.mjs` | hits (:5020-5056 selfTest fixtures use the slug) | no | none | 124 | — |
| `scripts/steps/_schema/{step-archetype-census,programme-items,step.schema}.json`, census fixtures | hits | census row ③ (cutover); programme items CLOUD-PRE/VEL-1/VEL-2 all `BUILT` [MEASURED] | none | 122/124 | — |
| `scripts/surfaces/**` (F16 contracts, `contracts.json`) | hits (notes text only) | no | none | surfaces census | — |
| `scripts/lib/assert-global-coverage-fields.js` | hits (zoning_class coverage vars) | no | reads `parcels.zoning_class` (downstream of enrich_parcels, not this table) | 41/43 | — |
| `src/lib/db/generated/schema.ts` | hits (generated types) | no | none | generated | — |
| `scripts/load-heritage.js:36` | hits (comment) | no | none | — | — |

### TESTS (`src/tests/steps/load_zoning/**` + every test naming the script or its tables)
| Test | READ | Touched | Behaviour impact | Spec |
|---|---|---|---|---|
| `zoning.logic.test.ts` (292 L) | hits: all 44 `it(` names | ② re-point IN PLACE at the compute (never weakened) | none | 58 |
| `source-version.logic.test.ts` | hits (:40, :69, :226) | ② re-point `load-zoning.js` wrapper case to `lib/step/staleness.js` (ravines precedent) | none | 122 |
| `zoning-bylaw-areas.regression.test.ts` | hits + L1-30, all `it(` | verify green (reads migration + manifest only) | none | 58 |
| `db/zoning.db.test.ts` | hits (imports `geomColumnSql`) | verify green (`npm run test:db`) | none | 58 |
| `db/enrich-parcels.db.test.ts`, `db/enrich-parcels-incremental.db.test.ts` | hits (seed zoning rows / a `sources:load_zoning` ledger row) | no — they pin the CONSUMER contract shape this plan freezes | none | 65 |
| `parcels-zoning-columns.regression.test.ts`, `chain.logic.test.ts:168-170`, `quality.logic.test.ts:506,631-634` | hits | no (chain order unchanged) | none | 43/65 |
| `pipeline-advisory-lock.infra.test.ts:32` | hits | verify (lock 58 via `identity.lock`) | none | 47 |
| `admin-manifest-utils.logic.test.ts:57`, `step-schema.logic.test.ts:443` | hits | no | none | 26 / 122 |
| `load-centreline.infra.test.ts:97-101`, `load-heritage.infra.test.ts:104-107`, `steps/load_ravines/violations.test.ts:1607` | hits (negative `geometry-validator` locks) | no | none | 62/61/59 |

## 2. Current-behaviour ledger (`scripts/load-zoning.js`) → converted seat
| # | Legacy construct [READ line] | Converted seat |
|---|---|---|
| 1 | 10-entry `LAYERS` registry (resourceId, table, geomKind, column map with kind/min/max/maxLen) :66-190 | 10 `inputs.reads.externals[]` (0y) bound 1:1 to 10 `outputs.writes[]` (0x); column map = compute vocabulary (Rule 4, `notes.json`) |
| 2 | `package_show` once → per-resource `last_modified ‖ metadata_modified` :350-358; failure ⇒ INFO `skip_check_error` and proceed :592-594 | 0y `source_validator` style `ckan_metadata` + `on_head_error:"warn_row"` analogue; ZN-D6 pinned |
| 3 | Skip iff prior version exists AND every layer unchanged (R2-12) :597-601; 730-d force reload (F-M4) :54 via `source-version.js:184-197` | 0x `skip_scope:"all_primaries"`; `force_reload_max_age_days_from_config` (0y) |
| 4 | Skip run re-emits the full §9 contract from prior + `no_op_refresh` INFO, `records_total:null` :601-620 | library skipEmit (single-primary today) generalised in 0x; lock: skip emit carries all 5 keys (the consumer HALTs otherwise — the LC-D5 class) |
| 5 | `datastore_search` offset pagination, page 10,000, 30 s timeout, 5 redirects, no retry :44-45, :58, :335-385 | 0y (page size/timeout/redirects from config; retries via existing `network.retries` = 0 for byte-identity) |
| 6 | Layer order base-first; base fetch/load error or `ok:false` ⇒ throw ⇒ FAIL :636-670; overlay error ⇒ WARN `<layer>_fetch_error`/`_fetch_skipped`/`_load_error`, continue :637-661; F-M3 sentinel :650, :672 | 0x per-target `required:true` (base) / `false` (overlays) + declared order; sentinel emitted by `buildLoadMeta` from the runner's per-target outcomes |
| 7 | Empty layer: base FAIL / overlay INFO + `orphan_delete_skipped` :395-399 | declared checks (`viol == 0` on base loaded>0) + library F-C1 empty guard (`shouldSkipDelete`) |
| 8 | Attr drift on `records[0]` only; missing required ⇒ base FAIL / overlay WARN+skip; extras ⇒ WARN :401-410 | `shapeRecord` throws on missing required (0x routes the throw by `required`), extras ⇒ 0p tag + declared WARN check; ZN-D3 pinned |
| 9 | Per-record: null geometry skip, `_id` coerce (positive int) skip, `coerceColumn` (-1 sentinel ⇒ NULL cell, count; TEXT truncate `maxLen`), HT_LABEL strict parse :411-434, :203-225 | `coerceKey`, `shapeRecord` returns shaped row + tags `out_of_range_nulled`, `unparseable_height` (0p tallies) |
| 10 | Dedupe reject-ALL rows sharing a key (base FAIL / overlay WARN) :436-438 | compute `dedupeBySourceId` (step-owned, reject-all form) + declared checks |
| 11 | Geometry validation 1,000-row batches via `geometry-validator.js`; line layers need length>0 AND simple; all geoms `ST_Multi` :446-461 | `write.validateGeometries` — polygon arm ✓ (Multi); **line arm is NOT Multi-wrapped and has no length/simplicity test** [READ geometry_kind schema description] ⇒ 0z1; batching retired (LC-D12 precedent, declared deviation) |
| 12 | Invalid-polygon status: base INFO 0 / WARN ≤50 AND ≤0.5% / FAIL; overlays WARN>0 :462-474 | two checks with `limit_from_config` (§5) |
| 13 | Upsert SET includes `source_dataset_version`, guard excludes it :491-493 | `guard_columns` = data cols + `geometry` + `geom` (NOT `source_dataset_version`) — reproduces ZN-D2 exactly |
| 14 | Departure DELETE NOT EXISTS vs keys temp table, same txn :487, :515-524 | class B departure delete (by intent), `txn_scope:"step"` per target |
| 15 | Orphan % vs pre-delete count INFO ≤0.5 / WARN ≤2 / FAIL >2 (F-H1) :267-273, :526 | check `orphan_removed_pct` `limit_from_config` ×2 bands |
| 16 | `unchanged = Math.max(0, loaded - inserted - updated)` :537 | library measured `unchanged` (simplification item 8); ZN-D1 retired by the library, pinned in ① |
| 17 | Baselines read from the prior run's audit rows: loaded_pct, with_exceptions, null counts, duration :541-564 | declared checks over `ctx.prior`; ZN-D7 pinned |
| 18 | Base-only counters (P-C1) :696-700 | `counters` from `written.zoning_bylaw_areas` |
| 19 | `emitMeta` 10 sources / 10 tables :702-706 | library-derived from descriptor |
| 20 | Lock 58; DB clock; `PIPELINE_NAME` hard-coded `sources:load_zoning` for standalone prior reads :38, :42 | `identity.lock:58`; `ledgerPipelineName` ⇒ standalone reads `load_zoning` — ZN-D11 declared deviation (LC-D7 precedent) |

## 3. Defect ledger (Spec 121 §4.3 — PIN wrong-form in ①, fix only after ③)
| ID | Finding [evidence] | Disposition |
|---|---|---|
| ZN-D1 | `unchanged` derived by subtraction :537 (simplification item 8 names `load-parcels.js`/`load-address-points.js` only) | add `load-zoning.js:537` to item 8's offender list; library measures it at ② |
| ZN-D2 | `source_dataset_version` in SET but not in the guard :491-493 ⇒ unchanged rows keep the old stamp; harmless to `enrich_parcels` incremental scope (changed rows carry the new one) | carry (declared `guard_columns`), limitation |
| ZN-D3 | attr drift checked on `records[0]` only :402 | carry; limitation |
| ZN-D4 | offset pagination without `sort` :375-383 (CKAN default order assumed) | carry; ① lock that page N+1 dedupe/key counts are recorded; post-conversion fix candidate (`sort=_id`) |
| ZN-D5 | 18 module/inline threshold literals :43-58, :472 | CLOSED at ② by externalisation (§5), defaults byte-equal |
| ZN-D6 | `package_show` failure ⇒ INFO row claims "proceed", but every layer's version becomes `String(runAt)` :595, :633, which PostgreSQL rejects as TIMESTAMPTZ [MEASURED: `SELECT 'Sun Sep 27 2026 20:49:19 GMT-0400 (Eastern Daylight Time)'::timestamptz` ⇒ `time zone "gmt-0400" not recognized`] ⇒ base upsert throws ⇒ step FAILs | pin wrong-form (the INFO row lies about the outcome); ④a fix: `warn_row` + null validators ⇒ load with version NULL, or FAIL by name — operator picks in the fix WF |
| ZN-D7 | every baseline comparison reads the latest COMPLETED run, which after any skip holds only `no_op_refresh` rows ⇒ loaded_pct / with_exceptions / null-count / duration guards are vacuous on the first real load after a skip [MEASURED run 1484 audit rows: license, no_op_refresh, age, sys_*] ; Spec 58 F-M5/F-H11 promise a first-known-good / 400-day baseline [READ 58:253, :287] | pin; ④b fix (baseline = latest run whose meta carries the metric) |
| ZN-D8 | force-reload window measured from the PUBLISHER's `last_modified`, not the load ⇒ after 2028-02-20 every run force-reloads and `dataset_version_age_days` FAILs (>730) until the publisher refreshes | carry; `why` names it (R-H standing-FAIL risk) |
| ZN-D9 | skip path emits `records_total/new/updated: null` :609-611 (ledger stores 0 [MEASURED runs 1291-1484]) | declared; converted skip terminal emits 0 |
| ZN-D10 | Spec 58 §3 step 0a says "HEAD each CKAN resource URL"; code uses one `package_show` [READ 58:206 vs load-zoning.js:350-358] | correct the spec to the code at ② (AP-D1 precedent) |
| ZN-D11 | standalone runs read the chain-scoped prior | declared deviation (LC-D7) |

Not defects (grounded): `coverage_max_pct` NULL on 11,719/11,719 base rows [MEASURED] is by design — Toronto leaves `COVERAGE` blank, coverage lives in `lot_coverage_overlay` (Spec 58 §11 D10 [READ]); `fsi_max` non-null 2,835 = 11,719 − 8,884 [MEASURED] matches D10's "~2,835"; 78,744 base cells nulled by the −1 sentinel on run 1085 [MEASURED audit row] is D9 by design.

## 4. Library prerequisites (Spec 124 §7 rung ladder; each its own commit, orchestrator-lands, INGESTOR goldens recaptured `--compare` 0 diffs; RE-FREEZE numbers = next free at landing, NOT pre-assigned — #26 is taken by `27ca5bea` and 0w claims the next)
* **0x — N primaries → N write targets (SHARED; designed in `.cursor/batch2_load_heritage_active_task.md`, not here).** Zoning needs from it: 10 primaries each bound to one target; declared order; per-target `required` (base `true` ⇒ throw aborts the step; overlay `false` ⇒ WARN row + target skipped, run continues); per-target txn; `skip_scope:"all_primaries"` (zoning R2-12) vs heritage's `per_primary` (DEC-K); per-target outcome surfaced to compute for `zoning_layers_loaded`; skip-run re-emit of the prior contract. If the heritage design omits any of these, the gap is raised on THAT plan before code — never a zoning-local hatch.
* **0y — CKAN DataStore acquisition** (`kind:"http_api"`, new `format:"ckan_datastore"`): paginated `datastore_search` (page size, timeout, redirect cap from config); records' non-geometry fields ⇒ `record`, the GeoJSON string ⇒ `geojson`, `_id` ⇒ key; `package_show` `last_modified‖metadata_modified` per resource as the `source_validator`; staleness style `ckan_metadata` with `force_reload_max_age_days_from_config` (the lib function already exists [READ source-version.js:184-197]; `lib/step/staleness.js` has no caller for it [MEASURED grep `CKAN_METADATA` in `scripts/lib/step/` = 0 hits]). Single consumer (zoning) — cheaper rung checked: 0v `geojson` download would change the upsert key (`_id` exists only in the DataStore, Spec 58 D8 [READ 58:619]) ⇒ behaviour change ⇒ rejected.
* **0z1 — `geometry_kind` line arm: Multi-wrap + length/simplicity.** Legacy stores `MultiLineString` [MEASURED `GeometryType` = MULTILINESTRING ×8,913] and discards non-simple / zero-length lines [READ geometry-validator.js `geometryValidationSql`]; the library `line` arm does neither (centreline stores LineString). Declared as an option on the existing arm (e.g. `geometry_multi:true` + the F-M9 test), default off ⇒ `load_centreline` byte-identical.
* **Covered by existing declarations — no rung:** reject-all dedupe (`compute.dedupeBySourceId` is step-owned [READ index.js:879]); raw `geometry` JSONB column (compute emits it from `ctx.geojson`, `bind:"value"`); NOT EXISTS departure delete (class B by intent, §2 row 14); required-column drift (`shapeRecord` throw, centreline F13 precedent); per-column `-1` nulling (compute).
* **Scale:** 2 zoning-only rungs + 1 shared. That is the largest prerequisite set of any C5 INGESTOR ⇒ Operator decision O1.

## 5. Logic variables (every one `on_invalid:"fail"`; seed defaults byte-equal to legacy; admin GROUPS via the generator)
| Legacy literal [READ] | Registered name | Consumer |
|---|---|---|
| `BATCH_SIZE` 1000 :43 | retired — library validator single call (declared deviation, LC-D12) | — |
| `DATASTORE_PAGE` 10000 :44 | `load_zoning_datastore_page_size` | 0y |
| `HTTP_TIMEOUT_MS` 30000 :45 | `load_zoning_http_timeout_ms` | `network.timeout_from_config` |
| `MAX_REDIRECTS` 5 :58 | `load_zoning_max_redirects` | 0y |
| `ORPHAN_INFO_PCT` 0.5 / `ORPHAN_WARN_PCT` 2.0 :48-49 | `load_zoning_orphan_warn_pct` / `_fail_pct` | orphan check `limit_from_config` |
| `LOADED_PCT_PASS` 95 / `_WARN` 90 :50-51 | `load_zoning_loaded_pct_warn_below` / `_fail_below` | loaded_pct check |
| `AGE_INFO_DAYS` 450 / `AGE_FAIL_DAYS` 730 :52-53 | `load_zoning_dataset_age_warn_days` / `_fail_days` | age check |
| `FORCE_RELOAD_STALE_DAYS` 730 :54 | `load_zoning_force_reload_max_age_days` | 0y staleness |
| `NULL_COUNT_WARN_OVER_PCT` 10 :55 | `load_zoning_null_count_warn_over_pct` | null-count check |
| `WITH_EXCEPTIONS_WARN_BELOW_PCT` 50 :56 | `load_zoning_with_exceptions_warn_below_pct` | exceptions check |
| `DURATION_WARN_FACTOR` 2 :57 | `load_zoning_duration_warn_factor` | duration check |
| invalid-polygon 50 / 0.5 :472 | `load_zoning_base_invalid_polygon_warn_max_count` / `_warn_max_pct` | base invalid-polygon check |
| `topNDistribution` n=20 :298 | `load_zoning_distribution_top_n` | distribution emit |
| `86400000` :294 | none — `MS_PER_DAY` from `scripts/lib/units.js:28` (gate E closed answer) | age |
Column min/max/maxLen in the layer map are the migration-164 CHECK mirror (domain schema facts, not tunables) — see gate E row.

## 6. Five-word gate plan (Spec 124 §5 R-BA; ZERO `standard-gates-ledger.json` rows — hard stop for a new conversion)
| Word | Gate | Closed answer load_zoning uses | First passes at |
|---|---|---|---|
| STANDARDIZED | A closed bounds (#28) | every `checks[].limit`/`warn_limit` = `limit_from_config` naming a §5 variable, or `viol == 0` (base loaded>0, base duplicate/attr-drift) | ① (gates from ①, simplification item 1) |
| | I registries (#33-#36) | banned-value coverage, staleness-disposition row for `load_zoning`, census parity (INGESTOR), ZN-D ids unique in `defect-ledger.md` | ① |
| OBSERVABLE | C emits≡declared (#30) | `emits[]` = the 5 §9 keys + `audit_table`, exactly the POST-captured keys minus `RUNNER_META_KEYS` | ② |
| | D consumer registry (#31) | `emits[0].consumers:["enrich_parcels"]`; generated registry rows typed against the POST capture; `readZoningContract` then no longer an `undeclared-consumer` | ② (registry regenerated ③ by `npm run cutover`) |
| SCALABLE | B `on_invalid` (#29) | all §5 variables `fail`, no deviations | ② |
| | E compute literals (#32) | registered variable \| `units.js`. **Risk:** if gate E flags the layer map's `min:0/max:100/maxLen` (object properties, not module-level numeric constants — the rule ids [READ gates/compute-literals.mjs:31-37] target module-level constants and SQL bounds), that is an exception ⇒ **STOP → O3**, not planned around | ① dry-run on the red-suite fixture compute |
| UNDERSTANDABLE | F score floor 14/17 + LF (#37) | scorecard ≥14/17; every new file LF (hygiene WF `.gitattributes`) | ③ (`--write`) |
| | J spec-staged hook | Spec 58 staged with ① (Target list), ② (as-built §2/§3/§11/§5), Spec 43 with ③ | ①②③ |
| ACCURATE | G forced-nonzero + explained diffs (#38-#40) | EVERY one of the 10 targets shows nonzero writes in PRE and POST (perturbation §8); G8 diffs listed in `explained-diffs.json` | ② |
| | K red-evidence (#41) | committed vitest JSON: ② suite run against the ① tree in a throwaway worktree (centreline 407dd91a precedent) | ② |
| | two-run zero-writes (item 7) | run 2 immediately after POST run 1 writes 0 rows on all 10 `idempotent_rerun:"zero_writes"` targets — legacy already does [MEASURED run 1085: 0 inserted, 0 updated, 0 orphans on all 10, `unchanged_skipped` = loaded] | ② |
| | row conservation (item 8) | per target `read = inserted + updated + unchanged + skipped` with `unchanged` measured | ② |
**Canary (past bugs of this class the gates must catch):** −1 sentinel row-rejection nuking the base (Spec 58 §12 [READ 58:627]) → ① lock "base rows loaded = source rows − skipped" + gate G nonzero; write.js TEXT-key 0-rows (`6457e713`) → gate G per-target nonzero + item 8 conservation (INTEGER key round-trip fixture); LS018 rewrite-every-row → item 7 two-run proof + ① lock that `source_dataset_version` is NOT a guard column; LC-D5 skip-write emit halting the consumer → ① lock skip emit carries all 5 §9 keys; camelCase-constant evasion → gate E; chain-registration cascade (Spec 58 §12) → `npm run cutover`.

## 7. Reality-Check plausibility bounds (REQUIRED — the loader derives `height_max_m` from `HT_LABEL`, nulls out-of-range cells, truncates TEXT)
All bounds are OBSERVATIONS (INFO/WARN audit rows with counts), never clamps — the loader stays faithful to the source (D9).
| Field / invariant | Bound (zone-aware where it differs) | Measured today | Audit row |
|---|---|---|---|
| `height_max_m` | `> 0` and `≤ load_zoning_height_max_m_warn` (seed 350) | 1–22 m over 2,528 rows, 0 zero, 0 >300 [MEASURED] | `height_overlay_unparseable_label_count` (exists) + new INFO `height_out_of_bound_count` |
| `height_max_m / ht_stories` (both present) | 2–6 m per storey | 18 rows outside (all ≤10 m on 1 storey) [MEASURED] | INFO count |
| `fsi_max` zone-aware | R*: ≤10 (the known corrupt R-zone rows enrich_parcels already nulls — `zoning_fsi_source_nulled_count` [READ enrich-parcels.descriptor.json:541]); C*/E*: ≤12 | R: 4 rows >10 (max 30); C: 22 >10 (max 12); E max 7 [MEASURED `left(zn_zone,1)`] | INFO `fsi_gt_zone_bound_count` per zone family |
| `coverage_max_pct` (base) | expected NULL on 100% (D10) | 11,719/11,719 NULL [MEASURED] | existing `coverage_max_pct_null_count`; a non-NULL is a publisher change worth a WARN |
| `coverage_max_pct_override` | 0–100 (CHECK) | 18–90, 0 NULL over 1,242 [MEASURED] | — |
| `pct_commercial_max + pct_residential_max` | ≤ 200 | 0 violations [MEASURED] | invariant |
| cells nulled by the −1 sentinel | count per layer, INFO | base 78,744; height 411 (run 1085) [MEASURED] | existing `<layer>_out_of_range_nulled_count` |
| rows loaded vs source | `loaded = rows_read − null_geom − bad_id − dup_rejected − discarded` per target | — | item 8 conservation |
| geometry validity | 0 invalid / 0 empty stored | base 0/0 [MEASURED] | existing invalid/repaired counts |
Reality-Check runs at PLAN altitude on this table and at OUTPUT altitude on the POST data.

## 8. Commits (`**Commit form: compressed (R-PACE-1)**` — INGESTOR `proven:true`, R-AH default)
- [ ] **0y**, **0z1** (own library WF2s, one commit each, orchestrator-lands + INGESTOR recaptures) — after **0x** lands with heritage.
- [ ] **① assessment + red suite + PRE goldens** — `feat(58_source_zoning_bylaw): batch2 load_zoning ① — assessment + red suite + PRE goldens (INGESTOR, 10 targets, compressed)`.
  * Assessment report: PH-0 boundary freeze (§2 table), Intent Ledger (`git log -S` fences: D3 base abort, F-C1, D9 null-the-cell, R2-17 reject-all, H5 geometry in guard, R2-12 all-layers skip, F-M4), seam map (DB, clock, network, no env), non-determinism inventory (`id` serial, `created_at`, per-layer `duration_ms`, `sys_*`), ZN-D1..D11 → `docs/reports/defect-ledger.md`.
  * `src/tests/steps/load_zoning/violations.test.ts` (SPEC LINK header): D3 base abort / overlay continue, F-M3 sentinel, R2-12 all-layers skip + skip emit with all 5 §9 keys, −1 sentinel nulls the cell and keeps the row, HT_LABEL strict parse, reject-all dedupe, line Multi+simple, guard excludes `source_dataset_version`, INTEGER key round-trip, ZN-D6/D7 pinned. RED by construction. `converted.json.pending` `{stage:"red_suite"}` (orchestrator).
  * `step-validate --step=load_zoning --fast` five-word read recorded (gates from ①).
  * **Forced-change proof (Spec 122 §11 row 9):** the source is unchanged since 2026-02-20 [MEASURED all 10 `zoning_layer_versions`] and the last real write predates run 1085 (2026-06-10: 0 inserted / 0 updated [MEASURED]) — an unforced PRE writes 0 and is VOID. Design: (i) force past the skip (O2); (ii) `docs/reports/golden/load_zoning/perturb.sql` (committed) sets one data column to a sentinel on 1 row in EACH of the 10 tables and deletes 1 row from base and height ⇒ the forced load must write ≥1 update per target + 2 inserts, restoring the canonical rows itself. Same script before PRE and before POST.
  * **PRE:** `psql -f perturb.sql` then `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-zoning.js --chain=sources --tables=<10 tables> --table-columns="<t>:source_id,<data cols>,geometry,geom,source_dataset_version;…" --table-order="<t>:source_id;…" --out=docs/reports/golden/load_zoning/pre/sources.json` (projection excludes `id`, `created_at`), then `--chain=none` ⇒ `pre/standalone.json`.
- [ ] **② descriptor + compute + frozen shell + seeds; POST goldens** — `feat(58_source_zoning_bylaw): batch2 load_zoning ② — descriptor + compute + frozen shell + seeds; POST goldens (zero-diff)` — orchestrator-lands (G8).
  * Briefs (each <5 KB writes, "Gate answers" field filled): `b2-zoning-c2a-descriptor.md` (10 externals, 10 writes, checks, emits+consumers, deviations ZN-D11/LC-D12, limitations ZN-D2/D3/D8), `-c2b-compute.md`, `-c2c-shell-notes-seeds.md`, `-c2d-repoints.md`.
  * POST: capture guard (item 2) must allow; perturb, forced POST ⇒ `post/sources.json`; immediate run 2 ⇒ two-run proof (item 7); `--compare=pre/sources.json,post/sources.json` data hashes identical; explained diffs only. Spec 58 as-built (§2, §3, §5 Target Files, §11 ZN-D10 correction).
- [ ] **③ cutover** — `npm run cutover -- --step=load_zoning` (converted.json + pending delete, census, freeze check, GROUPS/registry docs, consumer registry, roadmap/backlog, system map, `step-validate --all --write`); Spec 43 row 21 as-built; exit gates `npm run step:validate -- --all`, `step-conformance.infra.test.ts`, full `npm run test` (1 fork, pre-push).
- [ ] **④a ZN-D6**, **④b ZN-D7**, **④c ZN-D4** — each its own WF3 RED→GREEN after ③, recapture.
Est. commits: 2 own prerequisites + ①②③ = **5** (+ 0x shared with heritage; + 3 post-conversion fixes).

## 9. Gate answers (for every brief)
A: `limit_from_config` or `viol == 0`, never a number. B: every variable `on_invalid:"fail"`. C: `emits[]` = the five §9 keys + `audit_table`. D: `consumers:["enrich_parcels"]`. E: no numeric literal in compute except `MS_PER_DAY` imported from `units.js`; the layer map's CHECK-mirror ranges are data inside `LAYERS` (O3 if flagged). I: ZN-D ids unique. G/K: orchestrator-owned; briefs never capture.

## 10. Ordering and coupling
One committer; shared registries (`converted.json`, census, `template-freeze.json`, schema-baseline, system map) land only via `npm run cutover` in the orchestrator's commit. Order: neighbourhoods (0w — its runtime refusal "(i) >1 url'd primary" is what 0x lifts [READ wf2_ingest_prereqs_0v_0w_active_task.md:29, :67]) → heritage (designs + lands 0x) → zoning (0y, 0z1, ①②③). `enrich_parcels` (converted) is untouched; `enrich_permits`/`enrich_coa_zoning` read `parcels` zoning columns, not these tables. `manifest.json` `telemetry_null_cols` for load_zoning unchanged (`coverage_max_pct`, `fsi_max`, `frontage_min_m` [READ manifest.json:17]). Captures only while no other seat holds the DB.

## Panels (Spec 08 §6.4)
PLAN: Integration (0x/0y/0z1 fit vs `runIngestPhase`, capture flags, consumer HALT paths), Reality-Check (§7), Idempotency Lens (10 per-target txns, perturb/restore replay), one DeepSeek spec lens grounded by Sonnet. OUTPUT: Regression Guardian (every deleted line of 739 fenced; §9 producer fence), Code Reviewer grounded, Observability (~107 audit rows vs Spec 58 §3), Integration, Reality-Check on POST data.

## Standards Compliance
* **Try-Catch / logError:** no catch in compute (Rule 2; the runner's per-target outcome replaces the legacy layer try/catch); prerequisites' new catches use `logError`.
* **Unhappy Path Tests:** package_show 5xx (ZN-D6 pinned), base fetch 503 ⇒ FAIL, overlay fetch 503 ⇒ WARN continue + F-M3 sentinel, missing required column (base FAIL / overlay skip), empty layer, all-duplicate layer, invalid/non-simple line, lock contention, prior-read error — each a fixture in ①.
* **Database Impact:** NO migration; UPDATE strategy N/A (zero-diff).
* **UI Layout:** N/A.

## Operator decisions
* **O1 — convert now vs defer.** R-BA forbids ledger rows for a new conversion, so the only options are build 0y+0z1 (plus shared 0x) or defer. Recommendation: **build, sequenced last in C5.** Spec 124 R-AQ closes the 20 converted steps' dated ledger rows at "chain_sources conversion complete", which cannot happen while `load_zoning` (a `sources` step [READ manifest.json:107]) is unconverted; Spec 122 §8.2 expects the hardest member to discover the hatches, and 0x is paid once for two steps.
* **O2 — forcing the PRE past the all-layers skip.** Legacy has no force path; its prior read is chain-scoped even standalone. Recommendation: a one-commit additive seam in ① — `ZONING_FORCE_RELOAD=1` makes every layer decision non-skip (reason `forced`), unset ⇒ byte-identical — the SAME key the descriptor declares as `override.force_run` at ② (centreline `CENTRELINE_FORCE_RELOAD` precedent), so PRE and POST force identically. Alternative: capture PRE in a scratch clone DB with no prior ledger row (heavier, no legacy edit).
* **O3 — gate E on the layer map (only if ① shows it flags).** Recommendation: keep the ranges as data in `LAYERS` with an ① lock asserting equality with migration 164's CHECK constraints; never a ledger row.

> **PLAN LOCKED. Do you authorize this WF2 plan (0y, 0z1 after shared 0x; then ①②③; then ④a-c)? (y/n)**
> §11 note: `source_dataset_version` stays OUT of the guard (ZN-D2) — adding it would rewrite every row on each publisher re-stamp (LS018 class).
