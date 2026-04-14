# Active Task: Wire CRM alert delivery to notifications table
**Status:** Planning (DECISION-BLOCKED + SEQUENCE-BLOCKED)
**Domain Mode:** Backend/Pipeline
**Finding:** H-W12 · 82-W1

**Blocked by Decision D1:** Spec 82 §4 Outputs only mentions mutating `tracked_projects` + `lead_analytics`. The spec promises alerts in §1 user stories but does not declare the delivery mechanism. Four options (per SEQUENCING.md D1):
- (a) **INSERT into `notifications` table** (migration 010 already exists; `src/app/api/notifications/route.ts` reads it). This is the most likely intended path.
- (b) Emit to a message queue (no queue infra exists).
- (c) External webhook/email integration.
- (d) Batch-dispatch via a downstream chain step.

**This plan assumes D1=(a)** — INSERT into `notifications`. Adjust if decision lands elsewhere.

**Sequence-blocked:** Do NOT land this until WF3-05 (`imminent_window_days` consumption) is in production. Delivering alerts gated on a cosmetic 14-day hardcode would ship wrong alerts at scale — operators adjusting the Control Panel knob would not see corresponding alert changes.

## Context
* **Goal:** Close the spec-vs-code gap where `update-tracked-projects.js` computes alert objects correctly and emits them ONLY in `PIPELINE_SUMMARY.records_meta.alerts` JSONB — never INSERT'd into the `notifications` table, never sent via any API, never surfaced to end users. Spec 82 user stories ("plumber receives Back to Work alert") are 100% unimplemented. The current infra test greps the source file for the word "alerts" and passes — false confidence.
* **Target Spec:** `docs/specs/product/future/82_crm_assistant_alerts.md` (declare delivery mechanism per H-S20; define alert-type enum per H-S10)
* **Key Files:**
  - `scripts/update-tracked-projects.js` (Step 3 `withTransaction` block at L225–253 — add INSERT into notifications after tracked_projects UPDATE; Step 5 records_meta — cap alerts array per 82-W12)
  - `migrations/010_notifications.sql` (confirm schema: `user_id`, `type`, `permit_num`, `trade_slug`, `message`, `created_at`, `read`, `sent`)
  - `src/app/api/notifications/route.ts` (read path — verify it returns the expected shape)
  - `src/tests/update-tracked-projects.infra.test.ts` (replace false-confidence test with real INSERT assertion)

## Technical Implementation
* **New/Modified Components:**
  - Inside the existing Step 3 `withTransaction(pool, async (client) => {...})` block, add a single bulk `INSERT INTO notifications (user_id, type, permit_num, trade_slug, message, created_at) SELECT …` from the accumulated `alerts[]` array.
  - Batch INSERT with multi-row VALUES — at 6 columns × ~1000 alerts = 6000 params, safely under §9.2 limit.
  - Cap `alerts` array in records_meta (per 82-W12) to ~200 + truncation flag.
  - Alert-type enum declared in shared constants (script + spec): `STALL_WARNING`, `STALL_CLEARED`, `START_IMMINENT`.
* **Data Hooks/Libs:** existing `pipeline.withTransaction`; existing `notifications` schema.
* **Database Impact:** NO new migration (notifications table exists). Row writes are additive + idempotent — but duplicate alert firing on re-run should be prevented by the memory-column guards (`last_notified_stalled`, `last_notified_urgency`) already present.

## Standards Compliance
* **Try-Catch Boundary:** N/A (pipeline script).
* **Unhappy Path Tests:**
  - Happy path: script fires 5 alerts → 5 rows appear in notifications table after COMMIT.
  - Atomicity: inject exception AFTER notifications INSERT but BEFORE COMMIT → notifications rolled back; no half-committed state.
  - Duplicate suppression: re-run script same day with no state changes → 0 new rows in notifications (memory columns prevent double-fire).
  - Alert-type enum: every inserted row has `type` in the declared set.
* **logError Mandate:** N/A (script uses `pipeline.log`).
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Query current `notifications` row count. Confirm migration 010 schema is what this script expects to write (user_id + type + permit_num + trade_slug + message columns exist). Verify the existing `src/app/api/notifications/route.ts` read path will surface the new rows to end users correctly (check for any filter like `WHERE sent = true` that would hide newly-inserted rows).
- [ ] **Spec Review:** Await D1. Once settled, read spec 82 §4 Outputs update declaring the delivery contract. Read alert-type enum per H-S10.
- [ ] **Reproduction:** Rewrite `src/tests/update-tracked-projects.infra.test.ts`. Fixture: tracked_project that just went stalled. Run script. Assert: (a) notifications row exists with correct user_id, type='STALL_WARNING', permit_num, message; (b) `tracked_projects.last_notified_stalled` flipped to true; (c) running again inserts 0 new rows (idempotency via memory columns). Remove the grep-for-"alerts" assertion.
- [ ] **Red Light:** Tests fail because the INSERT doesn't exist.
- [ ] **Fix:**
  1. Inside the Step 3 `withTransaction`, after the per-row UPDATE loop completes (or replace the per-row UPDATE with a bulk UPDATE per 82-W9 if WF3-03 landed it), add: `INSERT INTO notifications (user_id, type, permit_num, trade_slug, message, created_at) VALUES ($1,$2,...),(...)` with all `alerts[]` accumulated this run.
  2. Replace `alerts: alerts` in records_meta (L330) with `alerts: alerts.slice(0, 200), alerts_total: alerts.length, alerts_truncated: alerts.length > 200`.
  3. Declare `ALERT_TYPES = Object.freeze({STALL_WARNING:'STALL_WARNING', STALL_CLEARED:'STALL_CLEARED', START_IMMINENT:'START_IMMINENT'})` at the top of the script; use throughout.
  4. Update infra test per above.
  5. If WF3-09b (audit_table for 82) has landed, add `alerts_delivered_to_notifications` row with threshold `== total_alerts` FAIL if drift.
- [ ] **Pre-Review Self-Checklist:**
  1. Does the `notifications` schema have a unique constraint that could reject a genuine re-alert scenario (e.g., (user_id, permit_num, type))? Check migration.
  2. Does `src/app/api/notifications/route.ts` filter by `sent = false` — if so, does the new INSERT default `sent = false`? (Check migration 010 default.)
  3. Does the front-end display `type` values correctly (front-end is out of scope for this WF3 but worth flagging in WF1 follow-up)?
  4. Does the alert batch size ever exceed §9.2 param limit? 6 cols × max 10K alerts = 60K params — at the edge; chunk to 5000 if realistic.
  5. Does re-running on the same night produce duplicate rows? Memory-column guards on tracked_projects (last_notified_*) prevent re-firing the alert computation; the INSERT doesn't execute for those rows. Verify.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: No migration (table exists); write-only · §3.1 N/A · §3.2 chunked INSERT if alerts > 5000
- ✅ API: no new routes; existing notifications route consumes the new rows · no API boundary test changes beyond infra.test.ts
- ⬜ UI: Front-end out of scope
- ✅ Shared Logic: ALERT_TYPES enum spec'd + consumed
- ✅ Pipeline: §9.1 INSERT inside existing withTransaction · §9.2 param cap respected · §9.3 idempotency via memory columns

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)** — AFTER D1 is selected AND WF3-05 is in production
