// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints (Observability)
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 7 item 4
//
// Tiny helper that wraps `logInfo` so Phase 2-ii and Phase 2-iii can't
// accidentally drift on the structured-log shape spec 70 requires:
//   { user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms }
//
// Phase 7 (2026-04-11) added an optional `perfMarks` parameter that
// threads a `createPerfMarks()` builder's output into the same log
// entry. Callers pass `perf.toLog()` and the helper serializes the
// phase-level measurements as a nested `perf_marks` field. Backward
// compatible — omit the param and the log shape is unchanged.

import { logInfo } from '@/lib/logger';

export function logRequestComplete(
  tag: string,
  context: Record<string, unknown>,
  startMs: number,
  perfMarks?: Record<string, number>,
): void {
  // Clamp to non-negative to handle serverless cold-start clock skew
  // where Date.now() can briefly go backwards between the start and
  // end of a request. Caught by Phase 0-3 review (DeepSeek Phase 2 LOW).
  const payload: Record<string, unknown> = {
    ...context,
    duration_ms: Math.max(0, Date.now() - startMs),
  };
  // Only attach perf_marks when it's present AND has at least one
  // measurement. An empty object pollutes log output for no benefit.
  if (perfMarks !== undefined && Object.keys(perfMarks).length > 0) {
    payload.perf_marks = perfMarks;
  }
  logInfo(tag, 'request_complete', payload);
}
