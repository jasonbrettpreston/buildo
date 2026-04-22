'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 5
//
// LeadsClientShell — the Client Component bridge between the Server
// Component page (which resolved trade_slug) and the LeadFeed
// container (which needs lat/lng to fetch). Owns the geolocation
// hook and renders a permission UI when geolocation is unavailable
// or denied.
//
// Why this exists separately: page.tsx is a Server Component (auth
// check + DB lookup). It can't use hooks. Splitting the geolocation
// logic into this Client wrapper keeps the auth path server-side
// while letting the runtime data flow live where hooks work.
//
// Geolocation states (from useGeolocation):
//   'idle'        → render "Find leads near me" CTA + auto-request
//   'requesting'  → render a brief loading message
//   'granted'     → render <LeadFeed lat lng />
//   'prompt'      → same as idle (browser hasn't asked yet)
//   'denied'      → render permission-denied UI with manual fallback
//                   (a future phase will add a "saved home base"
//                   selector — for 3-iv we just explain the situation)
//   'unsupported' → render a "your browser doesn't support location"
//                   message (Safari < 16 / HTTP context)
//   'error'       → render the error message + retry

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LeadFeed } from '@/features/leads/components/LeadFeed';
import { LeadMapPane } from '@/features/leads/components/LeadMapPane';
import { useGeolocation } from '@/features/leads/hooks/useGeolocation';
import { captureEvent } from '@/lib/observability/capture';

export interface LeadsClientShellProps {
  tradeSlug: string;
}

export function LeadsClientShell({ tradeSlug }: LeadsClientShellProps) {
  const { status, request } = useGeolocation();

  // Auto-request on first mount when in 'idle' or 'prompt' state.
  // This means the user lands on /leads and immediately sees the
  // browser permission prompt — no extra click. If they decline,
  // the next render shows the denied state.
  //
  // No `lead_feed.viewed` telemetry here — that event is owned by
  // LeadFeed.tsx's useEffect and fires once per
  // (trade, lat, lng, radius) quad after the query succeeds. Adding
  // a second emit at the page-mount stage produced two events with
  // the same name and different payloads, breaking PostHog funnels
  // (independent reviewer 2026-04-09 caught this).
  useEffect(() => {
    if (status.state === 'idle' || status.state === 'prompt') {
      request();
    }
  }, [status.state, request]);

  if (status.state === 'granted') {
    // Phase 6 step 1: desktop two-column layout. Mobile (`< lg`)
    // collapses to a single column and LeadMapPane self-hides via
    // its own `hidden lg:block` classes. The grid template is
    // 500px feed column + remainder for the map (Zillow pattern,
    // spec 75 §5).
    return (
      <main className="min-h-screen bg-feed lg:grid lg:grid-cols-[500px_1fr]">
        <div className="lg:max-h-screen lg:overflow-y-auto">
          <LeadFeed
            tradeSlug={tradeSlug}
            lat={status.coords.lat}
            lng={status.coords.lng}
          />
        </div>
        <LeadMapPane
          tradeSlug={tradeSlug}
          lat={status.coords.lat}
          lng={status.coords.lng}
        />
      </main>
    );
  }

  // Collapse idle, prompt, AND requesting into a single render branch.
  // The auto-request effect fires immediately on mount when the state
  // is idle/prompt, transitioning to 'requesting'. Without this
  // collapse, users see "Loading…" → "Finding leads near you…" as
  // two distinct frames, which feels like a flash of unrelated
  // content. Caught by Gemini 2026-04-09 review.
  if (
    status.state === 'requesting' ||
    status.state === 'idle' ||
    status.state === 'prompt'
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-feed px-6 text-center">
        <p className="font-display text-sm text-text-secondary">
          Finding leads near you…
        </p>
      </main>
    );
  }

  if (status.state === 'denied') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-feed px-6 text-center">
        <h2 className="font-display text-lg font-bold text-text-primary">
          Location access needed
        </h2>
        <p className="max-w-xs font-display text-sm text-text-secondary">
          {status.permanent
            ? 'You\u2019ve blocked location access. Enable it in your browser settings to see nearby leads.'
            : 'We need your location to find nearby permits. Tap the button below to grant access.'}
        </p>
        {!status.permanent && (
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={() => {
              captureEvent('lead_feed.filter_changed', {
                field: 'geolocation',
                source: 'permission_grant_cta',
              });
              request();
            }}
          >
            Grant location access
          </Button>
        )}
      </main>
    );
  }

  if (status.state === 'unsupported') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-feed px-6 text-center">
        <h2 className="font-display text-lg font-bold text-text-primary">
          Location not supported
        </h2>
        <p className="max-w-xs font-display text-sm text-text-secondary">
          Your browser doesn&apos;t support location access. Try Chrome, Edge,
          or Safari 16+ over HTTPS.
        </p>
      </main>
    );
  }

  if (status.state === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-feed px-6 text-center">
        <h2 className="font-display text-lg font-bold text-text-primary">
          Couldn&apos;t get your location
        </h2>
        <p className="max-w-xs font-display text-sm text-text-secondary">
          {status.message}
        </p>
        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={() => {
            captureEvent('lead_feed.filter_changed', {
              field: 'geolocation',
              source: 'error_retry_cta',
            });
            request();
          }}
        >
          Try again
        </Button>
      </main>
    );
  }

  // Exhaustiveness fallback — the union above should cover every
  // GeolocationStatus state, but TypeScript can't always prove that
  // through the if/else chain. This branch is unreachable in
  // practice; it exists so an added state in useGeolocation surfaces
  // as a visible "unknown" UI rather than a render-time crash.
  return (
    <main className="flex min-h-screen items-center justify-center bg-feed px-6 text-center">
      <p className="font-display text-sm text-text-secondary">Loading…</p>
    </main>
  );
}
