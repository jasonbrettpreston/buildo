# Lead Feed — Integrated Implementation Guide

> **Status: FUTURE BUILD** — Implementation blueprint, not yet built.
> **Purpose:** Single source of truth that brings together architecture, design, research, and React best practices into a component-by-component implementation plan.

## Source Documents

This guide synthesizes:
- **Architecture specs:** `70_lead_feed.md`, `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`
- **Design spec:** `74_lead_feed_design.md`
- **Competitive research:** `docs/reports/competitive_lead_gen_ux_research.md` (Part 1 + Part 2)
- **React best practices:** `docs/reports/react_best_practices_deep_dive.md`
- **Final assessment:** `docs/reports/lead_feed_final_assessment.md` (gap analysis, 10-vector rubric)
- **Engineering standards:** `00_engineering_standards.md` (§4.3, §4.4, §10)

---

## 1. Architectural Foundations

### 1.1 Feature-Sliced Structure (from React Best Practices §2)

Following "organize by feature, not by type":

```
src/
├── features/
│   └── leads/
│       ├── api/
│       │   ├── useLeadFeed.ts          # TanStack Query hook
│       │   ├── useLeadView.ts          # mutation hook
│       │   └── types.ts                # API request/response types
│       ├── components/
│       │   ├── LeadFeed.tsx            # feed container
│       │   ├── PermitLeadCard.tsx      # permit card
│       │   ├── BuilderLeadCard.tsx     # builder card
│       │   ├── PermitLeadCardExpanded.tsx
│       │   ├── LeadFeedHeader.tsx      # sticky filter bar
│       │   ├── LeadFilterSheet.tsx     # vaul bottom sheet
│       │   ├── LeadMapPane.tsx         # desktop map sidebar
│       │   ├── SkeletonLeadCard.tsx    # loading skeleton
│       │   ├── EmptyLeadState.tsx      # no-results state
│       │   └── badges/
│       │       ├── TimingBadge.tsx
│       │       ├── OpportunityBadge.tsx
│       │       └── SaveButton.tsx
│       ├── hooks/
│       │   ├── useGeolocation.ts
│       │   ├── useScrollDirection.ts
│       │   └── useLeadFeedState.ts    # Zustand store for hoveredId/selectedId
│       ├── lib/
│       │   ├── scoring.ts              # 4-pillar relevance scoring
│       │   ├── timing.ts               # stage-based timing engine
│       │   ├── cost-model.ts           # cost estimation
│       │   ├── builder-query.ts        # builder lead query builder
│       │   └── distance.ts             # haversine helper
│       └── types.ts                    # domain types
```

**Why this structure:**
- All lead-related code lives in one folder — easy to navigate
- Subfolders separate concerns: `api/` for data fetching, `lib/` for pure logic, `components/` for UI, `hooks/` for state
- Tests colocated per `00_engineering_standards.md` §5.2

### 1.2 Server Components vs Client Components (React Best Practices §2)

**Principle:** Default to Server Components. Only add `"use client"` at leaf interactive nodes.

**Critical rule (Next.js 15):** A Client Component CANNOT import a Server Component via `import` and render it inline. Server Components can only be passed into Client Components via `children` props from a higher Server Component parent. If a child needs to be imported into a Client Component, it MUST itself be a Client Component.

| Component | Type | Why |
|-----------|------|-----|
| `/leads/page.tsx` | **Server** | Auth check, layout shell, metadata. Does NOT fetch lead data — that happens client-side via TanStack Query (see V2 SSR upgrade path note below). |
| `LeadFeed.tsx` | **Client** | Needs state for hover/select sync, infinite scroll, pull-to-refresh |
| `PermitLeadCard.tsx` | **Client** | Needs interaction (expand, save, navigate) |
| `BuilderLeadCard.tsx` | **Client** | Needs tap-to-call, save interaction |
| `LeadFeedHeader.tsx` | **Client** | Scroll detection, filter sheet trigger |
| `LeadFilterSheet.tsx` | **Client** | Vaul drawer state |
| `LeadMapPane.tsx` | **Client** | Map interaction, marker state |
| `SkeletonLeadCard.tsx` | **Client** | Imported by `LeadFeed` (Client). Pure visual but must be Client for the import to work. No SSR benefit lost — it's a placeholder anyway. |
| `EmptyLeadState.tsx` | **Client** | Same reason — imported by `LeadFeed`. Also uses `useLeadFeedState` to read filter state for the "expand radius" CTA, which requires client-side state. |

**V2 SSR upgrade path (deferred):** If we want true server-side prefetching of leads for first-paint speed, the upgrade is to use TanStack Query's `dehydrate` + `<HydrationBoundary>` pattern in the Server Component page. The fetch would happen on the server, get serialized to HTML, and rehydrate client-side without a loading state. This is a larger refactor and not needed for V1 — call it out in the §11 build sequence as a V2 enhancement.

### 1.3 State Management (React Best Practices §2)

| State Type | Tool | Scope |
|-----------|------|-------|
| **Server state** (leads, filters, views) | TanStack Query | Global, cached, auto-revalidated |
| **Global UI state** (selected filter, view mode) | Zustand | App-wide, no prop drilling |
| **Local interaction state** (card expanded, hover) | `useState` | Component-level |
| **Cross-component sync** (hoveredId, selectedId) | Zustand store | Feed-page-level |

**No Redux.** No `useContext` for this feature (Zustand is simpler and faster).

### 1.4 Data Flow

```
[TanStack Query] → useLeadFeed()
      ↓
[Zustand store] ← selectedId, hoveredId, filters
      ↓
[LeadFeed page] → splits into feed + map
      ↓                              ↓
[LeadFeed component]         [LeadMapPane component]
      ↓                              ↓
[Card components]             [Marker components]
```

State flows down. Interactions flow up to Zustand. Both feed and map subscribe to the same store.

**Critical: data deduplication via TanStack Query.** Both `LeadFeed` and `LeadMapPane` call `useLeadFeed(...)` with the same query key (lat/lng/trade/radius). TanStack Query deduplicates: only ONE network request goes out, both components consume the same cached result. This is the right pattern — DO NOT pass leads as a prop from the page to the map. Lifting fetch to the page would require either prop drilling through every component or a duplicate fetch in the map.

---

## 2. API Layer

### 2.1 TanStack Query Setup

Install:
```bash
npm install @tanstack/react-query
```

Provider (add to `src/app/layout.tsx`):
```tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min — leads don't change often
      gcTime: 5 * 60_000,       // 5 min cache retention
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### 2.2 useLeadFeed Hook

`src/features/leads/api/useLeadFeed.ts`:
```tsx
import { useInfiniteQuery } from '@tanstack/react-query';
import type { LeadFeedResponse, LeadFeedParams } from './types';

export function useLeadFeed(params: LeadFeedParams) {
  return useInfiniteQuery({
    queryKey: ['leadFeed', params],
    queryFn: async ({ pageParam = 1 }) => {
      const url = new URL('/api/leads/feed', window.location.origin);
      url.searchParams.set('lat', String(params.lat));
      url.searchParams.set('lng', String(params.lng));
      url.searchParams.set('trade_slug', params.tradeSlug);
      url.searchParams.set('radius_km', String(params.radiusKm ?? 10));
      url.searchParams.set('page', String(pageParam));
      url.searchParams.set('limit', '15');
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json() as Promise<LeadFeedResponse>;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap(p => p.data).length;
      return loaded < lastPage.meta.total ? allPages.length + 1 : undefined;
    },
    enabled: !!(params.lat && params.lng && params.tradeSlug),
    initialPageParam: 1,
  });
}
```

### 2.3 useLeadView Mutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useLeadView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadViewInput) => {
      const res = await fetch('/api/leads/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to record view');
      return res.json();
    },
    // Optimistic update — increment competition count immediately
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['leadFeed'] });
      // ... optimistic update logic
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leadFeed'] });
    },
  });
}
```

### 2.4 API Route Contract (with rate limiting + differentiated errors)

`src/app/api/leads/feed/route.ts`:
```tsx
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError, logInfo } from '@/lib/logger';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { getUserIdFromSession } from '@/lib/auth/server';
import { checkLeadFeedLimit } from '@/lib/ratelimit';
import { TRADE_SLUGS } from '@/lib/classification/trades'; // exports the 32-item const array

const paramsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  // Restrict to known trade slugs — prevents enumeration attacks and typos
  trade_slug: z.enum(TRADE_SLUGS),
  radius_km: z.coerce.number().min(1).max(50).default(10),
  // Cursor pagination params (replaces page/offset)
  cursor_score: z.coerce.number().optional(),
  cursor_lead_type: z.enum(['permit', 'builder']).optional(),
  cursor_lead_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  
  // Auth first
  const userId = await getUserIdFromSession(request);
  if (!userId) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized', meta: null },
      { status: 401 }
    );
  }

  // Rate limit — fail-open if Redis is down (see src/lib/ratelimit.ts)
  const { success, limit, remaining, reset } = await checkLeadFeedLimit(userId);
  if (!success) {
    return NextResponse.json(
      { data: null, error: 'Rate limit exceeded', meta: { limit, remaining, reset } },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
        }
      }
    );
  }

  // Validation — differentiated 400 for Zod, 500 for everything else
  let params;
  try {
    params = paramsSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { 
          data: null, 
          error: 'Invalid parameters', 
          meta: { 
            issues: err.issues.map(i => ({ 
              path: i.path.join('.'), 
              message: i.message 
            }))
          }
        },
        { status: 400 }
      );
    }
    throw err;
  }

  // Business logic
  try {
    const result = await getLeadFeed(params);
    const durationMs = Date.now() - startMs;
    
    // Structured observability log
    logInfo('[api/leads/feed]', 'feed_query_success', {
      user_id: userId,
      trade_slug: params.trade_slug,
      lat: params.lat,
      lng: params.lng,
      radius_km: params.radius_km,
      result_count: result.leads.length,
      duration_ms: durationMs,
    });
    
    return NextResponse.json({ 
      data: result.leads, 
      error: null, 
      meta: result.meta 
    });
  } catch (err) {
    logError('[api/leads/feed]', err, { 
      event: 'feed_query_failed',
      user_id: userId,
      params,
    });
    return NextResponse.json(
      { data: null, error: 'Failed to load leads', meta: null },
      { status: 500 }
    );
  }
}
```

**Rate limiter setup with fail-open policy** (`src/lib/ratelimit.ts`):
```tsx
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logWarn } from '@/lib/logger';

const redis = Redis.fromEnv();

const leadFeedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  analytics: true,
  prefix: 'ratelimit:leads:feed',
});

const leadViewLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  analytics: true,
  prefix: 'ratelimit:leads:view',
});

// Fail-open: if Redis is unreachable, allow the request but log.
// Better to serve a degraded experience than return 500 to every user.
export async function checkLeadFeedLimit(userId: string) {
  try {
    return await leadFeedLimiter.limit(userId);
  } catch (err) {
    logWarn('[ratelimit]', 'redis_unreachable_failing_open', {
      user_id: userId,
      endpoint: 'feed',
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: true, limit: 30, remaining: 30, reset: Date.now() + 60000 };
  }
}

export async function checkLeadViewLimit(userId: string) {
  try {
    return await leadViewLimiter.limit(userId);
  } catch (err) {
    logWarn('[ratelimit]', 'redis_unreachable_failing_open', {
      user_id: userId,
      endpoint: 'view',
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: true, limit: 60, remaining: 60, reset: Date.now() + 60000 };
  }
}
```

Follows `§4.4 Multi-App API Design`: consistent `{ data, error, meta }` envelope, Zod validation with differentiated 400 errors, logError + logInfo observability, thin route that delegates to lib. Rate limited per user.

---

## 3. Zustand Store for Feed State

`src/features/leads/hooks/useLeadFeedState.ts`:
```tsx
import { create } from 'zustand';

interface LeadFeedState {
  // Shared state for map ↔ list sync
  hoveredLeadId: string | null;
  selectedLeadId: string | null;
  
  // Filter state
  radiusKm: number;
  location: { lat: number; lng: number } | null;
  
  // Actions
  setHoveredLeadId: (id: string | null) => void;
  setSelectedLeadId: (id: string | null) => void;
  setRadius: (km: number) => void;
  setLocation: (loc: { lat: number; lng: number }) => void;
}

export const useLeadFeedState = create<LeadFeedState>((set) => ({
  hoveredLeadId: null,
  selectedLeadId: null,
  radiusKm: 10,
  location: null,
  
  setHoveredLeadId: (id) => set({ hoveredLeadId: id }),
  setSelectedLeadId: (id) => set({ selectedLeadId: id }),
  setRadius: (km) => set({ radiusKm: km }),
  setLocation: (loc) => set({ location: loc }),
}));
```

Install:
```bash
npm install zustand
```

---

## 4. Component-by-Component Implementation

### 4.0 Build vs Install Boundary

