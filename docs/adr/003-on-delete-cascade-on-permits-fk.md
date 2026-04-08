# ADR 003: ON DELETE CASCADE on `lead_views.permit_num` FK

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

Migration 070 declares `lead_views_permit_fk FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE`. Adversarial reviewers flag CASCADE on a user-data table as "dangerous" — a pipeline bug that deletes a permit row would silently delete every user's interaction history with that lead.

## Decision

Keep `ON DELETE CASCADE`. Spec 70 §Database Schema documents this with the explicit cleanup-strategy rationale.

## Rationale

Permits are correctly deleted from the source-of-truth pipeline when:
1. The City of Toronto Open Data feed retracts a permit (revoked, cancelled with full history wipe)
2. A duplicate permit row from a deduplication script cleanup
3. A test fixture cleanup in CI

In all three cases, leaving orphaned `lead_views` rows pointing at a non-existent permit_num is worse than deleting them — they would silently break every JOIN, inflate `competition_count` queries with phantom users, and grow indefinitely. The PIPEDA/GDPR retention requirement (90-day window) means user data is never "lost" beyond what the spec already accepts.

The alternative — `ON DELETE RESTRICT` — would force the pipeline to manually nullify lead_views before deleting any permit, adding operational complexity. `SET NULL` would leave the lead_views row in an XOR-violating state (neither permit nor entity set), failing the CHECK constraint.

The real-DB integration test `src/tests/db/lead-views-fk.db.test.ts` (Phase 2 tooling WF) locks the cascade behavior at runtime.

## Consequences

**Accepted:**
- A pipeline bug that deletes a permit row also deletes user view history for that lead
- Reviewers flag the pattern every cycle (mitigated by ADR link)
- Recovery from accidental permit deletion requires restoring `lead_views` from backup (90-day window covers most scenarios)

**Avoided:**
- Orphan rows that fail the XOR CHECK
- Manual cascade logic in every pipeline script that touches permits
- A `cleanup_orphaned_lead_views.js` cron that would itself need its own ADR

## Re-evaluation Triggers

- User retention research shows that view history is more valuable than the cleanup automation savings
- A pipeline bug ships that wipes legitimate user history (i.e., the cascade fires on a delete that should have been an update)
- Migration to a soft-delete model (`deleted_at`) for permits — at which point the CASCADE becomes moot
