// 🔗 SPEC LINK: docs/specs/07_trade_taxonomy.md, 08_trade_classification.md, 32_product_groups.md
import { describe, it, expect } from 'vitest';
import { classifyPermit, extractPermitCode, applyScopeLimit, classifyProducts, NARROW_SCOPE_CODES } from '@/lib/classification/classifier';
import {
  determinePhase,
  isTradeActiveInPhase,
  PHASE_TRADE_MAP,
} from '@/lib/classification/phases';
import { TRADES, getTradeBySlug } from '@/lib/classification/trades';
import { TIER_1_RULES, ALL_RULES } from '@/lib/classification/rules';
import { lookupTradesForTags, TAG_TRADE_MATRIX } from '@/lib/classification/tag-trade-matrix';
import { lookupProductsForTags } from '@/lib/classification/tag-product-matrix';
import { PRODUCT_GROUPS } from '@/lib/classification/products';
import { createMockPermit, createMockTradeMappingRule } from './factories';

// ---------------------------------------------------------------------------
// Trade Taxonomy (31 trades)
// ---------------------------------------------------------------------------

describe('Trade Taxonomy', () => {
  it('has exactly 31 trade categories', () => {
    expect(TRADES).toHaveLength(31);
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

  it('has unique IDs', () => {
    const ids = TRADES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains all 11 new trade slugs', () => {
    const slugs = TRADES.map((t) => t.slug);
    const newSlugs = [
      'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops',
      'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar',
      'security', 'temporary-fencing', 'caulking',
    ];
    for (const slug of newSlugs) {
      expect(slugs).toContain(slug);
    }
  });

  it('has 4 renamed display names (slugs unchanged)', () => {
    expect(getTradeBySlug('masonry')?.name).toBe('Masonry & Brickwork');
    expect(getTradeBySlug('drywall')?.name).toBe('Drywall & Taping');
    expect(getTradeBySlug('landscaping')?.name).toBe('Landscaping & Hardscaping');
    expect(getTradeBySlug('hvac')?.name).toBe('HVAC & Sheet Metal');
  });

  it('getTradeBySlug returns correct trade', () => {
    const plumbing = getTradeBySlug('plumbing');
    expect(plumbing?.name).toBe('Plumbing');
  });

  it('getTradeBySlug returns undefined for unknown slug', () => {
    expect(getTradeBySlug('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tag-Trade Matrix
// ---------------------------------------------------------------------------

describe('Tag-Trade Matrix', () => {
  it('kitchen tag maps to plumbing, tiling, millwork-cabinetry', () => {
    const results = lookupTradesForTags(['new:kitchen']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('tiling');
    expect(slugs).toContain('millwork-cabinetry');
  });

  it('pool tag maps to pool-installation', () => {
    const results = lookupTradesForTags(['new:pool']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('pool-installation');
    expect(slugs).toContain('excavation');
    expect(slugs).toContain('concrete');
  });

  it('solar tag maps to solar and electrical', () => {
    const results = lookupTradesForTags(['new:solar']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('solar');
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('roofing');
  });

  it('system tags map to direct 1:1', () => {
    const hvacResult = lookupTradesForTags(['sys:hvac']);
    expect(hvacResult.find((r) => r.tradeSlug === 'hvac')?.confidence).toBe(0.85);

    const plumbResult = lookupTradesForTags(['sys:plumbing']);
    expect(plumbResult.find((r) => r.tradeSlug === 'plumbing')?.confidence).toBe(0.85);

    const elecResult = lookupTradesForTags(['sys:electrical']);
    expect(elecResult.find((r) => r.tradeSlug === 'electrical')?.confidence).toBe(0.85);
  });

  it('high-rise tag maps to elevator, concrete, structural-steel', () => {
    const results = lookupTradesForTags(['scale:high-rise']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('elevator');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('structural-steel');
  });

  it('de-duplicates by slug keeping max confidence', () => {
    // Both kitchen and bathroom map to plumbing, kitchen=0.80, bathroom=0.85
    const results = lookupTradesForTags(['new:kitchen', 'new:bathroom']);
    const plumbMatches = results.filter((r) => r.tradeSlug === 'plumbing');
    expect(plumbMatches).toHaveLength(1);
    expect(plumbMatches[0].confidence).toBe(0.85);
  });

  it('returns empty for unknown tags', () => {
    const results = lookupTradesForTags(['unknown:tag']);
    expect(results).toHaveLength(0);
  });

  it('sfd tag produces many trades including new ones', () => {
    const results = lookupTradesForTags(['new:sfd']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs.length).toBeGreaterThan(15);
    expect(slugs).toContain('trim-work');
    expect(slugs).toContain('eavestrough-siding');
    expect(slugs).toContain('temporary-fencing');
  });

  it('strips houseplex-N-unit prefix correctly', () => {
    const results = lookupTradesForTags(['new:houseplex-4-unit']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
  });
});

// ---------------------------------------------------------------------------
// Integration: classifyPermit with tag matrix
// ---------------------------------------------------------------------------

describe('classifyPermit - Tag Matrix Integration', () => {
  it('SFD permit with scope_tags uses tag matrix', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Small Residential Projects',
      work: 'New Building',
    });
    const tags = ['new:sfd', 'new:kitchen', 'new:bathroom'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs.length).toBeGreaterThan(10);
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('framing');
    expect(slugs).toContain('tiling');
    expect(slugs).toContain('millwork-cabinetry');
  });

  it('PLB permit still uses narrow scope (Tier 1 only)', () => {
    const permit = createMockPermit({
      permit_num: '22 654321 PLB 00',
      permit_type: 'Plumbing(PS)',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related(PS)',
    });
    const tags = ['new:kitchen', 'new:bathroom'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('plumbing');
    expect(slugs).not.toContain('framing');
    expect(slugs).not.toContain('tiling');
  });

  it('empty tags with no narrow-scope falls back to minimal trades at 0.40', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Fallback trades should have 0.40 confidence
    for (const m of matches) {
      expect(m.confidence).toBe(0.40);
    }
  });

  it('permits with no scopeTags arg get fallback', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('Tier 1 matches merge with tag matrix (higher confidence wins)', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Plumbing(PS)',
      work: 'New Building',
    });
    const tags = ['new:kitchen'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const plumbMatch = matches.find((m) => m.trade_slug === 'plumbing');
    expect(plumbMatch).toBeDefined();
    // Tier 1 (0.95) should beat tag matrix (0.80)
    expect(plumbMatch!.confidence).toBe(0.95);
    expect(plumbMatch!.tier).toBe(1);
  });

  it('work scope exclusions still apply to tag matrix results', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Interior Alterations',
    });
    const tags = ['alter:kitchen', 'alter:bathroom'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).not.toContain('excavation');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('landscaping');
  });

  it('unknown scope tags fall back to minimal residential trades', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const tags = ['new:nonexistent_tag', 'alter:unknown_scope'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    for (const m of matches) {
      expect(m.confidence).toBe(0.40);
    }
  });
});

// ---------------------------------------------------------------------------
// Tier 1 Classification - Permit Type Direct Match
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Construction Phases (31 trades coverage)
// ---------------------------------------------------------------------------

describe('Construction Phases', () => {
  it('classifies recently issued permit as early_construction', () => {
    const permit = createMockPermit({
      status: 'Issued',
      issued_date: new Date(),
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

  it('new trades are in correct phases', () => {
    expect(isTradeActiveInPhase('temporary-fencing', 'early_construction')).toBe(true);
    expect(isTradeActiveInPhase('pool-installation', 'structural')).toBe(true);
    expect(isTradeActiveInPhase('trim-work', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('millwork-cabinetry', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('tiling', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('stone-countertops', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('caulking', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('security', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('solar', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('eavestrough-siding', 'finishing')).toBe(true);
    expect(isTradeActiveInPhase('decking-fences', 'landscaping')).toBe(true);
    expect(isTradeActiveInPhase('pool-installation', 'landscaping')).toBe(true);
  });

  it('all 31 trade slugs appear in at least one phase', () => {
    const allPhaseTradeSet = new Set<string>();
    for (const trades of Object.values(PHASE_TRADE_MAP)) {
      for (const t of trades) allPhaseTradeSet.add(t);
    }
    for (const trade of TRADES) {
      expect(allPhaseTradeSet.has(trade.slug)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Product Groups
// ---------------------------------------------------------------------------

describe('Product Groups', () => {
  it('has exactly 16 product groups', () => {
    expect(PRODUCT_GROUPS).toHaveLength(16);
  });

  it('each product has slug, name, sort_order', () => {
    for (const p of PRODUCT_GROUPS) {
      expect(p.slug).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.sort_order).toBeGreaterThan(0);
    }
  });

  it('has unique slugs', () => {
    const slugs = PRODUCT_GROUPS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('kitchen tag maps to cabinets, appliances, countertops', () => {
    const products = lookupProductsForTags(['new:kitchen']);
    expect(products).toContain('kitchen-cabinets');
    expect(products).toContain('appliances');
    expect(products).toContain('countertops');
    expect(products).toContain('plumbing-fixtures');
    expect(products).toContain('tiling');
  });

  it('classifyProducts returns correct shape', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
    });
    const products = classifyProducts(permit, ['new:kitchen']);
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p).toHaveProperty('permit_num');
      expect(p).toHaveProperty('revision_num');
      expect(p).toHaveProperty('product_id');
      expect(p).toHaveProperty('product_slug');
      expect(p).toHaveProperty('product_name');
      expect(p).toHaveProperty('confidence');
    }
  });

  it('classifyProducts returns empty for no tags', () => {
    const permit = createMockPermit();
    const products = classifyProducts(permit, []);
    expect(products).toHaveLength(0);
  });

  it('classifyProducts returns empty when no scopeTags arg given', () => {
    const permit = createMockPermit();
    const products = classifyProducts(permit);
    expect(products).toHaveLength(0);
  });

  it('classifyProducts de-duplicates products from multiple overlapping tags', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
    });
    // Both kitchen and sfd map to kitchen-cabinets
    const products = classifyProducts(permit, ['new:kitchen', 'new:sfd']);
    const cabinetMatches = products.filter((p) => p.product_slug === 'kitchen-cabinets');
    expect(cabinetMatches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Permit Code Extraction
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Permit Code Scope Limiting
// ---------------------------------------------------------------------------

describe('Permit Code Scope Limiting', () => {
  it('PLB permit only gets plumbing trade', () => {
    const permit = createMockPermit({
      permit_num: '22 654321 PLB 00',
      permit_type: 'Plumbing(PS)',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related(PS)',
      description: 'Plumbing - new bathroom with electrical and hvac work',
    });
    const matches = classifyPermit(permit, ALL_RULES, ['new:bathroom']);
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

  it('BLD permit gets multiple trades with tags (broad scope)', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Small Residential Projects',
      work: 'New Building',
    });
    const tags = ['new:sfd', 'new:kitchen', 'new:bathroom'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs.length).toBeGreaterThan(3);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
  });

  it('BLD Interior Alterations excludes excavation and roofing', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building Additions/Alterations',
      work: 'Interior Alterations',
    });
    const tags = ['alter:kitchen', 'alter:bathroom', 'alter:basement'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).not.toContain('excavation');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('landscaping');
  });

  it('BLD Underpinning excludes roofing and glazing', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Small Residential Projects',
      work: 'Underpinning',
    });
    const tags = ['alter:underpinning', 'alter:foundation'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('shoring');
    expect(slugs).not.toContain('roofing');
    expect(slugs).not.toContain('glazing');
    expect(slugs).not.toContain('landscaping');
    expect(slugs).not.toContain('elevator');
  });
});

// ---------------------------------------------------------------------------
// ALL_RULES is now Tier 1 only
// ---------------------------------------------------------------------------

describe('ALL_RULES', () => {
  it('contains only Tier 1 rules', () => {
    for (const rule of ALL_RULES) {
      expect(rule.tier).toBe(1);
    }
  });

  it('has the same rules as TIER_1_RULES', () => {
    expect(ALL_RULES).toEqual(TIER_1_RULES);
  });
});