> **Principle:** Use Shadcn UI primitives for all foundational plumbing (Button, Card, Avatar, Skeleton, Drawer, Badge, etc.). Only build custom components for genuinely feature-specific compositions and behaviors. The rule: **if Radix UI / Shadcn already solved it, install it.**

| Component | Source | Why |
|-----------|--------|-----|
| `<Button>` | **Shadcn** `npx shadcn@latest add button` | Variants, sizes, disabled, accessibility, focus management — all built in |
| `<Card>`, `<CardContent>`, `<CardHeader>`, `<CardFooter>` | **Shadcn** `npx shadcn@latest add card` | Consistent spacing primitive. Apply our dark tokens via CSS vars. |
| `<Badge>` | **Shadcn** `npx shadcn@latest add badge` | Pill component with variant system |
| `<Avatar>`, `<AvatarImage>`, `<AvatarFallback>` | **Shadcn** `npx shadcn@latest add avatar` | URL → fallback chain handled automatically |
| `<Skeleton>` | **Shadcn** `npx shadcn@latest add skeleton` | Pulse animation primitive |
| `<Drawer>`, `<DrawerContent>`, `<DrawerTrigger>` | **Shadcn** `npx shadcn@latest add drawer` | Wraps Vaul. Snap points + iOS feel. |
| `<Sheet>` | **Shadcn** `npx shadcn@latest add sheet` | Side-sliding panel for desktop filters |
| `<Sonner>` toast | **Shadcn** `npx shadcn@latest add sonner` | All success/error notifications |
| `<Form>`, `<FormField>`, `<FormControl>` | **Shadcn** `npx shadcn@latest add form` | React Hook Form + Zod integration |
| `<ToggleGroup>`, `<ToggleGroupItem>` | **Shadcn** `npx shadcn@latest add toggle-group` | Radius selector, view mode toggle |
| `<Tooltip>`, `<TooltipProvider>` | **Shadcn** `npx shadcn@latest add tooltip` | "Why estimated?" hover hints |
| `<Alert>`, `<AlertTitle>`, `<AlertDescription>` | **Shadcn** `npx shadcn@latest add alert` | Empty state shells |
| `<Slider>` | **Shadcn** (if needed) | Continuous radius slider alternative |
| `<HoverCard>` | **Shadcn** (if needed) | Map marker preview on desktop hover |
| **`<TimingBadge>`** | **CUSTOM composition** with Tremor | Score circle uses **Tremor `<ProgressCircle>`** (`@tremor/react`). Custom timing bar (colored full-width pill) is the unique element. |
| **`<PermitLeadCard>`** | **CUSTOM composition** | Uses `<Card>`, `<Avatar>`, `<Badge>`, `<Button>` as building blocks. **Reference patterns:** [shadcn.io block library](https://www.shadcn.io/template/category/block-library). |
| **`<BuilderLeadCard>`** | **CUSTOM composition** | Same — composes Shadcn primitives. **Reference patterns:** shadcn.io blocks for "contact card" + "stats card" layouts. |
| **`<LeadFeed>`** | **CUSTOM container** with `react-infinite-scroll-component` | Single library handles BOTH infinite scroll AND pull-to-refresh — replaces the previous `react-intersection-observer` + `react-simple-pull-to-refresh` combo. |
| **`<LeadFeedHeader>`** | **CUSTOM** | Sticky bar with backdrop-blur. Genuinely simple — no library needed. |
| **`<LeadMapPane>`** | **CUSTOM** with `@vis.gl/react-google-maps` | Uses `AdvancedMarker` for V1. For richer marker visuals in V2, upgrade to OverlayView + createPortal pattern ([reference](https://dawchihliou.github.io/articles/building-custom-google-maps-marker-react-component-like-airbnb-in-nextjs)). |
| **`<EmptyLeadState>`** | **CUSTOM composition** | Composes `<Alert>` + `<Button>` for the three empty states. |
| **`<SkeletonLeadCard>`** | **CUSTOM composition** | Composes `<Skeleton>` primitives to match `<PermitLeadCard>` dimensions exactly. |

**Rule of thumb:** Anything you'd find in shadcn.com/docs/components → install it. Anything that's a feature-specific arrangement of those primitives → build it as a thin composition.

---

### 4.1 LeadFeed (Container)

**File:** `src/features/leads/components/LeadFeed.tsx`

**Purpose:** Top-level feed container. Manages infinite scroll, interleaves permit + builder cards, handles loading/empty states.

**Library:** `react-infinite-scroll-component` (4.15kB) — provides infinite scroll AND pull-to-refresh in a single component. **Replaces** the previous two-library combo (`react-intersection-observer` + `react-simple-pull-to-refresh`) with one battle-tested package.

```tsx
'use client';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLeadFeed } from '../api/useLeadFeed';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { PermitLeadCard } from './PermitLeadCard';
import { BuilderLeadCard } from './BuilderLeadCard';
import { SkeletonLeadCard } from './SkeletonLeadCard';
import { EmptyLeadState } from './EmptyLeadState';
import { LeadFeedHeader } from './LeadFeedHeader';

interface LeadFeedProps {
  tradeSlug: string;
}

export function LeadFeed({ tradeSlug }: LeadFeedProps) {
  const { location, radiusKm } = useLeadFeedState();
  const queryClient = useQueryClient();

  const { data, isLoading, hasNextPage, fetchNextPage } =
    useLeadFeed({
      lat: location?.lat ?? 0,
      lng: location?.lng ?? 0,
      tradeSlug,
      radiusKm,
    });

  // Pull-to-refresh: invalidate ONLY the first page rather than the entire
  // infinite query. Preserves scroll position by NOT replacing the cache.
  // The user sees fresh items prepended at the top while their current
  // scroll position stays put. V2 enhancement: diff page 1 against cached
  // page 1 and animate the new items in.
  const handleRefresh = async () => {
    const result = await queryClient.fetchInfiniteQuery({
      queryKey: ['leadFeed', { 
        lat: Math.round((location?.lat ?? 0) * 1000) / 1000, 
        lng: Math.round((location?.lng ?? 0) * 1000) / 1000, 
        tradeSlug, 
        radiusKm 
      }],
      pages: 1, // Only refetch first page
    });
    const newCount = result?.pages?.[0]?.data?.length ?? 0;
    if (newCount > 0) {
      toast.success(`Updated — ${newCount} leads in your area`);
    }
  };

  if (!location) return <EmptyLeadState reason="no_location" />;
  if (isLoading) return <LoadingFeed />;
  
  const leads = data?.pages.flatMap(p => p.data) ?? [];
  if (leads.length === 0) return <EmptyLeadState reason="no_results" radiusKm={radiusKm} />;

  return (
    <div className="flex flex-col min-h-screen bg-bg-feed">
      <LeadFeedHeader leadCount={data?.pages[0].meta.total ?? 0} />
      <InfiniteScroll
        dataLength={leads.length}
        next={fetchNextPage}
        hasMore={(hasNextPage ?? false) && leads.length < 75 /* V1 hard cap */}
        loader={<><SkeletonLeadCard /><SkeletonLeadCard /></>}
        endMessage={
          <p className="text-center font-display text-sm text-gray-steel py-6">
            {leads.length >= 75 
              ? 'Showing top 75 results — refine your search to see different leads.'
              : "That's all the leads in your area. Pull to refresh."}
          </p>
        }
        // Pull-to-refresh: refetches only page 1, preserves scroll position
        refreshFunction={handleRefresh}
        pullDownToRefresh
        pullDownToRefreshThreshold={67}
        pullDownToRefreshContent={
          <div className="text-center py-3 font-display text-sm text-gray-steel">
            ↓ Pull to refresh
          </div>
        }
        releaseToRefreshContent={
          <div className="text-center py-3 font-display text-sm text-amber-hardhat">
            ↑ Release to refresh
          </div>
        }
        scrollThreshold="80%"
        className="flex flex-col gap-2 px-0 pt-2"
      >
        {leads.map(lead =>
          lead.lead_type === 'permit' ? (
            <PermitLeadCard key={lead.id} lead={lead} />
          ) : (
            <BuilderLeadCard key={lead.id} lead={lead} />
          )
        )}
      </InfiniteScroll>
    </div>
  );
}

function LoadingFeed() {
  return (
    <div className="flex flex-col gap-2 px-0 pt-2 bg-bg-feed min-h-screen">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonLeadCard key={i} />)}
    </div>
  );
}
```

**Why `react-infinite-scroll-component`:**
- **Single library for both behaviors** — infinite scroll + pull-to-refresh in one. Eliminates the manual `useInView` + separate `<PullToRefresh>` wrapper pattern.
- **4.15kB gzipped** — tiny footprint
- **Configurable pull threshold** (default 67px) and scroll threshold (`'80%'` triggers `next` when scrolled past 80% of content)
- **Maintained** — actively used by thousands of projects, well-tested edge cases
- **Built-in `endMessage`** — clean UX for "you've seen everything" state
- **Loader and refresh content slots** — fully customizable visuals

**What was removed:**
- ❌ `react-intersection-observer` (replaced by built-in scroll trigger)
- ❌ `react-simple-pull-to-refresh` (replaced by built-in pull-to-refresh)
- ❌ Manual `useEffect` for scroll trigger
- ❌ Custom `RefreshSpinner` component

**Key decisions:**
- `react-intersection-observer` for infinite scroll (no manual scroll listener)
- `react-simple-pull-to-refresh` wraps the entire feed
- Feed uses `gap-2` (8px) between cards as per spacing discipline
- Edge-to-edge on mobile (no horizontal padding on container)
- Skeleton cards shown during initial load AND during next-page fetch

**Tests:**
- `LeadFeed.logic.test.tsx` — renders cards, interleaves permit/builder, handles empty states, infinite scroll trigger
- `LeadFeed.ui.test.tsx` — pull-to-refresh interaction, 375px viewport

---

### 4.2 LeadFeedHeader (Sticky Filter Bar)

**File:** `src/features/leads/components/LeadFeedHeader.tsx`

```tsx
'use client';
import { useState } from 'react';
import { MapPinIcon } from '@heroicons/react/24/solid';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { LeadFilterSheet } from './LeadFilterSheet';

interface Props {
  leadCount: number;
}

export function LeadFeedHeader({ leadCount }: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const { location, radiusKm } = useLeadFeedState();

  return (
    <>
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[#1C1F26]/80 border-b border-neutral-800">
        <div className="px-4 py-3 flex items-center justify-between min-h-[44px]">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-2 min-h-[44px] -ml-2 pl-2 pr-3 py-1 rounded-md hover:bg-neutral-800/50 active:bg-neutral-800 transition-colors"
            aria-label="Change location or filters"
          >
            <MapPinIcon className="w-4 h-4 text-amber-500" />
            <span className="font-display text-sm font-semibold text-neutral-100">
              {location?.label ?? 'Set location'} · {radiusKm}km
            </span>
          </button>
          <span className="font-data text-xs text-neutral-400">
            {leadCount} leads
          </span>
        </div>
      </header>
      <LeadFilterSheet open={filterOpen} onOpenChange={setFilterOpen} />
    </>
  );
}
```

**Key decisions:**
- `position: sticky` NOT `fixed` (mobile viewport bugs)
- `backdrop-blur-md bg-[#1C1F26]/80` for translucent glass effect
- Touch targets `min-h-[44px]` enforced
- Opens bottom sheet on tap — no separate filter page
- Font tokens from design spec: `font-display` (DM Sans) and `font-data` (IBM Plex Mono)

---

### 4.3 LeadFilterSheet (Shadcn Drawer)

**File:** `src/features/leads/components/LeadFilterSheet.tsx`
**Shadcn primitives used:** `<Drawer>` (wraps Vaul), `<ToggleGroup>`, `<Label>`

```tsx
'use client';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { captureEvent } from '@/lib/observability/capture';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RADIUS_OPTIONS = ['5', '10', '20', '30'] as const;

export function LeadFilterSheet({ open, onOpenChange }: Props) {
  const { radiusKm, setRadius } = useLeadFeedState();

  const handleRadiusChange = (value: string) => {
    if (!value) return; // ToggleGroup can return empty when deselecting
    const km = parseInt(value, 10);
    setRadius(km);
    captureEvent('lead_feed.radius_changed', { from_km: radiusKm, to_km: km });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-bg-card-permit">
        <DrawerHeader>
          <DrawerTitle className="font-display text-lg">Filters</DrawerTitle>
          <DrawerDescription className="font-display text-gray-steel">
            Adjust your search to find the right leads
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 pb-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="radius" className="font-display text-sm text-gray-steel">
              Search radius
            </Label>
            <ToggleGroup
              id="radius"
              type="single"
              value={String(radiusKm)}
              onValueChange={handleRadiusChange}
              className="flex gap-2 justify-start"
            >
              {RADIUS_OPTIONS.map(km => (
                <ToggleGroupItem
                  key={km}
                  value={km}
                  aria-label={`${km} kilometres`}
                  className="min-h-[44px] px-4 font-data data-[state=on]:bg-amber-hardhat data-[state=on]:text-neutral-900"
                >
                  {km}km
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          
          {/* Additional filters: trade, cost range, project type — same pattern */}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

**Why Shadcn `<Drawer>` instead of direct Vaul:**
- Shadcn's `<Drawer>` IS Vaul under the hood (same iOS physics, same cubic-bezier)
- Adds `<DrawerHeader>`, `<DrawerTitle>`, `<DrawerDescription>` for accessibility (proper ARIA labels via Radix UI Dialog primitives)
- Drag handle, overlay, and snap points handled by the wrapper — fewer props to manage
- Consistent with the rest of the Shadcn-based UI

**Why Shadcn `<ToggleGroup>` instead of `.map(km => <button>)`:**
- Single-select radio behavior built in (`type="single"`)
- Keyboard navigation (arrow keys move between options)
- ARIA roles (`radiogroup`, `radio`)
- Active state via `data-[state=on]` selector — clean styling without conditional className strings
- 44px touch targets enforced via `min-h-[44px]` on each item

**Telemetry built in:** Every radius change emits `captureEvent('lead_feed.radius_changed', {...})` for product analytics.

---

### 4.4 PermitLeadCard (Collapsed)

**File:** `src/features/leads/components/PermitLeadCard.tsx`
**Status:** **CUSTOM composition** of Shadcn primitives — see §4.0 Build vs Install
**Shadcn primitives composed:** `<Card>`, `<CardContent>`, `<CardFooter>`, `<Button>`, `<Badge>`, plus custom `<TimingBadge>` and Motion wrapper

> **Phase 3-iii reconciliation note (2026-04-09):** This sample code was written before Phase 1b-iii landed the `LeadFeedItem` discriminated union. The actual prop type is `PermitLeadFeedItem` from `src/features/leads/types.ts`. Field renames vs the sample below:
> - `lead.address` → derived in TS as `formatAddress(lead.street_num, lead.street_name)` (helper in `src/features/leads/lib/format.ts`)
> - `lead.cost_display` → derived in TS as `formatCostDisplay(lead.estimated_cost, lead.cost_tier)` — the SQL projects `cost_tier` + `estimated_cost` (raw DECIMAL), the card formats
> - `lead.timing_display` → present on the type, but it is a **synthetic** display string mapped from `timing_confidence` at the `mapRow` boundary in `get-lead-feed.ts` (`TIMING_DISPLAY_BY_CONFIDENCE` table). The full spec-71 3-tier engine output is **not** in the feed — running the engine per row would join the inspection stage map + calibration table per permit and inflate p95. The detail-view phase (Phase 4) overlays the precise engine output via the `useLeadView` mutation response — no `LeadFeedItem` schema change at that time.
> - `lead.competition_count` → **NOT on the feed prop**. Read from the `useLeadView` mutation cache by `lead_key` per spec 70 §API Endpoints (separate `/api/leads/view` endpoint).
> - `lead.trade_slug` → **NOT on the feed prop**. The card receives `tradeSlug` separately from the parent `LeadFeed` (it's the same for every card in a single feed).
>
> **Refactor note:** The code below shows the original raw-HTML pattern. When implementing Phase 4, replace `<motion.article>` with `<Card>` from `@/components/ui/card`, replace inline `<button>` Save/Directions with `<Button>` variants, and replace inline opportunity pills with `<Badge>` variants. The composition logic stays the same — only the primitive imports change. The Build vs Install table at §4.0 shows the mapping.

```tsx
'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { useLeadView } from '../api/useLeadView';
import { TimingBadge } from './badges/TimingBadge';
import { OpportunityBadge } from './badges/OpportunityBadge';
import { SaveButton } from './badges/SaveButton';
import { PermitLeadCardExpanded } from './PermitLeadCardExpanded';
import type { PermitLead } from '../types';

interface Props {
  lead: PermitLead;
}

export function PermitLeadCard({ lead }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { selectedLeadId, setSelectedLeadId, setHoveredLeadId } = useLeadFeedState();
  const viewMutation = useLeadView();

  const active = selectedLeadId === lead.permit_num;
  const timingColorBorder = getTimingBorderColor(lead.timing_score);
  const isHeuristic = lead.timing_confidence !== 'high';

  const handleClick = () => {
    if (!expanded) {
      // Record view on first tap
      viewMutation.mutate({
        lead_type: 'permit',
        permit_num: lead.permit_num,
        revision_num: lead.revision_num,
        trade_slug: lead.trade_slug,
        action: 'view',
      });
      setSelectedLeadId(lead.permit_num);
    }
    setExpanded(!expanded);
  };

  return (
    <motion.article
      layout
      className={`
        bg-[#272B33] rounded-lg overflow-hidden cursor-pointer
        ${active ? 'ring-2 ring-amber-500' : ''}
      `}
      style={{
        borderLeft: `4px ${isHeuristic ? 'dashed' : 'solid'} ${timingColorBorder}`,
      }}
      onMouseEnter={() => setHoveredLeadId(lead.permit_num)}
      onMouseLeave={() => setHoveredLeadId(null)}
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      aria-label={`Permit lead: ${lead.address}, ${lead.distance_m}m away`}
    >
      {/* Collapsed header row: thumbnail + address + distance */}
      <div className="flex gap-3 p-4">
        <StreetViewThumbnail
          lat={lead.latitude}
          lng={lead.longitude}
          size="80x60"
          className="w-20 h-15 rounded-md shrink-0 bg-neutral-800"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-neutral-100 truncate">
            {lead.address}
          </h3>
          <p className="font-display text-sm text-neutral-400 truncate">
            {lead.neighbourhood_name}
          </p>
          <p className={`font-data text-sm mt-1 ${lead.distance_m < 1000 ? 'text-amber-500' : 'text-neutral-300'}`}>
            {formatDistance(lead.distance_m)}
          </p>
        </div>
      </div>

      {/* Timing badge */}
      <div className="px-4 pb-3">
        <TimingBadge
          display={lead.timing_display}
          confidence={lead.timing_confidence}
          score={lead.relevance_score}
        />
      </div>

      {/* Cost + type */}
      <div className="px-4 pb-3 space-y-1">
        <p className="font-data text-sm">
          <span className={getCostColor(lead.cost_tier)}>
            {lead.cost_display}
          </span>
          <span className="text-neutral-400"> · {formatCostTier(lead.cost_tier)}</span>
        </p>
        <p className="font-display text-sm text-neutral-400 truncate">
          {lead.permit_type}
        </p>
      </div>

      {/* Opportunity + competition */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <OpportunityBadge type={lead.opportunity_type} builderName={lead.legal_name} />
        {lead.competition_count > 0 && (
          <span className="font-data text-xs text-neutral-500">
            👁 {lead.competition_count}
          </span>
        )}
      </div>

      {/* Expanded details (tap to reveal) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <PermitLeadCardExpanded lead={lead} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action row */}
      <div className="flex border-t border-neutral-800">
        <SaveButton leadId={lead.permit_num} leadType="permit" tradeSlug={lead.trade_slug} />
        <Link
          href={`https://maps.google.com/?daddr=${lead.latitude},${lead.longitude}`}
          target="_blank"
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-blue-400 hover:bg-neutral-800/50 font-display text-sm font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          ↗ Directions
        </Link>
      </div>
    </motion.article>
  );
}

function getTimingBorderColor(score: number): string {
  if (score >= 25) return '#F59E0B'; // amber - NOW
  if (score >= 20) return '#10B981'; // green - Soon
  if (score >= 10) return '#3B82F6'; // blue - Upcoming
  return '#6B7280'; // gray - Distant
}

function getCostColor(tier: string): string {
  const colors: Record<string, string> = {
    small: 'text-neutral-400',
    medium: 'text-neutral-300',
    large: 'text-neutral-100 font-semibold',
    major: 'text-amber-500 font-semibold',
    mega: 'text-red-400 font-semibold',
  };
  return colors[tier] ?? 'text-neutral-300';
}

function formatDistance(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatCostTier(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1) + ' Job';
}
```

**Key decisions:**
- `motion.article` with `layout` prop for smooth expand/collapse
- Left border color computed from timing score; dashed if heuristic (per design spec)
- `whileTap={{ scale: 0.98 }}` with `stiffness: 400, damping: 30` (from research)
- Hover syncs with Zustand store (desktop), touch syncs via click
- Record view on first expansion (optimistic via useLeadView)
- `active` ring from `selectedLeadId` — enables map-marker-click → card-highlight
- Stops propagation on Directions link to avoid double-handling
- `AnimatePresence` wraps the expanded section for smooth unmount

---

### 4.5 BuilderLeadCard

**File:** `src/features/leads/components/BuilderLeadCard.tsx`
**Status:** **CUSTOM composition** of Shadcn primitives — see §4.0 Build vs Install
**Shadcn primitives composed:** `<Card>`, `<CardContent>`, `<CardFooter>`, `<Avatar>`, `<AvatarImage>`, `<AvatarFallback>`, `<Badge>`, `<Button>`

> **Phase 3-iii reconciliation note (2026-04-09):** Field renames vs the sample below — actual prop type is `BuilderLeadFeedItem`:
> - `lead.legal_name` → `lead.legal_name`
> - `lead.phone` → `lead.primary_phone` (sanitize digits-only via `sanitizeTelHref()` before building the `tel:` URL — source data is dirty)
> - `lead.closest_permit_m` → `lead.distance_m` (same number, just renamed in the type)
> - `lead.wsib_registered` → **NOT on the feed prop in 3-iii.** The current builder CTE WHERE clause requires a WSIB row, so every builder in the feed is registered — adding the column would always be `true`. When the feed widens to include non-WSIB builders, add the column then; for now the card omits the WSIB badge entirely.
> - `lead.active_permits_nearby` → present (`int`)
> - `lead.avg_project_cost` → present (`number | null`)
> - `lead.trade_slug` → **NOT on the feed prop.** Same as PermitLeadCard — passed from the parent `LeadFeed`.
> - `navigator.vibrate(10)` haptic call → keep but feature-detect (`'vibrate' in navigator`); iOS Safari does not implement the Vibration API.

> **Refactor note:** The code below shows the original raw-HTML pattern. When implementing Phase 4:
> - Replace the avatar `<div>` block with `<Avatar><AvatarImage src={lead.photo_url} /><AvatarFallback>{initials}</AvatarFallback></Avatar>` — fallback chain handled automatically
> - Replace WSIB pill with `<Badge variant="outline" className="text-green-safety">`
> - Replace `<motion.button>` Call with `<Button variant="default" size="lg">` (amber via `bg-amber-hardhat`)
> - Replace `<a>` Website with `<Button variant="outline" asChild><a href={...}>` pattern (Shadcn `asChild` for polymorphism)
> - Wrap the card itself in `<Card>` from `@/components/ui/card` instead of `<motion.article>`

```tsx
'use client';
import { motion } from 'motion/react';
import { PhoneIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { SaveButton } from './badges/SaveButton';
import type { BuilderLead } from '../types';

interface Props {
  lead: BuilderLead;
}

export function BuilderLeadCard({ lead }: Props) {
  const handleCall = () => {
    if ('vibrate' in navigator) navigator.vibrate(10);
    window.location.href = `tel:${lead.primary_phone?.replace(/\D/g, '')}`;
  };

  return (
    <motion.article
      className="bg-[#1A2332] rounded-lg overflow-hidden"
      style={{ borderLeft: '3px solid #F59E0B' }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      aria-label={`Builder lead: ${lead.legal_name}`}
    >
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3 p-4">
        <BuilderAvatar 
          photoUrl={lead.photo_url} 
          name={lead.legal_name} 
          className="w-12 h-12 rounded-md shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-neutral-100 truncate">
            {lead.legal_name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-display text-sm text-neutral-400">
              {lead.business_size}
            </span>
            {/* REMOVED in Phase 3-iii — `wsib_registered` is not on
                BuilderLeadFeedItem. The current builder CTE WHERE
                requires a WSIB row, so every builder in the feed is
                already WSIB-registered. Re-add when the feed widens
                to include non-WSIB builders. See §4.5 reconciliation
                note above. */}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pb-3">
        <p className="font-display text-sm font-semibold text-neutral-100">
          🏗 {lead.active_permits_nearby} active permits within {Math.round(lead.distance_m / 1000 * 10) / 10}km
        </p>
        <p className="font-data text-xs text-neutral-400 mt-1">
          Closest: {formatDistance(lead.distance_m)}
          {lead.avg_project_cost && ` · Avg: $${formatCompact(lead.avg_project_cost)}`}
        </p>
      </div>

      {/* Action row */}
      <div className="flex border-t border-neutral-800">
        {lead.primary_phone && (
          <motion.button
            onClick={handleCall}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-amber-500 text-neutral-900 font-display text-sm font-semibold active:bg-amber-600"
            whileTap={{ scale: 0.95 }}
          >
            <PhoneIcon className="w-4 h-4" />
            Call
          </motion.button>
        )}
        {lead.website && (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-blue-400 hover:bg-neutral-800/50 font-display text-sm font-semibold border-l border-neutral-800"
          >
            <GlobeAltIcon className="w-4 h-4" />
            Website
          </a>
        )}
        <div className="border-l border-neutral-800">
          <SaveButton leadId={String(lead.entity_id)} leadType="builder" tradeSlug={lead.trade_slug} />
        </div>
      </div>
    </motion.article>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
```

**Key decisions:**
- Navy background `#1A2332` visually distinct from permit cards
- Solid 3px amber left border (no timing color — builders don't have timing)
- Call button is primary amber CTA (tap-to-call via `tel:` link)
- Haptic feedback on call (`navigator.vibrate(10)`)
- Website button secondary (blue, outlined)
- Avatar component handles OG image → favicon → initial letter fallback

---

### 4.6 TimingBadge

**File:** `src/features/leads/components/badges/TimingBadge.tsx`
**Status:** **CUSTOM composition** using Tremor `<ProgressCircle>` + custom timing bar
**Library used:** `@tremor/react` for the score circle (saves us from building a custom doughnut chart)

```tsx
import { ClockIcon } from '@heroicons/react/24/outline';
import { ProgressCircle } from '@tremor/react';

interface Props {
  display: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
}

export function TimingBadge({ display, confidence, score }: Props) {
  const tone = getTone(score);
  
  return (
    <div className="flex items-center justify-between gap-2">
      {/* Custom timing bar — the unique element. No primitive matches the
          colored full-width pill + clock icon + "est." indicator combo. */}
      <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md ${tone.bg} ${tone.text} min-h-[44px]`}>
        <ClockIcon className="w-4 h-4 shrink-0" />
        <span className="font-display text-sm font-semibold leading-tight">
          {display}
        </span>
        {confidence !== 'high' && (
          <span className="font-data text-[10px] opacity-75 ml-auto">est.</span>
        )}
      </div>
      
      {/* Tremor ProgressCircle — battle-tested SVG doughnut.
          Variant prop maps score range to color. Children render in center. */}
      <ProgressCircle
        value={score}
        max={100}
        size="md"
        color={tone.tremorColor}
        radius={24}
        strokeWidth={4}
        className="shrink-0"
      >
        <span className="font-data text-sm font-bold text-neutral-100">{score}</span>
      </ProgressCircle>
    </div>
  );
}

type Tone = { bg: string; text: string; tremorColor: 'amber' | 'emerald' | 'blue' | 'gray' };

function getTone(score: number): Tone {
  if (score >= 25) return { bg: 'bg-amber-hardhat', text: 'text-neutral-900', tremorColor: 'amber' };  // NOW
  if (score >= 20) return { bg: 'bg-green-safety', text: 'text-neutral-900', tremorColor: 'emerald' }; // Soon
  if (score >= 10) return { bg: 'bg-blue-blueprint', text: 'text-neutral-100', tremorColor: 'blue' };  // Upcoming
  return { bg: 'bg-gray-concrete', text: 'text-neutral-100', tremorColor: 'gray' };                    // Distant
}
```

**Why Tremor `<ProgressCircle>` for the score:**
- 35+ accessible dashboard primitives, MIT/Apache licensed, copy-paste like Shadcn
- Built on Recharts + Radix UI — proven SVG doughnut without us writing path math
- `value` + `max` props handle the 0-100 score → arc rendering automatically
- `color` prop accepts Tremor's color palette which maps cleanly to our timing tones
- Children render in the center — perfect for the score number display

**Why the timing bar stays custom:**
- The hybrid layout (full-width colored pill + leading icon + trailing "est." badge + dashed/solid border for confidence) doesn't match any pre-built primitive
- Composed entirely from Tailwind utility classes — minimal code

**Token reminder:** Uses construction-material color tokens (`bg-amber-hardhat`, `bg-green-safety`, `bg-blue-blueprint`, `bg-gray-concrete`) from the Tailwind config in §6.

---

### 4.7 SaveButton

**File:** `src/features/leads/components/badges/SaveButton.tsx`
**Shadcn primitives used:** `<Button variant="ghost">`
**Custom additions:** Motion wrapper for spring bounce, Sonner toast feedback

```tsx
'use client';
import { motion } from 'motion/react';
import { useState } from 'react';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { captureEvent } from '@/lib/observability/capture';
import { useLeadView } from '../../api/useLeadView';

interface Props {
  leadId: string;
  leadType: 'permit' | 'builder';
  tradeSlug: string;
}

const MotionButton = motion(Button);

export function SaveButton({ leadId, leadType, tradeSlug }: Props) {
  const [saved, setSaved] = useState(false);
  const viewMutation = useLeadView();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ('vibrate' in navigator) navigator.vibrate(10);
    const newSaved = !saved;
    setSaved(newSaved);
    
    captureEvent(newSaved ? 'lead_feed.lead_saved' : 'lead_feed.lead_unsaved', {
      lead_type: leadType,
      lead_id: leadId,
      trade_slug: tradeSlug,
    });
    
    viewMutation.mutate({
      lead_type: leadType,
      permit_num: leadType === 'permit' ? leadId : undefined,
      entity_id: leadType === 'builder' ? Number(leadId) : undefined,
      trade_slug: tradeSlug,
      action: newSaved ? 'save' : 'unsave',
    }, {
      onSuccess: () => {
        toast.success(newSaved ? 'Saved to your leads' : 'Removed from saved');
      },
      onError: () => {
        setSaved(!newSaved); // rollback
        toast.error('Could not save — please try again');
      },
    });
  };

  return (
    <MotionButton
      variant="ghost"
      size="lg"
      onClick={handleClick}
      className="flex-1 min-h-[44px]"
      animate={{ scale: saved ? [1, 1.3, 1] : 1 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20, mass: 1 }}
      aria-label={saved ? 'Remove from saved' : 'Save lead'}
    >
      {saved ? (
        <HeartSolid className="w-5 h-5 text-amber-hardhat mr-2" />
      ) : (
        <HeartOutline className="w-5 h-5 text-gray-steel mr-2" />
      )}
      <span className={saved ? 'text-amber-hardhat' : 'text-gray-steel'}>
        {saved ? 'Saved' : 'Save'}
      </span>
    </MotionButton>
  );
}
```

**Why Shadcn `<Button variant="ghost">`:**
- Built-in focus management, keyboard activation, ARIA roles
- `size="lg"` already enforces `min-h-[44px]` for touch targets
- We wrap it with Motion (`motion(Button)`) to layer the spring physics on top
- Variant system means consistent styling across save buttons everywhere

**New additions in this refactor:**
- **Sonner toast feedback** — `toast.success()` / `toast.error()` for save confirmation
- **Optimistic rollback** — if the API fails, revert the saved state and show error toast
- **`captureEvent()` telemetry** — both save and unsave actions tracked
- Construction-material color tokens (`amber-hardhat`, `gray-steel`) instead of raw Tailwind

---

### 4.8 SkeletonLeadCard

**File:** `src/features/leads/components/SkeletonLeadCard.tsx`
**Shadcn primitives used:** `<Card>`, `<CardContent>`, `<Skeleton>`

```tsx
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonLeadCard() {
  return (
    <Card className="bg-card-permit border-l-4 border-l-neutral-700">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Thumbnail 80x60 */}
          <Skeleton className="w-20 h-15 rounded-md shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {/* Timing badge placeholder */}
        <Skeleton className="h-11 mt-3 w-full" />
        {/* Cost line */}
        <Skeleton className="h-3 mt-3 w-2/3" />
        {/* Metadata lines */}
        <div className="space-y-2 mt-2">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}
```

**Why Shadcn `<Skeleton>`:** Provides the pulse animation primitive consistently. We compose it inside `<Card>` so the dimensions match `PermitLeadCard` exactly — preventing CLS during skeleton → real card transitions. The `border-l-4` placeholder mirrors the timing color border that real cards will have.

---

### 4.9 EmptyLeadState

**File:** `src/features/leads/components/EmptyLeadState.tsx`

```tsx
import { MapPinIcon, MagnifyingGlassIcon, WifiIcon } from '@heroicons/react/24/outline';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { captureEvent } from '@/lib/observability/capture';

interface Props {
  reason: 'no_location' | 'no_results' | 'offline';
  radiusKm?: number;
}

export function EmptyLeadState({ reason, radiusKm }: Props) {
  const { setRadius } = useLeadFeedState();

  // Detect offline state if not explicitly passed
  const isOffline = reason === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine);

  if (isOffline) {
    captureEvent('lead_feed.empty_state_shown', { reason: 'offline' });
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-feed p-6">
        <Alert className="max-w-sm bg-bg-card-permit border-neutral-700">
          <WifiIcon className="w-5 h-5" />
          <AlertTitle className="font-display">You're offline</AlertTitle>
          <AlertDescription className="font-display text-gray-steel">
            Showing cached results. Pull down to refresh when you're back online.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (reason === 'no_location') {
    captureEvent('lead_feed.empty_state_shown', { reason: 'no_location' });
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-feed p-6">
        <Alert className="max-w-sm bg-bg-card-permit border-neutral-700">
          <MapPinIcon className="w-5 h-5" />
          <AlertTitle className="font-display">Location needed for leads</AlertTitle>
          <AlertDescription className="font-display text-gray-steel mb-4">
            Enable GPS or set your home base to see nearby opportunities.
          </AlertDescription>
          <div className="flex gap-2 flex-wrap">
            <Button size="lg" variant="default">
              Enable Location
            </Button>
            <Button size="lg" variant="outline">
              Set Home Base
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  // no_results
  captureEvent('lead_feed.empty_state_shown', { reason: 'no_results', radius_km: radiusKm });
  const newRadius = (radiusKm ?? 10) * 2;
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-feed p-6">
      <Alert className="max-w-sm bg-bg-card-permit border-neutral-700">
        <MagnifyingGlassIcon className="w-5 h-5" />
        <AlertTitle className="font-display">No leads within {radiusKm}km</AlertTitle>
        <AlertDescription className="font-display text-gray-steel mb-4">
          Try expanding your search radius to see more opportunities.
        </AlertDescription>
        <Button size="lg" variant="default" onClick={() => setRadius(newRadius)}>
          Expand to {newRadius}km
        </Button>
      </Alert>
    </div>
  );
}
```

**Why Shadcn `<Alert>` + `<Button>`:**
- `<Alert>` provides the icon + title + description structure with proper ARIA role (`alert`)
- `<Button size="lg">` enforces 44px touch targets automatically
- Variant system (`default`, `outline`) keeps styling consistent
- Three states: `no_location`, `no_results`, `offline` (auto-detected via `navigator.onLine`)
- All three emit `captureEvent('lead_feed.empty_state_shown')` so we can measure how often users hit each
- Uses construction-material color tokens from Tailwind config (`bg-feed`, `bg-card-permit`, `gray-steel`)

---

### 4.10 LeadMapPane (Desktop Sidebar)

**File:** `src/features/leads/components/LeadMapPane.tsx`
**Library:** `@vis.gl/react-google-maps` (the official Google wrapper supporting `AdvancedMarkerElement`)
**Pattern:** OverlayView + React `createPortal` for fully custom React-rendered markers — based on Daw-Chih Liou's Airbnb-marker pattern (see references)

```tsx
'use client';
import { useEffect, useRef, useCallback } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { createPortal } from 'react-dom';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import { useLeadFeed } from '../api/useLeadFeed';
import type { LeadFeedItem } from '../types';

interface Props {
  tradeSlug: string;
}

/**
 * OverlayView factory — wraps google.maps.OverlayView in a closure to avoid
 * Next.js build errors. The class declaration must happen after the Maps API
 * has loaded, otherwise SSR fails. Pattern from:
 * https://dawchihliou.github.io/articles/building-custom-google-maps-marker-react-component-like-airbnb-in-nextjs
 */
function createOverlay(
  container: HTMLElement,
  pane: keyof google.maps.MapPanes,
  position: google.maps.LatLngLiteral
) {
  class CustomOverlay extends google.maps.OverlayView {
    private container: HTMLElement;
    private pane: keyof google.maps.MapPanes;
    private position: google.maps.LatLngLiteral;
    
    constructor(container: HTMLElement, pane: keyof google.maps.MapPanes, position: google.maps.LatLngLiteral) {
      super();
      this.container = container;
      this.pane = pane;
      this.position = position;
    }
    
    onAdd() {
      const panes = this.getPanes();
      panes?.[this.pane].appendChild(this.container);
    }
    
    draw() {
      const projection = this.getProjection();
      const point = projection?.fromLatLngToDivPixel(new google.maps.LatLng(this.position));
      if (point) {
        this.container.style.position = 'absolute';
        this.container.style.left = `${point.x}px`;
        this.container.style.top = `${point.y}px`;
      }
    }
    
    onRemove() {
      this.container.parentNode?.removeChild(this.container);
    }
  }
  return new CustomOverlay(container, pane, position);
}

export function LeadMapPane({ tradeSlug }: Props) {
  const map = useMap();
  const { location, radiusKm, hoveredLeadId, selectedLeadId, setSelectedLeadId, setHoveredLeadId } = useLeadFeedState();
  const [mapsFailed, setMapsFailed] = useState(false);
  
  // Subscribe to the SAME query key as LeadFeed. TanStack Query deduplicates —
  // one network request, two consumers. The map gets the exact same data the
  // feed is rendering, with zero coordination code.
  const { data } = useLeadFeed({
    lat: location?.lat ?? 0,
    lng: location?.lng ?? 0,
    tradeSlug,
    radiusKm,
  });
  const leads = data?.pages.flatMap(p => p.data) ?? [];

  // Map load failure fallback — show a static neighbourhood placeholder
  // instead of a broken map div. Common in restrictive networks (corporate
  // firewalls, regions where Google Maps is blocked).
  if (mapsFailed) {
    return (
      <div className="hidden lg:flex sticky top-0 h-screen bg-bg-feed items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <MapIcon className="w-12 h-12 text-gray-steel mx-auto mb-4" />
          <h3 className="font-display text-lg text-neutral-100 mb-2">Map unavailable</h3>
          <p className="font-display text-sm text-gray-steel">
            We can't load the map right now. The lead list still works — addresses are shown on each card.
          </p>
        </div>
      </div>
    );
  }

  // Marker clustering for >50 markers — Google Maps performance falls off
  // a cliff above ~200 markers. We use @googlemaps/markerclusterer when
  // leads > 50, otherwise render markers individually for hover detail.
  const useClustering = leads.length > 50;
  
  // Map pan debouncing — when the user pans the map, each pan event
  // generates a new center lat/lng. Without debouncing, every pan would
  // create a new query key and trigger a refetch, exploding the cache and
  // hammering the API. Debounce the map-driven location updates to 500ms
  // so the query only refetches after the user stops panning.
  const onMapPan = useDebouncedCallback((newCenter: { lat: number; lng: number }) => {
    setLocation(newCenter);
  }, 500);

  return (
    <div className="hidden lg:block sticky top-0 h-screen bg-bg-feed">
      <Map
        defaultCenter={{ lat: 43.6532, lng: -79.3832 }}
        defaultZoom={11}
        gestureHandling="cooperative"
        disableDefaultUI={false}
        mapId="lead-map" // Required for AdvancedMarker
        onError={() => setMapsFailed(true)} // Catches Maps JS load failures
      >
        {leads.map(lead => {
          if (!lead.latitude || !lead.longitude) return null;
          const isActive = selectedLeadId === lead.id || hoveredLeadId === lead.id;
          return (
            <AdvancedMarker
              key={lead.id}
              position={{ lat: lead.latitude, lng: lead.longitude }}
              onClick={() => setSelectedLeadId(lead.id)}
              onMouseEnter={() => setHoveredLeadId(lead.id)}
              onMouseLeave={() => setHoveredLeadId(null)}
            >
              <CustomMarker lead={lead} active={isActive} />
            </AdvancedMarker>
          );
        })}
      </Map>
    </div>
  );
}

/**
 * CustomMarker — fully React-rendered marker. Because @vis.gl/react-google-maps
 * supports AdvancedMarker which accepts arbitrary React children, we can use
 * Tailwind, Motion, hover states, etc. — anything React can render.
 */
function CustomMarker({ lead, active }: { lead: LeadFeedItem; active: boolean }) {
  return (
    <div
      className={`
        px-3 py-1 rounded-full font-data text-xs font-bold shadow-lg
        transition-all duration-150
        ${active 
          ? 'bg-amber-hardhat text-neutral-900 scale-110 z-10' 
          : 'bg-bg-card-permit text-neutral-100 hover:scale-105'}
      `}
    >
      {lead.lead_type === 'permit' && lead.cost_tier === 'major' ? '$$$$' : '$$'}
    </div>
  );
}
```

**Why `@vis.gl/react-google-maps`:**
- Official Google library — actively maintained, supports `AdvancedMarkerElement` (the new marker API)
- React-native lifecycle — markers are React components, no manual DOM manipulation
- Built-in event handlers (`onClick`, `onMouseEnter`, `onMouseLeave`) eliminate manual hover state plumbing

**Why the OverlayView + createPortal pattern is referenced:**
- For markers that need the FULL power of React (Motion animations, complex compositions, conditional rendering trees), AdvancedMarker's child rendering has limitations
- The OverlayView pattern wraps `google.maps.OverlayView` and uses `createPortal` to render React trees inside the overlay container
- Reference: [Daw-Chih Liou's article](https://dawchihliou.github.io/articles/building-custom-google-maps-marker-react-component-like-airbnb-in-nextjs)
- For V1 we use AdvancedMarker (simpler). If we need richer marker visuals (e.g., expanded preview cards on hover), we upgrade to OverlayView pattern in V2.

**Map ↔ List sync:**
- Hovering a list card sets `hoveredLeadId` in Zustand → marker re-renders with `active={true}` styling
- Clicking a marker sets `selectedLeadId` → list parent calls `cardRef.scrollIntoView()` to bring the matching card into view
- Bidirectional, no prop drilling, single source of truth in Zustand store

**Active state priority (race condition resolution):** When a user is simultaneously hovering one card and has selected another, `selectedLeadId` wins. The `isActive` check is `selectedLeadId === lead.id || (selectedLeadId === null && hoveredLeadId === lead.id)` — selection is sticky, hover is a transient preview that only highlights when nothing is selected. Clicking elsewhere clears `selectedLeadId` to allow hover preview again.

**Key decisions:**
- Hidden on mobile (`hidden lg:block`)
- `mapId="lead-map"` required for AdvancedMarker (Google's new marker API)
- `gestureHandling="cooperative"` prevents accidental scroll-zoom on desktop
- Custom markers use construction-material color tokens for consistency with cards

---

## 5. Feed Page Layout (Desktop + Mobile)

**File:** `src/app/leads/page.tsx`

```tsx
import { Suspense } from 'react';
import { LeadFeed } from '@/features/leads/components/LeadFeed';
import { LeadMapPane } from '@/features/leads/components/LeadMapPane';
import { requireAuth } from '@/lib/auth/server';

export default async function LeadsPage() {
  const user = await requireAuth();
  const tradeSlug = user.profile.trade_slug ?? 'plumbing';

  return (
    <main className="lg:grid lg:grid-cols-[500px_1fr] lg:gap-0 min-h-screen bg-[#1C1F26]">
      <div className="overflow-y-auto max-h-screen">
        <LeadFeed tradeSlug={tradeSlug} />
      </div>
      <LeadMapPane tradeSlug={tradeSlug} />
    </main>
  );
}
```

**Key decisions:**
- Server Component for auth check + layout shell only — does NOT fetch lead data
- All data fetching happens client-side via TanStack Query in `LeadFeed` and `LeadMapPane`
- Both child components subscribe to the same query key — TanStack Query deduplicates the network request
- No `Suspense` boundary needed because there's no server-side data dependency. Loading states are handled by the components themselves via TanStack Query's `isLoading`.
- Desktop grid `lg:grid-cols-[500px_1fr]` — feed fixed 500px, map fills rest (Zillow pattern)
- Mobile: single column (grid breaks on `< lg`)
- **V2 SSR upgrade path:** Implement `dehydrate` + `<HydrationBoundary>` from TanStack Query to enable server-side prefetch with hydration. Adds first-paint speed at the cost of complexity. Defer to V2.

---

## 6. Tailwind Config Additions

**File:** `tailwind.config.ts` (update existing)

```ts
export default {
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        data: ['var(--font-ibm-plex-mono)', 'SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Surfaces
        'bg-feed': '#1C1F26',
        'bg-card-permit': '#272B33',
        'bg-card-builder': '#1A2332',
        'bg-elevated': '#31363F',
        
        // Semantic (construction-material naming from Procore inspiration)
        'gray-concrete': '#6B7280',
        'gray-steel': '#9CA3AF',
        'amber-hardhat': '#F59E0B',
        'green-safety': '#10B981',
        'blue-blueprint': '#3B82F6',
        'red-stop': '#EF4444',
      },
      spacing: {
        '15': '3.75rem',  // 60px for 80x60 thumbnails
      },
    },
  },
};
```

**Font loading** in `src/app/layout.tsx`:
```tsx
import { DM_Sans, IBM_Plex_Mono } from 'next/font/google';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });
const ibmPlexMono = IBM_Plex_Mono({ 
  subsets: ['latin'], 
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
});
```

---

## 7. Dependencies to Install

```bash
npm install \
  @tanstack/react-query \
  @tanstack/react-query-persist-client \
  @tanstack/query-async-storage-persister \
  @tanstack/react-virtual \
  @tremor/react \
  @vis.gl/react-google-maps \
  idb-keyval \
  @upstash/ratelimit \
  @upstash/redis \
  zustand \
  motion@^11.0.0 \
  react-infinite-scroll-component \
  react-hook-form \
  @hookform/resolvers \
  zod \
  unfurl.js
```

**Version pins:**
- `motion@^11.0.0` — uses the modern `motion/react` import (LazyMotion API). Earlier versions have a different import path that breaks our component examples.
- `@tanstack/react-virtual` — promoted from V2 to V1 dependency. Used as the **fallback** for `react-infinite-scroll-component` if it proves unmaintained or buggy. The infinite scroll component hasn't had a release since 2022 — if Phase 4 testing exposes critical issues, swap to TanStack Virtual + a custom pull-to-refresh handler. Both libraries should be installed from day 1 so the swap is contained.

**What each solves:**
- `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` + `idb-keyval` → offline cache persistence (H1)
- `@tremor/react` → `<ProgressCircle>` for TimingBadge score (battle-tested SVG doughnut)
- `@vis.gl/react-google-maps` → official Google Maps wrapper with AdvancedMarker support
- `@upstash/ratelimit` + `@upstash/redis` → rate limiting on API routes (C5)
- `unfurl.js` → SSRF-safe OG image extraction in pipeline (C1)
- `zustand` → map/list state sync without Redux
- `motion` → spring animations (heart button, card expand)
- `react-infinite-scroll-component` → infinite scroll AND pull-to-refresh in one (4.15kB)
- `react-hook-form` + `@hookform/resolvers` → form management with Zod validation

**Removed from earlier draft (replaced by single library):**
- ❌ `react-intersection-observer` (replaced by `react-infinite-scroll-component`)
- ❌ `react-simple-pull-to-refresh` (replaced by `react-infinite-scroll-component`)

Note: `vaul` is NOT installed directly — Shadcn's `<Drawer>` (installed via `npx shadcn@latest add drawer`) wraps it.

**Pipeline-only (install in `scripts/` context):**
- `unfurl.js` runs in the Node pipeline `scripts/enrich-wsib.js`, never on the API server

**Environment variables needed:**
```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
SENTRY_DSN=...
SENTRY_AUTH_TOKEN=... (build-time only, for source map upload)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
ADMIN_API_KEY=... (CI/script access)
```

For dev dependencies, existing Vitest + RTL are sufficient.

---

## 7a. Foundation Tooling Stack (Adopted 2026-04-07)

This section codifies the foundation tools chosen during the WF3 review of the original "Mess Monster" proposal. Each was evaluated against Buildo's existing stack. Reference: `00_engineering_standards.md` §12 + §13.

### Frontend logic linting — Biome (scoped)
```bash
npm install --save-dev @biomejs/biome
npx @biomejs/biome init
```

`biome.json` (lints `src/features/leads/` only initially):
```json
{
  "files": {
    "include": ["src/features/leads/**/*.{ts,tsx}"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noFloatingPromises": "error",
        "useHookAtTopLevel": "error",
        "useExhaustiveDependencies": "error"
      }
    }
  },
  "formatter": { "enabled": false }
}
```

**Why scoped:** ESLint already lints the rest of the codebase. Biome's value is the strict React rules — apply them where the new code lives, expand once proven.

### Telemetry & feature flags — PostHog
```bash
npm install posthog-js
```

`src/lib/observability/capture.ts`:
```typescript
import posthog from 'posthog-js';

