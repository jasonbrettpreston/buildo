-- 231_admin_backup_codes.sql
-- SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
--   + docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B default
--   deny — RLS enabled, ZERO policies, server-only access via the D1 pg pool)
--   + .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22: backup codes hashed,
--   shown once, never persisted in plaintext).
--
-- MFA backup codes for admin accounts. supabase-js has no native backup-code
-- API, so codes are generated server-side at TOTP verify-success (10 per
-- admin), stored ONLY as sha256(salt || code) with a per-code salt, and each
-- is single-use (used_at watermark, race-guarded by the consume UPDATE's
-- `used_at IS NULL` predicate). Consumed by `src/lib/admin/backup-codes.ts`;
-- accepted as an MFA-challenge alternative by `src/lib/auth/verify-admin.ts`.

-- UP
BEGIN;

CREATE TABLE admin_backup_codes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  code_salt  TEXT NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consume-path lookup: "all UNUSED codes for this admin" (the verify-admin
-- gate compares candidate hashes against at most 10 rows). Partial index —
-- used codes are dead rows kept only for audit trail.
CREATE INDEX idx_admin_backup_codes_user_unused
  ON admin_backup_codes (user_id) WHERE used_at IS NULL;

-- Spec 114 §4 Class B posture: RLS enabled with ZERO policies = default deny
-- for anon/authenticated (no standing grants either, §1). All reads/writes go
-- through the server-side D1 pool (table owner) — a backup-code hash must
-- never be selectable by any client-facing role, its own admin included
-- (possession of a session is exactly what a backup code substitutes for).
ALTER TABLE admin_backup_codes ENABLE ROW LEVEL SECURITY;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line).
-- BEGIN;
--   DROP TABLE IF EXISTS admin_backup_codes;
-- COMMIT;
