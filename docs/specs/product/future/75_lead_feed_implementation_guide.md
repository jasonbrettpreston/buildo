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

| Component | Type | Why |
|-----------|------|-----|
| `/leads/page.tsx` | Server | Renders metadata, auth check, initial data |
| `LeadFeed.tsx` | Client | Needs state for hover/select sync with map |
| `PermitLeadCard.tsx` | Client | Needs interaction (expand, save, navigate) |
| `BuilderLeadCard.tsx` | Client | Needs tap-to-call, save interaction |
| `LeadFeedHeader.tsx` | Client | Scroll detection, filter sheet trigger |
| `LeadFilterSheet.tsx` | Client | Vaul drawer state |
| `LeadMapPane.tsx` | Client | Map interaction, marker state |
| `SkeletonLeadCard.tsx` | Server | Pure visual, no interaction |
| `EmptyLeadState.tsx` | Server | Pure visual |

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

const paramsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  trade_slug: z.string().min(1),
  radius_km: z.coerce.number().min(1).max(50).default(10),
  page: z.coerce.number().int().min(1).default(1),
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

### 4.1 LeadFeed (Container)

**File:** `src/features/leads/components/LeadFeed.tsx`

**Purpose:** Top-level feed container. Manages infinite scroll, interleaves permit + builder cards, handles loading/empty states.

```tsx
'use client';
import { useInView } from 'react-intersection-observer';
import { useEffect, useRef } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
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
  const { ref: loadMoreRef, inView } = useInView({ threshold: 0 });

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useLeadFeed({
      lat: location?.lat ?? 0,
      lng: location?.lng ?? 0,
      tradeSlug,
      radiusKm,
    });

  // Infinite scroll trigger
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!location) return <EmptyLeadState reason="no_location" />;
  if (isLoading) return <LoadingFeed />;
  
  const leads = data?.pages.flatMap(p => p.data) ?? [];
  if (leads.length === 0) return <EmptyLeadState reason="no_results" radiusKm={radiusKm} />;

  return (
    <PullToRefresh
      onRefresh={async () => { await refetch(); }}
      pullDownThreshold={67}
      maxPullDownDistance={95}
      refreshingContent={<RefreshSpinner />}
    >
      <div className="flex flex-col min-h-screen bg-[#1C1F26]">
        <LeadFeedHeader leadCount={data?.pages[0].meta.total ?? 0} />
        <div className="flex flex-col gap-2 px-0 pt-2">
          {leads.map(lead =>
            lead.lead_type === 'permit' ? (
              <PermitLeadCard key={lead.id} lead={lead} />
            ) : (
              <BuilderLeadCard key={lead.id} lead={lead} />
            )
          )}
          {isFetchingNextPage && (
            <>
              <SkeletonLeadCard />
              <SkeletonLeadCard />
            </>
          )}
          <div ref={loadMoreRef} className="h-1" />
        </div>
      </div>
    </PullToRefresh>
  );
}

function LoadingFeed() {
  return (
    <div className="flex flex-col gap-2 px-0 pt-2 bg-[#1C1F26] min-h-screen">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonLeadCard key={i} />)}
    </div>
  );
}

function RefreshSpinner() {
  return (
    <div className="flex justify-center py-4">
      <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
    </div>
  );
}
```

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

### 4.3 LeadFilterSheet (Vaul Bottom Sheet)

**File:** `src/features/leads/components/LeadFilterSheet.tsx`

```tsx
'use client';
import { Drawer } from 'vaul';
import { useState } from 'react';
import { useLeadFeedState } from '../hooks/useLeadFeedState';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadFilterSheet({ open, onOpenChange }: Props) {
  const { radiusKm, setRadius } = useLeadFeedState();
  const [snap, setSnap] = useState<number | string | null>('355px');

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={['148px', '355px', 1]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-lg bg-[#272B33] flex flex-col">
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-neutral-600" />
          <div className="p-4 space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold text-neutral-100 mb-4">
                Filters
              </h2>
              <label className="block">
                <span className="font-display text-sm text-neutral-400">
                  Search radius
                </span>
                <div className="flex items-center gap-2 mt-2">
                  {[5, 10, 20, 30].map(km => (
                    <button
                      key={km}
                      onClick={() => setRadius(km)}
                      className={`
                        min-h-[44px] px-4 rounded-md font-data text-sm transition-colors
                        ${radiusKm === km 
                          ? 'bg-amber-500 text-neutral-900' 
                          : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
                        }
                      `}
                    >
                      {km}km
                    </button>
                  ))}
                </div>
              </label>
              {/* Additional filters: trade, cost range, project type */}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

**Key decisions:**
- Vaul snap points: peek (148px), half (355px), full (1)
- Default open to half-screen — user can expand to full if needed
- Background `#272B33` matches permit card background (elevated surface)
- Drag handle at top (the rounded bar) — tells user it's draggable
- Filter buttons are 44px min-height pills
- Uses vaul's built-in iOS cubic-bezier `[0.32, 0.72, 0, 1]` automatically

