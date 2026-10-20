# Active Task: batch-2 row 3.10 — `enrich_centreline` conversion (ENRICHER, compressed ①②③, class N `set_based_join_update`)
**Status:** Authorized 2026-09-29 (operator; panel A1–A9 + Reality-Check amendments folded; D1–D5 ruled)
**Queue:** after `load_wsib` ③ and `load_heritage`. One committer. The Fold log at the end governs wherever it differs from the body.
**Workflow:** WF2 (step conversion). Architecture Spec 122, procedure Spec 123, policy Spec 124 (Rules 1–13 + §5 register), method Spec 121 §4.3 (zero behaviour change; defects pinned, fixed after).
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1) for mechanical writes (briefs ≤5 KB, `write_scope`, every brief carries `## Gate answers` per `docs/runbook/engine-brief-template.md`). **claude** for goldens, the perturbation proof, `registry_reserved` edits, `npm run cutover`, `step-validate --write`, and every landing that changes compute (G8). Downgrade reason: verification seats, live DB, registries (Spec 08 §B/§C). Plan draft: engine run `20260929T220521Z-c3bc7bb3` (skeleton only). The orchestrator re-grounded every claim below. Draft errors corrected: the write class is N `set_based_join_update` (the enrich_heritage precedent), not B `guarded_upsert`. `abuts_laneway` IS inside the guard (5 disjuncts, :261-265). The runner has no `staleness.emitReducedSummary` or `write.executeGuardedUpdate`. `emits[0].consumers` is not `enrich_permits`: that step reads only `completed_at`.
**Form:** `**Commit form: compressed (R-PACE-1)**`. ENRICHER already has converted members `enrich_parcels`, `enrich_ravines` and `enrich_heritage` [READ `ls scripts/*.descriptor.json`], so R-AH makes compressed the default. Batch row 3.10 (`.cursor/batch2_c5_active_task.md:345-346`): 627 lines, sources position 14, owners **43 + 62**.
**Unblocked (measured):** every `cutover_prereq` whose `gate.blocks` names `enrich_centreline` is BUILT: CLOUD-PRE, VEL-1, VEL-2, B2-PRICING-ADMIN, B2-DRYRUN-SEAM, B2-OWNER-SPEC-DIFF [MEASURED node over `programme-items.json`]. `EP-PIN-D17` (PARTIAL) no longer lists this slug; it was re-pointed to C6 by R-AQ.1 at `c17471cc`, and `programme-backlog.infra.test.ts:672` asserts that. **No cloud run** until every sources step is converted (operator, R-AQ.1): this step cuts over on local proof only.

## Context
* **Goal:** convert `scripts/enrich-centreline.js` (627 lines [READ full]) to the standard step with zero behaviour change. Every divergence is pinned as `EC-D<n>` or declared as a deviation with precedent. The step must be diagnosable from its own descriptor, notes and audit rows.
* **Target Spec:** `docs/specs/01-pipeline/62_source_centreline.md` (owner: §2 parcels additions :182-189, §3.11 version-skip gate :408-420, §4.3 :447-460, §5 Target :491, §9 `centreline_enrich` :698-717, audit rows :721-736, consumer protocol :738-753, §11 SQL, §11.0 :1048-1053, §12.2 :1140-1148, §12.3a :1269-1275) + `43_chain_sources.md` (row 14 :45, §5 :284). System map rows 43/62 both name the script [READ 00_system_map.md:43,:62]; `owner-spec-diff.logic.test.ts:50-54` locks both specs.
* **Key Files:** `scripts/enrich-centreline.js` → frozen shell. New: `scripts/enrich-centreline.descriptor.json`, `.notes.json`, `scripts/lib/compute/enrich-centreline.js`, `src/tests/steps/enrich_centreline/violations.test.ts`.
* **Database Impact:** NO schema change. The end state of `parcels`' 5 written columns must be byte-identical between legacy and converted runs over the same inputs (G8).

## 1. Target file review (four sections, the step's own registry)
Reproduce with:
```
git grep -n -E "enrich_centreline|enrich-centreline|centreline_enrich\b" -- scripts src ':!src/tests' ':!scripts/surfaces'
git grep -l -E "is_corner_lot|is_through_lot|primary_frontage_street_name|abuts_laneway|centreline_dataset_version_when_enriched" -- scripts src ':!src/tests'
git grep -c -E "enrich_centreline|enrich-centreline|centreline_enrich\b|centreline_dataset_version_when_enriched|is_corner_lot|abuts_laneway" -- src/tests
grep -l -E "abuts_laneway|is_corner_lot|centreline_dataset_version_when_enriched|idx_toronto_centreline_ge(om|og)_gist|address_match_status" migrations/*.sql
```
READ key: **full** = whole file; **hits** = every grep-hit line with context.

### 1a. FILES (the Spec 122 §4.1 set; each must be in Spec 62 §5 `### Target Files`, which today lists only the script at :491)
| File | READ | Touched | Behaviour impact | Registration | Spec same commit |
|---|---|---|---|---|---|
| `scripts/enrich-centreline.js` | full | ② → frozen `pipeline.step()` shell | the whole step; lock 64 :19 | 62 §5 ✓ :491; 43 §5 ✓ :284; manifest :22, :105; census :192-197 `ENRICHER/C5` | 62 §5 as-built ② |
| `scripts/enrich-centreline.descriptor.json` | n/a (new) | ② | declares today's behaviour | add to 62 §5 | ② |
| `scripts/enrich-centreline.notes.json` | n/a (new) | ② | none (interpretation: the 14.5K tail, the no-retraction rule, the 20/13 m model) | add | ② |
| `scripts/lib/compute/enrich-centreline.js` | n/a (new) | ② | port of `readCentrelineContract`, `readLastEnrichedVersion`, `countStaleParcels`, `decideCentrelineMode`, the §11 SQL builder, tallies and diagnostics | add | ② |
| `src/tests/steps/enrich_centreline/violations.test.ts` (+ fixtures) | n/a (new) | ① | red suite | add | ① |
| runner `scripts/lib/step/index.js` (`runEnrichPhase` :3872-4060 full, write seams :4248-4300, shared pass loop :4380, post-phase call :4770-4772, `ledgerPipelineName` :641-646, `REQUIREMENT_PROBES` :515-521) | hits | **no** (§4: no rung needed) | — | Spec 122 | — |

