# Pilot 2 assessment — `load_ravines` (PH-0 · PH-3 · PH-5 · PH-6)

**Target:** `scripts/load-ravines.js` — **605 lines** (`wc -l`), lock 59, HEAD `e94014f9` (plan commit), file last touched by `0b230472` (2026-08-10, Phase B B1). Archetype **LOADER/INGESTOR**, write class **B** (`upsert_scoped_departure_delete`), 1 chain (`sources`).
**Plan:** `.cursor/active_task.md` (Pilot 2, rulings A-1 (b) · A-2 `ctx.acquire` · A-3 `RAVINE_FORCE_RELOAD` · A-4 `limit_from_config` · A-5 `accept_anomaly[]`). **Governing:** Spec 123 §6 / §6.1 / §6.2 / §7 / §7.1; Spec 122 §1.2a P1–P5, §5.1. Step spec: Spec 59 §3, §9.
**Structure:** mirrors `2026-08-25-pilot1-assert-schema-assessment.md` (the violations test reads tables by column header). **Numbers are not inherited** — every figure below was re-derived this session (2026-08-25) from the file and the live DB (`scripts/lib/resolve-db.js` → `postgresql://postgres:***@127.0.0.1:54322/postgres`, 242 applied migrations); where a plan figure differed it is flagged `⚠ plan said …`.
**Status:** ASSESSMENT ONLY. No `src/`/`scripts/` code changed. PH-3 dispositions are **PROPOSED, AWAITING OPERATOR ADJUDICATION (§7.1)** — the pass that discovered the fences may not retire them.

> **Operator context (2026-08-25):** ravines is a small dataset that rarely changes. The **skip terminal is the normal, correct outcome**; `force_run` (A-3) exists to prove the write path in the differential and for deliberate reloads only.

---

## 1. PH-0 — Boundary freeze (commit 1 → G0)

**Rule:** nothing outside this section is behaviour.

### 1.1 Grep transcript (the evidence)

```
$ wc -l scripts/load-ravines.js                → 605
$ grep -n "throw new Error"   → 5   :192 :208 :241 :242 :246   (all inside acquisition helpers; every one is caught at :364)
$ grep -n "try {"             → 5   :190 :206 :224 :299 :346
$ grep -n "catch"             → 3   :291 (.catch → null) :301 (HEAD) :364 (acquisition)
$ grep -n "finally"           → 5 lines, 4 real blocks :194 :216 :229 :372   (:353 is a comment)
$ grep -n "emitSummary"       → 7   :303 :320 :366 :379 :410 :449 :543
$ grep -n "emitMeta"          → 2 lines, 1 call :576   (:11 is a comment)
$ grep -n "fetch("            → 2   :191 HEAD · :207 GET   (both AbortController-timed, redirect:'follow')
$ grep -n "pool.query"        → 1   :422 (VALIDATION_SQL)
$ grep -n "client.query"      → 2   :478 UPSERT · :496 DELETE
$ grep -n "INSERT INTO"       → 1   :479      "DELETE FROM" → 1 :496      "UPDATE" → 1 :480 (the ON CONFLICT DO UPDATE arm)
$ grep -n "withTransaction"   → 2 lines, 1 call :466   (:419 is a comment)
$ grep -n "withAdvisoryLock"  → 1   :275
$ grep -n "Date.now()"        → 0        "new Date("  → 0        (clock = pipeline.getDbTimestamp :276)
$ grep -n "process.argv"      → 0        "process.exit" → 0
$ grep -n "process.env"       → 2   :283 RAVINE_ACCEPT_FEATURE_COUNT_DRIFT · :284 RAVINE_ACCEPT_MASS_DELETE   (no force var)
$ grep -n "fs\."              → 5   :213 createWriteStream · :225 mkdirSync · :239 readdirSync · :339 mkdtempSync · :373 rmSync
$ grep -n "os\."              → 1   :339 os.tmpdir()          "crypto\." → 2  :209 md5 · :459 sha1
$ grep -n "push('"            → 24 call sites → 20 DISTINCT metrics (§1.3)
$ grep -n "return { failed: true }" → 4  :308 :371 :415 :454      "return { skipped: true }" → 2 :335 :391
$ grep -n "return (massDeleteCheckPassed" → 1 :553 (ok | failed)   "return;" → 1 :556 (lock contention)
$ grep -n "round3("           → 11       "log.warn" → 3  :292 :433 :494
$ grep -n "pipeline.run("     → 1   :588  ('load-ravines' — hyphen, not the slug)
$ grep -n "require("          → 13  :20-27 fs/os/path/crypto/stream/stream-promises/node-stream-zip/shapefile · :29-33 pipeline/config-loader/safe-math/source-version/zod
$ grep -n "SPEC LINK"         → 2   :4 (59) :5 (43)
$ grep -n "module.exports"    → 1   :591  (13 named exports :592-604)
$ sed -n '522,541p' | grep -cE "^\s+[a-z_]+:"  → 18  (records_meta.ravine_load fields)
```

Plan figures re-measured to the same value: 605 lines · 5 throw · 5 try / 3 catch / 4 finally · 7 emitSummary · 2 fetch · 1+2 queries · 0 Date.now / 0 new Date · 0 argv · 2 env · 20 metrics · 10 terminals · 13 exports · 18 `ravine_load` fields. **No plan number failed to re-measure.**

### 1.2 Tables and columns written

| Site | Statement | Columns | Guard |
|---|---|---|---|
| `:478-486` | `INSERT INTO ravines (source_id, geom, source_dataset_version, updated_at) VALUES … ON CONFLICT (source_id) DO UPDATE SET geom, source_dataset_version, updated_at = EXCLUDED.* WHERE ravines.geom IS DISTINCT FROM EXCLUDED.geom OR ravines.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version RETURNING (xmax = 0) AS is_insert` | `source_id` (BIGINT), `geom` (`ST_GeomFromWKB($n, 4326)` `:475`), `source_dataset_version` (= `datasetVersion` `:459`), `updated_at` (= `runAt`, DB clock). `created_at` is **never written** — DB default `now()` (live catalog: `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT now()`) | `IS DISTINCT FROM` on geom + version; batched at `pipeline.maxRowsPerInsert(4)` = 16383 rows; inside `pipeline.withTransaction` `:466` |
| `:496` | `DELETE FROM ravines WHERE source_id <> ALL($1::BIGINT[])` | — (scoped departure delete) | suppressed when `loadedSourceIds` is empty (`shouldSkipDelete` `:492`, F-C1 / L15) → `delete_skipped_empty_guard = true`; same transaction |
| via `run-chain.js` (in-chain) | `pipeline_runs` row under `sources:load_ravines` (`run-chain.js:522` `${chainId}:${slug}`) | bookkeeping | the step itself writes **no** `pipeline_runs` row; standalone (`pipeline.run`) writes none either |

