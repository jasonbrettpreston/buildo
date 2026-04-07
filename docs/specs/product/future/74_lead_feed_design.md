# Lead Feed — Design Specification

> **Status: FUTURE BUILD** — Design locked, not yet implemented.
> **Companion Research:** `docs/reports/competitive_lead_gen_ux_research.md` (Part 1: competitor analysis, Part 2: Airbnb/Zillow implementation patterns)
> **React Best Practices:** `docs/reports/react_best_practices_deep_dive.md`
> **Architecture Spec:** `70_lead_feed.md`, `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`
> **Implementation Guide:** `75_lead_feed_implementation_guide.md` (component-by-component code)

---

## 1. Design Direction: Industrial Utilitarian

**User context:** A tradesperson on a construction site during lunch break. Dirty hands, outdoor glare, 2-3 seconds per card to decide.

**Aesthetic:** Well-organized clipboard meets data terminal. High contrast, no decoration, every pixel earns its place. Construction signage color language. Professional data density — this is a tool, not a lifestyle app.

**Differentiation:** Dark mode + monospace data + stage-based timing badges. No competitor in the lead gen space does any of these three. Together they create a genuinely distinct product identity.

**Competitive gap exploited:** All 8 analyzed competitors use light-mode, low-density, consumer-oriented layouts. Buildo targets professionals who prefer Bloomberg-terminal efficiency over Pinterest-style browsing.

---

## 2. Typography

```css
--font-display: 'DM Sans', system-ui, sans-serif;
--font-data: 'IBM Plex Mono', 'SF Mono', 'Consolas', monospace;
```

**DM Sans (700)** for display/headers — geometric, sturdy, reads clean at small sizes in bright light. Feels like equipment labels.

**IBM Plex Mono (400/500)** for all numeric data — costs, distances, scores, permit numbers, competition counts. Monospace communicates "real data" and makes numbers scan faster. Tradespeople are used to reading spec sheets and measurements.

**Type scale:**
| Element | Font | Size | Weight |
|---------|------|------|--------|
| Card title (address) | DM Sans | 16px | 700 |
| Timing badge text | DM Sans | 14px | 600 |
| Cost / distance / score | IBM Plex Mono | 14px | 500 |
| Permit type / work | DM Sans | 13px | 400 |
| Metadata (competition, tags) | IBM Plex Mono | 12px | 400 |
| Action buttons | DM Sans | 14px | 600 |

---

## 3. Color System

Dark mode optimized for outdoor readability. Not pure black (OLED) and not full white (washes out in sun). High contrast with semantic color mapping.

### Surfaces
```css
--bg-feed: #1C1F26;            /* dark charcoal feed background */
--bg-card-permit: #272B33;     /* permit card */
--bg-card-builder: #1A2332;    /* navy-tinted builder card — visually distinct */
--bg-card-pressed: #2F3440;    /* active/pressed state */
--bg-elevated: #31363F;        /* modals, tooltips, expanded sections */
```

### Text (WCAG AA verified — all combinations pass 4.5:1 minimum)
```css
--text-primary: #F0F0F0;       /* near-white. On bg-card-permit (#272B33): 13.3:1 ✓ */
--text-secondary: #B5B9C0;     /* lighter than original #9CA3AF for AA. On #272B33: 8.4:1 ✓ */
--text-tertiary: #9CA3AF;      /* metadata. On #272B33: 5.6:1 ✓ (was #6B7280 = 2.95:1 FAIL) */
```

**WCAG audit (April 2026):** The earlier draft used `--text-tertiary: #6B7280` which only achieved 2.95:1 contrast on `--bg-card-permit: #272B33` — failing WCAG AA (4.5:1 required for normal text). All three text colors above are verified passing AA. The metadata layer (`--text-tertiary`) was upgraded from #6B7280 to #9CA3AF, and the secondary layer (`--text-secondary`) was upgraded from #9CA3AF to #B5B9C0 to maintain the visual hierarchy.

### Timing Signal Badges (primary visual differentiator + colorblind-safe icons)
```css
--timing-now: #F59E0B;         /* amber — trade needed NOW or within 2 weeks */
--timing-soon: #10B981;        /* green — 2-8 weeks out */
--timing-upcoming: #3B82F6;    /* blue — 1-6 months */
--timing-distant: #6B7280;     /* gray — 6+ months in future */
--timing-past: #DC2626;        /* red-tinted — trade window has passed (NEW) */
```

