# Spec 01 -- Database Schema

## 1. User Story

> As a developer, I need a normalized PostgreSQL schema to store 237K+ building
> permits with change tracking, trade classification, and builder enrichment so
> that every downstream feature (search, leads, maps, notifications) can query a
> single authoritative data store.

## 2. Technical Logic

### Tables (15)

| # | Table | Purpose |
|---|-------|---------|
| 1 | `permits` | Core permits table. Composite PK `(permit_num, revision_num)`. Stores all 30 mapped fields from the Toronto Open Data feed, geocoding columns (`latitude`, `longitude`, `geocoded_at`), a `data_hash` (SHA-256) for change detection, and `raw_json` JSONB for debugging. |
| 2 | `permit_history` | Change tracking. One row per field that changed between sync runs. Columns: `permit_num`, `revision_num`, `sync_run_id`, `field_name`, `old_value`, `new_value`, `changed_at`. |
| 3 | `sync_runs` | Audit log for every sync execution. Records `started_at`, `completed_at`, `status` (`running` / `completed` / `failed`), per-category counts (`records_total`, `records_new`, `records_updated`, `records_unchanged`, `records_errors`), `error_message`, `snapshot_path`, and `duration_ms`. |
| 4 | `trades` | Reference table of 20 construction trade categories. Each trade has a `slug` (UNIQUE), `name`, `icon`, `color`, and `sort_order`. Seeded via `INSERT ... ON CONFLICT DO NOTHING`. |
| 5 | `trade_mapping_rules` | Rules engine for permit-to-trade classification. Three tiers: Tier 1 (permit_type, confidence 0.90-0.95), Tier 2 (work field, confidence 0.60-0.90), Tier 3 (description keywords via ILIKE, confidence 0.50-0.80). Columns include `tier` with CHECK constraint `(tier IN (1, 2, 3))`, `match_field`, `match_pattern`, `confidence` (CHECK 0-1), `phase_start`/`phase_end` (months after issued date), and `is_active`. FK to `trades(id)`. |
| 6 | `permit_trades` | Junction table linking permits to trades. Carries classification metadata: `tier`, `confidence`, `is_active`, `phase`, `lead_score`. UNIQUE constraint on `(permit_num, revision_num, trade_id)`. FK to `trades(id)`. |
| 7 | `builders` | Builder directory aggregated from permit data, enriched via Google Places / OBR. `name_normalized` (UNIQUE) for deduplication. Stores `google_place_id`, `google_rating`, `google_review_count`, `obr_business_number`, `wsib_status`, `permit_count`. |
| 8 | `builder_contacts` | User-contributed contact information. Each row has `contact_type`, `contact_value`, `source` (default `'user'`), `contributed_by`, `verified`. FK to `builders(id)`. |
| 9 | `coa_applications` | Committee of Adjustment applications. Optionally linked to permits via `linked_permit_num` / `linked_confidence`. Has its own `data_hash` for change detection. `application_number` is UNIQUE. |
| 10 | `notifications` | Notification queue. Columns: `user_id`, `type`, `title`, `body`, `permit_num`, `trade_slug`, `channel` (default `'in_app'`), `is_read`, `is_sent`, `sent_at`. |
| 11 | `parcels` | Toronto Property Boundaries parcels. Stores lot dimensions (area, frontage, depth) in both metric and imperial. Geometry stored as JSONB. Normalized address fields for matching. Pre-computed `centroid_lat`/`centroid_lng` for spatial matching (migration 016). `is_irregular` BOOLEAN flags lots where polygon area / MBR area < 0.95 (migration 022). `parcel_id` is UNIQUE. |
| 12 | `permit_parcels` | Junction table linking permits to parcels via address or spatial matching. Carries `match_type` (`exact_address`, `name_only`, or `spatial`) and `confidence`. UNIQUE constraint on `(permit_num, revision_num, parcel_id)`. FK to `parcels(id)`. |
| 13 | `neighbourhoods` | Toronto neighbourhoods with Census 2021 data. 158 rows. Stores boundary polygon as JSONB, income/housing/education demographics. `neighbourhood_id` is UNIQUE (maps to Toronto `AREA_S_CD`). |
| 14 | `permits.neighbourhood_id` | FK column added to `permits` table linking to `neighbourhoods.id` via point-in-polygon matching. Added by migration 014. |
| 15 | `data_quality_snapshots` | Daily snapshot of matching/enrichment coverage metrics across all 6 data linking processes. `UNIQUE(snapshot_date)` for upsert. 37 columns tracking trade, builder, parcel, neighbourhood, geocoding, CoA, and massing metrics plus freshness counters. |
| 16 | `building_footprints` | Toronto 3D Massing building polygons. Stores footprint geometry (JSONB), area (sqm/sqft), height attributes (`max_height_m`, `min_height_m`, `elev_z`), derived `estimated_stories`, and pre-computed centroid. Indexed on centroid for spatial queries and `source_id` for upserts. |
| 17 | `parcel_buildings` | Junction table linking parcels to building footprints. Carries `is_primary` flag and `structure_type` classification (`primary`, `garage`, `shed`, `other`). UNIQUE constraint on `(parcel_id, building_id)`. FK to `parcels(id)` and `building_footprints(id)`. |