type EventName = 
  | 'lead_feed.viewed'
  | 'lead_feed.lead_clicked'
  | 'lead_feed.lead_expanded'
  | 'lead_feed.lead_saved'
  | 'lead_feed.lead_unsaved'
  | 'lead_feed.builder_called'
  | 'lead_feed.builder_website_opened'
  | 'lead_feed.directions_opened'
  | 'lead_feed.filter_changed'
  | 'lead_feed.radius_changed'
  | 'lead_feed.location_set'
  | 'lead_feed.error_displayed'
  | 'lead_feed.empty_state_shown';

let initialized = false;
// Queue for events fired before PostHog finishes loading. The init race
// is real — components on the lead feed route can render and emit events
// in the same tick as the layout-level init call. Without this queue,
// early events would be silently dropped.
const eventQueue: Array<{ name: EventName; properties?: Record<string, unknown> }> = [];

export function initObservability() {
  if (typeof window === 'undefined' || initialized) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // We capture manually with route context
    autocapture: false, // Strict explicit events only
    loaded: () => {
      initialized = true;
      // Drain queued events that fired before init completed
      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        posthog.capture(event.name, { ...event.properties, timestamp: new Date().toISOString() });
      }
    },
  });
}

export function captureEvent(name: EventName, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!initialized) {
    // Queue the event — the loaded() callback will drain it
    eventQueue.push({ name, properties });
    return;
  }
  posthog.capture(name, {
    ...properties,
    timestamp: new Date().toISOString(),
  });
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  posthog.identify(userId, traits);
}

