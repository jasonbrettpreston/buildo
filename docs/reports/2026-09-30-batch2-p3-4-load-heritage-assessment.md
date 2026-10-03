# Batch 2 Phase 3 row 3.4 — `load_heritage` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: commit ① report half — PH-0 … PH-7 + §R + §A measurement log.** **NOT converted.** The red suite
> `src/tests/steps/load_heritage/violations.test.ts` is ①'s other half. **PRE goldens are NOT captured** — the
> DB slot is held, so §9 of this report lists the commands to run rather than reporting captured values.
> **INGESTOR has 6 converted members** — `load_ravines`, `address_points`, `parcels`, `load_centreline`,
> `massing`, `neighbourhoods` [READ `§10`; plan §1] — so with
> six converted INGESTOR members on record the **compressed form is the DEFAULT** [Spec 124 R-AH]; no reason
> for the full nine-commit form applies, and the literal marker line above is present.

Every number below was EXECUTED by the orchestrator on 2026-09-30 (worktree HEAD `1bc3ffab`, read-only SELECTs on the local dev DB, HEAD/download probes to a scratch directory); the queries and probes with their results are **§A (Measurement log)**.
Values are cited `[MEASURED 2026-09-30]` (query/probe) or `[READ file:line]` with the query in §A,
or **"plan §N"** for anything transcribed from the governing plan.

**Target slug:** `load_heritage` · **Script:** `scripts/load-heritage.js` — **808 lines** [MEASURED
2026-09-30 `wc -l` = 808] · **Chain:** `sources`, position **7 of 28** [READ `scripts/manifest.json`; READ
§A.F-CODE] · **Lock:** `61` — `ADVISORY_LOCK_ID = 61` [READ Spec 47 §A.5 row 61 at
`47:1968`; the lock-registry test names it at `pipeline-advisory-lock.infra.test.ts:38`; both via
§A.F-CODE].

