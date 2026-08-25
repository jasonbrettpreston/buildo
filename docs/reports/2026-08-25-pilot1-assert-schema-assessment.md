# Pilot 1 assessment — `assert_schema` (PH-0 · PH-3 · PH-5 · PH-6)

**Target:** `scripts/quality/assert-schema.js` — **606 lines** (`wc -l`), lock 102, HEAD `8b857169`, last touched by `f32b1485` (2026-08-24, P3 strand window).
**Plan:** `.cursor/active_task.md` (Pilot 1, folds A+B). **Governing:** Spec 123 §6 / §6.1 / §6.2 / §7 / §7.1; Spec 122 §5.1.
**Supersedes:** `docs/reports/2026-08-23-assess-step01-assert-schema.md` (written at 571 lines; its *classifications* are inherited, its *numbers* are not — every figure below was re-measured this session per the operator ruling).
**Status:** ASSESSMENT ONLY. No `src/`/`scripts/` code changed. PH-3 dispositions are **PROPOSALS — AWAITING OPERATOR ADJUDICATION (§7.1)**.

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

### 2.3 The four fences — evidence and PROPOSED dispositions

> **AWAITING OPERATOR ADJUDICATION §7.1.** This pass discovered; it may not retire. Each row gives (a) what the fence guards, (b) the construct(s) in the current file that encode it, (c) the reversion patch that a both-directions lock (G4d) must apply to go red, (d) a PROPOSED disposition.

A note on what the footers cover: for `58914fa8`, `1ceebd17`, `f6047e89` the `Severity:` line describes defects in the *sibling loader* (DataStore rewrite, L7c mass-delete, lock collision) — the `assert-schema.js` hunk in each is chain wiring. They are fences by CLAUDE.md's definition (a `Severity:` footer commit that touched this file); the intent recovered below is the intent of the hunk, not of the loader fix.

#### G-F1 — `646ea5a7` `fix(54_source_address_points)` — Severity **HIGH (chain-blocking)**
- **Guards:** the sources chain must not HARD-FAIL on a column the loader does not consume. The flat `LATITUDE`/`LONGITUDE`/`geometry` requirement (added 2026-05-23) was *dead on arrival* — the live CSV ships `geometry`, not lat/lng. Replaced by an OR-contract: coordinate source present = `geometry` OR (`LATITUDE`+`LONGITUDE`), via a helper shared with the loader's WARN drift check. `git show --stat`: 4 files, `assert-schema.js` 27 lines (+17/−10).
- **Constructs today:** import `:20`; rationale comment `:76-83`; `EXPECTED_ADDRESS_POINT_COLUMNS` `:84-96` **without** any coordinate column; the check block `:336-343` (`if (!hasCoordinateSource(new Set(apHeaders)))` → `allPassed=false` + `'Address Points: no coordinate source (geometry or LATITUDE+LONGITUDE)'`).
- **Reversion patch (lock must go red on either):** (i) append `'LATITUDE','LONGITUDE','geometry'` to `EXPECTED_ADDRESS_POINT_COLUMNS`; (ii) delete `:339-343`. Fixture: headers = 11 expected + `geometry` ⇒ must PASS; headers = 11 + nothing ⇒ must FAIL; headers = 11 + `LATITUDE`+`LONGITUDE` ⇒ must PASS.
- **PROPOSED: preserve-in-compute** — the helper already lives in `scripts/lib/address-points-csv-drift.js` (extracted by this very commit "so it can be unit-tested"); compute keeps the call as check `address_points_has_coordinate_source`; the expected-column list stays coordinate-free in the descriptor `expect`.

