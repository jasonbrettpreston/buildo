-- Migration 058: Add unique constraint on entity_contacts to prevent duplicate social links
-- Without this, ON CONFLICT DO NOTHING has no constraint to trigger on,
-- causing duplicate rows on re-enrichment.

-- UP
ALTER TABLE entity_contacts
  ADD CONSTRAINT uq_entity_contacts_type_value
  UNIQUE (entity_id, contact_type, contact_value);

-- DOWN
-- ALTER TABLE entity_contacts DROP CONSTRAINT IF EXISTS uq_entity_contacts_type_value;