---

### 4.4 PermitLeadCard (Collapsed)

**File:** `src/features/leads/components/PermitLeadCard.tsx`

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
        <OpportunityBadge type={lead.opportunity_type} builderName={lead.builder_name} />
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
    window.location.href = `tel:${lead.phone?.replace(/\D/g, '')}`;
  };

  return (
    <motion.article
      className="bg-[#1A2332] rounded-lg overflow-hidden"
      style={{ borderLeft: '3px solid #F59E0B' }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      aria-label={`Builder lead: ${lead.builder_name}`}
    >
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3 p-4">
        <BuilderAvatar 
          photoUrl={lead.photo_url} 
          name={lead.builder_name} 
          className="w-12 h-12 rounded-md shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-neutral-100 truncate">
            {lead.builder_name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-display text-sm text-neutral-400">
              {lead.business_size}
            </span>
            {lead.wsib_registered && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                WSIB
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pb-3">
        <p className="font-display text-sm font-semibold text-neutral-100">
          🏗 {lead.active_permits_nearby} active permits within {Math.round(lead.closest_permit_m / 1000 * 10) / 10}km
        </p>
        <p className="font-data text-xs text-neutral-400 mt-1">
          Closest: {formatDistance(lead.closest_permit_m)}
          {lead.avg_project_cost && ` · Avg: $${formatCompact(lead.avg_project_cost)}`}
        </p>
      </div>

      {/* Action row */}
      <div className="flex border-t border-neutral-800">
        {lead.phone && (
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

```tsx
import { ClockIcon } from '@heroicons/react/24/outline';

interface Props {
  display: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
}

export function TimingBadge({ display, confidence, score }: Props) {
  const bg = getBackgroundColor(score);
  const textColor = score >= 20 ? 'text-neutral-900' : 'text-neutral-100';
  
  return (
    <div className="flex items-center justify-between gap-2">
      <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md ${bg} ${textColor} min-h-[44px]`}>
        <ClockIcon className="w-4 h-4 shrink-0" />
        <span className="font-display text-sm font-semibold leading-tight">
          {display}
        </span>
        {confidence !== 'high' && (
          <span className="font-data text-[10px] opacity-75 ml-auto">est.</span>
        )}
      </div>
      <div className={`
        w-12 h-12 rounded-md flex items-center justify-center shrink-0
        bg-neutral-900/30 ring-1 ring-neutral-700
      `}>
        <span className="font-data text-sm font-bold text-neutral-100">{score}</span>
      </div>
    </div>
  );
}

function getBackgroundColor(score: number): string {
  if (score >= 25) return 'bg-amber-500';   // NOW
  if (score >= 20) return 'bg-green-500';   // Soon
  if (score >= 10) return 'bg-blue-500';    // Upcoming
  return 'bg-neutral-600';                  // Distant
}
```

---

### 4.7 SaveButton

**File:** `src/features/leads/components/badges/SaveButton.tsx`

```tsx
'use client';
import { motion } from 'motion/react';
import { useState } from 'react';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { useLeadView } from '../../api/useLeadView';

interface Props {
  leadId: string;
  leadType: 'permit' | 'builder';
  tradeSlug: string;
}

export function SaveButton({ leadId, leadType, tradeSlug }: Props) {
  const [saved, setSaved] = useState(false);
  const viewMutation = useLeadView();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ('vibrate' in navigator) navigator.vibrate(10);
    const newSaved = !saved;
    setSaved(newSaved);
    viewMutation.mutate({
      lead_type: leadType,
      permit_num: leadType === 'permit' ? leadId : undefined,
      entity_id: leadType === 'builder' ? Number(leadId) : undefined,
      trade_slug: tradeSlug,
      action: newSaved ? 'save' : 'unsave',
    });
  };

  return (
    <motion.button
      onClick={handleClick}
      className="flex-1 min-h-[44px] flex items-center justify-center gap-2 hover:bg-neutral-800/50 font-display text-sm font-semibold"
      animate={{ scale: saved ? [1, 1.3, 1] : 1 }}
      whileTap={{ scale: 0.9 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 20,
        mass: 1,
      }}
      aria-label={saved ? 'Remove from saved' : 'Save lead'}
    >
      {saved ? (
        <HeartSolid className="w-5 h-5 text-amber-500" />
      ) : (
        <HeartOutline className="w-5 h-5 text-neutral-400" />
      )}
      <span className={saved ? 'text-amber-500' : 'text-neutral-400'}>
        {saved ? 'Saved' : 'Save'}
      </span>
    </motion.button>
  );
}
```

**Key decisions:**
- Exact spring values from research: `stiffness: 400, damping: 20, mass: 1`
- Bounce sequence on save: `[1, 1.3, 1]`
- Haptic feedback via `navigator.vibrate(10)`
- `stopPropagation` to prevent card-expand trigger
- Color crossfade amber (saved) ↔ gray (unsaved)

---

### 4.8 SkeletonLeadCard

**File:** `src/features/leads/components/SkeletonLeadCard.tsx`

```tsx
export function SkeletonLeadCard() {
  return (
    <div className="bg-[#272B33] rounded-lg p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-20 h-15 bg-neutral-700 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-700 rounded-full w-3/4" />
          <div className="h-3 bg-neutral-700 rounded-full w-1/2" />
          <div className="h-3 bg-neutral-700 rounded-full w-16" />
        </div>
      </div>
      <div className="h-11 bg-neutral-700 rounded-md mt-3 w-full" />
      <div className="h-3 bg-neutral-700 rounded-full mt-3 w-2/3" />
      <div className="space-y-2 mt-2">
        <div className="h-2.5 bg-neutral-700 rounded-full w-1/2" />
        <div className="h-2.5 bg-neutral-700 rounded-full w-1/3" />
      </div>
    </div>
  );
}
```

**Dimensions match PermitLeadCard exactly** to prevent CLS.

---

### 4.9 EmptyLeadState

**File:** `src/features/leads/components/EmptyLeadState.tsx`

```tsx
import { MapPinIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Props {
  reason: 'no_location' | 'no_results';
  radiusKm?: number;
}

export function EmptyLeadState({ reason, radiusKm }: Props) {
  if (reason === 'no_location') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1C1F26] p-6 text-center">
        <MapPinIcon className="w-12 h-12 text-neutral-500 mb-4" />
        <h2 className="font-display text-lg font-bold text-neutral-100 mb-2">
          Location needed for leads
        </h2>
        <p className="font-display text-sm text-neutral-400 mb-6">
          Enable GPS or set your home base to see nearby opportunities
        </p>
        <div className="flex gap-3">
          <button className="min-h-[44px] px-6 bg-amber-500 text-neutral-900 rounded-md font-display font-semibold">
            Enable Location
          </button>
          <button className="min-h-[44px] px-6 border border-neutral-700 text-neutral-100 rounded-md font-display font-semibold">
            Set Home Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#1C1F26] p-6 text-center">
      <MagnifyingGlassIcon className="w-12 h-12 text-neutral-500 mb-4" />
      <h2 className="font-display text-lg font-bold text-neutral-100 mb-2">
        No leads within {radiusKm}km
      </h2>
      <p className="font-display text-sm text-neutral-400 mb-6">
        Try expanding your search radius
      </p>
      <button className="min-h-[44px] px-6 bg-amber-500 text-neutral-900 rounded-md font-display font-semibold">
        Expand to {(radiusKm ?? 10) * 2}km
      </button>
    </div>
  );
}
```

---

### 4.10 LeadMapPane (Desktop Sidebar)

**File:** `src/features/leads/components/LeadMapPane.tsx`

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useLeadFeedState } from '../hooks/useLeadFeedState';
import type { LeadFeedItem } from '../types';

interface Props {
  leads: LeadFeedItem[];
}

export function LeadMapPane({ leads }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const { hoveredLeadId, selectedLeadId, setSelectedLeadId } = useLeadFeedState();

  // Initialize map (reuse existing Google Maps setup from map page)
  useEffect(() => {
    // ... google maps init
  }, []);

  // Highlight marker when hovered/selected from list
  useEffect(() => {
    const activeId = selectedLeadId ?? hoveredLeadId;
    // Update marker styles based on activeId
  }, [hoveredLeadId, selectedLeadId]);

  return (
    <div className="hidden lg:block sticky top-0 h-screen bg-[#1C1F26]">
      <div id="lead-map" className="w-full h-full" />
    </div>
  );
}
```

**Key decisions:**
- Hidden on mobile (`hidden lg:block`)
- Subscribes to Zustand state for hoveredId/selectedId
- Markers highlight when list cards are interacted with
- Clicking a marker calls `setSelectedLeadId` → list scrolls to that card

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
        <Suspense fallback={<LoadingState />}>
          <LeadFeed tradeSlug={tradeSlug} />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <LeadMapPane leads={[]} />
      </Suspense>
    </main>
  );
}
```

**Key decisions:**
- Server Component by default — auth check runs on server
- Suspense boundaries for streaming
- Desktop grid `lg:grid-cols-[500px_1fr]` — feed fixed 500px, map fills rest (Zillow pattern)
- Mobile: single column (grid breaks on `< lg`)

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
  idb-keyval \
  @upstash/ratelimit \
  @upstash/redis \
  zustand \
  vaul \
  motion \
  react-intersection-observer \
  react-simple-pull-to-refresh \
  zod \
  unfurl.js
```

