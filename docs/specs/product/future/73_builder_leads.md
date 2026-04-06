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
  AND wsib_registry.business_size != 'Large Business'
  AND wsib_registry.linked_entity_id IS NOT NULL
  AND (wsib_registry.website IS NOT NULL OR wsib_registry.primary_phone IS NOT NULL)
```

This excludes:
- Non-GTA businesses
- Un-enriched entries (enrichment failed or skipped)
- Conglomerates (Siemens, Cadillac Fairview, etc.)
- Entries not linked to a permit-bearing entity
- Entries with no usable contact info

### API Endpoints
None — builder leads are served through the unified `GET /api/leads/feed` endpoint (see `70_lead_feed.md`).

### Implementation

**Builder lead query:** `src/lib/leads/builder-query.ts`
- `queryBuilderLeads(trade_slug, lat, lng, radius_km): BuilderLeadCandidate[]`

**Query pattern:**
```sql
SELECT
  e.id, e.legal_name, e.trade_name, e.entity_type,
  e.primary_phone, e.primary_email, e.website,
  e.permit_count, e.is_wsib_registered,
  w.business_size, w.naics_description,
  COUNT(p.permit_num) FILTER (WHERE p.status IN ('Permit Issued','Inspection')) as active_permits_nearby,
  COUNT(DISTINCT t.slug) FILTER (WHERE t.slug = $trade_slug) as matching_trade_permits,
  MIN(haversine(lat, lng, p.latitude, p.longitude)) as closest_permit_m,
  AVG(p.est_const_cost) FILTER (WHERE p.est_const_cost > 0) as avg_project_cost

FROM entities e
JOIN wsib_registry w ON w.linked_entity_id = e.id
JOIN entity_projects ep ON ep.entity_id = e.id AND ep.role = 'Builder'
JOIN permits p ON p.permit_num = ep.permit_num AND p.revision_num = ep.revision_num
JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num AND pt.is_active = true
JOIN trades t ON t.id = pt.trade_id

WHERE p.status IN ('Permit Issued', 'Inspection')
  AND p.latitude IS NOT NULL
  AND t.slug = $trade_slug
  AND w.is_gta = true
  AND w.last_enriched_at IS NOT NULL
  AND w.business_size != 'Large Business'
  AND (w.website IS NOT NULL OR w.primary_phone IS NOT NULL)
  -- bounding box pre-filter
  AND p.latitude BETWEEN ($lat - $radius_deg) AND ($lat + $radius_deg)
  AND p.longitude BETWEEN ($lng - $radius_deg) AND ($lng + $radius_deg)

GROUP BY e.id, w.id
HAVING COUNT(p.permit_num) FILTER (WHERE p.status IN ('Permit Issued','Inspection')) >= 1
ORDER BY active_permits_nearby DESC, closest_permit_m ASC
LIMIT 20
```

**Builder lead scoring:** `src/lib/leads/scoring.ts` (builderLeadScore function)
1. Proximity (0-30): Distance to closest active permit
2. Activity (0-30): Active permits nearby needing this trade. 5+=30, 3-4=25, 2=20, 1=15
3. Contact (0-20): phone+website=20, phone OR website=15, email only=10
4. Fit (0-20): permit_count 3-20=20, 20-50=15, 50+=10, <3=5. WSIB-registered=+3

**Builder card photo:**
- Attempt OG image from builder's website URL: fetch `<meta property="og:image">` from cached page
- Fallback to favicon: `https://{domain}/favicon.ico`
- Final fallback: initial letter avatar (e.g., "A" for ABC Construction)
- Cache photo URLs in entity record to avoid repeated fetches

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
- `scripts/enrich-wsib.js` — enrichment pipeline unchanged
- `scripts/link-wsib.js` — entity linkage unchanged
- `src/lib/builders/` — existing builder logic untouched

### Cross-Spec Dependencies
- **Relies on:** `46_wsib_enrichment.md` (contact data quality), `37_entity_model.md` (entity-permit linkage), `52_source_wsib.md` (WSIB registry data)
- **Consumed by:** `70_lead_feed.md` (interleaved into unified feed)
</constraints>
