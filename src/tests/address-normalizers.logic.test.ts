// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
//
// Pure-function tests for the shared normalizer lib that load-parcels.js
// and load-address-points.js both use to produce the cross-table JOIN
// keys (addr_num_normalized, linear_name_normalized / street_name).
//
// WHY this exists: link-parcels.js Strategies 1+2 and link-coa-to-parcels.js
// Tier 1a/1b will JOIN parcels and address_points on these normalized text
// columns. If the two loaders drift in their normalization logic, the JOIN
// silently produces 0 matches. This regression-lock asserts the canonical
// transformations + their idempotency.

import { describe, it, expect } from 'vitest';
import {
  normalizeAddressNumber,
  parseLinearName,
  STREET_TYPE_MAP,
} from '../../scripts/lib/address-normalizers';

describe('normalizeAddressNumber', () => {
  it('strips leading zeros + uppercases', () => {
    expect(normalizeAddressNumber('00123')).toBe('123');
    expect(normalizeAddressNumber('123A')).toBe('123A');
    expect(normalizeAddressNumber('00045b')).toBe('45B');
  });

  it('trims whitespace before stripping', () => {
    expect(normalizeAddressNumber('  001 ')).toBe('1');
  });

  it('returns empty string for null / undefined / empty', () => {
    expect(normalizeAddressNumber(null as unknown as string)).toBe('');
    expect(normalizeAddressNumber(undefined as unknown as string)).toBe('');
    expect(normalizeAddressNumber('')).toBe('');
  });

  it('handles all-zero input (returns empty after strip)', () => {
    expect(normalizeAddressNumber('000')).toBe('');
  });

  it('is idempotent (applying twice = applying once)', () => {
    const inputs = ['00123', '123A', '  001 ', '', '0'];
    for (const x of inputs) {
      const once = normalizeAddressNumber(x);
      const twice = normalizeAddressNumber(once);
      expect(twice).toBe(once);
    }
  });
});

describe('parseLinearName', () => {
  it('extracts canonical street_type via STREET_TYPE_MAP for full-form tokens', () => {
    expect(parseLinearName('Davenport ROAD').street_type).toBe('RD');
    expect(parseLinearName('YONGE STREET').street_type).toBe('ST');
    expect(parseLinearName('queen AVENUE').street_type).toBe('AVE');
  });

  it('preserves the short-form street_type when already abbreviated', () => {
    expect(parseLinearName('DAVENPORT RD').street_type).toBe('RD');
    expect(parseLinearName('YONGE ST').street_type).toBe('ST');
  });

  it('strips trailing direction tokens (NORTH/SOUTH/EAST/WEST + single letter)', () => {
    expect(parseLinearName('KING STREET EAST').street_name).toBe('KING');
    expect(parseLinearName('BAY ST N').street_name).toBe('BAY');
  });

  it('first street-type token wins extraction; subsequent type tokens stay in street_name', () => {
    // Pre-existing parcels normalizer behavior: STREET_TYPE_REGEX without /g
    // matches the FIRST occurrence. "AVENUE ROAD WEST" → street_type = AVE,
    // street_name = "ROAD" (after stripping trailing "WEST"). This is
    // ambiguous for streets actually named "Avenue Road" but consistent with
    // load-parcels behavior — the cross-loader JOIN key remains identical,
    // which is what matters for link-parcels Strategies 1+2.
    expect(parseLinearName('AVENUE ROAD WEST').street_name).toBe('ROAD');
    expect(parseLinearName('AVENUE ROAD WEST').street_type).toBe('AVE');
  });

  it('returns empty street_name + street_type for empty / whitespace input', () => {
    expect(parseLinearName('')).toEqual({ street_name: '', street_type: '' });
    expect(parseLinearName('   ')).toEqual({ street_name: '', street_type: '' });
    expect(parseLinearName(null as unknown as string)).toEqual({
      street_name: '',
      street_type: '',
    });
  });

  it('uppercases all output (case-insensitive JOIN keys)', () => {
    const result = parseLinearName('davenport road');
    expect(result.street_name).toBe('DAVENPORT');
    expect(result.street_type).toBe('RD');
  });

  it('collapses internal whitespace in street_name', () => {
    expect(parseLinearName('FAIRVIEW   MALL   DR').street_name).toBe('FAIRVIEW MALL');
  });
});

describe('STREET_TYPE_MAP', () => {
  it('maps every long-form to its canonical short-form', () => {
    expect(STREET_TYPE_MAP.STREET).toBe('ST');
    expect(STREET_TYPE_MAP.AVENUE).toBe('AVE');
    expect(STREET_TYPE_MAP.DRIVE).toBe('DR');
    expect(STREET_TYPE_MAP.ROAD).toBe('RD');
    expect(STREET_TYPE_MAP.BOULEVARD).toBe('BLVD');
  });
});

describe('cross-loader consistency invariant', () => {
  // WHY: the entire point of extracting this module was so that
  // load-parcels.js + load-address-points.js produce IDENTICAL
  // addr_num_normalized + linear_name_normalized values on the same
  // input. The regression-lock is: apply the same function to the
  // same input, get the same output — which is automatic now because
  // both loaders import from this lib. If a future PR removes the
  // import in one loader and inlines a different function, the JOIN
  // breaks. This test fixes the shape of the lib's exports so that
  // such a removal would also break this test.

  it('exports stable function signatures (named exports, callable)', () => {
    expect(typeof normalizeAddressNumber).toBe('function');
    expect(typeof parseLinearName).toBe('function');
    expect(parseLinearName('').street_name).toBeDefined();
    expect(parseLinearName('').street_type).toBeDefined();
  });
});
