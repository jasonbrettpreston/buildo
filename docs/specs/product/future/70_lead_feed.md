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
| lead_type | VARCHAR(20) | NOT NULL — 'permit' or 'builder' |
| permit_num | VARCHAR(30) | nullable (null for builder leads) |
| revision_num | VARCHAR(10) | nullable |
| entity_id | INTEGER | nullable (null for permit leads) |
| trade_slug | VARCHAR(50) | NOT NULL |
| viewed_at | TIMESTAMPTZ | DEFAULT NOW() |
| saved | BOOLEAN | DEFAULT false |

**Indexes:** `(permit_num, trade_slug)`, `(entity_id, trade_slug)`, `(user_id, viewed_at DESC)`
**Unique:** `(user_id, lead_type, permit_num, revision_num, entity_id, trade_slug)`

### API Endpoints

**`GET /api/leads/feed`** — Personalized lead feed
- **Params:** `lat`, `lng` (required), `trade_slug` (required), `radius_km` (default 10), `page`, `limit`
- **Response:** `{ data: LeadFeedItem[], meta: { total, page, radius_km } }`
- **Logic:** Queries permits + builder entities within radius, scores each with the 4-pillar model, interleaves permit and builder leads, returns sorted by relevance_score DESC

**`POST /api/leads/view`** — Record view or save
- **Body:** `{ permit_num?, revision_num?, entity_id?, trade_slug, action: 'view' | 'save' | 'unsave' }`
- **Response:** `{ success: true, competition_count: number }`

### Implementation

**Scoring engine:** `src/lib/leads/scoring.ts`
- `scorePermitLead(permit, trade_slug, user_lat, user_lng): ScoredPermitLead`
- `scoreBuilderLead(entity, trade_slug, user_lat, user_lng): ScoredBuilderLead`
- Composite score 0-100 from 4 pillars (see §4 Behavioral Contract)

**Types:** `src/lib/leads/types.ts`
- `LeadFeedItem`, `ScoredPermitLead`, `ScoredBuilderLead`, `PermitLeadCard`, `BuilderLeadCard`

**Feed query:** `src/app/api/leads/feed/route.ts`
- Bounding box pre-filter on permits.latitude/longitude
- JOIN permit_trades for trade matching
- LEFT JOIN entities via entity_projects for builder context
- LEFT JOIN neighbourhoods for premium factor
- LEFT JOIN cost_estimates for pre-computed cost tiers
- Application-level scoring on top 50-100 candidates
- Return top 20 sorted by composite relevance_score

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
1. **No GPS available:** Fall back to user's saved postal code or ward from profile preferences. Show "Set your location for better results" prompt.
2. **No leads in radius:** Suggest expanding radius. Show nearest lead distance: "Closest lead is 15km away."
3. **Trade not classified for a permit:** Skip that permit for this trade — don't show irrelevant leads.
4. **Builder with no active permits nearby:** Don't show — builder leads only appear when they have active work in the tradesperson's radius.
5. **Newly filed permit with no inspections:** Use heuristic timing with "estimated" confidence label.
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