### 1b. DATA (legacy measured reads/writes, each with its migration)
| Object | READ | Touched | Behaviour impact | Migration / registration | Spec |
|---|---|---|---|---|---|
| W `parcels.is_corner_lot`, `is_through_lot` (BOOLEAN NOT NULL DEFAULT false), `primary_frontage_street_name` (TEXT), `centreline_dataset_version_when_enriched` | UPDATE :252-266 | ② via `ctx.joinUpdate` | byte-identical projected golden | `174_parcels_centreline_columns.sql`; Spec 62 :182-189 | 62 §2 ② |
| W `parcels.abuts_laneway` (BOOLEAN NOT NULL DEFAULT false) | :257, :264 | ② | same | `191_parcels_accessory_columns.sql:5,:15` (Spec 65 Phase 3) | 62 §2 ② (column absent from Spec 62 §2 today) |
| R `parcels.id, geom, address_number, street_name_normalized` | :69-74 | no | inputs; `load_parcels` writes both address inputs (`load-parcels.descriptor.json:54,:57`) | — | — |
| R `toronto_centreline` (id, geom, linear_name, linear_name_full, from/to_intersection_id, lo/hi_num_l/r, parity_l/r, feature_code_desc) | :75-83, :531-534 | no | producer `load_centreline` (converted, class C full replace) | mig 173 | — |
| GIST `idx_toronto_centreline_geom_gist` (173), `idx_toronto_centreline_geog_gist` (175), `idx_parcels_geom_gist` (039); fns `normalize_address_number`, `address_match_status` (173, search_path pinned 225); ext `postgis` | :343-372 | no | preconditions → `guards.requires` (kinds `extension`/`index`/`function`/`column` exist [READ index.js:515-521]) | migs 039/173/175/225 | — |
| R `pipeline_runs`: last completed `sources:load_centreline` (:318-338) and last completed `sources:enrich_centreline` (:289-301, audit-row fallback :298-300) | full | no | contract HALT + mode signal | `inputs.reads.steps [{load_centreline, version_pin:"exact"}]` | 62 §3.11 |
| `load_parcels` #418 fence NULLs `centreline_dataset_version_when_enriched` only when `geom` changes [READ load-parcels.descriptor.json:120-125] | hits | no | defines the stale set (EC-D3) | Spec 62 §3.11 | — |
| `logic_variables`: 0 enrich-side knobs seeded. Only `centreline_propagation_coverage_min` (enrich_permits) and `sources_centreline_floor` (assert_data_bounds) exist [MEASURED seeds grep] | — | ② +N rows (§5) | defaults byte-equal ⇒ none | `scripts/seeds/logic_variables.json` | 62 §12.3a corrected ② (EC-D8) |

### 1c. CONSUMERS (`emits[].consumers` + `consumer-registry.json` + grep for undeclared readers)
`consumer-registry.json` holds ONE row naming this slug, as a consumer: `enrich_centreline ← load_centreline centreline_load` [READ :50-56]. No producer row exists; gate D rows are generated at ③.
| Reader | READ | Touched | Reads | Fence / impact | Registration |
|---|---|---|---|---|---|
| `enrich_centreline` itself (next run) | :289-301 | no | `records_meta.centreline_enrich.source_dataset_version`, fallback audit row `centreline_source_dataset_version` | the mode gate: the converted emit MUST keep both keys every run | `emits[0].consumers:["enrich_centreline"]` |
| `scripts/enrich-permits.js` `assertCentrelineEnriched` | :298-332 full | no | `max(completed_at)` over `pipeline IN ('sources:enrich_centreline','enrich_centreline') AND status='completed'`, must post-date `sources:parcels`; coverage `stamp IS NOT NULL / geom NOT NULL ≥ centreline_propagation_coverage_min` | **load-bearing cross-chain HALT** (permits + coa chains). Every converted terminal that legacy landed `completed` must still land `completed`, including the zero-write run (VERIFY-INT-2). It reads no `records_meta` key ⇒ not an emits consumer | 41/42/62 |
| `scripts/lib/compute/enrich-parcels.js` :463, :466, :548-551, :625-657; `lib/max-build.js` :262, :276; `lib/optimal-config.js` :155 | hits | no | the parcel columns (corner/through setbacks, laneway suite) | byte-identical columns ⇒ none | 65/78 |
| `scripts/lib/compute/assert-global-coverage.js` :156-159, :380-383 + fields :133-136, :304-307 | hits | no | permit/coa propagated copies | none | 41 |
| `src/lib/admin/parcel-lookup.ts` :77-78; `src/lib/admin/funnel.ts` :671, :955; `src/components/FreshnessTimeline.tsx` :47, :149 | hits | no | display, table map | gate D corpus (funnel) | — |
| `scripts/analysis/{parcel-field-dump,wf3-centreline-postfix-diagnostic,wf3-corner-groundtruth,wf3-corner-sanity,wf3-laneway-scope,wf3-through-sample}.js` | hits | no | read-only analysis | none | — |
| `scripts/lib/step/write.js` :263, :392, :1873; `lib/compute/load-centreline.js` :545; `load-centreline.descriptor.json` :153, :553; `load-centreline.notes.json` :58, :77 | hits | no | comments naming this step as the LineString/contract consumer | LC-D14 (`features_inserted:0` on the F-C1 preserve path HALTs this step) stays the producer's known_bad | 62 |
| registries: `manifest.json` :22 (`supports_full:false, supports_dry_run:false`), :105; census :192-197; `programme-items.json` LC-4 :419-421 (NOT_STARTED, closes at ②), :1750/:2069/:2101/:2268/:2287/:2306 (BUILT prereqs); `seeds/lineage-meta-snapshot.json` :2676-2680; census fixtures `bad-mismatched-archetype.json:193`, `missing-slug-totality.json:186` | hits | ③ via `npm run cutover` | none | registry_reserved → orchestrator |

