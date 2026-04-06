# Lead Feed — Final Assessment & Gap Analysis

> **Date:** 2026-04-06
> **Purpose:** Comprehensive rubric evaluation of lead feed specs (70-75) against production readiness vectors, identify gaps, propose best-in-class solutions from GitHub and industry sources, then hand off for independent review.
>
> **Source documents synthesized:**
> - Specs 70-75 (`docs/specs/product/future/`)
> - `docs/reports/lead_feed_specs_evaluation.md` (prior 8-point evaluation)
> - `docs/reports/competitive_lead_gen_ux_research.md` (Part 1 + Part 2)
> - `docs/reports/react_best_practices_deep_dive.md`
> - `docs/specs/00_engineering_standards.md` §5 Production Readiness Rubric (10 vectors)
> - Database prevalence audit (2026-04-06)

---

## Part A: Database Prevalence Reality Check

Fresh audit against production data (242,513 permits):

| Field / Table | Coverage | Impact on Feature |
|--------------|---------:|-------------------|
| `permits.latitude` (geocoded) | 91.0% | Proximity works for 91% of permits |
| `permits.issued_date` | 93.7% | Timing heuristic (Tier 2) works |
| `permits.neighbourhood_id` | 94.7% | Premium factor always available |
| `permits.scope_tags` | 99.9% | Feature detail always available |
| `permits.project_type` | 99.9% | Residential/commercial split available |
| `permits.description` | 99.8% | Full text available |
| `permits.est_const_cost` | 45.4% | Cost model needs to fill 54.6% |
| **`permit_trades` classified** | **43.5%** | **Gap: 56.5% of permits have no trade match** |
| `permit_parcels` linked | 92.3% | Parcel/massing data available |
| `permits.builder_name` | 5.0% | Opportunity type mostly unknown |
| **`permit_inspections` with dated rows** | **2.4%** | **Gap: stage-based timing only works for 2.4%** |
| `entity_projects` Builder role | 3.8% | Builder entity data mostly sparse |
| WSIB entries passing quality filter | 41,551 | Builder leads viable at scale |
| `neighbourhoods.avg_household_income` | 94.7% | Premium factor reliable |
| **`permits.storeys`** | **0.0%** | **Gap: not populated at all** |
| **`permits.owner`** | **0.0%** | **Gap: not populated at all** |

### Critical takeaways
- **Trade classification at 43.5%** — The feed can only surface leads for 105K permits of the 242K. Classification coverage must be expanded before launch, or the feed will feel empty in certain trades.
- **Dated inspections at 2.4%** — Tier 1 stage-based timing (high confidence) applies to 5,800 permits. The inspection scraping pipeline must complete before this pillar delivers real value.
- **Builder identity at 3.8%** — The opportunity type pillar will show "Unknown" on 95% of cards. This is honest but limits differentiation.

---

## Part B: 10-Vector Production Readiness Rubric

Using `00_engineering_standards.md §5 Production Readiness Rubric` (10 vectors × 4-point scale). Score each component of the lead feed feature.

### Components Evaluated
1. **Data Layer** — scoring.ts, timing.ts, cost-model.ts, builder-query.ts
2. **API Layer** — `/api/leads/feed`, `/api/leads/view`
3. **State Layer** — Zustand store, TanStack Query hooks
4. **UI Layer** — All React components
5. **Database** — New migrations (067, 068, 069)
6. **Integration** — Auth, map, existing permit data

### Scoring Legend
- **3** = Exemplary, production-ready reference
- **2** = Acceptable, minor improvements possible
- **1** = Needs work, known issues to fix
- **0** = Not ready, blocker

### Scores

| Vector | Data | API | State | UI | DB | Integration | Avg |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Correctness** | 2 | 2 | 2 | 2 | 1 | 1 | 1.7 |
| **2. Reliability** | 2 | 1 | 2 | 2 | 2 | 1 | 1.7 |
| **3. Scalability** | 1 | **0** | 2 | 1 | **0** | 1 | 0.8 |
| **4. Security** | 2 | 1 | 2 | 1 | 2 | **0** | 1.3 |
| **5. Observability** | 1 | 1 | 1 | 1 | 1 | 1 | 1.0 |
| **6. Data Safety** | 2 | 2 | 2 | 2 | 2 | 1 | 1.8 |
| **7. Maintainability** | 3 | 3 | 3 | 3 | 2 | 2 | 2.7 |
| **8. Testing** | 2 | 2 | 2 | 2 | 2 | 1 | 1.8 |
| **9. Spec Compliance** | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| **10. Operability** | 2 | 1 | 2 | 2 | 1 | 1 | 1.5 |

