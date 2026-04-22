'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.5 (BuilderLeadCard context)
// 🔗 DESIGN: docs/specs/03-mobile/74_lead_feed_design.md §Opportunity
//
// OpportunityBadge — displays the opportunity classification for a
// permit lead. Spec 70 §4 Behavioral Contract defines the 4-category
// signal that helps a tradesperson decide whether to chase a lead:
//
//   'homeowner'    — Small Residential / Interior Alteration / no
//                    builder listed → HIGH win chance
//   'newbuild'     — New Houses / New Building → needs full trade
//                    lineup, good for subcontracting
//   'builder-led'  — Known builder with a track record → established
//                    relationship required, lower immediate chance
//   'unknown'      — Neutral fallback when signal isn't strong enough
//                    (this is the default for 95% of permits where
//                    builder_name is absent per spec 70)
//
// Spec 74 §Opportunity locks the palette: amber for homeowner (highest
// action signal), green for newbuild, muted gray for builder-led and
// unknown. Icons are inline heroicons outline variants — the lookup
// table below is the single source of truth for the type → visual
// mapping.

import {
  BuildingOffice2Icon,
  HomeIcon,
  QuestionMarkCircleIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type OpportunityType = 'homeowner' | 'newbuild' | 'builder-led' | 'unknown';

interface OpportunityMeta {
  label: string;
  bg: string;
  text: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const OPPORTUNITY_LOOKUP: Record<OpportunityType, OpportunityMeta> = {
  homeowner: {
    label: 'Homeowner',
    bg: 'bg-amber-hardhat',
    text: 'text-neutral-900',
    Icon: HomeIcon,
  },
  newbuild: {
    label: 'New Build',
    bg: 'bg-green-safety',
    text: 'text-neutral-900',
    Icon: BuildingOffice2Icon,
  },
  'builder-led': {
    label: 'Builder-led',
    bg: 'bg-neutral-600',
    text: 'text-neutral-100',
    Icon: WrenchScrewdriverIcon,
  },
  unknown: {
    label: 'Unknown',
    bg: 'bg-neutral-700',
    text: 'text-neutral-300',
    Icon: QuestionMarkCircleIcon,
  },
};

export interface OpportunityBadgeProps {
  type: OpportunityType;
  /** Optional className override — merged via `cn()` */
  className?: string;
}

/**
 * Pure presentational badge. The spec 70 fallback for missing signal
 * (`builder_name` absent, no permit_type match) is `'unknown'` — the
 * lookup table above always returns a defined meta so the component
 * cannot crash on an unexpected input (the Record type guarantees all
 * 4 keys are present, and TypeScript prevents any other string at the
 * call site).
 */
export function OpportunityBadge({ type, className }: OpportunityBadgeProps) {
  const meta = OPPORTUNITY_LOOKUP[type];
  const { Icon } = meta;
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold',
        meta.bg,
        meta.text,
        className,
      )}
      role="img"
      aria-label={`Opportunity: ${meta.label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * Exported for test assertions on the lookup table.
 */
export const __opportunityLookup = OPPORTUNITY_LOOKUP;
