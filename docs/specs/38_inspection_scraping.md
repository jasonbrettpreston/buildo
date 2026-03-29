# Spec 38 -- Inspection Data Scraping (AIC Portal)

## 1. Goal & User Story
As a tradesperson, I want to see real-time inspection statuses (Pass/Fail/Outstanding) for each permit stage so I can identify exactly where a project stands and time my outreach to the right construction phase.

The City of Toronto's Application Information Centre (AIC) portal (`secure.toronto.ca/ApplicationStatus`) exposes inspection stage data behind a session-gated, JavaScript-rendered interface. This spec covers the database schema, scraping infrastructure, queue management, and UI surfacing of that inspection data.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read (permit detail page) |
| Authenticated | Read (permit detail page) |
| Admin | Read/Write (trigger scrape pipeline) |

## 3. Behavioral Contract

### 3.1 AIC Portal Structure & Navigation

The AIC portal uses a multi-step navigation flow to reach inspection data:

**Search flow:**
1. Navigate to `setup.do?action=init`
2. Enter **year** (2 digits) in box 1 and **sequence** (6 digits) in box 2 — leave type/revision/work boxes empty
3. Click Search → returns 1 result with an address
4. Click "Show Results" → reveals the address row
5. Click the address → expands to show **all permits at that address** in a table

**Address permit table columns:** Application#, Application Type, Date, Status

**Critical optimization — Status filtering:**
- Only permits with **Status = "Inspection"** have inspection stage data
- Permits in other statuses (Application Received, Application On Hold, Application Acceptable, Permit Issued, Revision Issued, Not Started) do NOT have inspection stages yet
- The scraper should **skip the click-through** for any permit not in "Inspection" status

**Permit status lifecycle (observed progression):**
```
Application Received → Application On Hold → Application Acceptable → Permit Issued → Inspection → (removed from feed)
                                                                    ↘ Revision Issued (branch — no inspection data; check original rev 00)
```

**Feed lifecycle:** The Open Data feed is a **live snapshot of active permits**. Once all inspections pass, the permit is removed from the feed entirely — there is no "Completed" or "Closed" status. This means:
- Permits in "Inspection" status are **all currently active** inspections
- A permit disappearing from the feed signals completion
- The "Inspection" pool turns over: new permits enter, completed permits drop off
- For non-scraped permit types (HVAC, Plumbing, Demolition), presence/absence in the feed with "Inspection" status is the only lifecycle signal available from Open Data

**Application detail flow (only for "Inspection" status permits):**
6. Click the permit application# link → opens Application Detail modal
7. Modal shows: Application type, Status, Location, Application#, Issued Date, Project, Work, Description
8. Below detail: "Inspection Process" section with group name, inspector name, Status link, Contact Info link
9. Click "Status" link → opens Inspection Status modal with the stages table

**Revision handling:** Inspections live on the **original permit (rev 00)** only. Revision permits (rev 01+) have "Revision Issued" status. For permits with "Revision Issued" status, navigate to the original application linked at the bottom of the application detail page.

### 3.2 Application Number Format

The AIC portal uses a 5-part application number format:
```
YY NNNNNN TYPE REV WORK
│  │      │    │   └─ Work type code (BA, MS, PS, DR, DM, etc.)
│  │      │    └──── Revision number (00 = original, 01+ = revisions)
│  │      └──────── Permit type code (BLD, HVA, PLB, DRN, DEM, FSU, DST, etc.)
│  └─────────────── 6-digit sequence number
└────────────────── 2-digit year
```

Examples: `24 132854 BLD 00 BA`, `24 132854 HVA 00 MS`, `25 270301 DEM 00 DM`

Our Open Data feed stores `permit_num` as `YY NNNNNN TYPE` (3 parts). The portal adds revision and work type.

### 3.3 Inspection Regime Templates by Permit Type

Each permit type has a named **inspection group** containing a **template superset** of mandatory stages. The inspector marks inapplicable stages as "not applicable" and they are removed from the list as the project progresses.

