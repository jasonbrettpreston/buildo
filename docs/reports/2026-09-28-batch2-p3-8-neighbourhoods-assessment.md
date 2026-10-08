# Batch 2 Phase 3 row 3.8 — `neighbourhoods` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: PH-0 boundary frozen · §2 behaviour ledger transcribed · §8 non-determinism · §9 PRE goldens
> CAPTURED (§9.1)** — this file is the report half of commit ① (`feat(57_source_neighbourhoods): batch2
> row 3.8 ① — assessment + red suite + PRE goldens`). **NOT converted.** The red suite
> (`src/tests/steps/neighbourhoods/violations.test.ts`) is ①'s other half; the PRE goldens
> (`pre/sources.json`, `pre/standalone.json`) and the forced-change cohort (`forced/cohort.json`,
> `forced/pre.json`) are **captured by the orchestrator 2026-09-28 — values in §9.1**. **INGESTOR has 5
> converted members** — `load_ravines`, `address_points`, `parcels`, `load_centreline`, `massing` [READ
> `scripts/steps/_schema/converted.json`; plan §0] — plus this row's own down-step `link_neighbourhoods` is
> already converted (`converted.json` carries `link-neighbourhoods.js` and `pending[]` now carries this step
> at `stage:"red_suite"` [MEASURED, plan §1(b)]). Five converted INGESTOR members + the R-AH default make **compressed the
> DEFAULT form** [READ plan §0; Spec 124 §5 R-AH] — no reason for the full form applies, so the literal
> marker line above is present and the full nine-commit form's marker is deliberately absent.

**Target slug:** `neighbourhoods` · **Script:** `scripts/load-neighbourhoods.js` — **719 lines**
[MEASURED 2026-09-28 `wc -l` = 719]; the plan's §1 table says
"719 L" and **AGREES** (no tree-wins / off-by-one clause in play) · **Chain:** `sources`, position **17**
[READ `scripts/manifest.json` `chains.sources`; plan §1(b) `:106` sources chain pos 17] · **Lock:** `57` —
`ADVISORY_LOCK_ID = 57` [READ `scripts/load-neighbourhoods.js` `` `const ADVISORY_LOCK_ID = 57` ``;
Spec 47 §A.5 row 57, [READ `47:1923` via plan §1(b)]; the lock-registry test names it
[`pipeline-advisory-lock.infra.test.ts:31`, plan §1(b)]].

**Manifest entry** [READ `scripts/manifest.json:25`, transcribed from plan §1(b)]: `neighbourhoods
{supports_full:false, supports_dry_run:false, telemetry_tables:[neighbourhoods], telemetry_null_cols:
{neighbourhoods:[geometry]}}`. **`supports_full:false` + `supports_dry_run:false`** — the chain provides
neither `--full` nor `--dry-run` for this step. Also `manifest.json:29` `link_neighbourhoods` and `:80`
permits chain names `link_neighbourhoods` [plan §1(b)]; `manifest.json:106` is the `sources` chain position
17 above.

**Owner specs — the system-map rows naming `load-neighbourhoods.js` [plan §1(a), MEASURED 2026-09-25]:** row
**57** Target = `load-neighbourhoods.js`, `lead-detail-query.ts`, `lead-inspect-query.ts`,
`permits/[id]/route.ts` [READ map:57; 57:66-70] — the loader is the PRIMARY owner; the two lead queries and
the permits route are app readers [plan §1(c)]. Row **43** Target lists `load-neighbourhoods.js` +
`link-neighbourhoods.js` [READ map:43]; Spec 43 §5 Target: "step 17 `neighbourhoods`" [READ 43:287]. Spec 43
is ALSO the chain owner; the loader is its step at position 17. Other rows referencing the script are the
down-step / archive (`link-neighbourhoods.js` at rows 41, 60 and archive 27 [plan §1(a)]); cross-Spec
classifications in 41:293, 42:177, 65:333, 83:392, 84:2001 and the exempt readers 30/40/47/122/122a
[plan §1(a)] — **R-AF satisfied today**, re-checked at ③.

**Governing plans of record (every adjudication transcribed below is the ORCHESTRATOR'S, not re-decided
here):** `.cursor/batch2_p3_8_neighbourhoods_active_task.md` (Status: Implementation, AUTHORIZED 2026-09-25
conditional on Spec 122 + 124 compliance) and its library-prerequisite plan
`.cursor/wf2_ingest_prereqs_0v_0w_active_task.md`. Each is cited below as **"plan §N"**; the plan hardener
folds are cited **"Fold CF-n"** / **"Fold H-n"** and the precedent report
`docs/reports/2026-09-24-batch2-p3-6-massing-assessment.md` as **"massing §N"**.

**Measurement environment:** every `[READ …]` below was re-derived from THIS worktree. `[MEASURED 2026-09-25]`
values are transcribed from the plan (cited "plan §2", "plan Fold CF-n") where the probe needed live-CKAN
bytes or live-DB SELECTs (the plan used read-only SELECTs only, plan header "DB discipline"); **never
re-invented here**. Plan facts are cited `[MEASURED 2026-09-25, plan §2]` and transcribed.

**Spec 121 §4.3 governs method** (refactor/behaviour split): this conversion is zero-behaviour-change; every
carried defect is pinned by an `N-D<n>` id (plan §2) and every fix is a separate F-commit (④ F1, ④ F2).

---

## 1. PH-0 — BOUNDARY FREEZE (G0)
<!-- ANCHOR:§1 -->

> Derived by READING `scripts/load-neighbourhoods.js` end to end (719 lines), not from the manifest, the
> specs or any prior report. Spec 122 R5: the write class is re-derived from the code here. Two sources
> (GeoJSON boundaries + XLSX census profiles) converge on ONE target table.

**Risk class (Spec 123 §2.1).** A semi-annual/quarterly re-load writes **158** rows that
`link_neighbourhoods` reads for the `neighbourhoods→link_neighbourhoods` seam, that `enrich_parcels` reads
for parcel fields, and that **three FK-referenced norms/permit tables** depend on [plan §2 "Table facts"
MEASURED].

| Field | Value | Why |
|---|---|---|
| risk class | **A** (lowest) | ONE guarded `INSERT … ON CONFLICT DO UPDATE`; **NO DELETE anywhere in the step** (class C REJECTED, §1.1) ⇒ a crash can never subtract rows. |
| chance | **low** | 158 existing rows from two CKAN files, one step txn (legacy: 3 txn shapes, §1.1); source unchanged between runs [MEASURED]. |
| impact | **high** | `neighbourhoods` feeds `link_neighbourhoods` (→ the `neighbourhoods→link_neighbourhoods` seam) AND `enrich_parcels`/`compute-cost-estimates`/`assert_data_bounds`/`assert_schema` AND three app routes [plan §1(c)]. A derived-wrong write is visible in parcel- and lead-level product fields. |
| class · chance × impact | **A = low × high** | PIN-not-fix is available for every carried defect (plan §2 `N-D<n>` ids); the merged-upsert and txn-scope widenings (§1.1) are declared deviations. |

### 1.1 Write class — **class A `guarded_upsert`, `retract:"none"`**

- **Legacy statement 1 — the boundary upsert** [READ `scripts/load-neighbourhoods.js`
  `` `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)` ``]: 3 columns inserted, built from
  three `unnest()` arrays `` `unnest($1::int[])` `` / `` `unnest($2::text[])` `` / `` `unnest($3::jsonb[])` ``.
  The `SET` list is `` `name = EXCLUDED.name,` `` + `` `geometry = EXCLUDED.geometry` `` with `geom` appended
  only when PostGIS is present (`` `, geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` ``)
  [READ same].
