-- 018_address_points.sql
-- Lookup table for Toronto Address Points (provides lat/lng for geo_id on permits).

CREATE TABLE IF NOT EXISTS address_points (
    address_point_id  INTEGER PRIMARY KEY,
    latitude          DECIMAL(10,7) NOT NULL,
    longitude         DECIMAL(10,7) NOT NULL
);
