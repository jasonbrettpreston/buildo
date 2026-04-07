# Lead Feed — Personalized Tradesperson Lead Generation

> **Status: FUTURE BUILD** — Architecture locked, not yet implemented.

<requirements>
## 1. Goal & User Story
Surface the most relevant construction leads to tradespeople based on their proximity, trade, and the project's stage — combining permit-based leads (specific job sites) and builder-based leads (relationship opportunities with active GCs). A plumber on a job site in Scarborough opens Buildo during lunch and sees a ranked feed of nearby opportunities with timing, scope, and opportunity signals.
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema

**`lead_views`** — tracks tradesperson interactions with leads
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PK |
| user_id | VARCHAR(100) | NOT NULL — Firebase UID |
| lead_key | VARCHAR(100) | NOT NULL — computed: 'permit:{permit_num}:{revision_num}' or 'builder:{entity_id}' |
| lead_type | VARCHAR(20) | NOT NULL — 'permit' or 'builder' |
| permit_num | VARCHAR(30) | nullable (null for builder leads) |
| revision_num | VARCHAR(10) | nullable |
| entity_id | INTEGER | nullable (null for permit leads) |
| trade_slug | VARCHAR(50) | NOT NULL |
| viewed_at | TIMESTAMPTZ | DEFAULT NOW() |
| saved | BOOLEAN | DEFAULT false |

**Indexes:**
- `(lead_key, trade_slug, viewed_at)` — **covering index** for competition count queries (hot path). Includes `viewed_at` so the `WHERE viewed_at > NOW() - INTERVAL '30 days'` filter is index-only.
- `(user_id, viewed_at DESC)` — for user history
- BRIN `(viewed_at)` — for retention sweep deletes (insert-ordered timestamps make BRIN ideal, much smaller than B-tree)

**Removed redundant indexes:** Earlier draft had `(permit_num, trade_slug)` and `(entity_id, trade_slug)`. Both are subsumed by the `(lead_key, trade_slug, viewed_at)` index since all queries should use `lead_key`.

**Unique:** `(user_id, lead_key, trade_slug)` — uses computed lead_key to avoid nullable composite key

**`lead_key` format (deterministic, never changes):**
- Permit lead: `permit:{permit_num}:{revision_num}` where `revision_num` defaults to `'00'` if NULL (matches the permits table convention)
- Builder lead: `builder:{entity_id}`
- Examples: `permit:24 123456 BLD:00`, `builder:9183`
- **Versioning:** If the format ever changes, write a one-time migration that backfills new keys, do NOT mix formats

**Foreign keys (with cleanup strategy):**
- `(permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE`
- `entity_id REFERENCES entities(id) ON DELETE CASCADE`
- `user_id` NOT a FK (Firebase UID)

**ON DELETE CASCADE risk and mitigation:** Deleting a popular entity could cascade-delete millions of `lead_views` rows in a single transaction, locking the table. Mitigation: prefer soft-deletes on entities (add `deleted_at` column), and run a separate nightly job to purge orphaned `lead_views` for soft-deleted entities. The CASCADE remains as a safety net for true hard-deletes.

**Why `lead_key`:** Composite unique constraints with multiple nullable columns are awkward in PostgreSQL (NULLs are not equal). The `lead_key` computed column gives us a single non-null identifier for both lead types.

**PII retention policy (PIPEDA/GDPR):**
- Nightly pipeline step `scripts/purge-lead-views.js` deletes rows older than 90 days
- On account deletion: immediate DELETE of all rows matching the Firebase UID, triggered via Firebase Auth deletion webhook
- `user_id` is pseudonymous (Firebase UID, not email/name)
- **Webhook failure mitigation:** If the Firebase deletion webhook fails (network error, processing failure), `lead_views` rows remain orphaned. The same nightly purge script runs a reconciliation pass: for each distinct `user_id` in `lead_views`, query the Firebase Admin SDK to verify the user still exists; if not, delete all rows for that UID. Reconciliation happens once per week to keep cost low.
- **Trade change policy:** When a user changes their trade in their profile, their existing `lead_views` rows for the old trade are NOT deleted (they remain valid historical records of what they viewed). Future feed queries filter by the new trade automatically. The competition count for old leads remains accurate per-trade.

