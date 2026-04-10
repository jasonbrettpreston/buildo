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

import type { MapCameraChangedEvent, MapMouseEvent } from '@vis.gl/react-google-maps';
// Aliased to GoogleMap to avoid shadowing the JS built-in `Map`
// global (Biome's noShadowRestrictedNames rule). The default-export
// shape from @vis.gl/react-google-maps is `Map`; the alias is
// purely a local naming choice.
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
} from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FORCED_REFETCH_THRESHOLD_M,
  useLeadFeed,
} from '@/features/leads/api/useLeadFeed';
import { LeadMapMarker } from '@/features/leads/components/LeadMapMarker';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { haversineMeters } from '@/features/leads/lib/haversine';
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
  const setSnappedLocation = useLeadFeedState((s) => s.setSnappedLocation);

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

  const plottableLeads = useMemo(
    () =>
      (query.data?.pages.flatMap((p) => p.data) ?? []).filter(isPlottablePermit),
    [query.data],
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

  // C1 fix: Google Maps fires AdvancedMarker onClick and Map onClick
  // as INDEPENDENT events — marker clicks propagate to the map. Without
  // a guard, clicking a marker would setSelectedLeadId then immediately
  // clear it via handleMapClick. The ref is set to true in the marker's
  // onClick and checked (then reset) in handleMapClick. Both run in the
  // same synchronous event dispatch, so the flag is reliable.
  const markerClickedRef = useRef(false);

  // C2 fix: @vis.gl/react-google-maps fires onCameraChanged on the
  // initial mount to communicate the initial viewport. Without this
  // guard, the debounced handler would fire a false map_panned event
  // (and potentially race with the GPS snap-advance in useLeadFeed).
  // The flag flips false after the first camera event is received,
  // allowing all subsequent events (real user pans) through.
  const isInitialCameraEventRef = useRef(true);

  // Phase 6 step 2: debounced map-pan refetch. When the user pans the
  // map, each camera change generates a new center lat/lng. Without
  // debouncing, every pan frame would trigger a snap advance + refetch,
  // exploding the cache and hammering the API. The 500ms debounce
  // means we only refetch after the user stops panning.
  //
  // The threshold gate (FORCED_REFETCH_THRESHOLD_M = 500m) reuses the
  // same haversine check that useLeadFeed uses for GPS-based snap
  // advances. Minor pans within a neighbourhood are no-ops — only a
  // meaningful pan (>500m from the current snap) triggers a refetch.
  const panTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCameraChanged = useCallback(
    (event: MapCameraChangedEvent) => {
      // Skip the initial camera event that fires on mount — it's the
      // library communicating the initial viewport, not a user pan.
      if (isInitialCameraEventRef.current) {
        isInitialCameraEventRef.current = false;
        return;
      }
      // Extract values eagerly BEFORE the timeout. The event object
      // could theoretically be pooled/recycled by the library between
      // the synchronous call and the 500ms timeout. Reading now
      // eliminates the hidden assumption about library internals.
      const { lat: newLat, lng: newLng } = event.detail.center;
      if (panTimerRef.current) clearTimeout(panTimerRef.current);
      panTimerRef.current = setTimeout(() => {
        const currentSnap = useLeadFeedState.getState().snappedLocation;
        if (!currentSnap) return;
        const delta = haversineMeters(
          currentSnap.lat,
          currentSnap.lng,
          newLat,
          newLng,
        );
        if (delta > FORCED_REFETCH_THRESHOLD_M) {
          // TODO (step 3): pan and GPS both write to snappedLocation.
          // The GPS snap-advance in useLeadFeed can override a deliberate
          // pan within the same render cycle. Step 3 should introduce a
          // `snapSource` discriminator ('gps' | 'pan') so the GPS effect
          // defers when the user explicitly panned. Also: snappedLocation
          // is persisted, so pan advances leak into the next session's
          // resume position — decide if pan-resume is intentional UX.
          setSnappedLocation({ lat: newLat, lng: newLng });
          captureEvent('lead_feed.map_panned', {
            delta_m: Math.round(delta),
          });
        }
      }, 500);
    },
    [setSnappedLocation],
  );

  // Phase 6 step 2: click-to-deselect. Clicking the map background
  // (not a marker) clears selectedLeadId so hover preview resumes.
  //
  // C1 guard: Google Maps fires BOTH AdvancedMarker.onClick and
  // Map.onClick on a marker click — they are independent event
  // channels (gmp-click DOM event vs. Maps API click event). Without
  // the markerClickedRef guard, every marker click would select and
  // then immediately deselect the lead. The ref is set to true in the
  // marker's onClick handler (same synchronous dispatch), checked
  // here, and reset so the next genuine background click works.
  const handleMapClick = useCallback(
    (_event: MapMouseEvent) => {
      if (markerClickedRef.current) {
        markerClickedRef.current = false;
        return;
      }
      if (useLeadFeedState.getState().selectedLeadId !== null) {
        setSelectedLeadId(null);
        captureEvent('lead_feed.map_deselected', {});
      }
    },
    [setSelectedLeadId],
  );

  // Cleanup the debounce timer on unmount to prevent state updates
  // on an unmounted component.
  useEffect(() => {
    return () => {
      if (panTimerRef.current) clearTimeout(panTimerRef.current);
    };
  }, []);

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
          onCameraChanged={handleCameraChanged}
          onClick={handleMapClick}
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
                  // C1: flag that a marker was clicked so handleMapClick
                  // skips its deselect logic on the same dispatch.
                  markerClickedRef.current = true;
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