export function isFeatureEnabled(flag: string): boolean {
  if (typeof window === 'undefined') return false;
  return posthog.isFeatureEnabled(flag) ?? false;
}
```

**Initialize once in `app/layout.tsx`** (client component wrapper). Wrap the lead feed route in `isFeatureEnabled('lead_feed_v1')`.

### Error tracking — Sentry
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Wired into route-level `error.tsx`:
```typescript
'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function LeadsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest, route: '/leads' } });
  }, [error]);
  return (/* UI */);
}
```

### SQL linting — SQLFluff (new migrations only)
```bash
pip install sqlfluff
```

`.sqlfluff`:
```ini
[sqlfluff]
dialect = postgres
exclude_rules = structure.subqueries, layout.long_lines

[sqlfluff:indentation]
tab_space_size = 2
```

`package.json` script:
```json
"sql:lint:new": "git diff --name-only origin/main...HEAD -- 'migrations/*.sql' | xargs -r sqlfluff lint --dialect postgres"
```

### Migration safety validator (NEW script)
`scripts/validate-migration.js`:
```javascript
#!/usr/bin/env node
/**
 * Pre-commit validator for new migration files. Catches dangerous patterns.
 * Usage: node scripts/validate-migration.js migrations/070_new_thing.sql
 */
const fs = require('fs');
const path = require('path');

