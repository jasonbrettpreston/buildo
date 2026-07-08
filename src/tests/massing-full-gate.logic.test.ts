// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (WF2 P11-2 — link_massing --full gate)
//
// The `--full` chain_arg no longer forces a full relink every quarterly run; the gate
// does a full relink ONLY when the building_footprints corpus count changed OR the
// matching code version was bumped (the b16c036-class guard). These locks pin: the
// pure full/incremental decision, the change-detection (data + code + bootstrap), and
// the source contract that a FULL run still performs the ghost-link cleanup.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require('../../scripts/lib/massing-full-gate.js');
const { decideMassingFull, evaluateMassingFullGate, LINK_MASSING_CODE_VERSION } = gate;

// Mock pool: the count query returns `count`; the pipeline_runs query returns `metaRows`.
function mockPool(count: string, metaRows: Array<{ records_meta: unknown }>) {
  return {
    query: async (sql: string) => {
      if (/FROM building_footprints/.test(sql)) return { rows: [{ n: count }] };
      if (/pipeline_runs/.test(sql)) return { rows: metaRows };
      return { rows: [] };
    },
  };
}

describe('decideMassingFull — full only when permitted AND changed (or forced)', () => {
  it('force env → full regardless of gate', () => {
    expect(decideMassingFull({ explicitFull: false, forceFull: true, gateChanged: false })).toBe(true);
  });
  it('sources chain (--full) + gate changed → full', () => {
    expect(decideMassingFull({ explicitFull: true, forceFull: false, gateChanged: true })).toBe(true);
  });
  it('sources chain (--full) + gate unchanged → INCREMENTAL (the savings)', () => {
    expect(decideMassingFull({ explicitFull: true, forceFull: false, gateChanged: false })).toBe(false);
  });
  it('permits chain (no --full) + gate changed → still incremental (full-capability tied to --full)', () => {
    expect(decideMassingFull({ explicitFull: false, forceFull: false, gateChanged: true })).toBe(false);
  });
});

describe('evaluateMassingFullGate — change detection', () => {
  it('no prior run → changed (bootstrap full)', async () => {
    const g = await evaluateMassingFullGate(mockPool('427077', []));
    expect(g).toMatchObject({ changed: true, reason: 'no_prior_run', buildingCount: '427077' });
  });

  it('prior code_version differs → changed (the b16c036-class guard → full relink)', async () => {
    const g = await evaluateMassingFullGate(
      mockPool('427077', [{ records_meta: { code_version: 'v1-OLD-predicate', building_footprints_count: '427077' } }]),
    );
    expect(g.changed).toBe(true);
    expect(g.reason).toContain('code_version_changed');
  });

  it('building_footprints count differs → changed (a quarterly reload → full relink)', async () => {
    const g = await evaluateMassingFullGate(
      mockPool('428000', [{ records_meta: { code_version: LINK_MASSING_CODE_VERSION, building_footprints_count: '427077' } }]),
    );
    expect(g.changed).toBe(true);
    expect(g.reason).toContain('massing_count_changed');
  });

  it('same code + same count → unchanged (incremental)', async () => {
    const g = await evaluateMassingFullGate(
      mockPool('427077', [{ records_meta: { code_version: LINK_MASSING_CODE_VERSION, building_footprints_count: '427077' } }]),
    );
    expect(g).toMatchObject({ changed: false, reason: 'unchanged' });
  });

  it('pre-P11 run (no recorded signals) → treated as UNCHANGED (trusts the last full relink)', async () => {
    const g = await evaluateMassingFullGate(mockPool('427077', [{ records_meta: { parcels_linked: 485135 } }]));
    expect(g).toMatchObject({ changed: false, reason: 'unchanged' });
  });
});

describe('link-massing.js source contract — a FULL run still cleans ghost links', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/link-massing.js'), 'utf8');
  it('FULL_MODE comes from the gate (decideMassingFull), not a raw --full flag', () => {
    expect(SRC).toContain('decideMassingFull(');
    expect(SRC).toMatch(/const FULL_MODE = decideMassingFull\(/);
  });
  it('the changed-version → full path performs the ghost-link cleanup (DELETE gated on FULL_MODE)', () => {
    expect(SRC).toMatch(/if \(FULL_MODE\)/);
    expect(SRC).toMatch(/cleared .* existing links for re-evaluation/);
  });
  it('records the gate signals (code_version + building_footprints_count) for the next run', () => {
    expect(SRC).toContain('code_version: LINK_MASSING_CODE_VERSION');
    expect(SRC).toContain('building_footprints_count: massingGate.buildingCount');
  });
});
