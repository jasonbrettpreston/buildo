# Active Task: WF3 — Website Domain Validation + Blocklist Round 6
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `720f497`

## Context
* **Goal:** Validate website domain matches company name before trusting scraped data. Block 17 new garbage domains. Fix pre-screen gap.
* **Key Files:** `scripts/enrich-wsib.js`

## Root Cause of Remaining 34% Garbage
Serper returns irrelevant websites (trade associations, news, directories) as top results. Method B scrapes those wrong websites and trusts the phone/email found there. The fix: verify the website domain contains words from the company name before accepting it.

## Fixes

### Fix 1: Website Domain Validation
Before scraping a website, check if the domain contains words from the company name:
- "Canuck Door Systems" → website `canuckdoorsystems.com` → contains "canuck" → TRUST
- "BLT Construction" → website `collingwoodinquiry.ca` → no match → REJECT

Logic:
```js
function websiteMatchesCompany(websiteUrl, companyName) {
  const host = new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase();
  const words = companyName.toLowerCase().split(/[\s&,.']+/).filter(w => w.length >= 4);
  return words.some(w => host.includes(w));
}
```
If website doesn't match, still record the website but DON'T scrape it for phone/email. Only scrape trusted (matching) websites.

### Fix 2: Blocklist Round 6 — 17 new domains
jobbank.gc.ca, usmodernist.org, canadianbusinessphonebook.ca, edmca.com, collingwoodinquiry.ca, opendata.usac.org, omniapartners.com, truecondos.com, mnp.ca, ohiolink.edu, securitysystemsnews.com, issuu.com, bldup.com, rtr-engineering.ca, theglobeandmail.com, markham.ca, worldmaterial.com

### Fix 3: EMAIL_REJECT — user@domain.com template
Add `user@domain.com` and `@domain.com`

### Fix 4: Pre-screen — "people link" staffing pattern
Add `\bpeople link\b`

## Execution Plan
- [ ] **Fix 1:** websiteMatchesCompany() validation
- [ ] **Fix 2:** Blocklist expansion
- [ ] **Fix 3:** Email reject expansion
- [ ] **Fix 4:** Pre-screen expansion
- [ ] **Green Light:** Tests pass
