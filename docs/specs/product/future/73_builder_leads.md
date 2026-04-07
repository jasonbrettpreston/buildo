# Builder Leads — Relationship-Based Lead Generation

> **Status: FUTURE BUILD** — Architecture locked, not yet implemented.

<requirements>
## 1. Goal & User Story
Surface active builders/GCs with work near the tradesperson as relationship leads — a more actionable lead type than raw permits because the tradesperson can contact the builder directly. "ABC Construction has 3 active new-build permits within 2km of you. Phone: 416-555-1234." One good builder relationship = steady work for years.
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema
No new tables — builder leads are queried from existing `entities`, `entity_projects`, `permits`, `permit_trades`, and `wsib_registry`.

### Data Quality Filter
Builder leads are only served when the underlying WSIB/entity data meets a quality bar:
```sql
WHERE wsib_registry.is_gta = true
  AND wsib_registry.last_enriched_at IS NOT NULL
  AND wsib_registry.business_size IN ('Small Business', 'Medium Business')  -- explicit allowlist; NULL excluded
  AND wsib_registry.linked_entity_id IS NOT NULL
  AND (wsib_registry.website IS NOT NULL OR wsib_registry.primary_phone IS NOT NULL)
```

**Why `IN (...)` not `!= 'Large Business'`:** The earlier draft used `!= 'Large Business'` which would also EXCLUDE rows where `business_size IS NULL` (because `NULL != 'Large Business'` evaluates to NULL, not TRUE in PostgreSQL). The explicit allowlist is clearer and handles NULL deterministically.

This excludes:
- Non-GTA businesses (V2 plan: replace `is_gta` with proximity-based filter to support multi-region expansion)
- Un-enriched entries (enrichment failed or skipped)
- Conglomerates (Siemens, Cadillac Fairview, etc.)
- Businesses with NULL or other size values (explicit allowlist)
- Entries not linked to a permit-bearing entity
- Entries with no usable contact info

**Multi-WSIB tie-breaker:** When an entity has multiple `wsib_registry` rows passing the filter, group by `entity_id` and select the one with the most recent `last_enriched_at`. Prevents duplicate cards for the same builder.

### API Endpoints
None — builder leads are served through the unified `GET /api/leads/feed` endpoint (see `70_lead_feed.md`).

### Implementation

**Builder lead query:** `src/lib/leads/builder-query.ts`
- `queryBuilderLeads(trade_slug, lat, lng, radius_km): BuilderLeadCandidate[]`

**Query pattern (full scoring in SQL — `ORDER BY relevance_score DESC`):**

