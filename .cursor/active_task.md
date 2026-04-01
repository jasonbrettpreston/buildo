# Active Task: WF1 — WSIB-First Contact Enrichment
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis

## Context
* **Goal:** Enrich WSIB registry entries directly with Serper web search contacts (phone, email, website, social links), making WSIB a standalone enriched contractor database. When `link-wsib.js` matches a WSIB entry to a permit entity, contacts flow automatically from WSIB → entity.
* **Target Spec:** `docs/specs/pipeline/45_chain_entities.md` (updated) + new `docs/specs/pipeline/46_wsib_enrichment.md`
* **Key Files:** `scripts/enrich-web-search.js`, `scripts/link-wsib.js`, `scripts/manifest.json`, `migrations/063_wsib_contacts.sql`

## Analysis
- 121,116 WSIB Class G entries total
- 54,462 have trade_name (Tier A — best search queries)
- 1,033 Large Business + 4,370 Medium Business = 5,403 highest-value targets
- Current entities chain only enriches ~3,706 permit-derived builders; ~70% were wasted on individuals/numbered corps (fixed in Phase 1)
- WSIB entries have legal_name + trade_name + mailing_address = highest quality Serper input
- Only 13,915 WSIB entries link to entities today — enriching WSIB directly means contacts are ready before a permit even arrives

## Technical Implementation

### A. Database: Add contact columns to `wsib_registry` (migration 063)
```sql
ALTER TABLE wsib_registry ADD COLUMN primary_phone VARCHAR(50);
ALTER TABLE wsib_registry ADD COLUMN primary_email VARCHAR(200);
ALTER TABLE wsib_registry ADD COLUMN website VARCHAR(500);
ALTER TABLE wsib_registry ADD COLUMN last_enriched_at TIMESTAMP;
```
No need for `entity_contacts`-style social links on WSIB — those stay on the entity layer. WSIB gets core contacts only.

### B. New pipeline script: `scripts/enrich-wsib.js`
Reuses the existing contact extraction functions from `enrich-web-search.js` but targets `wsib_registry` directly:
1. Query: `SELECT * FROM wsib_registry WHERE last_enriched_at IS NULL AND trade_name IS NOT NULL ORDER BY business_size DESC, legal_name LIMIT $1`
2. Apply `shouldSkipEntity()` pre-flight filters (generic trade names, short names)
3. Build search query from trade_name + city from mailing_address
4. Call Serper, extract contacts
5. Update `wsib_registry` with COALESCE preservation + `last_enriched_at = NOW()`
6. Emit `PIPELINE_SUMMARY` + `PIPELINE_META`

Business size ordering: Large Business → Medium Business → Small Business (highest-value first).

### C. Contact flow: WSIB → Entity on link (modify `link-wsib.js`)
After each tier's `UPDATE entities SET is_wsib_registered = true`, add:
```sql
UPDATE entities e
SET primary_phone = COALESCE(e.primary_phone, w.primary_phone),
    primary_email = COALESCE(e.primary_email, w.primary_email),
    website = COALESCE(e.website, w.website)
FROM wsib_registry w
WHERE w.linked_entity_id = e.id
  AND w.match_confidence >= [tier_threshold]
  AND (e.primary_phone IS NULL OR e.primary_email IS NULL OR e.website IS NULL)
```
This makes entity enrichment instant on link — no separate Serper call needed for WSIB-matched builders.

### D. Chain updates (`scripts/manifest.json`)
Add new script entry `enrich_wsib_registry` and new chain step:
```json
"entities": [
  "enrich_wsib_registry", "enrich_wsib_builders", "enrich_named_builders"
]
```
Or a dedicated chain: `"wsib_enrichment": ["enrich_wsib_registry"]`

### E. Existing `enrich-web-search.js` — no changes needed
The existing entity enrichment still works for non-WSIB builders. WSIB-matched entities that already got contacts from the link step will be skipped (`last_enriched_at IS NOT NULL` or `phone/email/website already populated`).

* **New/Modified Components:** None (pipeline/backend only)
* **Data Hooks/Libs:** None
* **Database Impact:** YES — migration 063 adds 4 columns to wsib_registry (121K rows, ALTER ADD COLUMN is instant for nullable columns)

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Test WSIB enrichment skip filters, contact-copy on link, COALESCE preservation
* **logError Mandate:** N/A — pipeline scripts use `pipeline.log.error`
* **Mobile-First:** N/A — backend only

## Execution Plan
- [ ] **Contract Definition:** N/A — no API routes created.
- [ ] **Spec & Registry Sync:** Create `docs/specs/pipeline/46_wsib_enrichment.md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** Write `migrations/063_wsib_contacts.sql` (UP: add 4 columns; DOWN: drop 4 columns). Run migration. `npm run typecheck`.
- [ ] **Test Scaffolding:** Add tests to `enrichment.logic.test.ts` and `wsib.logic.test.ts`:
  - WSIB enrichment query prioritization (Large > Medium > Small)
  - shouldSkipEntity applied to WSIB entries
  - Contact copy from WSIB → entity on link (COALESCE preserves existing)
  - Contact copy skipped when entity already has all contacts
- [ ] **Red Light:** Run `npm run test`. New tests fail.
- [ ] **Implementation:**
  - Create `scripts/enrich-wsib.js` (WSIB-targeted enrichment)
  - Modify `scripts/link-wsib.js` (contact-copy after each tier)
  - Update `scripts/manifest.json` (new script + chain entry)
  - Update `src/tests/factories.ts` if needed
- [ ] **Auth Boundary & Secrets:** SERPER_API_KEY already in .env, not exposed to client.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
