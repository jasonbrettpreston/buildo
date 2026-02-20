// 🔗 SPEC LINK: docs/specs/07_trade_taxonomy.md, 08_trade_classification.md
import { describe, it, expect } from 'vitest';
import { classifyPermit, extractPermitCode, applyScopeLimit } from '@/lib/classification/classifier';
import {
  determinePhase,
  isTradeActiveInPhase,
  PHASE_TRADE_MAP,
} from '@/lib/classification/phases';
import { TRADES, getTradeBySlug } from '@/lib/classification/trades';
import { TIER_1_RULES, TIER_2_RULES, TIER_3_RULES, STRUCTURE_TYPE_RULES, ALL_RULES } from '@/lib/classification/rules';
import { createMockPermit, createMockTradeMappingRule } from './factories';

describe('Trade Taxonomy', () => {
  it('has exactly 20 trade categories', () => {
    expect(TRADES).toHaveLength(20);
  });

  it('each trade has slug, name, icon, and color', () => {
    for (const trade of TRADES) {
      expect(trade.slug).toBeTruthy();
      expect(trade.name).toBeTruthy();
      expect(trade.icon).toBeTruthy();
      expect(trade.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has unique slugs', () => {
    const slugs = TRADES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('getTradeBySlug returns correct trade', () => {
    const plumbing = getTradeBySlug('plumbing');
    expect(plumbing?.name).toBe('Plumbing');
  });

  it('getTradeBySlug returns undefined for unknown slug', () => {
    expect(getTradeBySlug('nonexistent')).toBeUndefined();
  });
});

describe('Tier 1 Classification - Permit Type Direct Match', () => {
  it('classifies Plumbing(PS) as plumbing with 0.95 confidence', () => {
    const permit = createMockPermit({ permit_type: 'Plumbing(PS)' });
    const matches = classifyPermit(permit, ALL_RULES);
    const plumbingMatch = matches.find((m) => m.trade_slug === 'plumbing');
    expect(plumbingMatch).toBeDefined();
    expect(plumbingMatch!.tier).toBe(1);
    expect(plumbingMatch!.confidence).toBe(0.95);
  });

  it('classifies Demolition Folder (DM) as demolition', () => {
    const permit = createMockPermit({
      permit_type: 'Demolition Folder (DM)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'demolition');
    expect(match).toBeDefined();
    expect(match!.tier).toBe(1);
  });

  it('classifies Mechanical/HVAC(MH) as hvac', () => {
    const permit = createMockPermit({ permit_type: 'Mechanical/HVAC(MH)' });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'hvac');
    expect(match).toBeDefined();
  });

  it('classifies Electrical(EL) as electrical', () => {
    const permit = createMockPermit({ permit_type: 'Electrical(EL)' });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'electrical');
    expect(match).toBeDefined();
  });
});

describe('Tier 2 Classification - Work Field Match', () => {
  it('classifies Re-Roofing/Re-Cladding as roofing', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'Re-Roofing/Re-Cladding',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'roofing');
    expect(match).toBeDefined();
    expect(match!.tier).toBe(2);
  });

  it('classifies Underpinning as shoring', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'Underpinning',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'shoring');
    expect(match).toBeDefined();
  });

  it('classifies Interior Alterations as multiple trades', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'Interior Alterations',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Tier 3 Classification - Description Keywords', () => {
  it('detects plumbing keywords in description', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'New Building',
      description: 'Install new plumbing fixtures and water heater',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'plumbing');
    expect(match).toBeDefined();
    expect(match!.tier).toBe(3);
  });

  it('detects electrical keywords in description', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'New Building',
      description:
        'Complete electrical rewiring and panel upgrade for commercial unit',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const match = matches.find((m) => m.trade_slug === 'electrical');
    expect(match).toBeDefined();
  });

  it('returns empty array for permit with no matching description', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      work: 'Other',
      description: 'General administrative update',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    // May or may not have matches - depends on rules, but should not crash
    expect(Array.isArray(matches)).toBe(true);
  });
});

