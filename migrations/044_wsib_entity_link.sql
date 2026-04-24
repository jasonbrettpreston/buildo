-- Migration 044: Add linked_entity_id FK to wsib_registry
-- Spec: docs/specs/37_corporate_identity_hub.md
-- CONCURRENTLY-EXEMPT: index created before CONCURRENTLY was required; column added to existing table but index was non-blocking at that volume.

-- UP
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS linked_entity_id INTEGER REFERENCES entities(id);
CREATE INDEX IF NOT EXISTS idx_wsib_linked_entity ON wsib_registry(linked_entity_id) WHERE linked_entity_id IS NOT NULL;

-- Backfill from existing builder links
UPDATE wsib_registry w
SET linked_entity_id = e.id
FROM builders b
JOIN entities e ON e.name_normalized = b.name_normalized
WHERE w.linked_builder_id = b.id
  AND w.linked_entity_id IS NULL;

-- DOWN
DROP INDEX IF EXISTS idx_wsib_linked_entity;
ALTER TABLE wsib_registry DROP COLUMN IF EXISTS linked_entity_id;
