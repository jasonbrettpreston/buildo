# Pilot 1 assessment — `assert_schema` (PH-0 · PH-3 · PH-5 · PH-6)

**Target:** `scripts/quality/assert-schema.js` — **606 lines** (`wc -l`), lock 102, HEAD `8b857169`, last touched by `f32b1485` (2026-08-24, P3 strand window).
**Plan:** `.cursor/active_task.md` (Pilot 1, folds A+B). **Governing:** Spec 123 §6 / §6.1 / §6.2 / §7 / §7.1; Spec 122 §5.1.
**Supersedes:** `docs/reports/2026-08-23-assess-step01-assert-schema.md` (written at 571 lines; its *classifications* are inherited, its *numbers* are not — every figure below was re-measured this session per the operator ruling).
**Status:** ASSESSMENT ONLY. No `src/`/`scripts/` code changed. PH-3 dispositions are **ADJUDICATED (operator, 2026-08-25)** under §7.1 — see §2.3 for the ruling and §2.5 for the Intent Ledger (commit 2 → G3).

> Every count carries the command that produced it. Where the stale report's number differed, the difference is called out inline (`⚠ stale said …`).

---

## 1. PH-0 — Boundary freeze (commit 1 → G0)

**Rule:** nothing outside this section is behaviour.

### 1.1 Grep transcript (the evidence)

```
$ wc -l scripts/quality/assert-schema.js                       → 606
$ grep -n "INSERT INTO"        → 1   :277
$ grep -n "UPDATE pipeline_runs" → 1 :560
$ grep -n "DELETE FROM"        → 0
$ grep -n "emitSummary"        → 1   :571
$ grep -n "emitMeta"           → 1   :572   (args span :572-575)
$ grep -n "throw new Error"    → 8   :120 :124 :208 :213 :226 :235 :253 :585
$ grep -n "throw "             → 10  (8 above + :584 comment text + :591 rethrow)
$ grep -n "fetch("             → 5   :118 :162 :205 :224 :251
$ grep -n "Date.now()"         → 3   :263 :523 :598        ⚠ stale said ×2
$ grep -n "new Date("          → 0
$ grep -n "process.env"        → 1   :112 (PIPELINE_CHAIN)
$ grep -n "process.argv"       → 0
$ grep -n "process.exit"       → 0
$ grep -n "module.exports"     → 0
$ grep -n "try {"              → 13 lines, 12 real try blocks (:267 is a comment)
                                  :275 :290 :301 :330 :351 :364 :375 :386 :393 :403 :412 :444
                                  ⚠ stale said 10; plan's "13" counts the comment
$ grep -n "\.catch("           → 1   :567
$ grep -n "finally"            → 2 lines, 1 real block :592 (:268 is a comment)
$ grep -n "return;"            → 1   :605
$ grep -n "allPassed = false"  → 18
$ grep -n "metric:"            → 12  (permits 5 :485-489 · coa 5 :506-512 · sources 2 :539-540)
$ grep -n "name:"              → 3   :494 :517 :545  (all 'Schema Validation')
$ grep -n "phase"              → 3   :493 :516 :544  (all `phase: 1`)
$ grep -n "pipeline.run("      → 1   :259  ('assert-schema' — hyphen, not the slug)
$ grep -n "withAdvisoryLock"   → :260 call, :603 close
$ grep -n "require("           → 3   :19 pipeline · :20 address-points-csv-drift · :21 ledger-window
$ grep -n "SPEC LINK"          → 3   :3 (41) :4 (42) :5 (43)
```

### 1.2 Tables and columns written

| Site | Statement | Columns | Guard |
|---|---|---|---|
| `:277-279` | `INSERT INTO pipeline_runs (pipeline, started_at, status) VALUES ($1, NOW(), 'running') RETURNING id` | `pipeline`=`'assert_schema'` (`SLUG` `:106`), `started_at`, `status` | **only `if (!CHAIN_ID)`** (`:274`); failure is caught `:282-284` and `log.warn`ed, `runId` stays `null` |
| `:560-564` | `UPDATE pipeline_runs SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3, records_meta = $5 WHERE id = $4` | `completed_at`, `status` (`'completed'`\|`'failed'` `:524`), `duration_ms`, `error_message` (joined `errors` or `null` `:525`), `records_meta` (the `meta` JSON `:526-556`) | `if (runId)` (`:558`); success sets `ledgerFinalized = true` `:566`; failure `.catch` → `log.warn` `:567` |
| via library `scripts/lib/ledger-window.js:103-105` (called from `finally` `:594-601`) | `UPDATE pipeline_runs SET completed_at = NOW(), status = 'failed', duration_ms = $2, error_message = $3 WHERE id = $1 AND status = 'running'` | `completed_at`, `status`=`'failed'`, `duration_ms`, `error_message` (`interrupted: …`, capped) | only when `runId` non-null **and** `ledgerFinalized === false` (`shouldFinalizeStranded`); the `AND status='running'` predicate makes it a no-op on an already-finalized row |

**Domain tables written: NONE.** `pipeline_runs` is the only table, and only on the standalone path. In-chain, `run-chain.js` owns the row (`:713-716`, `:732-735` COALESCE finalize).
**DB reads: NONE.** All inputs are network.

### 1.3 Audit rows and `records_meta`, per chain

`records_meta` (`:526-556`) = `{ checks_passed, checks_failed, errors?, audit_table? }`:

| Key | Value | Note |
|---|---|---|
| `checks_passed` | `errors.length === 0 ? 'all' : undefined` (`:527`) | string-or-absent, never a count → **AS-D7** |
| `checks_failed` | `errors.length` (`:528`) | count of error strings, not of checks |
| `errors` | `errors[]` or `undefined` (`:529`) | |
| `audit_table` | chain-selected by the IIFE `:531-555` | three mutually exclusive shapes |

