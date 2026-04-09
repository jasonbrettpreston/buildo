'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5
// 🔗 DESIGN: docs/specs/product/future/74_lead_feed_design.md
//
// LeadFeed — the orchestrator. Wires the Phase 3-iii cards to the
// Phase 3-i useLeadFeed hook (which itself wraps useInfiniteQuery).
// All cursor management, caching, dedup, background refetching,
// optimistic updates, and rehydration gating live in TanStack Query
// — react-infinite-scroll-component is a UI TRIGGER ONLY, not a
// data manager. See the prop list below: only `dataLength` (count),
// `next` (callback), `hasMore` (bool), `loader`, `endMessage`, the
// pull-to-refresh trio, and `children` are passed to the library.
// NO `items` prop, NO useState shadowing query.data, NO library-side
// pagination state. Self-checklist item 16 + 17 regression-lock this.
//
// V1 hard cap (spec 75 §11 Phase 7): 5 pages × 15 cards = 75 max.
// When the cap is hit, the InfiniteScroll's `endMessage` swaps from
// "you've seen everything" to "refine your search to see more". The
// switch happens via `pageCapReached` recomputed at render time
// (NOT captured in a closure) so the right banner renders when the
// user crosses the threshold.

import { useEffect, useRef } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useLeadFeed } from '@/features/leads/api/useLeadFeed';
import { BuilderLeadCard } from '@/features/leads/components/BuilderLeadCard';
import { EmptyLeadState } from '@/features/leads/components/EmptyLeadState';
import { PermitLeadCard } from '@/features/leads/components/PermitLeadCard';
import { SkeletonLeadCard } from '@/features/leads/components/SkeletonLeadCard';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { MAX_RADIUS_KM } from '@/features/leads/lib/distance';
import { DEFAULT_FEED_LIMIT } from '@/features/leads/lib/get-lead-feed';
import type { LeadFeedItem } from '@/features/leads/types';
import { captureEvent } from '@/lib/observability/capture';

/**
 * V1 hard cap on infinite scroll. Spec 75 §11 Phase 7 — 5 pages of
 * 15 cards = 75 cards max. When the user hits the cap we stop fetching
 * even if `hasNextPage` is true on the server, and the `endMessage`
 * swaps to a "refine your search" prompt. The cap is intentional UX
 * (forcing better filters) AND a perf safety net (capping client-side
 * memory + render cost without virtualization).
 */
export const MAX_PAGES = 5;

export interface LeadFeedProps {
  /** User's trade slug — passed down to each card's SaveButton mutation payload. */
  tradeSlug: string;
  /** Current geolocation. Parent (page) handles permission state and home-base fallback. */
  lat: number;
  lng: number;
}