const DESTRUCTIVE_PATTERNS = [
  { rx: /\bDROP\s+TABLE\b/i, msg: 'DROP TABLE detected — requires explicit user confirmation comment "-- CONFIRMED DESTRUCTIVE"' },
  { rx: /\bDROP\s+COLUMN\b/i, msg: 'DROP COLUMN detected — requires explicit user confirmation comment "-- CONFIRMED DESTRUCTIVE"' },
  { rx: /\bTRUNCATE\b/i, msg: 'TRUNCATE detected — requires explicit user confirmation comment' },
];

const REQUIRED_PATTERNS = [
  { rx: /--\s*DOWN/i, msg: 'Missing -- DOWN section. All migrations must be reversible.' },
];

const WARNINGS = [
  { rx: /CREATE\s+INDEX(?!\s+CONCURRENTLY)/i, msg: 'CREATE INDEX without CONCURRENTLY locks the table during build. Use CONCURRENTLY for tables >100K rows.' },
  { rx: /UPDATE\s+\w+\s+SET[^;]*?(?<!WHERE\s[^;]+)(;|$)/i, msg: 'UPDATE without WHERE clause — full table scan/rewrite. Confirm intent.' },
];

function validate(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  const warnings = [];
  const confirmed = /CONFIRMED DESTRUCTIVE/i.test(sql);

  for (const { rx, msg } of DESTRUCTIVE_PATTERNS) {
    if (rx.test(sql) && !confirmed) errors.push(msg);
  }
  for (const { rx, msg } of REQUIRED_PATTERNS) {
    if (!rx.test(sql)) errors.push(msg);
  }
  for (const { rx, msg } of WARNINGS) {
    if (rx.test(sql)) warnings.push(msg);
  }

  console.log(`\n${path.basename(filePath)}:`);
  errors.forEach(e => console.error(`  ❌ ${e}`));
  warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
  if (errors.length === 0 && warnings.length === 0) console.log('  ✅ OK');
  return errors.length === 0;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node validate-migration.js <migration.sql> [...]');
  process.exit(2);
}

