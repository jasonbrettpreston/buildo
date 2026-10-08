# Batch 2 Phase 3 row 3.2 — `load_centreline` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: PH-0 / PH-3 frozen (commit ① part A1). NOT converted.**
> `converted.json` carries FOUR INGESTOR members and the census row for this slug is INGESTOR.
> This row is the archetype's **4th** member ⇒ R-PACE-1 eligibility **IS MET** and the compressed
> form applies. The literal marker line above is present; the FULL nine-commit form's marker is
> deliberately absent. **This row is the FIRST converted class C (`staging_full_replace`)** —
> every prior INGESTOR was class A or B.

**Target slug:** `load_centreline` · **Script:** `scripts/load-centreline.js` (**726** lines —
the tree's `wc -l`) · **Chain:** `sources` [READ `scripts/manifest.json:15`:
`"load_centreline": { "file": "scripts/load-centreline.js", "supports_full": false,
"supports_dry_run": false, "telemetry_tables": ["toronto_centreline"] }`] ·
**Lock:** `ADVISORY_LOCK_ID = 63` [READ `scripts/load-centreline.js:41`; READ
`docs/specs/01-pipeline/62_source_centreline.md` L4 — "advisory lock = **63** … original 65 guess
collided with enrich-parcels, so the next free gap 63 is used"; Spec 47 §A.5 registry].

**Owner specs (the ONLY two)**, both named in the system map:

- Spec **62** (`docs/specs/01-pipeline/62_source_centreline.md`) — the PRIMARY owner. Its §5/§12
  deliverable list names `scripts/load-centreline.js` [READ `62_source_centreline.md:445`:
  "`scripts/load-centreline.js` (NEW; Spec 47 R1-R12 skeleton; advisory lock 63)"]. The loader is
  its step row; `enrich-centreline.js` (lock 64, L4b) is the down-step consumer.
- Spec **43** (`docs/specs/01-pipeline/43_chain_sources.md`) — the chain owner. Spec 62 L22 /
  §12 [READ `62_source_centreline.md:58`, `:1159`]: "`chain_sources` inserts `load_centreline`
  AFTER `load_parcels` slug; `enrich_centreline` AFTER `enrich_heritage`".

**Governing plan of record (every adjudication transcribed below is the orchestrator's, not
re-decided here):** `.cursor/batch2_p3_2_load_centreline_active_task.md`. ⚠️ **MEASURED 2026-09-24:
that file is NOT present in this worktree** — `git ls-files .cursor` lists no
`batch2_p3_2_load_centreline*` file and `git grep 'batch2_p3_2_load_centreline'` matches ONLY the
three engine briefs that cite it as a path [READ
`.cursor/engine-briefs/b2-row3.2-c1a-assessment.md:7`, `…c1a2-assessment-ledgers.md:8`,
`…c1b-red-suite.md:8`]. Every "plan §N" / "orchestrator ruling, plan, 2026-09-24" citation below is
therefore **transcribed from the brief's own record of the ruling** (this brief carries them
verbatim, per its own instruction "transcribe"), not re-verified against a plan file that is not on
disk. Where an independent on-disk corroborator DOES exist it is cited beside it (the standing
programme files `.cursor/wf2_ingestor_runner_completion_active_task.md` §D5/§D7/§D8 and
`.cursor/wf2_class_c_staging_replace_active_task.md`, which ARE present and DO carry the class-C
and row-3.2 rulings for this exact row [READ
`wf2_ingestor_runner_completion_active_task.md:12` — the row-3.2 "Needs beyond today" entry naming
shapefile attributes, `geometry_kind: line`, class C, and the two unregistered libs]).

**Method governed by Spec 121 §4.3.** **Spec 122 §1.4** class table governs the write class
(re-derived from the code in §1, never trusted from the plan). Spec 123 §2.1 governs the risk-class
row.

**Three libraries this step consumes:** `scripts/lib/source-version.js` [READ
`scripts/load-centreline.js:36`], `scripts/lib/config-loader.js` [READ `:34`], and
`scripts/lib/safe-math.js` [READ `:35`]. Per the standing programme decision **D8 (registry
hygiene)** the two unregistered ones (`source-version.js`, `config-loader.js`) are registered under
their owner spec at this step's commit **③** [READ
`wf2_ingestor_runner_completion_active_task.md` §D8: "unregistered libs (`source-version.js`,
`config-loader.js` …) are registered under their owner spec at the converting step's commit ③ (the
drift-lib precedent); Spec 43 has no `## Operating Boundaries` — added at 3.2's commit ③"]. Same
ruling also flags Spec 43's missing `## Operating Boundaries` section as this row's ③ deliverable.

