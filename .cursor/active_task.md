# Active Task: WF3 — Enrichment Quality: Fake Emails + Directory Websites
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `e2fe707`

## Context
* **Goal:** Block fake emails and directory website matches from enrichment results before scaling up.
* **Key Files:** `scripts/enrich-wsib.js`

## Bugs Found in 50-Entry Test

| Issue | Count | Root Cause |
|-------|-------|-----------|
| `example@yourdomain.com` fake emails | 5 | Serper returns Procore template pages; EMAIL_REJECT doesn't block `yourdomain.com` |
| procore.com websites | 6 | DIRECTORY_DOMAINS doesn't include procore.com |
| constructconnect.com websites | 2 | DIRECTORY_DOMAINS doesn't include constructconnect.com |
| yorkmaps.ca website | 1 | DIRECTORY_DOMAINS doesn't include yorkmaps.ca |

## Fix
1. Add to `EMAIL_REJECT`: `yourdomain.com`, `example@`
2. Add to `DIRECTORY_DOMAINS`: `procore.com`, `constructconnect.com`, `yorkmaps.ca`, `31safer.ca` (Aecon safety subdomain)
3. Clean the 50 already-enriched entries: NULL out the fake data so re-enrichment can fix them

## Execution Plan
- [ ] **Rollback Anchor:** `e2fe707`
- [ ] **Fix:** Update EMAIL_REJECT and DIRECTORY_DOMAINS blocklists
- [ ] **Clean:** SQL UPDATE to null out fake emails/websites on affected rows, reset last_enriched_at so they get re-processed
- [ ] **Green Light:** Tests pass
