-- Migration 022: Add is_irregular column to parcels
-- Tracks whether a parcel has an irregular shape (L-shaped, pie-shaped, curved)
-- based on rectangularity ratio (polygon area / MBR area < 0.95)

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS is_irregular BOOLEAN DEFAULT false;