**DB reads:** `readPriorRunMeta(pool, 'sources:load_ravines')` `:290` (prior `records_meta`); `VALIDATION_SQL` `:422` (pure PostGIS compute, no table). `loadMarketplaceConfigs(pool, 'source-ravines')` `:272` → `logic_variables` (live: **0** ravine keys of 422).
**Live state (2026-08-25):** `ravines` **854 rows · 1 distinct `source_dataset_version` = `97b4ac7fb3f9808726a106a4b67083ac` (the md5 content hash) · 7,640 kB · `source_id` ∈ [9,914,257 … 14,041,969] · `max(updated_at)` 2026-06-10T14:23:03Z`.
**RLS (Schema-Fidelity, live catalog):** `ravines.relrowsecurity = true`, `relforcerowsecurity = false`, **0 policies** (`pg_policies`); the pipeline role `postgres` has `rolbypassrls = true` (`rolsuper = false`). Writes succeed **only because the role bypasses RLS** — a non-bypass role would upsert/delete **0 rows silently** with no error. → **LR-D7** (§4.4) + a declared `guards` precondition.

### 1.3 Audit rows (20 distinct metrics) and `records_meta`

`audit_table = { phase: 59, name: 'Ravine + Natural Feature Protection', verdict: verdictCascade(rows), rows }` (`:562-564`); `emitSummary` appends `sys_velocity_rows_sec` + `sys_duration_ms`.

| # | Metric | Status | Site | Fires when |
|---|---|---|---|---|
| 1 | `dataset_source_license` | INFO | `:280` | always (first row) |
| 2 | `ravine_override_feature_count_drift_present` | WARN | `:285` | env `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1` |
| 3 | `ravine_override_mass_delete_present` | WARN | `:286` | env `RAVINE_ACCEPT_MASS_DELETE=1` |
| 4 | `ravine_head_error` | FAIL | `:302` | HEAD 4xx/5xx/abort → T1 |
| 5 | `ravine_no_cache_validators` | WARN | `:311` | HEAD returned neither `last-modified` nor `etag` |
| 6 | `ravine_dataset_age_years` | INFO/WARN | `:316` | always after a successful HEAD; WARN if > `ravineSkipCheckThresholdYears` (20) |
| 7 | `ravine_load_skipped` | INFO | `:319`, `:378` | tier-1 (`unchanged_last_modified`/`unchanged_etag`) or tier-2 (`unchanged_content_hash`) skip |
| 8 | `ravine_acquisition_error` | FAIL | `:365` | download/unzip/scan/parse throw → T3 |
| 9 | `ravine_bad_objectid_count` | WARN | `:393` | > 0 unparseable/≤0 OBJECTIDs |
| 10 | `ravine_null_geometry_count` | WARN | `:394` | > 0 null geometries |
| 11 | `ravine_duplicate_objectid_count` | WARN | `:398` | > 0 duplicate `source_id` (first kept) |
| 12 | `ravine_feature_count` | INFO | `:400` | always on the load path |
| 13 | `ravine_count_drift_pct` | FAIL | `:407` | `|n − prior| / prior` > 0.5 (override never suppresses the row) |
| 14 | `ravine_geometry_skipped_source_id` | WARN | `:441` | **once per non-carried feature** — unbounded row count → **LR-D1** |
| 15 | `ravine_geometry_repaired_pct` | INFO | `:443` | always on the load path |
| 16 | `ravine_geometry_collection_extracted` | INFO | `:444` | always on the load path |
| 17 | `ravine_geometry_skipped_pct` | FAIL / INFO | `:448` / `:456` | FAIL if > 0.05 → T6; else INFO |
| 18 | `ravine_geometry_update_pct` | WARN / INFO | `:504` / `:506` | WARN if prior exists and > 0.5 |
| 19 | `ravine_mass_delete_pct` | FAIL / INFO | `:514` / `:516` | FAIL if prior exists and > 0.5 |
| 20 | `ravine_delete_skipped_empty_guard` | INFO | `:518` | DELETE suppressed by F-C1 |

**Measured skip-path baseline (runs 1391, 1469 — the two most recent):** rows `dataset_source_license:INFO, ravine_dataset_age_years:INFO, ravine_load_skipped:INFO` + 2 `sys_`; verdict **PASS**; phase **59**; `skipped_reason = unchanged_last_modified`; `last_modified = Mon, 14 Mar 2022 15:25:09 GMT`; `content_hash = source_dataset_version = 97b4ac7f…`; `records_total/new/updated` stored as `0/0/0` although the step emits `null/null/null` (`:321`) — `run-chain` normalisation (plan C-11), not a step behaviour.

**`records_meta.ravine_load` — 18 fields (`:522-541`, skeleton `:566-572`):** `spec_version` `source_dataset_version` `last_modified` `etag` `content_hash` `feature_count` `polygons_inserted` `polygons_updated` `polygons_deleted` `delete_skipped_empty_guard` `mass_delete_pct` `invalid_geometry_repaired` `invalid_geometry_skipped` `geometry_collection_extracted` `drift_check_passed` `mass_delete_check_passed` `geometry_update_pct` `skipped_reason`. Skip paths re-emit the prior block through `sourceVersion.buildSkipReEmitMeta` (skeleton ← prior ← pins, pins last: `spec_version`, `skipped_reason`) `:327-331`, `:383-387`. Failure paths emit the skeleton with the fields known so far (`:305`, `:368`, `:412`, `:451`).

**Consumer contract (Integration seat, verified at anchors):** `scripts/enrich-ravines.js` reads **seven** `ravine_load` fields from the latest `status = 'completed'` row of `sources:load_ravines` (`:33-36`), and HALTs the chain on each:

| Field | `enrich-ravines.js` | Halt condition |
|---|---|---|
| `spec_version` | `:42` | `!== '1.2'` (exact pin — Spec 59 v1.3 header vs code `'1.2'` is documented drift, plan C-9; do not "fix") |
| `delete_skipped_empty_guard` | `:47` | `=== true` |
| `drift_check_passed` | `:50` | `=== false` |
| `mass_delete_check_passed` | `:50` | `=== false` |
| `feature_count` | `:56` | denominator for the next row |
| `invalid_geometry_skipped` | `:57` | `skipped / feature_count > 0.05` |
| `source_dataset_version` | `:62` | null/empty |

Because the filter is `status='completed'`, a FAIL-verdict run that still lands a `completed` ledger row (§1.5) **is** what `enrich_ravines` reads — the field-level halts above are the only protection. Any byte-level drift in these seven fields at commit 7 halts the chain (plan D-6).

### 1.4 stdout contract

`PIPELINE_SUMMARY:<json>` (one line per `emitSummary`; `run-chain.js:657-664` parses the **last** match) · `PIPELINE_META:<json>` (`pipeline.js:425`; `reads = {"ckan:ravine-natural-feature-protection-area-wgs84": []}`, `writes = {ravines: [source_id, geom, source_dataset_version, created_at, updated_at]}`, `external = ['CKAN']` — `:576-580`) · JSON log lines from `pipeline.log.*` (`:292`, `:433`, `:494`) · the SDK banner `[load-ravines] completed in <n>s` (`pipeline.js:477`). Every terminal except lock contention emits exactly one summary + one meta.

### 1.5 Exit codes and the 10 terminals

`pipeline.run` (`pipeline.js:463-488`) **awaits `fn(pool)` and discards the return value**; it only throws (→ non-zero exit via the SDK's fatal handler) on an uncaught exception. Every terminal below `return`s, so **every terminal exits 0**, including the four `{failed: true}` ones. The FAIL is visible only as the `audit_table.verdict`, which `run-chain.js:670-672` records per step and `:838` folds into chain status `completed_with_errors` — **no halt, no non-zero exit** (Integration seat finding (b); plan D-8). The step's own `pipeline_runs` row (written by `run-chain`) reads `completed`. → **LR-D3** (PIN at commit 7: every check `blocking: false`).

| T | Terminal | Anchor | Audit row | `records_total/new/updated` | Return | Exit |
|---|---|---|---|---|---|---|
| T1 | HEAD 4xx/5xx/timeout | `:301-308` | `ravine_head_error` FAIL | null/null/null | `{failed:true}` | 0 |
| T2 | tier-1 skip (validator equality) | `:318-335` | `ravine_load_skipped` INFO | null/null/null | `{skipped:true}` | 0 |
| T3 | download/unzip/scan/parse failure | `:364-371` | `ravine_acquisition_error` FAIL | null/null/null | `{failed:true}` | 0 |
| T4 | tier-2 skip (content hash) | `:377-391` | `ravine_load_skipped` INFO | null/null/null | `{skipped:true}` | 0 |
| T5 | count drift > 0.5, no override | `:405-415` | `ravine_count_drift_pct` FAIL | n/0/0 | `{failed:true}` | 0 |
| T6 | invalid geometry > 0.05 | `:447-454` | `ravine_geometry_skipped_pct` FAIL | n/0/0 | `{failed:true}` | 0 |
| T7 | success | `:543-553` | full set, verdict PASS/WARN | n/ins/upd | `{ok:true}` | 0 |
| T8 | mass delete > 0.5, no override (writes already committed) | `:512-514`, `:553` | `ravine_mass_delete_pct` FAIL | n/ins/upd | `{failed:true}` | 0 |
| T9 | mass delete > 0.5 with `RAVINE_ACCEPT_MASS_DELETE=1` | `:553` | same FAIL row + override-present WARN | n/ins/upd | `{ok:true}` | 0 |
| T10 | advisory-lock contention | `:556` | **none from the step** (SDK bare SKIP) | — | `undefined` | 0 |

(Count drift **with** override `:408` is not a terminal — it continues to T6–T9 with the FAIL row retained.) Uncaught throws are possible only outside the guarded regions: `loadMarketplaceConfigs` `:272`, `getDbTimestamp` `:276`, `pool.query(VALIDATION_SQL)` `:422`, `withTransaction` `:466` → SDK fatal → exit ≠ 0 and, in-chain, `failedStep` → chain `failed`.

### 1.6 Network fan-out

2 call sites, **2 requests** per load path, 1 host (`CKAN_DOWNLOAD_URL` `:42-43`): HEAD `:191` (always) + GET `:207` (only past tier-1). Both `AbortController`-timed at `ravineDownloadTimeoutMs` (60000 default), `redirect: 'follow'`. Skip path = 1 request.

### 1.7 Boundary freeze — tables touched (machine-readable, Appendix H row counts)

Row counts measured this session (`SELECT COUNT(*)` on `127.0.0.1:54322/postgres`, 2026-08-25).

| Table | Rows | Access | Statements |
|---|---|---|---|
| `ravines` | 854 | write (domain; class B) | UPSERT `:478-486` · scoped DELETE `:496` — one transaction `:466-499` |
| `pipeline_runs` | 8 | read (prior-run baseline `:290` via `source-version.js readPriorRunMeta`; count is `WHERE pipeline = 'sources:load_ravines'` — all `completed`, last 2026-07-08T13:55:44Z) | SELECT only; the row is written by `run-chain.js`, never by the step |
| `logic_variables` | 422 | read (0 `%ravine%` keys) | via `loadMarketplaceConfigs(pool, 'source-ravines')` `:272` — every `ConfigSchema` key falls to its Zod default |

---

## 2. PH-3 — Intent ledger (commit 2 → G3)

### 2.1 G1 archaeology (recomputed)

```
$ git log --oneline -- scripts/load-ravines.js | wc -l                 → 2     (--follow also 2; no rename)
$ git log --pretty=%s -- scripts/load-ravines.js | grep -c "^fix("     → 0     (fix density 0/2 = 0%)
$ git log --pretty=%B -- scripts/load-ravines.js | grep -ci "^Severity:" → 2   (fence density 2)
  fences: 1ceebd17 feat(59_source_ravines) Severity HIGH · 0b230472 feat(43_chain_sources) Severity HIGH
  file sizes: 1ceebd17 → 570 lines · 0b230472 → 605 lines (+93/−58 per --stat)
