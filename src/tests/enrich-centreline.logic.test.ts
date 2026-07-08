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

// WF2 P11-1 — version-skip gate regression locks.
describe('decideCentrelineMode — the version-skip gate', () => {
  const V = '79029bb3';
  it('changed producer version → full recompute (re-stamp all)', () => {
    expect(ec.decideCentrelineMode({ lastVersion: 'OLD', currentVersion: V, staleCount: 0 })).toBe('full');
  });
  it('no prior run (null lastVersion) → full (bootstrap)', () => {
    expect(ec.decideCentrelineMode({ lastVersion: null, currentVersion: V, staleCount: null })).toBe('full');
  });
  it('unchanged version + a NULL/stale-stamp parcel → INCREMENTAL, never skipped', () => {
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 1 })).toBe('incremental');
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 14512 })).toBe('incremental');
  });
  it('unchanged version + zero stale parcels → full skip', () => {
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 0 })).toBe('skip');
  });
});

describe('BUILD_TEMP_SQL_SCOPED — the incremental restriction', () => {
  it('adds the NULL/stale-stamp predicate ($1 = current version) to the full build', () => {
    expect(ec.BUILD_TEMP_SQL_SCOPED).not.toBe(ec.BUILD_TEMP_SQL);
    expect(ec.BUILD_TEMP_SQL_SCOPED).toContain('centreline_dataset_version_when_enriched IS DISTINCT FROM $1');
    expect((ec.BUILD_TEMP_SQL_SCOPED.match(/\$1/g) || []).length).toBe(1);
    expect(ec.BUILD_TEMP_SQL).not.toContain('IS DISTINCT FROM $1');
  });
});

describe('emitReducedSummary — Observer-style COMPLETED emission (not a lock SKIP)', () => {
  const V = '79029bb3';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pipeline = require('../../scripts/lib/pipeline.js');
  function capture(mode: string, staleCount: number, updated: number) {
    const origS = pipeline.emitSummary;
    const origM = pipeline.emitMeta;
    let summary: Record<string, unknown> = {};
    let writes: Record<string, unknown> = {};
    pipeline.emitSummary = (s: Record<string, unknown>) => { summary = s; };
    pipeline.emitMeta = (_r: unknown, w: Record<string, unknown>) => { writes = w; };
    try {
      ec.emitReducedSummary({ mode, staleCount, updated, sourceDatasetVersion: V, RUN_AT: new Date('2026-07-08T10:00:00Z'), t0: Date.now() });
    } finally {
      pipeline.emitSummary = origS;
      pipeline.emitMeta = origM;
    }
    return { summary, writes };
  }

  it('skip: records_updated 0, PASS verdict, carries source_dataset_version, writes nothing', () => {
    const { summary, writes } = capture('skip', 0, 0);
    const meta = summary.records_meta as { audit_table: { verdict: string }, centreline_enrich: Record<string, unknown> };
    expect(summary.records_updated).toBe(0);
    expect(meta.audit_table.verdict).toBe('PASS');
    expect(meta.centreline_enrich.source_dataset_version).toBe(V); // gate reads this next run
    expect(meta.centreline_enrich.skip_reason).toBe('version_and_geometry_unchanged');
    expect(writes).toEqual({}); // no writes → stamps preserved → assertCentrelineEnriched coverage holds
  });

  it('incremental: records_updated N, writes the derived parcel cols, reason=incremental', () => {
    const { summary, writes } = capture('incremental', 14512, 3);
    const meta = summary.records_meta as { centreline_enrich: Record<string, unknown> };
    expect(summary.records_updated).toBe(3);
    expect(meta.centreline_enrich.skip_reason).toBe('version_unchanged_incremental');
    expect(meta.centreline_enrich.parcels_recomputed).toBe(14512);
    expect((writes as { parcels?: string[] }).parcels).toContain('centreline_dataset_version_when_enriched');
  });
});