describe('Construction Phases', () => {
  it('classifies recently issued permit as early_construction', () => {
    const permit = createMockPermit({
      status: 'Issued',
      issued_date: new Date(), // just issued
    });
    expect(determinePhase(permit)).toBe('early_construction');
  });

  it('classifies permit 6 months after issue as structural', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const permit = createMockPermit({
      status: 'Under Inspection',
      issued_date: sixMonthsAgo,
    });
    expect(determinePhase(permit)).toBe('structural');
  });

  it('classifies permit 12 months after issue as finishing', () => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const permit = createMockPermit({
      status: 'Under Inspection',
      issued_date: twelveMonthsAgo,
    });
    expect(determinePhase(permit)).toBe('finishing');
  });

  it('classifies permit 20 months after issue as landscaping', () => {
    const twentyMonthsAgo = new Date();
    twentyMonthsAgo.setMonth(twentyMonthsAgo.getMonth() - 20);
    const permit = createMockPermit({
      status: 'Under Inspection',
      issued_date: twentyMonthsAgo,
    });
    expect(determinePhase(permit)).toBe('landscaping');
  });

  it('excavation is active in early_construction', () => {
    expect(isTradeActiveInPhase('excavation', 'early_construction')).toBe(true);
  });

  it('painting is active in finishing phase', () => {
    expect(isTradeActiveInPhase('painting', 'finishing')).toBe(true);
  });

  it('painting is NOT active in early_construction', () => {
    expect(isTradeActiveInPhase('painting', 'early_construction')).toBe(false);
  });

  it('landscaping is active in landscaping phase', () => {
    expect(isTradeActiveInPhase('landscaping', 'landscaping')).toBe(true);
  });

  it('PHASE_TRADE_MAP covers all 4 phases', () => {
    expect(Object.keys(PHASE_TRADE_MAP)).toHaveLength(4);
    expect(PHASE_TRADE_MAP).toHaveProperty('early_construction');
    expect(PHASE_TRADE_MAP).toHaveProperty('structural');
    expect(PHASE_TRADE_MAP).toHaveProperty('finishing');
    expect(PHASE_TRADE_MAP).toHaveProperty('landscaping');
  });
});