### Indexes

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `permits` | `idx_permits_status` | B-tree | Filter by status |
| `permits` | `idx_permits_permit_type` | B-tree | Filter by permit type |
| `permits` | `idx_permits_issued_date` | B-tree | Sort/filter by issued date |
| `permits` | `idx_permits_ward` | B-tree | Filter by ward |
| `permits` | `idx_permits_data_hash` | B-tree | Fast hash lookup for change detection |
| `permits` | `idx_permits_builder_name` | B-tree | Join to builders |
| `permits` | `idx_permits_description_fts` | GIN | Full-text search on `to_tsvector('english', COALESCE(description, ''))` |
| `permit_history` | `idx_permit_history_permit` | B-tree | Look up history by permit composite key |
| `permit_history` | `idx_permit_history_sync_run` | B-tree | Filter history by sync run |
| `trade_mapping_rules` | `idx_trade_mapping_rules_trade` | B-tree | Filter rules by trade |
| `trade_mapping_rules` | `idx_trade_mapping_rules_tier` | B-tree | Filter active rules by tier |
| `permit_trades` | `idx_permit_trades_trade` | B-tree | Filter by trade |
| `permit_trades` | `idx_permit_trades_active` | B-tree | Filter active matches |
| `permit_trades` | `idx_permit_trades_lead_score` | B-tree (DESC) | Sort by lead score |
| `permit_trades` | `idx_permit_trades_permit` | B-tree | Look up trades by permit |
| `builders` | `idx_builders_name_normalized` | B-tree | Fast builder lookup |
| `builders` | `idx_builders_permit_count` | B-tree (DESC) | Sort builders by activity |
| `builder_contacts` | `idx_builder_contacts_builder` | B-tree | FK lookup |
| `builder_contacts` | `idx_builder_contacts_type` | B-tree | Filter by contact type |
| `coa_applications` | `idx_coa_applications_address` | B-tree | Address lookup |
| `coa_applications` | `idx_coa_applications_ward` | B-tree | Filter by ward |
| `coa_applications` | `idx_coa_applications_linked_permit` | B-tree | Join to permits |
| `notifications` | `idx_notifications_user_read` | B-tree | Unread notification queries |
| `notifications` | `idx_notifications_user_created` | B-tree (DESC) | Recent notifications per user |
| `parcels` | `idx_parcels_address` | B-tree | Address lookup (addr_num_normalized, street_name_normalized) |
| `parcels` | `idx_parcels_street_name` | B-tree | Street name lookup |
| `parcels` | `idx_parcels_feature_type` | B-tree | Filter by feature type |
| `permit_parcels` | `idx_permit_parcels_permit` | B-tree | Look up parcels by permit |
| `permit_parcels` | `idx_permit_parcels_parcel` | B-tree | Look up permits by parcel |
| `permits` | `idx_permits_neighbourhood` | B-tree | Filter by neighbourhood |
| `neighbourhoods` | `idx_neighbourhoods_neighbourhood_id` | B-tree | Lookup by Toronto neighbourhood ID |
| `data_quality_snapshots` | `idx_dqs_snapshot_date` | B-tree (DESC) | Latest snapshot lookup |

### Key Design Decisions

- **Composite PK** `(permit_num, revision_num)` on `permits` -- the Toronto Open Data feed uses this pair as the natural key. A single permit can have multiple revisions.
- **`data_hash` column** (VARCHAR(64)) stores the SHA-256 hex digest of the sorted raw JSON fields, enabling O(1) change detection during sync.
- **`raw_json` JSONB column** preserves the original payload for reprocessing without re-downloading the feed.
- **`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`** -- all DDL is idempotent so migrations can be re-run safely.
- **`ON CONFLICT (slug) DO NOTHING`** on trade seed data -- idempotent inserts.