| Permit Type | AIC Code | Inspection Group Name | Stages | Count |
|---|---|---|---|---|
| Building Additions/Alterations | BLD / BA | BA Building Inspection Pt3 | Excavation/Shoring, Footings/Foundations, Structural Framing, Insulation/Vapour Barrier, Fire Separations, Fire Protection Systems, Fire Access Routes, Interior Final Inspection, Exterior Final Inspection, Site Grading Inspection, Pool Suction/Gravity Outlets, Pool Circulation System, Occupancy | **13** |
| Mechanical / HVAC | HVA / MS | MS HVAC Inspection Pt3 | HVAC/Extraction Rough-in, HVAC Final, Occupancy | **3** |
| Plumbing | PLB / PS | PS Plumbing Inspection Pt3 | Sewers/Drains/Sewage System, Water Service, Fire Service, Drain/Waste/Vents, Water Distribution, Plumbing Final, Occupancy | **7** |
| Drain / Site Service | DRN / DR | DR Site Service Inspection | Sewers/Drains/Sewage System, Water Service, Fire Service, Occupancy | **4** |
| Demolition | DEM / DM | DM Building Inspection Pt9 | Demolition | **1** |
| Fire/Security Upgrade | FSU | *(TBD — observed 3 stages)* | Fire Protection Systems, System, Security Device | **3** |
| Designated Structures | DST | *(TBD — observed 2 stages)* | Occupancy, System | **2** |
| New Houses | BLD / NH | NH Building Inspection | Excavation/Shoring, Footings/Foundations, Structural Framing, Insulation/Vapour Barrier, Fire Separations, Fire Protection Systems, Site Grading Inspection, Occupancy, Final Inspection | **9** |
| New Building | BLD / NB | NB Building Inspection Pt3 *(or Pt9 for temporary structures)* | *(stages not yet observable — Status link absent on all sampled permits; inspector assigned but stages not yet created in system)* | **TBD** |
| Small Residential Projects | BLD / SR | SR Building Inspection | Footings/Foundations, Structural Framing, Insulation/Vapour Barrier, Fire Separations, Interior Final Inspection, Occupancy | **7** |
| Conditional Permit | SHO / CP | CP PP Building Inspection Pt3 | *(stages not yet observable — no Status link; inspector assigned but stages not created)* | **TBD** |
| Temporary Structures | TPS / TS | *(none — no Inspection Process section)* | *(no inspection stages — permits go to "Inspection" status but have no stage-level tracking on the portal)* | **0** |

**Permit types NOT on the AIC portal (legacy, pre-amalgamation):**
- **Residential Building Permit** (CMB code, years 79–04, 3.5K permits) — Scarborough-era legacy permits. Not searchable on portal.
- **Non-Residential Building Permit** (CMB code, years 86–04, 900 permits) — same legacy era.
- **Multiple Use Permit** (years 90–04, 198 permits) — same legacy era.
- **Portable Classrooms**, **Partial Permit**, **DCs DeferredFees**, **AS Alternative Solution** — low volume, niche types. Not prioritized for scraping.

**Group naming pattern:** `{WORK_CODE} {Type} Inspection {PtN}` — the Pt number varies (Pt3 for BLD/HVA/PLB/NB/SR/CP, Pt9 for DEM and NB temporary structures). NH (New Houses) and SR (Small Residential) omit the Pt suffix.

**Shared stages across regimes:**
- "Occupancy" appears in all regimes except DEM and TPS
- NH shares most stages with BA but replaces Interior/Exterior Final Inspection with a single "Final Inspection" and omits Fire Access Routes and Pool stages
- SR is a subset of BA: omits Excavation/Shoring, Fire Protection Systems, Fire Access Routes, Exterior Final Inspection, Site Grading Inspection, and Pool stages
- PLB and DRN share: Sewers/Drains/Sewage System, Water Service, Fire Service
- BLD includes Fire Protection Systems (shared with FSU)

**Scraper edge cases:**

*Missing Status link:*
- Some permits in "Inspection" status have an inspector assigned but **no clickable "Status" link** in the Inspection Process section. This means the inspector has not yet created the inspection stages for that permit.
- The scraper must handle this gracefully: if no Status link is found, record the permit's AIC status and inspection group name, but skip stage scraping (no stages to scrape yet).
- Re-scrape these permits on subsequent runs — the stages will appear once the inspector sets them up.

*No Inspection Process section:*
- **Temporary Structures (TPS)** permits show no Inspection Process section at all despite being in "Inspection" status. The scraper should skip these entirely.

*Orders Issued section:*
- Some permits (observed on SR) have a **"Status of Orders Issued"** section below the inspection stages, listing compliance orders (e.g. "Order to Comply Work No Permit"). This is a Phase 2 scraping target — not critical for initial inspection stage tracking but valuable for compliance monitoring.

