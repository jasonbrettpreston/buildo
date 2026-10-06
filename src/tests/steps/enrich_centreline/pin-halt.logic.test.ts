// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10 class 3 — pins declared in the reading step)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §9 (L10 contract pin, "1.1")
//
// LDG-10 class 3 parity with enrich_heritage T12 — the enrich_centreline contract HALT is FAIL-CLOSED and reads
// its pin from the DESCRIPTOR (staleness.pins), never a hard-coded const: a producer stamp other than the
// declared `equals` HALTs by name; a descriptor with no pin (or a pin with no `equals`) throws instead of passing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../../scripts/lib/compute/enrich-centreline.js') as {
  readCentrelineContract: (pool: unknown) => Promise<{ sourceDatasetVersion: string; mode: string }>;
  SPEC_VERSION: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pinnedEquals } = require('../../../../scripts/lib/staleness-pins.js') as {
  pinnedEquals: (descriptor: unknown, step: string, stamp: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DESCRIPTOR = require('../../../../scripts/enrich-centreline.descriptor.json');

const STEP = 'load_centreline';
const STAMP = 'records_meta.centreline_load.spec_version';
const V = '2026-09-01T00:00:00Z';

function poolWith(specVersion: string) {
  return {
    async query(sql: string, params: unknown[] = []) {
      if (/FROM parcels/.test(sql)) return { rows: [{ n: 0 }] };
      if (JSON.stringify(params).includes('load_centreline')) {
        return { rows: [{ records_meta: { centreline_load: { spec_version: specVersion, features_inserted: 5, source_dataset_version: V } } }] };
      }
      return { rows: [{ records_meta: { centreline_enrich: { source_dataset_version: V } } }] };
    },
  };
}

describe('enrich_centreline — the contract pin is the descriptor pin, fail-closed (LDG-10 class 3)', () => {
  it('the compute pin IS the descriptor staleness.pins equals (declared == executed), and it is the L10 contract value 1.1', () => {
    expect(compute.SPEC_VERSION).toBe(pinnedEquals(DESCRIPTOR, STEP, STAMP));
    expect(compute.SPEC_VERSION).toBe('1.1');
  });

  it('RED: a producer stamping spec_version 9.9 HALTS by name', async () => {
    await expect(compute.readCentrelineContract(poolWith('9.9'))).rejects.toThrow(/sources:load_centreline\.spec_version=9\.9 !== 1\.1/);
  });

  it('RED: pins ABSENT throws (never passes)', () => {
    const noPins = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: undefined } };
    expect(() => pinnedEquals(noPins, STEP, STAMP)).toThrow(/no staleness\.pins row/);
  });

  it('RED: a pin with no equals throws (a watermark pin cannot be a contract literal)', () => {
    const noEquals = { ...DESCRIPTOR, staleness: { ...DESCRIPTOR.staleness, pins: [{ step: STEP, stamp: STAMP }] } };
    expect(() => pinnedEquals(noEquals, STEP, STAMP)).toThrow(/no `equals`/);
  });

  it('RED: the compute carries NO hard-coded spec_version const — the pin is read from the descriptor (declared == executed)', () => {
    const src = readFileSync(require.resolve('../../../../scripts/lib/compute/enrich-centreline.js'), 'utf8');
    expect(src).not.toMatch(/const SPEC_VERSION = '[0-9.]+'/);
    expect(src).toContain('pinnedEquals(DESCRIPTOR, PRODUCER_STEP, PIN_STAMP)');
  });

  it('GREEN: the real descriptor + a matching 1.1 stamp does not throw and returns the producer version', async () => {
    await expect(compute.readCentrelineContract(poolWith('1.1'))).resolves.toMatchObject({ sourceDatasetVersion: V, mode: 'skip' });
  });
});
