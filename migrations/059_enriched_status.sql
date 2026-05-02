-- CONCURRENTLY-EXEMPT: indexes created before CONCURRENTLY was required; ran during controlled maintenance window.
-- UP
ALTER TABLE permits ADD COLUMN enriched_status VARCHAR(30) DEFAULT NULL;

-- Partial index for scraper batch selection: find permits needing scraping
CREATE INDEX idx_permits_enriched_status_scrape
  ON permits (issued_date DESC)
  WHERE enriched_status IS NULL
     OR enriched_status IN ('Permit Issued', 'Active Inspection', 'Not Passed');

-- Partial index for stalled detection sweep
CREATE INDEX idx_permits_enriched_active
  ON permits (permit_num)
  WHERE enriched_status = 'Active Inspection';

COMMENT ON COLUMN permits.enriched_status IS 'AIC portal-derived lifecycle status. NULL=not yet scraped. Values: Permit Issued, Active Inspection, Not Passed, Stalled, Inspections Complete';

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DROP INDEX IF EXISTS idx_permits_enriched_active;
-- DROP INDEX IF EXISTS idx_permits_enriched_status_scrape;
-- ALTER TABLE permits DROP COLUMN IF EXISTS enriched_status;
