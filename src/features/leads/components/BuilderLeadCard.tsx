'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.5
// 🔗 DESIGN: docs/specs/03-mobile/74_lead_feed_design.md
//
// BuilderLeadCard — Phase 3-iii composite. Builder-themed counterpart
// to PermitLeadCard: navy `card-builder` surface, solid amber-hardhat
// left border (no timing color — builders don't have a timing window),
// avatar with initials fallback, stats block (active permits + avg
// project cost), and a footer with Call (tel:) + Website + Save.
//
// Conditional rendering — every "missing data" path omits a row or
// button rather than rendering an empty box:
//   - photo_url null → AvatarFallback shows initials
//   - primary_phone null OR sanitizes to empty → Call button absent
//   - website null OR fails sanitizeWebsite → Website button absent
//   - avg_project_cost null → stats line omits the avg clause
//
// `wsib_registered` is intentionally NOT rendered: the current builder
// CTE WHERE filter requires a WSIB row, so every builder in the feed is
// already WSIB-registered. The badge will return when the feed widens
// to non-WSIB builders.

import { GlobeAltIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SaveButton } from '@/features/leads/components/badges/SaveButton';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import {
  formatBuilderInitials,
  formatCostDisplay,
  formatDistance,
  sanitizeTelHref,
  sanitizeWebsite,
} from '@/features/leads/lib/format';
import { hapticTap } from '@/features/leads/lib/haptics';
import type { BuilderLeadFeedItem } from '@/features/leads/types';
import { captureEvent } from '@/lib/observability/capture';
import { cn } from '@/lib/utils';

const MotionCard = motion.create(Card);

export interface BuilderLeadCardProps {
  lead: BuilderLeadFeedItem;
  tradeSlug: string;
}

function BuilderLeadCardComponent({ lead, tradeSlug }: BuilderLeadCardProps) {
  const selectedLeadId = useLeadFeedState((s) => s.selectedLeadId);
  const setSelectedLeadId = useLeadFeedState((s) => s.setSelectedLeadId);
  const setHoveredLeadId = useLeadFeedState((s) => s.setHoveredLeadId);

  // Phase 3-holistic WF3 Phase D (Independent reviewer Phase 3 I1):
  // reduced-motion support — WCAG 2.1 SC 2.3.3.
  const reduceMotion = useReducedMotion();

  const isActive = selectedLeadId === lead.lead_id;
  const displayName = lead.legal_name?.trim() || 'Unknown builder';
  const initials = formatBuilderInitials(lead.legal_name);
  const distanceLabel = formatDistance(lead.distance_m);

  const telHref = sanitizeTelHref(lead.primary_phone);
  const websiteHref = sanitizeWebsite(lead.website);
  const avgCostLabel = formatCostDisplay(lead.avg_project_cost, null);

  const handleSelect = useCallback(() => {
    // Phase 7 haptic feedback — light 10ms tap for card selection.
    hapticTap(10);
    captureEvent('lead_feed.lead_clicked', {
      lead_type: 'builder',
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

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Gate to non-touch (mouse, pen, stylus). DeepSeek 2026-04-09 review.
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

  // Unmount cleanup mirroring PermitLeadCard — see that file's
  // comment for the rationale (Phase 6 map phantom hover prevention).
  useEffect(() => {
    return () => {
      const currentHover = useLeadFeedState.getState().hoveredLeadId;
      if (currentHover === lead.lead_id) {
        useLeadFeedState.getState().setHoveredLeadId(null);
      }
    };
  }, [lead.lead_id]);

  const handleCallClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation();
      captureEvent('lead_feed.builder_called', {
        lead_id: lead.lead_id,
        entity_id: lead.entity_id,
      });
    },
    [lead.lead_id, lead.entity_id],
  );

  const handleWebsiteClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation();
      captureEvent('lead_feed.builder_website_opened', {
        lead_id: lead.lead_id,
        entity_id: lead.entity_id,
      });
    },
    [lead.lead_id, lead.entity_id],
  );

  return (
    <MotionCard
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Builder lead: ${displayName}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      whileTap={reduceMotion ? { scale: 1 } : { scale: 0.98 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'cursor-pointer overflow-hidden border-l-[3px] border-l-amber-hardhat bg-card-builder p-0',
        isActive && 'ring-2 ring-amber-hardhat',
      )}
    >
      <div className="space-y-3 p-4">
        {/* Avatar + name + business size */}
        <div className="flex items-center gap-3">
          <Avatar>
            {lead.photo_url && <AvatarImage src={lead.photo_url} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-base font-bold text-text-primary">
              {displayName}
            </h3>
            {lead.business_size && (
              <p className="truncate font-display text-sm text-text-secondary">
                {lead.business_size}
              </p>
            )}
          </div>
        </div>

        {/* Stats block: active permits + avg cost */}
        <div>
          <p className="font-display text-sm font-semibold text-text-primary">
            {lead.active_permits_nearby} active permit
            {lead.active_permits_nearby === 1 ? '' : 's'} nearby
          </p>
          <p className="mt-1 font-data text-xs text-text-secondary">
            {distanceLabel && <>Closest: {distanceLabel}</>}
            {avgCostLabel && (
              <>
                {distanceLabel && ' · '}
                Avg: {avgCostLabel}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Footer: Call + Website + Save */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see PermitLeadCard footer — click-bubbling boundary, not an interactive control. */}
      <div
        className="flex border-t border-card-pressed"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {telHref && (
          <Button asChild variant="default" size="default" className="flex-1 rounded-none">
            <a
              href={`tel:${telHref}`}
              onClick={handleCallClick}
              aria-label={`Call ${displayName}`}
            >
              <PhoneIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Call
            </a>
          </Button>
        )}
        {websiteHref && (
          <Button asChild variant="ghost" size="default" className="flex-1 rounded-none">
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWebsiteClick}
              aria-label={`Open ${displayName} website`}
            >
              <GlobeAltIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Website
            </a>
          </Button>
        )}
        <SaveButton
          leadId={lead.lead_id}
          leadType="builder"
          tradeSlug={tradeSlug}
          entityId={lead.entity_id}
          initialSaved={lead.is_saved}
        />
      </div>
    </MotionCard>
  );
}

export const BuilderLeadCard = memo(BuilderLeadCardComponent);
