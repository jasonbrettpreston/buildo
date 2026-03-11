# Active Task: Fix misleading health banner "failed in last 24h" label (B5)
**Status:** Planning

## Context
* **Goal:** `computeSystemHealth()` in `src/lib/quality/types.ts` pushes the message `"N pipelines failed in last 24h"` but the actual query (in `/api/quality` route) selects pipelines whose **latest run** has `status = 'failed'` — no 24h time filter. The label is misleading. Fix it to accurately describe what the query returns.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/lib/quality/types.ts` — `computeSystemHealth()` line 491
  - `src/app/api/quality/route.ts` — pipeline failure query lines 60-80
  - `src/tests/quality.logic.test.ts` — test asserting message text

## Technical Implementation

### Current behavior
- Query: `DISTINCT ON (pipeline) ... ORDER BY started_at DESC WHERE status = 'failed'` — gets latest run per pipeline, filters to failed ones. No time window.
- Message: `"N pipelines failed in last 24h"` — implies a 24h window that doesn't exist.

### New behavior
- Change message from `"N pipelines failed in last 24h"` to `"N pipelines have a failed latest run"`
- Update test assertion to match new message text
- No query change needed — the query logic is correct (checking latest run, not historical)

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API route changes.
* **Unhappy Path Tests:** N/A — no API route changes.
* **logError Mandate:** N/A — no API route changes.
* **Mobile-First:** N/A — text-only change in shared logic.

## Execution Plan
- [ ] **Rollback Anchor:** Git commit `994e5b5`
- [ ] **State Verification:** Current message says "failed in last 24h" per code inspection.
- [ ] **Spec Review:** Spec 28 §3 says health banner shows pipeline status — no specific wording mandated.
- [ ] **Reproduction:** Update test to assert the corrected message; must fail against current code.
- [ ] **Red Light:** New test fails.
- [ ] **Fix:** Change message string in `computeSystemHealth()`.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
