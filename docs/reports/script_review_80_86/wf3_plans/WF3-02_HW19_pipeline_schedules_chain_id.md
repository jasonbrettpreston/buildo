# Active Task: Chain-scope pipeline_schedules disable
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W19 · RC-W1

## Context
* **Goal:** Add `chain_id` column to `pipeline_schedules` so disabling a step for one chain (e.g., CoA maintenance) does not silently disable the same step slug in a sibling chain (e.g., permits). Today `classify_lifecycle_phase` appears in both the permits chain (step 21) and the CoA chain (step 10); disabling it is all-or-nothing with no chain scoping.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` (the spec must declare global-vs-per-chain disable semantics — add section if absent per H-S7)
* **Key Files:**
  - `migrations/NNN_pipeline_schedules_chain_id.sql` (new)
  - `scripts/run-chain.js` (L84–92 — the disable query)
  - Admin UI `pipeline_schedules` editor (front-end is out-of-scope per user instruction; document the migration effect on UI contract)

## Technical Implementation
* **New/Modified Components:** migration + one query change in `run-chain.js`.
* **Data Hooks/Libs:** `scripts/run-chain.js` L84–92 only.
* **Database Impact:** YES — new nullable `chain_id TEXT` column. Zero-downtime via Add-Backfill-No-Swap (existing rows stay NULL = "global disable, all chains" — preserves current behaviour for existing rows). Backfill is a NO-OP.
  - UP: `ALTER TABLE pipeline_schedules ADD COLUMN chain_id TEXT;`
  - Optional supporting index: `CREATE INDEX idx_pipeline_schedules_enabled ON pipeline_schedules (pipeline, chain_id) WHERE enabled = false;` — partial index, small so no `CONCURRENTLY` needed per §3.1 (table is ~30 rows).
  - DOWN: `ALTER TABLE pipeline_schedules DROP COLUMN chain_id;`

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:** Test (a) NULL chain_id = disables for ALL chains; (b) chain_id='permits' = disables only for permits chain; (c) chain_id='coa' row does NOT affect permits chain.
* **logError Mandate:** N/A (run-chain already uses `pipeline.log.warn`).
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Confirm current `pipeline_schedules` schema has no `chain_id`; count rows (expected small, <50); verify every row's `pipeline` value is a known slug in `manifest.scripts`.
- [ ] **Spec Review:** Read spec 40 §3.1 line 108 — currently silent on chain scoping. Propose spec update paragraph before implementation.
- [ ] **Reproduction:** Add `src/tests/run-chain.logic.test.ts` (or `chain.logic.test.ts` already exists — extend). Fixture: insert `pipeline_schedules` rows with (pipeline=X, enabled=false, chain_id='coa') and (pipeline=Y, enabled=false, chain_id=NULL). Assert X is NOT returned by the query when `chainId='permits'`; Y IS returned for both chains.
- [ ] **Red Light:** Run the test. Should fail because the migration + query filter do not exist yet.
- [ ] **Fix:**
  1. Write migration with UP + DOWN blocks.
  2. Run `npm run migrate`; run `npm run db:generate`.
  3. Update `run-chain.js` L87 query to `SELECT pipeline FROM pipeline_schedules WHERE enabled = FALSE AND (chain_id IS NULL OR chain_id = $1)` with `[chainId]` parameter.
  4. Update `pipeline_schedules` admin API if any (grep `src/app/api/` for references) to surface `chain_id` column.
- [ ] **Pre-Review Self-Checklist:**
  1. Is `pipeline_schedules` referenced anywhere else that would break on the new column? Grep `pipeline_schedules` across `src/` and `scripts/`.
  2. Does the `disabledSlugs` Set consumer at `run-chain.js` L90 treat `NULL` chain_id correctly? (Yes — the SQL filter handles it.)
  3. Does the Admin UI expose a way to set chain_id for new disable rows? (If not, follow-up WF1 needed — file in `docs/reports/review_followups.md`.)
  4. Migration rollback: DOWN drops the column — does any written row depend on `chain_id`? At migration time, no.
  5. Test coverage: does the test cover the NULL-chain case (global kill switch preserved) AND the chain-specific case (new behaviour)?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: Migration has UP + DOWN · §3.1 Add-only (no ALTER COLUMN; new nullable) · §3.2 N/A (tiny table) · factory update if any
- ⬜ API: Admin pipeline_schedules edit endpoint — front-end out of scope per user direction; backend-only change
- ⬜ UI: Front-end out of scope
- ✅ Shared Logic: Single query change
- ✅ Pipeline: §9.1 N/A · §9.3 migration idempotent (ADD COLUMN IF NOT EXISTS not needed since migrations tracked) · telemetry N/A

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
