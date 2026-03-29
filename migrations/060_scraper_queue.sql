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
DROP TABLE IF EXISTS scraper_queue;