**DOWN migration required** (migration 067):
```sql
-- DOWN: drop table and FKs
DROP TABLE IF EXISTS lead_views CASCADE;
```

### API Endpoints

**`GET /api/leads/feed`** — Personalized lead feed
- **Params:**
  - `lat`, `lng` (required, valid coordinates)
  - `trade_slug` (required, **must match user session profile trade** — server-side check, NOT a client-trusted parameter)
  - `radius_km` (default 10, **max 50** — Zod enforced to prevent DoS via massive spatial scans)
  - `cursor_score` + `cursor_lead_id` + `cursor_lead_type` (optional — unified cursor for pagination, see below)
  - `limit` (default 15, max 30)
- **Trade slug authorization:** The server compares `trade_slug` against the authenticated user's profile trade. Mismatch returns 403 Forbidden. Prevents users from scraping leads for trades they aren't certified in.
- **Pagination (unified cursor):** Cursor is a tuple `(relevance_score, lead_type, lead_id)` where `lead_id` is `permit_num:revision_num` for permits or `entity_id` for builders. The unified cursor works across the interleaved feed because both types are ranked together in a single SQL query (see Implementation below). Page 1 sends no cursor. Response `meta.next_cursor` is sent back for subsequent pages. Stable under concurrent inserts.
- **Response envelope:** `{ data: LeadFeedItem[], error: null, meta: { next_cursor, count, radius_km } }` per `00_engineering_standards.md` §4.4
- **Error responses:**
  - `400 Bad Request` — Zod validation failure, returns field-level error messages
  - `401 Unauthorized` — missing/invalid session
  - `403 Forbidden` — `trade_slug` doesn't match user profile
  - `429 Too Many Requests` — rate limit exceeded (30/min per user)
  - `500 Internal Server Error` — generic fallback with error digest
- **Logic:** **All scoring happens in PostgreSQL, NOT Node memory.** Single unified CTE query using `UNION ALL` to combine permit and builder leads, ranked together by relevance score, paginated with the unified cursor. PostGIS `ST_DWithin` for radius pre-filter, `<->` KNN operator for proximity ordering.
- **Rate limiting:** 30 requests per 60 seconds per `user_id` via `@upstash/ratelimit` middleware
- **Observability:** Structured log per request: `{user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms}`

**`POST /api/leads/view`** — Record view or save
- **Body:** Zod-enforced shape:
  ```typescript
  z.object({
    trade_slug: z.string(),
    action: z.enum(['view', 'save', 'unsave']),
  }).and(
    // XOR: exactly one of permit_num+revision_num OR entity_id, never both, never neither
    z.union([
      z.object({ permit_num: z.string(), revision_num: z.string(), entity_id: z.never().optional() }),
      z.object({ entity_id: z.number(), permit_num: z.never().optional(), revision_num: z.never().optional() }),
    ])
  );
  ```
- **Trade slug authorization:** Same server-side check as the feed endpoint
- **Response envelope:** `{ data: { competition_count: number }, error: null, meta: null }`
- **Rate limiting:** 60 requests per 60 seconds per user
- **Logic:** Computes `lead_key` from input (`permit:{num}:{rev}` or `builder:{entity_id}`), upserts to `lead_views`, returns competition_count from a separate SELECT (see consistency note below)
- **Competition count consistency:** The count is computed by `COUNT(DISTINCT user_id) FROM lead_views WHERE lead_key = X AND trade_slug = Y AND viewed_at > NOW() - INTERVAL '30 days'`. The query uses `lead_key` (not raw `permit_num`) to avoid the per-revision/per-permit ambiguity. Competition is per-permit (across all revisions) by virtue of `lead_key` collapsing revision into a single bucket per permit when needed — but for granularity we DO key by exact revision, since different revisions can represent meaningfully different work. **Decision: count by `lead_key` exactly as stored.** If the user expects per-permit aggregation across revisions, that's a separate UI rollup query, not the API contract.
- **Race condition note:** Between the upsert and the count, concurrent views can cause the returned count to be stale by 1-2. Acceptable trade-off for keeping the write path simple.

