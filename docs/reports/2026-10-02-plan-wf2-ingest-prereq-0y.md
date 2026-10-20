# Active Task: INGESTOR library prerequisite 0y — CKAN DataStore acquisition + `ckan_metadata` gate + all-primaries skip (for load_zoning)
**Status:** Authorized 2026-10-02 — panel-folded; second fold (Cross-read) 2026-10-02
**Workflow:** WF2 (library enhance). Spec 121 §4.3 applies: every existing descriptor must stay byte-identical. Each new arm runs only for a descriptor that declares it.
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1, Spec 08 §C) writes code and tests through the briefs in §6. **claude** handles the plan and output seats, the `registry_reserved` edits, the generators, the fleet recapture and the landing commit. The reserved edits are `template-freeze.json`, `schema-baseline.json` and `00_system_map.md` [READ `scripts/lib/exec-policy.json` `registry_reserved`]. Downgrade reasons: verification seats, registries and captures. If the engine is unavailable, the briefs go to claude and the reason is logged. The provider was in outage on 2026-10-01 (PROVIDER_ERROR, per the resume memory; declared-only).
**Parent:** `.cursor/batch2_load_zoning_active_task.md`, authorized 2026-09-27. It cites §2 rows 2–5 (:77–:80), §4 0y bullet (:116), §5 (:125–:131) and §8 (:173). Precedent and format: `.cursor/wf2_ingest_prereq_0x_active_task.md`. 0x landed as `61e83927` and was merged in `5c2da8bc`, RE-FREEZE #29.
**Sibling:** `.cursor/wf2_ingest_prereq_0z1_active_task.md`. It is an independent file set (`write.js` only). §5 recommends landing both under ONE fleet recapture.
**Base:** tip `1f9b8814`. Every `scripts/lib/step/**` cite below is against that tree [READ 2026-10-01]. Re-count the anchors at brief time. One committer. No capture while another seat holds the DB.
**Evidence legend:**
* **MEASURED:** a command or query was executed this session.
* **READ:** what the code or spec text says at that line.
* **enforced:** a lock or gate already fails on violation.
* **declared-only:** a plan claim. The plan names which test or seat will verify it.

## Context
* **Goal:** three things zoning needs that the library cannot do today:
  1. acquire a primary through paginated CKAN `datastore_search`;
  2. gate it with zoning's `package_show` metadata comparison (R2-11 + the 730-day F-M4 force-reload);
  3. decide skip-or-load once for ALL primaries (R2-12). A skip re-emits the prior run's top-level contract keys.

  Each arm is reachable only by a descriptor that declares the new fields.
* **Target Spec:**
  * `122_pipeline_step_optimization.md` §5.1 and the §8 RE-FREEZE log;
  * `122a` new §A19;
  * `124` Rule 1 (rung ladder, `x-ruling`), Rule 3, Rule 10, R-AJ, R-BA;
  * `121` §4.3;
  * the consumer spec `58_source_zoning_bylaw.md`: D8 :628, R2-11/F-M4 :44 and :208, step 0a :206;
  * the shared lib `source-version.js` (Spec 62).
* **Key Files:**
  * `scripts/lib/step/acquire.js`: new `ckanResourceValidators` and `acquireCkanDatastore`; one HEAD branch and one dispatch line in `acquireExternal`.
  * `scripts/lib/step/staleness.js`: new pure `allPrimariesDecision`; `gateRecordsMeta` gains one conditional spread.
  * `scripts/lib/step/index.js`:
    * `multiPrimaryBinding` refusals;
    * the `ingestPrimaries` pre-loop gate;
    * `aggregatePrimaries`: prior and step_gate;
    * `runIngestPhase`: a `validatorCache` parameter, the Y4/Y5 refusals and one argument line;
    * `runWithPool`: two lines (the :5637 `step_gate` carry onto `stepCtx.gate`, and the `skipEmitMeta` spread).
  * `scripts/steps/_schema/step.schema.json`.
  * New tests: `src/tests/ingest-prereq-0y-{schema,acquire,gate,fullrun}.logic.test.ts`.
* **Database Impact:** NO.

## 1. Measured facts (re-grounding the zoning plan's §4 against the current code)
1. **0x already covers part of what zoning needs. Zoning does not re-implement it:**
   * N primaries to N targets [READ index.js:655-701];
   * one txn per target through the narrowed `runIngestPhase` [READ :724-750];
   * per-primary `on_failure` (`abort_step` | `fail_row_continue` | `warn_row_continue`), where a pre_write abort under `abort_step` stops the loop and later primaries become `not_reached` [READ :745];
   * per-target outcome in `acquired.primaries[id]` [READ :772-805];
   * `primary_failed:<id>` rows [READ :857+].

   **Zoning plan re-points that 0x O-3/X4 asked for and that are still owed** (not edited here):
   * row 6 [:81] "`required:true|false`" becomes base `on_failure` absent (`abort_step`) and overlays `warn_row_continue`;
   * row 8 [:83] "0x routes the throw by `required`" becomes "by `on_failure`";
   * rows 3–4 [:78–:79] and the §4 0x bullet [:115] put `skip_scope` under 0x, but it is **here, in 0y**. The 0x O-1 cut was operator-approved on 2026-09-29 [READ 0x plan :364-368].
2. **0x does not cover zoning's skip:**
   * `aggregatePrimaries` always returns `skipped:false, reason:'multi_primary'` [READ index.js:807-808];
   * each primary gates alone against `priorBlock[subKey]`, and that value must be an object [READ :1218-1221];
   * B6 refuses any primary whose `emits[0].skeleton[id]` is not an object [READ :685].

   Zoning's frozen §9 contract has none of that shape. Its records_meta has five top-level keys, and the per-layer versions are STRINGS under `zoning_layer_versions` [MEASURED run 2189: 10 keys, each the string `"2026-02-20T21:29:42.613615"`; `source_dataset_version` is the same string]. Legacy decides ONCE, before any fetch:
   * the skip fires iff `storedVersion && decisions.every(skip)` [READ load-zoning.js:598-601];
   * per layer, the decision uses `storedLayerVersions[l.key] ?? storedVersion` [:599-600].

   **Latent crash:** `emits: [{ ...emit, skeleton: emit.skeleton[id] }]` [READ index.js:732] throws a TypeError in TWO cases [Integration probe, executed]: `emit.skeleton === undefined` (`undefined[id]`), and `emits:"none"` (no `emit`, so `emit.skeleton` dereferences undefined). A STRING skeleton does not throw (`'none'[id]` is `undefined`). B6 hides both today. Relaxing B6 would expose them, so brief 4c guards BOTH and refuses a layer id that collides with a skeleton top-level key (G2).
3. **There is no CKAN acquisition arm:**
   * the `format` enum is `shapefile_zip|csv|geojson|xlsx` [MEASURED node over step.schema.json];
   * `acquireExternal` HEADs `external.url` [READ acquire.js:863] and branches only on those four formats [:967-1004];
   * `grep -n "ckan\|datastore\|package_show" scripts/lib/step/*.js` matches only two comments [MEASURED];
   * `kind:"http_api"` is in the kind enum, but its only declarer is assert_schema's documentation entry (ASSERT, never acquired) [MEASURED `grep '"http_api"' scripts/*.descriptor.json` = 0; READ assert-schema.descriptor.json:24].
4. **The library's tier-1 gate is validator-equality only:**
   * `staleness.skipCheckDecision` hard-codes `STYLE_VALIDATOR_EQUALITY` [READ staleness.js:287-292];
   * `ckanMetadataDecision` exists [READ source-version.js:184-200] but has no library caller [MEASURED grep];
   * that function requires a finite `forceReloadMaxAgeDays` or throws by name [:186-188];
   * its reasons are `no_prior_version` · `no_validators` · `cache_stale_force_reload` · `unchanged` · `changed`.
5. **Legacy acquisition** [READ load-zoning.js]:
   * `httpGetJson` uses `https.get` with a 30 s socket-idle timeout. It follows at most 5 redirects, rejects a non-200 as `CKAN HTTP <code>`, and parses the JSON body [:342-359];
   * `fetchResourceVersions` makes ONE `package_show` call and maps `r.last_modified || result.metadata_modified` [:361-369];
   * `fetchDatastoreRecords` builds `…/datastore_search?resource_id=<id>&limit=10000&offset=<o>` with no sort (ZN-D4). It stops when a page holds fewer than 10,000 records and throws on `success:false` [:371-386];
   * per record, the order is: null geometry → `nullGeometry++`, THEN `_id` coercion → `badSourceId++` [:419-422]. `parseGeoJson`'s order is key first, then geometry [READ acquire.js:694-697].
   * `package_show` failure: an INFO `skip_check_error` row, then every layer's version becomes `String(runAt)` [:592-595, :633]. PostgreSQL rejects that string as TIMESTAMPTZ, so the base upsert throws and the step FAILs with no rows written. This is ZN-D6 [zoning plan :105, MEASURED there]. Operator D3 (2026-10-02): 0y FAILs a `package_show` failure BY NAME before any fetch, and the ZN-D6 fix commit ④a is retired (O-3).
6. **Per-page timing against a total-deadline timeout:**
   * run 1085 (the last real load) took 45 s [MEASURED `completed_at-started_at`];
   * its 10 per-layer DB phases total 16.2 s [MEASURED audit `*_duration_ms`; the timer starts after the fetch, load-zoning.js:391];
   * so roughly 28 s covered 11 `datastore_search` page fetches + 1 `package_show` (I-A8), and no single page approaches 30 s.

   The library's `abortTimer` is a whole-request deadline [READ acquire.js:272-275]. Legacy's is a socket-idle timeout. That is safe at today's sizes (MEASURED inference); zoning ② declares `execution.network.timeout` > 30 s anyway (note for zoning ②).
   * **CKAN clamps `limit` to 32000** [MEASURED live API by the grounder: `limit=50000` returned `result.limit` 32000, `total` 11719]. A page size above the clamp would make `records.length < page` stop the loop early and silently truncate, so the arm checks `result.total` (GR-3, §3b).
