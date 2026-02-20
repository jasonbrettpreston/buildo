-- 001_permits.sql
-- Core permits table ingesting Toronto Open Data building permits.
-- Primary key is composite (permit_num, revision_num).

CREATE TABLE IF NOT EXISTS permits (
    permit_num          VARCHAR(30)     NOT NULL,
    revision_num        VARCHAR(10)     NOT NULL,
    permit_type         VARCHAR(100),
    structure_type      VARCHAR(100),
    work                VARCHAR(200),
    street_num          VARCHAR(20),
    street_name         VARCHAR(200),
    street_type         VARCHAR(20),
    street_direction    VARCHAR(10),
    city                VARCHAR(100),
    postal              VARCHAR(10),
    geo_id              VARCHAR(30),
    building_type       VARCHAR(100),
    category            VARCHAR(100),
    application_date    DATE,
    issued_date         DATE,
    completed_date      DATE,
    status              VARCHAR(50),
    description         TEXT,
    est_const_cost      DECIMAL(15,2),
    builder_name        VARCHAR(500),
    owner               VARCHAR(500),
    dwelling_units_created  INTEGER,
    dwelling_units_lost     INTEGER,
    ward                VARCHAR(20),
    council_district    VARCHAR(50),
    current_use         VARCHAR(200),
    proposed_use        VARCHAR(200),
    housing_units       INTEGER,
    storeys             INTEGER,

    -- Geocoding fields
    latitude            DECIMAL(10,7),
    longitude           DECIMAL(10,7),
    geocoded_at         TIMESTAMP,

    -- Change detection and tracking
    data_hash           VARCHAR(64),
    first_seen_at       TIMESTAMP       NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMP       NOT NULL DEFAULT NOW(),

    -- Raw source payload for debugging / reprocessing
    raw_json            JSONB,

    PRIMARY KEY (permit_num, revision_num)
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_permits_status
    ON permits (status);

CREATE INDEX IF NOT EXISTS idx_permits_permit_type
    ON permits (permit_type);

CREATE INDEX IF NOT EXISTS idx_permits_issued_date
    ON permits (issued_date);

CREATE INDEX IF NOT EXISTS idx_permits_ward
    ON permits (ward);

CREATE INDEX IF NOT EXISTS idx_permits_data_hash
    ON permits (data_hash);

CREATE INDEX IF NOT EXISTS idx_permits_builder_name
    ON permits (builder_name);

-- Full-text search on description
CREATE INDEX IF NOT EXISTS idx_permits_description_fts
    ON permits USING gin (to_tsvector('english', COALESCE(description, '')));
