# Active Task: Pipeline Efficiency & Chain Trigger Enhancements
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement (5 Blockers from WF5 Audit)

## Context
* **Goal:** Fix 5 pipeline blockers identified in WF5 audit: wire chain triggers to UI, add incremental filters to wasteful scripts, add data-hash guard to permits upsert, and deploy scheduling mechanism.
* **Target Specs:** `docs/specs/04_sync_scheduler.md`, `docs/specs/26_admin.md`, `docs/specs/02_data_ingestion.md`
* **Key Files:**
  - `scripts/load-permits.js` (B5)
  - `scripts/classify-permits.js` (B3)
  - `scripts/link-parcels.js` (B4)
  - `src/components/DataQualityDashboard.tsx` (B1)
  - `src/components/FreshnessTimeline.tsx` (B1)
  - `src/app/api/admin/pipelines/[slug]/route.ts` (B1 — no changes needed, already supports chains)
  - `scripts/run-chain.js` (reference only)

## Technical Implementation

### B1 — Wire Chain Triggers to Admin UI
* **Modified Components:** `DataQualityDashboard.tsx`, `FreshnessTimeline.tsx`
* **Database Impact:** NO
* **Change:** Add a "Run Full Pipeline" button at the chain level in `FreshnessTimeline`. When clicked, calls `triggerPipeline('chain_permits')` / `chain_coa` / `chain_sources`. The API route already supports chain slugs — no backend changes. Polling already detects chain-spawned step rows.

### B2 — Deploy Scheduling Mechanism
* **DEFERRED** — requires Cloud Scheduler / infrastructure deployment outside of codebase scope. Documenting the gap in specs and adding a visible "Scheduling not active" indicator in the UI is the actionable step here.
* **Modified Components:** `DataQualityDashboard.tsx` (add "manual only" indicator next to schedule labels)
* **Spec Update:** `docs/specs/04_sync_scheduler.md` — clarify current state

### B3 — Make classify-permits.js Incremental
* **Modified Script:** `scripts/classify-permits.js`
* **Database Impact:** NO (columns `last_seen_at` on `permits` and `classified_at` on `permit_trades` already exist)
* **Change:** Replace full-table scan with incremental query:
  ```sql
  SELECT p.* FROM permits p
  WHERE NOT EXISTS (
    SELECT 1 FROM permit_trades pt
    WHERE pt.permit_num = p.permit_num
      AND pt.revision_num = p.revision_num
  )
  OR EXISTS (
    SELECT 1 FROM permit_trades pt
    WHERE pt.permit_num = p.permit_num
      AND pt.revision_num = p.revision_num
      AND p.last_seen_at > pt.classified_at
  )
  ```
* **Escape hatch:** Add `--full` CLI flag to force full re-classification when rules change.

### B4 — Make link-parcels.js Incremental
* **Modified Script:** `scripts/link-parcels.js`
* **Database Impact:** NO (`permit_parcels.linked_at` already exists)
* **Change:** Add NOT EXISTS filter to skip already-linked permits:
  ```sql
  AND NOT EXISTS (
    SELECT 1 FROM permit_parcels pp
    WHERE pp.permit_num = p.permit_num
      AND pp.revision_num = p.revision_num
  )
  ```
* **Escape hatch:** Add `--full` CLI flag to force full re-linking when parcel data is refreshed.

### B5 — Add data_hash Guard to load-permits.js Upsert
* **Modified Script:** `scripts/load-permits.js`
* **Database Impact:** NO (`permits.data_hash` column already exists)
* **Change:** Add `WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash` to the ON CONFLICT UPDATE clause (matching the pattern already used in `load-coa.js`). This prevents false `last_seen_at` bumps on unchanged records, which is critical for B3/B4 incremental filters to work correctly.
* **Also:** Split upsert result tracking to count actual inserts vs updates vs unchanged (currently hardcoded to 0).

## Execution Plan

### Phase 1: Foundation (B5 first — enables B3/B4)
- [ ] **B5 State Verification:** Read `scripts/load-permits.js` upsert SQL. Confirm `data_hash` column exists and is populated. Compare with `load-coa.js` pattern.
- [ ] **B5 Spec Update:** Update `docs/specs/03_change_detection.md` to document the hash guard requirement.
- [ ] **B5 Guardrail Test:** Add test in `src/tests/sync.logic.test.ts` verifying that unchanged permits are NOT re-stamped with new `last_seen_at`.
- [ ] **B5 Red Light:** Run test — must fail.
- [ ] **B5 Implementation:** Modify `load-permits.js` ON CONFLICT clause to add `WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash`. Update result tracking to count inserts/updates/unchanged.
- [ ] **B5 Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **B5 Atomic Commit:** `git commit -m "fix(03_change_detection): add data_hash guard to permits upsert"`

### Phase 2: Incremental Classification (B3)
- [ ] **B3 State Verification:** Read `scripts/classify-permits.js` batch query. Confirm `classified_at` on `permit_trades` and `last_seen_at` on `permits` exist.
- [ ] **B3 Guardrail Test:** Add test verifying that classify-permits skips already-classified unchanged permits.
- [ ] **B3 Red Light:** Run test — must fail.
- [ ] **B3 Implementation:** Modify batch query in `classify-permits.js` to add incremental WHERE filter. Add `--full` flag support.
- [ ] **B3 Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **B3 Atomic Commit:** `git commit -m "feat(08_trade_classification): make classify-permits incremental"`

### Phase 3: Incremental Parcel Linking (B4)
- [ ] **B4 State Verification:** Read `scripts/link-parcels.js` batch query. Confirm `permit_parcels` table exists with `linked_at`.
- [ ] **B4 Guardrail Test:** Add test verifying link-parcels skips already-linked permits.
- [ ] **B4 Red Light:** Run test — must fail.
- [ ] **B4 Implementation:** Modify batch query in `link-parcels.js` to add NOT EXISTS filter. Add `--full` flag support.
- [ ] **B4 Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **B4 Atomic Commit:** `git commit -m "feat(29_spatial_parcel_matching): make link-parcels incremental"`

### Phase 4: Chain Trigger UI (B1)
- [ ] **B1 State Verification:** Read `FreshnessTimeline.tsx` chain rendering. Confirm `triggerPipeline` accepts chain slugs. Confirm API route handles `chain_*` slugs.
- [ ] **B1 Spec Update:** Update `docs/specs/26_admin.md` to document chain trigger buttons.
- [ ] **B1 Guardrail Test:** Add UI test in `src/tests/admin.ui.test.tsx` verifying chain trigger buttons render and call correct slugs.
- [ ] **B1 Red Light:** Run test — must fail.
- [ ] **B1 Implementation:** Add "Run Full Pipeline" button at chain header level in `FreshnessTimeline.tsx`. Wire to `onTrigger('chain_permits')` etc.
- [ ] **B1 Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **B1 Atomic Commit:** `git commit -m "feat(26_admin): add chain trigger buttons to pipeline timeline"`

### Phase 5: Schedule Transparency (B2)
- [ ] **B2 Implementation:** Add visual indicator in `DataQualityDashboard.tsx` next to schedule labels showing "Manual only — no auto-schedule deployed". Update `docs/specs/04_sync_scheduler.md` to reflect current state.
- [ ] **B2 Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **B2 Atomic Commit:** `git commit -m "docs(04_sync_scheduler): clarify scheduling is manual-only, add UI indicator"`

### Final
- [ ] **Founder's Audit:** Verify no laziness placeholders, all exports resolve, incremental filters work correctly with `--full` escape hatch.
- [ ] **System Map:** Run `npm run system-map`.
