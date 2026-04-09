'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5 step 2
//
// Next.js route-level error boundary for /leads. Catches RENDER-TIME
// exceptions that escape LeadFeed's in-tree error handling — fetch
// errors stay inside TanStack Query and surface as
// `query.isError → <EmptyLeadState variant="unreachable">` instead.
// This boundary is the LAST line of defense for the kind of error
// that crashes a React subtree (e.g., a card consumes a malformed
// row that survived mapRow + Zod, or a third-party library throws
// during render).
//
// The reset() callback re-mounts the children — TanStack Query keeps
// its cache, so a successful re-render uses the cached data without
// a fresh fetch.

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/observability/sentry';

export default function LeadsErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { route: '/leads', digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-feed px-6 text-center">
      <h2 className="font-display text-lg font-bold text-text-primary">
        Something went wrong loading leads
      </h2>
      {error.digest && (
        <p className="font-data text-xs text-text-tertiary">
          Error ID: {error.digest}
        </p>
      )}
      <p className="max-w-xs font-display text-sm text-text-secondary">
        We&apos;ve logged this and will look into it. You can try reloading
        the feed below.
      </p>
      <Button type="button" variant="default" size="lg" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