### Implementation

**Scoring engine:** `src/lib/leads/scoring.ts`
- `scorePermitLead(permit, trade_slug, user_lat, user_lng): ScoredPermitLead`
- `scoreBuilderLead(entity, trade_slug, user_lat, user_lng): ScoredBuilderLead`
- Composite score 0-100 from 4 pillars (see §4 Behavioral Contract)

**Types:** `src/lib/leads/types.ts`
- `LeadFeedItem`, `ScoredPermitLead`, `ScoredBuilderLead`, `PermitLeadCard`, `BuilderLeadCard`

**Feed query:** `src/app/api/leads/feed/route.ts`
- Thin route handler — delegates to `src/features/leads/lib/get-lead-feed.ts`
- **Unified scoring across permit and builder leads in a single CTE.** This is critical: an earlier draft kept permit and builder queries separate and tried to interleave at the application layer, which broke cursor pagination (page 2 would have duplicates/gaps because the application-level interleave shifted between requests). The fix is to UNION both lead types into one ranked result set, then apply the cursor uniformly.
  ```sql
  -- Unified feed: permits + builders ranked together, paginated with stable cursor.
  -- Cursor tuple: (relevance_score, lead_type, lead_id) where lead_id is
  -- 'permit_num:revision_num' or 'entity_id'.
  
  WITH permit_candidates AS (
    SELECT
      'permit'::text AS lead_type,
      (p.permit_num || ':' || p.revision_num) AS lead_id,
      p.permit_num, p.revision_num, p.status, p.permit_type, p.structure_type,
      p.work, p.description, p.latitude, p.longitude, p.issued_date,
      p.street_num, p.street_name, p.street_type, p.city, p.ward,
      p.scope_tags, p.project_type, p.enriched_status,
      pt.trade_slug, pt.confidence, pt.phase,
      ce.estimated_cost, ce.cost_tier, ce.complexity_score, ce.premium_factor,
      n.name AS neighbourhood_name, n.avg_household_income,
      NULL::int AS entity_id, NULL::text AS builder_name, NULL::int AS active_permits_nearby,
      ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) AS distance_m,
      -- Proximity 0-30 (computed once via subquery alias)
      CASE
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 500 THEN 30
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 1000 THEN 25
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 2000 THEN 20
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 5000 THEN 15
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 10000 THEN 10
        WHEN ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) < 20000 THEN 5
        ELSE 0
      END AS proximity_score
      -- timing_score, value_score, opportunity_score also computed here
    FROM permits p
    JOIN permit_trades pt USING (permit_num, revision_num)
    LEFT JOIN cost_estimates ce USING (permit_num, revision_num)
    LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
    WHERE pt.trade_slug = $trade_slug
      AND pt.is_active = true
      AND pt.confidence >= 0.5
      AND ST_DWithin(p.location, ST_MakePoint($lng, $lat)::geography, $radius_m)
      AND p.status NOT IN ('Cancelled', 'Revoked', 'Closed')
  ),
  builder_candidates AS (
    -- See spec 73 for the full builder query structure. Returns the SAME
    -- columns as permit_candidates with lead_type='builder' and permit-specific
    -- columns NULL. Critically, builder relevance_score is computed in the
    -- same CTE so both lead types share a comparable ranking.
    SELECT 'builder'::text AS lead_type, ... 
    FROM entities e ...
  ),
  unified AS (
    SELECT * FROM permit_candidates
    UNION ALL
    SELECT * FROM builder_candidates
  ),
  ranked AS (
    SELECT *,
      (proximity_score + COALESCE(timing_score, 0) + COALESCE(value_score, 0) + COALESCE(opportunity_score, 0)) AS relevance_score
    FROM unified
  )
  SELECT * FROM ranked
  WHERE
    -- Cursor pagination: tuple comparison handles all three fields
    -- in the correct sort order
    ($cursor_score IS NULL OR
     (relevance_score, lead_type, lead_id) < ($cursor_score, $cursor_lead_type, $cursor_lead_id))
  ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC
  LIMIT $limit;
  ```
