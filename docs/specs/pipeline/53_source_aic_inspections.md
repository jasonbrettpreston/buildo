# Source: AIC Inspection Portal (Scraper)

<requirements>
## 1. Goal & User Story
As a tradesperson, I need real-time inspection statuses scraped from the City of Toronto's walled-garden AIC portal — so I can see exactly where a project stands (Pass/Fail/Outstanding) and time my outreach to the right construction phase.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **Portal** | `https://secure.toronto.ca/ApplicationStatus` |
| **Method** | nodriver CDP (Chrome DevTools Protocol) — not Selenium/Playwright |
| **Format** | REST JSON API via `page.evaluate(fetch(...))` |
| **Schedule** | On-demand (admin-triggered via `chain_deep_scrapes`) |
| **Scripts** | `scripts/aic-scraper-nodriver.py`, `scripts/aic-orchestrator.py` |
| **Anti-detection** | 6 stealth layers (see chain_deep_scrapes.md §3) |

### Target Table: `permit_inspections`
| Column | Type | Notes |
|--------|------|-------|
| `permit_num` | TEXT | PK part 1 — matches `permits.permit_num` |
| `stage_name` | TEXT | PK part 2 — e.g., "Footings/Foundations" |
| `status` | TEXT | Outstanding, Passed, Not Passed, Partial |
| `inspection_date` | DATE | Date of last inspection |
| `scraped_at` | TIMESTAMPTZ | When this row was last scraped |

**Composite PK:** `(permit_num, stage_name)`
**Upsert:** `ON CONFLICT (permit_num, stage_name) DO UPDATE` with `IS DISTINCT FROM` guards

### 4-Step API Chain per Permit
1. `POST /jaxrs/search/properties` — find property by year+sequence
2. `POST /jaxrs/search/folders` — get all permit folders at address
3. `GET /jaxrs/search/detail/{folderRsn}` — permit detail + inspection processes
4. `GET /jaxrs/search/status/{folderRsn}/{processRsn}` — inspection stage table

### Application Number Format
```
YY NNNNNN TYPE REV WORK
24 132854  BLD  00  BA
```
Our `permit_num` = `YY NNNNNN TYPE` (3 parts). The portal adds revision + work type.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- Permits with `status = 'Inspection'` and `permit_type` in target types
- Target types: Small Residential, Building Additions/Alterations, New Houses
- `scraper_queue` table for db-queue worker mode

### Core Logic
1. Claim batch from queue (`FOR UPDATE SKIP LOCKED`)
2. Launch Chrome with coherent fingerprint profile + proxy extension
3. For each permit: execute 4-step API chain inside Chrome
4. Parse inspection stages: normalize status, parse dates
5. Upsert to `permit_inspections` with change detection
6. Derive `enriched_status` from stages and write to `permits`
7. Kill browser after batch, rotate to new residential IP

### Status Normalization (Spec 38 §3.4)
| Raw AIC Value | Normalized |
|---------------|------------|
| "outstanding" | Outstanding |
| "pass", "passed" | Passed |
| "fail", "failed", "not passed" | Not Passed |
| "partial", "partially completed" | Partial |

### Enriched Status Derivation
| Condition | `enriched_status` |
|-----------|-------------------|
| All stages Outstanding | Permit Issued |
| All stages Passed | Inspections Complete |
| Any stage Not Passed | Not Passed |
| Mixed statuses | Active Inspection |

### Outputs
- `permit_inspections` table: stage-level rows
- `permits.enriched_status`: lifecycle status
- PIPELINE_SUMMARY with scraper telemetry

### Edge Cases
- AIC returns HTML instead of JSON → WAF block, proxy rotated
- `showStatus = false` on permit detail → no inspection link, set `enriched_status = 'Permit Issued'`
- Revision permits (rev 01+) → no inspections (only rev 00 has them)
- All retries exhausted → skip permit, mark failed in queue
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `inspections.logic.test.ts` (status normalization, enriched_status derivation, date parsing, 4-step API chain mocking)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/aic-scraper-nodriver.py`
- `scripts/aic-orchestrator.py`

### Out-of-Scope
- `scripts/poc-aic-scraper-v2.js` — deprecated legacy JS scraper
- `src/app/permits/[id]/page.tsx` — UI rendering

### Cross-Spec Dependencies
- **Consumed by:** `chain_deep_scrapes.md` (step 1)
- **Relies on:** `chain_permits.md` (permits must be loaded first)
- **Relies on:** `pipeline_system.md` (SDK for orchestrator)
</constraints>
