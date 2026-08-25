# Active Task: WF3 — CoA lead inspector trade_slug column drift (Pass-2 finding)
**Status:** Implementation
**Workflow:** WF3 — per-finding fix from Spec 79 §7 Surface 1 walkthrough (2026-05-20)
**Domain Mode:** Backend/Pipeline (admin API)

## Context
- §7 Surface 1 walkthrough: entering `COA-B0015/26TEY` in `/admin/lead-feed/inspector` returns HTTP 500.
- Dev-log stack: `column lt.trade_slug does not exist` at `src/lib/leads/lead-inspect-query.ts:787` (`fetchCoaPanel`) inside `COA_LEAD_TRADES_SQL` (line 670).
- Root cause: `lead_trades` has `trade_id` (FK), not `trade_slug`. The query reads `lt.trade_slug` and JOINs `trades t ON t.slug = lt.trade_slug`. Both bare-column reference fail (42703).
- The permit-trades query at line 224 already follows the correct pattern: `SELECT pt.trade_id, t.slug AS trade_slug ... FROM permit_trades pt LEFT JOIN trades t ON ...`.

## Fix
Rewrite `COA_LEAD_TRADES_SQL` to read `lt.trade_id`, JOIN `trades t ON t.id = lt.trade_id`, and SELECT `t.slug AS trade_slug` so the downstream `CoaLeadTradesRow` shape (with `trade_slug: string` field) is preserved.

## Execution Plan
- [ ] Edit COA_LEAD_TRADES_SQL at lib/leads/lead-inspect-query.ts:669-676
- [ ] Verify with `curl /api/admin/leads/inspect/COA-B0015%2F26TEY` returns 200
- [ ] Verify in UI by entering CoA lead in inspector
- [ ] Update relevant infra test if any reference this SQL shape
- [ ] Commit + push

## Operating Boundaries
- Target: `src/lib/leads/lead-inspect-query.ts` (~3 LOC in the COA_LEAD_TRADES_SQL block)
- Out of scope: any other column drift, related schemas, or COA_DECISION_HISTORY_SQL / COA_CROSS_STREAM_SQL queries unless they show similar bugs
