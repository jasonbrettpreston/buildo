# ADR 002: Single polymorphic `lead_views` table over split `permit_lead_views` + `builder_lead_views`

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

Migration 070 creates one `lead_views` table that stores both permit views and builder views, distinguished by a `lead_type` discriminator and an XOR CHECK constraint enforcing that exactly one of `(permit_num, revision_num)` or `entity_id` is non-null. Adversarial reviewers (Gemini × 2 phases, DeepSeek) flag this every cycle as "polymorphic anti-pattern" / "should split into two tables for type safety."

## Decision

Keep the single polymorphic table with the XOR CHECK constraint. Spec 70 §Database Schema documents this as an explicit design choice.

## Rationale

The hot query path is `SELECT COUNT(DISTINCT user_id) FROM lead_views WHERE lead_key = X AND trade_slug = Y AND viewed_at > NOW() - INTERVAL '30 days'`. This is the competition_count read on every view route call. Splitting into two tables would require a `UNION ALL` on every query, doubling the index lookups and breaking the covering index `(lead_key, trade_slug, viewed_at)` that makes the query index-only. The user history query `SELECT * FROM lead_views WHERE user_id = X ORDER BY viewed_at DESC` would also need a UNION.

The XOR CHECK gives us 95% of the type safety a split-tables design would provide. The remaining 5% (compile-time `lead_type` narrowing on rows) is handled at the TypeScript boundary in `record-lead-view.ts` via the discriminated `RecordLeadViewInput` union. Real-DB integration test `src/tests/db/migration-070-xor.db.test.ts` (Phase 2 tooling WF) locks the constraint at runtime so a future migration can't silently weaken it.

## Consequences

**Accepted:**
- Reviewers flag the pattern every cycle (mitigated by ADR link in migration header)
- TypeScript can't narrow `lead_type` from a raw row without a manual mapper
- Adding a new lead type requires extending the XOR CHECK (manageable; 1 migration)

**Avoided:**
- 2× index storage cost
- UNION ALL on the hot path
- Doubled write paths in the API route layer
- Two separate `(user_id, lead_key, trade_slug)` UNIQUE constraints to coordinate

## Re-evaluation Triggers

- A third lead type is added (entities, projects, etc.) — at 3+ types the XOR becomes a 3-way CHECK that's hard to read
- Lead view volume exceeds 100M rows and the index-only scan becomes a write-amplification problem
- PostgreSQL adds proper inheritance/discriminated tables that don't break query planning
