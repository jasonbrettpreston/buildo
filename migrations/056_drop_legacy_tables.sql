-- Migration 056: Drop legacy builder tables after entities consolidation (Spec 37)
-- builders → entities (migration 042), builder_contacts → entity_contacts (migration 055)

-- ALLOW-DESTRUCTIVE: builders and builder_contacts tables superseded by entities/entity_contacts (migration 042/055); data fully migrated before this runs.
-- UP

-- Remove wsib_registry FK to builders (linked_entity_id is the canonical FK now)
ALTER TABLE wsib_registry DROP CONSTRAINT IF EXISTS wsib_registry_linked_builder_id_fkey;
DROP INDEX IF EXISTS idx_wsib_linked;
ALTER TABLE wsib_registry DROP COLUMN IF EXISTS linked_builder_id;

-- Drop legacy tables (data already migrated)
DROP TABLE IF EXISTS builder_contacts;
DROP TABLE IF EXISTS builders;

-- DOWN
-- CREATE TABLE builders ( ... ); -- see migration 007
-- CREATE TABLE builder_contacts ( ... ); -- see migration 008
-- ALTER TABLE wsib_registry ADD COLUMN linked_builder_id INTEGER REFERENCES builders(id) ON DELETE SET NULL;
-- CREATE INDEX idx_wsib_linked ON wsib_registry (linked_builder_id) WHERE linked_builder_id IS NOT NULL;
