# Phase 4 wave 1 — `permits` (scripts/load-permits.js) conversion assessment, commit ①

**Commit form: compressed (R-PACE-1)** — ① assessment + red suite (this commit), then ② descriptor, compute, notes, shell, seeds and goldens, then ③ cutover. This follows the INGESTOR precedent `load_zoning` (`70bfb6a2` ①, `1d1f86d0` ②).
**Standard:** McDonald's Airtight V3 from ①:
- R-BZ: zero purity findings, with no ledger allowance.
- R-BA: every gate is a hard stop.
- R-DF: the seven admission questions, including EXTERNALIZED.
- R-DL: the step is visible in the admin surface.

**Owner specs:** 41 (permits chain) and 50 (source permits) (`scripts/load-permits.js:17-18`).
**Frozen legacy text:** `src/tests/steps/permits/fixtures/legacy-load-permits.js.txt`, byte-identical to `scripts/load-permits.js` (blob `50837ef4`; sha256 prefix `245ff14d3b47e572` on both).
**Measured:** 2026-10-17 on the local dev DB. Reads only: `SET default_transaction_read_only = on`, one process. Plus one read-only CKAN `datastore_search?limit=1`. No capture and no write. The PRE capture is fleet night P0.

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Archetype and write class
- **Proposed archetype: INGESTOR**, with one CKAN DataStore primary and two write targets. ARCH-CENSUS is the lane that declares it. The census row reads `UNDECLARED` today (`step-archetype-census.json`, slug `permits`, batch C6).
- **Write targets:**
  1. **`permits`.** A class-B guarded upsert keyed `(permit_num, revision_num)`. The guard is `WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash` (`load-permits.js:386`). The write is batched at the library `BATCH_SIZE` 1000 (`scripts/lib/pipeline.js:825`), one transaction per batch (`:532`, `:551`). A second statement is an unconditional `last_seen_at` touch for every batch row (`:404-409`), which is the "seen in feed" signal that `close_stale_permits` reads.
  2. **`lifecycle_status_history`.** An append ledger row on every status change. It is an `INSERT … SELECT * FROM UNNEST(...)` with `ON CONFLICT (lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC')) DO UPDATE SET event_date …` (`:458-478`), inside a SAVEPOINT, so a ledger failure keeps the primary upsert and WARNs instead (`:446-493`).
  3. **`sync_runs`.** The legacy run log: `INSERT … VALUES (NOW() - make_interval(secs => $7), NOW(), 'completed', …)` (`:724-728`). It is retired at the cutover (CP-PERMITS, §6.2).
- **Lock:** advisory lock id 2 (`:564`; Spec 47 §A.5 row 2, `47_pipeline_script_protocol.md:1910`).

### 1.2 Columns written
- `permits`, 40 bound columns (`:308-320`) plus `last_seen_at` (`:384`) and the `enriched_status` clear (`:363`):
  - it clears `enriched_status` when the incoming status leaves `'Inspection'`;
  - this is the C7 fence, which preserves the classify-permit-phase never-clobber rule.
- `lifecycle_status_history`: `lead_id`, `from_status`, `to_status`, `transitioned_at`, `detected_by`, `permit_type`, `event_date`.
  - `lead_id` comes from the shared `deriveLeadId` (`:27`, `:434`).
  - `event_date` comes from the 7-status `STATUS_TO_DATE_COLUMN` map (`:51-62`). It is a structural constant (Spec 50 §3), not a tunable.
- **Measured dead columns.** The live CKAN record has 32 fields. Eight that `mapRecord` reads are absent: `CITY`, `BUILDING_TYPE`, `CATEGORY`, `OWNER`, `WARD`, `COUNCIL_DISTRICT`, `HOUSING_UNITS`, `STOREYS`. `WARD` falls back to `WARD_GRID`, and `CITY` defaults to `'TORONTO'`. In the DB, across 254,082 rows, `building_type`, `category`, `owner` and `council_district` are NULL on every row and `housing_units` and `storeys` are 0 on every row. The live feed also carries `DEMOLITION`, which the loader never reads.
- **`emitMeta` naming mismatch.** emitMeta declares the CKAN field `BUILDER` (`:711`), but the feed field is `BUILDER_NAME` (live probe), and `BUILDER_NAME` is what `mapRecord` reads (`:165`). The declaration does not match the source.