### 1d. TESTS
| Test | READ | Touched | Disposition |
|---|---|---|---|
| `src/tests/steps/enrich_centreline/violations.test.ts` | new | ① | red suite (§8) |
| `enrich-centreline.logic.test.ts` (122 L; `require` script :10; grading, cascade, `decideCentrelineMode` :58-73, `BUILD_TEMP_SQL_SCOPED` :75-82, `emitReducedSummary` :84-122) | full | ② re-point IN PLACE at compute | helpers move; the `.replace()` lock :75-82 becomes a builder lock (LC-4) |
| `enrich-centreline.infra.test.ts` (135 L; `readFileSync` script :14; lock/producer :17-23, §11 fences :25-127, cascade :130-134) | full | ② re-point script-text regexes → compute SQL text + descriptor | same facts, never weakened |
| `db/migration-174-centreline-enrich.db.test.ts` (`require` :14; `ec.enrichCentreline` ×14, `ec.assertPreconditions` :294) | hits | ② re-point to the compute pass / guards | the only real-PostGIS §11 proof; must stay a live-DB test |
| `enrich-parcels-accessory.logic.test.ts` (`require` :19; `BUILD_TEMP_SQL`/`UPDATE_SQL` :114-122) | hits | ② re-point to compute | laneway fence |
| `db/enrich-permits-centreline.db.test.ts` :115-120, `enrich-permits-centreline.logic.test.ts` :82-83 | hits | no | consumer fences, stay green UNEDITED |
| `pipeline-advisory-lock.infra.test.ts` :44-46 (lock 64) | hits | no | found via `identity.lock:64` |
| `step-seam.logic.test.ts` :220 ("its only reader, enrich_centreline, is not converted") | hits | ③ | pair count 16 → 17 (`load_centreline → enrich_centreline` goes live); comment updated by cutover |
| `owner-spec-diff.logic.test.ts` :50-54, `programme-backlog.infra.test.ts` :649-672, `quality.logic.test.ts` :513/:541/:643, `chain.logic.test.ts` :1378, `run-chain-selection.logic.test.ts` :12-16, `chain-sources-workflow.infra.test.ts` :187, `step-library.logic.test.ts` :5454, `steps/load_centreline/violations.test.ts` :238/:257-263, `db/load-parcels-ravine-invalidation.db.test.ts` :67, `steps/parcels/**` | hits | no | stay green |
| `control-panel.logic.test.ts` `EXPECTED_LOGIC_VAR_KEYS` | (heritage precedent) | ② +N keys | gate B/F |

**Unread rows: none.**

## 2. Current-behaviour ledger → converted seat
| # | Legacy [READ line] | Converted seat |
|---|---|---|
| 1 | `withAdvisoryLock(pool, 64)`; lock contention ⇒ SDK SKIP :487, :604 | `identity.lock:64`; runner lock + inner subkey [READ index.js:4336-4345] |
| 2 | DB clock `RUN_AT` :489 → `centreline_enrich.completed_at` | runner `clockNow` → `clock.now()` |
| 3 | Producer contract (4 throws: no run, `spec_version≠'1.1'`, `features_inserted≤0`, empty version) :318-338, BEFORE any txn | `execution.enrich_hooks.contract_read:"readCentrelineContract"` (called on `pool` before phase 1 [READ index.js:3944-3959]); `inputs.reads.steps [{load_centreline, exact}]`; `on_missing:"halt"` |
| 4 | Mode gate (P11-1): own last `sources:enrich_centreline` version :289-301; `staleCount` only when unchanged :498-500; `decideCentrelineMode` :420-424 | contract_read also returns `{lastVersion, staleCount, mode}` (same SQL, same order, on `pool`) ⇒ passes read `ctx.contract` [READ index.js:3946-3955]. Decision D1 |
| 5 | `skip` ⇒ no preconditions, no txn, reduced summary :503-507 | pass returns without SQL (0 writes). `guards.requires` still runs first ⇒ declared deviation (EC-D6) |
| 6 | Preconditions inside the txn :343-376: postgis, 3 GIST, **4** columns :357, 2 fns, `toronto_centreline` non-empty | `guards.requires` (ext/index/function/column, same 4 columns, EC-D5); the non-empty probe has no requirement kind ⇒ folded into contract_read (enrich_heritage SRID precedent) |
| 7 | One txn: temp build (full :385 / scoped :382-383) + UPDATE :387 + tally :389-400 | ONE shared phase `centreline_join` (`txn:"shared"`); the pass runs DROP/CREATE TEMP + `ctx.joinUpdate(0, UPDATE_SQL, [v])` + tally on `client` (enrich_parcels multi-statement precedent [READ index.js:4368-4376]) |
| 8 | `BUILD_TEMP_SQL_SCOPED` = two `String.replace` surgeries on comment-bearing anchors :277-283 | one SQL builder with a scope clause (closes programme item LC-4 at ②). Same statement text per mode, proven by a byte-equality test against the legacy strings at ① |
| 9 | 8-CTE §11 chain :64-248 (20 m DWithin :86, validity :87, lane flag :83, cap `rn<=20` :107, corner :127-144, parallel 15° :181, sample step 10.0 :156-177, opposite tol :197, abut 13 m :135/:202, frontage P1/P2/P3 :211-232) | compute SQL verbatim; numbers bound from `ctx.config` (§5) |
| 10 | UPDATE with 5-disjunct IS DISTINCT FROM guard incl. stamp :261-265 | `write_discipline {class:"set_based_join_update", guard:"is_distinct_from", guard_columns:[5], retract:"none", idempotent_rerun:"zero_writes", txn_scope:"step"}` |
| 11 | No retraction: parcels not in temp keep old values :260 | `retract:"none"` + limitation (EC-D4) |
| 12 | Diagnostics after commit on `pool` :524-542 (only in `full`) | `execution.enrich_hooks.post_phase:"computePostPhase"` on `pool` after COMMIT [READ index.js:4770-4772] |
| 13 | 5 graded rows :427-436 (L21 WARN 10 / FAIL 40; name <90 WARN; node-null >50 WARN; addr-null >10 WARN; invalid INFO) + 11 INFO rows :548-558 (full) | `checks[]` with `limit_from_config`; mode-conditional parity (D1) |
| 14 | Reduced modes: 6 INFO rows, verdict literal `'PASS'` :445-476 | the same rows declared as checks; reduced runs report the full-only checks as not-measured PASS (EC-D1 pinned) |
| 15 | `centreline_enrich` block: full shape :571-588; reduced shape :466-474 | `emits[{key:"centreline_enrich", type:"object"}]` built by `computePostPhase`, mode-shaped verbatim (the `heritage_designated_by_zone` object-emit precedent) |
| 16 | counters `records_total:null, records_new:null, records_updated:rowCount` :456-458, :561-563 | ENRICHER A4 ruling (enrich_heritage precedent): `records_total` = scanned, `records_new` = 0. Explained G8 diff |
| 17 | `emitMeta` mode-dependent :477-483, :592-598 | descriptor-derived; explained diff |
| 18 | `round1(1000*x/t)/10` percentages :539-542 | `enrich_centreline_round_scale` (§5), byte-equal |
| 19 | No `--full`, no `--dry-run` (manifest :22) | `override {force_full:"ENRICH_CENTRELINE_FORCE_FULL", force_run:"none", dry_run:"none"}`. force_full is additive (enrich_heritage precedent), declared deviation, needed by the POST capture (§8) |
| 20 | No heartbeat / statement or phase timeout | `heartbeat_minutes_from_config`, `lock_timeout_ms_from_config`, `phases[].timeout_minutes_from_config` (decision D3) |
| 21 | Interrupted prior run: shared txn ⇒ nothing half-written | `recovery.interrupted:"force_full_on_next_run"` (runner folds it into `full` [READ index.js:3887]) ⇒ mode full. Declared |

