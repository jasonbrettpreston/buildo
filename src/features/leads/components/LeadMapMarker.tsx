'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.10
// 🔗 DESIGN: docs/specs/product/future/74_lead_feed_design.md (cost-tier color tokens)
//
// LeadMapMarker — pure presentational marker rendered as the React
// child of an `<AdvancedMarker>`. Sized to be readable at city-scale
// zoom (≈ z13) without dominating the viewport.
//
// Cost-tier driven coloring keeps the marker visually consistent with
// the cost badges on the cards in the list — a user scanning the
// map sees the same color language as the list (74 §3 design system).
//
// Active state lifts + scales the marker so the focused lead pops
// visually. The active highlight is gated on `useReducedMotion()`
// per WCAG 2.1 SC 2.3.3 — when reduced, we drop the scale transform
// AND the transition (no animated approach to the active state).
// Phase 3-holistic WF3 Phase D extended to map markers.
//
// IMPORTANT: this component does ZERO Zustand reads, ZERO telemetry
// calls, and ZERO data fetching. It is bit-for-bit a function of its
// props, which keeps the LeadMapPane parent able to control hover/
// click semantics in one place and keeps the marker test surface
// minimal.

import { useReducedMotion } from 'motion/react';
import type { PermitLeadFeedItem } from '@/features/leads/types';

export interface LeadMapMarkerProps {
  lead: PermitLeadFeedItem;
  active: boolean;
}

/**
 * Cost-tier → Tailwind class lookup. Aligned with the cost badge
 * palette on PermitLeadCard so the visual language is consistent
 * across the map and the list.
 *
 * Mega + major use the amber-hardhat / amber-rust accent colors
 * (highest-value leads pop). Large/medium/small step down through
 * the slate scale. Null tier (cost not yet computed) uses the
 * neutral background-card color.
 */
const COST_TIER_BG_CLASS: Record<NonNullable<PermitLeadFeedItem['cost_tier']>, string> = {
  mega: 'bg-amber-hardhat text-text-on-accent',
  major: 'bg-amber-hardhat/80 text-text-on-accent',
  large: 'bg-amber-rust text-text-on-accent',
  medium: 'bg-card-permit text-text-primary',
  small: 'bg-card-pressed text-text-secondary',
};
const FALLBACK_BG_CLASS = 'bg-card-pressed text-text-secondary';

export function LeadMapMarker({ lead, active }: LeadMapMarkerProps) {
  // Reduced-motion: drop the scale + transition entirely. The active
  // state still changes color (which is non-motion) so the user can
  // still see which marker is focused — they just don't get the lift.
  const reduceMotion = useReducedMotion();

  const baseClass = lead.cost_tier
    ? COST_TIER_BG_CLASS[lead.cost_tier]
    : FALLBACK_BG_CLASS;

  // Active styling: scale 1.15 + ring + z-index lift. Order matters
  // because Tailwind's last-class-wins doesn't apply when the rules
  // are at different specificities — the scale is applied via a
  // separate utility that doesn't conflict with the base.
  const activeClass = active
    ? reduceMotion
      ? 'ring-2 ring-amber-hardhat z-20'
      : 'ring-2 ring-amber-hardhat z-20 scale-110'
    : '';

  const transitionClass = reduceMotion
    ? ''
    : 'transition-transform duration-150 ease-out';

  return (
    <div
      // role="img" lets us attach an aria-label to a non-interactive
      // div (Biome's useAriaPropsSupportedByRole rule). The marker
      // is a graphic representation of a lead, which is the textbook
      // role="img" use case. Click handling lives on the parent
      // <AdvancedMarker> wrapper supplied by @vis.gl/react-google-maps,
      // so this inner div doesn't need a button role.
      role="img"
      className={[
        // Base shape — pill with strong shadow so it reads against
        // any map terrain. h-7 / min-w-12 keeps the hit area ≥ 24px
        // for trackpad comfort even though touch targets aren't
        // a constraint on desktop-only UI.
        'inline-flex h-7 min-w-12 items-center justify-center rounded-full px-2 font-data text-xs font-bold shadow-lg',
        baseClass,
        activeClass,
        transitionClass,
      ]
        .filter(Boolean)
        .join(' ')}
      // Accessible label exposes the lead type and cost tier (if any)
      // so screen readers walking the map's marker layer hear something
      // useful. The full lead detail is on the corresponding card.
      aria-label={
        lead.cost_tier
          ? `Permit lead, ${lead.cost_tier} cost`
          : 'Permit lead'
      }
      data-active={active ? 'true' : 'false'}
      data-cost-tier={lead.cost_tier ?? 'unknown'}
    >
      {lead.cost_tier === 'mega' || lead.cost_tier === 'major'
        ? '$$$$'
        : lead.cost_tier === 'large'
          ? '$$$'
          : lead.cost_tier === 'medium'
            ? '$$'
            : '$'}
    </div>
  );
}
