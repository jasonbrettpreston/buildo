-- Migration 055: Create entity_contacts table (replaces builder_contacts)
-- Part of Spec 37 consolidation: builders → entities.

-- UP
CREATE TABLE IF NOT EXISTS entity_contacts (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  contact_type VARCHAR(20),
  contact_value VARCHAR(500),
  source VARCHAR(50) NOT NULL DEFAULT 'user',
  contributed_by VARCHAR(100),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_contacts_entity
  ON entity_contacts (entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_contacts_type
  ON entity_contacts (contact_type);

-- Data migration: move builder_contacts → entity_contacts via builders→entities name match
INSERT INTO entity_contacts (entity_id, contact_type, contact_value, source, contributed_by, verified, created_at)
SELECT e.id, bc.contact_type, bc.contact_value, bc.source, bc.contributed_by, bc.verified, bc.created_at
FROM builder_contacts bc
JOIN builders b ON bc.builder_id = b.id
JOIN entities e ON e.name_normalized = b.name_normalized
ON CONFLICT DO NOTHING;

-- DOWN
-- DROP TABLE IF EXISTS entity_contacts;
