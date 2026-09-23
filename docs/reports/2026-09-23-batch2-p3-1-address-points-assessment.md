# Batch 2 Phase 3 row 3.1 Assessment — `address_points`

> **Status: PH-0 / PH-3 / PH-5 / PH-6 frozen (commits 1–4 of the FULL nine-commit form). NOT converted.**
> `converted.json` carries ONE INGESTOR (`load_ravines`); this row is the archetype's SECOND member, so R-AH / R-PACE-1
> eligibility is **NOT MET** and the **FULL nine-commit form** applies [READ `scripts/steps/_schema/converted.json`;
> READ `123_step_opt_assessment_validation.md:356`]. The marker `**Commit form: compressed (R-PACE-1)**` is deliberately
> absent — this is the full form.

**Target slug:** `address_points` · **Script:** `scripts/load-address-points.js` (497 lines, read in full) ·
**Chain:** `sources`, position 3 of 28 · **Manifest:** `supports_full:false, supports_dry_run:false`,
`telemetry_tables:["address_points"]` [READ `scripts/manifest.json:11`; READ `43_chain_sources.md` row 3].

**Archetype:** INGESTOR — the archetype's **second** member. INGESTOR template on record: `load-ravines.descriptor.json`
+ `scripts/lib/compute/load-ravines.js` + `src/tests/steps/load_ravines/` + `docs/reports/golden/load_ravines/`
[READ `123_step_opt_assessment_validation.md` R-AH; READ `.cursor/batch2_p3_1_address_points_active_task.md` Form ruling].

**Governing specs (owner rows, from the system map — the ONLY two):**

- Spec **43** (`docs/specs/01-pipeline/43_chain_sources.md`): system-map row 43 lists `scripts/load-address-points.js`
  among its Target Files [READ `00_system_map.md:43`]. Spec 43 is ALSO the step's chain owner ("chain owner": the chain
  itself) — the loader is row 3 of its step table [READ `43_chain_sources.md`].
- Spec **54** (`docs/specs/01-pipeline/54_source_address_points.md`): system-map row 54 lists
  `scripts/load-address-points.js`, `scripts/link-parcel-addresses.js` [READ `00_system_map.md:54`] — the loader is the
  PRIMARY owner, `link-parcel-addresses.js` is a downstream consumer.
- **Lock 96** — Spec 47 §A.5 lock registry, `ADVISORY_LOCK_ID = 96` [READ `load-address-points.js:80`;
  READ `47_pipeline_script_protocol.md:1941`].

