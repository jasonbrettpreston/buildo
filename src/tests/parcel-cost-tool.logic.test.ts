// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 + §6
//
// Pure-logic tests for the Parcel Cost Model Tool:
//  1. TS↔JS address-normalizer PARITY on shared fixtures — the API resolves addresses with
//     @/lib/parcels/address while the pipeline linked them with scripts/lib/address-normalizers.js;
//     divergence silently breaks lookups. Closes review_followups.md row 317 (the previously
//     unguarded dual path), incl. the two DELIBERATE fence behaviors (first-street-type-token-wins,
//     trailing-directional-strip) which must be preserved, not "fixed".
//  2. parseFreeTextAddress — the free-text splitter feeding resolution.
//  3. The Spec 89 §4 mapping is internally consistent (no duplicate column across tiers).
//  4. renderScalar — every GenericFieldRenderer scalar branch.

import { describe, it, expect } from 'vitest';
import { parseLinearName, normalizeAddressNumber } from '@/lib/parcels/address';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const js = require('../../scripts/lib/address-normalizers.js');
import { parseFreeTextAddress, allMappedColumns, EXCLUDED_COLS } from '@/lib/admin/parcel-lookup';
import { renderScalar } from '@/components/admin/GenericFieldRenderer';

describe('TS↔JS address-normalizer parity (review_followups row 317)', () => {
  const linearFixtures = [
    'Hurlingham Cres',
    'Queen Street West',
    'JANE ST',
    'Avenue Road',            // fence: first-street-type-token-wins ("AVENUE" is the type token)
    'West Street',            // fence: type + trailing-directional both strip
    'St Clair Avenue West',
    "O'Connor Dr",
    'The Kingsway',
    'Bloor St W',
    'Lake Shore Blvd East',
    '',
    '   ',
  ];
  const numberFixtures = ['26', '007', '12A', ' 45 ', '', null, undefined, '0'];

  it('parseLinearName agrees on every fixture (incl. the two fence behaviors)', () => {
    for (const f of linearFixtures) {
      expect(parseLinearName(f), `parseLinearName(${JSON.stringify(f)})`).toEqual(js.parseLinearName(f));
    }
  });

  it('normalizeAddressNumber agrees on every fixture', () => {
    for (const f of numberFixtures) {
      expect(normalizeAddressNumber(f), `normalizeAddressNumber(${JSON.stringify(f)})`).toBe(
        js.normalizeAddressNumber(f),
      );
    }
  });
});

describe('parseFreeTextAddress', () => {
  it('splits number + street via the shared rules', () => {
    expect(parseFreeTextAddress('26 Hurlingham Cres')).toEqual({ num: '26', streetName: 'HURLINGHAM' });
    expect(parseFreeTextAddress('007 Queen Street West')).toEqual({ num: '7', streetName: 'QUEEN' });
    expect(parseFreeTextAddress('12A Bloor St W')).toEqual({ num: '12A', streetName: 'BLOOR' });
  });
  it('no leading number → typeahead-only shape (empty num)', () => {
    expect(parseFreeTextAddress('Hurlingham Cres')).toEqual({ num: '', streetName: 'HURLINGHAM' });
  });
  it('garbage stays safe (parameterized downstream)', () => {
    const r = parseFreeTextAddress(`26 Hurlingham'; DROP TABLE parcels; --`);
    expect(r.num).toBe('26');
    expect(typeof r.streetName).toBe('string');
  });

  // WF3 FIX (2026-07-20): a trailing ", <city>[, <province>]" suffix — the
  // shape a real operator gets from copy-pasting a full postal address —
  // previously folded into the street name via parseLinearName ("DERWYN ,
  // TORONTO"), matching ZERO rows against parcels/address_points (both are
  // comma-free street-name feeds). Live-reproduced: "41 Derwyn Road,
  // Toronto" resolved to `match: null` pre-fix; "41 Derwyn Road" alone
  // resolved correctly. Truncating at the first comma fixes it without
  // touching the shared `@/lib/parcels/address` normalizer (Spec 89 Known
  // Failure Modes: "third normalizer copy" is the guarded failure mode —
  // this fix stays local to the free-text splitter, one step BEFORE
  // parseLinearName runs).
  it('strips a trailing ", <city>" suffix before parsing (Parcel Cost Model Tool symptom)', () => {
    expect(parseFreeTextAddress('41 Derwyn Road, Toronto')).toEqual({ num: '41', streetName: 'DERWYN' });
  });
  it('strips a trailing ", <city>, <province>" suffix', () => {
    expect(parseFreeTextAddress('41 Derwyn Road, Toronto, ON')).toEqual({ num: '41', streetName: 'DERWYN' });
  });
  it('no comma present → unchanged (regression guard against over-truncating)', () => {
    expect(parseFreeTextAddress('26 Hurlingham Cres')).toEqual({ num: '26', streetName: 'HURLINGHAM' });
  });
});

describe('Spec 89 §4 mapping consistency', () => {
  it('no column appears in two tiers/groups', () => {
    const all = allMappedColumns();
    expect(new Set(all).size).toBe(all.length);
  });
  it('geometry blobs are excluded, never mapped', () => {
    const all = new Set(allMappedColumns());
    for (const c of EXCLUDED_COLS) expect(all.has(c)).toBe(false);
  });
});

describe('renderScalar (GenericFieldRenderer branches)', () => {
  it('null/undefined/empty → em-dash', () => {
    expect(renderScalar(null)).toBe('—');
    expect(renderScalar(undefined)).toBe('—');
    expect(renderScalar('')).toBe('—');
  });
  it('booleans', () => {
    expect(renderScalar(true)).toBe('✓ yes');
    expect(renderScalar(false)).toBe('✗ no');
  });
  it('numbers localized; numeric strings (pg numerics) treated as numbers', () => {
    expect(renderScalar(1234567)).toBe((1234567).toLocaleString());
    expect(renderScalar(0.123456)).toBe((0.123456).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    expect(renderScalar('42.5')).toBe((42.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });
  it('ISO date-ish strings truncate to the date', () => {
    expect(renderScalar('2026-07-06T00:00:00.000Z')).toBe('2026-07-06');
    expect(renderScalar('2026-07-06')).toBe('2026-07-06');
  });
  it('plain strings pass through untouched (React escapes at render)', () => {
    expect(renderScalar('heritage_existing')).toBe('heritage_existing');
    expect(renderScalar('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // plain text, never HTML
  });
});
