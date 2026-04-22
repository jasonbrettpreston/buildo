// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 7 item 4
//
// Server-side performance instrumentation builder. Records named phase
// durations for the feed route using the high-resolution monotonic
// clock (`performance.now()`), stored in a local map. Produces a flat
// `{ phase: ms }` record for `logRequestComplete` to emit alongside the
// existing `duration_ms`.
//
// PREVIOUS IMPLEMENTATION WARNING (WF1 2026-04-11 adversarial review):
// An earlier draft used `performance.mark()` and `performance.measure()`
// from Node's `perf_hooks` module. Those APIs store every entry in a
// process-wide global Performance Timeline with NO automatic eviction
// — each request would leak ~21 entries (14 marks + 7 measures) into
// a registry that grows unbounded until process restart. Under
// sustained production load that's a guaranteed OOM.
//
// This implementation uses `performance.now()` instead, which returns
// a monotonic timestamp without touching any global state. Each builder
// holds its own `Map<string, number>` of start times and computed
// durations. When the builder goes out of scope at request-end, the
// garbage collector reclaims it along with all its marks. Zero leak.
//
// Microsecond resolution is preserved (`performance.now()` returns a
// DOMHighResTimeStamp in fractional milliseconds), scope isolation is
// automatic (each builder has its own Map), and the public contract is
// unchanged from the previous implementation — the feed route code
// doesn't need to change.

import { performance } from 'node:perf_hooks';

export interface PerfMarkBuilder {
  /** Record a named point in time. */
  mark(name: string): void;
  /** Record the duration between two previously-marked points. */
  measure(measureName: string, startMark: string, endMark: string): void;
  /** Return a plain `{ name: ms }` record for serialization via logInfo. */
  toLog(): Record<string, number>;
}

/**
 * Create a scoped performance-mark builder. Call once at the top of
 * each request handler; pass `scope.toLog()` through to the request
 * log call at the end. When the handler returns and the builder goes
 * out of scope, all marks are reclaimed by the GC — NO global state
 * is mutated.
 *
 * @param _scope short human-readable label for the scope (e.g., 'leads-feed').
 *               Currently unused — kept in the signature for API
 *               stability and to document caller intent in call sites.
 */
export function createPerfMarks(_scope: string): PerfMarkBuilder {
  // Local maps — NO interaction with Node's global Performance Timeline.
  // The mark map records start times; the measures map records computed
  // durations. Both are plain JS objects scoped to this builder instance.
  const marks: Map<string, number> = new Map();
  const measures: Record<string, number> = {};

  return {
    mark(name: string): void {
      // performance.now() returns a monotonic DOMHighResTimeStamp in
      // fractional milliseconds. Immune to wall-clock adjustments.
      marks.set(name, performance.now());
    },
    measure(measureName: string, startMark: string, endMark: string): void {
      const startTime = marks.get(startMark);
      const endTime = marks.get(endMark);
      if (startTime === undefined || endTime === undefined) {
        // Missing start or end mark — instrumentation must never crash
        // a request. Skip silently.
        return;
      }
      const duration = endTime - startTime;
      if (!Number.isFinite(duration)) {
        // Defensive: if either timestamp was corrupted (shouldn't be
        // possible with performance.now(), but belt and braces) skip
        // rather than emit Infinity/NaN which JSON.stringify turns
        // into null silently.
        return;
      }
      // Round to 2 decimal places (hundredths of a ms) — enough
      // resolution for perf analysis, avoids float noise in logs.
      measures[measureName] = Math.round(duration * 100) / 100;
    },
    toLog(): Record<string, number> {
      // Return a fresh copy so consumers can't mutate our internal
      // state. Matters for reusability if a future caller wants to
      // pass the log to multiple sinks.
      return { ...measures };
    },
  };
}