```
**G1 = 2 commits · 0 fix · 0% fix density · fence density 2 — identical to the plan.** 20% change-coupling: **NOT computed** — no batch artifact or generator exists (plan U-2, inherited from pilot 1).

### 2.2 G2 structure — `ASSESSMENT-INCOMPLETE`

Recorded per Spec 123 §6.2 clause 3. No churn×complexity instrument exists:
```
$ ls scripts/analysis | grep -i "churn\|complex\|risk"   → (nothing; exit 1)
$ ls scripts/analysis | wc -l                            → 31 files, none a structure/quadrant tool
```
Not scored. With 2 commits the churn axis is degenerate anyway; the complexity axis (`main` `:271-557` = 287 lines, 10 exits) is the only signal, and it is not plotted.

### 2.3 The two fences — evidence and PROPOSED dispositions (AWAITING OPERATOR ADJUDICATION §7.1)

Discoverer: this agent pass (Claude, commit 2). Adjudicator: **operator — pending**. Vocabulary (Spec 120 §14.3): `preserved-in-runner | preserved-in-validator | preserved-in-compute | encoded-as-descriptor-field | encoded-as-deviation | knowingly-retired`; per Spec 122 §1.2a P1/P5 the preference order is descriptor data > declared check > shape rule > new box, and `preserved-in-compute` is only legal with the rule declared.

#### F-1 — `1ceebd17` `feat(59_source_ravines)` — Severity **HIGH**

`git show --stat`: 19 files, +1123/−9; `scripts/load-ravines.js` +570 (file creation). Footer: `Severity: HIGH (L7c mass-delete abort was non-functional pre-review; fixed)` · `Lesson-routing: L7c override gating locked by infra test (acceptMassDelete gate assertion)` · `Deferred: #409, #410, #411`.
**Construct:** the L7c mass-delete terminal — `massDeleteCheckPassed` `:511-514` + `return (massDeleteCheckPassed || acceptMassDelete) ? {ok:true} : {failed:true}` `:553` (in `1ceebd17` at `:476-478`, `:518`), with the rule *override never suppresses the FAIL row* `:514`. Textual lock: `load-ravines.infra.test.ts:88` `'L7c mass-delete without RAVINE_ACCEPT_MASS_DELETE terminates the run as failed (acceptMassDelete gates the outcome)'` + `:81` (override keeps the row FAIL).
**Reversion patch (what the both-directions lock must catch):** `return { ok: true };` at `:553` (drop the gate) — the FAIL row survives, the run reads `ok`, and `enrich_ravines` is protected only by its own `:50` read of `mass_delete_check_passed`.
**PROPOSED disposition:** `encoded-as-descriptor-field` + `preserved-in-validator` — the threshold becomes check `ravine_mass_delete_pct` with `limit_from_config: load_ravines_mass_delete_fail_pct` (A-4), severity FAIL, `blocking: false` at commit 7 (pins the exit-0 shape, LR-D3), and the override becomes `override.accept_anomaly: [{env: RAVINE_ACCEPT_MASS_DELETE, check_id: ravine_mass_delete_pct, why}]` (A-5) whose semantics — *proceed, never suppress the row* — are structural in the library. The `mass_delete_check_passed` field stays in `emits[]` byte-identical for `enrich-ravines.js:50`. **Nothing preserved-in-compute.**

#### F-2 — `0b230472` `feat(43_chain_sources)` Phase B B1 — Severity **HIGH**

