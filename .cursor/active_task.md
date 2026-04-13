# Active Task: WF2 — CRM & Analytics Sync
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `fd91c68` (feat(91_signal_evolution): accuracy layer)
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Connect the existing CRM assistant (update-tracked-projects.js) to the lead_analytics table so the "Marketplace Social Proof" (competition discount) stays in sync with actual user behavior every night. After processing alerts + archiving, the script aggregates all tracked_projects rows by permit and writes tracking_count + saving_count to lead_analytics.
* **Why now:** Migration 091 created `lead_analytics` but nothing populates it. The opportunity score engine reads from it (via LEFT JOIN) but gets COALESCE(0) for everything. Wiring the CRM script to aggregate and sync ensures the competition signal flows end-to-end.
* **Target Spec:** Signal Evolution
* **Key Files:** `scripts/update-tracked-projects.js`

## Technical Implementation

### New Step 5 in update-tracked-projects.js: Analytics Sync

After the existing Steps 1-4 (query → process → update → telemetry), add:

```sql
-- Aggregate all tracked_projects into lead_analytics
INSERT INTO lead_analytics (lead_key, tracking_count, saving_count, updated_at)
SELECT
  'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num, 2, '0') AS lead_key,
  COUNT(*) FILTER (WHERE tp.status IN ('claimed_unverified', 'claimed', 'verified')) AS tracking_count,
  COUNT(*) FILTER (WHERE tp.status = 'saved') AS saving_count,
  NOW()
FROM tracked_projects tp
WHERE tp.status NOT IN ('archived', 'expired')
GROUP BY tp.permit_num, tp.revision_num
ON CONFLICT (lead_key) DO UPDATE SET
  tracking_count = EXCLUDED.tracking_count,
  saving_count = EXCLUDED.saving_count,
  updated_at = NOW()
```

This runs as a single statement — no JS-side aggregation needed. Postgres does the GROUP BY, and ON CONFLICT handles the UPSERT. Uses LPAD to match the canonical lead_key format.

Also: zero out lead_analytics rows where no active tracked_projects remain (permits that were fully archived):
```sql
UPDATE lead_analytics la
   SET tracking_count = 0, saving_count = 0, updated_at = NOW()
 WHERE NOT EXISTS (
   SELECT 1 FROM tracked_projects tp
    WHERE 'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num, 2, '0') = la.lead_key
      AND tp.status NOT IN ('archived', 'expired')
 )
 AND (la.tracking_count > 0 OR la.saving_count > 0)
```

* **Database Impact:** Writes to existing `lead_analytics` table. No schema changes.

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK (existing).
* **Unhappy Path Tests:** Update infra test to assert analytics sync step.
* **logError Mandate:** pipeline.log.
* **Mobile-First:** N/A.

## Execution Plan

- [x] **State Verification:** lead_analytics table exists (migration 091). Currently 0 rows. update-tracked-projects.js has Steps 1-4.
- [ ] **Contract Definition:** lead_analytics.lead_key format must match LPAD convention.
- [ ] **Guardrail Test:** Update infra test for analytics sync.
- [ ] **Implementation:** Add Step 5 to update-tracked-projects.js.
- [ ] **Pre-Review Self-Checklist:**
  1. Does the LPAD match the canonical key format?
  2. Does the zero-out query correctly detect "no active trackers"?
  3. Does the UPSERT handle the first run (empty lead_analytics)?
  4. Does the script still complete in <1s with 0 tracked_projects?
- [ ] **Green Light:** Full test suite + live DB verification.
- [ ] **Review agents.** Triage, WF3, defer.
- [ ] → Commit.

---

## §10 Compliance
- ✅ **DB:** Writes to existing lead_analytics. No schema changes.
- ⬜ **API / UI:** N/A
- ��� **Shared Logic:** N/A
- ✅ **Pipeline:** Pipeline SDK. PIPELINE_META updated to declare lead_analytics write.
