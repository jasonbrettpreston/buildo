// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (zoning_designation; parser + CoA->parcel zone-class check)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (C2, C4)

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require('../../scripts/lib/coa-zoning-designation.js');

const CASES: Array<[string | null, Record<string, unknown>]> = [
    [null, { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'null' }],
    ['   ', { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'null' }],
    ['RD (ZR)', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'class_only' }],
    ['RD & R2 (ZR)', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'class_only' }],
    ['RM & R2 (ZR)', { class: 'RM', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'class_only' }],
    [
      'Residential Detached (RD) & Single Family (S) Zone [ZR]',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'long_name' },
    ],
    ['RD  [ZZC]', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZZC'], status: 'class_only' }],
    ['R (d0.6) (ZAP)', { class: 'R', f: null, a: null, u: null, d: 0.6, x: null, tags: ['ZAP'], status: 'full_569' }],
    [
      'Residential Detached (RD) Zone [ZR]',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'long_name' },
    ],
    [
      'RD - Residential Detached/S - Single Family Residential [ZZC]',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZZC'], status: 'class_only' },
    ],
    [
      'R (d0.6) & R2 Z0.6 (ZZC)',
      { class: 'R', f: null, a: null, u: null, d: 0.6, x: null, tags: ['ZZC'], status: 'full_569' },
    ],
    [
      'RD (Waiver)',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['WAIVER'], status: 'class_only' },
    ],
    ['RD / R4 (ZZC)', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZZC'], status: 'class_only' }],
    [
      'RD (f15.0; a550) (x5) [ZAP]',
      { class: 'RD', f: 15, a: 550, u: null, d: null, x: 5, tags: ['ZAP'], status: 'full_569' },
    ],
    [
      'RD (f15.0; a550) (x5)[ZAP]',
      { class: 'RD', f: 15, a: 550, u: null, d: null, x: 5, tags: ['ZAP'], status: 'full_569' },
    ],
    [
      'Single Family (S) & Residential Detached (RD) Zone [ZR]',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'long_name' },
    ],
    [
      'RD (f13.5; a510; d0.45) [ZR]',
      { class: 'RD', f: 13.5, a: 510, u: null, d: 0.45, x: null, tags: ['ZR'], status: 'full_569' },
    ],
    [
      'R (d0.6) (x736) (ZAP)',
      { class: 'R', f: null, a: null, u: null, d: 0.6, x: 736, tags: ['ZAP'], status: 'full_569' },
    ],
    [
      'RM (f12.0; u4; d0.8) (x252) (ZAP)',
      { class: 'RM', f: 12, a: null, u: 4, d: 0.8, x: 252, tags: ['ZAP'], status: 'full_569' },
    ],
    ['R(d0.6) & R2 Z0.6 (ZZC)', { class: 'R', f: null, a: null, u: null, d: 0.6, x: null, tags: ['ZZC'], status: 'full_569' }],
    ['R4 / RD  [ZZC]', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZZC'], status: 'class_only' }],
    ['R (d0.6) (BLD)', { class: 'R', f: null, a: null, u: null, d: 0.6, x: null, tags: ['BLD'], status: 'full_569' }],
    ['R (d0,6) (x7) (waiver)', { class: 'R', f: null, a: null, u: null, d: 0.6, x: 7, tags: ['WAIVER'], status: 'full_569' }],
    [
      'R (d1.0)(x807) & R3 Z1,0 (Waiver)',
      { class: 'R', f: null, a: null, u: null, d: 1, x: 807, tags: ['WAIVER'], status: 'full_569' },
    ],
    [
      'RD (f15.0;d0.35)(x1328) & R1 Z0,35 (ZZC)',
      { class: 'RD', f: 15, a: null, u: null, d: 0.35, x: 1328, tags: ['ZZC'], status: 'full_569' },
    ],
    [
      'RD (f12 .0; a370)(x1463)',
      { class: 'RD', f: 12, a: 370, u: null, d: null, x: 1463, tags: [], status: 'full_569' },
    ],
    [
      'RM (f12.0; u2; d0.8) (x252) HT 11.0, ST 3 (ZAP)',
      { class: 'RM', f: 12, a: null, u: 2, d: 0.8, x: 252, tags: ['ZAP'], status: 'full_569' },
    ],
    [
      'Residential-Semi Detached (RS) Zone (f15.0; a464) (x98), HT9, ST2, 33%.[ZZC]',
      { class: 'RS', f: 15, a: 464, u: null, d: null, x: 98, tags: ['ZZC'], status: 'long_name' },
    ],
    ['R (d0.6) HT: 10.0 M (ZZC)', { class: 'R', f: null, a: null, u: null, d: 0.6, x: null, tags: ['ZZC'], status: 'full_569' }],
    [
      'Zoning By-law 438-86 (Waiver)',
      { class: null, f: null, a: null, u: null, d: null, x: null, tags: ['WAIVER'], status: 'former_bylaw' },
    ],
    [
      'Former City of Toronto By-Law No. 438-86',
      { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'former_bylaw' },
    ],
    [
      'Residential (R) Zone, By-law No. 569-2013',
      { class: 'R', f: null, a: null, u: null, d: null, x: null, tags: [], status: 'long_name' },
    ],
    [
      'Residential Detached (RD), By-law No. 569-2013 & Single Family Residential (S), Agincourt Community Zoning By-law No. 10076 [ZPR]',
      { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['ZPR'], status: 'long_name' },
    ],
    [
      'I3 D3 & Site Specific By-laws 1079-2010, 600-2005,684-2003,566-2000,565-2000',
      { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'former_bylaw' },
    ],
    ['CR (Waiver)', { class: 'CR', f: null, a: null, u: null, d: null, x: null, tags: ['WAIVER'], status: 'class_only' }],
    [
      'Commercial Residential (CR) Zone [ZR]',
      { class: 'CR', f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'long_name' },
    ],
    ['MCR (ZR)', { class: null, f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'unparsed' }],
    [
      'CR 2.0 (c2.0, r2.0) & CR T2.0 C2.0 R2.0 (Waiver)',
      { class: 'CR', f: null, a: null, u: null, d: null, x: null, tags: ['WAIVER'], status: 'full_569' },
    ],
    ['RS(x14)/RM2(17)', { class: 'RS', f: null, a: null, u: null, d: null, x: 14, tags: [], status: 'full_569' }],
    ['RD {WAV}', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['WAV'], status: 'class_only' }],
    ['RD [WAV]', { class: 'RD', f: null, a: null, u: null, d: null, x: null, tags: ['WAV'], status: 'class_only' }],
    ['RT (f6.0; a180) (x21)', { class: 'RT', f: 6, a: 180, u: null, d: null, x: 21, tags: [], status: 'full_569' }],
    [
      'RD (f12.0; a370; d0.4) (x1199) HT 11.0, ST 3 (ZAP)',
      { class: 'RD', f: 12, a: 370, u: null, d: 0.4, x: 1199, tags: ['ZAP'], status: 'full_569' },
    ],
    [
      'Single-Family Residential (S) Zone and Residential Semi-Detched (RS) Zone ((x24) 33% HT 9.0, ST 2) [ZZC]',
      { class: 'RS', f: null, a: null, u: null, d: null, x: 24, tags: ['ZZC'], status: 'long_name' },
    ],
    ['HOLD', { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'unparsed' }],
    [
      'CR3.5 (C1.0; R2.5) SS2 (x338) (ZAP)',
      { class: 'CR', f: null, a: null, u: null, d: null, x: 338, tags: ['ZAP'], status: 'full_569' },
    ],
    ['I.C1(ZR)', { class: null, f: null, a: null, u: null, d: null, x: null, tags: ['ZR'], status: 'former_bylaw' }],
    [
      'RM4(32) by-law 316-2018 / RM(5)',
      { class: 'RM', f: null, a: null, u: null, d: null, x: null, tags: [], status: 'class_only' },
    ],
];

