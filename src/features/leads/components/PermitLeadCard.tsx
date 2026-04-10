'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.4
// 🔗 DESIGN: docs/specs/product/future/74_lead_feed_design.md
//
// PermitLeadCard (collapsed) — Phase 3-iii composite. Composes the
// Phase 3-ii atomic primitives (TimingBadge, OpportunityBadge,
// SaveButton, Card, Button) and renders a single permit row from
// the unified feed. The expanded variant + tap-to-record-view live
// in the Phase 4 detail-view phase.
//
// Layout: Card shell with a left timing-color border (solid for high
// confidence, dashed otherwise) → address line + neighbourhood subline +
// distance → TimingBadge → cost row + permit type → OpportunityBadge →
// footer with SaveButton + Directions button.
//
// Conditional rendering rules — every "missing data" path omits a row
// rather than rendering an empty box (no zero-height divs, no "—"
// placeholders):
//   - neighbourhood_name null → subline absent
//   - both estimated_cost AND cost_tier null → cost row absent
//   - latitude / longitude null → Directions button absent
//   - street_num + street_name both null → falls back to permit_type;
//     if THAT is null too, falls back to "Permit lead"
//
// All interactive elements call `captureEvent` per CLAUDE.md §12.4
// Frontend Mode rule 4 (AST-grep enforced).

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OpportunityBadge } from '@/features/leads/components/badges/OpportunityBadge';
import { SaveButton } from '@/features/leads/components/badges/SaveButton';
import { TimingBadge } from '@/features/leads/components/badges/TimingBadge';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import {
  formatAddress,
  formatCostDisplay,
  formatDistance,
} from '@/features/leads/lib/format';
import type { PermitLeadFeedItem } from '@/features/leads/types';
import { captureEvent } from '@/lib/observability/capture';
import { cn } from '@/lib/utils';

// Module-scope motion wrapper — creating motion.create() inside the
// component body would mint a new component type every render, which
// React treats as a different element and unmounts/remounts on every
// tick. Hoisted per the Phase 3-ii SaveButton pattern (Gemini HIGH
// review fix).
const MotionCard = motion.create(Card);

// Spec 74 §Timing color tokens — solid for confidence='high', dashed
// for the heuristic tiers. The dashed treatment is the visual signal
// that the lead's timing was inferred from the SQL phase proxy rather
// than the spec-71 3-tier engine.
function getTimingBorderClass(
  confidence: 'high' | 'medium' | 'low',
  score: number,
): { color: string; style: 'solid' | 'dashed' } {
  let color: string;
  if (score >= 25) color = 'border-l-timing-now';
  else if (score >= 20) color = 'border-l-timing-soon';
  else if (score >= 10) color = 'border-l-timing-upcoming';
  else color = 'border-l-timing-distant';
  return {
    color,
    style: confidence === 'high' ? 'solid' : 'dashed',
  };
}

// Cost text color tokens from spec 74 §Cost. Tier-keyed instead of
// dollar-bucket-keyed because tier already encodes the spec's bucket
// boundaries — formatCostDisplay handles the dollar formatting.
const COST_TIER_TEXT_CLASS: Record<NonNullable<PermitLeadFeedItem['cost_tier']>, string> = {
  small: 'text-cost-small',
  medium: 'text-cost-medium',
  large: 'text-cost-large',
  major: 'text-cost-major font-semibold',
  mega: 'text-cost-mega font-semibold',
};

export interface PermitLeadCardProps {
  lead: PermitLeadFeedItem;
  /** Trade slug from the parent feed — required by SaveButton's mutation payload. */
  tradeSlug: string;
}

