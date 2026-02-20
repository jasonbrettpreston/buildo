-- 012_permit_parcels.sql
-- Links permits to parcels via address matching.

CREATE TABLE IF NOT EXISTS permit_parcels (
    id              SERIAL          PRIMARY KEY,
    permit_num      VARCHAR(30)     NOT NULL,
    revision_num    VARCHAR(10)     NOT NULL,
    parcel_id       INTEGER         NOT NULL REFERENCES parcels(id),
    match_type      VARCHAR(30)     NOT NULL,
    confidence      DECIMAL(3,2)    NOT NULL,
    linked_at       TIMESTAMP       NOT NULL DEFAULT NOW(),
    UNIQUE (permit_num, revision_num, parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_permit_parcels_permit
    ON permit_parcels (permit_num, revision_num);

CREATE INDEX IF NOT EXISTS idx_permit_parcels_parcel
    ON permit_parcels (parcel_id);
