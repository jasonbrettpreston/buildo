# Active Task: WF3 — WSIB Enrichment Quality Overhaul
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `b3604d6`

## Context
* **Goal:** Fix 3 layers of enrichment quality: pre-screen garbage names, translate NAICS to human search terms, harden extraction to reject fake data.
* **Key Files:** `scripts/enrich-wsib.js`

## Current Quality: 14.3% genuinely accurate, 35.2% garbage, 37.4% zero contacts

## Fix 1: NAICS Code → Human Search Term Lookup
Replace bureaucratic NAICS descriptions with terms people actually search:

```js
const NAICS_SEARCH_TERMS = {
  '238210': 'electrician electrical contractor',
  '238220': 'plumber plumbing HVAC contractor',
  '238110': 'concrete foundation contractor',
  '238120': 'structural steel contractor',
  '238130': 'framing carpenter contractor',
  '238140': 'masonry contractor',
  '238150': 'glass glazing contractor',
  '238160': 'roofing contractor',
  '238170': 'siding contractor',
  '238190': 'exterior construction contractor',
  '238310': 'drywall insulation contractor',
  '238320': 'painter painting contractor',
  '238330': 'flooring contractor',
  '238340': 'tile tiling contractor',
  '238350': 'finish carpentry contractor',
  '238390': 'specialty trades contractor',
  '238910': 'excavation site preparation contractor',
  '238990': 'specialty contractor',
  '236110': 'home builder general contractor',
  '236220': 'commercial building contractor',
  '236210': 'industrial building contractor',
  '238299': 'building equipment contractor',
  '238291': 'building systems contractor',
};
// Fallback: 'contractor'
```

Query becomes: `"Active Mechanical" Mississauga plumber HVAC contractor phone email`

## Fix 2: Expanded Pre-Screen Filter (7 patterns)
Skip entries before Serper search — these NEVER return useful results:

1. **Corporate accounting entries:** `account`, `head office`, `main office`, `target account`
2. **Staffing agencies:** `staffing`, `personnel`, `manpower`, `employment service`, `temporary`, `workforce`
3. **Unsearchable abbreviations:** length ≤ 5, all-caps no vowels, contains `(N.A.)`
4. **Division/subsidiary markers:** `division`, `divsion`, `div `, `region `
5. **Non-construction:** `food`, `catering`, `camp `, `environmental service`
6. **Duplicate compound names:** same word appears twice with `And`/`&`
7. **Generic single words:** ≤ 6 chars AND no space (Gillam, Kaneff, Logixx) — likely unsearchable

## Fix 3: Extraction Hardening
Block fake data that the current extractors accept:

**Email blocklist additions:**
- PNG/image filenames: reject if contains `.png`, `.jpg`, `.gif`, `@2x`
- Government domains: `.gov`, `.gov.uk`, `.gov.ca`, `toronto.ca`, `ontario.ca`
- Personal email providers: `gmail.com`, `hotmail.com`, `yahoo.com`, `outlook.com`
- Generic directory emails: `support@construction.com`, `accessibility@`, `webmaster@`, `customerservice@`

**Website blocklist additions:**
- Government: `toronto.ca`, `ontario.ca`, `.gov`, `escribemeetings.com`
- Data brokers: `rocketreach.co`, `zoominfo.com`
- News/magazines: `insauga.com`, `beachmetro.com`, `ourtimes.ca`, `skicanada.org`
- Cloud storage: `s3.amazonaws.com`, `s3.amazo` prefix
- Website builders: `bold.pro`, `wix.com`
- Job boards: `ziprecruiter.com`, `indeed.com`
- Directories: `canpages.ca`, `trustedpros.ca`, `construction.com`

## Fix 4: Revert Query to City-Based (drop street address)
Street address over-constrains. Use: `"name" city trade_terms phone email`

## Execution Plan
- [ ] **Fix 1:** NAICS_SEARCH_TERMS lookup + add naics_code to SELECT
- [ ] **Fix 2:** Expand shouldSkipWsibEntry() with 7 patterns
- [ ] **Fix 3:** Expand EMAIL_REJECT + DIRECTORY_DOMAINS
- [ ] **Fix 4:** Revert buildSearchQuery to city-based with NAICS trade terms
- [ ] **Test:** Dry-run 10 to verify query quality + pre-screen
- [ ] **Green Light:** Tests pass
