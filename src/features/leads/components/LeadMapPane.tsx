'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.10 + §5
// 🔗 DESIGN: docs/specs/product/future/74_lead_feed_design.md (Zillow split-pane pattern)
//
// LeadMapPane — desktop sidebar Google Map for the lead feed. The
// mobile experience does NOT render a map at all (the column is
// `hidden lg:block`), so the entire mobile bundle is unaffected by
// any map-related code paths.
//
// Architecture decisions for Phase 6 step 1 (the others are step 2/3):
//   - <AdvancedMarker> with React children — NOT the OverlayView +
//     createPortal pattern referenced in the spec. AdvancedMarker is
//     simpler and ships the architecture; OverlayView is the V2
//     escape hatch when we need Motion-rich marker compositions.
//   - No debounced map-pan refetch. Map center is read-only from
//     the user's snapped location (Zustand). Pan/zoom is local to
//     the map. Adding pan-driven refetches is step 2.
//   - No clustering. V1 caps the feed at 75 cards (spec 75 §11
//     Phase 7), well below the ~200-marker perf threshold. Step 3
//     revisits if the cap is lifted.
//
// Telemetry contract (Phase 3-vi cardinality discipline carried
// forward to map interactions):
//   - lead_feed.map_marker_clicked    payload: lead_type, position
//   - lead_feed.map_marker_hovered    payload: lead_type, position
//     (sampled — fires once per (lead_type, marker) pair per session
//     so mousemove storms don't blow up event volume)
//   - lead_feed.map_unavailable       fires once per session when the
//     no-API-key OR API-load-failed fallback renders
//
// `position` is the index of the marker's lead in the feed list, NOT
// the lead_id, matching the existing lead_clicked discipline. This
// keeps PostHog event property cardinality bounded.
//
// SSR safety: this file is `'use client'`. It is imported only by
// LeadsClientShell (also a Client Component). The Server Component
// page.tsx never sees it, so no Maps API call happens during SSR.

// Aliased to GoogleMap to avoid shadowing the JS built-in `Map`
// global (Biome's noShadowRestrictedNames rule). The default-export
// shape from @vis.gl/react-google-maps is `Map`; the alias is
// purely a local naming choice.
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
} from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useRef } from 'react';
import { useLeadFeed } from '@/features/leads/api/useLeadFeed';
import { LeadMapMarker } from '@/features/leads/components/LeadMapMarker';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { isLeadActive } from '@/features/leads/lib/marker-state';
import type { LeadFeedItem, PermitLeadFeedItem } from '@/features/leads/types';
import { captureEvent } from '@/lib/observability/capture';

export interface LeadMapPaneProps {
  /** Trade slug — passed to useLeadFeed so the map and the list share the same TanStack Query key (request is deduplicated). */
  tradeSlug: string;
  /** User's current snapped lat — same value the LeadFeed parent passes to its useLeadFeed call. */
  lat: number;
  /** User's current snapped lng. */
  lng: number;
}

/**
 * Type guard — only permit leads have lat/lng. Builder rows have null
 * lat/lng in the current schema (a builder is not a single point;
 * step 2 will render the closest active permit as the marker). Until
 * then, builders are silently filtered out of the marker layer.
 */
function isPlottablePermit(
  lead: LeadFeedItem,
): lead is PermitLeadFeedItem & { latitude: number; longitude: number } {
  return (
    lead.lead_type === 'permit' &&
    lead.latitude !== null &&
    lead.longitude !== null &&
    Number.isFinite(lead.latitude) &&
    Number.isFinite(lead.longitude)
  );
}

