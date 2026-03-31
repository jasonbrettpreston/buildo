# Chain: Deep Scrapes (AIC Inspection Portal)

<requirements>
## 1. Goal & User Story
As a tradesperson, I want real-time inspection statuses (Pass/Fail/Outstanding) scraped from the City of Toronto's walled-garden AIC portal — so I can identify exactly where a project stands and time my outreach to the right construction phase.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js deep_scrapes` or `POST /api/admin/pipelines/chain_deep_scrapes`
**Schedule:** On-demand (admin-triggered)
**Steps:** 7 (sequential, stop-on-failure)
**Gate:** None

```
inspections → classify_inspection_status → assert_network_health →
refresh_snapshot → assert_data_bounds → assert_staleness →
assert_engine_health
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `inspections` | `aic-orchestrator.py` | Scrape inspection stages from AIC portal via nodriver CDP | permit_inspections, permits, scraper_queue |
| 2 | `classify_inspection_status` | `classify-inspection-status.js` | Derive `enriched_status` from scraped stages | permits |
| 3 | `assert_network_health` | `quality/assert-network-health.js` | Verify scraper connectivity and proxy health | — |
| 4 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics with inspection coverage | data_quality_snapshots |
| 5 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Inspection-scoped: NULL rates, ancient dates, ghost records | pipeline_runs |
| 6 | `assert_staleness` | `quality/assert-staleness.js` | Monitor scrape freshness and stale permit detection | — |
| 7 | `assert_engine_health` | `quality/assert-engine-health.js` | Dead tuple ratio for permit_inspections table | engine_health_snapshots |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- AIC Portal: `https://secure.toronto.ca/ApplicationStatus` (session-gated, JS-rendered)
- Permits with `status = 'Inspection'` and `permit_type` in target types
- `scraper_queue` table for db-queue worker mode

### Scraper Architecture (nodriver CDP)
The scraper uses Python `nodriver` (Chrome DevTools Protocol) — not Selenium/Playwright — because the AIC WAF blocks WebDriver automation. All data requests use `page.evaluate(fetch(...))` which executes native browser `fetch()` calls from Chrome's network stack.

**4-Step API Chain per permit:**
1. `POST /jaxrs/search/properties` — find property by year+sequence
2. `POST /jaxrs/search/folders` — get all permit folders at address
3. `GET /jaxrs/search/detail/{folderRsn}` — permit detail + inspection processes
4. `GET /jaxrs/search/status/{folderRsn}/{processRsn}` — inspection stage table

**Anti-Detection (6 layers):**
1. Screen dimension overrides (fix headless 800x600 leak)
2. `--disable-blink-features=AutomationControlled` (suppress `cdc_` variables)
3. Persistent `user_data_dir` per worker (cookie reuse across runs)
4. Coherent fingerprint profiles (viewport + platform + UA paired)
5. WAF-triggered proxy rotation (residential IPs, 1 batch = 1 IP)
6. Shuffled batch order + randomized batch sizes (5-15)

**Execution model (db-queue mode):**
- Claims batch from `scraper_queue` via `FOR UPDATE SKIP LOCKED`
- Each batch gets fresh Decodo residential proxy session (new IP)
- Chrome killed after each batch — no IP sees more than 5-15 permits
- WAF detection: 20+ consecutive empty results → immediate proxy rotation

### Core Logic
1. **Inspection scraping** — for each permit in queue, execute 4-step API chain. Parse inspection stages: stage name, status (Outstanding/Passed/Not Passed/Partial), date, inspector.
2. **DB upsert** — `INSERT INTO permit_inspections ON CONFLICT (permit_num, stage_name) DO UPDATE` with `IS DISTINCT FROM` guards. Only updates when status or date actually changes.
3. **Enriched status derivation** — `classify_inspection_status` computes `enriched_status` from stages:
   - All Outstanding → `'Permit Issued'`
   - All Passed → `'Inspections Complete'`
   - Any Not Passed → `'Not Passed'`
   - Mixed → `'Active Inspection'`
4. **Network health** — verifies proxy connectivity, checks for WAF blocks in recent pipeline_runs
5. **Staleness** — flags permits with stale `scraped_at` (>7 days), monitors consecutive empty streaks

### Outputs
- `permit_inspections` table: stage-level status records per permit
- `permits.enriched_status`: derived lifecycle status
- `scraper_queue` table: batch status tracking (pending/claimed/completed/failed)
- Telemetry in `records_meta`: permits_attempted, permits_found, latency p50/p95, proxy errors

### Edge Cases
- AIC returns HTML instead of JSON → WAF block detected, proxy rotated
- Permit has `status = 'Revision Issued'` on AIC → no inspections data (only rev 00 has them)
- `showStatus = false` on permit detail → no inspection link available, set `enriched_status = 'Permit Issued'`
- All retries exhausted for a permit → skip and continue, mark as failed in queue
- Portal DOM restructure → scraper breaks immediately (relies on REST API, not DOM selectors)
</behavior>

---

<quality>
## 4. Data Quality Assertions

### Network health (assert_network_health)
| Check | Threshold | Level |
|-------|-----------|-------|
| Last successful scrape | within 24h | WARN |
| Proxy error rate | > 50% | FAIL |

### Staleness (assert_staleness)
| Check | Threshold | Level |
|-------|-----------|-------|
| Permits with stale `scraped_at` (>7d) | > 20% of active | WARN |
| Consecutive empty max | > WAF_TRAP_THRESHOLD (20) | WARN |

### Data bounds (assert_data_bounds, deep_scrapes scope)
| Check | Threshold | Level |
|-------|-----------|-------|
| permit_inspections NULL status | > 0 | FAIL |
| Ancient inspection dates (>5 years) | > 0 | WARN |
| Ghost permits (not seen in 30+ days) | > 0 | WARN |
</quality>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `inspections.logic.test.ts` (status normalization, enriched_status derivation, date parsing, API chain mocking)
- **Logic:** `chain.logic.test.ts` (deep_scrapes chain definition)
- **Infra:** `quality.infra.test.ts` (assert-network-health, assert-staleness scripts exist)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/manifest.json` (deep_scrapes chain array)
- `scripts/aic-scraper-nodriver.py` — nodriver CDP scraper
- `scripts/aic-orchestrator.py` — multi-worker orchestrator
- `scripts/classify-inspection-status.js`
- `scripts/quality/assert-network-health.js`, `scripts/quality/assert-staleness.js`

### Out-of-Scope Files
- `scripts/poc-aic-scraper-v2.js` — legacy JS scraper (deprecated)
- `src/app/permits/[id]/page.tsx` — inspection UI rendering

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `chain_permits.md` (permits must be loaded first — scraper targets permits with `status = 'Inspection'`)
</constraints>