### 1.3 Audit rows, verdict, `records_meta`
- There are 12 §9 rows (`:653-672`), pinned in order by L4.
- The verdict is a compute-side cascade (`:678-681`): any FAIL gives FAIL, else any WARN gives WARN, else PASS. Under Rule 10 this becomes the runner's verdict from declared checks.
- Bounds written as bare literals:
  - `records_fetched` FAILs below `">= 200000"` (`:654`, pinned by L5);
  - `records_errors`, `api_errors` and `schema_drift` FAIL above `"== 0"`;
  - `lifecycle_status_history_errors` WARNs above `"== 0"`.
- **Measured headroom:** the live CKAN total is **201,964**, which is 1,964 rows (about 1%) above the hard-coded floor. That floor becomes a logic variable with a declared reason (§7).
- The `records_meta` shape is `duration_ms`, `api_health{api_errors, avg_req_latency_ms, max_req_latency_ms}`, `data_health{records_fetched, records_mapped, records_skipped, schema_mismatch_count, dups_removed}` and `audit_table{phase:2, name:'Permit Ingestion', verdict, rows}` (`:687-707`).

### 1.4 Source facts (live, read-only probe 2026-10-17)
- **Endpoint:** `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=6d0229af-bc54-46de-9c2b-26759b01dd05`. HTTP 200 in 248 ms, `success: true`, total 201,964.
- **Paging:** 10,000 per page (`:218`), so about 21 pages per run.
- **Contract:** `CRITICAL_FIELDS` (`:65-73`) are all present today. A missing one aborts with a drift summary (`:244-251`, `:606-621`; pinned by L3).
- **Retries:** 3 attempts with backoff 2000 × 2^(n−1) ms (`:36-37`, `:264-268`). Under INGESTOR these move into the acquisition library (`scripts/lib/step/acquire.js`) as declared variables.

### 1.5 Exits
- **Lock not acquired:** no-op return (`:732`).
- **Schema drift:** summary first, then throws (L3).
- **Fetch failure** after 3 attempts: counts `api_errors` and throws (`:272-276`).
- **Local file parse failure:** throws (`:593-595`). The `--file` mode (`:76-77`, `:584-597`) is a legacy input argv. Under R-BD a retired argv must be a declared filesystem input or a `deviations[]` entry; §6.3 has the decision.

## 2. Measurements (A.F-DB, read-only)

