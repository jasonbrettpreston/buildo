CREATE TABLE IF NOT EXISTS building_footprints (
    id                  SERIAL PRIMARY KEY,
    source_id           VARCHAR(50) NOT NULL UNIQUE,
    geometry            JSONB NOT NULL,
    footprint_area_sqm  DECIMAL(12,2),
    footprint_area_sqft DECIMAL(12,2),
    max_height_m        DECIMAL(8,2),
    min_height_m        DECIMAL(8,2),
    elev_z              DECIMAL(8,2),
    estimated_stories   INTEGER,
    centroid_lat        DECIMAL(10,7),
    centroid_lng        DECIMAL(10,7),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_building_footprints_centroid
  ON building_footprints (centroid_lat, centroid_lng);

CREATE INDEX IF NOT EXISTS idx_building_footprints_source
  ON building_footprints (source_id);
