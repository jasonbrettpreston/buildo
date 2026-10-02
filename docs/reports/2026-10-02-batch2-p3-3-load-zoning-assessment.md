# Batch 2 Phase 3 row 3.3 — `load_zoning` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: commit ① report half — PH-0 (part 1).** **NOT converted.** The red suite
> `src/tests/steps/load_zoning/violations.test.ts` is ①'s other half — **29** legacy oracle pins
> **L1–L29** plus **11** `it.fails(...)` claims **D1–D11**. [READ
> `src/tests/steps/load_zoning/violations.test.ts:11`]
> **PRE goldens are NOT captured** — §9 of this report lists the commands to run rather than reporting
> captured values, because a **fleet recapture holds the DB slot** and the **R-AS cohort instrument is
> owed first** [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A2, §C item 9, §D].
> **INGESTOR has 7 converted members** — `load_ravines`, `address_points`, `parcels`, `load_centreline`,
> `massing`, `neighbourhoods`, `load_wsib` (with `load_heritage` at shape_clean) [READ
> `.cursor/engine-briefs/zn-1-facts.md` F-ID] — so the **compressed form is the DEFAULT**
> [Spec 124 R-AH; plan §F item 24], and no reason for the full nine-commit form applies.

Every number below was EXECUTED by the orchestrator on **2026-10-02** at HEAD **`cba60e3c`** (worktree
`Buildo-wt-zoning` = `wf2/load-zoning-1`), **read-only**: read-only SELECTs inside `BEGIN READ ONLY` on
the local dev DB, one CKAN `package_show` plus 10 `datastore_search?limit=1` probes, and a prototype run
of the legacy oracle against the verbatim legacy text plus the seam. Nothing was written. The queries and
probes with their results are **§A (Measurement log)** [READ `.cursor/engine-briefs/zn-1-facts.md`].
Values are cited `[MEASURED 2026-10-02]` or `[READ file:line]`, exactly as the orchestrator's facts file
gives them, or **"plan §N"** for anything transcribed from the governing plan. Line anchors are the facts
file's, i.e. at HEAD `cba60e3c` (**pre-seam**: `scripts/load-zoning.js` is 739 lines there; after the
zn-1a seam lands it is 753 lines — after `:339` shift `+11`, after `:577` `+12`, after `:600` `+13`)
[READ facts file header]. Where this report re-read code in this worktree, that read is cited
separately against the artifact actually present, and it is named as such.

**Identity.** **Slug** `load_zoning` · **script** `scripts/load-zoning.js` — **739 lines** [READ facts
file F-ID]. **Chain** `sources`: manifest entry
`scripts/manifest.json:17`, chain list `scripts/manifest.json:107`, where `load_zoning` sits
**immediately before `enrich_parcels`** [READ `scripts/manifest.json:17`; READ
`scripts/manifest.json:107`] ; **Spec 43 row 21** [READ `43:52`]. **Lock `58`** — three anchors: the
constant `ADVISORY_LOCK_ID = 58` [READ `scripts/load-zoning.js:38`], the Spec 47 row [READ `47:1965`],
and the lock-registry test [READ `pipeline-advisory-lock.infra.test.ts:32`]. **Census row**
`scripts/steps/_schema/step-archetype-census.json:405-411` — INGESTOR, batch C5, owner spec 58 [READ
`scripts/steps/_schema/step-archetype-census.json:405-411`].

**Batch-2 row 3.3** [READ `.cursor/batch2_c5_active_task.md:326`]. **Defect prefix `LZ`** [READ
`scripts/analysis/step-validate.mjs:791-797` — `DEFECT_PREFIX_OVERRIDES` holds only
`load_wsib: 'WS'`; G6 reads only `LZ-D*`]. **The plan §3 `ZN-D` ids are renamed `LZ-D` (same numbers)**,
because G6 reads only `LZ-D*`, so `ZN-D*` rows would score G6 **0** (a hard stop); the heritage
precedent is `LH-D`, and `neighbourhoods` renamed `NB→N` for the same reason; no other manifest slug maps
to `LZ` [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A1].

**Target Spec:** owner `docs/specs/01-pipeline/58_source_zoning_bylaw.md` v2.3 — §3 `:202`, §9 `:559`,
§11 `:624`, §12 `:634` [READ facts file F-ID] — plus `43_chain_sources.md` (chain owner); consumer
`docs/specs/01-pipeline/65_enrich_parcels.md:33-41` [READ `docs/specs/01-pipeline/65_enrich_parcels.md:33-41`];
architecture specs 122 / 123 / 124. **Governing plan:** `.cursor/batch2_load_zoning_active_task.md`
(authorized 2026-09-27), re-grounded in `.cursor/zoning-plan-regrounding-2026-10-02.md` [READ
`.cursor/zoning-plan-regrounding-2026-10-02.md` header]. **Library prerequisites 0y / 0z1:**
`.cursor/wf2_ingest_prereq_0y_active_task.md` / `.cursor/wf2_ingest_prereq_0z1_active_task.md`.

**Spec 121 §4.3 governs method**: this conversion is **zero behaviour change**; every carried defect is
pinned as **`LZ-D<n>`**; every fix is a separate **④** commit [READ
`.cursor/zoning-plan-regrounding-2026-10-02.md` §C ④].

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING the legacy script, not from the manifest, the specs or any prior report. The facts
> file's anchors are pre-seam at HEAD `cba60e3c` and are cited as such throughout.

### 1.1 Write class — **class B** ×10: guarded upsert + F-C1-guarded NOT EXISTS departure DELETE, one transaction PER LAYER

- The upsert and the departure DELETE for ONE layer run inside ONE `pipeline.withTransaction` call —
  `[READ scripts/load-zoning.js:485-531]`. A comment in the legacy says `Per-layer transactions (D2)`
  [READ `scripts/load-zoning.js:11-12`]. **The transaction is per layer, not per step:** a base that
  commits and an overlay that then throws leaves the base's rows in place.
- The staging table is a **keys-only TEMP table**: `CREATE TEMP TABLE _zoning_staging (source_id INTEGER
  NOT NULL) ON COMMIT DROP` [READ `scripts/load-zoning.js:487`].
- The `SET` list is at `:491` — it includes `source_dataset_version`. The change guard is at `:493` — it
  is the data columns plus `geometry` plus `geom`, and it does **NOT** include `source_dataset_version`.
  So an unchanged row keeps its OLD stamp: **LZ-D2** — `source_dataset_version` in SET, not in the guard.
  The in-file comment is `H5: include geometry (jsonb) in the change guard alongside data cols + geom`
  [READ `scripts/load-zoning.js:491, :493`].
- The departure DELETE is a **NOT EXISTS anti-join against the staging table**: `DELETE FROM
  ${layer.table} t WHERE NOT EXISTS (SELECT 1 FROM _zoning_staging s WHERE s.source_id = t.source_id)`
  [READ `scripts/load-zoning.js:526-528`]. It is **F-C1-guarded** — an insertable-empty staging table
  sets `orphanSkipped = true` (`F-C1: empty staging can't wipe the table`) [READ
  `scripts/load-zoning.js:523-524`], and the guard's own INFO row is `orphan_delete_skipped` [READ
  re-grounding §B `:75-95` row 15 — `orphanStatus` `:242-248` + push `:533`].
- **Class B by intent, not by literal syntax.** The census writes class B as the literal
  `DELETE ... WHERE key <> ALL($1)`, but `load-zoning` expresses the identical departure delete as a
  NOT EXISTS anti-join. B must be read **BY INTENT**, or `load_zoning` becomes a third gap [READ
  `scripts/steps/_schema/step.schema.json:105`; READ `scripts/steps/_schema/step.schema.json:131-132`].

### 1.2 Columns written

**Ten targets, one table each — the ten CKAN DataStore layers → ten tables** [READ facts file F-ID;
re-grounding §B `:13`]. Per target, the written set is:

- the layer's **data columns** taken from the legacy `LAYERS` cols registry;
- **`geometry`** — **JSONB**, the raw GeoJSON **text** as CKAN returns it (`geometry` is the GeoJSON
  string, not a PostGIS type) [READ `scripts/load-zoning.js:490`];

- **`geom`** — the PostGIS expression

  `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON($n)), 3|2))`

  bound through `geomColumnSql($n, layer.geomKind)` — dimension 3 for the polygon family, 2 for the
  LINESTRING family [READ `scripts/load-zoning.js:492`];
- **`source_dataset_version`** — bound as `datasetVersion` [READ `scripts/load-zoning.js:491`].

**`id` (serial) and `created_at` are NEVER written by the step** — both are DB defaults.

**Row counts** [MEASURED 2026-10-02, F-DB; equal to CKAN totals, re-grounding §B `:13`]:
base **11,719** · height **2,528** · lot_coverage **1,242** · building_setback **4** · policy_area
**352** · policy_road **8,913** · rooming_house **558** · parking_zone **913** · priority_retail
**643** · queenstw_eat **4**. Every table keys `source_id` **1..n**, with **one** version value
[MEASURED 2026-10-02, F-DB].

### 1.3 Audit rows / verdict / `records_meta`

