# Active Task: WF3 Fix Missing Accuracy Bars, Pipeline Errors, Accordion Alignment
**Status:** Planning

## Context
* **Goal:** Fix 4 bugs: (1) link_similar and link_coa missing accuracy bars, (2) CoA pipeline fails, (3) parcels pipeline fails (PostGIS missing), (4) accordion All Time/Last Run data misaligned and hard to read
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/lib/admin/funnel.ts` (FUNNEL_SOURCES config, computeAllFunnelRows)
  - `src/components/FreshnessTimeline.tsx` (accordion panels: FunnelAllTimePanel, FunnelLastRunPanel)
  - `src/tests/admin.ui.test.tsx` / `src/tests/quality.logic.test.ts`
* **Rollback Anchor:** `ab7550e`

## State Verification (Root Cause Analysis)

### Bug 1: link_similar and link_coa missing accuracy % and bar chart
- **Root cause:** `funnelData` is keyed by `config.statusSlug`. The `coa` funnel source has `statusSlug: 'coa'`, but the pipeline step slug in the permits chain is `link_coa`. And `link_similar` has no FUNNEL_SOURCES entry at all.
- **Fix:** Add `link_similar` to FUNNEL_SOURCES. Add `link_coa` as a separate funnel entry (or alias the lookup in FreshnessTimeline). These steps have meaningful metrics that should display.

### Bug 2: CoA pipeline failed — `Command failed: node scripts/load-coa.js`
- **Root cause:** The script itself errored. The error_message is truncated. This is a runtime/data issue — need to test the script directly and check for CKAN API changes.
- **Scope:** Outside code fix — runtime investigation. Will document findings.

### Bug 3: Parcels pipeline failed — `st_geomfromgeojson(text) does not exist`
- **Root cause:** PostGIS extension not enabled on local PostgreSQL. Migration 039 added `geom` columns requiring PostGIS functions, but `CREATE EXTENSION postgis` was never run.
- **Fix:** Enable PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis`). This is a DB setup issue, not a code bug.

### Bug 4: Accordion data misaligned — Baseline/Intersection/Yield columns hard to read
- **Root cause:** All Time panel uses flat `grid grid-cols-1 md:grid-cols-3` with `flex justify-between` rows. On desktop, the 3 columns are side-by-side but label/value pairs within each column aren't consistently aligned. The Last Run panel uses a different layout structure. No visual nesting separates sub-sections.
- **Fix:** Wrap each sub-zone (Baseline, Intersection, Yield) in its own nested tile card with consistent label-value alignment using a definition-list pattern with fixed-width labels.

## Standards Compliance
* **Try-Catch Boundary:** No new API routes.
* **Unhappy Path Tests:** Test funnel lookup for link_coa and link_similar slugs.
* **Mobile-First:** Accordion layout must stack vertically on mobile (`grid-cols-1`), 3-col on desktop (`md:grid-cols-3`). All interactive elements maintain 44px touch targets. 375px viewport mocking in `src/tests/admin.ui.test.tsx` verifies nested tile layout stacks correctly on mobile.

## Execution Plan
- [x] **Rollback Anchor:** `ab7550e` recorded.
- [x] **State Verification:** Root causes documented above.
- [x] **Spec Review:** Spec 28 lists 13 funnel sources; link_similar and link_coa should have data.
- [ ] **Reproduction Tests (Red Light):**
  - Test: funnel data includes entries for `link_similar` and `link_coa` slugs
  - Test: accordion sub-zones wrapped in nested tiles
- [ ] **Red Light:** Run tests, new tests fail.
- [ ] **Fix:**
  - Add `link_similar` to FUNNEL_SOURCES in funnel.ts
  - Add `link_coa` funnel entry (or make FreshnessTimeline look up both `step.slug` and alternative keys)
  - Enable PostGIS: `CREATE EXTENSION IF NOT EXISTS postgis`
  - Investigate CoA script failure
  - Redesign FunnelAllTimePanel + FunnelLastRunPanel with nested sub-tiles and aligned label-value pairs
- [ ] **Green Light:** All tests pass.
- [ ] **Collateral Check:** vitest related on changed files.
- [ ] **Atomic Commit.**
