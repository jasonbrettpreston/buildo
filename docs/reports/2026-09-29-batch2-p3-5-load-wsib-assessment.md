# Batch 2 Phase 3 row 3.5 — `load_wsib` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: PH-0 boundary frozen (§1.1 write class, §1.2 columns written)** — this file is the report half of
> commit ① (`feat(52_source_wsib): batch2 row 3.5 ① — assessment + red suite + PRE goldens (load_wsib,
> INGESTOR class A, compressed)`). **NOT converted.** The red suite
> (`src/tests/steps/load_wsib/violations.test.ts`) is ①'s other half; the PRE goldens are **PENDING
> (orchestrator capture)** — not yet taken in this pass. **INGESTOR has 6 converted members** —
> `load_ravines`, `address_points`, `parcels`, `load_centreline`, `massing`,
> `neighbourhoods` [READ `scripts/steps/_schema/converted.json` `converted[]` — the six
> `scripts/load-*.js` entries]; the plan's line 6 census said **4** and is **stale**. Six converted INGESTOR members
> make **compressed the DEFAULT form** [READ plan §0; Spec 124 §5 R-AH] — no reason for the full form
> applies, so the literal marker line above is present and the full nine-commit form's marker is deliberately
> absent. `converted.json` `pending[]` is `[]` today [READ `scripts/steps/_schema/converted.json`]; this
> step's own `{stage:"red_suite"}` pending row is **orchestrator-owed**, because `converted.json` is
> `registry_reserved` [READ `scripts/lib/exec-policy.json` `registry_reserved[]`] and is therefore not
> writable by this worker.

