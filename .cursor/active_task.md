# Active Task: Fix assert-network-health.js — remove unnecessary status filter + defensive defaults
**Status:** Implementation
**Rollback Anchor:** `fcd6c30`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Remove the `status = 'completed'` filter from the telemetry query — it's unnecessary (run-chain.js already updates each step before the next runs) and creates a fragile coupling to orchestrator write-timing. Also add defensive row defaulting for first-ever-run scenario.
* **Target Spec:** `docs/specs/38_inspection_scraping.md` §3.6 Step 2
* **Key Files:**
  - `scripts/quality/assert-network-health.js` — fix SQL query + defensive defaults

## Technical Implementation
* **Fix 1:** Remove `AND status = 'completed'` from the SQL query. The `ORDER BY started_at DESC LIMIT 1` already gets the most recent run. This removes the fragile coupling and future-proofs against orchestrator timing changes.
* **Fix 2:** Default `lastRun.rows[0]` to empty object to prevent potential undefined destructuring on first-ever run.
* **Database Impact:** NO

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `fcd6c30`
- [ ] **State Verification:** Confirmed run-chain.js updates step rows before next step (Scenario A)
- [ ] **Fix:** Remove status filter + add defensive defaults
- [ ] **Green Light:** typecheck + test pass → WF6
