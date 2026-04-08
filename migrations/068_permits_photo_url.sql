-- Migration 068: Add photo_url column to permits
-- Spec: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
--
-- Pure column add. Stores a Street View / scraped photo URL for the
-- lead feed card hero image. Null when no photo has been resolved.

-- UP
ALTER TABLE permits ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- DOWN
-- ALLOW-DESTRUCTIVE
-- ALTER TABLE permits DROP COLUMN IF EXISTS photo_url;
