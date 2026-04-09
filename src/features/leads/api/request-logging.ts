// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints (Observability)
//
// Tiny helper that wraps `logInfo` so Phase 2-ii and Phase 2-iii can't
// accidentally drift on the structured-log shape spec 70 requires:
//   { user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms }

import { logInfo } from '@/lib/logger';

export function logRequestComplete(
  tag: string,
  context: Record<string, unknown>,
  startMs: number,
): void {
  // Clamp to non-negative to handle serverless cold-start clock skew
  // where Date.now() can briefly go backwards between the start and
  // end of a request. Caught by Phase 0-3 review (DeepSeek Phase 2 LOW).
  logInfo(tag, 'request_complete', {
    ...context,
    duration_ms: Math.max(0, Date.now() - startMs),
  });
}