describe('parseZoningDesignation - real CKAN strings (2026-10-07 snapshot)', () => {
  it.each(CASES)('%j', (raw, want) => expect(m.parseZoningDesignation(raw)).toEqual(want));

  it('returns exactly the 8 contract keys', () => {
    const keys = Object.keys(m.parseZoningDesignation('RD (f13.5; a510; d0.45) [ZR]'));
    expect(keys).toEqual(['class', 'f', 'a', 'u', 'd', 'x', 'tags', 'status']);
  });
});

describe('closed status set', () => {
  it('STATUSES is the frozen closed list', () => {
    expect([...m.STATUSES]).toEqual(['full_569', 'class_only', 'former_bylaw', 'long_name', 'unparsed', 'null']);
    expect(Object.isFrozen(m.STATUSES)).toBe(true);
  });

  it('every produced status is in STATUSES, and every status is covered', () => {
    const seen = new Set<string>();
    for (const [, want] of CASES) {
      const status = want.status as string;
      expect(m.STATUSES).toContain(status);
      seen.add(status);
    }
    for (const status of m.STATUSES as string[]) {
      expect([...seen]).toContain(status);
    }
  });

  it('never throws on non-string input', () => {
    expect(m.parseZoningDesignation(5).status).toBe('unparsed');
    expect(m.parseZoningDesignation(undefined).status).toBe('null');
  });
});

