// Shadcn UI — Skeleton primitive
// Scaffolded manually, adapted for the Buildo dark palette. The
// `animate-pulse` class is the Tailwind v4 built-in; spec 74 calls for
// a shimmer sweep but pulse is the V1 implementation. Shimmer upgrade
// flagged for 3-vi polish.

import type * as React from 'react';
import { cn } from '@/lib/utils';

// Skeleton is a presentational placeholder. It does NOT own ARIA
// live-region semantics — the PARENT component that composes multiple
// Skeleton blocks (e.g., SkeletonLeadCard) is responsible for the
// single `role="status" aria-busy="true" aria-label="Loading..."`
// wrapper, and passes `aria-hidden="true"` down to each Skeleton
// block so the accessibility tree sees one loading announcement
// instead of N enumerated blocks. Nested role="status" + aria-hidden
// is invalid ARIA per the Independent + DeepSeek Phase 3-ii review.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-card-pressed', className)}
      {...props}
    />
  );
}

export { Skeleton };
