# Competitive UX Research: Construction Lead Generation Apps

> **Date:** 2026-04-05
> **Purpose:** Inform Buildo's lead feed design by analyzing 8 competitor platforms
> **Scope:** Mobile card design, visual hierarchy, information density, action patterns

---

## Platforms Analyzed

| # | Platform | Type | Canadian | Dark Mode |
|---|----------|------|----------|-----------|
| 1 | BuildZoom | Contractor lead matching | No | Partial (dark nav, white cards) |
| 2 | Houzz Pro | Home pro lead gen + CRM | No | No |
| 3 | Thumbtack | Service pro marketplace | No | No |
| 4 | Angi | Home service leads | No | No |
| 5 | Bark | Professional service leads | No | No |
| 6 | HomeStars | Contractor marketplace | **Yes** | No |
| 7 | Buildxact | Construction estimation/mgmt | No | No |
| 8 | Procore | Construction management | No | **Yes** |

---

## Platform-by-Platform Analysis

### 1. BuildZoom (buildzoom.com)

**Card Layout:** Grid cards with square thumbnails (business initials or photos), business name, proprietary "BZ Score," star ratings, location, and specialization. Single-column mobile, multi-column desktop.

**Color Scheme:** Dark navy/charcoal hero backgrounds (`rgba(29,38,44,0.95)`) with light blue accent buttons. White card bodies against dark page backgrounds. **Closest to "industrial" feel** in the group.

**Typography:** Sans-serif primary, 14px body. Clear size/weight hierarchy.

