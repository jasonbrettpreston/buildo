# Active Task: WF5 Audit — 3 Pipeline Bug Fixes (P1/P2/P3)
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `dc692346280607fb2297ae3918f902d91c2979f5`

## Context
* **Goal:** Fix 3 bugs identified by WF5 permits + COA chain audit:
  - **P1 (FAIL):** `close_stale_permits` triggers safety guard on rapid reruns. Root cause: 1-hour touch gate in `load-permits.js:320` skips refreshing `last_seen_at` when runs happen within 1 hour of each other, making 93.9% of permits appear "unseen".
  - **P2 (WARN):** `notification_prefs` column missing from `user_profiles` despite migration 108 showing as applied. PHASE_CHANGED / LIFECYCLE_STALLED / START_DATE_URGENT push queries in `classify_lifecycle_phase.js` fail with hundreds of WARNs per run — push notifications completely broken.
  - **P3 (WARN):** `assert-global-coverage.js` audit_table rows use custom `{step_target, field, populated}` schema. SDK auto-injects `{metric, value}` rows that render as `undefined: undefined` in the admin UI audit table.
* **Target Spec:** `docs/specs/01-pipeline/40_pipeline_system.md`, `docs/specs/01-pipeline/47_pipeline_script_protocol.md`, `docs/specs/01-pipeline/49_data_completeness_profiling.md`
* **Key Files:**
  - `scripts/load-permits.js` line 320 (P1)
  - `migrations/111_notification_prefs_repair.sql` (P2 — new)
  - `scripts/quality/assert-global-coverage.js` (P3)

## Technical Implementation
* **P1:** Remove `AND permits.last_seen_at < NOW() - INTERVAL '1 hour'` from batch touch query in `scripts/load-permits.js:320`. Always refresh `last_seen_at` for every permit in the ingest batch so `close_stale_permits` sees a correct reference timestamp regardless of run cadence.
* **P2:** Create `migrations/111_notification_prefs_repair.sql` using `ADD COLUMN IF NOT EXISTS` (idempotent). Run `npm run migrate && npm run db:generate`. Add infra guardrail test.
* **P3:** Refactor `coverageRow` / `externalRow` / `infoRow` in `assert-global-coverage.js` to emit `{ metric, value, threshold, status }` format matching SDK auto-inject and admin UI renderer. `metric` = `"${field} (${stepTarget})"`, `value` = `coverage_pct` (as `"N%"` string) or raw count for info rows. Remove `columns` declaration from `emitSummary`.
* **Database Impact:** YES (P2) — `ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{...}'`. JSONB default covers existing rows; no row-level backfill needed.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified.
* **Unhappy Path Tests:** P1: infra test asserts touch query has no `1 hour` condition. P2: infra test verifies column exists in DB. P3: infra test asserts rows use `metric`/`value` keys, no `step_target` keys in auto-inject rows.
* **logError Mandate:** N/A — scripts use `pipeline.log`.
* **UI Layout:** N/A — backend/pipeline only.

## Execution Plan
- [x] **Rollback Anchor:** `dc692346280607fb2297ae3918f902d91c2979f5`
- [x] **State Verification:** Root causes confirmed by pipeline run analysis.
- [ ] **Spec Review:** Confirm `40_pipeline_system.md` §3.2 gate-skip and `47_pipeline_script_protocol.md` §R10 emitSummary schema.
- [ ] **Fix P1:** Remove 1-hour touch gate condition from `scripts/load-permits.js:320`. Add infra guardrail test.
- [ ] **Fix P2:** Create `migrations/111_notification_prefs_repair.sql`. Run `npm run migrate && npm run db:generate`. Add infra test.
- [ ] **Fix P3:** Refactor row builders in `assert-global-coverage.js` to standard `{metric, value, threshold, status}`. Remove `columns` declaration. Add infra test.
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bugs sharing same root causes.
- [ ] **Independent Review:** Spawn code reviewer agent (`isolation: "worktree"`).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. Paste final test count + typecheck result. → WF6.