**Governing plan of record (all adjudications transcribed below are the ORCHESTRATOR'S, not re-decided here):**
`.cursor/batch2_p3_1_address_points_active_task.md` (Status: Implementation, authorized y/y/O1=strip → O1 later ruled
BUILD, operator 2026-09-23).

**Library prerequisites already landed on this branch's history** — every commit below is on HEAD
[MEASURED 2026-09-23 `git log --oneline -n 12`]:

| Prereq | Commit | Subject |
|---|---|---|
| **0a** executeWrite class-A guard | `b0b8b271` | `fix(122_…): executeWrite gates the departure DELETE on plan.delete_sql (class-A guarded_upsert under runIngestPhase)` |
| **0b** CSV acquisition | `7e6fa3ce` (+ `d4063c7b` probe) | `feat(122_…): INGESTOR runner acquires CSV externals (format axis + compute.shapeRecord; RE-FREEZE #13)`; `chore(…): probe-csv-acquire — measured memory footprint … on the 525K-row address points CSV` |
| **0c** seam chain scope | `08063c58` | `fix(122_…): seam pairs are scoped to the chain they run in (SEAM-CHAIN-1, Spec 122 §6.5)` |
| **0d** CLOUD-PRE | `258a53c9` (+ `556b3152` run) | `feat(123_…): CLOUD-PRE — read-only pre-dispatch cloud-state checklist (npm run cloud:pre)`; the first cloud run FAILED (mig 248 + 37 seeds) |

**Measurement environment:** every `[READ]`/`[MEASURED]` below was re-derived from the tree at HEAD on branch
`wf2/address-points`, 2026-09-23. No DB writes, no chain run. Where the plan's line numbers drifted from the tree, the
tree wins and the discrepancy is called out (the plan cited 498 lines / 12 guard columns; the tree has 498 total lines
with the last `});` at 498, i.e. 497 substantive; the guard column list is 13 columns + geom).

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-address-points.js` end to end (497 lines), not from the manifest, the specs or any
> prior report. Spec 122 R5: the write class is re-derived from the code here, never trusted from a plan.

### 1.1 Write class (Spec 122 R5 / §1.4) — **class A `guarded_upsert`**

- ONE write statement: `INSERT INTO address_points (…) VALUES … ON CONFLICT (address_point_id) DO UPDATE SET … WHERE …
  IS DISTINCT FROM …` [READ `load-address-points.js:184-243`].
- **NO DELETE anywhere** in the file (`grep -n 'DELETE' scripts/load-address-points.js` ⇒ 0 matches)
  [MEASURED 2026-09-23].
- ⇒ **class A `guarded_upsert`**, `retract:"none"`, `delete_sql:null`. **No converted precedent**: `load_ravines` (the
  only other INGESTOR) is class B `upsert_scoped_departure_delete` [READ `122:327-329`; plan Registry sweep]. The
  runner guard for this class is prerequisite **0a** (`b0b8b271`): `executeWrite` issued
  `client.query(plan.delete_sql, …)` unconditionally, which would be a null-statement failure on the first non-empty
  class-A run. 0a gates it on `plan.delete_sql` via `retractionFires` (plan Fold B2).

### 1.2 Tables / columns WRITTEN

`INSERT` targets `address_points` with a **16-column** column list `[READ :184-196]`:

| # | Column | Source | Guarded by `IS DISTINCT FROM`? |
|---|---|---|---|
| 1 | `address_point_id` | `ADDRESS_POINT_ID` (PK, `ON CONFLICT` key) | PK |
| 2 | `latitude` | geometry / LATITUDE | yes (bare) |
| 3 | `longitude` | geometry / LONGITUDE | yes (bare) |
| 4 | `address_number` | `ADDRESS_NUMBER` | yes (NULLIF) |
| 5 | `linear_name_full` | `LINEAR_NAME_FULL` | yes (NULLIF) |
| 6 | `address_full` | `ADDRESS_FULL` | yes (NULLIF) |
| 7 | `lo_num` | `LO_NUM` | yes (bare NULL check) |
| 8 | `hi_num` | `HI_NUM` | yes (bare NULL check) |
| 9 | `maint_stage` | `MAINT_STAGE` | yes (NULLIF) |
| 10 | `address_status` | `ADDRESS_STATUS` | yes (NULLIF) |
| 11 | `address_class_desc` | `ADDRESS_CLASS_DESC` | yes (NULLIF) |
| 12 | `class_family_desc` | `CLASS_FAMILY_DESC` | yes (NULLIF) |
| 13 | `place_name` | `PLACE_NAME` | yes (NULLIF) |
| 14 | `addr_num_normalized` | derived `normalizeAddressNumber` | yes (NULLIF) |
| 15 | `linear_name_normalized` | derived `parseLinearName().street_name` | yes (NULLIF) |
| 16 | `geom` | `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` in-SQL | yes (bare) |

**Preservation semantics:** 12 of the 16 `DO UPDATE SET` assignments are `COALESCE(NULLIF(EXCLUDED.x,''), x)` — a
blank/NULL incoming value PRESERVES the existing row value rather than overwriting it (day-1 safety against the
2026-05-20 Toronto CKAN strip pattern) [READ `:204-218`]. `latitude`/`longitude`/`geom` are deliberately NOT
COALESCE-wrapped — the stream-loop skip guard (`isNaN(lat)||isNaN(lng) → skipped++; continue`) makes every row here
have valid coordinates [READ `:199-218` comment + `:317-322`]. `RETURNING (xmax = 0) AS is_insert` splits the write
count into `inserted`/`updated` [READ `:242-248`].

### 1.3 Audit rows emitted (row-derived FAIL > WARN > PASS cascade)

`auditRows` is a 9-element array; the verdict is DERIVED from the rows (not a parallel boolean) per Spec 48 §3.6
[READ `:412-449`]:

| # | `metric` | threshold | FAIL/WARN condition | Line |
|---|---|---|---|---|
| 1 | `rows_read` | `>= 500000` | WARN if `< 500000` | `:413` |
| 2 | `records_inserted` | null | INFO | `:414` |
| 3 | `records_updated` | null | INFO | `:415` |
| 4 | `records_unchanged` | null | INFO | `:416` |
| 5 | `records_skipped` | null | INFO | `:417` |
| 6 | `skip_rate` | `< 5%` | FAIL if `>= 5` | `:418` |
| 7 | `records_errors` | `== 0` | FAIL if `> 0` | `:419` |
| 8 | `address_points_csv_schema_drift` (driftRow) | `no missing required columns` | WARN from `buildDriftAuditRow` | `:420`; `address-points-csv-drift.js:70-76` |
| 9 | `address_points_null_address_number_pct` (nullAddressNumberRow) | `< 10%` | WARN if `fraction >= 0.10` | `:421`; `address-points-csv-drift.js:95-96` |

**Cascade** [READ `:424-449`]: `verdict = auditRows.some(FAIL) ? 'FAIL' : auditRows.some(WARN) ? 'WARN' : 'PASS'`,
emitted under `records_meta.audit_table` with `phase: 2`, `name: 'Address Points Ingestion'` [READ `:443-448`].

### 1.4 `records_meta` keys (`emitSummary`) and `emitMeta` shape

`pipeline.emitSummary({ records_total, records_new, records_updated, records_meta })` where `records_meta` carries
[READ `:433-449`]: `duration_ms`, `rows_read`, `records_inserted`, `records_updated`, `records_unchanged`,
`records_skipped`, `errors`, `audit_table:{phase,name,verdict,rows}`. `records_total = inserted + updated`.

`pipeline.emitMeta(readsObj, writesObj)` [READ `:454-493`]: the **reads** list names **14** Toronto Open Data CSV
columns (`ADDRESS_POINT_ID`, `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `ADDRESS_FULL`, `LO_NUM`, `HI_NUM`, `MAINT_STAGE`,
`ADDRESS_STATUS`, `ADDRESS_CLASS_DESC`, `CLASS_FAMILY_DESC`, `PLACE_NAME`, `LATITUDE`, `LONGITUDE`, `geometry`); the
**writes** list names **16** `address_points` columns, byte-equal to the §1.2 column list. The asymmetry (14 reads vs
16 writes) is real and load-bearing: `addr_num_normalized` + `linear_name_normalized` are DERIVED, `geom` is
computed in-SQL — three write columns have no read column.