- **The guard** [READ same statement] is `WHERE` + `` `neighbourhoods.name IS DISTINCT FROM EXCLUDED.name` ``
  **OR** `` `neighbourhoods.geometry IS DISTINCT FROM EXCLUDED.geometry` `` — so a fully unchanged row is
  **not** written (this is the legacy's only guard). Converted: `guard_columns = [name, geometry, …census]`
  (legacy guard + the always-write census, now guarded — **N-D2**) [plan §4].
- **Legacy statements 2–9 — the 8 census UPDATEs** [READ `loadProfiles`]: 3 income UPDATEs
  (`` `UPDATE neighbourhoods AS n SET ${dbCol} = v.val` ``), 1 low-income (`` `SET low_income_pct = v.val` ``),
  1 tenure (`` `tenure_owner_pct = v.owner_pct,` ``), 1 dominant-period (`` `SET period_of_construction = v.period` ``),
  1 family (`` `couples_pct = v.couples_pct,` ``), and 1 bulk txn UPDATE
  (`` `married_pct = COALESCE(v.married_pct, n.married_pct),` ``). **All keyed on `neighbourhood_id`**, all
  `WHERE n.neighbourhood_id = v.neighbourhood_id`. The first five are **unguarded, autocommit**; only the last
  is inside its own `pipeline.withTransaction` [READ, plan §2 B7/B9].
- **Converted: ONE upsert for all 17 written columns** — census cols merge into the SAME statement with
  `written:"step"` + `on_empty:"preserve_null"` (RE-FREEZE #19 follow-on: `COALESCE(EXCLUDED.c, t.c)` + guard
  `(EXCLUDED.c IS NOT NULL AND t.c IS DISTINCT FROM EXCLUDED.c)`) = legacy "absent/null keeps stored"
  **exactly** [plan §2 B7; proven byte-identical, Fold CF-5]. This is a Rule-9 win: it replaces 6 unguarded
  writes with guarded ones and needs no `grandfathered.json` entry.
- **Class C REJECTED** [plan §2 "Table facts", plan §11]: class C retracts by DELETE, and **no DELETE may ever
  touch this table** — `permits` has `ON DELETE SET NULL` (**240,947 linked rows, all 158 ids referenced**),
  `neighbourhood_build_norms` `CASCADE` (**452**), `neighbourhood_storey_norms` no-action (**147**)
  [MEASURED 2026-09-25, plan §2]. Class C would also need a retraction path the legacy never has.
- **`retract:"none"`** for the same reason; `recovery.interrupted:"none"` + why (no retraction, single txn)
  [plan §4].
- **`txn_scope:"step"`** [plan §2 B9, **N-D8**]: the legacy is boundaries-txn + 5 autocommit + bulk txn, so a
  mid-run crash can leave a half-census state; the converted single txn makes that state unreachable
  (stronger, not weaker).

### 1.2 Columns written

**17 written columns** [plan §4, verified at ① against the 8 SET lists]:

- **Boundary trio:** `neighbourhood_id` (key, INT), `name` (value), `geometry` (**jsonb** value — the
  `link-coa-to-parcels.js` Turf contract [plan §1(c)]), plus `geom` (`bind:"wkb_geometry"`,
  `geometry_kind:"polygon"`, `geometry_repair:"none"` — 0t; legacy never repairs, plan §2 B4).
- **The 14 census columns** `written:"step"` + `on_empty:"preserve_null"` [plan §4]: `avg_household_income,
  median_household_income, avg_individual_income, low_income_pct, tenure_owner_pct, tenure_renter_pct,
  period_of_construction, couples_pct, lone_parent_pct, married_pct, university_degree_pct, immigrant_pct,
  visible_minority_pct, english_knowledge_pct` — exactly the columns `emitMeta` names as written [READ
  `` `"avg_household_income", "median_household_income", "avg_individual_income"` `` in the `emitMeta` write
  list].
- **`db_default` — never written:** `id` (serial), `created_at`, `census_year` (db_default `2021`,
  [MEASURED plan §2]) [plan §4].
- **`top_mother_tongue` is NEVER written** — undeclared (INCIDENTAL, not `db_default`, because the column
  exists and is `0/158` non-null) [plan §4; MEASURED plan §2].
- **`N-D1` (knowingly-retired):** the legacy `INSERT` **omits `geom`** (it appears only in the `SET` list),
  so a NEW row gets `geom` NULL — standard codegen would write it. Adjudicated ALLOWED (Fold CF-4,
  2026-09-25) because no descriptor value can pin an insert-only `geom`; made **visible** by the declared
  `boundary_rows_inserted` WARN `viol == 0` over `written.inserted` [plan §6 ②, plan §13 CF-4].

### 1.3 Audit rows / verdict / `records_meta`

- **`auditRows` — exactly 3 rows** [READ `` `{ metric: 'boundaries_loaded', value: boundaryCount, threshold: '>= 158'` ``]:
  1. `boundaries_loaded` — `threshold: '>= 158'`, status `` `boundaryCount >= 158 ? 'PASS' : 'FAIL'` ``;
  2. `census_rows_matched` — `threshold: null`, `status: 'INFO'`;
  3. `has_postgis` — `threshold: null`, `status: 'INFO'` (value `` `hasPostGIS ? 'yes' : 'no'` ``).
  Only row 1 is verdict-capable (FAIL); rows 2–3 are pure INFO.
- **Verdict — Rule 10 VIOLATION** [READ `` `const hasFails = boundaryCount < 158` `` and
  `` `verdict: hasFails ? 'FAIL' : 'PASS',` ``]: `hasFails` is a **parallel boolean** re-deriving the row's own
  threshold instead of folding row statuses ⇒ **N-D11**; the converted runner derives the verdict row-by-row
  (the `parcels`/`address_points` shape) [plan §2 B12].
- **`records_meta` producer keys today** [READ `pipeline.emitSummary`]: `duration_ms`,
  `boundaries_loaded` (`= boundaryCount`), `census_rows_matched` (`= profileUpdates`), `has_postgis` (bool),
  and `audit_table { phase: 9, name: 'Neighbourhood Boundaries', verdict: hasFails ? 'FAIL' : 'PASS',
  rows: auditRows }` [READ `` `phase: 9,` `` + `` `name: 'Neighbourhood Boundaries',` ``]. Legacy row shape
  confirmed live: keys `audit_table, boundaries_loaded, census_rows_matched, duration_ms, has_postgis,
  pipeline_meta, telemetry`; audit phase `9`; 3 audit rows; the `sys_*` rows are injected by
  `pipeline.js:412` [MEASURED plan §14 Fold H-1, runs 1480/1402/1361].
- **Converted:** `emits[]` declares `audit_table` object, `boundaries_loaded` int, `census_rows_matched` int,
  `duration_ms` int, `consumers: []` each (the `link_neighbourhoods` top-level-int form) so the legacy keys
  survive **by name**; `has_postgis` is retired (**N-D4**); the floor check keeps the legacy metric name
  **`boundaries_loaded`** (not `rows_loaded_floor`); `pipeline_meta` becomes `deriveMeta` (**N-D12**)
  [plan §14 Fold H-1 (A)].
- **`phase: 9` + `name` survive via `identity.display_name:"Neighbourhood Boundaries"` +
  `sharing.varies_by_chain.phase {sources: 9}`** — "all none" would emit phase 0 where legacy emits 9
  [READ `verdict.js:52-61`; MEASURED runs 1361/1402/1480] [plan §4 Fold H-1].

### 1.4 Source facts

`[MEASURED 2026-09-25, plan §2 "Source facts"]` (transcribed, never re-invented):

- **GeoJSON** **2,141,269 B**, sha256 `b0cb5807…0233`, **158 features**, all `MultiPolygon`, **CRS84**; props
  `AREA_SHORT_CODE` (string) on **158/158**, **`AREA_S_CD` ABSENT**, `AREA_ID` = 7-digit ids (e.g. 2502366).
- **XLSX** **1,763,175 B**, sha256 `9a3c3729…45eb`, sheet[0] `hd2021_census_profile`, **2604×159**, row 2 =
  "Neighbourhood Number" (format 2; format-1 `Name (ID)` headers: **0**), **158 id columns**.
- **Local `data/` cache is byte-identical to live CKAN** (curl, both files).
- **GeoJSON ids ≡ XLSX ids ≡ DB ids (158/158, 0 either side).**
- **Table facts:** 158 rows; `created_at` all **2026-02-20**; `geom geometry(Geometry,4326)` 158 MultiPolygon,
  **0 invalid**; stored `name`/`geometry`/`geom` equal a fresh derivation from the file on **158/158 (0
  drift)**; `geometry_validation_sql` output WKB equals stored `geom` **158/158** under BOTH `make_valid` and
  `none`; census cols 158/158 non-null; `top_mother_tongue` **0/158**; `census_year` db_default 2021; **no
  `updated_at`**; RLS on, 0 policies; PostGIS **3.3.7**.
- **Run history** `[MEASURED pipeline_runs]`: **15** local runs, **0 failed**; every run since 2026-06-10
  (1081…1480) = `records_total 158, new 0, updated 158`, telemetry `pg_stats.upd = 1264` (**158×8**) on an
  **UNCHANGED source**. The **502** is cloud-only: chain-sources run **34769829628** (2026-09-13) halted at
  **17/28** on un-retried `https.get` [plan §0.8, POST-B1-8]; not in the local ledger.
- **Download naming** (externalizing the legacy cache paths, **N-D5**): the acquisition seam's download name is
  `source.geojson` for the 0v arm and the `xlsx` arm carries the census workbook [plan §3, 0v/0w].

### 1.5 Exits

- **Lock 57 held ⇒ SKIP** [READ `pipeline.withAdvisoryLock`; READ `` `if (!lockResult.acquired) return;` ``]:
  the early return happens **outside** the `withAdvisoryLock` callback, so a skipped run emits **NO
  `emitSummary`** at all — it is not a PASS, not a FAIL, just no ledger row from this step (the runner's SKIP
  terminal + LG-29 WARN) [plan §2 B15].
- **Throw ⇒ non-zero** via `pipeline.run` (the wrapper's own exit contract) [plan §2 B15].
- **`VACUUM ANALYZE neighbourhoods` every run** [READ `` `await pool.query('VACUUM ANALYZE neighbourhoods');` ``]:
  unconditional, after both load phases and before the telemetry snapshot (the in-file comment names ~1,264
  dead tuples ≈ 70 %+ dead ratio on a 158-row table). Converted:
  `execution.maintenance [{vacuum_analyze, neighbourhoods, self}]` gated on
  `neighbourhoods_dead_tuple_ratio_warn_max` (**N-D9**, M-D12 precedent) [plan §2 B10].
- **No `on_head_error` today** — the legacy issues a bare GET with no HEAD [READ `` `get(url, (response) => {` ``];
  the converted `acquireExternal` HEADs every url'd external, so ② declares `on_head_error:"warn_row"` on BOTH
  externals (**N-D19**, Fold H-5) to avoid failing a run legacy would have completed.

---

## 2. Behaviour ledger (plan §2)
<!-- ANCHOR:§2 -->

> Transcribed from plan §2 (`| # | Behaviour [READ line] | Disposition |`), **N-D ids kept exactly**. The
> plan's `[READ :line-line]` citations are **converted to greppable substrings** of the script (never a bare
> line number); every disposition sentence is the plan's, transcribed.

| # | Behaviour | Anchor (greppable) | Disposition |
|---|---|---|---|
| B1 | Acquisition: two URLs, `data/` existsSync cache + `argv[2]/[3]`, raw `https.get`, no timeout, no retry, redirects followed | `` `const BOUNDARIES_URL =` `` · `` `const PROFILES_URL =` `` · `` `const get = url.startsWith('https') ? https.get : http.get;` `` · `` `if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location)` `` · `` `let boundariesPath = process.argv[2];` `` | externals ×2 (`url`,`license`,`format`,`cache:"none"`); timeout via `timeout_from_config`; `retries:0` as legacy → **N-D5** (cache retired, M-D10 precedent), **N-D16** (502/no-retry → ④ F1) |
| B2 | Key `safeParsePositiveInt(AREA_S_CD‖AREA_SHORT_CODE‖AREA_ID‖'0')`; 0 → skip; non-numeric → THROW (halts) | `` `props.AREA_S_CD \|\| props.AREA_SHORT_CODE \|\| props.AREA_ID \|\| '0'` `` · `` `function parseColumnHeader(header) {` `` | `key_property:"AREA_SHORT_CODE"`, `key_sql_type:"INT"`; compute `coerceKey` = legacy parse (0/empty → null=bad_key, non-numeric throws). **N-D6** (dead `AREA_S_CD` arm; `AREA_ID` arm would key 158 garbage rows → knowingly-retired, `bad_key_count` FAIL>0 check). `String()` normalizer symmetric |
| B3 | Name `AREA_NAME‖AREA_LONG_CODE`; missing → skip | `` `const name = props.AREA_NAME \|\| props.AREA_LONG_CODE \|\| '';` `` · `` `Skipping feature with missing ID or name` `` | `shapeRecord` carries the fallback verbatim; missing → skip reason `missing_name` (0p) |
| B4 | Boundary upsert (class A): INSERT `(neighbourhood_id,name,geometry)`; SET `name, geometry, geom=ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text),4326)`; guard `name, geometry` IS DISTINCT FROM | `` `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)` `` · `` `geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` `` · `` `neighbourhoods.name IS DISTINCT FROM EXCLUDED.name` `` | `guarded_upsert`, `retract:"none"`; `geometry` jsonb value; `geom` `bind:"wkb_geometry"`, `geometry_kind:"polygon"`, `geometry_repair:"none"` (0t — legacy never repairs); **N-D1** (INSERT omits `geom` ⇒ a NEW row gets geom NULL; standard codegen writes it), **N-D13** (validator Multi-wraps/skips non-polygon; 0 exposure measured) |
| B5 | PostGIS probe; no-PostGIS path skips `geom` | `` `SELECT 1 FROM pg_extension WHERE extname = 'postgis'` `` · `` `const geomLine = hasPostGIS` `` · `` `PostGIS not installed — skipping geom column` `` | `guards.requires [{extension postgis, fail}]` (R-W) → **N-D4**; `has_postgis` INFO row retired |
| B6 | Profiles: ExcelJS sheet[0], row-1 headers, `includeEmpty`, `''` fill; format 1/2 column discovery; 0 rows / 0 columns → early return `undefined` | `` `const sheet = workbook.worksheets[0];` `` · `` `sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {` `` · `` `if (rows.length === 0) {` `` · `` `row0Char === 'Neighbourhood Number'` `` · `` `row0Char === 'Neighbourhood ID'` `` | generic sheet→rows in the **0w** seam (byte-for-byte this conversion); discovery + characteristic matching + math in `compute.buildLookup` (pure) |
| B7 | 8 census UPDATEs keyed on `neighbourhood_id`: 3 income + low-income + tenure + period + family **unguarded, autocommit**, bulk 5-pct `COALESCE(v, n.col)` in its own txn | `` `UPDATE neighbourhoods AS n SET ${dbCol} = v.val` `` · `` `SET low_income_pct = v.val` `` · `` `tenure_owner_pct = v.owner_pct,` `` · `` `SET period_of_construction = v.period` `` · `` `married_pct = COALESCE(v.married_pct, n.married_pct),` `` | merged into the SAME upsert: census cols `written:"step"`, `on_empty:"preserve_null"` (RE-FREEZE #19 follow-on: `COALESCE(EXCLUDED.c, t.c)` + guard `(EXCLUDED.c IS NOT NULL AND t.c IS DISTINCT FROM EXCLUDED.c)`) = legacy "absent/null keeps stored" exactly. **N-D2** (data-identical; 1264 tuple rewrites → 0; AP-D4/M-D3 precedent). **N-D14** (a boundary-skipped feature's census no longer updates an existing row; 0 exposure) |
| B8 | Numeric forms: income `Math.round`, pct `round(x*1000)/10`, dominant period max-count first-wins, `periodMap` | `` `incomeData[dbCol][info.neighbourhood_id] = Math.round(val);` `` · `` `Math.round((data.owner / total) * 1000) / 10` `` · `` `if (count > maxCount) { maxCount = count; dominant = period; }` `` · `` `const periodMap = {` `` | compute verbatim; constants = storage format → notes.json (parcels D3 precedent) |
| B9 | Transactions: boundaries txn; 5 autocommit UPDATEs; bulk txn | `` `await pipeline.withTransaction(pool, async (client) => {` `` · `` `// Bulk update: married, university_degree` `` | `txn_scope:"step"` → **N-D8** (atomic; partial-census state unreachable) |
| B10 | `VACUUM ANALYZE neighbourhoods` every run | `` `await pool.query('VACUUM ANALYZE neighbourhoods');` `` · `` `VACUUM immediately — full upsert + census enrichment creates ~1,264 dead tuples` `` | `execution.maintenance [{vacuum_analyze, neighbourhoods, self}]` gated on `neighbourhoods_dead_tuple_ratio_warn_max` → **N-D9** (M-D12 precedent); VERIFY-INT-3 |
| B11 | Duplicate key in the file ⇒ `ON CONFLICT … cannot affect row a second time` aborts | `` `ON CONFLICT (neighbourhood_id) DO UPDATE SET` `` | dedupe would proceed ⇒ declare `duplicate_key_count` **pre_write FAIL >0** (refusal preserved; `order_guarantee` anchored in Spec 57 at ②) → **N-D7** (0 dups measured) |
| B12 | Audit: `boundaries_loaded ≥158` FAIL; `census_rows_matched` INFO (31); `has_postgis` INFO; verdict `hasFails?` parallel boolean | `` `const hasFails = boundaryCount < 158` `` · `` `{ metric: 'census_rows_matched', value: profileUpdates, threshold: null, status: 'INFO' }` `` · `` `{ metric: 'has_postgis', value: hasPostGIS ? 'yes' : 'no', threshold: null, status: 'INFO' }` `` · `` `boundaryCount >= 158 ? 'PASS' : 'FAIL'` `` | `rows_loaded_floor` over `acquired.feature_count`, `limit_from_config: sources_neighbourhoods_floor` (3rd consumer; identical bounds; `on_invalid:fail`); `census_rows_matched` INFO carried → **N-D10** (R-H: countable, threshold 31 possible → ④ F2); verdict runner-derived → **N-D11**. **Superseded by Fold H-1:** the floor check id is `boundaries_loaded` (legacy metric name) over `acquired.rows_shaped` (post-shape, pre-dedupe = legacy `ids.length`), severity FAIL. |
| B13 | Counters `records_total=records_updated=boundaryCount (=ids.length)`, `records_new:0` | `` `records_total: boundaryCount,` `` · `` `records_new: 0,` `` · `` `records_updated: boundaryCount,` `` | counters from `written.*` → **N-D3** (fiction retired; declared golden-diff key) |
| B14 | `emitMeta` reads `"Census XLSX": ["income","tenure","demographics"]` (not fields) | `` `"Census XLSX": ["income", "tenure", "demographics"]` `` · `` `{ "neighbourhoods": ["neighbourhood_id", "name", "geometry", "geom",` `` | truthful reads/writes → **N-D12** (M-D6 precedent; regenerate `lineage-meta-snapshot.json` + `data-lineage-map.md` in ②) |
| B15 | Lock 57; lock held → SKIP; throw → non-zero via `pipeline.run` | `` `const ADVISORY_LOCK_ID = 57;` `` · `` `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {` `` · `` `if (!lockResult.acquired) return;` `` | descriptor lock 57 (Spec 47 §A.5); runner SKIP terminal (LG-29 WARN) |
| B16 | Download progress cadence `2 MiB` | `` `downloaded % (2 * 1024 * 1024) < chunk.length` `` | retired (address_points commit-9 precedent) |
| B17 | Spec 57 drift: `population` col, Turf.js, "step 9", income NUMERIC | `` `SET low_income_pct = v.val` `` · `` `"Census XLSX": ["income", "tenure", "demographics"]` `` | **N-D15** → Spec 57 as-built at ② (table: INT incomes, no population; step 17) |

**Rule 11.** Spec 57 §3 orders "boundaries (1–3) then census (4–5)"; converted writes both in ONE statement
per row inside one txn (stronger). The only `pre_write` check (B11) carries its own `order_guarantee`
[plan §2 "Rule 11", plan §13 CF-8].

**Ledger completeness note (transcribed).** Every row above maps to a declared seat or an `N-D<n>` id; the
NB ids added by the plan folds — **N-D17** (null-geometry feature: legacy fails the run, converted keeps the
refusal via a `pre_write` FAIL `null_geometry_count`), **N-D18** (census-only change also rewrites `geom`;
0 rows today; cohort arms C and Q MUST be disjoint), **N-D19** (HEAD is new network surface) — are
dispositioned in §6/§7/§10 at ② [plan §13 CF-8, CF-5, §14 Fold H-5].

---

## 3. Registry target review (closed set)
<!-- ANCHOR:§3 -->

**Closed set derived mechanically** from the slug (`neighbourhoods`) and the table (`neighbourhoods`) —
**not** from the system map: (a) §4.1 files, (b) descriptor tables + migrations, (c) consumers, (d)
`records_meta` key readers, (e) tests. Every row was READ at the cited greppable anchor in this worktree @
`004ae733`. `Touched at ①` uses the gate vocabulary {`Y`,`N`}; `Touched later` ∈ {`②`,`③`,`④`,`never`,`followup`}.
**At ① the ONLY `Y` rows are this report itself and `src/tests/steps/neighbourhoods/**`.** Findings that
are NOT in plan §1 / Fold H-3 / Fold CF-7 are flagged `NEW — not in plan sweep` (the point of the review).

### (a) §4.1 files (Spec 122 §4.1) [plan §1 layout note; §E4]

| Target | Anchor READ (greppable) | Role | Touched at ① | Touched later | Note |
|---|---|---|---|---|---|
| `scripts/load-neighbourhoods.js` | `` `const ADVISORY_LOCK_ID = 57;` `` (whole file) | THE step (frozen shell at ②) | N (READ only — the legacy oracle evaluates its text; not edited at ①) | ② | exists; 719 lines [MEASURED 2026-09-28 `wc -l`] |
| `scripts/load-neighbourhoods.descriptor.json` | ABSENT (`git grep` → no match; file does not exist) | step descriptor | N | ② | §4.1 sibling, produced at ② |
| `scripts/load-neighbourhoods.notes.json` | ABSENT (file does not exist) | publisher vocabulary / format constants | N | ② | §4.1 sibling, produced at ② |
| `scripts/lib/compute/load-neighbourhoods.js` | ABSENT (file does not exist) | compute (`coerceKey`,`shapeRecord`,`buildLookup`) | N | ② | §4.1 sibling, produced at ② |
| `src/tests/steps/neighbourhoods/violations.test.ts` + `fixtures/{legacy-harness.ts,features.json,census-sheet.json}` | READ `src/tests/steps/neighbourhoods/fixtures/legacy-harness.ts` `` `const SCRIPT_REL = 'scripts/load-neighbourhoods.js';` `` | the red suite (①'s other half) | **Y** | ② | the ONLY other `Y` row at ① |

### (b) Table `neighbourhoods` — the ONE write target, plus every migration naming it [§E4; plan §1(b)]

**Reads of the table by OTHER steps: none — the two externals (GeoJSON + XLSX) are the only sources
read.** The table is the single `outputs.writes` target; every other referent below is a reader or a DDL owner.

| Target | Anchor READ (greppable) | Role | Touched at ① | Touched later | Note |
|---|---|---|---|---|---|
| table `neighbourhoods` | `` `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)` `` | the ONE write target (17 cols) | N (READ only) | ②③ | `supports_full:false`, `supports_dry_run:false` [READ `scripts/manifest.json`] |
| `migrations/013_neighbourhoods.sql` | `` `CREATE TABLE IF NOT EXISTS neighbourhoods (` `` | CREATE TABLE (origin) + `idx_neighbourhoods_nid` | N | never | DDL owner |
| `migrations/038_quality_enhancements.sql` | `` `('neighbourhoods',       'Annual'),` `` | refresh-snapshot schedule seed | N | never | names the slug, not the table |
| `migrations/039_schema_hardening.sql` | `` `ALTER TABLE neighbourhoods ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);` `` | adds `geom` + GiST index; backfills from JSONB | N | never | the `geom` column's origin |
| `migrations/054_standardize_timestamptz.sql` | `` `ALTER TABLE neighbourhoods ALTER COLUMN created_at TYPE TIMESTAMPTZ;` `` | `created_at` type standardisation | N | never | `created_at` is `db_default` (§8) |
| `migrations/065_building_footprints_geom.sql` | `` `-- Parallel to migration 039 pattern (parcels + neighbourhoods already have geom columns).` `` | cites the 039 pattern (footprints) | N | never | comment-only referent |
| `migrations/083_postgis_drift_repair.sql` | `` `ALTER TABLE neighbourhoods ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);` `` | drift repair of the 039 work | N | never | idempotent replay of 039 |
| `migrations/109_fk_hardening.sql` | `` `REFERENCES neighbourhoods (id)` `` (`ADD CONSTRAINT fk_permits_neighbourhoods`) | `fk_permits_neighbourhoods` — `ON DELETE SET NULL` | N | never | the FK that makes class C unwritable (§1.1) |
| `migrations/195_neighbourhood_storey_norms.sql` | `` `INTEGER UNIQUE REFERENCES neighbourhoods(id),  -- NULL row = citywide fallback` `` | `neighbourhood_storey_norms` FK (no-action) | N | never | 147 rows |
| `migrations/196_parcels_neighbourhood_maxbuild.sql` | `` `COMMENT ON COLUMN parcels.neighbourhood_id IS 'Spec 65 WF3-C2: neighbourhoods.id from the parcel-centroid spatial join (the reusable link).` `` | `parcels.neighbourhood_id` link | N | never | NULL for parcels outside all polygons |
| `migrations/199_neighbourhood_build_norms.sql` | `` `INTEGER UNIQUE REFERENCES neighbourhoods(id) ON DELETE CASCADE,  -- NULL = citywide fallback` `` | `neighbourhood_build_norms` FK (`CASCADE`) | N | never | 452 rows |
| `migrations/227_rls_class_b_default_deny.sql` | `` `ALTER TABLE neighbourhoods ENABLE ROW LEVEL SECURITY;` `` | RLS enable (0 policies) | N | never | drives `guards.requires rls_bypass_or_policy` [plan §4] |

### (c) Every consumer [plan §1(c) rows 2–33 + Fold H-3 additions]

| Target | Anchor READ (greppable) | Role | Touched at ① | Touched later | Note |
|---|---|---|---|---|---|
| `scripts/link-neighbourhoods.js` (+ `.descriptor.json`, `lib/compute/link-neighbourhoods.js`) | `` `{ "table": "neighbourhoods", "columns": ["id", "neighbourhood_id", "name", "geom"] }` `` (descriptor) · `` `+ '  FROM neighbourhoods n\n'` `` (compute) | LINK — the downstream seam (`n.id` join, step pin `gte`) | N | ③ (seam goes LIVE) | plan §1(c): compute file unregistered → gap → followup (owner 60) |
| `scripts/quality/audit-fk-orphans.js` | `` `parent: 'neighbourhoods',` `` (×2) | FK-orphan audit (reads `id`) | N | never (verify-only) | Fold H-3 addition |
| `scripts/lib/compute/assert-data-bounds.js` | `` `SELECT COUNT(*) FROM neighbourhoods` `` | ASSERT — floor + duplicate `neighbourhood_id` | N | never | plan §1(c): the compute file is unregistered → followup |
| `scripts/quality/assert-data-bounds.descriptor.json` | `` `"limit_from_config": "sources_neighbourhoods_floor"` `` · `` `"table": "neighbourhoods",` `` | ASSERT descriptor (liveness; check id `neighbourhoods_count`) | N | never (verify-only) | Fold H-3 addition (path: `scripts/quality/`) |
| `scripts/quality/assert-schema.descriptor.json` + `lib/compute/assert-schema.js` | `` `{ "id": "neighbourhoods_geojson", "kind": "http_file", "cache": "none" }` `` (descriptor externals; the script path itself is not named — the sync lock lives in `quality.logic.test.ts`, group (e)) | ASSERT — the SAME GeoJSON URL (2nd literal home) + `NEIGHBOURHOOD_ID_PROPS` | N | never | **NB-X1**: accepts `AREA_ID` (retired key) → narrow in an assert_schema WF3; URL duplicated (Rule 1) → followup. (Fold H-3's `:456` line number drifted; the referent is the `neighbourhoods_geojson` external — anchor, not number) |
| `scripts/quality/assert-global-coverage.descriptor.json` + `lib/assert-global-coverage-fields.js` | `` `"table": "neighbourhoods",` `` (coverage vocab `neighbourhoods.id`) | coverage vocabulary | N | never (verify-only) | Fold H-3 addition (path: `scripts/quality/`) |
| `scripts/lib/compute/enrich-parcels.js` + `enrich-parcels.descriptor.json` | `` `{ "table": "neighbourhoods" }` `` (descriptor) · `` `FROM neighbourhoods n` `` (compute) | ENRICHER — reads `n.id, avg_household_income, geom, name` | N | never | plan §1(c): compute unregistered (estate-wide gap) |
| `scripts/compute-cost-estimates.js` | `` `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` | reads income/tenure | N | never | **NB-X2** (theirs): meta lists `neighbourhood_id` but reads `id` → followup |
| `scripts/compute-coa-cost-estimates.js` | `` `LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id` `` | reads same 2 cols | N | never | none |
| `scripts/link-coa-to-parcels.js` | `` `'SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL'` `` | reads `geometry` **JSONB via Turf** | N | never | jsonb `geometry` is a CONTRACT ⇒ must stay jsonb-equal (§4 zero-diff) |
| `scripts/backfill/seed-pipeline-runs.js` | `` `FROM neighbourhoods` `` | seeds a ledger row from `MAX(created_at)` | N | followup | **UNREGISTERED** → gap → followup [plan §1(c)] |
| `scripts/analysis/wf2-priceable-none-taxonomy.js` | `` `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` | analysis reads income/tenure | N | followup | **UNREGISTERED** → gap → followup [plan §1(c)] |
| `scripts/compute-storey-norms.js` / `compute-build-norms.js` | `` `to neighbourhood_storey_norms (truncate-replace snapshot)` `` · `` `CHAIN: permits chain, after classify_permits / link_neighbourhoods / link_parcels` `` (write the norms tables, FK→`neighbourhoods.id` per migrations 195/199; no SQL text names `neighbourhoods` itself) | norms writers | N | never | plan §1(c): FK facts §2 |
| `src/lib/leads/lead-detail-query.ts` | `` `LEFT JOIN neighbourhoods n` `` | app read by `n.id` | N | never | system-map row 57 Target |
| `src/lib/leads/lead-inspect-query.ts` | `` `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` | app read | N | never | row 57 Target |
| `src/app/api/permits/[id]/route.ts` | `` `FROM neighbourhoods WHERE id = $1` `` | app read | N | never | row 57 Target |
| `src/features/leads/lib/get-lead-feed.ts` | `` `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` | app read name/income | N | ③ (doc-only) | **UNREGISTERED** — named in Spec 57's own body → add to 57 Cross-Spec at ③ |
| `src/lib/market-metrics/queries.ts` | `` `JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` | app read name/income | N | ③ (doc-only) | **UNREGISTERED** — Spec 57 body → ③ |
| `src/app/api/admin/stats/route.ts` | `` `SELECT COUNT(*)::text AS count FROM neighbourhoods` `` | admin count tile | N | never | none |
| `src/app/api/quality/route.ts` | (count / telemetry list) | quality route | N | never | none |
| `src/lib/admin/funnel.ts` | `` `LOADER_SLUGS = ['permits', 'coa', 'address_points', 'parcels', 'massing', 'neighbourhoods', 'load_wsib', 'load_zoning'];` `` · `` `The ~2,054 SQL UPDATEs are normal` `` | admin funnel (0-new/0-updated warning; the `statusSlug` is `link_neighbourhoods` ⇒ **unreachable for this slug**) | N | ③ (doc-only) | the `~2,054 SQL UPDATEs` text becomes **false** under N-D2 → edit at ③ [Fold H-3] |
| `src/lib/neighbourhoods/summary.ts` | (app formatter; archive 27) | app formatter | N | never | none |
| `src/components/FreshnessTimeline.tsx` | `` `neighbourhoods:     { name: 'Neighbourhoods',        group: 'ingest' },` `` | UI label / verdict tile | N | never (verify-only) | Fold H-3 addition |
| `scripts/surfaces/_schema/census/admin-existing.json` | `` `logic_variables`, `neighbourhoods`, `` (table named in surface read-lists; 22 hits, 0 hits for the script path — plan H-3 "×6" not reproduced) | surface contracts / admin text | N | never (verify-only) | Fold H-3 addition (§1 named only `contracts.json`) |
| `_schema/fixtures/{invalid,shape,valid}` assert_schema clones (×14) | `` `neighbourhoods` `` (liveness ref) | fixtures | N | never (verify-only) | Fold H-3 addition |
| `scripts/lib/step/{acquire,index,write}.js`, `scripts/lib/safe-math.js` | `` `downloadArchive` `` / `scripts/lib/safe-math` (seed `sources_neighbourhoods_floor`) | runner/seam libs | N | never | library-registration gap is estate-wide (Spec 122 Target = "—") |

### (d) `records_meta` legacy key readers (`boundaries_loaded|` `census_rows_matched|` `has_postgis`) [§E4; Fold CF-7]

`git grep` over `src scripts` excluding the script itself: the ONLY reader is
`src/tests/chain.logic.test.ts` — `` `expect(content).toContain('census_rows_matched');` ``.

| Target | Anchor READ (greppable) | Role | Touched at ① | Touched later | Note |
|---|---|---|---|---|---|
| `src/tests/chain.logic.test.ts` | `` `expect(content).toContain('census_rows_matched');` `` | source-text lock on the legacy key | N | ② (re-home) | the sole consumer of all three legacy keys; re-homed at ② (§1) |

No other reader of `boundaries_loaded` / `census_rows_matched` / `has_postgis` exists in `src` or `scripts`
(the producers' `emits[]` `consumers: []` at ②, plan §14 Fold H-1(A)).

### (e) Tests naming the script / the table

| Target | Anchor READ (greppable) | Role | Touched at ① | Touched later | Note |
|---|---|---|---|---|---|
| `src/tests/chain.logic.test.ts` — audit lock | `` `it('load-neighbourhoods: records_updated is boundary count, not census characteristic rows', () => {` `` + `` `'load-neighbourhoods.js',` `` | source-text lock | N | ② (re-home) | fleet list `SOURCES_LOADERS_REQUIRING_AUDIT_TABLE` |
| `src/tests/chain.logic.test.ts` — fleet lists | `` `'load-neighbourhoods.js',` `` (3 lists, plan §1) | fleet membership (R-AN) | N | ③ | anchors, not line numbers (plan's `:620,720,939` drifted) |
| `src/tests/pipeline-sdk.logic.test.ts` — GeoJSON try-catch | `` `it('load-neighbourhoods.js wraps GeoJSON file parse in try-catch', () => {` `` | source-text lock | N | ② (re-home) | plan cites `:1888-1892`; the `it(` is at **1904** — ANCHOR, not number |
| `src/tests/pipeline-sdk.logic.test.ts` — counter lock + fleet lists | `` `it('load-neighbourhoods.js emitSummary records_new is 0, records_updated is boundaryCount', () => {` `` + `` `'load-neighbourhoods.js',` `` / `` `'scripts/load-neighbourhoods.js',` `` (fleet lists) | source-text lock (`records_new:s*0`) + fleet membership | N | ② (re-home, N-D3) / ③ (fleet) | plan §1 `:1259-1265` — present, anchors not numbers |
| `src/tests/pipeline-advisory-lock.infra.test.ts` | `` `'scripts/load-neighbourhoods.js':  57,` `` | lock-registry test | N | never (verify-only) | lock 57 = Spec 47 §A.5 |
| `src/tests/ingest-prereq-0q.logic.test.ts` | `` `scripts/load-neighbourhoods.js:52` `` (header comment) | cites the raw-GET line | N | ② (re-home) | **rots when ② freezes the shell** [Fold CF-7] |
| `src/tests/quality.logic.test.ts` | `` `describe('assert-schema.js NEIGHBOURHOOD_ID_PROPS sync with load-neighbourhoods.js', () => {` `` + `` `it('includes AREA_SHORT_CODE which load-neighbourhoods.js reads', () => {` `` | reads `AREA_SHORT_CODE` from the script | N | ② (re-home) | re-point at descriptor `key_property` |
| `src/tests/sources-loader-mkdir.logic.test.ts` | `` `const LOADERS = [` `` … `` `'load-neighbourhoods.js',` `` | fresh-checkout mkdir lock | N | ② (entry removed; why: `acquire.js` owns `mkdtemp`) | plan §1 |
| `src/tests/neighbourhood.logic.test.ts` (table) | `` `neighbourhoods` `` | app formatter test | N | never | verify-only |
| `src/tests/admin.ui.test.tsx` (table) | `` `it('neighbourhoods: green when >= 158', () => {` `` | admin UI thresholds | N | never | verify-only |
| `src/tests/admin-manifest-utils.logic.test.ts` (table) | `` `'neighbourhoods'` `` | manifest-utils list | N | never | verify-only |
| `src/tests/get-lead-feed.logic.test.ts` (table) | `` `neighbourhoods` `` | app read test | N | never | verify-only |
| `src/tests/db/109_fk_hardening.db.test.ts` (table) | `` `describe('fk_permits_neighbourhoods — SET NULL', () => {` `` | FK lock | N | never | verify-only |
| `src/tests/db/compute-build-norms.db.test.ts` (table) | `` `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING` `` | seed | N | never | verify-only |
| `src/tests/db/compute-storey-norms.db.test.ts` (table) | `` `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2)` `` | seed | N | never | verify-only |
| `src/tests/db/enrich-parcels-optconfig.db.test.ts` (table) | `` `DELETE FROM neighbourhoods WHERE id IN ($1,$2)` `` | live-DB seed/teardown (by `id`) | N | never | verify-only |
| `src/tests/db/lead-inspect-query.db.test.ts` (table) | `` `INSERT INTO neighbourhoods (neighbourhood_id, name, avg_household_income, period_of_construction)` `` | seed | N | never | verify-only |
| `src/tests/db/neighbourhoods-fk-join.db.test.ts` (table) | `` `describe.skipIf(!dbAvailable())('neighbourhoods FK-correct join — live-DB regression-lock (WF3 2026-05-08)', () => {` `` | FK-join lock (reads `n.id`) | N | never (unaffected) | plan §1: unaffected |
| `src/tests/neighbourhoods-fk-join.infra.test.ts` (table) | `` `neighbourhoods` `` | FK-join infra lock | N | never (unaffected) | plan §1 |
| `src/tests/db/vocab-coverage.db.test.ts`, `refresh-snapshot-consolidation.db.test.ts`, `lead-detail-query.coa.infra.test.ts`, `quality.infra.test.ts`, `step-library.logic.test.ts`, `steps/assert_schema/violations.test.ts`, `steps/link_neighbourhoods/violations.test.ts` (table) | `` `SELECT COUNT(*)::int n FROM neighbourhoods` `` · `` `DELETE FROM neighbourhoods WHERE name LIKE 'FX Neighbourhood%' OR neighbourhood_id = -1` `` · `` `expect(COA_LEAD_DETAIL_SQL).toMatch(/LEFT JOIN neighbourhoods/);` `` · `` `'neighbourhoods', 'load_wsib', 'geocode_permits', 'link_parcels',` `` · `` `/FROM neighbourhoods WHERE geom IS NOT NULL/.test(text)` `` · `` `if (u.includes('neighbourhoods')) {` `` · `` `from the containing polygon's \`neighbourhoods.id\`` `` | live-DB / step tests seeding or asserting the table | N | never | §E4 list; **verify-only** |
| `src/tests/db/optconfig-staleness.db.test.ts` (table) | `` `DELETE FROM neighbourhoods WHERE id = $1` `` | live-DB seed/teardown (by `id`) | N | never | verify-only |
| `scripts/steps/_schema/fixtures/census/{bad-mismatched-archetype,missing-slug-totality}.json` | `` `load-neighbourhoods.js` `` | self-contained bad fixtures | N | never (verify-only) | [Fold CF-7] |

**New referents found by this review but NOT in plan §1 / Fold H-3 / Fold CF-7** — flagged
`NEW — not in plan sweep`:
- `src/tests/compute-cost-estimates.infra.test.ts` — `` `expect(content).toMatch(/\bneighbourhoods\b/);` `` (NB-X2's companion lock; plan §1 named the script + finder, not this test). `NEW — not in plan sweep`.
- `src/tests/compute-coa-cost-estimates.infra.test.ts` — `` `it('emitMeta declares reads from coa_applications, lead_parcels, parcels, parcel_buildings, building_footprints, neighbourhoods, lead_trades', () => {` ``. `NEW — not in plan sweep`.
- `src/tests/db/migration-208-build-norms-family.db.test.ts` — `` `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING` ``. `NEW — not in plan sweep`.
- `src/tests/load-parcels.csv-drift.logic.test.ts` / `src/tests/factories.ts` / `src/tests/capture-step-golden.logic.test.ts` — carry `records_new: 0` fixtures (generic, not this slug) — noted for the ② golden shape; no action. `NEW — not in plan sweep`.

**Tally.** `Y` count = **1** (group (a): `src/tests/steps/neighbourhoods/**`; this report is the review's own output, not a target). Every other row is `N` at ① — the legacy script is READ, never edited. Four `NEW — not in plan sweep` referents (above), all verify-only.
**registry_reserved files (exec-policy.json) touched at ①: none.**


## 4. PH-3 — Intent ledger (G3)
<!-- ANCHOR:§4 -->

> Role split (Spec 123 §7.1): **this pass DISCOVERS with evidence; a SEPARATE seat ADJUDICATES.** Every
> `Disposition` below is the ORCHESTRATOR'S, transcribed from the plan (plan §2 / §11 / §13 / §14) — never
> re-decided here. Disposition vocabulary is the gate's closed set: **`carried`** (behaviour survives,
> re-seated), **`carried-in-seat`** (survives as a named runtime seat — a runner terminal or a declared
> check), **`knowingly-retired`** (dead or unpreservable; declared), **`pinned-wrong-form`** (defect preserved
> as-is by adjudication; the fix is a SEPARATE F-commit), **`retired-no-behaviour`** (deleted because the
> converted seam makes it unreachable or nothing of it survives). **No row may be `unknown`.**

**Introducing commits** (§E1, `git log -S<construct> -- scripts/load-neighbourhoods.js`, tail = oldest):
`d398d5e7` "Add Data Quality Dashboard with coverage tracking across 6 matching processes" · `67711003`
"fix(47_pipeline_script_protocol): B1 Batch 1 — safe-math for top 5 scripts" · `0ef23550`
"refactor(28_data_quality): extract Pipeline SDK + migrate all 21 scripts" · `fe0bf2e7`
"feat(28_data_quality_dashboard): load-neighbourhoods.js — bulk unnest + IS DISTINCT FROM + observability" ·
`4f46b67b` "fix(40_pipeline_system): 3 WF3 fixes" · `d0d11946` "fix(47_pipeline_script_protocol): B2.1 —
load-neighbourhoods N+1 loop queries → UNNEST batches" · `98910817` "fix(40_pipeline_system): B5 unhandled
JSON.parse on external data — 3 scripts" · `745a1b4d` "fix(47_pipeline_script_protocol): Bundle G Wave 4 —
advisory lock retrofit" · `8b9b0f91` "feat(28_data_quality): add audit_table to 6 sources pipeline scripts" ·
`412927ca` "fix(28_data_quality_dashboard): resolve all 14 pipeline audit findings" (then `52ad6527` §11
counter-misuse fix) · `8c761ea7` "fix(28_data_quality): VACUUM neighbourhoods, threshold dead tuple alerts" ·
`1be8d767` "fix(115_scheduling): mkdir data/ in all four sources loaders' downloadFile()". **Every construct
below was re-checked against THIS worktree**; the introducing commit is §E1's, the `[READ]` anchor is the
script's own greppable text.

| # | Construct (greppable anchor) | Introduced (`git log -S`, §E1) | Intent (commit subject + why) | Disposition | NB id | Adjudicator |
|---|---|---|---|---|---|---|
| 1 | Key arms `props.AREA_S_CD` / `props.AREA_SHORT_CODE` / `props.AREA_ID` / `'0'` [READ `` `props.AREA_S_CD \|\| props.AREA_SHORT_CODE \|\| props.AREA_ID \|\| '0'` ``] | `d398d5e7` (initial coverage-tracking loader) | Key a boundary feature off whichever CKAN property the publisher ships — a defence against a prop rename (`AREA_S_CD` is ABSENT on 158/158 today; the `AREA_ID` arm would key 158 garbage rows) [MEASURED plan §2 / §E2] | **`knowingly-retired`** (arms 1 and 3) + **`carried`** (the `AREA_SHORT_CODE` arm, via descriptor `key_property`); the refusal survives as check `bad_key_count` FAIL>0 | **N-D6** | plan §2 B2 / §11 + Fold H-2 (orchestrator) |
| 2 | Name fallback `props.AREA_NAME \|\| props.AREA_LONG_CODE \|\| ''` [READ `` `const name = props.AREA_NAME \|\| props.AREA_LONG_CODE \|\| '';` ``] | `d398d5e7` | Same rename-defence for the display NAME; the `\|\| ''` arm feeds fence #4 (a name-less feature is skipped) | **`carried`** — `shapeRecord` carries the fallback verbatim; missing → skip reason `missing_name` (0p) | — | plan §2 B3 / §11 (orchestrator) |
| 3 | `geomLine` PostGIS-optional `SET` arm [READ `` `const geomLine = hasPostGIS` ``] | `0ef23550` (SDK extraction) | Append `, geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` ONLY when PostGIS is present — a no-PostGIS DB must still load the jsonb | **`carried-in-seat`** — `bind:"wkb_geometry"` + `guards.requires [{extension postgis, fail}]`; the conditional string-build disappears into the runner's declared bind | — | plan §2 B5 / §4 (orchestrator) |
| 4 | Guard `WHERE neighbourhoods.name IS DISTINCT FROM EXCLUDED.name OR neighbourhoods.geometry IS DISTINCT FROM EXCLUDED.geometry` [READ `` `neighbourhoods.name IS DISTINCT FROM EXCLUDED.name` ``] | `fe0bf2e7` | Do not rewrite a fully-unchanged row — the legacy's ONLY guard (158 rows × 8 census UPDATEs = 1,264 tuple rewrites on an UNCHANGED source, run history [MEASURED plan §2]) | **`carried`** — `guard_columns = [name, geometry, …census]`, widened so the census is now GUARDED too (Rule-9 win; no `grandfathered.json` entry) | (N-D2 is the counter side, #13) | plan §4 / Fold CF-5 (orchestrator) |
| 5 | Bulk 5-pct `COALESCE(v.married_pct, n.married_pct)` (+4 siblings) [READ `` `married_pct = COALESCE(v.married_pct, n.married_pct),` ``] | `fe0bf2e7` | "Absent / null incoming value KEEPS the stored value" for the 5 always-write demographic columns — the legacy's only `preserve` semantics | **`carried`** — `on_empty:"preserve_null"` (RE-FREEZE #19 follow-on: `COALESCE(EXCLUDED.c, t.c)` + guard `(EXCLUDED.c IS NOT NULL AND t.c IS DISTINCT FROM EXCLUDED.c)`), **proven byte-identical** (Fold CF-5: 2,212/2,212 cells, 0 drift) | — | plan §2 B7 / Fold CF-5 (orchestrator) |
| 6 | `unnest($1::int[])` / `unnest($2::text[])` / `unnest($3::jsonb[])` bind arrays [READ `` `unnest($3::jsonb[])` ``] | `4f46b67b` (3 WF3 fixes) | One round-trip per array of values instead of one per row | **`retired-no-behaviour`** — `scripts/lib/step/write.js` binds by declared column; the array / `unnest` form is the runner's, not a behaviour this step owns | — | plan §3 ("Not used") / Fold CF-5 (orchestrator) |
| 7 | `UNNEST batch pattern` §7.6 comment [READ `` `Reference: §7.6 UNNEST batch pattern.` ``] | `d0d11946` (B2.1 N+1 → UNNEST) | Documents that the census UPDATEs were de-N+1'd — a **comment only**, no runtime effect | **`retired-no-behaviour`** — the comment dies with the frozen shell (§13 CF-8 registry sweep) | — | plan §2 B7 (orchestrator) |
| 8 | `JSON.parse` try-catch around the GeoJSON read [READ `` `Failed to parse GeoJSON file ${geojsonPath}: ${err.message}` ``] | `98910817` (B5 unhandled JSON.parse) | A malformed external file must NAME ITSELF and halt, not throw a bare `SyntaxError` | **`carried`** — 0v's `parseGeoJson` rethrows a **named** throw naming the file (message form + `raw.slice(0,100)` preview preserved); the fence survives its seat | — | plan §3 0v / Fold CF-1 (orchestrator) |
| 9 | `const ADVISORY_LOCK_ID = 57;` [READ `` `const ADVISORY_LOCK_ID = 57;` ``] | `745a1b4d` (Bundle G Wave 4) | Mutual exclusion of concurrent runs of this loader (Spec 47 §A.5 lock registry) | **`carried`** — descriptor `identity.lock:57` + `why_lock` (Spec 47 §A.5 registry row 57 [READ 47:1923 via plan §1(b)]) | — | plan §2 B15 / §4 (orchestrator) |
| 10 | Silent skip `if (!lockResult.acquired) return;` — OUTSIDE the `withAdvisoryLock` callback [READ `` `if (!lockResult.acquired) return;` ``] | `745a1b4d` | A held lock means "another writer is running" ⇒ this run does nothing **and emits NO `emitSummary` at all** — not PASS, not FAIL, no ledger row from this step | **`carried-in-seat`** — runner SKIP terminal + LG-29 WARN, **NB-less** (no `N-D` id: the seat is the RUNNER'S, not a pinned defect). It is the closest converted form of "no summary at all" | (**B15**, NB-less) | plan §2 B15 / Fold H-1 (orchestrator) |
| 11 | Floor `boundaryCount >= 158` + `'>= 158'` threshold + status `boundaryCount >= 158 ? 'PASS' : 'FAIL'` [READ `` `boundaryCount >= 158 ? 'PASS' : 'FAIL'` ``] | `8b9b0f91` (audit_table to 6 sources scripts) | Catastrophic-load detector: a City boundary set that lost rows is a FAIL, not a warn | **`carried`** — the check id keeps the legacy metric name **`boundaries_loaded`** (NOT `rows_loaded_floor`, Fold H-1) over `acquired.rows_shaped`, `limit_from_config: sources_neighbourhoods_floor` (3rd consumer; identical bounds; `on_invalid:fail`). The **parallel-boolean** half is the `pinned-wrong-form` defect #12 | — | plan §2 B12 / Fold H-1 (orchestrator) |
| 12 | Verdict parallel boolean `const hasFails = boundaryCount < 158` → `verdict: hasFails ? 'FAIL' : 'PASS'` [READ `` `const hasFails = boundaryCount < 158` ``] | `8b9b0f91` | The audit-table verdict was computed from a **re-derived boolean** instead of folding the row statuses — a Rule-10 violation | **`pinned-wrong-form`** (Rule 10) — the converted runner derives the verdict row-by-row (the `parcels` / `address_points` shape) | **N-D11** | plan §2 B12 / Fold H-1 (orchestrator) |
| 13 | Counters `records_total: boundaryCount`, `records_updated: boundaryCount`, `records_new: 0` [READ `` `records_new: 0,` ``] | `412927ca` (then `52ad6527` §11 counter-misuse fix) | The public counters — but `records_new` is a **hard-coded literal** that reports 0 on EVERY run even when it inserts (live: `records_total 158, new 0, updated 158` on an unchanged source) | **`pinned-wrong-form`** (a declared golden-diff key) — converted counters come from `written.*`; the fiction is retired as a declaration and kept VISIBLE as a diff | **N-D3** | plan §2 B13 / §11 (orchestrator) |
| 14 | `await pool.query('VACUUM ANALYZE neighbourhoods');` every run [READ `` `await pool.query('VACUUM ANALYZE neighbourhoods');` ``] | `8c761ea7` (VACUUM + dead-tuple alerts) | The bulk upsert + census UPDATEs create ~1,264 dead tuples on a 158-row table (~70 %+ dead ratio) — reclaim + refresh stats EVERY run, unconditionally | **`carried-in-seat`** — `execution.maintenance [{vacuum_analyze, neighbourhoods, owned_by:"self"}]` gated on `neighbourhoods_dead_tuple_ratio_warn_max`; trigger differs (data-invisible) → VERIFY-INT-3 | **N-D9** | plan §2 B10 / §3 / Fold H-1 (orchestrator) |
| 15 | `fs.mkdirSync(path.dirname(destPath), { recursive: true })` inside `downloadFile` [READ `` `fs.mkdirSync(path.dirname(destPath), { recursive: true });` ``] | `1be8d767` (mkdir data/ in four sources loaders) | The gitignored `data/` dir does not exist on a fresh CI checkout and the download precedes any other mkdir (TWO call sites here: the GeoJSON arm and the XLSX arm) | **`knowingly-retired`** — the `data/` cache is retired (fence #16); **`acquire.js` owns the download dir** (`mkdtemp`). The `sources-loader-mkdir.logic.test.ts` LOADERS entry for this file is **REMOVED at ②**, with the why recorded in that commit (L8, §4.1) | **N-D5** (cache half) | plan §2 B1 / §1 re-home list (orchestrator) |
| 16 | Download progress cadence `downloaded % (2 * 1024 * 1024) < chunk.length` [READ `` `downloaded % (2 * 1024 * 1024) < chunk.length` ``] | `d398d5e7` | Log-only progress window every 2 MiB — not a gate, not a counter | **`retired-no-behaviour`** — the `address_points` commit-9 dead-progress-cadence precedent; the runner logs its own progress | — | plan §2 B16 / §5 (orchestrator) |
| 17 | `pipeline.emitMeta(...)` with the **publisher-vocabulary** read list `{"Census XLSX": ["income","tenure","demographics"]}` [READ `` `"Census XLSX": ["income", "tenure", "demographics"]` ``] | `0ef23550` (SDK extraction) | Self-documenting data-flow metadata (Spec 28 lineage) — but the reads name CATEGORIES, not fields, so the lineage map records a fiction | **`pinned-wrong-form`** — truthful reads / writes / `external` ids via `deriveMeta` (Rule 1 forbids declaring fiction); regenerate `lineage-meta-snapshot.json` + `data-lineage-map.md` at ② | **N-D12** | plan §2 B14 / §14 Fold H-1 (orchestrator) |
| 18 | Audit name `'Neighbourhood Boundaries'` + `phase: 9` [READ `` `name: 'Neighbourhood Boundaries',` ``] | `8b9b0f91` | The sources-chain phase number + display name for the audit / funnel render | **`carried`** — `identity.display_name:"Neighbourhood Boundaries"` + `sharing.varies_by_chain.phase {sources: 9}` ("all none" would emit phase 0 where legacy emits 9 [READ `verdict.js:52-61`; runs 1361/1402/1480 MEASURED]) | — | plan §1 / §4 / Fold H-1 (orchestrator) |
| 19 | "Neighbourhood Number" format-2 header detection + format-1 `Name (ID)` arm [READ `` `row0Char === 'Neighbourhood Number'` ``] | `d398d5e7` | The XLSX sheet lays out its id columns one way in format 2 and another in format 1; both must be discovered | **`carried`** — discovery lives in the **0w** seam (`compute.buildLookup`, pure). The format-1 arm is measured DEAD (0 format-1 headers [MEASURED plan §2]) but carried: it is the same branch | — | plan §2 B6 / §3 0w / Fold CF-2 (orchestrator) |
| 20 | `’` (U+2019) normalisation in the characteristic-label matcher [plan §2 B8 / Fold H-2] | `d398d5e7` | the 2021 education label may ship a curly apostrophe (`Bachelor’s degree or higher`); the matcher normalises U+2019 to `'` before comparing [READ `` `=== "Bachelor's degree or higher"` ``] | **`carried`** — publisher vocabulary + normalisation in `buildLookup`, each named in `notes.json` (domain data, not a tunable) | — | plan §2 B8 / Fold H-2 (orchestrator) |
| 21 | Common-law / family variants: `Married or living common-law`, `CONSTRUCTION_PERIODS`, `periodMap`, the `startsWith('Total - …')` prefixes [READ `` `Married or living common-law` ``] | `d398d5e7` | The publisher's family / period taxonomy is variant-spelled; the loader maps each variant to a stored column or period bucket | **`carried`** — same seat as #20: `buildLookup` + `notes.json` (5 `startsWith('Total - …')` prefixes + every characteristic label, plan Fold H-2) | — | plan §2 B8 / Fold H-2 (orchestrator) |

**Count: 21 rows · 0 without a disposition · 0 `unknown`.** Every fence that protects a *guard* (rows 4, 8,
10, 11, 14) is re-seated or explicitly retired. The three **`pinned-wrong-form`** rows (12, 13, 17) are the
declared deviations ② carries with `adjudicated_by`; the `knowingly-retired` rows (#1, #15) plus the
`retired-no-behaviour` rows (#6, #7, #16) are the declared retirements. **No row is `PENDING orchestrator`** —
every construct §E1 names already maps to a plan ruling (plan §2 B-row / §11 / Fold CF-n / Fold H-n): the
engine DISCOVERED, the plan ADJUDICATED, and this table only transcribes.

### 4.1 Fences with a regression lock today
<!-- ANCHOR:§4.1 -->

> §E4's test list, filtered to the locks that pin **legacy source text** of `scripts/load-neighbourhoods.js`
> (as opposed to tests that merely name the table). Fate = plan §1 "Tests to disposition": each is
> **RE-HOMED IN PLACE at ②** — re-pointed at the frozen shell / descriptor / compute, **never weakened**
> (Spec 122 §5.1: a lock may move, it may not lose its teeth). Citations are greppable ANCHORS, not line
> numbers (the plan's own `:line` numbers drifted — plan §1 fold).

| # | Lock (test file) | Anchor READ (greppable) | What it pins | Fate at ② |
|---|---|---|---|---|
| L1 | `src/tests/chain.logic.test.ts` — counter semantics | `` `it('load-neighbourhoods: records_updated is boundary count, not census characteristic rows', () => {` `` + `` `expect(content).toContain('census_rows_matched');` `` | `records_updated` must NOT be `profileUpdates`; `census_rows_matched` must stay visible | **re-home** — re-point at the descriptor's `counters.records_updated.source` + the `census_rows_matched` `emits[]` entry (the `link_parcels` form, which already moved off source text) |
| L2 | `src/tests/chain.logic.test.ts` — fleet membership (3 lists, R-AN) | `` `'load-neighbourhoods.js',` `` | The script is in the sources fleet lists | **re-home at ③** (fleet lists land at ③ per plan §6) |
| L3 | `src/tests/pipeline-sdk.logic.test.ts` — GeoJSON try-catch (fence #8) | `` `it('load-neighbourhoods.js wraps GeoJSON file parse in try-catch', () => {` `` + `` `expect(loadSection).toMatch(/try\s*\{[\s\S]*?JSON\.parse/);` `` | The file-parse section must keep its try-catch | **re-home** — the fence moves to 0v's `parseGeoJson` (the named throw); the lock's teeth ("a malformed file must not throw bare") are re-pointed, never dropped. Plan cites `:1888-1892`; the `it(` is at **1904** — ANCHOR, not number |
| L4 | `src/tests/pipeline-sdk.logic.test.ts` — counter + audit fleet locks | `` `it('load-neighbourhoods.js emitSummary records_new is 0, records_updated is boundaryCount', () => {` `` + `` `'load-neighbourhoods.js',` `` / `` `'scripts/load-neighbourhoods.js',` `` | The `records_new:0` / `records_updated:boundaryCount` source-text lock + fleet membership | **re-home** — the counter lock is re-pointed at the descriptor's `counters.*.source` (N-D3's declaration); plan §1 `:1259-1265`, anchors not numbers. Fleet half → ③ |
| L5 | `src/tests/pipeline-advisory-lock.infra.test.ts` — lock registry | `` `'scripts/load-neighbourhoods.js':  57,` `` | Lock id 57 = Spec 47 §A.5 row 57 | **never (verify-only)** — the index is keyed on the SCRIPT PATH, which the conversion leaves unchanged |
| L6 | `src/tests/ingest-prereq-0q.logic.test.ts` — the 0q comment | `` `scripts/load-neighbourhoods.js:52` `` | Cites the raw-GET line as the 0q "one attempt" evidence | **re-home** — the comment **rots when ② freezes the shell** [Fold CF-7]; re-point at the descriptor's `execution.network` declaration |
| L7 | `src/tests/quality.logic.test.ts` — `NEIGHBOURHOOD_ID_PROPS` sync | `` `describe('assert-schema.js NEIGHBOURHOOD_ID_PROPS sync with load-neighbourhoods.js', () => {` `` + `` `it('includes AREA_SHORT_CODE which load-neighbourhoods.js reads', () => {` `` | `assert-schema.js`'s `NEIGHBOURHOOD_ID_PROPS` matches the props the loader reads | **re-home** — re-point at the descriptor `key_property` (`"AREA_SHORT_CODE"`, fence #1). Ties to `NB-X1` (§3(c)): the assert_schema side still accepts the retired `AREA_ID` key |
| L8 | `src/tests/sources-loader-mkdir.logic.test.ts` — fresh-checkout `data/` mkdir | `` `const LOADERS = [` `` … `` `'load-neighbourhoods.js',` `` | Each sources loader mkdirs `data/` on a fresh checkout (the WF3-record fence, §E3) | **entry REMOVED at ②**, with the why recorded in that commit: `acquire.js` owns the download dir (`mkdtemp`) and the `data/` cache is retired (#15, N-D5) — the fence is **not weakened, its precondition is gone** |

**No lock is deleted without a why.** L8 is the only *removal*, and it is the removal of a now-vacuous
membership entry, not of a behaviour lock; L1/L3/L4/L6/L7 keep their teeth by re-pointing at the new seats,
and L5 is verify-only because the script path is unchanged.

### 4.2 Cross-refs
<!-- ANCHOR:§4.2 -->

- **`tasks/lessons.md` — none.** `git grep neighbourhoods tasks/lessons.md` → **no entry** [§E3]. Nothing to
  transcribe; the ABSENCE is the finding (this loader has never produced a lesson row).
- **`docs/reports/review_followups.md` — the CKAN-downtime row.** `"CKAN API downtime / retry / backoff"` —
  chain-sources cloud run **34769829628** (2026-09-13) halted at **step 17/28** on an HTTP **502** from the
  un-retried `https.get` [§E3; plan §0.8]. Tracked as **N-D16 / POST-B1-8** (`programme-items.json`
  `:1931-1936` `NOT_STARTED`) → **④ F1** (this step's share: `retries_from_config` + backoff). Not a ① action.
- **`docs/reports/review_followups.md` — the WF3 FK-join repair.** `"WF3 (2026-05-08) — neighbourhoods FK-join
  repair"`: the join must be `n.id = p.neighbourhood_id`, locked by `neighbourhoods-fk-join.{infra,db}.test.ts`
  [§E3; §3(e)]. **Unaffected** by this conversion — the loader writes the TABLE, the join reads `id` (a
  `db_default` the step never writes), and the key-shift cohort's FKs reference `id` only [Fold CF-6].
  Verify-only.

## 5. PH-5 — Seam map (G5)
<!-- ANCHOR:§5 -->

> Every seam the step touches, its legacy site, and the converted seat. **This step's chain position has NO
> producer.** Method: name the seam where the legacy code CROSSES a process boundary (or where a downstream
> consumer crosses INTO the table), then give the converted seat. Adjudications are the orchestrator's
> (plan §2/§3/§4/§14, Fold H-1), transcribed, never re-decided.

- **Upstream: none.** `inputs.reads` declares **two externals only** — `ckan:neighbourhoods-4326`
  (`format:"geojson"`) + `ckan:nbhd-2021-census-profile` (`format:"xlsx"`, `role:"lookup"`) — and **no
  `reads.steps` edge**: `sources` chain position **17** has no producer dependency [READ `scripts/manifest.json`
  `chains.sources`; plan §1(b) `:106`, pos 17]. The two externals are the ONLY sources read; the table is the
  single `outputs.writes` target (§1, §3(b)).

- **Downstream (Fold H-1 (B), transcribed).** The step pin is `neighbourhoods gte` on `link_neighbourhoods`;
  the seam `neighbourhoods→link_neighbourhoods` goes **LIVE at ③ (VERIFY-INT-2)**.

| Consumer | Reads | Seam kind | Preserved? |
|---|---|---|---|
| `link_neighbourhoods` (step, `scripts/link-neighbourhoods.js`) | TABLE `{id, neighbourhood_id, name, geom}` + step pin `neighbourhoods gte` [descriptor:22,27]; the `link_column` runner never calls `ledgerGatedSkip` (only cascade/materialize do [READ `index.js:1595`, `:1899`]) | **step → step** (table) | **yes** — N-D3's `records_updated 158→0` cannot starve it (live at ③) |
| `deriveSeamPairs` / `checkSeam` (live at ③) | `deriveSeamPairs` reads only `inputs.reads.steps[]` edges — no column demand [plan §8, seam.js `deriveSeamPairs`]; `checkSeam` reads the producer's `records_meta ? 'chain_run_id'` + `started/completed_at` [plan Fold H-1 (B)] | **runner seam** (ledger `records_meta`) | **yes** — `chain_run_id` is runner-supplied [index.js:5495] |
| `assert_data_bounds` (`scripts/lib/compute/assert-data-bounds.js` + `.descriptor.json`) | table `COUNT(*)` + duplicate-key groups [compute:254-258]; floor var `sources_neighbourhoods_floor` **shared** with our check id `boundaries_loaded` | **assert** (table-only) | **yes** |
| `assert_schema` (`scripts/quality/assert-schema.descriptor.json` + `lib/compute/assert-schema.js`) | `NEIGHBOURHOOD_ID_PROPS` (the SAME GeoJSON URL, 2nd literal home) | **assert** (source-text sync) | **yes** — `NB-X1` (accepts the retired `AREA_ID` key) is a followup, not a break; URL duplication is a Rule 1 followup (§3(c)) |
| `enrich_parcels` (`scripts/lib/compute/enrich-parcels.js` + descriptor) | `FROM neighbourhoods n` — `n.id, avg_household_income, geom, name` | **enrich** (table) | **yes** |
| `compute-cost-estimates.js` | `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` — income/tenure | **read** (step) | **yes** — `NB-X2` (meta lists `neighbourhood_id` but reads `id`) is a followup |
| `compute-coa-cost-estimates.js` | `LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id` — same 2 cols | **read** | **yes** |
| `link-coa-to-parcels.js` | `'SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL'` — `geometry` **JSONB via Turf** | **read (jsonb CONTRACT)** | **yes — MUST stay jsonb-equal** (§4 zero-diff; the Turf contract, plan §1(c)) |
| app readers: `src/lib/leads/{lead-detail-query,lead-inspect-query}.ts`, `src/app/api/permits/[id]/route.ts`, `src/features/leads/lib/get-lead-feed.ts`, `src/lib/market-metrics/queries.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/quality/route.ts` | `LEFT JOIN neighbourhoods n …` / `FROM neighbourhoods WHERE id = $1` / `COUNT(*)::text` | **app read** (table) | **yes** — `get-lead-feed.ts` + `market-metrics/queries.ts` are **UNREGISTERED** → doc-only additions to Spec 57 Cross-Spec at ③ (§3(c)) |
| run-chain `step_verdicts`, observe-chain, chain-end-synthesis, `FreshnessTimeline.tsx` | `audit_table.verdict` [run-chain:905-907, :1014; observe-chain:76-77, :213; chain-end-synthesis.mjs:212; FreshnessTimeline:336-345] | **ledger consumer** | **yes** (row-derived verdict is N-D11's fix, same emitted shape) |
| admin funnel (`src/lib/admin/funnel.ts`) | `LOADER_SLUGS` list + the `~2,054 SQL UPDATEs are normal` text; `statusSlug` is `link_neighbourhoods` | **admin read** | **unreachable for this slug**; the `~2,054 SQL UPDATEs` text becomes **false** under N-D2 → doc edit at ③ [Fold H-3] |

- **Library seams USED** (plan §3 "Landed seams used", transcribed): **0b** format axis (extended by 0v),
  **0e/0g** `geometry_kind:"polygon"`, **0f/0n/0p** `shapeRecord(record,{geojson,config,run_at,tag})` + skip
  reasons, **0i** `geometry_srid` (absent ≡ 4326; the source is CRS84 ≡ 4326 [MEASURED]), **0m** follow-on
  `on_empty:"preserve_null"`, **0o** `column_nulls`, **0q** network (④), **0r** `on_head_error` (④ — moved to
  ② by Fold H-5), **0s** `coerceKey(raw,{geojson})` (1-arg use), **0t** `geometry_repair:"none"`.
- **Library seams NOT used** (plan §3, transcribed): **0h** class C — **REJECTED** (it would DELETE 158
  FK-referenced rows: permits `SET NULL` on 240,947, build_norms `CASCADE` on 452, storey_norms no-action on
  147 [MEASURED plan §2]; §1.1) · **0j** `insert_only` · **0l** `invalidates` · **0u**
  `derived_from_geometry` · **0k** `set_source:"compute"`.

**Seams named (G5, as-built at ②):** the **DB seam** is the runner pool + advisory lock 57 + ONE step-scoped transaction (class A guarded upsert; the pre_write gate runs before it opens); the **clock seam** is the runner's `run_at` handed to `shapeRecord` (unused by this step) with `created_at`/`census_year` db_default; the **network seam** is `scripts/lib/step/acquire.js` for BOTH externals (HEAD `on_head_error:"warn_row"`, timeout `neighbourhoods_download_timeout_ms`, `retries:0` — ④ F1); the **argv/env seam** is empty (`process.argv[2]`/`[3]` and the `data/` cache retired, N-D5; only `PIPELINE_CHAIN` via `execution.invocation`).

### 5.1 Prerequisites status @ `90ae17d0` (MEASURED 2026-09-28, grep)
<!-- ANCHOR:§5.1 -->

- **0v — LANDED.**
  - `cb21b6f3 feat(122_pipeline_step_optimization): externals[].format gains geojson (INGESTOR prerequisite 0v, RE-FREEZE #25)`
  - `a9ade5be … parseGeoJson streams via stream-json` (the same file — the parse implementation)
  - `scripts/steps/_schema/step.schema.json` `format` enum carries **`"geojson"`** [READ the enum].
  - ⇒ fence #8 (`JSON.parse` try-catch) has its landing seat; fence #3 (`geomLine` PostGIS arm) lands with the
    runner's declared `bind`.
- **0w — LANDED.** [READ @ `90ae17d0`]
  - `4ea7621e feat(122_pipeline_step_optimization): library batch 2 — 0w lookup externals (RE-FREEZE #27) …`,
    merged `1b06d00f`. Spec 122 carries `RE-FREEZE #27 — externals[].role primary|lookup + format "xlsx" +
    compute.buildLookup`.
  - `scripts/lib/step/index.js` [READ the landed code]: `` `const built = compute.buildLookup(l.id, lr.rows, { config });` ``
    → `built.map` / `built.stats`; the shapeRecord seam gains `lookups` (`` `...(lookups.length ? { lookups: lookupMaps } : {})` ``);
    `acquired.lookups[id] = {content_hash, bytes_downloaded, download_attempts, rows_parsed, head_error, stats}`;
    `acquired.rows_shaped`.
  - `scripts/lib/step/acquire.js` [READ]: `parseXlsx`, and `role:"lookup"` ⇔ `format:"xlsx"` enforced.
  - ⇒ fences #19/#20/#21 (`compute.buildLookup`) now have their landing seat; the census lookup seam is
    expressible and the step can convert.
- **RE-FREEZE #26 is ALREADY TAKEN** — RESOLVED: 0w took **#27** at landing (#26 = row 3.2); the plan's
  **"#26 for 0w"** (§3/§12 O1) is **superseded**.
- **VERIFY-INT-3 — `runMaintenance` reachable under `shape:"ingest"`.** `runMaintenance` is called
  shape-independently AFTER the compute (plan §8 table) ⇒ `execution.maintenance` is reachable under
  `shape:"ingest"`. This is what makes fence #14 (`VACUUM ANALYZE`) a live seat rather than a dead declaration.

## 6. PH-6 — Classification + defect ledger (G6)

> Re-derived from the code (Spec 122 R5 / R-AO — **never trusted from the manifest**), then stated in the
> descriptor vocabulary. The class and every row below are the ORCHESTRATOR'S adjudication (plan §4 / §11 /
> §13 Folds CF-1…CF-8 / §14 Folds H-1…H-5), transcribed — never re-decided here. Shape mirrors
> `docs/reports/2026-09-24-batch2-p3-6-massing-assessment.md` §5 (PH-6 Classification + §5.1 Defect ledger).

**Archetype: INGESTOR (R-AO re-derived).** **Acquire → write re-derived from the code**: `scripts/load-neighbourhoods.js`
acquires TWO externals — the CKAN GeoJSON boundaries file (`` `const BOUNDARIES_URL =` ``) and the CKAN XLSX
census workbook (`` `const PROFILES_URL =` ``) — and writes exactly ONE target table `neighbourhoods`
(`` `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)` ``) with **NO DELETE anywhere** [READ whole
file]. This matches the three converted INGESTOR loaders (`load_ravines`, `address_points`, `parcels`); the
census row `scripts/steps/_schema/step-archetype-census.json` for `neighbourhoods` is **`{INGESTOR, C5,
"Spec 122 §1.10 declared"}`** and is kept **verbatim** (corrected only in status/`converted_at` at ③, R-AO)
[plan §1(b) `:336-340`; ③ note]. `neighbourhoods` is therefore the **4th/5th converted INGESTOR member** (the
R-PACE-1 compressed-form marker, §0 header).

| Field | Value | Why |
|---|---|---|
| `identity.archetype` | **`"INGESTOR"`** | acquire→write re-derived from the code (R-AO); census row `{INGESTOR, C5}` kept verbatim [plan §4, plan §1(b)] |
| class | **A** | ONE guarded `INSERT … ON CONFLICT DO UPDATE`; **NO DELETE anywhere in the step** (§1.1) |
| risk class | **A** | **low × high** — §1 risk table (plan §1 / §11: pin-not-fix available for every carried defect) |
| `shape` | **`"ingest"`** | two externals → ONE target; the INGESTOR runner phases (acquire → validate → write → score), Spec 122 §1.10 |
| form | **compressed (R-PACE-1)** | **5 converted INGESTOR members + `link_neighbourhoods` already converted; R-AH makes compressed the DEFAULT** [plan §0] — the literal marker line in the §0 header |
| write class | **A `guarded_upsert`** | one ON-CONFLICT upsert, `retract:"none"`, no steady-path DELETE (§1.1) |
| `retract` | **`"none"`** | class C REJECTED — a DELETE would orphan FK-referenced rows (§1.1, plan §11) |
| `txn_scope` | **`"step"`** | legacy is boundaries txn + 5 autocommit UPDATEs + bulk txn; the runner owns one txn for the step — **N-D8** |
| externals | **2** — `ckan:neighbourhoods-4326` (`format:"geojson"`, primary, `key_property:"AREA_SHORT_CODE"`) + `ckan:nbhd-2021-census-profile` (`format:"xlsx"`, `role:"lookup"`) | plan §4; requires the 0v (LANDED) + 0w (LANDED `4ea7621e`, RE-FREEZE #27, §5.1) prerequisites |

### 6.1 Defect ledger

**PIN in wrong form — never fix inside the conversion (Spec 121 §4.3 / Spec 123 §3.1); each F-commit is
separate and RED→GREEN.** **Every id `N-D1`…`N-D20` appears EXACTLY once below** (20 rows = the distinct
`N-D<n>` ids found by `grep -o "N-D[0-9]*"` on the plan, `sort -u`) — no id number is skipped by the plan, and
no behaviour is invented for a missing id. Vocabulary: `Kind` ∈ {`deviation`, `limitation`}; `Disposition` ∈
{`knowingly-retired`, `pinned-wrong-form`, `data-identical`, `stronger`, `F-commit`}; `Lands` ∈ {`②`, `③`,
`④ F1`, `④ F2`}. `Exposure [MEASURED]` values are transcribed from the plan (plan §2/§11/§13/§14, read-only
SELECTs) — never re-invented here. `Adjudicated by` = the plan ruling or `PENDING orchestrator`. `Status`
mirrors the id's row in `docs/reports/defect-ledger.md` VERBATIM (fast invariant #36 reads the 5th cell of
every defect-id row; a mirror is legal only with an identical status), and no cell carries a raw `|`.
**Id prefix:** the plan of record numbers these `NB-D1`…`NB-D19`; they are renamed **`N-D<n>`** (same
numbers, `NB-D<n>` ≡ `N-D<n>`) because step-validate G6 derives a step's ledger prefix from its slug's
initials [READ `scripts/analysis/step-validate.mjs` `defectPrefixFor`: `neighbourhoods` → `N`] and scored 0
(a G6 hard stop) on `NB-D` rows [MEASURED 2026-09-28 `step-validate --step=neighbourhoods --fast`].

| NB id | Behaviour (greppable anchor in the script) | Kind | Disposition | Status | Exposure [MEASURED] | Lands | Adjudicated by |
|---|---|---|---|---|---|---|---|
| **N-D1** | the `INSERT` omits `geom` — `` `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)` `` lists only 3 columns; `geom` appears ONLY in the `SET` arm `` `geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` `` ⇒ a NEW row gets `geom` **NULL** (standard codegen would write it) | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | insert path **dead** on live input: `created_at` = 2026-02-20 on **158/158**, `geom IS NULL` **0/158**, **no trigger** on `neighbourhoods` [MEASURED pg_trigger] (`records_new:0` is a hard-coded literal, NOT evidence — Fold CF-4). Visible as the ONE declared key in the cohort's **I-arm**; declared check `boundary_rows_inserted` WARN `viol == 0` over `written.inserted` | **②** | plan §11 N-D1 + Fold CF-4 (Schema-Fidelity/Op-Model seat ≠ discoverer) — **ALLOWED** |
| **N-D2** | the 8 census `UPDATE`s are unguarded/autocommit — `` `UPDATE neighbourhoods AS n SET ${dbCol} = v.val` `` · `` `married_pct = COALESCE(v.married_pct, n.married_pct),` `` ⇒ **1,264 tuple rewrites** (158×8) on an UNCHANGED source; converted merges them into the SAME upsert (`guard_columns` widened; `on_empty:"preserve_null"`) | deviation | `data-identical` | OPEN · **PIN** (declared deviation at ②) | census fold **proven byte-identical** (Fold CF-5): 14 cols × 158 = **2,212 cells; legacy cast = stored 2212/2212; converted untyped-bind cast = stored 2212/2212; cast differs 0**; 1264 tuple rewrites → **0**; display diff only (`records_updated` 158→0). **AP-D4 / M-D3 precedent** | **②** | plan §11 N-D2 (orchestrator) + Fold CF-5 |
| **N-D3** | counters `records_total: boundaryCount`, `records_updated: boundaryCount`, `` `records_new: 0,` `` — `records_new` is a **hard-coded literal** reporting 0 on EVERY run even when it inserts; `records_updated` = `boundaryCount` even on an unchanged source | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | live runs since 2026-06-10 (1081…1480) = `records_total 158, new 0, updated 158` on an **UNCHANGED source** [MEASURED plan §2]. **Declared golden-diff key** (158→0); converted counters come from `written.*` | **②** | plan §2 B13 / §11 (orchestrator) — AP-D4 precedent |
| **N-D4** | PostGIS probe + optional `SET` arm — `` `SELECT 1 FROM pg_extension WHERE extname = 'postgis'` `` · `` `const geomLine = hasPostGIS` `` · `` `has_postgis: hasPostGIS,` `` ⇒ the `has_postgis` INFO row + the conditional string-build | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | the probe is a DB state fact, not data: converted declares `guards.requires [{extension postgis, fail}]`; the `has_postgis` INFO row **retired** [plan §2 B5] | **②** | plan §2 B5 / §4 (orchestrator) |
| **N-D5** | local `data/` cache + `argv[2]/[3]` paths — `` `if (fs.existsSync(destPath)) fs.unlinkSync(destPath);` `` · `` `boundariesPath = path.join(__dirname, '..', 'data', 'neighbourhoods-4326.geojson');` `` · `` `profilesPath = path.join(__dirname, '..', 'data', 'neighbourhood-profiles-2021.xlsx');` `` · `` `let boundariesPath = process.argv[2];` `` | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | the local cache IS byte-identical to live CKAN (curl, both files) [MEASURED plan §2]; converted acquisition = CKAN every run, `cache:"none"`. **M-D10 precedent** | **②** | plan §2 B1 / §11 (orchestrator) — M-D10 precedent |
| **N-D6** | key arms `` `safeParsePositiveInt(props.AREA_S_CD` (OR-chain over `AREA_S_CD`, `AREA_SHORT_CODE`, `AREA_ID`, default `'0'`) `` — the `AREA_S_CD` arm is DEAD, the `AREA_ID` arm would key **158 garbage rows** (7-digit ids, e.g. 2502366) | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | `AREA_S_CD` **absent** on 158/158; `AREA_ID` = 7-digit ids ⇒ would key 158 wrong rows [MEASURED plan §2]. Converted `key_property:"AREA_SHORT_CODE"`; refusal survives as `bad_key_count` FAIL>0 | **②** | plan §2 B2 / §11 + Fold H-2 (orchestrator) |
| **N-D7** | duplicate key in the file aborts — `` `ON CONFLICT (neighbourhood_id) DO UPDATE SET` `` ⇒ `cannot affect row a second time` halts the run; the converted dedupe WOULD proceed | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | **0 dups measured** [MEASURED plan §2, Fold CF-8]. Refusal **preserved** as `duplicate_key_count` **`pre_write` FAIL >0** (`order_guarantee` anchored in Spec 57 at ②) | **②** | plan §2 B11 / Fold CF-8 (orchestrator) |
| **N-D8** | transactions split — `` `await pipeline.withTransaction(pool, async (client) => {` `` + 5 autocommit UPDATEs + `` `// Bulk update: married, university_degree` `` (its own txn) ⇒ a mid-run crash can leave a half-census state | deviation | `stronger` | OPEN · **PIN** (declared deviation at ②) | crash window is a **state reachability** change (not data): converted `txn_scope:"step"` makes the partial-census state **unreachable** (stronger, not weaker) [plan §2 B9] | **②** | plan §2 B9 / §4 (orchestrator) |
| **N-D9** | `VACUUM ANALYZE` on every run — `` `await pool.query('VACUUM ANALYZE neighbourhoods');` `` (after both load phases, before the telemetry snapshot) | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | the legacy trigger is the backfill's dead tuples (~**1,264** dead tuples ≈ 70 %+ on a 158-row table, in-file comment) [plan §2 B10]. Converted `execution.maintenance [{vacuum_analyze, neighbourhoods, self}]` gated on `neighbourhoods_dead_tuple_ratio_warn_max`; trigger differs (data-invisible) → **VERIFY-INT-3**. **M-D12 precedent** | **②** | plan §2 B10 / §3 / Fold H-1 (orchestrator) — M-D12 precedent |
| **N-D10** | audit row `` `{ metric: 'census_rows_matched', value: profileUpdates, threshold: null, status: 'INFO' }` `` — a **countable** census-match metric kept as pure `INFO` (never verdict-capable) | **limitation** | `F-commit` | OPEN · **PIN** (carried, Spec 123 §3.1) | live value **31** on the unchanged source; a threshold (31) IS possible ⇒ a WARN floor is a fixable **limitation**, not a preserved defect [plan §2 B12; R-H] | **④ F2** | plan §2 B12 / §11 + `④ F2` (orchestrator) — R-H |
| **N-D11** | verdict parallel boolean — `` `const hasFails = boundaryCount < 158;` `` → `` `verdict: hasFails ? 'FAIL' : 'PASS',` `` (re-derives the row's own threshold instead of folding row statuses) | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | **Rule 10 violation**; no data exposure (healthy input ⇒ PASS on both paths). Converted verdict is **row-derived** (`verdict.js`), the `parcels` / `address_points` shape [plan §2 B12] | **②** | plan §2 B12 / Fold H-1 (orchestrator) |
| **N-D12** | `emitMeta` reads publisher-vocabulary **labels**, not fields — `` `{ "City GeoJSON": ["AREA_SHORT_CODE", "AREA_NAME", "geometry"], "Census XLSX": ["income", "tenure", "demographics"] }` `` | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | the lineage map records a **fiction** (`"income"/"tenure"/"demographics"` are categories, not fields). Converted `deriveMeta` declares truthful reads/writes/external ids; regenerate `lineage-meta-snapshot.json` + `data-lineage-map.md` at ② (**Rule 1**). **M-D6 precedent** | **②** | plan §2 B14 / §14 Fold H-1 (orchestrator) — M-D6 precedent |
| **N-D13** | boundary geometry binding — `` `? ', geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)'` `` writes the WKB from the jsonb; the converted validator **Multi-wraps / skips** a non-polygon feature where the legacy wrote whatever parsed | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | **0 exposure measured** — all 158 features are `MultiPolygon`, `geom geometry(Geometry,4326)`, **0 invalid**, stored `geom` = fresh derivation 158/158 [MEASURED plan §2] | **②** | plan §2 B4 / §11 (orchestrator) |
| **N-D14** | the census push is keyed on matched ids; a feature skipped at the boundary stage (`` `Skipping feature with missing ID or name` ``) contributes no census update, and a table row whose key is absent from the primary this run receives no census write (widened by Fold CF-5) | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | **0 exposure** — GeoJSON-ids ≡ XLSX-ids ≡ DB-ids **158/158, 0 either side**; **0 table rows with no census entry** [MEASURED plan §2, Fold CF-5] | **②** | plan §2 B7 / Fold CF-5 (orchestrator) |
| **N-D15** | Spec 57 drift — the script writes INT incomes and no `population`, while Spec 57 §2 documents `population` col / Turf.js / "step 9" / income NUMERIC | deviation | `knowingly-retired` | OPEN · **PIN** (declared deviation at ②) | doc-only (Spec 57 text vs the as-built table/code); **Spec 57 as-built at ②** (INT incomes, no `population`, step 17) [plan §2 B17] | **②** | plan §2 B17 / §6 ② (orchestrator) |
| **N-D16** | acquisition has **no timeout and no retry** — `` `get(url, (response) => {` `` with no timeout/retry token; a transient 502 halts the run | **limitation** | `F-commit` | OPEN · **PIN** (carried, Spec 123 §3.1) | cloud run **34769829628** (2026-09-13) halted at 17/28 on an un-retried `https.get`; the 502 is **cloud-only** and NOT in the local ledger (15 local runs, 0 failed); legacy `retries:0` ⇒ ④ F1 is a **behaviour change** (RED→GREEN) [plan §2 B1; POST-B1-8 `programme-items.json` `NOT_STARTED`] | **④ F1** | plan §2 B1 / §6 ④ F1 / §11 (orchestrator) |
| **N-D17** | a null-geometry feature — the `UPDATE` arm's `` `geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` `` **throws** `invalid GeoJSON representation` on the jsonb `'null'`; the `INSERT` arm stores `geometry = 'null'::jsonb` ⇒ the run FAILS | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | **0 exposure** — **0/158** null geometries [MEASURED plan §2, Fold CF-8]. Converted parser skips + counts `null_geometry_count`; refusal **preserved** as a `pre_write` **FAIL** `viol == 0` + `order_guarantee` (Spec 57) — **no silent skip** | **②** | plan §11 (orchestrator fold) + Fold CF-8 |
| **N-D18** | a census-only change fires the merged guard, whose `SET` also rewrites `` `, geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` `` — the legacy leaves `geom` alone on a census `UPDATE` ⇒ a geom-drifted row with a census change **heals under converted only** | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | **0 rows today** — `ST_SetSRID(ST_GeomFromGeoJSON(geometry::text),4326) = geom` **158/158** [MEASURED Fold CF-5]; fix post-conversion. **Cohort arms C and Q MUST be DISJOINT** (stated in `cohort.json`) | **②** | plan §11 (orchestrator fold) + Fold CF-5 (completing CF-4/CF-6/CF-8) |
| **N-D19** | the HEAD is **new network surface** — the legacy issues a bare `` `get(url, (response) => {` `` with NO HEAD; converted `acquireExternal` HEADs every url'd external, so with `on_head_error` absent (`fail_step`) a HEAD-only 5xx **FAILS a run legacy would have completed** | deviation | `pinned-wrong-form` | OPEN · **PIN** (declared deviation at ②) | **0 exposure** on local runs (never HEADed) [MEASURED Fold H-5]. ② declares `on_head_error:"warn_row"` on BOTH externals (WARN row `head_error` + proceed = closest parity to "no HEAD") — moved out of F1 | **②** | plan §14 Fold H-5 (Op-Model seat) |
| **N-D20** | the legacy boundary guard compared name/geometry only, never the step-written `geom` — `` `WHERE neighbourhoods.name IS DISTINCT FROM EXCLUDED.name` `` ⇒ a geom that drifted from its geometry derivation never healed (the parcels 9,855-NULL-geom class) | deviation | `stronger` | OPEN · **PIN** (declared deviation at ③) | **0 exposure** (derived = stored **158/158**); forced cohort Q arm: legacy 5/5 NOT healed, converted 5/5 healed [MEASURED 2026-09-28]. Orchestrator ruling 2026-09-28 (parcels D2 + address_points/load_ravines precedent; class lock `src/tests/steps/geometry-guard-coverage.logic.test.ts`): `geom` joins `guard_columns` | **③** | orchestrator ruling 2026-09-28 (parcels D2 + address_points/load_ravines precedent) |

**Closing line.** **④ F1 (N-D16) and ④ F2 (N-D10) are separate post-conversion commits, each RED→GREEN.** **No
id is `PENDING orchestrator`** — the plan resolved every one of `N-D1`…`N-D20` (§2 / §11 / §13 / §14):
`N-D1/2/3/4/5/6/7/8/9/11/12/13/14/15/17/18/19/20` are **deviations** landing at ② (carried with `adjudicated_by`),
`N-D10` + `N-D16` are **limitations** landing at **④ F2 / ④ F1**. **No `N-D` id number is skipped by the
plan** (`grep -o "N-D[0-9]*"` → **20** distinct ids, all transcribed above; no invented behaviour).

### 6.2 Cross-step findings (not this step's defects)

> Defects found while sweeping the registry that belong to OTHER steps/specs — filed as `review_followups.md`
> rows (or doc-only edits) at ③, **never** fixed inside this conversion (Spec 121 §4.3). None is an `N-D` id;
> each is flagged with its owner.

- **NB-X1 — `assert_schema` accepts the RETIRED key.** `scripts/lib/compute/assert-schema.js`
  `` `const NEIGHBOURHOOD_ID_PROPS = ['AREA_SHORT_CODE', 'AREA_ID'];` `` (used by
  `` `const ok = NEIGHBOURHOOD_ID_PROPS.some((p) => keys.includes(p));` ``) still accepts **`AREA_ID`**, the arm
  **N-D6 retires** as a key (the `AREA_ID` arm would key 158 garbage rows). ⇒ **narrow in an `assert_schema`
  WF3**, NOT here. The SAME GeoJSON URL is a **2nd literal home** in `assert-schema.descriptor.json`
  (`` `{ "id": "neighbourhoods_geojson", "kind": "http_file", "cache": "none" }` ``) — a **Rule 1** duplication
  ⇒ followup [plan §1(c), plan §3(c)]. *(Owner: assert_schema / quality.)*
- **NB-X2 — `compute-cost-estimates` meta lies about its read.** `scripts/compute-cost-estimates.js` reads
  `` `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id` `` (join on `id`) but its `pipeline_meta` reads
  list is `` `['neighbourhood_id', 'avg_household_income', 'tenure_renter_pct']` `` (the `neighbourhoods:` key of its meta reads) — meta
  lists `neighbourhood_id` while the SQL reads `id`. ⇒ followup (theirs) [plan §1(c)].
  *(Owner: compute-cost-estimates / Spec 80.)*
- **NB-X3 — `acquire.js` "retried THREE times" text — ALREADY CORRECTED (0v).** `grep` of
  `scripts/lib/step/acquire.js` for `retried THREE times` returns **no match**: the doc comment now reads
  `` `load-centreline.js`'s `downloadZipWithRetry` retried, THREE times with no backoff.` `` — i.e. the false
  claim that the legacy loaders (`load-neighbourhoods.js` **and** `load-parcels.js`, both no-retry) "retried
  THREE times" **has already been fixed in the 0v commit** (Fold CF-1 says it would be corrected in the same
  file). **Grep result: 0 hits for the false form; the corrected centreline-specific form is present.** ⇒
  **no ③ action** [plan Fold CF-1 NB-X3; §5.1 0v LANDED]. *(Owner: closed by 0v.)*

## 7. PH-6 — Literal ledger (Rule 3)
<!-- ANCHOR:§7 -->

> **Filled at ①** (this engine share): §7.0 = plan §5 literals, §7.1 = Fold H-2 literals + the registered-variable
> table. Rule 3 complete for `scripts/load-neighbourhoods.js`.

> Plan §5, transcribed **row-for-row**, then **extended by Fold H-2** (whose rows are ADDED to §5). Every
> literal `[READ]` in the 719 lines, its disposition, and the registered name it becomes. Adjudications are the
> orchestrator's (plan §5 / §14 Fold H-2), never re-decided here. Every constant below is either a descriptor
> field, a **logic variable** (registered in `scripts/seeds/logic_variables.json`), a **storage-format
> constant** in `notes.json` (parcels D3 precedent), or `knowingly-retired`. **Anchors are greppable
> substrings of `scripts/load-neighbourhoods.js` — never bare line numbers** (the plan's `:line-line`
> citations drifted).

### 7.0 Plan §5 literals

| Literal (greppable anchor) | Disposition |
|---|---|
| `` `const BOUNDARIES_URL =` `` + `` `const PROFILES_URL =` `` | `inputs.reads.externals[].url` (descriptor data) + `license`; `format:"geojson"` / `"xlsx"` |
| `` `boundaryCount >= 158 ? 'PASS' : 'FAIL'` `` · `` `const hasFails = boundaryCount < 158;` `` | `checks[boundaries_loaded].limit_from_config: sources_neighbourhoods_floor` (**SHARED** floor; the seed description gains a 3rd consumer; bounds IDENTICAL to the 2 existing consumers) — check id keeps the legacy metric name `boundaries_loaded` (Fold H-1) |
| *(none* — the legacy download had **NO** timeout) | `neighbourhoods_download_timeout_ms` via `execution.network` `timeout_from_config` (default set at ②, **≥5× measured download**), `on_invalid:"fail"` |
| `` `const ADVISORY_LOCK_ID = 57;` `` | descriptor `identity.lock:57` (Spec 47 §A.5 row 57) |
| `` `downloaded % (2 * 1024 * 1024) < chunk.length` `` | **retired** (the progress cadence is dead under the whole-array seam; `address_points` commit-9 precedent) |
| characteristic labels · `` `const CONSTRUCTION_PERIODS = [` `` · `` `const periodMap = {` `` · `` `row0Char === 'Neighbourhood Number' \|\| row0Char === 'Neighbourhood ID'` `` · suppression tokens `'...'`, `'x'`, `'F'` · header regex | **publisher vocabulary** in `compute.buildLookup`, each named in `notes.json` (domain data, not tunables) |
| `` `Math.round((data.owner / total) * 1000) / 10` `` · `` `Math.round((d.married / d.total) * 1000) / 10` `` · `` `incomeData[dbCol][info.neighbourhood_id] = Math.round(val);` `` | **storage-format constants** in `notes.json` (changing one rewrites every row; an admin knob would be a false affordance) — parcels D3 precedent |
| *(new)* maintenance | `neighbourhoods_dead_tuple_ratio_warn_max` · `neighbourhoods_maintenance_timeout_minutes` [READ `scripts/lib/step/plausibility.js` `` `${table}_dead_tuple_ratio_warn_max` `` / `` `${table}_maintenance_timeout_minutes` `` key pattern] |
| *(④ F1)* | `neighbourhoods_download_retries` · `neighbourhoods_download_retry_backoff_ms` (0q) |
| *(④ F2)* | `neighbourhoods_census_rows_matched_min` (**31**) |

### 7.1 Fold H-2 literals (rows ADDED to §5)

| Literal (greppable anchor) | Disposition |
|---|---|
| `` `props.AREA_S_CD \|\| props.AREA_SHORT_CODE \|\| props.AREA_ID \|\| '0'` `` | **retired**, **N-D6** (`key_property`) |
| `` `const name = props.AREA_NAME \|\| props.AREA_LONG_CODE \|\| '';` `` | publisher schema identifiers → `shapeRecord`, `notes.json` |
| `` `Failed to parse GeoJSON file ${geojsonPath}: ${err.message} (first 100 chars: ${raw.slice(0, 100)})` `` | carried **verbatim** by 0v (`raw.slice(0,100)` preview — a diagnostic format, not a tunable) |
| `` `if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location)` `` (`200`, `3xx`+`location`) | **retired** → `fetch` in `downloadArchive` (protocol constants) |
| `` `boundariesPath = path.join(__dirname, '..', 'data', 'neighbourhoods-4326.geojson');` `` · `` `profilesPath = path.join(__dirname, '..', 'data', 'neighbourhood-profiles-2021.xlsx');` `` · `` `let boundariesPath = process.argv[2];` `` | **retired**, **N-D5** |
| `` `const sheet = workbook.worksheets[0];` `` · `` `sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {` `` · `` `row.eachCell({ includeEmpty: true }, (cell, colNumber) => {` `` · `_${n}` · `''` fill | **hard-wired in 0w's `parseXlsx`** (file-structure constants; the csv hard-wired-options precedent [READ `step.schema.json` `csv_options` x-ruling]); named in the 0w x-ruling + `notes.json`. Workbook: 2 sheets, sheet[0] `hd2021_census_profile`, 159 headers, 2,603 data rows, values string/number only [MEASURED probe] |
| char-column candidates + `headerKeys[0]` fallback · `` `row0Char === 'Neighbourhood Number' \|\| row0Char === 'Neighbourhood ID'` `` | publisher vocabulary → `buildLookup`, `notes.json` |
| every characteristic label (incl. the 5 `startsWith('Total - …')` prefixes — `` `characteristic.startsWith('Total - Marital status for the total population aged 15 years and over')` `` · `` `characteristic.startsWith('Total - Highest certificate, diploma or degree for the population aged')` `` · `` `characteristic.startsWith('Total - Immigrant status and period of immigration for the population in private households')` `` · `` `characteristic.startsWith('Total - Visible minority for the population in private households')` `` · `` `characteristic.startsWith('Total - Knowledge of official languages for the')` ``) + the `’` (U+2019) normalisation | **publisher vocabulary** (extends the §7.0 row) |
| `` `if (idVal > 0) {` `` · `` `if (total > 0) {` `` (period `val > 0`, `total > 0`) | **sign / ÷0 invariants** (Rule 3 `== 0` exemption class [READ `lib/assert-data-bounds-fields.js` `whyText`]) |
| SQL casts `::int[]` / `::float[]` / `::text[]` / `::jsonb[]` (`` `unnest($3::jsonb[])` ``) | **retired** → `write.js` binds by declared column (**CF-5 cast parity 2212/2212**) |
| `` `, geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` `` (SRID `4326`) | `geometry_srid` **absent ≡ 4326** (0i) |
| audit `` `phase: 9,` `` + `` `name: 'Neighbourhood Boundaries',` `` | **Fold H-1** (`varies_by_chain.phase {sources:9}`, `identity.display_name`) |
| `` `{ metric: 'has_postgis', value: hasPostGIS ? 'yes' : 'no', threshold: null, status: 'INFO' }` `` (`'yes'/'no'`) · `` `{ "City GeoJSON": ["AREA_SHORT_CODE", "AREA_NAME", "geometry"], "Census XLSX": ["income", "tenure", "demographics"] }` `` (`emitMeta` labels) · `` `duration: \`${(durationMs / 1000).toFixed(1)}s\`,` `` · `` `(downloaded / 1024 / 1024).toFixed(1)` `` | **retired** (**N-D4** / **N-D12** / runner logging) |
| `viol == 0` ×4 new checks (`boundary_rows_inserted`, `null_geometry_count`, `duplicate_key_count`, `bad_key_count`) | **estate convention** (443 uses) — Fold CF-4/CF-5 |

**Retired literals** (no registered name): the `2 MiB` progress cadence; the `data/` cache paths + `argv[2]/[3]`
(N-D5); the `has_postgis` `'yes'/'no'`; the `emitMeta` label list (N-D12); the `phase: 9` / `name` literal
(re-expressed as `varies_by_chain.phase` / `display_name`); the SQL `::…[]` casts. **Storage-format constants —
NOT tunables** (parcels D3 precedent; named in `notes.json` at ②): the characteristic vocabulary,
`CONSTRUCTION_PERIODS`, `periodMap`, `'Neighbourhood Number'/'ID'`, the suppression tokens, the header regex,
the `’` normalisation, `Math.round`, `*1000/10`.

**Registered-variable table — Fold H-2 verbatim (7 variables).** Each: descriptor `config[]` entry with
`min`/`max`/`on_invalid`, a seed row + `admin.group`, GROUPS regenerated via `generate-logic-variable-groups.mjs`,
`EXPECTED_LOGIC_VAR_KEYS`, local apply via `apply-logic-variables.js`, CLOUD seed as a ③ `cutover_prereq` —
**LM-D15: a missing row throws**. **No variable is seeded at ①.**

| Variable | Seed | Bounds | on_invalid | Group | Lands |
|---|---|---|---|---|---|
| `sources_neighbourhoods_floor` (shared; **3rd consumer**) | 158 | 1–1000 (**IDENTICAL** to the 2 existing consumers) | `fail`, `hoisted_above_gate:true` (the seed description's own warning) | Sources Catastrophic-Load Floors | ② (description gains the consumer) |
| `neighbourhoods_download_timeout_ms` | 60000 (fleet INGESTOR default; legacy had none — AP/parcels precedent [READ `logic_variables.json:5040-5070`]) | 1000–1800000 | `fail` | Source Ingestion | ② |
| `neighbourhoods_dead_tuple_ratio_warn_max` | 0.3 | 0–5 | `clamp` | Data Quality Thresholds | ② (name FIXED by `` `${table}_dead_tuple_ratio_warn_max` `` [READ `scripts/lib/step/plausibility.js`]) |
| `neighbourhoods_maintenance_timeout_minutes` | 15 | 1–60 | `clamp` | Source Ingestion | ② (`` `${table}_maintenance_timeout_minutes` `` [READ `scripts/lib/step/plausibility.js`]) |
| `neighbourhoods_download_retries` | 2 (legacy 0 ⇒ F1 is the behaviour change, RED→GREEN) | 0–10 | `clamp` (IC-8) | Source Ingestion | ④ F1 |
| `neighbourhoods_download_retry_backoff_ms` | 0 | 0–60000 | `clamp` | Source Ingestion | ④ F1 |
| `neighbourhoods_census_rows_matched_min` | 31 | 0–1000 | `fail` (`limit_from_config`, verdict-affecting, G-4) | Data Quality Thresholds | ④ F2 |

**No variable is seeded at ①** — all seven land at ②/④ (Ears: `scripts/seeds/logic_variables.json` rows +
`admin.group` + GROUPS regeneration + local apply + a CLOUD seed item in the ③ checklist, per plan §5 / Fold H-2).

## 8. Non-determinism inventory (before the first golden)
<!-- ANCHOR:§8 -->

> The PRE golden must be projected so that a repeat run on the same source yields a byte-identical
> projection. Every key below is either **out of projection**, **normalised**, or **pinned by equality**
> against the PRE capture. Values are transcribed `[MEASURED 2026-09-25, plan §2 / Fold CF-6]` — none
> invented.

| Key | Why non-deterministic | Handling in the projection |
|---|---|---|
| `id` (serial PK) | each `ON CONFLICT (neighbourhood_id) DO UPDATE` attempt still evaluates `nextval` (serial burn): sequence `last_value` **948** vs `max(id)` **158** [MEASURED plan Fold CF-6 (iv)] ⇒ the PK is a function of run COUNT, not of the data. | **Out of projection** — never a golden key; `id` is `db_default` and never written [plan §4]. The burn is **identical on both paths** [Fold CF-6], so it cannot differential the PRE/POST compare. |
| `created_at` | all 158 rows carry **2026-02-20** [MEASURED plan §2 "Table facts"]; a *newly inserted* row would carry `now()` instead (`db_default`), so the column is data-dependent for new rows only — and the legacy INSERT omits it. | **Out of projection** — `db_default`, never written; the 158/158 existing values are constants of the fixture, not of the run. |
| `duration_ms` | `Date.now()` delta measured after the downloads [READ `` `const durationMs = Date.now() - startTime;` ``] ⇒ wall-clock, differs every run. Legacy writes it into `records_meta`; converted sources it from `ctx.elapsed_ms` (the `compute/link-neighbourhoods.js:324` idiom). | **Normalised** in the golden projection (the fleet-standard volatile key) [plan §14 Fold H-1 (A) `duration_ms` row]. |
| `census_year` | `db_default` **2021** [MEASURED plan §2]; the step never writes it [plan §4]. | Out of projection (a DB default, not a written column). |
| `pipeline_meta` | legacy `emitMeta` emits publisher-vocabulary read *labels* (`"Census XLSX": ["income","tenure","demographics"]`, **N-D12**) rather than field lists; converted `deriveMeta` reads real columns/external ids. | Runner-supplied; **regenerated**, not compared as a data key — `lineage-meta-snapshot.json` is regenerated in ② or the lineage infra test goes red [plan §14 Fold H-1 (A)/(B)]. |
| `chain_run_id` | runner-supplied per chain invocation [READ `index.js:5495`; plan §14 Fold H-1 (B)]. | Runner key — excluded from the data projection (the seam reads its *presence* only, `records_meta ? 'chain_run_id'`). |
| `code_sha` | runner-supplied build identity; changes with every commit. | Runner key — out of projection. |
| acquired `content_hash` | the legacy reads the **local `data/` cache** (`existsSync`), the converted **downloads live** ⇒ a POST run compares a cached byte-for-byte file against a live fetch. | **Must be pinned by equality**, not excluded: the POST differential asserts both acquired `content_hash` values equal the PRE sha256 prefixes — **`b0cb5807…`** (GeoJSON) and **`9a3c3729…`** (XLSX) [MEASURED plan §2, plan Fold CF-6 (iv)] — **or the differential is VOID**. Byte-identity of cache vs CKAN is separately MEASURED [plan §2]. |

**Not in this table because they are deterministic:** `boundaries_loaded` (= `ids.length`, pre-dedupe),
`census_rows_matched` (`matchedRows`), the 17 written columns (pure functions of the two source files), and
the `audit_table` row order (descriptor order) [plan §14 Fold H-1 (A)].

---

## 9. PRE goldens + forced-change cohort
<!-- ANCHOR:§9 -->

**The two capture commands, as ACTUALLY run** (orchestrator seat; live DB `127.0.0.1:54322/postgres`,
worktree @ `90ae17d0`) — the plan §6 ① form plus `--tables=neighbourhoods` (no descriptor exists yet, so the
table must be named), the 20-column projection spelled out, and `--invariants=`:

```
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-neighbourhoods.js --chain=sources --out=docs/reports/golden/neighbourhoods/pre/sources.json --tables=neighbourhoods --table-columns=neighbourhoods:neighbourhood_id,name,geometry,geom,avg_household_income,median_household_income,avg_individual_income,low_income_pct,tenure_owner_pct,tenure_renter_pct,period_of_construction,couples_pct,lone_parent_pct,married_pct,university_degree_pct,immigrant_pct,visible_minority_pct,english_knowledge_pct,census_year,top_mother_tongue --table-order=neighbourhoods:neighbourhood_id --invariants=docs/reports/golden/neighbourhoods/invariants.json
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-neighbourhoods.js --chain=none --out=docs/reports/golden/neighbourhoods/pre/standalone.json --tables=neighbourhoods --table-columns=neighbourhoods:neighbourhood_id,name,geometry,geom,avg_household_income,median_household_income,avg_individual_income,low_income_pct,tenure_owner_pct,tenure_renter_pct,period_of_construction,couples_pct,lone_parent_pct,married_pct,university_degree_pct,immigrant_pct,visible_minority_pct,english_knowledge_pct,census_year,top_mother_tongue --table-order=neighbourhoods:neighbourhood_id --invariants=docs/reports/golden/neighbourhoods/invariants.json
```

`--table-order=neighbourhoods:neighbourhood_id` is the determinism anchor for the table projection (the `id`
serial is non-deterministic, §8, and is deliberately not in `--table-columns`) [plan §6 ①]. The 20
projection columns are `neighbourhood_id, name, geometry, geom`, the **14 census columns**
(`avg_household_income` … `english_knowledge_pct`), `census_year`, `top_mother_tongue` — the `--table-columns` list above spells out
what the plan wrote as `<14 census>` [plan §6 ①]. `invariants.json` (row_count 158, geom_null 0, invalid_geom
0, geom_types MULTIPOLYGON=158, geom_equals_geometry_derivation 158, census_all_14_non_null 158,
top_mother_tongue_non_null 0, id_key_map_hash `b6d78983a0788478b70594f66c086460`, shifted_key_range_rows 0)
is passed via `--invariants=`.

(Corrected at ②: the ① text of this block listed 15 non-existent columns; the golden's own `table_state[0].columns` is the record of what ran.)

### 9.1 Captured (MEASURED 2026-09-28)

Orchestrator seat, local DB `127.0.0.1:54322/postgres`, worktree @ `90ae17d0`. **All numbers below are
transcribed from the run that produced `pre/sources.json`, `pre/standalone.json`, `forced/cohort.json` and
`forced/pre.json` — none are invented here.**

**PRE goldens** — `pre/sources.json` **and** `pre/standalone.json`, both **exit 0**, verdict **PASS**:
`records_total` **158** / `new` **0** / `updated` **158**; `boundaries_loaded` **158**; `census_rows_matched`
**31**; `table_state` neighbourhoods **158 rows**, content_hash **`9b111a6a18a701666746bfd2ceee0bdb`** on
**BOTH** chains (**identical ⇒ R-AI holds**). `invariants.json` asserted: row_count 158, geom_null 0,
invalid_geom 0, geom_types MULTIPOLYGON=158, geom_equals_geometry_derivation 158, census_all_14_non_null 158,
top_mother_tongue_non_null 0, `id_key_map_hash` **`b6d78983a0788478b70594f66c086460`**, shifted_key_range_rows
0. The worktree had **no `data/` cache**, so the legacy **downloaded live**: sha256 GeoJSON
**`b0cb58077f5b3a47e0e56a68913c6980cfaf39d37d7d020fd91b60650c480233`**, XLSX
**`9a3c372907e9de09407d847398703146a9cfc0f5b2217446fd61ab8ab35345eb`** — **the plan §2 values exactly**.

**Cohort** — `scripts/analysis/neighbourhoods-cohort-differential.js --derive`: I=[1,2,3,4,5] N=[6..10]
G=[11,12,13,15,16] C=[18,19,20,21,22,23,24,25,27,28] Q=[29..33] negative_control=**128**; baseline_hash
`9b111a6a…` (**= the PRE golden**), baseline_id_hash `b6d78983…`.

**Forced run** — `--run --side=pre` → `forced/pre.json`: preamble **0 active client backends**; advisory locks
**92, 78, 195** held (`link_neighbourhoods`, `build norms`, `storey norms` — the FK-ref writers) for the
bracket. **Deviation from plan Fold CF-6 (i) "hold lock 57"** — see the restore bracket below. Perturbed hash
**`af1662e5800da5268d4a19abe4e2c8a3`**. Legacy run: `records_total` **158** / `new` **0** / `updated` **158**
(N-D3 literals). Post-run table **163 rows**, content_hash **`c486a1f3219d300c658c530cac80c699`**. **PASS**.
Restore: FK counts `permits` 0 / `storey_norms` 0 / `build_norms` 0 → **deleted the 5 step-inserted rows**,
**updated 30/30 from the before-image**; hash **`9b111a6a…`**, id hash **`b6d78983…`**, **158 rows** =
baseline; **restored: true**, re-verified by an **independent read-only query** afterwards.

**Declared-for-② note:** `forced/pre.json`'s `id_key_map_hash` (**`94fd5ecc…`**) includes the 5 step-inserted
serial ids, which the serial burn makes run-specific — the POST value will differ **by construction**; ②
compares forced pre/post on `table_state` + the other invariants and **never** on that one key.

**PRE forced-change cohort (R-AS; DELETE-free because of the FKs)** [plan §6 ①, transcribed as the DESIGN
with the Fold CF-5/CF-6 amendments]:

- Committed at `docs/reports/golden/neighbourhoods/forced/cohort.json`; **deterministic `ORDER BY
  neighbourhood_id` picks**; the before-image is exported FIRST so the restore is a pure replay.
- **Arms** (MEASURED 2026-09-28, §9.1 — values are the witnesses the forced `pre` run produced):
  - **I = 5 rows, key-shift** — `neighbourhood_id += 100000`. The FKs reference `id`, **untouched** [MEASURED
    plan Fold CF-6], so the shift itself orphans nothing; the loader then INSERTs 5 new rows and the legacy
    leaves their `geom` NULL (**N-D1**, the ONE declared POST diff). **MEASURED: new rows 5/5 at the I keys,
    `geom` NULL 5/5 (N-D1), shifted originals 5/5 untouched.**
  - **N = 5 rows** — `name || ' ~'`. **MEASURED: arm hash back to baseline (healed).**
  - **G = 5 rows** — `geometry` translated 1e-4° (jsonb) **plus the matching `geom`** (so the jsonb and WKB
    stay consistent). **MEASURED: arm hash back to baseline (healed).**
  - **C = 10 rows** — census-only: `avg_household_income+1`, `married_pct=NULL`, `period_of_construction='x'`.
    **MEASURED: arm hash back to baseline (healed).**
  - **Q = 5 rows** — `geom`-only translate (the **guard-composition witness**: neither legacy nor converted
    heals it). **MEASURED: Q 5/5 NOT healed.**
  - **negative control** = the other **128** rows (`158 − 5 − 5 − 5 − 10 − 5 = 128`): must be **untouched** on
    both paths. **MEASURED: negative-control hash unchanged.**
- **C and Q MUST be DISJOINT** (Fold CF-5, **N-D18**): a census-only change fires the merged guard, whose
  `SET` also rewrites `geom` — so a row in both C and Q would test two effects at once and the geom-only
  witness would be destroyed. `cohort.json` states the disjointness explicitly.
- **Run LEGACY → `forced/pre.json`.** **MEASURED: `records_total` 158 / `new` 0 / `updated` 158** (N-D3
  literals); table after the run **163 rows**, content_hash **`c486a1f3219d300c658c530cac80c699`**; verdict
  **PASS**. (Preamble 0 active client backends; perturbed hash `af1662e5800da5268d4a19abe4e2c8a3`.)
- **Unconditional restore bracket** [plan §6 ①, hardened by Fold CF-6]: (i) the preamble asserts no other
  non-idle session in `pg_stat_activity` — **NOT** the ledger, which carries stale `running` rows (`1985
  link_wsib`, `1737` `enrich_ravines`) [MEASURED] — and **holds advisory lock 57** for the whole bracket;
  **DEVIATION (MEASURED 2026-09-28): the run held locks 92, 78, 195 instead of 57** — the step under test
  takes **57 itself** via `pg_try_advisory_xact_lock`, so holding 57 would make the forced run **SKIP**; the
  consumer locks (`link_neighbourhoods`, build norms, storey norms — the FK-ref writers) **close the same
  window**;
  (ii) before the DELETE, assert `NOT EXISTS` a reference to the 5 NEW ids in
  `permits` / `neighbourhood_build_norms` / `neighbourhood_storey_norms` — on violation **HALT**, never let an
  FK action fire; (iii) DELETE-then-shift order kept (UNIQUE on `neighbourhood_id`); (iv) shift I back and
  restore N/G/C/Q from the before-image; then **assert the table hash == BASELINE**. **MEASURED 2026-09-28:**
  the FK counts were `permits` 0 / `storey_norms` 0 / `build_norms` 0, so **the 5 step-inserted rows were
  DELETEd and 30/30 rows were updated from the before-image**; hash **`9b111a6a…`**, id hash **`b6d78983…`**,
  **158 rows** = baseline — **restored: true**, re-verified by an **independent read-only query** afterwards.

### 9.2 Commit ② — POST goldens, forced-change proof, compare (MEASURED 2026-09-28)

- **Capture last:** `step-validate --step=neighbourhoods --fast` five-word PASS on every non-capture-derived
  word before each POST capture (gates C/D/G capture-derived; gate K closed first by the §10 red-evidence
  artifact). Same commands as §9 with `--out=…/post/{sources,standalone}.json` (20-column projection,
  `--invariants` = the ① file).
- **Steady state:** `post/sources.json` and `post/standalone.json`: exit 0, verdict PASS, terminal `loaded`;
  `neighbourhoods` 158 rows, table content_hash `9b111a6a18a701666746bfd2ceee0bdb` — **byte-identical to PRE
  on both chains**; all 9 invariants identical (geom_null 0, invalid_geom 0, MULTIPOLYGON=158,
  geom_equals_geometry_derivation 158, census_all_14_non_null 158, top_mother_tongue_non_null 0, id_key_map_hash
  `b6d78983…`, shifted_key_range_rows 0). Counters new 0 / updated 0 (legacy 0/158, N-D2/N-D3);
  `boundaries_loaded` 158, `census_rows_matched` 31 (= legacy). Maintenance row: dead_ratio 0 ≤ 0.3 ⇒ VACUUM
  skipped (N-D9). **Two-run proof PASS** on every POST capture (run 2 rewrote 0 rows, strict).
- **Source identity (Fold CF-6 (iv)):** the converted run downloaded live; the runner logged `md5 3d3895fe…`
  2,141,269 B and `md5 6ffe6838…` 1,763,175 B = the cohort digests; both files re-downloaded from CKAN after
  the POST runs: sha256 `b0cb5807…0233` / `9a3c3729…45eb` = PRE. CKAN did not republish; the differential is
  valid. (The runner hashes md5 because no post_acquisition trigger is declared; it keeps the hash out of
  records_meta, so the cohort script's post witness now reads the acquisition log line — a ② change to
  `scripts/analysis/neighbourhoods-cohort-differential.js`.)
- **Forced change (R-AS):** same cohort (I 5 key-shift, N 5, G 5, C 10, Q 5, control 128), perturbed hash
  `af1662e5…` (= ①). CONVERTED run → `forced/post.json`: new 5 / updated 20 (legacy new 0 / updated 158 — N-D3
  literals); new rows 5/5 with geom = `ST_SetSRID(ST_GeomFromGeoJSON(geometry::text),4326)` 5/5 and NULL 0/5
  (legacy NULL 5/5 — **N-D1, the one declared key**); N/G/C arm hashes healed; Q 5/5 NOT healed
  (guard-composition witness, both paths); negative-control hash unchanged. Table hash `2762a3fb…` vs legacy
  `c486a1f3…`; **with the 5 new rows' geom NULLed the converted table hashes to
  `c486a1f3219d300c658c530cac80c699` exactly** ⇒ geom on those 5 rows is the ONLY difference. Verdict WARN from
  `boundary_rows_inserted` = 5 (N-D1 visibility, by design). Guarded non-zero capture `post/sources.forced.json`
  (gate G #38): same numbers, two-run proof PASS. Restore after every forced run: FK refs 0/0/0, 5 inserted rows
  deleted, 30/30 restored, table hash `9b111a6a…`, id hash `b6d78983…`, 158 rows = baseline.
- **Compare:** 94 diff keys over the three pairs, every one explained in
  `docs/reports/golden/neighbourhoods/explained-diffs.json` (N-D1/2/3/4/6/9/11/12, runner meta keys, stdout,
  standalone ledger row, forced-pair invariants). `step-validate --fast`: 16/17, hard-stop no, five words PASS.
- **Runtime:** converted run 4.9 s (legacy PRE ~4.3 s), within the declared 5m budget.

### 9.3 Commit ③ — geom guard (N-D20) recapture (MEASURED 2026-09-28)

- **Ruling + class lock:** the boundary guard now names `geom` alongside `name`/`geometry` and the 14 census
  columns (N-D20). Orchestrator ruling 2026-09-28 (parcels D2 + address_points/load_ravines precedent), locked
  as a class in `src/tests/steps/geometry-guard-coverage.logic.test.ts`.
- **Steady POST recaptured** (`sources`, `standalone`, `--overwrite`): the new guard term fires on nothing —
  stored geom = derivation on **158/158** — so both captures are normalised-IDENTICAL to the ② POST, table
  `9b111a6a…`; two-run proof 0 writes (strict).
- **Forced post + `sources.forced` recaptured:** new 5 / updated **25** (N 5 + G 5 + C 10 + **Q 5 now healed**;
  legacy Q 5/5 unhealed), table `eaec22cc74680a4d8f87dabe317a7502`. With the 5 new rows' geom NULLed AND the
  5 Q rows' geom re-translated 1e-4 the table hashes to `c486a1f3…` = the legacy end state ⇒ **N-D1 + N-D20 are
  the only differences**. Diffs vs the ② forced run: `records_updated` 20→25,
  `geom_equals_geometry_derivation` 158→163, the table hash, and `id_key_map_hash` (serial). CKAN sha256
  re-verified `b0cb5807…`/`9a3c3729…` (no republication). Restore **9b111a6a / b6d78983 / 158** after each run.
- **Cohort script:** `scripts/analysis/neighbourhoods-cohort-differential.js` gained `--overwrite` (recapture
  in place rather than refuse on an existing capture) and the side-dependent Q expectation (healed under the
  converted guard's new `geom` term, unhealed under the legacy guard).

---

## 10. Red suite (PH-7)
<!-- ANCHOR:§10 -->

> **File:** `src/tests/steps/neighbourhoods/violations.test.ts` · **Fixtures:**
> `src/tests/steps/neighbourhoods/fixtures/{legacy-harness.ts,features.json,census-sheet.json}`. Both
> landed at ① (§3(a) — the ONLY other `Y` row besides this report). The harness is the **legacy ORACLE** in
> the Spec 123 §4.5 sense: it does **not** require `scripts/load-neighbourhoods.js` in-process (that script
> calls `pipeline.run()` at module scope and would open a pool) — it reads the script as **SOURCE TEXT**,
> strips the shebang and evaluates it inside `new Function` with a curated `require` shim (fake
> `./lib/pipeline` + fake `exceljs` + real `./lib/safe-math` and node builtins). **Every RED value in the
> D-table below is the legacy's OWN OUTPUT**, captured off the fake pool's ordered `pool.query()` stream,
> the `emitSummary`/`emitMeta` payloads and the returned counts — `EXPECTED_CENSUS` was hand-derived (evidence §E5) and is
> RE-PROVEN against the oracle by L5, so a transcription error would turn L5 red. `artifact()` makes every RED claim fail as a **NAMED `MISSING ARTIFACT`**
> (`MISSING ARTIFACT scripts/load-neighbourhoods.descriptor.json — …`), never a `require` crash or a TS
> error: the FIRST statement of every body that touches a future file goes through `loadDescriptor()` /
> `readText()` / `artifact()`.

**Verification (orchestrator-run, 2026-09-28).**
`VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/steps/neighbourhoods --run` ⇒
**`Tests 20 passed (20)`** — **8 legacy pins (L1–L8) + 1 marker test GREEN**, and **11 `it.fails`
expected-fail** (D1–D11). **Reason probe** (all `it.fails` flipped to `it` in a throwaway copy of the
file): **11/11 fail with `MISSING ARTIFACT` and 0 import/TS errors** — **7 name the descriptor / notes
file** (D1, D2, D7, D8, D9, D10, D11) and **4 name the compute module** (D3, D4, D5, D6). D1's second half
— the shell-text assertion `pipeline.run(` is absent / `pipeline.step(` is present — is **unreachable
until the descriptor exists**, because the body's first statement is `loadDescriptor()`; that ordering is
**stated here, not hidden**: at ① the shell still calls `pipeline.run()` [READ
`scripts/load-neighbourhoods.js`], so D1 is red for the descriptor reason FIRST and the shell-text reason
SECOND. `converted.json` `pending[]` `{file, stage:"red_suite"}` is a **`registry_reserved`** edit — **landed by the orchestrator 2026-09-28** (`registers_at: "commit ③"`).

**RED evidence (gate K / G7):** `docs/reports/red-evidence/neighbourhoods/pre2-artifacts-missing.json` — the ② suite (as landed in commit ②) run against the ① tree state (descriptor, notes and compute absent; the shell restored to its ① bytes from 110c8c31; every file sha256-verified back afterwards): 11 assertions failed and 9 passed (the 8 legacy pins, which read the committed pre-② fixture copy, + the report marker), each failure "MISSING ARTIFACT scripts/load-neighbourhoods.descriptor.json" or "…/lib/compute/load-neighbourhoods.js", e.g. `D10 — boundaries_loaded: rows_shaped 157 vs floor 158 ⇒ violations > 0 and value 157; rows_shaped 158 ⇒ violations 0 (flipped GREEN at ②)` — genuine assertion failures, not an import crash.

| Id | Claim | Status | Legacy value (oracle) | RED reason today | Flips at |
|---|---|---|---|---|---|
| **L1** | key/name contract: **3 of the 6** fixture features load, keyed `AREA_SHORT_CODE` with the `AREA_LONG_CODE` name fallback | **`GREEN legacy pin`** | `loadBoundaries` → **3** inserted, 1 query, `params[0] = [1,2,3]`, `params[1] = ['Alpha','Beta Long','Gamma']` | — (from the script's own source text via the oracle) | — |
| **L2** | a non-numeric `AREA_SHORT_CODE` **REJECTS** `/positive integer/` — the run HALTS, it does not skip | **`GREEN legacy pin`** | `await expect(...).rejects.toThrow(/positive integer/)` | — | — |
| **L3** | N-D1: the INSERT column list is exactly `(neighbourhood_id, name, geometry)`; a NEW row leaves `geom` NULL | **`GREEN legacy pin`** | INSERT cols `['neighbourhood_id','name','geometry']`, `geom` **absent**, `geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` present in the SET arm | — | — |
| **L4** | a duplicated key binds `[1,1]` in ONE INSERT under `ON CONFLICT (neighbourhood_id) DO UPDATE` (the B11 refusal) | **`GREEN legacy pin`** | `inserted = 2`, 1 query, params `[1,1]` | — | — |
| **L5** | the census pivot: `(await legacyCensus(fixture grid)).map` equals `EXPECTED_CENSUS` and **15** characteristic rows match | **`GREEN legacy pin`** | `capture.map` deep-equals the 3×14 table; `matched = 15` (3 income + 1 pct + 2 tenure + 3 periods + 2 family + 2 married + 2 immigrant) | — | — |
| **L6** | the 5-pct bulk UPDATE preserves stored values via `COALESCE(v.col, n.col)`; nid **3** absent from the `avg_household_income` params (its cell is suppressed) | **`GREEN legacy pin`** | `married_pct = COALESCE(v.married_pct, n.married_pct)` present; income params `[1,2]`, **not** containing 3 | — | — |
| **L7** | audit floor: **157** boundaries FAILs `boundaries_loaded` (`>= 158`), **158** PASSes; the audit-table verdict follows | **`GREEN legacy pin`** | row `{value 157, threshold '>= 158', status FAIL}`, verdict `FAIL`; at 158 `{status PASS}`, verdict `PASS` | — | — |
| **L8** | a contended advisory lock (**57**) SKIPS SILENTLY: **no summary, no audit row at all** | **`GREEN legacy pin`** | `oracle.summaries` length **0** | — | — |
| **D1** | descriptor AJV-valid; `identity` name/archetype/spec/lock/display_name; `shape "ingest"`; notes file exists; shell text has `pipeline.step(` and NOT `pipeline.run(` | **`RED it.fails`** | L1 (lock 57, display name `Neighbourhood Boundaries`) + the shell's terminal `pipeline.run(...)` | **MISSING ARTIFACT** `scripts/load-neighbourhoods.descriptor.json` (first statement). The shell-text half (`pipeline.run(` STILL present today) is reachable only after the descriptor lands | **`②`** |
| **D2** | externals: primary `ckan:neighbourhoods-4326` `format geojson` `key_property AREA_SHORT_CODE` (N-D6: no `AREA_S_CD`/`AREA_ID` arm); lookup `ckan:nbhd-2021-census-profile` `format xlsx` `role lookup` | **`RED it.fails`** | L1 — the key source is `AREA_SHORT_CODE`; the `AREA_S_CD` arm is dead and `AREA_ID` would key 158 garbage rows | **MISSING ARTIFACT** descriptor | **`②`** |
| **D3** | `coerceKey`: `'1'`→1, `'129'`→129, `'0'`→null, `''`→null, `undefined`→null, `'abc'` throws `/positive integer/` | **`RED it.fails`** | L1/L2 — `safeParsePositiveInt(props.AREA_S_CD ‖ AREA_SHORT_CODE ‖ AREA_ID ‖ '0')`; 0/empty are falsy ⇒ SKIP; non-numeric ⇒ THROW | **MISSING ARTIFACT** `scripts/lib/compute/load-neighbourhoods.js` | **`②`** |
| **D4** | `shapeRecord` name fallback `AREA_NAME ‖ AREA_LONG_CODE`: fixtures (a)/(b) ⇒ `'Alpha'`/`'Beta Long'`; (f) ⇒ the 0p skip reason `'missing_name'` | **`RED it.fails`** | L1 — (a) name `'Alpha'`; (b) has no `AREA_NAME` so the fallback yields `'Beta Long'`; (f) has key `'4'` but NO name ⇒ SKIPPED | **MISSING ARTIFACT** compute | **`②`** |
| **D5** | `buildLookup(LOOKUP_ID, gridToRows(grid), {config:{}})`: `.map` normalised over `CENSUS_COLUMNS` = `EXPECTED_CENSUS`; `.stats.matched_rows = EXPECTED_MATCHED` | **`RED it.fails`** | L5 — the fixture's own 3 neighbourhoods, every absent/÷0 cell null; `matched_rows = 15` | **MISSING ARTIFACT** compute | **`②`** |
| **D6** | `shapeRecord` merge: fixture (a) with `lookups {[LOOKUP_ID]: {1: EXPECTED_CENSUS[1]}}` ⇒ `avg_household_income 100000`; fixture (c) (key 3 absent) ⇒ every census column null (N-D14: keep stored) | **`RED it.fails`** | L5/L6 + Fold CF-5 N-D14 — nid 1 income `Math.round(100000.4) = 100000`; an absent key binds null for every census column | **MISSING ARTIFACT** compute | **`②`** |
| **D7** | preserve_null guard: per census column the `COALESCE(EXCLUDED.c, t.c)` SET arm **and** the `(EXCLUDED.c IS NOT NULL AND t.c IS DISTINCT FROM EXCLUDED.c)` guard; plus name/geometry `IS DISTINCT FROM`; `guard_columns ⊇ name, geometry, all 14` | **`RED it.fails`** | L6 — the bulk UPDATE is literally `COALESCE(v.col, n.col)`; L3/L4 — the boundary guard is `neighbourhoods.name IS DISTINCT FROM EXCLUDED.name` OR `…geometry…` | **MISSING ARTIFACT** descriptor (`buildWritePlan` never reaches the SQL) | **`②`** |
| **D8** | geom on insert: the INSERT column list contains `geom` and the SQL contains `ST_GeomFromWKB(`; the `geom` column is `written:"step"`, `bind:"wkb_geometry"` | **`RED it.fails`** | L3 — the legacy INSERT list is `['neighbourhood_id','name','geometry']`: `geom` is NEVER inserted ⇒ a new row's geom stays NULL (N-D1 knowingly retires that) | **MISSING ARTIFACT** descriptor | **`②`** |
| **D9** | the three pre_write/B11/N-D17/N-D6 refusals: `duplicate_key_count` + `null_geometry_count` FAIL `pre_write` with `order_guarantee` naming Spec 57; `bad_key_count` FAIL; `driveCheck duplicate_key_count` 1 ⇒ `violations 1`, 0 ⇒ `0` | **`RED it.fails`** | L4 — B11: a duplicate key aborts (`cannot affect row a second time`); Fold CF-8 N-D17 (null-geometry fails the run); N-D6 (non-numeric key = refusal) | **MISSING ARTIFACT** descriptor | **`②`** |
| **D10** | floor check B12: `boundaries_loaded` `limit_from_config sources_neighbourhoods_floor` FAIL; `rows_shaped 157` vs floor 158 ⇒ `violations > 0`, `value 157`; `rows_shaped 158` ⇒ `violations 0` | **`RED it.fails`** | L7 — `boundaries_loaded >= 158` FAILs at 157, PASSes at 158; the bound is the SHARED registered variable | **MISSING ARTIFACT** descriptor | **`②`** |
| **D11** | lock-skip WARN terminal B15: `terminals` include `skip_lock_contention`; `skipRecordsMeta(d,"advisory_lock_held_elsewhere").audit_table` name `"Neighbourhood Boundaries"`, verdict `WARN` | **`RED it.fails`** | L8 — a contended lock (57) SKIPS SILENTLY: no summary, no audit row AT ALL (the runner's skip terminal now emits a row-derived WARN) | **MISSING ARTIFACT** descriptor | **`②`** |
| **marker** | the report states the compressed-form marker line (R-PACE-1) `**Commit form: compressed (R-PACE-1)**` | **`GREEN legacy pin`** (°) | — | — | — |

(°) The marker test is the commit-① report's own lock — a plain `it`, GREEN today because part A1 landed
the §0 header. It is **not** a `legacy` pin (nothing in the legacy script is its oracle) and it does **not**
count toward the 8; it is listed for completeness of the suite's `Tests 20 passed (20)`.

## R. Reflection (G9)
<!-- ANCHOR:§R -->

### LOW-CONFIDENCE table

| Item | Why low confidence | Resolves at |
|---|---|---|
| **PRE goldens + forced-change cohort** — **RESOLVED 2026-09-28** | Captured (live DB `127.0.0.1:54322/postgres`, worktree @ `90ae17d0`, §9.1): both PRE goldens exit 0 / PASS with `records_total` 158 / `new` 0 / `updated` 158 and `table_state` content_hash **`9b111a6a…` on BOTH chains** (R-AI holds); the live download sha256s equal the plan §2 pins **`b0cb5807…` / `9a3c3729…`** (the load-bearing equality key is now VERIFIED); the forced cohort ran PASS (arms healed per N-D1, **Q 5/5 not healed**, negative control unchanged) and **restored: true** (`9b111a6a…`, 158 rows), re-verified read-only. | **resolved ①** |
| **0w NOT landed** — **RESOLVED 2026-09-28** | 0w LANDED as `4ea7621e` (merged `1b06d00f`, RE-FREEZE #27). `scripts/lib/step/index.js` now carries `` `const built = compute.buildLookup(l.id, lr.rows, { config });` `` → `built.map`/`built.stats`, the shapeRecord seam gain `` `...(lookups.length ? { lookups: lookupMaps } : {})` ``, `acquired.lookups[id] = {content_hash, bytes_downloaded, download_attempts, rows_parsed, head_error, stats}` and `acquired.rows_shaped`; `scripts/lib/step/acquire.js` carries `parseXlsx` and enforces `role:"lookup"` ⇔ `format:"xlsx"` [READ @ `90ae17d0`]. Fences #19/#20/#21 are expressible; the step can convert. | **resolved ①** |
| **RE-FREEZE ordinal collision** — **RESOLVED 2026-09-28** | 0w took **`RE-FREEZE #27`** at landing (`4ea7621e`); `#26` stays with row 3.2 (`runIngestPhase phase_order gains staleness.detectInterruptedRetraction`) [READ §5.1]. The plan's "`#26` for 0w" is **superseded**, not merely stale. | **resolved ①** |
| **`buildLookup` / `shapeRecord` signatures pinned by D4–D6** — **RESOLVED 2026-09-28** | **VERIFIED against the landed code**, not assumed: the seam calls `` `compute.buildLookup(l.id, lr.rows, { config })` `` returning `built.map` / `built.stats`, and the shapeRecord seam reads `...(lookups.length ? { lookups: lookupMaps } : {})` [READ @ `90ae17d0`] — exactly the shape D4–D6 pin. D4–D6 need **no re-point**. | **resolved ①** |
| **Plan line-number drift** | the plan cites construct sites as bare `:line-line` numbers (`:132`, `:603-609`, `:1888-1892`, `:1259-1265`, `:620,720,939`, `:456`) and **several drifted** against this worktree (§3(e), §4.1). Every test/table in this report therefore cites **greppable ANCHORS**, and the `it(` titles are located **by anchor** in §3(e) — a plan number is never load-bearing here. | **②** (re-anchor at each landing; never re-introduce a bare line number) |
| **§3 found 4 referents NOT in the plan sweep** | §3 flags **four `NEW — not in plan sweep`** referents — `compute-cost-estimates.infra.test.ts`, `compute-coa-cost-estimates.infra.test.ts`, `db/migration-208-build-norms-family.db.test.ts`, and the `records_new: 0` fixtures (`load-parcels.csv-drift.logic.test.ts` / `factories.ts` / `capture-step-golden.logic.test.ts`). All verify-only, but the plan's registry sweep was **incomplete** — an absence claim that a grep refuted. | **③** (verify-only; the estate's registry sweep is re-run at cutover) |

### RECURRING / STANDARD-SHAPING table

| Pattern | Shape it sets |
|---|---|
| **A SOURCE-TEXT legacy ORACLE (eval with fakes) beats source-text REGEX locks for two-source loaders** | `fixtures/legacy-harness.ts` reads `scripts/load-neighbourhoods.js` as **source text**, strips the shebang and evaluates it in `new Function` with a curated `require` shim (**fake** `./lib/pipeline` + **fake** `exceljs`; **real** `./lib/safe-math` + node builtins), so the script's module-scope `pipeline.run()` only **stores** its callback. Every RED value is then the legacy's **own output** off the fake pool + `emitSummary`/`emitMeta` payloads — not a hand-typed number, and not a regex pin that rots when the shell freezes. **Candidate harness for `3.4 load_heritage`** (also two sources → one target). The regex-lock form (`expect(content).toContain('census_rows_matched')`) is exactly what §4.1 must re-home at ②; this harness makes the re-home unnecessary for the behaviour half. |
| **Engine registry sweeps HALLUCINATE absences** | three separate **"NO MATCH"** claims (`tasks/lessons.md` "no entry"; `acquire.js` "retried THREE times" → NB-X3 **already corrected by 0v**, 0 hits for the false form; the Fold H-3 "×6" `admin-existing.json` count not reproduced — 22 table hits vs 0 script-path hits, §3(c)) were each **refuted by grep at review**. **Standard: every absence claim needs an EXECUTED grep whose output is quoted** — an absence asserted without the command is a hallucination risk, and §3 marks exactly which referents it found **that the plan missed**. |
| **RE-FREEZE ordinals claimed in a plan go STALE across parallel rows** | the plan reserves `#26` for 0w, but row 3.2 took `#26` in parallel (§5.1) — a plan-written ordinal is a **snapshot of a shared counter**, not a reservation. **Standard: re-grep the RE-FREEZE log for the next free ordinal at LANDING time**, never trust the number written into the plan; §5.1 flags the collision as an OPEN QUESTION for the orchestrator rather than silently renumbering. Resolved here: 0w landed as #27 (4ea7621e). |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=neighbourhoods --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=a341880 |
| G3 | 1 | 2 | table rows=31 vocab-hit rows=2 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 20 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=3 it-count=23 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=3 lock-it-count=23 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | neighbourhoods | PASS | min_migration=227 <= migrations count=248 |
| 2 | neighbourhoods | PASS | 4 declared, missing from seeds: none |
| 3 | neighbourhoods | PASS | retired=0 overlap-with-declared=none |
| 7 | neighbourhoods | PASS | SPEC LINK header present=true |
| 8 | neighbourhoods | PASS | G-4: 4 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | neighbourhoods | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | neighbourhoods | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
- compare ran: true · diffs found: 116 · unexplained: 0

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
| 3 | Tunables externalized | enforced-green | G-4: 4 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 0 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 3 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=39134B notes=13180B checks=6 rows records_meta=3006B (newest post/ capture) |

**Enforced-green: 13/14** · not-run: 0 · vacuous: 0

