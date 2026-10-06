// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10 class 3 — pins declared in the reading step)
// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §9 (L10 contract pin, "1.1")
//
// LDG-10 T12 — the enrich_heritage contract HALT is FAIL-CLOSED and reads its pin from the DESCRIPTOR
// (staleness.pins), never a hard-coded const: a producer stamp other than the declared `equals` HALTs by
// name; a descriptor with no pin (or a pin with no `equals`) throws instead of passing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../../scripts/lib/compute/enrich-heritage.js') as {
  readHeritageContract: (pool: unknown) => Promise<{ datasetVersion: string }>;
  SPEC_VERSION: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pinnedEquals } = require('../../../../scripts/lib/staleness-pins.js') as {
  pinnedEquals: (descriptor: unknown, step: string, stamp: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DESCRIPTOR = require('../../../../scripts/enrich-heritage.descriptor.json');

function poolWith(specVersion: string) {
  return {
    async query(text: string) {
      if (text.includes('FROM pipeline_runs')) {
        return { rows: [{ records_meta: { heritage_load: {
          spec_version: specVersion,
          heritage_register: { feature_count: 10, drift_check_passed: true, source_dataset_version: 'r1' },
          heritage_districts: { feature_count: 5, drift_check_passed: true, source_dataset_version: 'd1' },
        } } }] };
      }
      if (text.includes('FROM heritage_properties')) return { rows: [{ n: 3 }] };
      if (text.includes('FROM heritage_districts')) return { rows: [{ n: 3 }] };
      if (text.includes('Find_SRID')) return { rows: [{ srid: 4326 }] };
      return { rows: [] };
    },
  };
}

describe('enrich_heritage — the contract pin is the descriptor pin, fail-closed (LDG-10 T12)', () => {
  it('the compute pin IS the descriptor staleness.pins equals (declared == executed), and it is the L10 contract value 1.1', () => {
    expect(compute.SPEC_VERSION).toBe(pinnedEquals(DESCRIPTOR, 'load_heritage', 'records_meta.heritage_load.spec_version'));
    expect(compute.SPEC_VERSION).toBe('1.1');
  });

  it('RED: a producer stamping spec_version 9.9 HALTS by name', async () => {
    await expect(compute.readHeritageContract(poolWith('9.9'))).rejects.toThrow(/sources:load_heritage\.spec_version=9\.9 !== 1\.1/);
  });

  it('RED: pins ABSENT throws (never passes)', () => {
    const noPins = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: undefined } };
    expect(() => pinnedEquals(noPins, 'load_heritage', 'records_meta.heritage_load.spec_version')).toThrow(/no staleness\.pins row/);
  });

  it('RED: a pin with no equals throws (a watermark pin cannot be a contract literal)', () => {
    const noEquals = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: [{ step: 'load_heritage', stamp: 'records_meta.heritage_load.spec_version' }] } };
    expect(() => pinnedEquals(noEquals, 'load_heritage', 'records_meta.heritage_load.spec_version')).toThrow(/no `equals`/);
  });

  it('RED: the compute carries NO hard-coded spec_version const — the pin is read from the descriptor (declared == executed)', () => {
    const src = readFileSync(require.resolve('../../../../scripts/lib/compute/enrich-heritage.js'), 'utf8');
    expect(src).not.toMatch(/const SPEC_VERSION = '[0-9.]+'/);
    expect(src).toContain('pinnedEquals(DESCRIPTOR, PRODUCER_STEP, PIN_STAMP)');
  });

  it('GREEN: the real descriptor + a matching 1.1 stamp does not throw and returns the combined lineage version', async () => {
    await expect(compute.readHeritageContract(poolWith('1.1'))).resolves.toEqual({ datasetVersion: 'r1|d1' });
  });

  it('the compute source still carries the literal spec_version= (violations.test.ts:309 source-string lock)', () => {
    const src = readFileSync('scripts/lib/compute/enrich-heritage.js', 'utf8');
    expect(src).toContain('spec_version=');
  });
});
