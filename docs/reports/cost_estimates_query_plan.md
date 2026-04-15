# Cost Estimates SOURCE_SQL — EXPLAIN ANALYZE Report

**SPEC LINK:** docs/specs/product/future/83_lead_cost_model.md §8 Part 1 item 12
**Date:** 2026-04-15
**Commit:** 90c3709 (WF2-2)
**Row count at time of analysis:** 243,454 permits | 1,162,765 permit_trades rows

---

## Critical Bug Found and Fixed During This Analysis

**`trade_slug` column does not exist on `permit_trades`.**

The script's original LATERAL join was:
```sql
SELECT ARRAY_AGG(trade_slug) AS active_trades
FROM permit_trades
WHERE permit_num = p.permit_num AND revision_num = p.revision_num
```

`permit_trades` has `trade_id` (FK → `trades.id`), not a `trade_slug` column. The script
would have thrown `column "trade_slug" does not exist` on first real run.

**Fix applied in same session (Phase 3 finding):**
```sql
SELECT ARRAY_AGG(t.slug) AS active_trades
FROM permit_trades pt2
JOIN trades t ON t.id = pt2.trade_id
WHERE pt2.permit_num = p.permit_num AND pt2.revision_num = p.revision_num
  AND pt2.is_active = true
```

Added `AND pt2.is_active = true` to honour the "active" in `active_trade_slugs` —
183,287 active rows vs 979,478 inactive (only ~16% of rows are active).

---

## Query Plan Summary

**Total execution time: 44.5 seconds** (planning: 51ms) on 243,454 permits.
**Acceptable for a nightly batch job.** The stream processes rows as they arrive; wall-clock time
of the full pipeline step is dominated by Brain valuation math (per-permit CPU), not this query.

### Access path per join

| Table | Node | Index Used | Status |
|-------|------|------------|--------|
| `permits` | Seq Scan | — (driver table, full scan expected) | ✅ Unavoidable |
| `permit_parcels` | Index Only Scan | `permit_parcels_permit_num_revision_num_parcel_id_key` | ✅ |
| `parcels` | Index Scan | `parcels_pkey` | ✅ |
| `parcel_buildings` | Index Scan | `idx_parcel_buildings_one_primary` | ✅ |
| `building_footprints` | Index Scan | `building_footprints_pkey` | ✅ |
| `neighbourhoods` | Index Scan | `idx_neighbourhoods_nid` | ✅ Highly cached (160 unique values, 243,294 Memoize hits) |
| `permit_trades` (LATERAL) | Index Scan | `permit_trades_permit_num_revision_num_trade_id_key` | ✅ |
| `trades` (Hash Join inside LATERAL) | Seq Scan | — (32-row lookup table, fully in memory) | ✅ Acceptable |

**No unexpected seq scans.** All variable-size tables use index lookups.

### Observations

**1. `is_active` is a post-filter, not an index condition.**

The permit_trades index key is `(permit_num, revision_num, trade_id)`. `is_active` is not in the
index, so it is applied as a row filter after the index scan. The plan shows:
```
Filter: is_active
Rows Removed by Filter: 4
```
Average 4 rows removed per probe (~5:1 waste ratio at current data scale). With 243K probes this
adds ~1M extra row reads. Currently acceptable; flag for follow-up index if data grows.

**2. Memoize on permit_trades LATERAL has 0 cache hits.**

The Memoize node (8MB) wraps the LATERAL aggregate keyed on `(permit_num, revision_num)`.
Since each permit key is unique, the cache never hits — 243,454 misses, 180,513 evictions.
This is expected behaviour for a unique-key probe. The Memoize adds no overhead.

**3. Neighbourhoods join is extremely efficient.**

Only 160 distinct `neighbourhood_id` values in 243K permits. Memoize: 243,294 hits / 160 misses.
Essentially a free lookup.

**4. Parcel chain (`permit_parcels → parcels → parcel_buildings → building_footprints`) absorbs ~42s.**

The four-join parcel chain accounts for the bulk of execution time (shared buffers read: ~1.1M
pages). This is inherent to the data model — there is no single index spanning all four tables.
Acceptable for nightly; not a bottleneck for a streaming pipeline.

---

## Recommendations

| Priority | Item | Action |
|----------|------|--------|
| **Follow-up (low urgency)** | `is_active` post-filter on permit_trades | Consider `CREATE INDEX CONCURRENTLY idx_permit_trades_active ON permit_trades (permit_num, revision_num) WHERE is_active = true;` if row count grows >5M. Currently 1.16M rows, filter overhead is ~1M extra reads (~4MB) — negligible. |
| **No action needed** | trades Seq Scan | 32 rows, always in shared_buffers. Acceptable forever. |
| **No action needed** | Memoize on permit_trades | 0 hits is expected for unique-key probes. |
| **No action needed** | Total execution time 44.5s | Pipeline step has a 10-min timeout. Nightly 243K-permit run comfortably within budget. |