**Measurement environment:** every `[READ]` below was re-derived from this worktree on 2026-09-24
(no DB writes, no chain run). Values the brief supplies and marks as its own measurement are carried
as `[MEASURED 2026-09-24]` **with the provenance stated where they cannot be re-executed from this
allowlist** (§1.3 run-1471 audit values; §1.6 memory figures). No number is presented as this
session's own that is not.

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-centreline.js` end to end (726 lines), not from the manifest, the
> specs or any prior report. Spec 122 R5: the write class is re-derived from the code here, never
> trusted from the plan.

**Risk class (Spec 123 §2.1):** **class C** — `staging_full_replace`, **destructive full replace**.

| Field | Value | Why |
|---|---|---|
| risk class | **C** (highest write class) | every run `DELETE FROM toronto_centreline` inside the txn [READ `scripts/load-centreline.js:621`]. A crash mid-txn can leave the table empty or partially rebuilt — a *subtracted* table, not a partially-updated one. |
| chance | **low** | the replace is one `withTransaction` with `ON COMMIT DROP` staging [READ `:588`, `:590`]; a mid-txn failure ROLLBACKs to the pre-run table. The reachable loss modes are pre-txn (acquisition FAIL, L7 drift FAIL, L8 invalid-pct FAIL, F-C1 first-run FAIL) and those abort *before* the DELETE. |
| impact | **high** | `toronto_centreline` is the table `enrich_centreline` joins; a wrong/empty replace silently degrades `is_corner_lot` / `is_through_lot` / `primary_frontage_street_name` for the whole parcel population (Spec 62 L5, L13). Destructive ⇒ impact high, not medium. |
| risk class … chance × impact | **C = low × high** | the destructive write is nonetheless *bounded* (one txn, `retract:"all"` is the class's own semantics, `recovery.interrupted:"force_full_on_next_run"` makes crash posture truthful — §1.5). The F-C1 dual-mode guard (§1.2) is the load-bearing defence against the empty-table arm. |

### 1.1 Write class (Spec 122 R5 / §1.4) — **class C `staging_full_replace`**

- **EXACTLY ONE** `withTransaction` in the whole file [READ `scripts/load-centreline.js:588`;
  **MEASURED 2026-09-24**, `grep -n 'withTransaction' scripts/load-centreline.js` ⇒ 1 substantive
  match at `:588` (+1 comment mention at `:533`)].
- The four statements, in order [READ `:588-625`]:
  1. `CREATE TEMP TABLE temp_centreline (LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING
     CONSTRAINTS) ON COMMIT DROP` [READ `:590`] — `INCLUDING CONSTRAINTS` (NOT `INCLUDING ALL`)
     preserves the `UNIQUE(source_id)` duplicate guard without copying the GIST index (Spec 62
     L26 / F-S11).
  2. batched `INSERT INTO temp_centreline (…) VALUES …` over the validated rows, stride
     `pipeline.maxRowsPerInsert(perRowParams)` where `perRowParams = cols.length` = **19**
     [READ `:592-599`, `:614`].
  3. `DELETE FROM toronto_centreline` [READ `:621`].
  4. `INSERT INTO toronto_centreline (${cols}) SELECT ${cols} FROM temp_centreline` [READ `:623`].
- ⇒ **class C `staging_full_replace`**, `retract:"all"` (a whole-table DELETE IS a retraction),
  `txn_scope:"step"`, `idempotent_rerun` per the class's full-replace semantics. **Spec 122
  explicitly sanctions `load-centreline`'s staging replace BY NAME** [MEASURED 2026-09-24 —
  transcribed from `wf2_class_c_staging_replace_active_task.md:3`: "Spec 122 sanctions
  `load-centreline`'s staging replace by name [READ 122:160, :402]"], and the class ships only with
  a dated `grandfathered.json` entry (Rule 9). **This is the FIRST converted class C**; the
  `executeStagingReplace` executor is prerequisite **0h**
  [READ `wf2_ingestor_runner_completion_active_task.md` §D5; `wf2_class_c_staging_replace_active_task.md`
  §D1].

### 1.2 Columns WRITTEN — the 19 `cols` + 2 DB defaults; `emitMeta` declares 20

The `cols` array [READ `scripts/load-centreline.js:592-596`] names **19** columns, in order:

| # | Column | Value source | Notes |
|---|---|---|---|
| 1 | `source_id` | `coerceSourceId(CENTREL2)` — positive int, else skip | PK / `UNIQUE`; BIGINT |
| 2 | `geom` | `ST_GeomFromWKB($n, 4326)` from the validator's `geom_wkb` | LineString, 4326 |
| 3 | `linear_name_full` | `txt(LINEAR_4)` | |
| 4 | `linear_name` | `txt(LINEAR_26)` | base name; the L29 frontage Priority-1 join key |
| 5 | `linear_name_type` | `txt(LINEAR_27)` | |
| 6 | `linear_name_dir` | `txt(LINEAR_28)` | |
| 7 | `feature_code_desc` | `classifyFeature(...)` — raw or sentinel | L25 filter output |
| 8 | `jurisdiction` | `classifyFeature(...)` — raw or `'UNKNOWN'` | FEDERAL already excluded |
| 9 | `from_intersection_id` | `coerceNodeId(FROM_IN31)` | NULL legal |
| 10 | `to_intersection_id` | `coerceNodeId(TO_INTE32)` | NULL legal |
| 11 | `lo_num_l` | `txt(LO_NUM_10)` | TEXT range (handles "10A") |
| 12 | `hi_num_l` | `txt(HI_NUM_11)` | |
| 13 | `lo_num_r` | `txt(LO_NUM_12)` | |
| 14 | `hi_num_r` | `txt(HI_NUM_13)` | |
| 15 | `parity_l` | `txt(PARITY_8)` | |
| 16 | `parity_r` | `txt(PARITY_9)` | |
| 17 | `oneway_dir_code_desc` | `txt(ONEWAY_34)` | |
| 18 | `source_dataset_version` | `contentHash \|\| etag \|\| sha1(lastModified) \|\| String(runAt)` | lineage stamp [READ `:586`] |
| 19 | `updated_at` | `runAt` (the DB clock) | |

**`id` and `created_at` are DB defaults, NOT written** — `id` is the serial PK; `created_at` is
omitted from `cols` [READ `:592-596`] and so takes the column default.

**`emitCentrelineMeta` declares 20** `toronto_centreline` columns — the 19 above **plus
`created_at`** [READ `scripts/load-centreline.js:686-698`; the list is
`source_id, geom, …, source_dataset_version, created_at, updated_at`]. The read side declares one
external key, `CKAN_INPUT_KEY = 'ckan:toronto-centreline-tcl-shp'` [READ `:53`, `:48`, `:687`], with
a provenance tag `['CKAN']` [READ `:698`].

**19 write columns + 1 declared-but-unwritten (`created_at`)** — the descriptor must declare all 20
as `outputs.writes[0].columns[]`, exactly one (`created_at`) carrying a DB-default/`written:"none"`
disposition, matching the tree.

### 1.3 Audit metrics — **exactly 22 distinct**

Every distinct `push('<metric>', …)` call in the file [READ `scripts/load-centreline.js:408` defines
`push`; **MEASURED 2026-09-24**, `grep -n "push('" scripts/load-centreline.js` ⇒ 25 call sites over
**22 distinct** metric names — `centreline_load_skipped` ×2 at `:448`/`:498`,
`centreline_geometry_skipped_pct` ×2 at `:556`/`:561`, `f_c1_empty_temp_guard_fired` ×2 at
`:570`/`:577`]:

| # | `metric` | Severity as pushed | Path | Line |
|---|---|---|---|---|
| 1 | `dataset_source_license` | INFO | always | `:410` |
| 2 | `centreline_override_feature_count_drift_present` | WARN | only if `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT==='1'` | `:413` |
| 3 | `centreline_local_zip_override` | WARN | only on the `CENTRELINE_LOCAL_ZIP` arm | `:431` |
| 4 | `centreline_head_error` | WARN | HEAD 4xx/5xx, then proceed | `:437` |
| 5 | `centreline_no_cache_validators` | WARN | HEAD ok but no LM/ETag | `:441` |
| 6 | `centreline_dataset_age_days` | INFO/WARN (L9, `>7d`) | always | `:444` |
| 7 | `centreline_load_skipped` | INFO | tier-1 skip `:448`; tier-2 skip `:498` | `:448`, `:498` |
| 8 | `centreline_acquisition_error` | **FAIL** | download/zip/parse throw ⇒ no writes | `:486` |
| 9 | `centreline_feature_count_raw` | INFO | always | `:508` |
| 10 | `centreline_bad_centreline_id_count` | WARN | >0 | `:509` |
| 11 | `centreline_null_geometry_count` | WARN | >0 | `:510` |
| 12 | `centreline_unknown_feature_code_count` | WARN | >0 | `:511` |
| 13 | `centreline_unknown_jurisdiction_count` | WARN | >0 | `:512` |
| 14 | `centreline_duplicate_centreline_id_count` | WARN | >0 | `:516` |
| 15 | `centreline_feature_count_filtered` | INFO | always | `:518` |
| 16 | `centreline_count_drift_pct` | **FAIL** | L7, `>0.5` | `:525` |
| 17 | `centreline_geometry_skipped_source_id` | WARN | per skipped row | `:551` |
| 18 | `centreline_geometry_skipped_pct` | FAIL `:556` / INFO `:561` | L8, `>0.05` | `:556`, `:561` |
| 19 | `f_c1_empty_temp_guard_fired` | FAIL `:570` (first run) / WARN `:577` (later) | F-C1 | `:570`, `:577` |
| 20 | `centreline_delete_skipped_empty_guard` | INFO | F-C1 later-run | `:578` |
| 21 | `centreline_features_inserted` | INFO | success | `:627` |
| 22 | `centreline_features_deleted` | INFO | success | `:628` |

⇒ **22 declared metrics; 4 of them verdict-capable as FAIL** (#8, #16, #18-first-arm, #19-first-arm)
and **11 push WARN**, so `verdictCascade` [READ `:214-218`] folds FAIL>WARN>PASS off this table
[READ `:659-661`: `auditTable` uses `phase: ADVISORY_LOCK_ID` (63) and `name: 'Toronto Centreline'`].
**Last audited load — run 1471 (2026-07-08)** [MEASURED 2026-09-24, brief-author values carried:
the run's `audit_table` carried **11** rows, including the two library-appended system rows
`sys_velocity_rows_sec` and `sys_duration_ms`; a clean success run emits #1, #6, #9, #15, #18-INFO,
#21, #22 plus any conditional WARNs struck by #2/#10–#14/#17, so ≤22 of the 22 appear and 11 is the
observed count on that run].

### 1.4 `records_meta.centreline_load` — 18 keys + the frozen consumer contract

`function skeletonLoadMeta()` [READ `scripts/load-centreline.js:676-683`] declares **18 keys**, and
the success-path object [READ `:630-650`] populates all 18 with the same names:

| # | Key | Meaning | Run 1471 value `[MEASURED 2026-09-24]` |
|---|---|---|---|
| 1 | `spec_version` | pinned `'1.1'` (L10), set LAST (BUG-2 rule) | `1.1` |
| 2 | `source_dataset_version` | `contentHash‖etag‖sha1(LM)‖runAt` | `80496e679ef7a2ae8b2e87eb986142a0` |
| 3 | `last_modified` | HEAD/GET `last-modified` | — |
| 4 | `etag` | HEAD/GET `etag` | — |
| 5 | `content_hash` | MD5 of the zip stream | `80496e679ef7a2ae8b2e87eb986142a0` |
| 6 | `feature_count_raw` | parsed features | 64,388 |
| 7 | `feature_count_filtered` | post-L25/dedupe | 47,363 |
| 8 | `filtered_out_non_street` | L25 EXCLUDE | 17,025 |
| 9 | `filtered_out_federal` | L25 FEDERAL | 0 |
| 10 | `unknown_feature_code_count` | sentinel rows | 1 |
| 11 | `unknown_jurisdiction_count` | UNKNOWN jurisdiction | 94 |
| 12 | `features_inserted` | `INSERT…SELECT` rowCount | 47,363 |
| 13 | `features_updated` | always `0` — full replace never UPDATEs | 0 |
| 14 | `features_deleted` | `DELETE` rowCount | 47,368 |
| 15 | `invalid_geometry_skipped` | L8 skip count | 0 |
| 16 | `delete_skipped_empty_guard` | F-C1 later-run preserve | — |
| 17 | `f_c1_empty_temp_guard_fired` | F-C1 fired | — |
| 18 | `drift_check_passed` | L7 outcome | — |

**Run 1471 (2026-07-08, last load)** `[MEASURED 2026-09-24, brief-author values carried — this
worktree has no DB access, so the values are the plan's recorded measurement, not this session's]`:
raw **64,388** · non_street **17,025** · federal **0** · filtered **47,363** · unknown_feature_code
**1** · unknown_jurisdiction **94** · inserted **47,363** · deleted **47,368** ·
invalid_geometry_skipped **0** · `content_hash` = `source_dataset_version` =
**`80496e679ef7a2ae8b2e87eb986142a0`**. (Inserted ≠ deleted by −5: the source published 5 fewer
segments than the prior load — normal churn, not a defect; `retract:"all"` is correct for this
class.)

**Frozen consumer contract (plan §1 bullets):**

- `enrich-centreline.js` reads `records_meta.centreline_load.features_inserted > 0` as its L23
  empty-source guard tier-(b) [READ `docs/specs/01-pipeline/62_source_centreline.md` L23:
  "(b) `records_meta.centreline_load.features_inserted > 0`"].
- `enrich-permits.js`'s `assertCentrelineEnriched` HALT gate requires a **COMPLETED**
  `sources:load_centreline` row — exactly why BOTH skip paths (tier-1 `:448`, tier-2 `:498`) still
  emit a re-stamped meta rather than nothing [READ `:496-503`'s own comment].
- `PIPELINE_NAME = 'sources:load_centreline'` [READ `:45`] is the chain-scoped slug (NOT
  `'source-centreline'`; the in-file comment records that spec §9 froze the wrong string — doc-rot
  to note at ③) and is what `readPriorRunMeta` + the consumers key on.

### 1.5 Exits — every path returns normally

The script has **no `process.exit`** [**MEASURED 2026-09-24**, `grep -n 'process.exit'
scripts/load-centreline.js` ⇒ 0 matches]. `pipeline.run('load-centreline', main)` [READ `:701`] owns
exit semantics (Spec 40), so **every terminal exits 0**:

| Terminal | Return | Audit pushed | Line |
|---|---|---|---|
| tier-1 skip | `{ skipped: true }` | `centreline_load_skipped` INFO | `:450-458` |
| acquisition error | `{ failed: true }` | `centreline_acquisition_error` FAIL | `:485-489` |
| tier-2 skip | `{ skipped: true }` | `centreline_load_skipped` INFO | `:496-504` |
| L7 count-drift FAIL | `{ failed: true }` | `centreline_count_drift_pct` FAIL | `:523-529` |
| L8 invalid-pct FAIL | `{ failed: true }` | `centreline_geometry_skipped_pct` FAIL | `:554-559` |
| F-C1 first-run empty FAIL | `{ failed: true }` | `f_c1_empty_temp_guard_fired` FAIL | `:568-573` |
| F-C1 later-run empty | `{ ok: true }` (PRESERVE) | F-C1 WARN + delete-skipped INFO | `:575-581` |
| success (replace) | `{ ok: true }` | inserted/deleted INFO | `:652` |
| lock not acquired | `return` (early) | SDK emitted SKIP [READ `:655`] | `:655` |

⇒ The converted step must reproduce this **truthful crash posture**: `recovery.interrupted` is
`"force_full_on_next_run"` (every run IS a full replace — the class-C plan F2 truthful declaration),
and no terminal is a throw. The four FAIL terminals are `checks[].status:'FAIL'` rows, not
exceptions (a genuine acquisition throw is caught at `:484` and converted to a FAIL row).

### 1.6 Memory — whole-array model

`parseShapefile` accumulates the ENTIRE feature array in memory [READ
`scripts/load-centreline.js:357-395` — one `for(;;)` loop pushing into `features[]`, returned at
`:395`], and validation holds a `byId` Map over all rows [READ `:535-541`]. Table size **47,363 rows
/ 22 MB**, Σ `ST_AsGeoJSON` **9.0 MB**, max **254 points** per geometry `[MEASURED 2026-09-24,
brief-author values carried]` ⇒ **estimate < 300 MB heap**. Per the standing O3 rule the whole-array
model is accepted at this size; it is **proven at landing by a `--max-old-space-size=512` capture**
(orchestrator, at ②), not re-measured here (this allowlist has no `node`). No streaming seam is
triggered. **The acquisition-time discipline the model keeps:** the 117 MB zip is STREAMED to disk
with on-the-fly MD5 [READ `:283-296`] and never buffered, and only the KEPT (post-filter, ~47K) rows
are held.

---

## 2. Registry sweep + coupling (MEASURED)

**Registry sweep — every Target File reviewed?** A `grep` of
`docs/specs/00-architecture/00_system_map.md` for `load-centreline` ⇒ rows **43** and **62** ONLY
[MEASURED 2026-09-24]:

- **Spec 62** row [READ `00_system_map.md:62`] names `scripts/load-centreline.js` FIRST in its Target
  Files, plus `scripts/enrich-centreline.js`, `scripts/enrich-permits.js`,
  `scripts/lib/geometry-validator.js`, `scripts/lib/safe-math.js`, `assert-schema.js`,
  `assert-data-bounds.js`, `assert-entity-tracing.js`, `assert-global-coverage.js`, `manifest.json`,
  `seeds/logic_variables.json`. Tests: `pipeline-advisory-lock.infra.test.ts`,
  `load-centreline.{logic,infra}.test.ts`, `enrich-centreline.{logic,infra}.test.ts`,
  `db/migration-N-centreline.db.test.ts`.
- **Spec 43** row [READ `00_system_map.md:43`] lists `scripts/load-centreline.js` among its 30
  sources-chain Target Files.

| Coupling | Finding | Ruling (orchestrator, transcribed) |
|---|---|---|
| **Two unregistered libs** | `source-version.js` [READ `scripts/load-centreline.js:36`] and `config-loader.js` [READ `:34`] are `require`d by the loader. **`source-version.js` is in NO system-map row** [MEASURED 2026-09-24, `grep -n 'source-version' docs/specs/00-architecture/00_system_map.md` ⇒ 0 matches]; **`config-loader.js` likewise** [same ⇒ 0 matches]. `safe-math.js` IS registered, but under Spec **62**'s row [READ `00_system_map.md:62`], not Spec 43's. | **Registry hygiene (D8):** both libs registered under their owner spec at this step's commit **③** [READ `wf2_ingestor_runner_completion_active_task.md` §D8]. Not a lib rewrite — the `address_points` precedent's commit 9 did exactly this. |
| **Spec 43 has no `## Operating Boundaries`** | [MEASURED 2026-09-24, `grep -n 'Operating Boundaries' docs/specs/01-pipeline/43_chain_sources.md` ⇒ 0 matches] and `grep 'load_centreline' 43_chain_sources.md` ⇒ 0 matches — the chain step row is not textual. | **D8:** Spec 43 gains its `## Operating Boundaries` section at this step's ③. |
| **Legacy source-contract test** | `src/tests/load-centreline.infra.test.ts` reads the SCRIPT TEXT and locks lock 63, the four name tokens, `SPEC_VERSION '1.1'`, the L26 full-replace strings, the L15 F-C1 guard, and inline `VALIDATION_SQL` (NOT the shared validator) [READ `load-centreline.infra.test.ts:14-46`]. `src/tests/load-centreline.logic.test.ts` tests the pure helpers [READ `load-centreline.logic.test.ts:3`]. | These lock the LEGACY shape. When the loader becomes a frozen shell, the infra test's `SCRIPT`-text assertions that reference deleted code must be **re-pointed in place** at ② (the `parcels` precedent: never moved, never deleted). The logic test now exercises the COMPUTE exports — it is re-pointed, not dropped, because the pure helpers move. |
| **`ingest-prereq-0r` precedent test** | `src/tests/ingest-prereq-0r.logic.test.ts` cites the legacy HEAD-failure posture BY NAME: "the legacy load-centreline loader (`scripts/load-centreline.js:433-439`) … WARN row + proceed with null validators" [READ `ingest-prereq-0r.logic.test.ts:3`, `:7`]. The library's shared HEAD path (0r) must reproduce this exact WARN-and-proceed arm for centreline. | **PH-0 states it:** the legacy HEAD 4xx/5xx → `centreline_head_error` WARN → proceed [READ `scripts/load-centreline.js:433-439`] is the behaviour the shared acquisition seam must match. |
| **`assert-data-bounds` down-step** | Spec 62's row names `assert-data-bounds.js`; L21's own wording says "assert-data-bounds uses a hardcoded floor; this is the loader's own reference" [READ `scripts/load-centreline.js:49`]. The registered seed key is `sources_centreline_floor`. | **REUSE the registered key** `sources_centreline_floor` via `checks[].limit_from_config` (Rule 3, one source of truth) — do NOT mint a second key. The loader's dead `centrelineMinFeatureCount` (40000) is retired (§3). |
| **Ordering guarantee (Rule 11)** | Spec 62 L22: `load_centreline` runs AFTER `load_parcels`; `enrich_centreline` AFTER `enrich_heritage`. Since the loader is class C (`retract:"all"`), a full replace is the class's semantics, not a violation — but it means a source-side shrink removes rows. | **PH-0 states the guarantee:** the atomic single-txn replace is what protects the reader (`enrich-centreline`) from seeing an empty table mid-run [READ `wf2_class_c_staging_replace_active_task.md:9` — "the replace must be atomic (no reader sees an empty table)"]. |

