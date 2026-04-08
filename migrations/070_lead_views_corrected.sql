-- Migration 070 — lead_views corrected schema
-- Spec: docs/specs/product/future/70_lead_feed.md §Database Schema
-- ADR: docs/adr/002-polymorphic-lead-views.md — single polymorphic table is intentional
-- ADR: docs/adr/003-on-delete-cascade-on-permits-fk.md — ON DELETE CASCADE is intentional
-- ADR: docs/adr/006-firebase-uid-not-fk.md — user_id is a Firebase UID, not a FK
--
-- Backend Phase 0 migration 069 created lead_views with the wrong shape.
-- This migration drops that brand-new table (zero data) and recreates it
-- per spec 70: lead_key + lead_type + trade_slug + entity_id + saved, plus
-- FK CASCADE to both permits and entities, an XOR CHECK across the two
-- shapes, and three indexes for the hot competition-count and history paths.

-- UP
-- ALLOW-DESTRUCTIVE (lead_views is brand-new from 069, no data to preserve)
DROP TABLE IF EXISTS lead_views CASCADE;

CREATE TABLE lead_views (
  id           SERIAL       PRIMARY KEY,
  user_id      VARCHAR(100) NOT NULL,
  lead_key     VARCHAR(100) NOT NULL,
  lead_type    VARCHAR(20)  NOT NULL CHECK (lead_type IN ('permit', 'builder')),
  permit_num   VARCHAR(30),
  revision_num VARCHAR(10),
  entity_id    INTEGER,
  trade_slug   VARCHAR(50)  NOT NULL,
  viewed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  saved        BOOLEAN      NOT NULL DEFAULT false,
  UNIQUE (user_id, lead_key, trade_slug),
  FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  -- XOR: permit leads have permit cols populated, builder leads have entity_id
  CHECK (
    (lead_type = 'permit' AND permit_num IS NOT NULL AND revision_num IS NOT NULL AND entity_id IS NULL)
    OR
    (lead_type = 'builder' AND entity_id IS NOT NULL AND permit_num IS NULL AND revision_num IS NULL)
  )
);

-- Covering index for the hot competition-count path
CREATE INDEX idx_lead_views_lead_trade_viewed ON lead_views (lead_key, trade_slug, viewed_at);
-- User history
CREATE INDEX idx_lead_views_user_viewed ON lead_views (user_id, viewed_at DESC);
-- BRIN for retention sweep (insert-ordered timestamps)
CREATE INDEX idx_lead_views_viewed_brin ON lead_views USING BRIN (viewed_at);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_lead_views_viewed_brin;
-- DROP INDEX IF EXISTS idx_lead_views_user_viewed;
-- DROP INDEX IF EXISTS idx_lead_views_lead_trade_viewed;
-- DROP TABLE IF EXISTS lead_views CASCADE;
-- Note: recreating the 069 shape is not automatic; forward-only recovery.