```sql
-- Prerequisites (run once in migration):
-- CREATE EXTENSION postgis;
-- ALTER TABLE permits ADD COLUMN location geography(Point, 4326);
-- CREATE INDEX idx_permits_location ON permits USING GIST (location);

-- Step 1: For each builder, find their nearby permits and compute distance ONCE
-- (the original draft used MIN(ST_Distance(...)) which recomputed inside the
-- aggregate, defeating the GIST index advantage).
WITH nearby_permits AS (
  SELECT
    ep.entity_id,
    p.permit_num, p.revision_num, p.status, p.est_const_cost,
    (p.location <-> ST_MakePoint($lng, $lat)::geography) AS distance_m
  FROM permits p
  JOIN entity_projects ep
    ON ep.permit_num = p.permit_num
   AND ep.revision_num = p.revision_num
   AND ep.role = 'Builder'
  JOIN permit_trades pt
    ON pt.permit_num = p.permit_num
   AND pt.revision_num = p.revision_num
   AND pt.is_active = true
  JOIN trades t ON t.id = pt.trade_id AND t.slug = $trade_slug
  WHERE p.status IN ('Permit Issued', 'Inspection')
    AND p.location IS NOT NULL
    AND ST_DWithin(p.location, ST_MakePoint($lng, $lat)::geography, $radius_m)
),
-- Step 2: Aggregate per entity and pick the most recent WSIB row (multi-WSIB tie-breaker)
builder_aggregates AS (
  SELECT
    e.id AS entity_id,
    e.legal_name, e.trade_name, e.entity_type,
    e.primary_phone, e.primary_email, e.website, e.photo_url,
    e.is_wsib_registered,
    -- Most recent WSIB row wins when multiple linked
    (SELECT business_size FROM wsib_registry w
       WHERE w.linked_entity_id = e.id
         AND w.is_gta = true
         AND w.last_enriched_at IS NOT NULL
         AND w.business_size IN ('Small Business', 'Medium Business')
         AND (w.website IS NOT NULL OR w.primary_phone IS NOT NULL)
       ORDER BY w.last_enriched_at DESC LIMIT 1) AS business_size,
    COUNT(np.permit_num) AS active_permits_nearby,
    COUNT(np.permit_num) AS nearby_permit_count,  -- For Fit score: nearby, not total
    MIN(np.distance_m) AS closest_permit_m,
    AVG(np.est_const_cost) FILTER (WHERE np.est_const_cost > 0) AS avg_project_cost
  FROM nearby_permits np
  JOIN entities e ON e.id = np.entity_id
  WHERE EXISTS (
    SELECT 1 FROM wsib_registry w
    WHERE w.linked_entity_id = e.id
      AND w.is_gta = true
      AND w.last_enriched_at IS NOT NULL
      AND w.business_size IN ('Small Business', 'Medium Business')
      AND (w.website IS NOT NULL OR w.primary_phone IS NOT NULL)
  )
  GROUP BY e.id
  HAVING COUNT(np.permit_num) >= 1
),
-- Step 3: Compute the FULL 4-pillar relevance score in SQL, not in app
scored AS (
  SELECT *,
    -- Proximity (0-30) — based on closest active permit
    CASE
      WHEN closest_permit_m < 500 THEN 30
      WHEN closest_permit_m < 1000 THEN 25
      WHEN closest_permit_m < 2000 THEN 20
      WHEN closest_permit_m < 5000 THEN 15
      WHEN closest_permit_m < 10000 THEN 10
      WHEN closest_permit_m < 20000 THEN 5
      ELSE 0
    END AS proximity_score,
    -- Activity (0-30) — count of nearby permits matching this trade
    CASE
      WHEN active_permits_nearby >= 5 THEN 30
      WHEN active_permits_nearby >= 3 THEN 25
      WHEN active_permits_nearby = 2 THEN 20
      ELSE 15
    END AS activity_score,
    -- Contact (0-20) — better contact info = better lead
    CASE
      WHEN website IS NOT NULL AND primary_phone IS NOT NULL THEN 20
      WHEN website IS NOT NULL OR primary_phone IS NOT NULL THEN 15
      WHEN primary_email IS NOT NULL THEN 10
      ELSE 0
    END AS contact_score,
    -- Fit (0-20) — uses NEARBY permit count, not total. Larger nearby presence
    -- = more steady work potential, matching the user story.
    CASE
      WHEN nearby_permit_count >= 5 THEN 20  -- very active locally = best fit
      WHEN nearby_permit_count >= 3 THEN 17
      WHEN nearby_permit_count = 2 THEN 14
      ELSE 10  -- single nearby permit, still potential
    END
    + CASE WHEN is_wsib_registered THEN 3 ELSE 0 END  -- WSIB bonus
    AS fit_score
  FROM builder_aggregates
)
SELECT *,
  (proximity_score + activity_score + contact_score + fit_score) AS relevance_score
FROM scored
ORDER BY relevance_score DESC, closest_permit_m ASC
LIMIT 20;
```

**Why this query structure:**
- **`<->` operator computes distance ONCE** in `nearby_permits` CTE — the alias `distance_m` is reused everywhere downstream. Earlier draft had `MIN(ST_Distance(...))` which forced recomputation inside the aggregate.
- **Full 4-pillar score in SQL** — earlier draft only did `ORDER BY active_permits_nearby DESC, closest_permit_m ASC`, which meant a high-relevance builder with 1 nearby permit could be missed in favor of a low-relevance builder with 2. Now `ORDER BY relevance_score DESC` returns the actual top 20.
- **Multi-WSIB tie-breaker** via `ORDER BY last_enriched_at DESC LIMIT 1` in the business_size subquery
- **Fit score uses NEARBY count, not total** — matches user story ("steady work for years" comes from a builder doing lots of work in YOUR area, not nationwide)