- **Cursor pagination contract:** Client sends no cursor for page 1. Response includes `meta.next_cursor = { score, lead_type, lead_id }` from the last row. Client sends this back for page 2. Pagination is stable under concurrent inserts and works across both lead types because they're ranked in the same SQL pass — no application-layer interleaving.

**View tracking:** `src/app/api/leads/view/route.ts`
- Thin route handler — delegates to `src/features/leads/lib/record-lead-view.ts`
- Upserts to `lead_views` using the deterministic `lead_key` format
- Returns `competition_count` for the (lead_key, trade_slug) combination
- **No application-layer logic** — the lib function handles auth check, body validation, upsert, and count query

**UI components:** `src/components/leads/`
- `LeadFeed.tsx` — mobile-first scrollable feed, pull-to-refresh
- `PermitLeadCard.tsx` — Google Street View photo, timing badge, scope summary, opportunity type, competition count
- `BuilderLeadCard.tsx` — company photo (from website OG image/favicon), contact buttons (call/email/website), active permit count

</architecture>

---

<security>
## 3. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Cannot access — redirect to login |
| Authenticated | Full feed access for their selected trade |
| Admin | N/A — this is a user-facing feature |

- Tradesperson must have completed onboarding with trade selection
- Feed is personalized per user — never serves another user's data
- Contact info (phone/email) on builder leads is public business data from WSIB enrichment
</security>

---

<behavior>
## 4. Behavioral Contract

### Inputs
- User's current GPS coordinates (from device) OR saved home base address
- User's selected trade (from profile/onboarding)
- Search radius (default 10km, configurable)

### Core Logic — Permit Lead Scoring (0-100)

1. **Proximity Score (0-30):** Haversine distance from user to permit location. <500m=30, <1km=25, <2km=20, <5km=15, <10km=10, <20km=5, >20km=0.
2. **Timing Score (0-30):** Stage-based from inspection data (see `71_lead_timing_engine.md`). Trade needed NOW=30, within 2-4 weeks=25, 1-3 months=20, 3-6 months=15, 6-12 months=10, 12+ months=5, past trade's window=0. Fallback to heuristic phase model when no inspection data.
3. **Value Score (0-20):** From cost estimate model (see `72_lead_cost_model.md`). Matches user's preferred cost range=20, adjacent tier=12, outside=5. Premium neighbourhood bonus +3.
4. **Opportunity Score (0-20):** Based on permit type and builder signals. "Small Residential"/"Interior Alterations"=likely homeowner=18. "New Houses"/"New Building"=needs full trades=15. Builder name known + high permit_count=8. Unknown=12 (neutral). When builder_name is absent (95% of permits), state "Builder unknown" — do not guess.

### Core Logic — Builder Lead Scoring (0-100)

1. **Proximity (0-30):** Distance to builder's closest active permit needing this trade.
2. **Activity (0-30):** Count of active permits needing this trade. 5+=30, 3-4=25, 2=20, 1=15.
3. **Contact (0-20):** Has phone+website=20, phone OR website=15, email only=10, no contact=0. Builder leads WITHOUT at least phone or website are excluded.
4. **Fit (0-20):** Builder size (permit_count 3-20=20 "right-size", 20-50=15, 50+=10, <3=5). WSIB-registered=+3.

### Core Logic — Competition Count

- Query `lead_views` for `COUNT(DISTINCT user_id) WHERE lead_key = $key AND trade_slug = $trade AND viewed_at > NOW() - INTERVAL '30 days'`
- **Use `lead_key`, NOT raw `permit_num`** — `lead_key` is the canonical identifier and avoids the per-permit-vs-per-revision contradiction
- Display label is computed CLIENT-SIDE from the user's profile trade ("3 plumbers have seen this lead") so the API response can be edge-cached without per-user variation
- Only count views, not saves — saves are private

