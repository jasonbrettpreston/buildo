-- Migration 066: Add is_gta flag to wsib_registry for GTA-only enrichment filtering
-- Saves ~72K Serper credits by excluding non-GTA businesses from enrichment queue.
-- Spec: docs/specs/pipeline/40_pipeline_system.md
-- CONCURRENTLY-EXEMPT: index created before CONCURRENTLY was required; ran during controlled maintenance window.

-- UP
ALTER TABLE wsib_registry ADD COLUMN IF NOT EXISTS is_gta BOOLEAN DEFAULT false;

-- Backfill: match mailing_address against GTA municipalities
UPDATE wsib_registry SET is_gta = true
WHERE mailing_address ILIKE ANY(ARRAY[
  -- Toronto proper (pre-amalgamation names still appear in addresses)
  '%Toronto%', '%Scarborough%', '%Etobicoke%', '%North York%', '%East York%',
  -- Peel Region
  '%Mississauga%', '%Brampton%', '%Caledon%',
  -- York Region
  '%Markham%', '%Vaughan%', '%Richmond Hill%', '%King City%', '%Aurora%',
  '%Newmarket%', '%Stouffville%', '%Georgina%',
  -- Halton Region
  '%Oakville%', '%Burlington%', '%Milton%', '%Halton Hills%',
  -- Durham Region
  '%Ajax%', '%Pickering%', '%Oshawa%', '%Whitby%', '%Clarington%'
]);

-- Partial index for enrichment queue: only GTA businesses that haven't been enriched
CREATE INDEX IF NOT EXISTS idx_wsib_is_gta_unenriched
  ON wsib_registry (is_gta)
  WHERE is_gta = true AND last_enriched_at IS NULL;

-- DOWN
-- DROP INDEX IF EXISTS idx_wsib_is_gta_unenriched;
-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS is_gta;
