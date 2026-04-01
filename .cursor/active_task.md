# Active Task: WF2 — Entity Type Classification
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Classify entities as Corporation or Individual during extraction, so enrichment queries can filter by `WHERE entity_type = 'Corporation'` and skip individuals permanently. Backfill existing 3,706 unclassified rows.
* **Target Spec:** `docs/specs/platform/37_entity_model.md`
* **Key Files:** `scripts/extract-builders.js`, `src/lib/builders/normalize.ts`

## Technical Implementation
- Add `entity_type` classification during normalize/dedup in `extract-builders.js`
- Classification logic: `isIncorporated()` OR 4+ words OR has BUSINESS_KEYWORDS → Corporation, else Individual
- Numbered corporations (`/^\d{5,}/`) → Corporation (they're shell companies but still corporate entities)
- Include `entity_type` in INSERT and ON CONFLICT UPDATE
- Backfill existing rows via UPDATE in the same script (runs after batch insert)
- No migration needed — `entity_type` column already exists (migration 042)
- No DB impact beyond populating existing NULL column

## Execution Plan
- [ ] **Guardrail Test:** Add entity classification tests to `entities.logic.test.ts`
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:** Modify `extract-builders.js` + add `classifyEntityType` to `normalize.ts`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
