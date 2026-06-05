/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (§8d, §11.1)
 * Pure-helper unit tests for scripts/enrich-heritage.js.
 */
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js');

describe('enrich-heritage — verdict cascade (row-derived, Spec 48 §3.6)', () => {
  it('FAIL > WARN > PASS; INFO is cascade-neutral', () => {
    expect(eh.verdictCascade([{ status: 'INFO' }, { status: 'INFO' }])).toBe('PASS');
    expect(eh.verdictCascade([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(eh.verdictCascade([{ status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
  });
});

describe('enrich-heritage — module contract', () => {
  it('exports the chain-scoped producer + pipeline names (DEC-C)', () => {
    expect(eh.PRODUCER_NAME).toBe('sources:load_heritage');
    expect(eh.PIPELINE_NAME).toBe('sources:enrich_heritage');
    expect(eh.ADVISORY_LOCK_ID).toBe(62);
  });
});
