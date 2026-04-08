# ADR 006: `user_id` columns store Firebase UIDs without a FK to a users table

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

`lead_views.user_id`, `user_profiles.user_id`, and any future user-keyed table store the Firebase Authentication UID directly as `VARCHAR(128)` with no foreign key. There is no `users` table in Postgres. Adversarial reviewers (Gemini, DeepSeek) flag this every cycle: "should be a FK for referential integrity."

## Decision

Keep `user_id` as a free-floating `VARCHAR(128)` column matching the Firebase UID format. Spec 70 §Database Schema documents this with the explicit "user_id NOT a FK (Firebase UID)" note.

## Rationale

Firebase Authentication owns the canonical user record, including the user lifecycle (signup, password reset, deletion). Mirroring it into a Postgres `users` table would require:

1. A bidirectional sync (Firebase Admin SDK webhook → Postgres trigger or cron) — adds infra surface and a new failure mode
2. Handling the eventual-consistency window between Firebase delete and Postgres mirror update — orphaned views from a "deleted but not yet synced" user
3. A reconciliation job for missed webhook deliveries

None of those add value over the current model: a Firebase deletion → Firebase Admin SDK reconciliation script (`scripts/purge-lead-views.js`, tracked as Phase 3 work) → bulk delete of `lead_views` rows by `user_id`. The reconciliation script reads the active Firebase users via the Admin SDK and DELETEs orphans. This is the same operation a FK + cascade would trigger, just batched.

The width consistency that DOES matter (VARCHAR(128) for the full Firebase UID range) is enforced by the contracts JSON (`schema.firebase_uid_max = 128`) and locked across migrations 075 and 076 by the contracts test.

## Consequences

**Accepted:**
- A bug that writes an arbitrary string into `user_id` won't fail at insert time (mitigated by the `getCurrentUserContext` contract that only ever returns a verified Firebase UID)
- A user deletion in Firebase doesn't immediately propagate to Postgres (mitigated by the reconciliation script in Phase 3)
- Reviewers flag the pattern every cycle (mitigated by ADR link in `migrations/075_user_profiles.sql` and `migrations/070_lead_views_corrected.sql` headers)

**Avoided:**
- A `users` mirror table requiring constant sync
- A new failure mode (sync drift) for every user-keyed write
- Cascade-delete races between Firebase webhook and Postgres FK enforcement

## Re-evaluation Triggers

- A second authentication provider is added (Google, Apple, etc.) — at that point a `users` table abstraction may pay for itself
- Reconciliation script latency exceeds the 90-day retention window (i.e., orphans persist past the cleanup SLA)
- Postgres adds first-class external-FK support (e.g., a constraint that consults a webhook)
