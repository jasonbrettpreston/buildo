# Active Task: WF3 — Exclude Large Business + Pre-Screen Gaps + Blocklist Expansion
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `ed16564`

## Context
* **Goal:** Exclude Large Business from enrichment (341 conglomerates), fix 2 pre-screen gaps, expand blocklists, allow gmail for Small Business.
* **Key Files:** `scripts/enrich-wsib.js`

## Fixes

### Fix 1: Exclude Large Business from enrichment queries
Add `AND business_size != 'Large Business'` to count + stream queries. Eliminates Siemens, Cadillac Fairview, Riocan, Staples, etc.

### Fix 2: Pre-screen gap — "Acct" and end-of-string "Div"
- Add `\bacct\b` to corporate_account pattern
- Change `\bdiv\s` to `\bdiv\b` so it catches "Div" at end of string

### Fix 3: Gmail policy — allow for Small Business
Small contractors legitimately use gmail. Only block personal email providers for Medium+ businesses.

### Fix 4: Blocklist expansion
**DIRECTORY_DOMAINS additions:** sec.gov, scc-csc.ca, q4cdn.com, jooble.org, bynder.cloud, flydenver.com, wapa.gov, whatsapp.com, petvalu.ca, jobs.siemens-energy.com
**EMAIL_REJECT additions:** live.ca, live.com

## Execution Plan
- [ ] **Fix 1:** Add business_size filter to both queries
- [ ] **Fix 2:** Fix pre-screen regex patterns
- [ ] **Fix 3:** Conditional gmail blocking by business size
- [ ] **Fix 4:** Expand blocklists
- [ ] **Green Light:** Tests pass
