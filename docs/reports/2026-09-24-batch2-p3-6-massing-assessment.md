# Batch 2 Phase 3 row 3.6 — `massing` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: PH-0 / §1 registry / §2 partial frozen (commit ① part A1). NOT converted.**
> `converted.json` already carries **four** INGESTOR-class members — `load-ravines`,
> `load-address-points`, `load-parcels` **and** `link-massing` are all in the `converted` array
> [READ `scripts/steps/_schema/converted.json:55-75`]; `load-massing` is NOT [READ same; grep ⇒ 0
> hits]. **INGESTOR 4th member** (the three INGESTOR loaders + this row's own down-step `link_massing`
> already converted) ⇒ R-PACE-1 eligibility **IS MET**, compressed form applies. The literal marker
> line above is present; the FULL nine-commit form's marker is deliberately absent (plan §0).

**Target slug:** `massing` · **Script:** `scripts/load-massing.js` — **489 lines** by the tree's own
count [READ `scripts/load-massing.js` `lines_total: 489`]. **The tree wins** over the plan's "488" (a
one-line off-by-one of the same class the `parcels` report flagged vs its own 585/586); every line
citation below is the tree's. · **Chain:** `sources`, position **15** — the manifest `massing` entry
sits between `enrich_centreline` and `link_massing` [READ `scripts/manifest.json` `chains.sources`] ·
**Lock:** `ADVISORY_LOCK_ID = 56` [READ `scripts/load-massing.js:131`; READ
`docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 lock registry].

**Manifest entry** [READ `scripts/manifest.json` `scripts.massing`]: `{file:"scripts/load-massing.js",
supports_full:false, supports_dry_run:false, telemetry_tables:["building_footprints"],
telemetry_null_cols:{building_footprints:["centroid_lat","centroid_lng"]}}`. **`supports_full:false` +
`supports_dry_run:false`** — the chain provides neither `--full` nor `--dry-run` for this step.

**Write class / shape (Spec 122 R5, re-derived from the code, never trusted from the manifest):**
**class A `guarded_upsert`** with `retract:"none"`; descriptor will declare `shape:"ingest"`,
`txn_scope:"step"` (legacy is per-1000-batch, §1.1). Owner-precedent: `address_points` is the first
converted class-A INGESTOR.

**Owner specs (from the system map — the ONLY two rows naming `load-massing.js`), quoted verbatim:**

- Spec **56** (`docs/specs/01-pipeline/56_source_massing.md`) — [READ
  `docs/specs/00-architecture/00_system_map.md:56`]:
  `| 56 | `01-pipeline/56_source_massing.md` | 3D Building Massing | `scripts/load-massing.js`, `scripts/link-massing.js` | — | Done |`
  The loader is the PRIMARY owner; `link-massing.js` (already converted) is the down-step.
- Spec **43** (`docs/specs/01-pipeline/43_chain_sources.md`) — system-map row 43 lists
  `scripts/load-massing.js` among its Target Files [READ
  `docs/specs/00-architecture/00_system_map.md:43`]. Spec 43 is ALSO the chain owner; the loader is
  its step at `sources[14]` (0-based) / position 15.

**Prerequisites consumed (landed, HEAD `a48465e2` per the brief; verify at capture):**

- **0s** — `coerceKey(raw, { geojson })`, `scripts/lib/step/acquire.js` only, **no schema byte, no
  RE-FREEZE number** (0p seam-note precedent) [READ `.cursor/wf2_ingest_prereqs_0s_0t_0u_active_task.md`
  §0s, Fold PB-2]. Massing's compute `coerceKey(_raw, {geojson})` derives `hash_<md5(geojson)[0:12]>`.
- **0t** — `outputs.writes[].geometry_repair: "make_valid"|"none"`, **RE-FREEZE #23** (Fold PB-1
  renames the enum value from the parent's `make_valid_multi`; Fold PB-2 renumbers #25→#23) [READ
  same plan §0t, Fold PB-1/PB-2].
- **0u** — `columns[].derived_from_geometry {measure:"geodesic_area", unit:"m2"|"ft2", scale:2}`,
  **RE-FREEZE #24** (Fold PB-2 renumbers #26→#24) [READ same plan §0u, Fold PB-2].

> **Numbering note (transcribed, not re-decided):** the PARENT plan (`.cursor/batch2_p3_6_massing_active_task.md`
> §4) said #24/#25/#26; the PREREQ plan's **Fold PB-2** renumbered them to **#23/#24** for 0t/0u (0s
> takes none) and its "Orchestrator rulings on open items" (O-A) **accepted** the renumber. **#23/#24
> is the ruling of record**; the brief's §0 header matches it. The landing seat re-greps the next free
> ordinal before committing (the ledger is ordinal, not reserved).

**Spec 121 §4.3 governs method** (refactor/behaviour split): this conversion is zero-behaviour-change;
every carried defect is pinned by `M-D<n>` id (plan §5) and every fix is a separate F-commit.

**Governing plans of record (every adjudication transcribed below is the ORCHESTRATOR'S, not
re-decided here):** `.cursor/batch2_p3_6_massing_active_task.md` (Status: Implementation, authorized
by operator 2026-09-24) and `.cursor/wf2_ingest_prereqs_0s_0t_0u_active_task.md` (the three library
prerequisites; Folds SF-0..SF-7 and PB-1..PB-5). Each is cited below as **"plan §N"** / **"Fold SF-n"**.

**Measurement environment:** every `[READ]` below was re-derived from THIS worktree on 2026-09-24.
`[MEASURED 2026-09-24]` values are transcribed from the plan (cited "plan §2 MEASURED") where the
probe needed live-CKAN bytes or DB SELECTs outside the engine's allowlist; the one probe figure the
orchestrator fills at landing is marked explicit (§1.7).

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-massing.js` end to end (489 lines), not from the manifest, the
> specs or any prior report. Spec 122 R5: the write class is re-derived from the code here.

**Risk class (Spec 123 §2.1).** The quarterly re-load writes ~428K footprints that `link_massing`
reads for `parcel_buildings` and `enrich_parcels` reads for parcel fields.

| Field | Value | Why |
|---|---|---|
| risk class | **A** (lowest) | ONE guarded UPSERT; **NO DELETE on the steady path** (the only DELETEs are the measured-dead key-format cleanup, §1.1) ⇒ a crash can never subtract rows. |
| chance | **low** | the write touches ~427K existing rows from an 81 MB CKAN zip, but the legacy caches `data/3d-massing-wgs84/` and the per-1000-batch txn commits as it goes. |
| impact | **high** | `building_footprints` feeds `link_massing` (→ `parcel_buildings`, FK no-cascade) AND `enrich_parcels`/`compute-*-cost-estimates`/`assert_*`. A derived-wrong write is visible in parcel-level product fields. |
| class · chance × impact | **A = low × high** | PIN-not-fix is available for every carried defect (plan §5 M-D ids); the per-batch → step txn widening (§1.6) is a declared deviation. |

### 1.1 Write class — **class A `guarded_upsert`, `retract:"none"`**

- Per-**1000**-row batch `pipeline.withTransaction` [READ `scripts/load-massing.js:251`] (the batch
  size is `pipeline.BATCH_SIZE` [READ `:375`] — the manifest's `execution.batch`, plan §6).
- **INSERT — 10 columns** [READ `:267-274`]: `source_id, geometry, footprint_area_sqm,
  footprint_area_sqft, max_height_m, min_height_m, elev_z, estimated_stories, centroid_lat,
  centroid_lng` (the two area values are pushed as `NULL` JS-side; the DB backfill fills them, §1.5).
- **SET — 7 columns** [READ `:278-292`]: `geometry, max_height_m, min_height_m, elev_z,
  estimated_stories, centroid_lat, centroid_lng`. **The area pair is INTENTIONALLY OMITTED** — the
  in-file comment [READ `:279-286`] names the load-bearing reason (WF2 #C 2026-05-09: omission
  prevents NULL-overwriting every existing row's area on a re-load, which would open a window where
  `compute-cost-estimates.js` reads NULL and silently falls back to the lot-size GFA path).
- **Guard — only 5 columns** [READ `:294-298`]: `geometry, max_height_m, min_height_m, centroid_lat,
  centroid_lng`. `elev_z` and `estimated_stories` are **absent** from the guard ⇒ **M-D4 KNOWN-DEFECT**
  (an elev-only source change is never written). Pinned verbatim; fix is separate **F2**.
- **Within-batch last-wins dedupe** [READ `:244-248`]: a `Map` keyed on `source_id`; the comment
  names the reason (no OBJECTID ⇒ geometry-hash keys collide; PG rejects a twice-affected row in one
  statement). Cross-batch duplicates self-overwrite ⇒ `records_updated=4` on an unchanged run (M-D3).
- **NO DELETE on the steady path.** The only DELETEs are the key-format cleanup (§1.4 S2/S3), measured
  **0-targets** and structurally dead after 0s ⇒ `retract:"none"`, `delete_sql:null`.

### 1.2 Columns WRITTEN — 10 INSERT + `geom` (S8) + the area pair (S7)

**18 write columns** total: the 10 INSERT columns above, plus `geom` (populated by S8, insert-only)
and the area pair (S7, `insert_only` via 0u `derived_from_geometry`). `id` is a serial and
`created_at` is a `db_default` (neither is written) ⇒ **M-D13**: each run burns ~428K sequence values
(seq at 2,564,362) on the INSERT attempt even when 0 rows insert. Not asserted (same in converted).

### 1.3 Audit rows / verdict / `records_meta`

- **`auditRows` — exactly 8 rows** [READ `:448-457`] (the brief's "8 of `const auditRows`" confirmed):
  `features_read` (WARN if `< 400000`), `records_inserted`/`records_updated`/`records_unchanged`/
  `features_skipped`/`batch_errors` (INFO), `skip_rate` (FAIL if `>= 5%`), `batch_error_rate` (FAIL
  if `>= 1%`). Only rows 1, 6, 7 are verdict-capable; the legacy `features_read` row is a **WARN**,
  not a FAIL.
- **Verdict — Rule 10 VIOLATION** [READ `:458-459`]: `hasFails`/`hasWarns` are computed as **parallel
  booleans** (re-deriving the same thresholds the rows carry) rather than folding the row statuses.
  The converted runner retires this: verdict is **row-derived** (`some(FAIL)?FAIL:some(WARN)?WARN:PASS`,
  the `parcels`/`address_points` shape).

### 1.4 `records_meta` producer keys + consumer contract

- **Producer keys today** (plan §1 bullet "Producer keys", [MEASURED] `pipeline_runs` id 1478): the
  legacy `emitSummary` writes `records_total, records_new, records_updated` [READ `:462-464`] and
  `records_meta` = `duration_ms, features_read, records_inserted, records_updated, records_unchanged,
  features_skipped, errors, audit_table{phase:7, name:"Building Footprints Ingestion", verdict, rows},
  pipeline_meta` [READ `:465-475`]. Note the meta key is `features_read` (not `rows_read`) — a
  name the converted fleet standardizes; the layer converts (declared additive golden diff).
- **Consumer contract.** `link_massing` gates its full relink on the table **COUNT** via
  `scripts/lib/massing-full-gate.js` [READ plan §1 "Downstream consumers"; the gate is over
  `building_footprints` COUNT, NOT massing's `records_meta`]. The admin funnel read is
  **unreachable**: `src/lib/admin/funnel.ts:165-169`'s LOADER-`warning` branch runs only over
  `FUNNEL_SOURCES`, and the `massing` funnel row's `statusSlug` is `'link_massing'` [READ plan §1,
  **Fold SF-4**]. ⇒ M-D3's 4→0 change has **NO** admin-visible effect.

### 1.5 Post-write statements, exits

- **S7 area backfill** [READ `:403-414`], **S8 geom backfill** [READ `:423-427`], **S9 conditional
  `VACUUM ANALYZE`** [READ `:429-433`] — all three are the plan §3 KEY ITEMS; their behavioural
  analysis and ruling (0u `derived_from_geometry`; 0t `geometry_repair:"none"`;
  `execution.maintenance`) live in §3 of the intent ledger, cross-referenced here.
- **Exit:** `pipeline.run` throws ⇒ non-zero; **lock 56 held ⇒ SKIP** (early return) [READ
  `:486-487`].

### 1.6 Source facts

`[MEASURED 2026-09-24]` (plan §2 MEASURED, DBF header + 2-record read):

- **428,184 records**; fields `MIN_HEIGHT MAX_HEIGHT AVG_HEIGHT HEIGHT_MSL SURF_ELEV HEIGHT_SRC
  BLDG_SRC LONGITUDE LATITUDE` (9). **No OBJECTID/ID** and **no ELEVZ**. The `.prj` is
  `WGS_1984_Web_Mercator_Auxiliary_Sphere` and coords are ~-8.86e6 ⇒ **EPSG:3857 despite the
  `_WGS84` name** (matching the `ZIP_URL` filename [READ `:36-37`]).
- **CKAN bytes** `[MEASURED 2026-09-24, brief author]`: current zip **81,415,175 B**, sha256
  `9617089710518f1a24f70ca11b4a7c20ae45ab8e52a6fbed1bc088192efe6285`, `Last-Modified`
  **2026-04-13**. Its `.shp` (sha256 `63e105a5…4a18`) and `.dbf` (`ecf41ca9…c58433`) are
  **byte-identical** to the main-tree `data/3d-massing-wgs84/` cache the 2026-06-10 load read ⇒
  **PRE is a steady-state run: 0 inserted, 4 updated expected** (the M-D3 churn).
- **Cache reuse:** the legacy reuses `data/3d-massing-wgs84/` if present (`existsSync`) [READ
  `:147-148`], and accepts a local path via `process.argv[2]` [READ `:141`] ⇒ **M-D10** (both retired;
  converted acquisition = CKAN every run, `cache:"none"`, `format:"shapefile_zip"`).

### 1.7 Memory

Plan §2 "Memory" is an **ESTIMATE (0.8–1.2 GB `heapUsed`, NOT measured)** for the whole-array
seam (428,184 features × ~550-char avg GeoJSON + the validator's `$2::TEXT[]` + returned WKB) against
the 4,288 MB limit the `parcels` probe recorded. The probe P-M (`scripts/analysis/probe-shapefile-acquire.mjs`)
measures it before ②; a heap breach makes a streaming ingest seam a library prerequisite and ② waits.

- **P-M MEASURED (orchestrator, landing step 2, 2026-09-24):** `node -r dotenv/config
  scripts/analysis/probe-shapefile-acquire.mjs --url=<ZIP_URL> --db` through the runner's own
  `acquire.js` seam. CKAN zip **81,415,175 B**, sha256
  `9617089710518f1a24f70ca11b4a7c20ae45ab8e52a6fbed1bc088192efe6285` — **matches** §1.6's
  brief-measured value exactly. `rows_read`/`feature_count` **428,184** (matches §1.6). **Peak
  `heapUsed` 678.73 MB, peak `rss` 875.27 MB, against the `4,288 MB` heap limit** — **NO heap
  breach** (well under the address_points O3 criterion); ② proceeds with no streaming-ingest
  prerequisite. `bad_key` **0**, `null_geometry` **0**, `ring_under_four_count` **0**,
  `missing_latitude_count` **0**, `missing_longitude_count` **0** ⇒ **M-D9 is dead on the measured
  input** (every feature carries `LONGITUDE`/`LATITUDE`; F3 is NOT triggered). Duplicate-key
  analysis: `duplicate_key_group_count` **961**, `duplicate_key_extra_rows` **1,107** (== the
  428,184 − 427,077 gap exactly, confirming M-D3's mechanism), `duplicate_key_groups_with_differing_attrs`
  **28** (of 961 groups, only 28 carry attribute drift across their duplicate members — the rest
  are pure re-reads). `--db` key diff: `db_key_count` **427,077**, `db_keys_absent_from_file` **0**,
  `file_keys_absent_from_db` **0** ⇒ **M-D5 orphan count is 0 today** (no currently-orphaned rows;
  the defect remains latent/structural, not presently manifest).

---

## 2. Registry sweep (plan §1, transcribed)

**Target Files and consumers** — every entry transcribed from the plan §1 table ([MEASURED 2026-09-24
via grep of `00_system_map.md` + `docs/specs/**` Operating Boundaries]). System-map rows naming
`load-massing.js` are **43 and 56 ONLY** [READ `docs/specs/00-architecture/00_system_map.md:43,56`].

| File | Owner spec(s) / list | Role | Touched here? | Gap |
|---|---|---|---|---|
| `scripts/load-massing.js` | **56** Target, **43** Target (step 15) | the step → §5.1 frozen shell | ② | none |
| `scripts/load-massing.descriptor.json` / `.notes.json` | none yet | NEW (Spec 122 §4.1) | ② | register under 56 at ③ |
| `scripts/lib/compute/load-massing.js` | none yet | NEW compute | ② | register under 56 at ③ |
| `scripts/link-massing.js` | 56 Target, 41/43/60 | downstream LINK (converted) | no | none |
| `scripts/lib/massing-full-gate.js` | **NO registry row** (grep: 0 hits in system map) | link_massing's COUNT gate over `building_footprints` | no | register under 56 at ③ (D8 precedent) |
| `src/lib/massing/geometry.ts` | none (dangling Spec 31 link) | app geometry helper | no | register under 56 at ③ |
| `scripts/lib/safe-math.js` | unregistered [READ parcels plan D6] | `safeParseFloat` throws on non-finite | compute requires it | registered by parcels ③; verify it landed, else 56 |
| `scripts/one-time/backfill-building-footprints-geom.js` | 47 §A.5 lock 121, no Target row | one-time geom backfill | no | Spec 56 Cross-Spec (R-AF) at ③ |
| `scripts/manifest.json` | 43 Target | `massing` entry | ③ (orchestrator) | none |
| Specs naming the file | 30, 40, 47 (§A.5 lock **56**), 65, 83, 120–123 | R-AF classification | ③ re-check | 30/40: classify, or confirm the exempt-reader set |

**Downstream consumers and their contract (must be preserved byte-for-byte)** (plan §1):

- `link_massing` reads `building_footprints.{id, geom, centroid_lat, centroid_lng,
  footprint_area_sqm}`; its full-relink gate keys on the table **COUNT**, not massing's records_meta
  [READ `scripts/lib/massing-full-gate.js`; Spec 56 §3]. `inputs.reads.steps` names `massing`
  (`version_pin: gte`); **no library code reads `version_pin`** (grep: 0 hits).
- `enrich_parcels` reads `bf.{id, footprint_area_sqm, max_height_m, estimated_stories, geom}`.
  `compute-cost-estimates.js` / `compute-coa-cost-estimates.js` read `bf.{id, footprint_area_sqm,
  estimated_stories}`. `assert_parcel_sanity` reads `bf.{id, footprint_area_sqm, geom}`.
  `assert_data_bounds` reads the row count via `sources_building_footprints_floor` = **400000**
  `[MEASURED logic_variables]`. `refresh_snapshot` reads `footprints_total`.
  **`parcel_buildings.building_id` has an FK to `building_footprints.id` with NO cascade**
  `[MEASURED pg_constraint]` — the reason S2/S3's cross-owner DELETE is not expressible (plan §3).
- **records_meta consumers:** the ONLY reader found is the admin funnel, and it is **unreachable**
  (Fold SF-4, §1.4). Producer keys per `[MEASURED]` run 1478, §1.4.

**Tests to disposition** (plan §1, transcribed — each re-pointed IN PLACE, never weakened):

- `src/tests/load-massing.infra.test.ts` — asserts on the legacy SOURCE TEXT (SET-omits-area,
  `WHERE footprint_area_sqm IS NULL`, ST_Transform 3857→4326, `WHERE geom IS NULL`). **Re-pointed IN
  PLACE** at ② onto the descriptor/plan (same intents), the geocode/address_points B6 precedent.
- `src/tests/sources-loader-mkdir.logic.test.ts:40` — lists `load-massing.js`'s `downloadFile`; that
  copy is retired, so the entry is **removed** at ② with the why (`acquire.js` owns `mkdtemp`).
- `src/tests/db/building-footprints-area.db.test.ts` — locks the area SQL; **re-pointed at the
  derived-area arm (0u)**. `pipeline-advisory-lock.infra.test.ts:30` (lock 56) — unchanged.

**Fold SF-7 (2026-09-24) — registry/consumer table completeness gaps** (plan §1, transcribed). System
map row 56 Target Files = `load-massing.js`, `link-massing.js` only; Spec 56 §4 matches; §1 is
complete for specs (01/112/113/114/26/41/42/60 name only `building_footprints`, not the script ⇒ no
R-AF obligation). **Gaps the table missed:**

- `src/tests/pipeline-sdk.logic.test.ts:1292-1296` — a LEGACY SOURCE-TEXT lock (`ON CONFLICT … IS
  DISTINCT FROM` regex over `load-massing.js`). Goes RED at ② when the shell is frozen. **Re-home IN
  PLACE** onto `write.buildWritePlan(d.outputs.writes[0], d).upsert_sql` + `guard_columns` = the
  legacy 5 (the `link_massing` re-home at `:1298-1310` is the exact template). Brief I scope.
- `src/tests/pipeline-sdk.logic.test.ts:1116` (`PIPELINE_SCRIPTS` SDK-adoption list) and
  `src/tests/chain.logic.test.ts:617,639,716,933` — the **R-AN fleet literal lists**; sync at ③.
- `scripts/seeds/lineage-meta-snapshot.json:3421-3430` records massing's `PIPELINE_META` including
  the FICTIONAL reads (`SOURCE_ID`, `AREA_SQ_M` …); consumed by `generate-lineage-docs.mjs`,
  `data-lineage-map.infra.test.ts`, `step-conformance.infra.test.ts`, `step-upstreams.logic.test.ts`.
  M-D6's truthful reads/writes change it ⇒ **regenerate in ②** (and `docs/reference/data-lineage-map.md`,
  system-map row 99) or the lineage infra test goes red. Added to M-D6's disposition.
- **Surface contracts** naming `scripts/load-massing.js` as evidence/`producing_steps`
  (`.../F16/contracts/contract_admin_stats.descriptor.json:86,158`, `.../contract_quality_refresh.descriptor.json`,
  `.../F90/…/contract_admin_leads_inspect_id.descriptor.json`, `.../F92/…/contract_permits_id.descriptor.json`,
  `scripts/surfaces/_schema/census/contracts.json:1621,1662,2197`): **path unchanged ⇒ verify-only at ③**.
- `src/tests/steps/{assert_schema,load_ravines,link_massing}/violations.test.ts` (#201) mention
  load-massing in test NAMES only and read their own compute ⇒ **unchanged (verified)**.
  `scripts/lib/step/write.js:77` comment cites the legacy UPDATE SET — refresh in 0u's commit.
  `scripts/steps/_schema/programme-items.json` (massing at `:1719/:2039/:2071`) ⇒ regenerated by
  `npm run programme-backlog` at ③.
- NEW file `scripts/analysis/probe-shapefile-acquire.mjs` (P-M) has no owner ⇒ **register it** (Spec
  123 or 56 Target) in its landing commit.
- **Spec 56 step-number drift:** Spec 56 §4 says "chain_sources.md (step 7)" while §1 says Spec 43
  step 15 and the surface contract says `sources[14]` ⇒ **correct Spec 56's number in the ③ spec
  diff** (from `manifest.json` chains, not by hand).

---

## 3. PH-3 — Intent Ledger (G3)

> Every non-obvious construct / fence in the 489 lines (the tree's count; §0 header). **Discoverer ≠
> adjudicator** (Spec 121 §4.2/§7.1): this pass DISCOVERS and the orchestrator ADJUDICATES. Every
> Disposition below is the ORCHESTRATOR'S, transcribed from the plan — never re-decided here.
> Disposition vocabulary (closed, Spec 120 §14.3 / Spec 122 §1.2a): **`preserved-in-runner` ·
> `preserved-in-validator` · `preserved-in-compute` · `encoded-as-descriptor-field` ·
> `encoded-as-deviation` · `knowingly-retired`**. **No row may be `unknown`.**

**Adjudicator column form:** `plan §N / Fold SF-n (orchestrator, 2026-09-24)`. The introducing
commits were recovered with `git log -S'<construct>' --reverse -- scripts/load-massing.js` by the
brief author (the brief's §"Introducing commits", quoted verbatim below); this pass re-verified that
**every cited SHA resolves in THIS worktree's history** (`git log --oneline <sha>`, read-only) and
re-checked every construct's `[READ]` line against the 489-line file.

**Provenance method** [VERIFIED 2026-09-24 — `git log --oneline <sha>` per SHA]: `66bfd529`
"Add building massing integration with 3D footprint data, height estimation, and permit detail UI"
(initial loader) · `040d421c` (next-newer touch of the file, pipeline-chains wave) · `0ef23550`
"refactor(28_data_quality): extract Pipeline SDK + migrate all 21 scripts to standardized
infrastructure" · `453e4091` "fix(37_pipeline_system): add IS DISTINCT FROM guard to load-massing
upsert" · `8986dc64` "feat(28_data_quality_dashboard): load-massing.js — deterministic ID hash +
decouple execSync + observability" · `465ba620` "fix(28_data_quality): detect and clean up source_id
format mismatch in massing" · `3018094a` "fix(28_data_quality): deduplicate massing batch by
source_id before INSERT" · `5baaed5a` "fix(28_data_quality): audit_table gaps, UX rendering, and
phase numbering" · `745a1b4d` "fix(47_pipeline_script_protocol): Bundle G Wave 4 — advisory lock
retrofit for load/ingest scripts" · `faca7378` "feat(56_source_massing): WF2 #C — backfill 427K NULL
footprint_area_sqm rows via PostGIS ST_Area + fix load-massing.js Web Mercator nulling" · `fc038790`
(WF3 geom-pass commit, §2.1 of the parent plan) · `1be8d767` "P2 sources mkdir" (WF3 record) ·
`2363fa35` (main-tree rollback anchor, the rotated-resource-id comment).

### 3.0 The table — `| # | Construct [READ] | Introduced (git log -S) | Intent | Disposition | Adjudicator |`

| # | Construct [READ] | Introduced (`git log -S`) | Intent | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 1 | `STORY_HEIGHT_M = 3.0` [READ `:27`], used by `estimateStories` [READ `:84-87`] | `66bfd529` (2026-02-25, initial loader) | Floor-to-floor height for the `estimated_stories = max(1, round(maxH/3.0))` floor count | **encoded-as-descriptor-field** → `massing_story_height_m` (3.0, fail, write-affecting; §6) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 2 | `SQM_TO_SQFT = 10.7639` [READ `:26`] — **dead** (read nowhere) | `66bfd529` | A JS area conversion from the pre-WF2-#C era when area was computed in JS | **knowingly-retired** (dead-code group, row 12) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 3 | `shoelaceArea(ring)` [READ `:43-63`] — **dead** (never called after WF2 #C) | `66bfd529` | JS planar area fallback before the PostGIS `::geography` pass (WF2 #C) | **knowingly-retired** (dead-code group, row 12) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 4 | `computeCentroid(ring)` [READ `:65-75`], used at [READ `:357-372`] | `66bfd529` | Ring-mean centroid FALLBACK when the feature lacks `LONGITUDE`/`LATITUDE` props | **preserved-in-compute** → `shapeRecord` carries it verbatim; **M-D9** KNOWN-DEFECT (latent: a 3857 ring yields metres); P-M counts missing LAT/LNG (0); why: descriptor limitations[] M-D9 + scripts/load-massing.notes.json (constants: 1e-7 rounding) | plan §5 M-D9 / Fold SF-6 (orchestrator, 2026-09-24) |
| 5 | `estimateStories(maxHeightM)` [READ `:84-87`] (NULL when `maxH ≤ 0`, else `max(1, round(maxH/3.0))`) | `66bfd529` | The stories floor with the "≥1 storey" clamp | **preserved-in-compute** → `shapeRecord`; the `3.0` is row 1, the `1`/"round" are storage-format in `notes.json` | plan §2 / Fold SF-6 (orchestrator, 2026-09-24) |
| 6 | `downloadFile(url, destPath)` [READ `:92-129`] (redirect-following, NO timeout, NO retry) | `66bfd529` | CKAN zip fetch; one-hop `Location` follow | **preserved-in-runner** (`acquire.js` download) + `massing_download_timeout_ms` via `network.timeout_from_config`; `network.retries:0` as legacy (§6) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 7 | `data/3d-massing-wgs84/` cache `fs.existsSync` short-circuit [READ `:147-148`] | `66bfd529` | Reuse a local extract instead of re-downloading (masks the resource-id rotation, `:31-35`) | **encoded-as-deviation** → **M-D10**: retired; converted acquisition = CKAN every run, `cache:"none"` | plan §5 M-D10 / Fold SF-6 (orchestrator, 2026-09-24) |
| 8 | `process.argv[2]` local-path override [READ `:141`] | `66bfd529` | Debug affordance: run against a hand-supplied `.shp` | **encoded-as-deviation** → **M-D10**: retired (parcels/address_points front-end precedent) | plan §5 M-D10 / Fold SF-6 (orchestrator, 2026-09-24) |
| 9 | PowerShell/unzip `execSync` extraction [READ `:156-163`] | `66bfd529` | Cross-platform ZIP extract (win32 PowerShell `Expand-Archive` vs `unzip`) | **preserved-in-runner** (`acquire.js` `extractArchive`, `format:"shapefile_zip"`) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |

**Table continues → (§3.0b)** — rows 10+ (SDK/emitMeta, the guard, the md5 key, the cleanup rungs, the
audit thresholds, the lock, the area/geom passes, the docker `mkdir`, the rotated resource id, the
dead-code group and the progress cadence).

### 3.0b Intent ledger (continued)

| # | Construct [READ] | Introduced (`git log -S`) | Intent | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 10 | `pipeline.emitMeta(...)` with the FICTIONAL read list (`SOURCE_ID`, `AREA_SQ_M`, `ELEV_Z`, `EST_STORIES`) and the write list omitting `geom` [READ `:480-483`] | `0ef23550` (2026-03-09, SDK extraction) | Self-documenting data-flow metadata (Spec 28 lineage) — but the reads name fields absent from the DBF | **encoded-as-deviation** → **M-D6**: descriptor declares the TRUTHFUL DBF reads + `geom` (Rule 1 forbids declaring fiction) + declared golden-diff key; regenerate `lineage-meta-snapshot.json` in ② | plan §5 M-D6 / Fold SF-7 (orchestrator, 2026-09-24) |
| 11 | 5-column guard `WHERE geometry IS DISTINCT FROM … OR max_height_m … OR min_height_m … OR centroid_lat … OR centroid_lng` [READ `:294-298`] | `453e4091` (2026-03-12) | Skip the UPDATE when nothing changed — but `elev_z`/`estimated_stories` are ABSENT ⇒ an elev-only change is never written | **encoded-as-descriptor-field** → `guard_columns` carried VERBATIM (the legacy 5) as **M-D4** KNOWN-DEFECT; fix is separate **F2** | plan §5 M-D4 / Fold SF-6 (orchestrator, 2026-09-24) |
| 12 | md5 geometry-hash key `'hash_' + md5(JSON.stringify(geometry)).slice(0,12)` [READ `:336-342`] | `8986dc64` (2026-03-17) | Stable deterministic key when the source has no `OBJECTID`/`ID` (a loop counter would collide on re-run) | **preserved-in-compute** → `compute/load-massing.js coerceKey(_raw, {geojson})` returns `'hash_'+md5(geojson).slice(0,12)` via prerequisite **0s**; `'hash_'`/`12` are storage-format constants in `notes.json` | plan §4 0s, Fold SF-1 / Fold SF-6 (orchestrator, 2026-09-24) |
| 13 | Key-format cleanup S1–S5: `COUNT`/`DELETE … NOT LIKE 'hash_%'` (+ mirror arm) + two `VACUUM ANALYZE` [READ `:202-227`] | `465ba620` (2026-03-26) | Detect a source-key-strategy change and clean stale rows before an ON-CONFLICT double | **knowingly-retired** → **M-D1**: detection becomes invariant `building_footprints_foreign_key_space_rows` (FAIL>0, §3.1 S1); remediation is a runbook action (O1, **RESOLVED BY REGISTER / Fold SF-6**) | plan §3 S1–S5, §5 M-D1 / Fold SF-6 (orchestrator, 2026-09-24) |
| 14 | Within-batch `Map`-keyed last-wins dedupe [READ `:244-248`] | `3018094a` (2026-03-26) | `source_id` is a geometry hash ⇒ duplicate hashes; PG rejects a twice-affected row in one statement | **preserved-in-compute** → `dedupeBySourceId` whole-set last-wins (`Map`, as `address_points`); **M-D3** declared forced diff (`records_updated` 4→0); why: descriptor deviations[] M-D3 + checks[] `duplicate_key_count` (INFO) + notes.json read_this_way | plan §5 M-D3, Fold SF-4 / Fold SF-6 (orchestrator, 2026-09-24) |
| 15 | `features_read >= 400000` WARN [READ `:448`] | `d32612bb` (2026-03-26) | Catastrophic-load detector (WARN, not FAIL) | **encoded-as-descriptor-field** → `checks[features_read_floor].limit_from_config: sources_building_footprints_floor` (SHARED with `assert_data_bounds`, value 400000); WARN as legacy (§6) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 16 | `skip_rate >= 5` FAIL [READ `:453`] | `d32612bb` (2026-03-26) | A rising skip rate signals source drift | **encoded-as-descriptor-field** → `massing_skip_rate_max_pct` (5, fail); numerator = `bad_key_count + null_geometry_count + shaped_skipped` over `rows_read` (§3.2) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 17 | `batch_error_rate >= 1` FAIL [READ `:455`] | `9ba01cb6` (2026-03-26) | Batch-failure detector | **encoded-as-descriptor-field** → `massing_batch_error_rate_max_pct` (1, fail); reachability under step-txn → VERIFY-INT-5 | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 18 | `phase: 7` in the audit table [READ `:469`] | `5baaed5a` (2026-03-26) | The sources-chain phase number for the funnel/audit render | **encoded-as-descriptor-field** → `sharing.varies_by_chain.phase` | plan §1 / Fold SF-6 (orchestrator, 2026-09-24) |
| 19 | `ADVISORY_LOCK_ID = 56` + `withAdvisoryLock` [READ `:131`, `:136-137`] | `745a1b4d` (2026-04-16) | Mutual exclusion on `building_footprints` across specs 41/42/43 | **encoded-as-descriptor-field** → `identity.lock:56` + `why_lock` (Spec 47 §A.5 registry) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |

**Table continues → (§3.0c)** — rows 20+ (the WF2 #C area SET-omission + S7, the WF3 S8/S9 passes, the
P2 `mkdir`, the rotated resource id, the dead-code group, the progress cadence).

### 3.0c Intent ledger (continued)

| # | Construct [READ] | Introduced (`git log -S`) | Intent | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 20 | area SET-omission (the `-- WF2 #C …` comment) [READ `:279-286`] + S7 area backfill [READ `:403-414`] | `faca7378` (2026-05-09, WF2 #C) | Omission prevents NULL-overwriting every existing row's area on a re-load (a window where `compute-cost-estimates.js` reads NULL → lot-size GFA fallback); the backfill is the SOLE authority for the area pair | **encoded-as-descriptor-field** + **preserved-in-validator** → columns `insert_only` + prerequisite **0u** `derived_from_geometry {measure:"geodesic_area", unit:"m2"|"ft2", scale:2}`, seeded at INSERT inside the validator SQL (§3.1 S7) | plan §3 S7, §4 0u / Fold SF-3 (orchestrator, 2026-09-24) |
| 21 | S8 geom backfill `SET geom = ST_Transform(…,3857),4326) WHERE geom IS NULL` [READ `:423-427`] | `fc038790` (2026-06-11, WF3) | Populate `geom` for `link_massing`'s PostGIS fast path; migrations 065/098 left it unpopulated | **encoded-as-descriptor-field** + **preserved-in-validator** → `bind:"wkb_geometry"` + `geometry_srid:3857` + `written:"insert_only"` + prerequisite **0t** `geometry_repair:"none"` (§3.1 S8) | plan §3 S8, §4 0t / Fold SF-2 (orchestrator, 2026-09-24) |
| 22 | S9 conditional `VACUUM ANALYZE building_footprints` when `geomUpdateRes.rowCount>0` [READ `:429-433`] | `fc038790` (2026-06-11) | Reclaim dead tuples + refresh GiST stats for the `link_massing` fast path after the geom UPDATE | **encoded-as-descriptor-field** → `execution.maintenance:[{operation:"vacuum_analyze", table:"building_footprints", owned_by:"self"}]`, gated on `building_footprints_dead_tuple_ratio_warn_max`; trigger differs (M-D12, data-invisible) → VERIFY-INT-3 | plan §3 S9, §5 M-D12 / Fold SF-6 (orchestrator, 2026-09-24) |
| 23 | `fs.mkdirSync(path.dirname(destPath), …)` inside `downloadFile` [READ `:99-100`] | `1be8d767` (2026-08-03, Pipeline Rehab P2) | The gitignored `data/` dir does not exist on a fresh CI checkout; the zip download precedes the loader's only `mkdirSync` | **knowingly-retired** → **M-D10**: retired with the `data/` cache; `acquire.js` owns `mkdtemp` | plan §5 M-D10 / Fold SF-6 (orchestrator, 2026-09-24) |
| 24 | Rotated CKAN resource id in `ZIP_URL` [READ `:36-37`] + the "resource ids ROTATE" comment [READ `:30-35`] | `2363fa35` (2026-08-03) | The dataset id is stable but the resource id is not — a re-registration 404'd the prior id mid-chain | **encoded-as-descriptor-field** → `inputs.reads.externals[].url` (+ `license`, `format:"shapefile_zip"`); the durable `package_show` fix stays in `review_followups` (a separate change) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 25 | Dead-code group: `shoelaceArea` `:43-63`, `SQM_TO_SQFT` `:26`, `isProjected` `:352`, the `111320` constant `:51` (computed, never read) | `66bfd529` (2026-02-25); `isProjected` from `040d421c` (2026-03-03) | Pre-WF2-#C JS area path (`shoelaceArea`/`SQM_TO_SQFT`) and a projected-CRS sanity flag (`isProjected`), all orphaned by WF2 #C | **knowingly-retired** (the whole dead-code group; address_points precedent for dead progress cadence) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 26 | Progress cadence literals `10*1024*1024` [READ `:117`], `50000` [READ `:385`], `480000` [READ `:386`] | `66bfd529` | Download-progress log window + progress-line modulo/denominator — log-only, not gates | **knowingly-retired** → dead under the whole-array seam (the `address_points` commit-9 precedent) | plan §6 / Fold SF-6 (orchestrator, 2026-09-24) |
| 27 | `LONGITUDE`/`LATITUDE` centroid PREFERENCE [READ `:357-359`] | `040d421c` (2026-03-03) | Prefer explicit props over a ring mean (a ring may be projected even if the file claims WGS84) | **preserved-in-compute** → `shapeRecord` (row 4 is the fallback arm); why: the same M-D9 limitations[] entry names the preference order | plan §2 / Fold SF-6 (orchestrator, 2026-09-24) |
| 28 | `elev_z = ELEVZ ?? SURF_ELEV` fallback [READ `:367-369`] | `040d421c` (2026-03-03) | Use the ground surface elevation when no per-feature `ELEVZ` field exists (the DBF has only `SURF_ELEV`) | **preserved-in-compute** → `shapeRecord` (the `SURF_ELEV` arm is the live one, §1.6); why: scripts/load-massing.notes.json constants (2 dp rounding) + limitations[] M-D4 (elev_z unguarded) | plan §2 / Fold SF-6 (orchestrator, 2026-09-24) |

**Count: 28 rows · 0 without a disposition.** Every named dead-code element
(`shoelaceArea`, `SQM_TO_SQFT`, `isProjected`, `111320`) is row 25 and every progress-cadence literal
(`10*1024*1024`, `50000`, `480000`) is row 26 — both `knowingly-retired`, the `address_points`
precedent. **No row is `unknown`.** Rows 13/20/21/22 are the four cleanup/backfill statements
whose own rung ladder is §3.1.

### 3.1 Cleanup/backfill statements — the rung ladder (plan §3, transcribed)

> Each statement is quoted from `scripts/load-massing.js`, measured with a SELECT only (plan §2/§3
> MEASURED), and walked through the rungs **Spec 124 §7 + Spec 122 axes**: (a) descriptor field,
> (b) declared check, (c) logic variable, (d) library, (e) compute last. Spec 122's axes were also
> tried: class B departure, class C staging, invalidates, `insert_only`, cascades, a separate step.
> **Operator 2026-09-24: no INGESTOR compute-authored SQL, so 0k `set_source:"compute"` is REJECTED
> for every row.** Columns per the plan: `# · statement [READ] · measured · rungs tried → ruling ·
> behaviour on measured input`.

| # | Statement [READ] | Measured | Rungs tried → ruling | Behaviour on measured input |
|---|---|---|---|---|
| S1 | `SELECT COUNT(*) … WHERE source_id NOT LIKE 'hash_%'` (hash arm, every run) [READ `:202-204`] | **0** | (a) `source_key_policy.key_space_migration` `{from,to,why}` is declarative only, no executor (grep `scripts/lib/step`: 0 hits) → declares intent but does not detect. **(b) → `invariants[]` `building_footprints_foreign_key_space_rows`** (descriptor-declared read-only SQL, R-T/R-C executor), FAIL if `> 0`, `source:"invariant"` | identical (0). Timing moves pre-write → run-end (**M-D1**) |
| S2 | `DELETE FROM parcel_buildings WHERE building_id IN (SELECT id … NOT LIKE 'hash_%')` [READ `:208`] | **0** targets (0 non-hash rows) | (a) `outputs.cascades` has exactly this case in its schema text but is **declarative only, no executor** (grep: 0 hits in `scripts/lib/step/*.js`), and the table is owned by `link_massing`. Class B `retract:departed` would ALSO retract geometry-changed rows and hits the no-cascade FK [MEASURED]. Class C would DELETE all 427K rows under 520,492 FK links. `invalidates` nulls columns, cannot delete rows. A separate step is wrong (a one-shot key-space migration is not a recurring step). **→ `knowingly-retired`.** **Fold SF-1 (2026-09-24) reworded:** the derivation lives in compute + `notes.json`, not a descriptor field — massing's `coerceKey` derives the key from geometry ALONE and ignores every DBF property, so a publisher adding OBJECTID can no longer re-key the table (structurally unreachable after 0s). Declare `cascades:"none"` + `key_space_migration:"none"` (why). Detection is S1; remediation is a runbook action | identical (dead). Confirm → **O1** |
| S3 | `DELETE FROM building_footprints WHERE source_id NOT LIKE 'hash_%'` [READ `:209`] | **0** | same as S2 | identical (dead) |
| S4 | `VACUUM ANALYZE building_footprints` + `VACUUM ANALYZE parcel_buildings` after cleanup [READ `:211-212`, `:224-225`] | only reachable with S2/S3 | retired with S2/S3 (its reason is S2/S3's dead tuples) | identical (dead) |
| S5 | mirror arm: `COUNT`/`DELETE … LIKE 'hash_%'` when the file has OBJECTID/ID [READ `:216-227`] | **unreachable**: the DBF has no OBJECTID/ID [MEASURED header] | the OBJECTID/ID key preference [READ `:336-339`] is `knowingly-retired` with it (**Fold SF-1**, 2026-09-24: massing's `coerceKey` reads the geometry string only) | identical (dead) |
| S7 | `UPDATE building_footprints SET footprint_area_sqm = ROUND(ST_Area(…::geography)::numeric,2), …_sqft = ROUND((…*10.7639104167)::numeric,2) WHERE footprint_area_sqm IS NULL AND geometry IS NOT NULL` [READ `:403-414`] | area NULL = **0** [MEASURED]. Live only for newly inserted rows | (a) `written:"insert_only"` (0j, built FOR this column) keeps it out of SET/guard but gives it no DB-side value. Class E `write_once_backfill` fails (`runIngestPhase` drives exactly ONE write target; class E runs only under the BACKFILL runner). A separate BACKFILL step would add a 29th `sources` step for a 2-column seed (heavier than (d)). (e) compute is banned and JS cannot reproduce PostGIS `::geography` byte-for-byte. **→ (a)+(d) prerequisite 0u: `columns[].derived_from_geometry {measure:"geodesic_area", unit:"m2"\|"ft2", scale:2}`, computed INSIDE the validator SQL from the pre-repair `input.geom` (the legacy expression exactly), seeded at INSERT, `insert_only`.** | new rows: byte-identical (proven by the forced-change run). The "heal any NULL row" half is dead on the measured state (0 NULL) → `knowingly-retired` + a declared post check `footprint_area_null_count` FAIL>0 (**M-D7**) |
| S8 | `UPDATE building_footprints SET geom = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text),3857),4326) WHERE geom IS NULL AND geometry IS NOT NULL` [READ `:423-427`] | geom NULL = **0** | **(a) `bind:"wkb_geometry"` + `geometry_srid:3857` (0i, built FOR this file) + `written:"insert_only"` (0j) + (d) prerequisite 0t `geometry_repair:"none"`**, so the validator emits exactly the legacy transform with no MakeValid/Multi | new rows byte-identical. Heal half → **M-D7** |
| S9 | `if (geomUpdateRes.rowCount>0) VACUUM ANALYZE building_footprints` [READ `:429-433`] | fired only on insert runs; the last 4 runs inserted 0 [MEASURED] | **(a) `execution.maintenance:[{operation:"vacuum_analyze", table:"building_footprints", owned_by:"self"}]`**, whose executor `runMaintenance` (EP-D17) is gated on `building_footprints_dead_tuple_ratio_warn_max`. The legacy trigger ("my backfill UPDATE made dead tuples") is structurally gone (geom/area are seeded at INSERT, no UPDATE pass) | trigger differs (**M-D12**, data-invisible). Reachability of `maintenance` under `shape:"ingest"` → **VERIFY-INT-3** |

**O1 — RESOLVED BY REGISTER (Fold SF-6).** The S2–S5 key-format auto-cleanup (incl. a cross-owner
`parcel_buildings` DELETE) has **no standard carrier**: `outputs.cascades` has no executor and
building one for a measured-dead path is gold-plating. **[MEASURED 2026-09-24]** non-`hash_` rows = 0;
`parcel_buildings` rows joined to a non-`hash_` footprint = 0; `geom IS NULL` = 0;
`footprint_area_sqm IS NULL` = 0. Dead measured path ⇒ **`knowingly-retired`** is the Spec 124 §5
worked example (LM-D7, ruling A-8/R-A); the retirement is a declared `deviations[]` entry with
`adjudicated_by`, exactly as 3.1 retired its three dead progress-cadence vars. **No operator ask
remains** (plan §10 O1).

**Rule 11 ("before X") re-derivation** (plan §5, transcribed). Spec 56 §3 item 5 says massing runs
before `link_massing` (manifest order, unchanged). Legacy guaranteed "area/geom populated before the
step exits" via S7/S8. Converted seeds them AT INSERT, in the same txn (stronger). Legacy guaranteed
"key cleanup before load" via S1–S3; this is moot under 0s (no re-key possible). There is no
`pre_write` check, so `checkOrderGuaranteesCited` is vacuous. Stated here per the plan.

### 3.2 Prerequisite fit — what massing consumes from 0s / 0t / 0u

> Each prerequisite is its OWN library commit BEFORE ① (parent §4, orchestrator-lands); each row of
> §3.1's ladder homed one of them. The three are cited from
> `.cursor/wf2_ingest_prereqs_0s_0t_0u_active_task.md` (Folds PB-1..PB-5); every value below is
> transcribed, never re-decided.

**0s — key derivation via the existing compute seam (no schema byte, no RE-FREEZE number).**
Massing's compute `coerceKey(_raw, {geojson})` returns
`geojson == null ? null : 'hash_' + md5(geojson).slice(0,12)` — the geometry-hash key of §3.0b row 12.
The library change (0f/0n class, `acquire.js` ONLY) builds `geojson = JSON.stringify(r.value.geometry)`
ONCE and passes it as the second argument to `coerceKey` [READ `acquire.js:235-241` — today the
stringify happens at `:241`, after `coerceKey` at `:235`]. Existing `coerceKey`s are single-argument
[READ `compute/load-address-points.js:48`, `compute/load-ravines.js:441`] ⇒ **byte-identical for
ravines/address_points/parcels** (recapture as the §4 header says). **md5 byte-equivalence
[MEASURED 2026-09-24]** (plan §4 0s): the legacy hash is a JS md5 too (not SQL) —
`crypto.createHash('md5').update(JSON.stringify(feature.geometry))` over
`shapefile.open(shpPath)` [READ `load-massing.js:308`, `:341`] while the runner opens
`shapefile.open(shpPath, dbfPath)` [READ `acquire.js:225`]; the first **3,000 features** of the local
`data/3d-massing-wgs84/` file hashed both ways: **0 mismatches, 3,000 distinct, 3,000/3,000 present in
`building_footprints.source_id`**. No SQL md5 is involved anywhere, so there is no JS-vs-`md5(text)`
risk. Rule 2 (compute purity) holds: the 2nd argument is a fresh `{ geojson }` literal holding an
immutable string (`shapeRecord` already receives it as `ctx.geojson`); `crypto` is not a forbidden
compute require [READ `scripts/ast-grep-rules/compute-shape.yml:94-115`].

**0s counter re-bucketing (declared).** Under the geometry-derived key, a **null-geometry feature now
scores `bad_key`** (massing's `coerceKey` returns `null`) rather than `null_geometry`; legacy counted
both into one `skipped` [READ `:318-327`]. The `skip_rate` check therefore **MUST read
`bad_key_count + null_geometry_count + shaped_skipped` over `rows_read`** (0o) so the legacy
numerator/denominator is preserved regardless of bucket — locked in ① (plan §4 0s).

**0t — `outputs.writes[].geometry_repair: "make_valid" | "none"` (RE-FREEZE #23).** Massing consumes
**`"none"`**: `geom_final` = the transformed input as-is, so the validator emits exactly the legacy
S8 `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(…),3857),4326)` with NO `ST_MakeValid`/`ST_Multi`
(§3.1 S8). The default arm (`make_valid`, Fold PB-1 renames from the parent's `make_valid_multi` —
the default Multi-wraps only for `polygon`) stays byte-identical for the converted fleet. Under
`"none"` the SQL must keep `ST_IsValid(geom) AS is_valid_original` so the stored-invalid count stays
observable. **Fold PB-3 (library-owned counter):** the parent SF-2 hoped massing's
`validatorCounterDelta` could count stored-invalid rows from `is_valid_original`, but it cannot —
`classify`'s return is summed only into `repaired/collectionExtracted/skipped` (fact 6). So 0t counts
carried rows with `is_valid_original === false` under `none` and index.js exposes it beside
`invalid_geometry_repaired` as **`acquired.invalid_geometry_stored`** (golden-neutral — records_meta
is picked by the compute, never spread; not a runner library call ⇒ phase_order unchanged). Massing
②'s `classify` **must return `repaired: 0` under `none`** (**O-C**, carried into ②'s Brief G). This
keeps **M-D2** (17 invalid geoms stored unrepaired) observable honestly instead of routing it through
a false `repaired` name.

**0u — `columns[].derived_from_geometry {measure:"geodesic_area", unit:"m2"|"ft2", scale:2}`
(RE-FREEZE #24).** Massing consumes **two** such columns — `footprint_area_sqm` (`unit:"m2"`) and
`footprint_area_sqft` (`unit:"ft2"`), each `scale:2` — replacing S7 (§3.1). The validator returns the
declared measures under their column names, computed from the PRE-repair `input.geom` (the legacy
S7 expression exactly: `ROUND((ST_Area(X::geography))::numeric, 2)` and `ROUND((ST_Area(X::geography)
* 10.7639104167)::numeric, 2)`, `X` = 0i's `input.geom` at `geometry_srid:3857`); seeded at INSERT,
`insert_only` keeps them out of SET/guard (#18). Both areas bind as a **string** (node-pg returns
`numeric` as a string ⇒ binding back is exact; never `Number()`). **Input equivalence:** legacy reads
`geometry::text` (jsonb re-serialised) while 0u reads the `$2::TEXT[]` JS string; jsonb stores JSON
numbers as exact `numeric` digits, so both parse to the same doubles — the [MEASURED] drift-row count
is identical (361) whether area is re-derived from `geometry::text` or from stored `geom`. The
`10.7639104167` factor is a **unit constant in `write.js`** (parcels D3 precedent; not a Rule 3
tunable), named in `notes.json`; `scale` is descriptor data.

**O-B is NOT this step's** (parcels **P-D6**, pinned in `review_followups` at 0t landing): the
`parcels` converted step runs the default repair arm while its legacy geom was an unrepaired
`ST_SetSRID(ST_GeomFromGeoJSON(…), 4326)` [READ `8360fc32^:scripts/load-parcels.js:294`]; that latent
delta is a parcels descriptor revisit, not a massing prerequisite. Massing is the FIRST consumer of
`geometry_repair:"none"` and its `"none"` arm is the legacy-parity choice for THIS file.

---

## 4. PH-5 — Seam map (G5)

> Every seam the step touches, its legacy site, and the converted seat. Method: the seam is named
> where the legacy code CROSSES the process boundary; the converted form is the library/descriptor
> axis that owns it. Each row is `seam · legacy site [READ] · converted seat`. Adjudications are
> the orchestrator's (plan §2/§6, Folds SF-0/SF-4/SF-6), transcribed, never re-decided.

| Seam | Legacy site [READ `scripts/load-massing.js`] | Converted seat |
|---|---|---|
| **DB / transaction** | pool obtained from `pipeline.run`; `withAdvisoryLock(56)` [READ `:131`, `:136-137`]; per-1000-batch `pipeline.withTransaction` [READ `:251`] | runner `scripts/lib/step/index.js` (single pool, `txn_scope:"step"`, M-D11); `identity.lock:56` + `why_lock` (Spec 47 §A.5 registry row 56) |
| **Clock** | NONE — the step never reads a clock; `created_at` is a `db_default` on `building_footprints` [MEASURED `information_schema`] | runner supplies `run_at` to the compute ctx (`shapeRecord(…, {run_at})`); `created_at` stays DB-default and is never written (§1.2). No clock literal exists to externalise (Rule 3 vacuous). |
| **Network** | `downloadFile(url, destPath)` [READ `:92-129`] — follows one redirect hop, **NO timeout**, **NO retry**; `ZIP_URL` CKAN [READ `:36-37`] | `scripts/lib/step/acquire.js` download; `network.timeout_from_config: massing_download_timeout_ms` (default sized from P-M at ②, ≥5× measured); `network.retries:0` **"as legacy"** — see the coupling note below |
| **argv / env** | `process.argv[2]` local-path override [READ `:141`] | **RETIRED — M-D10** (no argv reader in the runner path; the parcels/address_points front-end precedent) |
| **Filesystem** | `data/3d-massing-wgs84/` cache `fs.existsSync` short-circuit [READ `:147-148`] + PowerShell/unzip `execSync` extraction [READ `:156-163`] | `acquire.js` owns `mkdtemp` + `extractArchive`; descriptor `cache:"none"`, `format:"shapefile_zip"` — **M-D10** (both retired; the `data/` cache and the `mkdirSync` are retired with them, Intent Ledger row 23) |
| **CKAN resource-id rotation** | the "resource ids ROTATE" comment [READ `:29-35`] + the rotated id inside `ZIP_URL` | descriptor `inputs.reads.externals[].url` (+ `license`, `format:"shapefile_zip"`); the durable `package_show` fix stays a `review_followups` item, unchanged by this conversion (Intent Ledger row 24) |

**Seams named (G5, as-built at ②):** the **DB seam** is the runner pool + lock 56 + one step transaction; the **clock seam** is the runner's `run_at` handed to `shapeRecord` (unused by massing) with `created_at` a db_default; the **network seam** is `scripts/lib/step/acquire.js` (timeout from `massing_download_timeout_ms`, `retries:0`, now executed since centreline 0q landed); the **argv/env seam** is empty (argv[2] retired, M-D10; only `PIPELINE_CHAIN` via `execution.invocation`).

**SF-0 coupling (transcribed, not re-decided).** `network.retries` has **zero library readers** until
centreline 0q's executor lands [READ `.cursor/wf2_ingest_prereqs_0s_0t_0u_active_task.md`; parent plan
Fold SF-0]. If massing ② lands FIRST, `retries:0` is an **inert declaration** (R-X/R-AX class) and
must carry the posture-disposition row centreline 0q adds; if it lands AFTER, the declaration is
executed and no disposition row is owed. ② sequencing: land after centreline 0q, or carry the row.
This is the ONLY cross-step coupling in the seam set.

**Posture note (R-AX).** `retries:0` is declared because it is what the legacy did (a bare
`https.get` with no retry loop) — **not** as a value judgement that 0 retries is right. The same
posture rule that makes `on_row_error`/`on_batch_error` truthful declarations (CC-D5, LR-D12,
CPCE-D6, EP-D20) applies: a declaration states today's behaviour, and the *fix* is a separate
commit, never folded into the conversion (Spec 121 §4.3).

---

## 5. PH-6 — Classification (G6)

> Re-derived from the code (Spec 122 R5 / R-AO — **never** trusted from the manifest), then stated
> in the descriptor vocabulary. The class and every field below are the orchestrator's adjudication
> (plan §5, Folds SF-1/SF-4/SF-5/SF-7), transcribed.

**Archetype: INGESTOR (R-AO re-derived).** One external source (the CKAN shapefile zip) → exactly
one write target (`building_footprints`). This matches the three converted INGESTOR loaders
(`load_ravines`, `load_address_points`, `load_parcels`); `massing` is the **4th member** (the
R-PACE-1 compressed-form marker, §0 header).

| Field | Value | Why |
|---|---|---|
| `shape` | **`"ingest"`** | external→one-target; the INGESTOR runner phases (acquire → validate → write → score), Spec 122 §1.10 (archetype classification, massing listed as INGESTOR #14) |
| write class | **A `guarded_upsert`** | one ON-CONFLICT upsert, no steady-path DELETE (§1.1) |
| `retract` | **`"none"`** | the only DELETEs are the measured-dead key-format cleanup (S2/S3), structurally unreachable after 0s ⇒ M-D1 |
| `cascades` | **`"none"`** | the cross-owner `parcel_buildings` DELETE (S2) has no executor and is retired (M-D1; O1 resolved by register) |
| `txn_scope` | **`"step"`** | legacy is per-**1000**-row batch [READ `:251`]; the runner owns one transaction for the whole step — **M-D11** (address_points Fold B3 precedent); duration + WAL measured at ② |
| `source_key_policy` | **`{unique:false, on_collision:"last_write_wins"}`** | the key is a geometry hash ⇒ duplicates are expected and last-wins; the legacy within-batch `Map` dedupe [READ `:244-248`] is the same rule — **M-D3** |
| `inputs.reads.externals[].key_property` | **ABSENT** | 0s: massing's `coerceKey` derives the key from geometry ONLY; the DBF has no id property (§1.6, Intent Ledger row 12) |

### 5.1 Defect ledger

**PIN in wrong form — never fix inside the conversion (Spec 121 §4.3 / Spec 123 §3.1).**

| ID | Class | Finding [evidence] | Disposition | Post-conversion |
|---|---|---|---|---|
| M-D1 | deviation | key-format auto-cleanup S2–S5 is dead; detection S1 moves pre→post and delete→FAIL [§3] | `knowingly-retired` + invariant `building_footprints_foreign_key_space_rows` | none (O1) |
| M-D2 | KNOWN-DEFECT | **17 invalid geoms stored unrepaired** [MEASURED; anchor `:423-427`] | carried via 0t `geometry_repair:"none"` | **F1** (optional): flip to `make_valid` for new rows, own RED→GREEN |
| M-D3 | forced diff | `records_updated`=4 every unchanged run is cross-batch self-overwrite of duplicate hashes [MEASURED, INFERRED mechanism → P-M verifies]. The runner dedupes the whole set last-wins (`Map`, as address_points), so the data is identical and updated goes 4→0. **Fold SF-4 (2026-09-24): no funnel effect** — `funnel.ts:165-169`'s LOADER-`warning` branch is UNREACHABLE for massing (`FUNNEL_SOURCES` excludes it; the `massing` row's `statusSlug` is `'link_massing'`), and that is the ONLY reader of massing's counters. [MEASURED] runs 1285/1359/1400/1478 `records_total=4, new=0, updated=4`; first load 1079: new 427,077 + updated 2. The 1,107 gap (428,184 − 427,077) mixes within-batch dups AND legacy `skipped` features — P-M splits it | declared golden-diff key + `source_key_policy {unique:false, on_collision:"last_write_wins"}` + INFO `duplicate_key_count` | none (O2) |
| M-D4 | KNOWN-DEFECT | `elev_z`/`estimated_stories` are absent from the guard, so an elev-only source change is never written [READ `:294-298`] | `guard_columns` carried verbatim (the legacy 5) | **F2**: add `elev_z`,`estimated_stories`. RED fixture: elev-only change writes 0 → GREEN writes 1 |
| M-D5 | KNOWN-DEFECT | a geometry-hash key + no retraction means a changed building leaves its old row forever (still linkable by `link_massing`) [READ `:341` + class A] | **PIN**; `limitations[]` entry; orphan count measured by P-M | filed `review_followups.md` (needs FK/cascade design with `link_massing`), not in this WF |
| M-D6 | forced diff | `PIPELINE_META` reads name 4 non-existent fields (`SOURCE_ID`, `AREA_SQ_M`, `ELEV_Z`, `EST_STORIES`); writes omit `geom` [READ `:480-483`] | descriptor declares the truthful DBF reads + `geom` (Rule 1 forbids declaring fiction) → declared golden-diff key; **Fold SF-7:** regenerate `scripts/seeds/lineage-meta-snapshot.json` + `docs/reference/data-lineage-map.md` in ② | none (O2) |
| M-D7 | deviation | S7/S8 "heal any NULL row" half is dead (0 NULL) [MEASURED] | retired + declared `footprint_area_null_count` / `geom_null_count` post checks FAIL>0 | none |
| M-D8 | INCIDENTAL | 3,850 geoms differ from re-derivation by ≤1.42e-14° [MEASURED] | declared non-determinism. `insert_only` never recomputes | none |
| M-D9 | KNOWN-DEFECT (latent) | the centroid fallback averages a 3857 ring into lat/lng [READ `:65-75`, `:357-359`]; dead if every feature has LAT/LNG (P-M counts) | carried verbatim in `shapeRecord` | **F3** only if P-M count > 0 |
| M-D10 | deviation | local `data/` cache + argv[2] path retired; acquisition = CKAN every run, `cache:"none"`, `format:"shapefile_zip"` | declared (parcels/address_points precedent) | none |
| M-D11 | deviation | per-1000-batch txn → `txn_scope:"step"` (address_points Fold B3); duration + WAL measured at ② | declared | library WF only if the budget is breached |
| M-D12 | deviation | `VACUUM` trigger (S9) [READ `:429-433`] fires on the legacy backfill's dead tuples; the backfill pass is structurally gone | `execution.maintenance` + a dead-ratio var (`building_footprints_dead_tuple_ratio_warn_max`) | none |
| M-D13 | INCIDENTAL | ~428K sequence values burned per run (seq at 2,564,362) [MEASURED] | not asserted (same in converted) | none |

**Closing line.** **F1 (M-D2), F2 (M-D4), F3 (M-D9, only if P-M counts > 0) are separate
post-conversion commits, each RED→GREEN.**

---

## 6. PH-6 — Literal ledger (Rule 3, zero literals; registered name per literal)

> Plan §6, transcribed **row-for-row**: every literal `[READ]` in the 489 lines, its disposition, and
> the registered name it becomes. Adjudications are the orchestrator's (plan §6, Folds SF-1/SF-6),
> never re-decided here. Every constant below is either a descriptor field, a **logic variable**
> (registered in `scripts/seeds/logic_variables.json`), a **storage-format constant** in
> `notes.json` (parcels D3 precedent), or `knowingly-retired`.

| Literal [READ `scripts/load-massing.js`] | Disposition |
|---|---|
| `ZIP_URL` `:36` | `inputs.reads.externals[].url` (descriptor data) + `license` + `format:"shapefile_zip"` |
| `>= 400000` `:448` | `checks[features_read_floor].limit_from_config: sources_building_footprints_floor` (SHARED with `assert_data_bounds`; value 400000 `[MEASURED]`); **WARN** as legacy |
| `5` (% skip) `:453` | `massing_skip_rate_max_pct` (**5**, `on_invalid:fail`, verdict-affecting) |
| `1` (% batch err) `:455` | `massing_batch_error_rate_max_pct` (**1**, fail); reachability under step-txn → **VERIFY-INT-5** (address_points precedent) |
| `STORY_HEIGHT_M = 3.0` `:27` | `massing_story_height_m` (**3.0**, fail, write-affecting; R-AW existing value). **Distinct from Spec 65's `storey_height_m`** (bylaw envelope, a different quantity) ⇒ **never shared** |
| `ADVISORY_LOCK_ID = 56` `:131` | descriptor lock (Spec 47 §A.5 row 56) — `identity.lock:56` |
| `pipeline.BATCH_SIZE` `:375` | `execution.batch` |
| *(none* — the legacy download had **NO** timeout) | `massing_download_timeout_ms` via `network.timeout_from_config` (**default set at ② from P-M**, ≥ 5× the measured download); `retries:0` **as legacy** |
| `10*1024*1024`, `50000`, `480000` `:117`, `:385-386` | **retired**: the progress cadence is dead under the whole-array seam (address_points commit-9 deviation precedent) |
| `'hash_'`, `12` `:341` | **Fold SF-1 (2026-09-24):** storage-format constants in `compute/load-massing.js coerceKey`, named in `notes.json` with why (a change re-keys 427,077 rows; parcels D3 precedent, same as the rounding row below). **Format, not tunable** |
| `10.7639104167`, 2-dp area scale `:411` | unit constant in `write.js` (0u) + descriptor `scale:2`; `notes.json` names it (parcels D3 precedent) |
| `*100/100`, `*1e7/1e7` rounding `:365-372` | storage-format constants inside `shapeRecord`, each named in `notes.json` with why (changing one rewrites every row, so an admin knob would be a false affordance; parcels D3 precedent) |
| `SQM_TO_SQFT = 10.7639` `:26`, `111320` `:51` | **dead code, retired** (`knowingly-retired` Intent Ledger rows — §3.0b row 25) |
| *(new)* dead-ratio / maintenance timeout | `building_footprints_dead_tuple_ratio_warn_max`, `building_footprints_maintenance_timeout_minutes` — **EP-D17 naming convention** `[READ scripts/lib/step/plausibility.js:432-472]`, where `runMaintenance` derives `cfgKey = `${table}_dead_tuple_ratio_warn_max`` and `timeoutCfgKey = `${table}_maintenance_timeout_minutes`` |

**Registered-variable variables (name · default · `on_invalid` · affects):** `sources_building_footprints_floor`
· **400000** · (WARN, SHARED with `assert_data_bounds`; **legacy** WARN-not-FAIL) · verdict-adjacent ·
`massing_skip_rate_max_pct` · **5** · **fail** · verdict · `massing_batch_error_rate_max_pct` · **1** ·
**fail** · verdict (reachability **VERIFY-INT-5**) · `massing_story_height_m` · **3.0** · **fail** ·
**write-affecting** · `massing_download_timeout_ms` · **default at ② from P-M** (≥ 5× measured) · fail ·
acquisition · `building_footprints_dead_tuple_ratio_warn_max` + `building_footprints_maintenance_timeout_minutes`
· (EP-D17 names) · maintenance trigger.

**Storage-format constants — NOT tunables** (parcels D3 precedent; named in `notes.json` at ②):
`'hash_'`, `12` (Fold SF-1), `*100/100`, `*1e7/1e7`, `10.7639104167` (unit constant in `write.js`, 0u).
**Retired literals:** `SQM_TO_SQFT`, `111320`, `10*1024*1024`, `50000`, `480000`.

**Seed state [MEASURED 2026-09-24, grep `scripts/seeds/logic_variables.json`]:** of the variables above,
**only `sources_building_footprints_floor` is seeded today** (line 5090; `default: 400000`,
`admin.group:"Sources Catastrophic-Load Floors"`) — the `massing_*` names and the two EP-D17
`building_footprints_*` names return **0 hits**. ⇒ the others need **seed rows + a CLOUD seed at ③**
(**LM-D15: a missing row = throw**). Each new var gets a `scripts/seeds/logic_variables.json` row +
`admin.group` (generated GROUPS via `generate-logic-variable-groups.mjs`), is applied with
`scripts/seeds/apply-logic-variables.js` locally, and carries a CLOUD seed item in the ③ checklist.

---

## 7. Non-determinism inventory (before the first golden)

> Plan §7 + Fold SF-5. Everything that could make a golden flaky, and the exact declarative
> projection the goldens use. The golden projection is **MANDATORY** because the table exceeds the
> capture ceiling.

**Excluded sources (never compared):**

- `id` — **serial**, excluded. The sequence burns ~**428K** values per run (**M-D13**); the value is
  never asserted.
- `created_at` — **`db_default`** (never written; §1.2), excluded.
- **M-D8 geom float drift** — 3,850 rows differ from a fresh legacy re-derivation by **≤ 1.42e-14°**
  `[MEASURED]`. `geom` is **`insert_only`** ⇒ **never recomputed**.
- **area drift** — 361 rows (`footprint_area_sqm`) / 3,868 rows (`footprint_area_sqft`) `[MEASURED]`.
  Also **`insert_only`** ⇒ **never recomputed** (SF-3).
- `pipeline_runs` ids/timestamps, `sys_*` rows, `duration_ms` — excluded.

**Golden projection (explicit, MANDATORY).** 427,077 rows exceed the **100,000**
`--table-row-ceiling` `[READ scripts/analysis/capture-step-golden.js:218]` and would otherwise be
recorded **unhashed** as `{row_count, skipped_reason:'over_ceiling'}` (`[READ :360-369]`). The
explicit projection (bypasses the ceiling) is:

`building_footprints:source_id,geometry,footprint_area_sqm,footprint_area_sqft,max_height_m,min_height_m,elev_z,estimated_stories,centroid_lat,centroid_lng,geom`
**ordered by `source_id`.**

**PRE and POST must read the same CKAN bytes** — zip sha256 `96170897…6285`
`[MEASURED]` (report §1.6).

**Forced-change cohort (Fold SF-5, R-AS):**

- **D = 500** unreferenced rows that are **drift-free** — `geom` bytes and both areas equal a fresh
  legacy re-derivation (the 13 geom / 10 sqft / 1 sqm drift rows excluded), so a re-insert returns
  the table hash to BASELINE exactly.
- **U = 200** rows `max_height_m += 1` (also forces `estimated_stories`).
- **E = 50** rows `elev_z += 1` only (**M-D4 witness** — legacy cannot restore these; restored from
  the before-image).
- **Negative control** = the **17 invalid-geom rows**, untouched.
- **UNCONDITIONAL restore bracket** around the whole cohort (apply → run → compare → restore).

**Declared golden-diff keys (set at ②):** **M-D3** `records_updated` **4 → 0**; **M-D6**
`pipeline_meta`; **additive audit rows** (invariant, null checks, maintenance, `sys_*`) — all
additive, none reductive.

---

## 8. Commit plan

> Plan §7, transcribed. Compressed form **①②③** + the three library prerequisites + the
> post-conversion fixes. **Provider per commit:** the **engine (deepseek)** writes mechanical briefs;
> **claude** owns goldens, forced-change proofs, `registry_reserved` files and every
> **orchestrator-lands** commit. Every commit updates its spec text in the SAME commit.

| Commit | Scope | Provider | Lands |
|---|---|---|---|
| **P-M probe** | `scripts/analysis/probe-shapefile-acquire.mjs` (read-only; heap + sha256 + dup groups + M-D9/M-D5 counts); refresh `data/3d-massing-wgs84/` to the current CKAN zip | engine brief → orchestrator runs | — (gate) |
| **0s** | `coerceKey(raw,{geojson})`, `acquire.js` only, **no schema byte** | deepseek brief | **orchestrator-lands** |
| **0t** | `geometry_repair: "make_valid"\|"none"`, **RE-FREEZE #23** | deepseek brief | **orchestrator-lands** |
| **0u** | `derived_from_geometry {measure,unit,scale}`, **RE-FREEZE #24** | deepseek brief | **orchestrator-lands** |
| **①** | this report (§1–§8) + `src/tests/steps/massing/violations.test.ts` + fixtures + `converted.json.pending` (**claude**, reserved) + PRE goldens (claude) + PRE forced-change cohort (claude, KFM 9) | deepseek ×3 briefs + claude | **UNCOMMITTED here** — orchestrator-lands (① is orchestrator-lands) |
| **②** | descriptor parts 1–2 + `compute/load-massing.js` + `notes.json` + frozen shell + seeds rows + in-place test re-points (incl. `pipeline-sdk.logic.test.ts:1292-1296` re-home onto the generated `upsert_sql`, Fold SF-7); POST goldens + forced-change proof (zero-diff) | deepseek ×5 briefs + Sonnet finisher + claude | **orchestrator-lands** |
| **③** | cutover: `converted.json` (register + delete `pending`, same commit) + census + `manifest.json` + `template-freeze --refresh` + spec diffs + fleet-list sync (R-AN) + CLOUD seed prerequisite line | **claude** | **orchestrator-lands** |
| **F2** | M-D4 guard widening (`elev_z`,`estimated_stories`); RED lock from ① flips GREEN | **claude** | **orchestrator-lands** |
| **F1 · F3** | only on an operator ask / if P-M shows missing LAT/LNG | **claude** | **orchestrator-lands** |

**Exit gates — every landing:** `npm run step:validate -- --all` green ·
`step-conformance.infra.test.ts` green · `npm run typecheck && npm run lint` · pre-push `npm run test`
(1 fork) · plus `npm run test:db` for 0u's DB lock.

**Compliance gate (operator condition, blocks code at each stage):** before any 0s/0t/0u code, an
Op-Model Compliance seat (Claude) verifies #23/#24 carry `x-ruling {rungs_tried, why}`, a
`schema-baseline.json` entry, a Spec 122 RE-FREEZE log entry, byte-identical defaults for every
converted INGESTOR, no per-step compute-authored SQL, zero unregistered literals (Rule 3), and a
row-derived verdict (Rule 10) — **plan "Compliance gate"**. A FAIL stops the prerequisite. The same
seat re-runs **before ②** and **before ③**.

**RED evidence (gate K / G7):** `docs/reports/red-evidence/massing/pre2-artifacts-missing.json` — the ② suite (as landed in commit ②) run in a throwaway worktree pinned at ① (e4120879; descriptor, compute, notes and frozen shell absent; its own npm ci, worktree removed afterwards): 44 assertions failed and 6 passed (the five legacy SQL-text pins + the report marker, green-by-construction at ①), first failure "MISSING ARTIFACT scripts/load-massing.descriptor.json", e.g. `the notes file exists and is a REAL notes document` — genuine assertion failures, not an import crash.

---

## 9. Commit ② — POST goldens, forced-change proof, compare (2026-09-28)

- **Capture last:** `step-validate --step=massing --fast` five-word PASS on every non-capture-derived word before each POST capture (gate C/D/G are capture-derived); red evidence (gate K) above.
- **Steady state (post/sources.json, post/standalone.json, `--invariants` = the ① file):** `building_footprints` 427,077 rows, table `content_hash` 18d7bf97 — **byte-identical to PRE** on both chains; all seven invariants identical (geom_types POLYGON=426,857 / MULTIPOLYGON=220 — the 0t follow-on keeps Polygons unwrapped). Two-run zero-writes proof PASS (run 2 rewrote 0 rows). Row conservation: 428,184 read = 1,107 duplicate + 0 + 0 + 427,077 unchanged.
- **Forced change (R-AS, KFM 9):** the ① cohort was re-derived because 3 of its 500 D rows had been linked by link_massing on 2026-09-26 (FK, no cascade); 497/500 D and all U/E/negative-control rows are unchanged. Legacy (the ① file, run as a temporary oracle copy) and converted runs over the same perturbation both end at table hash **1d2f3c68** — new-row geom, area and heights byte-equal. Counters: legacy 500 new / 204 updated (U 200 + the M-D3 4); converted 500 / 200. E rows stay +1 under both (M-D4 witness). Restore returned the baseline every time. The guarded capture `post/sources.forced.json` carries the non-zero proof (gate G #38) with its own rerun PASS.
- **Compare:** every diff key on both pairs is explained in `docs/reports/golden/massing/explained-diffs.json` (records_meta layout into `massing_load`, M-D3/M-D6, runner meta keys, audit-row shape, stdout, standalone ledger row).
- **Runtime:** 366.8 s converted vs 96.8 s legacy (M-D11 step transaction + validator), within the declared 10m budget; filed with the `duration_ms` = 0 finding in review_followups.

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low-confidence | Resolution path |
|---|---|---|
| ~~**Whole-array heap**~~ **RESOLVED** | plan §2 estimate **0.8–1.2 GB `heapUsed`**, NOT measured | **P-M MEASURED** (§1.7, 2026-09-24): peak `heapUsed` 678.73 MB / `rss` 875.27 MB vs the 4,288 MB limit — no breach; ② proceeds with no streaming prerequisite |
| ~~**M-D3 mechanism**~~ **RESOLVED** | the `records_updated`=4 → 0 causal story was **INFERRED** until P-M split the **1,107** gap | **P-M MEASURED** (§1.7): `duplicate_key_extra_rows` **1,107** exactly (== 428,184 − 427,077), `duplicate_key_group_count` 961, of which only 28 groups carry attribute drift — confirms cross-batch self-overwrite of duplicate geometry-hash keys is the mechanism |
| **`retries:0` inert vs executed** | `network.retries` has zero library readers until centreline 0q lands (**SF-0**); if massing ② lands first the declaration is **inert** (R-X/R-AX class) and owes a posture-disposition row | land after centreline 0q, or carry the row |
| **`batch_error_rate` reachability** | under the step-txn (`txn_scope:"step"`) a batch error may be structurally unreachable ⇒ `massing_batch_error_rate_max_pct` could be a dead FAIL | **VERIFY-INT-5** (address_points precedent) |
| **step-txn duration / WAL at 427K rows** | one transaction for ~428K rows may blow the duration/WAL budget | **M-D11** — measured at ②; library WF only if breached |

### RECURRING / STANDARD-SHAPING table

| Pattern | Shape it sets |
|---|---|
| **0s — geometry-derived key via the compute seam** | a second `coerceKey` argument (`{geojson}`) with **no schema byte** — the template for any no-id source needed by a future INGESTOR |
| **0t — `geometry_repair:"none"`** | the first consumer; makes the default `make_valid` arm **explicitly opt-out-able** for legacy parity. **`parcels` P-D6 inherits it** (its legacy geom is also unrepaired) — flagged to VERIFY before parcels ③ |
| **0u — derived geodesic area** | `derived_from_geometry` generalizes a DB-side derived measure to the descriptor; the pattern for any "the DB computes this, JS cannot match it byte-for-byte" column |
| **Cross-owner cascades have no executor (S2)** | `outputs.cascades` is declarative-only (no `scripts/lib/step` executor) ⇒ cross-owner DELETE is either a named library prerequisite or a measured-dead `knowingly-retired`. This is the **generic** finding, not massing-specific |
