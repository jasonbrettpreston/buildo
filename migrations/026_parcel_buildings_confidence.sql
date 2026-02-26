-- Migration 026: Add match_type and confidence to parcel_buildings
-- Tracks how each parcel-building link was established and its reliability.
-- match_type: 'polygon' (centroid-in-polygon), 'multipoint' (edge midpoint hit),
--             'nearest' (haversine fallback ≤50m)
-- confidence: 0.60–0.90 depending on match quality

ALTER TABLE parcel_buildings ADD COLUMN IF NOT EXISTS match_type VARCHAR(30) NOT NULL DEFAULT 'polygon';
ALTER TABLE parcel_buildings ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) NOT NULL DEFAULT 0.85;
