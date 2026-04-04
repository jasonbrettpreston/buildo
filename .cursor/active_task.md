# Active Task: WF3 — Blocklist Expansion Round 4 + Pre-Screen Gaps
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `4baf2ec`

## Context
* **Goal:** Block 18 new garbage domains, catch staffing patterns, clean batch 4 data.
* **Key Files:** `scripts/enrich-wsib.js`

## Fixes

### Fix 1: DIRECTORY_DOMAINS — 18 new domains from batch 4
slideshare.net, hpacmag.com, d7leadfinder.com, ic.gc.ca, silo.tips, yumpu.com, workopolis.com, leasidelife.com, torontojobs.ca, frpo.org, crunchbase.com, fmcsa.dot.gov, firstgas.co.nz, conservationhamilton.ca, mcahamiltonniagara.org, citt.org, mover.net, wheree.com

### Fix 2: Pre-screen — staffing pattern expansion
Add: `\bcareer\b`, `\bprostaff\b`, `\bworkforce\b` (already have workforce but Prostaff is one word), `\brecruit\b`

### Fix 3: EMAIL_REJECT — wrong-company email domains
Add: `bellnet.ca`, `markham.ca`, `crunchbase.com`, `hpacmag.com`

### Fix 4: Clean batch 4 garbage rows
NULL out wrong emails/websites on affected rows, reset zero-contact rows for re-enrichment.

## Execution Plan
- [ ] **Fix 1-3:** Update blocklists + pre-screen
- [ ] **Fix 4:** Clean DB
- [ ] **Green Light:** Tests pass
