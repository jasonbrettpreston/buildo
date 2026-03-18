-- Migration 054: Standardize all TIMESTAMP columns to TIMESTAMPTZ
-- Prevents timezone trap when deploying to Cloud SQL (UTC server timezone).
-- ALTER TYPE timestamp → timestamptz is metadata-only in PostgreSQL (no row rewrite).

-- UP

-- permits (237K+ rows, 1.1 GB — metadata-only, no table rewrite)
ALTER TABLE permits ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE permits ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE permits ALTER COLUMN geocoded_at TYPE TIMESTAMPTZ;

-- permit_history
ALTER TABLE permit_history ALTER COLUMN changed_at TYPE TIMESTAMPTZ;

-- sync_runs
ALTER TABLE sync_runs ALTER COLUMN started_at TYPE TIMESTAMPTZ;
ALTER TABLE sync_runs ALTER COLUMN completed_at TYPE TIMESTAMPTZ;

-- trades
ALTER TABLE trades ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- trade_mapping_rules
ALTER TABLE trade_mapping_rules ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- permit_trades
ALTER TABLE permit_trades ALTER COLUMN classified_at TYPE TIMESTAMPTZ;

-- builders
ALTER TABLE builders ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE builders ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE builders ALTER COLUMN enriched_at TYPE TIMESTAMPTZ;

-- builder_contacts
ALTER TABLE builder_contacts ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- coa_applications
ALTER TABLE coa_applications ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE coa_applications ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;

-- notifications
ALTER TABLE notifications ALTER COLUMN sent_at TYPE TIMESTAMPTZ;
ALTER TABLE notifications ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- parcels
ALTER TABLE parcels ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- permit_parcels
ALTER TABLE permit_parcels ALTER COLUMN linked_at TYPE TIMESTAMPTZ;

-- neighbourhoods
ALTER TABLE neighbourhoods ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- building_footprints
ALTER TABLE building_footprints ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- parcel_buildings
ALTER TABLE parcel_buildings ALTER COLUMN linked_at TYPE TIMESTAMPTZ;

-- entities
ALTER TABLE entities ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE entities ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE entities ALTER COLUMN last_enriched_at TYPE TIMESTAMPTZ;

-- entity_projects
ALTER TABLE entity_projects ALTER COLUMN observed_at TYPE TIMESTAMPTZ;

-- wsib_registry
ALTER TABLE wsib_registry ALTER COLUMN matched_at TYPE TIMESTAMPTZ;
ALTER TABLE wsib_registry ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ;
ALTER TABLE wsib_registry ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;

-- permit_inspections
ALTER TABLE permit_inspections ALTER COLUMN scraped_at TYPE TIMESTAMPTZ;
ALTER TABLE permit_inspections ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- DOWN
-- ALTER TABLE permits ALTER COLUMN first_seen_at TYPE TIMESTAMP;
-- ALTER TABLE permits ALTER COLUMN last_seen_at TYPE TIMESTAMP;
-- ALTER TABLE permits ALTER COLUMN geocoded_at TYPE TIMESTAMP;
-- ALTER TABLE permit_history ALTER COLUMN changed_at TYPE TIMESTAMP;
-- ALTER TABLE sync_runs ALTER COLUMN started_at TYPE TIMESTAMP;
-- ALTER TABLE sync_runs ALTER COLUMN completed_at TYPE TIMESTAMP;
-- ALTER TABLE trades ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE trade_mapping_rules ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE permit_trades ALTER COLUMN classified_at TYPE TIMESTAMP;
-- ALTER TABLE builders ALTER COLUMN first_seen_at TYPE TIMESTAMP;
-- ALTER TABLE builders ALTER COLUMN last_seen_at TYPE TIMESTAMP;
-- ALTER TABLE builders ALTER COLUMN enriched_at TYPE TIMESTAMP;
-- ALTER TABLE builder_contacts ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE coa_applications ALTER COLUMN first_seen_at TYPE TIMESTAMP;
-- ALTER TABLE coa_applications ALTER COLUMN last_seen_at TYPE TIMESTAMP;
-- ALTER TABLE notifications ALTER COLUMN sent_at TYPE TIMESTAMP;
-- ALTER TABLE notifications ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE parcels ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE permit_parcels ALTER COLUMN linked_at TYPE TIMESTAMP;
-- ALTER TABLE neighbourhoods ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE building_footprints ALTER COLUMN created_at TYPE TIMESTAMP;
-- ALTER TABLE parcel_buildings ALTER COLUMN linked_at TYPE TIMESTAMP;
-- ALTER TABLE entities ALTER COLUMN first_seen_at TYPE TIMESTAMP;
-- ALTER TABLE entities ALTER COLUMN last_seen_at TYPE TIMESTAMP;
-- ALTER TABLE entities ALTER COLUMN last_enriched_at TYPE TIMESTAMP;
-- ALTER TABLE entity_projects ALTER COLUMN observed_at TYPE TIMESTAMP;
-- ALTER TABLE wsib_registry ALTER COLUMN matched_at TYPE TIMESTAMP;
-- ALTER TABLE wsib_registry ALTER COLUMN first_seen_at TYPE TIMESTAMP;
-- ALTER TABLE wsib_registry ALTER COLUMN last_seen_at TYPE TIMESTAMP;
-- ALTER TABLE permit_inspections ALTER COLUMN scraped_at TYPE TIMESTAMP;
-- ALTER TABLE permit_inspections ALTER COLUMN created_at TYPE TIMESTAMP;