const ok = files.every(validate);
process.exit(ok ? 0 : 1);
```

`package.json` script:
```json
"migration:validate": "node scripts/validate-migration.js"
```

### Performance budgets — Lighthouse CI
```bash
npm install --save-dev @lhci/cli
```

`.lighthouserc.json`:
```json
{
  "ci": {
    "collect": { "url": ["http://localhost:3000/leads"], "numberOfRuns": 3 },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }]
      }
    }
  }
}
```

GitHub Actions runs on every PR. Hard fails below thresholds.

### TypeScript strictness
Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### lint-staged (additive to existing pre-commit hook)
```bash
npm install --save-dev lint-staged
```

`package.json`:
```json
"lint-staged": {
  "src/features/leads/**/*.{ts,tsx}": [
    "npx @biomejs/biome check --write --no-errors-on-unmatched"
  ],
  "src/**/*.{ts,tsx}": [
    "npx eslint --fix"
  ],
  "migrations/*.sql": [
    "sqlfluff lint --dialect postgres",
    "node scripts/validate-migration.js"
  ]
}
```

`.husky/pre-commit` keeps existing typecheck + test + lint, ADDS lint-staged at the start:
```bash
#!/bin/sh
npx lint-staged && npm run typecheck && npm run test
```

### AST-grep rules (Phase 1, after captureEvent wrapper exists)
```bash
npm install --save-dev @ast-grep/cli
npx sg new
```

`rules/enforce-telemetry-on-click.yml`:
```yaml
id: enforce-telemetry-on-click
message: "Observability Violation: onClick handler in src/features/leads/ must call captureEvent()"
severity: error
language: tsx
files: 
  - "src/features/leads/**/*.tsx"
rule:
  pattern: onClick={$_}
  not:
    pattern: onClick={() => { $$$ captureEvent($$$) $$$ }}
```

`rules/ban-react-context-in-leads.yml`:
```yaml
id: ban-react-context-in-leads
message: "State Management Violation: Use Zustand instead of React Context inside src/features/leads/"
severity: error
language: tsx
files:
  - "src/features/leads/**/*.tsx"
  - "src/features/leads/**/*.ts"
rule:
  any:
    - pattern: React.createContext($$$)
    - pattern: createContext($$$)
```

### Shadcn UI primitives (full list)
```bash
npx shadcn@latest init

# Foundation
npx shadcn@latest add button       # All buttons (Save, Call, Directions, etc.)
npx shadcn@latest add card         # PermitLeadCard, BuilderLeadCard, SkeletonLeadCard shells
npx shadcn@latest add badge        # Opportunity, WSIB, scope tag pills
npx shadcn@latest add avatar       # BuilderLeadCard photo + initial fallback
npx shadcn@latest add skeleton     # SkeletonLeadCard pulse blocks

# Overlays & sheets
npx shadcn@latest add drawer       # Vaul-powered bottom sheet (LeadFilterSheet)
npx shadcn@latest add sheet        # Side-sliding panel for desktop filters
npx shadcn@latest add tooltip      # "Why estimated?" hover hints on timing
npx shadcn@latest add hover-card   # Map marker → card preview on desktop
npx shadcn@latest add alert        # EmptyLeadState, error banners

# Forms & controls
npx shadcn@latest add form         # React Hook Form + Zod integration
npx shadcn@latest add label        # Accessible form labels
npx shadcn@latest add input        # Text inputs (search, custom radius)
npx shadcn@latest add toggle-group # Radius selector, view mode toggle
npx shadcn@latest add slider       # Continuous radius slider (V2 alternative)

