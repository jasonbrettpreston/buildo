# 71 Lead Feed (Discovery Interface)

**Status:** IMPLEMENTED (V1) -> PENDING UPGRADE (V2)
**Purpose:** Dictates the exact UI, components, and logic for the Lead Feed domain, orchestrating the discovery of construction opportunities via infinite scroll and geospatial map synchronization.

## 1. Goal & User Story

**Goal:** Provide a highly performant, memory-safe, and visually intuitive interface for tradespeople to discover, filter, and interact with geographically relevant construction permits and builder profiles.

**User Story:** As a tradesperson, I want to open the app and instantly see a map and feed of relevant jobs near me. I need to be able to filter by radius, seamlessly scroll through hundreds of leads without crashing my phone, and tap to save or call opportunities instantly.

## 2. Technical Architecture

**Directory Structure & Component Library**
This feature slice is strictly located in `src/features/leads/`. It leverages foundational UI primitives (`src/components/ui/`) wrapped with Tailwind CSS via a Variance Authority (CVA).

- `components/LeadFeed.tsx` *(Container)*: The orchestrating Infinite Scroll container. Features a hard 75-card (5 pages) V8-heap memory cap to prevent mobile browser crashes. Handles "Pull-to-refresh" wipes and bidirectional synchronization (clicking a map pin runs `element.scrollIntoView` to drop the user onto the permit card).
- `components/LeadFilterSheet.tsx`: A Vaul drawer overlay containing adjustments to the database queries (specifically the search radius parameters).
- `components/EmptyLeadState.tsx`: Failsafe graphics rendering three distinct states: `no_results` (+5KM expand prompt), `offline` (No Wi-Fi/Cellular), and `unreachable` (Network Layer Error/CDN crash).

**State Management & Core Logic**
- `hooks/useLeadFeedState.ts` (Zustand v5): Localized store tracking UI variables independently of React Context.
  - *Ephemeral:* `hoveredLeadId`, `selectedLeadId` (Resets per session, drives map sync).
  - *Persistent:* `radiusKm`, `location`, `snappedLocation` (Stored in localStorage via `partialize`). Uses a defensive migrate phase with Zod validation to gracefully recover corrupted or outdated cache states.
- `api/useLeadFeed.ts` (TanStack Query v5): Wrapper over `useInfiniteQuery` connecting to `/api/leads/feed`.
  - *Spatial Optimization:* Implements a 500-meter `haversine()` mathematical buffer. Query caches are only dropped and refetched when the user physically breaches this 500m "Snapping Distance", preventing relentless API fetching while walking down a street.

**Logic Helpers (`lib/`)**
- `distance.ts` & `haversine.ts`: Pure geospatial computations for proximity.
- `format.ts`: Contains `sanitizeTelHref` (prevents malicious/broken phone string injections) and `formatCostDisplay`.
- `haptics.ts`: Safely wraps `navigator.vibrate` to fire native iOS/Android feedback (e.g., 10ms for selection, 20ms for saving).

## 3. Behavioral Contract & UX Mechanisms

**The Data Representation Cards**
- `PermitLeadCard.tsx`:
  - *Display:* Address, Neighbourhood, Dynamic Proximity (< 1000m renders as "Close"), Expected Value (`cost_tier`), and Phase Window.
  - *UX:* Encapsulated in a `Motion.Card`. Tap provides 0.98 scale spring compression with a 10ms haptic hit. Uses `useReducedMotion()` to respect OS accessibility settings.
- `BuilderLeadCard.tsx`:
  - *Display:* Legal Identity, Image/Avatar fallback, Scale Context (`business_size`), Surrounding Dominance (`active_permits_nearby`), and Financial Averages.
  - *UX:* Distinct Navy background tone. Integrates `tel:href` sanitations allowing mobile users to click Call directly, capturing `lead_feed.builder_called` telemetry.

**Interactive Primitives & Badges**
- `SaveButton.tsx` (Optimistic Database Persister):
  - Implements strict Optimistic Updates. Clicking "Save" instantly fills the heart icon and bounces it. If the backend fails 500ms later, it rolls backward to empty and fires a compensating `lead_save_failed` telemetry event. Includes double-click debounce locks (`mutation.isPending`).