### Database Client

The `pg` Pool is configured from either `DATABASE_URL` (production) or individual `PG_*` environment variables (local dev). SSL is enabled only in production. The `query<T>()` helper returns typed rows; `getClient()` returns a `PoolClient` for transactions.

## 3. Associated Files

| File | Role |
|------|------|
| `migrations/001_permits.sql` | Creates `permits` table and all its indexes including GIN FTS |
| `migrations/002_permit_history.sql` | Creates `permit_history` table |
| `migrations/003_sync_runs.sql` | Creates `sync_runs` table |
| `migrations/004_trades.sql` | Creates `trades` table and seeds 20 trade rows |
| `migrations/005_trade_mapping_rules.sql` | Creates `trade_mapping_rules` table and seeds ~90 rules across 3 tiers |
| `migrations/006_permit_trades.sql` | Creates `permit_trades` junction table |
| `migrations/007_builders.sql` | Creates `builders` table |
| `migrations/008_builder_contacts.sql` | Creates `builder_contacts` table |
| `migrations/009_coa_applications.sql` | Creates `coa_applications` table |
| `migrations/010_notifications.sql` | Creates `notifications` table |
| `migrations/011_parcels.sql` | Creates `parcels` table for Toronto Property Boundaries |
| `migrations/012_permit_parcels.sql` | Creates `permit_parcels` junction table |
| `migrations/013_neighbourhoods.sql` | Creates `neighbourhoods` table with Census 2021 data |
| `migrations/014_permit_neighbourhood.sql` | Adds `neighbourhood_id` FK column to `permits` |
| `migrations/015_data_quality_snapshots.sql` | Creates `data_quality_snapshots` table |
| `migrations/022_parcel_irregularity.sql` | Adds `is_irregular` BOOLEAN column to `parcels` |
| `migrations/023_building_footprints.sql` | Creates `building_footprints` table for Toronto 3D Massing data |
| `migrations/024_parcel_buildings.sql` | Creates `parcel_buildings` junction table linking parcels to building footprints |
| `migrations/025_quality_massing.sql` | Adds `building_footprints_total` and `parcels_with_buildings` columns to `data_quality_snapshots` |
| `src/lib/db/client.ts` | PostgreSQL connection pool (`pg.Pool`), `query<T>()`, `getClient()` |
| `scripts/migrate.js` | Migration runner -- reads SQL files from `/migrations/` in alphabetical order and executes them sequentially |
| `src/lib/permits/types.ts` | TypeScript interfaces: `Permit`, `RawPermitRecord`, `PermitChange`, `SyncRun`, `SyncStats`, `Trade`, `TradeMatch`, `TradeMappingRule`, `Builder`, `PermitFilter` |

## 4. Constraints & Edge Cases

- `permits` PK is composite -- queries must always filter on both `permit_num` AND `revision_num`.
- `trade_mapping_rules.tier` has a CHECK constraint `(tier IN (1, 2, 3))` -- inserting tier 4 will fail.
- `trade_mapping_rules.confidence` has a CHECK constraint `(confidence >= 0 AND confidence <= 1)`.
- `permit_trades` has a UNIQUE constraint on `(permit_num, revision_num, trade_id)` -- duplicate trade assignments for the same permit are rejected.
- `trades.slug` is UNIQUE -- duplicate slugs will fail on insert.
- `builders.name_normalized` is UNIQUE -- builder deduplication relies on normalization before insert.
- `coa_applications.application_number` is UNIQUE.
- The migration runner has no rollback capability -- it runs forward-only. Failed migrations abort the process.
- `est_const_cost` is `DECIMAL(15,2)` -- values exceeding 13 integer digits will overflow.
- Date columns (`application_date`, `issued_date`, `completed_date`) are `DATE` type (no time component); timestamp columns use `TIMESTAMP` (no timezone).
- All `created_at` / `first_seen_at` / `last_seen_at` default to `NOW()` -- the database clock must be correct.

## 5. Data Schema

### permits

