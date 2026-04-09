'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5 step 5
// 🔗 DESIGN: docs/specs/product/future/74_lead_feed_design.md
//
// EmptyLeadState — three discrete empty states discriminated by a
// `variant` prop. Pure presentational; the parent (`LeadFeed`) decides
// which variant to render based on `navigator.onLine` + the TanStack
// Query state. Spec 75 §11 Phase 5 step 5 documents the two-layer
// offline detection rationale: `navigator.onLine` is unreliable
// (returns true for VPNs, captive portals, networks where DNS works
// but our API is unreachable), so the parent verifies with the query
// state and picks the variant.
//
// Three variants:
//   'no_results'  — query succeeded with 0 items. Offer "expand radius".
//   'offline'     — both signals fail (navigator.onLine === false AND
//                   the most recent fetch failed). Manual retry only.
//   'unreachable' — navigator.onLine === true but fetch failed. The
//                   server is down or the user is on a captive portal.
//                   Manual retry plus an explanation.
//
// Touch targets are >= 44px on every CTA per spec 75 §1.1.

import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  SignalSlashIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export type EmptyLeadStateVariant = 'no_results' | 'offline' | 'unreachable';

/**
 * How many km to add when the user taps "Expand radius" on the
 * no_results variant. Tuned for the 10–50km range — 5km is enough
 * that the result set actually changes (catching new permits in the
 * outer ring) without overshooting past the user's serviceable area.
 */
const RADIUS_INCREMENT_KM = 5;

// Discriminated union — enforces at the type level that `no_results`
// requires `onExpandRadius` and that `offline`/`unreachable` require
// `onRetry`. Pre-fix the props were both optional, so a developer
// could render a `no_results` variant without `onExpandRadius` and
// silently ship a dead button. Caught by Gemini 2026-04-09 review.
interface EmptyLeadStateBaseProps {
  /** Current radius from the Zustand store — used to display the next radius CTA. */
  currentRadiusKm: number;
  /** Maximum allowed radius — used to disable the expand CTA at the cap. */
  maxRadiusKm: number;
}

export type EmptyLeadStateProps =
  | (EmptyLeadStateBaseProps & {
      variant: 'no_results';
      /** Required for the no_results variant — called when the user taps Expand radius. */
      onExpandRadius: (nextRadiusKm: number) => void;
    })
  | (EmptyLeadStateBaseProps & {
      variant: 'offline';
      /** Required for the offline variant — called when the user taps Try again. */
      onRetry: () => void;
    })
  | (EmptyLeadStateBaseProps & {
      variant: 'unreachable';
      /** Required for the unreachable variant — called when the user taps Try again. */
      onRetry: () => void;
    });

export function EmptyLeadState(props: EmptyLeadStateProps) {
  const { variant, currentRadiusKm, maxRadiusKm } = props;
  if (variant === 'no_results') {
    // Bump the radius by RADIUS_INCREMENT_KM, clamped at the
    // configured max. Spec 70 §API Endpoints documents
    // max_radius_km = 50. The "at cap" branch hides the button
    // entirely so we never expose a control that does nothing.
    const nextRadius = Math.min(currentRadiusKm + RADIUS_INCREMENT_KM, maxRadiusKm);
    const atCap = currentRadiusKm >= maxRadiusKm;
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
        role="status"
        aria-live="polite"
      >
        <MagnifyingGlassIcon
          className="h-12 w-12 text-text-tertiary"
          aria-hidden="true"
        />
        <h2 className="font-display text-lg font-bold text-text-primary">
          No leads in this area yet
        </h2>
        <p className="max-w-xs font-display text-sm text-text-secondary">
          {atCap
            ? `You're already searching the maximum ${maxRadiusKm}km radius. Try a different trade or check back later.`
            : `Try expanding your search radius — you're currently looking within ${currentRadiusKm}km.`}
        </p>
        {!atCap && (
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={() => props.onExpandRadius(nextRadius)}
          >
            Expand to {nextRadius}km
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'offline') {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
        role="status"
        aria-live="polite"
      >
        <SignalSlashIcon
          className="h-12 w-12 text-text-tertiary"
          aria-hidden="true"
        />
        <h2 className="font-display text-lg font-bold text-text-primary">
          You&apos;re offline
        </h2>
        <p className="max-w-xs font-display text-sm text-text-secondary">
          We&apos;ll show your saved leads when you&apos;re back online. Tap
          retry once your connection returns.
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => props.onRetry()}
        >
          <ArrowPathIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  // 'unreachable' — exhaustive on the discriminated union
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <WifiIcon className="h-12 w-12 text-text-tertiary" aria-hidden="true" />
      <h2 className="font-display text-lg font-bold text-text-primary">
        Can&apos;t reach the server
      </h2>
      <p className="max-w-xs font-display text-sm text-text-secondary">
        Your connection looks fine, but we couldn&apos;t load leads. This is
        usually temporary — try again in a moment.
      </p>
      <Button
        type="button"
        variant="default"
        size="lg"
        onClick={() => props.onRetry()}
      >
        <ArrowPathIcon className="mr-2 h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