| Chain (`PIPELINE_CHAIN`) | `audit_table` | Rows (`metric` · `threshold` · `status` derivation) |
|---|---|---|
| `permits` | `{phase:1, name:'Schema Validation', verdict, rows}` (`:492-497`) | `permit_columns_checked` (11, `null`, INFO) · `schema_mismatch_count` (`== 0`) · `parcels_schema_mismatch_count` (`== 0`) · `parcels_other_errors` (`== 0`) · `api_errors` (`== 0`) — `:485-489`; verdict row-derived `:491` |
| `coa` | same shape (`:515-520`) | `coa_columns_checked` (11) · `schema_mismatch_count` · `parcels_schema_mismatch_count` · `parcels_other_errors` · `api_errors` — `:506-512`; verdict row-derived `:514` |
| `sources` | same shape (`:543-548`) | `sources_checked` (**literal 18**, `null`, INFO `:539`) · `schema_errors` (`== 0` `:540`); verdict **`sourceErrors.length > 0`** `:546` — NOT row-derived → **AS-D1** |
| standalone (unset) | permits table if present, else coa, else `{}` (`:551-554`) | all 9 checks run (`:297-299`), but only the permits table is emitted |

⚠ In permits/coa the `parcels_*` rows (`:487-488`, `:510-511`) are emitted **even though the parcels check does not execute** (gated by `runSourceChecks` `:328`) — they are constant `0/PASS` rows there. Fold B's declared normalisation.

### 1.4 stdout contract

| Line | Producer | Shape |
|---|---|---|
| `PIPELINE_SUMMARY:` | `:571` → `pipeline.js:321-411` | `{records_total: 0, records_new: null, records_updated: null, records_meta}`; `emitSummary` forces an `audit_table` (warns + injects `{phase:0,name:'Auto',verdict:'UNKNOWN',rows:[]}` if absent — reachable on the standalone path when neither table exists) and applies an escalate-only row-derived verdict recompute (`pipeline.js:404-409`) |
| `PIPELINE_META:` | `:572-575` | reads `{"CKAN API":["metadata"]}` · writes `{"pipeline_runs":["checks_passed","checks_failed"]}` — bookkeeping declared as a data write |
| lock-held | `pipeline.js:932-937` (only if `skipEmit`) | `{records_total:0, records_new:0, records_updated:0, records_meta:{skipped:true, reason:'advisory_lock_held_elsewhere'}}` — then the step `return;`s at `:605` with **no emit of its own** → **AS-D9** |
| console | `:261` banner, `:577` `=== Schema Validation: STATUS (Ns) ===`, per-check `OK:`/`FAIL:`/`WARN:` lines | INCIDENTAL |

### 1.5 Exit codes and `throw` sites

| Site | Throw | Caught by | Reaches process? |
|---|---|---|---|
| `:120` `:124` | CKAN fetch non-OK / missing `fields` (`fetchFieldNames`) | permits/coa: outer `:457` → `allPassed=false`; zoning: `:450` | no |
| `:208` `:213` | CSV fetch non-OK / empty header | `:344` (address points) or `:357` (parcels) | no |
| `:226` `:235` | GeoJSON fetch non-OK / no properties | `:422` | no |
| `:253` | HEAD non-OK | `:366` `:377` `:388` `:395` `:405` | no |
| `:585` | circuit breaker `if (!allPassed) throw` | window catch `:587` → `windowError`, **rethrown** `:591` | **yes** |
| `:591` | rethrow | `withAdvisoryLock` ROLLBACK + rethrow → `pipeline.run` `log.error` + rethrow (`pipeline.js:478-480`) | **yes** |

**Exit code:** 0 on `allPassed`; on the `:585` throw `pipeline.run` rethrows and **does not call `process.exit`** (0 hits; no `unhandledRejection` handler in `pipeline.js`) — the process exits **1** via Node's default unhandled-rejection behaviour. Header `:16-17` documents the same contract. Note `validateTypeSample` `:163` returns `true` on a non-OK sample fetch — that path is an omit, not a fail.

**Ordering fence (from `f32b1485`, comments `:581-584`):** the `:585` throw fires **after** the finalize UPDATE, so the row is already `'failed'` with real errors and the window sees `ledgerFinalized=true`. *"Do not move the throw up."*

### 1.6 Network fan-out (recount)

5 call sites → **21 requests** in a standalone run, one host (`CKAN_BASE` `:23`; all 8 URLs `:47-65` share it):
permits = `fetchFieldNames` `:304` + `validateTypeSample` `:309` = **2**; coa = `fetchFieldNames` `:317` = **1**; sources = 2 CSV (`:331` `:352`) + **5** HEAD (`:365` `:376` `:387` `:394` `:404`) + 1 GeoJSON (`:413`) + 10 zoning (`:445` ×10) = **18**. Total 2+1+18 = **21**. ⚠ stale said "CKAN ×2 · HEADs ×6" — the partition was wrong (CKAN datastore calls are 3 incl. the sample; HEADs are 5), the total 21 was right. No timeout, no retry, no `AbortSignal` (grep 0) → **AS-D8**.

### 1.7 Boundary freeze — tables touched (machine-readable, Appendix H row counts)

`pipeline_runs` is the only table (§1.2); the descriptor's `inputs.reads.tables` is `[]` (§1.2 "DB reads: NONE"). Row count measured this session: `SELECT COUNT(*) FROM pipeline_runs` on the local dev DB (`DATABASE_URL`, 2026-08-25).

| Table | Rows | Access | Statements |
|---|---|---|---|
| `pipeline_runs` | 1644 | write (bookkeeping only; standalone path) | INSERT `:277` · UPDATE `:560` · strand UPDATE via `ledger-window.js:103` |

---

## 2. PH-3 — Intent ledger (commit 2 → G3)

### 2.1 G1 archaeology (recomputed)

```
$ git log --oneline -- scripts/quality/assert-schema.js | wc -l          → 37
$ git log --pretty=%s -- … | grep -c "^fix("                              → 25   (fix density 25/37 = 67.6%)
$ git log --pretty=%B -- … | grep -ci "^Severity:"                       → 4    (fence density)
  fences: 646ea5a7 · 58914fa8 · 1ceebd17 · f6047e89
```
⚠ stale said 24/36 = 66.7% (pre-`f32b1485`). **20% change-coupling: NOT computed** — no batch artifact or generator exists.

### 2.2 G2 structure — `ASSESSMENT-INCOMPLETE`

