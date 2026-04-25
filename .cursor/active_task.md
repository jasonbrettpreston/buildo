# Active Task: WF3 — P1: backup_db SKIP on missing bucket; P2: notification_prefs column missing
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `c0c52168dd53ec0359541d1734d9d6db81132ed4`

## Context
* **Goal:** Fix two bugs surfaced by the WF5 permits pipeline run (2026-04-25):
  - **P1 (backup_db):** `backup_db` throws and fails the permits chain every local run because `BACKUP_GCS_BUCKET` is not set in dev environments. The correct behaviour for a missing bucket is to SKIP (emit a SKIP summary) rather than FAIL — production will have the var set; local dev should not break the chain.
  - **P2 (notification_prefs):** `classify-lifecycle-phase.js` emits a WARN on every run: `"START_DATE_URGENT query failed — column up.notification_prefs does not exist"`. The `user_profiles.notification_prefs` JSONB column is absent from the live DB despite migrations 108 and 111 both recorded as applied. The column needs re-adding via a new idempotent migration (112).

* **Target Spec:**
  - `docs/specs/00-architecture/112_backup_recovery.md` (P1: §4 edge case behaviour)
  - `docs/specs/03-mobile/92_mobile_engagement_hardware.md` (P2: §2.3 notification_prefs schema)
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (P1: §R5 startup guard SKIP pattern)

* **Key Files:**
  - `scripts/backup-db.js` — P1: change startup guard from throw → SKIP summary
  - `docs/specs/00-architecture/112_backup_recovery.md` — P1: update §4 Missing BACKUP_GCS_BUCKET edge case
  - `migrations/112_notification_prefs_repair_2.sql` — P2: new idempotent ADD COLUMN IF NOT EXISTS
  - `scripts/classify-lifecycle-phase.js` — P2: no code change needed (queries are already try/caught); the migration fixes the root cause
  - `src/tests/chain.logic.test.ts` — P1: regression test asserting backup-db.js uses emitSummary for missing bucket
  - `src/tests/api.infra.test.ts` — P2: regression test asserting notification_prefs column exists in migration SQL

## Technical Implementation

* **P1 (backup-db SKIP):** Replace the `throw new Error(...)` in the startup guard with the SDK SKIP pattern:
  ```js
  if (!rawBucket || rawBucket.trim() === '') {
    pipeline.emitSummary({
      records_total: null,
      records_new: null,
      records_updated: null,
      records_meta: { skipped: true, reason: 'BACKUP_GCS_BUCKET not configured — no backup on this environment' },
    });
    return;
  }
  ```
  Update spec 112 §4: "Missing BACKUP_GCS_BUCKET: Script emits a SKIP summary and exits 0. No advisory lock is acquired. No pg_dump is attempted. Chain continues."

* **P2 (notification_prefs migration):** Create `migrations/112_notification_prefs_repair_2.sql`:
  ```sql
  -- UP
  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
      "new_lead_min_cost_tier": "medium",
      "phase_changed": true,
      "lifecycle_stalled": true,
      "start_date_urgent": true,
      "notification_schedule": "anytime"
    }'::jsonb;
  -- DOWN
  -- ALLOW-DESTRUCTIVE
  ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;
  ```
  Run `npm run migrate` then `npm run db:generate`.

* **Database Impact:** YES (P2) — ADD COLUMN IF NOT EXISTS on `user_profiles` (1 row locally; small table in production). Non-destructive, idempotent.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes.
* **Unhappy Path Tests:** P1: assert backup-db.js emits SKIP summary (not throw) when bucket missing. P2: assert migration SQL contains ADD COLUMN IF NOT EXISTS notification_prefs.
* **logError Mandate:** N/A — no catch blocks added.
* **UI Layout:** N/A — backend/pipeline and schema changes only.

## Execution Plan
- [ ] **Rollback Anchor:** `c0c52168dd53ec0359541d1734d9d6db81132ed4`
- [ ] **State Verification:** `user_profiles` missing `notification_prefs`; backup_db throws on missing bucket.
- [ ] **Spec Review:** spec 112 §4, spec 47 §R5 SKIP pattern, spec 92 §2.3.
- [ ] **Reproduction (P1):** Add test asserting `backup-db.js` source does NOT use bare `throw` for missing bucket, MUST fail before fix.
- [ ] **Reproduction (P2):** Add test asserting migration SQL contains `notification_prefs`. MUST fail before fix (no migration 112 yet).
- [ ] **Red Light:** Both tests fail.
- [ ] **Fix P1:** Update `backup-db.js` startup guard to emit SKIP. Update spec 112 §4.
- [ ] **Fix P2:** Write `migrations/112_notification_prefs_repair_2.sql`. Run `npm run migrate && npm run db:generate`.
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bugs sharing same root causes.
- [ ] **Independent Review:** Spawn code reviewer agent (`isolation: "worktree"`).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. Paste final test count + typecheck result. → WF6.
