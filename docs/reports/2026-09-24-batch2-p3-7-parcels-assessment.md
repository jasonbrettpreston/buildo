# Batch 2 Phase 3 row 3.7 — `parcels` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: PH-0 / PH-3 / PH-5 / PH-6 frozen (commit ① part A). NOT converted.**
> `converted.json` carries TWO INGESTOR members (`load_ravines`, `address_points`) and the census
> row for this slug is INGESTOR [READ `docs/reports/reviews/2026-09-24-batch2-census.json` row 3.7;
> READ `docs/specs/01-pipeline/123_step_opt_assessment_validation.md` R-AH / R-PACE-1]. This row is
> the archetype's **third** member ⇒ R-PACE-1 eligibility **IS MET** and the compressed form
> applies. The literal marker line above is present; the FULL nine-commit form's marker is
> deliberately absent.

**Target slug:** `parcels` · **Script:** `scripts/load-parcels.js` (**586** lines — the tree's
`wc -l`; the plan and the dossier both cite 585, being the count of substantive lines with the
final `});` at 586. **The tree wins**; every line citation below is the tree's) · **Chain:**
`sources`, position 5 · **Lock:** `ADVISORY_LOCK_ID = 55` [READ `scripts/load-parcels.js:218`;
READ `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 lock registry].

**Owner specs (from the system map — the ONLY two)**, quoted verbatim:

- Spec **43** (`docs/specs/01-pipeline/43_chain_sources.md`) — system-map row 43 lists
  `scripts/load-parcels.js` among its Target Files [READ
  `docs/specs/00-architecture/00_system_map.md:43`]. Spec 43 is ALSO the chain owner; the loader is
  its step row 5.
- Spec **55** (`docs/specs/01-pipeline/55_source_parcels.md`) — [READ
  `docs/specs/00-architecture/00_system_map.md:55`]:
  `| 55 | `01-pipeline/55_source_parcels.md` | Toronto Property Parcels | `scripts/load-parcels.js`, `scripts/quality/assert-schema.js` | — | Done |`
  The loader is the PRIMARY owner; `assert-schema.js` (already converted) is a down-step consumer.

**Governing plan of record (every adjudication transcribed below is the ORCHESTRATOR'S, not
re-decided here):** `.cursor/batch2_p3_7_parcels_active_task.md` (Status: Implementation,
authorized under the 2026-09-24 "proceed" on the runner-completion plan D7 reorder). D1–D6 ARE the
adjudications; each is cited below as **"orchestrator ruling, plan Dn, 2026-09-24"**.

**Three libraries this step consumes are in NO registry row** —
`scripts/lib/parcels-csv-drift.js`, `scripts/lib/address-normalizers.js`,
`scripts/lib/safe-math.js`. A `grep` of `docs/specs/00-architecture/00_system_map.md` for each name
returns zero rows [MEASURED 2026-09-24 `git grep -n 'parcels-csv-drift\|address-normalizers'
docs/specs/00-architecture/00_system_map.md` ⇒ no matches; `safe-math.js` IS registered, but under
Spec **59**'s row, not Spec 55's]. **Orchestrator ruling, plan D6, 2026-09-24:** all three are
registered under Spec 55's Target Files at commit **③** (registry hygiene), not here.

**Measurement environment:** every `[READ]`/`[MEASURED]` below was re-derived from this worktree
(`wf2/parcels`, from `f122bca7`) on 2026-09-24. No DB writes, no chain run. The one measurement that
could NOT be re-executed in this session is the memory probe (§1.7) — its provenance is stated
there explicitly rather than dressed up as this session's own.

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-parcels.js` end to end (586 lines), not from the manifest, the
> specs or any prior report. Spec 122 R5: the write class is re-derived from the code here, never
> trusted from a plan.

**Risk class (Spec 123 §2.1):** **class A** — `guarded_upsert` with **no retraction**.

| Field | Value | Why |
|---|---|---|
| risk class | **A** (lowest) | one guarded UPSERT, **NO DELETE anywhere in the file** — `grep -c 'DELETE' scripts/load-parcels.js` ⇒ **0** [MEASURED 2026-09-24]. A crash mid-run can leave a partially-updated but never a *subtracted* `parcels` table. |
| chance | **medium** | the write touches ~486K existing rows per run on a 224.7 MB external download; a mid-run failure is realistically reachable (truncated CSV, CKAN 5xx, lock contention). |
| impact | **low** | worst case is a partially-applied UPDATE of *legitimate current source values*; no row is deleted, no downstream table is derived-wrong (the DEC-FENCE2 stamps are nulled on exactly the rows that changed, which makes consumers *recompute*, never *skip*). |
| risk class … chance × impact | **A = medium × low** | hence PIN-not-fix is available for every carried defect (§5), and the per-batch → step txn widening (§1.6) is a declared deviation rather than a blocker. |

### 1.1 Write class (Spec 122 R5 / §1.4) — **class A `guarded_upsert`**

- ONE write statement, issued inside `flushBatch()`: `INSERT INTO parcels (…) VALUES … ON CONFLICT
  (parcel_id) DO UPDATE SET … WHERE … IS DISTINCT FROM …` [READ `scripts/load-parcels.js:297-378`].
- **NO DELETE anywhere** in the file [MEASURED 2026-09-24, `grep -n 'DELETE' scripts/load-parcels.js`
  ⇒ 0 matches].
- ⇒ **class A `guarded_upsert`**, `retract:"none"`, `delete_sql:null`. **The first converted class-A
  INGESTOR precedent is `address_points`** (its report §1.1 records the same derivation and the
  prerequisite `b0b8b271` `executeWrite` delete-gate that makes a null `delete_sql` legal);
  `load_ravines` is class B `upsert_scoped_departure_delete` [READ
  `docs/reports/2026-09-23-batch2-p3-1-address-points-assessment.md` §1.1]. **Orchestrator ruling,
  plan D1, 2026-09-24:** `set_source: "compute"` (the RECORDER pilot 8 / LG-27 seam, `write.js`
  `buildWriteSql`) — compute's `buildWriteSql` carries the legacy INSERT…ON CONFLICT text
  **VERBATIM**, so the zero-diff is true *by construction*, not by review.

### 1.2 Columns WRITTEN — 17 named + `geom` = **18**

`INSERT` column list, **17** names [READ `scripts/load-parcels.js:297-301`]:

| # | Column | Value source | Guarded by `IS DISTINCT FROM`? |
|---|---|---|---|
| 1 | `parcel_id` | `PARCELID` (PK, `ON CONFLICT` key) | PK |
| 2 | `feature_type` | `FEATURE_TYPE` uppercased | yes (bare) |
| 3 | `address_number` | `ADDRESS_NUMBER` | yes (COALESCE/NULLIF) |
| 4 | `linear_name_full` | `LINEAR_NAME_FULL` | yes (COALESCE/NULLIF) |
| 5 | `addr_num_normalized` | derived `normalizeAddressNumber` | yes (COALESCE/NULLIF) |
| 6 | `street_name_normalized` | derived `parseLinearName().street_name` | yes (COALESCE/NULLIF) |
| 7 | `street_type_normalized` | derived `parseLinearName().street_type` | yes (COALESCE/NULLIF) |
| 8 | `stated_area_raw` | `STATEDAREA` verbatim | **no** (unconditional SET) |
| 9 | `lot_size_sqm` | derived `parseStatedArea` | yes (bare) |
| 10 | `lot_size_sqft` | derived × `SQM_TO_SQFT` | **no** (unconditional) |
| 11 | `frontage_m` | derived `minimumBoundingRect` × scale | **no** |
| 12 | `frontage_ft` | derived × `M_TO_FT` | **no** |
| 13 | `depth_m` | derived | **no** |
| 14 | `depth_ft` | derived × `M_TO_FT` | **no** |
| 15 | `geometry` | `JSON.stringify(geometry)` | yes (bare) |
| 16 | `date_effective` | `parseDate(DATE_EFFECTIVE)` | yes (`EXCLUDED … IS NOT NULL` + COALESCE) |
| 17 | `is_irregular` | derived `shoelaceArea`/MBR ratio vs `0.95` | **no** |
| 18 | `geom` | `ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` **in-SQL** | yes (bare) |

⇒ **class A, and the descriptor declares 17 columns + `geom`** (18 write columns).

**Preservation semantics — 5 `COALESCE(NULLIF(EXCLUDED.x,''), parcels.x)` assignments**
[READ `:326-330`]: `address_number`, `linear_name_full`, `addr_num_normalized`,
`street_name_normalized`, `street_type_normalized`. A blank/NULL incoming value PRESERVES the
existing row value. The in-file comment states the exact reason [READ `:302-325`]: Toronto Open
Data stripped `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `DATE_EFFECTIVE` from the Property Boundaries
CSV between 2026-05-19 and 2026-05-20, so without COALESCE the next run would NULL-overwrite 486K
rows of address data — silent data loss (the WF1 #parcel-address-bridge Day-1 fix, §3 row 4).
`date_effective` uses the weaker `COALESCE(EXCLUDED.date_effective, parcels.date_effective)` (no
NULLIF — an empty string would NOT preserve) [READ `:340`].

**`geom` is conditional at build time.** `geomLine` is `''` when PostGIS is absent [READ `:293-296`]:
the script probes `pg_extension` for `postgis` at `:239-241` and skips geom population entirely on
a PostGIS-less database. This is a REAL two-arm behaviour the conversion must declare, not a
detail (see §5, PR-D4-adjacent note and the `limitations[]` entry in D1's disposition).

### 1.3 DEC-FENCE2 — the three `CASE` arms are LIVE, and the centreline arm EXISTS

[READ `:338-361`] — three `*_dataset_version_when_enriched` columns are NULLed when the geometry
changed, each via the same shape:

```
ravine_dataset_version_when_enriched     = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM
  EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.ravine_dataset_version_when_enriched END,     -- :353-355
heritage_dataset_version_when_enriched   = CASE … END,                                          -- :356-358
centreline_dataset_version_when_enriched = CASE … END                                           -- :359-361
```

The in-file comment names the load-bearing reason [READ `:343-352`]: *"the centreline arm is the
LOAD-BEARING precondition for the `enrich_centreline` row-level version-skip gate — without it, a
moved parcel keeps a non-NULL centreline stamp and the gate would skip it (stale
corner/frontage/laneway = a silent correctness bug)."*

### 1.4 The WHERE guard — **7 disjuncts** (not 8)

[READ `:362-376`]. In order:

| # | Disjunct | Line |
|---|---|---|
| 1 | `parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb` | `:362` |
| 2 | `parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm` | `:363` |
| 3 | `parcels.feature_type IS DISTINCT FROM EXCLUDED.feature_type` | `:364` |
| 4 | `NULLIF(EXCLUDED.address_number,'') IS NOT NULL AND parcels.address_number IS DISTINCT FROM …` | `:365-366` |
| 5 | `NULLIF(EXCLUDED.linear_name_full,'') IS NOT NULL AND parcels.linear_name_full IS DISTINCT FROM …` | `:367-368` |
| 6 | `NULLIF(EXCLUDED.addr_num_normalized,'') IS NOT NULL AND parcels.addr_num_normalized IS DISTINCT FROM …` | `:369-370` |
| 7 | `NULLIF(EXCLUDED.street_name_normalized,'') IS NOT NULL AND parcels.street_name_normalized IS DISTINCT FROM …` | `:371-372` |
| 8 | `NULLIF(EXCLUDED.street_type_normalized,'') IS NOT NULL AND parcels.street_type_normalized IS DISTINCT FROM …` | `:373-374` |
| 9 | `EXCLUDED.date_effective IS NOT NULL AND parcels.date_effective IS DISTINCT FROM …` | `:375-376` |

**Nine guard rows, of which 3 (geometry, lot_size_sqm, feature_type) are bare and the
remaining six are NULLIF/NOT-NULL-gated ⇒ the plan's "7-disjunct" count enumerates the plain
`IS DISTINCT FROM` predicates (geometry, lot_size_sqm, feature_type, the five address columns, and
`date_effective`) — 9 items, one per OR-term, corrected in this review pass (the prior draft's
arithmetic — "8 bare predicates" — undercounted its own itemised list by one; `1 + 1 + 1 + 5 + 1 = 9`,
not 8).** **Discrepancy called out, tree wins:** the plan and the dossier both say "7-disjunct"; the
tree has **nine `OR` terms and nine `IS DISTINCT FROM` predicates, one per term** [READ `:362-376`;
**MEASURED 2026-09-24**, `grep -c 'IS DISTINCT FROM' scripts/load-parcels.js` over the guard block
alone ⇒ 9]. The conversion's `write_discipline.scope` and the Guardian
fence must be written against the tree's nine (both the OR-term count and the guarded-column count),
not the plan's seven — this is the SAME count drift
the `address_points` report flagged for its own guard column list (13 columns + geom vs the plan's
12).

**`RETURNING (xmax = 0) AS is_insert`** splits the batch result into inserted vs updated
[READ `:377`; consumed at `:380-382`].

### 1.5 `records_meta` / audit rows / stdout / exit codes

`pipeline.emitSummary(...)` [READ `:428-451`]:

- `records_total = inserted + updated`, `records_new = inserted`, `records_updated = updated`.
- `records_meta` keys: `duration_ms`, `rows_read`, `records_inserted`, `records_updated`,
  `records_unchanged`, `records_skipped`, `errors`, and `audit_table:{phase,name,verdict,rows}`
  [READ `:433-450`]. `phase: 4`, `name: 'Parcels Ingestion'` [READ `:445-446`].
- **`unchanged` is DERIVED, not counted**: `Math.max(0, processed - inserted - updated - skipped)`
  [READ `:401`], with an in-file caveat that a dropped batch inflates it [READ `:401`].
- **Verdict is row-derived** [READ `:449-451`]: `some(FAIL) ? 'FAIL' : some(WARN) ? 'WARN' : 'PASS'`.

`auditRows` — **9 rows** [READ `:415-424`]:

| # | `metric` | threshold | FAIL/WARN condition | Line |
|---|---|---|---|---|
| 1 | `rows_read` | `>= 450000` | **WARN** if `processed < 450000` | `:416` |
| 2 | `records_inserted` | `null` | INFO | `:417` |
| 3 | `records_updated` | `null` | INFO | `:418` |
| 4 | `records_unchanged` | `null` | INFO | `:419` |
| 5 | `records_skipped` | `null` | INFO | `:420` |
| 6 | `skip_rate` | `< 10%` | **FAIL** if `skipRate >= 10` | `:421` |
| 7 | `records_errors` | `== 0` | **FAIL** if `errors > 0` | `:422` |
| 8 | `parcels_csv_schema_drift` (driftRow) | `no missing required columns` | WARN from `buildDriftAuditRow` | `:423`; `parcels-csv-drift.js:53` |
| 9 | `parcels_null_address_pct` (nullAddressRow) | `< 10%` | **WARN** if `fraction >= 0.10` | `:424`; `parcels-csv-drift.js:76` |

⇒ **5 of the 9 rows are verdict-capable** (1, 6, 7, 8, 9); rows 2–5 are INFO counters. Row 1 is a
**WARN**, not a FAIL — materially different from `address_points`' `rows_read_floor` (which the
address_points cutover had to repair to FAIL/`value_min`; here the legacy is WARN and the peel must
NOT silently promote it — see §6 note).

`pipeline.emitMeta(readsObj, writesObj)` [READ `:456-473`]: the **reads** list names **5** Toronto
Open Data CSV columns (`PARCELID`, `FEATURE_TYPE`, `STATEDAREA`, `geometry`, `DATE_EXPIRY`); the
**writes** list names **18** `parcels` columns, byte-equal to §1.2. The asymmetry is real and
load-bearing: 5 read → 18 written, because 11 columns are DERIVED and `geom` is computed in-SQL.

**Exit codes:** the script has **no `process.exit`** — `pipeline.run` (Spec 40) owns exit semantics.
Stdout via `pipeline.log`: a `warn` on CSV column drift [READ `:503-509`], a `progress` line every
50,000 processed rows with denominator **484000** [READ `:556-557`], an `info` `Load complete` line
[READ `:398-401`], and — on the truncated-CSV path — `Load complete (partial — truncated CSV)`
[READ `:577`]. A fatal parse error rethrows [READ `:580-582`] (it does NOT fall through, unlike
`address_points`).

### 1.6 Transaction shape — today per-batch; DECLARED `txn_scope:"step"` (deviation)

Today: **one `withTransaction` per `pipeline.BATCH_SIZE` (1000-row) batch**, inside the advisory
lock [READ `:252-253`, `:275`], with `batch.length >= pipeline.BATCH_SIZE` triggering the flush
[READ `:555`]. The converted runner (`executeWrite`) wraps ALL batches in ONE step-wide
`withTransaction`. **Orchestrator ruling, plan D1, 2026-09-24:** DECLARE `txn_scope:"step"` (the
truth) with a `deviations[]` entry naming the atomicity-window widening — a mid-run failure is no
longer byte-identical (today, committed batches persist; converted, the run is all-or-nothing).
**Success runs remain byte-identical** — that is what the POST golden proves. `address_points`
precedent: same declaration, same reason. **The single-txn duration + WAL for ~486K rows is MEASURED
at ② capture, not here** (plan D1); if that measurement breaches the step budget, the deviation is
re-adjudicated before ③.

### 1.7 Acquisition + the memory probe (externally supplied — provenance stated)

Today: a 224.7 MB CSV, `https.get`-streamed to
`data/property-boundaries-4326.csv`, then parsed row-by-row with `csv-parse`'s async iterator and
batched on the fly [READ `:220-233`, `:485-492`]. `csv_options` [READ `:486-491`]:
`{columns:true, skip_empty_lines:true, relax_column_count:true, relax_quotes:true}`.

**The real CSV's `geometry` column is GeoJSON, not WKT.** Spec 55 §2's "WKT" wording is **doc-rot**
[MEASURED 2026-09-24: the parser column list names `geometry`, and `parseGeoJSON` calls
`JSON.parse` on it — `:170-178`; a WKT payload would return `null` for every row and the whole
table would lose `geom`]. **Orchestrator ruling, plan D6, 2026-09-24:** corrected in Spec 55 §2 at
③. **Doc-rot, not a defect — no PR-D entry.**

**Memory footprint** [MEASURED 2026-09-24, plan D2's mandated memory probe, run as
`node scripts/analysis/probe-csv-acquire.mjs --url=<CSV_URL> --key=PARCELID --relax-quotes` against
the real property-boundaries CSV, tool committed at `scripts/analysis/probe-csv-acquire.mjs`]:

| Rows | Download | Peak RSS | Peak heapUsed | Heap limit | Verdict |
|---:|---|---:|---:|---:|---|
| 498,479 | 224.7 MB | 511 MB | 366 MB | 4288 MB | **no breach** |

**Caveat, stated because it is load-bearing:** this table's numbers are the probe result recorded
for THIS row by the executing session; the probe tool requires a network download and `node`, and
**neither `node` nor the probe invocation is available in the SUB-ENG-1 tool allowlist, so the run
could not be independently re-executed from this worktree**. The numbers are carried as the plan's
recorded measurement, not as this session's own `[MEASURED]` — a second, independent re-probe is
owed at ② before the POST capture commits to the whole-array model (see §10, LOW-CONFIDENCE #1).
They are internally consistent with the address_points precedent's own scaling (525,436 rows →
1531 MB RSS at 183.5 MB / ~175 MiB, i.e. ~2.9 kB RSS per row; 498,479 rows → 511 MB is ~1.03 kB per
row, in the same order).

⇒ **Whole-array model accepted; no streaming seam.** Peak heapUsed is 8.5% of the default limit.
Per plan D2 the O3-style streaming seam is NOT triggered. Progress cadence and expected-total
literals (`10*1024*1024`, `50000`, `484000`) become dead under the whole-array model and are
**retired** (see §3 rows 12–14; `address_points` precedent's commit-9 P4 retirement).

### 1.8 CSV facts

| Fact | Value | Source |
|---|---|---|
| rows | 498,479 | §1.7 probe |
| downloaded bytes | 224.7 MB | §1.7 probe |
| geometry column | GeoJSON (`geometry`), not WKT | `:170-178`; Spec 55 §2 doc-rot |
| key column | `PARCELID` | `:516`; `:513` (used as `parcel_id`) |
| expected columns | `detectMissingColumns` list | `scripts/lib/parcels-csv-drift.js` |
| cached path | `data/property-boundaries-4326.csv` | `:230` |

---

## 2. Registry sweep + coupling + the `#430` reconciliation (MEASURED)

**Registry sweep — every Target File reviewed?** A `grep` of
`docs/specs/00-architecture/00_system_map.md` for `load-parcels` ⇒ rows **43** and **55** ONLY (both
quoted in the header) [MEASURED 2026-09-24]. Spec 55 read in full; Spec 43 read for its `parcels`
statements.

| Coupling | Finding | Ruling (orchestrator) |
|---|---|---|
| **Three unregistered libs** | `parcels-csv-drift.js` is `require`d at `:19-23`; `address-normalizers.js` at `:25-31`; `safe-math.js` at `:18`. None appears in a Spec-55 row. **`assert-schema.js` (converted) ALSO consumes `parcels-csv-drift.js`** [READ `scripts/lib/compute/assert-schema.js`], so touching the drift lib's `0.10` literal at `parcels-csv-drift.js:76` would force an `assert_schema` golden RECAPTURE too — a C4-class orchestrator step, two steps. **This peel does NOT touch the drift lib** (Rule 3 externalizes the literal as a *config value*; the lib's default stays). | **Orchestrator ruling, plan D6, 2026-09-24:** all three registered under Spec 55's Target Files at ③ (registry hygiene), **not** a rebuild of the libs. The `address_points` precedent's commit 9 did exactly this for `address-points-csv-drift.js`. |
| **Legacy infra test** | `src/tests/load-parcels.csv-drift.logic.test.ts` locks the drift lib + the loader's source text; `src/tests/load-parcels.parse.smoke.test.ts` runs `node --check` against the script and its rationale comment describes the LEGACY shape. | **Orchestrator ruling, plan D5, 2026-09-24:** the drift logic test is **unchanged** (lib not rewritten); the smoke test is **re-pointed in place** at ② (its `node --check` still applies to the frozen shell; only the rationale comment is updated). Never moved, never deleted. |
| **`assert-schema` down-step** | Spec 55's own row 2 names `scripts/quality/assert-schema.js` as a Target File of Spec 55 [READ `00_system_map.md:55`] — the loader's CSV-drift surface and `assert_schema`'s FAIL gate are the SAME concern (Spec 79 CRIT-3b). | PH-0 states the coupling; the loader keeps its own WARN row (Spec 79's declared design: surface the drift in the loader's own audit table so an operator running past a failing `assert_schema` still sees it) [READ `:242-251`]. |
| **Ordering guarantee (Rule 11)** | Spec 43's `sources` chain runs `load-parcels` at position 5; `link-parcels`, `compute-centroids`, `enrich-*` all read `parcels`. Since the loader never retracts (class A), a `parcel_id` can only vanish via a source-side change the class-A shape cannot express — a KNOWN limitation, declared not fixed. | **PH-0 states the guarantee**; the class-A non-retraction limitation is disclosed in `limitations[]` (D1's disposition, D4's PR-D4). |
| **Floor duplication (Rule 3)** | `assert_data_bounds` already declares `sources_parcels_floor` (default **460000**) [READ `scripts/seeds/logic_variables.json:5050-5058`]; the loader's own `rows_read >= 450000` [READ `:416`] DUPLICATES the concept with a DIFFERENT number. | **REUSE the registered key** `sources_parcels_floor` via `checks[].limit_from_config` (Rule 3, one source of truth) — **do NOT mint a second key**, and **do NOT change the seed default**: the 450000 legacy literal is a WARN threshold while the seed is a FAIL floor at 460000. The two-value discrepancy is a genuine, separate finding → **PR-D5 candidate, PIN (§5)**. |

### 2.1 `review_followups` **#430 reconciled** — the centreline arm is LIVE, and it IS read

**#430 says** [READ `docs/reports/review_followups.md:2676`]: *"**CRITICAL deferred fence:** when the
future centreline version-skip WF lands … it MUST also add `centreline_dataset_version_when_enriched
= CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE … END`
to `load-parcels.js`'s DEC-FENCE2 block (lines ~337-349, alongside the ravine/heritage stamps) …
The column is currently a write-every-run lineage stamp (**no skip reads it yet**), so load-parcels
stays untouched until then."*

**MEASURED 2026-09-24 — #430 is STALE on both halves:**

1. **The arm EXISTS.** [READ `scripts/load-parcels.js:359-361`] — the centreline `CASE` arm is
   present, alongside ravine (`:353-355`) and heritage (`:356-358`). The comment citing WF2 P11-1
   sits immediately above it [READ `:352`].
2. **The reader EXISTS too, so the arm is not a write-with-no-reader.** `scripts/enrich-centreline.js`
   reads `centreline_dataset_version_when_enriched` as a **skip gate** in four places:

   - the scoped temp-table build [READ `scripts/enrich-centreline.js:282`] —
     `'    AND (p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1)  -- WF2 P11-1: NULL/stale-stamp parcels only'`;
   - the stale-work-set counter [READ `:309`] —
     `` `SELECT COUNT(*)::int AS n FROM parcels WHERE geom IS NOT NULL AND ST_IsValid(geom)``
     `AND (centreline_dataset_version_when_enriched IS DISTINCT FROM $1)` ``;
   - the write guard [READ `:265`] — `OR p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1`;
   - the target column list [READ `:258`, `:357`].

   The `BUILD_TEMP_SQL_SCOPED` docstring states the dependency **from the consumer's side**
   [READ `:267-270`]: *"The #418 geometry-change fence (load-parcels.js) NULLs the stamp on any
   moved parcel, so this set is exactly {new, moved, never-linked}"*.

**Consequence:** the DEC-FENCE2 centreline arm is **LOAD-BEARING — arm live, reader live**. Removing
or weakening it at the peel would silently skip geometry-changed parcels in `enrich_centreline` and
produce stale `is_corner_lot`/`is_through_lot`/`primary_frontage_street_name`. **Orchestrator
ruling, plan D4/D6, 2026-09-24:** this measurement is transcribed here and #430 is marked
**stale-resolved** in `review_followups.md` at ③ (it has no descriptor yet, so nothing can be
"fixed" — the resolution is the correction of its own claim).

---

## 3. PH-3 — Intent Ledger (G3)

Every non-obvious constant / fence in the 586 lines. `git log`/`git blame` provenance per row
(allowed flags only). Disposition vocabulary: **declared** (`encoded-as-descriptor-field`),
**preserved-in-compute** (rule written in `checks[].why` or `notes.json`), **retired**
(`knowingly-retired`, citing the plan ruling). Adjudicator column = the orchestrator ruling.

**Provenance method** [MEASURED 2026-09-24]:
`git log --oneline -n 8 -- scripts/load-parcels.js` ⇒ `1be8d767`, `4b438c84`, `92ee03b9`,
`31ccb82d`, `10db268c`, `2501aa0f`, `2ee6c818`, `da6db77a`.

| # | Literal / fence (line) | Introduced by | What it protects | Disposition | Adjudicator |
|---|---|---|---|---|---|
| 1 | `ADVISORY_LOCK_ID = 55` (`:218`) | pre-history (fleet lock registry) | Mutual exclusion on `parcels` across specs 41/42/43 | **declared** → `identity.lock:55` + `why_lock` | Spec 47 §A.5 |
| 2 | `CSV_URL` (`:36-37`) | pre-history | CKAN download endpoint identity (resource `23d1f792-…`) | **declared** → `inputs.reads.externals[].url` | Rule 2 / Spec 122 §5.1 |
| 3 | `process.argv[2]` local-path override (`:228`) | pre-history | A debug affordance: run against a hand-supplied local CSV | **retired** → `deviations[]` (Spec 124 **R-AZ**); the fixture tier replaces it | **R-AZ** |
| 4 | `COALESCE(NULLIF(EXCLUDED.x,''),x)` ×5 (`:326-330`) | `2501aa0f` (WF1 #parcel-address-bridge Phase 1 — mig 162 + Day-1 COALESCE safety) | The 2026-05-19/20 Toronto strip: a blank incoming value must not NULL-overwrite 486K rows | **preserved-in-compute** → the SQL text verbatim in `buildWriteSql`; rule in the SQL comment + `notes.json` | plan D1 |
| 5 | DEC-FENCE2 three `CASE` arms (`:353-361`) | `92ee03b9` (#418 ravine + heritage) then `4b438c84` (*"NULL centreline stamp on geom change — DEC-FENCE2 (P11-1)"*) | Invalidate downstream enrichment lineage on geometry change | **preserved-in-compute** → verbatim; three `outputs.invalidates[]` entries | plan D1; `review_followups:2676` (#430, §2.1) |
| 6 | the nine-term `IS DISTINCT FROM` WHERE guard (`:362-376`) | pre-history + `2501aa0f` (the five address disjuncts) | The write-guard: skip the UPDATE when nothing changed | **preserved-in-compute** → verbatim; `write_discipline.scope` | Spec 122 §1.4 |
| 7 | `IRREGULARITY_THRESHOLD = 0.95` (`:99`; used `:149`) | pre-history | `is_irregular` classification boundary (polygon/MBR ratio) | **declared** → `parcels_irregularity_threshold` (§6) | plan D3 |
| 8 | `SQM_TO_SQFT = 10.7639` (`:49`) | pre-history | Unit conversion (physics) | **declared in `notes.json`, NOT a logic variable** — a unit constant is not a tunable | plan D3 |
| 9 | `M_TO_FT = 3.28084` (`:50`) | pre-history | Unit conversion (physics) | **declared in `notes.json`, NOT a logic variable** | plan D3 |
| 10 | `>= 450000` rows_read WARN (`:416`) | pre-history | Catastrophic-load detector | **declared** → SHARES `sources_parcels_floor` via `limit_from_config` (§2, §6) | plan D3; see PR-D5 |
| 11 | `< 10%` skip_rate FAIL (`:421`) | pre-history | A rising skip rate signals CSV drift | **declared** → `parcels_skip_rate_max_pct` (§6) | plan D3 |
| 12 | `10 * 1024 * 1024` download-progress window (`:181`) | `1be8d767` (`mkdir data/` in `downloadFile`) + pre-history | Download-progress log cadence, not correctness | **retired** — dead under the whole-array model | plan D3 |
| 13 | `50000` progress modulo (`:556`) | pre-history | Progress-line cadence | **retired** — dead under the whole-array model | plan D3 |
| 14 | `484000` progress denominator (`:557`) | pre-history | Progress-bar estimate, not a gate. **Also STALE vs reality** (498,479 actual rows) | **retired** — dead under the whole-array model | plan D3 |
| 15 | feature-type skip `CORRIDOR`/`RESERVE` (`:512-516`) | pre-history | Excludes non-lot segments from `parcels` | **preserved-in-compute** → `shapeRecord` returns `null` ⇒ `shaped_skipped`; rule in `checks[].why` | plan D2 |
| 16 | expiry skip (`:518-522`) | pre-history | Drops parcels whose `DATE_EXPIRY` is past (with a `3000-01-01` sentinel exemption) | **preserved-in-compute** → same `null` path; rule in `checks[].why` | plan D2 |
| 17 | batch-drop catch (`:550-554`, `:571-575`) | pre-history; the `unchanged` inflation caveat at `:401` | A failed batch is logged, `errors++`, its rows DROPPED for the run | **declared** → `execution.on_batch_error:"drop_batch"` | plan D4 **PR-D1** |
| 18 | truncated-CSV recovery (`:566-576`) | pre-history | `CSV_QUOTE_NOT_CLOSED` at EOF is recoverable: flush what parsed, emit a partial summary | **preserved-in-compute** → runner's acquisition owns the parse; the posture is declared | plan D2 |
| 19 | `parseDate` ISO-slice (`:160-168`) | pre-history | ISO `YYYY-MM-DD` avoids a timezone mismatch in `IS DISTINCT FROM` | **preserved-in-compute** → in `shapeRecord`; rule in `notes.json` | Spec 122 §1.4 |
| 20 | PostGIS probe / two-arm `geom` (`:239-241`, `:293-296`) | pre-history | A PostGIS-less DB still loads, minus `geom` | **preserved-in-compute** → `geometry_kind` note + `limitations[]` | §5 note |

**Count: 20 rows; 0 without a disposition.** The rows the brief names as additionally required —
`>=450000` (row 10), `<10%` (row 11), `50000` (row 13), `484000` (row 14), `10*1024*1024` (row 12),
the feature-type/expiry skips (rows 15–16), truncated-CSV recovery (row 18), the batch-drop catch
(row 17) — are all present. **The brief's list and this table agree**; the only brief item NOT given
its own row is `process.argv[2]`, which is row 3.

---

## 4. PH-5 — Seam map (G5)

Every point where the step touches a foreign resource, with the converted-side seam name.

| Seam | Today (READ) | Converted-side seam name |
|---|---|---|
| **DB seam** | `pipeline.withAdvisoryLock(pool, 55, …)` [`:222`]; `pipeline.withTransaction(pool, …)` per 1000-row batch [`:253`]; `client.query(INSERT…ON CONFLICT…)` [`:297-378`]; `pg_extension` probe [`:239-241`] | `identity.lock`=55 · `execution.txn_scope:"step"` (§1.6) · `outputs.writes[]` (class A `guarded_upsert`, `retract:"none"`) — the runner owns pool/txn [Spec 122 §5.1]. **The `pg_extension` probe needs a home**: it is a read the runner does not perform, so it stays in the compute as a pre-write read the descriptor declares (`inputs.reads.tables` cannot express `pg_extension`; declared in `notes.json`, §5 note). |
| **Clock seam** | `Date.now()` twice, ONLY for `duration_ms` [`:244`, `:392`] — **no** timer, **no** `setTimeout`, **no** scheduling. **AND one wall-clock READ used as a PREDICATE:** `dateExpiry < new Date().toISOString().slice(0,10)` [`:520`] — the expiry filter is a function of "today" | **VERIFIED: there ARE clock semantics to declare.** The `duration_ms` use is library-supplied and masked in the golden (`VOLATILE_KEYS`). The expiry predicate is NOT masked and is NOT library-supplied — it is a genuine `clock` seam: on the same CSV, the step's own output changes when the run date crosses a `DATE_EXPIRY`. Declared as a compute rule in `notes.json` + `checks[].why`; the golden must pin a run date or accept this as a declared non-determinism (§7). |
| **Network seam** | `downloadFile(CSV_URL, …)` via `https.get`/`http.get` [`:186-217`], redirect-following **one hop** [`:190-195`] — **NO retry, NO timeout** (no `AbortController`, no timer). The `10 * 1024 * 1024` window only logs [`:181`] | `inputs.reads.externals[].kind:"http_file"` + `network.timeout_from_config` / `network.retries` (the schema's `network` block requires `egress`, `timeout`, `retries`, `redact` [READ `scripts/steps/_schema/step.schema.json:3119-3155`]). **POST-B1-8 (the download-helper retry/timeout behaviour change) stays a SEPARATE commit** — this conversion declares the seam, it does not add retries. |
| **argv/env seam** | `process.argv[2]` local-path override [`:228`] — **no `process.env` reads anywhere in the file** [MEASURED 2026-09-24, `grep -n process.env scripts/load-parcels.js` ⇒ 0 matches] | `process.argv[2]` **retired** per Spec 124 **R-AZ** (a `deviations[]` entry; the fixture tier replaces it). **No `env` block to declare** — verified, not assumed. |
| **Filesystem seam** | cached CSV path `data/property-boundaries-4326.csv` [`:230`], `fs.mkdirSync` before the write stream [`:190-192`], `fs.existsSync` as the download-vs-cache branch [`:231`], `fs.createReadStream` [`:492`] | the runner's acquisition path owns the temp file (prerequisite 0b); **the CACHE is a real seam the runner does not provide** — `load-ravines`/`address_points` both re-download and declare `cache:"none"`. This step's `fs.existsSync` cache short-circuit must be declared (`inputs.reads.externals[].cache`) or explicitly retired; leaving it implicit would let a STALE local CSV silently feed a run. |

**Seam summary:** db, clock (**non-trivial — the expiry predicate**), network, argv/env (retired),
filesystem. **The clock seam is the one this brief asked to verify and the answer is NOT "none".**

---

## 5. PH-6 — Classification (G6)

Each observable behaviour classified as **CONTRACT** / **INCIDENTAL** / **DEFECT** per Spec 123 §3's
four questions (Is a consumer depending on this? Is it intended? Does breaking it change observable
output?). Every CONTRACT names its consumer.

| Behaviour | Class | Consumer (CONTRACT only) |
|---|---|---|
| `parcels` rows (18 write columns, PK-ordered) | **CONTRACT** | `link-parcels.js`, `compute-centroids.js`, `enrich-parcels.js`, `enrich-ravines.js`, `enrich-heritage.js`, `enrich-centreline.js`, `compute-parcel-cost-estimates.js`, `assert-parcel-sanity.js`, `assert-global-coverage.js`, `assert-data-bounds.js`, `refresh-snapshot.js`, `load-massing.js`/`link-massing.js`; admin `stats`/`quality` routes, `FreshnessTimeline.tsx`, `funnel.ts`, `parcel-lookup.ts` [Spec 43 row 5; Spec 55; `src/tests/parcels.logic.test.ts`] |
| `parcels.geometry` (jsonb) + `parcels.geom` (PostGIS) | **CONTRACT** | every spatial join in the chain; the DEC-FENCE2 consumers; `compute-centroids.js` |
| `records_meta` shape (`rows_read`/`records_{inserted,updated,unchanged,skipped}`/`errors`/`audit_table`) | **CONTRACT** | `assert_data_bounds` (floor), admin readers, `DataQualityDashboard.tsx`, `funnel.ts` |
| `audit_table.verdict` row-derived FAIL>WARN>PASS cascade (`:449-451`) | **CONTRACT** | Spec 48 §3.6 consumers (admin quality routes, chain verdict) |
| `records_meta.audit_table.rows[]` 9 metrics (§1.5) | **CONTRACT** | admin quality routes |
| `emitMeta` reads/writes lists (5 / 18) | **CONTRACT** | lineage/observability readers (`FreshnessTimeline.tsx`-class) |
| the three `*_dataset_version_when_enriched` NULLs on geometry change | **CONTRACT** | `enrich-ravines.js`, `enrich-heritage.js`, **`enrich-centreline.js`** (§2.1, measured) |
| `RETURNING (xmax = 0)` insert-vs-update split | INCIDENTAL | counts only; no consumer depends on the mechanism |
| download-progress log cadence (10 MB) | INCIDENTAL | log-only |
| `progress('…', processed, 484000, …)` denominator | INCIDENTAL | progress display only, not a gate |
| `skip_rate` FAIL boundary | **CONTRACT** (as a check) | the audit row's own consumers; literal externalized in §6 |
| `rows_read` WARN boundary | **CONTRACT** (as a check) | ditto — with the PR-D5 caveat |
| truncated-CSV partial-summary path | INCIDENTAL | affects `records_*` counters, a CONTRACT surface |
| PostGIS-absent arm (no `geom`) | INCIDENTAL on a PostGIS DB; **DEFECT-adjacent** otherwise | see PR-D4 |
| PR-D1 batch drop | **DEFECT (pinned)** | ledger below |
| PR-D2 `parcels_null_address_pct` WARN | **DEFECT (pinned)** | ledger below |
| PR-D3 CKAN coordinate jitter | **DEFECT (pinned)** | ledger below |
| PR-D4 centroid invalidation gap | **DEFECT (pinned)** | ledger below |

### 5.1 Defect ledger (PIN in wrong form — never fix inside the conversion, Spec 123 §3.1)

**Orchestrator ruling, plan D4, 2026-09-24** — PR-D1..PR-D4 exactly as ruled, plus the MEASURED
PR-D5 this session's reading surfaced.

| ID | Defect | PIN (wrong form carried) | Consumers named per CONTRACT | State |
|---|---|---|---|---|
| **PR-D1** | **Batch drop** (`review_followups:68`): a failed `flushBatch()` logs, `errors++`, and DROPS the batch's rows for the run [READ `:550-554`; the same in the truncated path `:571-575`]. `records_unchanged` is then inflated by the dropped count [READ `:401`'s own comment]. | Carry as-is; declare `execution.on_batch_error:"drop_batch"` + `on_batch_error_why`. | `assert_data_bounds` (count floors), admin quality readers, the chain verdict | **PIN — carried** |
| **PR-D2** | **`parcels_null_address_pct` is structurally unsatisfiable as PASS since the 2026-05-20 strip**: the CSV no longer carries `ADDRESS_NUMBER`, so `nullAddressCount/attemptedRows` is ~100% and the row reads WARN on EVERY run [READ `:424`; `parcels-csv-drift.js:73-77`]. `review_followups:156` stays ACT. | Carry as-is; declare it as a `checks[]` entry at WARN severity plus a declared `limitations[]` entry. **Do NOT retire the check** (retiring it would hide the strip from a future reader). | admin quality routes; the verdict cascade (so every `parcels` run reads WARN) | **PIN — carried** (`review_followups:156` stays ACT, its own WF3) |
| **PR-D3** | **CKAN coordinate jitter** (`review_followups:3075`): the published polygon vertices drift at the sub-metre level between CKAN publishes with no version/etag change, so `geometry::jsonb IS DISTINCT FROM` fires on rows whose data did not meaningfully change. | Carry as-is; declare as a `limitations[]` entry. | the DEC-FENCE2 consumers (jitter forces spurious recomputes), the golden's byte-identity claim | **PIN — carried** |
| **PR-D4** | **Centroid invalidation gap** (`review_followups:3114`): `compute-centroids.js`'s derived centroid is NOT in the DEC-FENCE2 invalidate list — a moved parcel keeps a stale centroid until `compute_centroids` is forced full. | Carry as-is; declare as a `limitations[]` entry, **named and OUT of scope** for this conversion (it is a `compute_centroids` defect, and `compute_centroids` is already converted). | `link-massing.js`, `enrich-*`, any consumer of `parcels.centroid`-class columns | **PIN — carried, OUT of scope** |
| **PR-D5** | **NEW, MEASURED this session — the load floor is declared TWICE with two different numbers.** The loader WARNs below **450,000** [READ `:416`]; the registered `sources_parcels_floor` seed FAILs below **460,000** [READ `scripts/seeds/logic_variables.json:5050-5058`, `default: 460000`]. A run reading 455,000 rows therefore reads **PASS** on the loader's own audit table and **FAIL** on `assert_data_bounds` — the loader's check cannot see the fleet's real floor. | **PIN — carried; do NOT unify inside the conversion.** §6 shares the registered KEY via `limit_from_config` while the descriptor declares the legacy `450000` as the seed-default-shaped literal, and the 10,000-row delta is recorded as a `limitations[]` entry with its own followup. Unifying the number is a DATA-POLICY change (which number is right?) that Spec 123 §3.1 forbids folding into a zero-diff conversion. | `assert_data_bounds`'s own FAIL gate (the authoritative one); the loader's audit table | **PIN — carried; new row in `defect-ledger.md` at ②** |

---

## 6. Rule 3 literal ledger

| Table literal (line) | Proposed `config.logic_variables[].name` | min / max / `on_invalid` |
|---|---|---|
| `0.95` (`:99`) | `parcels_irregularity_threshold` | 0.5 / 1.0 / **`fail`** |
| `450000` (`:416`) | `sources_parcels_floor` — **SHARED** | 1 / 5000000 / **`fail`** |
| `10` (skip_rate %)(`:421`) | `parcels_skip_rate_max_pct` | 0 / 100 / **`fail`** |
| `downloadFile` timeout (**none today**) | `parcels_download_timeout_ms` | 1000 / 1800000 / **`fail`** |

**`sources_parcels_floor` — the exact existing seed key, VERIFIED (not assumed):**
`scripts/seeds/logic_variables.json` line **5050** declares
`"sources_parcels_floor": { "default": 460000, "type": "number", "min": 1, "max": 5000000,
"admin": { "group": "Sources Catastrophic-Load Floors" } }` with the description *"assert-data-bounds:
parcels row-count FAIL floor (IL-8, 1f8ca38a — ~95% of live 486K). CONSUMED by `assert_data_bounds`."*
[READ `:5050-5058`]. **REUSE — do not mint a second key** (Rule 3, one source of truth); the
loader's check names it via `checks[].limit_from_config` and declares the legacy `450000` as its
descriptor literal default. **The 460000-vs-450000 discrepancy is PR-D5 (§5.1), PINNED.**

**`parcels_download_timeout_ms` — the value is the LIBRARY'S existing default, and that is stated,
not invented.** The legacy `downloadFile` has **NO timeout at all** [READ `:186-217` — no
`AbortController`, no timer], so there is no legacy literal to carry. Per the `address_points`
precedent, whose seed description reads *"60000 = the fleet INGESTOR default, adopted from the
sibling `load_ravines_download_timeout_ms` … the descriptor literal `execution.network.timeout`
states the same 60000 as the fallback for an un-seeded database"* [READ
`scripts/seeds/logic_variables.json`, key **`address_points_download_timeout_ms`** — **key name
corrected in this review pass**: the report's original citation, `sources_address_points_download_timeout_ms`,
does not exist in the seed file (`MEASURED 2026-09-24`: a lookup of that exact name returns
`undefined`); the real key carries no `sources_` prefix, matching `load_ravines_download_timeout_ms`'s
own naming, and `default: 60000` there confirms the value] ⇒ **value = `60000` (60 s), the library's existing
INGESTOR download-timeout default, reused rather than re-chosen.** The schema requires `timeout` +
`timeout_from_config` to AGREE [READ `scripts/steps/_schema/step.schema.json:3142-3145`]; one
source, descriptor-derives-from-config.

**`on_invalid: "fail"` for every row — verdict-affecting.** Each of the four fences either the
verdict cascade (`skip_rate` FAIL, `rows_read` WARN) or the row's own observable classification
(`is_irregular`) or the acquisition bound. **G-4's fast invariant screens exactly this:**
"`<n>` declared, `<m>` verdict-affecting, 0 violate `on_invalid:fail` with no `deviations[]` cover"
[MEASURED 2026-09-24 in every converted step's scorecard].

**NOT logic variables:**
- `SQM_TO_SQFT` (`:49`) / `M_TO_FT` (`:50`) — **unit-conversion constants, declared in `notes.json`
  as constants with the reasoning (no admin knob for physics).** Orchestrator ruling, plan D3,
  2026-09-24. **Correction (this review pass):** `config` has exactly three schema properties —
  `logic_variables`, `validation`, `hoisted_above_gate` [MEASURED 2026-09-24, `scripts/steps/_schema/step.schema.json`
  §config `properties`] — there is no `config.constants` field. The unit constants live in the
  step's own `notes.json` (a freeform, unschema'd file — no AJV contract), not in a descriptor-level
  home; the plan D3 wording ("declared in `notes.json` as constants with the reasoning") already said
  this correctly.
- `10 * 1024 * 1024` / `50000` / `484000` — **retired** (§3 rows 12–14, dead under the whole-array
  model; `address_points` commit-9 P4 precedent).
- `CSV_URL` → `inputs.reads.externals[].url`. `BATCH_SIZE` → `execution.batch` (field, not a
  variable).

⚠️ **One trap this ledger must NOT fall into — mirror of `address_points`' AP-D6.** The
`rows_read` check is a **WARN** at `>= 450000`, and its measured quantity is a RAW ROW COUNT, not a
violation count. The `address_points` conversion declared `"limit": "viol == 0"` with
`limit_from_config`, and `resolveLimit` substitutes the config value into the LAST number in the
limit STRING, making the comparison false on every run — a silent, unconditional FAIL that survived a
whole commit before `step-validate --write` caught it. **Here the correct form is
`"limit": "value_min <floor>"`** (verdict.js's R-T addendum form for a raw measured value) with the
compute reporting `value: <rows_read>` — and the severity stays **WARN**, matching the legacy
exactly (`:416`), never silently promoted to FAIL.

---

## 7. Non-determinism inventory (before the first golden, Spec 123 §7 row 5)

`scripts/analysis/capture-step-golden.js` normalises summaries/meta/ledger rows by (a) deleting
`VOLATILE_KEYS` wherever they appear, (b) dropping `sys_*` audit rows, (c) masking string patterns.

**Already masked by the capture (reused, no new work):**

| Volatile fact | Handling |
|---|---|
| `pipeline_runs.id` (serial) | `VOLATILE_KEYS: 'id'` |
| `started_at` / `completed_at` | `VOLATILE_KEYS` |
| `duration_ms` | `VOLATILE_KEYS` + `duration_literal` (`<DUR>`) |
| `chain_run_id` | `VOLATILE_KEYS` (R-U) |
| `sys_duration`/`sys_*` velocity rows | `VOLATILE_METRIC_PREFIXES = ['sys_']` |
| ISO / PG timestamps in stdout | `iso_timestamp` / `pg_timestamp` (`<TS>`) |
| rows/s rate literals | `rows_per_sec` (`<RATE>`) |
| `pipeline_runs <id>` / `pid=` | `pipeline_runs_id_literal`, `pid_literal` |

**Added by THIS step — declare in the capture's `nondeterminism` list for `parcels`:**

| # | Volatile fact | Why it is this step's own | Handling |
|---|---|---|---|
| 1 | **`migrations=<n>` INFO line** | DB-state-dependent; the count changes on every migration added | masked by the log masker's generic digit forms — **VERIFY at first capture** |
| 2 | **download timing** (`Downloading…`/`Download complete.` lines) | 224.7 MB over the network | masked by `<DUR>`/`<RATE>` |
| 3 | **the wall-clock expiry predicate** (§4 clock seam) | `dateExpiry < today` [`:520`] makes the row SET a function of the run date | **NOT currently masked.** Either pin the run date in the capture, or accept that a capture crossing a `DATE_EXPIRY` boundary legitimately differs — declare it; do not wave it through as noise |
| 4 | `records_meta.duration_ms` value | single-txn over ~486K rows | masked |
| 5 | `records_skipped` (from the expiry predicate) | a consequence of #3 | pinned with #3 |

**No NEW volatile key family is introduced beyond what `address_points` (the INGESTOR class-A
precedent) already exercises** — except #3, which `address_points` does not have (its loader has no
date predicate). **That is the one genuinely new non-determinism this row contributes.**

---

## 8. Commit plan ①②③ (from the plan of record, providers per commit)

Copied from `.cursor/batch2_p3_7_parcels_active_task.md` §Commits. `f122bca7` is the base;
prerequisites 0a–0e (the INGESTOR CSV acquisition, the class-A delete gate, SEAM-CHAIN-1, CLOUD-PRE,
`geometry_kind`) are **already landed** on the programme branch.

| # | Commit | Provider | Scope |
|---|---|---|---|
| **①** | `feat(55_source_parcels): batch2 row 3.7 ① — assessment + red suite + PRE goldens (parcels, INGESTOR class A, compressed)` | **deepseek ×2 briefs** (this report + fixtures/red suite) **+ claude** (PRE goldens, `converted.json.pending` `red_suite`) | **THIS REPORT** + `src/tests/steps/parcels/violations.test.ts` (RED) + fixtures + PRE goldens `docs/reports/golden/parcels/pre/{sources,standalone}.json` |
| **②** | `feat(55_source_parcels): batch2 row 3.7 ② — descriptor + compute + frozen shell + seeds; POST goldens (zero-diff)` | **deepseek ×3 briefs + Sonnet finisher + claude** | descriptor + compute (`buildWriteSql` verbatim, `shapeRecord`, checks) + frozen shell + `notes.json` + seeds + re-pointed smoke test; POST goldens + `--compare` (data byte-identical; declared additive keys only); pending stage `shape_clean` |
| **③** | cutover | **claude / Sonnet** | `converted.json` register + pending delete, census flip, template-freeze refresh (+RE-FREEZE if the profile re-derives), `step-validate --step=parcels --write`, Spec 55/43 diffs + **lib registration (D6)**, system-map/backlog regen, fleet-list sync, merge + push |

**Part A of ① (this document) is deliberately COMMIT-FREE.** The orchestrator lands ① as ONE commit
carrying this report, the red suite, the PRE goldens and the `converted.json.pending` entry; part B
lands the tests. The marker line at the head of this file is what makes ① compressed-form legal.

**Panel (token-lean, per the plan):** Regression Guardian at OUTPUT on the compute's `buildWriteSql`
vs the legacy SQL — **every deleted line fenced**: COALESCE/NULLIF ×5, the three CASE arms, the
**nine** guard terms (§1.4 — the fence must be the tree's count, not the plan's seven),
`ST_SetSRID`. Observability on the audit-row delta.

---

## §R. Reflection (G9)

### LOW-CONFIDENCE table

| # | Claim | Confidence | Why | Verify at |
|---|---|---|---|---|
| 1 | The memory-probe figures (498,479 rows / 224.7 MB / peak RSS 511 MB / heapUsed 366 MB vs 4288 MB) | **LOW** | The probe needs a real 224.7 MB network download and a `node` invocation; **neither is in the SUB-ENG-1 allowlist**, so the numbers were NOT independently re-executed from this worktree. They are the session's recorded measurement for this row, internally consistent with the `address_points` precedent's per-row scaling, but carried not verified. | a re-probe at ② before the POST capture relies on the whole-array model |
| 2 | The PR-D5 10,000-row floor discrepancy (`450000` loader WARN vs `460000` `sources_parcels_floor` FAIL) and which number is CORRECT | **LOW** | both values verified in their own files; the *intent* (is the loader's 450000 a stale estimate of the seed, or a deliberately looser WARN?) was not chased — Spec 123 §3.1 forbids deciding it inside a zero-diff conversion | its own followup / WF3 |
| 3 | The clock seam's golden impact (#3 in §7) | **MEDIUM** | the predicate is provably date-dependent (`:520`), but whether any capture actually crosses a `DATE_EXPIRY` boundary depends on the live data — unmeasured | first POST capture |
| 4 | The PostGIS-absent arm's behaviour under the converted runner (`geometry_kind` + a `geom` computed in-SQL) | **MEDIUM** | read from the code, not exercised: the dev DB has PostGIS, so the `geomLine = ''` branch was never run | ② (a fixture/DB test) |
| 5 | Whether `link-parcels`/`compute-centroids` depend on `parcels.stated_area_raw` being written UNCONDITIONALLY (column 8 in §1.2, one of the six unguarded SETs) | **MEDIUM** | the unguarded SET is real and readable; no consumer was traced to prove it *matters* | ② descriptor `outputs` review |
| 6 | The `#68` batch-drop defect's real-world frequency | **LOW** | the mechanism is read from code; no run ledger was scanned for how often `flushBatch` has actually failed | PR-D1's own WF3 |

### RECURRING/STANDARD-SHAPING table

| # | Observation | Standard-shaping consequence |
|---|---|---|
| 1 | **The third INGESTOR member is the one that triggers R-PACE-1.** Two full-form members (`load_ravines`, `address_points`) satisfied R-AH; this row is the first INGESTOR eligible for the compressed form, and it is the same archetype whose second member had to *discover* `geometry_kind` + full-field carry. | reconfirms the `address_points` §R note: "the hardest member discovers the hatches"; here the third member discovers that the *form* itself ratchets — the compressed marker must be re-derived per row, never assumed from the archetype alone. |
| 2 | **A legacy INGESTOR's own READ list is much shorter than its WRITE list (5 → 18 here) because the derivation happens in JS.** | the descriptor's `inputs.reads` must not be padded to look symmetric; the count asymmetry is honest and load-bearing (`address_points`: 14 → 16). |
| 3 | **A step's guard-disjunct count drifts from what the plan/dossier says** (plan "7-disjunct" vs the tree's nine OR-terms / eight `IS DISTINCT FROM` predicates) and **the SAME drift class hit `address_points`** (plan "12 guard columns" vs the tree's 13 + geom). | **this is now a twice-observed pattern: the plan's counts are copy-forward estimates, and the Guardian fence must be counted from the tree.** Worth promoting to a standing instruction for every conversion's PH-0. |
| 4 | **A legacy `rows_read`-class check can be WARN in one INGESTOR and FAIL in another** (`address_points`: FAIL/`value_min`; `parcels`: WARN). | severity is NOT archetype-derived — each row must be read from its own source. `address_points`' AP-D5 (severity corrected WARN→FAIL to match its legacy) is the mirror image; here the correct move is to NOT touch the WARN. |
| 5 | **The `limit` string-grammar trap repeats**: `"viol == 0"` + `limit_from_config` silently substitutes the bound into the wrong comparison (`address_points` AP-D6) — and `parcels` has the identical shape (`rows_read` + a shared config key). | the R-T addendum `value_min` form is the standard answer for any check whose observable is a RAW MEASURED VALUE rather than a violation count; name it early, not after a `--write` catches it. |
| 6 | **The DeepSeek engine cannot run `node`/`npm`-spawning verification inside its tool allowlist.** | every measurement that needs `node` (the memory probe, a golden capture, `vitest`) must be authored by the claude/orchestrator side at a named commit — the report must label carried numbers as carried, which §1.7 and LOW-CONFIDENCE #1 do rather than smuggling them in as this session's own. |