7. **Where the version reaches each row.** The runner overrides each row's `source_dataset_version` with `result.acquired.source_dataset_version` [READ index.js:1557-1561]. The http arms set that field to the content hash [READ acquire.js:937]. The CKAN arm must set it to the resource's `package_show` version.
8. **The prior read** returns the whole `records_meta` when `emitKey` is null [READ staleness.js:192-198]. Its SELECT is `status='completed' ORDER BY started_at DESC LIMIT 1` [READ source-version.js:140-141]. That inherits **finding-1** (a `completed_with_warnings` run is never a prior). Witness-unblock C3 (O-1, superseding ruling (a) in part) fixes it in source-version.js before 0y lands; 0y does not change it. 0y's fakePool routes the prior read on `SELECT records_meta FROM pipeline_runs`, never on the status literal, because witness-unblock C3 changes it (I-A5).
   * **HAZARD (Guardian 6 + Obs A6 + Integration A1; orchestrator ruling 2026-10-02):** after C3, a `completed_with_warnings` run can be the prior. Legacy load-zoning.js:686/690 records a FAILED overlay's NEW version, so the next `all_primaries` run would skip that layer. MEASURED by the orchestrator: legacy (unconverted) scripts never write `completed_with_warnings` (only `scripts/lib/step` and run-chain do), and all 6 legacy `sources:load_zoning` runs are `completed`. A legacy overlay failure is therefore ALREADY a prior today: a **carried legacy defect, not a C3 regression**. Ruling: zoning ① pins it as a ZN-D defect (wrong-form, Spec 121 §4.3), fixed after ③ in its own WF3 (the compute emits `null` in `zoning_layer_versions[id]` for any layer it did not load ⇒ `no_prior_version` ⇒ LOAD). 0y adds the generic library lock **T12b** (a prior whose `layer_versions[ov_a]` is null ⇒ `allPrimariesDecision` LOADs). Cross-plan note below.
9. **Every `*_from_config` name is already covered.** The generic suffix walker requires each such descriptor value to be a declared, registered variable [READ src/tests/step-conformance.infra.test.ts:1178-1201], so the new `page_size_from_config` and `max_age_days_from_config` need no new lock (enforced).
10. **The clock.** `clockNow` = `pipeline.getDbTimestamp(pool)` [READ index.js:5562]. Legacy `nowMs = Date.parse(String(runAt))` truncates to whole seconds [READ load-zoning.js:575]. The library uses `clockNow.getTime()`. That is ≤999 ms drift against a 730-day window (declared, §3c).
11. **Gate G scope.** `lib_fingerprint` = sha256 over `scripts/lib/step/**/*.js` [READ gates/captures.mjs:22-31]. **28 POST captures across 11 slugs carry it, all `fc654c54`** [MEASURED node over `docs/reports/golden/*/post/*.json`]. Every lib edit moves it, so the recapture is owed (§5).
12. **RE-FREEZE ordinal.** The highest landed is **#29** [READ 122:1190]. `#30` is PRE-ASSIGNED, unlanded, by registry-truth P3-C3 [READ `.cursor/wf2_registry_truth_active_task.md:240`]. The zoning plan's rule is "next free at landing, NOT pre-assigned" [READ :114]. 0y takes the next free number at landing (provisionally #30 if it lands before P3-C3). 122a: §A18 is the last section [READ 122a:649], so §A19 is next.

## 2. Target file review (FILES / DATA / CONSUMERS / TESTS)
**FILES**
| File | READ | Touched | Byte-identity argument |
|---|---|---|---|
| `scripts/lib/step/acquire.js` | :808-1024 | + `ckanResourceValidators`, `acquireCkanDatastore` (new functions, above `acquireExternal`); `acquireExternal`: `validatorCache` param, a `format==="ckan_datastore"` branch in the HEAD `try` (:863), one dispatch line after the tier-1 return (:913), the unknown-format message names the new value (:1002); exports | non-CKAN external: same HEAD call, same path; `validatorCache` unused |
| `scripts/lib/step/staleness.js` | :80-292, :393-425, :623-639 | + pure `allPrimariesDecision`; export; `gateRecordsMeta` gains one conditional spread of `decisions`/`max_age_days`/`dataset_version_age_days` from `gate.step_gate` (brief 19′) | `allPrimariesDecision` is new; `gateRecordsMeta`: `gate.step_gate` absent ⇒ byte-identical return |
| `scripts/lib/step/index.js` | :641-907, :930-1251, :5620-5660, :6040-6125 | `multiPrimaryBinding` (Y1–Y3; B6 relaxed only under `all_primaries`); `ingestPrimaries` pre-loop gate + narrowing; `aggregatePrimaries` (`prior` + `step_gate` + `reason` only under `all_primaries`); `runIngestPhase` signature `validatorCache` + Y4/Y5 after the `writes.length` check + one arg at :1230-1251; `runWithPool` two lines: the :5637 `step_gate` carry onto `stepCtx.gate` (brief 26′) and the `skipEmitMeta` spread after :6058 (brief 26) | `skip_scope` absent ⇒ every new branch unreachable and `ingest.acquired.step_gate` absent ⇒ :5637 spreads `{}`; `validatorCache` undefined on the single-primary path; Y4/Y5 refuse only a descriptor declaring `ckan_datastore`/a non-default `style` |
| `scripts/steps/_schema/step.schema.json` | externals items, trigger items, staleness, top-level allOf | §3a fields + rules | schema bytes ⇒ RE-FREEZE |
| `template-freeze.json`, `schema-baseline.json` (reserved) | generators | `--refresh`/`--check`; baseline likely `--write` for `staleness.skip_scope` (a new category.field pair, carries `x-ruling`) | expected diff `schema_sha256` + `frozen_at` (no new library-call label inside a `run…` range) — declared-only, verified at landing |
| `docs/reports/generated/122-vocabulary.md`, `00_system_map.md` (reserved) | — | regenerate | — |
| Spec 122 §8 (one line), 122a §A19 | 122:1190, 122a:649 | text | — |

**DATA:** nothing written by the library change. Under `all_primaries`, the pre-loop makes ONE extra `pipeline_runs` read for the whole prior meta. The per-primary reads in each narrowed call are unchanged (0x O-5).

**CONSUMERS**
| Reader | Impact |
|---|---|
| `runWithPool` [READ :5627] | reads `ingest.skipEmitMeta` on a skip (new line); carries `ingest.acquired.step_gate` onto `stepCtx.gate` at :5637 when present (new spread); everything else unchanged |
| `staleness.gateRecordsMeta` [READ :623-639] (the single `records_meta.gate` site, index.js:6077) | spreads `decisions`/`max_age_days`/`dataset_version_age_days` when `gate.step_gate` is present; absent ⇒ unchanged |
| 7 converted INGESTORs (ravines, address_points, parcels, centreline, massing, neighbourhoods, wsib) [MEASURED descriptor scan: none declares `ckan`/`style`/`skip_scope`/`ckan_datastore`] | untouched path |
| `load_heritage` ② (WIP in `Buildo-wt-heritage3`, uses 0x `per_primary`) | none: absent `skip_scope` = `per_primary`; B6 stays enforced for it |
| `load_zoning` ② | first consumer (§3e) |
| `step-validate.mjs:2034` (gate C EMITS-EQUIV `trigger-baseline-missing`: a trigger `emit_key` that no golden POST persists is RED) | zoning's `emit_key:"zoning_layer_versions"` must be persisted by zoning's own goldens (gate C at zoning ②) — enforced |
| each recaptured slug's scorecard (the `*-assessment.md` that `step-validate --write` regenerates; step-conformance R-R stale-scorecard lock) | each recaptured slug's scorecard is regenerated with `step-validate --write` in the recapture commit (§5; precedents `61e83927`, `1f9b8814`) |
| gate G / #39 | fingerprint moves ⇒ recapture (§5) |

**TESTS**
| Test | Disposition |
|---|---|
| `ingest-prereq-0y-*.logic.test.ts` (new, SPEC LINK 122a §A19) | red suite (§4) |
| all `ingest-prereq-0x-*`, `-0w-*`, `-0fs-*`, `-0v`, `-0r`, `-0q` | MUST stay unedited and green (B6 still fires for `per_primary`). The B6 relaxation is scoped to `all_primaries` ONLY, so `ingest-prereq-0x-runner.logic.test.ts:227/411/607/630` stay unedited and green (G1) |
| `ingest-prereq-0v` `:172` (`/no parser/`) | the unknown-format message keeps the `no parser` text when it names `ckan_datastore` (I-A6) |
| `step-schema.logic.test.ts` V5/R6 (`arrayContaining`/`toContain`, :458-473) | unaffected by additions [READ] |
| `source-version.logic.test.ts`, `load-ravines/centreline.logic.test.ts` skipCheckDecision cases | unaffected (`staleness.skipCheckDecision` unedited) |
| `step-library`, `step-row-conservation`, `template-freeze.infra`, `step-conformance.infra`, `system-map.infra`, `gate-captures.infra` | run at landing; FULL `npm run test` before merge (lesson 2026-10-01: 6 cross-file locks surfaced only at push) |

## 3. Rulings
### (a) Schema (five additions; one RE-FREEZE)
1. **`externals[].format` gains `"ckan_datastore"`** (it is `x-frozen`; the description is extended). Rungs tried:
   * (a) the `geojson` arm: the `_id` upsert key exists only in the DataStore (Spec 58 D8 :628). The zoning plan rejects it as a behaviour change [READ :116];
   * (a′) a `kind:"http_api"` sniff: `kind` is a TRANSPORT enum, and the 0b x-ruling already refuses inferring the parser from it;
   * (e) compute I/O: banned (Rule 2).