- **The audit row count is 81, not ~107.** Run 1085 (the last real load) has **81** rows; "~107" was the
  commit message's upper bound with every conditional row present [MEASURED 2026-10-02, F-DB; READ
  `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A9]. **Skip runs have 5 rows** — license,
  `no_op_refresh`, `dataset_version_age_days`, `sys_velocity_rows_sec`, `sys_duration_ms` [MEASURED
  2026-10-02, F-DB].
- **The conditional rows** (only present when their condition fires): fetch errors and load errors;
  **attr_drift**; **duplicates**; **null geometry**; **non-integer id**; **orphan_delete_skipped**;
  **unparseable label**; **skip_check_error**; **no_op_refresh** [READ
  `scripts/load-zoning.js:637-676`; READ `scripts/load-zoning.js:523-524`; READ facts file F-ORACLE].
- **Verdict is row-derived** through the 3-way cascade `verdictCascade` — `P-C3` [READ
  `scripts/load-zoning.js:311-315`]. `audit_table.phase` is **58** and `audit_table.name` is
  **`Toronto Zoning By-law ingest`** [READ `scripts/load-zoning.js:698-701`].
- **The frozen §9 keys** are the four producer keys at Spec 58 `:563-585`: `zoning_layers_loaded`,
  `zoning_partial_load`, `source_dataset_version`, `base_layer_committed_after_overlays_failed` [READ
  `docs/specs/01-pipeline/58_source_zoning_bylaw.md:563-585`], plus the **additive**
  `zoning_layer_versions` `{ <key>: last_modified }` — per-layer skip-check baseline, the single
  `source_dataset_version` being base-only [READ `docs/specs/01-pipeline/58_source_zoning_bylaw.md:624`].
  All 10 `zoning_layer_versions` values are `2026-02-20T21:29:42.613615` on runs 1085 and 2189; every
  `zoning_layers_loaded` value is `true` [MEASURED 2026-10-02, F-DB].
- **Counters are base-only (P-C1)** — `records_total: baseLoaded`, `records_new`,
  `records_updated` [READ `scripts/load-zoning.js:696-700`]; the in-file comment is `base-only counters
  (P-C1)` [READ `scripts/load-zoning.js:695`]. Run 1085 is `11719/0/0`, 44.7 s, verdict PASS, partial
  false [MEASURED 2026-10-02, F-DB].
- **Skip runs re-emit the prior §9 contract with NULL counters** — `records_total` / `records_new` /
  `records_updated` are `null` [READ `scripts/load-zoning.js:609-611`]: **LZ-D9**. They forward
  `zoning_layers_loaded` / `zoning_partial_load` / `source_dataset_version` / `zoning_layer_versions` /
  `base_layer_committed_after_overlays_failed` from the prior, with `?? {}` / `?? false` defaults —
  **LZ-D17** [READ `scripts/load-zoning.js:613-617`].
- **Skip runs lack `pipeline_meta`.** Run 1085's keys include `pipeline_meta`; runs 1291-2189 lack it —
  the skip path returns before `emitMeta` [MEASURED 2026-10-02; READ
  `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A10] — `:621` vs `:703` [READ re-grounding §A A10].

### 1.4 Source facts

**F-NET, verbatim** [MEASURED 2026-10-02, F-NET]: `package_show?id=34927e44-…` succeeds;
`metadata_modified` = `2026-02-20T21:29:42.613615`; all 10 zoning resources listed (of 92) with
`last_modified: null`, so the legacy fallback makes every version the `metadata_modified` value. **The
source is UNCHANGED.** `datastore_search` totals = the table counts of §1.2 [MEASURED 2026-10-02].
**Identical field sets:** `building_setback` and `queenstw_eat` both expose
`_id,OBJECTID,ZN_STRING,CH600_AREA_TYPE,BYLAW_SECTIONLINK,geometry` [MEASURED 2026-10-02]. **4 of 14
probes returned 504 / HTML (transient)** [MEASURED 2026-10-02] — a capture risk, not an explained
diff.

**F-DB** [MEASURED 2026-10-02]: PostGIS 3.3.7 / GEOS 3.14.1 / PG 17; session TimeZone `UTC`; stored
`source_dataset_version` = `2026-02-20 21:29:42.613615+00`. All six `lock 58` runs completed.

### 1.5 Exits

- **Lock contention.** The step cannot take the advisory lock ⇒ it is skipped at the SDK and **nothing is
  emitted** — `[READ scripts/load-zoning.js:721]`. The oracle pins this in **L20**
  [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §C ① item 4].
- **Base failure.** A throw makes the run `failed`, and **the base FAIL audit rows are never emitted** —
  the `throw` precedes `emitSummary` — **LZ-D19** [READ re-grounding §E LZ-D019; `[READ
  scripts/load-zoning.js:639-643, :657-659, :669]`].
- **Overlay failure.** A WARN row is written and the run continues: `pipeline.run` WARN ⇒ `completed`
  [READ facts file F-CODE]. The oracle pins the overlay-503 shape in **L4** [READ
  `.cursor/zoning-plan-regrounding-2026-10-02.md` §C ① item 4].
- **A FAIL verdict without a throw** — a base duplicate, an invalid band, or an orphan band — leaves the
  legacy run `completed` with verdict **FAIL** [READ facts file F-CODE; oracle pins L11 / L14 / L17].
  **The converted runner maps an unaccepted FAIL to `failed` and WARN to `completed_with_warnings`**
  [READ `index.js:6033-6034`]. **And the consumer reads only `completed`** [READ
  `scripts/lib/compute/enrich-parcels.js:181`; `READ re-grounding §A A5`].

## 2. Behaviour ledger (plan §2) — PH-0 freeze, post-0x/0y/0z1 seats

> Anchors are the legacy constructs at HEAD **`cba60e3c`** [READ `scripts/load-zoning.js`], **corrected
> per re-grounding §B `:75-95`** where the plan's own anchors had drifted. "Converted seat" is the
> module/knob that OWNS the behaviour after conversion, named as of the 0x/0y/0z1 seats (0x landed; 0y
> and 0z1 pending). "Pin" is the ① oracle pin (L-id) from §10's case map, plus the LZ-D id where the
> row is the wrong-form pin for a carried defect.

| # | Legacy construct [READ line @cba60e3c] | Converted seat | Pin |
|---|---|---|---|
| 1 | One `package_show` per run enumerates all 10 zoning resources; resource `last_modified` null ⇒ fall back to `metadata_modified` [READ `scripts/load-zoning.js:361-368`; `:364-366`] | per-primary `http_api`/`ckan_datastore` externals + the unscoped `ckan_metadata` trigger; version fallback in the trigger | L1 · shape |
| 2 | `package_show` failure ⇒ INFO `skip_check_error`, every upsert binds `String(runAt)` as the version, all `zoning_layer_versions` null, age 0 — and the base then FAILs (LZ-D6) [READ `scripts/load-zoning.js:361-368`; failure `:592-595`] | trigger `on_failure` on the metadata step; base abort routed by `on_failure` | L2 · L3 · LZ-D3 |
| 3 | Skip-check reads the prior run's `zoning_layer_versions` and skips per-layer [READ `scripts/load-zoning.js:598-601`] | `staleness.skip_scope:"all_primaries"` (0y) | L4 · overlay |
| 4 | A skip run returns before any fetch [READ `scripts/load-zoning.js:604-617`] | `staleness.skip_scope:"all_primaries"` + the `ckan_metadata` trigger (0y, not 0x) | L4 · overlay |
| 5 | `datastore_search` paging: `limit` = `batch_size`, `offset` 0/10000, no `sort`; 30 s socket-idle timeout; redirect cap 5 [READ `scripts/load-zoning.js:375-383`; `:342-349`; `:344, :355`] | the 0y `ckan_datastore` arm (per-primary `page_size_from_config:"load_zoning_datastore_page_size"`, `key_property:"_id"`, `cache:"none"`) | L5 · L29 · LZ-D12 |
| 6 | Base fetch/load failure aborts the step (`throw err`); an overlay failure writes a WARN row and continues, and the F-M3 sentinel records a committed base with overlays failed [READ `scripts/load-zoning.js:648, :662, :673`] | base `on_failure` absent (`abort_step`); overlays `warn_row_continue` (0y O-6) | L6 · L7 · R2-12 |
| 7 | Base-only counters `records_total` / `records_new` / `records_updated` (P-C1) [READ `scripts/load-zoning.js:696-700`; `:695`] | counters from `written.by_target.zoning_bylaw_areas.*` | L7 · R2-12 |
| 8 | Attr drift is read from `records[0]` only; a later record's missing cell is NULLed [READ `scripts/load-zoning.js:402`] | routed by `on_failure`; carry LZ-D3 via 0y `acquired.record_fields` (re-grounding §C Q2) | L8 · D9 |
| 9 | Per-record shaping: `coerceSourceId`, `parseHeightLabel`, per-record mapping [READ `scripts/load-zoning.js:419-436`; helpers `:191-231`] | `shapeRecord` seam `{geojson, config, run_at, tag, lookups?}` (`index.js:1383-1385`); TEXT / HT_LABEL arms | L9 · TEXT · L10 · HT_LABEL |
| 10 | `dedupeBySourceId` / `dedupeRejectAll` on duplicate `source_id` [READ `scripts/load-zoning.js:446-448`] | `dedupeBySourceId` (`index.js:1405`) | L11 · R2-17 |
| 11 | Geometry validation in 1,000-row batches, 11 batches for 10,001 records [READ `scripts/load-zoning.js:450-467`] | 0z1 `multiline` + `line_validity`; batching retired = LZ-D18 | L12 · key |
| 12 | Key/`source_id` ordinal, `id` serial + `created_at` DB defaults never written [READ `scripts/load-zoning.js:468-477`] | `key_property:"_id"` → `source_id`; serial/created_at stay DB defaults | L13 · order |
| 13 | The upsert `SET` list + the change guard (data cols + `geometry` + `geom`, NOT `source_dataset_version`) [READ `scripts/load-zoning.js:491, :493`] | write path `SET`/guard composition; LZ-D2 carried | L14 · validation |
| 14 | Keys-only TEMP staging table `_zoning_staging(source_id) ON COMMIT DROP` + guarded NOT EXISTS departure DELETE [READ `scripts/load-zoning.js:520`; delete `:526-528`] | per-target guarded upsert + departure delete (`txn_scope` measured at ②) | L15 · guard |
| 15 | F-C1 empty-staging guard `orphanSkipped = true` + `orphan_delete_skipped` INFO push [READ `scripts/load-zoning.js:242-248`, push `:533`] | F-C1 guard seat | L16 · LZ-D1 / P-C1 |
| 16 | `unchanged = max(0, loaded − inserted − updated)` derived, not measured [READ `scripts/load-zoning.js:537`] | derived `unchanged` (LZ-D1); ② library measures | L16 · LZ-D1 / P-C1 |
| 17 | Orphan-band verdict: `ORPHAN_WARN_PCT` / F-H1 thresholds [READ `scripts/load-zoning.js:318-323` (priorMetricValue)] | verdict cascade threshold seat | L17 · F-C1 / F-H1 |
| 18 | `verdictCascade` 3-way derivation (P-C3) [READ `scripts/load-zoning.js:311-315`] | row-derived verdict cascade | L18 · LZ-D3 |
| 19 | `10,001` records ⇒ offsets 0/10000, no `sort`; skip re-emit defaults `?? {}` / `?? false` [READ `scripts/load-zoning.js:703-707`] | emit seam; LZ-D4 (no `sort`) / LZ-D17 (defaults) | L19 · LZ-D4 / D18 |
| 20 | Advisory lock `58` taken before any work; contention ⇒ SDK skip, nothing emitted [READ `scripts/load-zoning.js:38`, `:721`] | lock `58` (Spec 47 `:1965`) | L20 · lock |
| 21 | `zoning_layer_versions` stamps EVERY layer, including a failed one [READ `scripts/load-zoning.js:685`] — pins wrong-form; the converted compute must reproduce it (LZ-D12) | emit `zoning_layer_versions` at the compute seat (0y D3); ④d WF3 emits `null` for an unloaded layer | L21 · LZ-D20 |

