# Active Task: Fix Audit Findings: knip config, audit parser, xlsx vulnerability
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `d239010d` (d239010df04369d486c3e9174b6535250d674508)

## Context
* **Goal:** [What are we building/fixing?]
* **Target Spec:** MISSING — select from the list below and replace this line:
  - `docs/specs/01_database_schema.md`
  - `docs/specs/02_data_ingestion.md`
  - `docs/specs/03_change_detection.md`
  - `docs/specs/04_sync_scheduler.md`
  - `docs/specs/05_geocoding.md`
  - `docs/specs/06_data_api.md`
  - `docs/specs/07_trade_taxonomy.md`
  - `docs/specs/08_trade_classification.md`
  - `docs/specs/08b_classification_assumptions.md`
  - `docs/specs/08c_description_keyword_trades.md`
  - `docs/specs/09_construction_phases.md`
  - `docs/specs/10_lead_scoring.md`
  - `docs/specs/11_builder_enrichment.md`
  - `docs/specs/12_coa_integration.md`
  - `docs/specs/13_auth.md`
  - `docs/specs/14_onboarding.md`
  - `docs/specs/15_dashboard_tradesperson.md`
  - `docs/specs/16_dashboard_company.md`
  - `docs/specs/17_dashboard_supplier.md`
  - `docs/specs/18_permit_detail.md`
  - `docs/specs/19_search_filter.md`
  - `docs/specs/20_map_view.md`
  - `docs/specs/21_notifications.md`
  - `docs/specs/22_teams.md`
  - `docs/specs/23_analytics.md`
  - `docs/specs/24_export.md`
  - `docs/specs/25_subscription.md`
  - `docs/specs/26_admin.md`
  - `docs/specs/27_neighbourhood_profiles.md`
  - `docs/specs/28_data_quality_dashboard.md`
  - `docs/specs/29_spatial_parcel_matching.md`
  - `docs/specs/30_permit_scope_classification.md`
  - `docs/specs/31_building_massing.md`
  - `docs/specs/32_product_groups.md`
  - `docs/specs/34_market_metrics.md`
* **Key Files:** [List specific src files]

## Technical Implementation
* **New/Modified Components:** [e.g. `PermitCard.tsx`]
* **Data Hooks/Libs:** [e.g. `src/lib/permits/scoring.ts`]
* **Database Impact:** [YES/NO — if YES, write `migrations/NNN_[feature].sql` and draft UPDATE strategy for 237K+ existing rows]

## Execution Plan
- [ ] **Rollback Anchor:** `d239010d` (auto-recorded by task-init)
- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the fix assumes.
- [ ] **Spec Review:** Read `docs/specs/[feature].md` to confirm the *intended* behavior.
- [ ] **Reproduction:** Create a failing test case in `src/tests/` that isolates the bug.
- [ ] **Red Light:** Run the new test. It MUST fail to confirm reproduction.
- [ ] **Fix:** Modify the code to resolve the issue.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Collateral Check:** Run `npx vitest related src/path/to/changed-file.ts --run` to verify no unrelated dependents broke.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "fix(NN_spec): [description]"`. Do not batch.
- [ ] **Spec Audit:** Update `docs/specs/[feature].md` IF AND ONLY IF the fix required a logic change.