## 3. Defect ledger (pin wrong-form in ①; fix after ③, each its own RED→GREEN)
Prefix: `step-validate.mjs:783-785` `defectPrefixFor` = slug initials ⇒ **`EC`**. No other census slug maps to `EC` [MEASURED over `step-archetype-census.json`]. Existing census collisions EP (enrich_permits/enrich_parcels), LC (link_coa/load_centreline) and P (parcels/permits) do not involve it. `git grep -E "\bEC-D[0-9]"` → 0. Fast invariant #42 DEFECT-PREFIX-UNIQUE is **uncommitted in `C:/Users/User/Buildo-wt-wsib`** only (`DEFECT_PREFIX_OVERRIDES = {load_wsib:'WS'}`, scans converted + pending [READ that tree's step-validate.mjs:790-796, :2317-2334]); `EC` passes it when it lands.
| ID | Finding [evidence] | Disposition |
|---|---|---|
| EC-D1 | Reduced modes never grade L21 or the 4 WARN diagnostics. Verdict is the literal `'PASS'` :463 and the rows are all INFO :447-454. Unchanged-version runs are ~all runs (quarterly source, Spec 62 §3.11), so the zero-intersection FAIL gate is effectively dark | pin ①; ④a: table-derived zero-pct every run (Rule 10) |
| EC-D2 | `skip` is unreachable in steady state. Out-of-range parcels are never stamped, so `countStaleParcels` :305-313 always counts the ~14.5K tail. Spec 62 :413 admits this; cloud-measured 14,510, zero-pct 2.98% [READ review_followups.md:3140] | pin ① (mode = incremental on the PRE golden); observability only |
| EC-D3 | The stale set is not "exactly {new, moved, never-linked}" (62 §3.11). The #418 fence NULLs the stamp only on `geom` change [READ load-parcels.descriptor.json:120-125], so a changed `address_number`/`street_name_normalized` (P1/P2 frontage inputs, written by load_parcels) never re-stales and `primary_frontage_street_name` stays stale until the next centreline version | declared limitation (enrich_heritage FOLD-I5 precedent); ④ candidate: add both columns to the fence's `set_null_on_change_of` |
| EC-D4 | No retraction. A parcel that leaves the 20 m range keeps its old corner/through/frontage/laneway values (not in temp :242), and its stamp stays NULL/old, so it is recomputed every run and never corrected. **A fix must not stamp it**: stamping destroys the legit-NULL tail signal (review_followups.md:3140) | pin ①; ④b: reset values, leave stamp NULL, own RED→GREEN |
| EC-D5 | `assertPreconditions` TARGET_COLS omits `abuts_laneway` :357 (added by mig 191 after the check was written) | pin: `guards.requires` lists the same 4; ④ adds the 5th |
| EC-D6 | The skip path bypasses every precondition :503-507, so an emptied `toronto_centreline` under an unchanged version lands `completed` PASS | converted runs `guards.requires` + the non-empty probe every run ⇒ declared deviation (differs only in that pathological state, which EC-D2 makes unreachable) |
| EC-D7 | `.replace()` string surgery :277-283 (programme item LC-4) | retired at ② by the builder (row 8); LC-4 → BUILT at ③ |
| EC-D8 | Spec 62 drift: §12.3a :1269-1275 names `centreline_unlinked_parcel_{warn,fail}_pct` + `centreline_parallel_azimuth_threshold_degrees`, never seeded; §12.2 :1146/:1148 promises `applyCentrelineEnrichment` / `validateConfig`, neither exists; §9 :698-717 lacks `source_dataset_version`, `mode`, `parcels_abuts_laneway_true_count` and the reduced-shape keys; §2 lacks `abuts_laneway`; §3.11's filed follow-up (externalize 20/20/13) is closed by §5 | Spec 62 corrected to the code at ② (HR-D5 / LC-D1 precedent) |
| EC-D9 | L30 cap keeps the first 20 segments by `centreline_id`, not by distance :105-107 (arbitrary subset for dense parcels; count in `parcels_truncated_pair_count`) | measure at ① (truncated count); carried, filed |

## 4. Library prerequisites: NONE needed (measured, not assumed)
Every legacy construct maps onto an existing `runEnrichPhase` seam (§2 column 3):
* `contract_read` (pre-txn, on `pool`; return value threaded to passes as `ctx.contract`) [READ index.js:3944-3959]. `staleOverlays` needs `compute.OVERLAY_LAYERS`; absent ⇒ `[]`, no crash.
* A pass receives the raw txn `client` + `ctx.joinUpdate` (class N, structurally refuses INSERT) [READ :4284-4299, :4368-4376, :4380], so the temp-table build and the tally run as in enrich_parcels.
* `post_phase(pool, {passRaw, full, runAt, config, …})` after COMMIT [READ :4770-4772] hosts the diagnostics and the mode-shaped emit.
* `guards.requires` probes ext/index/function/column [READ :515-521]; `full` folds `--full`/`force_full`/interrupted [READ :3887]; `dry_run` seam exists (B2-DRYRUN-SEAM BUILT), declared `"none"` (legacy has none).
* **The one design choice is D1** (keep the 3-mode decision in compute vs retire it as enrich_heritage H-A1(a) did). Neither needs a runner change. VERIFY-INT-1 confirms that a zero-write pass lands the same `completed` status as a writing run.