### 3.4 Inspection Stage Status Values

Observed status values from the AIC portal (scraper must handle all):
| Status | Meaning | Scraper Maps To |
|---|---|---|
| Outstanding | Not yet inspected | `Outstanding` |
| Passed | Inspection passed | `Passed` |
| Not Passed | Inspection failed | `Not Passed` |
| *(not yet observed)* | Partially completed | `Partial` |

**Important — stages are NOT strictly sequential:** The portal lists all *possible* inspection stages for a permit type, but not all stages are required. For example, a basement renovation (Second Suite) will have Footings/Foundations listed as "Outstanding" indefinitely because no new foundation work is needed — the builder goes straight to Structural Framing. The UI must NOT show a linear progression bar that implies Stage N blocks Stage N+1.

### 3.5 Database Schema
- **Existing table: `permit_inspections`** (migration 045)
  - `id` SERIAL PRIMARY KEY
  - `permit_num` VARCHAR(30) NOT NULL
  - `stage_name` TEXT NOT NULL (dynamic, exactly as scraped: e.g. "Structural Framing", "HVAC/Extraction Rough-in")
  - `status` VARCHAR(20) NOT NULL (values: "Outstanding", "Passed", "Not Passed", "Partial")
  - `inspection_date` DATE (nullable — Outstanding stages have no date)
  - `scraped_at` TIMESTAMP NOT NULL DEFAULT now()
  - `created_at` TIMESTAMP NOT NULL DEFAULT now()
  - UNIQUE constraint on `(permit_num, stage_name)`
- **New columns (Phase 2):**
  - `inspection_group` TEXT — regime name (e.g. "BA Building Inspection Pt3")
  - `inspector_name` TEXT — assigned inspector from portal
  - `sort_order` SMALLINT — natural construction order within group
- **Indexes:** B-tree on `permit_num`; partial index on `status = 'Outstanding'` for active-stage queries.
- **No FK to revision_num** — inspections are tracked per application number (rev 00), not per revision.

### 3.6 Target Permit Types & Volume Estimate

**Scrape targets (stage-level tracking):**

| Permit Type | In Inspection | % of Type | Inspection Group | Stages |
|---|---|---|---|---|
| Small Residential Projects | 35,557 | 67% | SR Building Inspection | 7 |
| Building Additions/Alterations | 20,544 | 55% | BA Building Inspection Pt3 | 13 |
| New Houses | 10,329 | 70% | NH Building Inspection | 9 |
| **TOTAL** | **66,430** | | | |

**Monitor-only types (no scraping — track via Open Data feed presence/absence):**

| Permit Type | In Inspection | Stages | Rationale |
|---|---|---|---|
| Plumbing (PS) | 35,325 | 7 | Low incremental value per stage — presence in feed = active, removal = complete |
| Mechanical/HVAC (MS) | 25,719 | 3 | Only 3 stages — start/end detection sufficient |
| Demolition (DM) | 410 | 1 | Single stage — binary active/complete |
| New Building | 1,370 | TBD | Commercial — monitor lifecycle only |
| Fire/Security Upgrade | 2,304 | 3 | Few stages — start/end detection sufficient |
| Designated Structures | 1,551 | 2 | Few stages — start/end detection sufficient |
| Drain and Site Service | 10,346 | 4 | Utility permit — start/end detection sufficient |
| Conditional Permit | 74 | TBD | Low volume — monitor lifecycle only |
| Temporary Structures | 86 | 0 | No inspection stages on portal — monitor feed only |
| Portable Classrooms | 88 | TBD | Low volume — monitor lifecycle only |
| Partial Permit | 77 | TBD | Low volume — monitor lifecycle only |

**Excluded types (not on AIC portal):** Residential Building Permit (2,880 — legacy CMB code, years 79–04), Non-Residential Building Permit (670 — legacy), Multiple Use Permit (138 — legacy), Site Inspection-Scarborough (21 — legacy).

**Search volume:** The 3 target types have minimal address overlap — 99% of addresses have only 1 target permit.
- **62,764 unique year+sequence searches** needed
- Distribution: 62,101 addresses have 1 target permit, 316 have 2, 347 have 3+
- Average: ~1.06 target permits per search