Recorded per Spec 123 §6.2 clause 3. No churn×complexity instrument exists in the repo:
```
$ ls scripts/analysis | grep -i "churn\|archae\|risk\|complex"   → (empty, rc=1)
$ ls scripts/analysis   → _rc_q.js audit-scope-accuracy.js backfill-admin-watchlist.js capture-timeline-fixtures.mjs
  coa-structure-type-precision-audit.js cost-estimates-sanity-audit.js massing-coverage-analysis.js
  p14-trade-attachment-evaluation.js parcel-field-dump.js parcel-sanity-audit.js phase3-accessory-validation.sql
  reconcile-migration-checksums.js scope-report-queries.js wf1-*.js wf2-*.js wf3-*.js  (30 files, none structural)
```
The top-right quadrant cannot be named; G3 is nonetheless **mandatory** because fence density 4 > 0 (§7 row 2). Instrument is an S6b item (plan decision 2).

### 2.3 The four fences — evidence and ADJUDICATED dispositions

> **ADJUDICATED (operator, 2026-08-25) — §7.1.** The agent pass (commit 4 `d8a4d1ad`) discovered and proposed; the operator dispositioned. Each row gives (a) what the fence guards, (b) the construct(s) in the current file that encode it, (c) the reversion patch that a both-directions lock (G4d, `src/tests/steps/assert_schema/violations.test.ts`) applies to go red, (d) the ADJUDICATED disposition in the Spec 120 §14.3 closed vocabulary.
>
> **Operator ruling §7.1 (verbatim policy):** *"nothing is hidden — standardize wherever possible — always observable and intelligible."* Applied: 3 of the 4 fences become **DECLARED DATA** in the descriptor — `58914fa8` zoning 3 required-sets → `checks[].zoning_resource_columns.expect.resources`; `1ceebd17` ravine and `f6047e89` centreline → `inputs.reads.externals` + subjects of check `source_archives_reachable`. The coordinate OR-contract `646ea5a7` becomes a NAMED audit-emitting check `address_points_has_coordinate_source` — its logic in compute, its rule declared in `checks[].why` + `limitations`. Each still gets a both-directions lock (G4d). The attribution regex tokens (`:536`) stay for now and retire at peel 8b (replacement = check-id attribution, more observable). The strand window `f32b1485` → library (`scripts/lib/step/index.js` `finally`) per Fold A.

A note on what the footers cover: for `58914fa8`, `1ceebd17`, `f6047e89` the `Severity:` line describes defects in the *sibling loader* (DataStore rewrite, L7c mass-delete, lock collision) — the `assert-schema.js` hunk in each is chain wiring. They are fences by CLAUDE.md's definition (a `Severity:` footer commit that touched this file); the intent recovered below is the intent of the hunk, not of the loader fix.

#### G-F1 — `646ea5a7` `fix(54_source_address_points)` — Severity **HIGH (chain-blocking)**
- **Guards:** the sources chain must not HARD-FAIL on a column the loader does not consume. The flat `LATITUDE`/`LONGITUDE`/`geometry` requirement (added 2026-05-23) was *dead on arrival* — the live CSV ships `geometry`, not lat/lng. Replaced by an OR-contract: coordinate source present = `geometry` OR (`LATITUDE`+`LONGITUDE`), via a helper shared with the loader's WARN drift check. `git show --stat`: 4 files, `assert-schema.js` 27 lines (+17/−10).
- **Constructs today:** import `:20`; rationale comment `:76-83`; `EXPECTED_ADDRESS_POINT_COLUMNS` `:84-96` **without** any coordinate column; the check block `:336-343` (`if (!hasCoordinateSource(new Set(apHeaders)))` → `allPassed=false` + `'Address Points: no coordinate source (geometry or LATITUDE+LONGITUDE)'`).
- **Reversion patch (lock must go red on either):** (i) append `'LATITUDE','LONGITUDE','geometry'` to `EXPECTED_ADDRESS_POINT_COLUMNS`; (ii) delete `:339-343`. Fixture: headers = 11 expected + `geometry` ⇒ must PASS; headers = 11 + nothing ⇒ must FAIL; headers = 11 + `LATITUDE`+`LONGITUDE` ⇒ must PASS.
- **ADJUDICATED (operator, 2026-08-25): `preserved-in-compute`** — with the declared-check note: the helper already lives in `scripts/lib/address-points-csv-drift.js` (extracted by this very commit "so it can be unit-tested"); compute keeps the call as the NAMED, audit-emitting check `address_points_has_coordinate_source` (one audit row per run, never silent); the OR-rule is declared in the descriptor at `checks[].why` + `limitations`, and the expected-column list stays coordinate-free in the descriptor `expect`. Logic in compute, rule observable in data.