**"Past window" vs "distant future":** Earlier draft used the same gray for both. Now separated — past is `--timing-past` (red-tinted) so users can immediately see leads where the window has passed. Different signal entirely.

**Colorblind safety:** Amber and green can be indistinguishable to deuteranopes (~6% of men). Mitigation: every timing badge MUST include an icon alongside the color, NEVER color alone:
- NOW: ⚡ (lightning) + amber
- Soon: ⏱ (clock) + green
- Upcoming: 📅 (calendar) + blue
- Distant: ⏳ (hourglass) + gray
- Past: ✕ (cross) + red

These icons make the timing state perceivable without color discrimination.

**Confidence indicator (no longer just border style):** The earlier draft used solid vs. dashed left border to indicate inspection-confirmed vs. heuristic. **Too subtle for outdoor glare.** Replaced with explicit `est.` text label that always appears on medium/low confidence badges (not just dashed border):
- High confidence: solid 4px left border, no extra text
- Medium/low confidence: dashed 4px left border + "est." text label after the timing string

### Opportunity Type
```css
--opp-homeowner: #F59E0B;      /* amber — highest win chance */
--opp-newbuild: #10B981;       /* green — needs full trade lineup */
--opp-builder-led: #6B7280;    /* gray-muted — established builder */
/* No badge when builder unknown (95% of permits) — honest about data gaps */
```

### Cost Tier (subtle gradient — does NOT compete with timing badge)
```css
--cost-small: #9CA3AF;         /* gray — meets WCAG AA */
--cost-medium: #B5B9C0;        /* slightly brighter gray */
--cost-large: #D4D8DE;         /* near-white but not pure */
--cost-major: #E8B85B;         /* muted amber — NOT the same as --amber-hardhat */
--cost-mega: #E87A5B;          /* muted orange-red */
```

