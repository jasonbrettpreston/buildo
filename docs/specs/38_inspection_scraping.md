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

### 3.8 Scraping Pipeline — Hybrid "Puppet Master" Architecture

- **Script:** `scripts/poc-aic-scraper-v2.js` (replaces v1 `poc-aic-scraper.js`)
- **Dependencies:** `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`
- **Architecture:** Playwright launches once to establish a WAF-compliant browser session (TLS fingerprint + JSESSIONID). All subsequent data fetching uses `page.evaluate(fetch(...))` — executing native `fetch()` calls from within Chrome's network stack. No page navigation, no HTML parsing, no DOM interaction after init.
- **Why hybrid:** The WAF performs JA3/JA4 TLS fingerprinting — raw Node.js `https` requests get 403'd even with valid session cookies. Running `fetch()` inside `page.evaluate()` inherits Chrome's exact TLS fingerprint.
- **Chained execution:** All 4 API calls (properties → folders → detail → status) execute inside a single `page.evaluate()` call, eliminating Node↔Browser IPC round-trips. The browser-side JavaScript chains the fetches and returns the complete result set to Node in one shot.
- **Flow per permit:**
  1. `POST /jaxrs/search/properties` — find address by year+sequence
  2. `POST /jaxrs/search/folders` — list all permits at address (adds `propertyRsn`)
  3. `GET /jaxrs/search/detail/{folderRsn}` — get inspection processes + `processRsn`
  4. `GET /jaxrs/search/status/{folderRsn}/{processRsn}` — get inspection stages (JSON, not HTML)
  5. Upsert stages into `permit_inspections` with `ON CONFLICT (permit_num, stage_name) DO UPDATE`
- **Proxy:** Decodo residential rotating proxy (`ca.decodo.com`, ports 20001-20010). Credentials via `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER`, `PROXY_PASS` env vars. Required for rate limiting at scale, not for WAF bypass (browser session handles WAF).
- **Stealth:** `playwright-extra` + `puppeteer-extra-plugin-stealth` + custom UA string. Required for initial session bootstrap — the WAF blocks bare headless Chrome.
- **Asset blocking:** Route interception aborts all non-document/XHR/fetch resources during session init. After init, all data flows through `fetch()` (no page loads).
- **Error handling:** Max 3 retries with exponential backoff (2s × attempt). Per-permit try/catch — individual permit failures don't crash the batch.
- **Concurrency:** Single-threaded PoC; queue-based concurrency deferred to Phase 2

### 3.8 Queue System (Phase 2)
- BullMQ + Redis for job queue
- `scripts/queue-inspections.js` selects permits in target types with status = "Inspection"
- **5 concurrent Playwright workers** processing from queue (completes full pass in ~2 days)
- Fresh browser context every ~50-100 searches to prevent memory leaks
- Automatic retry with exponential backoff on failure (30s → 60s → 120s, max 3 attempts)
- Dead letter queue for permits that fail all retries — logged for manual review
- Checkpoint/resume: tracks progress via `scraped_at` timestamp — pipeline restarts pick up where they left off
- **Schedule:** Weekly full pass of all target permits in "Inspection" status

### 3.4 API Surfacing
- **Modify:** `GET /api/permits/[id]` to JOIN `permit_inspections` and return `inspections[]` array
- **Shape:** `{ stage_name: string, status: string, inspection_date: string | null, scraped_at: string }`
- **Sorted by:** Chronological stage order (by `inspection_date` ASC, nulls last)

### 3.5 UI Surfacing
- **Modify:** `src/app/permits/[id]/page.tsx` to render an "Inspection Progress" section
- **Rendering:** Vertical timeline/checklist of stages with status icons (checkmark=Pass, X=Fail, clock=Outstanding, half=Partial)
- **Section hidden** when no `permit_inspections` records exist for the permit
- **"Last scraped"** timestamp shown at section footer

### 3.6 Admin Integration
- New pipeline slug `inspections` registered in admin pipeline definitions
- Trigger via `POST /api/admin/pipelines/inspections`
- Freshness tracked in `pipeline_runs` table
- Schedule: Weekly (for active permits across 5 target types)
- **Chain:** `deep_scrapes` = `inspections` → `refresh_snapshot` → `assert_data_bounds` → `assert_engine_health`
- Quality tail steps provide: snapshot metrics capture, data bounds validation, and engine health checks after each scrape run
- **Inspection-specific assert-data-bounds checks (13 total):**
  - Basic: row count, orphaned rows (FK), invalid status values, Outstanding-with-date, completed-without-date, duplicate stages
  - Coverage: per-type scrape coverage (all 5 TARGET_TYPES must have >0), scrape staleness (>30 days), thin data detection (single Outstanding stage)
  - Integrity: stage count >20 (duplication), future dates, date-before-permit-year
  - Transitions: status change count from latest scraper run (via records_updated in pipeline_runs)
- **Scraper tracks status changes:** upsert checks previous status before writing; emits count as `records_updated` in PIPELINE_SUMMARY

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`inspections.logic.test.ts, quality.logic.test.ts`): Inspection Parser; Data Effectiveness Score; Extract Matching Metrics; DataQualitySnapshot Shape Validation; parseSnapshot coerces NUMERIC fields from strings; Neighbourhood count must not exceed active permits; Builder accuracy uses permits_with_builder / active_permits; Builder tier percentages; Work Scope split: classification vs detailed tags; Pipeline Registry; Pipeline Chains; trendDelta(); findSnapshotDaysAgo(); Funnel computation (extracted to lib/admin/funnel); detectVolumeAnomalies(); detectSchemaDrift(); computeSystemHealth(); SLA_TARGETS; Enrichment Funnel; Snapshot includes null tracking and violation fields
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `migrations/045_permit_inspections.sql` (new table)
- `scripts/poc-aic-scraper.js` (v1 scraper — HTML scraping, superseded)
- `scripts/poc-aic-scraper-v2.js` (v2 scraper — hybrid REST API, active)
- `src/lib/inspections/parser.ts` (HTML table parsing logic)
- `src/lib/permits/types.ts` (add `Inspection` interface)
- `src/app/api/permits/[id]/route.ts` (add inspections JOIN)
- `src/app/permits/[id]/page.tsx` (add Inspection Progress section)
- `src/components/FreshnessTimeline.tsx` (register `inspections` pipeline slug)
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
