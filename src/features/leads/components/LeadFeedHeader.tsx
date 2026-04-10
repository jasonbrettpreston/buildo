'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.2
//
// LeadFeedHeader — sticky translucent filter bar that appears above
// the LeadFeed's scroll container. Uses `position: sticky` (NOT fixed)
// because fixed positioning breaks on mobile when the address bar
// collapses/expands during scroll. The iOS glass effect comes from
// `backdrop-blur-md bg-feed/80` — the translucent background lets
// the card content show through faintly as it scrolls under.
//
// Layout:
//   Left:  MapPin icon + location label + " · {radiusKm}km" (tap → open filter sheet)
//   Right: "{leadCount} leads" (readonly count of currently-loaded cards)
//
// Tap target: 44px minimum via min-h-11 on the location button. The
// right-side lead count is a plain span — not interactive.

import { MapPinIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';
import { LeadFilterSheet } from '@/features/leads/components/LeadFilterSheet';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { captureEvent } from '@/lib/observability/capture';

export interface LeadFeedHeaderProps {
  /** Number of currently-loaded leads across all fetched pages. Displayed in the right-side readout. */
  leadCount: number;
}

export function LeadFeedHeader({ leadCount }: LeadFeedHeaderProps) {
  // Ephemeral UI state — NOT in Zustand. The filter sheet's open/close
  // is per-component-instance, not persisted across sessions.
  const [filterOpen, setFilterOpen] = useState(false);

  // Per-selector Zustand subscribes. `location` is optional — it's
  // null until the user grants geolocation OR a future home-base
  // selector wires it in.
  const location = useLeadFeedState((s) => s.location);
  const radiusKm = useLeadFeedState((s) => s.radiusKm);

  // "Near you" when we have coords (could be geolocation OR a saved
  // home base in a future phase), "Set location" when not. No
  // coordinate values appear in the header text (PII safe).
  const locationLabel = location !== null ? 'Near you' : 'Set location';

  const handleOpen = () => {
    // Dedicated event name (not `lead_feed.filter_changed`) because
    // opening the sheet is a UI navigation action, NOT a filter
    // value mutation. Conflating them inflates the filter_changed
    // count in PostHog by 1 for every sheet open and corrupts
    // funnel analysis. Independent reviewer Item 15 caught this.
    captureEvent('lead_feed.filter_sheet_opened', {
      source: 'header_tap',
    });
    setFilterOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-card-pressed bg-feed/80 backdrop-blur-md">
        <div className="flex min-h-11 items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={handleOpen}
            className="-ml-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-card-pressed active:bg-elevated"
            // NO aria-label — the visible text "{locationLabel} · {radiusKm}km"
            // is more informative than a static "Open filter sheet"
            // override would be. An aria-label would HIDE the dynamic
            // location/radius readout from screen readers and replace
            // it with a generic string. Gemini holistic review caught
            // this. aria-expanded announces the sheet state for AT.
            aria-expanded={filterOpen}
            // Phase 3-holistic WF3 Phase D (Independent reviewer
            // Phase 3 I3): link the button to the DrawerContent so
            // AT knows which element opens. `aria-haspopup="dialog"`
            // announces it as a modal rather than a menu.
            aria-controls="lead-filter-sheet"
            aria-haspopup="dialog"
          >
            <MapPinIcon
              className="h-4 w-4 text-amber-hardhat"
              aria-hidden="true"
            />
            <span className="font-display text-sm font-semibold text-text-primary">
              {locationLabel} · {radiusKm}km
            </span>
          </button>
          <span className="font-data text-xs text-text-secondary">
            {leadCount} {leadCount === 1 ? 'lead' : 'leads'}
          </span>
        </div>
      </header>
      <LeadFilterSheet open={filterOpen} onOpenChange={setFilterOpen} />
    </>
  );
}
