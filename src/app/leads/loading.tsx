// Next.js route-transition loading UI for /leads. Server-component
// compatible (no hooks, no 'use client' needed). Renders the same
// 3-skeleton stack that LeadFeed's pending state shows so the
// transition from /search → /leads doesn't flash empty space.

import { SkeletonLeadCard } from '@/features/leads/components/SkeletonLeadCard';

export default function LeadsLoading() {
  return (
    <div className="min-h-screen bg-feed">
      <div className="space-y-3 px-3 py-4">
        <SkeletonLeadCard />
        <SkeletonLeadCard />
        <SkeletonLeadCard />
      </div>
    </div>
  );
}
