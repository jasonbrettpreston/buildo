# Database Indexing & Performance Audit Report

**Date:** March 2026
**Target:** `src/lib/db/generated/schema.ts` (PostgreSQL via Drizzle ORM)

## Executive Summary
Overall, the database schema demonstrates a **high degree of maturity and adherence to indexing best practices.** The implementation of partial indexes for queue management, GIN indexes for full-text search, and explicit B-Tree compounding shows a strong understanding of PostgreSQL performance tuning.

However, there are a few areas—specifically around spatial data and large range queries—where performance could degrade as the dataset grows significantly.

---

## 🏗️ Audit Rubric & Scoring

### 1. Foreign Key & Relational Indexing (Score: A+)
*Rubric: Are all columns inherently used for `JOIN` operations indexed to prevent sequential scans?*

- **Observations:** Flawless execution. Every single traditional foreign key (e.g., `trade_mapping_rules.tradeId`, `parcel_buildings.parcelId`) has an accompanying B-Tree index. 
- **Bonus:** Even "pseudo-foreign keys" (like `permitNum` + `revisionNum` used across `permit_trades`, `permit_history`, and `permit_parcels`) correctly use composite B-Tree indexes. 

### 2. Full-Text & Array Search (Score: A)
*Rubric: Are unstructured or array data types indexed correctly to avoid table scans?*

- **Observations:** 
  - The `permits.description` field correctly uses a **GIN index with `to_tsvector`** (`idx_permits_description_fts`). This is the gold standard for full-text search in Postgres.
  - `permits.scopeTags` correctly utilizes a **GIN array index**.
- **Recommendation:** If users frequently search for partial names (e.g., typing "Smith" to find "Smith & Co" in `builders.nameNormalized` or `entities.nameNormalized`), standard B-Tree indexes will not help with `ILIKE '%Smith%'` queries. Consider adding `pg_trgm` (Trigram) GIN indexes to primary name fields if partial-string search becomes a bottleneck.

### 3. Sparse & Partial Indexing (Score: A)
*Rubric: Are indexes kept small and memory-efficient by excluding irrelevant rows?*

- **Observations:** Excellent usage of `WHERE` clauses in Drizzle indexes.
  - `idx_coa_upcoming_leads` only indexes Approved COA applications lacking a linked permit. This creates a tiny, lightning-fast index for a specific worker queue.
  - `idx_wsib_linked_entity` only indexes rows where `linkedEntityId IS NOT NULL`.

### 4. Date & Sort Optimizations (Score: B+)
*Rubric: Are frequently sorted timestamp/date columns indexed appropriately?*

- **Observations:** Good coverage on `createdAt` and `decisionDate` DESC indexes. `permits.issuedDate` is indexed. 
- **Missing Indexes:** 
  - `permits.applicationDate`: If analysts frequently filter by "Applications submitted last month", this field requires an index.
  - `coa_applications.hearingDate`: Often used for dashboards tracking upcoming hearings, but currently lacks an index.

### 5. Geospatial Querying (Score: C)
*Rubric: Are lat/lng coordinates and geometries indexed for bounding-box/radius queries?*

- **Observations:** Coordinates (`centroidLat`, `centroidLng`) across `parcels`, `permits`, and `building_footprints` are stored as standard `numeric` columns and indexed using standard composite B-Trees `(centroidLat, centroidLng)`. 
- **The Problem:** B-Tree composite indexes do not efficiently support spatial queries like "Find all permits within 5km of this point" or "Find all parcels in this map bounding box".
- **Recommendation:** If map-based viewports or radius searches are a core feature, you should migrate these generic `numeric` columns to PostGIS `geometry(Point, 4326)` columns and index them using a **GIST** index. 

### 6. Filter / Range Fields (Score: B)
*Rubric: Are common numerical or categorical filters indexed?*

- **Missing Indexes:**
  - `permits.estConstCost`: High-value permit filters (e.g., `estConstCost > 1000000`) will currently trigger a sequential scan of the massive `permits` table.
  - `permits.city` & `permits.ward`: `ward` is indexed, which is great, but `city` and `postal` are not.

---

## 🛠️ Recommended Action Items (Next Steps)

If you were to create a new migration to optimize current bottlenecks, add the following indexes:

```typescript
// 1. Add index for Value filtering
index("idx_permits_est_cost").using("btree", table.estConstCost.desc().nullsLast().op("numeric_ops")),

// 2. Add index for Application Date filtering
index("idx_permits_application_date").using("btree", table.applicationDate.desc().nullsFirst().op("date_ops")),

// 3. Add index for COA Hearing Dates
index("idx_coa_hearing_date").using("btree", table.hearingDate.desc().nullsFirst().op("date_ops")),
```

*Long Term Strategy:* Evaluate installing the `PostGIS` extension to convert Lat/Lng columns into `geometry` types backed by GIST indexes for true spatial querying capability.