**Visual hierarchy fix:** The earlier draft used `--amber-hardhat` (#F59E0B) and `--red-stop` (#EF4444) for cost-major and cost-mega, which drew the eye BEFORE the timing badge — disrupting the intended scan order. Cost is now a more muted gradient that supports rather than competes with the timing badge as the primary signal. The full `amber-hardhat` and `red-stop` colors remain reserved for the timing badge and action buttons, where attention IS the goal.

### Actions
```css
--action-primary: #F59E0B;     /* amber — construction industry color (hard hats, caution tape) */
--action-secondary: #3B82F6;   /* blue — directions, website, info */
--action-bg: rgba(245, 158, 11, 0.1);  /* subtle amber tint for button backgrounds */
```

**Why amber as primary action:** It's the color of construction. Reads as "action" in this context more naturally than blue or green. Excellent contrast on dark backgrounds in bright light.

### Semantic Token Names (inspired by Procore's construction-material convention)
```css
--gray-concrete: #6B7280;
--gray-steel: #9CA3AF;
--amber-hardhat: #F59E0B;
--green-safety: #10B981;
--blue-blueprint: #3B82F6;
--red-stop: #EF4444;
```

---

## 4. Card Layouts

### Design Principle: Progressive Disclosure

Competitive research showed our current PermitCard has 10-12 visible data points. Competitors average 3-5. The revised design uses **collapsed cards** showing 5-6 key signals, with **tap to expand** for full details.

### 4a. Permit Lead Card — Collapsed (Default)

```
┌─╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐
┊                                         │
┊  ┌──────┐  47 Maple Ave               │  ← 80x60 thumbnail + address (DM Sans 700)
┊  │Street│  Scarborough Village         │  ← neighbourhood name (secondary)
┊  │ View │  450m                        │  ← distance (monospace, amber if <1km)
┊  └──────┘                              │
┊                                         │
┊  ⏱ Plumbing needed in ~2 weeks    87  │  ← TIMING BADGE (full width) + score
┊  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │  ← solid = confirmed, dashed = estimated
┊                                         │
┊  $1.2M–$1.8M est. · Large Job         │  ← cost (monospace) + tier
┊  New Single-Family Home                │  ← permit type
┊  🏠 Likely homeowner · 👁 3            │  ← opportunity + competition (compact)
┊                                         │
┊  [ ♡ Save ]              [ ↗ Directions ]│  ← action row
┊                                         │
└──────────────────────────────────────────┘
```

**Left border:** 4px solid in timing color (amber/green/blue/gray). Dashed if heuristic estimate.

**Thumbnail:** 80x60px Google Street View image, rounded 6px corners. Falls back to neighbourhood map outline if no geocode. Positioned left of address for horizontal scanning.

**Street View cost and caching (Google TOS compliant + multi-layer cost cap):**
- Street View Static API costs **$7 per 1,000 requests** (as of 2026).
- Google TOS **prohibits caching the actual image bytes**, but **allows caching `pano_id`** (the panorama identifier).
- **Strategy:** Build a permit→pano_id lookup cache in a new table `permit_pano_cache(permit_num, revision_num, pano_id, fetched_at)`. Populate lazily on first feed render or in a pipeline step. The image URL is constructed client-side from `pano_id`, so the browser caches the HTTP response normally per session.
- **Browser cache only:** No service worker storage of images (would violate TOS for offline storage). The browser's built-in HTTP cache is allowed; an HTTPS image fetched once per session is permissible. Document this clearly in the implementation guide.
- **Lazy load:** Only render Street View images for cards currently in viewport (via `IntersectionObserver`). Prevents charging for cards users never scroll to.
- **Multi-layer cost ceiling (cannot scale linearly to bankruptcy):**
  - **Per-user daily cap:** 500 image requests/day per user (bot detection trigger)
  - **Per-IP daily cap:** 1,000 image requests/day per IP (catches multi-account abuse from a single source)
  - **Per-region hourly circuit breaker:** If aggregate requests exceed $100/hour for any city, the API returns placeholder tiles for all subsequent requests until the next hour. Hard ceiling = $2,400/day per region.
  - **Global daily kill switch:** A feature flag (`feature_streetview_enabled`) can disable Street View entirely without a deploy. Falls back to neighbourhood map outline + initial-letter avatars for permit cards.
- **Cost projections with caps:**
  - 1,000 active users × 50 unique panos/day = 50K requests/day = ~$10/day = **~$300/month**
  - At 100,000 users without caps = ~$30,000/month (catastrophic)
  - With caps: hard ceiling **$2,400/day = ~$72,000/month maximum** before circuit breaker forces fallback
  - In practice the per-user and per-IP caps keep cost to ~$300-$3,000/month at any user scale. The circuit breaker is the safety net for unforeseen abuse patterns.

**Visual hierarchy (top to bottom, 2-3 second scan):**
1. **Address + thumbnail + distance** — "Where is this?" (0.5s)
2. **Timing badge** — "Do I need to act?" (0.5s)
3. **Cost + type** — "Is it worth my time?" (0.5s)
4. **Opportunity + competition** — "What are my chances?" (0.5s)
5. **Actions** — "What do I do?" (tap)

**Card height collapsed:** ~160px. Fits 3-4 cards on a 375px screen without scrolling.

### 4b. Permit Lead Card — Expanded (Tap to reveal)

```
┌─╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐
┊  [Full-width Street View photo 16:9]    │  ← expands from thumbnail
┊                                         │
┊  47 Maple Ave, Scarborough Village     │
┊  Ward 25 · Permit #24 123456 BLD      │
┊                                         │
┊  ⏱ Plumbing needed in ~2 weeks    87  │
┊  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
┊  Framing inspection passed Mar 15      │  ← stage detail (when expanded)
┊  Confidence: High (inspection data)    │
┊                                         │
┊  $1.2M–$1.8M est. · Large Job         │
┊  ⭐ Premium neighbourhood ($180K avg)  │  ← premium indicator
┊  New Single-Family Home · New Building │
┊                                         │
┊  Scope: pool · underpinning · 2-storey │  ← scope tags
┊  Complexity: 72/100                    │
┊                                         │
┊  🏠 Likely homeowner                   │
┊  👁 3 plumbers have seen this lead     │  ← "plumbers" is rendered CLIENT-SIDE from user.profile.trade. API returns just `competition_count: 3` so the response can be edge-cached.
┊                                         │
┊  Description:                          │
┊  "Construct new 2-storey SFD with      │  ← first 3 lines of permit description
┊   attached garage, pool, and..."       │
┊                                         │
┊  [ ♡ Save ]              [ ↗ Directions ]│
└──────────────────────────────────────────┘
```

Expansion is animated: card grows vertically, thumbnail expands to full-width photo, additional fields fade in (150ms).

### 4c. Builder Lead Card

```
┌──╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐  ← amber left border (3px)
│                                          │
│  ┌────┐  ABC Construction               │  ← avatar (OG image or 2-letter initial)
│  │ AB │  Mid-size · WSIB ✓              │  ← size + WSIB green checkmark pill
│  └────┘                                  │
│                                          │
│  🏗 3 active permits within 2km         │  ← key stat (DM Sans 600)
│     Closest: 800m · Avg: $1.4M          │  ← secondary stats (monospace)
│                                          │
│  [ 📞 Call ]   [ 🌐 Website ]   [ ♡ ]  │  ← actions, Call is amber primary
│                                          │
└──────────────────────────────────────────┘
```

**Visual differentiation from permit cards:**
- **Navy-tinted background** (#1A2332) vs. charcoal (#272B33)
- **Amber left border** (solid 3px) — permit cards use timing-colored left border
- **No photo header** — avatar + company info instead
- **Compact:** ~120px height. ~60% of a permit card.
- **Contact actions prominent** — Call button is primary CTA with amber background

**Avatar:** 48x48px rounded-square. OG image from website → favicon fallback → 2-letter initial on amber background (DM Sans 700).

---

## 5. Feed Layout

### Header (Sticky)
```
┌──────────────────────────────────────────┐
│  📍 Scarborough · 10km        47 leads  │  ← sticky, blur bg
│  [Change location]                       │
└──────────────────────────────────────────┘
```

Semi-transparent dark background with `backdrop-filter: blur(8px)`. Tap "Change location" to adjust radius or set home base.

### Feed Structure
```
[Sticky Header]
[Permit Card — highest score]
[Permit Card]
[Permit Card]
[Permit Card]
[Builder Card — interleaved every 4th-5th position]
[Permit Card]
[Permit Card]
[Permit Card]
[Permit Card]
[Builder Card]
...
[Skeleton cards — infinite scroll loading]
```

**Card spacing:** 8px gap between cards. 0px horizontal margin (edge-to-edge cards for maximum width on 375px).

**Infinite scroll:** Load 15 items initially, fetch next 15 when scrolled near bottom. Skeleton placeholder cards match card proportions with pulsing dark gray blocks.

**Pull-to-refresh:** Native-feel rubber-band pull. Amber spinner dot. "Updating leads..." text.

**Builder card insertion:** Every 4th-5th position if available. Never two builder cards in a row. If no builder leads in radius, feed is all permit cards.

### View Toggle (V2)
```
[ ▦ Cards ]  [ ≡ List ]
```
Compact list view shows one line per permit: `450m · $1.2M · New SFD · ⏱ 2wks · 87`. For power users scanning 50+ leads.

---

## 6. Badge System

| Signal | Visual Treatment | Condition |
|--------|-----------------|-----------|
| **Timing — NOW** | Amber bg pill, white text, solid 4px left border | Trade needed within 2 weeks |
| **Timing — Soon** | Green bg pill, white text, solid left border | 2-8 weeks |
| **Timing — Upcoming** | Blue bg pill, white text, solid or dashed border | 1-6 months |
| **Timing — Distant** | Gray bg pill, gray text, dashed left border | 6+ months |
| **Timing — Estimated** | Dashed left border (any color) | Heuristic, not inspection-confirmed |
| **Homeowner** | Amber outline pill, house icon | Permit type signals homeowner-filed |
| **New Build** | Green outline pill | New construction |
| **Builder-led** | Gray text, no pill | Known builder, show name |
| **Unknown builder** | No badge | 95% of permits — be honest, don't guess |
| **Premium neighbourhood** | Star icon + "Premium" text, amber | avg_household_income > $150K |
| **WSIB registered** | Green checkmark pill | Builder cards only |
| **Competition** | Eye icon + count, tertiary gray, monospace | Always shown when > 0 |
| **Cost — Small** | Gray text, no emphasis | < $100K |
| **Cost — Medium** | Default text weight | $100K–$500K |
| **Cost — Large** | White text, bold | $500K–$2M |
| **Cost — Major** | Amber text, bold | $2M–$10M |
| **Cost — Mega** | Red text, bold | $10M+ |
| **Score** | Circle, monospace number, bg tinted by value | 0-100, brighter = higher |

---

## 7. Empty & Error States

### No leads in radius
```
┌──────────────────────────────────────────┐
│                                          │
│          🔍                              │
│    No leads within 10km                 │
│    Closest lead is 15km away            │
│                                          │
│    [ Expand to 20km ]                   │
│                                          │
└──────────────────────────────────────────┘
```
Dark card on dark bg. Subtle amber accent on the CTA button.

### No GPS / location unavailable
```
┌──────────────────────────────────────────┐
│                                          │
│          📍                              │
│    Location needed for leads            │
│    Enable GPS or set your               │
│    home base in settings                │
│                                          │
│    [ Enable Location ]  [ Set Base ]    │
│                                          │
└──────────────────────────────────────────┘
```

### No leads matching filters (NEW state)
```
┌──────────────────────────────────────────┐
│                                          │
│          🎯                              │
│    No leads match your filters          │
│    Try removing the cost or             │
│    project type filter                  │
│                                          │
│    [ Reset Filters ]                    │
│                                          │
└──────────────────────────────────────────┘
```
Distinct from "no leads in radius" — this state shows when leads exist nearby but the active filter is removing all of them. The CTA resets filters rather than expanding radius.

### Loading
3 skeleton cards matching collapsed permit card proportions. Pulsing dark gray blocks for thumbnail, timing bar, text lines. No spinner — feels faster.

### Error / Offline
"Can't load leads right now. Pull down to retry." Amber accent on message. Cached results shown if available with "Last updated 2 hours ago" note.

---

## 8. Motion & Interaction

Minimal. This is a utility, not entertainment.

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Card entry on scroll | Fade-in + 8px upward slide, staggered 50ms | 150ms |
| Card tap (expand) | Height grows, thumbnail → full photo, fields fade in | 200ms ease-out |
| Card press (active) | Scale 0.98, subtle bg darken | 100ms |
| Save action | Heart fills amber, scale bounce 1.0→1.15→1.0 | 200ms |
| Pull-to-refresh | Rubber-band pull, amber spinner dot | Native |
| Card collapse | Reverse of expand | 150ms |

**No:** Parallax, horizontal scroll, carousels, page transitions, or anything that blocks fast vertical scrolling.

### Tap Zone Discipline (dirty hands / fat finger compensation)

Cards have multiple interactive regions. The risk is accidental card-expand when the user is aiming for a Save or Directions button. Mitigations:

1. **Card body is a single tap zone** for expand/collapse — anywhere outside of buttons
2. **Action buttons are 44px minimum height** with 8px padding around each (effective 52px touch target)
3. **`stopPropagation` on all action button onClick handlers** — prevents the click from bubbling up to the card-expand handler
4. **Action button row is visually separated** from the card body by a 1px divider — gives a clear "you're in the action zone" cue
5. **Save/Directions buttons have at least 16px gap between them** — prevents accidentally hitting both with one finger

**Builder website link safety:**
- All `<a href={website}>` elements use `rel="noopener noreferrer"` to prevent tabnabbing
- URLs are validated client-side before render: must start with `https://`, hostname must not be private/localhost
- Failed validation shows a disabled "Website" button with tooltip "Invalid URL"

---

## 9. Responsive Breakpoints

| Viewport | Layout |
|----------|--------|
| **375px (primary)** | Single column, edge-to-edge cards, sticky header, collapsed cards |
| **768px (tablet)** | Single column, 24px side padding, max-width 600px centered, cards get 8px rounded corners |
| **1024px+ (desktop)** | Two-column: feed left (max 500px) + map right (existing map view). Cards with 8px corners. Optional list view toggle. |

Desktop shows feed + map side-by-side for spatial context when planning at home. Mobile is the primary experience.

---

## 10. Accessibility

- All touch targets >= 44px height
- Color is never the only indicator — timing badges include text labels alongside color
- Score numbers use monospace for alignment-based scanning
- Sufficient contrast ratio (4.5:1 minimum) on all text against dark backgrounds
- Screen reader: cards use semantic `<article>` elements with `aria-label` summarizing the lead

---

## 11. Cross-Spec Dependencies

- **Implements:** `70_lead_feed.md` (architecture), `73_builder_leads.md` (builder card)
- **Data from:** `71_lead_timing_engine.md` (timing badges), `72_lead_cost_model.md` (cost display)
- **Extends:** Existing `PermitCard.tsx` component patterns, `PropertyPhoto.tsx` (Street View), Google Maps integration
- **Constrained by:** `00_engineering_standards.md` §1.1 (mobile-first), §4.3 (no secrets in client), §10 (frontend/backend boundary)