export function LeadMapPane({ tradeSlug, lat, lng }: LeadMapPaneProps) {
  // Per-selector subscribes — never destructure the whole store.
  const radiusKm = useLeadFeedState((s) => s.radiusKm);
  const hoveredLeadId = useLeadFeedState((s) => s.hoveredLeadId);
  const selectedLeadId = useLeadFeedState((s) => s.selectedLeadId);
  const setHoveredLeadId = useLeadFeedState((s) => s.setHoveredLeadId);
  const setSelectedLeadId = useLeadFeedState((s) => s.setSelectedLeadId);

  // The SAME useLeadFeed call shape that LeadFeed uses. TanStack Query
  // dedupes by query key, so this becomes a free read of the cached
  // result — no second network request, no two-source-of-truth risk.
  // Self-checklist item 2.
  const query = useLeadFeed({
    trade_slug: tradeSlug,
    lat,
    lng,
    radius_km: radiusKm,
  });

  const items: LeadFeedItem[] = query.data?.pages.flatMap((p) => p.data) ?? [];
  const plottableLeads = useMemo(
    () => items.filter(isPlottablePermit),
    [items],
  );

  // Map default center reflects the user's location. We don't keep
  // the map center in sync with location after mount — pan/zoom is
  // a local interaction in step 1.
  const defaultCenter = useMemo(() => ({ lat, lng }), [lat, lng]);

  // Hover telemetry sampling — fire `map_marker_hovered` AT MOST once
  // per (lead_type, lead_id) pair per session. Hover events fire on
  // every mouseenter; without dedupe a user wagging the cursor across
  // 10 markers would emit 10x events per pass. Same ref-based dedupe
  // pattern that lead_feed.client_error uses in useLeadFeed.ts.
  const hoveredEmittedRef = useRef<Set<string>>(new Set());

  // No-API-key + API-load-failed fallback. Both paths render the same
  // "Map unavailable" placeholder so the lead list still works (it's
  // a sibling, not a child). The unavailable telemetry fires once per
  // session via the same ref-dedupe pattern.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
  const unavailableEmittedRef = useRef(false);
  useEffect(() => {
    if (apiKey) return;
    if (unavailableEmittedRef.current) return;
    unavailableEmittedRef.current = true;
    captureEvent('lead_feed.map_unavailable', {
      reason: 'missing_api_key',
    });
  }, [apiKey]);

  if (!apiKey) {
    return (
      <section
        className="hidden h-screen items-center justify-center bg-feed p-8 lg:sticky lg:top-0 lg:flex"
        aria-label="Lead map (unavailable)"
      >
        <div className="max-w-sm text-center">
          <p className="font-display text-base font-bold text-text-primary">
            Map unavailable
          </p>
          <p className="mt-2 font-display text-sm text-text-secondary">
            We can&apos;t load the map right now. The lead list still
            works — addresses are shown on each card.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="hidden h-screen bg-feed lg:sticky lg:top-0 lg:block"
      aria-label="Lead map"
    >
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          defaultCenter={defaultCenter}
          defaultZoom={13}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          mapId="lead-feed-map"
        >
          {plottableLeads.map((lead, index) => {
            const active = isLeadActive(
              lead.lead_id,
              hoveredLeadId,
              selectedLeadId,
            );
            return (
              <AdvancedMarker
                key={`permit-${lead.lead_id}`}
                position={{ lat: lead.latitude, lng: lead.longitude }}
                onClick={() => {
                  setSelectedLeadId(lead.lead_id);
                  captureEvent('lead_feed.map_marker_clicked', {
                    lead_type: 'permit',
                    position: index,
                  });
                }}
                onMouseEnter={() => {
                  setHoveredLeadId(lead.lead_id);
                  // Sample: fire once per (lead_type, lead_id) pair.
                  const key = `permit:${lead.lead_id}`;
                  if (!hoveredEmittedRef.current.has(key)) {
                    hoveredEmittedRef.current.add(key);
                    captureEvent('lead_feed.map_marker_hovered', {
                      lead_type: 'permit',
                      position: index,
                    });
                  }
                }}
                onMouseLeave={() => {
                  // Only clear hover if THIS lead is the currently
                  // hovered one — guards against a stale clear when
                  // mouse moves directly from marker A to marker B
                  // (mouseenter B fires before mouseleave A in some
                  // browsers, leaving us with a phantom clear).
                  if (useLeadFeedState.getState().hoveredLeadId === lead.lead_id) {
                    setHoveredLeadId(null);
                  }
                }}
              >
                <LeadMapMarker lead={lead} active={active} />
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </APIProvider>
    </section>
  );
}