**Why PostGIS:** Raw Haversine trigonometry across 242K+ rows would bottleneck the database. PostGIS `ST_DWithin` uses the GIST spatial index for O(log n) radius lookups.

**Builder lead scoring:** All four pillars (proximity, activity, contact, fit) are computed in the SQL CTE above. The application does NOT re-score — it just consumes the rows in order.

**Builder card photo (SSRF-safe pipeline approach):**

**CRITICAL SECURITY:** Do NOT fetch builder website URLs from the API server on user request. That creates an SSRF vulnerability — a malicious actor could register an entity with a website URL pointing to internal network IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x) and force the server to probe internal services.

**Correct approach:**
1. **Pre-fetch in pipeline:** `scripts/enrich-wsib.js` (extended) fetches OG image / favicon during the enrichment run. The pipeline runs in a controlled environment, not on user request.
2. **Resolve hostname BEFORE fetching:** DNS-resolve the website hostname to its IP, reject any IP in RFC1918 (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`), loopback (`127/8`), or multicast ranges. Only proceed if the IP is public.
3. **Pin the IP at fetch time (DNS rebinding protection):** A naive resolve-then-fetch is vulnerable to DNS rebinding — the attacker's DNS server can return a public IP for the validation query and a private IP for the actual fetch. Mitigation: use a custom HTTP agent that pins the validated IP for the fetch connection (`net.connect({ host: validatedIp, ... })` with the original hostname in the `Host` header for SNI). The `unfurl.js` call must use this pinned-IP agent.
4. **Sandbox the fetch:** Max response size 1MB, 5-second timeout, no redirects to other hosts (validate redirect targets with the same IP-pinning logic).
5. **Store pre-validated URL:** New column `entities.photo_url VARCHAR(500)` stores the final CDN-safe image URL. Also `entities.photo_validated_at TIMESTAMPTZ`.
6. **API serves pre-validated URLs only:** The feed API returns `photo_url` directly from the database — no runtime fetching.

**CSP allowlist for builder photos:** The earlier draft's CSP `img-src` only listed Google domains (for Street View). Builder photos come from arbitrary websites, so they would be blocked. Two options:
- **Option A (recommended):** Proxy all builder images through a Cloudinary/Imgix CDN with signed URLs. The database stores the CDN URL. The CSP only allows the CDN domain. The pipeline uploads validated images to the CDN at enrichment time.
- **Option B (simpler):** Drop the photo feature entirely and use 2-letter initial avatars only.

**For V1: Option B.** No builder photos. Initial-letter avatars on amber background only. Defer the CDN proxy to V2 when the feature is more proven.

**Phone display privacy note:** WSIB phone numbers may be personal cell numbers (sole proprietors). The tap-to-call button could direct user calls to private lines. **Acceptable trade-off for V1** — the data is from a public registry. V2 should add an opt-out mechanism for businesses to mark their listing as "do not contact directly."

**Migration needed:**
```sql
-- UP
ALTER TABLE entities ADD COLUMN photo_url VARCHAR(500);
ALTER TABLE entities ADD COLUMN photo_validated_at TIMESTAMPTZ;

-- Constraint: must be HTTPS URL (prevents http:// or javascript: etc.)
ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https 
  CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');

-- DOWN
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at;
ALTER TABLE entities DROP COLUMN IF EXISTS photo_url;
```

**Content Security Policy (defense in depth):**
Add to `next.config.js`:
```js
{
  key: 'Content-Security-Policy',
  value: "img-src 'self' data: https://*.googleapis.com https://*.ggpht.com https://*.gstatic.com https:"
}
```

This limits `<img src>` to HTTPS origins only, defending against a compromised pipeline writing a malicious URL. Google Street View (`*.googleapis.com`, `*.ggpht.com`, `*.gstatic.com`) is explicitly allowed.

**Fallback chain at display time (client-side only):**
1. `entities.photo_url` from database (pipeline-validated)
2. If null: 2-letter initial avatar rendered with amber background and DM Sans 700

**Reference library:** [`unfurl.js`](https://github.com/jacktuck/unfurl) — safely extracts OG metadata with timeout and size limits. Use with custom hostname validation.

**Contact display:**
- Phone: displayed as tap-to-call link on mobile
- Email: displayed as mailto link
- Website: displayed as "Visit Website" button
- All contact info comes from WSIB enrichment (public business data)

</architecture>

---

<security>
## 3. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Cannot access |
| Authenticated | See builder leads in feed; contact info is public business data |
| Admin | N/A |

- Contact info (phone, email, website) is from WSIB public registry enrichment — not private data
- Builder leads are not exclusive — all tradespeople of the same trade see the same builders
</security>

---

<behavior>
## 4. Behavioral Contract

### Inputs
- User's trade_slug, lat/lng, radius
- WSIB registry + entity + permit data (pre-joined)

### Core Logic
1. Query entities linked to WSIB with quality filter (see §2)
2. JOIN to their active permits within the tradesperson's radius
3. Filter to permits that need the tradesperson's trade (via permit_trades)
4. Group by entity — one card per builder, showing aggregate stats
5. Score using 4-factor builder lead formula
6. Return top 10-20 builder leads for interleaving into the feed

### Outputs
```typescript
interface BuilderLeadCard {
  lead_type: 'builder';
  entity_id: number;
  builder_name: string;
  business_size: string;
  active_permits_nearby: number;
  matching_trade_permits: number;
  closest_permit_m: number;
  avg_project_cost: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  has_contact: boolean;
  photo_url: string | null;
  relevance_score: number;
  wsib_registered: boolean;
  display_subtitle: string;  // e.g., "Mid-size builder · 15 permits/year · 3 active near you"
}
```

### Edge Cases
1. **Builder with permits nearby but none needing this trade:** Exclude — only show relevant builders.
2. **Builder entity linked to WSIB but enrichment returned garbage:** Quality filter catches this (requires `last_enriched_at IS NOT NULL` and at least one contact method).
3. **Multiple WSIB entries for same entity:** Use the one with `linked_entity_id` set; dedup by entity_id in GROUP BY.
4. **Builder phone is a personal cell vs. business line:** Cannot distinguish — show as-is. WSIB enrichment validation (websiteMatchesCompany) provides reasonable quality.
5. **Builder's website is down:** Photo fetch fails gracefully to initial letter avatar. Contact info still shown.
</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `builder-leads.logic.test.ts` — scoring formula, quality filter logic, data sufficiency checks, dedup by entity, display string generation
- **UI:** `builder-leads.ui.test.tsx` — BuilderLeadCard renders all contact states (phone+web, phone only, email only), tap-to-call on mobile, photo fallback to initial avatar, 375px viewport
- **Infra:** `builder-leads.infra.test.ts` — query returns correct structure, quality filter excludes garbage entries, WSIB linkage join correctness
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/lib/leads/builder-query.ts`
- `src/lib/leads/scoring.ts` (builder scoring section)
- `src/components/leads/BuilderLeadCard.tsx`

### Out-of-Scope Files
- `scripts/link-wsib.js` — entity linkage unchanged
- `src/lib/builders/` — existing builder logic untouched

### Scope Exception — Pipeline Changes Required
- `scripts/enrich-wsib.js` (V2 only) — extension to fetch validated builder photos for the Cloudinary CDN proxy. **NOT in V1.** V1 uses initial-letter avatars only and does not modify this script.

### Cross-Spec Dependencies
- **Relies on:** `46_wsib_enrichment.md` (contact data quality), `37_entity_model.md` (entity-permit linkage), `52_source_wsib.md` (WSIB registry data)
- **Consumed by:** `70_lead_feed.md` (interleaved into unified feed)
</constraints>