### 1.5 Exit codes / stdout lines

The script has **no explicit `process.exit`**; the `pipeline.run` wrapper owns exit semantics (Spec 40). Stdout (via
`pipeline.log`): download progress lines every 10 MB [READ `:64-68`], `Downloading…`/`Download complete.`/`Using
cached CSV:`/`Parsing: <path>` [READ `:95-101`], a `warn` line on CSV column drift [READ `:279-284`], an `info` `Load
complete` line with `{rows_read, inserted, updated, skipped, errors, duration}` [READ `:389-392`], and a `progress`
line every 50000 rows [READ `:380-382`]. A fatal error logs and increments `errors`, then falls through (no rethrow)
[READ `:384-388`].

### 1.6 Transaction shape — DECLARED `txn_scope:"step"` + a `deviations[]` entry

Today: **one `withTransaction` per `pipeline.BATCH_SIZE` batch** — `flushBatch()` wraps each 1,000-row batch in its own
transaction inside the advisory lock [READ `:119-251`, `:371-383`]. The library (`executeWrite`) wraps ALL insert
batches in ONE step-wide `withTransaction` [READ plan Fold B3]. The conversion therefore **DECLARES
`txn_scope:"step"` (the truth)** with a `deviations[]` entry naming the **atomicity-window widening**: a mid-run failure
is no longer byte-identical (today, committed batches persist; converted, the run is all-or-nothing). **Success runs
remain byte-identical** — that is what the golden proves. Commit 5 records the single-txn duration + WAL for the
~525K rows; **Ask O2 is NOT triggered** unless that measurement breaches the step budget (plan Fold B3, ruled).

### 1.7 Acquisition — measured, whole-array hand-off

Today: the 525K-row `https.get`-streamed CSV is parsed row-by-row with `csv-parse`'s async iterator and batched on the
fly [READ `:262-383`]. Converted: prerequisite **0b** (`7e6fa3ce`) gives the INGESTOR runner a CSV path
(`inputs.reads.externals[].format:"csv"` + `csv_options`), with a **whole-array hand-off** — `parseCsv` accumulates
every `{[keyColumn]: key, record}` before returning to `runIngestPhase`.

**MEASURED 2026-09-23** (`docs/reports/pipeline-validation/csv-acquire-probe-2026-09-23.md`, tool
`scripts/analysis/probe-csv-acquire.mjs`): 525,436 rows parsed, 0 bad keys, source 183,503,831 bytes (~175 MiB); peak
**RSS 1531 MB**, peak **heapUsed 1337 MB** against the default **4288 MB** heap limit (>2× headroom); under a
tightened `--max-old-space-size=2048`, heapUsed 1352 MB vs a 2240 MB ceiling (no breach). ⇒ **Ask O3 (streaming seam)
NOT triggered** — the whole-array model is measured-safe at this dataset size.

### 1.8 Cutover blockers — both BUILT

`programme-items.json` (registry-reserved) carries both items this slug was blocked on, and the generated backlog shows
both ✅ BUILT [READ `docs/reports/generated/122-programme-backlog.md:49,52`]:

