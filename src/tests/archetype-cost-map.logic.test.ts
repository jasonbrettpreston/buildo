// 🔗 SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (the mapper rules)
//
// Per-RULE unit tests for the scope→archetype-line mapper (plan-review fold: explicit business
// rules, not just top-50 combos): prefix-strip, FB-gate, dominance, additive pairs, reno-build
// escalation, CoA rules, dispositions, and the null=T4 selector.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require('../features/leads/lib/archetype-cost-map.js');

const permit = (over: Record<string, unknown> = {}) => ({
  projectType: 'renovation', scopeTags: [], structureType: 'SFD - Detached',
  isCoa: false, activeTradeCount: 3, ...over,
});
const coa = (over: Record<string, unknown> = {}) => ({
  projectType: 'Addition', scopeTags: [], structureType: 'SFD - Detached',
  isCoa: true, activeTradeCount: 0, ...over,
});

describe('normalizeTag — ANY word: prefix strips (alter: is the biggest live tag)', () => {
  it('strips new:/alter:/etc.', () => {
    expect(m.normalizeTag('alter:interior-alterations')).toBe('interior-alterations');
    expect(m.normalizeTag('new:basement')).toBe('basement');
    expect(m.normalizeTag('new:underpinning')).toBe('underpinning');
    expect(m.normalizeTag('basement')).toBe('basement');
  });
});

describe('the FB-gate — building tags on non-new_build permits are NOT a build (the ~7K trap)', () => {
  it('mechanical permit with build-sfd tag → null (T4)', () => {
    expect(m.mapToLines(permit({ projectType: 'mechanical', scopeTags: ['build-sfd', 'hvac'] }))).toBeNull();
  });
  it('new_build permit with build-sfd → max_build clean', () => {
    expect(m.mapToLines(permit({ projectType: 'new_build', scopeTags: ['new:build-sfd'] })))
      .toEqual({ lines: ['max_build'], mapKind: 'clean' });
  });
});

describe('dominance + additive pairs', () => {
  it('new_build + garage co-scope → max_build dominates (the build prices the whole project)', () => {
    const r = m.mapToLines(permit({ projectType: 'new_build', scopeTags: ['build-sfd', 'garage'] }));
    expect(r).toEqual({ lines: ['max_build'], mapKind: 'dominant' });
  });
  it('underpinning + basement → the ADDITIVE pair (both line totals summed)', () => {
    const r = m.mapToLines(permit({ scopeTags: ['new:underpinning', 'new:basement'] }));
    expect(r!.lines.sort()).toEqual(['basement', 'underpin']);
    expect(r!.mapKind).toBe('additive');
  });
  it('kitchen + bathroom → additive', () => {
    const r = m.mapToLines(permit({ scopeTags: ['kitchen', 'bathroom'] }));
    expect(r!.lines.sort()).toEqual(['bath', 'kitchen']);
    expect(r!.mapKind).toBe('additive');
  });
  it('gut + addition → additive (the Finding-7 co-scope, priced as both)', () => {
    const r = m.mapToLines(permit({ projectType: 'addition', scopeTags: ['addition', 'alter:interior-alterations'] }));
    expect(r!.lines.sort()).toEqual(['addition', 'gut']);
    expect(r!.mapKind).toBe('additive');
  });
  it('basement alone → single clean line (your "just basement reno" case)', () => {
    expect(m.mapToLines(permit({ scopeTags: ['new:finished-basement'] })))
      .toEqual({ lines: ['basement'], mapKind: 'clean' });
  });
});

describe('reno-build escalation (Findings W7: ≥9 trades = new-build scope)', () => {
  it('gut+addition with 10 trades → escalated to max_build, RENO-origin cap class', () => {
    // No FB tag / new_build → reno-origin: escalates for the max_build AREA basis but is
    // bounded by the reno cap downstream (WF3 F1 — kills the deck/interior-gut $15M explosions).
    const r = m.mapToLines(permit({ projectType: 'addition', scopeTags: ['addition', 'interior-alterations'], activeTradeCount: 10 }));
    expect(r).toEqual({ lines: ['max_build'], mapKind: 'escalated', capClass: 'reno' });
  });
  it('tagless renovation→gut fallback with 23 trades → escalated, RENO-origin (the deck case)', () => {
    const r = m.mapToLines(permit({ projectType: 'renovation', scopeTags: [], activeTradeCount: 23 }));
    expect(r).toEqual({ lines: ['max_build'], mapKind: 'escalated', capClass: 'reno' });
  });
  it('genuine new_build (FB tag) with 10 trades → escalated, BUILD-origin cap class', () => {
    // A real build signal (project_type new_build puts max_build in candidates) keeps the build cap.
    const r = m.mapToLines(permit({ projectType: 'new_build', scopeTags: ['build-sfd'], activeTradeCount: 10 }));
    expect(r).toEqual({ lines: ['max_build'], mapKind: 'escalated', capClass: 'build' });
  });
  it('8 trades does NOT escalate', () => {
    const r = m.mapToLines(permit({ projectType: 'addition', scopeTags: ['addition', 'interior-alterations'], activeTradeCount: 8 }));
    expect(r!.mapKind).toBe('additive');
  });
});

