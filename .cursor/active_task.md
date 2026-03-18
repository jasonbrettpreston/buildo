# Active Task: Fix entity_contacts duplicates + COALESCE empty-string bug
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `6ef5fbb`

## Context
* **Goal:** (1) Add UNIQUE(entity_id, contact_type, contact_value) constraint on entity_contacts to prevent duplicate social links on re-enrichment. (2) Fix COALESCE empty-string bypass with NULLIF on phone/email/website updates.
* **Target Spec:** `docs/specs/36_web_search_enrichment.md`
* **Key Files:**
  - `migrations/058_entity_contacts_unique.sql` — new unique constraint
  - `src/lib/builders/enrichment.ts` — NULLIF fix
  - `scripts/enrich-web-search.js` — same NULLIF fix

## Execution Plan
- [ ] Migration 058: ADD UNIQUE(entity_id, contact_type, contact_value)
- [ ] Fix COALESCE → COALESCE(NULLIF(..., ''), $N) in enrichment.ts + enrich-web-search.js
- [ ] db:generate + typecheck + test → WF6