---

## 3. PH-3 — Intent Ledger (G3)

One row per the plan's §2 construct 1–25. **Every construct's introducing commit is cited verbatim
from the brief-author's `git log -S` run on `scripts/load-centreline.js`** (the `-S` flag is not in
this session's allowlist; the four-commit history it resolves to IS re-runnable and matches
[MEASURED 2026-09-24, `git log --oneline -n 12 -- scripts/load-centreline.js` ⇒ `0b230472`,
`346626ae`, `3bf05d2b`, `f6047e89` — newest first]). Disposition vocabulary:
`preserved-in-runner` · `preserved-in-validator` · `preserved-in-compute` ·
`encoded-as-descriptor-field` · `encoded-as-deviation` · `knowingly-retired`. Adjudicator column =
the orchestrator ruling (transcribed).

**Introducing commits (brief-author `git log -S`, 2026-09-24):**

| Commit | Date | Scope | Constructs it introduced |
|---|---|---|---|
| `f6047e89` | 2026-06-06 | initial loader | F-C1 dual mode; L7 `0.5`; L8 `0.05`; `VALIDATION_CHUNK`; F13 `REQUIRED_DBF_FIELDS`; `UNKNOWN_FEATURE_SENTINEL`; `PIPELINE_NAME`; lock 63; `centrelineMinFeatureCount` (dead); `centreline_head_error` WARN-proceed; `INCLUDING CONSTRAINTS` (F-S11) |
| `3bf05d2b` | 2026-06-08 | live-smoke hardening | stream-to-disk md5; 3-attempt retry; 600000 ms timeout |
| `346626ae` | 2026-06-08 | local override | `CENTRELINE_LOCAL_ZIP` |
| `0b230472` | 2026-08-10 | Phase B B1 | `readPriorRunMeta`; tier-2 `contentHashDecision`; DS4 `buildSkipReEmitMeta`; `contentHashInNoValidatorsBail:true` (inert — the tier-1 call passes no hash) |

