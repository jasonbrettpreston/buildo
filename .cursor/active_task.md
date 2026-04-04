# Active Task: WF3 — Simplify Serper Query to Human-Like Format
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `411c620`

## Context
* **Goal:** Simplify search query from over-engineered format to what humans actually type.
* **Key Files:** `scripts/enrich-wsib.js`

## Root Cause
Our query: `"Proplus Contracting" Scarborough specialty trades contractor phone email`
→ Returns: WSIB CSVs, procurement PDFs, garbage

Your Google search: `Proplus Contracting toronto`
→ Returns: propluscontracting.com as result #1

Three problems:
1. Quoted exact match forces Serper into document/CSV results
2. WSIB mailing address city (Scarborough) instead of "toronto"
3. Trade terms + "phone email" add noise that matches procurement docs

## Fix
Change `buildSearchQuery()` to: `company name Toronto`

No quotes. No trade terms. No "phone email". Just the company name + Toronto (since all are GTA businesses serving Toronto area).

## Execution Plan
- [ ] **Fix:** Rewrite buildSearchQuery to simple format
- [ ] **Green Light:** Tests pass
