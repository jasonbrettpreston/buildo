-- Migration 173: create the `toronto_centreline` source table + address helpers (Spec 62 §8c / M-1).
-- Toronto Centreline (TCL) street-network LineStrings.
-- SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md (v1.1 §2 + §12.3 + L27)
-- Loaded by scripts/load-centreline.js (advisory lock 63).
-- FK-EXEMPT: source_id is the CKAN CENTRELINE_ID source identifier (UNIQUE NOT NULL),
--            not a foreign key — no REFERENCES intended.

-- UP

-- L27 helper: split a civic address into (numeric_part, suffix). IMMUTABLE so it can be
-- used inside index/expression contexts. F-S2: suffix preserves the leading space ("12 1/2"
-- → suffix=" 1/2") — uses ELSE m[2], NOT trim(m[2]), so the disambiguating space survives.
CREATE OR REPLACE FUNCTION normalize_address_number(addr TEXT)
RETURNS TABLE(numeric_part INT, suffix TEXT)
LANGUAGE plpgsql IMMUTABLE AS $fn_nan$
DECLARE
  m TEXT[];
BEGIN
  IF addr IS NULL OR length(trim(addr)) = 0 THEN
    RETURN QUERY SELECT NULL::INT, NULL::TEXT;
    RETURN;
  END IF;
  m := regexp_match(trim(addr), '^([0-9]+)(.*)$');
  IF m IS NULL THEN
    RETURN QUERY SELECT NULL::INT, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT m[1]::INT,
                        CASE WHEN length(trim(m[2])) = 0 THEN NULL ELSE m[2] END;
  END IF;
END;
$fn_nan$;

-- L27 helper: does a parcel civic-address number fall in a centreline side's address range?
-- H-v1.3.3: NULL parity → skip the parity check (range-only match). Returns FALSE when any
-- numeric part is unparseable (no fabricated matches).
CREATE OR REPLACE FUNCTION address_match_status(
  parcel_addr_text TEXT,
  parity TEXT,                    -- 'O' | 'E' | NULL
  lo_num_text TEXT,
  hi_num_text TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $fn_ams$
DECLARE
  parcel_num INT;
  lo_num INT;
  hi_num INT;
BEGIN
  SELECT (normalize_address_number(parcel_addr_text)).numeric_part INTO parcel_num;
  SELECT (normalize_address_number(lo_num_text)).numeric_part INTO lo_num;
  SELECT (normalize_address_number(hi_num_text)).numeric_part INTO hi_num;

  IF parcel_num IS NULL OR lo_num IS NULL OR hi_num IS NULL THEN
    RETURN FALSE;
  END IF;

  IF parity IS NOT NULL THEN
    IF parity = 'O' AND parcel_num % 2 = 0 THEN RETURN FALSE; END IF;
    IF parity = 'E' AND parcel_num % 2 = 1 THEN RETURN FALSE; END IF;
  END IF;

  RETURN parcel_num BETWEEN lo_num AND hi_num;
END;
$fn_ams$;

-- toronto_centreline table + GIST index (§2). Table creation guarded on PostGIS
-- (GEOMETRY column type); the helpers above are PostGIS-independent and always created.
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping toronto_centreline table creation';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS toronto_centreline (
    id                       BIGSERIAL PRIMARY KEY,
    source_id                BIGINT UNIQUE NOT NULL,             -- from CENTRELINE_ID
    geom                     GEOMETRY(LineString, 4326) NOT NULL,
    linear_name_full         TEXT,                                -- "Daisy Ave"
    linear_name              TEXT,                                -- "Daisy" — base name (divided-road compare, L13/C-v1.3.7)
    linear_name_type         TEXT,                                -- "Ave"
    linear_name_dir          TEXT,                                -- "N" / "S" / NULL
    feature_code_desc        TEXT NOT NULL,                       -- "Local" / ... / "unknown_operator_review" sentinel
    jurisdiction             TEXT NOT NULL,                       -- "CITY OF TORONTO" / "PROVINCE" / "PRIVATE" / "UNKNOWN"
    from_intersection_id     BIGINT,                              -- graph topology start node
    to_intersection_id       BIGINT,                              -- graph topology end node
    lo_num_l                 TEXT,                                -- "29" left-side range min (TEXT for "10A")
    hi_num_l                 TEXT,                                -- "39"
    lo_num_r                 TEXT,                                -- "32"
    hi_num_r                 TEXT,                                -- "50"
    parity_l                 TEXT,                                -- 'O' / 'E' / NULL
    parity_r                 TEXT,                                -- 'O' / 'E' / NULL
    oneway_dir_code_desc     TEXT,                                -- "Not One-Way" / "One-Way Northbound"
    source_dataset_version   TEXT NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- MANDATORY GIST (idx_ prefix per repo precedent idx_ravines_geom_gist; required for
  -- §11 ST_Intersects on 486K parcels × 47K segments).
  CREATE INDEX IF NOT EXISTS idx_toronto_centreline_geom_gist
    ON toronto_centreline USING GIST (geom);
END
$mig$;

-- DOWN
-- DROP INDEX IF EXISTS idx_toronto_centreline_geom_gist;
-- DROP TABLE IF EXISTS toronto_centreline;
-- DROP FUNCTION IF EXISTS address_match_status(TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS normalize_address_number(TEXT);
