-- 007_builders.sql
-- Builder directory aggregated from permit data and enriched via Google Places / OBR.

CREATE TABLE IF NOT EXISTS builders (
    id                      SERIAL          PRIMARY KEY,
    name                    VARCHAR(500)    NOT NULL,
    name_normalized         VARCHAR(500)    NOT NULL,
    phone                   VARCHAR(50),
    email                   VARCHAR(200),
    website                 VARCHAR(500),
    google_place_id         VARCHAR(200),
    google_rating           DECIMAL(2,1),
    google_review_count     INTEGER,
    obr_business_number     VARCHAR(50),
    wsib_status             VARCHAR(50),
    permit_count            INTEGER         NOT NULL DEFAULT 0,
    first_seen_at           TIMESTAMP       NOT NULL DEFAULT NOW(),
    last_seen_at            TIMESTAMP       NOT NULL DEFAULT NOW(),
    enriched_at             TIMESTAMP,

    UNIQUE (name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_builders_name_normalized
    ON builders (name_normalized);

CREATE INDEX IF NOT EXISTS idx_builders_permit_count
    ON builders (permit_count DESC);