**Time estimate per permit (v2 REST API):**
- Session bootstrap (one-time per batch): **~3s**
- Per permit search (4 chained API calls via `page.evaluate`): **~1s**
- Average total per search: **~1s** (vs ~14s with v1 HTML scraping)

**Weekly pass estimates (v2):**

| Workers | Throughput | Time per Pass |
|---|---|---|
| **1** | **~3,600/hr** | **17.4 hours — viable for weekly cadence** |
| 3 | ~10,800/hr | 5.8 hours |
| 5 | ~18,000/hr | 3.5 hours |

**Recommended: 1 worker, twice-weekly cadence.** The REST API approach is fast enough that a single worker can complete the full 62K pool in under 18 hours. 8 passes/month fit within the 3GB proxy plan. Scale to 3-5 workers only if rate limiting is encountered.

**Infrastructure: Decodo (formerly Smartproxy) residential rotating proxy.**
- Plan: 3GB/month (current plan) — sufficient for ~8 full passes/month
- **v2 bandwidth per full pass: ~250 MB** (62K permits × 4 KB avg = 248 MB + proxy overhead)
- **Cadence: twice-weekly** passes comfortably fit within 3GB (8 passes × ~375 MB w/ overhead ≈ 3 GB)
- **v1 would have required: ~93 GB/week** (62K × 1.5 MB) — impossible on any reasonable plan
- Canadian IP targeting available for Toronto-area residential IPs

### 3.7 AIC Portal REST API (Discovered)

The AIC portal exposes undocumented JAX-RS REST endpoints that return structured JSON. These endpoints power the portal's JavaScript-rendered UI via AJAX calls.

**Base URL:** `https://secure.toronto.ca/ApplicationStatus`

| Step | Method | Endpoint | Payload / Params | Response |
|------|--------|----------|-----------------|----------|
| 1. Search | `POST` | `/jaxrs/search/properties` | `{folderYear, folderSequence, searchType:"0", ...}` | `[{propertyRsn, address, street, house}]` (~137 bytes) |
| 2. Folders | `POST` | `/jaxrs/search/folders` | Same as step 1 + `propertyRsn` | `[{folderRsn, folderSection, statusDesc, folderTypeDesc, ...}]` (~500 bytes) |
| 3. Detail | `GET` | `/jaxrs/search/detail/{folderRsn}` | — | `{inspectionProcesses: [{processRsn}], showStatus, ...}` (~2.5 KB) |
| 4. Status | `GET` | `/jaxrs/search/status/{folderRsn}/{processRsn}` | — | `{stages: [{desc, status, date, code}], orders: [...]}` (~800 bytes) |

**Total bandwidth per permit: ~4 KB** (vs ~1.5 MB with full-page HTML scraping).

### 3.8 Scraping Pipeline — nodriver CDP Architecture

- **Script:** `scripts/aic-scraper-nodriver.py` (replaces Playwright-based `poc-aic-scraper-v2.js`)
- **Dependencies:** `nodriver` (Python), `psycopg2-binary`
- **Architecture:** nodriver launches Chrome via Chrome DevTools Protocol (CDP) — no WebDriver protocol, no automation flags. The WAF cannot detect automation because CDP communicates through Chrome's native debugging interface, not the WebDriver API that anti-bot systems target.
- **Why nodriver:** The City of Toronto's WAF consistently blocked Playwright's WebDriver-based automation despite stealth plugins, UA rotation, Client Hints, sticky proxy sessions, and warm bootstrapping. A nodriver spike proved that CDP-based automation bypasses the WAF completely without even needing a proxy — the WebDriver protocol itself was the detection vector.
- **Step-by-step execution:** Each API call (properties → folders → detail → status) executes as a separate `page.evaluate(fetch(...), await_promise=True)` call. This is slightly more round-trips than the Playwright version's chained IIFE, but enables per-step WAF detection and cleaner error handling.
- **Flow per permit:**
  1. `POST /jaxrs/search/properties` — find address by year+sequence
  2. `POST /jaxrs/search/folders` — list all permits at address (adds `propertyRsn`)
  3. `GET /jaxrs/search/detail/{folderRsn}` — get inspection processes + `processRsn`
  4. `GET /jaxrs/search/status/{folderRsn}/{processRsn}` — get inspection stages (JSON, not HTML)
  5. Upsert stages into `permit_inspections` with `ON CONFLICT (permit_num, stage_name) DO UPDATE`