```
permit_num          VARCHAR(30)     NOT NULL  (PK part 1)
revision_num        VARCHAR(10)     NOT NULL  (PK part 2)
permit_type         VARCHAR(100)
structure_type      VARCHAR(100)
work                VARCHAR(200)
street_num          VARCHAR(20)
street_name         VARCHAR(200)
street_type         VARCHAR(20)
street_direction    VARCHAR(10)
city                VARCHAR(100)
postal              VARCHAR(10)
geo_id              VARCHAR(30)
building_type       VARCHAR(100)
category            VARCHAR(100)
application_date    DATE
issued_date         DATE
completed_date      DATE
status              VARCHAR(50)
description         TEXT
est_const_cost      DECIMAL(15,2)
builder_name        VARCHAR(500)
owner               VARCHAR(500)
dwelling_units_created  INTEGER
dwelling_units_lost     INTEGER
ward                VARCHAR(20)
council_district    VARCHAR(50)
current_use         VARCHAR(200)
proposed_use        VARCHAR(200)
housing_units       INTEGER
storeys             INTEGER
latitude            DECIMAL(10,7)
longitude           DECIMAL(10,7)
geocoded_at         TIMESTAMP
data_hash           VARCHAR(64)
first_seen_at       TIMESTAMP       NOT NULL DEFAULT NOW()
last_seen_at        TIMESTAMP       NOT NULL DEFAULT NOW()
raw_json            JSONB
```

### permit_history

```
id              SERIAL          PRIMARY KEY
permit_num      VARCHAR(30)     NOT NULL
revision_num    VARCHAR(10)     NOT NULL
sync_run_id     INTEGER
field_name      VARCHAR(100)    NOT NULL
old_value       TEXT
new_value       TEXT
changed_at      TIMESTAMP       NOT NULL DEFAULT NOW()
```

### sync_runs

```
id                  SERIAL          PRIMARY KEY
started_at          TIMESTAMP       NOT NULL DEFAULT NOW()
completed_at        TIMESTAMP
status              VARCHAR(20)     NOT NULL DEFAULT 'running'
records_total       INTEGER         NOT NULL DEFAULT 0
records_new         INTEGER         NOT NULL DEFAULT 0
records_updated     INTEGER         NOT NULL DEFAULT 0
records_unchanged   INTEGER         NOT NULL DEFAULT 0
records_errors      INTEGER         NOT NULL DEFAULT 0
error_message       TEXT
snapshot_path       VARCHAR(500)
duration_ms         INTEGER
```

### trades

```
id          SERIAL          PRIMARY KEY
slug        VARCHAR(50)     UNIQUE NOT NULL
name        VARCHAR(100)    NOT NULL
icon        VARCHAR(50)
color       VARCHAR(7)
sort_order  INTEGER
created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
```

### trade_mapping_rules

```
id              SERIAL          PRIMARY KEY
trade_id        INTEGER         NOT NULL  FK -> trades(id)
tier            INTEGER         NOT NULL  CHECK (tier IN (1, 2, 3))
match_field     VARCHAR(50)     NOT NULL
match_pattern   VARCHAR(500)    NOT NULL
confidence      DECIMAL(3,2)    NOT NULL  CHECK (0 <= confidence <= 1)
phase_start     INTEGER
phase_end       INTEGER
is_active       BOOLEAN         NOT NULL DEFAULT true
created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
```

### permit_trades

```
id              SERIAL          PRIMARY KEY
permit_num      VARCHAR(30)     NOT NULL
revision_num    VARCHAR(10)     NOT NULL
trade_id        INTEGER         NOT NULL  FK -> trades(id)
tier            INTEGER
confidence      DECIMAL(3,2)
is_active       BOOLEAN         NOT NULL DEFAULT true
phase           VARCHAR(20)
lead_score      INTEGER         NOT NULL DEFAULT 0
classified_at   TIMESTAMP       NOT NULL DEFAULT NOW()
UNIQUE (permit_num, revision_num, trade_id)
```

### builders

```
id                      SERIAL          PRIMARY KEY
name                    VARCHAR(500)    NOT NULL
name_normalized         VARCHAR(500)    NOT NULL UNIQUE
phone                   VARCHAR(50)
email                   VARCHAR(200)
website                 VARCHAR(500)
google_place_id         VARCHAR(200)
google_rating           DECIMAL(2,1)
google_review_count     INTEGER
obr_business_number     VARCHAR(50)
wsib_status             VARCHAR(50)
permit_count            INTEGER         NOT NULL DEFAULT 0
first_seen_at           TIMESTAMP       NOT NULL DEFAULT NOW()
last_seen_at            TIMESTAMP       NOT NULL DEFAULT NOW()
enriched_at             TIMESTAMP
```

### builder_contacts