**Target slug:** `load_wsib` · **Script:** `scripts/load-wsib.js` — **448 lines**
[MEASURED 2026-09-29 `wc -l scripts/load-wsib.js` = 448; the plan's §1 table says
"448 L" and **AGREES** (no tree-wins / off-by-one clause in play)] · **Chain:** `sources`, position **19** of
**28** [READ `scripts/manifest.json` `chains.sources` — `load_wsib` is the 19th of 28 entries; Spec 43 step
table row 19 `load_wsib` → `load-wsib.js` → `wsib_registry` [READ `docs/specs/01-pipeline/43_chain_sources.md`
:50] · **Lock:** `97` — `ADVISORY_LOCK_ID = 97` [READ `scripts/load-wsib.js`
`` `const ADVISORY_LOCK_ID = 97;` ``; Spec 47 §A.5 row 97 [READ
`docs/specs/01-pipeline/47_pipeline_script_protocol.md:1942` — `` `| **97** | `scripts/load-wsib.js` | 4 — Load/Ingest | YES — `last_seen_at` |` ``]; the lock-registry test names it
[READ `src/tests/pipeline-advisory-lock.infra.test.ts:62` — `` `'scripts/load-wsib.js':            97,` ``]].

**Manifest entry** [READ `scripts/manifest.json` `scripts.load_wsib`]: `load_wsib {file:
scripts/load-wsib.js, supports_full:false, supports_dry_run:false, telemetry_tables:[wsib_registry],
telemetry_null_cols: {wsib_registry:[trade_name, mailing_address]}}`. **`supports_full:false` +
`supports_dry_run:false`** — the chain provides neither `--full` nor `--dry-run` for this step, so the
cutover must not invent one. Sibling entries [READ same file]: `link_wsib` (`scripts/link-wsib.js`,
`supports_dry_run:true`, `chain_args.sources:["--full"]`) is the immediate downstream consumer, and
`enrich_wsib_registry` (`scripts/enrich-wsib.js`, `telemetry_null_cols {wsib_registry:[primary_phone,
primary_email, website]}`) is the Serper enrichment step over the same table.

**Owner specs — the system-map rows naming `load-wsib.js`:** row **52** (Spec 52, Ontario WSIB Contractor
Registry) Target = `scripts/load-wsib.js` **only** [READ `docs/specs/00-architecture/00_system_map.md`:52 —
`| 52 | 01-pipeline/52_source_wsib.md | Ontario WSIB Contractor Registry | scripts/load-wsib.js | ...]`] — the
loader is the sole target file of its own spec. Row **43** (Spec 43, Sources chain) lists `load-wsib.js` in
its Target Files among the full 28-step chain [READ `docs/specs/00-architecture/00_system_map.md`:43] — Spec
43 is the chain owner and owns the loader as its step at position 19. Governing specs line: **Target spec**
`docs/specs/01-pipeline/52_source_wsib.md`; the chain spec is `docs/specs/01-pipeline/43_chain_sources.md`.

**Governing plans of record (every adjudication transcribed below is the ORCHESTRATOR'S, not re-decided
here):** `.cursor/batch2_load_wsib_active_task.md` (the row-3.5 plan of record) and its library-prerequisite
plan `.cursor/wf2_ingest_prereq_0fs_active_task.md` (**0fs final, uncommitted in worktree `Buildo-wt-0fs`**).
Each is cited below as **"plan §N"**. Both plan files are untracked `.cursor/` files of the MAIN tree
(`C:/Users/User/Buildo/.cursor/`), not of this worktree; they were read there. Plan-sourced DB values are
transcribed (never re-derived here); every file/line/git claim was re-executed in this worktree.

**Measurement environment:** every `[READ …]` below was re-derived from THIS worktree (`Buildo-wt-wsib` @
`43056856`). **NO DB queries were issued in this pass** — a live capture job holds the database — so every DB
value is transcribed from the plan as `[MEASURED 2026-09-28, plan §N]` and **never re-invented here**.
[MEASURED 2026-09-29] is the tag for a fact derived from tree files in this worktree during this pass.

**Spec 121 §4.3 governs method** (refactor/behaviour split): this conversion is zero-behaviour-change; every
carried defect is pinned by a `WS-D<n>` id (plan §2) and each fix is a separate commit after ③.

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/load-wsib.js` end to end (448 lines), not from the manifest, the specs or any
> prior report. Spec 122 R5: the write class is re-derived from the code here. ONE source (a manually
> downloaded WSIB annual CSV) writes ONE target table (`wsib_registry`).

**Risk class (Spec 123 §2.1).** A manual, roughly annual re-load writes the Class-G construction-contractor
registry that `link_wsib` reads for the builders↔WSIB seam and that the Serper enrichment queue
(`enrich_wsib_registry`) drains [READ `scripts/manifest.json` `link_wsib` / `enrich_wsib_registry`].

| Field | Value | Why |
|---|---|---|
| risk class | **A** | ONE guarded `INSERT … ON CONFLICT DO UPDATE … WHERE` with **9** `IS DISTINCT FROM` predicates [READ `scripts/load-wsib.js`:224-252]; **NO DELETE or TRUNCATE anywhere in the file** (class C REJECTED, §1.1) ⇒ a crash can never subtract rows. |
| chance | **low** | The source is a single operator-supplied CSV, unchanged between runs; a re-load re-writes existing keys through the same guard, so an unchanged file is a near-total no-op write [READ same statement]. |
| impact | **medium** | `wsib_registry` feeds `link_wsib` (the builders↔WSIB seam) and the Serper enrichment queue via `is_gta` and `naics_description` [READ `scripts/manifest.json`; `scripts/load-wsib.js`:225-229]; a derived-wrong write propagates into entity linkage and enrichment targeting, but nothing downstream FK-deletes on this table. |
| class · chance × impact | **A = low × medium** | PIN-not-fix is available for every carried defect (plan §2 `WS-D<n>` ids); the single guarded upsert keeps the blast radius contained. |

**Risk class: A — chance: low, impact: medium** (summary of the table above; the guarded upsert never deletes, and a wrong derived value propagates into link_wsib / enrichment targeting but nothing FK-deletes on wsib_registry).

### 1.1 Write class — **class A `guarded_upsert`, `retract:"none"`**

- **Legacy statement — ONE boundary upsert** [READ `scripts/load-wsib.js`:224-252]:
  `` `INSERT INTO wsib_registry (legal_name, trade_name, legal_name_normalized, trade_name_normalized,
  mailing_address, predominant_class, naics_code, naics_description, subclass, subclass_description,
  business_size, is_gta, last_seen_at) VALUES ${placeholders.join(', ')}` `` — 13 INSERT columns (§1.2), the
  last bound `` `$${offset + 13}::timestamptz` ``. Conflict target is
  `` `ON CONFLICT (legal_name_normalized, mailing_address)` `` and the `DO UPDATE SET` list is 10 columns
  (`trade_name`, `trade_name_normalized`, `predominant_class`, `naics_code`, `naics_description`, `subclass`,
  `subclass_description`, `business_size`, `is_gta`, `last_seen_at`) [READ same].
- **The guard** [READ same statement] is a `WHERE` of **9** `IS DISTINCT FROM` predicates — `trade_name`,
  `trade_name_normalized`, `predominant_class`, `naics_code`, `naics_description`, `subclass`,
  `subclass_description`, `business_size`, `is_gta` — so a fully unchanged row is **not** written (the
  legacy's only guard). `last_seen_at` is in the `SET` list but **not** in the guard: it is written
  unconditionally on every matched row.
- **No retraction** — the file contains **no `DELETE` and no `TRUNCATE`** [READ `scripts/load-wsib.js` end to
  end; the only "DELETE" token in the file is the word inside a comment at :169]. `retract:"none"` is
  therefore the literal port, and class C (which retracts by DELETE) is **REJECTED** — there is no retraction
  path to port and none may be introduced.
- **Legacy flush shape** [READ `scripts/load-wsib.js`]: rows are buffered in a `pendingMap` and flushed every
  `DEDUP_FLUSH_SIZE = 5000` keys (:186, :324), one `pipeline.withTransaction` per flush call (:201), each
  flush issuing one statement per `BATCH = 2000` rows (:200) with a 65,000-parameter ceiling check. So the
  legacy uses MANY transactions (one per 5,000-key flush, plus the final residual flush), not one per run.
- **Converted: `txn_scope:"step"`** [plan §2 row 7] — the converted runner wraps the whole load in a single
  step transaction, making the legacy's multi-flush intermediate state unreachable. Stronger, not weaker.

### 1.2 Columns written

**13 INSERT columns** [READ `scripts/load-wsib.js`:225-229, the `INSERT INTO wsib_registry (` list]:

- `legal_name`, `trade_name`, `legal_name_normalized`, `trade_name_normalized`, `mailing_address`,
  `predominant_class`, `naics_code`, `naics_description`, `subclass`, `subclass_description`,
  `business_size`, `is_gta` — 12 value columns bound per-row from the parsed CSV [READ `buildRow`,
  `scripts/load-wsib.js`:60-82], plus
- `last_seen_at` — bound `` `RUN_AT` `` (`` `await pipeline.getDbTimestamp(pool)` ``), **written,
  unguarded** (present in both `SET` and the INSERT list, absent from the 9-predicate guard).

**Guard columns = 9** [READ `scripts/load-wsib.js`:242-250]: `trade_name`, `trade_name_normalized`,
`predominant_class`, `naics_code`, `naics_description`, `subclass`, `subclass_description`, `business_size`,
`is_gta`. `last_seen_at` is the one written column that is **not** guarded.

**Never written by this loader** [plan §1b]: `id`, `linked_entity_id`, `match_confidence`, `matched_at`,
`primary_phone`, `primary_email`, `website`, `last_enriched_at`, `first_seen_at`. (The contact columns are
Serper-enrichment output, and `first_seen_at`/`id` carry DB defaults —
`migrations/040_wsib_registry.sql` declares `id SERIAL PRIMARY KEY` and `first_seen_at TIMESTAMP NOT NULL
DEFAULT NOW()` [READ `migrations/040_wsib_registry.sql`].)

**Upsert key:** UNIQUE `(legal_name_normalized, mailing_address)`
[READ `migrations/040_wsib_registry.sql` — `` `UNIQUE(legal_name_normalized, mailing_address)` ``], with
`mailing_address VARCHAR(500)` **NULLABLE** [READ `migrations/040_wsib_registry.sql`]. A NULL
`mailing_address` participates in the unique index as a distinct value, so the NULL-in-key behaviour of the
upsert is part of the frozen boundary.

### 1.3 Audit rows / verdict / `records_meta`

- **`audit_table` — phase 11, name `WSIB Registry Ingestion`** [READ `scripts/load-wsib.js`:408-413]:
  `` `phase: 11,` `` + `` `name: 'WSIB Registry Ingestion',` `` + `` `verdict: hasWarns ? 'WARN' : 'PASS',` ``
  + `` `rows: auditRows,` ``. The **same** phase/name pair is reused on the chain-skip path (§1.5) — one
  identity for both the load and the skip.
- **`auditRows` — exactly 9 rows** [READ `scripts/load-wsib.js`:383-393]: `source_file` (INFO, `basename(filePath)`),
  `file_date` (INFO, `mtime` date), `total_csv_rows` (INFO), `unique_class_g` (`threshold: '>= 110000'`),
  `records_inserted` (INFO), `records_updated` (INFO), `skipped_non_g` (INFO), `skipped_no_name` (INFO),
  `skip_no_name_rate` (`threshold: '< 1%'`). Two rows are threshold-bearing; the other seven are pure INFO.
- **WARN condition — two ORed triggers** [READ `scripts/load-wsib.js`:394]:
  `` `const hasWarns = gRowCount < 110000 || skipNoNameRate >= 1;` `` where `skipNoNameRate` is the re-derived
  ratio `` `(skippedNoName / (gRowCount + skippedNoName)) * 100` `` [READ `:379-380`]. So the verdict is WARN
  when `unique_class_g < 110000` **or** the no-name rate is ≥ 1 % — `hasWarns` is a parallel boolean over
  the two thresholds rather than a fold of the row statuses; the converted runner derives the verdict from the
  rows (Spec 124 Rule 10), so this shape retires by construction at ② with no behaviour change (same two
  triggers). Not a WS-D id (the plan files none).
- **Flat `records_meta` producer keys** [READ `scripts/load-wsib.js`:401-407]: `duration_ms`,
  `total_csv_rows`, `unique_class_g`, `records_inserted`, `records_updated`, `skipped_non_g`,
  `skipped_no_name`, then the nested `audit_table` object — the row-count metrics are emitted **flat** at the
  top level of `records_meta` as well as inside `audit_table.rows`, and have 0 readers outside one
  source-text test (`src/tests/chain.logic.test.ts:658-661`). The converted `emits[]` regroups the seven
  keys into one `wsib_load` block beside `audit_table` (plan §2 row 11; parcels `parcels_load` precedent) —
  an explained G8 diff.
- **Chain-skip PASS path — 4 INFO rows** [READ `scripts/load-wsib.js`:105-120]: `status` = `SKIPPED`, an
  optional `current_file` + `file_date` pair scanned from `data/` (only when a
  `/^BusinessClassificationDetails/i` CSV exists there), `reason` (`No CSV file provided — WSIB requires
  annual manual download`), and `instructions` (the wsib.ca download → `data/` → `--file` recipe). The
  skip-path rows are ALL INFO and the verdict is hard-coded `'PASS'` [READ `:111`] — a SKIPPED run is a PASS
  with an explanatory table, not a WARN.

### 1.4 Source facts

`[MEASURED 2026-09-29, orchestrator heap probe]` — the probe is the orchestrator's, run against a LOCAL file
copy in `~/Downloads/`; the values below are transcribed, never re-invented here. The probe is
`scripts/analysis/probe-csv-acquire.mjs` [READ the file: it is the runner's OWN acquisition functions
(`` `require('../lib/step/acquire.js')` `` → `downloadArchive`/`parseCsv`), sampled with
`process.memoryUsage()` on a 500 ms interval, and its header names `load_wsib` as one of the CSV externals it
is reusable for]; the local-file arm is the byte-identical local copy rather than a re-download.

- **The 2025 file:** **64,164,918 B**, md5 `9fc9adbf2281cfb15b97bbdfd0daef37`, **345,416 rows**, **bad_key 0**.
- **Peak memory under the whole-array model:** peak heap used **172.04 MB** against a limit of **4288 MB**,
  `rss` **328.85 MB**; parse time **6.02 s**. ⇒ the whole-array-in-memory path is **within budget** for this
  source, so the shared acquisition seam's model needs no CSV-specific carve-out here. This is the measurement the
  plan owes the **B4 streaming fence `c5ced678`** (§4 below): the converted library path parses the whole
  array (Engineering Standards §9.5 streaming traded, plan §11 note), and 172 MB peak heap on the real file
  is the evidence that the trade is safe; a breach would have stopped the plan, not the fence.
- **Derived counts (plan §1b):** **212,056** non-G rows skipped, **0** no-name skipped, **121,116** unique
  Class-G keys (`unique_class_g`) — i.e. the load runs well clear of the `< 110000` WARN floor (§1.3) and the
  no-name rate is 0 %.
- **File location:** the source lives in **`~/Downloads/`**, **not** `data/` — `data/` is gitignored, and the
  skip-path scan [READ `:95-101`] reads `data/`, so on a clean checkout the chain-skip arm finds no
  `BusinessClassificationDetails` CSV and emits the bare `status`/`reason`/`instructions` rows (§1.3). The
  `--file` argument is the only supported way to point the loader at the real 64 MB CSV.

### 1.5 Exits

- **Success** — verdict `PASS` (or `WARN`, §1.3) and a normal `emitSummary`/`emitMeta` pair
  [READ `scripts/load-wsib.js`:396-413, :383-394].
- **WARN** — the `hasWarns` path of §1.3 (`unique_class_g < 110000` **or** no-name rate ≥ 1 %) [READ `:394`]:
  the run still completes and the ledger row is written; WARN is a verdict, not an exit.
- **Chain without `--file` ⇒ SKIPPED PASS (no throw)** [READ `scripts/load-wsib.js`:89-126]: when `CHAIN_ID`
  is set and no `--file` was supplied, the loader logs `No --file argument (chain context). Skipping.`,
  emits the phase-11 `PASS` table with the 4 INFO rows (§1.3) plus `emitMeta`, and `return`s from inside the
  `pipeline.run` callback — the chain continues with a SKIPPED PASS ledger row, never an error.
- **Standalone without `--file` ⇒ throw** [READ `scripts/load-wsib.js`:127]:
  `` `throw new Error('Usage: node scripts/load-wsib.js --file <path-to-csv>');` `` — outside a chain the
  missing argument is a hard usage error, not a skip.
- **Missing file ⇒ throw** [READ `scripts/load-wsib.js`:131-133]: the existence check
  `` `if (!fs.existsSync(filePath)) { throw new Error(\`File not found: ${filePath}\`); }` `` sits **before**
  `withAdvisoryLock`, so a bad path never takes the lock and never opens a `pipeline_runs` row.
- **Schema drift ⇒ throw, finalize `failed`** [READ `scripts/load-wsib.js`:274-284 + :422-444]: the first
  parsed row validates the header against `` `['Legal name', 'Predominant class', 'Mailing Address']` `` and
  `parser.destroy(new Error(...))` on a miss, which surfaces through `parser.on('error', reject)`. Because
  `finalizeStatus` is initialised to the pessimistic `` `'failed'` `` [READ `:179`] and only flipped to
  `'completed'` at the very end of the happy path [READ `:417-421`], the `finally` block's `UPDATE
  pipeline_runs … SET status = $1` writes `failed` for a drifted file — the row can never wedge at
  `running` (Commit E try/finally, named in the in-file comment).
- **Lock held ⇒ silent return** [READ `scripts/load-wsib.js`:447]:
  `` `if (!lockResult.acquired) return;` `` — this early return is **outside** the `withAdvisoryLock`
  callback, so a skipped-because-held run emits **no `emitSummary`** at all: no ledger row from this step,
  neither PASS nor FAIL (in standalone the lock is taken BEFORE the `pipeline_runs` INSERT at :143-154, so no
  row is opened either). Converted: the runner's lock-contention skip terminal records it.

---

## 2. Behaviour ledger (plan §2)

> Transcribed from plan §2 (`| # | Behaviour [READ line] | Disposition |`), the two source columns condensed
> to ≤ 2 sentences each with **every line cite and every quoted identifier kept verbatim**; the `① lock`
> column is the red-suite test that pins each row. Every legacy line cite below was **re-read in
> `scripts/load-wsib.js` @ `43056856` (448 lines) on 2026-09-29** and all 15 row cites still hold — no drift
> in the script itself.

| # | Legacy [READ line] | Converted seat | ① lock |
|---|---|---|---|
| 1 | Input seam: chain with no `--file` SKIPs PASS (4 INFO rows, `status` `SKIPPED`), standalone throws `Usage: … --file`, a missing file throws `File not found`, lock contention returns silently; `supports_full:false` / `supports_dry_run:false` (:87-133, :447) | filesystem external, `path` glob `data/BusinessClassificationDetails*.csv`, terminal `skipped_no_source_file` (kind `skip_gated`) + ≥1 `when:"pre"` check (runner `index.js`:5302-5313 / :5648-5650) | **L13** (legacy) + D2, D3 |
| 2 | Header drift: the first row is validated against `` `['Legal name', 'Predominant class', 'Mailing Address']` ``; a miss `parser.destroy`s and the pessimistic `finalizeStatus` writes `failed` (:274-284, :179, :417-421) | declared `required_columns` check → terminal `failed_schema_drift` (intended) — **no library seam exists** (see corrections); ① pins it at the compute | **L12** + D8 |
| 3 | G filter: a row is kept when `predominant_class` starts `G` OR `subclass` starts `G`; else it is dropped as `skipped_non_g` (:289-292) | `shapeRecord` returns the 0p skip reason string `"non_g"` (in-compute) | **L2** + D7 |
| 4 | Key: `legal_name_normalized` = `normalizeName(legal_name)`, upsert key `(legal_name_normalized, mailing_address)`; a name that normalizes to empty is `skipped_no_name` (:34-42, :294-299) | compute `coerceKey` = legacy `normalizeName`; `key_property` `Legal name`, `keyColumn` `legal_name_normalized`; `bad_key_count` counts a null key | **L5** + D4 |
| 5 | Dedupe within `pendingMap` on `(legal_name_normalized, mailing_address)`, **G-preference**: a later G-predominant row replaces a prior whose predominant class is not G; otherwise the first row wins (:309-319); 5,000-key flush window (:186-188, :324-333) | compute `dedupeBySourceId` over the whole array, same preference; window-vs-global delta = 0 keys on the 2025 file [MEASURED 2026-09-28, plan §2 row 5] (WS-D2) | **L3** + D5, D6 |
| 6 | `is_gta` = case-insensitive substring over the 25 `GTA_CITIES` (the `milton` substring quirk is carried) (:45-58) | `shapeRecord` computes `is_gta` (the 25 names are vocabulary, Rule 4 → `notes.json`) | **L4** + D5, D7 |
| 7 | Write: one guarded `INSERT … ON CONFLICT (legal_name_normalized, mailing_address) DO UPDATE SET` over 13 INSERT columns; guard = the 9 `IS DISTINCT FROM`; no `DELETE`/`TRUNCATE`; `last_seen_at` written unguarded (:224-252) | `guarded_upsert`, `retract:"none"`, `txn_scope:"step"`, `guard_columns` = the 9 legacy guard cols, `idempotent_rerun:"zero_writes"` | **L6, L7** + D10 |
| 8 | `auditRows` = exactly 9 rows, `skip_no_name_rate` (`< 1%`) and `unique_class_g` (`>= 110000`) are the two thresholds, verdict `hasWarns` parallel boolean, phase 11 name `WSIB Registry Ingestion` (:383-413) | rows mirrored; both bounds as **WARN** checks via `limit_from_config`: `wsib_no_name_skip_rate` (% = `bad_key`/(kept+bad_key)) and `wsib_unique_class_g` | **L11** + D12 |
| 9 | `skip_no_name_rate` = `skippedNoName / (gRowCount + skippedNoName) * 100`, the `>= 1` arm of `hasWarns` (percent, never a 0/1 flag) (:378-394) | `wsib_no_name_skip_rate` emits the percent from config (1/100 = 1.0 WARNs; 1/200 = 0.5 passes) | **L11** + D11 |
| 10 | `records_total = records_inserted + records_updated` (not rows read) (:397-399) | counters `source` = `written.inserted + written.updated` / `written.inserted` — counters parity; WS-D3 pinned, not fixed (runner records `rows_read` separately) | **L9** + D14 |
| 11 | Flat `records_meta` keys `duration_ms`, `total_csv_rows`, `unique_class_g`, `records_inserted`, `records_updated`, `skipped_non_g`, `skipped_no_name` beside `audit_table` (:401-407) | `emits[]` = `audit_table` + one `wsib_load` block holding those seven keys (parcels `parcels_load` precedent) | **L1** + D14 |
| 12 | `emitMeta` source/target column lists (:373-376; also on the skip path :121-124) | library-derived from the descriptor | (library-derived, none) |
| 13 | Lock `ADVISORY_LOCK_ID = 97` (:84); DB clock `RUN_AT = await pipeline.getDbTimestamp(pool)` read inside the lock (:135-136); held ⇒ silent no-op (:447) | `identity.lock:97` (Spec 47 §A.5); runner clock → `last_seen_at`; runner lock-contention skip terminal records a held lock | **L1** + D1 |
| 14 | Lifecycle: standalone self-`INSERT`s a `pipeline_runs` `running` row and ALWAYS finalizes via try/finally — `completed` on success, `failed` on a schema-drift throw; chain mode opens no row (:143-154, :179, :417-444) | runner-owned `pipeline_runs` row + terminal statuses (Commit E try/finally, named in the in-file comment) | **L12** (Commit E) |
| 15 | Staleness: no `config_version` / upstream-ledger gate; the only skip is the absent-file seam of row 1 (:87-101) | `staleness.trigger:"none"` (a deterministic manual reload) | D2 (`staleness.trigger:"none"`) |

**Corrections found while re-grounding (plan claims that proved stale)**

- **Row 1.** The runner line cites `index.js:5302-5313` (pre-checks on a gated skip) and `:5648-5650`
  (`ingest.skipped` branch) hold at `43056856`; they shift once 0fs lands (0fs inserts lines above them in
  `runIngestPhase`). The LPA-D4 block in `src/tests/step-conformance.infra.test.ts` is at `:2092-2125`
  (plan: `:2109-2125`).
- **Row 2. There is no library seam for a header check.** `parseCsv`
  (`scripts/lib/step/acquire.js:494-514`) returns `{features, badKey, nullGeometry, rowsParsed}` — no header
  list — and the acquired block (`scripts/lib/step/index.js:1107-1140`) carries no `csv_columns` /
  `missing_columns`. The plan's "declared `required_columns` check … terminal `failed_schema_drift`" has
  nothing to read. ① therefore pins the legacy behaviour at the compute (D8: `shapeRecord` throws
  `Schema drift: missing column "<col>"`, the legacy message :279); the seat is an orchestrator ruling at ②
  (options: the compute throw, or a new acquire seam = a library rung). **Side finding:** the converted
  header-drift checks of `parcels` (`scripts/lib/compute/load-parcels.js:463-475`) and `address_points`
  (`scripts/lib/compute/load-address-points.js:176-183`) read the same never-populated
  `missing_columns` / `csv_columns`, so they can only ever report 0 (0 producers under `scripts/lib/step/`,
  `git grep`).
- **Row 4 / WS-D7.** The library counts a null key inside `parseCsv` (`scripts/lib/step/acquire.js:509-510`),
  BEFORE `shapeRecord` applies the G filter, so on the fixture a nameless non-G row lands in `bad_key_count`
  (D6: `bad_key` 3, `non_g` 1) where legacy says non-G 2 / no-name 2 (L10).
- **Row 6.** `GTA_CITIES` is `:45-52`; `isGTA` is `:54-58`.

---

## 3. Registry target review (closed set)

> Every row below is re-grounded in THIS worktree (`Buildo-wt-wsib` @ `43056856`) with `git grep` / `sed` /
> `ls`; the plan cite is `.cursor/batch2_load_wsib_active_task.md` §1a-§1d (read in the MAIN tree, an untracked
> `.cursor/` file, never in this worktree). **Verdict** is `holds` when the plan's cite still resolves at
> `43056856`, `DRIFT → <new>` when the file is right but the line range moved, and `STALE` when the plan's
> claim no longer describes the tree. Registering a target is the plan's job; this section only checks each
> registered target still exists where the plan put it.

### (a) §4.1 files

The §4.1 file set is the script itself, the three files ② is to create, and the files ① already created: the
script and the ① outputs are present and the ② outputs are correctly absent today.

| Row | Plan cite | Re-grounded @ 43056856 | Verdict |
|---|---|---|---|
| `scripts/load-wsib.js` = 448 L | §1 table "448 L" | 448 L [MEASURED 2026-09-29 `wc -l` = 448] | holds |
| descriptor `scripts/load-wsib.descriptor.json` | §4.1 (to be created at ②) | absent (`ls` → no such file) | holds (created at ②) |
| `scripts/load-wsib.notes.json` | §4.1 (created at ②) | absent (`ls` → no such file) | holds (created at ②) |
| compute `scripts/lib/compute/load-wsib.js` | §4.1 (created at ②) | absent (`ls` → no such file) | holds (created at ②) |
| `src/tests/steps/load_wsib/violations.test.ts` | §4.1 (created at ①) | present (13 legacy pins + 15 `it.fails` + 1 report test, §10) | holds (created at ①) |
| `fixtures/wsib-sample.csv` | §4.1 (①) | present under `src/tests/steps/load_wsib/fixtures/` | holds |
| `fixtures/legacy-harness.ts` | §4.1 (①) | present under the same `fixtures/` dir | holds |
| `fixtures/legacy-load-wsib.js.txt` (byte copy of the script, sha256 `4f8ebd51…7e19`) | §4.1 (①) | present; `sha256sum` equal to `scripts/load-wsib.js` and to `git show 43056856:scripts/load-wsib.js` | holds |
| `acquire` / `index` / `schema` (§4.1 tree seams) | §4.1 | 0fs only — no `load_wsib` files under `scripts/lib/step/` | holds |

### (b) Table `wsib_registry` + migrations

The table's shape claims all resolve at the stated lines: migration `040` declares the normalized-name NOT
NULL, the nullable mailing address, and the two-column UNIQUE, and `066` adds `is_gta` with the 25-name
backfill.

| Row | Plan cite | Re-grounded @ 43056856 | Verdict |
|---|---|---|---|
| `040` `legal_name_normalized` NOT NULL | §1b `:10` | `:10` | holds |
| `040` `mailing_address` nullable | §1b `:12` | `:12` | holds |
| `040` UNIQUE `(legal_name_normalized, mailing_address)` | §1b `:24` | `:24` | holds |
| `066` `is_gta BOOLEAN DEFAULT false` | §1b `:7` | `:7` | holds |
| `066` 25-name ILIKE backfill | §1b `:10-23` | `:10-23` | holds |
| plan's migration list `040/044/054/056/063/066/227/243/244` | §1b | all present [READ the matching `.sql` files] | holds |
| `grep -i wsib migrations/*.sql` extra hits | §1b | also `007/015/038/042/047/048/053/170` — column/label mentions (`wsib_status`, `builders_with_wsib`, `is_wsib_registered`, schedule labels, fuzzystrmatch comments), not this table [READ `migrations/*.sql`] | holds |
| RLS / FK / row counts | §1b (DB facts) | not re-queried this pass; **transcribed** `[MEASURED 2026-09-28, plan §1b]` | holds (transcribed) |

### (c) Consumers

The consumer set is intact: the immediate downstream step, the enrichment generator and its TS helper, the
bounds/validators, the admin API + dashboard surfaces, and the several JSON/schema registries all still read
this step/table. The only movement is line ranges inside already-listed files (`DRIFT`), never a lost
consumer.

| Row | Plan cite | Re-grounded @ 43056856 | Verdict |
|---|---|---|---|
| `link-wsib` descriptor `:23` (`load_wsib`, `version_pin gte`) | §1c | `:23` | holds |
| `enrich-web-search.js` `:342,:581` | §1c | `:342`, `:581` | holds |
| `enrichment.ts` `:51,:180` | §1c | `:51`, `:180` | holds |
| `assert-data-bounds.js` `:301-329` | §1c | `:301-329` | holds |
| `assert-data-bounds-fields.js` `:223-226` | §1c | `:223-226` | holds |
| ADB descriptor `:133, :1122-1197` | §1c | `:133`, `:1122-1197` | holds |
| AGC `:460`, fields `:277-278`, descriptor `:464, :4405-4442` | §1c | all present | holds |
| `audit-fk-orphans.js:142` | §1c | `:142` | holds |
| `validate-migration.js:33` | §1c | `:33` | holds |
| `generate-assert-data-bounds-descriptor.js:84` | §1c | `:84` | holds |
| `funnel.ts` `:280, :666, :830-835, :953` | §1c | all present | holds |
| `admin/stats/route.ts` `:186-198, :422` | §1c | all present | holds |
| `quality/route.ts:234` | §1c | `:234` | holds |
| `FreshnessTimeline.tsx:62-63` | §1c | `:62-63` | holds |
| `DataQualityDashboard.tsx:29` | §1c | `:29` | holds |
| `quality/types.ts:687` | §1c | `:687` | holds |
| `source-version.js:333` | §1c | `:333` | holds |
| `lineage-meta-snapshot.json:3171-3200` | §1c | `:3171-3200` | holds |
| `programme-items.json:1718/2037/2069` | §1c | all present | holds |
| `staleness-disposition.json:122` | §1c | `:122` | holds |
| `standard-gates-ledger.json:1397` | §1c | `:1397` | holds |
| `step.schema.json:704` | §1c | `:704` | holds |
| `manifest.json:38, :106` | §1c | `:38`, `:106` | holds |
| `amnesty.json:83` | §1c | `:83` | holds |
| `probe-csv-acquire.mjs:18` | §1c | `:18` | holds |
| runbook §5 heading `:295` | §1c | `:295` | holds |
| consumer-registry has no `load_wsib` producer row | §1c | only `link_wsib` self-rows `wsib_registry_count` `:147-162`; no `load_wsib` producer [READ the registry file] | holds |
| `exec-policy.json:55` lists `enrich-wsib.js` claude-only | §1c | `:55` | holds |
| `enrich-wsib.js` whitelist `:509-516`, filter `:517`, count `:519-527` | §1c `:509-527` | whitelist `:509-516`, filter `:517`, count `:519-527` (plan range `:509-527` ok; §3's `:509-517` is the whitelist+filter prefix) | DRIFT → `:509-516` / `:517` / `:519-527` |
| `get-lead-feed.ts:107` | §1c `:100-115` | `:107` (plan range `:100-115` ok) | DRIFT → `:107` |
| `entities/[id]/route.ts:55` | §1c | `:55` | DRIFT → `:55` (re-grounded) |
| `index.js` wsib comments | §1c `:1596-1853` | `:1808, :1819, :1879-1916, :1959, :2065` | DRIFT → `:1808` / `:1819` / `:1879-1916` / `:1959` / `:2065` |
| `write.js:111` | §1c | `:111` | holds |
| `write.js:1586` | §1c | `:1604-1605` | DRIFT → `:1604-1605` |
| census `:361-366` | §1c | `:365-370` | DRIFT → `:365-370` |
| `step.schema.json:1984/:2008` | §1c | `:1986` / `:2031` (will shift again with 0fs) | DRIFT → `:1986` / `:2031` |
| `scripts/surfaces/**` naming `load_wsib` | §1c (plan: 16 files) | **11** files [READ `git grep load_wsib scripts/surfaces/**`] | DRIFT → **11** |

### (d) `records_meta` legacy key readers

The seven flat `records_meta` keys have exactly one reader outside the script — a source-text assertion in a
logic test — and no runtime reader, so regrouping them under `wsib_load` is an explained diff rather than a
consumer break.

| Row | Plan cite | Re-grounded @ 43056856 | Verdict |
|---|---|---|---|
| the seven flat keys (`duration_ms`, `total_csv_rows`, `unique_class_g`, `records_inserted`, `records_updated`, `skipped_non_g`, `skipped_no_name`) | §1c intro | ONE reader outside the script: `src/tests/chain.logic.test.ts:658-661` (source-text `expect(content).toContain('unique_class_g')`, plan said `:655-658`) | DRIFT → `:658-661` |
| runtime readers of the seven keys | §1c intro | 0 [READ `git grep` across `src/**` outside the script and its fixtures] ⇒ the `wsib_load` regrouping is an **explained diff**, not a consumer break | holds |

### (e) Tests

The test set that pins this step is present: the red suite, the infra/logic locks, the ledger-gate test, the
finalize db test, and the PII-glob test. Two logic-test files moved their line ranges (`DRIFT`) while the
step's own red suite and infra tests hold, and the `wsib.logic.test.ts` SPEC LINK points at a spec that does
not exist (fix owed at ②).

| Row | Plan cite | Re-grounded @ 43056856 | Verdict |
|---|---|---|---|
| `wsib.infra.test.ts:82` (`requires --file flag`) | §1d | `:82` | holds |
| `wsib.logic.test.ts:2` SPEC LINK `docs/specs/35_wsib_registry.md` | §1d | the spec file does **not** exist (`ls` → no such file) — fix at ② | holds (link present, target absent) |
| `chain.logic.test.ts:623, :943` | §1d | `:623`, `:943` | holds |
| `pipeline-sdk.logic.test.ts:1115` | §1d | `:1115` | holds |
| `pipeline-advisory-lock.infra.test.ts:62` | §1d | `:62` | holds |
| `link-wsib-ledger-gate.logic.test.ts:29-37, :110-114` | §1d | `:29-37`, `:110-114` | holds |
| `steps/link_wsib/violations.test.ts:526-554, :1013-1019, :1378, :1406` | §1d | all present | holds |
| `db/load-wsib-finalize.db.test.ts` (spawns `--file`) | §1d | present | holds |
| `deepseek-exec-pii-globs.infra.test.ts:95` | §1d | `:95` | holds |
| `pipeline-sdk.logic.test.ts` B4 lock `:2068` | §1d | `:2110-2115` (`toMatch(/seen\.clear\(\)\|DEDUP_FLUSH/)`) | DRIFT → `:2110-2115` |
| `pipeline-sdk.logic.test.ts` chain-skip lock `:2096` | §1d | `:2139-2140` | DRIFT → `:2139-2140` |
| `pipeline-sdk.logic.test.ts:2745` | §1d | `:2788` | DRIFT → `:2788` |
| `step-library.logic.test.ts:2836` | §1d | `:2856` | DRIFT → `:2856` |
| `step-library.logic.test.ts:5044` | §1d | `:5064` | DRIFT → `:5064` |

---

## 4. PH-3 — Intent ledger (G3)

> **Role split (R-PH-3):** this pass only **discovers** the intent behind each construct and the git commit that
> introduced it; the **Disposition** column is the plan's adjudication, transcribed here, never re-decided. The
> `Introduced (git log -S)` column was executed by the orchestrator (`git log -S<construct> -- scripts/load-wsib.js`,
> `git show`) — each commit hash, date and subject below is its output, transcribed verbatim. The `Intent` column
> records what the construct was **for** when it landed. **Disposition vocabulary (closed):**
> `preserved-in-runner`, `preserved-in-validator`, `preserved-in-compute`, `encoded-as-descriptor-field`,
> `encoded-as-deviation`, `knowingly-retired` — every row carries exactly one. A `preserved-in-compute` row also
> states **where its rule is written** (`notes.json` or a `checks[]` `why`). The `WS id` column names the carried
> defect from plan §2 (`—` when the construct carries none), and `① lock` names the red-suite test(s) that pin it.

| # | Construct | Introduced (git log -S) | Intent | Disposition (closed set: preserved-in-runner / -validator / -compute, encoded-as-descriptor-field / -deviation, knowingly-retired) | WS id | ① lock |
|---|---|---|---|---|---|---|
| 1 | `normalizeName` / `SUFFIX_PATTERN` :28-42 | `e0f2fa72` 2026-03-05 "feat(35_wsib): add wsib_registry table and ingestion/matching scripts" | name key, two-pass suffix strip | preserved-in-compute (`coerceKey`; suffix list = vocabulary in `notes.json`) | — | L5, D4 |
| 2 | G filter `!predominantClass.startsWith('G') && !subclass.startsWith('G')` :289 | `e0f2fa72` 2026-03-05 "feat(35_wsib): add wsib_registry table and ingestion/matching scripts" | Class G only | preserved-in-compute (`shapeRecord` → `"non_g"`; the `G` prefix in `notes.json`) | WS-D7 | L2, D6, D7 |
| 3 | duplicate-`Description` handling `descKeys.length > 1` :64-66 | `e0f2fa72` 2026-03-05 "feat(35_wsib): add wsib_registry table and ingestion/matching scripts" | split NAICS vs subclass text | encoded-as-deviation (dead arm carried; the wrong form is pinned) | WS-D1 | L8, D9 |
| 4 | guard `IS DISTINCT FROM` + `RETURNING (xmax = 0)` :242-251 | `fa2dc89b` 2026-03-17 "load-wsib.js — IS DISTINCT FROM + NOW() + observability" (guard) / `0ef23550` 2026-03-09 SDK extraction (xmax) | no rewrite of unchanged rows | encoded-as-descriptor-field (`guard_columns`, 9) | — | L7, D10 |
| 5 | chain-skip + `CHAIN_ID` :19, :89-126 | `26f3ecfc` 2026-03-11 "graceful skip for load-wsib when no --file arg in chain context" | runners have no file | encoded-as-descriptor-field (terminal `skipped_no_source_file` via 0fs) | WS-D4 | L13, D3 |
| 6 | `data/` scan `/^BusinessClassificationDetails/i` :94-104 | `84402d3f` 2026-03-27 "add WSIB file metadata" | show the operator which file is loaded | encoded-as-descriptor-field (`externals[0].path` glob; the display rows are knowingly-retired → `acquired.source_path`) | WS-D4 | L13, D2 |
| 7 | audit thresholds `110000`, `skip_no_name_rate` :387, :392 | `d32612bb` 2026-03-26 "enrich sources audit_tables with business accuracy thresholds" | accuracy floors | encoded-as-descriptor-field (checks with `limit_from_config`) | — | L11, D11, D12 |
| 8 | batch flush `DEDUP_FLUSH_SIZE` :184-188 | `c5ced678` 2026-04-02 "B4 memory overflow migration — 3 scripts to streaming" | cap peak memory | knowingly-retired (whole-array library path; heap probe §1.4: 172.04 MB peak) | WS-D2 | `pipeline-sdk.logic.test.ts:2110-2115` re-homed at ② |
| 9 | G-subclass replacement fence `pendingMap` :188, :311-317 | `7338b009` 2026-04-02 "review fixes — counter skip bug, G-subclass replacement" (restored logic the Set migration lost) | keep the G-predominant row | preserved-in-compute (`dedupeBySourceId`, rule in `notes.json`) | WS-D2 | L3, D5 (7338b009 touched no test: the fence was UNLOCKED until ①) |
| 10 | `is_gta` fence `GTA_CITIES`/`isGTA` :45-58 | `ba3ad8a2` 2026-04-03 "WSIB is_gta column + GTA-only enrichment filter" (+ migration 066) | GTA-only Serper queue | preserved-in-compute (`shapeRecord`; the 25 names in `notes.json`) | WS-D5 (data) | L4, D7 |
| 11 | lock 97 :84, :135 | `745a1b4d` 2026-04-16 "Bundle G Wave 4 — advisory lock retrofit" | exclusion | encoded-as-descriptor-field (`identity.lock`) | — | L1, D1; `pipeline-advisory-lock.infra.test.ts:62` |
| 12 | `getDbTimestamp` RUN_AT :136 | `46275ef1` 2026-04-17 "B3 — migrate 22 scripts to pipeline.getDbTimestamp" | one DB clock per run | preserved-in-runner (runner clock → `last_seen_at`) | — | — |
| 13 | Commit E fence try/finally finalize :143-182, :422-444 | `1ffa7478` 2026-08-16 "fix(52_source_wsib): B3 output fold E - orphan running row wedges the gate" | a stranded `running` row forces `link_wsib` to RUN forever | preserved-in-runner (runner-owned ledger row) | — | L12; `db/load-wsib-finalize.db.test.ts` (same commit) re-pointed at ② |
| 14 | flat `records_meta` keys :401-407 | `8b9b0f91`/`d32612bb` 2026-03-26 | observability | encoded-as-deviation (regrouped into `wsib_load`) | WS-D3 | L1, L9, D14 |

### 4.1 Fences with a regression lock today

- **Commit E** → the db test (`db/load-wsib-finalize.db.test.ts`, added in `1ffa7478`).
- **B4** → the source-text lock above (`pipeline-sdk.logic.test.ts:2110-2115`), introduced in `c5ced678`.
- **chain skip** → `pipeline-sdk.logic.test.ts:2139-2140`, introduced in `26f3ecfc`.
- **lock 97** → advisory-lock infra `pipeline-advisory-lock.infra.test.ts:62`.
- **W3** (never write `linked_entity_id`) → `link-wsib-ledger-gate.logic.test.ts:110-114`.
- **UNLOCKED before ①:** G-subclass (`7338b009`), `is_gta` (`ba3ad8a2`) — now L3/L4 + D5/D7.

---

## 5. PH-5 — Seam map (G5)

| Seam | Legacy site | Converted seat |
|---|---|---|
| DB seam | `pool.query` INSERT `pipeline_runs` :145-149, guarded upsert :224-252 inside `withTransaction` :201, stats SELECT :363-370, finalize UPDATE :430-436; advisory lock :135 | runner + `executeWrite`, class A |
| clock seam | `getDbTimestamp` :136, `Date.now()` :140 / :355 / :435, file `mtime` :101 / :382 | runner clock; `mtime` is non-deterministic, §8 |
| network seam | none: operator-downloaded file; 0fs filesystem kind issues no HEAD | (no network seam) |
| argv/env seam | `--file` :87-89 retired; `PIPELINE_CHAIN` :19 | runner |
| filesystem seam | `existsSync` :131, `createReadStream` :262, `data/` scan :94-104 | 0fs `resolveLocalSource` + `copyLocalFile` |

### 5.1 Prerequisites

- **0fs final, uncommitted** (`Buildo-wt-0fs`): `acquire.js` +147, `index.js` +58, `step.schema.json` +125 lines.
- **Simplification items 8/9 landed in `5ece69b1`** (ancestor of HEAD): `rowConservation` at `scripts/lib/step/index.js:1238`; `code_sha` 6 hits.

---

## 6. PH-6 — Classification + defect ledger (G6)

**Defect prefix (declared, 2026-09-29):** `load_wsib`'s ledger ids are **`WS-D<n>`**. step-validate derived the prefix from slug initials (`defectPrefixFor`, `scripts/analysis/step-validate.mjs`), which gives `LW` — `link_wsib`'s prefix — so G6 scored link_wsib's LW-D1..22 as this step's (measured: \"as this step's (measured: "22 LEDGER_ROW_S_MARK" at ②)\" YYYY at ②). Operator-approved gate fix: `DEFECT_PREFIX_OVERRIDES = { load_wsib: 'WS' }` plus fast invariant #42 DEFECT-PREFIX-UNIQUE (fails when two converted/pending slugs share a prefix, naming both and the fix), locked by `src/tests/step-validate-defect-prefix.logic.test.ts`.

`load_wsib` is **INGESTOR** by declared census — `scripts/steps/_schema/step-archetype-census.json:365-370`
reads `{ "slug": "load_wsib", "file": "scripts/load-wsib.js", "archetype": "INGESTOR", "batch": "C5",
"reason": "Spec 122 §1.10 declared" }` [READ same file] — and its write class is **A `guarded_upsert`** (§1.1:
one guarded `INSERT … ON CONFLICT … DO UPDATE … WHERE` with 9 `IS DISTINCT FROM` predicates, no
`DELETE`/`TRUNCATE`). Its conversion form is **compressed** (report header; six converted INGESTOR members
make compressed the DEFAULT form).

### 6.1 Defect ledger

The nine rows below are carried verbatim from `docs/reports/defect-ledger.md` (`WS-D1`..`WS-D8`), one row
each, with the ledger's own **Status** cell copied into the Disposition column and the ① red-suite lock(s)
named (WS-D9 added at the ② output-panel fold, 2026-09-29; the orchestrator lands its defect-ledger.md row).

| ID | One-line | Disposition | ① lock |
|---|---|---|---|
| `WS-D1` | csv-parse `columns:true` keeps only the LAST of the two `Description` headers, so `naics_description` carries SUBCLASS text and `subclass_description` is NULL on 121,116/121,116; the `descKeys.length > 1` arm is dead [MEASURED plan §3] | OPEN · **PIN** (carried at ②; decision D3) | L8, D9 |
| `WS-D2` | the G-preference replacement only sees the current 5,000-key flush window; the converted whole-array dedupe differs on 0 keys of the 2025 file [MEASURED plan §2 row 5] | OPEN · **PIN** (declared deviation at ②, measured 0 keys) | L3, D5 |
| `WS-D3` | `records_total` counts written rows, not rows read | OPEN · **PIN** | L9, D14 |
| `WS-D4` | the chain never loads: it passes no `--file`, so every chain run SKIPs; last 6 ledger runs `records_total 0` [MEASURED plan §3] | OPEN · **PIN** (decision D1: declared deviation) | L13, D2, D3 |
| `WS-D5` | DATA defect: `is_gta` true on 0/121,116 local rows while migration 066's own predicate matches 47,040 [MEASURED plan §3]; the code is correct, the rows predate 066 | OPEN · **PIN** (data; no code change) | L4 (code correct; data repaired at ② forced-change proof) |
| `WS-D6` | a NULL `mailing_address` never conflicts in the UNIQUE key, so such a row would duplicate on every reload; latent: 0 NULL addresses [MEASURED plan §3] | OPEN · **PIN** (limitation + check wsib_null_address_count viol == 0, ① D13) | L10, D7, D13 |
| `WS-D7` | attribution order: the library counts a nameless row as bad_key BEFORE the G filter, legacy counts a nameless non-G row as non-G (① L10 vs D6); 0 such rows on the 2025 file [MEASURED plan §3] | OPEN · **PIN** (declared limitation) | L10, D6 |
| `WS-D8` | Spec 52 §3 edge case is stale: the step never deletes (no DELETE/TRUNCATE in `scripts/load-wsib.js`); the same stale sentence is in `docs/specs/01-pipeline/43_chain_sources.md:211` | OPEN · **PIN** (doc) | (doc; Spec 52 at ②, Spec 43 `:211` at ③) |
| `WS-D9` | no-name rate boundary: legacy WARN at `>= 1.0` (`scripts/load-wsib.js`:392); converted PASS at exactly 1.0 (the `pct <=` grammar is inclusive; no strict comparator exists); 0 rows affected on the 2025 file (0 no-name rows) | OPEN · **PIN** (declared deviation at ②, descriptor deviations[8]; test D11 pins the evaluated verdict) | restored when the library gains a strict pct comparator (`pct <` limit — RE-FREEZE, filed for the next library batch) |

### 6.2 Prefix finding (orchestrator ruling owed)

`WS-` is **unused in the ledger** — 0 rows carried the prefix before this commit (only `LW-D1`..`LW-D22`
exist for the `link_wsib` neighbour). BUT the G6 scorer derives the prefix from the slug's **initials**:

```js
function defectPrefixFor(slug) {
  return slug.split('_').map((w) => w[0].toUpperCase()).join('');
}
```

[READ `scripts/analysis/step-validate.mjs:782-784`] — so `load_wsib` → **`LW`**, which is ALREADY
`link_wsib`'s prefix (22 rows `LW-D1`..`LW-D22`). Consequence: `step-validate`'s G6 for `load_wsib` would read
`link_wsib`'s rows (a false pass) and would never see `WS-D*`; `parseDefectLedgerRow` would also reject a
`WS-` id under the `LW` prefix. The `neighbourhoods` precedent (plan `NB-D` renamed to `N-D` to match the
gate) **cannot** apply without merging two steps' namespaces. Options: **(a)** an explicit prefix override for
`load_wsib` in `step-validate.mjs` (a gate change); **(b)** register as `LW-D23`+ in `link_wsib`'s namespace. ①
keeps the plan's `WS-` ids.

---

## 7. PH-6 — Literal ledger (Rule 3)

| Literal [READ `scripts/load-wsib.js`] | Disposition |
|---|---|
| `110000` :387 (threshold `'>= 110000'`, :394) | logic variable `load_wsib_unique_class_g_warn_min` (seed 110000, `on_invalid:"fail"`) — check `wsib_unique_class_g` `limit_from_config` (① D12, D15) |
| `1` (%) :392, :394 | `load_wsib_no_name_skip_warn_pct` (seed 1) — check `wsib_no_name_skip_rate` (① D11, D15) |
| `DEDUP_FLUSH_SIZE = 5000` :186, `BATCH = 2000` :200, `65000` :220, `50000` progress :335 | retired with the library whole-array path and stride (declared deviation; `address_points` precedent, plan §5) |
| `13` params per row :209 | retired (library codegen binds by declared column) |
| `97` :84 | `identity.lock`; `11` audit phase :109, :409 → `emits[audit_table]` skeleton |
| `toFixed(1)` + `* 100` :380-381 | the check emits the raw percentage number (never a formatted string or a 0/1 flag) |
| vocabulary, not tunables (Rule 4 → `notes.json` + check `why`): `SUFFIXES` :28-31, `GTA_CITIES` :45-52, the `G` class prefix :289, the three required headers :276 | vocabulary |

No `load_wsib` variable is seeded today (plan §5 MEASURED).

---

## 8. Non-determinism inventory (before the first golden)

- `id` SERIAL (`migrations/040_wsib_registry.sql:7`) and `first_seen_at DEFAULT NOW()`
  (`migrations/040_wsib_registry.sql:22`) are DB-assigned.
- `last_seen_at` = the run's DB clock (`scripts/load-wsib.js:136`, bound `:216`).
- the `file_date` audit rows read the file `mtime` (`scripts/load-wsib.js:103`, `:385`).
- `duration_ms` (`scripts/load-wsib.js:401`) and the `pipeline_runs` `NOW()` stamps (`scripts/load-wsib.js:147`,
  `:432`) are wall clock.
- progress logs use `toLocaleString` (`scripts/load-wsib.js:336`).

The plan's §7 capture `--table-columns` list for `wsib_registry` excludes `id`, `first_seen_at`, `last_seen_at`
and the contact/enrichment columns (it keeps `linked_entity_id`), and orders by `legal_name_normalized, mailing_address`, so these do not enter the
table hash; the audit `file_date` and `duration_ms` are explained-diff keys.

---

## 9. PRE goldens + forced-change proof

**Status: PENDING (orchestrator capture).** A live-DB capture job holds the database, so this pass ran **NO
query and NO `load-wsib.js`**. The steps below are plan §7 transcribed (condensed; every flag verbatim) as the
capture recipe the orchestrator executes; no value here was re-derived in this worktree.

### 9.1 Capture steps (plan §7 steps 1-5, verbatim)

1. `CREATE TABLE wsib_registry_bak_<date> AS TABLE wsib_registry;`
2. PRE sources: `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-wsib.js --chain=sources --args=--file,"<abs path>/BusinessClassificationDetails(2025).csv" --table-columns="wsib_registry:legal_name_normalized,mailing_address,legal_name,trade_name,trade_name_normalized,predominant_class,naics_code,naics_description,subclass,subclass_description,business_size,is_gta,linked_entity_id" --table-order=wsib_registry:legal_name_normalized,mailing_address --out=docs/reports/golden/load_wsib/pre/sources.json`. Expect `records_updated ≈ 47,040` (exact number recorded; the JS and SQL GTA predicates match the same 25 names).
3. Restore: `UPDATE wsib_registry w SET is_gta=b.is_gta, last_seen_at=b.last_seen_at FROM wsib_registry_bak_<date> b WHERE b.id=w.id;`. Then PRE standalone (`--chain=none`, same args) → `pre/standalone.json`.
4. After ②: restore, then POST sources (file placed per D1, no `--args`) → `post/sources.json`. The same-session check (item 2) and two-run proof (item 7: run 2 must write 0 through the guard) run inside the tool. Restore, POST standalone. `--compare=pre/X,post/X` for both: data hash identical.
5. Drop the backup. The final state keeps the repaired `is_gta` (true data).

### 9.2 PRE artifacts (all cells PENDING)

| Artifact | content_hash | records (total/new/updated) |
|---|---|---|
| `pre/sources.json` | PENDING (orchestrator capture) | PENDING (orchestrator capture) |
| `pre/standalone.json` | PENDING (orchestrator capture) | PENDING (orchestrator capture) |

**Natural perturbation = WS-D5** — the **47,040** stale `is_gta` rows [MEASURED 2026-09-28, plan §7]. The
migration-066 predicate matches 47,040 rows whose stored `is_gta` is `false` because they were loaded before
066 existed (§6.1 WS-D5), so the first legacy or converted re-load flips them through the 9-predicate guard and `records_updated ≈ 47,040` is
**expected** on the PRE `sources` run — that is the forced-change proof, not a regression.

**CSV staging prerequisite:** the CSV must first be **copied from `~/Downloads/` into `data/`** of the
capturing tree before the `--file` run — `data/` is **gitignored** (§1.4), so the staged copy never enters git.

**Expected row conservation (plan §7):**

```
rows_read 345,416 = non_g 212,056 + bad_key 0 + duplicates 12,244 + (inserted + updated + unchanged) 121,116
```

---

## 10. Red suite (PH-7)

**Suite:** `src/tests/steps/load_wsib/violations.test.ts` (SPEC LINK **Spec 52**,
`docs/specs/01-pipeline/52_source_wsib.md` — the source producer contract) with fixtures
`fixtures/wsib-sample.csv` (**10 rows**), `fixtures/legacy-harness.ts` (evaluates the frozen copy
`fixtures/legacy-load-wsib.js.txt` **as source text** against a **fake pipeline/pool**, parsing the CSV with the
**real `csv-parse`** so WS-D1 is pinned by the genuine parser), and `fixtures/legacy-load-wsib.js.txt` (the byte
copy of `scripts/load-wsib.js`, §3(a)).

**Composition** [READ `src/tests/steps/load_wsib/violations.test.ts` in THIS worktree]:

- **13 legacy pins `L1`-`L13`** — plain `it(`, **GREEN today**, each reading the frozen source-text copy
  through `loadLegacy`.
- **15 converted claims `D1`-`D15`** — every one `it.fails`; the **first statement** of each body is
  `loadDescriptor()` / `loadComputeModule()` / `readText()`, so each throws a **named `MISSING ARTIFACT …`**
  today rather than an import/TS error.
- **1 plain report-marker test** (`the report states the compressed-form marker line (R-PACE-1)`) — GREEN today.

### 10.1 Plan §6 ① case → test map

| Plan §6 ① case | Test(s) |
|---|---|
| G filter both arms | L2, D7 |
| no-name skip | L5, L10, D4 |
| dedupe G-preference | L3, D5 |
| is_gta true/false + case | L4, D7 |
| header-drift | L12, D8 |
| absent-file terminal | L13, D3 |
| 9-column guard excludes `last_seen_at` | L7, D10 |
| never writes `linked_entity_id`/contacts | L6, D10 |
| no-name rate exactly 1.0 ⇒ WARN | L11, D11 |
| `WS-D1` | L8, D9 |
| `WS-D3` | L9, D14 |
| `WS-D6` | L10, D7, D13 |
| `WS-D7` | L10, D6 |

**RED evidence (gate K / G7):** `docs/reports/red-evidence/load_wsib/pre2-artifacts-missing.json` — e.g. `D1 — descriptor AJV-valid; identity load_wsib INGESTOR spec 52 lock 97 display_name WSIB Registry Ingestion; shape ingest; notes exist; shell calls pipeline.step (flips at: commit ②)` and `D12 — wsib_unique_class_g reads its floor from config: 109999 WARNs, 110000 passes (flips at: commit ②)`.

How it was produced (2026-09-29, this worktree, no DB): the ① suite with its 15 `it.fails(` turned into `it(` in place
(sed), run once with `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/steps/load_wsib --reporter=json`,
then restored byte-for-byte (sha256 `2739bb96…ba2c` before and after). Result: 29 tests, **15 failed / 14 passed** —
the 13 legacy pins and the report-marker test pass; every D-claim fails on its first statement with
"MISSING ARTIFACT scripts/load-wsib.descriptor.json" (D1-D3, D10-D15) or "MISSING ARTIFACT
scripts/lib/compute/load-wsib.js" (D4-D9) — genuine assertion failures, 0 import/TS errors, 0 wrong-reason reds.
The harness uses a fake pool, so the run wrote nothing to any database.

---

## R. Reflection (G9)

### LOW-CONFIDENCE table

| Item | Why low | Resolves at |
|---|---|---|
| header-drift seat | no library seam exists (the acquired block carries no header list); **D8 pins a compute throw** rather than a descriptor check | ② ruling |
| D1 `display_name` `WSIB Registry Ingestion` | inferred from the legacy audit name (`:110` skip path, `:410` run path), **not stated in the plan** | ② |
| D13 `wsib_null_address_count` severity | not fixed by the plan (the test asserts only `viol == 0`, no `severity`) | ② |
| every DB figure (47,040; 121,116; RLS; last-6-runs) | **transcribed from the plan, not re-queried** (the DB was held all pass) | PRE capture |
| heap probe numbers (§1.4: 172.04 MB peak / 6.02 s) | they are the **orchestrator's** probe output, not this worker's measurement | — |
| defect prefix `WS` vs the gate-derived `LW` | the G6 scorer derives `LW` from the slug initials (§6.2) — the ruling is owed | orchestrator ruling |

### RECURRING / STANDARD-SHAPING table

| Finding | Where else | Proposed standard |
|---|---|---|
| header-drift checks read never-populated `missing_columns` / `csv_columns` | `parcels`, `address_points` computes (§2 corrections — the same dead reads at `load-parcels.js:463-475`, `load-address-points.js:176-183`) | a library **acquire seam** exposing the parsed header, **or delete the dead checks** |
| slug-initial defect prefixes collide | `load_wsib` and `link_wsib` both derive **`LW`** (§6.2) | an explicit **prefix map** in `step-validate.mjs` |
| the neighbourhoods suite's SPEC LINK names `47_pipeline_runs.md` and `124_step_opt_policy.md`, which **do not exist** (real: `47_pipeline_script_protocol.md`, `124_step_standard_policy.md`); copied into this suite's first draft and corrected | `src/tests/steps/neighbourhoods/violations.test.ts:3`, `:8` | a **SPEC LINK existence check** |
| plan line cites drift between plan and ① (§3: 15 DRIFT rows) | every conversion | **re-ground cites in the ① report**; cite code text, not line numbers, in the ledger |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=load_wsib --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=22 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=39313d9 |
| G3 | 2 | 2 | table rows=15 vocab-hit rows=15 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 9 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=4 it-count=38 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=4 lock-it-count=38 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | load_wsib | PASS | min_migration=66 <= migrations count=246 |
| 2 | load_wsib | PASS | 2 declared, missing from seeds: none |
| 3 | load_wsib | PASS | retired=0 overlap-with-declared=none |
| 7 | load_wsib | PASS | SPEC LINK header present=true |
| 8 | load_wsib | PASS | G-4: 2 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | load_wsib | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | load_wsib | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 26 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 26 converted slug(s) — 26 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 65 declared counter source(s) across 22 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 9 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 8 bound(s) checked, all closed (8 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 12 on_invalid(s) checked, all closed (12 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 58 emits drift(s) checked, all closed (58 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 3 contract(s) checked, all closed (3 ledger-allowed, 0 present+typed/excluded); 56 unproduced src read(s) (report-only until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:building_footprints.id; unproduced:src/app/api/permits/[id]/route.ts:neighbourhoods.id; unproduced:src/app/api/permits/[id]/route.ts:neighbourhoods.top_mother_tongue; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:neighbourhoods.id; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.last_enriched_at; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.primary_phone; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.website; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:coa_applications.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:neighbourhoods.id; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:building_footprints.id; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:neighbourhoods.id; unproduced:src/lib/leads/lead-inspect-query.ts:parcels.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/market-metrics/queries.ts:neighbourhoods.id; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.created_at; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.id; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.snapshot_date; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 5 path(s) checked, all LF (5 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 4 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 33 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 320 definition row(s) checked, 24 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (14 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 81 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 26 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 30 finding(s), all ledger-allowed (30) |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 20 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 26 slug(s), every defect prefix unique |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 169 · unexplained: 0

### Test suite (item iii)
- 1948/1952 passed (suite success=false)
- harvested: 48 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (4):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > report carries exactly one generated scorecard block
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > the committed block also carries a Test-suite line and a 14-row Policy coverage matrix (presence only — content is `--all --write`'s job, not this lock's)
  - src/tests/steps/pct-checks-evaluate.logic.test.ts > class lock — every pct-bounded check reports a value, never a flag > no pct-bounded check reports violations() instead of value()

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 2 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 4 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=38125B notes=12991B checks=7 rows records_meta=1511B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1

