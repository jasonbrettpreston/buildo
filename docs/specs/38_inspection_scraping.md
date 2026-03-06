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

### 3.1 Database Schema
- **New table: `permit_inspections`**
  - `id` SERIAL PRIMARY KEY
  - `permit_num` VARCHAR(30) NOT NULL (FK to `permits.permit_num`)
  - `stage_name` TEXT NOT NULL (dynamic, exactly as scraped: e.g. "Structural Framing", "Rough-in Plumbing")
  - `status` VARCHAR(20) NOT NULL (values: "Outstanding", "Pass", "Fail", "Partial")
  - `inspection_date` DATE (nullable -- Outstanding stages have no date)
  - `scraped_at` TIMESTAMP NOT NULL DEFAULT now()
  - `created_at` TIMESTAMP NOT NULL DEFAULT now()
  - UNIQUE constraint on `(permit_num, stage_name)`
- **Indexes:** B-tree on `permit_num`; partial index on `status = 'Outstanding'` for active-stage queries.
- **No FK to revision_num** -- inspections are tracked per application number, not per revision.

### 3.2 Scraping Pipeline (Phase 1 -- PoC)
- **Script:** `scripts/poc-aic-scraper.js`
- **Dependencies:** `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`
- **Flow per permit:**
  1. Initialize session at `setup.do?action=init`
  2. Input permit application number, execute search
  3. Navigate accordion to "Inspections" > "Status"
  4. Parse HTML table: columns = `stage_name`, `status`, `inspection_date`
  5. Upsert into `permit_inspections` with `ON CONFLICT (permit_num, stage_name) DO UPDATE`
- **Proxy:** Smartproxy residential rotating proxy (credentials via `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER`, `PROXY_PASS` env vars)
- **Error handling:** Timeout (30s per page), proxy rotation on 403/429, max 3 retries per permit
- **Concurrency:** Single-threaded PoC; queue-based concurrency deferred to Phase 2

### 3.3 Queue System (Phase 2 -- Deferred)
- BullMQ + Redis for job queue
- `scripts/queue-inspections.js` selects eligible permits (active, residential, not scraped in last 7 days)
- 2-3 concurrent Playwright workers processing from queue
- Automatic retry with exponential backoff on failure

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
- Schedule: Daily (for active permits only)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`inspections.logic.test.ts, quality.logic.test.ts`): Inspection Parser; Data Effectiveness Score; Extract Matching Metrics; DataQualitySnapshot Shape Validation; parseSnapshot coerces NUMERIC fields from strings; Neighbourhood count must not exceed active permits; Builder accuracy uses permits_with_builder / active_permits; Builder tier percentages; Work Scope split: classification vs detailed tags; Pipeline Registry; Pipeline Chains; trendDelta(); findSnapshotDaysAgo(); Funnel computation (extracted to lib/admin/funnel); detectVolumeAnomalies(); detectSchemaDrift(); computeSystemHealth(); SLA_TARGETS; Enrichment Funnel; Snapshot includes null tracking and violation fields
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `migrations/045_permit_inspections.sql` (new table)
- `scripts/poc-aic-scraper.js` (new scraper script)
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
