CREATE TABLE IF NOT EXISTS parcel_buildings (
    id              SERIAL PRIMARY KEY,
    parcel_id       INTEGER NOT NULL REFERENCES parcels(id),
    building_id     INTEGER NOT NULL REFERENCES building_footprints(id),
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    structure_type  VARCHAR(20) NOT NULL DEFAULT 'other',
    linked_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (parcel_id, building_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_buildings_parcel
  ON parcel_buildings (parcel_id);

CREATE INDEX IF NOT EXISTS idx_parcel_buildings_building
  ON parcel_buildings (building_id);
