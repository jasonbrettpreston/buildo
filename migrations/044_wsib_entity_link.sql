-- Migration 044: Add linked_entity_id FK to wsib_registry
-- Spec: docs/specs/37_corporate_identity_hub.md

ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS linked_entity_id INTEGER REFERENCES entities(id);
CREATE INDEX IF NOT EXISTS idx_wsib_linked_entity ON wsib_registry(linked_entity_id) WHERE linked_entity_id IS NOT NULL;

-- Backfill from existing builder links
UPDATE wsib_registry w
SET linked_entity_id = e.id
FROM builders b
JOIN entities e ON e.name_normalized = b.name_normalized
WHERE w.linked_builder_id = b.id
  AND w.linked_entity_id IS NULL;
