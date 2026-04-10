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

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useLeadFeed } from '@/features/leads/api/useLeadFeed';
import { BuilderLeadCard } from '@/features/leads/components/BuilderLeadCard';
import { EmptyLeadState } from '@/features/leads/components/EmptyLeadState';
import { LeadFeedHeader } from '@/features/leads/components/LeadFeedHeader';
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
  // selectedLeadId is read so the cleanup effect below can detect
  // when the selected lead has dropped out of the current items.
  const selectedLeadId = useLeadFeedState((s) => s.selectedLeadId);
  const setSelectedLeadId = useLeadFeedState((s) => s.setSelectedLeadId);

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

  // empty_state_shown telemetry — fires exactly once per
  // (trade_slug, variant) combination. Pre-fix this was called
  // directly in the render body of the error / empty branches,
  // which fired on every re-render (Strict Mode double-invoke,
  // background refetch, parent state change). Holistic Phase 3
  // review caught this — independent reviewer C1/CRITICAL 1.
  const lastEmptyStateKeyRef = useRef<string | null>(null);
  useEffect(() => {
    let variant: 'unreachable' | 'offline' | 'no_results' | null = null;
    if (query.isError) {
      const isBrowserOnline =
        typeof navigator === 'undefined' ? true : navigator.onLine;
      variant = isBrowserOnline ? 'unreachable' : 'offline';
    } else if (query.isSuccess && items.length === 0) {
      variant = 'no_results';
    }
    if (variant === null) {
      lastEmptyStateKeyRef.current = null;
      return;
    }
    const key = `${tradeSlug}|${variant}`;
    if (lastEmptyStateKeyRef.current === key) return;
    lastEmptyStateKeyRef.current = key;
    captureEvent('lead_feed.empty_state_shown', {
      trade_slug: tradeSlug,
      variant,
    });
  }, [query.isError, query.isSuccess, items.length, tradeSlug]);

  // selectedLeadId cleanup — when the feed refetches and the
  // previously-selected lead is no longer in the result set (status
  // changed server-side, dropped out of radius, etc.), clear the
  // selection so the future map (Phase 6) doesn't render a phantom
  // marker for a non-existent lead. The check is gated on
  // query.isSuccess so we don't clear during loading windows where
  // items is briefly empty by accident. Holistic Phase 3 review —
  // independent reviewer C2/IMPORTANT 3.
  useEffect(() => {
    if (!query.isSuccess) return;
    if (selectedLeadId === null) return;
    const stillExists = items.some((lead) => lead.lead_id === selectedLeadId);
    if (!stillExists) {
      setSelectedLeadId(null);
    }
  }, [query.isSuccess, selectedLeadId, items, setSelectedLeadId]);

  // Phase 6 step 1: bidirectional map ↔ list sync. When a marker
  // click sets `selectedLeadId` from the LeadMapPane, scroll the
  // matching card in this list into view so the user can see the
  // detail without manually hunting for it. The other direction
  // (card hover/select → marker active state) already works because
  // both the marker and the card read `hoveredLeadId`/`selectedLeadId`
  // from the same Zustand store.
  //
  // Implementation: keep a Map of lead_id → card root element via
  // ref callbacks attached to the wrapper divs in the render below.
  // When `selectedLeadId` flips, find the corresponding element and
  // call scrollIntoView. Honour `prefers-reduced-motion` (skip the
  // smooth animation for users who've asked the OS for reduced
  // motion — WCAG 2.1 SC 2.3.3, same Phase D fix carried forward).
  const reduceMotion = useReducedMotion();
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerCardRef = (leadId: string) => (el: HTMLElement | null) => {
    if (el === null) {
      cardRefs.current.delete(leadId);
    } else {
      cardRefs.current.set(leadId, el);
    }
  };
  useEffect(() => {
    if (selectedLeadId === null) return;
    const el = cardRefs.current.get(selectedLeadId);
    if (!el) return;
    // Feature-detect scrollIntoView. jsdom doesn't implement it (the
    // method is undefined on jsdom Element instances), and a few
    // exotic browser environments stub it as a no-op. The guard
    // keeps tests green and prod safe.
    if (typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({
      block: 'nearest',
      // 'auto' = instant snap, 'smooth' = animated. Reduced-motion
      // users get the instant variant per WCAG 2.3.3.
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [selectedLeadId, reduceMotion]);

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
  // average card density on a 375px viewport. Header renders above
  // every state so the filter sheet is reachable even while loading.
  if (query.isPending && !query.data) {
    return (
      <>
        <LeadFeedHeader leadCount={0} />
        <div className="space-y-3 px-3 py-4">
          <SkeletonLeadCard />
          <SkeletonLeadCard />
          <SkeletonLeadCard />
        </div>
      </>
    );
  }

  // ----- ERROR -----
  // Fetch error. Discriminate offline vs unreachable per spec 75
  // §11 Phase 5 step 5.
  if (query.isError) {
    const variant: 'offline' | 'unreachable' = isBrowserOnline
      ? 'unreachable'
      : 'offline';
    // captureEvent moved to a useEffect above (ref-deduped) so it
    // doesn't fire on every re-render of the error state.
    return (
      <>
        <LeadFeedHeader leadCount={0} />
        <EmptyLeadState
          variant={variant}
          currentRadiusKm={radiusKm}
          maxRadiusKm={MAX_RADIUS_KM}
          onRetry={() => {
            captureEvent('lead_feed.refresh', { trade_slug: tradeSlug });
            void query.refetch();
          }}
        />
      </>
    );
  }

  // ----- EMPTY -----
  // Fetch succeeded but the server returned 0 items in radius.
  if (query.isSuccess && items.length === 0) {
    // captureEvent moved to a useEffect above (ref-deduped).
    return (
      <>
        <LeadFeedHeader leadCount={0} />
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
      </>
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
    <>
      <LeadFeedHeader leadCount={items.length} />
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
        // INTENTIONAL: when the user is at the 5-page cap and pulls to
        // refresh, the refetch replaces all loaded pages with a fresh
        // page-1 result. pageCount drops from 5 → 1, pageCapReached
        // flips false, and the user can scroll to the cap again. This
        // is intentional UX — pull-to-refresh is a "start over" gesture.
        // Independent reviewer 2026-04-09 flagged the dataLength shift
        // (75 → 15) as a potential confusion for the library's internal
        // scroll position tracking, but in practice
        // react-infinite-scroll-component recomputes from the new
        // dataLength on its next pass and the tracking re-stabilizes.
        // If 3-v's filter sheet introduces a new "reset to top"
        // affordance, the cap-reset semantics should be unified there.
      }}
      // The library reads scrollableTarget when the scrollable
      // container is NOT the window itself. We use the window as the
      // scroll surface (mobile-first), so we DON'T set this prop.
      // Setting it to a missing element would silently break scroll.
      // The `overflow: visible` style override prevents the library's
      // default `overflow: auto` from creating a nested scroll
      // container — without this, the page scrolls inside the
      // InfiniteScroll element instead of the window, breaking
      // pull-to-refresh on mobile (the gesture handler attaches to
      // the document, not the inner element).
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
          // Phase 6 step 1: each card is wrapped in a ref-attached
          // div so the scrollIntoView effect can find the matching
          // element by lead_id when a map marker is clicked. The
          // wrapper is a normal block element (NOT display:contents
          // — that breaks scrollIntoView in some browsers because
          // the element has no box of its own). Visual diff is
          // nil because the parent's `space-y-3` already targets
          // direct children.
          return (
            <div
              key={key}
              ref={registerCardRef(lead.lead_id)}
              data-lead-id={lead.lead_id}
            >
              {lead.lead_type === 'permit' ? (
                <PermitLeadCard lead={lead} tradeSlug={tradeSlug} />
              ) : (
                <BuilderLeadCard lead={lead} tradeSlug={tradeSlug} />
              )}
            </div>
          );
        })}
      </div>
    </InfiniteScroll>
    </>
  );
}
