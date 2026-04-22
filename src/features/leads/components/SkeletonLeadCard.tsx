'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.8 + §1.2
//
// SkeletonLeadCard — layout-matching skeleton for PermitLeadCard (3-iii)
// to prevent CLS on the skeleton → real card transition. The `tone`
// prop is optional and lets the consumer match the timing color of
// the real card, preventing a color flash from gray → amber/green/blue
// when the real data lands. Gemini Phase 3-ii review (MED).
//
// `'use client'` directive is explicit per spec 75 §1.2 — the spec
// classifies this as a Client Component because the real LeadFeed
// (3-iv, Client) imports it, and Next.js 15's implicit promotion
// works but the explicit directive documents intent.

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type SkeletonTone = 'now' | 'soon' | 'upcoming' | 'future';

export interface SkeletonLeadCardProps {
  /**
   * Timing tone for the left border stripe. Consumers with cached
   * data that hints at the incoming card's tone can pass it here to
   * eliminate the color flash on the skeleton → real card transition.
   * Defaults to `'future'` (neutral gray) when unknown.
   */
  tone?: SkeletonTone;
}

const TONE_BORDER: Record<SkeletonTone, string> = {
  now: 'border-l-amber-hardhat',
  soon: 'border-l-green-safety',
  upcoming: 'border-l-blue-blueprint',
  future: 'border-l-neutral-700',
};

export function SkeletonLeadCard({ tone = 'future' }: SkeletonLeadCardProps = {}) {
  return (
    <Card
      role="status"
      aria-busy="true"
      aria-label="Loading lead card"
      className={cn('border-l-4', TONE_BORDER[tone])}
    >
      <CardContent>
        <div className="flex gap-3" aria-hidden="true">
          {/* Thumbnail 80×60 — h-[60px] because Tailwind's default
              spacing scale has no h-15 (DeepSeek Phase 3-ii HIGH). */}
          <Skeleton className="h-[60px] w-20 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {/* Timing badge placeholder — 44px matches TimingBadge */}
        <Skeleton className="mt-3 h-11 w-full" aria-hidden="true" />
        {/* Cost line */}
        <Skeleton className="mt-3 h-3 w-2/3" aria-hidden="true" />
        {/* Metadata lines */}
        <div className="mt-2 space-y-2" aria-hidden="true">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}