```
id              SERIAL          PRIMARY KEY
builder_id      INTEGER         NOT NULL  FK -> builders(id)
contact_type    VARCHAR(20)
contact_value   VARCHAR(500)
source          VARCHAR(50)     NOT NULL DEFAULT 'user'
contributed_by  VARCHAR(100)
verified        BOOLEAN         NOT NULL DEFAULT false
created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
```

### coa_applications

```
id                  SERIAL          PRIMARY KEY
application_number  VARCHAR(50)     UNIQUE
address             VARCHAR(500)
street_num          VARCHAR(20)
street_name         VARCHAR(200)
ward                VARCHAR(10)
status              VARCHAR(50)
decision            VARCHAR(50)
decision_date       DATE
hearing_date        DATE
description         TEXT
applicant           VARCHAR(500)
linked_permit_num   VARCHAR(30)
linked_confidence   DECIMAL(3,2)
data_hash           VARCHAR(64)
first_seen_at       TIMESTAMP       NOT NULL DEFAULT NOW()
last_seen_at        TIMESTAMP       NOT NULL DEFAULT NOW()
```

### notifications

```
id          SERIAL          PRIMARY KEY
user_id     VARCHAR(100)    NOT NULL
type        VARCHAR(50)     NOT NULL
title       VARCHAR(200)
body        TEXT
permit_num  VARCHAR(30)
trade_slug  VARCHAR(50)
channel     VARCHAR(20)     NOT NULL DEFAULT 'in_app'
is_read     BOOLEAN         NOT NULL DEFAULT false
is_sent     BOOLEAN         NOT NULL DEFAULT false
sent_at     TIMESTAMP
created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
```

### parcels

```
id                      SERIAL          PRIMARY KEY
parcel_id               VARCHAR(20)     UNIQUE NOT NULL
feature_type            VARCHAR(20)
address_number          VARCHAR(20)
linear_name_full        VARCHAR(200)
addr_num_normalized     VARCHAR(20)
street_name_normalized  VARCHAR(200)
street_type_normalized  VARCHAR(20)
stated_area_raw         VARCHAR(100)
lot_size_sqm            DECIMAL(12,2)
lot_size_sqft           DECIMAL(12,2)
frontage_m              DECIMAL(8,2)
frontage_ft             DECIMAL(8,2)
depth_m                 DECIMAL(8,2)
depth_ft                DECIMAL(8,2)
geometry                JSONB
date_effective          DATE
date_expiry             DATE
created_at              TIMESTAMP       NOT NULL DEFAULT NOW()
```

### permit_parcels

```
id              SERIAL          PRIMARY KEY
permit_num      VARCHAR(30)     NOT NULL
revision_num    VARCHAR(10)     NOT NULL
parcel_id       INTEGER         NOT NULL  FK -> parcels(id)
match_type      VARCHAR(30)     NOT NULL
confidence      DECIMAL(3,2)    NOT NULL
linked_at       TIMESTAMP       NOT NULL DEFAULT NOW()
UNIQUE (permit_num, revision_num, parcel_id)
```

### neighbourhoods

```
id                      SERIAL          PRIMARY KEY
neighbourhood_id        INTEGER         UNIQUE NOT NULL
name                    VARCHAR(200)    NOT NULL
geometry                JSONB
avg_household_income    INTEGER
median_household_income INTEGER
avg_individual_income   INTEGER
low_income_pct          DECIMAL(5,2)
tenure_owner_pct        DECIMAL(5,2)
tenure_renter_pct       DECIMAL(5,2)
period_of_construction  VARCHAR(50)
couples_pct             DECIMAL(5,2)
lone_parent_pct         DECIMAL(5,2)
married_pct             DECIMAL(5,2)
university_degree_pct   DECIMAL(5,2)
immigrant_pct           DECIMAL(5,2)
visible_minority_pct    DECIMAL(5,2)
english_knowledge_pct   DECIMAL(5,2)
top_mother_tongue       VARCHAR(100)
census_year             INTEGER         NOT NULL
created_at              TIMESTAMP       NOT NULL DEFAULT NOW()
```

### data_quality_snapshots

