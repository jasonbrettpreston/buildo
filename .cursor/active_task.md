# Active Task: Fix assert-engine-health.js — ping-pong threshold, dynamic phase, VACUUM quoting
**Status:** Implementation
**Rollback Anchor:** `56a3efe`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 3 bugs: (1) PING_PONG_RATIO=2 causes permanent WARN on dimensional tables with natural lifecycle updates (geocode, parcel link, WSIB link, etc.) — raise to 10. (2) Hardcoded phase:16 breaks for sources/coa/deep_scrapes chains — use dynamic phase map. (3) Dynamic VACUUM ANALYZE SQL vulnerable to reserved keyword/hyphenated table names — quote identifiers.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `scripts/quality/assert-engine-health.js` — 3 fixes

## Technical Implementation
* **Bug 1:** Change `PING_PONG_RATIO = 2` → `10`. Permits table naturally accumulates 5-6x updates per insert (geocode + parcel + neighbourhood + WSIB + scope + trade classification). Threshold 2 would permanently WARN.
* **Bug 2:** Replace hardcoded `phase: 16` with chain-aware map: permits→16, sources→15, coa→9, deep_scrapes→6. Standalone defaults to 99.
* **Bug 3:** Wrap `target.table_name` in double quotes for VACUUM ANALYZE SQL.
* **Database Impact:** NO

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `56a3efe`
- [ ] **State Verification:** Confirmed PING_PONG_RATIO=2, hardcoded phase:16, unquoted VACUUM
- [ ] **Fix:** All 3 fixes in assert-engine-health.js
- [ ] **Green Light:** typecheck + test pass → WF6