## 5. Logic variables (all `on_invalid:"fail"`; seeds byte-equal to the literals; admin group "Source Ingestion" like enrich_heritage)
| Legacy literal [READ] | Variable | Consumer |
|---|---|---|
| `UNLINKED_WARN_PCT` 10 :31 | `enrich_centreline_unlinked_warn_pct` | L21 check WARN |
| `UNLINKED_FAIL_PCT` 40 :32 | `enrich_centreline_unlinked_fail_pct` | L21 check FAIL |
| `NAME_COVERAGE_WARN_PCT` 90 :33 | `enrich_centreline_name_coverage_warn_min_pct` | F5b |
| `INTERSECTION_NULL_WARN_PCT` 50 :34 | `enrich_centreline_intersection_null_warn_pct` | F5c |
| `ADDRESS_NULL_WARN_PCT` 10 :35 | `enrich_centreline_address_null_warn_pct` | G4 |
| `CENTRELINE_PROXIMITY_M` 20 :39 | `enrich_centreline_proximity_m` | SQL :86 |
| `CENTRELINE_ABUT_M` 13 :48 | `enrich_centreline_abut_m` | SQL :135, :202 |
| `THROUGH_OPPOSITE_TOL_DEG` 45 :49 | `enrich_centreline_through_opposite_tol_deg` | SQL :197 |
| cap 20 :107, :398 | `enrich_centreline_pair_cap` | SQL + truncated tally |
| `cos(radians(15))` :181 | `enrich_centreline_parallel_tol_deg` | SQL |
| `10.0` m azimuth sample step :156/:163/:171/:178 | `enrich_centreline_azimuth_sample_m` | SQL |
| `round1` + `1000`/`10` :410-412, :539-542 | `enrich_centreline_round_scale` = 10, expression `round1(100·scale·x/t)/scale`, byte-equal because 100·10 = 1000 is exact | pct rows |
| (none) | `enrich_centreline_heartbeat_minutes`, `_lock_timeout_ms`, `_phase_timeout_minutes` | runner (D3) |
SQL math guards `GREATEST(ST_Length, 1.0)` and `LEAST(…, 1.0)` (a divisor floor and a fraction clamp, not tunables) are written down in `notes.json`. The Code Reviewer confirms the gate E answer at ②. The `'laneway'` code and the name/node rules are vocabulary (Rule 4).

