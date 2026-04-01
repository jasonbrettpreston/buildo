-- UP: Add street_name_normalized columns for fast address matching in link-coa
-- Permits store street_name as base only (e.g. "COLBECK"), CoA stores composed (e.g. "COLBECK ST")
-- Normalizing at ingestion time eliminates runtime regex in JOINs

ALTER TABLE permits ADD COLUMN IF NOT EXISTS street_name_normalized VARCHAR;
ALTER TABLE coa_applications ADD COLUMN IF NOT EXISTS street_name_normalized VARCHAR;

-- Backfill permits: already clean base names, just UPPER/TRIM
UPDATE permits SET street_name_normalized = UPPER(TRIM(street_name))
WHERE street_name IS NOT NULL AND street_name_normalized IS NULL;

-- Backfill CoA: strip type suffixes using POSIX word boundaries [[:<:]] [[:>:]]
-- Same logic as scripts/lib/address.js normalizeStreetName()
UPDATE coa_applications SET street_name_normalized = NULLIF(TRIM(REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      UPPER(street_name),
      '[[:<:]](STREET|ST|AVENUE|AVE|DRIVE|DR|ROAD|RD|BOULEVARD|BLVD|COURT|CRT|CRESCENT|CRES|PLACE|PL|WAY|LANE|LN|TRAIL|TR|TERRACE|TERR|CIRCLE|CIR|PARKWAY|PKWY|GATE|GARDENS|GDNS|GROVE|GRV|HEIGHTS|HTS|MEWS|SQUARE|SQ)[[:>:]]',
      '', 'g'),
    '[[:<:]](NE|NW|SE|SW|N|S|E|W)[[:>:]]\s*$',
    '', 'g'),
  '\s+', ' ', 'g'
)), '')
WHERE street_name IS NOT NULL AND street_name_normalized IS NULL;

-- B-tree indexes for fast exact matching in link-coa.js
CREATE INDEX IF NOT EXISTS idx_permits_street_name_normalized
  ON permits (street_name_normalized) WHERE street_name_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coa_street_name_normalized
  ON coa_applications (street_name_normalized) WHERE street_name_normalized IS NOT NULL;

-- Composite index for Tier 1 matching: street_num + street_name_normalized
CREATE INDEX IF NOT EXISTS idx_permits_addr_normalized
  ON permits (street_num, street_name_normalized) WHERE street_name_normalized IS NOT NULL;

-- DOWN: Remove normalized columns and indexes
-- DROP INDEX IF EXISTS idx_permits_addr_normalized;
-- DROP INDEX IF EXISTS idx_coa_street_name_normalized;
-- DROP INDEX IF EXISTS idx_permits_street_name_normalized;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS street_name_normalized;
-- ALTER TABLE permits DROP COLUMN IF EXISTS street_name_normalized;
