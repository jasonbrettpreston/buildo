-- Migration 060: Scraper queue for multi-worker batch claiming
-- SPEC LINK: docs/specs/38_inspection_scraping.md §3.9

-- UP
CREATE TABLE scraper_queue (
  year_seq     VARCHAR(20) PRIMARY KEY,
  permit_type  TEXT NOT NULL,
  claimed_at   TIMESTAMPTZ,
  claimed_by   TEXT,
  completed_at TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scraper_queue_pending ON scraper_queue (created_at)
  WHERE status = 'pending';

COMMENT ON TABLE scraper_queue IS 'Batch claiming queue for multi-worker AIC inspection scraper';

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DROP TABLE IF EXISTS scraper_queue;
