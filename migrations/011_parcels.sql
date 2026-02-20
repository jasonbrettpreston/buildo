-- 011_parcels.sql
-- Toronto Property Boundaries parcels with lot dimensions.

CREATE TABLE IF NOT EXISTS parcels (
    id                      SERIAL          PRIMARY KEY,
    parcel_id               VARCHAR(20)     UNIQUE NOT NULL,
    feature_type            VARCHAR(20),
    address_number          VARCHAR(20),
    linear_name_full        VARCHAR(200),
    addr_num_normalized     VARCHAR(20),
    street_name_normalized  VARCHAR(200),
    street_type_normalized  VARCHAR(20),
    stated_area_raw         VARCHAR(100),
    lot_size_sqm            DECIMAL(12,2),
    lot_size_sqft           DECIMAL(12,2),
    frontage_m              DECIMAL(8,2),
    frontage_ft             DECIMAL(8,2),
    depth_m                 DECIMAL(8,2),
    depth_ft                DECIMAL(8,2),
    geometry                JSONB,
    date_effective          DATE,
    date_expiry             DATE,
    created_at              TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcels_address
    ON parcels (addr_num_normalized, street_name_normalized);

CREATE INDEX IF NOT EXISTS idx_parcels_street_name
    ON parcels (street_name_normalized);

CREATE INDEX IF NOT EXISTS idx_parcels_feature_type
    ON parcels (feature_type);