## 6. Five-word gate plan — McDonald's Airtight (Spec 124 §5 R-BA; gates run from ①; **ZERO ledger rows, hard stop**)
| Word | Gate | Closed answer this step uses | First passes |
|---|---|---|---|
| STANDARDIZED | A closed bounds | every graded check `limit_from_config` (§5 vars); every INFO/count check `viol == 0` | ② (① has no descriptor) |
| | I registries | census row exists; `staleness-disposition.json` row per `fingerprint_inputs` entry; EC ids unique (#42 when landed); banned values | ① ids · ② disposition |
| OBSERVABLE | C emits≡emitted | `emits[]` = `centreline_enrich` (+ runner-derived keys) = POST captured keys minus `RUNNER_META_KEYS` | ② |
| | D consumer registry | generated row `enrich_centreline → enrich_centreline` for `centreline_enrich.source_dataset_version` (self, dotted path, one resolver); completeness scan finds 0 undeclared readers (enrich_permits reads `completed_at` only) | ②/③ |
| SCALABLE | B on_invalid | all §5 vars `"fail"` | ② |
| | E compute literals | registered var or `units.js`; no numeric module const | ② |
| UNDERSTANDABLE | F floor 14/17 + LF | measured at ②, written at ③ | ② |
| | J spec staged | Spec 62 at ①② (as-built + EC-D8), Spec 43 at ③ | ① |
| ACCURATE | G forced-nonzero + explained diffs | PRE and POST each `records_updated > 0` via the perturbation (§8); every diff in `explained-diffs.json` (counters A4, audit header, emitMeta, additive not-measured rows) | ② |
| | K red evidence | committed vitest JSON of the red run at ① (compute absent ⇒ non-destructive) | ① |
| | two-run zero-writes | POST run 2 immediately after run 1 writes 0 (`idempotent_rerun:"zero_writes"`; the guard includes the stamp) | ② |
| | row conservation | scanned (scope) = updated + unchanged(measured) + out-of-range(not in temp) | ② |
**Canaries (past bugs the gates must catch):** (1) #431 over-flagging: RC share bounds §7 (no gate reads column semantics; stated, not claimed). (2) LS018 rewrite-every-row: two-run proof (stamp in the guard ⇒ run 2 = 0). (3) camelCase literal rename evading the ban → gate E. (4) hard-coded PASS verdict (EC-D1) → Rule 10 row-derived cascade; pinned, not hidden. (5) a zero-write run landing non-`completed` would HALT permits/coa (L24b) → VERIFY-INT-2 + the consumer db test unedited.
**No gate needs an exception.**

## 7. Reality-Check plausibility bounds (derived fields: all 5 written columns)
| Field | Bound | Last measured (source) |
|---|---|---|
| `is_corner_lot` share of valid-geom parcels | ∈ [0.08, 0.14] (≤ 4-way+T ceiling ~13%) | 11.2%, 54,478 (Spec 62 :1052) |
| `is_through_lot` share | ∈ [0.002, 0.03] | 0.98%, 4,764 (:1052) |
| zero-intersection pct (L21) | < `unlinked_warn_pct` 10 | 2.98%, 14,510 (followups :3140) |
| frontage resolved / P1 share | ≥ 0.95 / ≥ 0.85 | 97% / 91% (:1050) |
| `abuts_laneway` share | re-measure at ① (no recorded value) | — |
| stamp coverage (L24c) | ≥ `centreline_propagation_coverage_min` 0.9 | 95.1% (RC 2026-09-29; see Fold RC-1) |
Invariants: `is_through_lot ⇒ seg_count ≥ 2`; `is_corner_lot ∨ is_through_lot ⇒ primary_frontage_street_name IS NOT NULL`; stamp NULL ⇔ out of range (the EC-D4 residue counted separately); every stamp equals the producer's current version after a full run. Whether these become descriptor `plausibility[]` entries at ② is decision D4. All numbers are re-measured at ① (this seat has no DB).

## 8. Commits, captures, forced-change proof (claude; Spec 123 ①②③, capture LAST)
- [ ] **① assessment + red suite + PRE goldens + red evidence**: `feat(62_source_centreline): batch2 row 3.10 ① — assessment + red suite + PRE goldens (enrich_centreline, ENRICHER class N, compressed)`. Report `docs/reports/2026-XX-XX-batch2-p3-10-enrich-centreline-assessment.md` with the literal `**Commit form: compressed (R-PACE-1)**` line (fast invariant #24). It covers: PH-0 freeze = §2; intent ledger via `git log -S` per fence (#431 abut-both, #431-FU laneway, #431-FU2 `abuts_laneway`, WF2 proximity, P11-1 gate, #418 fence, lock 64, `'1.1'` pin); seam map (DB, clock, env); EC-D1..D9 → `docs/reports/defect-ledger.md`; non-determinism inventory BEFORE the first golden (`tmp_*` temp, `completed_at`, `duration_ms`, `centreline.id` order in the cap). Red suite (SPEC LINK Spec 62), each RED value stated: contract 4 throws; mode 3-way incl. `ctx.full` ⇒ full; builder byte-equal to the legacy full/scoped strings; guard = 5 columns incl. stamp; class N refuses INSERT; corner/through/lane fixtures (port `CE-LANE-*`); reduced-shape emit; EC-D1/D4/D5 pinned wrong-form. `converted.json.pending {stage:"red_suite"}` (orchestrator).
- [ ] **② descriptor + compute + frozen shell + seeds; POST goldens**: `feat(62_source_centreline): batch2 row 3.10 ② — descriptor + compute + frozen shell + seeds; POST goldens (zero-diff)`. Briefs `b2-row3.10-c2a-descriptor.md`, `-c2b-compute.md`, `-c2c-shell-notes-seeds.md`, `-c2d-repoints.md` (§1d tests re-pointed in place), each with Gate answers (§9). Seeds applied locally, VALUES verified. Spec 62 as-built in this commit.
- [ ] **③ cutover**: `npm run cutover -- --step=enrich_centreline` regenerates converted.json + pending delete, census, freeze, groups, consumer registry, roadmap, system map, `step-validate --all --write`. **Owner-spec obligation (R-BB, fast invariant #43):** this commit stages **Spec 43** (row 14 as-built) **and Spec 62**, or the census row declares `spec_diff:"N-A"`; not N-A here. Exit: `step:validate --all`, `step-conformance.infra.test.ts`, full `npm run test` (1 fork). Merge serially.
- [ ] **④a EC-D1 · ④b EC-D4 · ④c EC-D5 (· EC-D3 if ruled)**: each its own `fix(62_…)` RED→GREEN with spec text and a recapture.

**Capture recipe (superseded in part by Fold A9 + RC-1).** Steady state is NOT zero-write today: 9,902 new in-range parcels are unstamped (RC-1). Once they are enriched, both sides run `incremental` and write 0, so a write-exercising differential is mandatory. It follows the enrich_heritage FOLD-I1 committed-perturbation precedent [READ batch2_p2_2_enrich_heritage_active_task.md:319-339].
1. Backup: `CREATE TABLE parcels_centreline_bak_<date> AS SELECT id, is_corner_lot, is_through_lot, primary_frontage_street_name, abuts_laneway, centreline_dataset_version_when_enriched FROM parcels;` Dump the cohort pre-values to scratch. Restore-on-failure is part of the procedure.
2. Cohort: a seeded random ~2,000 stamped in-range parcels that must include corner, through and laneway members. The tail is the negative control, never perturbed.
3. COMMIT the perturbation, flipping values as well as the stamp so that "wrote nothing" cannot hash-equal the baseline: `UPDATE parcels SET centreline_dataset_version_when_enriched=NULL, is_corner_lot=NOT is_corner_lot, is_through_lot=NOT is_through_lot, abuts_laneway=NOT abuts_laneway, primary_frontage_street_name=NULL WHERE id = ANY($cohort)`. Assert the hash differs.
4. PRE sources: `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-centreline.js --chain=sources --table-columns="parcels:id,is_corner_lot,is_through_lot,primary_frontage_street_name,abuts_laneway,centreline_dataset_version_when_enriched" --table-order=parcels:id --out=docs/reports/golden/enrich_centreline/pre/sources.json`. Expect mode `incremental`, `records_updated` = cohort size (exact number recorded), and the hash = baseline. Re-perturb, then `--chain=none` ⇒ `pre/standalone.json`.
5. After ②: re-perturb, POST sources (same flags) ⇒ `post/sources.json`; the two-run proof and the same-session guard run inside the tool. Re-perturb, POST standalone. `--compare=pre/X,post/X`: data hash identical on both.
6. **Full mode**: if a local `load_centreline` run brings a new `source_dataset_version` at ① (HEAD CKAN first), capture PRE full naturally, restore from the backup, then POST with `ENRICH_CENTRELINE_FORCE_FULL=1` ⇒ `{pre,post}/sources_full.json`. Otherwise decision D2. Never fake a ledger row.
7. Drop the backup once both hashes match the baseline.

## 9. Gate answers (the brief field)
* `checks[].limit` → `limit_from_config:<§5 var>` or `"viol == 0"` (A); no bare number in the descriptor.
* every `config.logic_variables[].on_invalid` → `"fail"` (B); no `deviations[]` naming `on_invalid`.
* compute numerics → `ctx.config.<var>` or `require('../units')` (E); no `const X = <number>`.
* `emits[0]` → `{key:"centreline_enrich", type:"object", consumers:["enrich_centreline"]}` (C/D).
* `outputs.writes[0].write_discipline` → `{class:"set_based_join_update", guard:"is_distinct_from", guard_columns:[is_corner_lot,is_through_lot,primary_frontage_street_name,abuts_laneway,centreline_dataset_version_when_enriched], retract:"none", idempotent_rerun:"zero_writes", txn_scope:"step"}`.
* `identity.lock` → 64; `identity.spec_version` → `"1.1"`; `identity.archetype` → `"ENRICHER"`; `execution.shape` → `"enrich"`, invocation `sources`.

## 10. Ordering / coupling
One committer on the programme branch. This is the LAST ENRICHER (Phase 2 ordering retired by ruling P3). It is independent of 0x and 0fs and may interleave with `load_heritage` / `load_zoning` / `load_wsib`; shared registries serialise every cutover. The producer `load_centreline` is converted, and its `centreline_load` contract is the fence (its violations test :257-263 must stay green unedited). `enrich_permits` (C6, permits/coa chains) is the downstream fence via `completed_at` + stamp coverage.

## 11. Panels (Spec 08 §6.4; §11 grounded)
Batch row 3.10 names a compressed panel (Integration + Regression Guardian; `.cursor/batch2_c5_active_task.md:348`). Because this step writes 5 derived parcel fields, Reality-Check fires by subject matter (Spec 08), which supersedes that row's "Reality-Check-not-fired".
**PLAN:** Integration (VERIFY-INT-1: a zero-write pass lands `completed`; -2: the converted ledger name `sources:enrich_centreline` in both modes and the lock-denied self-skip vs the legacy SKIP, against `assertCentrelineEnriched`; -3: contract_read returning mode data through `ctx.contract`; -4: the post_phase object emit reaches `records_meta.centreline_enrich`; -5: capture flags for a 486K-row `parcels` projection) · Reality-Check (§7 bounds against the live DB) · Idempotency Lens (committed perturbation + restore, two-run, temp table `ON COMMIT DROP`) · one DeepSeek spec lens, Sonnet-grounded.
**OUTPUT (②③④):** Regression Guardian (every deleted line of 627 fenced: #431 / #431-FU / FU2 / P11-1 / #418 / L30) · Code Reviewer grounded · Observability (audit rows ≡ Spec 62 §9 table, row-derived cascade) · Reality-Check on re-run values · Op-Model Compliance at ③.

## Standards Compliance
* **Try-Catch / logError:** no new catch in compute (Rule 2); the runner owns error paths.
* **Unhappy paths (fixtures in ①):** each contract throw; missing index/function/column; empty `toronto_centreline`; lock contention; interrupted prior run ⇒ full; parcels with NULL/invalid geom; all-NULL intersection ids; divided road; laneway pairs.
* **UI:** N/A. **DB Impact:** NO. **§11:** spec read first; SPEC LINK on every test; `pipeline.step()` shell; thresholds in logic_variables; row-derived verdict; spec updated in the same commit per touch.

## Operator decisions (not resolvable from the Spec 124 register)
* **D1 — mode gate.** (a) Port `decideCentrelineMode` verbatim: contract_read resolves the mode, and the pass runs the unscoped/scoped/no-op SQL. Mode, `skip_reason`, `parcels_recomputed` and the full-only graded rows stay mode-exact. (b) Retire the gate into the scope predicate (enrich_heritage H-A1(a)). The data is equal, but the full-mode graded rows and the mode observables Spec 62 §3.11 names would change. **Recommend (a):** zero behaviour change; the mode is an emitted observable.
* **D2 — full-mode golden if CKAN has not moved at ①.** Prove full mode by the re-pointed live-DB test (`migration-174`) + the POST `FORCE_FULL` run compared against the backup baseline, or wait for a version move. **Recommend:** check CKAN first; if unmoved, use the backup-baseline comparison. Never fake a ledger row.
* **D3 — phase timeout.** (a) 240 min (enrich_heritage H-A2 / ravines parity; cloud step measured 59.6 min [READ run-chain.js:143], Spec 62 §3.11 says ~92 min) + heartbeat + lock timeout, declared as a Class-A diff. (b) `"none"` (legacy has none). **Recommend (a).**
* **D4 — plausibility[] at ②** for the §7 corner/through share bounds (enrich_heritage precedent, WARN). **Recommend yes.**
* **D5 — EC-D1/EC-D4/EC-D5 fixes as ④ commits; EC-D3 filed.** **Recommend yes.**

> **AUTHORIZED 2026-09-29 by the operator** (panel recommendations accepted; D1–D5 ruled below). No `src/` code until this plan's turn in the queue.
> §11 note: the three-mode gate is ported, not retired (D1). The reduced-mode hard-coded PASS is pinned as EC-D1 rather than fixed, because changing it inside the conversion would change verdicts on ~every run.

## Fold log — 2026-09-29 (operator approval of panel A1–A9 + Reality-Check amendments; each item re-grounded by the orchestrator)
Panel report: `scratchpad/ec-panel.md` (Integration, Regression Guardian, DeepSeek; verdict READY-WITH-AMENDMENTS). Items marked [RC] come from the Reality-Check seat's live-DB measurement, which this planning seat cannot reproduce (no DB). ① re-measures them before the first golden.

### Operator rulings
* **D1 = (a).** Port the three-mode gate verbatim. Neither option needs a runner rung.
* **D2.** HEAD CKAN first. If it hasn't moved, run POST `ENRICH_CENTRELINE_FORCE_FULL=1` over the **perturbed** cohort and require hash == the backup baseline. A forced full run without the perturbation writes 0 rows and proves nothing (heritage FOLD-I1). The legacy full-mode values come from the re-pointed `db/migration-174-centreline-enrich.db.test.ts`.
* **D3 = 240 min** phase timeout, plus heartbeat and lock-timeout variables. At ③, append `enrich_centreline` to `scripts/steps/_schema/execution-budget-disposition.json` `step_timeout.pending` with an UPDATED note, as heritage and ravines did [READ :91, :105].
* **D4.** The corner/through share bounds become descriptor `plausibility[]` at **WARN only**, and only after A7.
* **D5.** EC-D1, EC-D4 and EC-D5 land as ④ commits:
  * ④a derives zero-pct from the TABLE (stamp NULL over the valid-geom total), never from the scoped temp table.
  * ④b adds a residue counter.
  * EC-D3 is filed.

### Panel amendments
* **A1 — full fold and mode hand-off.** The pass computes `mode = ctx.full ? 'full' : ctx.contract.mode`. contract_read receives only `pool` [READ index.js:3955], so a forced or interrupted run is full only if the pass applies this. Post_phase receives no `contract` [READ :4771], so `{mode, lastVersion, sourceDatasetVersion, staleCount}` must reach it via the pass return (`passRaw`). Red test at ①: forced run ⇒ full; `passRaw` carries all four.
* **A2 — consumers the §1c table missed** (READ, hits; none changes under byte-identical columns):
  * `scripts/enrich-permits.js`: `CENTRELINE_COLS` :41, `emitMeta` :186-187, and the 4-column propagation SELECT to permits/leads :379-448 (same-run read of `parcels`, C6 fence).
  * `scripts/quality/assert-global-coverage.descriptor.json` (16 column hits).
  * `scripts/surfaces/parcel_admin/F08/contracts/contract_admin_parcels_lookup.descriptor.json`, `parcel_admin/F08/surfaces/admin_parcel_cost.descriptor.json`, `parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json`.
  * `scripts/surfaces/_schema/census/{contracts,admin-existing,mobile-product}.json`.
  * `estate_other/F90`, `F91` and `F92` surface/contract descriptors.
  * `scripts/analysis/phase3-accessory-validation.sql`.
  * The §1 grep now drops the `':!scripts/surfaces'` exclusion. The body's "Unread rows: none" is corrected by this row.
* **A3 — emits.** Declare `duration_ms` (type int, consumers `src/lib/admin/funnel.ts`, `src/components/FreshnessTimeline.tsx`) and `code_version` (string, `[]`) beside `centreline_enrich`, matching enrich_heritage [READ its `emits`]. Gate C compares these three keys.
* **A4 — staleness block.** `{trigger:[{signal:"always", position:"pre_compute"}], mode_select:"tri_state", fingerprint:"derived", fingerprint_inputs:["scripts/lib/compute/enrich-centreline.js"], on_fingerprint_change:"run", scope:"valid-geom parcels whose stamp IS DISTINCT FROM the producer version (incremental); all valid-geom parcels (full)"}`, matching enrich_heritage [READ its trigger/mode_select]. Why tri_state: the step really has full/incremental/skip (D1). `staleness-disposition.json` gets one row for the fingerprint input.
* **A5 — builder text.** Full mode stays a **parameterless multi-statement** query (`DROP …; CREATE TEMP …`), with the §5 numerics **interpolated, never bound**. Scoped mode stays DROP-separate + one statement with exactly one `$1`, as the lock in `enrich-centreline.logic.test.ts:75-82` requires. Numbers render byte-exact: `10.0` stays `10.0` (a format helper, not a naive `${n}`). ① test: at default config, the builder output === legacy `BUILD_TEMP_SQL` / `BUILD_TEMP_SQL_SCOPED` / `UPDATE_SQL`, byte for byte. Interpolation is safe because `resolveConfig` refuses anything that is not a finite number [READ config.js:77].
* **A6 — cadence + EC-D8 extension.** At ①, measure the `load_centreline` `source_dataset_version` change cadence from `pipeline_runs` (the version is a content hash). Spec 62 contradicts itself: DAILY at :144/:406, QUARTERLY at :410. EC-D8 now also covers:
  * the cadence contradiction;
  * the §11 UPDATE guard at :1040-1045, which shows 4 disjuncts without `abuts_laneway` (code has 5, :261-265);
  * the §2 DDL :182-189, which lacks the stamp column;
  * the CTE count: the code has 9 CTEs (8 + `parcel_lane`), and the plan's "8-CTE" wording is corrected.
  * Also noted: `pair_cap` caps SEGMENTS per parcel (pairs ≤ C(20,2)).
* **A7 — §7 invariants restated** (replacing the two false ones):
  * (i) stamp NULL ⇒ the parcel is invalid/NULL geom, OR out of range, OR new since the last run (RC-1), OR residue.
  * (ii) After a FULL run, every in-range valid-geom parcel's stamp = the producer version. Parcels out of range keep their prior stamp: EC-D4 residue, counted, not asserted equal.
  * (iii) `is_through_lot ⇒ seg_count ≥ 2`.
  * (iv) `is_corner_lot ∨ is_through_lot ⇒ primary_frontage_street_name IS NOT NULL`.
* **A8 — `records_total` per mode.** full = count of valid-geom parcels scanned by the unscoped build; incremental = count of the scoped set (= staleCount); skip = 0. `records_new` = 0 always; `records_updated` = rows changed by the join-update. Explained G8 diff against legacy `null` (A4 precedent).
* **A9 — capture discipline**, replacing §8 steps 3-5's "re-perturb":
  * Backup name `parcels_centreline_bak_<YYYYMMDDTHHMMZ>`.
  * Before EVERY capture: restore the 5 columns from the backup ⇒ assert hash == baseline ⇒ apply the SAME stored cohort UPDATE ⇒ assert hash ≠ baseline.
  * Never `NOT x` on current values: that un-flips a cohort a failed run left perturbed. The stored UPDATE sets literal values from the cohort file.
  * The seed and cohort ids are committed at ① (`docs/reports/golden/enrich_centreline/cohort.json`).
* **Logic-variable count:** 12 compute + 3 runner = **15** (§5 table). **At ②, all 15 keys are added to `src/tests/control-panel.logic.test.ts` `EXPECTED_LOGIC_VAR_KEYS` [READ :68]** (today's pre-push lesson). The admin groups regen runs via `npm run cutover`.
* **Explained diff — standalone ledger.** Legacy `pipeline.run` writes no ledger row standalone. Converted standalone writes `sources:enrich_centreline` [READ index.js:641-646], and a WARN verdict lands it `completed_with_warnings`. Neither the mode gate nor `assertCentrelineEnriched` reads that status (both filter `status='completed'`). In chain, `run-chain.js:965-967` writes `status='completed'`, so chain behaviour is unchanged. Recorded in `explained-diffs.json` at ②.
* **Owner specs (R-BB #43):** ③ stages Specs **43 and 62**; no N-A.

### Reality-Check amendments [RC, measured 2026-09-29 by the RC seat]
* **RC-1 — unstamped re-baseline.** Unstamped = **14,525** out-of-range tail + **9,902** new in-range parcels (created 2026-09-24, NULL address/street). So "steady state writes 0" is FALSE today: the first run of either side writes ≈9,902 plus the cohort. Capture rule: run the legacy step once BEFORE the backup, so the new-parcel delta is absorbed and the baseline is truly steady. The two-run baseline (run A writes ≈9,902; run B writes 0) is recorded explicitly in the assessment. Then back up, then perturb.
* **RC-2 — coverage** is **95.1%**, not ≈97% (§7 corrected). It stays above `centreline_propagation_coverage_min` 0.9.
* **RC-3 — EC-D4 residue = 6 parcels** (ids listed in the RC report; ① copies them into the assessment). ④b counts them.
* **RC-4 — EC-D3 is unmeasurable** (`parcels` has no `updated_at`), so it becomes a declared **limitation** rather than a quantified defect.
* **RC-5 — frontage percentages are restated with their denominators.** Spec 62's 97% resolved / 91% P1 (:1050) have different bases. ① re-measures `frontage_resolved / valid-geom` and `P1 / frontage_resolved` and records both numerators and denominators.
* **RC-6 — zone-aware bounds.** The share bounds (D4) are also reported per `zoning_class`; they WARN only at city level.
* **RC-7 — proposed invariants and audit-row counts** (all INFO, `viol == 0` or a count, declared at ②):
  * `parcels_truncated_pair_count` (cap-truncated).
  * `parcels_abuts_laneway_default_count` (in-range parcels where laneway = the default false).
  * `parcels_out_of_range_residue_count` (EC-D4).
  * `parcels_new_no_address_count` (valid-geom, stamp NULL, address/street NULL).

## Obligation from registry-truth fold 8/8b/8c (operator 2026-10-02, Phase 2 ruling 8 + (b2))
Before the post-0y POST re-take (needed anyway: #44 FAIL:PRODUCER until C4 lands), set in `scripts/enrich-centreline.descriptor.json`: `staleness.mode_select: "none"` (no enrich runner branch calls selectMode — `scripts/lib/step/index.js` runEnrichPhase) and `staleness.logic_version: "none"` (its trigger is `always`, no code_version comparator; Spec 122 row 14 "author override"). Replaces A4's `tri_state` and the `v1-proximity-abut-both` author version. Both edits are descriptor-only and precede the capture, so the re-taken POSTs carry them (no second recapture).