**What each solves:**
- `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` + `idb-keyval` → offline cache persistence (H1)
- `@upstash/ratelimit` + `@upstash/redis` → rate limiting on API routes (C5)
- `unfurl.js` → SSRF-safe OG image extraction in pipeline (C1)
- `zustand` → map/list state sync without Redux
- `vaul` → bottom sheet drawer
- `motion` → spring animations (heart button, card expand)

**Pipeline-only (install in `scripts/` context):**
- `unfurl.js` runs in the Node pipeline `scripts/enrich-wsib.js`, never on the API server

**Environment variables needed:**
```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

For dev dependencies, existing Vitest + RTL are sufficient.

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
- [ ] `tel:` links use `.replace(/\D/g, '')` to sanitize phone numbers before href
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

4. **Create GIST index CONCURRENTLY** (no table lock):
   ```sql
   -- Must run outside a transaction
   CREATE INDEX CONCURRENTLY idx_permits_location 
     ON permits USING GIST (location);
   ```

5. **Keep `permits.location` in sync on ingest** (N6 — CRITICAL, day-2 break without this):
   
   Option A (preferred) — database trigger:
   ```sql
   CREATE OR REPLACE FUNCTION sync_permit_location() RETURNS trigger AS $$
   BEGIN
     IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
       NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
     ELSE
       NEW.location := NULL;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   
   CREATE TRIGGER trg_permits_location_sync
     BEFORE INSERT OR UPDATE OF latitude, longitude ON permits
     FOR EACH ROW EXECUTE FUNCTION sync_permit_location();
   ```
   
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
       }
     )
   );
   ```

