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
DROP INDEX IF EXISTS idx_permits_enriched_active;
DROP INDEX IF EXISTS idx_permits_enriched_status_scrape;
ALTER TABLE permits DROP COLUMN IF EXISTS enriched_status;
