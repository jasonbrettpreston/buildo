# Active Task: WF2 — Harden Enrichment Pre-Flight Filters
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Add pre-flight filters to `enrich-web-search.js` to skip unenrichable entities (individual names, numbered corporations, generic WSIB trade names, broken city parsing) — eliminating ~70% of wasted Serper API credits.
* **Target Spec:** `docs/specs/pipeline/45_chain_entities.md`
* **Key Files:** `scripts/enrich-web-search.js`, `src/lib/builders/normalize.ts`, `src/lib/builders/extract-contacts.ts`, `src/tests/enrichment.logic.test.ts`

## Analysis
From the DB: 3,706 entities total. ~2,549 (69%) are individual names, ~154 (4%) are numbered corporations. Only ~1,000 (27%) are real construction businesses worth enriching. The first 78-entity Serper run wasted ~60% of credits on names like "YAN WANG", "1000287552 ONTARIO INC", and queries with "Suite 400" as the city.

## Technical Implementation

### A. Entity Skip Filters (in `enrich-web-search.js`, before Serper call)
Add a `shouldSkipEntity(builder)` function with these checks:

1. **Numbered corporations** — legal_name matches `/^\d{5,}/` (e.g., "1000287552 ONTARIO INC"). These are shell companies with no web presence.
2. **Likely individuals** — 2-3 word names with no business keyword and no WSIB match. Use a keyword list: `home|build|construct|develop|design|group|project|reno|plumb|electric|hvac|roof|mason|concrete|contract|pav|excavat|landscape|paint|floor|insul|demol|glass|steel|iron|fenc|deck|drain|fire|solar|elevator|sid|waterproof|cabinet|mill|tile|stone|pool|caulk|trim|property|invest|capital|holding|enterpr|restoration|maintenance|service|tech|solution|supply|architec|engineer|consult|manage|venture`. Skip if: no WSIB match AND name has 2-3 words AND none of these keywords match.
3. **Generic WSIB trade names** — Skip if trade_name (the name used for search) is under 4 characters or in a blocklist: `Contracting`, `General Contracting`, `Construction`, `Design Co`, `Holdings Co`, `Custom Home`, `Custom Home Ltd`, `Holdings`, `Building`, `Renovations`. These return irrelevant results.

### B. City Extraction Fix (in `enrich-web-search.js` `extractCity()` + `src/lib/builders/extract-contacts.ts` `extractCity()`)
Current logic: `address.split(',')[1]` — breaks on `PO Box 20053`, `Suite 400` etc.
Fix: After splitting on commas, validate that the candidate city part is not a PO Box, Suite, unit number, or postal code. Fall back to subsequent parts or return null.

### C. Skip Telemetry
Track skip reasons in `records_meta` so we can see how many were filtered:
```json
{
  "skipped": { "numbered_corp": 5, "individual": 20, "generic_name": 3 },
  "processed": 22,
  "matched": 15
}
```

### D. Dual-Path Consideration
- `extractCity()` exists in BOTH `scripts/enrich-web-search.js` (JS) AND `src/lib/builders/extract-contacts.ts` (TS) — must fix both.
- `shouldSkipEntity()` is new, only needed in the pipeline script (the TS API path in `src/lib/builders/enrichment.ts` is out of scope per spec 45).

* **New/Modified Components:** None (pipeline-only change)
* **Data Hooks/Libs:** `src/lib/builders/extract-contacts.ts` (extractCity fix)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, no API routes modified
* **Unhappy Path Tests:** Test edge cases: numbered corp detection, individual name detection, generic trade name blocklist, city extraction from malformed addresses
* **logError Mandate:** N/A — no API routes
* **Mobile-First:** N/A — backend only

## Execution Plan
- [ ] **State Verification:** Confirm current entity_type column exists (entity_type_enum in migration 042). Confirm extractCity exists in both JS and TS paths.
- [ ] **Contract Definition:** N/A — no API routes modified.
- [ ] **Spec Update:** Update `docs/specs/pipeline/45_chain_entities.md` to document pre-flight filters. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** Add tests to `enrichment.logic.test.ts`:
  - `shouldSkipEntity` — numbered corp → true
  - `shouldSkipEntity` — individual name without WSIB → true
  - `shouldSkipEntity` — individual name WITH WSIB → false (override)
  - `shouldSkipEntity` — real business name → false
  - `shouldSkipEntity` — generic trade name → true
  - `extractCity` — "Suite 400" → null (not a city)
  - `extractCity` — "PO Box 20053" → null
  - `extractCity` — standard WSIB format → correct city
- [ ] **Red Light:** Run tests, verify new tests fail.
- [ ] **Implementation:** 
  - Add `shouldSkipEntity()` to `scripts/enrich-web-search.js`
  - Fix `extractCity()` in `scripts/enrich-web-search.js`
  - Fix `extractCity()` in `src/lib/builders/extract-contacts.ts` (dual-path sync)
  - Add skip counters to telemetry/records_meta
  - Wire `shouldSkipEntity` into main loop before Serper call
- [ ] **UI Regression Check:** N/A — no shared components modified.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