2. **`externals[].ckan`** = `{resource_id: string≥1, package_url: string≥1, page_size_from_config: string≥1}`, with `additionalProperties:false`, all three required, and its own `x-ruling`.
   * `url` is the BARE `datastore_search` endpoint. The arm builds `${url}?resource_id=${ckan.resource_id}&limit=${page}&offset=${o}`, which is legacy's string byte for byte [READ load-zoning.js:376-377].
   * The resource id is declared ONCE (here), never parsed out of the URL (PD#10).
   * `package_url` is the full `package_show?id=…` URL.
   * Rung (a), putting the fields flat on the external, was rejected: three CKAN-only properties would sit on every external's item.
3. **Item rule Y-I1:**
   * `format:"ckan_datastore"` ⇔ `ckan` is present;
   * it requires `kind const "http_api"` and a `url` matching `^[^?#]+$`;
   * it forbids `on_head_error:"warn_row"`;
   * it requires `target` (I-A7: the arm exists for the multi-primary binding; the item rule carries it, and Y4 below is the runtime twin).

   **Authored forms (GR-2, executed AJV):** each `then` is `required:[field]` + `const` (never a bare `const`, which an ABSENT field satisfies); each "forbid X" is `not:{required:[X], properties:{X:{const:…}}}`, never a bare `not:{properties:…}` (the RE-FREEZE #12 F-1 trap: a bare `not:{properties}` is false whenever X is absent, so it rejects every absent case). `on_head_error` ABSENT on a `ckan_datastore` item is valid.

   Why forbid warn_row: with no version the arm cannot load (§3b). warn_row would therefore be inert (R-AJ), and `fail_step` gives outcome parity with legacy ZN-D6 (FAIL, 0 rows; §3c).

   The existing format x-rule text, which says "a `kind:"http_api"` entry … never reaches the download+parse seam", is reworded to carve out `ckan_datastore`. Otherwise it would go stale.
4. **`staleness.trigger[].style`** is the enum `["validator_equality","ckan_metadata"]` (`x-frozen`, `x-ruling`). Absent = `validator_equality`, which is today's behaviour.
   * **`staleness.trigger[].max_age_days_from_config`** is a string naming a logic variable.
   * **Trigger item rule Y-T1:** `style:"ckan_metadata"` requires all of:
     * `signal const "source_validator"`;
     * `position const "pre_acquisition"`;
     * `max_age_days_from_config`;
     * `emit_key`, an existing field. Here it names the prior emit that maps primary id → stored version string (zoning: `zoning_layer_versions`).
   * The schema values are underscored; `allPrimariesDecision` maps `ckan_metadata` → `STYLE_CKAN_METADATA` and `validator_equality`/absent → `STYLE_VALIDATOR_EQUALITY` (`scripts/lib/source-version.js:125-126`; underscore schema values, hyphenated constants `'ckan-metadata'`/`'validator-equality'` [READ]).
   * Y-T1 is authored in the GR-2 form (`required:[style]` + `const` in the `if`; `required:[…]` + `const` in the `then`), so a trigger with `style` absent never matches it.
5. **`staleness.skip_scope`** is the enum `["per_primary","all_primaries"]` (`x-frozen`, `x-ruling`). Absent = `per_primary`, which is 0x's behaviour.
   * It was NOT named `staleness.scope`: that is the required "which rows" field [0x fact 6].
   * **Top-level M3:** if `staleness.skip_scope` is present, then `inputs.reads.externals` `contains {required:["target"]}`. Declared on a single-primary step, it would be inert (R-AJ).
   * **Top-level M4:** if any trigger declares `style:"ckan_metadata"`, then `staleness.skip_scope const "all_primaries"`, authored as `required:["skip_scope"]` + `const` (GR-2). `skip_scope` present with no `ckan_metadata` trigger is NOT refused by M4 (it is still subject to M3 and runtime Y2).

### (b) The CKAN arm (`acquire.js`)
* **`ckanResourceValidators(ctxFetch, external, timeoutMs, cache)`**
  1. GETs `ckan.package_url` once per run. It is memoised in `cache` (a `Map` keyed by URL holding the promise), never retried (the HEAD analogue, 0q). `timeoutMs` = `resolveTimeoutMs(descriptor, config)` (I-A2).
  2. A non-ok response throws `package_show <status>`; `success!==true` throws `CKAN package_show: success=false` (legacy text [READ :363]). In the `ingestPrimaries` pre-loop (§3c) this throw is UNWRAPPED (not routed through any posture catch): `ingestPrimaries` throws before any `datastore_search` GET and any write, and the step FAILs with `error_message` naming `package_show` (O-A5; operator D3).
  3. It returns `{lastModified: r.last_modified || result.metadata_modified, etag: null}` for the resource whose `id === ckan.resource_id`, or `{lastModified: null, etag: null}` when that resource is not listed (legacy `map[id]` undefined [READ :366-367]).
* **`acquireExternal`:**
  * the HEAD `try` calls this function instead of `headValidators` when `format==="ckan_datastore"`. Same catch, but warn_row is unreachable by Y-I1;
  * after the tier-1 skip return, `if (external.format === 'ckan_datastore') return acquireCkanDatastore(…)`, before any temp root is created. There is no tier-2: §3d refuses a `post_acquisition` trigger on this arm.
* **`acquireCkanDatastore`:**
  * **refusal:** `head.lastModified == null` throws `resource <id> is not listed by <package_url>`, inside the primary. Under 0x postures that gives base `abort_step` → FAIL and overlay `warn_row_continue` → WARN + skip. That is the same outcome as legacy's String(runAt) TIMESTAMPTZ reject (ZN-D6, §1.5), and the row is never written with a NULL version.
  * **page size** = `config[ckan.page_size_from_config]`, which must be a positive integer or the arm throws by name.
  * **the page loop:**
    * each page is fetched with `redirect:'follow'` and the `resolveTimeoutMs` deadline per request, retried per `resolveRetryPolicy` (0q; zoning declares 0);
    * non-ok throws `GET <status> <statusText>`;
    * `success!==true` throws `CKAN datastore_search: success=false (resource <id>)` (legacy text [READ :379]);
    * it stops when `records.length < page` (legacy [:382]);
    * **total check (GR-3):** after the loop, if `result.total` is finite and Σ`records.length` ≠ `total`, throw `CKAN datastore_search: fetched <n> of <total> records (resource <id>)` by name. This catches CKAN's silent `limit` clamp (32000, §1.6) and any mid-run growth.
  * **per record, in legacy order (GR-5e; legacy load-zoning.js:419-420, acquire.js:704-705):**
    1. `rowsParsed++`;
    2. `rec.geometry == null` → `nullGeometry++`, then **`continue`** (never pushed);
    3. `geojson = typeof rec.geometry === 'string' ? rec.geometry : JSON.stringify(rec.geometry)` [READ :423], built BEFORE `coerceKey`;
    4. `key = coerceKey(rec[key_property], {geojson})`, where null → `badKey++`, then **`continue`**;
    5. push `{[keyColumn]: key, geojson, record: rec}`.

    Invariant: `rows_parsed === pushed + null_geometry_count + bad_key_count`.
  * **`acquired`:**
    * the base block from §1, plus `source_dataset_version = head.lastModified`, `content_hash: null`, `bytes_downloaded` = Σ page body bytes, and the four tallies;
    * the NEW keys `pages_fetched` and `record_fields`. `record_fields` = `Object.keys` of the FIRST RAW record, or `null` on an empty source. This is the field set legacy's attr-drift reads [READ :402]. It is taken before any null-geometry or bad-key drop, so ZN-D3 stays carryable.
    * Both new keys are ABSENT on the other arms (the 0fs `source_path` precedent), so the other arms' goldens are untouched.

### (c) The all-primaries gate (`staleness.allPrimariesDecision`, pure, plus the `ingestPrimaries` pre-loop)
* **Order inside `ingestPrimaries`** extends 0x X8:
  1. `multiPrimaryBinding` (pure; Y1–Y3 added; Y4/Y5 live in `runIngestPhase`, §3d);
  2. the X1 export checks;
  3. the privilege preflight;
  4. **NEW, only when `skip_scope:"all_primaries"`:**
     * create `const validatorCache = new Map()` INSIDE `ingestPrimaries`, once per run, before this gate (brief 21); brief 22 threads the same Map into every narrowed call (GR-5d);
     * read the whole prior meta under the declared `on_prior_run_error` posture (`readPriorEmitWithPosture(…, null, posture)`); keep its `priorError` and thread it into the aggregate AND the skip return (O-adv);
     * fetch the validators for every primary through `validatorCache` (ONE `package_show`; its throw is unwrapped, §3b);
     * `forced` = `overrides.force_run === true` or `detectInterruptedRetraction(…, { ownRunId: args.ownRunId }).interrupted` (I-A2: the LW-D20 own-run fence, staleness.js:398-407). `detectInterruptedRetraction` is gated on the step DECLARING `recovery.interrupted:"force_full_on_next_run"`, NOT on retraction being present (GR-4); zoning ② declares it, so a running/crashed `pipeline_runs` row newer than the prior forces LOAD. A run forced by `detectInterruptedRetraction` reports `force_run`, exactly as a declared override does (precedent: `preAcquisitionDecision`'s `forced` → `force_run`, staleness.js:265);
     * call `allPrimariesDecision`;
  5. the loop.
* **`allPrimariesDecision({primaries, triggerFor, validatorsById, priorMeta, config, nowMs, forced, reemitKeys, emitTypes})`** returns `{skip, reason, decisions:{id:{skip,reason}}, max_age_days, dataset_version_age_days}`. `max_age_days` = `config[trigger.max_age_days_from_config]`; `dataset_version_age_days` = the age in days of the OLDEST stored version (`priorMeta[trigger.emit_key][id]` over all primaries) against `nowMs`, or `null` when no primary has a stored version. The ingest pre-loop builds **`step_gate` = `{scope:'all_primaries', reason, decisions, max_age_days, dataset_version_age_days}`** from this return, ONCE, and the SAME object is used on both the skip and the load path (O-A2).
  * Per primary: `sourceVersion.skipCheckDecision({lastModified, etag:null, storedVersion: priorMeta?.[trigger.emit_key]?.[id] ?? null, nowMs}, {style: STYLE_CKAN_METADATA, forceReloadMaxAgeDays: config[trigger.max_age_days_from_config]})`. A non-finite max age throws by name (source-version.js:186-188). A prior whose `layer_versions` lacks a primary's key, or holds `null` for it, gives `no_prior_version` ⇒ LOAD (G4, T12b).
  * Decisions are ALWAYS computed, also when forced (GR-5b).
  * **`reemitKeys`** is DERIVED, never hand-listed: declared `emits[].key` − `audit_table` − `RUNNER_META_KEYS` (O-A3). Each re-emitted key must be PRESENT, non-null, and match its declared `emits[].type` (`emitTypes`); otherwise `{skip:false, reason:'prior_contract_incomplete'}`: fail-safe LOAD.
  * `skip` is true iff `!forced` AND every decision skips AND the re-emit contract holds.
  * **Top-level `reason` (O-A1; the simpler of the two forms, chosen):** `step_gate.reason` with the strict precedence `force_run` > `cache_stale_force_reload` > `no_prior_version` > `no_validators` > `prior_contract_incomplete` > `changed`; `unchanged` only on a skip. `force_run` covers both a declared `force_run` override and a `detectInterruptedRetraction` force (staleness.js:265 precedent). The aggregate `reason` carries it, so it reaches `records_meta.gate.reason` through the existing `stepCtx.gate` → `gateRecordsMeta` site (:6075-6081). No new runner-owned key; `scope`+`decisions` ride inside `gate` only as below (O-A2).
* **Skip:** return `{skipped:true, reason:'unchanged', signal:'source_validator', …}` with:
  * `acquired:{primaries:{id:{outcome:'skipped', reason, last_modified}}, step_gate, head_error:null}`;
  * `written:null`;
  * `prior: priorMeta`, `priorError`;
  * `overrides: staleness.resolveOverrides(descriptor)` (the single-primary skip return's precedent, index.js:1273; `runWithPool` copies it to `stepCtx.overrides` at :5636; `resolveOverrides` staleness.js:142-169). Without it `ctx.overrides` is `undefined` on a skip;
  * `emitKey:null`, `emitBlock:null`;
  * `skipEmitMeta` = `{k: priorMeta[k]}` for EXACTLY the derived `reemitKeys` (O-A3). The runner writes `audit_table` and the runner-owned keys after (`audit_table` at index.js:6122).

  No primary is acquired and no write txn opens. `runWithPool` takes the skip branch, and this is EXECUTED by T17, not assumed (G3):
  * pre checks only [:5641-5653];
  * counters null [:5977], which the ledger stores as 0 (ZN-D9, declared in zoning). Consumers tell a skip from a zero-row load by `records_meta.gate.gated_skip`, never by the counters;
  * a `skip_gated` terminal selected by `signal` [:5992];
  * no `executeWrite`.

  The one new line spreads `ingest.skipEmitMeta` after `multiPrimarySkipEmit` (:6058).
  * **No DS4 pins** (`spec_version`/`skipped_reason`) are added at the top level: zoning's §9 contract has neither key, and gate C would RED on undeclared keys. The skip reason is already carried in the runner-owned `records_meta.gate` [READ :6075-6081].
  * **Skip evidence on the row (O-A2):** under `all_primaries`, `records_meta.gate` also carries `decisions`, `max_age_days`, and `dataset_version_age_days` (age of the oldest stored version against `nowMs`, or `null`). **The path, end to end:** `allPrimariesDecision` returns them → the pre-loop builds `step_gate` (skip) / `aggregatePrimaries` stamps `acquired.step_gate` (load) → `runWithPool` :5637 `stepCtx.gate = { skipped, reason, ...(ingest.acquired && ingest.acquired.step_gate ? { step_gate: ingest.acquired.step_gate } : {}) }` (brief 26′) → `gateRecordsMeta` (the one `gate` site, :6077) spreads `decisions`/`max_age_days`/`dataset_version_age_days` from `gate.step_gate` into its `base` (brief 19′). `step_gate` absent ⇒ both edits spread `{}` and `records_meta.gate` is byte-identical. `gate.prior_run_id` (O-A3 optional) is NOT adopted: the shared prior SELECT returns only `records_meta` [READ source-version.js:139-141], so stamping it would edit the Spec 62 shared lib and the I-A5 routing string. Legacy emitted `dataset_version_age_days` and `no_op_refresh` on every skip (run 2189: age 221 vs max 730); the zoning ② compute reproduces both rows from those `gate` values. T17 asserts them against the REAL prior, never a stubbed pre check.
* **Load:** every primary runs. Each narrowed descriptor DROPS the `pre_acquisition` triggers, because they were decided at step level. Each per-call tier-1 then returns `no_pre_acquisition_trigger` [READ staleness.js:263-264], and that call reuses `validatorCache`: no second `package_show`.
  * `aggregatePrimaries` gains, ONLY under `all_primaries`:
    * `prior = priorMeta` (the whole prior record, legacy's one prior; zoning's ZN-D7 baselines read `prior.audit_table.rows`, as legacy's `priorMetricValue` [READ :325-330]);
    * `acquired.step_gate` = the pre-loop's `step_gate` (`{scope:'all_primaries', reason, decisions, max_age_days, dataset_version_age_days}`, the same object as the skip path);
    * `reason` = `step_gate.reason` (O-A1 precedence) in place of `'multi_primary'`, and `priorError` threaded (O-adv).
* **Declared deviations, recorded in zoning ①:**
  * (i) the `?? storedVersion` fallback is dropped (ZN-D12 candidate). It only matters when a prior run lacked one layer's version, which can only follow a `package_show` that omitted that resource. That path now refuses the layer (§3b), and the dropped fallback leans fail-safe toward LOAD;
  * (ii) `nowMs` keeps millisecond precision (§1.10);
  * (iii) a re-emitted key missing from the prior means LOAD, never legacy's `?? {}`/`?? false` default. That default is unreachable while `zoning_layer_versions` is present, as it has been on every completed run since 1291 [MEASURED key sets, runs 1291-2189];
  * (iv) 30 s is now a per-request deadline, not a socket-idle timeout (§1.6);
  * (v) the redirect cap: library fetch follows up to 20, legacy capped at 5 — a DECLARED DEVIATION, and `load_zoning_max_redirects` is STRUCK from zoning §5 (operator D2, O-2).

### (d) Runtime refusals (pure, before any I/O, named "0y Yn"; Y1–Y3 in `multiPrimaryBinding`, Y4–Y5 in `runIngestPhase`)
* **Y1:** `skip_scope:"all_primaries"` with any primary whose `format !== "ckan_datastore"`. That generality has no consumer (R-AJ), and lifting it is its own rung.
* **Y2:** under `all_primaries`, a primary that no `pre_acquisition` trigger with `style:"ckan_metadata"` covers (scoped to its id, or unscoped). Also refused under `all_primaries`: any `pre_acquisition` trigger whose `style` is not `ckan_metadata` (absent included), because the narrowing drops every `pre_acquisition` trigger and such a trigger would be silently dropped, declared and never executed (R-AJ).
* **Y3:** any `post_acquisition` trigger that reaches a `ckan_datastore` primary, scoped or unscoped. The arm has no content hash.
* **Y4 (I-A7), in `runIngestPhase`:** a `ckan_datastore` external with no `target` (the runtime twin of Y-I1's `target` clause).
* **Y5 (I-A7), in `runIngestPhase`:** a trigger whose `style` is anything but `validator_equality`/absent reaching `runIngestPhase`/`preAcquisitionDecision` (i.e. not dropped by the `all_primaries` narrowing) is a named refusal, never silently gated as validator-equality.
* **Placement of Y4/Y5:** both are the FIRST statements after the `writes.length !== 1` check (index.js:944-948; inserted before `  const writeSpec = writes[0];`, count 1 [MEASURED]), so they run before `staleness.detectInterruptedRetraction` (:1143) and `pool.query` stays at 0 calls on a refusal.
* **B6 relaxation (G1):** B6 fires only when `skip_scope !== "all_primaries"`; `per_primary` (absent) is byte-unchanged. Under `all_primaries` there is no per-primary skip, so no per-primary sub-block is read or emitted. The `:732` narrowing guards BOTH `emit.skeleton === undefined` and `emits:"none"` (§1.2, G2), and a primary id that collides with a top-level key of an object skeleton is refused by name.

### (e) What zoning ② then declares (for the zoning plan, not built here)
* **10 externals:**
  * `id` = the legacy layer key (`base`, `height_overlay`, …), so the `zoning_layer_versions` sub-keys match;
  * `kind:"http_api"`, `format:"ckan_datastore"`;
  * `url` = `…/api/3/action/datastore_search`;
  * `ckan:{resource_id, package_url:"…/package_show?id=34927e44-…", page_size_from_config:"load_zoning_datastore_page_size"}`;
  * `key_property:"_id"`, `cache:"none"`, `target`, `on_failure`.
* One unscoped trigger: `{signal:"source_validator", position:"pre_acquisition", style:"ckan_metadata", emit_key:"zoning_layer_versions", max_age_days_from_config:"load_zoning_force_reload_max_age_days"}`.
* `staleness.skip_scope:"all_primaries"`.
* `recovery.interrupted:"force_full_on_next_run"` (GR-4: the crash-between-primary-txns guard is gated on this declaration).
* **Notes for zoning ② (sub-threshold, recorded, not built here):**
  * `execution.network.timeout` > 30 s (the whole-request deadline, §1.6);
  * the zoning `validatorCounterDelta` carries `collection_extracted` (`carry:true`, as massing does — not centreline's `carry:false`);
  * counters source from `written.by_target.<base_table>.*` (legacy counts the base table only, P-C1) (O-A4);
  * ZN-D4: the page loop has no `ORDER BY` (carried, declared);
  * zoning ② depends on witness-unblock C3, and on C4 only if zoning declares `force_full_on_next_run` (it does, above).

## 4. Red tests first (four NEW files)
Each file starts with `// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0y; RE-FREEZE #NN, logged in 122 §8)`.

**PIN** = green before the implementation. **RED** = fails before it, with the reason.

**Test ids are plan-local here.** On the shared 0y/0z1 branch, in 122a §A19 and in every commit message, they carry the plan prefix (`0y-T7`, `0z1-T7`): both plans number from T1.

**Fixture `Z3`** is a zoning-shaped clone of the 0x H2 fixture:
* three primaries `base`/`ov_a`/`ov_b`, all `ckan_datastore`, sharing one `package_url`;
* three targets; `base` has `on_failure` absent, the overlays `warn_row_continue`;
* the trigger from §3e but with `emit_key:"layer_versions"` (GR-5c: it must name Z3's own emit and match T9's prior); `skip_scope:"all_primaries"`; `recovery.interrupted:"force_full_on_next_run"`; `execution.shape:"ingest"`;
* `emits` = `[{key:"layer_versions", type:"object", consumers:[]}, {key:"layers_loaded", type:"object", consumers:[]}, {key:"audit_table", …}]` (every item carries `consumers` — the schema requires `key`,`type`,`consumers`; I-A3), with NO per-id skeleton.

The harness is 0x's `fakePool`/`stubsFor` plus a `fakeFetch` that serves `package_show` and paged `datastore_search` responses (each page with `result.total`) and records every URL. The fakePool routes the prior read on `SELECT records_meta FROM pipeline_runs`, never on the status literal (I-A5).

**`ingest-prereq-0y-schema.logic.test.ts`** (brief 0y-0a; AJV as in 0x-schema)
* **T1 RED** (unknown property `ckan` / enum `ckan_datastore`): Z3 is valid. The positive fixture OMITS `on_head_error` (GR-2).
* **T2 RED.** Each row asserts its SPECIFIC keyword and instance path, never only `additionalProperties`:
  * `ckan_datastore` without `ckan` → `required`;
  * `ckan` on a shapefile external → `not`;
  * `kind:"http_file"` with `ckan_datastore` → `const` at `/kind`;
  * a `url` containing `?` → `pattern`;
  * `on_head_error:"warn_row"` on `ckan_datastore` → `not`;
  * `style:"ckan_metadata"` without `max_age_days_from_config` or without `emit_key` → `required`;
  * `style` on a `content_hash` signal → `const`;
  * `skip_scope` with no targeted external (M3) → `contains`;
  * `style:"ckan_metadata"` with `skip_scope` absent (M4) → `required` at `/staleness`;
  * `ckan_datastore` without `target` → `required` (I-A7);
  * **absent-case rows (GR-2), each VALID:** `ckan_datastore` with no `on_head_error`; `skip_scope` present with no `style:"ckan_metadata"` trigger (M3 satisfied).
* **T3 PIN:** every committed descriptor validates, and none declares a 0y field. The set is ENUMERATED BY GLOB (`scripts/*.descriptor.json` — 19 today — plus `scripts/quality/*.descriptor.json` — 5 today [MEASURED `ls`]), never a hard-coded count (I-A4 / grounder 5f).

**`ingest-prereq-0y-acquire.logic.test.ts`** (brief 0y-0b)
* **T4 RED pagination:** with page size 2 from `config`:
  * 3 records → exactly 2 GETs, `…datastore_search?resource_id=R&limit=2&offset=0`, then `…&offset=2`;
  * 4 records → 3 GETs, the last an empty page (legacy loop shape);
  * each URL is asserted byte for byte.
* **T5 RED shaping and tally order:**
  * a record with BOTH a null geometry and `_id:"x"` counts `null_geometry_count` 1 and `bad_key_count` 0;
  * a record `{geometry:null, _id:null}` is counted once (null geometry) and never pushed; `rows_parsed === pushed + null_geometry_count + bad_key_count` (GR-5e);
  * an object geometry is `JSON.stringify`d; a string geometry passes through;
  * `record_fields` equals the keys of record 0 even when record 0 is dropped;
  * `pages_fetched`, `rows_parsed`, `feature_count` and `bytes_downloaded` > 0;
  * `content_hash` is null.
* **T6 RED validators:**
  * three primaries cause exactly ONE `package_show` fetch (cache), and every call receives the SAME `validatorCache` Map (identity asserted, GR-5d);
  * `source_dataset_version` = `last_modified`, or `metadata_modified` when `last_modified` is empty;
  * a resource missing from the package → the arm rejects with `/not listed/`, and NO `datastore_search` GET happens;
  * `success:false` on `package_show` rejects (fail_step).
* **T7 RED errors and retry:**
  * a page 503 rejects `GET 503`;
  * `success:false` rejects naming the resource;
  * with retries 1, a 503 then a 200 makes 2 GETs;
  * `package_show` is never retried;
  * **total mismatch (GR-3):** a fake server answering `{limit:2, total:5}` while the arm asks for page 10 rejects by name (Σrecords ≠ total).
* **T8 PIN:** a shapefile external fetches neither `package_url` nor any `datastore_search`, and its `acquired` key set is unchanged (no `pages_fetched`/`record_fields`).

**`ingest-prereq-0y-gate.logic.test.ts`** (brief 0y-0c)
* **T9 RED all unchanged:** the prior meta has `layer_versions` = the package's three versions, plus `layers_loaded`. Then:
  * `ingestPrimaries(Z3)` returns `skipped:true`, `signal:"source_validator"`;
  * there are 0 `datastore_search` GETs, 1 `package_show`, and 0 `executeWrite` calls;
  * `skipEmitMeta` deep-equals `{layer_versions, layers_loaded}` from the prior (exactly the derived re-emit keys), and has no `audit_table`.
* **T10 RED one changed:**
  * `ov_b`'s version moves, so 3 primaries are acquired and written;
  * `step_gate.decisions` = `{base:{skip:true,reason:'unchanged'}, ov_a:{skip:true,reason:'unchanged'}, ov_b:{skip:false,reason:'changed'}}` (GR-5a);
  * the aggregate `reason` is `changed` (O-A1);
  * the aggregate `prior` is the whole prior meta;
  * each per-call `preAcquisitionGate` reason is `no_pre_acquisition_trigger`;
  * there is still exactly 1 `package_show`, and every narrowed call received the same `validatorCache` Map (GR-5d).
* **T11 RED max-age (F-M4 through `allPrimariesDecision`, G4):**
  * a stored version older than `config.max_age` days (the 730-day arm) → `cache_stale_force_reload` → load all; the aggregate `reason` is `cache_stale_force_reload`;
  * a missing or non-finite max-age variable throws `/forceReloadMaxAgeDays/`.
* **T12 RED no baseline / incomplete prior (O-A3, G4):**
  * no prior row → `no_prior_version` → load all;
  * a prior without `layer_versions` → load;
  * a prior whose `layer_versions` is MISSING one primary's key → that decision is `no_prior_version` and the run LOADs (assert the LOAD — primaries acquired — not just the reason);
  * a prior with `layer_versions` but without `layers_loaded` → `prior_contract_incomplete` → load;
  * `layers_loaded` present but `null` → `prior_contract_incomplete` → load;
  * `layers_loaded` present with the wrong type (a string where `object` is declared) → `prior_contract_incomplete` → load.
* **T12b RED null layer version (HAZARD lock):** a prior whose `layer_versions.ov_a` is `null` ⇒ `allPrimariesDecision` LOADs (`ov_a` decision `no_prior_version`).
* **T13 RED forced (GR-5b):** `override.force_run` → load all; top-level `reason` is `force_run`, `skip` is false, and the per-primary decisions are still computed (`unchanged` where the versions match).
* **T13b RED crash recovery (GR-4)** **Lives in the fullrun file (brief 4): it needs runWithPool's real runId.**: a `running` (crashed) `pipeline_runs` row newer than the completed prior, not the run's own `ownRunId`, forces LOAD under `all_primaries`, and the top-level `reason` is `force_run`; the run's own `running` row alone does NOT (the LW-D20 fence, I-A2).
  * **fakePool routing:** the interrupted-retraction query is routed on `own_last_completed` (the CTE name, staleness.js:410), NEVER on `status = 'completed'` (witness C4 rewrites that literal). The fake honours `$2`: it returns the running row only when `row.id !== params[1]`.
  * The test asserts `params[1] === ownRunId`, where `ownRunId` is the `runId` `runWithPool` opened (index.js:5631 `ownRunId: runId`), so the fence is exercised with the real id, never a hand-set one.
* **T14 RED refusals:** each throws naming the id, with `fetch` called 0× and `pool.query` called 0×.
  * **Y1, Y2, Y3** via `ingestPrimaries(…)` on Z3 variants. Y2 has two rows: an uncovered primary; and a `pre_acquisition` trigger whose `style` is absent/`validator_equality` under `all_primaries` (R-AJ).
  * **Y4, Y5** via the exported `runIngestPhase(…)` directly, on a SINGLE-primary descriptor that bypasses AJV (Y4: a `ckan_datastore` external with no `target`; Y5: a `pre_acquisition` trigger with `style:"ckan_metadata"`). They fire before :1143, so `pool.query` is 0×. Assert the refusal codes (/0y Y4/, /0y Y5/); Y4/Y5 fixtures declare exactly one outputs.writes[] so the writes.length !== 1 throw cannot fire first.
* **T15 PIN (0x unchanged, G1):** the heritage-shaped H2 (`per_primary`) still refuses B6 when a sub-skeleton is missing, and still skips per primary (0x T7 shape). and a full per_primary run's `records_meta.gate` has exactly the keys `["reason","gated_skip"]` (19′/26′ spread {} when step_gate is absent).
* **T16 RED B6 relaxed (G2):**
  * Z3 binds even though `emits[0].skeleton` is absent, and the `:732` narrowing does not throw;
  * Z3 with `emits:"none"` binds and the narrowing does not throw (direct binding + narrowing call);
  * a primary id that collides with a top-level key of an object skeleton is refused by name;
  * Z3 with `skip_scope` deleted refuses at Y-schema M4 (via AJV) and at B6 (direct binding call).

**`ingest-prereq-0y-fullrun.logic.test.ts`** (brief 0y-0d)
* **T13c RED load reason on the row (O-A1; moved here from the gate file — it reads `records_meta`, so it is a full run):** for each cause (`force_run`, `cache_stale_force_reload`, `no_prior_version` — including "no prior row ⇒ `no_prior_version`" — `no_validators`, `prior_contract_incomplete`, `changed`), a load run's `records_meta.gate.reason` equals that cause; two causes at once resolve by the stated precedence (`force_run` > `cache_stale_force_reload` > `no_prior_version` > `no_validators` > `prior_contract_incomplete` > `changed`). The `no_validators` row uses an overlay (`ov_b`, `warn_row_continue`) absent from package_show with a stored version present: expect status `completed_with_warnings`, one `primary_failed:ov_b` row, and `records_meta.gate.reason === "no_validators"`. On the `changed` load row, `records_meta.gate.decisions`/`.max_age_days`/`.dataset_version_age_days` are present (load half of 23‴→26′→19′; T17 covers the skip half).
* **T17 RED skip run** via `stepLib.step(Z3, compute).run({pool, chainId:null, fetch})` (standalone, so the step owns its ledger row):
  * status is `completed`;
  * `records_meta.layer_versions` and `.layers_loaded` are byte-equal to the prior;
  * `records_meta.gate.reason === "unchanged"`, `records_meta.gate.gated_skip` is true, and the terminal is the declared `skip_gated` id;
  * `records_meta.gate.decisions`, `.max_age_days` and `.dataset_version_age_days` are present, and the age equals the value computed from the REAL prior's stored version against the run clock (never a stubbed pre check) (O-A2);
  * the ledger UPDATE binds null counters (ZN-D9 shape), `executeWrite` is called 0×, and the top-level keys beyond the runner-owned ones are EXACTLY the derived re-emit keys (G3);
  * `ctx.overrides` is defined on the skip (the skip return carries `overrides`, §3c);
  * the compute stub reports every declared `pre` check (0x X8 lesson).
* **T18 RED load run:**
  * there are three `INSERT INTO` statements in three `BEGIN`/`COMMIT` pairs;
  * each insert binds `source_dataset_version` = its own resource's version string;
  * `written.by_target` is keyed per target, with the base target's counts separable (the zoning ② counters source, O-A4);
  * an `ov_a` page 503 under `warn_row_continue` gives one WARN `primary_failed:ov_a` row and status `completed_with_warnings`;
  * a `base` 503 rejects the run, and `ov_a` is never fetched.
* **T19 RED `package_show` failure (O-A5, operator D3):** a `package_show` 5xx, and separately `success:false`: `ingestPrimaries` throws before ANY `datastore_search` GET; the full run's ledger row is `failed`, its `error_message` contains `package_show`, and 0 `INSERT` statements are issued.

## 5. Byte-identical guarantee and recapture (orchestrator; DB free; operator-run captures)
* **Same-state differential:** tree BEFORE vs AFTER, `--compare` (the 0x §5 recipe and forced brackets). Run it for load_ravines (`RAVINE_FORCE_RELOAD=1`), address_points, parcels, load_centreline, massing and neighbourhoods (R-AS cohorts), plus load_wsib (`is_gta` bracket). Table hashes and counters must be identical.
* **Recapture OWED (gate G `lib_fingerprint`):**
  * every POST capture carrying the field: **28 across 11 slugs** today [MEASURED, all `fc654c54`];
  * **converted INGESTORs:** address_points 2, load_centreline 2, load_ravines 3 (`sources`, `sources.forced`, `standalone`), load_wsib 2, massing 3, neighbourhoods 3, parcels 2 = **17**;
  * **non-INGESTOR, lib-fingerprinted:** assert_parcel_sanity 2, assert_schema 4, link_massing 3, link_wsib 2 = **11**;
  * **+ load_heritage / enrich_centreline** POSTs, if they land before 0y. Re-measure at landing.
  * Each recapture `--compare`s its predecessor with ZERO data diff.
  * **The recapture commit regenerates each recaptured slug's scorecard** (`step-validate --write`), or the step-conformance R-R stale-scorecard lock REDs at pre-push (precedents `61e83927`, `1f9b8814`) (I-missed).
  * **One folded recapture commit for 0y AND 0z1 (+ witness C4) together, on ONE branch, with NO push between** (O-1): pre-push `--all` REDs on a `lib_fingerprint` mismatch while any capture is stale.
  * Slice A is merged (079a9425; lib unchanged since 1f9b8814 [MEASURED]): every fleet capture writes and gates on its witness trace. C1–C3 (+C2c) must be landed and C4 on this branch before the recapture, or the 8 force_full_on_next_run slugs hard-stop on detectInterruptedRetraction FAIL:PRODUCER (witness R14 note).
* **Freeze:** `--refresh`, then `--check`; then baseline `--check`, and `--write` only after the `staleness.skip_scope` `x-ruling` review; then `schema-to-vocab.mjs` with `--check`.

## 6. Engine briefs (`.cursor/engine-briefs/0y-*.md`; not yet written)
**Rules for every brief:**
* each is under 4.5 KB;
* `write_scope` = one file;
* one anchored `edit_file` per brief;
* a `## Gate answers` section;
* STOP BEFORE COMMIT;
* `--max-iterations 40`;
* index.js (≈6.3k lines) and acquire.js are read with line windows (the engine's 256 KB read cap);
* **Line-window rule (B3) for `step.schema.json`:** it is 242,604 B at `079a9425` [MEASURED `wc -c`], 19.5 KB under the engine's 262,144 B read cap, and 0y and 0z1 both grow it. Every schema brief (5–12) reads it ONLY by line window around its anchor, never whole;
* staleness.js is CRLF in the main tree only (index is LF, core.autocrlf=false, no .gitattributes), so it is LF in a fresh worktree. Anchors stay single-line; inserted lines use the file's own EOL.
* no new function may be named `run…` (`runnerRanges` [READ generate-template-freeze.mjs:344]);
* anchors are re-counted to 1 on the tree at brief time.
* On the shared branch, witness C4 brief 12 anchors on the text `        WHERE pipeline = ANY($1::text[]) AND status = 'completed'` (count 1), never on line numbers. Brief 18's allPrimariesDecision must contain neither `own_last_completed` (T13b routing) nor `status = 'completed'` (the C4 anchor).

| # | Brief | File | Anchor / scope |
|---|---|---|---|
| 1 | `0y-0a-red-schema` | NEW `src/tests/ingest-prereq-0y-schema.logic.test.ts` | T1–T3 |
| 2 | `0y-0b-red-acquire` | NEW `…-0y-acquire.logic.test.ts` | T4–T8 |
| 3 | `0y-0c-red-gate` | NEW `…-0y-gate.logic.test.ts` | T9–T16 (incl. T12b; T13b moved to brief 4) |
| 4 | `0y-0d-red-fullrun` | NEW `…-0y-fullrun.logic.test.ts` | T13b, T13c, T17–T19 (split into 4/4′ if the brief exceeds 4.5 KB) |
| 5 | `0y-1a-format-enum` | step.schema.json | `                      "xlsx"\n` (the format enum's last member, :1976 at `1f9b8814`) → add `"ckan_datastore"` + description sentence |
| 6 | `0y-1b-ckan-prop` | step.schema.json | `                  "key_property": {` → insert `ckan` before it |
| 7 | `0y-1c-item-rule` | step.schema.json | the 0x M1b allOf entry (`"0x (RE-FREEZE #29, M1b)`) → append Y-I1 after it |
| 8 | `0y-1d-http-api-text` | step.schema.json | the format x-rule sentence `A \`kind: \"http_api\"\` entry or a \`url\`-less documentation entry` → carve-out wording |
| 9 | `0y-1e-trigger-fields` | step.schema.json | trigger item `"variable": {` → insert `style` + `max_age_days_from_config` before it |
| 10 | `0y-1f-trigger-rule` | step.schema.json | trigger item `                "required": [\n                  "signal",\n                  "position"\n                ],` (:2506-2509) → add an `allOf:[Y-T1]` sibling after it |
| 11 | `0y-1g-skip-scope` | step.schema.json | `        "on_prior_run_error": {\n          "description": "§1.6` (:2666; the bare key occurs twice — the 8-space + description form is unique) → insert `skip_scope` before it |
| 12 | `0y-1h-toplevel` | step.schema.json | the 0x M2 top-level rule (`"x-profile": "0x (RE-FREEZE #29, M2)` (count 1)) → append M3 + M4 after it |
| 13 | `0y-2a-validators` | acquire.js | `/**\n * Acquire one declared external.` → insert `ckanResourceValidators` before it |
| 14 | `0y-2b-datastore-arm` | acquire.js | same anchor → insert `acquireCkanDatastore` (lands after 13) |
| 15 | `0y-2c-head-branch` | acquire.js | `    head = isLocal ? { lastModified: null, etag: null } : await headValidators(ctxFetch, external.url, timeoutMs);` + `repoRoot,\n}) {` signature (`validatorCache`) — two anchors ⇒ split 15/15′; plus the :828 lookup-mismatch message names `"ckan_datastore"` among the primary formats (I-A6, split 15″) |
| 16 | `0y-2d-dispatch` | acquire.js | `  const tmpRoot = fs.mkdtempSync(` → insert the ckan return before it; the :1001 unknown-format message names `ckan_datastore` and KEEPS its `which no parser` text (0v `/no parser/`, I-A6) |
| 17 | `0y-2e-exports` | acquire.js | `  parseXlsx,\n` → add the two names |
| 18 | `0y-3a-decision` | staleness.js | `/** The env var name \`override.force_full\` declares, or null. */` → insert `allPrimariesDecision` before it |
| 19 | `0y-3b-exports` | staleness.js | its `module.exports` anchor |
| 19′ | `0y-3c-gate-meta` | staleness.js | `gateRecordsMeta` (:623-639): anchor `    gated_skip: Boolean(gate && gate.skipped),` (count 1 [MEASURED]) → add after it `...(gate && gate.step_gate ? { decisions: gate.step_gate.decisions, max_age_days: gate.step_gate.max_age_days, dataset_version_age_days: gate.step_gate.dataset_version_age_days } : {}),` inside `base`. `step_gate` absent ⇒ byte-identical return (O-A2) |
| 20 | `0y-4a-binding` | index.js | `    if (!sub \|\| typeof sub !== 'object') refuse('B6'` → B6 guard (`all_primaries` only) + id/skeleton-key collision refusal + Y1–Y3 (Y2 incl. the non-`ckan_metadata` `pre_acquisition` trigger refusal). Y4 is NOT here (brief 24′) |
| 21 | `0y-4b-step-gate` | index.js | `  await write.assertWritePrivileges(pool, descriptor, { log, tag });\n  const emit = emitsList(descriptor)[0];` → insert `const validatorCache = new Map()` + the pre-loop gate (prior read with `priorError`, `detectInterruptedRetraction(…, { ownRunId: args.ownRunId })`, unwrapped `ckanResourceValidators` with `resolveTimeoutMs`; `reemitKeys`/`emitTypes` derived from declared `emits[]` − `audit_table` − `RUNNER_META_KEYS` (index.js:139); `step_gate` built from the `allPrimariesDecision` return) + skip return after it; the skip return carries `overrides: staleness.resolveOverrides(descriptor)` (index.js:1273 precedent) |
| 22 | `0y-4c-narrow` | index.js | `      emits: [{ ...emit, skeleton: emit.skeleton[id] }],` (+ the trigger filter line) → skeleton guard (undefined skeleton AND `emits:"none"`) + drop pre_acquisition under `all_primaries` + pass the brief-21 `validatorCache` |
| 23 | `0y-4d-aggregate` | index.js | `  return aggregatePrimaries(results, {` (count 1) → pass `{allPrimaries, priorMeta, priorError, stepGate}` |
| 23′ | `0y-4d2-aggregate-prior` | index.js | the aggregate return tail `    prior,\n    priorError,\n    overrides: overrides === undefined` (count 1 [MEASURED]; the bare `prior,\n    priorError,` occurs 3×) → `prior`/`priorError` from `base` under `all_primaries` (conditional override) |
| 23″ | `0y-4d3-aggregate-reason` | index.js | `    reason: 'multi_primary',` (count 1, :808 [MEASURED]) → `    reason: base.stepGate ? base.stepGate.reason : 'multi_primary',` (O-A1) |
| 23‴ | `0y-4d4-aggregate-step-gate` | index.js | `    acquired: { primaries, head_error:` (count 1, :811 [MEASURED]) → add `...(base.stepGate ? { step_gate: base.stepGate } : {})` inside `acquired` (O-A2) |
| 24 | `0y-4e-signature` | index.js | `async function runIngestPhase({ descriptor, pool, compute, config, fetchImpl, chainId, log, tag, clockNow, preWriteGate, ownRunId, subKey }) {` (:930) → add `validatorCache` |
| 24′ | `0y-4e2-y4-y5` | index.js | `  const writeSpec = writes[0];` (count 1 [MEASURED], :949) → insert Y4 (a `ckan_datastore` external with no `target`) + Y5 (a non-default trigger `style` reaching this phase) BEFORE it, so both precede `detectInterruptedRetraction` (:1143; no `await` between :949 and :1143 [MEASURED]) |
| 25 | `0y-4f-acquire-arg` | index.js | `    coerceKey: compute.coerceKey,\n    forced,\n    emitSkeleton: skeleton,` → add `validatorCache,` |
| 26 | `0y-4g-skip-emit` | index.js | `        ...multiPrimarySkipEmit(ingest, computeResult),` (count 1, :6058) → add the `skipEmitMeta` spread after it |
| 26′ | `0y-4g2-step-ctx-gate` | index.js | `        stepCtx.gate = { skipped: ingest.skipped, reason: ingest.reason };` (count 1, :5637 [MEASURED]) → `        stepCtx.gate = { skipped: ingest.skipped, reason: ingest.reason, ...(ingest.acquired && ingest.acquired.step_gate ? { step_gate: ingest.acquired.step_gate } : {}) };` (O-A2) |
| 27 | `0y-4h-exports` | index.js | `  primaryFailureRows,` in exports → add `allPrimariesDecision` re-export if T-files import it from index (else skip) |

**Gate answers (all briefs):**
* no logic variable, check, `emits[]`, counters source or `write_discipline` is set here, so gates A/B/C/D are N/A;
* gate E: no compute file is touched;
* every new schema field carries `x-ruling`, and every enum is `x-frozen`;
* each new field is EXECUTED (named executor, ready for registry-truth `x-trust`):
  * `format.ckan_datastore`/`ckan` → `acquire.js#acquireCkanDatastore`;
  * `style`/`max_age_days_from_config` → `staleness.js#allPrimariesDecision`;
  * `skip_scope` → `index.js#ingestPrimaries`.

## 7. Execution Plan
- [x] PLAN panel (Spec 08 §6.4, plan altitude, BEFORE briefs). Folded 2026-10-02 (log below).
- [x] Cross-read Adversary over the fold → second fold applied (2026-10-02, log below).
- [ ] Grounder + Cross-read Adversary over the SECOND fold (Spec 08 §11: fold-validation after every fold).
- [ ] Briefs 1–4 (red). Commit the red evidence as vitest JSON (gate K style) before brief 5.
- [ ] Briefs 5–27 (incl. 19′, 23′–23‴, 24′, 26′) on one uncommitted tree (`wf2/0y`, its own worktree; `npm ci --ignore-scripts` then `npx husky` — no junctioned node_modules).
- [ ] **Landing, in order:**
  1. diff + `x-ruling` review;
  2. freeze `--refresh`/`--check`;
  3. baseline `--check` (`--write` after review);
  4. vocab;
  5. `npm run system-map`;
  6. Spec 122 §8 line + 122a §A19: whichever of 0y/0z1 lands first creates the 122a §A19 header; the second appends its sub-paragraph. Test ids there carry the plan prefix (`0y-T7`);
  7. `spec-split-check --check`;
  8. §5 differential;
  9. focused vitest (§2 TESTS); on the shared branch the `npm run test:db` run also carries `0z1-T7`/`0z1-T9` and witness C4's db tests (R10–R12, R18) — see 0z1 §7 step 9;
  10. `step-validate --all --fast`, typecheck, lint;
  11. **full `npm run test` (1 fork) BEFORE merge**.
- [ ] Commit (orchestrator): `feat(122_pipeline_step_optimization): CKAN DataStore acquisition + ckan_metadata gate + all-primaries skip (INGESTOR prerequisite 0y, RE-FREEZE #NN)`; any test id in the body is prefixed (`0y-T17`). Then the shared recapture commit with 0z1 (§5).
- [ ] OUTPUT roster (below).

## Standards Compliance
* **Try-Catch Boundary:** no new catch. The HEAD `try` gains a branch with the same catch (warn_row unreachable for ckan by Y-I1). Every refusal is a named throw before I/O. A primary's throw is handled by 0x's posture catch, unchanged.
* **Unhappy Path Tests:**
  * a `package_show` 5xx or `success:false` (unit T6 and full-run T19);
  * a resource not listed;
  * a page 5xx or `success:false`; a page total mismatch (CKAN clamp);
  * a retry;
  * a missing max-age variable;
  * no prior, an incomplete prior (missing / null / wrong-type key, missing layer key, null layer version), a forced run, a crashed run;
  * Y1–Y5; B6 under both scopes; `emits:"none"`; an id/skeleton-key collision.
* **logError Mandate:** N/A (`scripts/lib/step` uses `log.*`).
* **UI Layout:** N/A.
* **§11:** no API, UI or migration. No new tunable: the two `*_from_config` names point at zoning's §5 variables. The verdict stays row-derived (Rule 10).

## Panels (Spec 08 §6.4 — Pipeline WF2, PLAN altitude first)
**PLAN:**
* **Integration** (`general-purpose`, main tree): `runIngestPhase`/`ingestPrimaries`/`runWithPool` wiring; the schema generators; how heritage WIP interacts.
* **Regression Guardian** (main tree): the B6 relaxation; the `:732` narrowing; the unknown-format message; the http_api x-rule text.
* **Gemini** and **DeepSeek** CLI as a LENS SET (spec · error-paths · idempotency · security), each adjudicated by a Sonnet+ grounder.
* **Code Reviewer** (`code-reviewer-grounded`).
* **Observability:** the `step_gate`, the `skipEmitMeta` vs gate C, the `primary_failed` rows on the ckan path.
* **Idempotency Lens:** skip replay; run 2 after run 1 = all-skip; a crash between primary txns under `all_primaries` (the next run must load, not skip). Ruled (GR-4): the crashed run leaves the previous completed prior, so the guard is `detectInterruptedRetraction`, which is gated on the step DECLARING `recovery.interrupted:"force_full_on_next_run"` (not on retraction being present). Zoning ② declares it; T13b locks the forced LOAD.

**OUTPUT:** Regression Guardian, Code Reviewer grounded, Observability, Integration, Idempotency Lens.

Reality-Check: not fired. 0y adds no enriched or derived field. It runs at zoning ② on the POST data.

## Operator decisions (recommended answers — ALL ADOPTED by the 2026-10-02 authorization)
* **O-1 — one shared recapture for 0y + 0z1.** Recommendation: **YES.** Land two commits (0y, 0z1) on one branch, then ONE folded fleet recapture commit (the `4ea7621e` precedent). Separate recaptures would double ~28 operator captures and give no evidence one recapture does not.
* **O-2 — the redirect cap.** Legacy caps at 5 [READ load-zoning.js:58, :345]. Library fetch follows up to 20, as every converted INGESTOR does (neighbourhoods B1 precedent [READ batch2_p3_8 :43]). Recommendation: **declare the deviation in zoning ① and STRIKE `load_zoning_max_redirects` from zoning §5** [:127]. The difference shows only on a 6–20-hop error path that CKAN does not produce. Registering the variable with no reader would be a declared-never-read field (R-AJ). The alternative is a manual-redirect loop plus an `execution.network.max_redirects_from_config` field (+1 schema field, +1 brief). **DECIDED (D2, 2026-10-02): declared deviation; `load_zoning_max_redirects` struck.**
* **O-3 — ZN-D6 disposition change.** Y-I1 forbids `warn_row` on ckan, so a `package_show` failure FAILs before any fetch. Legacy also FAILs with 0 rows written (§1.5): only the audit rows and the error text differ. Recommendation: **accept.** Zoning ① records ZN-D6 as "outcome parity at conversion, honest message". The fix commit **④a is retired**. **DECIDED (D3, 2026-10-02): ④a retired; a `package_show` failure FAILs by name (T19).**
* **O-4 — Y1 scope.** Recommendation: **keep `all_primaries` ckan-only** (R-AJ). A future http_file consumer lifts it with its own rung.
* **O-5 — RE-FREEZE #30 collision.** Registry-truth P3-C3 pre-assigns `#30` [READ :240], which contradicts the "next free at landing" rule. Recommendation: **amend the registry-truth plan to "next free at landing"**. 0y/0z1 take numbers when they land.
* **O-6 — zoning plan re-points** (not edited here; apply when zoning ① starts):
  * rows 3/4/6/8 and §4 :115–:117 (vocabulary: `on_failure`; `skip_scope` lives in 0y);
  * §4 0y bullet: replace "`source_validator` style `ckan_metadata` … `on_head_error:"warn_row"` analogue" with §3e here;
  * ZN-D12 (fallback) and the deviations §3c (ii)–(iv);
  * the 121-row GEOS finding from 0z1 §1.

## Cross-plan notes for zoning ① (from the 2026-10-02 fold)
* **ZN-D defect (wrong-form, Spec 121 §4.3) — overlay-failure version recorded as the prior:** legacy load-zoning.js:686/690 records a FAILED overlay's new version, so the next run skips that layer. It is a CARRIED legacy defect (all 6 legacy `sources:load_zoning` runs are `completed` — MEASURED by the orchestrator), not a C3 regression. Fixed after ③ in its own WF3: the compute emits `null` in `zoning_layer_versions[id]` for any layer it did not load ⇒ `no_prior_version` ⇒ LOAD. Library lock: 0y T12b.
* Zoning ② depends on witness-unblock C3, and on C4 because it declares `recovery.interrupted:"force_full_on_next_run"` (§3e).
* Declared deviations (i)–(v) of §3c, incl. the struck `load_zoning_max_redirects` (D2) and the retired ④a (D3).
* Zoning ② notes of §3e: `execution.network.timeout` > 30 s; `validatorCounterDelta` carries `collection_extracted` (`carry:true`); counters from `written.by_target.<base_table>.*`; ZN-D4 no `ORDER BY`; the `dataset_version_age_days` / `no_op_refresh` rows from `records_meta.gate` (O-A2).

## Panel fold — 2026-10-02
* G1 (Regression Guardian): B6 relaxation scoped to `all_primaries` only; 0x-runner :227/411/607/630 unedited + green; T15 heritage-shaped `per_primary` — §2 TESTS, §3d, T15.
* G2 (Regression Guardian + Integration probe): `:732` guard covers undefined skeleton AND `emits:"none"` (`'none'[id]` does not throw); id/skeleton-key collision refused — §1.2, §3d, T16, briefs 20/22.
* G3 (Regression Guardian): all_primaries skip executed in `runWithPool` (null counters, exact re-emit keys, no write; `gate.gated_skip` distinguishes skip from zero, ZN-D9) — §3c, T17.
* G4 (Regression Guardian): missing layer key ⇒ LOAD asserted; F-M4 730-day arm through `allPrimariesDecision` — §3c, T11, T12.
* HAZARD (Regression Guardian 6 + Observability A6 + Integration A1; orchestrator ruling): carried legacy defect, pinned for zoning ①; library lock T12b — §1.8, T12b, cross-plan notes.
* O-A1 (Observability): aggregate `reason` = `step_gate.reason` with precedence (chosen over extending `gate` with scope+decisions as the simpler) — §3c, briefs 23/23″, T13c.
* O-A2 (Observability): `gate` carries decisions + `max_age_days` + `dataset_version_age_days`; zoning reproduces `dataset_version_age_days` / `no_op_refresh`; T17 asserts from the real prior — §3c, T17.
* O-A3 (Observability): re-emit keys derived and type-checked (null/wrong type ⇒ `prior_contract_incomplete`); `gate.prior_run_id` NOT adopted (needs a shared-lib SELECT change) — §3c, T12.
* O-A4 (Observability): zoning ② counters from `written.by_target.<base_table>.*`; T18 by_target lock — §3e, T18.
* O-A5 (Observability): `package_show` 5xx / `success:false` throw unwrapped in the pre-loop; full-run T19 — §3b, T19.
* O-adv (Observability): `priorError` threaded into the aggregate and the skip return — §3c, briefs 21/23/23′.
* I-A2 (Integration): `detectInterruptedRetraction` gets `{ ownRunId: args.ownRunId }`; `timeoutMs` from `resolveTimeoutMs` — §3b, §3c, brief 21, T13b.
* I-A3 (Integration): Z3 emits carry `consumers: []` — §4 fixture.
* I-A4 (Integration + grounder 5f): T3 enumerates descriptors by glob (19 + 5) — T3.
* I-A5 (Integration): fakePool routes on `SELECT records_meta FROM pipeline_runs` — §1.8, §4 harness.
* I-A6 (Integration): acquire.js:828 lookup-mismatch message updated; `/no parser/` kept — §2 TESTS, briefs 15/16.
* I-A7 (Integration): `ckan_datastore` requires `target` (Y-I1 + Y4); non-default `style` reaching `runIngestPhase` refused (Y5) — §3a, §3d, T2, T14, brief 24′.
* I-A8 (Integration): cites :745, :807-808, :937, 122:1190; 11+1 pages; `'none'` does not throw — §1.1, §1.2, §1.6, §1.7, §1.12, §2.
* I-missed (Integration): recapture regenerates scorecards (`step-validate --write`); step-validate.mjs:2034 reworded as gate C `trigger-baseline-missing`; zoning ② depends on C3 (+C4) — §2 CONSUMERS, §5, cross-plan notes.
* GR-2 (DeepSeek lens, grounder-executed AJV): `required`+`const` / `not:{required,properties}` forms; absent-case T2 rows; T1 omits `on_head_error` — §3a, T1, T2.
* GR-3 (DeepSeek lens, grounder-executed live API): CKAN `limit` clamp 32000; Σrecords ≠ total throws by name; T7 `{limit:2,total:5}` — §1.6, §3b, T7.
* GR-4 (DeepSeek lens, grounder-confirmed): zoning ② declares `recovery.interrupted:"force_full_on_next_run"`; crashed-run LOAD test; §7/Panels wording corrected — §3c, §3e, T13b, Panels.
* GR-5 (DeepSeek lens, grounder-confirmed): (a) T10 decisions shape; (b) forced = `force_run`, decisions still computed; (c) Z3 `emit_key:"layer_versions"`; (d) per-run `validatorCache` Map in brief 21, threaded by 22, identity asserted T6/T10; (e) null-geometry/null-key `continue`, geojson before `coerceKey`, T5 invariant — §3b, §3c, §4, briefs 21/22.
* Sub-threshold (DeepSeek lenses): zoning `execution.network.timeout` > 30 s; `collection_extracted` `carry:true`; ZN-D4 no `ORDER BY` — recorded as zoning ② notes, §3e.
* Shared (all seats): one recapture for 0y + 0z1 (+ witness C4) on ONE branch, no push between — §5.
* Operator D2/D3 (authorization 2026-10-02): redirect cap declared deviation, `load_zoning_max_redirects` struck; ZN-D6 ④a retired — §1.5, §3c (v), O-2, O-3.

### Second fold — 2026-10-02 (Cross-read)
1. BLOCKER O-A2 path: `allPrimariesDecision` returns `max_age_days` + `dataset_version_age_days`; `step_gate` = `{scope, reason, decisions, max_age_days, dataset_version_age_days}` on skip AND load; new briefs 26′ (`stepCtx.gate` carries `step_gate`, :5637, count 1) and 19′ (`gateRecordsMeta` conditional spread, anchor count 1); Context + §2 FILES/CONSUMERS rows updated — §3c, §2, §6.
2. O-A1 precedence made strict (`force_run` > `cache_stale_force_reload` > `no_prior_version` > `no_validators` > `prior_contract_incomplete` > `changed`); interrupted-retraction force reports `force_run` (staleness.js:265); T13c adds `no_validators` + no-prior row; T13b asserts `force_run` — §3c, T13b, T13c.
3. Y4 moved to `runIngestPhase` beside Y5, inserted before `  const writeSpec = writes[0];` (count 1; no `await` before :1143); brief 20 drops Y4, new brief 24′ adds Y4+Y5 (brief 24 keeps the signature only — one anchor per brief); T14 split Y1–Y3 via `ingestPrimaries`, Y4/Y5 via exported `runIngestPhase` — §3d, §6, T14.
4. Y2 also refuses a non-`ckan_metadata` `pre_acquisition` trigger under `all_primaries` (R-AJ); T14 row — §3d, T14.
5. Skip return carries `overrides: staleness.resolveOverrides(descriptor)` (index.js:1273, :5636; staleness.js:142-169); brief 21 notes it + `reemitKeys`/`emitTypes` derivation; T17 asserts `ctx.overrides` defined — §3c, brief 21, T17.
6. T13b fakePool routes on `own_last_completed`, honours `$2` (`row.id !== params[1]`), asserts `params[1] === ownRunId` from `runWithPool`'s `runId` (:5631) — T13b; T13b moved to brief 4 (it is a full run).
7. Stale text replaced: §1.8 (C3 fixes finding-1 before 0y lands); §5 slice A merged + C1–C3(+C2c)/C4 prerequisite for the recapture; §7 step 6 §A19 header ownership — §1.8, §5, §7.
8. Brief 23 split into 23/23′/23″/23‴ (`reason` :808 and `acquired` :811 anchors each count 1); B3 line-window rule for step.schema.json (242,604 B); T13c moved to brief 4; §3a style vocabulary sentence (underscore values → hyphenated constants) — §3a, §4, §6.
9. Cross-plan test ids prefixed (`0y-T7`/`0z1-T7`) on the shared branch, §A19 and commit text; shared-branch `test:db` also runs 0z1 T7/T9 + witness C4 R10–R12/R18 — §4 header, §7 steps 6/9, commit line.

### Third fold — 2026-10-02 (Cross-read of fold 2)
* F1: T13b is a full-run test (needs `runWithPool`'s real `runId`); §4 T13b bullet, §6 brief table rows 3/4, second-fold item 6 updated.
* F2: T13c `no_validators` row nailed (overlay `ov_b`, `warn_row_continue`, stored version present ⇒ `completed_with_warnings`, `primary_failed:ov_b`, `gate.reason === "no_validators"`).
* F3: byte-identical direction of O-A2 — T15 asserts a `per_primary` run's `records_meta.gate` has exactly `["reason","gated_skip"]`; T13c asserts the `changed` load row carries `decisions`/`max_age_days`/`dataset_version_age_days`.
* F4: shared-branch staleness.js anchors fixed — witness C4 brief 12 anchors on the `WHERE pipeline = ANY($1::text[]) AND status = 'completed'` text (count 1); brief 18's `allPrimariesDecision` must contain neither `own_last_completed` nor `status = 'completed'`.
* F5: EOL rule corrected — staleness.js is CRLF in the main tree only, LF in a fresh worktree; anchors single-line, inserted lines use the file's own EOL.
* F6: stale cross-refs and nits — first-fold log refs (§3c briefs 23/23″ T13c; §3c briefs 21/23/23′; brief 24′), §7 step 9 `0z1-T7`/`0z1-T9`, §6 row 12 anchor pinned (count 1), T14 refusal-code/single-write assertion.

> **PLAN LOCKED. Do you authorize this WF2 plan (0y; PLAN panel → briefs → landing; shared recapture with 0z1)? (y/n)**
> §11 note: the skip re-emit adds NO top-level DS4 pins (gate C would RED on undeclared keys); the reason travels in the runner-owned `records_meta.gate`.
