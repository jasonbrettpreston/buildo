# Active Task: Fix proxy not loading from .env in AIC scraper
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** `poc-aic-scraper-v2.js` doesn't load `.env` file, so PROXY_HOST/PORT/USER/PASS are not available when running standalone. This causes the scraper to bypass the Decodo proxy and connect directly to AIC portal, risking WAF blocks and producing unreliable results.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:** `scripts/poc-aic-scraper-v2.js`
* **Rollback Anchor:** `4d7d41f`

## Technical Implementation
* Add `require('dotenv').config()` at top of scraper script before any `process.env` reads
* dotenv is already a project dependency (used by Next.js)

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** 4d7d41f
- [x] **State Verification:** Scraper logs "No PROXY_HOST configured" despite .env having it
- [x] **Spec Review:** Spec 38 requires proxy for AIC portal access
- [x] **Reproduction:** Ran scraper, got WARN about missing proxy
- [ ] **Fix:** Add dotenv.config() to scraper
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. → WF6