#### G-F2 — `58914fa8` `feat(58_source_zoning_bylaw)` — Severity **CRITICAL+HIGH** (loader-side)
- **Guards:** the 10 Zoning By-law layers are ingested from the CKAN **DataStore** (the `_id` upsert key exists only in `datastore_search`), so pre-flight must assert each resource is reachable *as a DataStore resource* and carries `_id` + `geometry` (+ the per-layer regulatory columns the enricher reads). `git show --stat`: 22 files; `assert-schema.js` 33 lines (+31/−2).
- **Constructs today:** `ZONING_RESOURCES` `:431-442` — 10 resource IDs with **three distinct `required` sets** (base 6 cols; height `HT_LABEL`; lot-coverage `PRCNT_CVER`; 7 × `['_id','geometry']`); loop `:443-455` calling `fetchFieldNames`; regex token `zoning` `:536`; `sources_checked` 4→14 (now 18) `:539`.
- **Reversion patch:** (i) delete the `ZONING_RESOURCES` block + loop; (ii) drop `HT_LABEL`/`PRCNT_CVER` from their sets (the Fold A #2 collapse to 2 sets); (iii) drop `zoning` from the `:536` regex (a zoning drift then no longer reaches `schema_errors` → verdict PASS on drift, the exact AS-D1/AS-D6 shape).
- **PROPOSED: preserve-in-compute** for (i)/(ii) — descriptor check `zoning_resource_columns` with the per-resource `expect` map (Fold A #2); **retire** (iii) at peel 8b when attribution moves from substring to check-id (the token becomes structurally unnecessary; its lock migrates to "a zoning FAIL row drives the verdict").

#### G-F3 — `1ceebd17` `feat(59_source_ravines)` — Severity **HIGH** (loader-side L7c)
- **Guards:** the ravine ZIP must be reachable before `load_ravines` runs; `datastore_active=false` so no field-set check is possible pre-download — HEAD only, attributes validated in the loader. `git show --stat`: 19 files; `assert-schema.js` 17 lines (+15/−2).
- **Constructs today:** `RAVINE_URL` `:52-53`; HEAD block `:372-381`; token `ravine` `:536`; `sources_checked` 14→15.
- **Reversion patch:** delete `:375-381` (or the URL). Fixture: HEAD 404 on the ravine URL ⇒ must FAIL; 200 ⇒ PASS.
- **PROPOSED: preserve-in-compute** — one subject of check `source_archives_reachable`; regex token retires with G-F2(iii).

#### G-F4 — `f6047e89` `feat(62_source_centreline)` — Severity **HIGH** (lock collision, loader-side)
- **Guards:** the centreline ZIP must be reachable before `load_centreline`; the 40-col / `FEATURE_CODE_DESC`+`JURISDICTION` validation runs post-download. `git show --stat`: 12 files; `assert-schema.js` 18 lines (+16/−2).
- **Constructs today:** `CENTRELINE_URL` `:60-63`; HEAD block `:401-409`; token `centreline` `:536`; `sources_checked` 17→18 `:539` (the literal's last increment).
- **Reversion patch:** delete `:403-409`. Fixture as G-F3.
- **PROPOSED: preserve-in-compute** — subject of `source_archives_reachable`; token retires with G-F2(iii).

**Not counted as a fence (no `Severity:` footer) but 1 day old and load-bearing:** `f32b1485` P3 strand window (`:265-270`, `:290`, `:587-602`) and the throw-after-finalize ordering `:581-585`. Fold A already rules the library gains the window; its lock (`quality-ledger-window.logic.test.ts:196`) re-homes onto `scripts/lib/step/index.js`.

### 2.4 Constants with no recovered why (G3 completeness)

`INTENT-UNKNOWN`: the two `Range` windows `bytes=0-2048` `:205` / `bytes=0-8192` `:224`, the `limit=20` sample size `:161` (raised 5→20 by `aeb6e6c2`, rationale recorded), the `"Feature"` scan `:230` (`0f8d5912` — CRS-block skip, recorded). Of the 32 top-level constants the stale report counted, the 4 URLs + 2 Range windows + 3 regexes originating in `b4e3d56e` (empty body) remain INTENT-UNKNOWN. All 4 fence constructs have a recovered why → G3 satisfiable at adjudication.

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
