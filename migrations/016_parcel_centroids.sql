-- 016_parcel_centroids.sql
-- Add pre-computed centroid coordinates to parcels for spatial matching.

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS centroid_lat DECIMAL(10,7);
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS centroid_lng DECIMAL(10,7);

CREATE INDEX IF NOT EXISTS idx_parcels_centroid
    ON parcels (centroid_lat, centroid_lng)
    WHERE centroid_lat IS NOT NULL;
