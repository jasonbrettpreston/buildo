# 70 Frontend Platform Foundation

**Status:** IMPLEMENTED (Baseline Architecture)
**Purpose:** Establishes the global frontend architecture, rendering strategies, state management rules, and security boundaries for the Buildo application.

## 1. Goal & User Story
**Goal:** Define a strict, highly scalable, Feature-Sliced frontend architecture that dictates how data is fetched, how state is persisted, and how the UI degrades gracefully, ensuring all downstream features are built uniformly.

**User Story:** As a frontend developer, I need a clear architectural blueprint so that when I build a new feature (like a Lead Feed or a CRM Board), I know exactly where to put my files, how to fetch data safely, and how to track user analytics without degrading browser performance.

## 2. Technical Architecture

**Tech Stack Matrix**
- **Core Framework:** Next.js 15.1.0 (React 19)
- **Language:** TypeScript (v5.7.0)
- **Styling:** Tailwind CSS (v4.0.0) with CSS Modules/Variables
- **Database Connection:** Drizzle ORM (v0.45) connecting directly to PostgreSQL logic pipelines via Edge/Server Routes.

**Rendering Strategy (Hybrid App Router)**
- **Server-Side Rendering (SSR):** Heavily utilized for authentication bridging and SEO.
- **Client Components (`'use client'`):** Heavily dictate interactive dashboard states, specifically everything inside the Lead Feed (Google Maps, infinite scroll). Rule: Push `'use client'` as far down the component tree as possible.

**Directory Structure (Feature-Sliced Design)**
The `src/` directory explicitly separates primitive UI elements from complex business domains:
```plaintext
src/
├── app/                  # Next.js App Router (Page views & API routes)
│   ├── leads/            # Top level route for the Feed
│   ├── dashboard/        # Metrics view routes
│   └── api/              # Proxy endpoints connecting UI to DB
├── components/           # Generic / Cross-domain components
│   ├── ui/               # 'Dumb' Primitives (Buttons, Avatars, Modals)
│   └── map/              # Global map wrappers
└── features/             # Domain-driven feature slices (The "Smart" logic)
    ├── leads/            # Everything specific to Lead Feeding
    │   ├── api/          # TanStack queries
    │   ├── components/   # Smart Lead Cards, Empty States
    │   ├── hooks/        # Zustand state wrappers
    │   └── lib/          # Haversine distance math, schema formatters
    ├── crm/              # (NEW) Spec 77: Operational Pipeline Domain
    └── admin-controls/   # (NEW) Spec 86: Gravity Control Panel Domain
```

**State Management Strategy**
- **Server State (Caching & Fetching):** `@tanstack/react-query` v5. All feeds are paginated using `useInfiniteQuery`.
- **Global Client State (Memory):** `zustand` v5. Used exclusively for persisting UI layout without triggering cascading renders.
- **State Resilience (Persistence):** Uses `localStorage` bindings via `partialize`. Rule: Must feature a robust `migrate` phase that runs Zod validation upon boot. If a user tampers with the persistence or an older app version breaks the schema, Zustand gracefully defaults the state rather than crashing the app.

**Environment Variables** *(Secrets excluded)*
- `DATABASE_URL`: Primary PostgreSQL connection string.
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`: Client-side key for `@vis.gl/react-google-maps` rendering.
- `NEXT_PUBLIC_DEV_MODE`: Toggles local authentication bypasses.
- `NEXT_PUBLIC_FIREBASE_API_KEY` (and `PROJECT_ID`): Firebase identity configuration.
- `NEXT_PUBLIC_POSTHOG_KEY`: Opt-in UI telemetry ingestion.
- `UPSTASH_REDIS_REST_URL`: Rate limiting URLs.
- `NEXT_PUBLIC_SENTRY_DSN`: Error boundaries and crash reporting.

## 3. Auth Matrix & Navigation Guards
Authentication is verified via Firebase OAuth + JWT Cookies, protected by Next.js Edge Middleware.

| Route Pattern | Access Level | Middleware Interception Logic |
|---|---|---|
| `/login` | Anonymous | Firebase OAuth Handlers. If valid session exists, 302 redirect to `/leads`. |
| `/onboarding` | Authenticated | 4-step wizard capturing trade preferences. |
| `/leads`, `/dashboard` | Authenticated | If no session cookie exists, 302 redirect to `/login`. |
| `/admin/*` | Admin | Requires valid JWT AND an administrative claim. 302 redirect to `/login` if unauthorized. |

## 4. Behavioral Contract
**Inputs:** User interactions routed through Feature-Sliced UI components.

**Core Logic (The Platform Rules):**
- **The API Proxy Rule:** Client components MUST NOT query Drizzle directly. They must hit local Next.js `/api/*` proxies.
- **Optimistic UI & Safety Rollbacks:** High-stakes mutations (e.g., `SaveButton`) execute state changes instantly. If the `/api` rejects the save 500ms later, the UI automatically reverses the state and fires a compensating `lead_save_failed` telemetry event.
- **Observability & Cardinality Discipline:** PostHog is wrapped in a `captureEvent` function. Hover events over Map Pins are rate-limited with `Set<string>` maps so a single mouse sweep doesn't trigger 50 analytics callbacks.
- **Spatial Optimization (The Haversine Buffer):** A 500-meter `haversine()` mathematical buffer intercepts mobile users. TanStack only drops the cache and fetches new geospatial boundaries when the user crosses this 500m "Snapping Distance".

**Outputs:** Standardized JSON responses via Next.js route handlers.

**Performance Bubbles:** Infinite Scroll limits prevent memory leaks (capped at 75 DOM nodes). Deep components (like Maps) utilize strict debounced camera tracking so re-renders are pooled to 500ms gaps.

## 5. Testing Mandate
- **Logic:** `*.logic.test.ts` — Handled by Vitest to assert math logic perfectly mirrors the backend logic.
- **Mutation:** `npm run test:mutation` — Powered by Stryker. Proves business logic resilience by deliberately altering operators (`>` to `<`).
- **UI:** `*.ui.test.tsx` — Governed by `@testing-library/react` and `fast-check` for component and property testing.
- **Infra/E2E:** `*.spec.ts` — Playwright is heavily integrated (`playwright-extra` + Stealth Plugin) for sweeping browser testing workflows.

## 6. Operating Boundaries
**Target Files**
- `src/middleware.ts` (Navigation Guards)
- `src/features/.../hooks/` (Global state wrappers)
- `src/features/leads/lib/` (Core formatters and Haversine math)
- `src/components/ui/*` (Shadcn primitives)

**Out-of-Scope Files**
- `src/features/leads/components/*` — Domain-specific logic belongs in Spec 75 (Lead Feed). Reasoning: Spec 70 dictates *how* we build; the domain specs dictate *what* we build.

**Cross-Spec Dependencies**
- **Relies on:** Spec 13 (Authentication) for Firebase JWT configuration logic.