- `TimingBadge.tsx` (Predictive AI Score):
  - Generates an algorithmic `ProgressCircle` (via Tremor.js). Splits 0-30 bounds into visual classes: `>=25` (Amber/NOW), `>=20` (Green/Soon), `>=10` (Blue/Upcoming), `0-9` (Gray/Distant), `<0` (Red/Past).

**LeadMapMarker.tsx + LeadMapPane.tsx (Spatio-Visualizer)**
- *Pan Debouncing:* Uses a 500ms `setTimeout` buffer on viewport drag before refetching.
- *Click Preemption:* Map markers employ atomic `ref(true)` click assertions to prevent overlapping event bubbling (which would instantly select and deselect items).
- *Color Coordination:* Marker shapes/colors correlate perfectly with the `cost_tier` of the `PermitLeadCard` (e.g., "Mega" sites are Amber-Rust).

> [!WARNING]
> **🚨 V2 UPGRADE PROTOCOL: Backend Synchronization 🚨**
> To evolve this interface from a "Read-Only Discovery" tool to a "Read-Write CRM" connected to the new Phase 7 Backend Pipeline, developers MUST implement the following changes:
> 
> **Step 1: API Contract Updates (`types.ts`)**
> The `PermitLeadFeedItem` interface must be updated to consume the new pipeline payloads:
> - `opportunity_score: number` (0-100 bimodal score replacing the old 0-30 score).
> - `target_window: 'bid' | 'work'` (The bimodal routing flag).
> - `competition_count: number` (Tracks market saturation/flight trackers).
> - `is_geometric_override: boolean` (Flags Liar's Gate data from the Surgical Estimator).
> - `lifecycle_phase: string` (Unified P1-P20 stage).
> 
> **Step 2: Modifying Existing Components**
> - `PermitLeadCard.tsx`: Must conditionally render a new "💎 Early Bid" or "🚨 Rescue Mission" badge based on the `target_window`. It must also render a saturation warning pill (e.g., 👁 3 Pros Tracking) if `competition_count > 0`.
> - `TimingBadge.tsx`: Recalibrate the Tremor.js ProgressCircle to accept a max={100} value, mapped to the new `opportunity_score`.
> - `SaveButton.tsx`: Will be refactored/replaced by `ClaimButton.tsx`. The optimistic UI rollback logic remains identical, but the API mutation (`POST /api/leads/:id/claim`) must route the lead to the user's CRM Flight Board and invalidate the feed cache.
> 
> **Step 3: Handoff to New Domains (Out of Scope for Spec 71)**
> Clicking a card will no longer expand it inline. It will route to Spec 76 (Expanded Investigation View). Claimed leads will be managed in Spec 77 (CRM Flight Board).

## 4. Testing Mandate
- **Logic:** `*.logic.test.ts` — Vitest coverage for `distance.ts`, `haversine.ts`, and Zod migration logic inside `useLeadFeedState.ts`.
- **UI:** `*.ui.test.tsx` — RTL tests asserting `EmptyLeadState` renders correct text based on props, and `PermitLeadCard` expands/renders formatted text correctly.
- **Integration:** `feed-map-sync.integration.test.tsx` — Asserts race condition resolution: hovering a card while a map marker is clicked ensures `selectedLeadId` wins over `hoveredLeadId`.
- **Infra:** `*.infra.test.ts` — Playwright verification of Infinite Scroll triggering at the 80% scroll threshold and stopping at `MAX_PAGES`.

## 5. Operating Boundaries
**Target Files**
- `src/features/leads/components/*`
- `src/features/leads/hooks/*`
- `src/features/leads/api/*`

**Out-of-Scope Files**
- `src/app/api/leads/feed/route.ts` — Handled by the generic Platform Foundation spec.
- `src/features/crm/*` — The operational pipeline map and kanban boards are strictly distinct from this Discovery Feed.

**Cross-Spec Dependencies**
- **Relies on:** Spec 70 (Frontend Platform Foundation) for layout and auth.
