# Active Task: WF3 — Fix UNION ALL column order mismatch in LEAD_FEED_SQL
**Status:** Implementation

## Context
* **Goal:** Fix "UNION types character varying and integer cannot be matched" SQL error in getLeadFeed.
* **Target Spec:** `docs/specs/03-mobile/71_lead_feed_discovery_interface.md`
* **Rollback Anchor:** `43b23ad26703a11dd8ab817649487852b63fdeffa`
* **Key Files:** `src/features/leads/lib/get-lead-feed.ts`, `src/tests/get-lead-feed.logic.test.ts`

## Root Cause
`lifecycle_phase` (text) and `lifecycle_stalled` (bool) were added to `permit_candidates`
at positions 13–14 (after `estimated_cost`) in WF2 2026-04-11. The `builder_candidates`
CTE was patched by appending them at the END instead of inserting them at positions 13–14.

This shifts every column from position 13 onward by +2 in builder_candidates, causing:
  - Position 13: permit=lifecycle_phase (varchar) vs builder=active_permits_nearby (int) → CRASH
  - Positions 14-33: all subsequent columns are off by 2

## Fix
Move `NULL::text AS lifecycle_phase` and `false AS lifecycle_stalled` from the END of
builder_candidates to immediately AFTER `NULL::float8 AS estimated_cost` (position 12)
and BEFORE `COUNT(...)::int AS active_permits_nearby` (position 13).

## Standards Compliance
* **Try-Catch Boundary:** N/A — SQL string fix, no new catch blocks.
* **Unhappy Path Tests:** Structural guard test added to prevent positional regression.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A — backend fix.

## Execution Plan
- [ ] **Rollback Anchor:** Recorded above.
- [ ] **State Verification:** LEAD_FEED_SQL builder_candidates has lifecycle_phase/stalled at wrong position.
- [ ] **Spec Review:** Read spec 71 §Implementation — UNION ALL column contract.
- [ ] **Reproduction:** Add failing structural test: lifecycle_phase must precede active_permits_nearby in builder_candidates.
- [ ] **Red Light:** Confirm test fails.
- [ ] **Fix:** Move lifecycle_phase + lifecycle_stalled to correct position in builder_candidates.
- [ ] **Pre-Review Self-Checklist:** Verify 3-5 sibling bugs.
- [ ] **Green Light:** npm run test && npm run lint -- --fix. → WF6.