# Feedback
npx shadcn@latest add sonner       # Toast notifications (save success/error)
```

**Apply construction-material tokens:** After installing each primitive, update the `className` defaults in `components/ui/[primitive].tsx` to use our tokens (`bg-bg-card-permit`, `text-gray-steel`, `bg-amber-hardhat`, etc.) from the Tailwind config in §6. Shadcn provides the plumbing (accessibility, keyboard nav, ARIA), our tokens provide the paint.

**One-time customization checklist per primitive:**
1. Open `src/components/ui/[primitive].tsx`
2. Replace generic neutral classes with our tokens
3. Verify `min-h-[44px]` on interactive elements for touch targets
4. Run `npm run typecheck` to confirm no type breakage

### Impeccable — Claude Code Design Plugin

**What it is:** A Claude Code plugin by Phil Bakaus that adds frontend design expertise to Claude. Includes 1 skill + **20 design-focused commands** specifically built as "the missing upgrade to Anthropic's frontend-design skill." Covers typography, color theory, spatial design, motion, interaction patterns, responsive design, and UX writing.

**Install:**
```bash
npx claudepluginhub pbakaus/impeccable --plugin impeccable
# Alternative: npx skills add pbakaus/impeccable
```

**Available commands (20 total):**

| Command | Purpose |
|---------|---------|
| `/audit` | Run technical quality checks: a11y, performance, responsive |
| `/critique` | UX design review focusing on hierarchy and clarity |
| `/normalize` | Align with design system standards |
| `/polish` | Final pre-deployment refinement |
| `/animate` | Add purposeful animations and micro-interactions |
| `/colorize` | Apply color theory and accessibility-aware palettes |
| `/typeset` | Fix typography hierarchy and font pairing |
| `/arrange` | Improve layout, spacing, and visual rhythm |
| `/adapt` | Adapt to different screen sizes, devices, breakpoints, fluid layouts, touch targets |
| Plus 11 others | Domain-specific design fixes |

**License:** Apache 2.0
**Repo:** [github.com/pbakaus/impeccable](https://github.com/pbakaus/impeccable)
**Docs:** [impeccable.style](https://impeccable.style)

**Workflow integration for Buildo lead feed:**

| Phase | Impeccable command | When |
|-------|--------------------|------|
| Phase 4 (after PermitLeadCard built) | `/critique src/features/leads/components/PermitLeadCard.tsx` | Catch generic AI design output before it spreads across other cards |
| Phase 4 (after BuilderLeadCard built) | `/critique src/features/leads/components/BuilderLeadCard.tsx` | Same |
| Phase 5 (after feed integration) | `/arrange src/features/leads/components/LeadFeed.tsx` | Verify spacing rhythm and visual hierarchy across the whole feed |
| Phase 5 (after sticky header + filter sheet) | `/adapt src/features/leads/` | Verify responsive behavior at 320/375/768/1024/1280px |
| Phase 6 (after map integration) | `/critique src/features/leads/components/LeadMapPane.tsx` | Verify map ↔ list visual harmony |
| Phase 7 (final pass) | `/polish src/features/leads/` | Pre-deployment refinement on the whole feature |
| Phase 7 (accessibility audit) | `/audit src/features/leads/` | a11y + performance + responsive technical check |

**Why this matters for Buildo:** The biggest risk with frontend AI work is that LLMs converge on generic "purple gradient on white" aesthetics. Impeccable's commands actively counter this with codified anti-patterns. Running `/critique` on each card after creation catches the generic output before it propagates.

---

### Per-Phase Tool Installation Breakdown

This table makes explicit which tools get installed when, so Phase 0 doesn't try to install everything at once and Phase 4 doesn't need to scramble to find dependencies.

| Phase | Day | Tools Installed | Why Now |
|-------|-----|----------------|---------|
| **Phase 0** | Day 1-2 | `@biomejs/biome`, `lint-staged`, stricter `tsconfig.json` | Logic safety net before any code is written |
| **Phase 0** | Day 3-4 | `posthog-js`, `captureEvent` wrapper at `src/lib/observability/capture.ts` | Telemetry built in from first commit |
| **Phase 0** | Day 5 | `@sentry/nextjs` via `npx @sentry/wizard@latest -i nextjs` | Error tracking before first deploy |
| **Phase 0** | Day 6 | `pip install sqlfluff`, `scripts/validate-migration.js`, **Impeccable plugin** (`npx claudepluginhub pbakaus/impeccable --plugin impeccable`) | DB safety + design plugin available for upcoming UI work |
| **Phase 0** | Day 7 | PostGIS extension + geography column + location sync trigger (DB-side, no npm install) | Database foundation |
| **Phase 0** | Day 8-9 | `@lhci/cli` + `.lighthouserc.json` + GitHub Actions workflow | Performance budgets enforced on PRs |
| **Phase 0** | Day 10 | `firebase-admin` (already installed), wire `verifyIdToken`, `@upstash/ratelimit`, `@upstash/redis`, rate limiter wrapper | Security foundation complete |
| **Phase 1** | — | `@vis.gl/react-google-maps`, `@tremor/react` | Data layer + map library + score primitive (Tremor used by TimingBadge in Phase 4 but installed early so types are available) |
| **Phase 2** | — | `zod` (already installed if frontend forms exist; otherwise install now) | API input validation |
| **Phase 3** | — | `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval`, `zustand` | State + offline cache |
| **Phase 4** | — | `npx shadcn@latest init` + all 16 primitives, `motion`, `react-infinite-scroll-component`, `react-hook-form`, `@hookform/resolvers` | UI primitives + interaction libraries |
| **Phase 5** | — | (no new tools — feed integration uses Phase 4 stack) | — |
| **Phase 6** | — | (no new tools — desktop layout extension) | — |
| **Phase 7** | — | `@tanstack/react-virtual` (conditional, only if feed > 50 cards), `playwright` (already installed for E2E), Impeccable `/polish` + `/audit` runs | Virtualization if needed + final design pass |

**Pipeline-side (separate from Phase 0):**
- `unfurl.js` — installed in `scripts/` for SSRF-safe OG image extraction in `enrich-wsib.js` extension

---

---

## 8. Testing Strategy

Per `00_engineering_standards.md` §5.2, tests colocate by triad:

### Logic tests (`*.logic.test.ts`)
- `scoring.logic.test.ts` — 4-pillar formula, edge cases, score boundaries
- `timing.logic.test.ts` — stage-based routing, heuristic fallback, confidence assignment
- `cost-model.logic.test.ts` — rate calculation, premium factor, scope premiums
- `builder-query.logic.test.ts` — quality filter, dedup, sort order
- `distance.logic.test.ts` — haversine correctness

### UI tests (`*.ui.test.tsx`)
- `PermitLeadCard.ui.test.tsx` — renders all states, expand/collapse, save interaction, 375px viewport, touch target sizes
- `BuilderLeadCard.ui.test.tsx` — contact button states, tap-to-call link, avatar fallback
- `LeadFeedHeader.ui.test.tsx` — sticky behavior, filter sheet trigger
- `LeadFilterSheet.ui.test.tsx` — snap points, radius selection, drag dismiss
- `SkeletonLeadCard.ui.test.tsx` — matches card dimensions, no layout shift

### Infra tests (`*.infra.test.ts`)
- `leads-feed.infra.test.ts` — API route returns correct structure, radius filter, auth enforcement, **cursor pagination stability** (page 1 + page 2 = disjoint, complete set), 400/401/429/500 response shapes
- `leads-view.infra.test.ts` — view tracking upsert, competition count accuracy, `lead_key` collision handling (concurrent POSTs for same user+lead)
- `ratelimit.infra.test.ts` — **fail-open behavior when Redis unreachable**, 429 response when limit exceeded, per-user isolation
- `postgis.infra.test.ts` — **ST_DWithin correctness fixture**: known location + known set of nearby permits, assert returned set matches hand-computed haversine within 1m tolerance
- `timing-siblings.infra.test.ts` — parent/child permit linkage: fixture with linked Demolition → New Building permits on same parcel, assert timing engine returns New Building timing for plumbing request on Demolition permit
- `persist-query.infra.test.ts` — **offline rehydration**: simulate page reload with network cleared, assert cached leads render from IndexedDB
- `geolocation-fallback.infra.test.ts` — fallback chain from browser GPS denial → saved home base → onboarding prompt
- `cost-model.infra.test.ts` — validate model error margin against 100-permit fixture with known `est_const_cost`
- `ssrf-pipeline.infra.test.ts` — `enrich-wsib.js` extension: assert hostname validation rejects `192.168.1.1`, `10.0.0.1`, `169.254.169.254` (AWS metadata), `localhost`, `127.0.0.1`
- `error-boundary.ui.test.tsx` — simulate thrown render error, assert `app/leads/error.tsx` fallback renders with reset button

### Integration tests (`*.integration.test.tsx`)
Cross-component interaction tests that infra/ui tests miss:
- `feed-map-sync.integration.test.tsx` — race condition: hover card while map marker is being clicked. Assert `selectedLeadId` wins over `hoveredLeadId` per the priority rule. Test reverse direction too (click map marker while hovering different card).
- `pull-to-refresh-during-scroll.integration.test.tsx` — pull to refresh while infinite scroll is loading next page. Assert: refresh completes, next-page request is cancelled (or merges correctly), no duplicate cards rendered, scroll position preserved.
- `tab-switch-loading.integration.test.tsx` — switch browser tabs mid-load and back. Assert: in-flight queries don't error, focus refetch behavior matches spec.
- `geolocation-permission-change.integration.test.tsx` — start with denied permission, user enables in browser settings mid-session. Assert: hook subscribes to `permissions.change` event and re-runs the location flow.
- `motion-shadcn-composition.integration.test.tsx` — `MotionButton = motion(Button)` composition renders correctly with both Shadcn variants AND Motion props (whileTap, animate). Catches the case where Shadcn's focus ring system conflicts with motion's transform.
- `marker-clustering.integration.test.tsx` — feed with 60 leads triggers clustering on the map. Assert clusters render correctly, click expands to individual markers, sync state still works.

---

## 9. Security Checklist (per §4.3)

- [ ] No API keys in `use client` components — Google Maps key is `NEXT_PUBLIC_` (public) and scoped
- [ ] API routes return projected fields, not `SELECT *` — enforced in `getLeadFeed` lib function with explicit column SELECT and `PermitLeadDTO` serializer
- [ ] Zod validation on all API inputs with **400 differentiated error responses**
- [ ] **Firebase `verifyIdToken` wired in middleware** — not shape-check only (H6)
- [ ] **Rate limiting via `@upstash/ratelimit`** on `/api/leads/feed` (30/min) and `/api/leads/view` (60/min) (C5)
- [ ] Authorization enforced server-side in API routes — middleware checks session cookie AND verifyIdToken
- [ ] No user-provided HTML rendered — all text goes through JSX escaping
- [ ] `rel="noopener noreferrer"` on external links — website buttons
- [ ] `tel:` links sanitize phone numbers: `.replace(/\D/g, '').slice(0, 15)` — strip non-digits AND clamp length to 15 (E.164 max). Validate result is 10-15 digits before rendering; otherwise disable the call button. Prevents tel-link injection and overflow attacks from corrupted WSIB data.
- [ ] `trade_slug` validated as `z.enum(TRADE_SLUGS)` — prevents enumeration attacks via free-string parameters
- [ ] **OG image fetching happens in pipeline only**, never on API server (SSRF prevention — C1). API serves `entities.photo_url` pre-validated URLs.
- [ ] **URL hostname validation before pipeline fetch** — reject RFC1918 private IPs, link-local ranges
- [ ] **Max size + timeout on pipeline fetches** — 1MB body, 5s timeout via `unfurl.js`
- [ ] TanStack Query data persisted to IndexedDB (NOT localStorage) for offline — IndexedDB has better storage quotas and same-origin isolation
- [ ] TanStack Query cache buster invalidates stored data on schema changes

---

## 10. Performance Checklist (per React Best Practices §2)

- [ ] Images lazy-loaded — Street View thumbnails use `loading="lazy"`
- [ ] Infinite scroll virtualization — consider `@tanstack/react-virtual` if feed grows >100 items
- [ ] Memoized components — `PermitLeadCard` and `BuilderLeadCard` wrapped in `memo` for feed re-renders
- [ ] Stabilized callbacks — `handleClick`, `setHovered` use `useCallback`
- [ ] Code splitting — `LeadMapPane` dynamically imported (not needed on mobile)
- [ ] Skeleton matches exact card dimensions — prevents CLS
- [ ] Debounced map movement — 300ms on `onMoveEnd`
- [ ] No CSS variables for drag transforms (Vaul lesson)
- [ ] `position: sticky` not `fixed` for header

---

## 11. Build Sequence (Implementation Order)

> **CRITICAL:** Phase 0 must complete before any other phase. The assessment identified 3 blockers (SSRF, Node-memory scoring, Haversine SQL) and 3 high-severity gaps (offline cache, error boundaries, verifyIdToken) that must be addressed in foundation before UI work begins.

### Phase 0: Foundation Fixes (NEW — blocks all other phases)

**Infrastructure:**

1. Install PostGIS extension in database:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. Add geography column to permits (schema only — do NOT backfill in same migration):
   ```sql
   -- migration 070_up.sql
   ALTER TABLE permits ADD COLUMN location geography(Point, 4326);
   ```

3. **Batched backfill script** `scripts/backfill-permits-location.js` to avoid locking 220K rows in a single transaction:
   ```js
   // Pseudocode — runs in 10K-row batches
   const BATCH_SIZE = 10000;
   let lastId = '';
   while (true) {
     const result = await pool.query(`
       UPDATE permits 
       SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
       WHERE (permit_num, revision_num) > ($1, $2)
         AND latitude IS NOT NULL 
         AND location IS NULL
       ORDER BY permit_num, revision_num
       LIMIT ${BATCH_SIZE}
       RETURNING permit_num, revision_num
     `, [lastId.permit_num || '', lastId.revision_num || '']);
     if (result.rows.length === 0) break;
     lastId = result.rows[result.rows.length - 1];
     await sleep(100); // breathing room between batches
   }
   ```

4. **Create GIST index CONCURRENTLY** (no table lock, partial WHERE clause to skip NULL rows):
   ```sql
   -- Must run outside a transaction. Partial index excludes rows with NULL
   -- location (un-geocoded permits), keeping the index small and fast.
   CREATE INDEX CONCURRENTLY idx_permits_location
     ON permits USING GIST (location)
     WHERE location IS NOT NULL;
   ```

5. **Keep `permits.location` in sync on ingest** (N6 — CRITICAL, day-2 break without this):
   
   Option A (preferred) — database trigger:
   ```sql
   CREATE OR REPLACE FUNCTION sync_permit_location() RETURNS trigger AS $$
   BEGIN
     IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
       NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
     ELSE
       NEW.location := NULL;  -- handles geocoding rollbacks on revisions
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   
   CREATE TRIGGER trg_permits_location_sync
     BEFORE INSERT OR UPDATE OF latitude, longitude ON permits
     FOR EACH ROW EXECUTE FUNCTION sync_permit_location();
   ```
   
   **NULL location semantics:** When a permit revision loses its geocoding (e.g., address corrected to one that fails the geocoder), the trigger sets `location = NULL`. The lead feed query MUST filter `WHERE p.location IS NOT NULL` — already in the spec via `ST_DWithin` which excludes NULLs by default. The partial index below ensures these NULL rows don't waste index space.
   
   **Constraint exception:** This is the ONLY change to the permit ingestion path. `scripts/load-permits.js` and `scripts/geocode-permits.js` remain untouched — the trigger handles the sync automatically.

6. Add photo_url column for SSRF-safe builder photos (migration 071):
   ```sql
   -- UP
   ALTER TABLE entities ADD COLUMN photo_url VARCHAR(500);
   ALTER TABLE entities ADD COLUMN photo_validated_at TIMESTAMPTZ;
   ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https 
     CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');
   
   -- DOWN
   ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
   ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at;
   ALTER TABLE entities DROP COLUMN IF EXISTS photo_url;
   ```

7. Create `timing_calibration` table (see spec 71) with UP + DOWN migrations.

**Logger extension:**

8. Add `logInfo` function to `src/lib/logger.ts` alongside existing `logError` and `logWarn`:
   ```typescript
   export function logInfo(tag: string, event: string, context?: Record<string, unknown>): void {
     console.log(JSON.stringify({ level: 'info', tag, event, timestamp: new Date().toISOString(), ...context }));
   }
   ```

**Auth helper:**

9. Create `src/lib/auth/server.ts` exporting `getUserIdFromSession` that properly verifies Firebase ID tokens:
   ```typescript
   import { cookies } from 'next/headers';
   import { getAuth } from 'firebase-admin/auth';
   import { logError } from '@/lib/logger';
   
   export async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
     try {
       const cookieStore = await cookies();
       const sessionCookie = cookieStore.get('__session')?.value;
       if (!sessionCookie) {
         // Admin API key fallback for CI / scripts
         const adminKey = request.headers.get('X-Admin-Key');
         if (adminKey === process.env.ADMIN_API_KEY) return 'admin';
         return null;
       }
       const decoded = await getAuth().verifySessionCookie(sessionCookie, true);
       return decoded.uid;
     } catch (err) {
       logError('[auth/server]', err, { event: 'session_verification_failed' });
       return null;
     }
   }
   ```

10. Wire Firebase Admin SDK initialization if not already done:
    ```typescript
    // src/lib/firebase/admin.ts
    import { initializeApp, getApps, cert } from 'firebase-admin/app';
    
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    ```

**Rate limiting (with fail-open policy — N3):**

11. Install `@upstash/ratelimit` + `@upstash/redis`. Create `src/lib/ratelimit.ts`:
    ```typescript
    import { Ratelimit } from '@upstash/ratelimit';
    import { Redis } from '@upstash/redis';
    import { logWarn } from '@/lib/logger';
    
    const redis = Redis.fromEnv();
    
    const leadFeedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 s'),
      analytics: true,
      prefix: 'ratelimit:leads:feed',
    });
    
    // Fail-open wrapper: if Redis is down, allow the request but log a warning.
    // Better to serve degraded than return 500 to every user.
    export async function checkLeadFeedLimit(userId: string) {
      try {
        return await leadFeedLimiter.limit(userId);
      } catch (err) {
        logWarn('[ratelimit]', 'redis_unreachable_failing_open', { 
          user_id: userId, 
          error: err instanceof Error ? err.message : String(err) 
        });
        return { success: true, limit: 30, remaining: 30, reset: Date.now() + 60000 };
      }
    }
    
    // Same pattern for leadViewLimiter (60/min)
    ```

**SSRF-safe builder photos:**

12. Extend `scripts/enrich-wsib.js` to extract OG images with `unfurl.js` in a sandboxed fashion:
    - Validate URL hostname via DNS, reject RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
    - Use `unfurl.js` with 5s timeout and 1MB max response size
    - Store final validated URL in `entities.photo_url`

**Keep the API server from ever fetching builder URLs at runtime.**

### Phase 1: Data Layer (no UI, SQL-based scoring)

1. Build lead scoring as a **single PostgreSQL CTE query** in `src/features/leads/lib/get-lead-feed.ts` — NOT Node-memory JavaScript scoring
2. Build timing engine `src/features/leads/lib/timing.ts` with parent/child permit merge logic (query `permit_parcels` for siblings)
3. Build cost model `src/features/leads/lib/cost-model.ts` (spec 72 as-is, cached in `cost_estimates` table via pipeline)
4. Build builder query `src/features/leads/lib/builder-query.ts` using PostGIS `ST_DWithin` and `<->` KNN
5. Build distance helper using PostGIS functions (no JS haversine)
6. Write logic tests — must pass before moving on

### Phase 2: API Layer

1. `/api/leads/feed` — thin route delegating to `getLeadFeed`, with:
   - Zod validation returning **400 on error** (not 500)
   - Rate limiting middleware via `@upstash/ratelimit`
   - Structured logging: `{user_id, trade_slug, lat, lng, result_count, duration_ms}`
2. `/api/leads/view` — upsert to `lead_views` using `lead_key` column, rate-limited at 60/min
3. Write infra tests covering: 200 success, 400 Zod failure, 401 unauthorized, 429 rate limit, 500 generic error

### Phase 3: State & Hooks

1. Zustand store `useLeadFeedState` with hoveredId, selectedId, filters — **use `persist` middleware** to retain `radiusKm` and `location` across page loads (N12):
   ```typescript
   import { create } from 'zustand';
   import { persist, createJSONStorage } from 'zustand/middleware';
   
   export const useLeadFeedState = create<LeadFeedState>()(
     persist(
       (set) => ({
         hoveredLeadId: null,
         selectedLeadId: null,
         radiusKm: 10,
         location: null,
         setHoveredLeadId: (id) => set({ hoveredLeadId: id }),
         setSelectedLeadId: (id) => set({ selectedLeadId: id }),
         setRadius: (km) => set({ radiusKm: km }),
         setLocation: (loc) => set({ location: loc }),
       }),
       {
         name: 'buildo-lead-feed',
         storage: createJSONStorage(() => localStorage),
         // Only persist filter state — not ephemeral hover/select
         partialize: (state) => ({ radiusKm: state.radiusKm, location: state.location }),
         // Versioning + migration: bump `version` whenever the persisted shape
         // changes so existing users don't crash on stale localStorage data.
         version: 1,
         migrate: (persistedState: any, version: number) => {
           // Defensive shape guard: even when version matches, validate the
           // persisted shape before trusting it. Catches localStorage tampering
           // and edge cases where the schema drifted between deploys.
           if (!persistedState || typeof persistedState !== 'object') {
             return { radiusKm: 10, location: null };
           }
           if (version === 0) {
             return { ...persistedState, location: null };
           }
           // v1+: validate fields
           return {
             radiusKm: typeof persistedState.radiusKm === 'number' ? persistedState.radiusKm : 10,
             location: (persistedState.location && 
                       typeof persistedState.location === 'object' &&
                       typeof persistedState.location.lat === 'number' &&
                       typeof persistedState.location.lng === 'number')
               ? persistedState.location
               : null,
           };
         },
       }
     )
   );
   ```

2. TanStack Query hooks with **`PersistQueryClient`** for offline cache (24h IndexedDB). **Two-layer location handling:** rounded query key prevents GPS jitter cache thrash, but a separate effect forces a refetch when the user genuinely moves >500m (N13):
   ```typescript
   import { useEffect, useRef } from 'react';
   import { useQueryClient } from '@tanstack/react-query';
   
   const FORCED_REFETCH_THRESHOLD_M = 500;
   const COORD_PRECISION = 1000; // 3 decimals = ~110m grid
   
   function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
     const R = 6371000;
     const dLat = (lat2 - lat1) * Math.PI / 180;
     const dLng = (lng2 - lng1) * Math.PI / 180;
     const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
     return 2 * R * Math.asin(Math.sqrt(a));
   }
   
   export function useLeadFeed(params: LeadFeedParams) {
     // Layer 1: Round to ~110m grid for query key. Prevents GPS jitter from
     // creating unique cache entries on every tiny coordinate change.
     const roundedLat = Math.round(params.lat * COORD_PRECISION) / COORD_PRECISION;
     const roundedLng = Math.round(params.lng * COORD_PRECISION) / COORD_PRECISION;
     const queryKey = ['leadFeed', { ...params, lat: roundedLat, lng: roundedLng }];
     
     const queryClient = useQueryClient();
     const lastQueriedRef = useRef<{ lat: number; lng: number } | null>(null);
     
     // Layer 2: Force refetch when user actually moves >500m. This catches the
     // case where rounding hides legitimate movement (e.g., walking 100m doesn't
     // change rounded coords, so the cache returns stale data without this effect).
     useEffect(() => {
       if (!lastQueriedRef.current) {
         lastQueriedRef.current = { lat: params.lat, lng: params.lng };
         return;
       }
       const moved = haversineMeters(
         lastQueriedRef.current.lat, lastQueriedRef.current.lng,
         params.lat, params.lng
       );
       if (moved > FORCED_REFETCH_THRESHOLD_M) {
         lastQueriedRef.current = { lat: params.lat, lng: params.lng };
         queryClient.invalidateQueries({ queryKey });
       }
     }, [params.lat, params.lng, queryKey, queryClient]);
     
     return useInfiniteQuery({
       queryKey,
       queryFn: async ({ pageParam = 1 }) => { /* ... */ },
       getNextPageParam: (lastPage, allPages) => { /* ... */ },
       initialPageParam: 1,
     });
   }
   ```
   
   **Why both layers:** Layer 1 alone causes stale data when moving 50-499m. Layer 2 alone causes cache thrash from GPS jitter. Together: stable cache + responsive to real movement.
   
   Then wrap with PersistQueryClient:
   ```tsx
   import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
   import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
   import { get, set, del } from 'idb-keyval';

   const persister = createAsyncStoragePersister({
     storage: { getItem: get, setItem: set, removeItem: del },
     key: 'buildo-leads-cache',
     throttleTime: 1000,
   });

   <PersistQueryClientProvider 
     client={queryClient} 
     persistOptions={{ 
       persister, 
       maxAge: 24 * 60 * 60 * 1000,  // 24 hours
       buster: '1',  // bump to invalidate all caches
     }}
   >
     {children}
   </PersistQueryClientProvider>
   ```
3. `useGeolocation` hook with fallback chain (browser → saved home base → onboarding prompt). **Permission state handling with feature detection** — `navigator.permissions.query` is unavailable in Safari < 16 and in non-secure contexts, so the hook must feature-detect:
   ```typescript
   async function checkGeoPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
     // Feature-detect — Safari < 16 and HTTP contexts don't have Permissions API
     if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
       return 'unsupported';
     }
     try {
       const result = await navigator.permissions.query({ name: 'geolocation' });
       return result.state; // 'granted' | 'prompt' | 'denied'
     } catch {
       return 'unsupported'; // Safari throws on some permission names
     }
   }
   
   // Subscribe to permission changes too — user can grant/revoke while app is open
   const result = await navigator.permissions.query({ name: 'geolocation' });
   result.addEventListener('change', () => {
     // re-check and update state
   });
   
   // If permanently denied, cannot re-prompt — guide user to settings
   if (state === 'denied') {
     return { status: 'permanently_denied', cta: 'set_home_base' };
   }
   ```
4. Tailwind config + font setup

### Phase 4: Presentational Components (No Data)

1. `SkeletonLeadCard` — simplest, no props
2. `TimingBadge`, `OpportunityBadge`, `SaveButton` — atomic
3. `PermitLeadCard` (mock data) — UI test first, wrapped in local `ErrorBoundary`
4. `BuilderLeadCard` (mock data) — UI test first, photo from `entities.photo_url` only (no runtime fetching)
5. `EmptyLeadState` with **two-layer offline detection** — `navigator.onLine` is unreliable (returns true for VPNs, captive portals, networks where DNS works but our API is unreachable). Use it as a fast path, then verify with the TanStack Query state: if the most recent fetch failed AND `navigator.onLine` is false → show offline state. If fetch succeeded recently but is now failing → show "Can't reach server" instead of "Offline". Three states: `offline` (both signals fail), `unreachable` (online but API errors), `no_results` (online + reachable + empty result).

### Phase 5: Feed Integration

1. `LeadFeed` with real data + infinite scroll
2. **Error boundary at route level** — `app/leads/error.tsx` and `app/leads/global-error.tsx`:
   ```tsx
   'use client';
   import { useEffect } from 'react';
   export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
     useEffect(() => { console.error(error); }, [error]);
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
3. `LeadFeedHeader` sticky + filter button
4. `LeadFilterSheet` with Vaul
5. Pull-to-refresh integration

