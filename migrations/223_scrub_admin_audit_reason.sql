-- 223_scrub_admin_audit_reason.sql
-- SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.4
-- FK-EXEMPT
--
-- P24 close-out (Security review F2): the right-to-be-forgotten scrub cleared
-- old_value/new_value but NOT the free-text `reason` column. `reason` is
-- admin-typed and never passed through redactPii, so PII an admin typed into a
-- delete reason (e.g. a name/phone) survived the RTBF scrub forever — a leak
-- that defeats the guarantee. CREATE OR REPLACE the function to also NULL
-- `reason`. The fact-of-action row (action / admin_uid / target_uid / created_at)
-- remains; only the payloads go, consistent with old_value/new_value.
--
-- NOTE (validator hygiene): comments avoid apostrophes.
--
-- UP
CREATE OR REPLACE FUNCTION scrub_admin_audit_for_target(p_target_uid TEXT)
RETURNS integer AS $func$
DECLARE affected integer;
BEGIN
  UPDATE admin_audit_log
  SET old_value = NULL, new_value = NULL, reason = NULL
  WHERE target_uid = p_target_uid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$func$ LANGUAGE plpgsql;

-- DOWN
-- comment-only per Rule 6. Restore the pre-223 function (reason NOT scrubbed):
-- CREATE OR REPLACE FUNCTION scrub_admin_audit_for_target(p_target_uid TEXT)
-- RETURNS integer AS $f$ DECLARE affected integer; BEGIN
--   UPDATE admin_audit_log SET old_value = NULL, new_value = NULL WHERE target_uid = p_target_uid;
--   GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected; END; $f$ LANGUAGE plpgsql;