#### G-F2 — `58914fa8` `feat(58_source_zoning_bylaw)` — Severity **CRITICAL+HIGH** (loader-side)
- **Guards:** the 10 Zoning By-law layers are ingested from the CKAN **DataStore** (the `_id` upsert key exists only in `datastore_search`), so pre-flight must assert each resource is reachable *as a DataStore resource* and carries `_id` + `geometry` (+ the per-layer regulatory columns the enricher reads). `git show --stat`: 22 files; `assert-schema.js` 33 lines (+31/−2).
- **Constructs today:** `ZONING_RESOURCES` `:431-442` — 10 resource IDs with **three distinct `required` sets** (base 6 cols; height `HT_LABEL`; lot-coverage `PRCNT_CVER`; 7 × `['_id','geometry']`); loop `:443-455` calling `fetchFieldNames`; regex token `zoning` `:536`; `sources_checked` 4→14 (now 18) `:539`.
- **Reversion patch:** (i) delete the `ZONING_RESOURCES` block + loop; (ii) drop `HT_LABEL`/`PRCNT_CVER` from their sets (the Fold A #2 collapse to 2 sets); (iii) drop `zoning` from the `:536` regex (a zoning drift then no longer reaches `schema_errors` → verdict PASS on drift, the exact AS-D1/AS-D6 shape).
- **ADJUDICATED (operator, 2026-08-25): `encoded-as-descriptor-field`** for (i)/(ii) — the three required sets become declared data at `checks[].zoning_resource_columns.expect.resources` (map resource id → required columns; Fold A #2), not code. (iii) the `zoning` regex token: **`knowingly-retired` at peel 8b** — it stays until attribution moves from substring to check-id (the token becomes structurally unnecessary; its lock migrates to "a zoning FAIL row drives the verdict").

#### G-F3 — `1ceebd17` `feat(59_source_ravines)` — Severity **HIGH** (loader-side L7c)
- **Guards:** the ravine ZIP must be reachable before `load_ravines` runs; `datastore_active=false` so no field-set check is possible pre-download — HEAD only, attributes validated in the loader. `git show --stat`: 19 files; `assert-schema.js` 17 lines (+15/−2).
- **Constructs today:** `RAVINE_URL` `:52-53`; HEAD block `:372-381`; token `ravine` `:536`; `sources_checked` 14→15.
- **Reversion patch:** delete `:375-381` (or the URL). Fixture: HEAD 404 on the ravine URL ⇒ must FAIL; 200 ⇒ PASS.
- **ADJUDICATED (operator, 2026-08-25): `encoded-as-descriptor-field`** — the ravine ZIP is declared at `inputs.reads.externals` and is one subject of check `source_archives_reachable`; the `ravine` regex token is `knowingly-retired` at peel 8b with G-F2(iii).

#### G-F4 — `f6047e89` `feat(62_source_centreline)` — Severity **HIGH** (lock collision, loader-side)
- **Guards:** the centreline ZIP must be reachable before `load_centreline`; the 40-col / `FEATURE_CODE_DESC`+`JURISDICTION` validation runs post-download. `git show --stat`: 12 files; `assert-schema.js` 18 lines (+16/−2).
- **Constructs today:** `CENTRELINE_URL` `:60-63`; HEAD block `:401-409`; token `centreline` `:536`; `sources_checked` 17→18 `:539` (the literal's last increment).
- **Reversion patch:** delete `:403-409`. Fixture as G-F3.
- **ADJUDICATED (operator, 2026-08-25): `encoded-as-descriptor-field`** — the centreline ZIP is declared at `inputs.reads.externals` and is a subject of `source_archives_reachable`; the `centreline` regex token is `knowingly-retired` at peel 8b with G-F2(iii).

**Not counted as a fence (no `Severity:` footer) but 1 day old and load-bearing:** `f32b1485` P3 strand window (`:265-270`, `:290`, `:587-602`) and the throw-after-finalize ordering `:581-585`. Fold A already rules the library gains the window; its lock (`quality-ledger-window.logic.test.ts:196`) re-homes onto `scripts/lib/step/index.js`. **ADJUDICATED (operator, 2026-08-25): `preserved-in-runner`** — the window and the finalize-before-throw ordering live in `scripts/lib/step/index.js` (`finally`), once, for every converted step.

### 2.4 Constants with no recovered why (G3 completeness)

`INTENT-UNKNOWN`: the two `Range` windows `bytes=0-2048` `:205` / `bytes=0-8192` `:224`, the `limit=20` sample size `:161` (raised 5→20 by `aeb6e6c2`, rationale recorded), the `"Feature"` scan `:230` (`0f8d5912` — CRS-block skip, recorded). Of the 32 top-level constants the stale report counted, the 4 URLs + 2 Range windows + 3 regexes originating in `b4e3d56e` (empty body) remain INTENT-UNKNOWN. All 4 fence constructs have a recovered why. The INTENT-UNKNOWN constants are dispositioned in §2.5 under the same ruling (nothing hidden: the 4 URLs become `inputs.reads.externals`; the Range windows, the `limit=20` sample and the `"Feature"` scan stay in compute with their values declared in `limitations`; the 3 header/GeoJSON parsing regexes stay in compute as parsing mechanics) → G3 satisfied at commit 2.

### 2.5 Intent Ledger (Spec 120 §14.3 — machine-readable; G3)

Closed vocabulary: `preserved-in-runner | preserved-in-validator | preserved-in-compute | encoded-as-descriptor-field | encoded-as-deviation | knowingly-retired`. Discoverer ≠ adjudicator on every row (§7.1: the pass that discovers may not retire). Locks: `src/tests/steps/assert_schema/violations.test.ts` (G4d, both directions).

| Construct | Origin | Discovered by | Disposition | Adjudicated by | Where it lands |
|---|---|---|---|---|---|
| Coordinate-source OR-contract (`hasCoordinateSource`, `:20`, `:76-83`, `:339-343`; coordinate-free `EXPECTED_ADDRESS_POINT_COLUMNS` `:84-96`) | fence `646ea5a7` fix(54) HIGH | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — as the NAMED audit-emitting check `address_points_has_coordinate_source`; rule declared in `checks[].why` + `limitations` | operator (Brett), 2026-08-25, §7.1 | `scripts/lib/compute/assert-schema.js` + descriptor `checks[]` |
| Zoning DataStore pre-flight — 10 resource ids, three distinct `required` sets (`ZONING_RESOURCES` `:431-442`, loop `:443-455`) | fence `58914fa8` feat(58) CRITICAL+HIGH | agent pass, commit 4 `d8a4d1ad` (Claude) | `encoded-as-descriptor-field` — `checks[].zoning_resource_columns.expect.resources` | operator (Brett), 2026-08-25, §7.1 | descriptor |
| Ravine ZIP reachability (`RAVINE_URL` `:52-53`, HEAD `:375-381`) | fence `1ceebd17` feat(59) HIGH | agent pass, commit 4 `d8a4d1ad` (Claude) | `encoded-as-descriptor-field` — `inputs.reads.externals` + subject of check `source_archives_reachable` | operator (Brett), 2026-08-25, §7.1 | descriptor |
| Centreline ZIP reachability (`CENTRELINE_URL` `:60-63`, HEAD `:403-409`) | fence `f6047e89` feat(62) HIGH | agent pass, commit 4 `d8a4d1ad` (Claude) | `encoded-as-descriptor-field` — `inputs.reads.externals` + subject of check `source_archives_reachable` | operator (Brett), 2026-08-25, §7.1 | descriptor |
| Attribution regex tokens `zoning` / `ravine` / `centreline` in the sources alternation (`:536`) + `includes('permit'/'coa'/'ckan')` (`:473-483`, `:503-504`) | `58914fa8` (iii), `1ceebd17`, `f6047e89`, `d2036181` | agent pass, commit 4 `d8a4d1ad` (Claude) | `knowingly-retired` — at peel 8b, when attribution moves to check-id (`stepCtx.report(checkId, …)`); stays until then, lock migrates to "a zoning/ravine/centreline FAIL row drives the verdict" | operator (Brett), 2026-08-25, §7.1 | AS-D6 closes at 8b |
| Ledger strand window + finalize-before-throw ordering (`:265-270`, `:290`, `:558-568` then `:585`, `:587-602`) | `f32b1485` P3 (no `Severity:` footer; load-bearing) | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-runner` — `scripts/lib/step/index.js` `finally`, per Fold A; lock re-homes from `quality-ledger-window.logic.test.ts:196` | operator (Brett), 2026-08-25, §7.1 + Fold A | library |
| `Range: bytes=0-2048` CSV header window (`:205`) | `b4e3d56e` (empty body) — INTENT-UNKNOWN | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — value declared in descriptor `limitations` (nothing hidden) | operator (Brett), 2026-08-25, §7.1 | compute + `limitations` |
| `Range: bytes=0-8192` GeoJSON window (`:224`) | `b4e3d56e` (empty body) — INTENT-UNKNOWN | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — value declared in descriptor `limitations` | operator (Brett), 2026-08-25, §7.1 | compute + `limitations` |
| `limit=20` type-sample size (`:161`) | `aeb6e6c2` (5→20, rationale recorded) | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — sample size declared in `limitations` of check `permit_cost_type_sample` | operator (Brett), 2026-08-25, §7.1 | compute + `limitations` |
| `"Feature"` scan before the properties regex (`:230-231`) | `0f8d5912` (CRS-block skip, recorded) | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — parsing mechanic; noted in `limitations` | operator (Brett), 2026-08-25, §7.1 | compute |
| 4 download URLs `ADDRESS_POINTS_URL` `PARCELS_URL` `MASSING_URL` `NEIGHBOURHOODS_URL` (`:46-51`, `:64-65`) | `b4e3d56e` (empty body) — INTENT-UNKNOWN | agent pass, commit 4 `d8a4d1ad` (Claude) | `encoded-as-descriptor-field` — `inputs.reads.externals` (with `HERITAGE_*` `:56-59`, Spec 61) | operator (Brett), 2026-08-25, §7.1 | descriptor |
| 3 parsing regexes: CSV quote-strip (`:216`), `"properties"` block (`:233`), key pattern (`:239`) | `b4e3d56e` (empty body) — INTENT-UNKNOWN | agent pass, commit 4 `d8a4d1ad` (Claude) | `preserved-in-compute` — parsing mechanics of `fetchCsvHeaders` / `fetchGeoJsonPropertyKeys`; not behaviour | operator (Brett), 2026-08-25, §7.1 | compute |

No row is `unknown`; 100% dispositioned. The `knowingly-retired` row names a human approver (operator) and a retirement point (peel 8b), and is not retired by this pass.

### 2.6 Line accounting (Spec 120 §14.5 Gate 4c — 606 lines, 100%, no overlap)

Categories: `runner-owned | validator-owned | descriptor-encoded | compute | dead (proved) | duplicate`. Measured against `git show HEAD:scripts/quality/assert-schema.js` (606 lines; the working tree already carries the uncommitted commit-7 frozen shape). No range is claimed `dead (proved)` — nothing was instrumented this session, and reading is not proof (Gate 4f). Blank lines are folded into the adjacent range.

| Lines | Category | Evidence |
|---|---|---|
| 1-18 | descriptor-encoded | header: SPEC LINKs `:3-5` → `identity` / spec refs; usage + exit contract `:10-17` → `description`, `checks[].blocking` |
| 19 | runner-owned | `require('../lib/pipeline')` — pool/lock/emits move to `scripts/lib/step/` |
| 20 | compute | `require hasCoordinateSource` — fence `646ea5a7`, kept by the compute |
| 21-22 | runner-owned | `require finalizeStrandedRun` — window becomes `scripts/lib/step/index.js` `finally` (Fold A) |
| 23-65 | descriptor-encoded | `CKAN_BASE`, resource ids, `EXPECTED_PERMIT_COLUMNS`, `EXPECTED_COA_COLUMNS`, 8 URLs → `inputs.reads.externals` + `checks[].expect` |
| 66-104 | descriptor-encoded | coordinate rationale comment `:76-83` → `checks[].why`; `EXPECTED_ADDRESS_POINT_COLUMNS`, `EXPECTED_PARCEL_COLUMNS`, `NEIGHBOURHOOD_ID_PROPS` → `checks[].expect` |
| 105-107 | descriptor-encoded | `SLUG`, `ADVISORY_LOCK_ID` → `identity.name`, `identity.lock` (§5.4 source-text constant survives in the frozen file) |
| 108-113 | runner-owned | `CHAIN_ID = process.env.PIPELINE_CHAIN` — chain context is read by the library |
| 114-257 | compute | `fetchFieldNames`, `checkColumns`, `isSentinelValue`, `parseCost`, `validateTypeSample`, `fetchCsvHeaders`, `fetchGeoJsonPropertyKeys`, `checkUrlAccessible` — pure network/parse logic, exported from `scripts/lib/compute/assert-schema.js` |
| 258-290 | runner-owned | `pipeline.run` `:259`, `withAdvisoryLock` `:260`, `startMs`, window declarations `:265-270`, ledger INSERT `:274-285`, window open `:290` |
| 291-299 | descriptor-encoded | `runPermitChecks` / `runCoaChecks` / `runSourceChecks` → `checks[].chains` |
| 300-461 | compute | the 9 checks: permits/coa fields + type sample, address points + OR-contract, parcels, 5 HEADs, neighbourhoods, `ZONING_RESOURCES` loop; `ZONING_RESOURCES` `:431-442` itself → `checks[].zoning_resource_columns.expect.resources` |
| 462-499 | runner-owned | error attribution `:473-483` (AS-D6, retires 8b) + permits audit rows/verdict `:484-498` → library `verdict.js buildAuditTable` (row-derived) |
| 500-521 | duplicate | coa audit block mirrors `:480-498` line-for-line (rows `:506-512` = `:485-489` with `coa_` prefix; `:508-509` comment restates `:464-470`); one descriptor `checks[]` list serves both chains |
| 522-556 | runner-owned | `durationMs`, `status`, `errorMsg`, `records_meta` assembly incl. the sources IIFE `:531-555` (AS-D1 `:546`, AS-D5 `:539`) → library `verdict.js` + `ledger.js` |
| 557-578 | runner-owned | finalize UPDATE `:558-568`, `emitSummary` `:571`, `emitMeta` `:572-575`, banner `:577` |
| 579-606 | runner-owned | halt-on-drift throw `:585` (blocking checks → library throws), window catch/rethrow `:587-591`, `finally` strand close `:592-602`, lock close `:603`, contention `return;` `:605` (AS-D9) |

Coverage: 18 ranges, 1-606 contiguous, sum 606, no line assigned twice (asserted by `#155`).

---

## 3. PH-5 — Seam map (commit 3 → G5)

| Seam | Named seam | Anchors | Notes |
|---|---|---|---|
| **DB** | the `pool` injected by `pipeline.run` (`:259`) and `withAdvisoryLock` (`:260`) | INSERT `:277` · UPDATE `:560` · strand UPDATE via `finalizeStrandedRun(pool, …)` `:594` → `ledger-window.js:103` · lock `pg_try_advisory_xact_lock` in `pipeline.js:924` | 3 statements total, all `pipeline_runs`, all bookkeeping; zero domain reads/writes. Amnesty entries `scripts/amnesty.json:35` (INSERT) and `:65` (`NOW()`) |
| **Clock** | `Date.now()` ×3 | `:263` start · `:523` `durationMs` · `:598` window `durationMs` | elapsed-only; every DB timestamp is SQL `NOW()` (`:278`, `:561`, `ledger-window.js:104`) — Spec 47 §R3.5 clean. ⚠ stale said ×2 |
| **Network** | global `fetch` — 5 call sites, 21 requests, 1 host | `:118` CKAN fields (`limit=0`) · `:162` CKAN sample (`limit=20`) · `:205` CSV `Range: bytes=0-2048` · `:224` GeoJSON `Range: bytes=0-8192` · `:251` HEAD | no timeout, no retry, no `AbortSignal`; `:207`/`:225` accept 206 or 200 (servers may ignore `Range`) |
| **argv / env** | `process.env.PIPELINE_CHAIN` only | `:112` → `CHAIN_ID`; consumed at `:274`, `:297-299`, `:532-534` | `process.argv` 0 · `process.exit` 0; manifest `:58` `supports_full:false, supports_dry_run:false` — consistent |

Invocation (Spec 123 §7 note, verified): `run-chain.js:646` `spawnStepChild` with `PIPELINE_CHAIN=<chain>` and no `chain_args` — `PIPELINE_CHAIN=<c> node scripts/quality/assert-schema.js` reproduces it exactly.

---

## 4. PH-6 — Classification (commit 4 → G6)

### 4.1 CONTRACT — must survive conversion

| # | Behaviour | Anchor | Evidence it is load-bearing |
|---|---|---|---|
| C1 | **Halt on drift** — non-zero exit when any check fails | `:585`, header `:16-17` | comment `:579-580` *"would silently corrupt 240K+ permit records"*; blocking for **all 9 checks** incl. `permit_cost_type_sample` (`:309-311`) — the operator decision item |
| C2 | **Chain-scoped check selection** | `:297-299`, gates `:303` `:316` `:328` | one step, three chains; standalone runs all |
| C3 | **`parcels_*` rows in BOTH permits and coa audit tables** | `:464-472` comment, `:487-488`, `:510-511` | Spec 79 CRIT-3a (`d2036181`); parcels feeds link-parcels and link-coa-to-parcels |
| C4 | **Coordinate-source OR-contract** | `:339-343`, `:84-96` | fence G-F1 |
| C5 | **Own ledger row only when `!CHAIN_ID`** | `:274`, `:558` | in-chain the runner owns the row (`run-chain.js:713`, `:732`) |
| C6 | **Lock 102** | `:107`, `:260` | `pipeline-advisory-lock.infra.test.ts` registry (3 axes) |
| C7 | **Finalize-before-throw ordering** | `:558-568` then `:585`; comment `:581-584` | `f32b1485`; the window relies on it (`ledger-window.js:17-18`) |
| C8 | **Thrown errors close the ledger window** (`status='failed'`, `error_message` `interrupted: …`) on the standalone path | `:587-602` → `ledger-window.js:98-116` | P3; lock `quality-ledger-window.logic.test.ts:196` (re-homes to the library) |
| C9 | **Zoning per-resource required sets** (3 distinct) | `:432-441` | fence G-F2; Fold A #2 |
| C10 | **Archive reachability set** = massing · ravine · heritage ×2 · centreline | `:365` `:376` `:387` `:394` `:404` | fences G-F3/G-F4 + Spec 61 |
| C11 | **`audit_table.name = 'Schema Validation'`, `phase = 1`** | `:493-494` `:516-517` `:544-545` | consumed by `FreshnessTimeline.tsx:89`, `src/lib/quality/types.ts:634`; pinned by `admin.ui.test.tsx:1155` |

### 4.2 INCIDENTAL — do not assert on

Banner text `:261`/`:577` and `.toFixed(1)`; per-check `OK:`/`FAIL:`/`WARN:` console lines; check ordering within a chain; the `'assert-schema'` (hyphen) log tag at `:259`/`:597` vs slug `assert_schema` `:106`; the non-re-indented window body (`:287-289`); `emitMeta`'s reads/writes maps `:573-574` (Fold: contract change declared, not behaviour to lock); `records_total: 0` `:571` (→ `null` under `counters:"none"`, declared).

### 4.3 DEFECT — pin in current form, fix after (Spec 123 §3.1)

Every defect re-verified at its anchor **this session** against the 606-line file.

| ID | Anchor (today) | Defect | Re-verification |
|---|---|---|---|
| **AS-D1** | `:546` | sources verdict `sourceErrors.length > 0 ? 'FAIL' : 'PASS'` reads the raw filtered array, not `sourceAuditRows` — the one branch `d2036181` never reached (permits `:491` and coa `:514` are row-derived) | present (`emitSummary`'s escalate-only recompute at `pipeline.js:404-409` masks it in stdout but not in the step) |
| **AS-D1b** | repo | `verdictCascade` in no shared library | `grep -rn verdictCascade scripts/lib/ src/lib/` → 0; 13 per-script copies (`grep -rl` over `scripts/`) |
| **AS-D2** | `:290-602`, 12 awaits / 21 requests | strand surface = **process death** (OOM/SIGTERM/ceiling kill) inside the window; thrown errors no longer strand (`f32b1485`) | present, **narrowed** since the stale report: only kills remain (`:593` comment) |
| **AS-D3** | `:282-284` | INSERT failure swallowed → `runId=null` → no row, and the window is a no-op (`shouldFinalizeStranded` false) | present |
| **AS-D4** | `:567` | finalize UPDATE `.catch(warn)` swallowed | present, **partially mitigated**: `ledgerFinalized` stays `false` so the window rewrites `status='failed'` + `interrupted: ledger row never finalized` (`ledger-window.js:73`) — the row is no longer left `running`, but the real status/verdict/meta are lost |
| **AS-D5** | `:539` literal `18`; regex `:536` | `sources_checked` hand-maintained (4→14→15→17→18) — correct today (8 body checks + 10 zoning = 18 ✓); the unrecorded "add a source ⇒ add a regex token" obligation is the sharper defect | present |
| **AS-D6** | `:473-478`, `:482-483`, `:503-504`, `:535-537` | error attribution by substring (`includes('permit')`, `includes('coa')`, `includes('ckan')`, the alternation regex) | present |
| **AS-D7** | `:527` | `checks_passed` = `'all'` or `undefined`, never a count | present |
| **AS-D8** | `:118` `:162` `:205` `:224` `:251` | 21 requests, no timeout/retry/abort | present |
| **AS-D9** | `:605` | on lock contention `return;` with no step-level emit (the only emit is the library's `skipEmit` one, `pipeline.js:932`) | present. ⚠ the sibling lock for `compute-cost-estimates.js` is now at `quality.logic.test.ts:2194` (stale said `:2181`); still none for this file |
| **AS-D10** | file | `module.exports` = 0; `isSentinelValue` `:144`, `parseCost` `:154`, `checkColumns` `:130`, 4 fetchers unreachable from tests; the 13 test sites (`grep -rn "quality/assert-schema.js" src/tests/*.ts` → 13 across 6 files) are all source-text reads | present |

**No defect's anchor was lost; three moved** (D1 `:534→:546`, D7 `:515→:527`, D9 `:570→:605` — all by `f32b1485`'s +35 lines) and **two changed status** (D2 narrowed, D4 partially mitigated) for the same reason.

### 4.4 Defect Ledger register — `AS-D1 … AS-D10`

Fleet register: `docs/reports/defect-ledger.md` (this pilot's rows are its first entries).

| ID | Anchor | One-line | Status | Closes at |
|---|---|---|---|---|
| AS-D1 | `assert-schema.js:546` | sources verdict not row-derived | OPEN · PIN at commit 7 | **commit 8b** (verdict/audit peel; `verdict.js deriveVerdict` is row-derived) |
| AS-D1b | `scripts/lib/` (absent) | no shared `verdictCascade` | OPEN | **DEFERRED** — Spec 120 §9.3 ① fleet item, not per-step |
| AS-D2 | `assert-schema.js:290-602` | process-kill strand inside the network window | OPEN (narrowed) | **DEFERRED** — needs runner-side reaper/heartbeat (B6.6 / programme-level); not closable in a step |
| AS-D3 | `assert-schema.js:282-284` | ledger INSERT failure swallowed | OPEN · PIN | **commit 7** — expected via library `ledger.js openLedgerRow`; **verify at capture** that the library does not also swallow |
| AS-D4 | `assert-schema.js:567` | finalize UPDATE failure swallowed | OPEN (partially mitigated by `f32b1485`) | **commit 7** — library `finalizeLedgerRow`; same verification caveat as D3 |
| AS-D5 | `assert-schema.js:539`, `:536` | hand-maintained `sources_checked` literal + regex-token obligation | OPEN · PIN | **commit 8c** (thresholds/checks peel: derive from checks that ran) |
| AS-D6 | `assert-schema.js:473-483`, `:503-504`, `:535-537` | substring error attribution | OPEN · PIN | **commit 8b** (attribution by check id via `stepCtx.report(checkId, …)`) |
| AS-D7 | `assert-schema.js:527` | `checks_passed` is `'all'`/`undefined` | OPEN · PIN | **commit 7** — declared diff (`records_meta` becomes the library's row-derived `audit_table`; key disappears) |
| AS-D8 | `assert-schema.js:118,162,205,224,251` | no network timeout/retry | OPEN · PIN (`execution.network.timeout: "none"`) | **DEFERRED** — peel-8c candidate with its own lock (`AbortSignal.timeout`), per Fold A #3 |
| AS-D9 | `assert-schema.js:605` | no step emit on lock contention | OPEN · PIN | **commit 7** — library emits SKIP summary + writes `self_skipped` (declared diff; consumers enumerated in the plan) |
| AS-D10 | file (no exports) | untestable; 13 source-text test sites | OPEN | **commit 7** — compute module exports; 10 GO-RED sites re-homed, 3 survive (plan §Technical Implementation) |

### 4.5 G6 statement

Every behaviour in §1 is classified above (11 CONTRACT · 7 INCIDENTAL groups · 11 DEFECT rows), and every DEFECT carries a ledger ID present in `docs/reports/defect-ledger.md`. G6 is claimable at commit 4 **subject to** the §2.3 dispositions being adjudicated by the operator (§7.1) — the two are separate gates but the same commit pair.

---

## 5. Non-determinism inventory (commit 5 → G1′; Spec 120 §14.2, claim #151/#151a)

Declared BEFORE any old/new diff. Sources: `scripts/analysis/capture-step-golden.js` (`VOLATILE_KEYS` ×11, `VOLATILE_METRIC_PREFIXES` `sys_`, `VOLATILE_PATTERNS` ×7) and the 7 keys the 4 pre captures actually stripped (`docs/reports/golden/assert_schema/pre/{permits,coa,sources,standalone}.json` → `nondeterminism[]`). Closed vocabulary: `must-match-exactly | normalize-then-match | excluded-with-reason`.

| Key | Disposition | Reason / how |
|---|---|---|
| `key:pipeline_runs[0].id` | `excluded-with-reason` | serial PK — observed (standalone) |
| `key:pipeline_runs[0].started_at` | `excluded-with-reason` | wall clock `NOW()` — observed (standalone) |
| `key:pipeline_runs[0].completed_at` | `excluded-with-reason` | wall clock `NOW()` — observed (standalone) |
| `key:pipeline_runs[0].duration_ms` | `excluded-with-reason` | elapsed — observed (standalone) |
| `row:sys_duration_ms` | `excluded-with-reason` | `VOLATILE_METRIC_PREFIXES` `sys_` — observed (all 4) |
| `row:sys_velocity_rows_sec` | `excluded-with-reason` | `VOLATILE_METRIC_PREFIXES` `sys_` — observed (all 4) |
| `pattern:duration_literal` | `normalize-then-match` | `(3.0s)` banner / `completed in 3.1s` → `<DUR>` — observed (all 4) |
| `pattern:iso_timestamp` | `normalize-then-match` | → `<TS>` (harness; not hit by this step) |
| `pattern:pg_timestamp` | `normalize-then-match` | → `<TS>` (harness; not hit) |
| `pattern:rows_per_sec` | `normalize-then-match` | → `<RATE>` (harness; not hit) |
| `pattern:run_id_literal` | `normalize-then-match` | → `<RUN_ID>` (harness; not hit) |
| `pattern:pipeline_runs_id_literal` | `normalize-then-match` | → `pipeline_runs <ID>` (harness; not hit) |
| `pattern:pid_literal` | `normalize-then-match` | → `pid=<PID>` (harness; not hit) |
| `key:id` · `key:run_id` · `key:timestamp` · `key:elapsed_ms` · `key:elapsed_s` · `key:generated_at` · `key:checked_at` · `key:captured_at` | `excluded-with-reason` | `VOLATILE_KEYS` (harness) — none observed for this step beyond the four `pipeline_runs[0].*` above |
| `exit_code` · `signal` · `verdict` · `summary_count` · `parse_errors` | `must-match-exactly` | the step's contract (§4.1 C1) |
| `summary.records_meta.audit_table.{phase,name,verdict,rows[!sys_]}` | `must-match-exactly` | C3 / C11; `rows` compared after the `sys_` strip, order preserved |
| `meta.reads` · `meta.writes` | `must-match-exactly` | declared-diff at commit 7 is recorded in the post capture, not normalised away |
| `ledger_status` | `must-match-exactly` | `[]` in-chain, `['completed']` standalone |
| `stdout` (after patterns) · `stderr` | `must-match-exactly` | per-check `OK:`/`FAIL:` lines are INCIDENTAL (§4.2) but stable; a diff here is reviewed, not masked |

---

## 6. Commit ledger (§12.16 — every commit names its done-test)

| Commit | Hash | Content | Done-test |
|---|---|---|---|
| 0 | `899a6385` | 18 categories schema-canonical; descriptor path by file-stem; anchors not line numbers | `npx vitest run src/tests/steps/` (conformance suite green on the vocabulary) |
| folds | `8b857169` | plan folds A+B (PLAN panel ×4 + fold-validation) | `.cursor/active_task.md` fold IDs A1-A7/B1-B3 re-read before each phase; grounder re-executed every claim |
| 1 | `d8a4d1ad` | PH-0 boundary freeze re-derived at 606 lines (§1) | `#6a` boundary-freeze table has `pipeline_runs` with an integer row count |
| 2 | pending (this commit) | PH-3 Intent Ledger adjudicated (§2.3, §2.5), line accounting (§2.6), inventory (§5), commit ledger (§6) | `#152` `#153` `#162` `#155` `#157` `#6b` in `violations.test.ts` |
| 3 | `d8a4d1ad` | PH-5 seam map (§3) | `#6a` (tables) + descriptor `execution.network.timeout: "none"` asserted by the descriptor test |
| 4 | `d8a4d1ad` | PH-6 classification + AS-D1..D10 in `defect-ledger.md` (§4) | `grep -c "^| AS-D" docs/reports/defect-ledger.md` = 11 |
| 5 | `75a0aca6` | golden-master capture ×3 chains + standalone (`docs/reports/golden/assert_schema/pre/`) | `node scripts/analysis/capture-step-golden.js --self-test`; `#150` two OLD captures normalise identical |
| 6 | `3e0b6636` | PH-7 test design — 44 55-A + 5 partials + 4 G4d locks, proven red | `npx vitest run src/tests/steps/assert_schema/` → 57 red / 5 green at commit 6 |
| 7 | pending | descriptor + compute + notes.json; frozen §5.1 step file | `#156` `#165` + "descriptor exists, validates" + "compute exports `compute`, opens no pool" |
| 8a | pending | peel: gating | `#154` (peel commit contains only that peel) |
| 8b | pending | peel: verdict/audit (AS-D1, AS-D6; regex tokens retired) | `#154` + G4d F2-F4 locks stay green after the token removal |
| 8c | pending | peel: thresholds/checks (AS-D5) | `#154` + `#165` must-fail fixtures per declared check |
| 9 | pending | `converted.json` registers the step; post golden capture | `#158` + "converted.json registers the step"; post capture zero-diff vs pre after §5 normalisation |

