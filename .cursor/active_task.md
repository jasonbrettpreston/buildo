# Active Task: Inspection Data Scraping (AIC Portal)
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis

## Context
* **Goal:** Scrape building permit inspection statuses from the City of Toronto AIC portal, store them in a new `permit_inspections` table, and surface them in the Permit Detail UI and Admin dashboard.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:** `migrations/045_permit_inspections.sql`, `scripts/poc-aic-scraper.js`, `src/lib/inspections/parser.ts`, `src/app/api/permits/[id]/route.ts`, `src/app/permits/[id]/page.tsx`

## Technical Implementation
* **New Table:** `permit_inspections` -- dynamic stages per permit, UNIQUE on `(permit_num, stage_name)`
* **New Script:** `scripts/poc-aic-scraper.js` -- Playwright-based scraper with stealth plugin + rotating proxy
* **New Module:** `src/lib/inspections/parser.ts` -- HTML table parser extracting stage_name, status, inspection_date
* **Modified API:** `GET /api/permits/[id]` adds LEFT JOIN to `permit_inspections`
* **Modified UI:** Permit detail page adds "Inspection Progress" timeline section
* **Database Impact:** YES -- new table `permit_inspections` (migration 045), no impact on existing 237K+ rows

## Execution Plan
- [x] **Contract Definition:** Define `Inspection` TypeScript interface in `src/lib/permits/types.ts` and API response shape extension.
- [x] **Spec & Registry Sync:** Spec 38 created. Run `npm run system-map` after implementation.
- [x] **Schema Evolution:** Write `migrations/045_permit_inspections.sql` with CREATE TABLE, UNIQUE constraint, indexes. Run `npm run migrate` then `npm run db:generate`. Update `src/tests/factories.ts` with inspection factory. Run `npm run typecheck`.
- [x] **Test Scaffolding:** Create `src/tests/inspections.logic.test.ts` for HTML parser tests (stage extraction, status mapping, date parsing). Create `src/tests/inspections.infra.test.ts` for upsert and API join tests.
- [x] **Red Light:** Run `npm run test`. New tests must fail or be pending.
- [x] **Implementation -- Parser:** Build `src/lib/inspections/parser.ts` with `parseInspectionTable(html: string)` returning `Inspection[]`.
- [x] **Implementation -- Migration:** Create and run migration 045.
- [x] **Implementation -- Scraper PoC:** Build `scripts/poc-aic-scraper.js` with Playwright session flow, stealth plugin, proxy config, and upsert logic.
- [x] **Implementation -- API:** Modify `src/app/api/permits/[id]/route.ts` to LEFT JOIN `permit_inspections` and return `inspections[]`.
- [x] **Implementation -- UI:** Add "Inspection Progress" section to `src/app/permits/[id]/page.tsx` with status timeline.
- [x] **Implementation -- Admin:** Register `inspections` pipeline slug in admin types/helpers.
- [x] **Auth Boundary & Secrets:** Verify proxy credentials are server-side only (env vars, never exposed to client). Pipeline trigger protected by admin middleware.
- [x] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Atomic Commit:** `git commit -m "feat(38_inspection_scraping): permit inspections table, scraper PoC, and UI timeline"`.
- [ ] **Founder's Audit:** No laziness placeholders, all exports resolve, schema matches spec, test coverage complete.
