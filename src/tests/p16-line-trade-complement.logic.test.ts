// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (P16 lean inference complement)
//
// P16 D3/D6/D7e — the LINE_TRADE_COMPLEMENT lean inference map + the union-vs-dominance invariant.
// The trade attachment is the UNION of detected lines' complements; cost aggregation (mapToLines)
// stays DOMINANCE. These are DIFFERENT axes — a regression here (trades following cost's dominance)
// would silently drop a co-scope line's trades when a pricier line dominates.

import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archetypeCostMap = require('../features/leads/lib/archetype-cost-map');
const { LINE_TRADE_COMPLEMENT, COMPLEMENT_EXCLUDED_SLUGS, complementTradesFor, mapToLines, LINE_DEFS } = archetypeCostMap;

describe('P16 LINE_TRADE_COMPLEMENT — shape + leanness (D3/D6)', () => {
  it('has exactly one entry per LINE_DEFS cost line (no new archetype codes — D6)', () => {
    expect(Object.keys(LINE_TRADE_COMPLEMENT).sort()).toEqual(Object.keys(LINE_DEFS).sort());
  });

  it('every complement is LEANER than the corpus-inflating full build (mean ≤ 20 trades)', () => {
    for (const [line, trades] of Object.entries(LINE_TRADE_COMPLEMENT) as [string, string[]][]) {
      expect(trades.length, `${line} complement too broad`).toBeLessThanOrEqual(20);
      // no dupes within a line
      expect(new Set(trades).size, `${line} has duplicate trades`).toBe(trades.length);
    }
  });

  it('excludes the deprecated temporary-fencing from every complement (D8d)', () => {
    expect(COMPLEMENT_EXCLUDED_SLUGS.has('temporary-fencing')).toBe(true);
    for (const trades of Object.values(LINE_TRADE_COMPLEMENT) as string[][]) {
      expect(trades).not.toContain('temporary-fencing');
    }
  });

  it('re-attaches the scope-implied STARVED trades (D7 un-starve)', () => {
    // tiling/millwork-cabinetry/stone-countertops in the finish-heavy lines; overhead-doors in GAR; solar in solar.
    expect(LINE_TRADE_COMPLEMENT.kitchen).toEqual(expect.arrayContaining(['tiling', 'millwork-cabinetry', 'stone-countertops']));
    expect(LINE_TRADE_COMPLEMENT.bath).toEqual(expect.arrayContaining(['tiling', 'stone-countertops']));
    expect(LINE_TRADE_COMPLEMENT.garage).toContain('overhead-doors');
    expect(LINE_TRADE_COMPLEMENT.solar).toContain('solar');
  });

  it('excludes the FP-heavy SERVICE inspectable trades (calibration — hvac/plumbing/drain/demolition)', () => {
    // These were 0-6% precision as inference adds; the evidence layer owns them.
    for (const line of ['max_build', 'coa_build', 'addition', 'gut', 'laneway_suite', 'basement', 'kitchen', 'bath']) {
      expect(LINE_TRADE_COMPLEMENT[line], `${line} must not re-add hvac`).not.toContain('hvac');
    }
    expect(LINE_TRADE_COMPLEMENT.gut).not.toContain('demolition');
    expect(LINE_TRADE_COMPLEMENT.kitchen).not.toContain('plumbing');
  });
});

describe('P16 union-vs-dominance invariant (D7e)', () => {
  it('complementTradesFor UNIONs its input lines — a non-dominant line contributes its trades', () => {
    // Garden suite would dominate PRICE, but the co-scope garage line's trades must STILL attach.
    const dominantOnly = new Set<string>(complementTradesFor(['garden_suite']));
    const union = new Set<string>(complementTradesFor(['garden_suite', 'garage']));
    // The union must be a strict superset carrying garage's distinctive trade (overhead-doors),
    // which garden_suite's complement does NOT contain — proving trades do NOT follow cost dominance.
    expect(dominantOnly.has('overhead-doors')).toBe(false);
    expect(union.has('overhead-doors')).toBe(true);
    // …and it still carries garden_suite's own trades (union, not replacement).
    for (const t of LINE_TRADE_COMPLEMENT.garden_suite) expect(union.has(t)).toBe(true);
  });

  it('mapToLines cost aggregation stays DOMINANCE (single winner for non-additive co-scope)', () => {
    // A lead scoped to garden_suite (laneway structure) + a garage tag → cost picks ONE dominant line.
    const mapped = mapToLines({
      projectType: 'renovation',
      scopeTags: ['laneway-suite', 'garage'],
      structureType: 'Laneway / Rear Yard Suite',
      isCoa: false,
      activeTradeCount: 3,
    });
    expect(mapped).not.toBeNull();
    expect(mapped.lines.length).toBe(1); // dominance → one line for pricing
    expect(mapped.lines[0]).toBe('laneway_suite');
  });

  it('complementTradesFor dedupes across overlapping lines', () => {
    const both = complementTradesFor(['kitchen', 'bath']); // both carry tiling/stone-countertops
    expect(new Set(both).size).toBe(both.length);
  });
});