describe('CoA rules', () => {
  it('NewConstruction + garage tag → coa_build (never demoted to garage — the ~4K trap)', () => {
    expect(m.mapToLines(coa({ projectType: 'NewConstruction', scopeTags: ['garage', 'dwelling'] })))
      .toEqual({ lines: ['coa_build'], mapKind: 'clean' });
  });
  it('Mixed maps by its tags via dominance', () => {
    const r = m.mapToLines(coa({ projectType: 'Mixed', scopeTags: ['addition', 'garage'] }));
    expect(r!.lines).toEqual(['addition']);
  });
  it('tagless Mixed → coa_build fallback', () => {
    expect(m.mapToLines(coa({ projectType: 'Mixed', scopeTags: ['residential'] })))
      .toEqual({ lines: ['coa_build'], mapKind: 'fallback' });
  });
  it('Severance / Demolition → null (T4)', () => {
    expect(m.mapToLines(coa({ projectType: 'Severance', scopeTags: ['severance'] }))).toBeNull();
    expect(m.mapToLines(coa({ projectType: 'Demolition' }))).toBeNull();
  });
});

describe('pinned dispositions', () => {
  it('second-suite → gut (a conversion, DECIDED)', () => {
    expect(m.mapToLines(permit({ projectType: 'other', scopeTags: ['second-suite'] }))!.lines).toEqual(['gut']);
  });
  it('foundation → underpin; structural-beam → gut; walkout → basement', () => {
    expect(m.mapToLines(permit({ scopeTags: ['foundation'] }))!.lines).toEqual(['underpin']);
    expect(m.mapToLines(permit({ projectType: 'other', scopeTags: ['structural-beam'] }))!.lines).toEqual(['gut']);
    expect(m.mapToLines(permit({ projectType: 'other', scopeTags: ['walkout'] }))!.lines).toEqual(['basement']);
  });
  it('balcony/canopy/deck/porch are descriptors → null (T4)', () => {
    expect(m.mapToLines(permit({ projectType: 'other', scopeTags: ['balcony', 'canopy', 'deck', 'porch'] }))).toBeNull();
  });
  it('MEC-only → null (T4 — the matrix safe-skip intent survives)', () => {
    expect(m.mapToLines(permit({ projectType: 'mechanical', scopeTags: ['hvac', 'plumbing', 'drain'] }))).toBeNull();
  });
  it('laneway structure_type override wins over other tags', () => {
    expect(m.mapToLines(permit({ projectType: 'other', scopeTags: ['garage'], structureType: 'Laneway / Rear Yard Suite' }))!.lines)
      .toEqual(['laneway_suite']);
  });
  it('renovation with no mapped tags → gut fallback', () => {
    expect(m.mapToLines(permit({ projectType: 'renovation', scopeTags: ['residential'] })))
      .toEqual({ lines: ['gut'], mapKind: 'fallback' });
  });
});

describe('isLowRiseResidential — parity with scripts/lib/build-norms.js (mirrored implementation)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bn = require('../../scripts/lib/build-norms.js');
  const fixtures = ['SFD - Detached', 'SFD - Townhouse', 'Stacked Townhouses', '2 Unit - Detached',
    'Converted House', 'Laneway / Rear Yard Suite', 'Apartment Building', 'Office', 'Retail Store',
    'Mixed Use/Res w Non Res', 'Industrial', null, undefined, ''];
  it('agrees with the pipeline predicate on every fixture (incl. NULL-retained)', () => {
    for (const f of fixtures) {
      expect(m.isLowRiseResidential(f), String(f)).toBe(bn.isLowRiseResidential(f));
    }
  });
  it('the two regex sources are character-identical', () => {
    expect(String(m.LOW_RISE_RESIDENTIAL_RE)).toBe(String(bn.LOW_RISE_RESIDENTIAL_RE));
  });
});

describe('LINE_DEFS integrity (the Brain contract)', () => {
  it('every line has scalarCol/kind/areaCol/rateKey/class', () => {
    for (const [id, def] of Object.entries<Record<string, unknown>>(m.LINE_DEFS)) {
      expect(def.scalarCol, id).toBeTruthy();
      expect(['total', 'per_sqm']).toContain(def.kind);
      expect(def.areaCol, id).toBeTruthy();
      expect(def.rateKey, id).toBeTruthy();
      expect(['build', 'reno']).toContain(def.class);
    }
  });
  it('every DOMINANCE entry and TAG_LINE target is a defined line', () => {
    for (const l of m.DOMINANCE) expect(m.LINE_DEFS[l], l).toBeTruthy();
    for (const l of Object.values<string>(m.TAG_LINE)) expect(m.LINE_DEFS[l], l).toBeTruthy();
  });
});