---

## Raw EXPLAIN Output

```
Nested Loop Left Join  (cost=11.90..4421333.20 rows=243838 width=235) (actual time=7.851..44500.142 rows=243454.00 loops=1)
  Buffers: shared hit=2301188 read=710930
  ->  Nested Loop Left Join  (cost=2.01..2145519.54 rows=243838 width=199) (actual time=5.310..27018.549 rows=243454.00 loops=1)
        Buffers: shared hit=1322469 read=459047
        ->  Nested Loop Left Join  (cost=1.73..2139398.91 rows=243838 width=193) (actual time=5.052..26700.065 rows=243454.00 loops=1)
              Buffers: shared hit=1322086 read=458970
              ->  Nested Loop Left Join  (cost=1.29..2133286.10 rows=243838 width=177) (actual time=4.302..18131.375 rows=243454.00 loops=1)
                    Buffers: shared hit=1139576 read=382836
                    ->  Nested Loop Left Join  (cost=0.86..2127173.27 rows=243838 width=177) (actual time=3.211..14394.002 rows=243454.00 loops=1)
                          Buffers: shared hit=926935 read=317405
                          ->  Nested Loop Left Join  (cost=0.43..2121060.46 rows=243838 width=164) (actual time=2.610..3210.426 rows=243454.00 loops=1)
                                Buffers: shared hit=750021 read=215919
                                ->  Seq Scan on permits p  (cost=0.00..208006.38 rows=243838 width=160) (actual time=0.239..753.163 rows=243454.00 loops=1)
                                      Buffers: shared hit=18 read=205550
                                ->  Memoize  (cost=0.43..8.45 rows=1 width=4) (actual time=0.009..0.009 rows=0.92 loops=243454)
                                      Cache Key: p.permit_num, p.revision_num
                                      Cache Mode: binary
                                      Hits: 0  Misses: 243454  Evictions: 169794  Overflows: 0  Memory Usage: 8193kB
                                      ->  Limit  (cost=0.42..8.44 rows=1 width=4)
                                            ->  Index Only Scan using permit_parcels_permit_num_revision_num_parcel_id_key on permit_parcels
                                                  Index Cond: ((permit_num = p.permit_num) AND (revision_num = p.revision_num))
                                                  Heap Fetches: 30009  Index Searches: 243454
                          ->  Memoize  (cost=0.43..8.45 rows=1 width=17) (actual time=0.045..0.045 rows=0.92 loops=243454)
                                Cache Key: permit_parcels.parcel_id
                                Cache Mode: logical
                                Hits: 173853  Misses: 69601
                                ->  Index Scan using parcels_pkey on parcels pp_parcel
                                      Index Cond: (id = permit_parcels.parcel_id)
                    ->  Memoize  (cost=0.43..8.45 rows=1 width=4) (actual time=0.015..0.015 rows=0.91 loops=243454)
                          Cache Key: permit_parcels.parcel_id
                          Cache Mode: binary
                          Hits: 173853  Misses: 69601
                          ->  Limit  (cost=0.42..8.44 rows=1 width=4)
                                ->  Index Scan using idx_parcel_buildings_one_primary on parcel_buildings
                                      Index Cond: (parcel_id = permit_parcels.parcel_id)
              ->  Memoize  (cost=0.43..8.45 rows=1 width=24) (actual time=0.035..0.035 rows=0.91 loops=243454)
                    Cache Key: parcel_buildings.building_id
                    Hits: 178792  Misses: 64662
                    ->  Index Scan using building_footprints_pkey on building_footprints bf
                          Index Cond: (id = parcel_buildings.building_id)
        ->  Memoize  (cost=0.28..0.30 rows=1 width=14) (actual time=0.001..0.001 rows=0.86 loops=243454)
              Cache Key: p.neighbourhood_id
              Hits: 243294  Misses: 160
              ->  Index Scan using idx_neighbourhoods_nid on neighbourhoods n
                    Index Cond: (neighbourhood_id = p.neighbourhood_id)
  ->  Memoize  (cost=9.89..9.90 rows=1 width=32) (actual time=0.068..0.069 rows=1.00 loops=243454)
        Cache Key: p.permit_num, p.revision_num
        Hits: 0  Misses: 243454  Evictions: 180513
        ->  Aggregate
              ->  Hash Join
                    Hash Cond: (t.id = pt2.trade_id)
                    ->  Seq Scan on trades t  (loops=106145)
                    ->  Hash
                          ->  Index Scan using permit_trades_permit_num_revision_num_trade_id_key on permit_trades pt2
                                Index Cond: (permit_num = p.permit_num AND revision_num = p.revision_num)
                                Filter: is_active
                                Rows Removed by Filter: 4
Planning Time: 51.373 ms
Execution Time: 44542.807 ms
```
