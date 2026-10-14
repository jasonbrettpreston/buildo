// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10 — pins declared in the reading step)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §9 (L10 contract pin, "1.2"; standing ruling C-9)
//
// LDG-10 T12 — the enrich_ravines spec_version contract is the DESCRIPTOR pin, fail-closed, and (S1-P) is evaluated by the
// RUNNER, not thrown by the compute. Fence retained from the pre-S1-P lock: the pin value lives only in
// the descriptor (declared == executed — the compute carries no hard-coded const and no descriptor require);
// a producer stamp other than the declared `equals` is a FAIL row (halt) naming the stamp, never a pass.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports */
const compute = require('../../../../scripts/lib/compute/enrich-ravines.js') as {
  readRavineContract: (ctx: unknown) => Promise<unknown>;
  SPEC_VERSION?: string;
};
const { evaluatePins, makeProducer } = require('../../../../scripts/lib/step/producer.js') as {
  evaluatePins: (pins: unknown[], res: Record<string, unknown>, cfg?: object) => Array<{ result: string; status: string; pin_id: string }>;
  makeProducer: (d: { pool: unknown; chains: string[] }) => unknown;
};
const DESCRIPTOR = require('../../../../scripts/enrich-ravines.descriptor.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const STEP = 'load_ravines';
const STAMP = 'records_meta.ravine_load.spec_version';
const EXPECTED = '1.2';
const SRC = readFileSync(require.resolve('../../../../scripts/lib/compute/enrich-ravines.js'), 'utf8');
const PIN = (DESCRIPTOR.staleness.pins as Array<{ step: string; stamp: string; equals?: string }>).find((p) => p.step === STEP && p.stamp === STAMP);

function poolWith(specVersion: string) {
  return {
    async query(text: string) {
      if (text.includes('FROM pipeline_runs')) {
        return { rows: [{ records_meta: { ravine_load: {
          spec_version: specVersion, delete_skipped_empty_guard: false, drift_check_passed: true,
          mass_delete_check_passed: true, feature_count: 100, invalid_geometry_skipped: 0, source_dataset_version: 'v-2026',
        } } }] };
      }
      if (text.includes('FROM ravines')) return { rows: [{ n: 42 }] };
      if (text.includes('Find_SRID')) return { rows: [{ srid: 4326 }] };
      return { rows: [] };
    },
  };
}

const found = (specVersion: string) => ({
  reason: 'FOUND', sid: 1, status: 'completed', completed_at: 't',
  records_meta: { ravine_load: { spec_version: specVersion } },
});

describe('enrich_ravines — the contract pin is the descriptor pin, fail-closed (LDG-10 T12)', () => {
  it('the descriptor declares the spec_version pin (declared == executed) at the contract value ' + EXPECTED, () => {
    expect(PIN, 'spec_version pin must be declared').toBeDefined();
    expect(PIN!.equals).toBe(EXPECTED);
  });

  it('RED: a producer stamping spec_version 9.9 is a runner pin FAIL row naming the stamp (the halt moved out of the compute)', () => {
    const rows = evaluatePins([PIN], { [STEP]: found('9.9') });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('FAIL');
    expect(rows[0]!.status).toBe('FAIL');
    expect(rows[0]!.pin_id).toContain(STAMP);
  });

  it('GREEN: the matching stamp is a PASS row', () => {
    expect(evaluatePins([PIN], { [STEP]: found(EXPECTED) })[0]!.result).toBe('PASS');
  });

  it('RED: no producer run at all is MISSING (FAIL) — the former "no successful run" HALT', () => {
    const rows = evaluatePins([PIN], { [STEP]: { reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null } });
    expect(rows[0]!.result).toBe('MISSING');
    expect(rows[0]!.status).toBe('FAIL');
  });

  it('RED: the compute carries NO hard-coded spec_version const, no descriptor require, no pinnedEquals, and exports no SPEC_VERSION', () => {
    expect(SRC).not.toMatch(/const SPEC_VERSION = /);
    expect(SRC).not.toMatch(/pinnedEquals|\.descriptor\.json/);
    expect(compute.SPEC_VERSION).toBeUndefined();
  });

  it('the hook no longer halts on a wrong spec_version itself (the runner pin owns that verdict) and reads the producer through ctx.producer', async () => {
    const pool = poolWith('9.9');
    await expect(compute.readRavineContract({ pool, producer: makeProducer({ pool, chains: ['sources'] }) })).resolves.toMatchObject({ sourceDatasetVersion: 'v-2026' });
  });
});
