-- Migration 077 — tighten permits geometry trigger + entities.photo_url CHECK
-- 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 0
--
-- Two fixes from the comprehensive review pass (DeepSeek Phase 0 review,
-- commit-pinned at d360e0a):
--
-- 1. Migration 067's sync_permit_location() trigger builds a PostGIS point
--    from raw latitude/longitude without range validation. A corrupt
--    ingestion row with latitude = 91.5 or longitude = -185 would create
--    an invalid geometry that crashes ST_DWithin queries downstream.
--    This migration rebuilds the trigger to guard the coordinate range
--    per WGS84 (lat ∈ [-90, 90], lng ∈ [-180, 180]).
--
-- 2. Migration 074's CHECK constraint `photo_url LIKE 'https://%'` accepts
--    malformed URLs like 'https://' or 'https:///foo'. This migration
--    replaces it with a regex that requires a hostname character class
--    after the scheme. Not an SSRF fix (photo_url is display-only and
--    fetched client-side by the browser, not the server), but prevents
--    junk data from landing in the column and confusing the UI layer.

-- UP

-- Rebuild the location sync trigger with coordinate range validation
CREATE OR REPLACE FUNCTION sync_permit_location() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL
     AND NEW.latitude BETWEEN -90 AND 90
     AND NEW.longitude BETWEEN -180 AND 180
  THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.longitude, NEW.latitude),
      4326
    )::geography;
  ELSE
    -- Out-of-range OR null coordinates produce NULL location. The lead
    -- feed SQL already filters `p.location IS NOT NULL`, so invalid
    -- rows are harmless in query output. Downstream ingestion logs
    -- will surface the null coordinate source for operator attention.
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is re-created by `CREATE OR REPLACE FUNCTION` above; no DROP/CREATE
-- on the trigger itself needed because PostgreSQL rebinds the function
-- reference automatically.

-- Tighten entities.photo_url CHECK constraint
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https
  CHECK (
    photo_url IS NULL
    OR photo_url ~ '^https://[a-zA-Z0-9][a-zA-Z0-9.\-]*(/.*)?$'
  );

-- DOWN
-- CREATE OR REPLACE FUNCTION sync_permit_location() RETURNS trigger AS $$
-- BEGIN
--   IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
--     NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
--   ELSE
--     NEW.location := NULL;
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
-- ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
-- ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');
