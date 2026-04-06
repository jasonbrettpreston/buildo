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
- `(lead_key, trade_slug)` — for competition count queries (hot path)
- `(permit_num, trade_slug)` — for permit-specific views
- `(entity_id, trade_slug)` — for builder-specific views
- `(user_id, viewed_at DESC)` — for user history

**Unique:** `(user_id, lead_key, trade_slug)` — uses computed lead_key to avoid nullable composite key

**Why `lead_key`:** Composite unique constraints with multiple nullable columns are awkward in PostgreSQL (NULLs are not equal). The `lead_key` computed column gives us a single non-null identifier for both lead types.

### API Endpoints

**`GET /api/leads/feed`** — Personalized lead feed
- **Params:** `lat`, `lng` (required), `trade_slug` (required), `radius_km` (default 10), `page`, `limit`
- **Response envelope:** `{ data: LeadFeedItem[], error: null, meta: { total, page, radius_km } }` per §4.4
- **Error responses:**
  - `400 Bad Request` — Zod validation failure, returns `{ data: null, error: 'Invalid parameters', meta: { issues } }` with field-level error messages
  - `401 Unauthorized` — missing/invalid session
  - `429 Too Many Requests` — rate limit exceeded (30/min per user)
  - `500 Internal Server Error` — generic fallback with error digest
- **Logic:** **All scoring happens in PostgreSQL, NOT Node memory.** Single CTE query using PostGIS `ST_DWithin` for radius pre-filter + `<->` KNN operator for proximity ordering. 4-pillar scoring computed via SQL `CASE` expressions and window functions.
- **Rate limiting:** 30 requests per 60 seconds per `user_id`, enforced via `@upstash/ratelimit` middleware
- **Observability:** Structured log per request: `{user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms}`

**`POST /api/leads/view`** — Record view or save
- **Body:** `{ permit_num?, revision_num?, entity_id?, trade_slug, action: 'view' | 'save' | 'unsave' }`
- **Response envelope:** `{ data: { competition_count: number }, error: null, meta: null }`
- **Rate limiting:** 60 requests per 60 seconds per user (higher than feed since save/unsave can be rapid)
- **Logic:** Computes `lead_key` from input, upserts to `lead_views`, returns updated competition count

### Implementation

**Scoring engine:** `src/lib/leads/scoring.ts`
- `scorePermitLead(permit, trade_slug, user_lat, user_lng): ScoredPermitLead`
- `scoreBuilderLead(entity, trade_slug, user_lat, user_lng): ScoredBuilderLead`
- Composite score 0-100 from 4 pillars (see §4 Behavioral Contract)

**Types:** `src/lib/leads/types.ts`
- `LeadFeedItem`, `ScoredPermitLead`, `ScoredBuilderLead`, `PermitLeadCard`, `BuilderLeadCard`

**Feed query:** `src/app/api/leads/feed/route.ts`
- Thin route handler — delegates to `src/features/leads/lib/get-lead-feed.ts`
- All scoring in a single PostgreSQL CTE query:
  ```sql
  WITH candidates AS (
    SELECT p.*, pt.trade_slug, pt.confidence, pt.phase,
      ce.estimated_cost, ce.cost_tier,
      ST_Distance(p.location, ST_MakePoint($lng, $lat)::geography) AS distance_m
    FROM permits p
    JOIN permit_trades pt USING (permit_num, revision_num)
    LEFT JOIN cost_estimates ce USING (permit_num, revision_num)
    LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
    WHERE pt.trade_slug = $trade_slug AND pt.is_active = true
      AND ST_DWithin(p.location, ST_MakePoint($lng, $lat)::geography, $radius_m)
      AND p.status NOT IN ('Cancelled', 'Revoked', 'Closed')
      AND pt.confidence >= 0.5
    ORDER BY p.location <-> ST_MakePoint($lng, $lat)::geography
    LIMIT 200
  ),
  scored AS (
    SELECT *,
      -- Proximity 0-30
      CASE WHEN distance_m < 500 THEN 30
           WHEN distance_m < 1000 THEN 25
           WHEN distance_m < 2000 THEN 20
           WHEN distance_m < 5000 THEN 15
           WHEN distance_m < 10000 THEN 10
           WHEN distance_m < 20000 THEN 5 ELSE 0 END AS proximity_score,
      -- Timing, Value, Opportunity computed similarly
      ...
    FROM candidates
  )
  SELECT *, (proximity_score + timing_score + value_score + opportunity_score) AS relevance_score
  FROM scored
  ORDER BY relevance_score DESC
  LIMIT $limit OFFSET $offset;
  ```
- Builder leads queried separately (see `73_builder_leads.md`) with same PostGIS approach
- API layer interleaves permit + builder leads from two queries before returning

**View tracking:** `src/app/api/leads/view/route.ts`
- Upsert to lead_views using `lead_key` computed column
- Return updated competition_count for the lead+trade combination

**View tracking:** `src/app/api/leads/view/route.ts`
- Upsert to lead_views table
- Return updated competition_count for the permit/trade combination

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

- Query `lead_views` for `COUNT(DISTINCT user_id) WHERE permit_num = X AND trade_slug = Y AND viewed_at > NOW() - INTERVAL '30 days'`
- Display as "N [trade]s have seen this lead"
- Only count views, not saves — saves are private

### Core Logic — Feed Interleaving

- Fetch top 30 permit leads + top 10 builder leads within radius
- Sort all by composite relevance_score DESC
- Alternate: every 4th-5th item is a builder lead (if available)
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
- `scripts/` — no pipeline changes; this is a frontend/API feature
- `src/lib/classification/` — existing scoring/classification untouched; lead scoring is additive
- `src/lib/auth/` — auth system unchanged; uses existing Firebase session

### Cross-Spec Dependencies
- **Relies on:** `10_lead_scoring.md` (base lead_score in permit_trades), `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`, `13_authentication.md`, `46_wsib_enrichment.md`, `53_source_aic_inspections.md`
- **Consumed by:** Future notification system (alert on new high-relevance leads), future claiming/CRM features
</constraints>
