-- CONCURRENTLY-EXEMPT: index created before CONCURRENTLY was required; ran during controlled maintenance window.
-- UP: Add last_scraped_at to permits for scraper cooldown tracking.
-- Decouples "when did we last attempt this permit" from per-stage scraped_at
-- in permit_inspections (which only updates for stages returned by AIC).
-- Prevents infinite re-scrape loops when AIC removes a stage.

ALTER TABLE permits ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

-- Index for the orchestrator/standalone queue query
CREATE INDEX IF NOT EXISTS idx_permits_last_scraped_at
  ON permits (last_scraped_at) WHERE last_scraped_at IS NOT NULL;

-- DOWN: Remove column and index
-- DROP INDEX IF EXISTS idx_permits_last_scraped_at;
-- ALTER TABLE permits DROP COLUMN IF EXISTS last_scraped_at;