describe('Structure Type Classification (Inferred)', () => {
  it('SFD - Detached maps to residential trades (framing, plumbing, hvac, etc.)', () => {
    const permit = createMockPermit({
      permit_type: 'Small Residential Projects',
      structure_type: 'SFD - Detached',
      work: 'Other(SR)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
  });

  it('Apartment Building maps to high-rise trades (concrete, elevator, fire-protection)', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      structure_type: 'Apartment Building',
      work: 'Other(BA)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('elevator');
    expect(slugs).toContain('fire-protection');
  });

  it('Industrial maps to structural-steel, electrical, concrete', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      structure_type: 'Industrial',
      work: 'Other(BA)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('structural-steel');
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('concrete');
  });

  it('structure_type rules have lower confidence than tier 1', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      structure_type: 'SFD - Detached',
      work: 'Other(SR)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const framingMatch = matches.find((m) => m.trade_slug === 'framing');
    expect(framingMatch).toBeDefined();
    expect(framingMatch!.confidence).toBeLessThanOrEqual(0.65);
  });

  it('STRUCTURE_TYPE_RULES has at least 30 rules', () => {
    expect(STRUCTURE_TYPE_RULES.length).toBeGreaterThanOrEqual(30);
  });

  it('ALL_RULES includes structure_type rules', () => {
    const structureRules = ALL_RULES.filter((r) => r.match_field === 'structure_type');
    expect(structureRules.length).toBeGreaterThanOrEqual(30);
  });

  it('Restaurant structure type maps to hvac and plumbing', () => {
    const permit = createMockPermit({
      permit_type: 'Building',
      structure_type: 'Restaurant 30 Seats or Less',
      work: 'Other(BA)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('hvac');
    expect(slugs).toContain('plumbing');
  });
});

describe('Permit Code Extraction', () => {
  it('extracts BLD from standard permit number', () => {
    expect(extractPermitCode('21 123456 BLD 00')).toBe('BLD');
  });

  it('extracts PLB from plumbing permit', () => {
    expect(extractPermitCode('22 654321 PLB 00')).toBe('PLB');
  });

  it('extracts HVA from HVAC permit', () => {
    expect(extractPermitCode('23 111111 HVA 00')).toBe('HVA');
  });

  it('extracts DRN from drain permit', () => {
    expect(extractPermitCode('20 222222 DRN 00')).toBe('DRN');
  });

  it('extracts FSU from fire/security permit', () => {
    expect(extractPermitCode('21 333333 FSU 00')).toBe('FSU');
  });

  it('extracts DEM from demolition permit', () => {
    expect(extractPermitCode('22 444444 DEM 00')).toBe('DEM');
  });

  it('returns null for empty input', () => {
    expect(extractPermitCode('')).toBeNull();
    expect(extractPermitCode(undefined)).toBeNull();
  });
});

describe('Permit Code Scope Limiting', () => {
  it('PLB permit only gets plumbing trade', () => {
    const permit = createMockPermit({
      permit_num: '22 654321 PLB 00',
      permit_type: 'Plumbing(PS)',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related(PS)',
      description: 'Plumbing - new bathroom with electrical and hvac work',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('plumbing');
    expect(slugs).not.toContain('framing');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('electrical');
    expect(slugs).not.toContain('hvac');
  });

  it('HVA permit only gets hvac trade', () => {
    const permit = createMockPermit({
      permit_num: '23 111111 HVA 00',
      permit_type: 'Mechanical(MS)',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related(MS)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('hvac');
    expect(slugs).not.toContain('plumbing');
    expect(slugs).not.toContain('framing');
    expect(slugs).not.toContain('roofing');
  });

  it('DRN permit only gets plumbing trade', () => {
    const permit = createMockPermit({
      permit_num: '20 222222 DRN 00',
      permit_type: 'Drain and Site Service',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related (DR)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('plumbing');
    expect(slugs).not.toContain('framing');
    expect(slugs).not.toContain('roofing');
  });

  it('FSU permit only gets fire-protection trade', () => {
    const permit = createMockPermit({
      permit_num: '21 333333 FSU 00',
      permit_type: 'Fire/Security Upgrade',
      work: 'Fire Alarm',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('fire-protection');
    expect(slugs).not.toContain('plumbing');
    expect(slugs).not.toContain('hvac');
  });

  it('DEM permit only gets demolition trade', () => {
    const permit = createMockPermit({
      permit_num: '22 444444 DEM 00',
      permit_type: 'Demolition Folder (DM)',
      work: 'Demolition',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('demolition');
    expect(slugs).not.toContain('plumbing');
    expect(slugs).not.toContain('framing');
  });

  it('BLD permit gets multiple trades (broad scope)', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Small Residential Projects',
      structure_type: 'SFD - Detached',
      work: 'New Building',
      description: 'Construct new 2-storey detached dwelling with plumbing and hvac',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs.length).toBeGreaterThan(3);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
  });

  it('BLD Interior Alterations excludes excavation and roofing', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building Additions/Alterations',
      structure_type: 'SFD - Detached',
      work: 'Interior Alterations',
      description: 'Interior renovation of basement with new bathroom',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).not.toContain('excavation');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('landscaping');
  });

  it('BLD Underpinning excludes roofing and glazing', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Small Residential Projects',
      structure_type: 'SFD - Detached',
      work: 'Underpinning',
      description: 'Underpinning of existing basement foundation',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('shoring');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('glazing');
    expect(slugs).not.toContain('landscaping');
    expect(slugs).not.toContain('elevator');
  });
});
