-- 212_lead_views_coa_lead_type.sql
-- SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health.md · docs/specs/01-pipeline/42_chain_coa.md §6.11
--
-- WF2 P6 — CoA lead surfacing (admin-only opt-in; the mobile killswitch fence stays default-OFF).
-- The feed already emits a 3rd UNION arm reading lead_views rows with lead_type='coa'
-- (get-lead-feed.ts:550-660), but two CHECKs on lead_views block the write:
--   1. lead_views_lead_type_check  — admits only ('permit','builder')
--   2. lead_views_check (XOR shape) — has only the permit/builder arms (mig 070:33-37)
-- This migration widens the type list to include 'coa' AND adds a third XOR arm:
--   lead_type='coa' → permit_num / revision_num / entity_id ALL NULL (identity via
--   lead_key = 'coa:...'; no FK-targetable natural key, so all three shape columns are null).
-- lead_analytics needs NOTHING (already admits coa: lead_ids — verified [CR-F1][INT5]).
--
-- UP
-- Rogue-value pre-check (mig 209 pattern): fail loudly if a lead_type outside the
-- expected set already exists before we widen the CHECK.
DO $$
DECLARE rogue_count integer;
BEGIN
  SELECT COUNT(*) INTO rogue_count FROM lead_views
  WHERE lead_type IS NOT NULL
    AND lead_type NOT IN ('permit', 'builder');
  IF rogue_count > 0 THEN
    RAISE EXCEPTION 'migration 212: % lead_views rows carry a lead_type outside the current enum — investigate before extending the CHECK', rogue_count;
  END IF;
END $$;

ALTER TABLE lead_views DROP CONSTRAINT IF EXISTS lead_views_lead_type_check;
ALTER TABLE lead_views
    ADD CONSTRAINT lead_views_lead_type_check
    CHECK (lead_type IN ('permit', 'builder', 'coa'));

-- The XOR shape CHECK is anonymous in mig 070 (Postgres named it lead_views_check).
ALTER TABLE lead_views DROP CONSTRAINT IF EXISTS lead_views_check;
ALTER TABLE lead_views
    ADD CONSTRAINT lead_views_check
    CHECK (
      (lead_type = 'permit'  AND permit_num IS NOT NULL AND revision_num IS NOT NULL AND entity_id IS NULL)
      OR
      (lead_type = 'builder' AND entity_id IS NOT NULL AND permit_num IS NULL AND revision_num IS NULL)
      OR
      -- CoA leads carry identity in lead_key = 'coa:...'; no natural FK key on lead_views,
      -- so all three shape columns are NULL. Competition-count JOIN keys on lead_key.
      (lead_type = 'coa'     AND permit_num IS NULL AND revision_num IS NULL AND entity_id IS NULL)
    );

-- DOWN
-- ALLOW-DESTRUCTIVE (restores the 2-arm shape; any coa rows would first need pruning)
-- ALTER TABLE lead_views DROP CONSTRAINT IF EXISTS lead_views_check;
-- ALTER TABLE lead_views
--     ADD CONSTRAINT lead_views_check
--     CHECK (
--       (lead_type = 'permit'  AND permit_num IS NOT NULL AND revision_num IS NOT NULL AND entity_id IS NULL)
--       OR
--       (lead_type = 'builder' AND entity_id IS NOT NULL AND permit_num IS NULL AND revision_num IS NULL)
--     );
-- ALTER TABLE lead_views DROP CONSTRAINT IF EXISTS lead_views_lead_type_check;
-- ALTER TABLE lead_views
--     ADD CONSTRAINT lead_views_lead_type_check
--     CHECK (lead_type IN ('permit', 'builder'));
