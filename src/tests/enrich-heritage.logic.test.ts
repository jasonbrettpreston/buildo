/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (§8d, §11.1)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
 *
 * Batch-2 row 2.2 disposition (FOLD-G1 precedent): the pre-conversion pure-helper unit tests
 * for scripts/enrich-heritage.js's verdictCascade + module-contract exports. Both claims are
 * RE-DERIVED against the converted artifacts, never dropped — the frozen shell exports none of
 * PRODUCER_NAME/PIPELINE_NAME/ADVISORY_LOCK_ID/verdictCascade as JS values any more (Spec 122
 * §5.1 shape), but every underlying guarantee survives, moved to its new declared home.
 */
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdictLib = require('../../scripts/lib/step/verdict.js');

describe('enrich-heritage — verdict cascade (RE-DERIVED: Rule 10 retired the local verdictCascade duplicate)', () => {
  it('FAIL > WARN > PASS; INFO is cascade-neutral — proven against the shared, generic deriveVerdict every converted step now uses', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (status: string): any => ({ metric: 'x', value: 0, threshold: 'x', status });
    expect(verdictLib.deriveVerdict([row('INFO'), row('INFO')])).toBe('PASS');
    expect(verdictLib.deriveVerdict([row('INFO'), row('WARN')])).toBe('WARN');
    expect(verdictLib.deriveVerdict([row('WARN'), row('FAIL')])).toBe('FAIL');
  });
});

describe('enrich-heritage — module contract (RE-DERIVED against the descriptor, DEC-C claims re-pointed)', () => {
  it('the frozen shell exports descriptor + compute, and identity fields carry the same facts the legacy constants named', () => {
    expect(eh.descriptor.identity.name).toBe('enrich_heritage');
    expect(eh.descriptor.identity.lock).toBe(62);
    expect(typeof eh.compute).toBe('function');
  });

  it('the producer pin (DEC-C: the chain-scoped slug, not Spec 61\'s own name) lives in inputs.reads.steps[0], not a JS constant', () => {
    expect(eh.descriptor.inputs.reads.steps[0].step).toBe('load_heritage');
    expect(eh.descriptor.inputs.reads.steps[0].version_pin).toBe('exact');
    expect(eh.compute.PRODUCER_NAME).toBe('sources:load_heritage');
  });
});