- **Proxy:** Optional. Direct connection works (nodriver bypasses WAF without proxy). Decodo residential proxy (`ca.decodo.com`) available via `PROXY_HOST`/`PROXY_PORT` env vars for IP rotation at extreme scale (30K+ permits) to avoid rate limiting.
- **Stealth:** Built into nodriver — no plugins needed. CDP does not expose `navigator.webdriver`, avoids high-risk CDP domains that anti-bot systems monitor.
- **Warm bootstrap:** Navigates to `toronto.ca` before AIC portal to build realistic referrer chain and populate cookies.
- **Error handling:** Max 3 retries with exponential backoff (2s × attempt). Per-permit try/catch — individual permit failures don't crash the batch.
- **Concurrency:** Multi-worker via orchestrator (see §3.9)

### 3.9 Multi-Worker Orchestrator

- **Script:** `scripts/aic-orchestrator.py` — spawns N concurrent nodriver workers
- **Dependencies:** Same as single-worker (`nodriver`, `psycopg2-binary`) + `asyncio.subprocess`
- **Architecture:** Orchestrator populates `scraper_queue` table from permits, then spawns N long-lived worker subprocesses in `--db-queue` mode. Each worker bootstraps Chrome once, then loops: claim batch from queue via `SELECT ... FOR UPDATE SKIP LOCKED` → scrape → mark done → claim next. Browser is reused across batches for the worker's entire lifetime. Workers report results via stdout JSON lines. Orchestrator aggregates telemetry into a single `PIPELINE_SUMMARY`.

#### Batch Claiming (DB-level locking)
- **Table:** `scraper_queue` (migration 060) — `year_seq` PK, `status` (pending/claimed/completed/failed), `claimed_by` (worker ID), `claimed_at`/`completed_at` timestamps
- **Claim query:** `UPDATE scraper_queue SET status='claimed', claimed_at=NOW(), claimed_by=$1 WHERE year_seq IN (SELECT year_seq FROM scraper_queue WHERE status='pending' ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING year_seq`
- **Why DB not Redis:** PostgreSQL is already running; adding Redis for a 3-5 worker pool is unnecessary infrastructure. `SKIP LOCKED` provides exactly the contention-free claiming needed.

#### Worker Lifecycle
1. Claim batch of 25 year_seq combos from `scraper_queue`
2. Bootstrap nodriver Chrome (warm entry via toronto.ca)
3. **Preflight stealth check:** verify `navigator.webdriver === undefined` and `window.chrome.runtime` is truthy. If either fails → abort worker, log `PREFLIGHT_FAIL`.
4. Scrape all claimed permits (same 4-step REST API chain as single-worker)
5. Mark completed/failed in `scraper_queue`
6. Kill browser, claim next batch, repeat until queue empty
7. Emit worker-level telemetry JSON to stdout on exit

#### Preflight Stealth Check
- Runs after every browser bootstrap, before any AIC requests
- Checks: `navigator.webdriver` (must be undefined/false), `window.chrome.runtime` (must be truthy)
- If 2+ workers fail preflight in the same run → orchestrator aborts all workers (CDP stealth may be compromised by Chrome update)
- Do NOT use external fingerprint sites (creepjs, bot.sannysoft) — only local JS property checks

#### Orchestrator Responsibilities
- Populate queue: `INSERT INTO scraper_queue SELECT DISTINCT ... FROM permits WHERE status='Inspection' AND permit_type = ANY(TARGET_TYPES)`
- Spawn workers: `asyncio.create_subprocess_exec('python', 'aic-scraper-nodriver.py', '--worker-id=N')`
- Monitor: read stdout JSON lines from each worker, aggregate telemetry
- Graceful shutdown: on SIGINT/SIGTERM, set shutdown flag → workers finish current permit → aggregate and emit PIPELINE_SUMMARY
- Stale claim recovery: on startup, reset any `claimed` rows older than 30 minutes back to `pending`

#### Configuration
| Env Var | Default | Description |
|---------|---------|-------------|
| `SCRAPER_WORKERS` | `1` | Number of concurrent workers |
| `SCRAPE_BATCH_SIZE` | `25` | Permits per worker batch claim |
| `PROXY_HOST` | *(unset)* | Decodo proxy host (enables proxy mode) |
| `PROXY_PORT` | *(unset)* | Decodo proxy port |
| `PROXY_USER` | *(unset)* | Decodo proxy username |
| `PROXY_PASS` | *(unset)* | Decodo proxy password |

