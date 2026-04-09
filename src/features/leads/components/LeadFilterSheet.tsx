'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.3
//
// LeadFilterSheet — Vaul bottom drawer for adjusting feed filters.
// Phase 3-v ships ONLY the radius filter (5/10/20/30/50 km) plus a
// "Reset to defaults" footer button. Additional filters (trade, cost
// range, project type) are deferred per the 3-v plan because each
// requires backend SELECT extension + UX work that warrants its own
// sub-phase.
//
// The "Reset to defaults" button IS the Layer 3 affordance of the
// Zod deadlock fix that was deferred from the earlier WF3 — when
// Layer 1 (single source of truth for MAX_RADIUS_KM) and Layer 2
// (defensive clamp on rehydration) fail to prevent a corrupted state
// from reaching the server, this is the manual UI escape hatch.
//
// Accessibility: uses Radix Dialog primitives via Vaul, so
// <DrawerTitle> is REQUIRED (Radix throws a dev warning otherwise).
// The ToggleGroup provides keyboard navigation (arrow keys) and
// aria-pressed state automatically.

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DEFAULT_RADIUS_KM, useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { MAX_RADIUS_KM } from '@/features/leads/lib/distance';
import { captureEvent } from '@/lib/observability/capture';

// Derived from MAX_RADIUS_KM so the top option is always the server
// cap. The fixed lower options (5/10/20/30) are product-chosen
// checkpoints; the top is whatever the distance module declares.
// Gemini + DeepSeek holistic review caught that a hardcoded '50'
// was a maintenance time-bomb if MAX_RADIUS_KM ever changes.
const RADIUS_OPTIONS = [
  '5',
  '10',
  '20',
  '30',
  String(MAX_RADIUS_KM),
] as const;

export interface LeadFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadFilterSheet({ open, onOpenChange }: LeadFilterSheetProps) {
  // Per-selector subscribes (no whole-store destructure).
  const radiusKm = useLeadFeedState((s) => s.radiusKm);
  const setRadius = useLeadFeedState((s) => s.setRadius);

  const handleRadiusChange = (value: string) => {
    // CRITICAL guard: Radix ToggleGroup fires onValueChange('') when
    // the user taps the currently-selected item to deselect it.
    // parseInt('', 10) returns NaN, setRadius(NaN) would poison the
    // Zustand store, and the Zod deadlock fix would kick in on next
    // rehydration with a confusing reset. Bail out on empty value.
    if (!value) return;
    const km = Number.parseInt(value, 10);
    if (!Number.isFinite(km) || km <= 0) return;
    if (km === radiusKm) return; // no-op if already selected
    captureEvent('lead_feed.filter_changed', {
      field: 'radius',
      from: radiusKm,
      to: km,
      source: 'filter_sheet',
    });
    setRadius(km);
    // NOTE: we deliberately do NOT close the sheet here. The user
    // should be able to preview 5km → 10km → 20km without the sheet
    // dismissing each time. Only the Reset button closes the sheet
    // (because reset is terminal).
  };

  const handleReset = () => {
    captureEvent('lead_feed.filter_changed', {
      field: 'reset',
      from: radiusKm,
      to: DEFAULT_RADIUS_KM,
      source: 'filter_sheet_reset_cta',
    });
    setRadius(DEFAULT_RADIUS_KM);
    // Close the sheet so the user sees the refetched results
    // immediately. Reset IS a terminal action — unlike a radius
    // nudge, we can assume the user is done with the filter pane.
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>
            Adjust your search radius to find the right leads.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-6 px-4 pb-2">
          <div className="space-y-2">
            {/* Label is NOT associated via htmlFor because Radix
                ToggleGroup.Root renders as `<div role="group">`,
                which is not a labelable HTML element. The group is
                already labelled for screen readers via `aria-label`
                below. Using htmlFor here would silently break the
                click-to-focus behavior that sighted keyboard users
                expect. Independent reviewer caught this. */}
            <Label>Search radius</Label>
            <ToggleGroup
              type="single"
              value={String(radiusKm)}
              onValueChange={handleRadiusChange}
              aria-label="Search radius in kilometres"
            >
              {RADIUS_OPTIONS.map((km) => (
                <ToggleGroupItem
                  key={km}
                  value={km}
                  aria-label={`${km} kilometres`}
                >
                  {km}km
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <DrawerFooter>
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset to defaults
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
