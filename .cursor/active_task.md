# Active Task: WF3 — Smarter Queries + Relevance Filter
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `34816fd`

## Context
* **Goal:** (1) Rebuild search queries to use address + NAICS trade description. (2) Exclude non-building businesses from enrichment.
* **Key Files:** `scripts/enrich-wsib.js`

## Fix 1: Smarter buildSearchQuery()
Use the NAICS description as the trade descriptor instead of hardcoded "contractor". The NAICS description defines what the business actually does — far more useful than the company name alone.

**Current:** `"Active Mechanical" "Mississauga" contractor`
**New:** `"Active Mechanical" "3153 Wharton Way" Mississauga "Building equipment construction" phone email`

Strategy:
- Trade name (or legal name) — quoted exact match
- Street address (extracted from mailing_address) — helps find exact business
- City — unquoted for broader matching
- NAICS description — the actual business type (replaces generic "contractor")
- `phone email` — surfaces contact pages
- Fallback if no street: `"name" "city" naics_description phone email`

Script needs to accept `naics_description` in the streamQuery SELECT and pass it to buildSearchQuery().

## Fix 2: Exclude Non-Building Businesses
**Exclude (679 entries):**
- Infrastructure construction (624) — highway/bridge/sewer, not building
- All non-construction categories (55) — mining, finance, nursing, retail, etc.

**Keep (46,358):**
- G1: Residential building construction (11,083)
- G3: Foundation, structure and building exterior (8,071)
- G4: Building equipment — electrical, plumbing, HVAC (10,028)
- G5: Specialty trades — painting, carpentry, drywall, flooring (15,397)
- G6: Non-residential building construction (1,779)
- Professional, scientific and technical (3) — surveying, drafting, testing

**Filter:** Use a whitelist of NAICS descriptions in the SQL WHERE clause.

## Savings
- 679 fewer Serper credits (Infrastructure + non-construction)
- Much higher hit rate from NAICS-enriched queries

## Execution Plan
- [ ] **Rollback Anchor:** `34816fd`
- [ ] **Fix 1:** Rewrite buildSearchQuery() to use address + naics_description
- [ ] **Fix 2:** Add NAICS whitelist to count + stream queries
- [ ] **Fix 3:** Add naics_description to streamQuery SELECT
- [ ] **Test:** Dry-run 5 entries to verify query quality
- [ ] **Green Light:** Tests pass