```
id                          SERIAL          PRIMARY KEY
snapshot_date               DATE            NOT NULL UNIQUE
total_permits               INTEGER         NOT NULL
active_permits              INTEGER         NOT NULL
permits_with_trades         INTEGER         NOT NULL
trade_matches_total         INTEGER         NOT NULL
trade_avg_confidence        NUMERIC(4,3)
trade_tier1_count           INTEGER         NOT NULL
trade_tier2_count           INTEGER         NOT NULL
trade_tier3_count           INTEGER         NOT NULL
permits_with_builder        INTEGER         NOT NULL
builders_total              INTEGER         NOT NULL
builders_enriched           INTEGER         NOT NULL
builders_with_phone         INTEGER         NOT NULL
builders_with_email         INTEGER         NOT NULL
builders_with_website       INTEGER         NOT NULL
builders_with_google        INTEGER         NOT NULL
builders_with_wsib          INTEGER         NOT NULL
permits_with_parcel         INTEGER         NOT NULL
parcel_exact_matches        INTEGER         NOT NULL
parcel_name_matches         INTEGER         NOT NULL
parcel_avg_confidence       NUMERIC(4,3)
permits_with_neighbourhood  INTEGER         NOT NULL
permits_geocoded            INTEGER         NOT NULL
coa_total                   INTEGER         NOT NULL
coa_linked                  INTEGER         NOT NULL
coa_avg_confidence          NUMERIC(4,3)
coa_high_confidence         INTEGER         NOT NULL
coa_low_confidence          INTEGER         NOT NULL
permits_updated_24h         INTEGER         NOT NULL
permits_updated_7d          INTEGER         NOT NULL
permits_updated_30d         INTEGER         NOT NULL
last_sync_at                TIMESTAMPTZ
last_sync_status            VARCHAR(20)
created_at                  TIMESTAMPTZ     DEFAULT NOW()
```

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| PostgreSQL | Read/Write | All data persistence. `pg` npm package via connection pool. |
| `scripts/migrate.js` | Write | Runs all SQL files in `/migrations/` sequentially on deploy. |
| Toronto Open Data | Ingest (via sync pipeline) | Raw data lands in `permits` table. |
| Google Places API | Enrich | Builder enrichment writes to `builders` table. |
| Google Geocoding API | Enrich | Geocoded coordinates written to `permits.latitude`, `permits.longitude`, `permits.geocoded_at`. |
| Next.js API Routes | Read | All API endpoints query the schema via `src/lib/db/client.ts`. |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | Insert a permit with NULL `permit_num` | Should fail -- NOT NULL constraint on PK column |
| L02 | Insert two permits with same `(permit_num, revision_num)` | Should fail -- PRIMARY KEY violation |
| L03 | Insert a `trade_mapping_rules` row with `tier = 4` | Should fail -- CHECK constraint `(tier IN (1, 2, 3))` |
| L04 | Insert a `trade_mapping_rules` row with `confidence = 1.5` | Should fail -- CHECK constraint `(confidence >= 0 AND confidence <= 1)` |
| L05 | Insert a `permit_trades` row with duplicate `(permit_num, revision_num, trade_id)` | Should fail -- UNIQUE constraint |
| L06 | Insert a `trades` row with duplicate slug | Should fail -- UNIQUE constraint on `slug` |
| L07 | Insert a `builders` row with duplicate `name_normalized` | Should fail -- UNIQUE constraint |
| L08 | Insert a `trade_mapping_rules` row with non-existent `trade_id` | Should fail -- FK constraint |
| L09 | Insert a `builder_contacts` row with non-existent `builder_id` | Should fail -- FK constraint |
| L10 | Insert a `permit_trades` row with non-existent `trade_id` | Should fail -- FK constraint |
| L11 | Verify `sync_runs.status` defaults to `'running'` on INSERT | Should be `'running'` |
| L12 | Verify `permits.first_seen_at` and `last_seen_at` default to `NOW()` | Both timestamps should be set automatically |

### B. UI Layer

N/A -- the database schema has no visual component. UI tests apply to features that consume this schema (see specs 06, etc.).

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Run `scripts/migrate.js` against an empty database | All 10 migrations complete without error |
| I02 | Run `scripts/migrate.js` twice against the same database | Second run succeeds (idempotent due to `IF NOT EXISTS`) |
| I03 | Verify GIN index `idx_permits_description_fts` exists | `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_permits_description_fts'` returns 1 row |
| I04 | Verify all 24 indexes exist after migration | Query `pg_indexes` for each expected index name |
| I05 | Verify 20 trades are seeded after migration | `SELECT COUNT(*) FROM trades` returns 20 |
| I06 | Verify trade seed is idempotent | Running `004_trades.sql` twice still yields 20 rows (ON CONFLICT DO NOTHING) |
| I07 | Verify connection pool handles concurrent queries | Issue 10 parallel `SELECT 1` queries -- all succeed |
| I08 | Verify `query<T>()` returns typed rows | TypeScript compile check -- result rows match `Permit` interface |