**Row ledger notes (seat rewording, 0y O-6).** Row 6: the base `on_failure` is **absent** (`abort_step`);
the overlays are `warn_row_continue` — so "the throw is routed by `on_failure`", not by an inline
`throw`. Row 8: the routing is by `on_failure`, and LZ-D3 is carried via 0y `acquired.record_fields`
(the first raw record), with `shapeRecord` mapping a missing field to `null` (re-grounding §C Q2). Rows
3-4: the trigger is the 0y `ckan_metadata` signal with `staleness.skip_scope:"all_primaries"` (0y, **not**
0x). Row 5: the 0y `ckan_datastore` arm; the redirect cap is deviation **LZ-D14** and the timeout is
**LZ-D15**. Row 11: 0z1 `multiline` + `line_validity:"length_and_simple"`; the 1,000-row batching is
retired as deviation **LZ-D18**. Row 21 is the added row: the per-layer version stamp includes failed
layers, so the converted compute must reproduce the wrong form (LZ-D12).

## 3. Registry target review (closed set: the step's own registry)

> The closed set is **FILES · DATA · CONSUMERS · TESTS** (operator ruling; feedback "review against the
> step's own registry"). Nothing outside that set is scored here.

### (a) §4.1 files

- The **4 ② files**: the shell, the descriptor, the notes, and the compute module — plus
  `src/tests/steps/load_zoning/**`, which **① creates** [READ `.cursor/engine-briefs/zn-1-facts.md` F-ID].
- `scripts/lib/zoning-attr-drift.js` is **38 L** — the plan said 60 [READ re-grounding §B `:27`; READ
  `.cursor/engine-briefs/zn-1-facts.md` F-GIT].
- `scripts/lib/geometry-validator.js` is **99 L**, and is required by `load-zoning.js:36` **only** [READ
  re-grounding §B `:28`; READ `scripts/load-zoning.js:36`].
- Spec 58's **Target Files is a GENERATED block** [READ re-grounding §A A6; `58:399-409`]: ① runs
  `npm run target-files` and **never hand-lists a path** (Spec 124 R-BE).

### (b) Tables

- The **10 tables** — `zoning_bylaw_areas` (base), height, lot_coverage, building_setback, policy_area,
  policy_road, rooming_house, parking_zone, priority_retail, queenstw_eat — with per-target counts and
  the `Multi*` geometry types per migration 164 [READ re-grounding §B `:13`; READ facts file F-DB].
- **`pipeline_runs`** — read as the prior via
  `scripts/lib/source-version.js:137-143` (`readPriorRunMeta`), which now admits
  `completed_with_warnings` (C3 `422c5e7c`) [READ facts file F-CODE; READ re-grounding §A A4].

### (c) Consumers

- **`enrich_parcels` `readZoningContract`** — `scripts/lib/compute/enrich-parcels.js:171-197`. It HALTs
  on (a) a latest `failed` run, (b) no `completed` row with an object `zoning_layers_loaded` (strict
  `status = 'completed'` at `:181`), (c) `base !== true` [READ
  `scripts/lib/compute/enrich-parcels.js:171-197`]. The strict `status = 'completed'` at `:181` is the
  re-grounding **A5** finding — a **fleet item owned by witness-unblock C8, NOT an LZ-D** [READ
  re-grounding §A A5]. It is recorded here, and again in the ② explained-diff list, but it is fixed
  elsewhere.
- **`scripts/steps/_schema/consumer-registry.json` has 0 zoning rows** [READ facts file F-CODE; READ
  re-grounding §B `:45`], so **gate D needs `emits[].consumers:["enrich_parcels"]` at ②**.
- **`enrich-parcels.descriptor.json`** anchors `:23-24`, `:84`, `:541` [READ re-grounding §B
  `:48`-adjacent].
- **Labels** in `funnel.ts` / `FreshnessTimeline.tsx` — **untouched** by this conversion [READ facts file
  F-CODE].

### (d) Tests

- `src/tests/zoning.logic.test.ts` — **292 L**, **41** `it` (the plan said 44) [READ facts file F-GIT;
  READ re-grounding §B `:63`]; it is **re-pointed at ②**.
- `src/tests/source-version.logic.test.ts:42, :72, :229` — the wrapper-decision case moves to
  `staleness.js` at ② [READ re-grounding §B `:64`].
- `src/tests/zoning-bylaw-areas.regression.test.ts` — **13** `it` (migration + manifest) [READ facts
  file F-GIT]; `src/tests/db/zoning.db.test.ts` — imports `geomColumnSql` [READ facts file F-GIT].
- **Negative locks** that must stay green: `load-centreline.infra.test.ts:100-101`,
  `load-heritage.infra.test.ts:107-111`, `load_ravines/violations.test.ts:1607` [READ re-grounding §B
  `:71`-adjacent].
- The **NEW** `src/tests/load-zoning-force-seam.logic.test.ts` — lands with the **seam commit** (zn-1a /
  zn-1b), and locks the `ZONING_FORCE_RELOAD` override [READ re-grounding §A A8; §C ① item 2].

## 4. PH-3 — Intent ledger (G3)

> **Discovery method.** Every fence below was found with `git log -S<construct> -- scripts/load-zoning.js`
> and the Construct column + `READ` line anchors are derived by READING the legacy script — not invented.
> **Every hit is `58914fa8`** (2026-05-30 — *"feat(58_source_zoning_bylaw): Toronto Zoning By-law ingest —
> load-zoning.js + 10 tables via CKAN DataStore"*, Severity CRITICAL+HIGH folded across 4 review rounds;
> Gemini + DeepSeek + Independent + Observability + Integration + Regression Guardian; lesson-routing Spec
> 58 §12), **except the B1 delegation `0b230472`** (2026-08-10 — *"feat(43_chain_sources): Phase B B1 —
> source-version lib + the tier-2 content-hash gate"*) [READ facts file F-GIT]. The **fence names are
> Spec 58 review ids** (D3, F-C1, D9, R2-17, H5, R2-12, F-M4, F-M3 / C5, F-M9, F-H1, F-H3, C3, F-M7 / M4,
> R2-16, P-C1, D2, OB-2; skip §9 completeness is the CRITICAL fold itself). All 20 anchors are at HEAD
> **`cba60e3c`** (pre-seam) [READ facts file header]. The `① pin` column is the oracle pin (L-id) from §10's
> case map that is this fence's first executed lock.

| Fence | Construct | Why | Lock today | ① pin |
|---|---|---|---|---|
| D3 base abort | `:640-644`, `:659`, `:669` | base missing ⇒ the chain must halt (WF2 cannot enrich) | none | L2, L3, L29 |
| F-C1 empty guard | `:523-524` | an empty staging set must never wipe a table | none | L17 |
| D9 null-the-cell | `:221-229` | the pervasive −1 sentinel; reject-the-row nuked the base (Spec 58 §12) | `zoning.logic` coerceColumn | L8 |
| R2-17 reject-all | `:233-239` | deterministic; no first-wins on CKAN order | `zoning.logic` dedupeRejectAll | L11 |
| H5 geometry in guard | `:492-493` | a raw GeoJSON change must rewrite the row | none | L15 |
| R2-12 all-layers skip | `:597-601` | one skip decision, before any fetch | none | L6, L7 |
| F-M4 730-day reload | `:54`, `:332-337` | force a refresh when the publisher stalls | `zoning.logic`; `source-version.logic:229` | L28 |
| F-M3 / C5 sentinel | `:626`, `:648`, `:662`, `:673` | the consumer warns when base committed but overlays failed | none | L4 |
| F-M9 line simplicity | `geometry-validator.js` `geometryValidationSql` | non-simple / zero-length lines are unusable | `zoning.logic` | L14 |
| F-H1 orphan % | `:242-248`, `:486` | relative to the PRE-delete count; first deploy INFO | `zoning.logic` orphanStatus | L17 |
| F-H3 drift policy | `:401-411` | extras WARN; a missing required column aborts the layer | `zoning.logic` checkAttrDrift | L18 |
| C3 baselines | `:318-323` | read `audit_table.rows`, never flat keys | `zoning.logic` priorMetricValue | L26 |
| F-M7 / M4 key | `:201-206` | `_id` is a positive integer; 0 is degenerate | `zoning.logic` | L12 |
| R2-16 strict HT_LABEL | `:191-198` | never fabricate a height from a range | `zoning.logic` | L10 |
| skip §9 completeness | `:605-617` | a missing key HALTs the consumer (the CRITICAL fold) | none | L6 |
| P-C1 base-only counters | `:696-700` | the ledger counts one table | none | L16 |
| D2 per-layer txn | `:485` | a failed overlay cannot roll back the base | none | L1 (10 txns), L4 (9) |
| Gemini LOW null geometry | `:420`, `:439` | never drop silently | none | L13 |
| OB-2 zero gate | `:261-263`, `:396` | an empty base is FAIL | `zoning.logic` loadedCountStatus | L3 |
| B1 delegation | `:332-337` (`0b230472`) | one shared skip-check lib | `source-version.logic:229` | L6, L28 |

### 4.1 Fences with a regression lock today

Only the **pure helpers** are locked today: `src/tests/zoning.logic.test.ts` (292 L, **41** `it` — the plan
said 44) covers `coerceColumn` / `dedupeRejectAll` / `orphanStatus` / `checkAttrDrift` / `priorMetricValue` /
`loadedCountStatus` and the other helper-only fences, and `src/tests/zoning-bylaw-areas.regression.test.ts`
(**13** `it`) covers **migration + manifest only** [READ facts file F-GIT]; `source-version.logic.test.ts:229`
locks the B1 wrapper decision and `db/zoning.db.test.ts` imports `geomColumnSql`. **Eight fences had NO lock
anywhere before this commit: D3, F-C1, H5, R2-12, F-M3, skip §9, P-C1, D2** — the facts file names exactly
this gap (*"no lock covers the D3 base abort, the skip §9 re-emit, the F-M3 sentinel, F-C1, the guard
composition, or per-layer txns"*) [READ facts file F-GIT]. The **① oracle pins (L1–L29) are their first
executed locks**, and the **② Regression Guardian fences each one against the converted diff** so the
zero-behaviour-change claim of Spec 121 §4.3 is checked, not asserted.

## 5. PH-5 — Seam map (G5)

> Every seam the conversion crosses, with the legacy site that holds it today and the converted seat that
> takes it. Anchors are `[READ scripts/load-zoning.js:<line> @cba60e3c]`; the ① red suite pins the seams
> at the behaviour level (L1–L29 / D1–D11, `src/tests/steps/load_zoning/violations.test.ts`).

| Seam | Legacy site [READ line @cba60e3c] | Converted seat |
|---|---|---|
| **DB** | prior read `:582-585` (`readPriorRunMeta`, chain-scoped `PIPELINE_NAME` `:42`); validation on `pool` `:459`; one `withTransaction` per layer `:485-531`; advisory lock 58 `:573` | runner `ingestPrimaries` (0x) + `executeWrite` per target; `write.validateGeometries` (0z1 `multiline` + `line_validity`); `identity.lock: 58`; `ledgerPipelineName` (LZ-D11) |
| **Clock** | `getDbTimestamp` `:574`; `nowMs = Date.parse(String(runAt))` `:575` (whole seconds, LZ-D16); `Date.now()` for `*_duration_ms` `:391`, `:563`; `ageDaysFrom` `:292-295` parses the TZ-less CKAN version as LOCAL time | the runner clock (`run_at`). The compute never calls `Date.now()` |
| **Network** | `https.get` `:342-358` (30 s socket-idle, 5 redirects, no retry); one `package_show` `:361-368`; offset pagination `:371-385` | the 0y `ckan_datastore` arm (per-request deadline LZ-D15, library redirect cap LZ-D14, `retries_from_config:"none"`, `package_show` memoised once per run, a `total` check) |
| **Env / argv** | no argv; `PIPELINE_CHAIN` via `pipeline.run`; after the ① seam, `ZONING_FORCE_RELOAD` (`applyForceReload`) | `override.force_run` / `recovery.force` = `ZONING_FORCE_RELOAD` |
| **Filesystem** | none (in-memory JSON pages) | none (in-memory JSON pages) |

### 5.1 Prerequisites

- **0x LANDED:** `61e83927`, merge `5c2da8bc`, RE-FREEZE #29. Provides N primaries → N targets, one txn
  per target, and per-primary `on_failure`.
- **0y + 0z1 NOT landed:**
  - plans authorized 2026-10-02 (operator D2/D3), on branch `wf2/ingest-prereq-0y-0z1-c4` in `Buildo-wt-0y`;
  - RE-FREEZE number taken at landing;
  - 0y supplies `ckan_datastore`, the `ckan_metadata` trigger and `skip_scope:"all_primaries"`; 0z1
    supplies `multiline` + `line_validity`.
- **Witness-unblock:** C3 LANDED (`422c5e7c`). C4 lands with 0y, and zoning needs it because it declares
  `recovery.interrupted:"force_full_on_next_run"`.
- **Gate #44:** the runner-ledger fix landed (`91910156`).

**① crosses no unlanded seam; ② waits on 0y + 0z1 + C4.**

## 6. PH-6 — Classification + defect ledger (G6)

`load_zoning` is an **INGESTOR**, confirmed from the code (**R-AO**): **10 CKAN primaries → 10 write
targets**, and write **class B ×10** (a guarded upsert plus an F-C1-guarded NOT EXISTS departure DELETE,
one transaction per layer) [READ §1.1; READ
`scripts/steps/_schema/step-archetype-census.json:405-411`]. The census row reads INGESTOR, batch C5, owner
spec 58; the **batch C5 cell flips to `pending` at ①** under the orchestrator's census flip (R-AO
re-derivation from the code) [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §B `:14`; §F item 25].
The step is committed in the **compressed form** (R-AH): 7 converted INGESTOR members are on record
(`load_ravines`, `address_points`, `parcels`, `load_centreline`, `massing`, `neighbourhoods`, `load_wsib`,
with `load_heritage` at shape_clean) [READ `.cursor/engine-briefs/zn-1-facts.md` F-ID], so the compressed
default applies and no full-form reason exists.

**Spec 121 §4.3 governs method (R-AH / R-PACE-1):** this conversion is **zero behaviour change**; every
carried defect below is pinned **wrong-form** in ① and **fixed only after ③**, each fix in its own ④
commit. The **`LZ-D` prefix is forced**: `defectPrefixFor` derives the prefix from the slug's initials and
G6 reads ONLY `LZ-D*` rows, so the plan's `ZN-D*` ids would score **G6 0** (a hard stop) — the heritage
`LH-D` and `neighbourhoods` `NB→N` precedents are identical [READ
`.cursor/zoning-plan-regrounding-2026-10-02.md` §A A1; READ `scripts/analysis/step-validate.mjs:791-797`].

### 6.1 Defect ledger

The 20 rows below are the re-grounding **§E** rows transcribed **verbatim** (the `LZ-D1`…`LZ-D20`
ids are unique and run D1…D20 with no gaps), with a **① pin** column added.

| ID | Anchor (HEAD cba60e3c) | One-line | Status · disposition | ① pin |
|---|---|---|---|---|
| LZ-D1 | load-zoning.js:537 | `unchanged = max(0, loaded−inserted−updated)` derived, not measured | OPEN · PIN; ② library measures (item 8) | L16 |
| LZ-D2 | :490-493 | `source_dataset_version` is in SET but not in the guard ⇒ unchanged rows keep the old stamp | OPEN · carry (limitation) | L15 |
| LZ-D3 | :402 | attr drift is read from `records[0]` only | OPEN · carry (limitation); the 0y `record_fields` keeps it carryable | L18 |
| LZ-D4 | :375-383 | offset pagination without `sort` | OPEN · carry (declared); ④c | L19 |
| LZ-D5 | :43-58, :472, :294, :298 | 18 threshold literals | OPEN · CLOSES ② (§5; `MAX_REDIRECTS` → LZ-D14, `BATCH_SIZE` → LZ-D18) | D6-claim |
| LZ-D6 | :592-595, :633 | `package_show` failure: an INFO row claims "proceed", and `String(runAt)` is then rejected as TIMESTAMPTZ ⇒ base FAIL | OPEN · ② outcome parity (FAIL, 0 rows) with an honest named message (0y D3); ④a RETIRED | L24/L25 |
| LZ-D7 | :544-564 via source-version.js:137-143 | baselines read the latest successful run, which after a skip holds only `no_op_refresh` ⇒ vacuous on the first load after a skip | OPEN · PIN; ④b | L26 |
| LZ-D8 | :332-337 (730 d from the publisher's version) | after 2028-02-20 every run force-reloads and the age row FAILs | OPEN · carry | L28 |
| LZ-D9 | :609-611 | skip emits `records_*: null` (the ledger stores 0) | OPEN · declared | L6 |
| LZ-D10 | Spec 58:206 vs :361-368 | spec says HEAD per resource; code uses one `package_show` | OPEN · spec corrected at ② | (spec text; no pin) |
| LZ-D11 | :42 | standalone runs read the chain-scoped prior | OPEN · declared deviation (LC-D7) | (declared; no oracle pin; D11-claim) |
| LZ-D12 | :685 | a failed overlay's NEW version is recorded ⇒ the next run skips that overlay | OPEN · PIN wrong-form; ④d WF3 (compute `null`; 0y T12b) | L5/L29 |
| LZ-D13 | :599-600 | `storedLayerVersions[k] ?? storedVersion` fallback | OPEN · declared deviation 0y (i), dropped at ② (fail-safe LOAD) | L27 |
| LZ-D14 | :58, :342-349 | redirect cap 5 | OPEN · declared deviation 0y (v)/D2 (library 20); var struck | L23 |
| LZ-D15 | :45, :344, :355 | 30 s socket-idle timeout | OPEN · declared deviation 0y (iv) (per-request deadline, seed > 30 s) | L23 |
| LZ-D16 | :575 | `nowMs` truncated to whole seconds | OPEN · declared deviation 0y (ii) | (the clock; L6 helper-derived age) |
| LZ-D17 | :613-617 | a missing re-emit key defaults (`?? {}`/`?? false`) | OPEN · declared deviation 0y (iii) (LOAD) | (re-emit default; L27 `{}`) |
| LZ-D18 | :43, :457-467 | geometry validation in 1,000-row batches | OPEN · declared deviation (LC-D12) | L19 |
| LZ-D19 | :639-643, :657-659, :669 | a BASE failure's audit rows (`zoning_areas_fetch_error`/`_load_error` FAIL, `zoning_partial_load` FAIL) are pushed but `throw` precedes `emitSummary`, so the failed run carries NO audit_table [EXECUTED oracle L2/L29: 0 summaries] | OPEN · PIN; ② = whatever the runner's fail terminal emits (an explained diff on the FAIL path only, absent from the goldens) | L2/L29 |
| LZ-D20 | :582-585 | a prior-read failure is `.catch`→warn→null, which silently degrades to a first run (no skip, no baselines) | OPEN · PIN; ② `on_prior_run_error:"warn_row"` (parity, LH-D3 precedent); fix candidate `fail_step` | L21 |

Mirrored into `docs/reports/defect-ledger.md` by the orchestrator in this commit (LH-row format).

### 6.2 Plan premises that did not survive re-grounding (orchestrator findings, owed a ruling where marked)

1. **A1 — the defect prefix (ZN→LZ).** The plan's `ZN-D<n>` ids score **G6 0** (a hard stop): G6 reads only
   `LZ-D*`, and the only `DEFECT_PREFIX_OVERRIDES` entry is `load_wsib→WS` [READ
   `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A1; READ `scripts/analysis/step-validate.mjs:791-797`].
   Renamed `ZN-Dn → LZ-Dn` (same numbers); the heritage `LH-D` and `neighbourhoods` `NB→N` precedents are
   identical, and no other manifest slug maps to `LZ`.
2. **A2 — the forced reload of unchanged data writes 121 GEOS-drift rows on 7 targets and 0 on 3.** The
   source is unchanged, yet the re-derived `geom` differs (`IS DISTINCT FROM`/WKB) on 121 rows (base 10 ·
   height 37 · lot_coverage 16 · building_setback 4 · policy_area 10 · rooming_house 21 · parking_zone 23 ·
   policy_road 0 · priority_retail 0 · queenstw_eat 0); `ST_Equals` holds on all, and the 121 are a subset of
   the 162 invalid-source rows [MEASURED 2026-10-02] [READ `.cursor/zoning-plan-regrounding-2026-10-02.md`
   §A A2]. The plan §8 `perturb.sql` (self-restoring through the load) is **insufficient** — it leaves the 121
   rewritten, has no negative control and no unconditional restore — and is **replaced by an R-AS committed
   cohort (§9)**, cloned from the heritage instrument (`load-heritage-cohort-differential.js` +
   `differential/cohort.json`, `cfc4f80b`) [READ §D]. **Owed: operator ruling** (the heritage E3 precedent
   [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §C item 31 (i)]).
3. **A3 — LZ-D12 is at `:685`, not `:686/690`.** `zoning_layer_versions: Object.fromEntries(LAYERS.map(…))`
   stamps every layer's NEW version including a layer whose fetch or load failed; `:686` is the F-M3 sentinel
   and `:690` is the verdict, and the next run's `decisions` then see that overlay as `unchanged`
   [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A3; READ `scripts/load-zoning.js:685`].
4. **A4 — the prior read now admits `completed_with_warnings`.** `readPriorRunMeta` (witness-unblock C3
   `422c5e7c`) admits `completed_with_warnings` minus preserve-and-WARN runs, and the legacy loader reads its
   prior through it, so **LZ-D7's "latest COMPLETED run" wording is stale** — re-worded to "latest successful
   run (`completed`/`completed_with_warnings`)" [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A4;
   READ `scripts/lib/source-version.js:132-143`].
5. **A5 — the consumer's strict status.** `readZoningContract` still filters `status = 'completed'`, stricter
   than the producer-side prior; a converted STANDALONE WARN run becomes `completed_with_warnings` while
   legacy writes `completed` on WARN. It is a **fleet item owned by witness-unblock C8, NOT an LZ-D**, and is
   recorded in §3(c) and the ② explained-diff list [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A
   A5; READ `scripts/lib/compute/enrich-parcels.js:181`].
6. **A6 — generated Target Files.** Spec 58's Target Files is a **GENERATED block now** (Spec 124 R-BE), so
   hand-listing a path is RED; plan §1's "add to 58 Target at ①/②" becomes "`npm run target-files` regenerates
   the block" [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A6; READ
   `docs/specs/01-pipeline/58_source_zoning_bylaw.md:399-409`].
7. **A7 — `step-validate` needs the pending entry.** `step-validate --step=load_zoning` refuses ("no step
   found") until a `converted.json` pending entry exists, and fast invariant #5 requires an `it.fails(` to sit
   under a pending slug, so the entry must land in the **same commit as the suite** [READ
   `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A7].
8. **A8 — the force seam is a prerequisite commit.** A legacy `ZONING_FORCE_RELOAD` seam (O2) is a
   prerequisite commit for ① and was never built for zoning; heritage built its own (`451962ac`), and the
   oracle copy is taken AFTER the seam lands [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A8; §C
   ① item 2].
9. **A9 — the audit row count.** Run 1085 (the last real load) has **81** rows, not ~107 ("~107" was the
   commit message's upper bound with every conditional row present); skip runs have 5 rows
   [MEASURED 2026-10-02, F-DB] [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A9].
10. **A10 — skip runs lack `pipeline_meta`.** Run 1085's keys include `pipeline_meta`; runs 1291-2189 lack it
    because the skip path returns before `emitMeta` (`:621` vs `:703`); an explained-diff candidate at ② if
    the converted skip terminal emits it [MEASURED 2026-10-02, F-DB] [READ
    `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A10].
11. **A11 — the timeout seed is > 30 s.** 0y requires `execution.network.timeout` > 30 s (whole-request
    deadline vs legacy socket-idle), so §5's `load_zoning_http_timeout_ms` is a **declared deviation
    (LZ-D15)** with a seed > 30000; the heritage precedent is `load_heritage_download_timeout_ms` = 60000
    [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A11]. **Owed: value at ②.**
12. **A12 — transient CKAN 504s: a capture that hits one is VOID and re-run.** CKAN returned intermittent
    504/HTML on 4 of 14 single-record probes; legacy has no retry, so an overlay 504 becomes a WARN skip (a
    different golden) and a base 504 is FAIL; the converted declares 0 retries (parity). A capture that hits a
    504 is **VOID and re-run**, never explained away [MEASURED 2026-10-02, F-NET] [READ
    `.cursor/zoning-plan-regrounding-2026-10-02.md` §A A12].
13. **0y D3 — LZ-D6 disposition.** The ② treatment is **outcome parity (FAIL, 0 rows) with an honest named
    message**; the original ④a fix is **RETIRED** [READ `.cursor/zoning-plan-regrounding-2026-10-02.md` §E
    LZ-D6; §C ④].
14. **Re-grounding §C Q1–Q3 — owed at the ② plan:** (Q1) layer dispatch without an external id (the
    `shapeRecord` seam carries none, `index.js:1383-1385`); (Q2) LZ-D3 vs a throwing `shapeRecord` (read the
    drift from 0y's `acquired.record_fields`; `shapeRecord` maps a missing field to `null`); (Q3)
    `execution.txn_scope` (heritage measured one txn per target ⇒ `"batch"`, not plan §1's `"step"`) [READ
    `.cursor/zoning-plan-regrounding-2026-10-02.md` §C Q1-Q3].

## 7. PH-6 — Literal ledger (Rule 3)

Plan §5 transcribed, with **two changes from the 0y fold**: `MAX_REDIRECTS` is **STRUCK** (LZ-D14) and the
timeout seed is a **declared deviation > 30000** (LZ-D15). Every variable is registered with
`on_invalid:"fail"` and seeded at ② (defaults byte-equal except the two noted).

| Legacy literal [READ line] | Registered name | Seed default | Consumer |
|---|---|---|---|
| `BATCH_SIZE` 1000 `:43` | retired (LZ-D18) | — | — |
| `DATASTORE_PAGE` 10000 `:44` | `load_zoning_datastore_page_size` | 10000 | 0y `ckan.page_size_from_config` |
| `HTTP_TIMEOUT_MS` 30000 `:45` | `load_zoning_http_timeout_ms` | **> 30000, chosen at ② (LZ-D15; heritage precedent 60000)** | `execution.network.timeout_from_config` |
| `MAX_REDIRECTS` 5 `:58` | **STRUCK** (0y D2; LZ-D14) | — | — |
| `ORPHAN_INFO_PCT` 0.5 / `ORPHAN_WARN_PCT` 2.0 `:48-49` | `load_zoning_orphan_warn_pct` / `_fail_pct` | 0.5 / 2 | orphan-band verdict seat |
| `LOADED_PCT_PASS` 95 / `_WARN` 90 `:50-51` | `load_zoning_loaded_pct_warn_below` / `_fail_below` | 95 / 90 | loaded-% verdict seat |
| `AGE_INFO_DAYS` 450 / `AGE_FAIL_DAYS` 730 `:52-53` | `load_zoning_dataset_age_warn_days` / `_fail_days` | 450 / 730 | dataset-age check |
| `FORCE_RELOAD_STALE_DAYS` 730 `:54` | `load_zoning_force_reload_max_age_days` | 730 | 0y trigger `max_age_days_from_config` |
| `NULL_COUNT_WARN_OVER_PCT` 10 `:55` | `load_zoning_null_count_warn_over_pct` | 10 | null-count check |
| `WITH_EXCEPTIONS_WARN_BELOW_PCT` 50 `:56` | `load_zoning_with_exceptions_warn_below_pct` | 50 | exceptions check |
| `DURATION_WARN_FACTOR` 2 `:57` | `load_zoning_duration_warn_factor` | 2 | duration check |
| invalid-polygon 50 / 0.5 `:472` | `load_zoning_base_invalid_polygon_warn_max_count` / `_warn_max_pct` | 50 / 0.5 | invalid-polygon check |
| `topNDistribution` n=20 `:298` | `load_zoning_distribution_top_n` | 20 | distribution check |
| `86400000` `:294` | none: `MS_PER_DAY` from `scripts/lib/units.js:28` | — | (gate E closed answer) |

The layer map's min/max/maxLen mirror the **migration-164 CHECK constraints** (domain schema facts, not
tunables). Gate E flags only module-level constants and SQL bounds
(`gates/compute-literals.mjs:32-39`); if ② shows it flags them, that is **O3** (keep them as data plus a
migration-equality lock).

## 8. Non-determinism inventory (before the first golden)

Written **before** any golden exists, per plan §8, so that every later PRE/POST diff has a named cause.

- **`id` serial.** Excluded from the projection; a re-inserted row takes a **new** id (§1.2 — the step never
  writes it), so it is not stable across runs.
- **`created_at`.** A DB default; excluded (the `--table-columns` lists in §9.1 omit it deliberately).
- **`*_duration_ms` + `sys_duration_ms` / `sys_velocity_rows_sec`.** Wall clock; **never compared**. The
  legacy F-H14 duration check compares them to the **prior's** values, so a duration **WARN** can appear by
  chance [READ `.cursor/engine-briefs/zn-1-facts.md` F-DB — the 5-row skip audit set].
- **`dataset_version_age_days`.** A function of the run date. `ageDaysFrom` parses the **TZ-less** CKAN
  version with `Date.parse`, which reads it as **LOCAL** time, so the value can shift by one day with the
  process `TZ` [READ `scripts/load-zoning.js:292-295`; walkthrough §5].
- **`source_dataset_version` cast.** The session TimeZone is **`UTC`** [MEASURED 2026-10-02, F-DB]. PRE and
  POST must use the **same** session TZ, or the stored `2026-02-20 21:29:42.613615+00` round-trips
  differently.
- **GEOS vertex order.** **121** stored geoms differ from today's `ST_MakeValid` output (base 10 · height 37 ·
  lot_coverage 16 · building_setback 4 · policy_area 10 · rooming_house 21 · parking_zone 23 · policy_road 0 ·
  priority_retail 0 · queenstw_eat 0; `ST_Equals` holds on all) [MEASURED 2026-10-02, F-DB; re-grounding §A
  A2]. The **first** load of ANY kind rewrites them, so PRE/POST symmetry needs the cohort restore (§9).
- **CKAN transient 504.** CKAN returned intermittent 504 / HTML on **4 of 14** probes [MEASURED 2026-10-02,
  F-NET]. Legacy has no retry, so a capture that hits one is **VOID** — an overlay 504 becomes a WARN skip
  (a different golden) and a base 504 is FAIL (re-grounding §A A12; §6.2 item 12).
- **The prior-run row.** Baselines (`loaded_pct`, `with_exceptions`, null counts, duration) read the **latest
  successful run** (`completed`/`completed_with_warnings`, A4) [READ `scripts/lib/source-version.js:137-143`].
  A standalone PRE leaves a `load_zoning` row that the converted standalone POST then reads — **LZ-D11**; all
  six `sources:load_zoning` runs today are `completed`/PASS/partial false, with **no** standalone
  `load_zoning` row [MEASURED 2026-10-02, F-DB]. Captures must **pin the prior state**, or
  `explained-diffs.json` must name it.

## 9. PRE goldens + forced-change proof — NOT YET CAPTURED

**State:** a **fleet recapture holds the DB slot**, and the **R-AS cohort instrument is owed first**
(re-grounding §C item 31 (i)). Nothing in this section is measured **except the forced-reload measurement in
9.2** (executed 2026-10-02, read-only) [READ re-grounding §A A2, §D]. No
`docs/reports/golden/load_zoning/pre/*.json` exists at this commit.

### 9.1 Commands (verified against the tool; heritage two-step form)

Commit the cohort **first** — it must exist before any capture:

```
DOTENV_CONFIG_PATH=C:/Users/User/Buildo/.env node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --derive
```

(writes `docs/reports/golden/load_zoning/differential/cohort.json`). Then the PRE side:

```
… load-zoning-cohort-differential.js --run --side=pre --legacy-ref=<force-seam commit> --chain=sources --out=docs/reports/golden/load_zoning/pre/sources.json
```

and the same with `--chain=none --out=docs/reports/golden/load_zoning/pre/standalone.json`.

The cohort script spawns `capture-step-golden.js` with:

- `--tables=<10 tables>` — **REQUIRED** (with no descriptor `resolveTables` returns
  `{"tables":[],"source":"none"}` and `--table-columns` then **throws** — re-grounding §B `:193` adjacent;
  heritage §9.1 correction 1);
- `--table-columns="<t>:source_id,<data cols>,geometry,geom,source_dataset_version;…"` — `id` / `created_at`
  omitted; the projection is **explicit** so a future Spec 58 §13 column is visible;
- `--table-order="<t>:source_id;…"` — **`;`-separated**, not the plan's comma form (heritage §9.1 correction 2);

all under **`ZONING_FORCE_RELOAD=1`** [the ① seam, walkthrough §5]. Witness traces land beside the goldens
(`docs/reports/witness/load_zoning/pre/*.trace.json`).

### 9.2 Why a cohort (R-AS), measured

Transcribed from re-grounding **§A A2** and **§D** [MEASURED 2026-10-02, F-DB]:

- A forced reload of **unchanged** data writes **121** geom-only rows on **7** targets and **0** on
  **policy_road, priority_retail and queenstw_eat** — so gate G's per-target nonzero FAILS without a cohort.
- The **121 converge after the first forced load**; a PRE run consumes them and POST then writes **0**, so
  PRE and POST are **asymmetric** unless the baseline is restored.
- The arms, per table, **fixed stride, pairwise disjoint**:

  | Arm | Perturbation | Expected after the step | Proves |
  |---|---|---|---|
  | **U** | add a key to the guard column `geometry` JSONB | healed (updated) | the guard includes `geometry` (H5) |
  | **A** | `source_dataset_version = '2000-01-01'` | NOT healed (only the restore heals it) | **LZ-D2** — the version stamp is OUTSIDE the guard |
  | **D** | delete rows (before-image on disk) | re-inserted | insert path |
  | **P** | 1 phantom row (key = max + 100000) | departure DELETE fires | NOT EXISTS delete |
  | **X** | the 121 GEOS-drift rows (pre-existing, not perturbed) | updated (vertex order) | declared, so "updated == cohort" holds |
  | **NC** | the remainder | byte-identical | negative control |

- **P only where `1/(n+1) ≤ 0.5 %`** ⇒ the orphan band INFO, not FAIL. Skip **building_setback** (4 rows:
  `1/5 = 20 %` ⇒ `orphanStatus` FAIL ⇒ verdict FAIL ⇒ converted status `failed`) and queenstw_eat.
- **building_setback has no negative control**: all 4 of its rows are in **X** (re-grounding §D).
- **Assertions** read from `loaded − unchanged_skipped` and `orphans_removed_count` — the legacy counters are
  **base-only** (P-C1) [READ `scripts/load-zoning.js:696-700`], so target per table is
  `loaded − unchanged = |U|+|D|+|X|` and `orphans = |P|`.

### 9.3 Owed before ②

1. An **operator ruling** on the cohort — the heritage **E3** precedent [READ re-grounding §C item 31 (i)].
2. The cohort script itself: a clone of `load-heritage-cohort-differential.js` (`cfc4f80b`), reviewed by the
   **Idempotency lens + a grounder**.
3. **PRE captures** in a **free DB slot** (both sides: sources + standalone).
4. **0y + 0z1 + witness C4** landed (C4 because the descriptor declares
   `recovery.interrupted:"force_full_on_next_run"`) [READ re-grounding §C ②; §5.1].

## 10. Red suite (PH-7)

`src/tests/steps/load_zoning/violations.test.ts` + `fixtures/`. `fixtures/legacy-harness.ts` evaluates the
verbatim `legacy-load-zoning.js.txt` — a **byte copy of `scripts/load-zoning.js` at the seam commit** — against
a fake `https` + a fake `./lib/pipeline`, with the **REAL** `source-version` / `zoning-attr-drift` /
`geometry-validator` modules; the fixture data is `zoning-records.json` [READ re-grounding §C ① item 3;
walkthrough §10]. The live `scripts/load-zoning.js` is never required in-process by this file.

### 10.1 Case → test map

| Case | Test id |
|---|---|
| L1 | first run, happy path |
| L2 | D3 base fetch 503 aborts before any overlay; its FAIL rows are never emitted (**LZ-D19**) |
| L3 | D3 base non-throw failure (CodeRev H2) |
| L4 | an overlay fetch 503 gives WARN rows; the run continues; the F-M3 sentinel |
| L5 | **LZ-D12** (pinned wrong-form): the failed overlay's NEW version is recorded, so the next run skips it |
| L6 | R2-12 all-layers skip re-emits the full §9 contract from the prior; counters null (**LZ-D9**); no `emitMeta` |
| L7 | R2-12 is all-or-nothing: one changed layer reloads all ten |
| L8 | D9: the −1 sentinel and out-of-range values null the CELL, keep the row, and are counted |
| L9 | TEXT maxLen truncation, blank → null, top-20 distribution, exceptions count |
| L10 | R2-16 strict HT_LABEL parse (ranges and blanks never fabricate a height) |
| L11 | R2-17 reject-ALL duplicates: base FAIL row, overlay WARN; the run still completes |
| L12 | F-M7/M4 INTEGER key: `"1"` binds the number 1; 0 and `"abc"` are rejected and counted |
| L13 | a null geometry is counted BEFORE key coercion |
| L14 | F-M9 line arm + the base invalid-band FAIL + repaired count + Multi-wrapped geom per family |
| L15 | H5 + **LZ-D2**: `source_dataset_version` is in SET but NOT in the guard |
| L16 | **LZ-D1** unchanged derived by subtraction; P-C1 counters are base-only |
| L17 | F-C1 empty guard; an EMPTY overlay counts as loaded; the F-H1 orphan band on the PRE-delete count |
| L18 | **LZ-D3**: attribute drift reads `records[0]` only |
| L19 | **LZ-D4** offset pagination with no `sort`; **LZ-D18** validation in 1,000-row batches |
| L20 | lock contention: the SDK skips; nothing is fetched or emitted |
| L21 | **LZ-D20**: a prior-read failure silently degrades to a first run |
| L22 | the ① force seam (plan O2): with `ZONING_FORCE_RELOAD=1` every layer loads past an all-unchanged prior |
| L23 | network posture: redirect cap 5 (**LZ-D14**), 30 s socket-idle timeout (**LZ-D15**), the `success:false` text |
| L24 | **LZ-D6** (pinned wrong-form): a failed `package_show` logs INFO "proceed"; every layer binds `String(runAt)` |
| L25 | a resource `package_show` omits gets `String(runAt)` and records null |
| L26 | **LZ-D7** (pinned): baselines read the latest prior's rows, so after a skip run they are vacuous |
| L27 | **LZ-D13**: with no `zoning_layer_versions` in the prior, every layer falls back to `source_dataset_version` (`?? storedVersion`) |
| L28 | **LZ-D8**: the 730-day window runs from the PUBLISHER's version |
| L29 | load errors: an overlay is WARN-skipped with its version STILL recorded (**LZ-D12**, second path); a base error rejects with no summary (**LZ-D19**) |
| D1 | identity and frozen shell: descriptor AJV-valid, lock 58 / spec "58" / archetype INGESTOR, `execution.shape` "ingest", notes + compute load, shell is a `pipeline.step()` with `ADVISORY_LOCK_ID = 58` (flips at ②) |
| D2 | ten CKAN DataStore primaries: externals ids equal the legacy `LAYERS` keys in order, each `http_api`/`ckan_datastore`, `key_property "_id"`, target/LICENSE parity, base aborts / overlays `warn_row_continue`, the `assert-schema.js` copy matches every `resource_id` (flips at ②) |
| D3 | staleness: `skip_scope "all_primaries"`; exactly one `ckan_metadata` trigger with `emit_key "zoning_layer_versions"` and no `external`; `recovery.interrupted "force_full_on_next_run"`; `override.force_run === recovery.force === "ZONING_FORCE_RELOAD"` (flips at ②) |
| D4 | ten class-B write targets: tables equal the legacy `LAYERS` tables in order, key `source_id` / INTEGER, `upsert_scoped_departure_delete` / `is_distinct_from` / `zero_writes`; sorted `guard_columns` = `[...L.cols, "geometry", "geom"]` MINUS `source_dataset_version`; LINESTRING layers `multiline` + `length_and_simple` (flips at ②) |
| D5 | network: `retries_from_config "none"`, `timeout_from_config "load_zoning_http_timeout_ms"`, seed > 30000 (**LZ-D15**) (flips at ②) |
| D6 | every `ZONING_VARS` name in `config.logic_variables` with `on_invalid "fail"`; `load_zoning_max_redirects` wholly absent (**LZ-D14** struck); seed defaults equal the legacy literals (flips at ②) |
| D7 | key and dedupe parity: `compute.coerceKey` === legacy `coerceSourceId` over 11 values, and `dedupeBySourceId` deep-equals `legacy().dedupeRejectAll` and yields `{kept:[{source_id:2}], duplicateCount:2}` (R2-17 reject-ALL, NOT keep-first) (flips at ②) |
| D8 | `shapeRecord` parity with legacy `coerceColumn` record by record, with tags: base `_id` 2 → 2 `out_of_range_nulled`; height `_id` 2 → contains `unparseable_height` (flips at ②) |
| D9 | checks are config-bound (gate A): every `d.checks[i]` has `limit === 'viol == 0'` or a `limit_from_config` in the declared variable names, including `load_zoning_orphan_fail_pct` / `_loaded_pct_fail_below` / `_dataset_age_fail_days` / `_base_invalid_polygon_warn_max_count`; a WARN check `zoning_override_force_reload_present` exists (L22 parity) (flips at ②) |
| D10 | emits and counters (frozen §9, P-C1): the emit key set ⊇ `zoning_layers_loaded` / `zoning_partial_load` / `source_dataset_version` / `zoning_layer_versions` / `base_layer_committed_after_overlays_failed`; `zoning_layers_loaded.consumers` === `['enrich_parcels']`; `records_total` / `records_new` / `records_updated` sources contain `zoning_bylaw_areas` (flips at ②) |
| D11 | declared defects: `JSON.stringify(deviations)` names `LZ-D11` / `LZ-D13` / `LZ-D14` / `LZ-D15` / `LZ-D16` / `LZ-D17` / `LZ-D18`; `JSON.stringify(limitations)` names `LZ-D2` / `LZ-D3` / `LZ-D4` / `LZ-D8` (flips at ②) |

- **L-pins are plain `it`, GREEN** at ① — they exercise the legacy decision logic through the byte copy.
- **D-claims are `it.fails`, RED as named missing artifacts** and recorded in
  `docs/reports/red-evidence/load_zoning/pre2-artifacts-missing.json` — the vitest JSON of the
  it.fails-inverted run, gate K, orchestrator [READ re-grounding §C ① item 8].
- The **force-seam lock** is its own file: `src/tests/load-zoning-force-seam.logic.test.ts` (zn-1b), which
  locks the `ZONING_FORCE_RELOAD` override [READ re-grounding §C ① item 2].

## R. Reflection (G9)

### LOW-CONFIDENCE

| Item | Why low confidence | Owner / next step |
| --- | --- | --- |
| Q1–Q3 (§6.2 item 14) | Layer dispatch without an external id; LZ-D3 vs a throwing `shapeRecord`; `execution.txn_scope`. All three are open design questions, not facts | ② plan — raise them there, never as a zoning-local hatch |
| The timeout seed value | Only the *bound* is known (> 30000, LZ-D15; heritage precedent 60000); the exact value is a ② choice | ② author — A11 |
| The cohort's tiny tables | `building_setback` (4 rows, all in X) admits no NC and no P arm; `queenstw_eat` (4 rows) likewise | ② — declare it, as heritage did for its small table (§9.2) |

### RECURRING / STANDARD-SHAPING

| Finding | Recurs where | Proposed standard |
| --- | --- | --- |
| Consumer strict-status readers vs converted `completed_with_warnings` | `enrich_parcels` `:181` (strict `status = 'completed'`); the force-WARN row makes every forced standalone POST `completed_with_warnings` | Fleet item owned by witness-unblock **C8** — one sweep over consumer readers, not a per-step hatch (§6.2 item 5) |
| Every multi-target INGESTOR needs the same cohort shape | `load_heritage` (`cfc4f80b`), massing, neighbourhoods, this row | A **shared cohort library** (arms U/A/D/P/X/NC + restore + projection) is a candidate — the zoning clone should consume it, not fork it |
| The defect-prefix rule surfaces late | `ZN→LZ` here; `NB→N`, `HR→LH`, `load_wsib→WS` before | Check the prefix at **plan time**, before ids are written into plans |

## A. Measurement log (2026-10-02)

Transcribed from `.cursor/engine-briefs/zn-1-facts.md`; each bullet names the query or probe.

### A.F-DB

- `SELECT PostGIS/GEOS/PG version`, `SHOW TimeZone` → PostGIS 3.3.7 / GEOS 3.14.1 / PG 17; session TimeZone
  `UTC`; stored `source_dataset_version` = `2026-02-20 21:29:42.613615+00`.
- `SELECT COUNT(*)` per table → equal to the CKAN `total`s: base 11,719 · height 2,528 · lot_coverage 1,242 ·
  building_setback 4 · policy_area 352 · policy_road 8,913 · rooming_house 558 · parking_zone 913 ·
  priority_retail 643 · queenstw_eat 4. Every table keys `source_id` 1..n, one version value.
- `SELECT … FROM pipeline_runs WHERE pipeline ILIKE 'load_zoning'` → 6 rows, all `sources:load_zoning`, all
  `completed`, verdict PASS, partial false; **no standalone `load_zoning` row**. Run **1085** (2026-06-10):
  11719/0/0, 44.7 s, **81** audit rows, keys incl. `pipeline_meta`. Runs 1291/1365/1406/1484/2189 (2026-06-25 →
  2026-09-30): SKIP, records 0/0/0, **5** audit rows (license, `no_op_refresh`, `dataset_version_age_days`,
  `sys_velocity_rows_sec`, `sys_duration_ms`), keys LACK `pipeline_meta`. 2189's age = 221.
- `SELECT … zoning_layer_versions` → all 10 = `2026-02-20T21:29:42.613615` on 1085 and 2189; every
  `zoning_layers_loaded` value is true.
- `SELECT *_repaired_polygon_count` on run 1085 → 22/49/24/4/11/0/24/28/0/0;
  `zoning_areas_out_of_range_nulled_count` = 78,744; `height_overlay_out_of_range_nulled_count` = 411; every
  `*_loaded_pct` = null `_no_baseline`; `zoning_areas_with_exceptions_count` = 8,956.
- Null maxima: `fsi_max` non-null 2,835; `exception_number` non-null 8,956; base `zn_zone`/`zn_string` at maxLen
  0/0; height `height_max_m` NULL 0/2,528; `ht_stories` NULL 1,811.
- **GEOS drift** (`IS DISTINCT FROM` = WKB-unequal; `ST_Equals` true on all) → **121** rows: base 10 ·
  height 37 · lot_coverage 16 · building_setback 4 · policy_area 10 · policy_road 0 · rooming_house 21 ·
  parking_zone 23 · priority_retail 0 · queenstw_eat 0. Invalid sources: 22/49/24/4/11/0/24/28/0/0 = 162.

### A.F-NET

- `package_show?id=34927e44-…` succeeds; `metadata_modified` = `2026-02-20T21:29:42.613615`; all 10 zoning
  resources listed (of 92) with `last_modified: null`, so the legacy fallback makes every version the
  `metadata_modified` value. **The source is UNCHANGED.**
- `datastore_search?limit=1` totals (10 probes) = the table counts above.
- Base record keys: 25 (`_id` + 23 mapped + `geometry`), so no attr drift. `building_setback` and
  `queenstw_eat` have IDENTICAL field sets (`_id,OBJECTID,ZN_STRING,CH600_AREA_TYPE,BYLAW_SECTIONLINK,geometry`).
- **4 of 14** probes returned 504 / HTML (transient).

### A.F-CODE

- Converted runner: `index.js:6033-6034` WARN ⇒ `completed_with_warnings`. Legacy `pipeline.run` WARN ⇒
  `completed`.
- `source-version.js:137-143` `readPriorRunMeta` admits `completed_with_warnings` (C3 `422c5e7c`).
- Consumer `compute/enrich-parcels.js:171-197`: HALTs on (a) a latest `failed` run, (b) no `completed` row with
  an object `zoning_layers_loaded` (strict `status = 'completed'`, `:181`), (c) `base !== true`.
- `index.js:1383-1385` `shapeRecord` seam = `{geojson, config, run_at, tag, lookups?}`, with **NO** external id.
- `consumer-registry.json` has **0** zoning rows; `standard-gates-ledger.json` has 0 `load_zoning` rows;
  `converted.json` pending = load-heritage only.
- `step-validate --step=load_zoning --fast` refuses ("no step found") until a pending entry exists.

### A.F-GIT

`git log -S<construct> -- scripts/load-zoning.js` — every hit is `58914fa8`:

- `throw err` base abort (D3) · `orphanSkipped = true` (F-C1) · `nulled: true` (D9) · `dedupeRejectAll` (R2-17) ·
  `H5: include geometry` · `decisions.every((d) => d.skip)` (R2-12) · `FORCE_RELOAD_STALE_DAYS` (F-M4) ·
  `baseCommittedThenOverlayFailed = true` (F-M3/C5) · `aborting chain per D3` (CodeRev H2) · `LINESTRING`
  (F-M9) · `ORPHAN_WARN_PCT` (F-H1) · `zoning_layer_versions: Object.fromEntries` · `String(runAt)` ·
  `priorMetricValue(prior` (C3) · `coerceSourceId` (F-M7/M4) · `parseHeightLabel` (R2-16) · skip re-emit
  (`zoning_layers_loaded: prior?.records_meta`) · `records_total: baseLoaded` (P-C1).
- `skipCheckDecision` delegation = `0b230472`.
- Locks today: `zoning.logic.test.ts` (292 L, 41 `it`: pure helpers only), `zoning-bylaw-areas.regression.test.ts`
  (13 `it`: migration + manifest), `source-version.logic.test.ts:229` (wrapper decisions), `db/zoning.db.test.ts`
  (`geomColumnSql`). **No lock** covers the D3 base abort, the skip §9 re-emit, the F-M3 sentinel, F-C1, the
  guard composition, or per-layer txns — the ① oracle pins (L1–L29) are the first.

### A.F-ORACLE (prototype, executed; the suite pins these)

- Happy path (fixture, first run): records 4/4/0; verdict WARN (the only WARN is
  `zoning_height_overlay_unparseable_label_count` 1); 1 `package_show` + 10 `datastore_search` in legacy order;
  timeout 30000; txns 10; lock 58; `emitMeta` 10 reads / 10 writes / `['CKAN']`.
- Base 503 ⇒ reject, 1 `datastore` call, **0 summaries** (the FAIL rows pushed at `:639`/`:642` are never
  emitted: **LZ-D19**).
- Overlay 503 ⇒ WARN rows, txns 9, F-M3 true, and the failed layer's version is STILL recorded (**LZ-D12**).
  The next run with that prior skips ALL (0 `datastore` calls).
- `package_show` 500 ⇒ INFO `skip_check_error`; every upsert binds `String(runAt)` as the version;
  `zoning_layer_versions` all null; age 0.
- 10,001 records ⇒ offsets 0 and 10000, no `sort`; 11 validation batches (1000×10 + 1).
- `runAt` 2028-03-01 ⇒ reload + age 739 FAIL. 2027-06-01 ⇒ skip + age 465 WARN.