describe('classifyZoneLink - one row per answer', () => {
  const ROWS: Array<[string | null, string | null, string]> = [
    ['RD (f13.5; d0.6) (x1436) (ZAP)', 'RD (f13.5; d0.6) (x1436)', 'class_match'],
    ['RD (x620)', 'RD (f12.0; a370) (x620)', 'class_match'],
    ['RD (ZR)', 'RD (f13.5; a510; d0.45)', 'class_match'],
    ['Residential Detached (RD) Zone [ZR]', 'RD (f12.0; a370)', 'class_match'],
    ['RD (f12.0; d0.6) (x1424)(ZAP)', 'RM (f12.0; a370; u4; d0.6) (x123)', 'class_mismatch'],
    ['RM (f12.0; u2; d0.8) (x252)[ZZC]', 'RM (f12.0; u4; d0.8) (x252)', 'component_mismatch_dated'],
    ['R (d0,6) (x7) (waiver)', 'R (d0.6) (x739)', 'component_mismatch_dated'],
    [null, 'RD (f13.5; a510; d0.45)', 'not_comparable'],
    ['Zoning By-law 438-86 (Waiver)', 'R (d0.6)', 'not_comparable'],
    ['MCR (ZR)', 'CR 3.0 (c2.0; r2.0) SS2 (x1909)', 'not_comparable'],
    ['RD (ZR)', null, 'not_comparable'],
  ];

  it.each(ROWS)('%j vs %j -> %s', (designation, parcelZnString, answer) => {
    expect(m.classifyZoneLink(designation, parcelZnString)).toBe(answer);
  });

  it('LINK_ANSWERS is the frozen closed list, all covered by the rows', () => {
    expect([...m.LINK_ANSWERS]).toEqual(['class_match', 'class_mismatch', 'component_mismatch_dated', 'not_comparable']);
    expect(Object.isFrozen(m.LINK_ANSWERS)).toBe(true);
    const seen = new Set(ROWS.map(([, , answer]) => answer));
    for (const answer of m.LINK_ANSWERS as string[]) {
      expect([...seen]).toContain(answer);
    }
  });
});

describe('summarizeZoneLink', () => {
  it('computes counts, comparable and class_agree_share (WARN below minShare)', () => {
    expect(
      m.summarizeZoneLink(['class_match', 'class_match', 'component_mismatch_dated', 'class_mismatch', 'not_comparable'], 0.95, 1),
    ).toEqual({
      counts: { class_match: 2, class_mismatch: 1, component_mismatch_dated: 1, not_comparable: 1 },
      comparable: 4,
      class_agree_share: 0.75,
      status: 'WARN',
    });
  });

  it('PASS at or above minShare', () => {
    const answers = ['class_match', 'class_match', 'component_mismatch_dated', 'class_mismatch', 'not_comparable'];
    expect(m.summarizeZoneLink(answers, 0.7, 1).status).toBe('PASS');
  });

  it('nothing comparable is never a silent PASS', () => {
    expect(m.summarizeZoneLink([], 0.95, 1)).toEqual({
      counts: { class_match: 0, class_mismatch: 0, component_mismatch_dated: 0, not_comparable: 0 },
      comparable: 0,
      class_agree_share: null,
      status: 'WARN',
    });
  });

  it('too few comparable rows is a WARN, never a PASS (1 comparable of 1,001)', () => {
    const answers = [...Array(1000).fill('not_comparable'), 'class_match'];
    expect(m.summarizeZoneLink(answers, 0.9, 100).status).toBe('WARN');
    expect(m.summarizeZoneLink(answers, 0.9, 1).status).toBe('PASS');
  });

  it('rejects unknown answers and bad minShare', () => {
    expect(() => m.summarizeZoneLink(['class_match', 'bogus'], 0.95, 1)).toThrow(/unknown answer/);
    expect(() => m.summarizeZoneLink([], 1.5, 1)).toThrow(/minShare/);
    expect(() => m.summarizeZoneLink([], -0.1, 1)).toThrow(/minShare/);
    expect(() => m.summarizeZoneLink([], '0.9', 1)).toThrow(/minShare/);
  });

  it('rejects a bad minComparable and non-array answers', () => {
    expect(() => m.summarizeZoneLink([], 0.9, 0)).toThrow(/minComparable/);
    expect(() => m.summarizeZoneLink([], 0.9, 1.5)).toThrow(/minComparable/);
    expect(() => m.summarizeZoneLink([], 0.9, '1')).toThrow(/minComparable/);
    expect(() => m.summarizeZoneLink('class_match', 0.9, 1)).toThrow(/answers must be an array/);
  });
});