### Core Logic — Feed Interleaving (now SQL-side)

- Permit and builder leads are UNIONed and ranked together in the same SQL query (see Implementation §2)
- No application-layer interleaving — the database does it via the unified CTE
- Cursor pagination works because both lead types are in the same sorted result set
- The "every 4th-5th builder card" pattern from the design spec is achieved by the natural relevance ranking, not by hard-coding interleave positions
- Page size: 15 items default

### Outputs
- Ranked list of `LeadFeedItem` objects with all display fields
- Each item includes: relevance_score, 4 pillar sub-scores, display strings
- Permit leads: address, photo URL, timing display, cost tier, opportunity type, competition count
- Builder leads: company name, contact info, active permits nearby, website photo

### Edge Cases
1. **No GPS available:** Fall back to user's saved postal code or ward from profile preferences. Show "Set your location for better results" prompt. Chain: browser geolocation → saved home base → onboarding prompt.
2. **No leads in radius:** Suggest expanding radius. Show nearest lead distance: "Closest lead is 15km away."
3. **Trade not classified for a permit:** Skip that permit for this trade — don't show irrelevant leads.
4. **Builder with no active permits nearby:** Don't show — builder leads only appear when they have active work in the tradesperson's radius.
5. **Newly filed permit with no inspections:** Use heuristic timing with "estimated" confidence label (see `71_lead_timing_engine.md`).
6. **Offline / poor connectivity:** Serve cached results from TanStack Query PersistQueryClient (IndexedDB). Show "Last updated X minutes ago" banner. Detect via `navigator.onLine`.
7. **Zod validation failure:** Return 400 with field-level error messages, NOT generic 500. Example: `{ error: 'Invalid parameters', meta: { issues: [{ path: ['lat'], message: 'Expected number' }] } }`
8. **Rate limit exceeded:** Return 429 with retry-after header. Client displays "Too many requests, please wait" with auto-retry after delay.
9. **API error:** React error boundary at `/app/leads/error.tsx` catches client errors. Wrap individual cards in local `ErrorBoundary` so one bad card doesn't break the feed.
</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `leads.logic.test.ts` — scoring formula for all 4 pillars, edge cases (null cost, no GPS, missing inspections), competition counting, feed interleaving order
- **UI:** `leads.ui.test.tsx` — PermitLeadCard renders all states (with/without cost, with/without builder, timing confidence levels), BuilderLeadCard renders contact buttons, mobile viewport 375px, touch targets >= 44px
- **Infra:** `leads.infra.test.ts` — feed API returns correct structure, view tracking upsert, competition count accuracy, radius filtering, auth enforcement
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/lib/leads/` (scoring, types)
- `src/app/api/leads/` (feed, view routes)
- `src/components/leads/` (LeadFeed, PermitLeadCard, BuilderLeadCard)
- `migrations/067_lead_views.sql`

### Out-of-Scope Files
- `src/lib/classification/` — existing scoring/classification untouched; lead scoring is additive

### Scope Exception — Pipeline Changes Required
The lead feed feature requires ONE new pipeline script:
- `scripts/purge-lead-views.js` — NEW nightly retention cleanup. Deletes rows older than 90 days, runs Firebase Admin SDK reconciliation pass once per week to purge orphaned UIDs from failed deletion webhooks.

Auth changes (in scope, see `13_authentication.md`):
- `src/lib/auth/` middleware extended to wire `verifyIdToken` (currently stubbed) and to expose user profile trade for the trade-slug authorization check on `/api/leads/feed` and `/api/leads/view`

### Cross-Spec Dependencies
- **Relies on:** `10_lead_scoring.md` (base lead_score in permit_trades), `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`, `13_authentication.md`, `46_wsib_enrichment.md`, `53_source_aic_inspections.md`
- **Consumed by:** Future notification system (alert on new high-relevance leads), future claiming/CRM features
</constraints>