**Manifest entry** [READ `scripts/manifest.json:14`, via §A.F-CODE]:
`load_heritage {supports_full:false, supports_dry_run:false, telemetry_tables:[heritage_properties,
heritage_districts]}`. **`supports_full:false` + `supports_dry_run:false`** — the chain provides neither
`--full` nor `--dry-run` for this step. **Census row** [READ `scripts/steps/_schema/step-archetype-census.json:340-345`
— INGESTOR, C5; the plan's `:324-328` has drifted]. Churn: `load_heritage` sits **top-left**
[READ `docs/reports/generated/122-churn-complexity.md:33` — commits 3, 846/558/160] [via
§A.F-CODE].

**Target Spec:** `docs/specs/01-pipeline/61_source_heritage_properties.md` (the step's owner; system-map row
61) and `43_chain_sources.md` (the chain owner; row 43, row 7 of that chain), then the architecture specs
**122 / 123 / 124**. **Governing plan:** `.cursor/batch2_load_heritage_active_task.md` — authorized
**2026-09-27**, **re-grounded after 0x landed** (`61e83927`, merge `5c2da8bc`), carrying **RE-FREEZE #29**
(plan §1-§3 + the "Re-grounding after 0x landed" section).

**Spec 121 §4.3 governs method** (refactor/behaviour split): this conversion is **zero behaviour change**;
every carried defect is pinned by an **`LH-D<n>`** id [READ §6.1 — `HR-D*` renamed to
`LH-D*`, same numbers, plus the new `LH-D11`; the `LH` prefix is forced by
`scripts/analysis/step-validate.mjs` `defectPrefixFor` `:783-785`, and G6 reads ONLY `LH-D*` rows] and every
fix is a separate **④** commit.

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-heritage.js` (808 lines), not from the manifest, the specs or any prior
> report. Spec 122 R5: the write class is re-derived here from the code. TWO CKAN shapefiles (a register of
> points, a district layer of polygons) acquire into TWO tables, each with its own skip and its own failure
> (DEC-K) — this is the **FIRST multi-primary INGESTOR** [plan §1-§3, 0x `61e83927`, RE-FREEZE #29].

### 1.1 Write class — **class B**: two guarded upserts + two F-C1-guarded departure DELETEs, one transaction PER dataset

- **One transaction per dataset.** The legacy wraps each dataset's work in its own `pipeline.withTransaction`
  call — one inside `loadDataset` for the register, one for the districts [READ `scripts/load-heritage.js:594-606`
  via §A.F-CODE]. There is no step-wide transaction: a register that commits and a
  districts half that then throws leaves the register's rows in place. Converted: one txn **per target**
  (0x `ingestPrimaries` runs `runIngestPhase` on a narrowed clone per primary) — legacy "one txn per dataset"
  [plan §1-§3; RE-FREEZE #29].
- **The guarded upsert (×2).** Each target is written with `INSERT … ON CONFLICT (source_id) DO UPDATE`, the
  `SET` list guarded by an arm that includes the step's own version stamp: the register arm at
  [READ `scripts/load-heritage.js:412-416`] and the districts arm at [READ `scripts/load-heritage.js:447-450`]
  — the guard reads `source_dataset_version IS DISTINCT FROM …`, so an unchanged row is **not** written.
  ⚠️ Spec 124 R-AS (`124:246`): a guard that includes the step's own version stamp makes a forced FULL prove
  nothing — the instrument for this row is a **COMMITTED perturbation cohort captured against the LEGACY
  step** [READ §A.F-CODE; plan §1-§3]. **`LH-D2`** pins exactly this (version stamp in the
  guard).
- **The departure DELETE (×2), F-C1-guarded.** The third statement of each dataset removes rows the source no
  longer carries — `… WHERE source_id <> ALL($1::BIGINT[])` [READ `scripts/load-heritage.js:602`] — and it is
  **guarded by F-C1** (`shouldSkipDelete`) at [READ `scripts/load-heritage.js:598-600`] so that a
  catastrophically shrunken source cannot mass-delete. **`LH-D1`** pins that this mass-delete is scored
  **after** the commit until ④.
- **Class B (census correction "A -> B").** The departure DELETE against the step's own table, behind the
  F-C1 empty-set guard, is what makes this class B (`upsert_scoped_departure_delete`, the `load_ravines`
  shape) rather than A [READ `scripts/steps/_schema/step.schema.json:104`].
- **Skips are per dataset, not per step** — DEC-K, introduced with the file at `169f22af` (2026-06-04)
  [READ §A.F-GIT]. **`LH-D7`** pins Spec 61 §3.2's "skip if ALL unchanged" text against
  this per-dataset reality.

### 1.2 Columns written

**`heritage_properties`** — 8,824 rows today [MEASURED 2026-09-30, F-DB] — **written column set** (schema
from F-SCHEMA, information_schema 2026-09-30):

| Column | Type | NOT NULL | Written by |
|---|---|---|---|
| `source_id` | bigint | ✅ (UNIQUE `heritage_properties_source_id_key`) | step (key; `coerceSourceId(p.Folder_Row)`) |
| `status` | text | ✅ | step |
| `geom` | geometry | ✅ | step |
| `designated_date` | date | — | step |
| `bylaw_no` | text | — | step |
| `htg_conser_name` | text | — | step |
| `building_type` | text | — | step |
| `reason` | text | — | step |
| `address_text` | text | ✅ | step (`coerceAddress`, DEC-M) |
| `construction_year` | integer | — | step |
| `source_dataset_version` | text | ✅ | step |
| `id` | bigint **serial** | ✅ | **never written by the step** (DB default) |
| `created_at` | timestamptz | ✅ | **never written by the step** (`default now()`) |
| `updated_at` | timestamptz | ✅ | step (`RUN_AT` = `getDbTimestamp`, load-heritage.js:402; DB default `now()`) |

Indexes: `pkey`, `source_id_key`, `idx_heritage_properties_geom_gist`,
`idx_heritage_properties_geog_gist`, `idx_heritage_properties_status`. **No user triggers** on the table
[READ §A.F-SCHEMA].

**`heritage_districts`** — 29 rows today [MEASURED 2026-09-30, F-DB] — **written column set**:

| Column | Type | NOT NULL | Written by |
|---|---|---|---|
| `source_id` | bigint | ✅ (UNIQUE) | step (key) |
| `name` | text | ✅ | step |
| `hcd_type` | text | ✅ | step |
| `geom` | geometry | ✅ | step |
| `designated_date` | date | — | step |
| `bylaw_no` | text | — | step |
| `wards` | text | — | step |
| `source_dataset_version` | text | ✅ | step |
| `id` | bigint **serial** | ✅ | **never written by the step** (DB default) |
| `created_at` | timestamptz | ✅ | **never written by the step** (`default now()`) |
| `updated_at` | timestamptz | ✅ | step (`RUN_AT`, load-heritage.js:438; DB default `now()`) |

Indexes: `pkey`, `source_id_key`, `idx_heritage_districts_geom_gist`. **No user triggers**
[READ §A.F-SCHEMA].

**`id` (serial) and `created_at` are NEVER written by the step** on either target (DB defaults);
`updated_at` IS written, = the run's DB clock.

### 1.3 Audit rows / verdict / `records_meta`

- **The 16 audit rows of run 1470** [MEASURED 2026-09-30, F-DB — `pipeline_runs` latest id 1470, 2026-07-08,
  records 8853/0/0, verdict PASS, both sub-blocks `skipped_reason:"unchanged_last_modified"`]:
  `dataset_source_license`, `heritage_register_feature_count` **8824**, `heritage_districts_feature_count`
  **29**, `heritage_filtered_listed_pct` **0**, `heritage_geometry_skipped_pct` **0**,
  `heritage_count_drift_pct` **0**, `heritage_mass_delete_pct` **0**, `heritage_geometry_update_pct` **0**,
  `heritage_dataset_age_years` **0**, `heritage_unknown_status_count` **0**,
  `heritage_unknown_hcd_type_count` **0**, `heritage_address_coerced_empty_count` **0**,
  `heritage_register_load_skipped`, `heritage_districts_load_skipped`, `sys_velocity_rows_sec`,
  `sys_duration_ms`.
- **Conditional rows** [READ `scripts/load-heritage.js:675-745`]: the override WARN rows, the bad-id and
  duplicate-source-id WARN rows, the `*_load_failed` FAIL rows and the `*_load_skipped` INFO rows. On a
  tier-1 SKIP run the register/districts rows are the `*_load_skipped` INFO pair seen in run 1470.
- **Verdict is row-derived** via `verdictCascade` [READ `scripts/load-heritage.js:166-170`] — no parallel
  boolean re-derives a row's own threshold.
- **`audit_table`** — `phase` **61**; `name` **`Heritage Properties`**;
  `rows` = the audit rows above; `verdict` from the cascade.
- **`records_meta`** producer keys are the `heritage_load` frozen block (L18 pins the §9 emit shape)
  [READ §10 — L18 §9 emit shape]. Run 1470's keys: `telemetry`, `audit_table`,
  `heritage_load`, `pipeline_meta` [MEASURED 2026-09-30, F-DB].
- **`records_total` = the combined feature_count** — on a SKIP run a skipped dataset carries its prior
  `feature_count`, which is why run 1470's `records_total` is **8853 = 8824 + 29** [MEASURED 2026-09-30,
  F-DB].
- **Prior spread on skip.** Run 1470's districts sub-block carries `geometry_update_pct: 1` — the prior
  spread copies the **previous** run's value, i.e. a skip carries every prior field [MEASURED 2026-09-30,
  F-DB; the 1 comes from run 1277 (2026-06-25), records 8853/1/28, verdict WARN,
  `heritage_geometry_update_pct`=1 WARN, `heritage_count_drift_pct`=0.036, districts features_updated 28
  inserted 1, `filtered_out_appeal_study` 3].
- **Run history.** `pipeline_runs` for `sources:load_heritage`: **8 rows, ALL `completed`**; no
  `load_heritage`/`load-heritage` standalone rows exist [MEASURED 2026-09-30, F-DB].

### 1.4 Source facts

**F-NET** (HEAD + download; scratchpad only) [MEASURED 2026-09-30, transcribed verbatim from
§A.F-NET]:

- **Register HEAD 200**, Last-Modified **Tue, 01 Sep 2026 22:16:33 GMT**, ETag
  `"1788300993.96-1628240-832049643"`, **1,628,240 bytes**, md5 **`37bd232d706be8409f845846474b7c3d`** —
  **MOVED** since run 1470 (04 Jun 2026, `bdca9c50…`). *(Change type: the register last changed
  2026-09-01.)*
- **Districts HEAD 200**, Last-Modified **Wed, 24 Jun 2026 14:02:36 GMT**, ETag
  `"1782309756.859-90942-1038094832"`, **90,942 bytes**, md5 **`eb37b1a023ddccff155145a9fdd2e3d1`** —
  **UNCHANGED** (= the stored version).
- **Register raw 12,332 features**: Part V **7280**, Part IV **1568**, Listed **3484**; **kept 8,848**
  (drift vs 8,824 = **0.0027**); bad `Folder_Row` **0**; null geometry **0**; duplicates **0**; all
  **Point**; empty address **0**; `construction_year < 1700`: **1**. DBF fields include **BOTH `OBJECTID` and
  `Folder_Row`** — **OBJECTID re-appeared** (#426 dropped it in Q2 2026) — and **`Folder_Row` is still
  unique 8848/8848**.
- **Districts raw 32**: Designated District **29**, Under Appeal **1**, Under Study **2**; kept **29**; bad
  `HCD_NO` **0**; null geometry **0**; Polygon **26** / MultiPolygon **3**.

**F-DB** (read-only SELECTs, local dev DB) [MEASURED 2026-09-30, transcribed verbatim from
§A.F-DB]:

- `heritage_properties`: `status` part_iv **1557**, part_v_member **7267** (**8,824**); geometry
  `ST_Point` **8824**. `heritage_districts`: `hcd_type` designated_district / `ST_MultiPolygon` **29**.
- `designated_date` min **1975-11-12**, max **2026-05-21**, NULL **15**. `construction_year` NULL **4434**,
  min **1250**, max **2017**; `<1700`: one row `source_id` **2433372** `"525  BELLAMY RD N"` = **1250**
  (`LH-D10`).
- `address_text = ''`: **0**. Points outside bbox (-79.64..-79.11, 43.58..43.86): **0**.
- `source_dataset_version`: properties all `bdca9c50f1243057ec70720b2e55dd4b` (**8824**); districts all
  `eb37b1a023ddccff155145a9fdd2e3d1` (**29**).
- `logic_variables ILIKE '%heritage%'`: **12 rows** = **10 `enrich_heritage_*`** +
  `sources_heritage_properties_floor` = **8000** + `sources_heritage_districts_floor` = **20**. **ZERO
  loader knobs** — `LH-D4` (0/6 knobs seeded; closed at ② by externalization) holds [READ
  §A.F-DB, §6.1].

### 1.5 Exits

- **Lock contention.** `pipeline.withAdvisoryLock` not acquired ⇒ the early return happens outside the
  callback, so the step is an **SDK SKIP with no summary emitted at all** — not a PASS, not a FAIL, just no
  ledger row from this step [READ §10 — L16 lock contention].
- **Per-dataset failure returns `{failed:true}`**, and `pipeline.run` **ignores** that return ⇒ **exit 0**,
  ledger row `completed`, verdict **FAIL** — **`LH-D8`** (split (a) standalone FAILED status deviation,
  (b) chain-parity skeleton pinned at ④b) [READ §10 L12 (`LH-D8` head 500),
  §F-IDS; plan §1-§3]. Run 1277 is the live shape of a partial-failure run (records 8853/1/28, verdict
  WARN) [MEASURED 2026-09-30, F-DB].
- **An exception outside `loadDataset`** — validation SQL, the transaction wrapper itself — **throws** ⇒ the
  wrapper's own exit contract ⇒ `failed`.

## 2. Behaviour ledger (plan §2) — PH-0 freeze, post-0x seats

One row per plan §2 row, 1–24 in order. Column 2 = plan §2's legacy text with its `[:NNN]` anchors, prefixed `load-heritage.js`. Column 3 = plan §2's seat, corrected by re-ground A where A says "changed". Column 4 = **valid** / **changed** / **① decision** per re-ground A. `LH-D*` ids are used wherever the plan text says `HR-D*` (same number).

| # | Legacy behaviour [READ line] | Converted seat (post-0x) | Re-ground verdict |
|---|---|---|---|
| 1 | Two CKAN zipped shapefiles, licence [`load-heritage.js:42-49`] | two `externals[]` `{kind:"http_file", format:"shapefile_zip", key_property, cache:"revalidate", target:<table>}` (0x) + `on_failure:"fail_row_continue"` on EACH + `execution.shape:"ingest"` | valid |
| 2 | DEC-K: each dataset skip-checked/loaded independently; sub-blocks `heritage_load.{heritage_register,heritage_districts}` [`load-heritage.js:697-698, :757-763`] | 0x per-primary staleness/outcome; external `id` **= the frozen sub-block names `heritage_register` / `heritage_districts`** (NOT the `ckan:` input keys); the four triggers (source_validator pre + content_hash post, per primary) carry `external:"heritage_register"` / `"heritage_districts"` | changed |
| 3 | HEAD failure ⇒ that dataset `failed`, the OTHER still loads [`load-heritage.js:475-480`] | absent `on_head_error` ⇒ throw caught by `on_failure:"fail_row_continue"` ⇒ the failed primary lands a `primary_failed:<id>` FAIL row; the other still loads | changed |
| 4 | Download: md5 stream-hash, **no retry**, timeout 60 000 ms from Zod [`load-heritage.js:57, :504`] | `acquire.downloadArchive` (md5) ✓; `network.retries_from_config:"none"` (0q's disable form); `timeout_from_config` | valid |
| 5 | Tier-1 `STYLE_VALIDATOR_EQUALITY`, `contentHashInNoValidatorsBail:false`, no prior sub-block ⇒ cannot skip [`load-heritage.js:190-195, :482`] | `staleness.preAcquisitionDecision` per primary (each a narrowed clone: `staleness.trigger` filtered to entries whose `external === <id>` or unscoped; `subKey:id` selects the prior sub-block) | valid |
| 6 | Tier-2 `contentHashDecision` + `buildSkipReEmitMeta` DS4 re-emit, `spec_version` pinned after the prior spread [`load-heritage.js:509, :486-495, :518-527`] | trigger `content_hash`; skipEmit per primary | valid |
| 7 | L25 classify: `listed` → filtered, Part IV/V → `part_iv`/`part_v_member`, else unknown; HCD `under appeal/study` → filtered, `designated district` kept [`load-heritage.js:218-234, :322-326, :359-363`] | `shapeRecord` returns reason strings (`filtered_listed`, `unknown_status`, …) → 0p `shaped_skipped_by_reason` (LANDED 70131022) | valid (`LH-D11`: the runner coerces the key and drops null geometry BEFORE `shapeRecord`, the legacy classifies first — exposure 0) || 8 | Key `Folder_Row` (#426) / `HCD_NO` → positive int, else `badSourceId` WARN [`load-heritage.js:334, :370, :197-201`] | `compute.coerceKey` → `bad_key_count`; declared check | valid |
| 9 | null geometry skipped; `coerceAddress` → `''` + coerced count; `DESIGNATED` 1899-11-30 → NULL [`load-heritage.js:336-337, :206-216`] | parser null-geom count; `ctx.tag('address_coerced_empty')`; compute `normalizeDesignatedDate` | valid |
| 10 | `dedupeBySourceId` keep-first + WARN [`load-heritage.js:147-156, :738-739`] | `compute.dedupeBySourceId` + declared check | valid |
| 11 | L14 zero features on first run ⇒ FAIL [`load-heritage.js:540-546`] | `pre_write` check FAIL when `prior==null && feature_count==0` (`viol == 0`) | valid |
| 12 | L7 count drift > 0.5 ⇒ FAIL + abort BEFORE validation; `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` proceeds, FAIL row kept, override WARN row [`load-heritage.js:549-558, :677-679`] | abort ⇒ `outcome:"write_skipped"` on THAT primary + the L7 FAIL check row + an EXTRA library `primary_failed:<id>` gate row (`source:"gate"`, FAIL, `errored:true`) — audit-row delta, explained at ②; the `accept_anomaly` override at the `pre_write` gate must still let the write PROCEED | changed |
| 13 | Validation SQL single call; point arm accepts only `ST_Point`; polygon arm MakeValid + CollectionExtract(3) + ST_Multi [`load-heritage.js:63-127, :563`] | `write.validateGeometries` `geometry_kind:"point"` / `"polygon"` — single-member MultiPoint delta → `LH-D9` | valid |
| 14 | L8 skipped% > 0.05 ⇒ FAIL, abort before txn [`load-heritage.js:579-586`] | same as row 12: `write_skipped` + the L8 FAIL row + the EXTRA `primary_failed:<id>` gate row (audit-row delta); override-at-pre_write must still allow the write | changed |
| 15 | ONE txn **per dataset**: upsert then F-C1-guarded departure DELETE [`load-heritage.js:594-606`] | `executeWrite` per target (0x runs one narrowed `runIngestPhase` per primary, one txn each + `rowConservation`) | valid |
| 16 | L7c mass-delete% > 0.5 ⇒ FAIL **after commit**; `HERITAGE_ACCEPT_MASS_DELETE=1` ⇒ outcome ok [`load-heritage.js:607-613`] | post-write check over `written.by_target.<table>.deleted` (per-table, NEVER the summed top-level `written.*`; keeps the order) — `LH-D1` | changed |
| 17 | L7b geometry-update% > 0.5 ⇒ WARN [`load-heritage.js:719-720`] | post-write WARN check over `written.by_target.<table>.updated` — `LH-D2` | changed |
| 18 | `datasetVersion = contentHash ‖ …` [`load-heritage.js:536`] | `acquired.primaries.<id>.source_dataset_version = dl.contentHash` ✓ (per-primary, not a single `acquired.source_dataset_version`) | changed |
| 19 | Named audit rows computed over BOTH datasets (worst-of: `Math.max`) + license row [`load-heritage.js:675-746`] | checks over the per-primary acquired blocks; compute returns worst-of | valid |
| 20 | Counters: total = combined `feature_count` (skipped dataset CARRIES prior count), new/updated combined [`load-heritage.js:748-755`] | declared SUM counter over the compute's `records_meta.heritage_load.*.feature_count` (= `…heritage_register.feature_count + …heritage_districts.feature_count`); `records_new`/`records_updated` = `written.inserted` / `written.updated` SUMS | changed |
| 21 | `heritage_load` frozen §9 block: per-dataset renames `filtered_out_listed`/`unknown_status_count`, `filtered_out_appeal_study`/`unknown_hcd_type_count` [`load-heritage.js:638-642, :757-763`] | `emits[0].key:"heritage_load"`, `consumers:["enrich_heritage"]`, skeleton verbatim | valid |
| 22 | Lock 61, DB clock, `PIPELINE_NAME` hard-coded chain name [`load-heritage.js:36, :41`] | `identity.lock:61`; `ledgerPipelineName` — standalone name delta `LH-D6` | valid |
| 23 | Prior-read failure ⇒ warn + treat as first run [`load-heritage.js:684-689`] | `staleness.on_prior_run_error:"warn_row"` (LANDED LR-D2 mechanism) — `LH-D3` | valid |
| 24 | Per-dataset failure returns `{failed:true}`, which `pipeline.run` IGNORES ⇒ exit 0 ⇒ ledger `completed` with verdict FAIL; chain continues as `completed_with_errors` [`pipeline.js:589-600, run-chain.js:907, :1067-1073`] | terminal/status parity re-scoped by `LH-D8(a)`: **chain = parity** (run-chain stamps `completed` on exit 0, rolls up `completed_with_errors`); **standalone = FAILED** vs legacy `completed`; 0x adds NO status override | changed |

① decisions (re-ground A "Net ① decisions added by 0x"):

- **①.1** external `id` = the frozen sub-block names `heritage_register` / `heritage_districts`, not the `ckan:` input keys (row 2).
- **①.2** the row-12/14 audit-row delta (the EXTRA library `primary_failed:<id>` gate row) — explained in notes + `explained-diffs.json`.
- **①.3** the row-20 counter is the two-sub-block SUM over the compute's `records_meta`, so it never depends on the post-merge re-emit.
- **①.4** `LH-D8` splits (a) standalone-status deviation (`FAILED` vs legacy `completed`) from (b) chain-parity skeletonSub (pinned, ④b).
- **①.5** **the runner's `shapeRecord` seam carries no external id** (`scripts/lib/step/index.js` `shapeRecord(f.record, { geojson: f.geojson, config, run_at: runAt, tag: tagRecord`), so ONE compute `shapeRecord` serves both primaries and must tell a register record from a district record by its own fields (`STATUS`/`Folder_Row` vs `HCD_TYPE`/`HCD_NO`) — pinned by D6.

## 3. Registry target review (closed set: the step's own registry)

The four closed sections of plan §1 were re-read against HEAD `1bc3ffab`; **plan §1 is the table of record**,
so the tables below transcribe its rows rather than re-deriving them. Re-ground B (re-grepped 2026-09-29
against HEAD `5c2da8bc`) lists the drifted cites — transcribed here as a bullet list — and re-ground C adds
one row that plan §1 never held.

**Drifted cites (re-ground B, "Drifted (update in place at ①)"):**

- `consumer-registry.json` `:260,:335` → **`:268,:359`**.
- `programme-items.json` `:1717/:2036/:2068` → **`:1754/:2073/:2105`**.
- `assert-schema.descriptor.json` `:321-322,:829-830` → **`:330-331,:847-848`**; **+ missed** `:29-30` (`heritage_register_zip`/`heritage_hcd_zip` ids) and `:454` (`http_head_ok` expect list), and `lib/compute/assert-schema.js` **`:95-98`** (the second URL copy).
- `seeds/logic_variables.json` `:5250-5263` → **`:5360-5373`**.
- `logic-variable-groups.json` `:361-362` → **`:363-364`**; `generate-logic-variable-groups.mjs` `:422-423` → **`:424-425`**.
- `step-seam.logic.test.ts` `:85-95,:364-367` → **`:84-91,:371-373`**.
- `lib/compute/enrich-heritage.js` `:67` → **`:68`**.
- `index.js` `runIngestPhase` `:631-1034` → **starts `:930`** (next fn `:1636`); `writes.length` throw `:641-645` → **`:944`**; primaries throw `:650` → **`:1000`**; `on_prior_run_error` `:780-788` → **`:1207`**.
- Spec 122 RE-FREEZE `:1140` → **`:1142-1148`** (**#29 taken**, next free **#30**).

Verified unchanged this run: `43:38`, `43:277`, `61:462`, system map `:43`/`:61`,
`step.schema.json:104`, `acquire.js:238-242`, control-panel `:444-445`, `quality.logic.test.ts:511/:539/:637`,
`load-heritage.js:36/:41/:667`, manifest `:14/:102`, funnel `:662/:954`, `FreshnessTimeline.tsx:38`,
`source-version.js:140-141`, `enrich-heritage.descriptor.json:21` (re-ground B).

### (a) §4.1 files

Plan §1a — the Spec 122 §4.1 file set derived from the slug; each must appear in Spec 61 §5 `### Target Files`.

| File | Read | Touched at | Behaviour impact | Registration | Spec same commit |
|---|---|---|---|---|---|
| `scripts/load-heritage.js` | full | ② → 3-line shell | none (Rule 121 §4.3) | 61 §5 ✓ [READ `61:462`], 43 §5 ✓ [`43:277`] | 61 as-built ② |
| `scripts/load-heritage.descriptor.json` | n/a (new) | ② create | declares today's behaviour | **absent from 61 §5** → add | 61 §5 ② |
| `scripts/load-heritage.notes.json` | n/a (new) | ② create | none | absent → add | 61 §5 ② |
| `scripts/lib/compute/load-heritage.js` | n/a (new) | ② create | pure port of `parseRegister`/`parseHcd`/classifiers/`buildLoadMeta` | absent → add | 61 §5 ② |
| libs used/retired: `scripts/lib/source-version.js` (hits `:13`), `config-loader.js` (`loadMarketplaceConfigs(pool,'source-heritage')` [`load-heritage.js:667`] → retired, `ctx.config`), `safe-math.js`, `geometry-validator.js` (NOT used — the infra lock asserts no require [`load-heritage.infra.test.ts:104-107`]), `units.js` (full; new import) | as stated | no | none | geometry-validator + safe-math in 61 §5 ✓; source-version/config-loader/units **unregistered** under 61 → register at ② (runner-completion D8 precedent) | 61 §5 ② |
| runner `scripts/lib/step/{index,acquire,write,staleness}.js` | hits (`index.js` `:631-1034` full read of `runIngestPhase`; re-ground B: now starts `:930`) | only via prerequisite 0x (LANDED `61e83927`) | 0x | Spec 122 ✓ (+ 122a §A18 [READ `122a:649-651`]) | 122 (0x commit) |

**① rows added by this phase** (created at ①, not present in plan §1a as such):

- `src/tests/steps/load_heritage/violations.test.ts` — **① create, red suite**; registered in Spec 61 §5 at ① (plan §1a lists it as "`src/tests/steps/load_heritage/violations.test.ts` (+ fixtures) … ① create … absent → add"; plan §1d lists it as `new` / `red suite`).
- `src/tests/steps/load_heritage/fixtures/**` — **① create**: `legacy-load-heritage.js.txt` = byte-identical legacy copy, sha256 `8195f2a1…9821` (blob `d7210c0d`) [`scripts/load-heritage.js`]; `legacy-harness.ts`; `heritage-features.json`. Both registered in Spec 61 §5 at ①.
- `docs/reports/golden/load_heritage/cohort.json` — **② create** (re-ground D / F13): the Gate G #38 multi-target input, `{contract_version:1, targets:[{table,capture,why}]}` per table [READ `gates/captures.mjs:16-20, :114-160`]; §6 and §8 do not name it — added to the §1a FILES row and to §8's ② POST step.

### (b) Tables

Plan §1b — both write targets (legacy measured; the descriptor mirrors at ②).

| Object | Read | Touched | Behaviour impact | Migration / registration | Spec |
|---|---|---|---|---|---|
| W `heritage_properties` (source_id BIGINT UNIQUE, status, geom Point 4326, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text NOT NULL, construction_year, source_dataset_version NOT NULL, created_at, updated_at) | full `mig 170:49-72` + `information_schema` [MEASURED] | ② (writes via executor) | byte-identical projected golden | `migrations/170_create_heritage_tables.sql`; RLS `227_rls_class_b_default_deny.sql:53` → `guards.requires` | 61 ② |
| W `heritage_districts` (source_id BIGINT UNIQUE, name NOT NULL, hcd_type, geom MultiPolygon 4326, designated_date, bylaw_no, wards, source_dataset_version, created_at, updated_at) | full `mig 170:79-94` + [MEASURED] | ② | same | mig 170; RLS `227:52-53` | 61 ② |
| GIST `idx_heritage_properties_geom_gist`, `_geog_gist`, `idx_heritage_districts_geom_gist` | [MEASURED `pg_indexes`] | no | consumer performance | `guards.requires` (enrich_heritage already declares two [READ `enrich-heritage.descriptor.json:130-143`]) | — |
| R externals: CKAN register zip (`REGISTER_URL`, key `ckan:heritage-register-wgs84`) + HCD zip (`HCD_URL`, key `ckan:heritage-conservation-districts`), licence [`load-heritage.js:42-49`] | full | ② declared | none | descriptor `inputs.reads.externals[]` ×2; under 0x each carries `target:<table>` + `on_failure:"fail_row_continue"` (re-ground A, §2 row 1) | 61 ② |
| R `pipeline_runs` prior row `sources:load_heritage` completed, `started_at DESC` [READ `source-version.js` `readPriorRunMeta` `:140-141`] | hits | no | prior sub-blocks = DEC-K baseline | runner `staleness.readPriorEmitWithPosture`; prior sub-block selected by `subKey:id` [`index.js:1217-1221`] | — |
| R `logic_variables` — 0 of the loader's 6 knobs seeded (only `sources_heritage_{properties,districts}_floor`, consumed by `assert_data_bounds`) [MEASURED `SELECT variable_key … ILIKE 'heritage%'`] | — | ② +7 seed rows | defaults byte-equal ⇒ none | `scripts/seeds/logic_variables.json` | 61 §12.3a corrected ② |
| `migrations/171_parcels_heritage_columns.sql`, `172_permits_coa_heritage_columns.sql` | hits (`:1-6`) | no | none — enrich-side columns, not this step's data | 61 §5 ✓ | — |

### (c) Consumers

Plan §1c — `consumer-registry.json` rows + the grep for undeclared readers. `consumer-registry.json` has
**zero** `load_heritage` rows today (2 heritage hits, both `producer: enrich_heritage` [READ `:260,:335` —
re-ground B: now `:268,:359`]) ⇒ the gate D rows are **generated at ③** from the new `emits[0].consumers`;
the completeness scan must find no undeclared reader.

| Consumer | Read | Touched | Contract / impact | Registration |
|---|---|---|---|---|
| `scripts/lib/compute/enrich-heritage.js` `readHeritageContract` | full `:44-80` | no | FROZEN — see the contract paragraph below | `emits[0].consumers:["enrich_heritage"]` at ② → registry row at ③ |
| `scripts/enrich-heritage.descriptor.json` | hits `:6-25,:130-143,:184,:281-308,:444,:486` | no | `inputs.reads.steps [{load_heritage, version_pin:"exact"}]` [`enrich-heritage.descriptor.json:21`] — **the seam goes LIVE at ③** (step-seam test comments say "load_heritage is NOT itself converted" [READ `step-seam.logic.test.ts:85-95,:364-367` — re-ground B: now `:84-91,:371-373`]) | 61 ✓ |
| `scripts/lib/compute/assert-data-bounds.js` `:273-278`; `lib/assert-data-bounds-fields.js` `:148-149,:218-219`; `quality/assert-data-bounds.descriptor.json` `:67-71,:1030-1077,:1696-1702`; `generate-assert-data-bounds-descriptor.js` `:74-75` | hits | no | `COUNT(*)` floors 8000 / 20 (`limit_from_config`) | 61 §5 ✓ (assert-data-bounds.js) |
| `scripts/quality/assert-schema.descriptor.json` `:321-322,:829-830` | hits | no | floor-var names only | 61 §5 ✓; re-ground B: lines now `:330-331,:847-848`, **+ missed** `:29-30` and `:454` |
| `src/lib/admin/funnel.ts` `:662,:954` | hits | no | summary text + `load_heritage → heritage_properties` table map | gate D corpus (FUNNEL_SOURCES) |
| `src/components/FreshnessTimeline.tsx` `:38` | hits | no | display label | UI, none |
| `scripts/enrich-permits.js` (61 §5 Target, lock 66) | hits (0 table hits) | no | indirect — reads `parcels.heritage_*` written by enrich_heritage, not this step | 61 ✓ |
| `scripts/analysis/enrich-heritage-cohort-differential.js` | hits (`:6` SPEC LINK only) | no | none (no table read) | 61 ✓ |
| registries/generated: `manifest.json` `:14,:102`; `step-archetype-census.json` `:324-328` (drifted → `:340-345`); `programme-items.json` `:213` (LDG-3 BUILT), `:1717/:2036/:2068` (cutover_prereq lists, all BUILT; re-ground B → `:1754/:2073/:2105`); `step.schema.json` `:104`; `seeds/lineage-meta-snapshot.json` `:2726-2730,:3108-3130`; `generate-logic-variable-groups.mjs` `:422-423` + `src/features/admin-controls/generated/logic-variable-groups.json` `:361-362` (re-ground B → `:424-425` / `:363-364`); `seeds/logic_variables.json` `:5250-5263` (re-ground B → `:5360-5373`); `src/lib/db/generated/schema.ts` `:437-451`; `scripts/surfaces/**` census/F16 descriptors (generic telemetry notes) | hits | ③ via `npm run cutover` (manifest parity, census reason, groups regen); rest no | none | registry_reserved → orchestrator |
| schema fixtures `fixtures/valid/enrich_heritage.descriptor.json`, `fixtures/invalid/enricher-pending-without-invalidator.json`, `fixtures/census/{bad-mismatched-archetype,missing-slug-totality}.json` | hits | no | test fixtures naming the tables/slug | — |
| **NEW (re-ground C) — `scripts/lib/compute/assert-schema.js` `:95-98,:109-110`** | hits | **N** (no code change) | A **SECOND copy of BOTH heritage URLs**, used for the step's own HEAD-reachability check with externals `heritage_register_zip` / `heritage_hcd_zip` [READ `assert-schema.descriptor.json:29-30,:454`]. It is **byte-equal to `load-heritage.js:44-47` today** [MEASURED node]. The two URLs must stay byte-equal to the descriptor `inputs.reads.externals[].url`; if the descriptor re-spells a URL the assert-schema copy silently diverges and the reachability check passes/fails against the wrong resource. Spec 61 §5 lists only the SHELL `scripts/quality/assert-schema.js` [READ `61:476`]; the URLs live in the **unregistered** `scripts/lib/compute/assert-schema.js` ⇒ register at ②. Spec 61 `:476` and `:983` also claim assert-schema checks "OBJECTID + HCD_NO attribute + STATUS/HCD_TYPE allowed values", but the compute carries only URL reachability [READ `assert-schema.js:95-110`; `grep -i "OBJECTID\|HCD_NO\|Folder_Row"` → 0 hits] ⇒ **spec drift, corrected at ②** (`LH-D5` class, not a new defect id — same correction as re-ground C) | 61 (②) |

**The frozen consumer contract** (`readHeritageContract`, `enrich-heritage.js:44-80`): it reads the last
**completed** `sources:load_heritage` row `completed_at DESC`; it **halts** unless `heritage_load.spec_version
=== '1.1'`, both sub-blocks are present, **each** `feature_count > 0`, `drift_check_passed !== false`, **each**
`source_dataset_version` is non-empty, and **both tables are non-empty** [READ `enrich-heritage.js:44-78`].
It reads **`drift_check_passed` only** at `:68` (re-ground B: the plan's `:67` drifted) — **not
`mass_delete_check_passed`** ⇒ `LH-D1` (enrich proceeds over a depleted table). It also reads both tables in
the Spec 61 §11.1 join [READ `:138,:145,:222,:227`].

### (d) Tests

Plan §1d.

| Test | Read | Touched at | Impact |
|---|---|---|---|
| `src/tests/load-heritage.logic.test.ts` (126 L, `require('../../scripts/load-heritage.js')` `:8`) | full | ② re-point IN PLACE at the compute (never deleted/weakened) | helpers move |
| `src/tests/load-heritage.infra.test.ts` (145 L, `readFileSync` of the script `:11`; pins lock 61, `PIPELINE_NAME`, `SPEC_VERSION`, spread ORDER `:91-93`, `Folder_Row` `:119-120`, mig 170 + manifest position `:126-145`) | full | ② re-point: script-text regexes → descriptor/compute assertions of the same facts | locks preserved, not dropped |
| `src/tests/source-version.logic.test.ts` `:38,:64,:152-158,:267-278` | hits | ② re-point to `lib/step/staleness.js` (ravines precedent `:58-64`) | — |
| `src/tests/steps/load_heritage/violations.test.ts` | **new** | ① | **red suite** (the new suite for this phase) |
| `enrich-heritage.{infra,logic}.test.ts` (`:29-31` / `:36-38` pin `PRODUCER_NAME='sources:load_heritage'`), `enrich-heritage-418.logic.test.ts` (`:47-83` `heritage_load` fixtures), `steps/enrich_heritage/violations.test.ts`, `db/enrich-heritage-418`, `db/enrich-heritage-kill-mid-run`, `db/enrich-permits-heritage`, `enrich-permits-heritage.logic` | hits | no | consumer-side contract locks — stay green UNEDITED (proof the contract held) |
| `db/migration-170-heritage` (22 hits), `-171`, `-172` | hits | no | schema locks |
| `pipeline-advisory-lock.infra.test.ts` `:36-38` (`load-heritage.js: 61`), `step-seam.logic.test.ts` `:85-95,:364-367` (re-ground B → `:84-91,:371-373`), `quality.logic.test.ts` `:511,:539,:637`, `admin-manifest-utils.logic.test.ts` `:53`, `control-panel.logic.test.ts` `:444-445`, `steps/assert_data_bounds/violations.test.ts` `:544` | hits | step-seam comment/expected pair count at ③ (derived list, simplification item 4); control-panel `EXPECTED_LOGIC_VAR_KEYS` +7 at ② | lock 61 must still be found via `identity.lock:61` |

**Unread rows: none** (plan §1d), plus the one new suite above.

**Census drift:** `step-archetype-census.json:340-345` — the plan said `:324-328` [READ
§A.F-CODE].

## 4. PH-3 — Intent ledger (G3)

> **Role split.** This pass DISCOVERS: the Construct column, the `READ` line anchors, the Intent column and the
> candidate LH id are derived by READING `scripts/load-heritage.js` and the ① red suite — not invented. The
> **Disposition** column is **the plan's**, adjudicated by the orchestrator/panel at G3; the `git log -S<construct>
> -- scripts/load-heritage.js` probes that fill the *Introduced* column are **executed by the orchestrator** (this
> pass transcribes them verbatim in §A.F-GIT). Disposition
> vocabulary is **closed**: `preserved-in-runner` · `preserved-in-validator` · `preserved-in-compute` ·
> `encoded-as-descriptor-field` · `encoded-as-deviation` · `knowingly-retired` — exactly one per row. A
> `preserved-in-compute` row also names **where the rule is written** (`notes.json` or a `checks[]` `why`), so a
> future reader never has to re-derive the ledger from the code. Commit hashes / dates / subjects are verbatim
> from §F-GIT.

| # | Construct [READ line] | Introduced (git log -S) | Intent | Disposition (closed set: preserved-in-runner / -validator / -compute, encoded-as-descriptor-field / -deviation, knowingly-retired) | LH id | ① lock |
|---|---|---|---|---|---|---|
| 1 | **DEC-K per-dataset skip/load** — each dataset skip-checked and loaded INDEPENDENTLY (one may skip while the other reloads); sub-blocks `heritage_load.{heritage_register,heritage_districts}` [READ `:9-12`, `:697-698`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | A register that is unchanged must not force a districts re-download, and a register failure must not block the districts — the two sources have independent change cadences | `preserved-in-runner` (0x per-primary `ingestPrimaries`/`aggregatePrimaries` — one narrowed clone, one staleness decision, one outcome per primary) | — | L10, L12, D12 |
| 2 | **Advisory lock 61** — `ADVISORY_LOCK_ID = 61`, DEC-A: lock = spec number [READ `:36`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | Serialize the step against any concurrent run of itself; registered in the §A.5 lock registry as row 61 | `encoded-as-descriptor-field` (`identity.lock: 61`; the shell no longer carries the literal) | — | L16, D1 |
| 3 | **`SPEC_VERSION = '1.1'`** — the consumer's `readHeritageContract` pin, re-pinned AFTER the prior spread so a tier-1 skip cannot carry a stale `'1.0'` [READ `:37`, spread+re-pin `:493`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` (fold: **"skip-branch spec_version re-pin"**) | A skip carries every prior field — including the version — so the frozen version must be re-stamped after the spread or a skipped sub-block would fail the consumer's exact-match gate | `encoded-as-descriptor-field` (`identity.spec_version: "1.1"`; the value is re-emitted through the emit skeleton) | — | L10, L18, D1 |
| 4 | **`PIPELINE_NAME = 'sources:load_heritage'`** — the chain-scoped ledger name `run-chain.js:253` records (`${chainId}:${slug}`), NOT the spec's `source-heritage` [READ `:41`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | Every `pipeline_runs` row and the consumer's prior-row lookup key on this name; spelling it from the spec would write orphan ledger rows | `preserved-in-runner` (`ledgerPipelineName` — the runner derives the chain-scoped name; the literal becomes inert) | LH-D6 | — |
| 5 | **`Folder_Row` is the register source key** (#426 re-key from `OBJECTID`) [READ `:334`, issue #426] | `78748a36` · 2026-06-05 · `fix(61_source_heritage): re-key register source_id OBJECTID->Folder_Row (#426)` | The Q2 2026 CKAN refresh dropped `OBJECTID`, so every register row keyed null and 0 rows loaded (caught by the >=8000 floor); `Folder_Row` was verified unique across all features (the CEN/YR/SEQUENCE/SEC/REV composite is not) [78748a36 body] | `preserved-in-compute` (`coerceKey`; the key column is declared as `key_property: "Folder_Row"` on the `heritage_register` external; the #426 rationale is written in `notes.json`) | — | L2, D2, D5 |
| 6 | **L25 classification, case-insensitive** — `listed` → filtered, Part IV/V → `part_iv`/`part_v_member`, else unknown; HCD `under appeal`/`under study` → filtered, `designated district` kept, else unknown [READ `:228-243`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | The source is hand-maintained: the same status arrives as `Part IV`/`PART IV`/`part iv`, so the classifier folds case before it compares, and an unrecognised label is a counted WARN, never a silent drop | `preserved-in-compute` (`shapeRecord`; the accepted vocabulary + the fold rule are written in `notes.json`) | LH-D11 | L1, D6 |
| 7 | **1899-11-30 sentinel + `coerceAddress` (DEC-M)** — the ArcGIS null-date sentinel becomes SQL NULL; a missing/blank `ADDRESS` becomes `''` and is counted [READ `:206-226`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | The sentinel is a placeholder, not a date — storing it would fabricate a 1899 designation; `address_text` is `NOT NULL`, so an absent address must be coerced, not thrown | `preserved-in-compute` (both rules written in `notes.json`; the coercion is also tagged at the seam as `address_coerced_empty`) | — | L5, D6 |
| 8 | **`dedupeBySourceId` keep-first + duplicate WARN** — the first row for a key wins; the duplicate count is a named WARN row [READ `:153-163`, `:738-739`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` (fold: **"duplicate-source-id WARN"**) | A duplicate key inside one file must not make the upsert outcome depend on which row the parser happened to emit last, and it must be visible rather than silent | `preserved-in-compute` (`dedupeBySourceId`; the keep-first rule and the WARN threshold are a `checks[]` `why`) | — | L4, D7 |
| 9 | **L14 zero-features first run** — a register with zero loadable features on the FIRST run is a FAIL, writes no rows, and does not stop the other dataset [READ `:540-546`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` (fold: **"L14 guard"**) | An empty parse on a first run is a broken download, not a legitimately empty source — committing it would look like a valid baseline and the consumer's `feature_count > 0` gate would halt the chain later instead | `encoded-as-descriptor-field` (`pre_write` check, generic `limit: "viol == 0"`) | — | L6, D9 |
| 10 | **L7 count drift abort + override** — new/prior `feature_count` drift > 0.5 ⇒ FAIL and abort BEFORE validation; `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` proceeds, keeps the FAIL row and adds an override WARN row [READ `:549-558`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | A sudden count collapse is the earliest signal of a truncated upstream file; the threshold is a policy bound and the override is a documented, auditable one-shot hatch | `encoded-as-descriptor-field` (`pre_write` check `heritage_count_drift_pct` + `override.accept_anomaly` entry for `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT`) | — | L7, D9, D10 |
| 11 | **L8 geometry-skipped abort before the txn** — skipped% > 0.05 ⇒ FAIL, abort the register write before the transaction opens [READ `:578-586`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | Rows that failed §3.5 geometry validation must not be partially committed: the guarantee is "abort BEFORE any DB write", so the check lives at `pre_write` | `encoded-as-descriptor-field` (`pre_write` check `heritage_geometry_skipped_pct`) | — | L8, D9 |
| 12 | **F-C1 empty-set DELETE guard** — when the parsed set is EMPTY the orphan DELETE is suppressed (WARN log, no audit row) [READ `:136-139`, `:598-600`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | An empty parsed set is far more likely a failed parse than a source that legitimately lost every row; without the guard the departure DELETE would wipe the whole table | `preserved-in-runner` (`write.js` empty-set guard — the library suppresses the departure DELETE, not the compute) | — | L9 |
| 13 | **L7c mass-delete scored AFTER the commit** — `mass_delete_pct` > 0.5 is FAIL, but the DELETE has already committed inside the transaction [READ `:607-613`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | The guard is a retroactive alarm, never a prevention — it reports the loss rather than stopping it; the consumer reads only `drift_check_passed`, so it proceeds over the depleted table | `encoded-as-deviation` (pinned WRONG form: a `post` check over `written.by_target.<table>.deleted` keeps the legacy order until ④) | LH-D1 | L13, D9 |
| 14 | **The step's own version stamp in the upsert guard** — `source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version` is a guard ARM alongside the five plain SET columns [READ `:412-416`, `:447-450`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | Guarantees the version column is refreshed on every republish — but it also means a version-only change fires the UPDATE, so an unchanged row reads as a geometry update (run 1277: `heritage_geometry_update_pct` 1, WARN) | `encoded-as-deviation` (pinned: the guard column set is carried verbatim so a forced FULL cannot prove anything until ④) | LH-D2 | L14, D4 |
| 15 | **tier-2 content hash + DS4 re-emit** — metadata changed (tier-1 says "changed") so the bytes are fetched, but the md5 matches the prior `content_hash` ⇒ skip AFTER the download, BEFORE parse/validate/upsert; the prior sub-block is re-emitted (DS4) [READ `:509-532`] | `0b230472` · 2026-08-10 · `feat(43_chain_sources): Phase B B1 - source-version lib + the tier-2 content-hash gate` | A CKAN `Last-Modified` can move without the bytes moving (re-publish, metadata touch): tier-2 avoids a pointless parse + write storm, and the re-emit keeps the frozen sub-block shape intact for the consumer | `preserved-in-runner` (`content_hash` staleness trigger + `multiPrimarySkipEmit`, which re-stamps SKIPPED primaries only) | — | L11, D12 |
| 16 | **Prior-read `.catch` ⇒ treat as first run** — a FAILED prior-run read degrades to "no baseline" with a WARN, never a throw [READ `:684-689`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | A missing or unreadable prior row must not wedge the loader: the step re-establishes a baseline instead of failing, and the degradation is logged so it is visible | `encoded-as-descriptor-field` (`staleness.on_prior_run_error: "warn_row"`) | LH-D3 | L15, D12 |
| 17 | **`{failed: true}` return IGNORED ⇒ ledger `completed` + verdict FAIL** — a per-dataset failure returns `{failed:true}`, `pipeline.run` ignores it ⇒ exit 0 ⇒ the run is recorded `completed` with a FAIL verdict [READ `:768`] | `169f22af` · 2026-06-04 · `feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)` | The step reports a failed dataset through its OWN audit rows/verdict; the process status is left to the wrapper's exit contract — so the chain continues and the failure is visible in the verdict, not in the run status | `encoded-as-deviation` (standalone: a converted run records FAILED where the legacy records `completed`; chain parity is preserved — `LH-D8(a)`) | LH-D8 | L12, D13, D14 |

### 4.1 Fences with a regression lock today

Not every behaviour above is already fenced by a plain `it(...)` at this commit. The split:

- **Locked today (GREEN against the verbatim legacy oracle):**
  - the `169f22af` **spread order** — `src/tests/load-heritage.infra.test.ts:91-93`;
  - **`Folder_Row`** as the register key — `src/tests/load-heritage.infra.test.ts:119-120` (and L2);
  - the loader **helpers / classification / dedupe / address** contract —
    `src/tests/load-heritage.logic.test.ts` (126 L) re-pointed at the compute at ②;
  - **lock 61** — `src/tests/pipeline-advisory-lock.infra.test.ts:38` (`load-heritage.js: 61`), preserved at ②
    as `identity.lock: 61` [READ §A.F-GIT, §A.F-CODE].
- **UNLOCKED before ① — no fence anywhere and no `it(...)` covering them, now fenced by the ① red suite:**
  - **DEC-K independence** — a register failure leaving the districts lane free to commit (row 1) — now **L10 /
    L12**;
  - **HR-D1 post-commit order** — the mass-delete guard scored AFTER the DELETE has committed (row 13) — now
    **L13**;
  - **the L25 case fold** — the case-insensitive status/HCD classification and the filtered/unknown tallies
    (row 6) — now **L1** (and the seam-order consequence is `LH-D11`, row 6).

## 5. PH-5 — Seam map (G5)

> Every seam the conversion crosses, with the legacy site that holds it today and the converted seat that
> takes it. Anchors are `[READ scripts/load-heritage.js:<line>]`; the ① red suite pins the seams at the
> behaviour level (L1–L18 / D1–D14, `src/tests/steps/load_heritage/violations.test.ts`).

| Seam | Legacy site [READ line] | Converted seat |
|---|---|---|
| **DB seam** | pool.query prior read `:684`; validation SQL `:563`; the two guarded upserts `:404` / `:440`, each inside its own `withTransaction` `:594`; the F-C1-guarded departure DELETE `:602`; advisory lock 61 `:670` | runner (`runIngestPhase` per narrowed clone) + `executeWrite` per target — one txn per target, `write.validateGeometries` for `:563`, `written.by_target.<table>` for the DELETE counts; `identity.lock: 61` for `:670` |
| **clock seam** | `getDbTimestamp` `:671`; `nowMs` consumed by the dataset age `:481` and by `ageDaysFrom` `:726` | runner clock — the runner supplies `run_at` / the DB timestamp; the compute reads it, never `Date.now()` |
| **network seam** | HEAD `:253-263`; the streamed md5 download `:268-284`; the Zod timeout `:57` | `acquire.js` HEAD + `downloadArchive` (streamed md5), `timeouts` from config; `network.retries_from_config: "none"` (the 0q disable form) |
| **argv/env seam** | no argv; env `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT` `:470` / `:677`; env `HERITAGE_ACCEPT_MASS_DELETE` `:471` / `:678`; `PIPELINE_CHAIN` (+ the hard-coded `PIPELINE_NAME` `:41`) via `pipeline.run` | `override.accept_anomaly` entries (env-gated) for both heritage knobs; `ledgerPipelineName` for the chain name (`LH-D6`) — no argv surface at all |
| **filesystem seam** | `fs.mkdtempSync` `:498`; `extractZip` `:286-296`; `locateShapefile` `:299-309`; `fs.rmSync` `:519` | acquire temp dir — the runner owns create/extract/locate/cleanup; the compute never touches the filesystem |

### 5.1 Prerequisites

- **0x — LANDED.** `61e83927`, merge `5c2da8bc` (**RE-FREEZE #29**) — the runner seams above
  (`ingestPrimaries` / `aggregatePrimaries` / `executeWrite`, per-primary `subKey`, the 4 staleness triggers,
  `primary_failed:<id>` gate rows) exist at HEAD; this report is re-grounded against them.
- **0p / 0q / 0r — LANDED** (`70131022`, `9bc43b15`, `b4913395`) per plan §4 — `shaped_skipped_by_reason`
  (the `filtered_*` / `unknown_*` seats of §2 row 7), the `retries_from_config: "none"` network-disable form
  (§2 row 4) and the third prerequisite's seat are all in place, so **PH-5 crosses no unlanded seam**.

## 6. PH-6 — Classification + defect ledger (G6)

`load_heritage` is an **INGESTOR** [READ `scripts/steps/_schema/step-archetype-census.json:340-345` — census row,
C5; the plan's `:324-328` has drifted], **write class B** — two guarded upserts plus two F-C1-guarded departure
DELETEs, one transaction per dataset; the class was corrected **A → B** for this file in the schema census
[READ `scripts/steps/_schema/step.schema.json:104`] and re-derived from the code in §1.1 above. The step is
committed in the **compressed form** (R-PACE-1): 6 converted INGESTOR members are on record [READ
§10; plan §1], so the compressed default applies and no full-form reason exists.
**Risk class A — chance MEDIUM × impact HIGH** (orchestrator assessment): this is the **first multi-primary
INGESTOR**, running on **freshly landed 0x code** (`61e83927`, merge `5c2da8bc`, RE-FREEZE #29) and carrying
**two independent failure postures** (DEC-K: one dataset `fail_row_continue`, the other still loading) — any of
which can fire alone. The **impact is HIGH** because heritage designation feeds `enrich_heritage` →
`parcels.is_heritage_designated` → the permits / CoA surface: a **zero skeleton** `heritage_load` sub-block
**HALTs** that consumer (`readHeritageContract` halts unless each sub-block's `feature_count > 0` [READ
`lib/compute/enrich-heritage.js:44-80`]), and a **mass delete** **depletes** it (`LH-D1`: the consumer reads
`drift_check_passed` only, never `mass_delete_check_passed` [READ `enrich-heritage.js:68`]).

| Behaviour | Class |
|---|---|
| Spec 61 **§9 `heritage_load` block + key names**; `spec_version` `"1.1"`; DEC-K per-dataset skip/failure; `Folder_Row` / `HCD_NO` key fences; the L25 status / HCD-type vocabulary; the 1899-11-30 sentinel + address-coercion rules; the **L7 / L8 / L14 aborts**; **F-C1** (`shouldSkipDelete`); **lock 61**; the **16 audit rows** | **CONTRACT** |
| Streamed md5 hashing; temp-dir layout (create/extract/locate/cleanup); batch size `maxRowsPerInsert`; log text | **INCIDENTAL** |
| Every `LH-D<n>` row below | **DEFECT** |

### 6.1 Defect ledger

The ids are **`LH-D<n>`**, renamed from the plan's `HR-D<n>` **with the SAME numbers**, because
`scripts/analysis/step-validate.mjs` derives the G6 prefix from the slug's initials — `defectPrefixFor`
`:783-785` maps `load_heritage` → **`LH`** — and an `HR-D*` row therefore scores **G6 0** (hard stop), while
`LH-D` had **0 hits** repo-wide [READ §6.1, §A.F-CODE]. The **neighbourhoods precedent**
renamed `NB-D → N-D` for exactly this reason (commit `110c8c31`), and Spec 122a:651's **"HR-D8"** is
**LH-D8** [READ §A.F-CODE; plan §3 + re-grounding F11].

| LH id | Behaviour (greppable anchor in `scripts/load-heritage.js`) | Kind | Closes at | Status | ① lock |
|---|---|---|---|---|---|
| LH-D1 | `const massDeleteBreached` — the L7c mass-delete FAIL is scored **after** the F-C1-guarded DELETE has committed; the consumer checks `drift_check_passed` only, never `mass_delete_check_passed` (:594-613; `enrich-heritage.js:68`) | deviation | ④c Q1 — move to `pre_write` over a dry-run departure count, own RED→GREEN | OPEN · **PIN** | L13 / D9 |
| LH-D2 | `source_dataset_version IS DISTINCT FROM` sits **inside** the upsert guard on both targets (:416, :451) ⇒ every new CKAN version rewrites EVERY row (LS018 class), so L7b `heritage_geometry_update_pct` counts version-stamp rewrites, not geometry changes [MEASURED run 1277 HCDs 28/28 updated → pct 1.0 WARN] | deviation | ④c Q2 — guard = data columns only; L7b counts geometry diffs | OPEN · **PIN** | L14 / D4 |
| LH-D3 | `treating as no baseline` — the prior-read `.catch` silently degrades to a first run (:684-689) | limitation | ② declared `warn_row` (parity); ④a → `fail_step` (LR-D2 precedent) | OPEN · **PIN** | L15 / D12 |
| LH-D4 | `loadMarketplaceConfigs(pool, 'source-heritage')` — **0 of 6** loader knobs seeded, so the Zod literals rule (:51-58, :667) | limitation | ② closes by externalization — **7** logic vars seeded, defaults byte-equal | OPEN · **PIN** | D8 |
| LH-D5 | Spec 61 §3.10 row "`OBJECTID/HCD_NO` … `invalid_geometry_skipped`" + "Advisory lock 62" — the code keeps a separate WARN counter and lock 61 (:198, :36) | spec-drift | ② — correct the SPEC text (AP-D1 / LC-D1 precedent) | OPEN · **PIN** | — |
| LH-D6 | `PIPELINE_NAME = 'sources:load_heritage'` — a standalone run reads/writes `load_heritage`, but the consumer reads only `sources:load_heritage` (:41; `enrich-heritage.js:28`) | limitation | ② declared limitation (LC-D7 precedent) | OPEN · **PIN** | L18 / D14 |
| LH-D7 | Spec 61 §3.2 "Skip if all unchanged" vs the code's per-dataset skip (DEC-K) | spec-drift | ② — correct the spec text | OPEN · **PIN** | L10 |
| LH-D8 | `return (reg.outcome !== 'failed'` — a per-dataset failure lands a **completed** ledger row with a `skeletonSub()` (feature_count 0, version null), which HALTs the next `enrich_heritage` and makes the next run's L7 vacuous (:478, :544-546, :555-557) | deviation | (a) ② declared deviation — standalone status FAILED vs legacy `completed`; (b) ④b re-emit of the prior sub-block (DS4 shape) | OPEN · **PIN** | L12 / D13 / D14 |
| LH-D9 | write.js point arm `ST_NumGeometries(ST_CollectionExtract(repaired, 1)) = 1` accepts a single-member MultiPoint that the legacy `WHEN ST_GeometryType(geom) = 'ST_Point'` skips (`scripts/lib/step/write.js` `geometryFinalExpr` :384-399 vs legacy :73-75); **0 non-Point rows today** | limitation | declared `limitations[]` + check over `geometry_collection_extracted` (LC-D8 / Q2 precedent) | OPEN · **PIN** | D14 |
| LH-D10 | Source row `construction_year = 1250` (source_id `2433372`, "525 BELLAMY RD N"); 4,434 NULL [MEASURED 2026-09-30] — the legacy has no bound | data | filed post-conversion plausibility WARN (§7); **not in scope** for this conversion | OPEN · **PIN** | — |
| LH-D11 | **NEW** — tally order: `const cls = classifyRegisterStatus(p.STATUS)` runs **before** `coerceSourceId(p.Folder_Row)` (:322-326 vs :334), so a Listed / Under-Appeal row with a bad key or null geometry counts `filtered_*` in the legacy but bad-key / null-geometry in the converted step (acquire.js `parseShapefile:536-563` re-orders it) | deviation | ② declared deviation — exposure **0 of 12,332 + 32** raw rows (0 bad keys, 0 null geometry) | OPEN · **PIN** | L1 / D6 / D14 |

### 6.2 Plan premises that did not survive re-grounding (orchestrator findings, owed a ruling)

- **(a) the `HR-D` prefix (above).** The plan's `HR-D<n>` ids score **G6 0** (hard stop) because `defectPrefixFor` (`step-validate.mjs:783-785`) derives the prefix from the slug's initials — `load_heritage` → **`LH`** [READ §A.F-CODE]. Renamed to **`LH-D<n>`, same numbers**; the neighbourhoods precedent (`NB-D → N-D`, `110c8c31`) is identical. Owed: a ruling that the rename (and `122a:651`'s stale "HR-D8" citation) is a **note-level** correction, not a plan defect.
- **(b) R-AS (Spec 124 124:246).** The guard carries the step's **own version stamp** (`LH-D2`: `source_dataset_version` inside `IS DISTINCT FROM` at `load-heritage.js:416`, `:450`), so a forced FULL **proves nothing** — the plan's PRE/POST route (a CKAN move, or `HERITAGE_FORCE_RELOAD`) is **not the R-AS instrument**. R-AS demands a **COMMITTED perturbation cohort captured against the LEGACY step** (massing `e4120879` / neighbourhoods `110c8c31` precedent), and that capture **needs DB writes, i.e. the capture slot** — which the plan does not allocate. Owed: a ruling on the cohort before ②.
- **(c) D2.** The **register MOVED** (2026-09-01, md5 `37bd232d…`) but **districts did NOT** (unchanged since 2026-06-24, md5 `eb37b1a023ddccff155145a9fdd2e3d1` = the stored version) [READ §A.F-NET]. So `heritage_districts` has **no organic forced change**: an operator decision (plan D2) is owed for how its PRE golden acquires nonzero, and the register move alone cannot cover both targets.
- **(d)** The plan's **PRE command omits `--tables=`**: with no descriptor `capture-step-golden.js` `resolveTables` (`:394-410`) **snapshots nothing**, and `--table-columns` naming an un-snapshotted table **THROWS** (`:1058-1060`) [READ §A.F-CODE]. The §8 PRE line must carry `--tables=` for both tables or no golden is produced at all.
- **(e)** Gate **G**'s `cohort_declared` reads the named capture's **STEP-level** counters (`scripts/analysis/gates/captures.mjs` `nonzeroDecision`) — it **cannot attribute a write to one of two tables**. Each `cohort.json` `why` must therefore cite that table's **per-sub-block `features_inserted/updated`**, not the step total, or the multi-target proof is unfalsifiable [READ plan §6/§8, §A.F-CODE].
- **(f)** The `shapeRecord` seam carries **no external id** — `{geojson, config, run_at, tag, lookups?}` (`index.js:1383-1385`) [READ §A.F-CODE]. ONE compute `shapeRecord` serves both primaries, so it must tell a register record from a district record by its own fields (§2 ①.5; D6 pins it); a per-primary seam would be a library rung (0y), not a heritage decision.
- **(g)** CKAN's September register **re-adds `OBJECTID` beside `Folder_Row`** (`Folder_Row` still **unique 8848/8848**) [READ §A.F-NET] — the #426 key fence **holds** (`coerceSourceId(p.Folder_Row)`), **no action**.

## 7. PH-6 — Literal ledger (Rule 3)

Closed disposition set: **`logic variable`** / **`units.js import`** / **`vocabulary (notes.json)`**. Every
row below is one of the three. The seven knobs are the plan §5 table verbatim; all seven are prefixed
`load_heritage_`, all carry `on_invalid:"fail"`, all are seeded at ②, and every default is **byte-equal** to
the Zod literal it replaces (a change of default would be a behaviour change, forbidden by Spec 121 §4.3).

| Legacy literal [READ line] | Value | Disposition | Name / seat |
|---|---|---|---|
| `heritageSkipCheckThresholdYears` [`load-heritage.js:52`] | 2 | `logic variable` | `load_heritage_dataset_age_warn_years` — check `heritage_dataset_age_years` (× `DAYS_PER_JULIAN_YEAR`) |
| `heritageAcceptFeatureCountDriftPct` [`load-heritage.js:53`] | 0.5 | `logic variable` | `load_heritage_count_drift_fail_pct` — `heritage_count_drift_pct.limit_from_config` |
| `heritageInvalidGeometryFailPct` [`load-heritage.js:54`] | 0.05 | `logic variable` | `load_heritage_invalid_geometry_fail_pct` — `heritage_geometry_skipped_pct` |
| `heritageMassDeletePct` [`load-heritage.js:55`] | 0.5 | `logic variable` | `load_heritage_mass_delete_fail_pct` — `heritage_mass_delete_pct` |
| `heritageDriftGeometryUpdatePct` [`load-heritage.js:56`] | 0.5 | `logic variable` | `load_heritage_geometry_update_warn_pct` — `heritage_geometry_update_pct` (WARN) |
| `heritageDownloadTimeoutMs` [`load-heritage.js:57`] | 60000 | `logic variable` | `load_heritage_download_timeout_ms` — `network.timeout_from_config` |
| `round3` scale [`load-heritage.js:245-247`] | 1000 | `logic variable` | `load_heritage_round_scale` — compute rounding (centreline `7f14e998` precedent) |
| `86400000` in `ageDaysFrom` [`load-heritage.js:176`] | — | `units.js import` | `MS_PER_DAY` |
| `365.25` in `datasetAgeStatus` [`load-heritage.js:182`; also the audit-row age at `:726`] | — | `units.js import` | `DAYS_PER_JULIAN_YEAR` |
| L25 status vocabulary — `listed`, `part iv`, `part v` → `part_iv` / `part_v_member` [`load-heritage.js:228-235`] | — | `vocabulary (notes.json)` | accepted status set + the case fold, written in `notes.json` and in the classifier's `why` |
| L25 HCD-type vocabulary — `under appeal`, `under study` (filtered), `designated district` (kept) [`load-heritage.js:237-243`] | — | `vocabulary (notes.json)` | accepted HCD-type set + the fold, `notes.json` + `checks[]` `why` |
| `1899-11-30` ArcGIS null-date sentinel [`load-heritage.js:218`] | — | `vocabulary (notes.json)` | the sentinel rule in `normalizeDesignatedDate`, written down in `notes.json` |
| Advisory lock `61` [`load-heritage.js:36`] | — | `vocabulary (notes.json)` / descriptor identity | `identity.lock: 61` — a registration value, not a numeric knob |
| `SPEC_VERSION = '1.1'` [`load-heritage.js:37`] | — | `vocabulary (notes.json)` / descriptor identity | `identity.spec_version: "1.1"` — the consumer's exact-match pin |
| `REGISTER_URL` [`load-heritage.js:44-45`] | — | `vocabulary (notes.json)` / descriptor identity | `inputs.reads.externals[].url` for `heritage_register`; the `scripts/lib/compute/assert-schema.js:95-98` copy must stay byte-equal (§3(c), NEW row) |
| `HCD_URL` [`load-heritage.js:46-47`] | — | `vocabulary (notes.json)` / descriptor identity | `inputs.reads.externals[].url` for `heritage_districts`; same byte-equality constraint |
| `LICENSE_URL` [`load-heritage.js:43`] | — | `vocabulary (notes.json)` | descriptor licence field; the `dataset_source_license` audit row |

**Note (LH-D4).** **0 of these 7 names are seeded today** — `logic_variables ILIKE '%heritage%'` returns 12
rows, all `enrich_heritage_*` or the two `sources_heritage_*_floor` floors, so the loader's Zod block at
`:51-58` currently **is** the only definition of every knob [MEASURED 2026-09-30, §1.4 F-DB; §6.1 LH-D4].
② seeds all seven with these defaults.

## 8. Non-determinism inventory (before the first golden)

Written **before** any golden exists, per plan §8, so that every later PRE/POST diff has a named cause.

- **`id` (bigserial) on BOTH tables.** Columns are DB defaults the step never writes (§1.2); a re-inserted
  row takes a NEW id, so `id` is not stable across runs. The projected hash **excludes `id`** — the
  `--table-columns` lists in §9.1 omit it deliberately.
- **`created_at` / `updated_at`.** `created_at` is a DB default; `updated_at` is written by the step as the run's DB clock (`RUN_AT`). Both move every run and are **excluded from the projection** (§9.1 lists neither).
- **CKAN regeneration ⇒ `content_hash` / `source_dataset_version` move between captures.** The register
  **moved on 2026-09-01** (md5 `37bd232d706be8409f845846474b7c3d`, Last-Modified Tue, 01 Sep 2026 22:16:33
  GMT — the §1.4 F-NET measurement), so the PRE and POST goldens **must be taken on the SAME bytes**; if the
  register moves again in between, **recapture both back-to-back** (plan §8). With `LH-D2` the version stamp
  is inside the upsert guard, so a changed version rewrites every row and the version alone drives the diff.
- **`last_modified` / `etag` inside the `heritage_load` sub-blocks.** Copied from the HEAD response
  [`load-heritage.js:253-263`]; they change whenever CKAN re-publishes, even when the bytes do not — the tier-2
  hash gate exists precisely for that case (§4 row 15). They are captured in the emit, not the table
  projection.
- **`sys_velocity_rows_sec` / `sys_duration_ms` audit rows.** Wall-clock derived; vary run to run
  (both present in run 1470's 16 rows, §1.3). Never compared across goldens.
- **`heritage_dataset_age_years` depends on the run date.** `ageDaysFrom(nowMs, …)` → `Math.floor(…)` and the
  `365.25` year divisor [`load-heritage.js:176`, `:182`, `:726`]; the value is a function of the DB clock at
  run time, so PRE and POST may legitimately differ by one year at a boundary.
- **Temp-dir names.** `fs.mkdtempSync` [`load-heritage.js:498`] produces a fresh random path per run; it is
  incident (§6 INCIDENTAL) and never appears in the projection.

**Ordering is deterministic.** `--table-order` pins `source_id` **per table** on both captures, so the
projected row order is a stable function of the key — not of insert order, which the upsert
(`ON CONFLICT (source_id)`) does not preserve anyway.

## 9. PRE goldens + forced-change proof — NOT YET CAPTURED

**State:** ① is ready for captures, but the **DB slot is held by another capture**, so **nothing in this
section is measured**. No `docs/reports/golden/load_heritage/pre/*.json` exists at this commit. The forced-change
route is itself unresolved: the register moved (2026-09-01) but the **districts did not** (unchanged since
2026-06-24), and the step's own version stamp sits inside the upsert guard, so a forced FULL proves nothing
about geometry (`LH-D2`; §6.2(b) R-AS) — the owed instruments are §9.3.

### 9.1 Commands (verified against the tool)

Run from the worktree root:

```
DOTENV_CONFIG_PATH=C:/Users/User/Buildo/.env node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-heritage.js --chain=sources --tables=heritage_properties,heritage_districts --table-columns="heritage_properties:source_id,status,geom,designated_date,bylaw_no,htg_conser_name,building_type,reason,address_text,construction_year,source_dataset_version;heritage_districts:source_id,name,hcd_type,geom,designated_date,bylaw_no,wards,source_dataset_version" --table-order="heritage_properties:source_id;heritage_districts:source_id" --out=docs/reports/golden/load_heritage/pre/sources.json
```

then the same command with `--chain=none` and

```
--out=docs/reports/golden/load_heritage/pre/standalone.json
```

**Two corrections to plan §8** — both **EXECUTED against `capture-step-golden.js`**:

1. **`--tables=` is required.** With no descriptor, `resolveTables` returns
   `{"tables":[],"source":"none"}`, and `--table-columns` naming those tables then **throws**. The plan's PRE
   line has no `--tables=` ⇒ it would produce no golden at all. (§6.2(d).)
2. **`--table-order` separates tables with `;`, not `,`.** The plan's comma form
   `--table-order=heritage_properties:source_id,heritage_districts:source_id` **throws**
   `invalid column name "heritage_districts:source_id"`.

### 9.2 What the PRE run will do (predicted, NOT measured)

- **`--chain=sources`.** The **register reloads**: CKAN moved on 2026-09-01 (§1.4 F-NET), so tier-1 cannot
  skip, and the fresh parse yields **8,848 kept vs 8,824 prior** (drift **0.0027**, far under the 0.5 bound)
  [MEASURED 2026-09-30, F-NET]. Because **`LH-D2`** puts `source_dataset_version` inside the upsert guard,
  **every existing row is rewritten**, so the run's `heritage_geometry_update_pct` will read ≈ **1** and land
  a **WARN** row — a version-stamp rewrite, not a geometry change (run 1277's shape: 28/28 HCDs updated,
  pct 1.0, WARN, §1.3). The **districts tier-1 SKIPs** (bytes unchanged, `unchanged_last_modified`), carrying
  the prior sub-block forward — the run-1470 shape.
- **`--chain=none`.** The legacy reads its prior row by the hard-coded `sources:load_heritage` name [`load-heritage.js:41`; `LH-D6`], so when it runs AFTER the sources PRE capture it finds that run as its baseline and **both datasets tier-1 SKIP** (zero writes). The standalone ledger name differs from the one the consumer reads — the declared limitation `LH-D6`.

### 9.3 Owed before ②

- **R-AS perturbation cohort** (§6.2(b)) — a **COMMITTED perturbation cohort captured against the LEGACY
  step** (massing `e4120879` / neighbourhoods `110c8c31` precedent), because the version stamp inside the
  guard (`LH-D2`) makes a forced FULL prove nothing. **Needs the DB slot.**
- **Districts forced change** (§6.2(c), plan D2) — the districts have not moved since 2026-06-24 and the
  register's move cannot cover that target; an operator ruling is owed on how `heritage_districts` acquires
  its nonzero PRE. **Needs the DB slot.**

Both are blocked on the capture slot, not on ①.

## 10. Red suite (PH-7)

`src/tests/steps/load_heritage/violations.test.ts` with its fixtures under `src/tests/steps/load_heritage/`:
`legacy-harness.ts` evaluates the byte-identical legacy copy `legacy-load-heritage.js.txt` against a fake
pool / fetch / zip / shapefile, so the suite exercises the legacy step's real decision logic; the live
`scripts/load-heritage.js` is never required in-process by this file (the legacy copy is the fixture, the
shipped script is the blob the copy is pinned to). Result at ① (orchestrator run,
`VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1`): **33/33 green** = the 18 legacy pins **L1–L18** + the 14
`it.fails` **D1–D14** (expected-fail: red as a named MISSING ARTIFACT) + 1 report-marker `it` [MEASURED
2026-09-30, §F-SUITE].

Red evidence: `docs/reports/red-evidence/load_heritage/pre2-artifacts-missing.json` — the same suite with every it.fails inverted to a plain it, run against this ① tree: 14 failed / 19 passed; every failure is a MISSING ARTIFACT assertion for scripts/load-heritage.descriptor.json (D1–D4, D8–D12, D14) or scripts/lib/compute/load-heritage.js (D5–D7, D13), never an import error.

### 10.1 Case → test map

| Test | Pins | Plan / defect |
| --- | --- | --- |
| L1 | L25 classify: per-dataset status counts, feature_count, the WARN/INFO rows | legacy pin — the classify fence before the key/geometry checks (`LH-D11` order) |
| L2 | key fence #426: Folder_Row ids, OBJECTID-only row is a bad source id | legacy pin — F-GIT `78748a36` (#426) |
| L3 | BIGINT round-trip: `<> ALL($1::BIGINT[])` + `unnest($1::BIGINT[])` bind, 36-param INSERT | legacy pin — the BIGINT key contract |
| L4 | dedupe keep-first: duplicate Folder_Row 101 keeps `part_iv` over `Part V` | legacy pin — `dedupeBySourceId` (D7's oracle) |
| L5 | sentinel + address: 1899-11-30 → null, blank ADDRESS → `""` (DEC-M) | legacy pin — sentinel + `coerceAddress` |
| L6 | L14 zero-features first run: FAIL, no register rows, districts still load | legacy pin — L14 guard |
| L7 | count drift 10→3 = 0.7 FAIL; `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` lets it through | legacy pin — drift check + override (D9/D10) |
| L8 | geometry skipped 0.333 FAIL blocks register; only districts commit (`txns()=1`) | legacy pin — geometry-skip check |
| L9 | F-C1 later-run empty set: no DELETE, `delete_skipped_empty_guard`, no audit row | legacy pin — F-C1 empty guard |
| L10 | DEC-K tier-1 skip: HEAD-only, carried feature_count, spec_version re-pin, no INSERT | legacy pin — DEC-K per-dataset skip (D12) |
| L11 | tier-2 content-hash skip: GET, md5 match, one validation round-trip, `unchanged_content_hash` | legacy pin — tier-2 gate (F-GIT `0b230472`) |
| L12 | LH-D8 head 500: `heritage_register_load_failed` FAIL, districts insert, verdict FAIL | `LH-D8` deviation |
| L13 | LH-D1 mass delete scored post-commit: DELETE present, 0.75 FAIL, override drops row not pct | `LH-D1` (④ scoring order) |
| L14 | LH-D2 version stamp in the guard: `IS DISTINCT FROM` is a guard arm; version-only rewrite warns | `LH-D2` (④c; the version stamp in the guard is why R-AS applies, Spec 124:246) |
| L15 | LH-D3 prior-read failure degrades to first run: warn log, inserts, no skip row | `LH-D3` (④a → `fail_step`) |
| L16 | lock contention: `{acquired:false}` leaves summaries/metas/fetchCalls empty | lock 61 (Spec 47 §A.5) |
| L17 | dataset age (L9 knob, 2 years): re-stamped 2023-09-01 → age_years 3 WARN | legacy pin — age check (D9) |
| L18 | emit shape (§9 freeze): `audit_table` phase 61, frozen key sets, records 5/5/0 | §9 freeze — emit contract (D11) |
| D1 | descriptor AJV-valid, identity lock 61 / spec "61" / spec_version "1.1" / INGESTOR shell | plan §9 gate answers (identity.lock 61, spec_version 1.1) |
| D2 | two primaries: externals order, both http_file/shapefile_zip, key props, target tables, URLs | re-ground A rows 1–3 (① decision 1) (`heritage_register`/`heritage_districts`) |
| D3 | network: `retries_from_config:"none"`, `timeout_from_config:"load_heritage_download_timeout_ms"` | plan §2 row 4, §9 (F-CODE `acquire.js:238-242`) |
| D4 | two targets: both tables declared with their per-target write posture | plan §2 rows 13/15, LH-D2 |
| D5 | `coerceKey` parity with the legacy oracle (L2 fence) | plan §2 row 8 (F-CODE `acquire.js:536-563`) |
| D6 | `shapeRecord` by record shape (`part_iv`/`part_v_member`/filtered/unknown/…, address tag) | plan §2 rows 7/9, ① decision 5 (`index.js:1383-1385`, carries no external id) |
| D7 | `dedupeBySourceId` deep-equals the legacy result (L4) | plan §2 row 10 |
| D8 | seven logic variables (Rule 3), each `on_invalid:"fail"`, defaults 2/0.5/0.05/0.5/0.5/60000/1000 | plan §5; `LH-D4` seed gap (closed at ②) |
| D9 | checks (L7/L8/L7c/L7b/L9): five verdict bounds, config-bound or `viol == 0` | plan §2 rows 11/12/14/16/17, §5 |
| D10 | overrides: `accept_anomaly` `{HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT,…}` / `{HERITAGE_ACCEPT_MASS_DELETE,…}`; `force_run:"HERITAGE_FORCE_RELOAD"` | plan §2 rows 12/16, §8 ② (force_run) |
| D11 | emit + counters: `emits[0]` key `heritage_load` consumer `enrich_heritage`; two skeletons; counters SUM | plan §2 rows 20/21, re-ground A row 20 |
| D12 | staleness (DEC-K): 4 triggers (`source_validator`/`content_hash` × 2 ids); `on_prior_run_error:"warn_row"` | plan §2 rows 2/5/6/23 (`LH-D3` ④a) |
| D13 | `buildLoadMeta(ctx)` shape: `{heritage_load}` spec_version "1.1", register counters, zero skeleton on failure | `LH-D8(b)` pinned wrong form — call shape declared at ① |
| D14 | declared defects: deviations name `LH-D8`/`LH-D11`, limitations name `LH-D6`/`LH-D9` | `LH-D6`, `LH-D8`, `LH-D9`, `LH-D11` |


## 11. Reads evidence table (② — operator new-conversion rule, 2026-09-30)

Every table and column the LEGACY step's SQL touches (reads and writes, including guard / predicate / conflict / ordering columns and the `pipeline_runs` / `logic_variables` reads), each with file:line at `1bc3ffab` (the ① freeze; `scripts/load-heritage.js` = `fixtures/legacy-load-heritage.js.txt`), then the legacy `emitMeta` for comparison, then the ② descriptor seat. Static read of the legacy and its libraries; the later executed-SQL witness verifies it.

| # | Table | Columns | Access | Legacy SQL [file:line] | ② descriptor seat |
|---|---|---|---|---|---|
| R1 | `heritage_properties` | source_id, status, geom, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text, construction_year, source_dataset_version, updated_at | write (INSERT + DO UPDATE SET) | `load-heritage.js:405-411` | `outputs.writes[0].columns` (all `written:"step"`; geom `bind:"wkb_geometry"`) |
| R2 | `heritage_properties` | source_id | read (ON CONFLICT arbiter, UNIQUE) | `:407` | `outputs.writes[0].key` + `key_sql_type:"BIGINT"` |
| R3 | `heritage_properties` | geom, status, designated_date, address_text, source_dataset_version | read (guard `IS DISTINCT FROM`) | `:412-416` | `write_discipline.guard_columns` (same 5, LH-D2) |
| R4 | `heritage_properties` | xmax (system) | read (`RETURNING (xmax = 0) AS is_insert`) | `:417` | library `write.js` executeWrite (same RETURNING); not declarable |
| R5 | `heritage_districts` | source_id, name, hcd_type, geom, designated_date, bylaw_no, wards, source_dataset_version, updated_at | write | `:441-446` | `outputs.writes[1].columns` |
| R6 | `heritage_districts` | source_id | read (ON CONFLICT) | `:443` | `outputs.writes[1].key` |
| R7 | `heritage_districts` | geom, name, designated_date, source_dataset_version | read (guard) | `:447-450` | `write_discipline.guard_columns` (same 4) |
| R8 | `heritage_districts` | xmax | read (RETURNING) | `:451` | library write.js |
| R9 | `heritage_properties`, `heritage_districts` | source_id; rows | read (predicate `<> ALL($1::BIGINT[])`) + DELETE | `:602` (F-C1 guard `:598-600`) | `retract:"departed"` + class `upsert_scoped_departure_delete` + `compute.shouldSkipDelete` |
| R10 | `pipeline_runs` | records_meta (read); pipeline, status (WHERE); started_at (ORDER BY DESC LIMIT 1) | read (prior run) | `:684-685` → `scripts/lib/source-version.js:139-141` | library `staleness.readPriorEmitWithPosture` (`on_prior_run_error:"warn_row"`, LH-D3); declared omission, `deviations[]` "the step's own SQL reads of pipeline_runs…" |
| R11 | `logic_variables` | variable_key, variable_value, variable_value_json | read (all rows) | `:667` → `scripts/lib/config-loader.js:200-201` | library config resolver over `config.logic_variables[]` (7 vars); declared omission (same deviation) |
| R12 | `trade_configurations` | trade_slug, allocation_pct, bid_phase_cutoff, work_phase_target, imminent_window_days, multiplier_bid, multiplier_work | read (all rows) | `:667` → `config-loader.js:105-108` | RETIRED (no heritage consumer); `deviations[]` loadMarketplaceConfigs entry |
| R13 | (none) | `NOW()` | read (DB clock) | `:671` → `scripts/lib/pipeline.js:995` | runner `getDbTimestamp` (same) |
| R14 | (none) | `pg_try_advisory_xact_lock(61)` | lock | `:670` → `pipeline.js:1048` | `identity.lock: 61` (runner) |
| R15 | (none) | `unnest($1::BIGINT[])`, `unnest($2::TEXT[])` — PostGIS only, no table | read (validation SELECT) | `:65-112`, executed `:563` | library `write.validateGeometries` (`geometry_kind` point / polygon) |

**Not the step's SQL (recorded for completeness):** `run-chain.js` writes the chain-owned `pipeline_runs` rows and reads `count(*)` + `pg_stat_user_tables` for the manifest `telemetry_tables` (`run-chain.js:837` → `pipeline.js:627-660`); unchanged by the conversion.

**Legacy `emitMeta` [`load-heritage.js:774-783`]:** reads `{ckan:heritage-register-wgs84: [], ckan:heritage-conservation-districts: []}`; writes `heritage_properties: [source_id, status, geom, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text, construction_year, source_dataset_version, created_at, updated_at]`, `heritage_districts: [source_id, name, hcd_type, geom, designated_date, bylaw_no, wards, source_dataset_version, created_at, updated_at]`; external `['CKAN']`.

**Gap vs emitMeta:** (1) emitMeta declared NO table reads, but the SQL reads R2/R3/R6/R7/R9 (own-table key + guard + departure predicate), R10 `pipeline_runs`, R11 `logic_variables`, R12 `trade_configurations`; (2) emitMeta listed `created_at` as written, but no statement writes it (DB default) — the descriptor declares it `written:"db_default"`; (3) `id` (bigserial) is touched by no statement and declared nowhere, as before. **Descriptor coverage:** R1-R3, R5-R7, R9 by `outputs.writes[]`; R4/R8/R13-R15 are library mechanics; R10-R12 are the explicit `deviations[]` omission (runner-mediated reads / retired). `inputs.reads.tables` stays `[]` (no domain table is read). The derived PIPELINE_META now reads `{reads: {}, writes: <the two declared column lists>, external: [heritage_register, heritage_districts]}`.

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low confidence | Owner / next step |
| --- | --- | --- |
| R-AS perturbation cohort not built at ① | Needs the DB slot; the version stamp inside the guard (`LH-D2`) makes a forced FULL prove nothing [Spec 124:246], so the instrument must be a committed cohort captured against the legacy step — no slot, no cohort | Orchestrator — operator ruling on the capture slot owed (§9.3) |
| Districts have no organic forced change | `heritage_districts` has not moved since 2026-06-24 (stored version `eb37b1a0…` = current); the register's move cannot cover that target (plan D2) | Orchestrator — operator ruling on how `heritage_districts` acquires its nonzero PRE |
| D13's `buildLoadMeta(ctx)` call shape is declared at ① | The seam is pinned from the §9 freeze, not from executed code; the context object's exact keys may not survive contact with ② | ② author — may amend only with a report note |
| The harness fakes the validation SQL (status per geometry type) | `legacy-harness.ts` models the pool/schema answers, so the L-pins prove legacy decision logic, not the DB's real status/geometry-type behaviour | ② — POST goldens against the real DB are the real check |
| PRE not captured | The DB slot is held; §9 lists the commands rather than reporting values | Orchestrator — capture at ② (PRE half of the goldens) |

### RECURRING / STANDARD-SHAPING table

| Finding | Recurs where | Proposed standard |
| --- | --- | --- |
| A slug-initials defect prefix renamed a plan's ids again | NB-D→N-D (neighbourhoods `110c8c31`), HR-D→LH-D (this row), load_wsib's LW collision | Declare prefixes in data — the load_wsib WF's `DEFECT_PREFIX_OVERRIDES` proposal (F-CODE `defectPrefixFor:783-785`) |
| Capture commands in plans are not executed before authorization | The `--tables`/`;` defects (F-CODE `capture-step-golden.js:394-410`, `:1058-1060`) | A plan lint that parses the capture flags and rejects `;`-joined / unnamed-table forms before authorization |
| A one-copy seam: `shapeRecord` gets no external id in a multi-primary step | `index.js:1383-1385` seam `{geojson, config, run_at, tag, lookups?}` — no external id; the trigger filter lives at `:741` | 0y may add `external` to the seam so per-primary record shaping is expressible |
| R-AS obligations not listed in the plan template | This row (§9.3 owed-before-②), massing `e4120879`, neighbourhoods `110c8c31` | Add a “version stamp in guard ⇒ cohort” line to the INGESTOR plan checklist |

## A. Measurement log (the orchestrator's executed queries, 2026-09-30)

### A.F-DB (read-only SELECTs, local dev DB)

- `SELECT status,COUNT(*) FROM heritage_properties GROUP BY 1` -> part_iv 1557, part_v_member 7267 (8,824).
- `SELECT ST_GeometryType(geom),COUNT(*) FROM heritage_properties GROUP BY 1` -> ST_Point 8824.
- `SELECT hcd_type,ST_GeometryType(geom),COUNT(*) FROM heritage_districts GROUP BY 1,2` -> designated_district / ST_MultiPolygon 29.
- `SELECT MIN(designated_date), MAX(designated_date), COUNT(*) FILTER (WHERE designated_date IS NULL), COUNT(*) FILTER (WHERE construction_year IS NULL), MIN/MAX(construction_year) FROM heritage_properties` -> designated_date min 1975-11-12, max 2026-05-21, NULL 15. construction_year NULL 4434, min 1250, max 2017; <1700: one row source_id 2433372 "525  BELLAMY RD N" = 1250.
- `SELECT COUNT(*) … WHERE address_text = ''` / `… WHERE NOT (ST_X(geom) BETWEEN -79.64 AND -79.11 AND ST_Y(geom) BETWEEN 43.58 AND 43.86)` -> address_text = '' : 0. Points outside bbox (-79.64..-79.11, 43.58..43.86): 0.
- source_dataset_version: properties all `bdca9c50f1243057ec70720b2e55dd4b` (8824); districts all `eb37b1a023ddccff155145a9fdd2e3d1` (29).
- logic_variables ILIKE '%heritage%': 12 rows = 10 `enrich_heritage_*` + `sources_heritage_properties_floor`=8000 + `sources_heritage_districts_floor`=20. ZERO loader knobs (LH-D4 holds).
- pipeline_runs for `sources:load_heritage`: 8 rows, ALL `completed`; latest id 1470 (2026-07-08, records 8853/0/0, verdict PASS, both sub-blocks `skipped_reason:"unchanged_last_modified"`); run 1277 (2026-06-25, records 8853/1/28, verdict WARN: `heritage_geometry_update_pct`=1 WARN, `heritage_count_drift_pct`=0.036, districts features_updated 28 inserted 1, filtered_out_appeal_study 3). No `load_heritage`/`load-heritage` standalone rows exist.
- run 1470 records_meta keys: telemetry, audit_table, heritage_load, pipeline_meta. Its 16 audit rows: dataset_source_license, heritage_register_feature_count 8824, heritage_districts_feature_count 29, heritage_filtered_listed_pct 0, heritage_geometry_skipped_pct 0, heritage_count_drift_pct 0, heritage_mass_delete_pct 0, heritage_geometry_update_pct 0, heritage_dataset_age_years 0, heritage_unknown_status_count 0, heritage_unknown_hcd_type_count 0, heritage_address_coerced_empty_count 0, heritage_register_load_skipped, heritage_districts_load_skipped, sys_velocity_rows_sec, sys_duration_ms.
- run 1470 districts sub-block (a tier-1 SKIP) carries `geometry_update_pct: 1` — the prior spread copies the previous run's value (skip carries every prior field).
- records_total 8853 = 8824 + 29 on SKIP runs: a skipped dataset carries its prior feature_count.

### A.F-NET (HEAD + download, scratchpad only; `curl -sSIL`, `md5sum`; parsed with the legacy classifiers)

- Register HEAD 200, Last-Modified **Tue, 01 Sep 2026 22:16:33 GMT**, ETag "1788300993.96-1628240-832049643", 1,628,240 bytes, md5 **37bd232d706be8409f845846474b7c3d** — MOVED since run 1470 (04 Jun 2026, bdca9c50…).
- Districts HEAD 200, Last-Modified **Wed, 24 Jun 2026 14:02:36 GMT**, ETag "1782309756.859-90942-1038094832", 90,942 bytes, md5 **eb37b1a023ddccff155145a9fdd2e3d1** — UNCHANGED (= stored version).
- Register raw 12,332 features: Part V 7280, Part IV 1568, Listed 3484; kept 8,848 (drift vs 8,824 = 0.0027); bad Folder_Row 0; null geometry 0; duplicates 0; all Point; empty address 0; construction_year<1700: 1. DBF fields include BOTH `OBJECTID` and `Folder_Row` (OBJECTID re-appeared; #426 dropped it in Q2 2026; Folder_Row still unique 8848/8848).
- Districts raw 32: Designated District 29, Under Appeal 1, Under Study 2; kept 29; bad HCD_NO 0; null geometry 0; Polygon 26 / MultiPolygon 3.

### A.F-SCHEMA (information_schema.columns / pg_trigger / pg_indexes, 2026-09-30)

- heritage_properties: id bigint serial NOT NULL, source_id bigint NOT NULL (UNIQUE `heritage_properties_source_id_key`), status text NOT NULL, geom NOT NULL, designated_date date NULL, bylaw_no/htg_conser_name/building_type/reason text NULL, address_text text NOT NULL, construction_year integer NULL, source_dataset_version text NOT NULL, created_at/updated_at timestamptz NOT NULL default now(). Indexes: pkey, source_id_key, idx_heritage_properties_geom_gist, idx_heritage_properties_geog_gist, idx_heritage_properties_status.
- heritage_districts: id bigint serial, source_id bigint NOT NULL (UNIQUE), name text NOT NULL, hcd_type text NOT NULL, geom NOT NULL, designated_date date NULL, bylaw_no/wards text NULL, source_dataset_version text NOT NULL, created_at/updated_at timestamptz default now(). Indexes: pkey, source_id_key, idx_heritage_districts_geom_gist.
- No user triggers on either table. `scripts/load-heritage.js` = 808 lines (`wc -l`).

### A.F-CODE (0x runner, READ)

- `scripts/lib/step/index.js`: `resolveCounterSource` :232 (declared SUM, any absent term => null); `deriveCounters` :258 (`computeResult.counters.*` wins; scope records_meta = compute's); `multiPrimaryBinding` :660-706 (refusals B1-B9; B6 `emits[0].skeleton[<id>]` must be an object); `ingestPrimaries` :708-755 (narrowed clone per primary, trigger filter `t.external === id`, `subKey: id` :741); `aggregatePrimaries` :760-835 (`acquired.primaries[id].outcome` loaded|skipped|write_skipped|failed|not_reached; `written.by_target.<table>`; NO top-level acquired.feature_count); `primaryFailureRows` :857-880 (`primary_failed:<id>` FAIL errored:true, source "gate", for fail_row_continue); `multiPrimarySkipEmit` :898-915 (re-stamps SKIPPED primaries only; failed get none); `runIngestPhase` :930; prior sub-block `subKey` :1217-1221; shapeRecord call :1383-1385 seam = `{geojson, config, run_at, tag, lookups?}` — **carries NO external id**.
- `scripts/lib/step/acquire.js` parseShapefile :536-563: `coerceKey(props[keyProperty],{geojson})` -> null => badKey, then null geometry => nullGeometry, THEN (index.js) shapeRecord. Legacy order is the reverse: L25 classify FIRST, then key, then null geometry [READ scripts/load-heritage.js:328-336, :367-372].
- acquire.js :865 HEAD throw unless `on_head_error:"warn_row"`; :238-242 `retries_from_config:"none"` disables retries.
- `scripts/lib/compute/enrich-heritage.js` `readHeritageContract` :44-80: reads last `completed` `sources:load_heritage` (completed_at DESC); halts unless spec_version '1.1', both sub-blocks, each feature_count>0, drift_check_passed !== false (:68, NOT mass_delete_check_passed), each source_dataset_version non-empty, both tables non-empty.
- `scripts/analysis/step-validate.mjs` `defectPrefixFor` :783-785: prefix = slug initials ⇒ `load_heritage` → **`LH`**. G6 reads ONLY `LH-D*` rows; `HR-D*` rows would score G6 0 (hard stop). `LH-D` has 0 hits repo-wide. Neighbourhoods precedent renamed NB-D→N-D for the same reason (110c8c31).
- `scripts/analysis/capture-step-golden.js` `resolveTables` :394-410: with NO descriptor the tables come ONLY from `--tables=`; `--table-columns` naming an un-snapshotted table THROWS (:1058-1060). POST capture-last guard :899-915 applies to `post/` paths only.
- Spec 124 R-AS (124:246): a guard that includes the step's own version stamp makes a forced FULL prove nothing; the instrument is a COMMITTED perturbation cohort captured against the LEGACY step. Heritage's guard includes `source_dataset_version` (load-heritage.js:416, :450).
- Census row `scripts/steps/_schema/step-archetype-census.json:340-345` (INGESTOR, C5); plan's :324-328 drifted. Churn table `docs/reports/generated/122-churn-complexity.md:33` load_heritage = **top-left** (commits 3, 846/558/160).
- manifest.json:14 `supports_full:false, supports_dry_run:false`, telemetry_tables both; chain `sources` position 7 of 28. Spec 47 §A.5 lock row 61 at 47:1968. Lock test `src/tests/pipeline-advisory-lock.infra.test.ts:38`.

### A.F-GIT (`git log -S<construct> -- scripts/load-heritage.js`, subjects verbatim)

- 169f22af 2026-06-04 "feat(61_source_heritage): load-heritage.js + M-1 + sources ingest (§8c)" — introduced: DEC-K per-dataset skip, lock 61, SPEC_VERSION '1.1', PIPELINE_NAME, shouldSkipDelete (F-C1), the 5 Zod knobs + timeout, dedupeBySourceId, 1899-11-30 sentinel, coerceAddress (DEC-M), case-insensitive L25, `source_dataset_version IS DISTINCT FROM`, zero_features_first_run (L14), override WARN rows, specSub renames, ageDaysFrom, prior-read `.catch` "treating as no baseline". Its body: folds landed "frozen sub-block field names, duplicate-source-id WARN, L14 guard, skip-branch spec_version re-pin"; "idempotent re-run 0/0".
- 78748a36 2026-06-05 "fix(61_source_heritage): re-key register source_id OBJECTID->Folder_Row (#426)" — coerceSourceId(p.Folder_Row); body: 12,328 features keyed null → 0 rows, caught by the >=8000 floor; mass-delete override for the one-time re-key.
- 0b230472 2026-08-10 "feat(43_chain_sources): Phase B B1 - source-version lib + the tier-2 content-hash gate" — skipCheckDecision delegation, contentHashDecision tier-2, buildSkipReEmitMeta.
- Locks today: `src/tests/load-heritage.logic.test.ts` (126 L), `src/tests/load-heritage.infra.test.ts` (145 L; spread order :91-93, Folder_Row :119-120), advisory-lock test :38.


---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=load_heritage --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=19 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-left window=39313d9 |
| G3 | 2 | 2 | table rows=18 vocab-hit rows=18 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 11 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=2 it-count=38 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=2 lock-it-count=38 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | load_heritage | PASS | min_migration=227 <= migrations count=245 |
| 2 | load_heritage | PASS | 7 declared, missing from seeds: none |
| 3 | load_heritage | PASS | retired=0 overlap-with-declared=none |
| 7 | load_heritage | PASS | SPEC LINK header present=true |
| 8 | load_heritage | PASS | G-4: 7 declared, 5 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | load_heritage | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | load_heritage | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 78 PRE capture(s) across 24 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 1 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 1 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 24 converted slug(s) — 24 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 59 declared counter source(s) across 20 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 8 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 8 bound(s) checked, all closed (8 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 12 on_invalid(s) checked, all closed (12 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 58 emits drift(s) checked, all closed (58 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 1 contract(s) checked, all closed (1 ledger-allowed, 0 present+typed/excluded) |
| 37 | (registry) | PASS | LF-ONLY (gate F): 5 path(s) checked, all LF (5 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 4 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 32 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 308 definition row(s) checked, 24 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (14 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 75 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 24 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 30 finding(s), all ledger-allowed (30) |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 20 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 25 slug(s), every defect prefix unique |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 171 · unexplained: 0

### Test suite (item iii)
- 1874/1875 passed (suite success=false)
- harvested: 37 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (1):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-centreline.js (slug "load_centreline") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 7 declared, 5 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 4 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 3 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=43590B notes=6011B checks=24 rows records_meta=5600B (newest post/ capture) |

**Enforced-green: 13/14** · not-run: 0 · vacuous: 0

