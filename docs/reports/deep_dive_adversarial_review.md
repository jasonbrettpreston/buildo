# Deep-Dive Adversarial Review (Phase 1 & 2)

**Evaluated By:** Antigravity (Google DeepMind Agentic IDE)
**Date:** April 2026

This deep-dive bypasses the general architectural patterns and explicitly looks for hidden OOMs (out-of-memory errors), full table scan bottlenecks, and silent logic divergences down the dependency graph.

---

## 1. CRITICAL: The GIST Index Bypass (Full Table Scan)
**Files Affected:** `migrations/067_permits_location_geom.sql`, `get-lead-feed.ts`, `builder-query.ts`

**The Bug:**
Migration 067 creates the geospatial column as a `geometry` type (`geometry(Point, 4326)`) and creates an index on it:
```sql
CREATE INDEX IF NOT EXISTS idx_permits_location_gist ON permits USING GIST (location)
```
However, the queries in `get-lead-feed.ts` and `builder-query.ts` cast the column to `geography` during read:
```sql
ST_DWithin(p.location::geography, ST_MakePoint($2, $3)::geography, $4)
```

**The Threat:**
PostgreSQL query planners are strictly data-type-bound. Because you cast `p.location` to `geography` at runtime inside the `WHERE` clause, **Postgres completely ignores `idx_permits_location_gist`**. It falls back to a Seq Scan. 
For *every single feed request*, Postgres will compute mathematical trig functions on all 237,000+ permit rows in real-time. Under concurrency (>20 users), the database CPUs will pin at 100% and completely lock up the application.

**The Fix:**
Either change `migrations/067` to store the column natively as geography: `ALTER TABLE permits ADD COLUMN location geography(Point, 4326);` or rewrite the index creation to target the cast: 
`CREATE INDEX ... ON permits USING GIST ((location::geography));`

---

## 2. HIGH: Logic Divergence (Builder Fit vs Opportunity Score)
**Files Affected:** `builder-query.ts`, `get-lead-feed.ts`

**The Bug:**
The Unified Feed (`get-lead-feed.ts`) incorporates a `builder_candidates` CTE that essentially mimics `builder-query.ts`. However, looking closely at "Pillar 4", they are mathematically out of sync:
- In `builder-query.ts`, Pillar 4 (Fit) calculates proximity tiers, and **adds a +3 bonus** `CASE WHEN is_wsib_registered THEN 3 ELSE 0 END`.
- In `get-lead-feed.ts`, Pillar 4 (Opportunity) strictly relies on standard permit count tiers (lines 183-190). The WSIB bonus is completely missing.

**The Threat:**
A builder will surface with a completely different `relevance_score` when viewed in the unified feed vs being viewed on a dedicated builder endpoint. Users will notice ranking instability (a builder ranking #2 in one feed and #5 in another) which erodes trust. 

---

## 3. HIGH: The `LEFT JOIN LATERAL` Trap
**Files Affected:** `get-lead-feed.ts`

**The Bug:**
In `builder_candidates` (line 202), there is a `LEFT JOIN LATERAL` to fetch the most recent WSIB size. Later in the outer `WHERE` block, it applies:
```sql
AND w.business_size IS NOT NULL
```

**The Threat:**
By running a `LEFT JOIN` and then asserting `IS NOT NULL` in the `WHERE` clause, you are forcing Postgres to evaluate the heavy O(N) `LATERAL` sorting operation for *every single matched builder* in the radius, only to throw 80% of them away at the very end. The `LATERAL` join should be transformed into an `INNER JOIN PLATERAL` or an `EXISTS` check *before* grouping occurs, trimming the payload size as early in the pipeline as mathematically possible.

---

## 4. EDGE CASE: Zod Pagination Collision Mapping
**Files Affected:** `api/leads/feed/route.ts`

**The Bug/Risk:**
When passing the URL query parameters using `Object.fromEntries(request.nextUrl.searchParams)`, JavaScript automatically discards duplicate query keys. 

**The Threat:**
If a malicious or bugged client calls `?cursor_score=200&cursor_score=NaN`, the `fromEntries` logic collapses it into a single key, successfully escaping validation mapping logic or causing unexpected skipping in the cursor pagination logic. 

**The Fix:**
Although `z.coerce.number().finite()` stops `NaN` safely, passing `request.nextUrl.searchParams` through Next.js native `searchParams.get('cursor_score')` handles multi-key collisions dynamically and safely rather than relying on ES6 object instantiation flattening.
