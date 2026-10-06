// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10 class 3 — pins declared in the reading step)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §9 (L10 contract pin, "1.2"; standing ruling C-9)
//
// LDG-10 T12 — the enrich_ravines contract HALT is FAIL-CLOSED and reads its pin from the DESCRIPTOR
// (staleness.pins), never a hard-coded const: a producer stamp other than the declared `equals` HALTs by
// name; a descriptor with no pin (or a pin with no `equals`) throws instead of passing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../../scripts/lib/compute/enrich-ravines.js') as {
  readRavineContract: (pool: unknown) => Promise<{ sourceDatasetVersion: string }>;
  SPEC_VERSION: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pinnedEquals } = require('../../../../scripts/lib/staleness-pins.js') as {
  pinnedEquals: (descriptor: unknown, step: string, stamp: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DESCRIPTOR = require('../../../../scripts/enrich-ravines.descriptor.json');

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

describe('enrich_ravines — the contract pin is the descriptor pin, fail-closed (LDG-10 T12)', () => {
  it('the compute pin IS the descriptor staleness.pins equals (declared == executed), and it is the C-9 contract value 1.2', () => {
    expect(compute.SPEC_VERSION).toBe(pinnedEquals(DESCRIPTOR, 'load_ravines', 'records_meta.ravine_load.spec_version'));
    expect(compute.SPEC_VERSION).toBe('1.2');
  });

  it('RED: a producer stamping spec_version 9.9 HALTS by name', async () => {
    await expect(compute.readRavineContract(poolWith('9.9'))).rejects.toThrow(/sources:load_ravines\.spec_version=9\.9 !== 1\.2/);
  });

  it('RED: pins ABSENT throws (never passes)', () => {
    const noPins = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: undefined } };
    expect(() => pinnedEquals(noPins, 'load_ravines', 'records_meta.ravine_load.spec_version')).toThrow(/no staleness\.pins row/);
  });

  it('RED: a pin with no equals throws (a watermark pin cannot be a contract literal)', () => {
    const noEquals = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: [{ step: 'load_ravines', stamp: 'records_meta.ravine_load.spec_version' }] } };
    expect(() => pinnedEquals(noEquals, 'load_ravines', 'records_meta.ravine_load.spec_version')).toThrow(/no `equals`/);
  });

  it('RED: the compute carries NO hard-coded spec_version const — the pin is read from the descriptor (declared == executed)', () => {
    const src = readFileSync(require.resolve('../../../../scripts/lib/compute/enrich-ravines.js'), 'utf8');
    expect(src).not.toMatch(/const SPEC_VERSION = '[0-9.]+'/);
    expect(src).toContain('pinnedEquals(DESCRIPTOR, PRODUCER_STEP, PIN_STAMP)');
  });

  it('GREEN: the real descriptor + a matching 1.2 stamp does not throw and returns the lineage version', async () => {
    await expect(compute.readRavineContract(poolWith('1.2'))).resolves.toEqual({ sourceDatasetVersion: 'v-2026' });
  });
});
