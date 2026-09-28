// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §11 KFM 9
//
// The ingest conservation identity, checked (Spec 122 §11 KFM 9). `records_unchanged`
// must be MEASURED (the write's own no-op count), never DERIVED by subtraction: the
// 2026-09-24 write.js key-type bug wrote 0 of 495,495 parcels and the derived row still
// read 495,495 unchanged, verdict PASS — every dropped row absorbed into "unchanged".
//
// This file proves the PURE library at scripts/lib/step/conservation.js:
//   · a balanced fixture returns the summed identity;
//   · a fixture that DROPS rows throws, naming read + the exact unaccounted count;
//   · a missing `rows_read` (measurement gap) throws — never a green 0;
//   · a counter present but non-finite throws — never a green 0;
//   · the write.js 0-rows shape (read 495495, everything else 0) throws.
import { describe, expect, it } from 'vitest';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const { RowConservationError, SKIP_COUNTERS, rowConservation } = require(
  path.join(process.cwd(), 'scripts/lib/step/conservation.js'),
) as {
  RowConservationError: new (message: string, counts: unknown) => Error & { counts: Record<string, number> };
  SKIP_COUNTERS: readonly string[];
  rowConservation: (acquired: unknown, written: unknown) => {
    read: number;
    skipped: Record<string, number>;
    inserted: number;
    updated: number;
    unchanged: number;
    accounted: number;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('row conservation — the ingest identity (Spec 122 §11 KFM 9)', () => {
  it('SKIP_COUNTERS names the five acquired counters that are deliberate drops', () => {
    expect([...SKIP_COUNTERS]).toEqual([
      'bad_key_count',
      'null_geometry_count',
      'shaped_skipped',
      'duplicate_key_count',
      'invalid_geometry_skipped',
    ]);
    expect(Object.isFrozen(SKIP_COUNTERS)).toBe(true);
  });

  it('a balanced fixture returns the summed identity (accounted === read)', () => {
    const r = rowConservation(
      { rows_read: 100, shaped_skipped: 5, bad_key_count: 3 },
      { inserted: 10, updated: 5, unchanged: 77 },
    );
    expect(r.read).toBe(100);
    expect(r.skipped.shaped_skipped).toBe(5);
    expect(r.skipped.bad_key_count).toBe(3);
    expect(r.skipped.null_geometry_count, 'absent skip counter reads as 0').toBe(0);
    expect(r.inserted).toBe(10);
    expect(r.updated).toBe(5);
    expect(r.unchanged).toBe(77);
    expect(r.accounted, '3 + 5 + 10 + 5 + 77 === 100').toBe(100);
  });

  it('a fixture that DROPS rows throws RowConservationError naming read 100 and 2 row(s) unaccounted', () => {
    // read 100, but 10 + 5 + 80 + 3 accounted = 98 ⇒ 2 rows vanished into thin air.
    expect(() => rowConservation(
      { rows_read: 100, shaped_skipped: 3 },
      { inserted: 10, updated: 5, unchanged: 80 },
    )).toThrow(RowConservationError);

    try {
      rowConservation(
        { rows_read: 100, shaped_skipped: 3 },
        { inserted: 10, updated: 5, unchanged: 80 },
      );
      expect.unreachable('a 2-row gap must throw');
    } catch (err) {
      const e = err as Error & { counts: Record<string, number> };
      expect(e.name).toBe('RowConservationError');
      expect(e.message).toMatch(/read 100/);
      expect(e.message).toMatch(/2 row\(s\) unaccounted/);
      expect(e.counts.read).toBe(100);
      expect(e.counts.accounted).toBe(98);
      expect(e.counts.shaped_skipped).toBe(3);
      expect(e.counts.unchanged).toBe(80);
    }
  });

  it('a missing rows_read (measurement gap) throws — never a green 0', () => {
    expect(() => rowConservation(
      { shaped_skipped: 0 },
      { inserted: 0, updated: 0, unchanged: 0 },
    )).toThrow(RowConservationError);
    expect(() => rowConservation(
      { shaped_skipped: 0 },
      { inserted: 0, updated: 0, unchanged: 0 },
    )).toThrow(/rows_read/);
  });

  it("a counter present but non-finite (shaped_skipped: 'x') throws — never a green 0", () => {
    expect(() => rowConservation(
      { rows_read: 100, shaped_skipped: 'x' },
      { inserted: 10, updated: 5, unchanged: 85 },
    )).toThrow(RowConservationError);
    expect(() => rowConservation(
      { rows_read: 100, shaped_skipped: 'x' },
      { inserted: 10, updated: 5, unchanged: 85 },
    )).toThrow(/shaped_skipped/);
  });

  it('the write.js 0-rows shape (read 495495, everything else 0) throws', () => {
    // The 2026-09-24 bug: validateGeometries keyed Number(source_key) vs a TEXT key, so
    // the guarded upsert wrote 0/495,495. Derived records_unchanged read 495,495, PASS.
    expect(() => rowConservation(
      { rows_read: 495495 },
      { inserted: 0, updated: 0, unchanged: 0 },
    )).toThrow(RowConservationError);
    try {
      rowConservation({ rows_read: 495495 }, { inserted: 0, updated: 0, unchanged: 0 });
      expect.unreachable('the 0-write shape must throw');
    } catch (err) {
      const e = err as Error;
      expect(e.name).toBe('RowConservationError');
      expect(e.message).toMatch(/read 495495/);
      expect(e.message).toMatch(/495495 row\(s\) unaccounted/);
    }
  });
});