function PermitLeadCardComponent({ lead, tradeSlug }: PermitLeadCardProps) {
  // Per-selector subscribes — destructuring the whole store would
  // re-render this card on every unrelated state change. AST-grep
  // enforces the no-Context rule, but per-selector subscribes are a
  // separate Phase 3-ii feedback finding worth re-locking here.
  const selectedLeadId = useLeadFeedState((s) => s.selectedLeadId);
  const setSelectedLeadId = useLeadFeedState((s) => s.setSelectedLeadId);
  const setHoveredLeadId = useLeadFeedState((s) => s.setHoveredLeadId);

  // Phase 3-holistic WF3 Phase D (Independent reviewer Phase 3 I1):
  // disable whileTap + spring transition when the OS asks for
  // reduced motion. WCAG 2.1 Success Criterion 2.3.3.
  const reduceMotion = useReducedMotion();

  const isActive = selectedLeadId === lead.lead_id;

  const address =
    formatAddress(lead.street_num, lead.street_name) ??
    lead.permit_type ??
    'Permit lead';
  const distanceLabel = formatDistance(lead.distance_m);
  const isClose = lead.distance_m < 1000;
  const costLabel = formatCostDisplay(lead.estimated_cost, lead.cost_tier);
  const costClass = lead.cost_tier
    ? COST_TIER_TEXT_CLASS[lead.cost_tier]
    : 'text-text-secondary';

  const directionsHref =
    lead.latitude !== null &&
    lead.longitude !== null &&
    Number.isFinite(lead.latitude) &&
    Number.isFinite(lead.longitude)
      ? `https://www.google.com/maps/dir/?api=1&destination=${lead.latitude},${lead.longitude}`
      : null;

  const border = getTimingBorderClass(lead.timing_confidence, lead.timing_score);

  // Tap on the card body (NOT the footer buttons — those stopPropagation)
  // selects the lead so the future map can highlight the matching marker.
  // captureEvent is fail-open per the wrapper's contract: a PostHog outage
  // must NEVER block the user interaction.
  const handleSelect = useCallback(() => {
    captureEvent('lead_feed.lead_clicked', {
      lead_type: 'permit',
      lead_id: lead.lead_id,
      distance_m: lead.distance_m,
    });
    setSelectedLeadId(lead.lead_id);
  }, [lead.lead_id, lead.distance_m, setSelectedLeadId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect],
  );

  // Pointer hover gated to mouse — touch fires pointerenter on tap and
  // never fires the matching pointerleave when the user scrolls away,
  // leaving phantom `hoveredLeadId` state that the map (Phase 6) would
  // misread. Self-checklist item 19.
  const handlePointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Gate to non-touch (mouse, pen, stylus). Excluding only 'touch'
      // is more inclusive than requiring 'mouse' — stylus users on
      // tablets get hover, but mobile taps don't leak phantom state.
      // DeepSeek 2026-04-09 review.
      if (e.pointerType !== 'touch') setHoveredLeadId(lead.lead_id);
    },
    [lead.lead_id, setHoveredLeadId],
  );
  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'touch') setHoveredLeadId(null);
    },
    [setHoveredLeadId],
  );

  // Hover-state unmount cleanup. If a card unmounts while it's the
  // currently-hovered lead (e.g., scroll past, list refresh, filter
  // change), the pointerLeave event never fires and `hoveredLeadId`
  // would stay set to a lead that no longer renders. Phase 6 map
  // would highlight a phantom marker. We clear ONLY if the unmounting
  // card's own lead_id is the active hover — otherwise we'd clobber
  // a hover that legitimately moved to a different card during the
  // unmount cycle. Caught by holistic Phase 3 review (self-checklist
  // item 1, independent reviewer C7).
  useEffect(() => {
    return () => {
      const currentHover = useLeadFeedState.getState().hoveredLeadId;
      if (currentHover === lead.lead_id) {
        useLeadFeedState.getState().setHoveredLeadId(null);
      }
    };
  }, [lead.lead_id]);

  const handleDirectionsClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation();
      captureEvent('lead_feed.directions_opened', {
        lead_type: 'permit',
        lead_id: lead.lead_id,
      });
    },
    [lead.lead_id],
  );

  return (
    <MotionCard
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Permit lead${distanceLabel ? `, ${distanceLabel} away` : ''}: ${address}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      whileTap={reduceMotion ? { scale: 1 } : { scale: 0.98 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'cursor-pointer overflow-hidden border-l-4 p-0',
        border.color,
        border.style === 'dashed' ? 'border-l-dashed' : 'border-l-solid',
        isActive && 'ring-2 ring-amber-hardhat',
      )}
    >
      <div className="space-y-3 p-4">
        {/* Address + neighbourhood + distance */}
        <div>
          <h3 className="truncate font-display text-base font-bold text-text-primary">
            {address}
          </h3>
          {lead.neighbourhood_name && (
            <p className="truncate font-display text-sm text-text-secondary">
              {lead.neighbourhood_name}
            </p>
          )}
          {distanceLabel && (
            <p
              className={cn(
                'mt-1 font-data text-sm',
                isClose ? 'text-amber-hardhat' : 'text-text-secondary',
              )}
            >
              {distanceLabel}
            </p>
          )}
        </div>

        {/* Timing badge — score is the 0-30 timing PILLAR score, NOT
            the 0-100 composite relevance_score. TimingBadge's bands
            (25/20/10) and ProgressCircle scaling are both calibrated
            for the pillar range; passing relevance_score would make
            nearly every lead render as "NOW" because most composite
            scores exceed 25. Caught by independent reviewer 2026-04-09. */}
        <TimingBadge
          display={lead.timing_display}
          confidence={lead.timing_confidence}
          score={lead.timing_score}
        />

        {/* Cost + permit type — entire row absent if both cost fields null */}
        {(costLabel || lead.permit_type) && (
          <div className="space-y-1">
            {costLabel && (
              <p className="font-data text-sm">
                <span className={costClass}>{costLabel}</span>
                {lead.permit_type && (
                  <span className="text-text-secondary"> · {lead.permit_type}</span>
                )}
              </p>
            )}
            {!costLabel && lead.permit_type && (
              <p className="truncate font-display text-sm text-text-secondary">
                {lead.permit_type}
              </p>
            )}
          </div>
        )}

        {/* Opportunity badge */}
        <OpportunityBadge type={lead.opportunity_type} />
      </div>

      {/* Footer: Save + Directions.
          biome-ignore lint/a11y/noStaticElementInteractions: This div is
          a click-bubbling boundary, NOT an interactive control. Its only
          purpose is to stopPropagation on click events that originate
          from the (already accessible) Save button + Directions link
          children, preventing them from also firing the card root's
          handleSelect. The div itself has no semantic meaning — using
          role="presentation" is the correct ARIA hint here. */}
      <div
        className="flex border-t border-card-pressed"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <SaveButton
          leadId={lead.lead_id}
          leadType="permit"
          tradeSlug={tradeSlug}
          permitNum={lead.permit_num}
          revisionNum={lead.revision_num}
          initialSaved={lead.is_saved}
        />
        {directionsHref && (
          <Button asChild variant="ghost" size="default" className="flex-1">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDirectionsClick}
              aria-label="Open directions in Google Maps"
            >
              <ArrowTopRightOnSquareIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Directions
            </a>
          </Button>
        )}
      </div>
    </MotionCard>
  );
}

// React.memo with default shallow-compare. TanStack Query returns stable
// item references across re-fetches as long as the row hasn't changed,
// so the default comparator is safe. A custom equality on `lead_id` would
// break when the underlying lead's saved/score changes.
export const PermitLeadCard = memo(PermitLeadCardComponent);