export function LeadFeed({ tradeSlug, lat, lng }: LeadFeedProps) {
  // Per-selector subscribes — read ONLY the fields LeadFeed actually
  // needs. A whole-store destructure would re-render this component
  // on every unrelated state change (hover/select), which is the
  // exact pattern self-checklist item 13 bans.
  const radiusKm = useLeadFeedState((s) => s.radiusKm);
  const setRadius = useLeadFeedState((s) => s.setRadius);

  const query = useLeadFeed({
    trade_slug: tradeSlug,
    lat,
    lng,
    radius_km: radiusKm,
  });

  // Flatten all loaded pages into a single list of items. Returns []
  // when query.data is undefined (loading window) — the loading vs
  // empty distinction below uses query.isPending/isSuccess, NOT
  // items.length, so this fallback is safe (self-checklist item 2).
  const items: LeadFeedItem[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  // 5-page V1 cap. Computed AT RENDER TIME, NOT captured in a closure
  // — when the user crosses the threshold the next render reads the
  // updated value and `endMessage` swaps banner. (Self-checklist
  // items 16 + 17.)
  const pageCount = query.data?.pages.length ?? 0;
  const pageCapReached = pageCount >= MAX_PAGES;
  const hasMore = (query.hasNextPage ?? false) && !pageCapReached;

  // Telemetry: fire `lead_feed.viewed` exactly once per
  // (trade_slug, lat, lng, radius) quad. A useEffect keyed on
  // query.isSuccess alone would re-fire on every successful refetch,
  // inflating PostHog event counts. We track the last-fired key in a
  // ref and only emit when the key changes. (Self-checklist item 3.)
  const lastViewedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isSuccess) return;
    const key = `${tradeSlug}|${lat}|${lng}|${radiusKm}`;
    if (lastViewedKeyRef.current === key) return;
    lastViewedKeyRef.current = key;
    captureEvent('lead_feed.viewed', {
      trade_slug: tradeSlug,
      item_count: items.length,
      page_count: pageCount,
    });
  }, [
    query.isSuccess,
    tradeSlug,
    lat,
    lng,
    radiusKm,
    items.length,
    pageCount,
  ]);

  // Compute the empty-state variant by combining BOTH navigator.onLine
  // AND the TanStack Query state. navigator.onLine alone is unreliable
  // (returns true for VPNs, captive portals, networks where DNS works
  // but our API is unreachable) per spec 75 §11 Phase 5 step 5.
  // SSR-safe: navigator is undefined during the server render window,
  // so we treat undefined as "online" (the most permissive default;
  // the next render after hydration will correct it). Self-checklist
  // item 12.
  const isBrowserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine;

  // ----- LOADING -----
  // First-page load with no data yet. Showing 3 skeletons matches the
  // average card density on a 375px viewport.
  if (query.isPending && !query.data) {
    return (
      <div className="space-y-3 px-3 py-4">
        <SkeletonLeadCard />
        <SkeletonLeadCard />
        <SkeletonLeadCard />
      </div>
    );
  }

  // ----- ERROR -----
  // Fetch error. Discriminate offline vs unreachable per spec 75
  // §11 Phase 5 step 5.
  if (query.isError) {
    const variant: 'offline' | 'unreachable' = isBrowserOnline
      ? 'unreachable'
      : 'offline';
    captureEvent('lead_feed.empty_state_shown', {
      trade_slug: tradeSlug,
      variant,
    });
    return (
      <EmptyLeadState
        variant={variant}
        currentRadiusKm={radiusKm}
        maxRadiusKm={MAX_RADIUS_KM}
        onRetry={() => {
          captureEvent('lead_feed.refresh', { trade_slug: tradeSlug });
          void query.refetch();
        }}
      />
    );
  }

  // ----- EMPTY -----
  // Fetch succeeded but the server returned 0 items in radius.
  if (query.isSuccess && items.length === 0) {
    captureEvent('lead_feed.empty_state_shown', {
      trade_slug: tradeSlug,
      variant: 'no_results',
    });
    return (
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={radiusKm}
        maxRadiusKm={MAX_RADIUS_KM}
        onExpandRadius={(nextRadiusKm) => {
          captureEvent('lead_feed.filter_changed', {
            field: 'radius',
            from: radiusKm,
            to: nextRadiusKm,
            source: 'expand_cta',
          });
          setRadius(nextRadiusKm);
        }}
      />
    );
  }

  // ----- HAPPY PATH -----
  // Map items to cards via the lead_type discriminator switch. The
  // exhaustiveness check on `lead.lead_type` lives in the type system
  // — adding a new variant to LeadFeedItem will produce a TypeScript
  // narrowing error here, which is the right failure mode.
  const capBanner = (
    <div className="px-6 py-8 text-center">
      <p className="font-display text-sm font-semibold text-text-primary">
        Refine your search to see more
      </p>
      <p className="mt-1 font-display text-xs text-text-secondary">
        You&apos;ve hit the {MAX_PAGES * DEFAULT_FEED_LIMIT}-card limit. Adjust
        your radius or trade filter to dig deeper.
      </p>
    </div>
  );
  const exhaustedBanner = (
    <div className="px-6 py-8 text-center">
      <p className="font-display text-sm text-text-secondary">
        You&apos;ve seen all the leads in this area.
      </p>
    </div>
  );
  // Recomputed every render so it reflects the CURRENT pageCapReached
  // value at the moment the user crosses the threshold (item 17).
  const endMessage = pageCapReached ? capBanner : exhaustedBanner;

  return (
    <InfiniteScroll
      dataLength={items.length}
      next={() => {
        // TanStack Query's `isFetchingNextPage` flag exists exactly
        // for this guard: rapid scrolls past the trigger threshold
        // would otherwise fire fetchNextPage multiple times before
        // the first request resolves, wasting bandwidth and racing
        // the cursor. Caught by Gemini + DeepSeek 2026-04-09 reviews.
        if (query.isFetchingNextPage) return;
        void query.fetchNextPage();
      }}
      hasMore={hasMore}
      loader={
        <div className="space-y-3 px-3 py-4">
          <SkeletonLeadCard />
          <SkeletonLeadCard />
        </div>
      }
      endMessage={endMessage}
      pullDownToRefresh
      pullDownToRefreshThreshold={80}
      pullDownToRefreshContent={
        <p className="py-4 text-center font-display text-sm text-text-secondary">
          Pull down to refresh
        </p>
      }
      releaseToRefreshContent={
        <p className="py-4 text-center font-display text-sm text-text-secondary">
          Release to refresh
        </p>
      }
      refreshFunction={() => {
        captureEvent('lead_feed.refresh', { trade_slug: tradeSlug });
        void query.refetch();
      }}
      // The library reads scrollableTarget when the scrollable
      // container is NOT the window itself. We use the window as the
      // scroll surface (mobile-first), so we DON'T set this prop.
      // Setting it to a missing element would silently break scroll.
      style={{ overflow: 'visible' }}
    >
      <div className="space-y-3 px-3 py-4">
        {items.map((lead) => {
          // Composite key — `lead_id` shape differs between branches
          // (`permit_num:revision_num` for permits, numeric entity_id
          // for builders), so a collision is theoretically possible
          // if a permit_num happened to equal an entity_id as a
          // string. Prefixing with lead_type guarantees uniqueness
          // at near-zero cost. Caught by Gemini 2026-04-09 review.
          const key = `${lead.lead_type}-${lead.lead_id}`;
          return lead.lead_type === 'permit' ? (
            <PermitLeadCard key={key} lead={lead} tradeSlug={tradeSlug} />
          ) : (
            <BuilderLeadCard key={key} lead={lead} tradeSlug={tradeSlug} />
          );
        })}
      </div>
    </InfiniteScroll>
  );
}