| Item | Spec | State | Blocks |
|---|---|---|---|
| `CLOUD-PRE` | 123 §7.2 A5 | ✅ **BUILT** (2026-09-21) | enrich_centreline, **address_points**, load_centreline, load_zoning, load_heritage, load_wsib, massing, parcels, neighbourhoods |
| `SEAM-CHAIN-1` | 122 §6.5 | ✅ **BUILT** (2026-09-15) | **address_points** (only) |

`CLOUD-PRE`'s first live run against the cloud (`258a53c9`/`556b3152`, `docs/reports/pipeline-validation/cloud-pre/2026-09-23T14-39-52Z.md`)
**FAILED**: migration `248_parcel_cost_lines.sql` unapplied + 37 `logic_variables` unseeded on the cloud. That is an
**operator pre-dispatch item** (fix the cloud state before a cloud dispatch), **NOT a cutover blocker** for a local
conversion — the local conversion is evidenced by a local golden.

---

## 2. Registry sweep + coupling

**Registry sweep — every Target File reviewed?** `grep load-address-points docs/specs/00-architecture/00_system_map.md`
⇒ rows **43** and **54** ONLY (both quoted in the header) [MEASURED 2026-09-23]. Spec 54 read in full (104 lines);
Spec 43 read for its `address_points` statements.

| Coupling | Finding | Ruling (orchestrator) |
|---|---|---|
| **Unregistered drift lib** | `scripts/lib/address-points-csv-drift.js` is in **NO** registry row and named in no spec body, yet (a) it is `require`d by the loader [READ `load-address-points.js:25-28`] and by the CONVERTED `assert_schema` compute [READ `scripts/lib/compute/assert-schema.js:62`, `:218`]; (b) it is the **ONLY** `fingerprint_inputs` entry of `assert-schema.descriptor.json` [READ `assert-schema.descriptor.json` `staleness.fingerprint_inputs: ["scripts/lib/address-points-csv-drift.js"]`]; (c) it is locked by `src/tests/load-address-points.csv-drift.logic.test.ts`. ⇒ any peel touching it (the `0.10` literal at `:96`) forces an `assert_schema` golden RECAPTURE too (a C4-class orchestrator step, two steps). | **Commit 9 registers it under Spec 54's Target Files** (system-map regen) — registry gap. Plan Registry sweep. |
| **Legacy infra test** | `src/tests/load-address-points.infra.test.ts` asserts on the SCRIPT's source text (INSERT column list, `ST_SetSRID`, `COALESCE(NULLIF…)`, WHERE guard, audit rows); it goes RED by construction when the script becomes the Spec 122 §5.1 frozen shell at commit 7. | **RE-POINTED IN PLACE at commit 7** (same path, rewritten to `require` the compute) — the `geocode_permits` `7d` precedent. Never moved, never deleted (Guardian fence). Plan Fold B6. |
| **Ordering guarantee (Rule 11)** | Spec 43 row 4 (`geocode_permits` "re-joins EVERY permit … to `address_points`") and row 9 (`link_parcel_addresses` populates the bridge) imply an **"address_points before geocode_permits / link_parcel_addresses"** ordering guarantee [READ `43_chain_sources.md` rows 4, 9]. Since the loader never retracts (class A), a `geo_id` can only "vanish" via a source-side change, which the class-A shape cannot express — a KNOWN limitation, declared not fixed. | **PH-0 states the guarantee**; the class-A limitation is disclosed. Plan Registry sweep. |
| **Floor duplication (Rule 3)** | `assert_data_bounds` already declares the `address_points ≥ 500K` floor (Spec 43 row 27, READ `43_chain_sources.md` row 27) ⇒ the loader's own `rows_read >= 500000` [READ `:413`] DUPLICATES a fleet check. The registered var is `sources_address_points_floor` [READ `scripts/seeds/logic_variables.json:5010-5016`, `default:500000`, consumed by `assert_data_bounds`]. | **RULING: KEEP** the loader's own check at the peel, sharing the **SAME registered variable name** `sources_address_points_floor` via `checks[].limit_from_config` (Rule 3, one source of truth) — not a second key, not retired. Plan Registry sweep; §5 literal ledger. |

---

## 3. PH-3 — Intent Ledger (G3)

Every non-obvious constant / fence in the 497 lines. `git blame`/`git log` provenance per row (allowed flags). Disposition
vocabulary: **declared** (`encoded-as-descriptor-field`), **preserved-in-compute** (rule written in `checks[].why` or
`notes.json`), **retired** (`knowingly-retired`, citing the plan ruling). Adjudicator column = the orchestrator ruling.

