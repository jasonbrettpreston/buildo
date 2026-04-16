# Phase 1 & 2 Implementation Code Review

**Date**: April 2026
**Target Files**: Lead Feed Phase 1 (`get-lead-feed.ts`, `builder-query.ts`, `timing.ts`, `cost-model.ts`, `record-lead-view.ts`, `distance.ts`) and Phase 2 (`api/leads/feed/route.ts`, `api/leads/view/route.ts`)
**Purpose**: Post-implementation audit evaluating codebase architecture, Postgres querying patterns, memory usage, and potential system bottlenecks before launching frontend logic.

---

## 1. Architectural Strengths & Good Patterns

### Phase 1 Core Systems
1. **Defensive API Gatekeeping (`get-lead-feed.ts`)**: 
   - Strict `MAX_FEED_LIMIT = 30` enforcement physically prevents SQL injection or Denial of Service (DoS) attacks that could fetch an unbound result set and overwhelm the Node process.
   - Null handling defensively checks invariant violations from Postgres `UNION ALL` mismatches, preventing corrupted payload structures from crashing `mapRow`.
2. **Deterministic Cursor Pagination**: 
   - By utilizing deterministic tuples `(relevance_score, lead_type, lead_id) < ($6, $7, $8)`, you've successfully bypassed severe database slowdowns typically associated with traditional `OFFSET` pagination, allowing high-availability deep-scrolling. 
3. **Pure Function Separation (`cost-model.ts`)**: 
   - Stripping the cost estimator of DB dependencies logic makes the model completely synchronously testable. It accurately handles massive branching matrices (e.g., foot-prints vs lot-sizes vs urban renter density fallbacks) without triggering networking IO.
4. **Resilient Calibration Engine (`timing.ts`)**:
   - The global caching Map (`calibrationCache`) effectively decouples timing heuristics from hammering the database. The logic fails open: if the cache lookup crashes during a network blip, the engine deliberately avoids locking the stale failure state and lets consecutive calls retry safely.

### Phase 2 API Routes
5. **Thin Controller Pattern (`route.ts`)**:
   - The Next.js API routes contain absolutely zero domain logic. They strictly manage HTTP mechanics (Content-Type validation, Zod casting, Firebase JWT authentication, logging) and delegate all execution to the Phase 1 library modules. This makes both layers vastly easier to unit test.
6. **Strict Security Guardrails**:
   - **Trade Sandboxing:** The `trade_slug` requested in the API payload is strictly verified against the `trade_slug` embedded within the authenticated user's `tx.uid` profile context (`if (params.trade_slug !== ctx.trade_slug)`). This explicitly prohibits users from scraping or viewing competitor trade leads.
   - **Payload Injection Defense:** `api/leads/view` aggressively intercepts requests before parsing `request.json()` to verify the `Content-Type` is explicitly `application/json`. This hardens the route against malicious payloads disguised as plaintext or multiparts aimed at creating stack trace crashes.
7. **Scoped Rate Limiting**:
   - `leads-view` and `leads-feed` construct isolated Upstash Redis buckets. A user aggressively tapping the "Save Lead" button (60 req/min) will not accidentally rate-limit themselves out of scrolling the feed (30 req/min).

---

## 2. Identified Technical Risks & Bottlenecks

### Risk A: N+1 Subquery Constraints in `get-lead-feed.ts`
**File**: `get-lead-feed.ts` (Lines 202-212)
**Summary**: The `builder_candidates` CTE leverages a `LATERAL` join to fetch the most recent WSIB Enrichment (`ORDER BY last_enriched_at DESC LIMIT 1`). 
**Severity**: **MEDIUM**
- **Impact**: While PostGIS `ST_DWithin` restricts the parent rows quickly, `LATERAL` forces the query planner to execute the subquery for *every* candidate entity returned in the radius. If a densely packed radius returns 5,000 builder candidates, Postgres executes 5,000 internal lookups to find the latest WSIB rank. 
- **Recommendation for V2**: Create a materialized view mapping `entity_id` and their most recent WSIB size.

### Risk B: Network Latency Chaining in `timing.ts`
**File**: `timing.ts`
**Summary**: Executing `getTradeTimingForPermit` fires multiple sequential database calls instead of a single clustered query.
**Severity**: **LOW**
- **Impact**: Getting a Tier 1 timing fires: 1) `pickBestCandidate`, 2) `inspections` lookup, 3) `findEnablingStage`. That represents three full network round trips per permit interaction.
- **Recommendation for V2**: These three distinct SQL lookups could be collapsed into a single multi-table stored procedure or CTE to reduce TCP serialization/round-trip delays when generating complex detail pages.

### Risk C: `COUNT(DISTINCT)` Scale Bottleneck
**File**: `record-lead-view.ts` (Lines 131-137)
**Summary**: The competition count relies on `SELECT COUNT(DISTINCT user_id) FROM lead_views`.
**Severity**: **LOW (Currently, escalates over time)**
- **Impact**: Once `lead_views` scales into tens of millions of records, running distinct aggregation dynamically for a rolling 30-day window will cause noticeable locking or slow performance, even with covering indexes.
- **Recommendation for V2**: Once metrics validate feature usage, transition to a materialized summary table or use `HyperLogLog` extensions within Postgres for fast, approximate distinct counts.

### Risk D: Query Parameter Array Collision
**File**: `api/leads/feed/route.ts` 
**Summary**: Native extraction utilizing `Object.fromEntries(request.nextUrl.searchParams)` drops duplicate keys.
**Severity**: **LOW**
- **Impact**: If a client application constructs a malformed URL with duplicated query parameters (e.g. `?trade_slug=hvac&trade_slug=plumbing`), `fromEntries` will blindly collapse to the last key provided. While Zod (`leadFeedQuerySchema`) will catch and reject array values if misconstructed, `fromEntries` technically hides the collision from the Zod layer. As long as frontend clients don't manually concatenate bad query strings, this is safe.

---

## 3. Conclusion

The Phase 1 and Phase 2 backend implementations demonstrate exceptionally high code-quality rigor. The API endpoints act purely as a protective layer, enforcing Zod validations, rate-limits, and hard-coded Firebase Trade-Matching before any database work is executed. 

**Verdict: Fully cleared for frontend React connection (Phase 3).**
