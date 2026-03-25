# Active Task: Increase chain timeout to prevent classify_permits kill
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** The permits chain times out at 1 hour. link_wsib takes ~37 min (similarity query on 121K records), leaving only 23 min for classify_permits + 5 remaining steps. classify_permits needs ~30 min in --full mode, so it gets killed by the timeout.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — chain timeout constant (line 169)

## Technical Implementation
* **Root Cause:** Chain timeout is 3,600,000ms (1 hour). link_wsib (37m) + classify_permits (30m+) = 67m+ exceeds limit.
* **Fix:** Increase chain timeout from 1 hour to 2 hours (7,200,000ms).
* **Database Impact:** NO

## Standards Compliance
* ⬜ DB/UI/Shared/Pipeline: N/A
* ✅ API: Existing try-catch + logError preserved

## Execution Plan
- [ ] **Rollback Anchor:** `7a0fc5a`
- [ ] **Fix:** Change `3_600_000` to `7_200_000` in route.ts line 169
- [ ] **Green Light:** `npm run typecheck && npm run test`
