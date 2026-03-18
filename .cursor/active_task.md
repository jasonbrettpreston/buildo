# Active Task: Fix 3 classifier bugs — fallback crash, scope bypass, Tier 3 ratio
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `518b66c`

## Execution Plan
- [ ] Fix non-null assertion crash in fallbackWorkTrades + narrow-scope fallback
- [ ] Fix narrow-scope fallback bypassing applyScopeLimit
- [ ] Fix Tier 3 match ratio penalizing long descriptions
- [ ] typecheck + test → WF6
