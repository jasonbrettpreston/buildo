# Active Task: Scraper stealth hardening for production-scale scraping
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** The AIC scraper successfully scraped 15/15 recent permits but hit a WAF block on older permits. To scale to the full 23K pool, we need stealth improvements: user-agent rotation, request jitter, and better WAF error detection. These are low-cost, high-impact changes that make the scraper production-ready without overengineering into distributed infrastructure.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - MODIFY: `scripts/poc-aic-scraper-v2.js` — UA rotation, jitter, WAF HTML detection

## Technical Implementation

### 1. User-Agent Rotation
Replace the static `USER_AGENT` string with a pool of 5 realistic browser UAs. Randomly select one per session bootstrap (not per request — the same browser session should have a consistent UA).
- Chrome 131 (Windows)
- Chrome 131 (Mac)
- Edge 131 (Windows)
- Safari 18 (Mac)
- Chrome 130 (Windows — slightly older)

### 2. Request Jitter
Add randomized delay between permits in the batch loop. Currently the scraper fires requests back-to-back. Add `500-2000ms` random sleep between permits to simulate human browsing cadence.
- `await page.waitForTimeout(500 + Math.random() * 1500)` between each permit in the batch loop
- No jitter in single-permit mode (testing)

### 3. WAF HTML Response Detection
The `post()` and `get()` functions inside `fetchPermitChain` currently try to JSON.parse the response. If the WAF returns HTML (like `<HTML><HEAD>Access Denied</HEAD>`), the parse fails and returns `{ data: null }`. This silently drops the permit.
- Add HTML detection: if response starts with `<` or `<!`, flag as WAF block
- Return a `waf_blocked: true` flag from `fetchPermitChain`
- In `scrapeYearSequence`, if `waf_blocked`, return with `retryExhausted: true` and `errorCategory: 'waf_block'` so the retry logic kicks in
- This means WAF blocks get 3 retries with exponential backoff instead of being silently skipped

### Data Flow
- No database changes
- No new tables or columns
- Same reads/writes as existing scraper

* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script
* **Unhappy Path Tests:** N/A — runtime behavior, not unit-testable
* **logError Mandate:** N/A — uses pipeline.log
* **Mobile-First:** N/A

## Execution Plan
- [ ] **State Verification:** Current scraper has static UA, no jitter, silent WAF drops
- [ ] **Contract Definition:** N/A — no API route
- [ ] **Spec Update:** N/A — stealth is implementation detail, not behavioral contract
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** N/A — no new tests needed (existing tests don't exercise live scraping)
- [ ] **Red Light:** N/A — no new test to fail
- [ ] **Implementation:**
  1. Replace static USER_AGENT with UA pool + random selection per session
  2. Add jitter delay between permits in batch loop
  3. Add HTML/WAF detection in fetchPermitChain's post/get functions
  4. Surface waf_blocked flag for retry logic
- [ ] **UI Regression Check:** N/A
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Spawn review agent. → WF6