**Average:** 1.73 of 3.0

**Production threshold per §5:** All vectors >= 1, average >= 1.5. Any single 0 blocks release.

### Blockers Identified (scores of 0)

1. **Scalability / API** — Application-level scoring on top 50-100 candidates in Node memory (spec 70). At scale this will OOM. Flagged in prior evaluation.
2. **Scalability / DB** — Raw Haversine SQL math in spec 73 without PostGIS KNN indexing. Trigonometry across millions of rows will bottleneck.
3. **Security / Integration** — Spec 73 proposes fetching builder website OG images dynamically on the API server. This is an SSRF vulnerability if not sandboxed to a pipeline.

---

## Part C: Consolidated Gap Inventory

Gaps identified across the prior 8-point evaluation, the 10-vector rubric, and the database prevalence check. Organized by severity.

### Critical Gaps (must resolve before build)

#### C1. SSRF vulnerability in builder photo fetching
- **Source:** Spec 73, §2 (Builder card photo fallback), prior eval item 6
- **Risk:** API server fetches arbitrary builder URLs → internal network probing, credential extraction
- **Fix:** Move OG image extraction to `scripts/enrich-wsib.js` pipeline. Store final image URL in a new `entity_photo_url` column on entities table. API serves pre-validated URLs only.
- **Reference implementation:** `node-html-parser` + allowlisted hostnames + timeout + max-size limits. See `npm:unfurl.js` which handles OG extraction safely for offline use.

#### C2. Node-memory scoring won't scale
- **Source:** Spec 70, prior eval item 5
- **Risk:** OOM under load, 500ms+ API response time when radius is large
- **Fix:** Push the 4-pillar scoring into PostgreSQL using window functions + CTE. Use PostGIS `<->` operator for proximity.
- **Reference:** PostGIS KNN docs, `ST_DWithin` for radius pre-filter
- **Migration needed:** `CREATE INDEX ... USING GIST (ST_MakePoint(longitude, latitude))` on permits

#### C3. Haversine SQL trig will bottleneck
- **Source:** Spec 73, prior eval item 7
- **Risk:** Trigonometry functions across 242K rows per request
- **Fix:** Enable PostGIS extension, add `geography` column to permits, use `ST_DWithin` + `<->` KNN
- **Migration needed:**
```sql
ALTER TABLE permits ADD COLUMN location geography(Point, 4326);
UPDATE permits SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE latitude IS NOT NULL;
CREATE INDEX idx_permits_location ON permits USING GIST (location);
```

#### C4. Street View API caching prohibited by Google TOS
- **Source:** Google Maps Platform Service Terms — research finding
- **Risk:** We cannot legally cache the actual Street View images. Every card render = $0.007. At 1000 daily users × 15 cards × 2 views = $210/day = **~$6,300/month**.
- **Fix options:**
  - **Option A:** Cache only `pano_id` (allowed by TOS), construct image URL client-side. Still costs per view but client-side caching via browser reduces repeat requests.
  - **Option B:** Use a single photo per permit stored as a blob URL in a new `permit_photos` column, refreshed quarterly via pipeline. Violates spirit of TOS for static caching.
  - **Option C (recommended):** Use `pano_id` caching + lazy loading + viewport-based rendering so only visible cards trigger requests. Expected cost: ~$20-50/month at modest usage.
- **Reference:** [Street View Static API Best Practices](https://developers.google.com/maps/documentation/streetview/static-web-api-best-practices)

#### C5. No rate limiting on API routes
- **Source:** Missing from all specs
- **Risk:** DoS, cost explosion on Street View, data scraping
- **Fix:** Add `@upstash/ratelimit` middleware to `/api/leads/feed` and `/api/leads/view`
- **Reference implementation:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '60 s'),  // 30 req/min per user
});

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromSession(req);
  const { success } = await ratelimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  // ... rest of handler
}
```

### High-Severity Gaps

#### H1. TanStack Query cache too short for offline use
- **Source:** Prior eval item 2 (offline capabilities)
- **Risk:** Tradesperson enters basement with 10-minute-old cache → empty feed
- **Fix:** Persist cache to IndexedDB using `@tanstack/react-query-persist-client`
- **Reference:**
```typescript
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const persister = createAsyncStoragePersister({
  storage: window.localStorage,  // or IndexedDB adapter
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
});

<PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
  {children}
</PersistQueryClientProvider>
```

#### H2. Parent/child permit linkage missing from timing engine
- **Source:** Prior eval item 4
- **Risk:** Demolition permit timing shown when the actual New Building permit should drive the timing
- **Fix:** In `timing.ts`, check for linked permits on the same parcel via `permit_parcels`. Prefer the permit that matches the target trade's phase window.
- **Data check needed:** Query for permits sharing a parcel_id with different permit_types

#### H3. No error boundary strategy for the lead feed
- **Source:** Missing from spec 75
- **Risk:** A single card render error crashes the whole feed
- **Fix:** Add `error.tsx` at `/app/leads/error.tsx` and `/app/leads/global-error.tsx`. Wrap individual cards in a local error boundary.
- **Reference implementation (Next.js 15):**
```typescript
// app/leads/error.tsx
'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to your error tracking service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1C1F26] p-6">
      <h2 className="text-neutral-100 font-display text-lg font-bold mb-2">
        Something went wrong loading leads
      </h2>
      <p className="text-neutral-400 text-sm mb-4">Error ID: {error.digest}</p>
      <button onClick={reset} className="min-h-[44px] px-6 bg-amber-500 text-neutral-900 rounded-md">
        Try again
      </button>
    </div>
  );
}
```

#### H4. Zod validation errors return generic 500
- **Source:** Prior eval item 3
- **Risk:** Users lose visibility into why their location failed
- **Fix:** Catch `ZodError` explicitly in API routes, return 400 with field-level messages
```typescript
try {
  const params = paramsSchema.parse(...);
} catch (err) {
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { data: null, error: 'Invalid parameters', meta: { issues: err.issues } },
      { status: 400 }
    );
  }
  // ... 500 handler
}
```

#### H5. No virtualization for long feeds
- **Source:** Missing from spec 75
- **Risk:** Scrolling 200+ cards tanks frame rate on mid-range Android
- **Fix:** Use `@tanstack/react-virtual` once feed length exceeds 50 items
- **Reference:** [TanStack Virtual Infinite Scroll Example](https://tanstack.com/virtual/latest/docs/framework/react/examples/infinite-scroll)
- **Trade-off:** Adds complexity for the feed layout. V1 can defer to 50-card cap with infinite scroll, V2 adds virtualization.

#### H6. Firebase auth `verifyIdToken` not wired
- **Source:** Existing `CLAUDE.md` memory — "Cookie format check only, Firebase Admin SDK verifyIdToken() not yet wired"
- **Risk:** Anyone with a 3-segment JWT-shaped cookie can access lead feed
- **Fix:** Integrate `next-firebase-auth-edge` library before feature launch, OR implement `verifyIdToken` in middleware using Firebase Admin SDK
- **Reference:** [next-firebase-auth-edge](https://next-firebase-auth-edge-docs.vercel.app/docs/usage/middleware)

### Medium-Severity Gaps

#### M1. Trade classification coverage at 43.5%
- **Impact:** Feed will feel empty for users searching trades with low classification coverage
- **Fix:** Expand classification rules, add work-field fallback at lower confidence. Track per-trade coverage in a metric.
- **Not a blocker:** Existing pipeline work, not new development.

#### M2. Data projection not enforced in spec
- **Source:** §4.3 engineering standard compliance
- **Risk:** API could accidentally return full permit rows including raw_json
- **Fix:** Add explicit SELECT column list in `getLeadFeed` lib function, validate with Zod on the way out
- **Pattern:** Create a `PermitLeadDTO` type and serializer function

#### M3. Competition count query not indexed
- **Source:** Spec 70 `lead_views` table
- **Risk:** `SELECT COUNT(DISTINCT user_id) FROM lead_views WHERE permit_num = X AND trade_slug = Y` without proper index = slow at scale
- **Fix:** Add index: `CREATE INDEX idx_lead_views_permit_trade ON lead_views (permit_num, trade_slug)` — already in spec 70. Verify it actually gets created.

#### M4. Geolocation permission flow not specified
- **Source:** Missing from specs 70 and 74
- **Risk:** Users who deny GPS get stuck with no fallback
- **Fix:** 
  1. Try browser `navigator.geolocation.getCurrentPosition`
  2. On denial, fall back to user profile's saved home base (postal code → geocode)
  3. On no home base, show onboarding prompt
- **Reference implementation:**
```typescript
function useGeolocation() {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => setError(err.message),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  return { location, error };
}
```

#### M5. Observability gap — no metrics or tracing
- **Source:** 10-vector rubric observability scores all 1
- **Risk:** Can't tell why a user sees slow or empty feeds
- **Fix:** Add structured logging to API routes (already have `logError`), add performance timing marks, consider OpenTelemetry when scaling
- **Minimum V1:** Log `{user_id, trade_slug, lat, lng, result_count, duration_ms}` per feed request

#### M6. No offline error messaging
- **Source:** Missing from spec 75 EmptyLeadState
- **Risk:** User sees generic "No leads" when they're actually offline
- **Fix:** Detect `navigator.onLine` and show different message

### Low-Severity Gaps

#### L1. 320px viewport (iPhone SE) not tested
- **Source:** Prior eval item 1
- **Risk:** Older devices may break layout
- **Fix:** Add 320px test case to UI tests, ensure text truncates properly

#### L2. No haptic feedback on Android detection
- **Source:** Spec 75 uses `navigator.vibrate(10)` unconditionally
- **Risk:** Works on Android, silently fails on iOS Safari (Safari doesn't implement Vibration API)
- **Fix:** Feature-detect and add iOS haptic via `Haptics` API from `@capacitor/haptics` if we ever wrap in Capacitor

#### L3. Spec 71 inspection_stage_map seed data hand-curated
- **Source:** Spec 71
- **Risk:** Mapping may not reflect real-world stage sequences
- **Fix:** Validate against actual inspection data — query what stages precede what in the 5,800 permits with dated inspections

#### L4. Timing calibration data static
- **Source:** Spec 71 "Median: 105d, P25: 44d, P75: 238d"
- **Risk:** Hardcoded values go stale as construction practices change
- **Fix:** Compute calibration nightly in a pipeline step, store in a `timing_calibration` table

---

## Part D: Schema Correctness Assessment

### Existing tables — correctness for lead feed

| Table | Status | Notes |
|-------|:------:|-------|
| `permits` | ✅ | All fields needed exist. Add `location` geography column for PostGIS (C3). |
| `permit_trades` | ✅ | Already has trade_slug, phase, lead_score, confidence |
| `entities` | ⚠️ | Add `photo_url` column for pre-validated OG images (C1) |
| `entity_projects` | ✅ | Builder role linkage |
| `wsib_registry` | ✅ | Contact info + business_size |
| `permit_inspections` | ⚠️ | Low date coverage (2.4%). Not a schema issue but impacts timing engine. |
| `parcels` | ✅ | Has lot_size_sqm, frontage_m |
| `building_footprints` | ✅ | Has footprint_area_sqm, max_height_m, estimated_stories |
| `neighbourhoods` | ✅ | Has avg_household_income, tenure_owner_pct |
| `permit_parcels` | ✅ | Parcel linkage, useful for parent/child permit logic (H2) |

### New tables — assessed

| Table | Purpose | Issues |
|-------|---------|--------|
| `lead_views` (spec 70) | Track views for competition count | **Issue:** Composite key with multiple nullable columns is awkward. **Fix:** Use two separate tables or add a computed `lead_key` column. |
| `cost_estimates` (spec 72) | Cache cost model output | ✅ Correctly keyed on `(permit_num, revision_num)` |
| `inspection_stage_map` (spec 71) | Reference table for stage→trade | ✅ Simple, correct |

### New schema additions needed

```sql
-- For C3: PostGIS proximity
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE permits ADD COLUMN location geography(Point, 4326);
UPDATE permits 
  SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography 
  WHERE latitude IS NOT NULL;