**Key Signals:** BZ Score (proprietary contractor quality rating built from public permit data — directly analogous to Buildo's lead_score concept), star ratings, location, license/permit data.

**Photo Usage:** Business initials as avatar fallback when no photo exists.

**Actions:** "Get Started" and "Continue" — funnel-oriented CTAs rather than card-level actions.

**Assessment:** The dark navigation + white card pattern is the most visually differentiated. The BZ Score proves that computed quality scores from permit data resonate with users. Site feels dated after acquisition by Block Renovation.

**Relevance to Buildo:** Validates the lead_score concept. The dark nav + light card approach could be a middle ground between full dark mode and the generic white SaaS look.

---

### 2. Houzz Pro (houzz.com/pro)

**Card Layout:** Modular card sections with consistent 12-16px padding. Feature highlights in horizontal card groups, stacking vertically on mobile. Lead management emphasizes CRM pipeline stages (lead → contacted → quoted → won).

**Color Scheme:** Sophisticated neutral palette — white (#FFFFFF), warm beige (#F8F6F2, #FBFBF9), dark text (#222222), green accent (#4DBC15). "POPULAR" badges use yellow (#FFBE28). Light mode only.

**Typography:** Figtree (sans-serif). Most well-defined type scale of the group: 40px bold headlines, 20-24px section headers (600 weight), 16-18px body, 12-14px supporting. 

**Key Signals:** CRM pipeline stages, push notification reminders, reply templates for rapid response. Emphasis is on speed-to-response rather than lead evaluation.

**Photo Usage:** Heavily photo-driven — portfolio showcase is central. 3D room scanning and AR capabilities.

**Actions:** "Get Started," "Schedule Demo," "Watch Video." Solid dark buttons for primary, outlined for secondary, rounded corners (4-52px radius).

**Assessment:** Most polished visual design of the group. Warm beige + green palette feels premium without being sterile. CRM pipeline view is a strong pattern for lead management. Mobile app reportedly more limited than desktop — red flag for field-first users.

**Relevance to Buildo:** The CRM pipeline pattern (lead → contacted → quoted → won) maps to our future SavedPermit statuses. The warm neutral palette is an alternative to pure dark mode worth considering. Type scale is worth studying.

---

### 3. Thumbtack (thumbtack.com)

**Card Layout:** Leads arrive in three categories — Direct leads, Instant bookings, and Claimable jobs (in "Opportunities" tab). Competition indicator (number of pros contacted by customer) shown directly on lead cards. Dashboard includes "Pro Insights" with performance charts.

**Color Scheme:** Clean light mode with neutral whites/grays. Blue primary accent via "Thumbprint" design system. Minimal color, high whitespace.

**Typography:** Custom sans-serif via Thumbprint design system (open-source, 45+ documented components). Well-documented token system with SCSS, JS, Android, iOS variants.

**Key Signals:** Competition level (how many pros the customer contacted), customer location, project details, deadline/timing, lead cost shown upfront. Distance filter exists but accuracy issues reported.

**Photo Usage:** Service photos on consumer-facing cards. Pro-facing interface is more text/data-driven.

**Actions:** Quick response is primary CTA. Platform rewards speed — "first pro to respond typically wins." Budget management and lead price controls are secondary.

**Assessment:** Best-documented design system of the group (Thumbprint). **The competition indicator on lead cards is the standout pattern** — it tells pros exactly how "hot" a lead is. Gamification elements (Merit Badges, milestone trackers) are unique. Pro interface more utilitarian than consumer side.

**Relevance to Buildo:** The competition count pattern is directly adoptable — "3 plumbers have seen this lead." The Thumbprint design system documentation approach (tokens, components, multi-platform) is aspirational for Buildo's design system maturity. The speed-to-respond emphasis doesn't apply to Buildo (permits are public, not exclusive).

---

### 4. Angi / Angie's List (angi.com)

**Card Layout:** Leads show customer name, address, task category, location, scope of work, and customer budget. Two lead types: Automated Leads (instant notification, charged on delivery) and Opportunity Leads (review before accepting).

**Color Scheme:** Image-heavy hero sections with gradient overlays. Professional but generic SaaS aesthetic. High-contrast CTAs.

**Typography:** System fonts with CSS grid alignment. Standard SaaS hierarchy.

**Key Signals:** Customer budget (on Opportunity Leads), task scope, location/address, automated vs. opportunity lead type. Lead cost per service type ($40-$160+).

**Photo Usage:** Hero imagery on marketing. Minimal photos in actual lead management interface.

**Actions:** "Get started" CTA. Pause/resume leads toggle. Lead response with messaging. Weekly billing management.

**Assessment:** Most straightforward lead card hierarchy: name, address, task, budget, scope. User reviews consistently complain the app has degraded from HomeAdvisor days — "used to be very interactive and well-organized, now difficult to use."

**Relevance to Buildo:** The simple 5-field lead card hierarchy (who, where, what, how much, scope) validates the principle of progressive disclosure. The two-tier lead system (automated vs. opportunity) maps to our permit vs. builder lead types. The degradation lesson: don't over-simplify in redesigns.

---

### 5. Bark (bark.com)

**Card Layout:** Category cards with images in grid format. Professional lead cards show topic title, service type, location with progressive disclosure.

**Color Scheme:** **Most semantically meaningful color system** — dark navy text (#111637), success green CTAs (#94C15B), teal accents (#47BF9C), warning orange (#F7BF53), error red (#EF6277). Each color maps to a clear meaning.

**Typography:** Modern sans-serif with rounded card containers. Clean and readable.

**Key Signals:** Instant notifications for leads, one-tap response, matching based on location + industry. Emphasis on being first to respond.

**Photo Usage:** Category thumbnails, professional profile photos/portfolios.

**Actions:** "Find me a Pro" (primary, green), "I'll search myself" (secondary, outline). One-tap lead response on mobile. Direct calling from app.

**Assessment:** The semantic color system is the most transferable pattern. Green=success, orange=warning, red=error, teal=accent. One-tap response and instant notification patterns suit time-sensitive leads. Well-regarded for focused, uncluttered lead presentation.

**Relevance to Buildo:** Adopt the semantic color mapping principle. Our timing badges should follow a similar pattern where color = meaning, not decoration. The one-tap action pattern (save, call, directions) fits our mobile-first constraints.

---

### 6. HomeStars (homestars.com)

**Card Layout:** "Intuitive" Lead Inbox with enhanced organization. Pro dashboard with job tracking, lead management, chat. Leads display service request, lead price upfront, homeowner communication thread. Profile-centric with reviews, skills, working area.

**Color Scheme:** Clean professional light theme (limited analysis due to 403 responses). Brand palette visible in app store presence.

**Typography:** Standard mobile-optimized sans-serif.

**Key Signals:** **Lead price visible upfront before paying** (transparency pattern). Push notifications for leads/shortlists/messages/quote requests. Shortlisting system where homeowners add pros to shortlist before detailed engagement.

**Photo Usage:** Portfolio photos on profiles, project photos in communication threads.

**Actions:** Express interest in leads, accept/decline, chat with homeowners, edit profile/skills/area. "Express interest" pattern is lower-friction than immediate purchase.

**Assessment:** Most directly relevant competitor as a **Canadian platform**. Lead price upfront transparency is notable. The shortlisting model (homeowner picks shortlist, then pros notified) creates different dynamics than race-to-respond platforms.

**Relevance to Buildo:** The express-interest-before-commit pattern reduces friction. The upfront transparency principle applies: show the most decision-relevant data immediately (lead score, cost, freshness should be the three most prominent fields). Canadian context means similar construction industry norms.

---

### 7. Buildxact (buildxact.com)

**Card Layout:** Job-centric "My Jobs" list with expandable job cards showing crew, schedule, daily logs. **Card containers with colored left/top borders for status indication.** Icon + text combinations for feature highlighting.

**Color Scheme:** Muted professional palette — teal/blue-grey primary (#30617b, #6EC1E4), golden yellow accent (#fdba12), red for urgent (#e55860), orange secondary (#ff8300), off-white backgrounds (#f7f8f9). Light theme only.

**Typography:** **Roboto Slab (serif) for headings, Roboto (sans) for body.** Unique serif/sans pairing in this group — gives a "construction document" feel. Size range 1.8rem to 5.8rem.

**Key Signals:** Job status via colored borders, crew assignments, daily progress, schedule changes, change orders. Operational signals, not evaluative.

**Photo Usage:** Job site photos via daily logs, PDF sharing.

**Actions:** Invite crew, update daily log, share details/photos/PDFs. Sync mobile ↔ desktop.

**Assessment:** **Colored left-border status indicators** and serif heading font are the most "construction-industry" feeling choices in this analysis. The left-border pattern is compact and scannable — a 3-4px colored left border communicates status without reading text. Well-documented responsive breakpoints (768px tablet, 1024px desktop, 767px phone).

**Relevance to Buildo:** The left-border color coding is the single most adoptable pattern from this research. Add a 3-4px left border to lead cards in the timing/status color. The serif + sans pairing is worth testing — it differentiates from every other platform while feeling industry-appropriate.

---

### 8. Procore (procore.com)

**Card Layout:** Grid View vs. List View toggle for project tools. Bookmarkable items across 10+ categories. Construction-material-themed color naming convention in design tokens.

**Color Scheme:** Orange brand primary (#FF5201), extensive gray scale using construction-material metaphors (concrete, stone, granite), blue for interactive elements ("painters-tape" blue). **Dark mode fully supported on mobile** (Light/Dark/System toggle).

**Typography:** "Inter Tight" and custom "procoreSans" fonts. Scale from 0.45rem to 5rem. Large hero headings (up to 4rem) with 18px/26px body.

**Key Signals:** Project-level bookmarks, observations, inspections, incidents, punch list items. These are operational, not lead-focused.

**Photo Usage:** Progress photos are core workflow — field teams capture and attach to daily logs, observations, inspections.

**Actions:** Bookmark, create correspondence, manage timecards, submit RFIs. Full-width buttons mobile, auto-width desktop.

**Assessment:** **Gold standard for construction-industry mobile UX.** Only platform with confirmed dark mode. Construction-material color naming (`gray-concrete`, `blue-painters-tape`) makes the design system feel industry-native. Grid/List toggle is a power-user pattern.

**Relevance to Buildo:** Dark mode precedent validates our design direction. Construction-material naming convention for design tokens is a small but meaningful touch. Grid/List toggle should be in V2. Procore proves construction pros accept and prefer dark UIs on mobile.

---

## Cross-Platform Patterns

### Information Hierarchy Consensus
Across all platforms, lead/job cards follow this order:
1. **Job type / service category** (what work)
2. **Location / address** (where)
3. **Budget / cost estimate** (how much)
4. **Timing / urgency** (when)
5. **Competition / demand signal** (how hot)
6. **Status badge** (current state)

### Universal Design Choices
- Light backgrounds dominate (7 of 8)
- Sans-serif typography is standard (only Buildxact uses serif)
- Green = primary CTA / success (Houzz, Bark, others)
- Single-column vertical scroll on mobile is universal
- Push notifications are the primary lead delivery mechanism
- Speed-to-respond is the primary UX goal for marketplace platforms

### Notable Gaps in the Market
- **No dark mode** in any lead gen platform (only Procore in project management)
- **No stage-based timing** — every platform shows urgency as "new lead!" not "your trade needed in X weeks"
- **No construction phase awareness** — nobody connects permit lifecycle to trade timing
- **No data-dense professional view** — all platforms use consumer-friendly low-density layouts
- **No public permit data integration** — only BuildZoom uses permit data, and they use it for contractor scoring, not lead surfacing

---

## Recommendations Summary

### Adopt
| Pattern | Source | Why |
|---------|--------|-----|
| Competition count on cards | Thumbtack | Helps tradespeople gauge lead heat |
| Colored left-border for status | Buildxact | Scannable without reading text |
| Semantic color system | Bark | Colors map to meaning, not decoration |
| Express-interest + quick notes | HomeStars | Lower friction than immediate commitment |
| Lead price/cost transparency upfront | HomeStars, Angi | Most decision-relevant data shown first |
| CRM pipeline stages | Houzz Pro | Maps to SavedPermit status progression |
| Grid/List view toggle | Procore | Power-user efficiency (V2) |
| Construction-material token naming | Procore | Industry-native design system feel |
| Dark mode | Procore (only one) | Massive differentiation in lead gen space |

### Avoid
| Anti-Pattern | Source | Why |
|--------------|--------|-----|
| Generic white SaaS aesthetic | Angi, Thumbtack, most others | 6 of 8 look identical — no differentiation |
| Race-to-respond urgency | Thumbtack, Angi, Bark | Permits are public, not exclusive leads |
| 10+ data points per card | Current Buildo PermitCard | Competitors show 3-5. Use progressive disclosure |
| Photo-heavy when no photos exist | Houzz | We have permit data. Embrace data density |
| Over-simplified redesigns | Angi (post-HomeAdvisor) | Users complained about lost functionality |
| Consumer-oriented low density | All competitors | Our users are professionals who want efficiency |

### Buildo's Differentiation Opportunity
No competitor combines:
- Dark mode optimized for construction
- Monospace data density for professional users
- Stage-based timing from real inspection data
- Dual lead types (permit + builder)
- Construction phase awareness
- Public permit data as the lead source

This positions Buildo in a genuinely unoccupied design space.

---

# Part 2: Airbnb & Zillow Mobile UX Implementation Deep Dive

> **Added:** 2026-04-06
> **Purpose:** Extract concrete implementation patterns from best-in-class mobile apps since none of the construction competitors are worth reverse-engineering. This section focuses on HOW to build the hard parts: map/list sync, bottom sheets, gestures, skeletons, and spacing discipline.

## Why Airbnb & Zillow (Not the Construction Competitors)

The 8 construction platforms in Part 1 either have outdated UX (BuildZoom, Houzz Pro mobile), degraded redesigns (Angi), consumer aesthetics (Thumbtack, Bark), or aren't feed-based (Buildxact, Procore). For the HARD parts — map sync, gestures, skeleton loading, bottom sheets — Airbnb and Zillow have shipped proven patterns we can reference.

**Buildo has a single photo per lead, so carousel patterns are excluded.**

---

## 1. Card Component Structure

### Airbnb pattern
- **Photo aspect ratio:** 3:2 (width:height) — Airbnb 2025 photo guidelines
- **Minimum photo resolution:** 1024×683px
- **Card wrapper:** Photo at top, text block below, heart button overlaid top-right on photo
- **Text hierarchy:** Location → subtitle → price → rating inline with price

### Implementation approach

```jsx
// Airbnb-style card structure (reconstructed from public clones)
<article className="flex flex-col">
  <div className="relative aspect-[3/2] overflow-hidden rounded-xl">
    <img src={photo} className="object-cover w-full h-full" />
    <button className="absolute top-3 right-3 z-10">
      <HeartIcon />
    </button>
  </div>
  <div className="pt-3 space-y-1">
    <h3 className="font-semibold text-base">{title}</h3>
    <p className="text-sm text-neutral-500">{subtitle}</p>
    <p className="text-sm"><span className="font-semibold">${price}</span> / night</p>
  </div>
</article>
```

### Buildo applicability
Same structural pattern. Replace "price / night" with our timing badge + cost tier. Use `aspect-[3/2]` for the Street View photo.

---

## 2. Map ↔ List Synchronization

### Reality check
Public Airbnb clones show **unidirectional** rendering only (list → map overlays). True bidirectional sync (tap card → map marker pulses, tap marker → list scrolls) is Airbnb's internal implementation, not public.

### Industry-standard pattern (from react-map-gl docs)

```jsx
const [viewState, setViewState] = useState({
  latitude: 43.7,
  longitude: -79.4,
  zoom: 11
});
const [hoveredId, setHoveredId] = useState<string | null>(null);
const [selectedId, setSelectedId] = useState<string | null>(null);

<Map
  {...viewState}
  onMove={evt => setViewState(evt.viewState)}
  onClick={() => setSelectedId(null)}
>
  {leads.map(lead => (
    <Marker
      key={lead.id}
      latitude={lead.lat}
      longitude={lead.lng}
      onClick={() => setSelectedId(lead.id)}
    >
      <Pin active={selectedId === lead.id || hoveredId === lead.id} />
    </Marker>
  ))}
</Map>

{/* List side */}
{leads.map(lead => (
  <Card
    key={lead.id}
    lead={lead}
    onMouseEnter={() => setHoveredId(lead.id)}
    onClick={() => setSelectedId(lead.id)}
    active={selectedId === lead.id}
  />
))}
```

### Key decisions
- **Shared state lives ONE level up** — parent component holds `hoveredId` and `selectedId`
- **No Redux needed** — React state is sufficient for a single page
- **Debouncing:** Wrap `onMoveEnd` with 300ms debounce before fetching new leads. The map itself updates instantly; only the data fetch is debounced.
- **Scroll-to-card:** When a map marker is clicked, call `cardRef.scrollIntoView({ behavior: 'smooth', block: 'center' })`

### Buildo applicability
Use react-map-gl or Google Maps React wrapper. State lives in the feed page component. Two state values: `hoveredLeadId` and `selectedLeadId`. No state library needed.

---

## 3. Bottom Sheet Modal (Vaul — The Reference Implementation)

### The library
**Vaul** (`npm i vaul`) by Emil Kowalski. De facto bottom sheet library for React. Built on Radix UI Dialog. Used by shadcn/ui.

> **Note:** Vaul repo is marked as "unmaintained hobby project" but widely used in production and stable.

### Vaul's exact numeric constants (from `constants.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `DURATION` | `0.5` | 500ms transition duration |
| `EASE` | `[0.32, 0.72, 0, 1]` | iOS-matching cubic-bezier curve |
| `VELOCITY_THRESHOLD` | `0.4` | Flick velocity to trigger dismiss |
| `CLOSE_THRESHOLD` | `0.25` | Drag 25% of sheet height to trigger close |
| `SCROLL_LOCK_TIMEOUT` | `100` | ms non-draggable after scrolling |
| `BORDER_RADIUS` | `8` | px — rounded corners, dampened to 0 during drag |
| `NESTED_DISPLACEMENT` | `16` | px — offset for nested drawers |
| `WINDOW_TOP_OFFSET` | `26` | px — distance from top of screen at max height |
| Swipe start threshold | `10px` (touch) / `2px` (pointer) | Minimum drag to start |

### Basic usage pattern

```jsx
import { Drawer } from 'vaul';
import { useState } from 'react';

function FilterSheet() {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<number | string | null>('148px');

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      snapPoints={['148px', '355px', 1]}  // peek, half-screen, full-height
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Trigger asChild>
        <button>Open Filters</button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 rounded-t-[8px] bg-[#272B33]">
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-neutral-600" />
          <div className="p-4">
            {/* Filter UI here */}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

### Drag physics (critical implementation detail)

From the creator's blog post — a critical performance gotcha:
- DON'T use CSS variables for drag position — causes frame drops with 20+ list items due to inheritable style recalculation
- DO apply direct transforms: `style={{ transform: 'translateY(' + draggedDistance + 'px)' }}`

### CSS transition (the key to iOS-matching feel)

```css
.drawer {
  transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
```

This specific cubic-bezier curve comes from the Ionic Framework and is what makes motion feel native.

### Buildo applicability
Use vaul for filter bottom sheet (3 snap points: peek / half / full), lead detail expansion, and location picker.

---

## 4. Heart/Save Animation (Motion for React)

### The library
**Motion for React** (formerly Framer Motion). Package: `motion`.

### Default spring values

| Parameter | Default |
|-----------|---------|
| `stiffness` | `1` |
| `damping` | `10` |
| `mass` | `1` |
| `velocity` | current value velocity |

Defaults are intentionally weak — provide your own spring config for UI interactions.

### Recommended config for heart/save button

```jsx
import { motion } from 'motion/react';

<motion.button
  whileTap={{ scale: 0.9 }}
  whileHover={{ scale: 1.1 }}
  animate={{ scale: saved ? [1, 1.3, 1] : 1 }}
  transition={{
    type: "spring",
    stiffness: 400,    // snappy
    damping: 20,       // not too bouncy
    mass: 1,
  }}
  onClick={() => setSaved(!saved)}
>
  <HeartIcon filled={saved} color={saved ? '#F59E0B' : '#9CA3AF'} />
</motion.button>
```

### Animation sequence on save
1. Tap: `whileTap={{ scale: 0.9 }}` — press
2. Release: spring back to 1.0
3. On saved state change: `animate={{ scale: [1, 1.3, 1] }}` — bounce to 1.3, settle at 1.0
4. Icon color crossfade: amber (`#F59E0B`) when saved, gray (`#9CA3AF`) when not

### Haptic feedback (free)

```jsx
const handleSave = () => {
  if ('vibrate' in navigator) navigator.vibrate(10); // 10ms light tap
  setSaved(!saved);
};
```

### Buildo applicability
Direct copy. Amber fill matches our `--action-primary` token.

---

## 5. Skeleton Loading (Tailwind `animate-pulse`)

### The simplest production pattern
Tailwind ships with `animate-pulse` — this is what Airbnb-style skeletons use.

```jsx
function PermitCardSkeleton() {
  return (
    <div className="bg-[#272B33] rounded-lg p-4 animate-pulse">
      <div className="flex gap-3">
        {/* Thumbnail placeholder 80x60 */}
        <div className="w-20 h-15 bg-neutral-700 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-700 rounded-full w-3/4" />
          <div className="h-3 bg-neutral-700 rounded-full w-1/2" />
          <div className="h-3 bg-neutral-700 rounded-full w-16" />
        </div>
      </div>
      {/* Timing badge placeholder */}
      <div className="h-10 bg-neutral-700 rounded-md mt-3 w-full" />
      {/* Cost line */}
      <div className="h-3 bg-neutral-700 rounded-full mt-3 w-2/3" />
      {/* Metadata lines */}
      <div className="space-y-2 mt-2">
        <div className="h-2.5 bg-neutral-700 rounded-full w-1/2" />
        <div className="h-2.5 bg-neutral-700 rounded-full w-1/3" />
      </div>
    </div>
  );
}
```

### Key principle: prevent CLS
Skeletons must match real card **exact dimensions** to prevent layout shift. Set explicit heights for every block.

### Advanced shimmer (if needed)

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.shimmer::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255,255,255,0.05),
    transparent
  );
  animation: shimmer 1.4s infinite;
}
```

For dark mode, `rgba(255,255,255,0.05)` is the right intensity — subtle.

### Buildo applicability
Start with `animate-pulse`. Upgrade to shimmer only if pulse feels too aggressive on dark.

---

## 6. Sticky Filter Bar

### Pattern: `position: sticky` + optional scroll-direction detection

```jsx
function FeedHeader({ leadCount }: { leadCount: number }) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-[#1C1F26]/80 border-b border-neutral-800">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-neutral-100">
            Scarborough · 10km
          </span>
        </div>
        <span className="font-mono text-xs text-neutral-400">
          {leadCount} leads
        </span>
      </div>
    </header>
  );
}
```

### Show/hide on scroll direction (V2)

```jsx
function useScrollDirection() {
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const lastScroll = useRef(0);

  useEffect(() => {
    const handler = () => {
      const current = window.scrollY;
      if (Math.abs(current - lastScroll.current) < 5) return;
      setDirection(current > lastScroll.current ? 'down' : 'up');
      lastScroll.current = current;
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return direction;
}
```

### Critical choice
**Use `position: sticky`, not `fixed`**. Fixed has known bugs with mobile viewport height when URL bar appears/disappears.

### Buildo applicability
Simple sticky header for V1. Add scroll-hide in V2.

---

## 7. Pull-to-Refresh

### Library: `react-simple-pull-to-refresh`

```jsx
import PullToRefresh from 'react-simple-pull-to-refresh';

<PullToRefresh
  onRefresh={async () => { await refetchLeads(); }}
  pullDownThreshold={67}
  maxPullDownDistance={95}
  refreshingContent={
    <div className="flex justify-center py-4">
      <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
    </div>
  }
>
  <LeadFeed leads={leads} />
</PullToRefresh>
```

### Alternative
Custom implementation with Framer Motion `useMotionValue` + spring for more control over rubber-band physics. More work, exact native feel.

### Buildo applicability
Start with library. Evaluate feel. Custom only if needed.

---

## 8. Spacing System

### Tailwind's base scale
```
spacing-0.5 = 2px
spacing-1   = 4px
spacing-2   = 8px
spacing-3   = 12px
spacing-4   = 16px
spacing-5   = 20px
spacing-6   = 24px
spacing-8   = 32px
spacing-10  = 40px
spacing-12  = 48px
```

### Airbnb/Zillow rhythm
- Card-to-card gap: 8-12px (`gap-2` or `gap-3`)
- Card internal padding: 12-16px (`p-3` or `p-4`)
- Text-to-text within card: 4-8px (`space-y-1` or `space-y-2`)
- Section spacing: 24-32px (`space-y-6` or `space-y-8`)
- Edge-to-edge on mobile: 0 horizontal margin on cards
- Content inset within card: 16px (`p-4`)

### Vertical rhythm
Consistent 4px base for all vertical spacing, aligning to 8px grid for major sections. Never use arbitrary values like `mt-[5px]`.

### Buildo applicability
Use Tailwind default scale religiously. `gap-2` (8px) between feed cards, `p-4` (16px) inside cards, `space-y-2` (8px) between internal elements.

---

## 9. Touch Target Discipline

### Rules
- Minimum tap target: 44×44px (Apple) / 48×48px (Android)
- **Buildo standard:** 44px minimum

### Pattern 1: Invisible larger touch area
```jsx
<button className="relative p-2">
  <span className="absolute inset-[-8px]" aria-hidden />
  <HeartIcon className="w-6 h-6" />
</button>
```

Outer `absolute inset-[-8px]` creates invisible 44x44 touch area around 24x24 icon. Visual density preserved.

### Pattern 2: Oversized button with smaller icon
```jsx
<button className="min-w-[44px] min-h-[44px] flex items-center justify-center">
  <HeartIcon className="w-5 h-5" />
</button>
```

### Buildo applicability
Every action button uses `min-h-[44px]`. Badge pills can be smaller (not tappable). Card itself is tappable at full size.

---

## 10. Layout at Different Breakpoints

### Tailwind breakpoints
```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Recommended Buildo layout

```jsx
// Mobile (< 640px): single column, edge-to-edge
<div className="flex flex-col">
  {leads.map(lead => <Card key={lead.id} />)}
</div>

// Tablet (640-1023px): centered, max-width
<div className="flex flex-col max-w-xl mx-auto px-6">

// Desktop (1024px+): two-column feed + map
<div className="lg:grid lg:grid-cols-[500px_1fr] lg:gap-0">
  <div className="overflow-y-auto max-h-screen">
    {/* feed */}
  </div>
  <div className="hidden lg:block sticky top-0 h-screen">
    {/* map */}
  </div>
</div>
```

### Observed patterns
- **Airbnb:** Mobile = single column, tablet = 2-column grid, desktop = 3-column + collapsible map
- **Zillow:** Mobile = single column with map/list toggle, desktop = 50/50 map left + cards right

### Buildo applicability
Adopt Zillow's desktop pattern (feed left, map right). Mobile = single-column feed with a map icon in sticky header that opens full-screen map view.

---

## Summary: Tools & Libraries for Buildo

| Pattern | Library | Install | Why |
|---------|---------|---------|-----|
| Bottom sheets | `vaul` | `npm i vaul` | iOS feel, snap points, shadcn/ui standard |
| Animations | `motion` | `npm i motion` | Heart button, card expand, springs |
| Map | `@vis.gl/react-google-maps` | `npm i @vis.gl/react-google-maps` | Google Maps already in stack |
| Pull-to-refresh | `react-simple-pull-to-refresh` | `npm i react-simple-pull-to-refresh` | Simple, works |
| Skeleton | Tailwind `animate-pulse` | (built-in) | No library needed |
| Intersection observer | `react-intersection-observer` | `npm i react-intersection-observer` | Infinite scroll, scroll triggers |

## Critical Implementation Lessons

1. **Use `position: sticky`, not `fixed`** — mobile viewport bugs with fixed positioning
2. **Avoid CSS variables for drag transforms** — causes frame drops with many list items (Vaul lesson)
3. **Skeletons must match exact dimensions** — prevents CLS and feels faster
4. **State lives one level up** for map/list sync — no Redux needed on a single page
5. **Debounce data fetches, not map rendering** — map updates instantly, data lags 300ms
6. **iOS cubic-bezier is `[0.32, 0.72, 0, 1]`** — single value that makes/breaks native feel
7. **Haptic feedback is free** — `navigator.vibrate(10)` on save/confirm actions
8. **Spring defaults in Motion are weak** — use `stiffness: 400, damping: 20, mass: 1` for button interactions

---

## Sources (Part 2)

- [Vaul GitHub](https://github.com/emilkowalski/vaul) — bottom sheet library
- [Vaul constants.ts](https://github.com/emilkowalski/vaul/blob/main/src/constants.ts) — exact numeric values
- [Building a Drawer Component (Emil Kowalski)](https://emilkowal.ski/ui/building-a-drawer-component) — drag physics, gotchas
- [Motion for React](https://motion.dev/motion/animation/) — spring animations
- [Motion Spring Docs](https://motion.dev/docs/react-transitions) — default values
- [react-map-gl State Management](https://visgl.github.io/react-map-gl/docs/get-started/state-management) — map state patterns
- [Airbnb Map Clone Tutorial](https://dev.to/alex1998dmit/how-to-create-map-like-in-airbnb-with-react-and-google-maps-28i3) — overlay pattern
- [Flowbite Skeleton](https://flowbite.com/docs/components/skeleton/) — Tailwind skeleton patterns
- [Airbnb 2025 Photo Guidelines](https://copilot.rentals/2025/02/26/photo-resolution-amp-aspect-ratio-guidelines-for-major-otas-2025/) — 3:2 aspect ratio
- [Motion for React Docs](https://www.framer.com/motion/animation/) — animation reference
