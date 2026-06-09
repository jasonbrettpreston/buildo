// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §8d, §9 (L21/F5b/F5c/G4 grading)
//
// Pure-function tests for enrich-centreline.js: the diagnostic-row grading (L21 zero-intersection
// FAIL/WARN gate, the F5b/F5c/G4 WARN signals) and the row-derived verdict cascade. The §11 SQL
// behavior is covered by the DB test; this locks the threshold logic.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ec = require('../../scripts/enrich-centreline.js');

type Row = { metric: string; value: number; status: string };
const byMetric = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.metric, r.status]));

describe('gradeDiagnosticRows — L21 zero-intersection gate (the verdict driver)', () => {
  const base = { zeroPct: 2, invalidGeom: 0, namePct: 95, nodeNullPct: 5, addrNullPct: 2 };

  it('zero-intersection < 10% → PASS', () => {
    expect(byMetric(ec.gradeDiagnosticRows(base)).parcels_with_zero_centreline_intersections_pct).toBe('PASS');
  });
  it('10% ≤ zero-intersection < 40% → WARN', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...base, zeroPct: 25 })).parcels_with_zero_centreline_intersections_pct).toBe('WARN');
  });
  it('zero-intersection ≥ 40% → FAIL', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...base, zeroPct: 55 })).parcels_with_zero_centreline_intersections_pct).toBe('FAIL');
  });
});

describe('gradeDiagnosticRows — F5b/F5c/G4 diagnostic signals', () => {
  const ok = { zeroPct: 2, invalidGeom: 0, namePct: 95, nodeNullPct: 5, addrNullPct: 2 };

  it('street_name_normalized < 90% → WARN (P1-reliance, L29)', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...ok, namePct: 80 })).parcels_street_name_normalized_pct).toBe('WARN');
    expect(byMetric(ec.gradeDiagnosticRows(ok)).parcels_street_name_normalized_pct).toBe('INFO');
  });
  it('intersection-id NULL > 50% → WARN (corner-detection signal, F5c)', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...ok, nodeNullPct: 60 })).centreline_intersection_id_null_pct).toBe('WARN');
    expect(byMetric(ec.gradeDiagnosticRows(ok)).centreline_intersection_id_null_pct).toBe('INFO');
  });
  it('address_number NULL > 10% → WARN (P2 degradation, G4/F7)', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...ok, addrNullPct: 25 })).parcels_address_number_null_pct).toBe('WARN');
    expect(byMetric(ec.gradeDiagnosticRows(ok)).parcels_address_number_null_pct).toBe('INFO');
  });
  it('invalid_geom_count is always INFO (root-cause signal, F2)', () => {
    expect(byMetric(ec.gradeDiagnosticRows({ ...ok, invalidGeom: 9 })).parcels_invalid_geom_count).toBe('INFO');
  });
});

describe('verdictCascade — row-derived FAIL > WARN > PASS', () => {
  it('cascades correctly', () => {
    expect(ec.verdictCascade([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
    expect(ec.verdictCascade([{ status: 'WARN' }, { status: 'PASS' }])).toBe('WARN');
    expect(ec.verdictCascade([{ status: 'FAIL' }, { status: 'WARN' }])).toBe('FAIL');
  });
});
