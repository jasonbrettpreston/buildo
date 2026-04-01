-- Migration 063: Add contact columns to wsib_registry for direct WSIB enrichment
-- Spec: docs/specs/pipeline/46_wsib_enrichment.md
--
-- Enables enriching WSIB entries directly via Serper, independent of the entities table.
-- Contacts flow from wsib_registry → entities on link via COALESCE in link-wsib.js.

-- UP
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS primary_phone VARCHAR(50);
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS primary_email VARCHAR(200);
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP;

-- Index for enrichment queue query (unenriched entries with trade names)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wsib_enrichment_queue
  ON wsib_registry (last_enriched_at)
  WHERE last_enriched_at IS NULL AND trade_name IS NOT NULL;

-- DOWN
-- DROP INDEX IF EXISTS idx_wsib_enrichment_queue;
-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS last_enriched_at;
-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS website;
-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS primary_email;
-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS primary_phone;