#### Proxy (per-worker sticky sessions via Manifest V3 extension)
- Each worker gets unique Decodo sticky session: `buildo-worker-{id}-{timestamp}`
- **Auth mechanism:** Chromium ignores `user:pass` in `--proxy-server` URLs. Authentication is handled via a dynamically-generated Manifest V3 Chrome extension that intercepts `chrome.webRequest.onAuthRequired` and responds with credentials. The extension is loaded via `--load-extension=<temp_dir>` and cleaned up after the worker exits.
- Session rotated every 200 permits (same as single-worker SESSION_REFRESH_INTERVAL)
- Disabled by default — direct connection when `PROXY_HOST` is unset

#### Throughput Estimates
| Workers | Throughput | Full Pass (62K) |
|---------|-----------|-----------------|
| 1 | ~3,600/hr | 17.4 hours |
| 3 | ~10,800/hr | 5.8 hours |
| 5 | ~18,000/hr | 3.5 hours |

### 3.4 API Surfacing
- **Modify:** `GET /api/permits/[id]` to JOIN `permit_inspections` and return `inspections[]` array
- **Shape:** `{ stage_name: string, status: string, inspection_date: string | null, scraped_at: string }`
- **Sorted by:** Chronological stage order (by `inspection_date` ASC, nulls last)

### 3.5 UI Surfacing
- **Modify:** `src/app/permits/[id]/page.tsx` to render an "Inspection Progress" section
- **Rendering:** Vertical timeline/checklist of stages with status icons (checkmark=Pass, X=Fail, clock=Outstanding, half=Partial)
- **Section hidden** when no `permit_inspections` records exist for the permit
- **"Last scraped"** timestamp shown at section footer

### 3.6 Admin Integration & 6-Phase Audit Chain

- Pipeline slug `inspections` registered in admin pipeline definitions
- Trigger via `POST /api/admin/pipelines/inspections`
- Freshness tracked in `pipeline_runs` table
- Schedule: Weekly (for active permits across 5 target types)

**Chain:** `deep_scrapes` (7 steps):
```
inspections → classify_inspection_status → assert_network_health → refresh_snapshot → assert_data_bounds → assert_staleness → assert_engine_health
```

Every step emits a structured `audit_table` in `records_meta` with a consistent shape:
```json
{ "audit_table": { "phase": N, "name": "...", "verdict": "PASS|FAIL|WARN|SKIP", "rows": [{ "metric": "...", "value": ..., "threshold": "...|null", "status": "PASS|FAIL|WARN|INFO|SKIP" }] } }
```

#### Step 1: `inspections` (Phase 1 — Data Ingestion)
**Script:** `scripts/poc-aic-scraper-v2.js`
**Objective:** Execute the core extraction loop (Playwright/REST API) to pull live permit and inspection data from the AIC portal and upsert into PostgreSQL.

| Metric | Source | Threshold | Level |
|--------|--------|-----------|-------|
| `permits_attempted` | `tel.permits_attempted` | — | INFO |
| `permits_found` | `tel.permits_found` | — | INFO |
| `not_found_count` | `tel.not_found_count` | — | INFO |
| `records_inserted` | `tel.total_upserted` | — | INFO |
| `records_updated` | `tel.status_changes` | — | INFO |
| `duration_ms` | elapsed time | — | INFO |
| `exit_code` | process exit | `== 0` | PASS/FAIL |
| `pipeline_summary_emitted` | PIPELINE_SUMMARY output | `== true` | PASS/FAIL |

**Pass criteria:** Exit code 0 AND PIPELINE_SUMMARY emitted. Finding 0 new permits is still PASS provided the script checked sequences without crashing.

**Scraper observability (telemetry in `records_meta.scraper_telemetry`):**
- `permits_attempted/found/scraped` — funnel visibility
- `proxy_errors` — retries exhausted count (all 3 attempts failed)
- `consecutive_empty_max` — peak consecutive empty responses (WAF trap indicator)
- `session_refreshes/bootstraps/failures` — WAF session health
- `schema_drift[]` — AIC API field changes detected
- `latency.p50/p95/max` — per-request timing in ms
- Exponential backoff: 2s → 4s → 8s
- WAF trap auto-recovery: 20 consecutive empty → full browser re-bootstrap

