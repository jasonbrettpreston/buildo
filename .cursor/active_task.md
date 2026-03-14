# Active Task: Wire Inspection Pipeline v2 into Admin Dashboard & Run First Pass
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** The v2 inspection scraper (`poc-aic-scraper-v2.js`) is built and tested — it uses the hybrid Playwright + JAX-RS REST API approach (4 KB/permit vs 1.5 MB). Now we need to: (1) update all pipeline references from v1→v2, (2) add the `inspections` pipeline to the admin trigger system so it can be launched from the Data Quality dashboard, and (3) execute a first batch run to populate `permit_inspections` with real data.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/manifest.json` — already updated: `inspections` → `poc-aic-scraper-v2.js` ✅
  - `src/app/api/admin/pipelines/[slug]/route.ts` — already updated ✅
  - `scripts/poc-aic-scraper-v2.js` — v2 scraper (working, tested)
  - `src/tests/inspections.logic.test.ts` — existing parser tests (21 passing)
  - `docs/specs/38_inspection_scraping.md` — spec updated with REST API architecture ✅

## Technical Implementation
* **New/Modified Components:** None (admin UI already renders `inspections` in FreshnessTimeline)
* **Data Hooks/Libs:** None — parser.ts unchanged (v2 doesn't use HTML parsing, but parser is still valid for v1 fallback)
* **Database Impact:** NO — `permit_inspections` table already exists (migration 045)

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes created
* **Unhappy Path Tests:** Add tests for v2 JSON-based normalizeStatus/parseInspectionDate (already covered by existing parser tests — same functions reused in v2 script)
* **logError Mandate:** N/A — pipeline script uses `pipeline.log.error()`
* **Mobile-First:** N/A — no UI changes

## Execution Plan
- [x] **State Verification:** v2 scraper tested with 2 permits (26 122335 → 6 stages, 24 132854 → 13 stages). Both returned correct data at 4 KB bandwidth. Pipeline SDK emits PIPELINE_SUMMARY + PIPELINE_META.
- [x] **Contract Definition:** N/A — no API routes altered.
- [x] **Spec Update:** Spec 38 §3.7 (REST API endpoints) and §3.8 (hybrid architecture) updated. Bandwidth estimates revised (250 MB/pass, 2 GB/month for twice-weekly).
- [x] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** Verify existing 21 parser tests still pass (normalizeStatus, parseInspectionDate used by v2).
- [ ] **Red Light:** N/A — existing tests cover the shared logic; no new behavior to fail-first.
- [ ] **Implementation:**
  1. Verify `manifest.json` and pipeline route handler point to v2 ✅ (already done)
  2. Run `npm run typecheck` to confirm no TS errors from route handler change
  3. Run first batch scrape: `node scripts/poc-aic-scraper-v2.js` (batch mode, 10 permits)
  4. Verify data landed in `permit_inspections` table
- [ ] **UI Regression Check:** N/A — no shared components modified.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