| Fact | Value |
|---|---|
| `permits` rows / distinct `permit_num` / non-`00` revisions | 254,082 / 228,653 / 26,475 |
| `permits` columns (information_schema) | 171 (this step writes 42 of them) |
| `max(permits.last_seen_at)` on the dev DB | 2026-08-01 (stale. The PRE capture's first run will load about 201,964 feed rows, and close_stale handles departures) |
| `lifecycle_status_history` writers | `classify-lifecycle-phase.js` 341,973 · `load-permits.js` 36,006 · `load-coa.js` 3,616 (three writers; trap 4) |
| `sync_runs` | 63 rows, all `completed`, 2026-02-20 → 2026-07-17 |
| `permit_history` rows referencing `sync_runs` | 0 (the FK `fk_permit_history_sync_runs` exists, `migrations/109_fk_hardening.sql`) |
| RLS | `relrowsecurity = true` on `permits`, `lifecycle_status_history`, `sync_runs`, `pipeline_runs`; **0 policies** (default-deny; the service role bypasses) |
| Triggers on `permits` | `set_updated_at` (BEFORE UPDATE), `trg_permits_lead_id` (BEFORE INSERT/UPDATE), `trg_permits_set_location` (BEFORE INSERT/UPDATE) |
| `pipeline_runs` for this step | `permits:permits` 59 rows, latest 2026-07-17. The runner already records every chain run of this step |
| Indexes on `permits` | 28 (incl. `permits_pkey`, `idx_permits_data_hash`, `idx_permits_lead_id`) |

## 3. Registry target review

- **(a) Files:**
  - the shell `scripts/load-permits.js`;
  - owed at ②: `scripts/load-permits.descriptor.json`, `scripts/load-permits.notes.json` and `scripts/lib/compute/load-permits.js`.
- **(b) Tables:** writes `permits` and `lifecycle_status_history`, and `sync_runs` until the cutover. It reads `permits(permit_num, revision_num, status)` for the from_status (`:296-302`).
- **(c) Consumers:**
  - `permits` has 29 readers in the effective ledger, the largest blast radius in the estate (phase-4 plan §1);
  - `lifecycle_status_history` is read by the lifecycle steps;
  - `sync_runs` readers are listed in §6.2.
- **(d) Tests already pinning this file:**
  - `sync.logic.test.ts`, `load-permits-occupancy.logic.test.ts` (exports `deduplicateRecords`, `mapRecord`, `cleanArea`, `CRITICAL_FIELDS`, `:736`);
  - `load-permits.lifecycle-status-history.infra.test.ts`, `pipeline-advisory-lock.infra.test.ts`, `chain.logic.test.ts`, `close-stale-permits.infra.test.ts`.

  Every one of them must stay green or be re-pinned to a ruled change at ②.

## 4. PH-3 — Intent ledger (fences that must survive)

| Fence | Where | Lock today |
|---|---|---|
| Hash only the mapped fields, never raw CKAN (prevents false update cascades) | `:118-130` | `sync.logic` |
| Cross-page dedup: the highest `_ckan_id` wins (stops the 488-update ping-pong) | `:194-210` | L11, `sync.logic` |
| The C7 `enriched_status` clear on leaving Inspection, `IS DISTINCT FROM` | `:358-363` | L6 |
| Touch `last_seen_at` for every row (close_stale's signal) | `:392-409` | L7 |
| `lead_id` from the shared `deriveLeadId` (C6: LPAD truncation) | `:23-27` | L8 |
| A ledger failure keeps the primary upsert (SAVEPOINT) | `:443-493` | L10 |
| `event_date` from the 7-status map, trimmed key | `:425-432` | L8 |
| Abort on CKAN critical-field drift | `:243-251` | L3 |
| `RESIDENTIAL` is the authoritative GFA (Spec 78) | `:72`, `:178` | `load-permits-occupancy.logic` |

## 5. PH-5 — Seam map (legacy → INGESTOR runner)

| Legacy | Converted home |
|---|---|
| `fetch` + retry loop + page loop (`:217-278`) | the acquisition library (`acquire.js`), DataStore paging with declared `externals[].url`, page size, retries and backoff |
| Schema-drift abort | a declared `schema_drift` check (FAIL, `viol == 0`; id kept for consumer continuity, D8) |
| `mapRecord`, `deduplicateRecords` | compute `shapeRecord` / `reconcile` (pure, ported byte-for-byte) |
| per-batch `withTransaction` + upsert + touch | runner write seam (`ctx.flushBatch`, class-B guarded upsert), batch from `pipeline.maxRowsPerInsert` (R-CU) |
| SAVEPOINT ledger write | second declared write target with its own non-fatal posture (D9); txn control leaves compute (G4) |
| verdict cascade + bare-literal statuses | declared `checks[]` (Rule 10), bounds `limit_from_config` or exact `viol == 0` |
| `sync_runs` INSERT + `NOW()` | retired; the runner's `pipeline_runs` row is the run ledger (CP-PERMITS) |
| `Date.now()` ×5 (durations, latencies) | runner clock / acquire telemetry |
| advisory lock 2 | descriptor `sharing` / lock id (runner-owned) |

## 6. PH-6 — Classification, decisions owed

### 6.1 Defects (filed at ① as `PM-D1..PM-D9` OPEN·PIN in `docs/reports/defect-ledger.md`; defect prefix `PM` declared in `DEFECT_PREFIX_OVERRIDES` because the initials `P` collide with `parcels`)
1. Six always-NULL/0 columns written from CKAN fields absent from the live feed (§1.2). Behaviour-preserving conversion keeps writing them; dropping them is a Spec 50 change (PIN).
2. emitMeta declares CKAN field `BUILDER`; the feed and the mapper use `BUILDER_NAME` (§1.2). Fixed for free at ②: the descriptor's declared reads replace emitMeta.
3. `records_fetched >= 200000` has ~1 % headroom against today's feed (§1.3) — a near-miss FAIL; the floor becomes a logic variable with its measured basis.
4. `DEMOLITION` is in the feed and unread — PIN (Spec 50 scope), not this conversion.

Ledger map: (1) PM-D1, (2) PM-D2, (3) PM-D3, (4) PM-D4; `sync_runs` PM-D5 (§6.2); `--file` PM-D6 (§6.3); telemetry PM-D7 (§10); the four tunable literals PM-D8 (§7); the SAVEPOINT ledger write PM-D9 (§5, R-DM).

### 6.2 CP-PERMITS — `sync_runs` retirement (operator D-P1 **y** 2026-10-17, the measured scope below)
Phase-4 plan decision 4 assumed **3** `sync_runs` readers. Measured today: **two writers and 8 reader sites.**
- **Writers.** The first is `scripts/load-permits.js:724`. The second is **`src/lib/sync/process.ts:329-407`** (`runSync`, a manual file-sync path that the admin `POST /api/admin/sync` and `POST /api/sync` call, `src/app/api/admin/sync/route.ts:74`, `src/app/api/sync/route.ts:42`).
- **Readers.**
  - `scripts/lib/compute/refresh-snapshot.js:250` (CP-PERMITS);
  - `scripts/backfill/seed-pipeline-runs.js:23`;
  - `scripts/quality/audit-fk-orphans.js:183` (FK parent);
  - `src/app/api/admin/stats/route.ts:93` (`last_sync_at`);
  - `src/app/api/admin/sync/route.ts:23`;
  - `src/app/api/sync/route.ts:12`;
  - `src/lib/quality/metrics.ts:708`;
  - the `admin_run_ledger` surface descriptor (`scripts/surfaces/parcel_admin/F07/surfaces/admin_run_ledger.descriptor.json:124`, not built yet).
- **The run evidence already exists.** The runner already records this step in `pipeline_runs` (`permits:permits`, 59 rows).

So "no dual-write, move the 3 readers" cannot retire the table: `runSync` still writes it. The smallest compliant form:
- the converted permits step stops writing `sync_runs`;
- every reader that means "the last permits load" (refresh_snapshot, `admin/stats` `last_sync_at`, `metrics.ts:708`, seed-pipeline-runs) reads `pipeline_runs` (`pipeline = 'permits:permits'` or chain-scoped) in the same landing;
- `sync_runs` stays the ledger of the manual `runSync` path, with its convergence filed as a PIN.

**Decision D-P1 — operator y 2026-10-17:** exactly this form (QUEUE.md 2026-10-17 "OPERATOR y (wave-1 decisions)").

### 6.3 Other decisions
- **`--file` mode.** Under R-BD (now in 124a §B10) a retired argv must be a declared filesystem input or a `deviations[]` entry. **Decision D-P2 — operator y 2026-10-17:** retired as a `deviations[]` entry (PM-D6).
- **Six dead columns.** **Decision D-P3 — operator y 2026-10-17:** keep writing them (behaviour-preserving), PIN a Spec 50 change (PM-D1).
- **Ledger write posture.** **R-DM adopted — operator y 2026-10-17:** the `lifecycle_status_history` write is a declared second target with `on_error: "warn_row"`; the runner owns the SAVEPOINT and the WARN row (PM-D9). It lands with the runner change after the in-flight `scripts/lib/step/index.js` lane.
- **Shared `lifecycle_status_history` writer.** It has three writers (§2). Trap 4 says the invalidator is declared by the column's writer. No invalidator is needed, because this is an append ledger: rows are inserted, never derived. State it in the descriptor's `why`.

## 7. PH-6 — Literal ledger (Rule 3 / R-DF EXTERNALIZED)

| Literal | Where | Plan |
|---|---|---|
| `limit = 10000` (page size) | `:218` | logic variable `load_permits_page_size` (seed 10000) |
| `MAX_RETRIES = 3` | `:36` | `load_permits_download_retries` (seed 3; load_centreline precedent `load_centreline_download_retries`) |
| `RETRY_BASE_MS = 2000` | `:37` | `load_permits_retry_backoff_ms` (seed 2000; `load_centreline_download_retry_backoff_ms`) |
| `>= 200000` records_fetched floor | `:654` | `load_permits_records_fetched_min` (seed 200000, `limit_from_config`) |
| `counters.processed % 10000` progress cadence | `:543` | dropped: the runner owns progress |
| `counters.errors <= 5` error-log cap | `:514` | `load_permits_max_detail_keys` (load_ravines / load_centreline `*_max_detail_keys` precedent) |
| `CKAN_BASE`, `RESOURCE_ID` | `:33-34` | `inputs.reads.externals[].url` (G10) |
| `ADVISORY_LOCK_ID = 2` | `:564` | descriptor lock id (structural, Spec 47 §A.5) |
| `'00'` default revision, `'TORONTO'` default city | `:145`, `:154` | domain defaults ported byte-for-byte, recorded in notes (not tunables) |
| `STATUS_TO_DATE_COLUMN`, `CRITICAL_FIELDS` | `:51-73` | structural contract (Spec 50 §3; the check's `expect`), not tunables |

Every value above is either a registered logic variable seeded by migration (R-CV form), a declared external, or a structural constant named in the notes. No bare tunable survives into compute (gate E #32).

## 8. Purity estimate (122a §A26 codes, if the legacy constructs were moved as-is)

| Code | Today's construct (file:line) | Count | Converted home |
|---|---|---|---|
| G1 ledger SQL | `INSERT INTO sync_runs` `:724` | 1 | retired (CP-PERMITS) |
| G4 DDL/txn | `SAVEPOINT` / `RELEASE` / `ROLLBACK TO` `:447/479/483`, advisory lock `:568` | 4 | runner seams |
| G5 direct write | permits upsert `:390`, touch `:404`, ledger insert `:458`, sync_runs `:724` | 4 | `ctx.flushBatch` / declared targets |
| G6 SQL clock | `NOW()` ×2 `:726` | 2 | retired |
| G9 / gate E literals | §7 table | 6 | logic variables |
| G10 literal URL | `CKAN_BASE` `:33` | 1 | `externals[].url` |
| G13 swallow | rollback catch `:484-489` (log only), mapRawRecords catch `:512-515` (counter + log) | 2 | ctx.report / ctx.log, or rethrow |
| Network in compute | `fetch` `:231` | 1 | acquisition library |
| Clock reads | `Date.now()` `:229,232,262,572,607,636` | 6 | runner clock |

**Target at ②: 0 purity findings.** The whole set above leaves compute.

## 9. 122a §A27 trap list, applied

| Trap | Applies | Note |
|---|---|---|
| 1 net-new pending | no | legacy step; not net-new (R-DK does not apply) |
| 2 RLS | **yes** | `rls_bypass_or_policy` on `permits` and `lifecycle_status_history` (R-CT; D6) |
| 3 bind limit | **yes** | 40 × 1000 + 1 = 40,001 ≤ 65,535 today; the converted write sizes from `maxRowsPerInsert` (R-CU) |
| 4 invalidators | yes | three ledger writers; append ledger → no invalidator, stated in `why` |
| 5 emits | yes | every `records_meta` key a declared `emits[]` entry |
| 6 explained-diffs | yes | `docs/reports/golden/permits/explained-diffs.json` at ② |
| 7 finish before capture | yes | descriptor/notes/compute final before PRE→POST |
| 8 stage prior golden | yes | |
| 9 runbook bounds | yes | Spec 50 population |
| 10 host | yes | `DOTENV_CONFIG_PATH` for one process |
| 11 recapture flags | yes | |
| 12 replay (R-CZ) | **yes** | a forced nonzero capture needs a `recapture.json` bracket; unchanged feed → hash guard writes 0, so a cohort bracket (`ingestor-forced-cohort.js` on `permits`) is the evidence path |
| 13 DB tests `*.db.test.ts` | yes | the lifecycle ledger infra test is DB-backed → check its tier at ② |

## 10. Admin visibility (R-DL)

`permits` is registered in all four admin sources:
- `FreshnessTimeline.tsx:31` `PIPELINE_REGISTRY`;
- `funnel.ts:654` `STEP_DESCRIPTIONS`;
- `funnel.ts:953` `PIPELINE_TABLE_MAP` (`permits: 'permits'`);
- `funnel.ts:789` `STEP_EXPECTED_RANGES`.

The one gap: manifest `telemetry_tables` is `["permits"]` (`scripts/manifest.json`, `scripts.permits`), so it lacks the declared write target `lifecycle_status_history`. R-DL requires telemetry tables to cover every declared write, so this gets added at ② (D7). Under the operator ruling, the range badge is derived from the step's declared check bounds, not from hand-written numbers.

## 11. Red suite (PH-7)

`src/tests/steps/permits/violations.test.ts`, 22 tests:
- **L1–L13** are plain `it`, green. They execute the verbatim legacy text through `fixtures/legacy-harness.ts`, which fakes `./lib/pipeline`, `fetch` and `setTimeout` and uses the real `./lib/address`, `./lib/safe-math` and `./lib/leads/lead-id`.
- **D1–D9** are `it.fails` that flip at ②.

Red evidence is in `docs/reports/red-evidence/permits/pre2-artifacts-missing.json`. It is the same suite with D run as plain `it`: 13 pass, 9 fail, every failure a named missing artifact.

| Test | Pins |
|---|---|
| L1 | lock id 2 |
| L2 | DataStore URL, page 10000 |
| L3 | schema-drift abort |
| L4 | 12 audit rows; records_total |
| L5 | bare `>= 200000` floor |
| L6 | 40-col upsert, hash guard, C7 clear |
| L7 | touch every row |
| L8 | ledger row + event_date |
| L9 | no ledger on unchanged |
| L10 | SAVEPOINT rollback → WARN |
| L11 | dedup highest _id |
| L12 | sync_runs with NOW() |
| L13 | missing REVISION_NUM → FAIL |
| D1–D9 | descriptor INGESTOR; compute + `pipeline.step`; notes; no sync_runs; four seeded variables; RLS guards; telemetry ⊇ writes; `schema_drift` declared check; two write targets |

## R. Reflection (G9)
- **Low confidence:** the cohort bracket form for `permits` (two-column key), the same issue the geocode_permits recipe hit: `ingestor-forced-cohort.js` takes a single `--key`. Precedent: single-revision rows keyed by `permit_num` (`docs/reports/golden/geocode_permits/recapture.json`).
- **Standard-shaping:** the `sync_runs` second writer (§6.2) is outside this step. Its convergence is a separate item, not part of the conversion.
