-- 217_account_preset_supplier_admin_audit_log.sql
-- SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md (P24 24A)
--            docs/specs/03-mobile/95_mobile_user_profiles.md §2.5
--
-- P24 24A — three zero-row-risk plumbing changes (dev user_profiles = 0 rows):
--   1. Widen chk_account_preset to admit 'supplier' (the self-serve product
--      persona; architecturally identical to a tradesperson). Original CHECK is
--      in migration 114:49-50.
--   2. Backfill NULL account_preset on existing rows so the new admin directory
--      filter is not born broken. Deterministic, mirroring
--      src/lib/classification/account-preset.ts v2 (realtor -> realtor; a
--      NULL-trade row with a multi-trade override -> manufacturer; else
--      tradesperson). 'supplier' is EXPLICIT-ONLY (admin provisioning / the
--      audited join-editor set_preset) and is NEVER inferred from the trade —
--      the v1 product-trade partition was overruled 2026-07-11 (in-place edit
--      pre-push; dev table was 0 rows): a trade slug cannot distinguish a
--      plumber from a plumbing-supply manufacturer, and the majority self-serve
--      persona must not be mislabeled.
--   3. admin_audit_log table + a right-to-be-forgotten scrub function. PII-FACT
--      convention: PII-field mutations record the FACT of the change (which
--      field, by whom, when) in old_value/new_value as a redaction marker, NEVER
--      the raw PII value; the scrub function NULLs any residual JSONB for a
--      deleted target so a hard-deleted user leaves no PII behind.

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

-- 1. Widen the account_preset CHECK. Rogue-value pre-check (mig 209/212 pattern):
--    fail loudly if a preset outside the current+new enum already exists.
DO $$
DECLARE rogue_count integer;
BEGIN
  SELECT COUNT(*) INTO rogue_count FROM user_profiles
  WHERE account_preset IS NOT NULL
    AND account_preset NOT IN ('tradesperson', 'realtor', 'manufacturer', 'supplier');
  IF rogue_count > 0 THEN
    RAISE EXCEPTION 'migration 217: % user_profiles rows carry an account_preset outside the expected set — investigate before widening the CHECK', rogue_count;
  END IF;
END $$;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_account_preset;
ALTER TABLE user_profiles ADD CONSTRAINT chk_account_preset
  CHECK (account_preset IN ('tradesperson', 'realtor', 'manufacturer', 'supplier'));

-- 2. NULL-preset backfill (v2 — supplier explicit-only, never inferred).
--    Mirrors deriveAccountPreset in src/lib/classification/account-preset.ts.
UPDATE user_profiles
SET account_preset = CASE
  WHEN trade_slug = 'realtor' THEN 'realtor'
  WHEN trade_slug IS NOT NULL THEN 'tradesperson'
  WHEN trade_slugs_override IS NOT NULL AND array_length(trade_slugs_override, 1) > 0 THEN 'manufacturer'
  ELSE 'tradesperson'
END
WHERE account_preset IS NULL;

-- 3. admin_audit_log — every admin mutation writes exactly one row here.
--    FK-EXEMPT on target_uid: audit rows must survive the target user being
--    hard-deleted (the scrub function below removes only the PII-bearing JSONB,
--    not the fact-of-action row).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_uid   VARCHAR(128) NOT NULL,
  action      TEXT NOT NULL,
  target_uid  TEXT,
  -- old_value / new_value: for NON-PII fields these carry the literal before/after
  -- JSONB; for PII fields (full_name, phone_number, email, company_name, backup_email)
  -- they carry a redaction marker like {"full_name":"<redacted>"} — the FACT, never
  -- the value (PII-FACT convention). The scrub function NULLs both on target delete.
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON admin_audit_log (target_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON admin_audit_log (admin_uid, created_at DESC);

-- Right-to-be-forgotten scrub: NULL any residual JSONB for a hard-deleted target.
-- Returns the number of audit rows scrubbed. Called by the admin delete mutation
-- after Firebase deletion + PII nullify (Spec 21 §3.3 / P24 24B).
CREATE OR REPLACE FUNCTION scrub_admin_audit_for_target(p_target_uid TEXT)
RETURNS integer AS $func$
DECLARE affected integer;
BEGIN
  UPDATE admin_audit_log
  SET old_value = NULL, new_value = NULL
  WHERE target_uid = p_target_uid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$func$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 212/213/215 convention).
-- ============================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS scrub_admin_audit_for_target(TEXT);
--   DROP TABLE IF EXISTS admin_audit_log;
--   -- account_preset backfill is not reversible to NULL (original values lost);
--   -- restore the narrow CHECK only if all 'supplier' rows are first migrated away.
--   ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_account_preset;
--   ALTER TABLE user_profiles ADD CONSTRAINT chk_account_preset
--     CHECK (account_preset IN ('tradesperson', 'realtor', 'manufacturer'));
-- COMMIT;
