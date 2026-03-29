# Active Task: Multi-Worker Scraper Orchestrator
**Status:** Implementation (WF3 — Review Agent Fixes)
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `bee15998` (bee15998ef20a3ad409ca4b26758bde67584be36)

## Context
* **Goal:** Build a multi-worker orchestrator that spawns 3-5 concurrent nodriver (Python) scraper processes, each claiming batches from a shared queue via DB-level locking. This enables scraping the full 62K+ inspection pool in ~4 hours instead of ~17 hours. Phase 1 uses direct connections; proxy integration (Decodo) is pre-wired but disabled by default.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-scraper-nodriver.py` (modify: accept batch from orchestrator via stdin/args, remove self-querying)
  - `scripts/aic-orchestrator.py` (NEW: multi-worker orchestrator)
  - `scripts/manifest.json` (update: point `inspections` slug to orchestrator)
  - `scripts/run-chain.js` (no changes needed — already handles Python scripts)
  - `migrations/060_scraper_queue.sql` (NEW: batch claiming infrastructure)

## Technical Implementation

### 1. Database: Batch Claiming Table (`scraper_queue`)
Migration `060_scraper_queue.sql`:
```sql
-- UP
CREATE TABLE scraper_queue (
  year_seq     VARCHAR(20) PRIMARY KEY,   -- "24 132854"
  permit_type  TEXT NOT NULL,
  claimed_at   TIMESTAMPTZ,
  claimed_by   TEXT,                       -- worker ID (e.g. "worker-1")
  completed_at TIMESTAMPTZ,
  status       VARCHAR(20) DEFAULT 'pending',  -- pending | claimed | completed | failed
  error_msg    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_scraper_queue_status ON scraper_queue (status) WHERE status = 'pending';
-- DOWN
DROP TABLE IF EXISTS scraper_queue;
```

### 2. Orchestrator Script (`scripts/aic-orchestrator.py`)
- **Responsibilities:**
  1. Populate `scraper_queue` from permits table (same query as current batch mode)
  2. Spawn N worker subprocesses (default 3, configurable via `SCRAPER_WORKERS`)
  3. Each worker: claim batch → bootstrap nodriver → scrape → release batch → repeat
  4. Aggregate telemetry from all workers into single PIPELINE_SUMMARY
  5. Handle worker failures (mark batch as failed, redistribute)
- **Batch claiming:** Each worker runs `UPDATE scraper_queue SET status='claimed', claimed_at=NOW(), claimed_by=$1 WHERE year_seq IN (SELECT year_seq FROM scraper_queue WHERE status='pending' ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING year_seq`
- **Worker lifecycle:** Each worker is a separate Python asyncio process. Workers communicate results back via stdout JSON lines. Orchestrator reads and aggregates.
- **Graceful shutdown:** On SIGINT/SIGTERM, orchestrator sets a shutdown flag → workers finish current permit then exit → orchestrator aggregates and emits PIPELINE_SUMMARY.

### 3. Worker Mode for Existing Scraper
Modify `aic-scraper-nodriver.py` to accept `--worker-id=N` and `--year-seqs=file.json` args:
- When `--worker-id` is present, skip DB query for batch selection (orchestrator handles it)
- Read year_seq list from stdin or temp file
- Emit per-permit JSON results to stdout for orchestrator aggregation
- Worker-level telemetry (own bootstraps, latencies, errors)

### 3b. Preflight Stealth Check
Every worker runs a fingerprint verification **before scraping any permits:**
1. After browser bootstrap, execute `page.evaluate("navigator.webdriver")` — must return `undefined` or `false`
2. Check `page.evaluate("window.chrome && window.chrome.runtime")` — must be truthy (real Chrome)
3. If any check fails → abort worker immediately, log `PREFLIGHT_FAIL` with details
4. Do NOT hit external fingerprint-testing sites (creepjs, bot.sannysoft) from production workers — only check local JS properties
5. Orchestrator treats preflight failure as a fatal signal: if 2+ workers fail preflight, abort the entire run (CDP may be compromised by a Chrome update)

### 4. Manifest Update
- `inspections` slug points to `scripts/aic-orchestrator.py`
- Old single-worker mode preserved: `SCRAPER_WORKERS=1` (default for backward compat in dev)
- Chain `deep_scrapes` unchanged — orchestrator emits same PIPELINE_SUMMARY format

### 5. Proxy Pre-wiring (Disabled)
- Each worker gets unique Decodo sticky session ID: `worker-{id}-{timestamp}`
- Env vars: `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER`, `PROXY_PASS`
- Disabled when `PROXY_HOST` is unset (default) — direct connection

* **New/Modified Components:** None (pipeline scripts only)
* **Data Hooks/Libs:** None
* **Database Impact:** YES — new `scraper_queue` table (empty, no backfill needed)

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Worker crash mid-batch, DB connection loss, WAF rate limiting, all workers fail
* **logError Mandate:** N/A — pipeline scripts use `pipeline.log` / Python `log()`
* **Mobile-First:** N/A — backend pipeline only

## Execution Plan
- [ ] **Contract Definition:** N/A — no API routes created.
- [ ] **Spec & Registry Sync:** Update `docs/specs/38_inspection_scraping.md` §3.8 to document multi-worker architecture. Run `npm run system-map`.
- [ ] **Schema Evolution:** Write `migrations/060_scraper_queue.sql` with UP + DOWN. Run `npm run migrate` then `npm run db:generate`. Update factories if needed.
- [ ] **Test Scaffolding:** Add orchestrator tests to `src/tests/inspections.logic.test.ts` — batch claiming SQL, telemetry aggregation, worker failure handling.
- [ ] **Red Light:** Run `npm run test`. Must see failing tests.
- [ ] **Implementation:**
  - [ ] 6a. Add preflight stealth check to `aic-scraper-nodriver.py` (navigator.webdriver, chrome.runtime)
  - [ ] 6b. Modify `aic-scraper-nodriver.py` to support worker mode (`--worker-id`, stdin batch)
  - [ ] 6c. Create `scripts/aic-orchestrator.py` — queue population, worker spawning, telemetry aggregation, preflight abort logic
  - [ ] 6d. Update `scripts/manifest.json` — point `inspections` to orchestrator
- [ ] **Auth Boundary & Secrets:** N/A — no API routes. Proxy credentials stay in `.env` (server-side only).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Output visible execution summary using ✅/⬜ for every step above. → WF6.