| # | Construct [READ] | Introduced (`git log -S`) | Intent | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 1 | `ADVISORY_LOCK_ID = 63` [READ `:41`] | `f6047e89` | Mutual exclusion across the 6 `parcels`-writers + the two centreline scripts | **encoded-as-descriptor-field** → `identity.lock:63` + `why_lock` | Spec 62 L4; Spec 47 §A.5 |
| 2 | `CKAN_DOWNLOAD_URL` [READ `:50-51`] | `f6047e89` | CKAN resource identity (dataset `1d079757…` / resource `d86bdca4…`) | **encoded-as-descriptor-field** → `inputs.reads.externals[].url` | Rule 2; Spec 122 §5.1 |
| 3 | `CKAN_INPUT_KEY = 'ckan:toronto-centreline-tcl-shp'` [READ `:53`] | `f6047e89` | The external's declared read-id (used in `emitMeta` reads) | **encoded-as-descriptor-field** → `inputs.reads.externals[].id` | Spec 122 §5.1 |
| 4 | `SPEC_VERSION = '1.1'` [READ `:42`] | `f6047e89` (re-baselined) | Producer contract version pin (L10) | **encoded-as-descriptor-field** → `spec_version:"1.1"` | Spec 62 L10 |
| 5 | `PIPELINE_NAME = 'sources:load_centreline'` [READ `:45`] | `f6047e89` | Chain-scoped slug for `readPriorRunMeta` + consumers | **preserved-in-runner** (the runner's own step identity) | plan §2 |
| 6 | `ConfigSchema` `centrelineSkipCheckThresholdDays` `7` (L9) [READ `:57`] | `f6047e89` | Staleness WARN threshold (daily-publish cadence) | **encoded-as-descriptor-field** → `load_centreline_dataset_age_warn_days` default 7 | plan §2 |
| 7 | `centrelineAcceptFeatureCountDriftPct` `0.5` (L7) [READ `:58`] | `f6047e89` | Count-drift FAIL boundary (abort pre-txn) | **encoded-as-descriptor-field** → `load_centreline_count_drift_fail_pct` default 0.5 | plan §2 |
| 8 | `centrelineInvalidGeometryFailPct` `0.05` (L8) [READ `:59`] | `f6047e89` | Invalid-geometry FAIL boundary (abort pre-txn) | **encoded-as-descriptor-field** → `load_centreline_invalid_geometry_fail_pct` default 0.05 | plan §2 |
| 9 | `centrelineMinFeatureCount` `40000` (L21) [READ `:60`] | `f6047e89` | "the loader's own reference" — **NEVER READ** (dead) | **knowingly-retired** — the registered `sources_centreline_floor` is the one truth | plan §2; Spec 62 L21 |
| 10 | `centrelineDownloadTimeoutMs` `600000` [READ `:61`] | `3bf05d2b` | 117 MB zip — 10 min (live smoke 2026-06-06 aborted at 120s) | **encoded-as-descriptor-field** → `load_centreline_download_timeout_ms` default 600000, `on_invalid:"clamp"` | plan §2 |
| 11 | `STREET_CLASS_INCLUDE` (12 values) [READ `:71-75`] | `f6047e89` | L25 street-class allow-list | **preserved-in-compute** (why: compute JSDoc) → `shapeRecord`'s classify rule | Spec 62 L25 |
| 12 | `STREET_CLASS_EXCLUDE` (13 values) [READ `:76-81`] | `f6047e89` | L25 non-street deny-list | **preserved-in-compute** (why: compute JSDoc) | Spec 62 L25 |
| 13 | `UNKNOWN_FEATURE_SENTINEL = 'unknown_operator_review'` [READ `:82`] | `f6047e89` | Unknown FEATURE_CODE_DESC → sentinel + WARN, never dropped | **preserved-in-compute** (why: compute JSDoc) + audit WARN | Spec 62 L25 |
| 14 | `DBF` map (15 fields) [READ `:86-102`] | `f6047e89` | CKAN 10-char-truncated column names → app field names | **encoded-as-descriptor-field** → `inputs.reads.externals[].key_property:"CENTREL2"` + the DBF map in `notes.json` | Spec 62; #426 lesson |
| 15 | `REQUIRED_DBF_FIELDS` (13) + `validateShapefileColumns` (F13) [READ `:104-113`, `:183-194`] | `f6047e89` | Assert expected DBF attrs exist post-parse (the #426 CKAN-rename lesson) | **preserved-in-validator** — the F13 throw inside `shapeRecord` propagates | plan §2; §LC-D10 below |
| 16 | `VALIDATION_SQL` inline LineString validator + `VALIDATION_CHUNK = 5000` (L16) [READ `:117-138`, `:534`] | `f6047e89` | Batched `VALUES+UNNEST` `ST_MakeValid`/`ST_IsValid`; NOT the shared `geometry-validator.js` (it cannot emit `invalid_geometry_skipped`) | **preserved-in-validator** — the runner's `validateGeometries` seam, `geometry_kind:"line"` | Spec 62 L16; `wf2_ingestor_runner_completion_active_task.md:12` |
| 17 | `coerceSourceId` positive-int-or-skip [READ `:141-146`] | `f6047e89` | `CENTREL2` → BIGINT source_id, else counted skip | **preserved-in-compute** (why: compute JSDoc) (the runner's `coerceKey` variant) | plan §2 |
| 18 | `coerceNodeId` NULL-legal [READ `:149-152`] | `f6047e89` | Intersection node ids nullable per schema | **preserved-in-compute** (why: compute JSDoc) | plan §2 |
| 19 | `normCode` trim+lowercase (F14) [READ `:155-157`] | `f6047e89` | F14 CKAN-whitespace/case hardening for Set membership | **preserved-in-compute** (why: compute JSDoc) | Spec 62 L25 (F-S10/F14) |
| 20 | `classifyFeature` jurisdiction INCLUDE/EXCLUDE (FEDERAL) [READ `:165-188`] | `f6047e89` | L25 jurisdiction filter; FEDERAL dropped | **preserved-in-compute** (why: compute JSDoc) | Spec 62 L25 |
| 21 | `computeCountDeltaPct` first-run→0 [READ `:197-201`] | `f6047e89` | L7 drift; no prior ⇒ no drift | **preserved-in-compute** (why: compute JSDoc) | Spec 62 L7 |
| 22 | `dedupeBySourceId` keep-first [READ `:204-215`] | `f6047e89` | `UNIQUE(source_id)` duplicate guard | **preserved-in-compute** (why: compute JSDoc) | Spec 62 L26 |
| 23 | `validatorCounterDelta` accepted→carry [READ `:218-220`] | `f6047e89` | Status → `{skipped, carry}` | **preserved-in-compute** (why: compute JSDoc) | Spec 62 §3.5 |
| 24 | `verdictCascade` FAIL>WARN>PASS [READ `:214-218`] | `f6047e89` | Row-derived verdict (Spec 47 §8.2) | **preserved-in-runner** (the shared gate derives it) | Spec 124 Rule 10 |
| 25 | L15 F-C1 dual-mode guard (`hasPriorRun`; first-run FAIL / later-run WARN+PRESERVE) [READ `:563-581`] | `f6047e89` | Block deploy on empty source; preserve on later empty | **encoded-as-descriptor-field** → two declared `pre_write` checks (`staged_rows_floor_first_run` FAIL, `staged_rows_floor` WARN) + `checks[].on_warn:"skip_write"` + `executeStagingReplace`'s own empty-refusal | Spec 62 L15/L26; `wf2_class_c_staging_replace_active_task.md` §F1 |

**Count: 25 rows; 0 without a disposition.**

### 3.1 LC-D10 extension (brief-author finding — recorded in the LC-D10 row)

**The library coerces the key BEFORE `shapeRecord` and DROPS bad keys.** [READ
`scripts/lib/step/acquire.js:328`: `const key = coerceKey(props[keyProperty]); if (key == null)
{ badKey++; continue; }` — the guard runs in `parseShapefile`'s parse loop, and only surviving
features reach `compute.shapeRecord`; READ `scripts/lib/step/index.js:813`:
`shapeRecord(f.record, { geojson: f.geojson, config, run_at: runAt, tag: tagRecord })`]. A renamed
`CENTREL2` ⇒ **every key null ⇒ `bad_key_count` = raw**, `shapeRecord` never runs, **F13 cannot
fire**; the run ends at the L7 drift FAIL (or the F-C1 first-run FAIL), terminal `fail_check` — NOT
legacy's `centreline_acquisition_error`. Renaming any OTHER required DBF field still throws F13
inside `shapeRecord` (propagates, 0p T3).

⇒ **The converted step cannot rely on F13 as the sole CKAN-rename detector.** The two behaviours
(key-drop → `bad_key_count` → drift/F-C1 terminal, versus missing-non-key-attr → F13 throw) are
**materially different terminals** and the descriptor must declare the key-rename path's terminal
explicitly (`fail_check` on the staged-rows floor), because it does NOT reach
`centreline_acquisition_error`.

---

## 4. PH-5 — Seam map (G5)

Every point where the step touches a foreign resource, with the seam name the converted step
declares. Six seams; **five are declared deviations or library-owned rungs** (0p/0q/0r), one retires.

| Seam | Today (READ) | Converted-side seat |
|---|---|---|
| **DB** | `ADVISORY_LOCK_ID = 63` [`scripts/load-centreline.js:41`]; `pipeline.getDbTimestamp(pool)` **INSIDE the lock** for `runAt` [`scripts/load-centreline.js:406`] — `^—§R3.5 — DB clock inside lock`]; ONE `pipeline.withTransaction` [`scripts/load-centreline.js:588`]; `CREATE TEMP TABLE … ON COMMIT DROP` [`scripts/load-centreline.js:590`]; `DELETE FROM toronto_centreline` [`scripts/load-centreline.js:621`]; `INSERT … SELECT` [`scripts/load-centreline.js:623`] | `identity.lock:63` · `execution.txn_scope:"step"` · `outputs.writes[]` class C `staging_full_replace`, `retract:"all"` — the runner owns pool/txn/lock (Spec 122 §5.1). The DB clock itself is the runner's `clockNow`/`getDbTimestamp` seat: `updated_at` is WRITTEN from `runAt` [`scripts/load-centreline.js:596`, `:632`], so the clock seam is **real, not incidental** (§4 clock row). |
| **Clock** | `getDbTimestamp` `:406` ⇒ `runAt`; `updated_at = runAt` [`scripts/load-centreline.js:596`]; `source_dataset_version` falls back to `String(runAt)` when no validator exists [`scripts/load-centreline.js:585`]; `headAgeDays` from `nowMs` vs `last_modified` [`scripts/load-centreline.js:444`] | Runner `clockNow` supplies `runAt` (the INGESTOR 0n `{geojson, config, run_at}` seam precedes this row). Two OBSERVABLE consequences: `updated_at` churn per run, and the **dataset-age value** (`centreline_dataset_age_days`, WARN `>7d`) — both declared non-determinism (§7). The `String(runAt)` fallback arm is reached only when HEAD AND GET both carry no validator — a genuine clock-in-output path (§7, LOW-CONFIDENCE). |
| **Network** | `headValidators` = one HEAD, `setTimeout(...timeoutMs)` [`scripts/load-centreline.js:265-267`]; `downloadZipWithRetry` — **"Up to 3 attempts"** signed default `attempts = 3` [`scripts/load-centreline.js:306-307`, `:309`]; timeout literal `600000` [`scripts/load-centreline.js:56`, used `:434`, `:470`]; HEAD failure ⇒ WARN + proceed [`scripts/load-centreline.js:436-438`] | `inputs.reads.externals[].kind:"http_file"` + `execution.network`. **0q rung:** the literal `3` becomes `network.retries:2` + `retries_from_config:"load_centreline_download_retries"` + `retry_backoff_from_config:"load_centreline_download_retry_backoff_ms"`; the library's `attempts = retries + 1` [READ `scripts/lib/step/acquire.js:248`, `:233`] and `resolveRetryPolicy` [READ `scripts/lib/step/acquire.js:126-157`] resolve it **byte-equally to 3 attempts** when the seat is default. **HEAD is NOT retried** (the legacy HEAD is a single `setTimeout`-bounded call, `:265-267`) — the library must not wrap HEAD in the retry loop. **0r rung:** HEAD failure ⇒ `on_head_error:"warn_row"` [`scripts/load-centreline.js:436-438`], and the library metric `head_error` **replaces** the legacy `centreline_head_error` [`scripts/load-centreline.js:437`] — **declared deviation at ②** (the row keeps WARN+proceed semantics; only the row NAME changes). |
| **argv/env** | `process.env.CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT === '1'` [`scripts/load-centreline.js:412`]; `process.env.CENTRELINE_LOCAL_ZIP` [`scripts/load-centreline.js:425`] | `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` ⇒ `override.accept_anomaly` (Spec 122's override seat; the legacy `true`-only `=== '1'` string test is preserved as the declared override anchor). `CENTRELINE_LOCAL_ZIP` ⇒ **`knowingly-retired`, LC-D11** (a local-path fixture override is `R-AZ`-class; the fixture tier replaces it). `CENTRELINE_FORCE_RELOAD` is **not present in the legacy file** [**MEASURED 2026-09-24**, `grep -n 'FORCE_RELOAD' scripts/load-centreline.js` ⇒ 0 matches] ⇒ it is an **ADDITIVE** seat introduced at ② (a declared deviation: a new operator escape hatch, net-new behaviour, not a legacy reproduction). |
| **Filesystem** | `fs.mkdtempSync(path.join(os.tmpdir(), 'centreline-'))` [`scripts/load-centreline.js:461`]; `fs.rmSync(tmpRoot, {recursive:true, force:true})` in `finally` [`scripts/load-centreline.js:491`]; partial-file `fs.rmSync(destPath,{force:true})` per retry [`scripts/load-centreline.js:315`] | **Library-owned.** The runner's acquisition path owns the temp dir and its teardown (INGESTOR prerequisites 0b/0l). No `inputs.reads.externals[].cache` declaration is needed — the legacy loader has NO cache short-circuit (unlike `parcels`); **every non-skip run re-downloads** (§7). |
| **Publisher** | CKAN resource `d86bdca4…` in dataset `1d079757…` [`scripts/load-centreline.js:50-51`] | `inputs.reads.externals[].url` + `id:'ckan:toronto-centreline-tcl-shp'` [`scripts/load-centreline.js:53`] — the declared read-id the tier-1/tier-2 skip logic and `emitMeta`'s reads list key on. |

**Seam summary:** the **db seam** (`identity.lock:63`, one txn, one class-C full replace) · the
**clock seam** (**non-trivial** — `runAt` stamps `updated_at` + drives the dataset-age WARN) · the
**network seam** (**0q + 0r rungs, one declared rename**) · the **argv/env seam** (**one retired, one
additive**) · filesystem (library) · publisher. **Five of the six carry a declared deviation or a
library rung; the only pure reproduction is the publisher identity.**

---

## 5. PH-6 — Classification (G6)

**Archetype re-derived, not inherited (R-AO):** this step performs external acquisition (CKAN
shapefile ZIP over HTTP) into exactly ONE target table (`toronto_centreline`) ⇒ **INGESTOR**,
`shape:"ingest"`. The census row for the slug was already INGESTOR [READ
`docs/reports/2026-09-24-batch2-p3-2-load-centreline-assessment.md` §0 status block]; the
re-derivation CONFIRMS it. **Write class C `staging_full_replace`** (§1.1) — the FIRST converted
class C.

| Behaviour | Class | Consumer (CONTRACT only) |
|---|---|---|
| `toronto_centreline` rows (19 write columns + `created_at` DB default) | **CONTRACT** | `enrich-centreline.js`; every `is_corner_lot`/`is_through_lot`/`primary_frontage_street_name` reader (§1.4) |
| `geom` = true **LineString** 4326 | **CONTRACT** | `enrich-centreline.js` joins on `geom` and **requires a LineString** (never Multi) [READ `.cursor/engine-briefs/b2-p3-c0f-shapefile-record.md:12`] |
| `records_meta.centreline_load.features_inserted > 0` | **CONTRACT** | `enrich-centreline.js` L23 empty-source guard tier-(b) [READ `docs/specs/01-pipeline/62_source_centreline.md` L23] |
| COMPLETED `sources:load_centreline` row on BOTH skip paths | **CONTRACT** | `enrich-permits.js`'s `assertCentrelineEnriched` HALT gate (§1.4) |
| `audit_table` row-derived verdict FAIL>WARN>PASS (`verdictCascade`) | **CONTRACT** | admin quality routes + chain verdict |
| the 22-metric audit surface (§1.3) | **CONTRACT** | admin quality routes |
| `PIPELINE_NAME = 'sources:load_centreline'` | **CONTRACT** | `readPriorRunMeta` + the consumers key on it [READ `scripts/load-centreline.js:45`] |
| `INCLUDING CONSTRAINTS` (NOT `INCLUDING ALL`) `UNIQUE(source_id)` temp guard | **CONTRACT** (as a schema fact) | the duplicate guard itself (§1.1) |
| batched-INSERT stride / log cadence | INCIDENTAL | counts only |
| `archive`-class download-progress lines | INCIDENTAL | log-only |
| `centreline_no_cache_validators` WARN | **CONTRACT** (as a check) | the audit row's own consumers |
| dead `centrelineMinFeatureCount` (40000) | INCIDENTAL (dead) | none — never read (§3 #9) |
| LC-D8 single-member MultiLineString | **DEFECT (pinned)** | ledger §5.1 |

### 5.1 Defect ledger (PIN in wrong form — never fix inside the conversion, Spec 123 §3.1)

**Operator rulings, 2026-09-24 (transcribed; the plan file is absent — see the head-of-file note):**
LC-D1/LC-D2 ⇒ **Spec 62 is corrected to the CODE at ②** (Q1, the AP-D1 precedent; the L7b/L7c/dup-id
FAIL variance is filed as a SEPARATE feature, not folded here). LC-D8 ⇒ a **declared INFO/WARN check
over the runner counter `geometry_collection_extracted`** + PIN (Q2 — no library option exists). LC-D10
carries A1's extension (§3.1).

| ID | Finding [READ] | Consumer impact | Disposition | Ledger status |
|---|---|---|---|---|
| **LC-D1** | Spec 62's L7b/L7c wording describes the count-drift FAIL arms **differently from the code**: the loader FAILs on a single `countDeltaPct > 0.5` [`scripts/load-centreline.js:523`] covering BOTH shrink and growth, not the two-arm description the spec carries. | the spec's fidelity to the shipped gate; a future reader tuning the threshold | **Spec 62 corrected to the code at ②** (Q1, AP-D1 precedent). The L7b/L7c two-arm FAIL the spec implies is filed as a **separate feature** — NOT added here. | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D2** | Spec 62's **duplicate-id** treatment does not match the code: the loader does NOT FAIL on duplicates — it WARNs [`scripts/load-centreline.js:516`] and `dedupeBySourceId` keeps the first [`scripts/load-centreline.js:204-215`]. | spec fidelity; a future reader expecting a dup FAIL | **Spec 62 corrected to the code at ②** (Q1). A dup-id FAIL is filed as a **separate feature**. | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D3** | **None of this row's proposed config keys are seeded today.** [**MEASURED 2026-09-24**: `scripts/seeds/logic_variables.json` carries only `centreline_propagation_coverage_min` (`:2`) and `sources_centreline_floor` (`:5140`) for this step's domain; `load_centreline_dataset_age_warn_days`, `_count_drift_fail_pct`, `_invalid_geometry_fail_pct`, `_download_timeout_ms`, `_download_retries`, `_download_retry_backoff_ms` are ALL absent.] ⇒ every `*_from_config` seat resolves to its descriptor LITERAL fallback. | operator tuning cannot reach the step until seeded | **PIN — carried.** Seeds land at ②; until then the literals are the declared truth (Rule 3 ledger, §6). | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D4** | **No `staleness.on_prior_run_error` declaration exists in the corpus for this shape.** The loader's skip paths re-emit meta via `buildSkipReEmitMeta` [`scripts/load-centreline.js:451`, `:499`] regardless of whether the PRIOR run errored — the converted descriptor must state the posture explicitly. | the tier-1/tier-2 skip re-emit contract (§1.4) | **PIN — carried.** Descriptor declares `staleness.on_prior_run_error:"warn_row"` (flips at ④a). | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D5** | **No `recovery.interrupted` declaration exists in the corpus for a class C step.** Legacy truth: **every run IS a full replace** (the `DELETE` is unconditional, `:621`). | crash posture truthfulness; the reader must never see a half-table (atomicity is the class's only protection) | **PIN — carried.** Descriptor declares `recovery.interrupted:"force_full_on_next_run"` (flips at ④b). | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D6** | **`CENTRELINE_LOCAL_ZIP` [`scripts/load-centreline.js:425`] is a local-file acquisition override retired by conversion** (`R-AZ`-class). | none post-conversion (fixture tier replaces it) | **Declared deviation at ②** — retired; no descriptor field. | CLOSED · declared deviation at ② |
| **LC-D7** | **`CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` [`scripts/load-centreline.js:412`] is an operator override the converted step must carry.** | the L7 drift FAIL's operator escape hatch — losing it makes a legitimate publisher shrink unfixable without a code change | **Declared deviation at ②** — mapped to `override.accept_anomaly` (NOT dropped). | CLOSED · declared deviation at ② (`override.accept_anomaly`) |
| **LC-D8** | **Single-member `MultiLineString` residue reachable**: the L25/geometry path can carry a geometry that is a single-member `MultiLineString` while the target column/consumer demands a true `LineString`. The legacy has NO check for it. **Operator ruling (Q2):** declare a check over the runner's own counter `geometry_collection_extracted` (the `load_ravines` precedent names that counter, `ravines`'s INFO row) — **no library option exists** to do more. | `enrich-centreline.js` (a Multi where a Line is required — a silent geometry-shape defect at the consumer) | **Declared INFO/WARN check + PIN** (Q2). Row name/format decided at ② over `geometry_collection_extracted`. | OPEN · **PIN** (carried, Spec 123 §3.1; Q2) |
| **LC-D9** | **The converted runner's key-drop terminal differs from legacy** (§3.1): a renamed `CENTREL2` drops every key ⇒ `bad_key_count` = raw ⇒ the run ends at **L7 drift FAIL / F-C1 first-run FAIL (`fail_check`)**, NOT at legacy's `centreline_acquisition_error` [`scripts/load-centreline.js:486`]. F13 cannot fire on the key path. | the CKAN-rename detector's terminal shape (a materially different FAIL row) | **Declared limitation at ②** — the descriptor must declare the key-rename path's terminal explicitly. Do NOT re-engineer 0p/0l to restore the legacy terminal (out of scope for a zero-diff conversion). | OPEN · **PIN** (carried, Spec 123 §3.1) |
| **LC-D10** | **F13 (`REQUIRED_DBF_FIELDS` + `validateShapefileColumns`) does not fire on the key path, and `shapeRecord` sees only surviving features** — see **A1 §3.1 (the extension carried into this row)**. [`scripts/load-centreline.js:104-113`, `:183-194`; READ `scripts/lib/step/acquire.js:328`, `scripts/lib/step/index.js:813`] | the #426 CKAN-rename detector's coverage | **PIN — carried** (Q2 family: the library seam, not a step defect). | OPEN · **PIN** (carried, Spec 123 §3.1; Q2 family) |
| **LC-D11** | **`CENTRELINE_LOCAL_ZIP` local-override path** [`:425`, `:431`, `:469`] — restated here as the ledger's own row for the retired override (LC-D6 is the disposition; this is the anchor). | local dev/test only | **PIN — carried** (retired at ②, declared). | CLOSED · declared deviation at ② |
| **LC-D12** | **`VALIDATION_CHUNK = 5000` [`scripts/load-centreline.js:536`] — the entire 47K-row validation runs in ONE library call, not in legacy's 5000-row batches.** The legacy batches the `VALUES+UNNEST` validation; the converted runner's `validateGeometries` seam issues one call over all rows. | memory/statement-size posture at 47K rows (A1 §1.6 accepts the whole-array model at this size; the batched-vs-single-call change is NEW and unmeasured) | **Declared limitation at ②** — the single-call shape is the library's; batching is knowingly retired. **Measured at ②** (a `--max-old-space-size=512` capture). | CLOSED · declared deviation at ② |
| **LC-D13** | **A standing WARN the conversion must preserve**: the `centreline_dataset_age_days` INFO/WARN row [`scripts/load-centreline.js:444`] against the 7-day threshold [`scripts/load-centreline.js:52`] — a daily-published source whose age can legitimately exceed 7d. | the audit table's standing-WARN posture (a reader must not read it as a conversion defect) | **Declaration at ② + standing WARN** (R-H) — preserved, never suppressed. | OPEN · **PIN** (standing WARN, R-H) |

**Ledger status column (added WF2 L1, McDonald's Airtight, 2026-09-26):** mirrors `docs/reports/defect-ledger.md`'s own status cell VERBATIM for each LC-D1..LC-D13 row — Spec 124 §5 R-BA gate I `DEFECT-ID-UNIQUENESS` (fast invariant #36) treats any two table rows sharing a first-cell defect id as two DEFINITIONS of that id, RED unless their status cells are byte-identical; `load_centreline` is an in-development INGESTOR slug (R-BA §1) with NO ledger-row exemption available, so the two tables' status cells must agree exactly rather than being ledger-filtered. The prior "Closes at" column (`② (spec edit)`, `④a`, `④b`, …) is not lost — every one of those landing-stage markers is already restated in the Disposition column's own prose, cell by cell, above.

**Count: 13 rows (LC-D1..LC-D13); every row carries a disposition.**

**Orchestrator ① review-pass correction (2026-09-24):** the plan-of-record's own LC-D5 (F-C1
WARN-preserve path pins `features_inserted:0`, causing `enrich-centreline.js`'s L23 tier-(b) guard
to falsely HALT though the table is intact) and LC-D6 (unbounded per-feature `WARN` rows, LR-D1
precedent) and LC-D7 (standalone prior-read hard-coded to the chain-scoped `PIPELINE_NAME`,
VERIFY-INT-4) were **displaced** by this report's own re-derivation, because — per the head-of-file
note — the plan file was not present in this worktree and these three ids were independently
reassigned to different findings (`recovery.interrupted`, `CENTRELINE_LOCAL_ZIP`, and the
`CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` override, respectively — all of which ARE real findings and
are kept under their shipped ids). The three displaced plan findings are **restored** in
`docs/reports/defect-ledger.md` as **LC-D14** (F-C1/`features_inserted:0`), **LC-D15** (capped-detail
WARN rows) and **LC-D16** (standalone `PIPELINE_NAME`), plus **LC-D17** for the plan's LC-D9
(null-geometry attribution-order delta, displaced by this report's key-drop-terminal LC-D9). The red
suite's F-C1 test (§6 below) is corrected to cite **LC-D14**, not LC-D5. `recovery.interrupted` is
NOT itself a numbered defect — it is a truthful crash-posture declaration with no wrong-form to
preserve, so LC-D5 (as shipped in this ledger) needs no `④`-series fix commit; the `④b` commit in
§8's commit-plan table below is retargeted to LC-D14.

---

## 6. Rule 3 literal ledger

Every literal the converted step externalizes, with its seat name, bounds and `on_invalid`. The
legacy config block is `scripts/load-centreline.js:52-56` [READ].

**ONE correction to the plan's §2 "Rule 3 literal ledger"** (superseded by
`.cursor/wf2_ingest_prereqs_0p_0q_0r_active_task.md` **Fold IC-8**): the plan's single
`attempts = 3` row becomes **TWO variables** — `load_centreline_download_retries` default **2** and
`load_centreline_download_retry_backoff_ms` default **0**. **Why 2 not 3:** the library's retry
semantics are `attempts = retries + 1` [READ `scripts/lib/step/acquire.js:248` — `const attempts =
(Number.isInteger(retries) && retries >= 0 ? retries : 0) + 1`; READ `:233` — `attempts = retries + 1
(so retries: 0 … is)`], and the legacy signed default is `attempts = 3`
[`scripts/load-centreline.js:307`]. `retries: 2` ⇒ 3 attempts ⇒ **byte-equal**. Backoff `0` matches
the legacy loop, which retries with NO sleep [`scripts/load-centreline.js:309-315` — no
`setTimeout`/sleep between attempts].

| Table literal (line) | `config.logic_variables[].name` | default | min / max / `on_invalid` |
|---|---|---|---|
| `centrelineSkipCheckThresholdDays` `7` [`:52`] | `load_centreline_dataset_age_warn_days` | 7 | 0 / 365 / `clamp` — WARN threshold only; **not verdict-affecting** |
| `centrelineAcceptFeatureCountDriftPct` `0.5` [`:53`] | `load_centreline_count_drift_fail_pct` | 0.5 | 0 / 1 / **`fail`** |
| `centrelineInvalidGeometryFailPct` `0.05` [`:54`] | `load_centreline_invalid_geometry_fail_pct` | 0.05 | 0 / 1 / **`fail`** |
| `centrelineDownloadTimeoutMs` `600000` [`:56`] | `load_centreline_download_timeout_ms` | 600000 | 1000 / 1800000 / `clamp` |
| `attempts = 3` (signed default) [`:307`] → **SPLIT (Fold IC-8)** | `load_centreline_download_retries` | **2** | 0 / 10 / `clamp` — `attempts = retries + 1` ⇒ 3, byte-equal |
| (same row) | `load_centreline_download_retry_backoff_ms` | **0** | 0 / 60000 / `clamp` — legacy sleeps between attempts: never |
| `centrelineMinFeatureCount` `40000` [`:55`] | — **knowingly-retired** | — | **NEVER READ** (dead, §3 #9); the one truth is the registered `sources_centreline_floor` [`scripts/seeds/logic_variables.json:5140`], REUSED via `checks[].limit_from_config` |
| `VALIDATION_CHUNK = 5000` [`:536`] | — **knowingly-retired** | — | **LC-D12** — the library validates in a single call |

**All eight are `on_invalid:"fail"` as of ③ (2026-09-27, Spec 124 §5 R-BA gate B closed answer #1).** The six rows above marked `clamp` were drafted clamp at ②; gate B (no ledger rows for an in-development step) flipped them to `fail` at ③ — an out-of-range admin value now halts. `config.js` already threw on a missing seed row (LM-D15), so only out-of-range VALUE handling changed; no data value moved. **`sources_centreline_floor` is SHARED,
never re-minted** (Rule 3, one source of truth) — the ledger reuses the registered key.

**Seeded today: 0 of these** [**MEASURED 2026-09-24**: `scripts/seeds/logic_variables.json` holds only
`centreline_propagation_coverage_min` (`:2`) and `sources_centreline_floor` (`:5140`) in this step's
domain] ⇒ **LC-D3**. Until the seeds land at ②, every `*_from_config` seat resolves to the descriptor
LITERAL above [READ `scripts/lib/step/acquire.js:126-157` — a named variable wins iff its resolved
value is a non-negative integer, else the literal, else 0].

---

## 7. Non-determinism inventory (before the first golden, Spec 123 §7 row 5)

What will differ between two identical runs, and how the golden projection handles it. **The golden
projection excludes `id`/`created_at`/`updated_at`** (§7 row 1/2) — everything else in this table must
be masked, pinned, or declared.

| # | Volatile fact | Why it is this step's own | Handling |
|---|---|---|---|
| 1 | **`id` (serial PK)** | DB-assigned on every full replace (the table is emptied and refilled) | **excluded from the projection** (`VOLATILE_KEYS`-class) |
| 2 | **`created_at` / `updated_at`** | `created_at` is a DB default, `updated_at` = `runAt` (the DB clock, `:596`, `:632`); a full replace re-stamps BOTH on every row | **excluded from the projection** |
| 3 | **`content_hash` / `source_dataset_version` / `last_modified` / `etag`** | **CKAN regenerates the ZIP DAILY** (§7 brief). `source_dataset_version = contentHash ‖ etag ‖ sha1(lastModified) ‖ String(runAt)` [`:585`] — so all four move even when the geometry does not | **PRE/POST `sources` captures must share ONE `content_hash`** — the capture must pin a single downloaded artifact (or mask the lineage 4-tuple) or the byte-identity claim is unprovable |
| 4 | **`centreline_features_deleted`** | = the PRE-state row count (the `DELETE` rowCount, `:628`, `:650` `:13`), i.e. the previous run's table size — an inter-run coupling, not a per-run function | declared; PRE capture records the pre-state count so POST's value is explained, not masked |
| 5 | **dataset-age value** (`centreline_dataset_age_days`) | `ageDaysFrom(nowMs, last_modified)` [`:444`] — a function of the RUN CLOCK and the CKAN publish | masked/pinned with the capture's run date (the `parcels` clock-seam precedent) |
| 6 | **`sys_*` audit rows** (`sys_duration_ms`, `sys_velocity_rows_sec`) | library-appended, per-run | dropped by `VOLATILE_METRIC_PREFIXES = ['sys_']` (§1.3: run 1471's 11 rows include the two `sys_*`) |
| 7 | **`pipeline_runs` ids / timestamps** | serial + wall clock | masked (`VOLATILE_KEYS` / ISO masks) |
| 8 | **the `String(runAt)` `source_dataset_version` fallback** [`:585`] | reached ONLY when HEAD AND GET both carry no validator — then the lineage stamp IS the clock | declared; unreachable on a normal CKAN run (the dataset carries both `last-modified` and `etag`), stated not waved through |

**This step introduces NO new volatile KEY FAMILY beyond what the INGESTOR precedents already
exercise** — but #3 (daily CKAN regen) and #4 (inter-run delete count) are the two that make a
naive PRE/POST byte-compare FAIL for a legitimate reason. Both are declared here, before the first
golden.

---

## 8. Commit plan

**RED evidence (gate K / G7):** `docs/reports/red-evidence/load_centreline/pre2-compute-missing.json` — the ② suite (commit 54b24f31) run against the ① tree (commit d9267df0): 36/36 assertions failed, e.g. `descriptor exists and is AJV-valid`, proving the suite was genuinely red before ②.

Copied from the plan of record §6 (transcribed; the plan file is absent — see the head-of-file note).
**Provider per commit** is the plan's assignment, not re-decided here.

| # | Commit | Provider | Scope |
|---|---|---|---|
| **①** | assessment + red suite + PRE goldens | **deepseek ×2 briefs** (this report A1+A2) **+ claude** (PRE goldens, `converted.json.pending` `red_suite`) | THIS report (§0–§R) + `src/tests/steps/load_centreline/violations.test.ts` (RED) + fixtures + PRE goldens `docs/reports/golden/load_centreline/pre/{sources,standalone}.json` |
| **②** | descriptor + compute + frozen shell + seeds; POST goldens | **deepseek ×3 briefs + Sonnet finisher + claude** | descriptor (external `http_file`/`shapefile_zip`/`key_property:"CENTREL2"`/`on_head_error:"warn_row"`; writes[0] `toronto_centreline` `geometry_kind:"line"` class C `staging_full_replace` `retract:"all"`; `network.retries:2` + the two `*_from_config`; `recovery.interrupted:"force_full_on_next_run"`; `staleness.on_prior_run_error:"warn_row"`) + compute (`coerceKey`, `shapeRecord`, `dedupeBySourceId`, `validatorCounterDelta`, `buildLoadMeta`, `checks`) + frozen shell + `notes.json` + seeds (LC-D3) + **Spec 62 corrected to the code (LC-D1/LC-D2)** + the declared deviations (0q/0r/LC-D6..D13); POST goldens + `--compare` (data byte-identical; declared additive keys only) |
| **③** | cutover | **claude / Sonnet** | `converted.json` register + pending delete; census flip; `step-validate --step=load_centreline --write`; **Spec 43 `## Operating Boundaries` added + the two unregistered libs (`source-version.js`, `config-loader.js`) registered under their owner spec (D8)**; Spec 62's PIPELINE_NAME doc-rot fixed (§1.4); system-map/backlog regen; merge + push |
| **④a** | `staleness.on_prior_run_error` flip | provider per plan | LC-D4 |
| **④b** | F-C1 WARN-preserve path re-emits the prior block's `features_inserted` (DS4 shape) instead of pinning `features_inserted:0` | provider per plan | LC-D14 (orchestrator ① correction — see §5.1 note; `recovery.interrupted`/LC-D5 needs no `④` fix, it is a terminal truthful declaration) |
| **④c** | remaining declared deviations | provider per plan | the ④-tail |

**Part A (this document) is deliberately COMMIT-FREE** — ① is orchestrator-lands (one commit carrying
this report, the red suite, the PRE goldens and the `converted.json.pending` entry). **Leave
uncommitted** per the brief.

---

## §R. Reflection (G9)

### LOW-CONFIDENCE table

| # | Claim | Confidence | Why | Verify at |
|---|---|---|---|---|
| 1 | **LC-D10's extension** (the library coerces the key BEFORE `shapeRecord` and drops bad keys, so a renamed `CENTREL2` never reaches F13) | **MEDIUM** | the two code sites are read [READ `scripts/lib/step/acquire.js:328`, `scripts/lib/step/index.js:813`] and the ordering is provable from them, but the terminal behaviour it implies (key-drop ⇒ `bad_key_count` = raw ⇒ L7/F-C1 `fail_check`, NOT `centreline_acquisition_error`) was **reasoned from the code, not exercised** — no fixture was run | ② (a key-renamed fixture asserting the terminal) |
| 2 | **LC-D8 single-member `MultiLineString` residue** | **LOW** | the *reachability* of a single-member Multi in the L25/geometry path is asserted; the legacy has **no counter for it**, so it has never been observed [MEASURED 2026-09-24: no `geometry_collection_extracted`-class counter exists in `scripts/load-centreline.js`]; run 1471 recorded `invalid_geometry_skipped = 0` (§1.4), which does NOT bound this defect | ② — the declared check over `geometry_collection_extracted` is the first observation |
| 3 | **LC-D12 single-call validation of 47K rows** (memory / statement-size posture) | **LOW** | A1 §1.6 accepts the whole-array model at this size from brief-author figures [MEASURED 2026-09-24, carried: 47,363 rows / 22 MB / Σ `ST_AsGeoJSON` 9.0 MB / max 254 points ⇒ estimate < 300 MB heap]; the *single-call* shape (vs legacy's 5000-row `VALIDATION_CHUNK`) is NEW and **unmeasured** — this allowlist has no `node` | ② (a `--max-old-space-size=512` capture) |
| 4 | **The daily-CKAN-regen byte-identity strategy** (§7 #3) | **MEDIUM** | the regen is a stated property of the source (the Phase-B archive note: `load_centreline` "produced an identical `source_dataset_version` on two runs 5h apart despite daily regeneration") and the 4-tuple is read from `:585`; whether a PRE/POST capture pair actually shares a `content_hash` depends on the capture window | first POST capture |
| 5 | **`CENTRELINE_FORCE_RELOAD` is ADDITIVE at ②** | **MEDIUM** | [MEASURED 2026-09-24: `grep 'FORCE_RELOAD' scripts/load-centreline.js` ⇒ 0 matches], so it is provably NOT a legacy behaviour — but the plan §6's own wording for it was transcribed, not re-verified against a plan file that is absent | ② descriptor review |
| 6 | **The plan-of-record file's absence** (head-of-file note; §5/§6/§8 "plan §N" citations) | **HIGH confidence in the FACT** (`git ls-files .cursor` / `git grep` both negative), **LOW in the CONTENT** of any plan §N ruling | the file is not in this worktree; every "plan §N" is transcribed from the three engine briefs that cite it. Independent on-disk corroborators (`wf2_ingestor_runner_completion_active_task.md`, `wf2_class_c_staging_replace_active_task.md`) DO exist and DO carry the class-C and row-3.2 rulings | orchestrator confirms the plan file before ② |

### RECURRING/STANDARD-SHAPING table

| # | Observation | Standard-shaping consequence |
|---|---|---|
| 1 | **The HEAD posture (0r) is a FLEET LIBRARY RUNG, not a per-step invention.** Legacy `[`:433-439`] does WARN-and-proceed on HEAD 4xx/5xx; the `ingest-prereq-0r` precedent test names this loader BY NAME [READ `src/tests/ingest-prereq-0r.logic.test.ts:3`, `:7`]. | `on_head_error:"warn_row"` is the declared seat, and **HEAD is NOT retried** — the library rung must reproduce the single-attempt HEAD. Reconfirms that the INGESTOR archetype's network posture is fixed once and inherited, with only the metric NAME varying (LC-D6-family). |
| 2 | **The retry rung (0q) is where a step's own literal is SPLIT into a library pair.** `attempts = 3` ⇒ `retries: 2` + `backoff: 0` (Fold IC-8). | **This is a STANDARD-SHAPING pattern**: P-D2's `attempts` literal in any legacy loader will split the same way (`attempts = retries + 1`, `resolveRetryPolicy`). Worth naming as a standing Rule-3 instruction: never declare an `attempts` variable; declare `retries` = attempts − 1 and a backoff. |
| 3 | **Skip reasons (0p) and the retry/HEAD rungs (0q/0r) compose into ONE library acquisition seam.** This step is the FOURTH INGESTOR and exercises all three rungs at once (tier-1 skip `:448`, tier-2 skip `:498`, retry `:309`, HEAD `:433-439`). | the fleet library is now provably able to serve a class-C INGESTOR with a destructive write and full-replace semantics — the archetype's hardest shape — without a new option. **The class-C executor is the only net-new library surface this row needs** (prerequisite 0h), everything else is composition. |
| 4 | **The F-C1 bound is an EMPTINESS invariant, not the floor variable.** F-C1's dual mode (first-run FAIL / later-run WARN+PRESERVE, `:563-581`) does NOT read `centrelineMinFeatureCount` or `sources_centreline_floor` — it asserts the temp table is non-empty. | **do NOT conflate the two floors**: `sources_centreline_floor` (the `assert_data_bounds` FAIL floor) and F-C1 (the emptiness gate) are DIFFERENT mechanisms at DIFFERENT layers. A future reader tuning the floor must not expect F-C1 to move. This mirrors the `parcels` P-D5 lesson (two different numbers for "the floor"). |
| 5 | **The FIRST converted class C discovers the class's declaration gaps** (LC-D4 `staleness.on_prior_run_error`, LC-D5 `recovery.interrupted`). | exactly as the `parcels` §R noted "the hardest member discovers the hatches": a class's FIRST member discovers the descriptor fields the class needs. LC-D4/LC-D5 are the class-C hatches; they become STANDARD for every later class-C row. |
| 6 | **Doc-rot is a conversion deliverable, not noise.** `PIPELINE_NAME`'s in-file comment records that Spec 62 §9 froze the WRONG string (§1.4); Spec 62's L7b/L7c/dup-id wording does not match the code (LC-D1/LC-D2). | the conversion is where the spec is reconciled to the shipped code (Q1's ruling: **correct the spec, file the variance as a separate feature**). This is the AP-D1 precedent generalizing: **spec fidelity is a first-class output of a zero-diff conversion, carried in the same commit's §3.** |


---

## 9. Landing ② — POST capture compare (2026-09-25)

Hash precondition held (no recapture needed): HEAD `Last-Modified: Thu, 24 Sep 2026 18:14:56 GMT` at both the PRE and POST capture times (2026-09-24 and 2026-09-25) — same CKAN bytes, same `content_hash` `f9a9adfc0ca5ddaa726b622635927197` on both PRE and POST.

POST sources (`CENTRELINE_FORCE_RELOAD=1 --chain=sources`): `records_new=47320`, `records_total=47320`, `centreline_load.features_inserted=47320` (row 9, Spec 122 §11: a 0-write POST is void — this is not one). Duration 39.8s, single-txn, 512 MB heap cap held. `table_state` data hash `b5ccf0ee`, `invariants` (row_count 47320, by_feature_code/by_jurisdiction breakdown, non_linestring 0, distinct_source_dataset_version 1), `records_total`/`records_new`, `records_updated`, and the verdict are ALL byte-identical to PRE.

POST standalone (`CENTRELINE_FORCE_RELOAD=1 --chain=none`): same, `records_new=47320`, `features_inserted=47320`, ledger status `completed_with_warnings` (a prior run — id 1471, `sources:load_centreline` — exists, so this was NOT a first-run capture; LC-D16 corrected below confirms this is the right pipeline name to query, not the bare `load_centreline`).

`--compare` (both pairs) reported 66 differences each (3 `stdout_lines` diffs + 11 additive `rows` diffs each, per pair — see (b)/(d) immediately below), ALL within the landing plan's allowed classes:
- **(a) `features_deleted` — pre-state count (inter-run coupling):** `centreline_load.features_deleted` reads 47363 in PRE (the table size the ① PRE run itself replaced) and 47320 in POST (the table size PRE's own run left, i.e. the row count the DELETE removed) — exactly the documented inter-run coupling (assessment §7), not a genuine drift.
- **(b) additive PASS rows for declared checks legacy pushed only when >0:** `summary.records_meta.audit_table.rows[9]` through `rows[19]` (11 additional rows) are the declared-check PASS/INFO rows the legacy only pushed conditionally (`centreline_duplicate_centreline_id_count`, `centreline_feature_count_filtered`, `centreline_count_drift_pct`, `centreline_geometry_skipped_pct`, both `f_c1_empty_temp_guard_fired*` arms, `centreline_geometry_collection_extracted`, `centreline_delete_skipped_empty_guard`, `centreline_features_inserted`, `centreline_features_deleted`) — the ravines Fold D precedent (declared checks emit PASS at 0/false, closing the "silence means both zero and nobody looked" gap). `rows[0]`-`rows[8]` reorder for the same reason (legacy pushed a subset in a different sequence).
- **(c) library rows (`pre_write_gate`, `sys_*`) + `terminal` key:** `summary.records_meta.checks_failed`, `checks_warned`, `ledger_row`, `pool_errors`, `warnings`, `gate`, `config`, and `terminal` are all NEW library-derived keys the runner adds to every converted step's summary — none existed on the legacy `pipeline.run()` shape. `terminal` = `"loaded_preserved_empty_guard"` on this WARN-verdict run is itself LC-D18 (pinned above): the generic library terminal-selection branch has no discriminator for "which check(s) warned," so it fell back to the descriptor's only `completed_with_warnings`-status success terminal even though the F-C1 preserve path did not fire (`f_c1_empty_temp_guard_fired=false`, `features_inserted=47320>0`) — observability-only, no correctness impact (a library gap, filed, not fixed here).
- **(d) stdout (config-loader lines gone):** `stdout_lines[0]`/`[1]`/`[2]` — the legacy's `"Loaded 35 trade configs from control panel"` / `"Loaded 608 logic variables from control panel"` lines are gone (LC-D3: `config-loader.js`'s `loadMarketplaceConfigs` is retired, config now resolves through `ctx.config`/`logic_variables[]`), and the completion line's tag changed from `[load-centreline]` to `[load_centreline]` (the runner's own tag, not the legacy step's).
- **(e) PIPELINE_META library-derived — same 20 write columns, reads key, CKAN:** `meta[0].external[0]` reads `"ckan:toronto-centreline-tcl-shp"` (the descriptor's own external id) instead of the legacy's generic literal `"CKAN"`; `meta[0].reads` is now `{}` (empty) rather than `{"ckan:toronto-centreline-tcl-shp": []}` (an external is not also a "read"); `meta[0].writes.toronto_centreline[18]`/`[19]` swap `created_at`/`updated_at` order (the descriptor lists the `db_default` column `created_at` last, `deriveMeta` iterates declaration order) — same 20 columns, same set, different declared order. All three are `deriveMeta`'s own library-derived rendering of the SAME descriptor facts the legacy hard-coded by hand.

No `table_state`, `invariants`, `verdict`, `records_total`, `records_new`, or `records_updated` diff in EITHER pair — the projected write is byte-identical PRE→POST. Every one of the 18 `centreline_load` keys except `features_deleted` is byte-identical PRE→POST on both pairs.

**[as-built C2 recapture, 2026-09-27]** The CKAN artifact moved (Last-Modified Fri, 25 Sep 2026 18:14:55 GMT), so PRE was recaptured from the legacy script at 1476e488 and POST immediately after at 5370ae7b, per the landing protocol §2. All four captures share content_hash af9ab187945e2f9c55a1ca620109a381 and table_state hash 4cb7efcddf7ca4ab8bf92a902fc9902b (47,320 rows). Forced-change proof holds on both POSTs (records_new = features_inserted = features_deleted = 47,320; load not skipped). --compare: 65 (sources) + 66 (standalone) diffs, all inside the 20 classes of explained-diffs.json; features_deleted no longer differs (PRE and POST both replaced a 47,320-row table). The terminal label reads loaded_preserved_empty_guard — the pinned LC-D18, not a regression. The f9a9adfc / b5ccf0ee / 47,363 figures above are the ② capture and are superseded.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=load_centreline --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=35 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-left window=a341880 |
| G3 | 1 | 2 | table rows=31 vocab-hit rows=25 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 17 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=4 it-count=40 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=4 lock-it-count=40 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | load_centreline | PASS | min_migration=175 <= migrations count=248 |
| 2 | load_centreline | PASS | 8 declared, missing from seeds: none |
| 3 | load_centreline | PASS | retired=1 overlap-with-declared=none |
| 7 | load_centreline | PASS | SPEC LINK header present=true |
| 8 | load_centreline | PASS | G-4: 8 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | load_centreline | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | load_centreline | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 27 converted slug(s) — 27 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 68 declared counter source(s) across 23 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 10 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 8 bound(s) checked, all closed (8 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 12 on_invalid(s) checked, all closed (12 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 41 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 41 (report-only until the table's inserter converts) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; 4 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 3 path(s) checked, all LF (3 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 32 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 363 definition row(s) checked, 44 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (13 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 83 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 27 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 29 finding(s), all ledger-allowed (29) |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 18 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 27 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 20 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | REPORT-ONLY until FLEET-2 (fold 9 C7-1/C7-2): checks[].reads declared by 2/27 step(s); write_inventory.by_mode declared by 0/27 |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 27 step(s) mode_select per archetype; 479 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 27 step(s) logic_version <=> code_version trigger; 32 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 27 step(s); 297 declared-key check(s), 0 violations; 150 terminal(s) unwitnessed (no capture) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 159 · unexplained: 0

### Test suite (item iii)
- 2109/2113 passed (suite success=false)
- harvested: 59 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (4):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-parcels.js (slug "enrich_parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-parcel-sanity.js (slug "assert_parcel_sanity") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-parcel-cost-estimates.js (slug "compute_parcel_cost_estimates") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-zoning.js (slug "load_zoning") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 8 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 10 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 4 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=ingest runner=runIngestPhase: no staleness.ledgerGatedSkip/selectMode/ENRICHER full-fold on this path (INGESTOR's own tier-1/tier-2 staleness gate); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the forced decision that bypasses the same gate override.force_run bypasses · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=61276B notes=11056B checks=20 rows records_meta=7294B (newest post/ capture) |

**Enforced-green: 13/14** · not-run: 0 · vacuous: 0