#### Step 2: `assert_network_health` (Phase 2 — Network Health)
**Script:** `scripts/quality/assert-network-health.js`
**Objective:** Validate the operational health of the scraping infrastructure by reading the telemetry JSON from the latest `inspections` run.

| Metric | Source | Threshold | Level |
|--------|--------|-----------|-------|
| `schema_drift_count` | `scTel.schema_drift.length` | `== 0` | FAIL |
| `proxy_error_rate` | `proxy_errors / permits_attempted * 100` | `< 5%` | FAIL |
| `avg_latency_ms` | `scTel.latency.p50` | `< 2000` | WARN |
| `max_latency_ms` | `scTel.latency.max` | — | INFO |
| `consecutive_empty_hit` | `consecutive_empty_max >= 20` | `== false` | WARN |
| `session_bootstraps` | `scTel.session_bootstraps` | — | INFO |
| `session_failures` | `scTel.session_failures` | — | WARN if > 0 |

**Pass criteria:** `schema_drift_count == 0` AND `proxy_error_rate < 5%`.

#### Step 3: `refresh_snapshot` (Phase 5 — Refresh Snapshot)
**Script:** `scripts/refresh-snapshot.js`
**Objective:** Copy current state into historical ledger for time-series analytics.

| Metric | Source | Threshold | Level |
|--------|--------|-----------|-------|
| `snapshots_created` | snapshot insert count | — | INFO |
| `snapshot_duration_ms` | elapsed time | — | INFO |
| `inspection_history_table` | table existence | — | SKIP (Phase 2) |

**Pass criteria:** Snapshot transaction commits without FK/unique violations.

#### Step 4: `assert_data_bounds` (Phase 3 — Data Quality)
**Script:** `scripts/quality/assert-data-bounds.js`
**Objective:** Run SQL queries to prove ingested data is structurally sound, logically valid, and free of anomalies.

| Metric | SQL Check | Threshold | Level |
|--------|-----------|-----------|-------|
| `null_permit_num` | `COUNT(*) WHERE permit_num IS NULL OR ''` | `== 0` | FAIL |
| `null_stage_name` | `COUNT(*) WHERE stage_name IS NULL OR ''` | `== 0` | FAIL |
| `null_status` | `COUNT(*) WHERE status IS NULL OR ''` | `== 0` | FAIL |
| `null_scraped_at` | `COUNT(*) WHERE scraped_at IS NULL` | `== 0` | FAIL |
| `orphan_inspections` | `LEFT JOIN permits WHERE p.permit_num IS NULL` | `== 0` | FAIL |
| `invalid_status` | `WHERE status NOT IN ('Outstanding','Passed','Not Passed','Partial')` | `== 0` | FAIL |
| `outstanding_with_date` | `WHERE status='Outstanding' AND inspection_date IS NOT NULL` | `== 0` | WARN |
| `completed_without_date` | `WHERE status!='Outstanding' AND inspection_date IS NULL` | `== 0` | WARN |
| `duplicate_stages` | `GROUP BY (permit_num, stage_name) HAVING COUNT(*)>1` | `== 0` | FAIL |
| `future_dates` | `WHERE inspection_date > CURRENT_DATE` | `== 0` | FAIL |
| `ancient_dates` | `WHERE inspection_date < '2020-01-01'` | `== 0` | FAIL |
| `date_before_permit_year` | `WHERE YEAR(date) < 2000 + YY` | `== 0` | FAIL |

**Pass criteria:** All FAIL-level metrics return 0 rows.

#### Step 5: `assert_staleness` (Phase 4 — Staleness Monitor)
**Script:** `scripts/quality/assert-staleness.js`
**Objective:** Detect pipeline blind spots — permits the scraper has silently abandoned.

| Metric | SQL Check | Threshold | Level |
|--------|-----------|-----------|-------|
| `total_target_permits` | `COUNT(*) WHERE status='Inspection' AND permit_type = ANY(TARGET_TYPES)` | — | INFO |
| `scraped_permits` | `COUNT(DISTINCT pi.permit_num) ... JOIN permit_inspections` | — | INFO |
| `never_scraped` | `total - scraped` | — | INFO |
| `coverage_pct` | `scraped / total * 100` | — | INFO |
| `max_days_stale` | `MAX(CURRENT_DATE - scraped_at::date)` | — | INFO |
| `stale_over_14d` | `COUNT(*) WHERE scraped_at < NOW() - '14 days'` | `== 0` | WARN (early) / FAIL (prod) |

