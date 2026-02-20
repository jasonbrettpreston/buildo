-- Migration 015: Data Quality Snapshots
-- Tracks matching/enrichment coverage metrics over time for the Data Effectiveness Dashboard.

CREATE TABLE IF NOT EXISTS data_quality_snapshots (
    id                  SERIAL          PRIMARY KEY,
    snapshot_date       DATE            NOT NULL DEFAULT CURRENT_DATE,

    -- Permit universe
    total_permits               INTEGER NOT NULL,
    active_permits              INTEGER NOT NULL,

    -- Trade classification coverage
    permits_with_trades         INTEGER NOT NULL,
    trade_matches_total         INTEGER NOT NULL,
    trade_avg_confidence        NUMERIC(4,3),
    trade_tier1_count           INTEGER NOT NULL,
    trade_tier2_count           INTEGER NOT NULL,
    trade_tier3_count           INTEGER NOT NULL,

    -- Builder matching coverage
    permits_with_builder        INTEGER NOT NULL,
    builders_total              INTEGER NOT NULL,
    builders_enriched           INTEGER NOT NULL,
    builders_with_phone         INTEGER NOT NULL,
    builders_with_email         INTEGER NOT NULL,
    builders_with_website       INTEGER NOT NULL,
    builders_with_google        INTEGER NOT NULL,
    builders_with_wsib          INTEGER NOT NULL,

    -- Parcel linking coverage
    permits_with_parcel         INTEGER NOT NULL,
    parcel_exact_matches        INTEGER NOT NULL,
    parcel_name_matches         INTEGER NOT NULL,
    parcel_avg_confidence       NUMERIC(4,3),

    -- Neighbourhood coverage
    permits_with_neighbourhood  INTEGER NOT NULL,

    -- Geocoding coverage
    permits_geocoded            INTEGER NOT NULL,

    -- CoA linking coverage
    coa_total                   INTEGER NOT NULL,
    coa_linked                  INTEGER NOT NULL,
    coa_avg_confidence          NUMERIC(4,3),
    coa_high_confidence         INTEGER NOT NULL,
    coa_low_confidence          INTEGER NOT NULL,

    -- Data freshness
    permits_updated_24h         INTEGER NOT NULL,
    permits_updated_7d          INTEGER NOT NULL,
    permits_updated_30d         INTEGER NOT NULL,
    last_sync_at                TIMESTAMPTZ,
    last_sync_status            VARCHAR(20),

    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date)
);

CREATE INDEX idx_dqs_snapshot_date ON data_quality_snapshots (snapshot_date DESC);
