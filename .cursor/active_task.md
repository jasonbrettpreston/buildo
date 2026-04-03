# Active Task: WF2 — WSIB `is_gta` Column + Enrichment GTA Filter
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `eddd185`

## Context
* **Goal:** Add `is_gta` boolean column to `wsib_registry`, set during load, and filter enrichment to GTA-only businesses. Saves ~72,000 Serper credits (59% of registry is outside GTA).
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `migrations/066_wsib_is_gta.sql` (new), `scripts/load-wsib.js`, `scripts/enrich-wsib.js`

## Technical Implementation

### Migration 066: Add `is_gta` column + backfill
```sql
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS is_gta BOOLEAN DEFAULT false;
UPDATE wsib_registry SET is_gta = true WHERE mailing_address ILIKE ANY(ARRAY[...GTA cities...]);
CREATE INDEX idx_wsib_is_gta ON wsib_registry (is_gta) WHERE is_gta = true;
```

### GTA City List
Toronto proper: Toronto, Scarborough, Etobicoke, North York, East York, York
Peel: Mississauga, Brampton, Caledon
York Region: Markham, Vaughan, Richmond Hill, King, Aurora, Newmarket, Whitchurch-Stouffville, Georgina
Halton: Oakville, Burlington, Milton, Halton Hills
Durham: Ajax, Pickering, Oshawa, Whitby, Clarington

### load-wsib.js: Set `is_gta` during CSV load
Add `is_gta` to buildRow() using address matching against the GTA city list. Include in the INSERT/UPSERT.

### enrich-wsib.js: Filter to GTA only
Add `AND is_gta = true` to the enrichment queue query. Also add `location: 'Ontario, Canada'` to Serper API call.

## Database Impact
YES — Migration 066: ADD COLUMN + backfill UPDATE on 121K rows + partial index.

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline scripts, SDK handles
* **Unhappy Path Tests:** Source-level assertions for is_gta in load and enrich scripts
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Schema Evolution:** Write `migrations/066_wsib_is_gta.sql` (UP + DOWN). Run migrate. Typecheck.
- [ ] **Guardrail Test:** Tests for is_gta in load-wsib.js and enrich-wsib.js
- [ ] **Red Light:** Tests fail
- [ ] **Implementation:**
  - [ ] Migration with backfill
  - [ ] load-wsib.js: add is_gta to buildRow + INSERT
  - [ ] enrich-wsib.js: add `AND is_gta = true` + Serper `location`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