**Early phase:** `coverage_pct < 5%` → staleness is WARN, not FAIL.
**Production phase:** `coverage_pct ≥ 5%` → staleness is FAIL.
**Pass criteria:** No scraped permits stale > 14 days (adjusting for coverage phase).

#### Step 6: `assert_engine_health` (Phase 6 — Engine Health)
**Script:** `scripts/quality/assert-engine-health.js`
**Objective:** Read PostgreSQL system catalogs to ensure upsert logic isn't bloating the disk.

| Metric | Source | Threshold | Level |
|--------|--------|-----------|-------|
| `live_rows` | `pg_stat_user_tables.n_live_tup` for `permit_inspections` | — | INFO |
| `dead_rows` | `n_dead_tup` | — | INFO |
| `dead_tuple_pct` | `dead / (live + dead) * 100` | `< 10%` | FAIL |
| `update_insert_ratio` | `n_tup_upd / n_tup_ins` | `< 5.0` | FAIL |
| `last_autovacuum` | `last_autovacuum` timestamp | — | INFO |

**Pass criteria:** `dead_tuple_pct < 10%` AND `update_insert_ratio < 5.0`.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`inspections.logic.test.ts, quality.logic.test.ts`): Inspection Parser; Data Effectiveness Score; Extract Matching Metrics; DataQualitySnapshot Shape Validation; parseSnapshot coerces NUMERIC fields from strings; Neighbourhood count must not exceed active permits; Builder accuracy uses permits_with_builder / active_permits; Builder tier percentages; Work Scope split: classification vs detailed tags; Pipeline Registry; Pipeline Chains; trendDelta(); findSnapshotDaysAgo(); Funnel computation (extracted to lib/admin/funnel); detectVolumeAnomalies(); detectSchemaDrift(); computeSystemHealth(); SLA_TARGETS; Enrichment Funnel; Snapshot includes null tracking and violation fields
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `migrations/045_permit_inspections.sql` (new table)
- `scripts/poc-aic-scraper.js` (v1 scraper — HTML scraping, superseded)
- `scripts/poc-aic-scraper-v2.js` (v2 scraper — hybrid REST API, active — add audit_table)
- `scripts/quality/assert-network-health.js` (NEW — Phase 2 network health)
- `scripts/quality/assert-staleness.js` (NEW — Phase 4 staleness monitor)
- `scripts/quality/assert-data-bounds.js` (enhance — add NULL/ancient checks, emit audit_table)
- `scripts/quality/assert-engine-health.js` (enhance — add inspection audit_table)
- `scripts/refresh-snapshot.js` (enhance — add inspection audit_table)
- `scripts/manifest.json` (register 2 new scripts, update deep_scrapes chain)
- `src/lib/inspections/parser.ts` (HTML table parsing logic)
- `src/lib/permits/types.ts` (add `Inspection` interface)
- `src/lib/admin/funnel.ts` (add 2 new slugs to PIPELINE_REGISTRY)
- `src/app/api/permits/[id]/route.ts` (add inspections JOIN)
- `src/app/permits/[id]/page.tsx` (add Inspection Progress section)
- `src/components/FreshnessTimeline.tsx` (register pipeline slugs, wire AuditTablePanel)
- `src/components/funnel/FunnelPanels.tsx` (new AuditTablePanel component)
- `src/app/api/admin/pipelines/[slug]/route.ts` (register pipeline script)
- `src/tests/factories.ts` (add `createMockInspection` factory)
- `src/tests/inspections.logic.test.ts` (new)
- `src/tests/quality.logic.test.ts` (update pipeline registry counts)

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Inspection scraping is a separate pipeline.
- **`scripts/load-permits.js`**: Governed by Spec 02. No modifications to core ingestion.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: New `permit_inspections` table links to `permits.permit_num`.
- Relies on **Spec 06 (Data API)**: Modifies `GET /api/permits/[id]` to include inspections.
- Relies on **Spec 18 (Permit Detail)**: Adds new UI section to permit detail page.
- Relies on **Spec 26 (Admin)**: Registers new pipeline for admin trigger/monitoring.
