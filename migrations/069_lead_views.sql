-- Migration 069: lead_views table
-- Spec: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
--
-- Tracks which authenticated users have viewed which permit-revisions.
-- Drives the "N tradespeople have seen this lead" social-proof / scarcity
-- signal in the lead feed UI.

-- UP
CREATE TABLE IF NOT EXISTS lead_views (
  user_id      TEXT        NOT NULL,
  permit_num   TEXT        NOT NULL,
  revision_num INTEGER     NOT NULL DEFAULT 0,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permit_num, revision_num)
);

CREATE INDEX IF NOT EXISTS idx_lead_views_user_viewed
  ON lead_views (user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_views_permit
  ON lead_views (permit_num, revision_num);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS lead_views;