| # | Literal / fence (line) | Introduced by (`git blame`/`git log`) | What it protects | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 1 | `ADVISORY_LOCK_ID = 96` (`:80`) | `745a1b4d0` 2026-04-16 "Brett" | Mutual exclusion with specs 41/42/43 steps on `address_points` — the fleet lock registry | **declared** → `identity.lock:96` + `why_lock` (+ liveness file ref) | plan Registry sweep; Spec 47 §A.5:1941 |
| 2 | `CSV_URL` (`:37-38`) | `67057269c` 2026-02-22 | The CKAN download endpoint identity (dataset `abedd8bc…`, resource `64d4e54b…`) | **declared** → `inputs.reads.externals[].url` (`address_points_csv`) | Rule 2 / Spec 122 §5.1 |
| 3 | `process.argv[2]` local-path override (`:89`) | `67057269c` 2026-02-22 | A debug affordance: run against a hand-supplied local CSV without downloading | **retired** → a `deviations[]` entry (Spec 124 R-AZ argv-seam rule); the fixture tier replaces it | plan Fold B; Spec 124 R-AZ |
| 4 | byte-window `10 * 1024 * 1024` (`:66`) | `67057269c` 2026-02-22 | Download-progress log cadence (every 10 MB), not correctness | **declared** → `config.logic_variables.address_points_progress_bytes_window` | §5 literal ledger |
| 5 | progress modulo `50000` (`:380`) | `3ed30f836` 2026-03-17 | Progress-line cadence during parse | **declared** → `address_points_progress_row_modulo` | §5 literal ledger |
| 6 | expected-total `525000` (`:381`) | `3ed30f836` 2026-03-17 | Progress-bar denominator only (a display estimate, not a gate) | **declared** → `address_points_expected_total_rows` | §5 literal ledger |
| 7 | `rows_read >= 500000` (`:413`) | `d32612bba` 2026-03-26 | Catastrophic-load detector: a near-empty load must WARN | **declared** → `checks[].limit_from_config` SHARING `sources_address_points_floor` (KEEP per §2 ruling) | plan Registry sweep |
| 8 | `skip_rate < 5%` (`:418`) | `d32612bba` 2026-03-26 | A rising coordinate/ID skip rate signals CSV drift | **declared** → `address_points_skip_rate_max_pct` | §5 literal ledger |
| 9 | null-`address_number` `0.10` in drift lib (`address-points-csv-drift.js:96`, threshold text `:95`) | drift lib (WF1 Phase 2b `10db268c`) | CKAN strip detector: >10% null address_number ⇒ WARN | **declared** → `address_points_null_address_number_max_pct`; NOTE this peel **forces an `assert_schema` recapture** (§2 coupling) | plan Registry sweep |
| 10 | `pipeline.BATCH_SIZE` (`:371`) | `0ef23550c` 2026-03-09 | Insert batch size (1000 rows → 15K bind params, under the 65535 cap) [READ `:139`] | **declared** → `execution.batch` | Rule 3 / Spec 122 §5.1 |
| 11 | geometry OR-contract (`geometry` JSON vs LATITUDE/LONGITUDE, `:289-321`; `hasCoordinateSource`) | `67057269c` 2026-02-22 (+ WF3 hotfix `5db7891f`) | The live CSV ships `geometry`; lat/lng are the fallback; both-absent ⇒ skipped | **preserved-in-compute** — rule written in `checks[].why` (the `assert_schema` twin lives at `address_point_coordinate_source.why`; the loader's own copy is the compute path + notes.json) | plan Defect candidates; Spec 122 §5.1 |
| 12 | `COALESCE(NULLIF(EXCLUDED.x,''),x)` preservation (`:204-218`) | `67057269c` 2026-02-22 (+ 2026-05-20 strip pattern) | Day-1 safety: a blank/NULL incoming value must not overwrite 525K existing rows | **preserved-in-compute** — rule written in the SQL comment + notes.json (a behavior, not a literal) | plan Registry sweep |
| 13 | `IS DISTINCT FROM` guard column list (`:219-241`) | `67057269c` 2026-02-22 | The write-guard: skip the UPDATE when nothing changed (13 cols + geom) | **preserved-in-compute** — notes.json (no field to externalize) | Spec 122 §1.4 |
| 14 | `JSON.parse` swallow (AP-D2) (`:293-305`) | `67057269c` 2026-02-22 (catch comment `3ed30f836`) | Comment-only catch: an unparseable geometry falls through to the lat/lng fallback | **preserved-in-compute** → counted `geom_parse_failures` audit row at the peel (name its `checks[].why`); see §4 AP-D2 | plan Defect candidates AP-D2 |
| 15 | batch-drop catch (AP-D3) (`:372-378`) | `67057269c` 2026-02-22 (error line `0ef23550c`) | A failed batch is logged, `errors++`, and its rows DROPPED for the run | **declared** → `execution.on_batch_error:"drop_batch"` (the schema's own description cites this file); see §4 AP-D3 | plan Defect candidates AP-D3; plan Fold B8 |
| 16 | absent `maint_stage`/`address_status` filter (AP-D1) | script never had one; Spec 54 narrates it (`54:35-36`, `:80`) | Spec/code DIVERGENCE — the loader inserts every row | **preserved-in-compute** (carry the CODE, zero-diff) → PIN as KNOWN-DEFECT; see §4 AP-D1 | plan Defect candidates AP-D1 |

**Provenance method:** `git log --oneline -n 3 -- scripts/load-address-points.js` ⇒ `1be8d767`, `5db7891f`, `10db268c`
[MEASURED 2026-09-23]; `git blame` windows at `:37-39`, `:80`, `:89-101`, `:286-306`, `:371-383`, `:413-418`.

---

## 4. PH-5 — Seam map (G5)

Every point where the step touches a foreign resource, with the converted-side seam name.

| Seam | Today (READ) | Converted-side seam name |
|---|---|---|
| **DB seam** | `pipeline.withAdvisoryLock(pool, 96, …)` [`:84`]; `pipeline.withTransaction(pool, …)` per batch [`:125`, `:119-251`]; `client.query(INSERT…ON CONFLICT…)` [`:184-243`] | `identity.lock`=96 · `execution.txn_scope:"step"` · `outputs.writes[]` (class A `guarded_upsert`, `retract:"none"`) — the runner owns pool/txn [Spec 122 §5.1] |
| **Clock seam** | `Date.now()` twice, ONLY for `duration_ms` [`:87`, `:393`] — **no** timer, **no** `setTimeout`, **no** scheduling | no clock semantics to declare; `records_meta.duration_ms` is library-supplied and masked in the golden (VOLATILE_KEYS `duration_ms`) |
| **Network seam** | `downloadFile(CSV_URL, …)` via `https.get`/`http.get` [`:43-78`], redirect-following one hop [`:59-63`] — **NO retry, NO timeout** | `inputs.reads.externals[].kind:"http_file"` + `network.timeout_from_config` / `network.retries` (POST-B1-8 is a separate commit 10 behaviour change) |
| **argv/env seam** | `process.argv[2]` local-path override [`:89`] — **no `process.env` reads** (verified: `grep process.env scripts/load-address-points.js` ⇒ 0) | `process.argv[2]` **retired** per Spec 124 R-AZ (a `deviations[]` entry; the fixture tier replaces it). No `env` block to declare. |
| **Filesystem seam** | temp CSV path `data/address-points-4326.csv` [`:92`], `fs.mkdirSync` before the write stream [`:47`], `fs.createReadStream` [`:262`] | the runner's acquisition path owns the temp file (0b); `inputs.reads.externals[].cache:"none"` today — no cache seam declared |

---

## 5. PH-6 — Classification (G6)

Each observable behaviour classified as **CONTRACT** / **INCIDENTAL** / **DEFECT** per Spec 123 §3's four questions
(Is a consumer depending on this? Is it intended? Does breaking it change observable output?). Every CONTRACT names its
consumer.

| Behaviour | Class | Consumer (CONTRACT only) |
|---|---|---|
| `address_points` rows (16 columns, PK-ordered) | **CONTRACT** | `link-parcel-addresses.js`, `link-parcels.js`, `link-coa-to-parcels.js`, `geocode-permits.js`, `load-heritage.js`, `load-parcels.js`; admin `stats`/`quality` routes, `DataQualityDashboard.tsx`, `funnel.ts`, `parcel-lookup.ts`, `src/lib/quality/*` [plan Registry sweep; Spec 43 rows 4/9] |
| `records_meta` shape (`rows_read/inserted/updated/unchanged/skipped/errors/audit_table`) | **CONTRACT** | `assert_data_bounds` (floor), admin readers / `DataQualityDashboard.tsx`, `funnel.ts` |
| `audit_table.verdict` row-derived FAIL>WARN>PASS cascade | **CONTRACT** | Spec 48 §3.6 consumers (admin quality routes, chain verdict) |
| `records_meta.audit_table.rows[]` 9 metrics (§1.3) | **CONTRACT** | admin quality routes |
| `emitMeta` reads/writes lists (14 / 16) | **CONTRACT** | lineage/observability readers (`FreshnessTimeline.tsx`-class) |
| `RETURNING (xmax = 0)` insert-vs-update split | INCIDENTAL | counts only; no consumer depends on the *mechanism* |
| download-progress log cadence (10 MB) | INCIDENTAL | log-only |
| `progress('…', processed, 525000, …)` denominator | INCIDENTAL | progress display only, not a gate |
| `skip_rate` WARN/FAIL boundary | **CONTRACT** (as a check) | the audit row's own consumers; literal externalized in §6 |
| crash-on-`isNaN(id)` skip + `continue` | INCIDENTAL | affects `skipped`, a CONTRACT counter |
| AP-D1 unfiltered `maint_stage`/`address_status` | **DEFECT (pinned)** | see ledger below |
| AP-D2 `JSON.parse` swallow | **DEFECT (pinned)** | see ledger below |
| AP-D3 batch drop | **DEFECT (pinned)** | see ledger below |

### 5.1 Defect ledger (PIN in wrong form — never fix inside the conversion, Spec 123 §3.1)

| ID | Defect | PIN (wrong form carried) | Post-cutover fix |
|---|---|---|---|
| **AP-D1** | **Spec/code divergence.** Spec 54 narrates a `maint_stage = REGULAR` filter (`54:35` "Filter to REGULAR") and `address_status ∈ {NULL,CURRENT,NONE}` acceptance (`54:36`, `:80`); the loader has **NO** filter on either — every row inserts [READ `load-address-points.js` §C — grep `maint_stage`/`address_status` finds inserts only]. **BOTH readings recorded:** (a) the spec is aspirational and the code is right (unfiltered is the canonical load); (b) the spec is right and the loader over-inserts `RESERVED` (~1.5%, 7.7K rows) and non-accepted statuses. | Carry the CODE unfiltered (zero-diff). PIN as KNOWN-DEFECT in its wrong form. | A separate post-cutover commit with its own RED lock, **ONCE PH-0 rules which side is right**. **RULING OWED: operator/orchestrator** — not decided here. |
| **AP-D2** | Silent `JSON.parse` swallow: `try{…}catch{ /* fall through */ }` refuses to surface an unparseable geometry [READ `:293-305`]. | Carry the swallow verbatim (NO behaviour change); at the peel add a **counted, declared `geom_parse_failures`** audit row. Name the rule in that check's `why`. | not a fix — the declaration is the close |
| **AP-D3** | Batch drop: a failed batch is logged, `errors++`, rows DROPPED for the run [READ `:372-378`]. | Carry as-is; declare `execution.on_batch_error:"drop_batch"` at the peel (the schema's own description already cites `load-address-points.js:374-378`). | not a fix — the declaration is the close |

**Note (Spec 54 wrong-form, zero-diff):** AP-D1 is a PINNED divergence — the conversion does NOT filter, so the golden
proves zero-diff against the live table. Marked **"RULING OWED: operator/orchestrator"**.

---

## 6. Rule 3 literal ledger

| Table literal (line) | Proposed `config.logic_variables[].name` | min / max / `on_invalid` |
|---|---|---|
| `10 * 1024 * 1024` (`:66`) | `address_points_progress_bytes_window` | 1 MiB / 64 MiB / `fail` (verdict-adjacent display; conservative) |
| `50000` (`:380`) | `address_points_progress_row_modulo` | 1000 / 5,000,000 / `fail` |
| `525000` (`:381`) | `address_points_expected_total_rows` | 1 / 5,000,000 / `fail` |
| `500000` (`:413`) | `sources_address_points_floor` **(SHARED — verify existing key)** | 1 / 5,000,000 / `fail` — **the key ALREADY EXISTS** at `scripts/seeds/logic_variables.json:5010` (`default:500000`, `type:number`, consumed by `assert_data_bounds`) [READ `:5010-5016`] — **reuse, do not mint a second key** (Rule 3) |
| `5` (skip_rate %)(`:418`) | `address_points_skip_rate_max_pct` | 0 / 100 / `fail` |
| `0.10` (drift lib `:96`) | `address_points_null_address_number_max_pct` | 0 / 100 / `fail` — minted in the drift lib's own peel (forces `assert_schema` recapture, §2) |
| `downloadFile` timeout (none today) | `address_points_download_timeout_ms` | 1000 / 1,800,000 / `fail` (mirrors `load_ravines_download_timeout_ms`) |

**Verdict-affecting ⇒ `on_invalid:"fail"`** for every row above (each fences the verdict cascade or the
catastrophic-load floor). `BATCH_SIZE` → `execution.batch` (field, not a logic variable). `CSV_URL` →
`inputs.reads.externals[].url`. The `sources_address_points_floor` key's EXISTENCE was verified in the seeds file, not
assumed — the loader's check shares it via `checks[].limit_from_config`.

---

## 7. Non-determinism inventory (before the first golden, Spec 123 §7 row 5)

`scripts/analysis/capture-step-golden.js` normalises summaries/meta/ledger rows by (a) deleting `VOLATILE_KEYS` wherever
they appear, (b) dropping `sys_*` audit rows, (c) masking string patterns [READ `capture-step-golden.js:84-115`,
`:587-657`].

**Already masked by the capture (reused, no new work):**

| Volatile fact | Handling |
|---|---|
| `pipeline_runs.id` (serial) | `VOLATILE_KEYS: 'id'` |
| `started_at` / `completed_at` | `VOLATILE_KEYS` |
| `duration_ms` | `VOLATILE_KEYS` + `duration_literal` pattern (`<DUR>`) |
| `chain_run_id` | `VOLATILE_KEYS` (R-U, `index.js`) |
| `sys_duration`/`sys_*` velocity rows | `VOLATILE_METRIC_PREFIXES = ['sys_']` |
| ISO / PG timestamps in stdout | `iso_timestamp` / `pg_timestamp` patterns (`<TS>`) |
| rows/s rate literals | `rows_per_sec` pattern (`<RATE>`) |
| `pipeline_runs <id>` / `pid=` | `pipeline_runs_id_literal`, `pid_literal` |

**Added by THIS step (declare in the capture's `nondeterminism` list for `address_points`):** the `migrations=` count in
the target INFO line (DB-state-dependent, already handled by the log masker's generic digit forms — VERIFY at first
capture); download timing (`Download:` lines, masked by `<DUR>`/`<RATE>`); the `records_meta.duration_ms` value
(masked). **No NEW volatile key family is introduced by this step** beyond what `load_ravines` (the INGESTOR precedent)
already exercises — stated so commit 5's first capture can be diffed cleanly.

---

## 8. Commit plan (nine commits + prerequisites, provider per commit)

Copied verbatim from the plan's Execution Plan. 0a–0d are **LANDED** (hashes from §Header table).

| # | Commit | Provider | Scope |
|---|---|---|---|
| **0a** | `b0b8b271` executeWrite null-delete guard | deepseek | **LANDED** |
| **0b** | `7e6fa3ce` (+ probe `d4063c7b`) INGESTOR CSV acquire | claude→deepseek | **LANDED** |
| **0c** | `08063c58` SEAM-CHAIN-1 chain scope | deepseek | **LANDED** |
| **0d** | `258a53c9` CLOUD-PRE | claude→deepseek | **LANDED** (cloud run FAIL, operator item) |
| **1** | PH-0 boundary freeze — THIS report | claude | **THIS COMMIT** |
| **2** | PH-3 intent ledger | claude (DeepSeek audit) | §3 (folded here) |
| **3** | PH-5 seam map | deepseek | §4 (folded here) |
| **4** | PH-6 classification | claude | §5 (folded here) |
| **5** | Golden master (`capture-step-golden.js` on `sources` + standalone) | claude | records single-txn duration/WAL (O2 gate) |
| **6** | PH-7 tests + prove RED (`src/tests/steps/address_points/violations.test.ts`) | deepseek | each RED value stated |
| **7** | Descriptor + compute verbatim (no-op diff on the 4-tuple); re-point `infra.test.ts` IN PLACE | deepseek | engine stops before compute change (G8) |
| **8** | Peel 8a gating → 8b verdict/audit → 8c thresholds/checks | deepseek | every §6 literal → seeded `logic_variables[]` |
| **9** | Differential + cutover (`converted.json`, census flip, `manifest.json`, `template-freeze --refresh`, `step-validate --write`, spec diffs 43+54, register the drift lib under Spec 54) | claude | registry-reserved files ⇒ orchestrator commit |
| **10** | (post-cutover, separate) POST-B1-8 download helper | deepseek | only if registered; own RED→GREEN |

---

## 9. Green evidence (recorded at commit 1)

- `node scripts/analysis/step-validate.mjs --all --fast` → **exit code 0, no throw** on this report's presence
  [MEASURED 2026-09-23]. `address_points` is **unconverted** (no descriptor yet), so `--all` scores only the 18
  converted steps and does NOT emit a scorecard for it — the expected "not converted / assessment-only" state. No gating
  error is raised by the report's existence.
- `npm run typecheck` (`tsc --noEmit`) → **exit code 0**, empty output [MEASURED 2026-09-23] — the tree is otherwise
  untouched (this commit is docs-only).
- `npx eslint docs` is not applicable (docs are not linted).