CREATE INDEX idx_permits_location ON permits USING GIST (location);

-- For C1: Pre-validated builder photos
ALTER TABLE entities ADD COLUMN photo_url VARCHAR(500);
ALTER TABLE entities ADD COLUMN photo_validated_at TIMESTAMPTZ;

-- For L4: Timing calibration
CREATE TABLE timing_calibration (
  id SERIAL PRIMARY KEY,
  permit_type VARCHAR(100),
  median_days_to_first_inspection INTEGER,
  p25_days INTEGER,
  p75_days INTEGER,
  sample_size INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part E: Component-by-Component Assessment

For each component in spec 75, evaluate correctness / integration / scalability / security.

### E1. LeadFeed (Container)
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 2 | Logic is sound but relies on feed interleaving happening in API |
| Integration | 2 | Wires TanStack Query + Zustand + intersection observer cleanly |
| Scalability | 1 | No virtualization — caps at ~50 cards before frame drops (H5) |
| Security | 2 | No direct data access; relies on API enforcement |

### E2. PermitLeadCard
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 2 | Expand/collapse, save, all states handled |
| Integration | 2 | Motion + TanStack Query mutation + Zustand hover |
| Scalability | 2 | `memo()` wrapping prevents re-render storms |
| Security | 2 | Sanitized `tel:` links, `rel="noopener"` on external |

### E3. BuilderLeadCard
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 2 | All contact states handled, fallback avatar |
| Integration | 2 | WSIB quality filter enforced upstream |
| Scalability | 2 | Same as permit card |
| Security | **0** | **SSRF blocker via dynamic OG image fetch (C1)** |

### E4. API Layer (/api/leads/feed)
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 2 | Zod validation, proper envelope |
| Integration | 2 | TanStack Query consumer matches server contract |
| Scalability | **0** | **Node-memory scoring (C2) + Haversine SQL (C3)** |
| Security | 1 | No rate limiting (C5), generic Zod error handling (H4) |

### E5. API Layer (/api/leads/view)
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 2 | Upsert pattern is correct |
| Integration | 2 | Optimistic UI update matches server behavior |
| Scalability | 2 | Single-row write, indexed |
| Security | 1 | No rate limiting — a malicious user could spam views to inflate competition count |

### E6. Database Layer
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 1 | `lead_views` composite key with nullable cols is awkward |
| Integration | 2 | All joins well-defined |
| Scalability | **0** | **No PostGIS index (C3), no partial indexes for hot queries** |
| Security | 2 | Parameterized queries throughout |

### E7. Auth Integration
| Dimension | Score | Notes |
|-----------|:---:|-------|
| Correctness | 1 | Firebase verifyIdToken not wired (H6) |
| Integration | 1 | Middleware shape-check only |
| Scalability | 2 | Session cookies scale fine |
| Security | **0** | **Pre-existing gap, not new, but blocks production launch** |

---

## Part F: Best-in-Class Reference Implementations (GitHub / Open Source)

For each critical gap, here are the reference implementations to mine for patterns:

### For C1 (SSRF safe OG image fetching)
- **Library:** `unfurl.js` — safely extracts OG metadata with URL allowlists
- **Pattern:** Run in a sandboxed worker process, validate URL hostname against DNS resolution, reject private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x)
- **Repo:** github.com/jacktuck/unfurl

