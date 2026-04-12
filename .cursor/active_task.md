# Active Task: WF1 — CRM Assistant Script (update-tracked-projects.js)
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Build a nightly pipeline script that acts as an intelligent, non-spammy CRM assistant. It processes tracked projects (saves + claims), detects state changes (stalled, urgency shifts, window closures), generates alerts ONLY when reality shifts, and auto-archives dead leads. Two "memory" columns (`last_notified_urgency`, `last_notified_stalled`) prevent duplicate notifications across runs.
* **Why now:** Migration 089 created the `tracked_projects` table. The flight tracker (Phase 4) populates `trade_forecasts` with urgency data. This script is the consumer that ties them together into a user-facing notification pipeline.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md`
* **Key Files:** `migrations/090_tracked_projects_memory.sql` (new), `scripts/update-tracked-projects.js` (new), `src/tests/update-tracked-projects.infra.test.ts` (new)

## Technical Implementation

### Migration 090: Memory columns + expanded status CHECK

```sql
-- Add memory columns
ALTER TABLE tracked_projects
  ADD COLUMN last_notified_urgency VARCHAR(50),
  ADD COLUMN last_notified_stalled BOOLEAN DEFAULT false;

-- Expand status CHECK to include 'saved', 'claimed', 'archived'
ALTER TABLE tracked_projects
  DROP CONSTRAINT chk_tracked_status,
  ADD CONSTRAINT chk_tracked_status
    CHECK (status IN (
      'saved',              -- passive watchlist (no alerts)
      'claimed_unverified', -- claimed but not verified
      'claimed',            -- actively claimed
      'verified',           -- verified claim
      'archived',           -- window closed or expired
      'expired'             -- TTL expired
    ));
```

### Script: `update-tracked-projects.js`

**Data aggregation:** Single JOIN across `tracked_projects × permits × trade_forecasts`.

**Two routing paths:**

**Path A — Saved projects (passive watchlist):**
- If window closed (isPastTarget) or urgency=expired → auto-archive
- No alerts generated — saves are passive

**Path B — Claimed projects (active flight board):**
1. **Auto-archive:** if window closed → status='archived', stop processing
2. **Stall alert:** `lifecycle_stalled=true` AND `last_notified_stalled != true` → queue STALL_WARNING, set `last_notified_stalled=true`
3. **Recovery alert:** `lifecycle_stalled=false` AND `last_notified_stalled=true` → queue STALL_CLEARED, set `last_notified_stalled=false`
4. **Imminent alert:** `urgency='imminent'` AND `last_notified_urgency != 'imminent'` → queue START_IMMINENT, set `last_notified_urgency='imminent'`

**Output:**
- Batch UPDATE to `tracked_projects` (status changes + memory flag updates)
- Alerts array emitted in PIPELINE_SUMMARY for downstream notification dispatch

### Imports from shared lib
- `TRADE_TARGET_PHASE` — bimodal targets for window-closed detection
- `PHASE_ORDINAL` — ordinal comparison for isPastTarget

* **Database Impact:** YES — migration 090 adds 2 columns + updates CHECK. Script writes to `tracked_projects`.

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK `pipeline.run` wrapper.
* **Unhappy Path Tests:** Infra shape tests for migration + script.
* **logError Mandate:** Uses `pipeline.log`.
* **Mobile-First:** N/A.

## Execution Plan

- [ ] **Contract Definition:** The alerts array shape is the contract for the notification service (future WF1). The `last_notified_*` columns are the CRM memory contract.

- [ ] **Spec & Registry Sync:** Wire into manifest + FreshnessTimeline. Add to permits chain after `compute_trade_forecasts`.

- [ ] **Schema Evolution:**
  - Write `migrations/090_tracked_projects_memory.sql`
  - `npm run migrate && npm run db:generate`
  - `npm run typecheck`

- [ ] **Test Scaffolding:**
  - `src/tests/migration-090.infra.test.ts` — column shape + CHECK values
  - `src/tests/update-tracked-projects.infra.test.ts` — script shape

- [ ] **Red Light:** Tests FAIL before implementation.

- [ ] **Implementation:**
  1. Write migration 090
  2. Write `scripts/update-tracked-projects.js`
  3. Wire into manifest + FreshnessTimeline + funnel
  4. Run against live DB (no tracked_projects rows yet — verify 0 alerts, 0 updates)

- [ ] **Pre-Review Self-Checklist:**
  1. Does the state-change detection prevent duplicate alerts? (stall: `last_notified_stalled !== true`, urgency: `last_notified_urgency !== 'imminent'`)
  2. Does auto-archive work for both saved AND claimed?
  3. Is the JOIN correct when tracked_projects has no matching trade_forecasts row? (LEFT JOIN or skip?)
  4. Does the script handle permits with NULL lifecycle_phase? (skip)
  5. Does the batch UPDATE use per-row granularity (not one UPDATE for all)?
  6. Are the alert messages trade-specific and permit-specific?

- [ ] **Green Light:** Full test suite + typecheck + live DB verification.
- [ ] **Independent + adversarial review agents.** Triage, WF3, defer.
- [ ] → WF6 + commit.

---

## §10 Compliance

- ✅ **DB:** Migration 090 — 2 nullable ADD COLUMN (instant) + CHECK constraint update. Commented DOWN.
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ✅ **Shared Logic:** Imports TRADE_TARGET_PHASE + PHASE_ORDINAL from shared lib.
- ✅ **Pipeline:** Pipeline SDK · PIPELINE_SUMMARY with alerts array · wired into manifest + chain