### Phase 6: Map + Desktop Layout

1. `LeadMapPane` desktop sidebar
2. Map marker ↔ card sync via Zustand
3. Feed page layout `app/leads/page.tsx`

### Phase 7: Polish

1. Animations (save button bounce, card expand)
2. Haptic feedback (feature-detect, iOS doesn't implement Vibration API)
3. Accessibility audit (screen reader labels, keyboard nav, 320px viewport test)
4. Observability: add `logInfo` with performance marks to feed API
5. **V1 hard cap:** Infinite scroll limited to 5 pages of 15 cards = **75 cards max**. When the user hits the cap, show "Refine your search to see more." This is the V1 constraint replacing virtualization.
6. **V2 upgrade path:** When production feed length regularly exceeds 50 cards OR frame drops are reported, add `@tanstack/react-virtual` to `LeadFeed` component. This is a self-contained change behind the existing component interface.

---

## 12. Operating Boundaries

### Target Files
- `src/features/leads/` (entire feature folder)
- `src/app/leads/page.tsx`
- `src/app/api/leads/` (routes)
- `migrations/067_lead_views.sql`
- `migrations/068_cost_estimates.sql`
- `migrations/069_inspection_stage_map.sql`
- `tailwind.config.ts` (additions only)

### Out-of-Scope Files
- `src/lib/classification/` — existing scoring untouched
- `src/components/permits/PermitCard.tsx` — existing search UI unchanged
- `src/app/search/page.tsx` — existing search preserved

### Scope Exception — Pipeline Changes Required
Normally the frontend phase restricts changes to `scripts/`. This feature requires **three** targeted pipeline additions for Phase 0:
1. `scripts/backfill-permits-location.js` — NEW batched backfill for PostGIS geography column
2. `scripts/enrich-wsib.js` — EXTEND with OG image extraction (SSRF-safe, pipeline-side)
3. `scripts/purge-lead-views.js` — NEW nightly retention cleanup for PIPEDA/GDPR compliance

The `permits.location` sync is handled by a database trigger (`trg_permits_location_sync`), NOT by modifying `scripts/load-permits.js` or `scripts/geocode-permits.js`. The trigger is transparent to the ingestion pipeline — no pipeline code changes, just a schema migration.

### Cross-Spec Dependencies
- **Relies on:** `70_lead_feed.md`, `71_lead_timing_engine.md`, `72_lead_cost_model.md`, `73_builder_leads.md`, `74_lead_feed_design.md`, `46_wsib_enrichment.md`, `53_source_aic_inspections.md`, `13_authentication.md`
- **Referenced:** `00_engineering_standards.md` (§4.3, §4.4, §10), `docs/reports/competitive_lead_gen_ux_research.md`, `docs/reports/react_best_practices_deep_dive.md`

---

## 13. Success Criteria

The feature is complete when:
- [ ] All logic/UI/infra tests pass (target: 2500+ total tests)
- [ ] Feed loads within 500ms on 3G throttled
- [ ] Card scroll at 60fps on mid-range Android
- [ ] Map/list sync has <100ms lag on interaction
- [ ] Empty states and error boundaries handle all edge cases
- [ ] Desktop layout passes at 1024px, 1280px, 1536px
- [ ] Mobile layout passes at 375px, 414px
- [ ] Touch targets all >= 44px (automated test)
- [ ] Lighthouse mobile score >= 90 for the /leads route
- [ ] No CLS on skeleton → card transition
- [ ] Accessibility: screen reader navigates feed linearly, save button announces state
