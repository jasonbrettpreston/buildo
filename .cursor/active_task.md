# Active Task: Unified Serper Enrichment — Delete Dead Google Places Code
**Status:** Implementation
**Rollback Anchor:** `862572a`
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Delete dead Google Places enrichment code. Create a shared Serper client in `src/lib/enrichment/serper-client.ts`. Rewrite `enrichment.ts` to use Serper so the admin "Enrich Now" button works. Refactor `enrich-web-search.js` to import the shared extraction functions from the existing TS module.
* **Target Spec:** `docs/specs/36_web_search_enrichment.md`
* **Key Files:**
  - `scripts/enrich-builders.js` — DELETE (dead Google Places script)
  - `src/lib/builders/enrichment.ts` — REWRITE to use Serper via shared client
  - `src/lib/enrichment/serper-client.ts` — NEW shared Serper API fetch + stripHtmlNoise
  - `scripts/enrich-web-search.js` — REFACTOR to import from `extract-contacts.ts` (remove duplicated extraction functions)
  - `src/lib/builders/extract-contacts.ts` — ADD `stripHtmlNoise` (currently only in JS)

## Technical Implementation
* **Step 1: Delete** `scripts/enrich-builders.js` (dead Google Places pipeline script)
* **Step 2: Create** `src/lib/enrichment/serper-client.ts` — exports `searchSerper(query)` and `scrapeWebsiteContacts(url)`. Reads `SERPER_API_KEY` from env.
* **Step 3: Add** `stripHtmlNoise()` to `src/lib/builders/extract-contacts.ts` (missing from TS, exists in JS)
* **Step 4: Rewrite** `src/lib/builders/enrichment.ts` — replace Google Places with Serper. `enrichBuilder(id)` calls `searchSerper` + `extractContacts` + website scrape. `enrichUnenrichedBuilders(limit)` does batch processing. Both use `withTransaction` from db/client.
* **Step 5: Refactor** `scripts/enrich-web-search.js` — delete the 130 lines of duplicated extraction functions, require from the TS-compiled paths or keep as-is (CJS script can't import TS directly). Actually, the JS script runs standalone via Node, not through Next.js bundler — it must keep its own extraction functions OR we compile the TS. **Decision:** Leave the JS extraction functions in place for now (the script works, and CJS can't require ESM/TS). The shared client is for the Next.js web path only.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** enrichBuilder wraps Serper call + DB update in try-catch with logError
* **Unhappy Path Tests:** Test enrichBuilder with missing API key, failed fetch, no results
* **logError Mandate:** All catch blocks use logError
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist
- ⬜ DB — N/A
- ⬜ API — N/A (route unchanged, calls same function name)
- ⬜ UI — N/A
- ⬜ Shared Logic — N/A (no classification/scoring)
- ⬜ Pipeline — N/A (enrich-web-search.js keeps its own extraction; not modifying pipeline SDK usage)

## Execution Plan
- [ ] **State Verification:** enrichment.ts uses dead Google Places API. enrich-builders.js is dead.
- [ ] **Contract Definition:** N/A — admin route interface unchanged (POST /api/admin/builders)
- [ ] **Spec Update:** N/A — spec 36 already describes Serper
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** N/A — existing enrichment tests cover extract-contacts
- [ ] **Red Light:** N/A
- [ ] **Implementation:**
  1. Delete `scripts/enrich-builders.js`
  2. Create `src/lib/enrichment/serper-client.ts`
  3. Add `stripHtmlNoise` to `extract-contacts.ts`
  4. Rewrite `enrichment.ts` with Serper
- [ ] **UI Regression Check:** N/A
- [ ] **Green Light:** typecheck + test pass → WF6
