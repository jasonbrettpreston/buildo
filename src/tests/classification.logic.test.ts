// 🔗 SPEC LINK: docs/specs/07_trade_taxonomy.md, 08_trade_classification.md, 32_product_groups.md
import { describe, it, expect } from 'vitest';
import { classifyPermit, extractPermitCode, classifyProducts, NARROW_SCOPE_CODES } from '@/lib/classification/classifier';
import {
  determinePhase,
  isTradeActiveInPhase,
  PHASE_TRADE_MAP,
} from '@/lib/classification/phases';
import { TRADES, getTradeBySlug } from '@/lib/classification/trades';
import { TIER_1_RULES, ALL_RULES } from '@/lib/classification/rules';
import { lookupTradesForTags } from '@/lib/classification/tag-trade-matrix';
import { lookupProductsForTags } from '@/lib/classification/tag-product-matrix';
import { PRODUCT_GROUPS } from '@/lib/classification/products';
import { createMockPermit } from './factories';

// ---------------------------------------------------------------------------
// Trade Taxonomy (32 trades)
// ---------------------------------------------------------------------------

describe('Trade Taxonomy', () => {
  it('has exactly 32 trade categories', () => {
    expect(TRADES).toHaveLength(32);
  });

  it('includes drain-plumbing trade', () => {
    const trade = getTradeBySlug('drain-plumbing');
    expect(trade).toBeDefined();
    expect(trade?.name).toBe('Drain & Plumbing');
    expect(trade?.id).toBe(32);
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

  it('build-sfd tag produces many trades including new ones', () => {
    const results = lookupTradesForTags(['new:build-sfd']);
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

  it('tenant-fitout tag maps to drywall, millwork-cabinetry, electrical', () => {
    const results = lookupTradesForTags(['tenant-fitout']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('millwork-cabinetry');
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('painting');
  });

  it('retail tag maps to drywall, electrical, glazing', () => {
    const results = lookupTradesForTags(['retail']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('glazing');
  });

  it('office tag maps to drywall, hvac, electrical', () => {
    const results = lookupTradesForTags(['office']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('hvac');
    expect(slugs).toContain('electrical');
  });

  it('restaurant tag maps to plumbing, hvac, fire-protection', () => {
    const results = lookupTradesForTags(['restaurant']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('hvac');
    expect(slugs).toContain('fire-protection');
  });

  it('warehouse tag maps to concrete, structural-steel, fire-protection', () => {
    const results = lookupTradesForTags(['warehouse']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('structural-steel');
    expect(slugs).toContain('fire-protection');
  });

  // ── Tag alias resolution ──────────────────────────────────────────────

  it('interior-alterations resolves to interior trades via alias', () => {
    const results = lookupTradesForTags(['alter:interior-alterations']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('painting');
    expect(slugs).toContain('flooring');
  });

  it('roofing resolves to roof trades via alias', () => {
    const results = lookupTradesForTags(['new:roofing']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('roofing');
    expect(slugs).toContain('eavestrough-siding');
  });

  it('laneway-suite resolves to laneway trades via alias', () => {
    const results = lookupTradesForTags(['new:laneway-suite']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('hvac');
  });

  it('fire-alarm resolves to fire_alarm trades via alias', () => {
    const results = lookupTradesForTags(['fire-alarm']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('fire-protection');
    expect(slugs).toContain('electrical');
  });

  it('stacked-townhouse resolves to townhouse trades via alias', () => {
    const results = lookupTradesForTags(['new:stacked-townhouse']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('masonry');
    expect(slugs).toContain('fire-protection');
  });

  it('semi-detached resolves to semi trades via alias', () => {
    const results = lookupTradesForTags(['new:semi-detached']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('masonry');
  });

  it('condo resolves to apartment trades via alias', () => {
    const results = lookupTradesForTags(['condo']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('elevator');
  });

  it('storey/floor addition aliases resolve to addition trades', () => {
    for (const tag of ['storey-addition', '2nd-floor', '3rd-floor', 'rear-addition']) {
      const results = lookupTradesForTags([tag]);
      const slugs = results.map((r) => r.tradeSlug);
      expect(slugs).toContain('framing');
      expect(slugs).toContain('concrete');
    }
  });

  it('finished-basement and basement-finish resolve to basement trades', () => {
    for (const tag of ['new:finished-basement', 'basement-finish']) {
      const results = lookupTradesForTags([tag]);
      const slugs = results.map((r) => r.tradeSlug);
      expect(slugs).toContain('framing');
      expect(slugs).toContain('waterproofing');
    }
  });

  // ── New matrix entries ────────────────────────────────────────────────

  it('walkout tag maps to excavation, concrete, waterproofing', () => {
    const results = lookupTradesForTags(['new:walkout']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('excavation');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('waterproofing');
  });

  it('second-suite tag maps to framing, plumbing, electrical, hvac', () => {
    const results = lookupTradesForTags(['new:second-suite']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('hvac');
  });

  it('drain tag maps to drain-plumbing', () => {
    const results = lookupTradesForTags(['drain']);
    expect(results).toHaveLength(1);
    expect(results[0].tradeSlug).toBe('drain-plumbing');
  });

  it('balcony tag maps to framing, concrete, waterproofing', () => {
    const results = lookupTradesForTags(['new:balcony']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('waterproofing');
  });

  it('unit-conversion tag maps to framing, drywall, plumbing, electrical', () => {
    const results = lookupTradesForTags(['alter:unit-conversion']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('electrical');
  });

  it('open-concept tag maps to framing, structural-steel, drywall', () => {
    const results = lookupTradesForTags(['new:open-concept']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('structural-steel');
    expect(slugs).toContain('drywall');
  });

  it('structural-beam tag maps to structural-steel, framing', () => {
    const results = lookupTradesForTags(['new:structural-beam']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('structural-steel');
    expect(slugs).toContain('framing');
  });

  it('fire-damage tag maps to demolition, framing, drywall', () => {
    const results = lookupTradesForTags(['alter:fire-damage']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('demolition');
    expect(slugs).toContain('framing');
    expect(slugs).toContain('drywall');
  });

  it('dormer tag maps to framing, roofing, insulation', () => {
    const results = lookupTradesForTags(['new:dormer']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('roofing');
    expect(slugs).toContain('insulation');
  });

  it('carport tag maps to framing, concrete, roofing', () => {
    const results = lookupTradesForTags(['new:carport']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('roofing');
  });

  it('convert-unit resolves to unit-conversion trades via alias', () => {
    const results = lookupTradesForTags(['convert-unit']);
    const slugs = results.map((r) => r.tradeSlug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('drywall');
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
    const tags = ['new:build-sfd', 'new:kitchen', 'new:bathroom'];
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

  it('empty tags with no narrow-scope falls back to broad trades at tier 1', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Fallback trades should be tier 1 (Tier 3 deprecated)
    for (const m of matches) {
      expect(m.tier).toBe(1);
      expect(m.confidence).toBeGreaterThanOrEqual(0.50);
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

  it('unknown scope tags fall back to broad trades', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const tags = ['new:nonexistent_tag', 'alter:unknown_scope'];
    const matches = classifyPermit(permit, ALL_RULES, tags);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    for (const m of matches) {
      expect(m.tier).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Tier 3 Deprecation & Tier 1 Work-Field Fallback
// ---------------------------------------------------------------------------

describe('Tier 3 Deprecation - all fallback matches must be tier 1', () => {
  it('fallback trades are tier 1, not tier 3', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Other',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    for (const m of matches) {
      expect(m.tier).toBe(1);
      expect(m.tier).not.toBe(3);
    }
  });

  it('no permit ever produces tier 3 matches', () => {
    const permits = [
      createMockPermit({ permit_num: '21 100000 BLD 00', permit_type: 'Building', work: 'Other' }),
      createMockPermit({ permit_num: '21 200000 BLD 00', permit_type: 'Building', work: 'Interior Alterations' }),
      createMockPermit({ permit_num: '21 300000 BLD 00', permit_type: 'Building', work: 'New Building' }),
      createMockPermit({ permit_num: '21 400000 BLD 00', permit_type: 'Small Residential Projects', work: 'Addition' }),
    ];
    for (const permit of permits) {
      const matches = classifyPermit(permit, ALL_RULES, []);
      for (const m of matches) {
        expect(m.tier).not.toBe(3);
      }
    }
  });
});

describe('Tier 1 Work-Field Fallback', () => {
  it('Interior Alterations fallback includes drywall, painting, electrical', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Interior Alterations',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('drywall');
    expect(slugs).toContain('painting');
    expect(slugs).toContain('electrical');
    for (const m of matches) {
      expect(m.tier).toBe(1);
      expect(m.confidence).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('New Building fallback includes framing, concrete, excavation', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'New Building',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('excavation');
    for (const m of matches) {
      expect(m.tier).toBe(1);
    }
  });

  it('Re-Roofing fallback maps to roofing', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Re-Roofing',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('roofing');
    for (const m of matches) {
      expect(m.tier).toBe(1);
    }
  });

  it('Deck fallback maps to framing and concrete', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Deck',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('framing');
    expect(slugs).toContain('concrete');
    for (const m of matches) {
      expect(m.tier).toBe(1);
    }
  });

  it('Unknown work field gets broad default trades at tier 1', () => {
    const permit = createMockPermit({
      permit_num: '21 123456 BLD 00',
      permit_type: 'Building',
      work: 'Some Unknown Work Type',
    });
    const matches = classifyPermit(permit, ALL_RULES, []);
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const m of matches) {
      expect(m.tier).toBe(1);
      expect(m.confidence).toBeGreaterThanOrEqual(0.50);
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
    const products = classifyProducts(permit, ['new:kitchen', 'new:build-sfd']);
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

  it('DRN permit only gets drain-plumbing trade', () => {
    const permit = createMockPermit({
      permit_num: '20 222222 DRN 00',
      permit_type: 'Drain and Site Service',
      structure_type: 'SFD - Detached',
      work: 'Building Permit Related (DR)',
    });
    const matches = classifyPermit(permit, ALL_RULES);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('drain-plumbing');
    expect(slugs).not.toContain('plumbing');
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
    const tags = ['new:build-sfd', 'new:kitchen', 'new:bathroom'];
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
// Narrow-Scope Fallback (code-based)
// ---------------------------------------------------------------------------

describe('Narrow-Scope Code-Based Fallback', () => {
  it('PLB permit with no matching Tier 1 rules falls back to plumbing at 0.80', () => {
    const permit = createMockPermit({
      permit_num: '22 654321 PLB 00',
      permit_type: 'UnknownType',
      work: 'Building Permit Related(PS)',
    });
    // Pass empty rules so no Tier 1 matches
    const matches = classifyPermit(permit, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].trade_slug).toBe('plumbing');
    expect(matches[0].confidence).toBe(0.80);
    expect(matches[0].tier).toBe(1);
  });

  it('HVA permit with no matching Tier 1 rules falls back to hvac at 0.80', () => {
    const permit = createMockPermit({
      permit_num: '23 111111 HVA 00',
      permit_type: 'UnknownType',
      work: 'Building Permit Related(MS)',
    });
    const matches = classifyPermit(permit, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].trade_slug).toBe('hvac');
    expect(matches[0].confidence).toBe(0.80);
    expect(matches[0].tier).toBe(1);
  });

  it('DRN permit with no matching Tier 1 rules falls back to drain-plumbing at 0.80', () => {
    const permit = createMockPermit({
      permit_num: '20 222222 DRN 00',
      permit_type: 'UnknownType',
      work: 'Building Permit Related (DR)',
    });
    const matches = classifyPermit(permit, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].trade_slug).toBe('drain-plumbing');
    expect(matches[0].confidence).toBe(0.80);
    expect(matches[0].tier).toBe(1);
  });

  it('FSU permit with no matching Tier 1 rules falls back to fire-protection at 0.80', () => {
    const permit = createMockPermit({
      permit_num: '21 333333 FSU 00',
      permit_type: 'UnknownType',
      work: 'Unknown Work',
    });
    const matches = classifyPermit(permit, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].trade_slug).toBe('fire-protection');
    expect(matches[0].confidence).toBe(0.80);
  });

  it('SHO permit with no matching Tier 1 rules falls back to all allowed trades', () => {
    const permit = createMockPermit({
      permit_num: '22 555555 SHO 00',
      permit_type: 'UnknownType',
      work: 'Unknown Work',
    });
    const matches = classifyPermit(permit, []);
    const slugs = matches.map((m) => m.trade_slug);
    expect(slugs).toContain('excavation');
    expect(slugs).toContain('shoring');
    expect(slugs).toContain('concrete');
    expect(slugs).toContain('waterproofing');
    expect(matches).toHaveLength(4);
    for (const m of matches) {
      expect(m.confidence).toBe(0.80);
    }
  });

  it('NARROW_SCOPE_CODES maps DRN to drain-plumbing', () => {
    expect(NARROW_SCOPE_CODES['DRN']).toEqual(['drain-plumbing']);
  });

  it('NARROW_SCOPE_CODES maps STS to drain-plumbing', () => {
    expect(NARROW_SCOPE_CODES['STS']).toEqual(['drain-plumbing']);
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
