# ADR 004: Manual `CREATE INDEX CONCURRENTLY` for `permits.location` GIST

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

Migration 067 creates a PostGIS `geometry(Point, 4326)` column on `permits` and adds a GIST index. Production has 237K+ permit rows; an unconstrained `CREATE INDEX` would lock the table for the duration. The migration framework (`scripts/migrate.js`) wraps each migration file in a transaction, which is incompatible with `CREATE INDEX CONCURRENTLY` (Postgres rejects CONCURRENTLY inside a transaction). Reviewers correctly flag this as operational risk.

## Decision

Keep the migration as-is with `CREATE INDEX IF NOT EXISTS idx_permits_location_gist`. Operations creates the index manually with `CONCURRENTLY` BEFORE applying the migration in production; the `IF NOT EXISTS` makes the in-migration statement a no-op when the operator has done their job.

## Rationale

Three alternatives were considered and rejected:

1. **Multi-phase migration runner that supports `CONCURRENTLY`** — would require splitting `scripts/migrate.js` into a transaction-mode and a concurrent-mode pass, doubling the runner complexity. Worth it once we have 5+ such migrations; not yet.
2. **Drop the index entirely** — fails the spec 70 distance query SLA (~50ms p99 today, would jump to a sequential scan of 237K rows ≈ 2-5 seconds).
3. **Pre-fill an `idx_permits_location_gist_temp` then rename** — works but adds 2 manual ops steps instead of 1, with the same risk surface.

The `IF NOT EXISTS` plus a runbook entry in operations docs is the lowest-overhead solution that doesn't compromise query performance. The validate-migration.js script catches accidental non-CONCURRENTLY index creation on tables marked >100K rows in the registry, so future indexes are gated.

## Consequences

**Accepted:**
- Production operators must remember to pre-create the index (mitigated by runbook + comment in migration 067 header)
- The migration is technically not idempotent in a fresh-clone-without-runbook scenario (mitigated by `IF NOT EXISTS`)
- Reviewers flag the pattern every cycle (mitigated by ADR link in migration header)

**Avoided:**
- 30-second to 5-minute table lock during migration deploy
- Sequential scans on every spec 70 distance query if index is dropped
- Migration runner refactor that splits transaction handling

## Re-evaluation Triggers

- A second migration needs `CONCURRENTLY` — worth investing in the runner refactor at that point
- Postgres adds in-transaction CONCURRENTLY support (unlikely; it's a fundamental WAL constraint)
- Operations team requests automation of the pre-create step
