# Active Task: Deep Scrapes Pipeline — Decouple Chain, Multi-Type Test, Full Run
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** The `deep_scrapes` chain currently bundles `inspections` + `coa_documents` (which doesn't exist yet). This task: (1) decouples them so inspections runs standalone, (2) expands TARGET_TYPES to cover all meaningful permit types, (3) defines a small test run across all types, and (4) prepares for the full production run (~66K+ permits).
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/poc-aic-scraper-v2.js` — v2 scraper (expand TARGET_TYPES, configurable batch size)
  - `scripts/manifest.json` — decouple `deep_scrapes` chain, remove `coa_documents` coupling
  - `src/app/api/admin/pipelines/[slug]/route.ts` — add `chain_deep_scrapes` if needed, or remove chain
  - `docs/specs/38_inspection_scraping.md` — update permit type coverage

## Technical Implementation
* **New/Modified Components:** None (no UI changes)
* **Data Hooks/Libs:** None
* **Database Impact:** NO — `permit_inspections` table already exists (migration 045), no schema changes needed

## Current State Analysis

### Permit Types in "Inspection" Status (from DB)
| Permit Type | Count | AIC Portal? | Current Coverage |
|---|---|---|---|
| Small Residential Projects | 35,557 | Yes (SR) | TARGET |
| Plumbing(PS) | 35,325 | Yes (PLB) | Not scraped |
| Mechanical(MS) | 25,719 | Yes (HVA) | Not scraped |
| Building Additions/Alterations | 20,544 | Yes (BA) | TARGET |
| Drain and Site Service | 10,346 | Yes (DRN) | Not scraped |
| New Houses | 10,329 | Yes (NH) | TARGET |
| Residential Building Permit | 2,880 | Yes (CMB) | Not scraped |
| Fire/Security Upgrade | 2,304 | Yes (FSU) | Not scraped |
| New Building | 1,370 | Yes (BLD) | Not scraped |
| Demolition Folder (DM) | 410 | Yes (DEM) | Not scraped |
| Designated Structures | 395 | Yes (DST) | Not scraped |
| Multiple Use Permit | 138 | Maybe | Not scraped |
| Portable Classrooms | 88 | Maybe | Not scraped |
| Temporary Structures | 86 | Maybe | Not scraped |
| Partial Permit | 77 | Maybe | Not scraped |
| Conditional Permit | 74 | Maybe | Not scraped |
| Site Inspection(Scarborough) | 21 | Maybe | Not scraped |
| **TOTAL** | **146,333** | | |

### Key Decisions Needed
1. **Which types to add?** Spec 38 §3.6 lists PS/MS/DM/DR as "monitor-only" (low value per stage). But the v2 scraper gets data at 4 KB/permit — scraping them costs almost nothing. Include all types where the AIC portal returns data.
2. **Batch sizing for full run:** Current LIMIT 10 → need ~14,600 runs to cover 146K permits. At ~1.5s/permit, full pass = ~61 hours. Need to increase batch size and add session refresh.
3. **Chain decoupling:** Remove `deep_scrapes` chain entirely (or convert to `inspections`-only). `coa_documents` runs independently when implemented.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes created/modified
* **Unhappy Path Tests:** N/A — no new test scenarios (scraper retry logic already tested in production)
* **logError Mandate:** N/A — pipeline script uses `pipeline.log.error()`
* **Mobile-First:** N/A — no UI changes

## Execution Plan
- [ ] **State Verification:** Current state: 14/146,333 permits scraped (0.01%). v2 scraper works for SR/BA/NH types. Need to verify other types return data from AIC portal.
- [ ] **Contract Definition:** N/A — no API routes altered.
- [ ] **Spec Update:** Update Spec 38 §3.6 to expand target types. Remove "monitor-only" distinction since v2 bandwidth is negligible. Update time/bandwidth estimates for full corpus.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** N/A — no new logic to test (same normalizeStatus/parseInspectionDate functions).
- [ ] **Red Light:** N/A — no new testable behavior.
- [ ] **Implementation:**
  1. **Decouple chain:** In `manifest.json`, remove `deep_scrapes` chain (or make it `["inspections"]` only). In `route.ts`, no `chain_deep_scrapes` needed — `inspections` already works standalone.
  2. **Expand TARGET_TYPES:** Add all high-volume types that appear on AIC portal: Plumbing(PS), Mechanical(MS), Drain and Site Service, Residential Building Permit, Fire/Security Upgrade, New Building, Demolition Folder (DM), Designated Structures. Keep smaller types (<100 permits) out for now.
  3. **Add batch size control:** Add `BATCH_SIZE` constant (default 10, env-overridable via `SCRAPE_BATCH_SIZE`). For test run: 2 per type. For full run: 500+.
  4. **Add session refresh:** Every 200 permits, re-navigate to `setup.do` to keep WAF session alive.
  5. **Small test run:** Run scraper with BATCH_SIZE=2 per type (11 types × 2 = ~22 permits). Verify all types return data. Identify any types that fail or have no inspection processes.
  6. **Assess test results:** Check permit_inspections for coverage across all types. Remove any types that consistently return no data.
  7. **Full run:** Increase BATCH_SIZE and run. Monitor bandwidth and session stability.
- [ ] **UI Regression Check:** N/A — no shared components modified.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
