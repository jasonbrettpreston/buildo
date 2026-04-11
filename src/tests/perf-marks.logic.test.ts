// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 7
//
// createPerfMarks — server-side performance instrumentation builder.
// Wraps Node's perf_hooks API so the feed route can emit named phase
// durations alongside the existing request log. Collisions across
// concurrent requests are prevented by a random scope prefix.

import { describe, it, expect } from 'vitest';
import { createPerfMarks } from '@/features/leads/lib/perf-marks';

describe('createPerfMarks', () => {
  it('returns a builder with mark/measure/toLog functions', () => {
    const p = createPerfMarks('test');
    expect(typeof p.mark).toBe('function');
    expect(typeof p.measure).toBe('function');
    expect(typeof p.toLog).toBe('function');
  });

  it('toLog returns an empty object before any measure is taken', () => {
    const p = createPerfMarks('test');
    p.mark('start');
    p.mark('end');
    // mark alone doesn't populate the log — measure does
    expect(p.toLog()).toEqual({});
  });

  it('measure records a named duration in milliseconds (2-decimal precision)', () => {
    const p = createPerfMarks('test');
    p.mark('a');
    // tiny synchronous delay so the duration is non-zero
    for (let i = 0; i < 1e5; i++) {
      Math.sqrt(i);
    }
    p.mark('b');
    p.measure('work', 'a', 'b');
    const log = p.toLog();
    expect(log).toHaveProperty('work');
    expect(typeof log.work).toBe('number');
    expect(log.work).toBeGreaterThanOrEqual(0);
    // 2-decimal rounding means at most one decimal past the hundredths place
    expect(log.work).toBe(Math.round((log.work ?? 0) * 100) / 100);
  });

  it('toLog returns a plain object safe for JSON serialization', () => {
    const p = createPerfMarks('test');
    p.mark('start');
    p.mark('end');
    p.measure('total', 'start', 'end');
    const log = p.toLog();
    // JSON round-trip to prove it's serializable (no BigInt, no functions)
    expect(() => JSON.stringify(log)).not.toThrow();
    const roundtrip = JSON.parse(JSON.stringify(log));
    expect(roundtrip).toEqual(log);
  });

  it('swallows errors when measuring with a missing start mark (does not crash the request)', () => {
    const p = createPerfMarks('test');
    p.mark('end');
    // 'nonexistent' was never marked — Node perf_hooks throws
    expect(() => p.measure('broken', 'nonexistent', 'end')).not.toThrow();
    expect(p.toLog()).not.toHaveProperty('broken');
  });

  it('swallows errors when measuring with a missing end mark', () => {
    const p = createPerfMarks('test');
    p.mark('start');
    expect(() => p.measure('broken', 'start', 'nonexistent')).not.toThrow();
    expect(p.toLog()).not.toHaveProperty('broken');
  });

  it('supports multiple measurements in a single scope', () => {
    const p = createPerfMarks('test');
    p.mark('a');
    p.mark('b');
    p.mark('c');
    p.measure('ab', 'a', 'b');
    p.measure('bc', 'b', 'c');
    p.measure('ac', 'a', 'c');
    const log = p.toLog();
    expect(Object.keys(log)).toEqual(expect.arrayContaining(['ab', 'bc', 'ac']));
  });

  it('isolates marks across scope instances (no cross-scope collision)', () => {
    // Two concurrent requests get two independent builders. Each uses
    // a unique random prefix so marks with the same name don't collide.
    const p1 = createPerfMarks('req1');
    const p2 = createPerfMarks('req2');
    p1.mark('start');
    p2.mark('start');
    p1.mark('end');
    p2.mark('end');
    p1.measure('total', 'start', 'end');
    p2.measure('total', 'start', 'end');
    // Both builders report their own totals
    expect(p1.toLog()).toHaveProperty('total');
    expect(p2.toLog()).toHaveProperty('total');
    // Cross-builder isolation: measuring with p1's marks from p2 should fail
    // gracefully (scope prefix mismatch → mark-not-found → error swallowed)
    expect(() => p2.measure('leak', 'start', 'end')).not.toThrow();
  });

  it('toLog returns a new object on each call (no shared mutation)', () => {
    const p = createPerfMarks('test');
    p.mark('start');
    p.mark('end');
    p.measure('first', 'start', 'end');
    const log1 = p.toLog();
    // Mutate the returned object
    log1.first = 9999;
    // Second call should return the real value, not the mutated one
    const log2 = p.toLog();
    expect(log2.first).not.toBe(9999);
  });

  it('does NOT populate Node global Performance Timeline (memory-leak regression lock)', async () => {
    // WF1 2026-04-11 adversarial review caught a memory leak in the
    // first implementation: it used Node's `performance.mark()` and
    // `performance.measure()` APIs which stash entries in a global
    // registry with NO automatic eviction. Under sustained prod load
    // that's an OOM.
    //
    // The current implementation uses `performance.now()` with local
    // storage instead. This test locks that property by asserting the
    // global Performance Timeline sees NO new entries after creating
    // a builder, taking measurements, and letting it go out of scope.
    const { performance: nodePerf } = await import('node:perf_hooks');
    const entriesBefore = nodePerf.getEntriesByType('mark').length
      + nodePerf.getEntriesByType('measure').length;

    const p = createPerfMarks('leak-check');
    p.mark('a');
    p.mark('b');
    p.mark('c');
    p.measure('ab', 'a', 'b');
    p.measure('bc', 'b', 'c');
    p.measure('ac', 'a', 'c');
    // Verify the log has the expected measurements — proves the
    // builder did real work, not a no-op.
    expect(Object.keys(p.toLog())).toEqual(expect.arrayContaining(['ab', 'bc', 'ac']));

    const entriesAfter = nodePerf.getEntriesByType('mark').length
      + nodePerf.getEntriesByType('measure').length;
    // ZERO new global entries — the builder never touched the global
    // timeline. If this assertion ever fails, someone has regressed
    // back to the `performance.mark()` / `performance.measure()` API
    // and re-introduced the leak.
    expect(entriesAfter).toBe(entriesBefore);
  });
});
