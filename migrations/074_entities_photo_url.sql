-- Migration 074 — entities photo_url + photo_validated_at
-- Spec: docs/specs/product/future/73_builder_leads.md §Migration needed
--
-- V1 does not fetch builder photos. These columns are added now so Phase 1b
-- types and queries can reference them cleanly, and V2 can wire the
-- SSRF-safe pipeline fetcher without another migration. The HTTPS CHECK
-- enforces defense-in-depth at write time.

-- UP
ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_validated_at TIMESTAMPTZ;

ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https
  CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');

-- DOWN
-- ALLOW-DESTRUCTIVE
-- ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_url;