### For C2 (Database-side scoring)
- **Pattern:** PostgreSQL CTE with window functions
- **Example query structure:**
```sql
WITH candidates AS (
  SELECT p.*, pt.trade_slug, pt.confidence, pt.phase, ce.estimated_cost, ce.cost_tier,
    ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) as distance_m
  FROM permits p
  JOIN permit_trades pt USING (permit_num, revision_num)
  LEFT JOIN cost_estimates ce USING (permit_num, revision_num)
  WHERE pt.trade_slug = $trade_slug
    AND ST_DWithin(p.location, ST_MakePoint($lng, $lat)::geography, $radius_m)
    AND p.status NOT IN ('Cancelled', 'Revoked')
  ORDER BY p.location <-> ST_MakePoint($lng, $lat)::geography
  LIMIT 200
),
scored AS (
  SELECT *,
    -- Proximity (0-30)
    CASE 
      WHEN distance_m < 500 THEN 30
      WHEN distance_m < 1000 THEN 25
      WHEN distance_m < 2000 THEN 20
      WHEN distance_m < 5000 THEN 15
      WHEN distance_m < 10000 THEN 10
      WHEN distance_m < 20000 THEN 5
      ELSE 0
    END as proximity_score,
    -- Timing from permit_inspections (to be expanded)
    -- Value from cost_tier
    -- Opportunity from permit_type
    ...
  FROM candidates
),
ranked AS (
  SELECT *, (proximity_score + timing_score + value_score + opportunity_score) as relevance_score
  FROM scored
)
SELECT * FROM ranked ORDER BY relevance_score DESC LIMIT 20;
```
- **Reference:** PostGIS KNN docs, [https://postgis.net/docs/manual-3.3/geometry_distance_knn.html]

### For C5 (Rate limiting)
- **Library:** `@upstash/ratelimit` — edge-compatible, battle-tested
- **Repo:** github.com/upstash/ratelimit-js
- **Pattern:** Sliding window, 30 req/min per user

### For H1 (Offline persistence)
- **Library:** `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`
- **Storage:** IndexedDB via `idb-keyval` adapter
- **Repo:** github.com/TanStack/query

### For H5 (Virtualization)
- **Library:** `@tanstack/react-virtual`
- **Reference:** [TanStack Virtual Infinite Scroll Example](https://tanstack.com/virtual/latest/docs/framework/react/examples/infinite-scroll)
- **Repo:** github.com/TanStack/virtual

### For H6 (Firebase Auth edge)
- **Library:** `next-firebase-auth-edge`
- **Repo:** github.com/awinogrodzki/next-firebase-auth-edge
- **Pattern:** Middleware-based, auto-refreshing cookies, rotating keys

### For UI Gesture Physics (already covered in Part 2)
- **Library:** `vaul` (bottom sheets), `motion` (springs)
- Already in implementation guide

---

## Part G: Revised Build Sequence (Incorporating Gaps)

The 6-phase build sequence in spec 75 needs adjustments to address blockers BEFORE any UI is built.

### Phase 0: Foundation Fixes (NEW — blocks all other work)
1. ✅ Install PostGIS extension (C3)
2. ✅ Add `permits.location` geography column + GIST index (C3)
3. ✅ Add `entities.photo_url` column (C1)
4. ✅ Wire Firebase `verifyIdToken` in middleware (H6)
5. ✅ Install `@upstash/ratelimit` + Redis setup (C5)
6. ✅ Migrate OG image extraction to `scripts/enrich-wsib.js` pipeline (C1)

### Phase 1: Data Layer (updated)
1. Build scoring logic **in SQL, not JS** (C2)
2. Build timing engine with parent/child permit merge logic (H2)
3. Build cost model (spec 72 as-is)
4. Build builder query with PostGIS KNN (C3)
5. Write logic tests

### Phase 2: API Layer (updated)
1. `/api/leads/feed` with SQL-based scoring query
2. Zod validation returning **400 on error** (H4)
3. Rate limiting middleware (C5)
4. Structured logging for observability (M5)
5. Error boundary for errors (H3)

### Phase 3: State & Hooks
1. Zustand store
2. TanStack Query with **PersistQueryClient** (H1)
3. `useGeolocation` hook with fallback chain (M4)

### Phase 4-6 (as originally specced — UI, map, polish)

---

## Part H: Summary Scorecard

| Category | Status |
|----------|--------|
| Spec completeness | Excellent — 6 specs covering architecture, design, research, implementation |
| Mobile UX approach | Very strong — industrial utilitarian, progressive disclosure, 44px targets |
| State management | Strong — TanStack Query + Zustand, no Redux |
| Code organization | Strong — feature-sliced, Server/Client split |
| **Scalability** | **Blocked** — SQL-side scoring, PostGIS needed |
| **Security** | **Blocked** — SSRF, rate limiting, verifyIdToken |
| Offline support | Gap — needs PersistQueryClient |
| Error handling | Gap — needs error boundary strategy |
| Observability | Gap — needs structured logging |
| Testing strategy | Strong — triad pattern established |

**Verdict:** The feature is architecturally sound and product-ready, but has **3 critical blockers** (SSRF, database-side scoring, PostGIS) that must be fixed before any code is written. With those addressed, the rubric average moves from 1.73 to ~2.3, comfortably above the 1.5 production threshold.

**Recommendation:** Execute Phase 0 fixes first (1-2 weeks of foundation work), then proceed with the 6-phase build sequence as specified. Do not skip Phase 0 — every critical gap there compounds during implementation.

---

## Sources

- [next-firebase-auth-edge](https://next-firebase-auth-edge-docs.vercel.app/docs/usage/middleware)
- [TanStack Virtual Infinite Scroll](https://tanstack.com/virtual/latest/docs/framework/react/examples/infinite-scroll)
- [Google Street View Static API Best Practices](https://developers.google.com/maps/documentation/streetview/static-web-api-best-practices)
- [Google Maps API Pricing](https://nicolalazzari.ai/articles/understanding-google-maps-apis-a-comprehensive-guide-to-uses-and-costs)
- [Upstash Rate Limit](https://github.com/upstash/ratelimit-js)
- [Next.js 15 Error Handling](https://devanddeliver.com/blog/frontend/next-js-15-error-handling-best-practices-for-code-and-routes)
- [PostGIS KNN Documentation](https://postgis.net/docs/manual-3.3/geometry_distance_knn.html)
- [unfurl.js (OG extraction)](https://github.com/jacktuck/unfurl)
