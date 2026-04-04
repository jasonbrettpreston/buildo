# Active Task: WF2 — Website-First Extraction + Auto-Cleanup
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `6436ba4`

## Context
* **Goal:** Improve genuine hit rate from ~28% by switching to website-first extraction (Method B), and add automated post-enrichment cleanup.
* **Key Files:** `scripts/enrich-wsib.js`

## Problem
Current flow (Method A):
1. Serper search → get 10 generic web results
2. Parse phone/email from search SNIPPETS (unstructured text)
3. Pick first non-blocked website from results
4. Fallback: scrape website for email if snippets had none

This produces garbage because snippets contain phone/email from ANY page mentioning the company — trade associations, news articles, government databases, job boards. The extracted contacts often belong to completely different entities.

## Solution: Method B — Website-First

New flow:
1. Serper search → get results
2. Find the company's OWN website (first non-blocked result) — this is already working
3. **Primary extraction: scrape the company website** for phone + email
4. **Fallback only:** if website scrape finds nothing, then try Knowledge Graph
5. **Never trust snippet-extracted contacts** — too noisy

Why this works: If we find `royalcrownconstruction.ca`, the phone/email ON that site belongs to Royal Crown Construction. The current approach grabs phone numbers from random snippets that could be from any page.

## Additional: Auto-Cleanup Pass

At the end of each enrichment run, scan enriched rows for known garbage patterns and NULL them out:
- Emails matching EMAIL_REJECT patterns
- Websites matching DIRECTORY_DOMAINS
- Emails that don't share a domain with the website (cross-validation)

## Technical Implementation

### Change 1: Restructure extractContacts → website-first
```
function extractContactsV2(response, entry) {
  const website = extractWebsite(response.organic || []);
  const knowledgeGraph = response.knowledgeGraph;
  
  let phone = knowledgeGraph?.phone || null;
  let email = null;
  
  // Primary: scrape company website for contacts
  if (website) {
    const scraped = await scrapeWebsite(website);
    if (scraped.phone) phone = scraped.phone;
    if (scraped.email) email = scraped.email;
  }
  
  // Only fall back to snippets for phone (more reliable than email in snippets)
  if (!phone) {
    const snippets = (response.organic || []).map(r => r.snippet || '');
    const phones = extractPhones(snippets);
    if (phones[0]) phone = phones[0];
  }
  
  // Never extract email from snippets — too noisy
  
  return { phone, email, website: knowledgeGraph?.website || website };
}
```

### Change 2: Auto-cleanup pass at end of run
After all entries processed, run a validation sweep on newly enriched rows.

### Change 3: Blocklist expansion (batch 5 domains)
Add: ca.trabajo.org, phcppros.com, contractorlistshq.com, signalhire.com, thebuildingsshow.com, infobel.ca, edsc-esdc.gc.ca, vaughan.ca, gocontinental.com, ksvadvisory.com, icc.illinois.gov

### Change 4: Pre-screen expansion
Add: `\bhuman resources\b`, `\bdriver service\b`

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** Website scrape wrapped in try-catch with timeout
* **Unhappy Path Tests:** Website timeout, empty HTML, no contacts found
* **logError Mandate:** N/A — pipeline SDK logging
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Restructure:** extractContacts → website-first with snippet-phone fallback
- [ ] **Auto-cleanup:** Post-run validation pass
- [ ] **Blocklists:** Batch 5 domains + pre-screen patterns
- [ ] **Test:** Run 50 with Method B, compare to Method A results
- [ ] **Green Light:** Tests pass
