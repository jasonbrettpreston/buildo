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

// ── RE-HOMED at the Spec 122 §5.1 conversion (pilot 3, commit 7) ─────────────
//
// This describe used to read scripts/link-massing.js as TEXT and assert four strings:
// `decideMassingFull(`, `const FULL_MODE = decideMassingFull(`, `if (FULL_MODE)`, and
// the two records_meta gate fields. All of them left that file — the whole gate moved to
// scripts/lib/step/staleness.js `selectMode` (the tri-state mode decision) and the
// retraction became a DECLARED write axis (`retract: "all"` + `retract_when: "full_only"`).
//
// ⚠️ RE-HOMED, NOT DELETED, AND THE THREE PROPERTIES ARE THE SAME THREE. What changed is
// that each is now asserted where it can no longer be satisfied by a coincidence of
// source text: the gate's truth table is proven against the pure `decideMassingFull`
// (still the arbiter, still exported by this file's own subject), the ghost-link cleanup
// is proven against the SQL write.js actually generates, and the two self-consumed
// signals are proven against the descriptor's frozen producer contract — which is what
// `evaluateMassingFullGate` above reads back on the NEXT run.
describe('the FULL relink contract survives the conversion (re-homed from link-massing.js source text)', () => {
  const REPO = path.resolve(__dirname, '../..');
  const descriptor = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/link-massing.descriptor.json'), 'utf8')) as {
    staleness: { mode_select: string; logic_version: string; trigger: Array<{ signal: string; position: string; emit_key?: string; table?: string }> };
    outputs: { writes: Array<{ retract: string; retract_when?: string; write_discipline: { scope: string } }> };
    emits: Array<{ key: string; type: string; consumers: string[] }>;
    terminals: Array<{ kind: string; records_meta: Record<string, string> }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
  const write = require(path.join(REPO, 'scripts/lib/step/write.js')) as {
    buildWritePlan: (w: unknown, d: unknown) => { delete_sql: string | null; retract_when: string };
    retractionFires: (p: unknown, mode: string) => boolean;
  };

  it('FULL comes from the GATE, not from a raw --full flag (was: const FULL_MODE = decideMassingFull(...))', () => {
    // The truth table itself, unchanged and still owned by this file's subject.
    expect(decideMassingFull({ explicitFull: true, forceFull: false, gateChanged: false })).toBe(false);
    expect(decideMassingFull({ explicitFull: true, forceFull: false, gateChanged: true })).toBe(true);
    expect(decideMassingFull({ explicitFull: false, forceFull: true, gateChanged: false })).toBe(true);
    // And the declaration that routes the step through a MODE gate rather than a skip gate.
    expect(descriptor.staleness.mode_select, 'the output of this gate is a MODE, not a skip').toBe('tri_state');
    const signals = descriptor.staleness.trigger.map((t) => t.signal).sort();
    expect(signals, 'both the CODE and the DATA signal, or a predicate flip goes unnoticed').toEqual(['code_version', 'upstream_ledger']);
    for (const t of descriptor.staleness.trigger) expect(t.position).toBe('pre_compute');
  });

  it('the changed-version → full path still performs the ghost-link cleanup, and ONLY in full mode (was: if (FULL_MODE) { DELETE ... })', () => {
    const e2 = descriptor.outputs.writes[1]!;
    expect(e2.retract).toBe('all');
    expect(e2.retract_when, 'an incremental run must never retract').toBe('full_only');
    const plan = write.buildWritePlan(e2, descriptor);
    expect(plan.delete_sql, 'the cleanup is a generated statement now, not a hand-written one').toMatch(/^DELETE FROM parcel_buildings WHERE /);
    // Scoped IDENTICALLY to the parcels the run re-evaluates (B-7) — a wider scope empties
    // the junction for parcels this run never revisits.
    expect(plan.delete_sql).toContain('centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL');
    expect(write.retractionFires(plan, 'full'), 'fires in full mode').toBe(true);
    expect(write.retractionFires(plan, 'incremental'), 'never fires incrementally').toBe(false);
  });

  it('records the gate signals (code_version + building_footprints_count) for the next run — as a DECLARED emit, and building_footprints_count stays a STRING', () => {
    const emits = Object.fromEntries(descriptor.emits.map((e) => [e.key, e]));
    for (const key of ['code_version', 'building_footprints_count']) {
      expect(emits[key], `${key} is no longer published for the next run's gate`).toBeDefined();
      expect(emits[key]!.consumers, 'the consumer is the step itself').toContain('link_massing');
    }
    // evaluateMassingFullGate compares String(prevCount): a type change would make every
    // comparison unequal and force a 21.9-minute relink on every run.
    expect(emits.building_footprints_count!.type).toBe('string');
    expect(descriptor.staleness.logic_version, 'the code signal is the descriptor value the gate compares').toBe(LINK_MASSING_CODE_VERSION);
    const success = descriptor.terminals.find((t) => t.kind === 'success')!;
    for (const key of ['code_version', 'building_footprints_count']) {
      expect(Object.keys(success.records_meta), `${key} missing from the success terminal shape`).toContain(key);
    }
  });
});
