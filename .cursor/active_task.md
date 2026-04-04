# Active Task: WF2 — Increase WSIB Enrichment Limit
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `9fb9ba6`

## Context
* **Goal:** Allow larger enrichment runs from the dashboard by increasing the default limit and adding manifest env override.
* **Key Files:** `scripts/enrich-wsib.js`, `scripts/manifest.json`

## Fix
1. Change default ENRICH_LIMIT from 50 to 1800 in manifest env config
2. The script already reads ENRICH_LIMIT from env vars

## Execution Plan
- [ ] Add ENRICH_LIMIT to manifest wsib chain config
- [ ] Green Light: Tests pass
