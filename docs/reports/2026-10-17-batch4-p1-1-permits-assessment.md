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

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=permits --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 7/17** · G9 Reflection: FAIL · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, G9, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

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
| G0 | 0 | 1 | boundary-section=true spec-line=false |
| G1 | 0 | 1 | PH-3 section found=true sha-count=0 |
| G2 | 0 | 1 | no generated churn×complexity row for this slug, no PH-2/churn×complexity section, and ASSESSMENT-INCOMPLETE not claimed either |
| G3 | 1 | 2 | table rows=10 vocab-hit rows=0 |
| G4 | 0 | 2 | risk-class row with chance+impact found=false |
| G5 | 0 | 1 | db=false clock=false network=false argv/env=false |
| G6 | 3 | 3 | 9 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=25 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=2 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | FAIL | — | heading=true low-confidence-table=false recurring-table=false |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=25 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 4 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 4 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 494 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 24.65 s <= 25.3 s; registry-input 24.41 s <= 27.5 s; measured 2026-10-18T18:40:16.223Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 531 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 168 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (10 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |

### Captures (item iv)
- missing invocations (POST): permits::, none::
- missing invocations (PRE, GOLD-PRE): permits::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 0 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 4/14** · not-run: 1 · vacuous: 1

