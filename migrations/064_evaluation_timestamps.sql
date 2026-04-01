-- 064_evaluation_timestamps.sql
-- Track when permits were last evaluated for trade classification and parcel linking,
-- regardless of whether matches were found. Prevents infinite re-evaluation of
-- unmatchable permits in incremental mode.

-- UP
ALTER TABLE permits ADD COLUMN IF NOT EXISTS trade_classified_at TIMESTAMPTZ;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS parcel_linked_at TIMESTAMPTZ;

-- DOWN
-- ALTER TABLE permits DROP COLUMN IF EXISTS trade_classified_at;
-- ALTER TABLE permits DROP COLUMN IF EXISTS parcel_linked_at;