2. TanStack Query hooks with **`PersistQueryClient`** for offline cache (24h IndexedDB). **Round lat/lng to ~3 decimals (~110m grid) in query key** to prevent GPS jitter from creating unbounded cache entries (N13):
   ```typescript
   export function useLeadFeed(params: LeadFeedParams) {
     // Round location to 3 decimal places — ~110m grid, prevents GPS jitter
     // from generating unique cache keys on every tiny location change
     const roundedLat = Math.round(params.lat * 1000) / 1000;
     const roundedLng = Math.round(params.lng * 1000) / 1000;
     
     return useInfiniteQuery({
       queryKey: ['leadFeed', { ...params, lat: roundedLat, lng: roundedLng }],
       // ... rest of hook
     });
   }
   ```
   
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
3. `useGeolocation` hook with fallback chain (browser → saved home base → onboarding prompt)
4. Tailwind config + font setup

### Phase 4: Presentational Components (No Data)

1. `SkeletonLeadCard` — simplest, no props
2. `TimingBadge`, `OpportunityBadge`, `SaveButton` — atomic
3. `PermitLeadCard` (mock data) — UI test first, wrapped in local `ErrorBoundary`
4. `BuilderLeadCard` (mock data) — UI test first, photo from `entities.photo_url` only (no runtime fetching)
5. `EmptyLeadState` with offline detection via `navigator.onLine`

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