`git show --stat`: 6 files, +770/−83; `scripts/load-ravines.js` +93/−58. Footer: `Severity: HIGH` · `Lesson-routing: test:src/tests/source-version.logic.test.ts + spec:43_chain_sources` · body: *"md5 pinned throughout — the hash is compared against existing content_hash baselines"*; *"Hashing is STREAMED per D3 s9.5: load-ravines … stop buffering the whole download (`Buffer.from(await res.arrayBuffer())`)"*.
**Constructs (three):** (i) tier-2 content-hash gate `contentHashDecision` `:354` + tier-2 skip terminal `:377-391` re-emitting prior meta through `buildSkipReEmitMeta` (DS4 completed row); (ii) streamed hash-through-to-disk `:209-215` (`hashThrough`, md5 pinned); (iii) tier-1 delegated to `sourceVersion.skipCheckDecision` `:168-173` with `STYLE_VALIDATOR_EQUALITY, contentHashInNoValidatorsBail: false`. Textual locks: `source-version.logic.test.ts:231-247` (two adoption-locks: `contentHashDecision(` present, no `arrayBuffer()`/`readFileSync`, `hashThrough|streamFileHash`; tier-2 branch uses `buildSkipReEmitMeta(`) + `:45-51` `LOADER_SOURCES`.
**Reversion patch:** (i) `tier2 = { skip: false, reason: null }` unconditionally (gate dead — every changed-metadata run re-parses and re-upserts 854 rows; 0/0/0 by `IS DISTINCT FROM`, so only the differential's table hash + `skipped_reason` reveal it); (ii) `const buf = Buffer.from(await res.arrayBuffer()); hash.update(buf)` (memory regression, byte-identical outputs — **only a source/shape lock can catch it**).
**PROPOSED disposition:** (i) `encoded-as-descriptor-field` — `staleness.trigger[]` = `[{signal: source_validator, position: pre_acquisition}, {signal: content_hash, position: post_acquisition}]` executed by the library (LG-3), with `ravine_load_skipped` as a declared INFO check so the reason is an audit row every skip; `preserved-in-runner` for `buildSkipReEmitMeta` (DS4 completed-row contract). (ii) `preserved-in-runner` — `ctx.acquire` (A-2) owns streaming + md5; the md5 pin becomes descriptor data (`inputs.reads.externals[].hash: "md5"` or `staleness.trigger[].hash`) so the compatibility constraint is visible, and the "no whole-buffer" rule re-homes from the source-text adoption-lock to a shape rule on `scripts/lib/step/acquire.js`. (iii) `encoded-as-descriptor-field` — the two style options are `staleness` fields. **Nothing preserved-in-compute.**

### 2.4 Strand / cleanup constructs and constants with no recovered why

| Construct | Origin | Evidence | Proposed handling |
|---|---|---|---|
| `fs.rmSync(tmpRoot, {recursive, force})` in `finally` `:372-373` | `1ceebd17` (`git log -S rmSync` → 1ceebd17 only) | locked textually by `load-ravines.infra.test.ts:114` (*"temp cleanup"*); a leaked temp dir per run is a disk defect | `preserved-in-runner` — `ctx.acquire` must own the temp root and clean it in its own `finally`; the lock re-homes to the acquire seam (G4d row, not a fence: no `Severity:` footer names it, but load-bearing) |
| the 3 resource `finally`s `:194` `:216` (clearTimeout) `:229` (zip.close) | `1ceebd17` | resource hygiene | `preserved-in-runner` (acquire seam) |
| `String(runAt)` version fallback `:459` | `1ceebd17` (`git log -S`) — **INTENT-UNKNOWN** (commit body silent; unreachable in practice, see LR-D4) | contentHash is always a 32-char md5 on the write path (`downloadZip` cannot return null) | `knowingly-retired` candidate — pending operator; if retired, `source_dataset_version` = content hash, full stop |
| `'sha1'` of `last-modified` fallback `:459` | `1ceebd17` — INTENT-UNKNOWN (same chain) | same | same |
| `LICENSE_URL` row `:41`, `:280` | `1ceebd17` — INTENT-UNKNOWN in body; Spec 59 §9 lists `dataset_source_license` | a §9 audit row | `encoded-as-descriptor-field` (INFO check or `inputs.reads.externals[].license`) |
| `365.25` `:159`, `:316` · `86400000` `:153` · `round3` `:583` · `4326` `:475` · `3` `:67` · `-4` `:244` | `1ceebd17` — structural (plan S3–S7, S10) | commented at `:159`; API/unit constants | `preserved-in-compute` **with** the value stated in `notes.json`/`limitations` (P5) — `4326` → `guards.srid` |
| the six `ConfigSchema` defaults `:47-52` | `1ceebd17` (`git log -S 0.05/60000` → 1ceebd17) | 0 registered (P4 violation, #421) | `config[]` ×6 (plan T1–T6) — **LR-D8** |
| `PIPELINE_NAME = 'sources:load_ravines'` `:40` | `1ceebd17` (#409 correction of Spec 59 L18) | comment `:37-39` | `identity.name` + `notes.json` |

All fence constructs have a recovered why; the two INTENT-UNKNOWN constants are the `:459` fallback chain and are proposed for retirement — **G3 is claimable once the operator adjudicates §2.3/§2.5.**

### 2.5 Intent Ledger (Spec 120 §14.3 — machine-readable; G3)

Discoverer ≠ adjudicator on every row (§7.1). Locks land in `src/tests/steps/load_ravines/violations.test.ts` (G4d, both directions, commit 6).

| Construct | Origin | Discovered by | Disposition | Adjudicated by | Where it lands |
|---|---|---|---|---|---|
| L7c mass-delete terminal + "override never suppresses FAIL" (`:511-514`, `:553`) | fence `1ceebd17` feat(59) HIGH | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` + `preserved-in-validator` — check `ravine_mass_delete_pct` (`limit_from_config`, A-4) + `override.accept_anomaly[]` (A-5); `blocking:false` at commit 7 | operator (2026-08-25, §7.1) | descriptor `checks[]` + `override` |
| Tier-2 content-hash gate + DS4 completed-row re-emit (`:354`, `:377-391`) | fence `0b230472` feat(43) HIGH | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` (`staleness.trigger[]` ×2) + `preserved-in-runner` (`buildSkipReEmitMeta`) + INFO check `ravine_load_skipped` | operator (2026-08-25, §7.1) | descriptor `staleness` + library LG-3 |
| Streamed md5 hash-through-to-disk, never `arrayBuffer()` (`:209-215`) | fence `0b230472` feat(43) HIGH | agent pass, commit 2 (Claude) | `preserved-in-runner` (`ctx.acquire`, A-2) with the md5 pin as descriptor data; no-buffer rule → shape rule on `acquire.js` | operator (2026-08-25, §7.1) | library `scripts/lib/step/acquire.js` |
| Tier-1 validator-equality style, contentHash not in the no-validators bail (`:168-173`) | fence `0b230472` feat(43) HIGH | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` (`staleness` options) | operator (2026-08-25, §7.1) | descriptor `staleness` |
| Temp-root cleanup `finally` `:372-373` (+ `:194` `:216` `:229`) | `1ceebd17` (no footer; load-bearing) | agent pass, commit 2 (Claude) | `preserved-in-runner` — acquire seam owns and cleans `tmpRoot` | operator (2026-08-25, §7.1) | library acquire seam |
| Six `ConfigSchema` defaults (`:46-53`) | `1ceebd17`; deferral #421 | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` — `config[]` ×6 seeded in `logic_variables` (P4; supersedes #421) | operator (2026-08-25, §7.1) | descriptor `config` + seeds |
| `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT` / `RAVINE_ACCEPT_MASS_DELETE` env reads (`:283-284`) + `*_present` WARN rows | `1ceebd17` | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` — `override.accept_anomaly[]` (A-5), rows generated by the library | operator (2026-08-25, §7.1) | descriptor `override` |
| `String(runAt)` / sha1(last-modified) version fallbacks (`:459`) | `1ceebd17` — INTENT-UNKNOWN | agent pass, commit 2 (Claude) | `knowingly-retired` (unreachable; LR-D4) — **not retired by this pass** | operator (2026-08-25, §7.1) | LR-D4 |
| `dataset_source_license` INFO row + `LICENSE_URL` (`:41`, `:280`) | `1ceebd17` — INTENT-UNKNOWN (Spec 59 §9 row) | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` (declared INFO check, plan D-4) | operator (2026-08-25, §7.1) | descriptor `checks[]` |
| Unit/API constants `365.25` `86400000` `4326` `3` `-4` `round3` | `1ceebd17` — structural | agent pass, commit 2 (Claude) | `preserved-in-compute` with values declared in `notes.json`/`limitations` (P5 satisfied); `4326` → `guards.srid` | operator (2026-08-25, §7.1) | compute + `notes.json` |
| `PIPELINE_NAME` #409 correction + `SPEC_VERSION '1.2'` exact pin (`:36`, `:40`) | `1ceebd17` | agent pass, commit 2 (Claude) | `encoded-as-descriptor-field` — `identity.name`, `identity.spec_version`; the pin is the consumer contract (plan C-9) | operator (2026-08-25, §7.1) | descriptor `identity` |
| Per-feature `ravine_geometry_skipped_source_id` rows (`:441`) | `1ceebd17` | agent pass, commit 2 (Claude) | `knowingly-retired` at peel 8b — ids move to `observation.detail` of one row (LR-D1); stays until then | operator (2026-08-25, §7.1) | LR-D1 closes at 8b |

**Ruling (operator, 2026-08-25, §7.1 — "Approve both as proposed"):** F-1 `1ceebd17` → `encoded-as-descriptor-field` (check `ravine_mass_delete_pct`, `limit_from_config`, `blocking:false` at commit 7 — matches today's FAIL-row-no-halt; env override → `override.accept_anomaly[]`) + `preserved-in-validator`; F-2 `0b230472` → `encoded-as-descriptor-field` (`staleness.trigger[]` ×2, md5 pin as data) + `preserved-in-runner` (`acquire.js` owns streaming under a shape rule); nothing `preserved-in-compute` on either fence. INTENT-UNKNOWN constants dispositioned per the plan's P4 inventory (structural → `encoded-as-descriptor-field` where mapped to a descriptor field, else `preserved-in-compute` with the rule declared). 12 rows, 0 `unknown`, 0 awaiting; 2 fence SHAs named; discoverer ≠ adjudicator on every row.

### 2.6 Line accounting (Spec 120 §14.5 Gate 4c — 605 lines, 100%, no overlap)

Categories: `runner-owned | validator-owned | descriptor-encoded | compute | dead (proved) | duplicate`. Measured against the working tree = `HEAD:scripts/load-ravines.js` (605 lines; the file is untouched since `0b230472`). Under ruling A-1 (b), *runner-owned* = the library's acquire/validate/write/gate phases; *validator-owned* = declared checks evaluated by `verdict.js`; *compute* = the pure functions exported at `:591-605`. No range is claimed `dead (proved)` — the `:459` fallback is dead-in-practice by reading, and reading is not proof (Gate 4f). Blank lines fold into the adjacent range.

| Lines | Category | Evidence |
|---|---|---|
| 1-18 | descriptor-encoded | header: SPEC LINKs `:4-5` → `identity`; DEC-B rationale `:12-14` and acquisition description `:7-9` → `notes.json` |
| 19-34 | runner-owned | 13 `require`s: fs/os/path/crypto/stream/zip/shapefile `:20-27` → acquire seam (A-2); pipeline/config-loader/source-version/zod `:29-33` → library; `safe-math` `:31` is re-required by compute |
| 35-45 | descriptor-encoded | `ADVISORY_LOCK_ID` → `identity.lock` (kept textually, §5.4); `SPEC_VERSION` → `identity.spec_version`; `PIPELINE_NAME` → `identity.name`; `LICENSE_URL`/`CKAN_DOWNLOAD_URL`/`CKAN_INPUT_KEY` → `inputs.reads.externals` |
| 46-53 | descriptor-encoded | `ConfigSchema` ×6 → `config[]` (LR-D8) |
| 54-89 | runner-owned | `VALIDATION_SQL` — the library's validate phase under A-1 (b) (DB-executed, not a pure function); `3`/PostGIS codes stay as SQL text |
| 90-141 | compute | `computeCountDeltaPct`, `computeGeometryUpdatePct`, `computeMassDeletePct`, `shouldSkipDelete`, `validatorCounterDelta`, `dedupeBySourceId` — pure, already exported |
| 142-148 | runner-owned | `verdictCascade` → `verdict.js deriveVerdict` (row-derived; plan D-3) |
| 149-161 | compute | `ageDaysFrom`, `datasetAgeStatus` (`365.25` declared in `notes.json`) |
| 162-174 | runner-owned | `skipCheckDecision` wrapper → `staleness.trigger[0]` executed by the library (LG-3) |
| 175-181 | compute | `coerceSourceId` (LR-D5 lives here) |
| 182-266 | runner-owned | acquisition helpers `headValidators`, `downloadZip`, `extractZip`, `locateShapefile`, `parseShapefile` → `ctx.acquire` (A-2); 6 fs sites, 2 fetch, 5 throws |
| 267-274 | runner-owned | `main` open; `loadMarketplaceConfigs` + Zod parse → `config.js resolveConfig` |
| 275-281 | runner-owned | advisory lock, DB clock (`getDbTimestamp`), `auditRows`/`push` → library `ctx.clock` / `ctx.report` |
| 282-287 | descriptor-encoded | env override reads + `*_present` WARN rows → `override.accept_anomaly[]` (A-5) |
| 288-296 | runner-owned | prior-run baseline read (`readPriorRunMeta`) + the `.catch → null` swallow (LR-D2) → staleness/gating phase |
| 297-312 | runner-owned | HEAD gate T1 + `ravine_no_cache_validators` (declared WARN check) |
| 313-316 | validator-owned | `ravine_dataset_age_years` — declared check, `limit_from_config` T1 |
| 317-336 | runner-owned | tier-1 skip terminal T2 (`staleness.trigger` pre_acquisition + `buildSkipReEmitMeta`) |
| 337-374 | runner-owned | temp root, download, tier-2 decision, extract/locate/parse, T3 catch, `rmSync` cleanup → `ctx.acquire` + `staleness.trigger` post_acquisition |
| 375-392 | duplicate | tier-2 skip terminal T4 mirrors `:318-335` line-for-line (same emit shape, different `reason`); one `terminals[]` entry serves both tiers |
| 393-401 | validator-owned | `ravine_bad_objectid_count`, `ravine_null_geometry_count`, `ravine_duplicate_objectid_count`, `ravine_feature_count` — declared WARN/INFO checks (plan D-4) |
| 402-417 | validator-owned | L7 count-drift check + T5 (`limit_from_config` T2; `accept_anomaly` E1) |
| 418-442 | runner-owned | batched validation execution + counter accumulation; the per-feature WARN push `:441` (LR-D1) |
| 443-457 | validator-owned | `ravine_geometry_repaired_pct`, `ravine_geometry_collection_extracted`, L8 `ravine_geometry_skipped_pct` + T6 (`limit_from_config` T4) |
| 458-465 | runner-owned | `datasetVersion` derivation (`:459`, LR-D4) + write counters |
| 466-499 | runner-owned | the transaction: guarded UPSERT + scoped departure DELETE + F-C1 guard → `write_discipline` class B generated SQL (LG-1/LG-2) |
| 500-520 | validator-owned | L7b `ravine_geometry_update_pct`, L7c `ravine_mass_delete_pct` (fence F-1), `ravine_delete_skipped_empty_guard` — declared checks (`limit_from_config` T3/T5) |
| 521-549 | runner-owned | 18-field `ravine_load` assembly + success `emitSummary`/`emitMeta` → `emits[]` + library emit |
| 550-557 | runner-owned | T7/T8/T9 return `:553` (fence F-1 gate) + lock-contention `return;` `:556` (LR-D6) |
| 558-565 | runner-owned | `auditTable` builder → `verdict.js buildAuditTable` |
| 566-573 | runner-owned | `skeletonLoadMeta` → `emits[]` skeleton |
| 574-581 | descriptor-encoded | `emitRavineMeta` → `inputs.reads.externals` + `outputs.writes[].columns` (plan D-1/D-2: 5 columns incl. `created_at`) |
| 582-586 | compute | `round3` (display precision; declared) |
| 587-590 | runner-owned | `pipeline.run('load-ravines', main)` → `pipeline.step(...)` frozen shape |
| 591-605 | compute | 13 named exports → `scripts/lib/compute/load-ravines.js` (`VALIDATION_SQL`, `verdictCascade`, `skipCheckDecision`, `locateShapefile` re-home to the library per the rows above) |

Coverage: 35 ranges, 1-605 contiguous, sum 605, no line assigned twice.

---

## 3. PH-5 — Seam map (commit 3 → G5)

| Seam | Named seam | Anchors | Notes / planned home |
|---|---|---|---|
| **DB** | the `pool` injected by `pipeline.run` `:588` / `withAdvisoryLock` `:275`; `client` from `withTransaction` `:466` | `pool.query` `:422` · `client.query` `:478` `:496` · `readPriorRunMeta(pool)` `:290` · `loadMarketplaceConfigs(pool)` `:272` · `getDbTimestamp(pool)` `:276` | → `ctx.pool`; the transaction moves one layer up (LG-2, `execution.txn_scope: "step"`); config read → `config.js`; prior-run read → staleness phase |
| **Clock** | `pipeline.getDbTimestamp(pool)` `:276` (DB clock inside the lock, Spec 47 §R3.5); `nowMs = runAt.getTime()` `:277` | `Date.now()` 0 · `new Date(` 0 | → `ctx.clock`; `runAt` also becomes `ravines.updated_at` (§5 inventory) |
| **Network** | global `fetch` — 2 call sites, 2 requests, 1 host | HEAD `:191` · GET `:207`; both `AbortController` + `ravineDownloadTimeoutMs` | → `ctx.fetch`; `execution.network.timeout` must AGREE with `config` T6 (A-4) |
| **argv / env** | `process.env.RAVINE_ACCEPT_FEATURE_COUNT_DRIFT` `:283` · `process.env.RAVINE_ACCEPT_MASS_DELETE` `:284`; `process.argv` 0 | consumed at `:285-286`, `:408`, `:553` | → `override.accept_anomaly[]` (A-5); `override.force_run: RAVINE_FORCE_RELOAD` (A-3) is NEW — no force var exists today; manifest `supports_full:false, supports_dry_run:false` consistent |
| **FILESYSTEM** (the fifth seam — Spec 123 §6 G5 does not enumerate it) | none today — 6 sites + 2 fs-bound libraries | `createWriteStream` `:213` · `mkdirSync` `:225` · `readdirSync` `:239` · `mkdtempSync` `:339` (+ `os.tmpdir()`) · `rmSync` `:373` · `path.join` `:247` `:339` `:347` `:356`; `node-stream-zip` `:223-230`, `shapefile.open` `:252` | **Planned home: `ctx.acquire` (ruling A-2, no new category)** driven by `inputs.reads.externals[]` + `staleness.trigger[].position`; owns the temp root and its `finally` cleanup; `compute-forbidden-require` keeps `fs` out of compute |

Invocation (Spec 123 §7 note, verified): `manifest.json` declares no `chain_args` for `load_ravines`; `run-chain.js:646` `spawnStepChild` with `PIPELINE_CHAIN=sources` and no extra argv — `PIPELINE_CHAIN=sources node scripts/load-ravines.js` reproduces it exactly; the step never reads `PIPELINE_CHAIN` itself (its ledger row is `run-chain`'s).

---

## 4. PH-6 — Classification (commit 4 → G6)

### 4.1 CONTRACT — must survive conversion

| # | Behaviour | Anchor | Consumer / lock |
|---|---|---|---|
| C1 | `records_meta.ravine_load` 18 fields, `spec_version === '1.2'` exact | `:522-541`, `:36` | `enrich-ravines.js:42,47,50,56,57,62` (7 fields; §1.3) — chain HALT on drift |
| C2 | skip runs (both tiers) land a **`completed`** row re-emitting prior meta with `skipped_reason` set | `:327-331`, `:383-387` | `enrich-ravines.js:34-36` filters `status='completed'` (DS4) |
| C3 | `ravines` write shape: guarded UPSERT on `source_id` + scoped departure DELETE, one transaction, `ST_Multi`/SRID 4326, `source_dataset_version` = content hash | `:466-499`, `:459` | `enrich-ravines`, `parcels.ravine_dataset_version_when_enriched` (486,530 rows), `permits`/`coa_applications` in-ravine fields (7 columns / 3 tables, live catalog) |
| C4 | F-C1 empty-set DELETE guard; `delete_skipped_empty_guard` surfaced | `:492-494`, `:532` | `enrich-ravines.js:47` HALT |
| C5 | count-drift FAIL aborts **before** any write; L8 FAIL aborts **before** the transaction | `:405-415`, `:447-454` | Spec 59 §3.4/§3.5; no dangling state |
| C6 | override never suppresses a FAIL row; `*_present` WARN rows | `:407`, `:514`, `:285-286` | fence F-1; `load-ravines.infra.test.ts:81` |
| C7 | mass-delete FAIL terminates as failed unless `RAVINE_ACCEPT_MASS_DELETE=1` | `:553` | fence F-1; `load-ravines.infra.test.ts:88` |
| C8 | tier-1 validator-equality gate then tier-2 content-hash gate; streamed md5 | `:317`, `:354`, `:209-215` | fence F-2; `source-version.logic.test.ts:231-247` |
| C9 | `audit_table.phase = 59`, `name`, row-derived verdict, the 20 metric names + statuses | `:562-564`, §1.3 | `run-chain.js:670-672`, admin quality UI; Spec 59 §9 |
| C10 | `records_total = feature_count`, `_new = inserted`, `_updated = updated` (§11 primary entity) | `:544-546` | `run-chain` counters |
| C11 | `ravine_dataset_age_years` on every post-HEAD path (skip + failures) | `:316` | Observability F1 (commit body) |
| C12 | advisory lock 59; prior-run read by `sources:load_ravines` | `:35`, `:40`, `:275` | `pipeline-advisory-lock.infra.test.ts:35,:301`; #409 |
| C13 | temp root always removed | `:372-373` | `load-ravines.infra.test.ts:114` |
| C14 | `PIPELINE_META` reads/writes/external as emitted | `:576-580` | `run-chain.js:676-680` (declared diff D-1/D-2 at commit 7) |

### 4.2 INCIDENTAL — do not assert on

Log-line text (`:292`, `:433`, `:494`) · `pipeline.run` tag `'load-ravines'` `:588` (plan D-12) · `null` vs `0` counters on skip paths (`run-chain` normalises; plan C-11) · audit-row **order** within a run (stable but not a contract) · `records_meta` key order · the `sys_*` rows · dedupe keeps-first `:131-140` · `inserted`/`updated` computed by two `filter` passes `:487-488` · `headInfo` fallback to prior `last_modified` for the age row `:315` · `downloadValidators` preferring GET headers over HEAD headers `:349`.

### 4.3 DEFECT — pin in current form, fix after (Spec 123 §3.1)

Each candidate re-verified at its anchor this session.

- **LR-D1** `:441` — `push('ravine_geometry_skipped_source_id', f.source_id, 'WARN')` runs once per non-carried feature inside the `for (const f of kept)` loop; the audit table's row count is bounded only by `feature_count` (854 today; up to 5% = 42 rows before L8 FAILs, but a >5% run emits *all* of them before aborting at T6 — hundreds of rows). Confirmed.
- **LR-D2** `:291-294` — `readPriorRunMeta(...).catch(warn → null)`; with `prior = null`: `priorFeatureCount = null` (`:295`) so L7/L7b/L7c all return 0 (`:97`, `:103`, `:109`) and tier-1/tier-2 both see no baseline → **a transient DB error on the prior-run read silently converts every drift guard to "first run" and forces a full download + re-upsert** (0/0/0 writes by `IS DISTINCT FROM`, but a mass-delete would pass unguarded). Only a `log.warn`, no audit row. Confirmed.
- **LR-D3** FAIL verdict with exit 0 — `pipeline.run` discards `fn`'s return (`pipeline.js:475`); T1/T3/T5/T6/T8 all exit 0; `run-chain.js:838` → `completed_with_errors`, chain continues; the step's `pipeline_runs` row is `completed`, which is exactly the row `enrich-ravines.js:34-36` selects. Confirmed. **PIN** (`blocking:false` ×all at commit 7).
- **LR-D4** `:459` — `contentHash || etag || sha1(lastModified) || String(runAt)`: `downloadZip` always returns a 32-char md5, so the three fallbacks are unreachable on the only path that reaches `:459`; the last one would yield a locale-formatted `Date` string as `source_dataset_version` (not stable, not hash-like). Dead-in-practice code carrying an INTENT-UNKNOWN. Confirmed.
- **LR-D5** #411 — `coerceSourceId` `:176-180` via `safeParseIntOrNull` and `Number(r.source_id)` `:423` both lose precision above 2^53; live `max(source_id)` = 14,041,969 so no current collision. The `:423` `Map` key is the sharper edge: a >2^53 id would miss its own validation row and be counted `skipped` (`:430-434`). Confirmed, latent.
- **LR-D6** `:556` — lock contention `return;` with no step-level emit (SDK bare SKIP, no `audit_table`); mirrors AS-D9. Confirmed.
- **LR-D7** (Schema-Fidelity) — `ravines` has RLS **enabled with 0 policies**; the write path works only because `postgres` has `rolbypassrls = true`. Under any non-bypass role the UPSERT and DELETE affect 0 rows with **no error**: `inserted/updated/deleted = 0/0/0`, verdict PASS, `completed` row — indistinguishable from an unchanged source. Confirmed on the live catalog. Needs a declared `guards` precondition (role bypasses RLS **or** a policy exists) and a `write_discipline` `expected_change_ratio` check on a forced run (A-3).
- **LR-D8** `:46-53` — six declared config variables, **0** registered in `logic_variables` (422 rows, 0 `%ravine%`) or `scripts/seeds/logic_variables.json`; every knob is a Zod-default literal wearing a variable's name (P4 violation; supersedes #421). Confirmed.

### 4.4 Defect Ledger register — `LR-D1 … LR-D8`

Fleet register: `docs/reports/defect-ledger.md` (rows appended this commit).

| ID | Anchor | One-line | Status | Closes at |
|---|---|---|---|---|
| LR-D1 | `load-ravines.js:441` | unbounded per-feature `ravine_geometry_skipped_source_id` WARN rows | **CLOSED · 8b** | **peel 8b** — one row per check; ids in `observation.detail`, capped at `MAX_DETAIL_KEYS` = 50 with the exact `dropped_count` + `dropped_ids_truncated`. The retired metric is not a declared check, so `ctx.report` refuses it |
| LR-D2 | `load-ravines.js:291-294` | prior-run read failure swallowed → all drift guards + both skip tiers degrade to "first run", no audit row | **CLOSED · 8a** | **peel 8a** — the posture is DECLARED (`staleness.on_prior_run_error`: `fail_step` \| `warn_row`, absent = `fail_step`), read by `priorRunErrorPosture` and applied by `readPriorEmitWithPosture`. `load_ravines` declares `fail_step` with a why; the `warn_row` arm owes a `prior_run_read_failed` WARN row through `buildAuditTable` `extraRows`. No arm returns null quietly. Locked both directions in `src/tests/step-library.logic.test.ts` |
| LR-D3 | `load-ravines.js:308,371,415,454,553` + `pipeline.js:475` | FAIL verdict exits 0; chain `completed_with_errors`, no halt; `completed` row is what `enrich_ravines` reads | OPEN · PIN (`blocking:false`) | **DEFERRED** — promoting any check to `blocking:true` is its own peel with its own lock (plan D-8) |
| LR-D4 | `load-ravines.js:459` | unreachable `etag`/`sha1`/`String(runAt)` version fallbacks; last is an unstable Date string | OPEN · INTENT-UNKNOWN | **peel 8c** if the operator rules `knowingly-retired` (§2.5); else DEFERRED |
| LR-D5 | `load-ravines.js:176-180`, `:423` | BIGINT `source_id` > 2^53 loses precision; `:423` Map miss → silent `skipped` (#411) | OPEN · PIN | **DEFERRED** — latent (live max 14,041,969); WARN-and-skip guard as a declared check when a CKAN refresh expands ids |
| LR-D6 | `load-ravines.js:556` | lock contention → bare `return;`, no step emit | **CLOSED · 8b** | commit 7 (library SKIP emit + `self_skipped`, D-10); CONFIRMED at 8b on THIS descriptor — row-derived verdict, declared terminal, no compute, no network, no statement on `ravines` |
| LR-D7 | `ravines` (live catalog: RLS on, 0 policies; role `rolbypassrls=true`) | non-bypass role would upsert/delete 0 rows silently, PASS verdict | OPEN | **commit 7** — descriptor `guards` precondition (`rls: bypass_or_policy`) asserted by `assertDbTarget`-style pre-flight; `write_discipline.expected_change_ratio` on a forced run (A-3) makes a silent 0-row load a FAIL |
| LR-D8 | `load-ravines.js:46-53` | six tunables declared, none registered — Zod-default literals (P4; #421) | OPEN | **commit 7** — `config[]` ×6 + seeds + `GlobalConfigCard` group; `config.js` throws on an unregistered name |

### 4.5 G6 statement

Every behaviour in §1 is classified above (14 CONTRACT · 10 INCIDENTAL items · 8 DEFECT rows), and every DEFECT carries an `LR-D*` id present in `docs/reports/defect-ledger.md`. G6 is claimable at commit 4 **subject to** the §2.3/§2.5 dispositions being adjudicated by the operator (§7.1).

---

## 5. Non-determinism inventory (commit 5 → G1′; Spec 120 §14.2)

Declared BEFORE any old/new diff. Sources: `scripts/analysis/capture-step-golden.js` (`VOLATILE_KEYS` ×11, `VOLATILE_METRIC_PREFIXES` `sys_`, `VOLATILE_PATTERNS` ×7) **plus what a LOADER adds** — the harness today captures only `pipeline_runs` (`:278`); commit 5 grows it with `ravines` `count(*)` + an ordered content hash (plan D-14), and the rows below cover that table. Closed vocabulary: `must-match-exactly | normalize-then-match | excluded-with-reason`.

| Key | Disposition | Reason / how |
|---|---|---|
| `key:pipeline_runs[0].id` | `excluded-with-reason` | serial PK (`VOLATILE_KEYS`) |
| `key:pipeline_runs[0].started_at` · `key:pipeline_runs[0].completed_at` · `key:pipeline_runs[0].duration_ms` | `excluded-with-reason` | wall clock / elapsed (`VOLATILE_KEYS`). Written out in full rather than abbreviated after the first suffix: the inventory is machine-read key-by-key, and `completed_at` on its own does not declare `pipeline_runs[0].completed_at`. Observed on the STANDALONE captures only — in-chain the ledger row belongs to `run-chain`, so the step's own capture has no `pipeline_runs` rows to strip. |
| `key:id` · `run_id` · `timestamp` · `elapsed_ms` · `elapsed_s` · `generated_at` · `checked_at` · `captured_at` | `excluded-with-reason` | `VOLATILE_KEYS` (harness) |
| `row:sys_duration_ms` · `row:sys_velocity_rows_sec` | `excluded-with-reason` | `VOLATILE_METRIC_PREFIXES` `sys_` — observed on both baseline runs |
| `pattern:duration_literal` | `normalize-then-match` | `completed in 3.1s` → `<DUR>` |
| `pattern:iso_timestamp` · `pg_timestamp` · `rows_per_sec` · `run_id_literal` · `pipeline_runs_id_literal` · `pid_literal` | `normalize-then-match` | harness masks (`<TS>`, `<RATE>`, `<RUN_ID>`, `pipeline_runs <ID>`, `pid=<PID>`) |
| `table:ravines.updated_at` | `excluded-with-reason` | = `runAt` (DB clock) on every written row; a forced reload (A-3) re-stamps changed rows only (`IS DISTINCT FROM`), an unchanged source re-stamps none — excluded from the ordered content hash, but `count(*) FILTER (WHERE updated_at >= run.started_at)` is compared as `rows_changed` |
| `table:ravines.created_at` · `table:ravines.id` | `excluded-with-reason` | DB default / serial; never written by the step |
| `table:ravines.{source_id, ST_AsBinary(geom), source_dataset_version}` ordered by `source_id` | `must-match-exactly` | the domain content hash (`md5(string_agg(… ORDER BY source_id))`) — the point of write class B; 854 rows today |
| `table:ravines.count(*)` | `must-match-exactly` | 854 |
| `meta.ravine_load.source_dataset_version` · `content_hash` | `must-match-exactly` | both are the md5 of the downloaded bytes (`:459`, `:527`); stable while the source is frozen (`97b4ac7f…`). Would become `normalize-then-match` only if the `String(runAt)` fallback ever fired (LR-D4) — it cannot on the write path |
| `meta.ravine_load.last_modified` · `etag` | `must-match-exactly` | CKAN validators, frozen at `Mon, 14 Mar 2022 15:25:09 GMT`; a change here is a real upstream event, reviewed not masked |
| `meta.ravine_load.{feature_count, polygons_inserted, polygons_updated, polygons_deleted, delete_skipped_empty_guard, mass_delete_pct, invalid_geometry_repaired, invalid_geometry_skipped, geometry_collection_extracted, drift_check_passed, mass_delete_check_passed, geometry_update_pct, skipped_reason, spec_version}` | `must-match-exactly` | the 7 consumer-read fields (§1.3) plus the rest of the frozen 18 (C1) |
| `row:ravine_dataset_age_years` value | `normalize-then-match` | `floor(ageDays / 365.25)` from the DB clock — increments once a year (next: 2027-03-14); compared as an integer after masking would hide drift, so instead the capture records it and the differential tolerates ±0 within the same calendar day only |
| `summary.records_meta.audit_table.{phase, name, verdict, rows[!sys_]}` | `must-match-exactly` | C9; rows compared after the `sys_` strip, order preserved (INCIDENTAL order, but stable) |
| `exit_code` · `signal` · `verdict` · `ledger_status` | `must-match-exactly` | exit 0 on every terminal (LR-D3 pinned); `['completed']` in-chain |
| `meta.reads` · `meta.writes` · `meta.external` | `must-match-exactly` | declared diffs D-1/D-2 at commit 7 are recorded in the post capture, not normalised away |
| `stdout` (after patterns) · `stderr` | `must-match-exactly` | the 3 `log.warn` lines are INCIDENTAL but stable; a diff is reviewed |
| `env:RAVINE_FORCE_RELOAD` (A-3) | `excluded-with-reason` | capture axis, not output: the golden is captured ×2 per invocation (skip terminal, forced load); the forced capture must show `rows_changed = 0` on a second forced run (`idempotent_rerun: zero_writes`) |

---

## 6. Commit ledger (§12.16 — every commit names its done-test)

| Commit | Hash | Content | Done-test |
|---|---|---|---|
| 0 | `e94014f9` | Pilot 2 plan (measured gates 3/17, 6 unregistered tunables, 10 library gaps; rulings A-1..A-5) | plan re-read; every executable claim re-executed in this report (§1.1 "no plan number failed to re-measure") |
| 1 | pending (this commit) | PH-0 boundary freeze re-derived at 605 lines (§1) — 10 terminals, 20 metrics, `ravines` UPSERT/DELETE columns, 18-field `ravine_load`, 7 consumer-read fields, exit-0 shape, RLS finding | `#6a` boundary-freeze table has `ravines` with an integer row count (854) and `pipeline_runs`/`logic_variables` rows |
| 2 | pending (this commit) | PH-3 Intent Ledger PROPOSED (§2.3, §2.5 — awaiting operator §7.1), line accounting (§2.6), G1 recomputed, G2 `ASSESSMENT-INCOMPLETE` | `#152` `#153` `#162` `#155` `#157` `#6b` in `src/tests/steps/load_ravines/violations.test.ts` (commit 6); `#162` must FAIL until the `adjudicated by` column names a human |
| 3 | pending (this commit) | PH-5 seam map (§3) incl. the filesystem seam → `ctx.acquire` | `#6a` + descriptor `execution.network.timeout` agrees with `config` T6 (A-4) |
| 4 | pending (this commit) | PH-6 classification + LR-D1..D8 appended to `defect-ledger.md` (§4) | `grep -c "^| LR-D" docs/reports/defect-ledger.md` = 8 |
| 5 | pending | golden master ×2 invocations × 2 terminals (skip + forced) with `ravines` table-state capture (`capture-step-golden.js` growth, row-ceiling gated) | `node scripts/analysis/capture-step-golden.js --self-test`; `--compare` exit 0 on a repeat capture; `#150` two OLD captures normalise identical under §5 |
| 6 | pending | PH-7 test design — 44 55-A + 5 partials + 2 both-directions fence locks (F-1 `:553` gate; F-2 tier-2 gate + no-buffer), proven red | `npx vitest run src/tests/steps/load_ravines/` → RED set recorded |
| 7 | pending | descriptor + compute verbatim + library growth LG-1…LG-6 + 6 seeds + `GlobalConfigCard` group + 4 test files re-homed; frozen §5.1 shape; all checks `blocking:false` | `#156` `#165`; `step-conformance.infra.test.ts` green with 2 converted steps; differential zero-diff vs commit-5 goldens after §5 normalisation; `records_meta.ravine_load` byte-identical field-by-field |
| 8a | landed | peel: gating — `staleness.on_prior_run_error` posture (LR-D2 CLOSED) + the `force_run` arm proven both directions by a library test | `#154` + `src/tests/step-library.logic.test.ts` (force arm at BOTH tiers; posture both arms) + differential green on the skip terminal |
| 8b | landed | peel: verdict/audit — LR-D1 CLOSED (one capped row, exact count) + LR-D6 CONFIRMED CLOSED on the write-class step | `#154` + the LR-D1 four-way lock in `violations.test.ts` + the LR-D6 contention lock in `step-library.logic.test.ts` |
| 8c | pending | peel: thresholds/checks (six `ctx.config` reads + `pct <=` limits, LG-5; LR-D4 per ruling) | `#154` + `#165` must-fail fixtures per declared check |
| 9 | pending | `converted.json` +1 (→ 2/62); post goldens (skip + forced) | `#158`; `node scripts/hooks/check-step-shape.mjs` exit 0 with 2 enforced; differential green on both terminals |
