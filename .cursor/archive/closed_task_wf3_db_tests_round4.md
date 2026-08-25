# Active Task: WF3 — round 4 lead_analytics.lead_id NOT NULL (mig 141)
**Status:** Implementation
**Workflow:** WF3 — CI unblock continuation
**Domain Mode:** Backend/Pipeline

## Context
After commit 4ea14b7, CI run 26132761875 narrowed to 2 remaining failures — both in `compute-opportunity-scores.db.test.ts` T1+T2. Mig 141 promoted `lead_analytics.lead_id` to NOT NULL. Test still uses legacy `lead_key`-only INSERT.

## Fix
Add `lead_id = leadId` (same value as lead_key) to both INSERTs. lead_key is the legacy column; lead_id is the canonical FK column going forward.

## Execution Plan
- [ ] Add lead_id to both INSERTs in compute-opportunity-scores.db.test.ts
- [ ] Commit + push, monitor CI
