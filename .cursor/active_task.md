# Active Task: Fix enrich_web_search Phantom Slug Mismatch
**Status:** Planning
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** `scripts/enrich-web-search.js` hardcodes `SLUG = 'enrich_web_search'` but the manifest registers it under two slugs: `enrich_wsib_builders` and `enrich_named_builders`. Standalone runs log as `enrich_web_search` in `pipeline_runs`, creating a phantom slug that doesn't appear in PIPELINE_REGISTRY or PIPELINE_NAMES — causing the health banner to show raw slug `enrich_web_search (enrich_web_search)` instead of a human name.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `scripts/enrich-web-search.js` — SLUG constant (line 23)
  - `src/tests/pipeline-sdk.logic.test.ts` — slug consistency tests
  - `scripts/manifest.json` — canonical slug definitions

## Technical Implementation
* **New/Modified Components:** None
* **Data Hooks/Libs:** None — script-only change
* **Database Impact:** NO (old `enrich_web_search` rows in `pipeline_runs` become orphaned history — harmless, will be merged by SPLIT_PART normalization since they share the same base slug after normalization)

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Test slug matches manifest
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** `52851b9`
- [x] **State Verification:** DB has `enrich_web_search` rows from standalone runs, `entities:enrich_named_builders` from chain runs. Script serves 2 manifest slugs via env vars.
- [x] **Spec Review:** Manifest maps both `enrich_wsib_builders` and `enrich_named_builders` to same script. Chain sets `ENRICH_WSIB_ONLY=1` or `ENRICH_UNMATCHED_ONLY=1`.
- [ ] **Reproduction:** Add test asserting script SLUG matches one of its manifest slugs
- [ ] **Red Light:** Test fails (SLUG is `enrich_web_search`, not in manifest)
- [ ] **Fix:** Change SLUG to derive from env: `const SLUG = process.env.ENRICH_WSIB_ONLY === '1' ? 'enrich_wsib_builders' : 'enrich_named_builders';`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
