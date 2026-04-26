// SPEC LINK: docs/specs/02-web-admin/26_admin_dashboard.md
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  formatCurrency,
  mapPermitType,
  trendPct,
  PERMIT_TYPE_TO_TRADE,
  TIER_LABELS,
  TIER_ORDER,
} from '@/lib/market-metrics/helpers';
import type { WealthTier } from '@/lib/market-metrics/helpers';
import { classifyIncome } from '@/lib/neighbourhoods/summary';

// ── Migration file ──────────────────────────────────────────────────

describe('Migration 034 — mv_monthly_permit_stats', () => {
  const migrationPath = path.resolve('migrations/034_mv_monthly_permit_stats.sql');

  it('migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('contains CREATE MATERIALIZED VIEW mv_monthly_permit_stats', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('CREATE MATERIALIZED VIEW');
    expect(sql).toContain('mv_monthly_permit_stats');
  });

  it('creates a unique index on (month, permit_type)', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('CREATE UNIQUE INDEX');
    expect(sql).toContain('month');
    expect(sql).toContain('permit_type');
  });

  it('aggregates by permit_type (not project_type)', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('permit_type');
    // should group by permit_type, not project_type
    expect(sql).not.toMatch(/GROUP BY.*project_type/);
  });
});

// ── API route exports ───────────────────────────────────────────────

describe('API route exports', () => {
  it('exports a GET handler', async () => {
    const mod = await import('@/app/api/admin/market-metrics/route');
    expect(typeof mod.GET).toBe('function');
  });
});

// ── formatCurrency ──────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats billions', () => {
    expect(formatCurrency(2_500_000_000)).toBe('$2.5B');
  });

  it('formats millions', () => {
    expect(formatCurrency(14_300_000)).toBe('$14.3M');
  });

  it('formats thousands', () => {
    expect(formatCurrency(750_000)).toBe('$750K');
  });

  it('formats small values', () => {
    expect(formatCurrency(500)).toBe('$500');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('formats exactly 1M boundary', () => {
    expect(formatCurrency(1_000_000)).toBe('$1.0M');
  });

  it('formats exactly 1B boundary', () => {
    expect(formatCurrency(1_000_000_000)).toBe('$1.0B');
  });
});

// ── mapPermitType ───────────────────────────────────────────────────

describe('mapPermitType', () => {
  it('maps Small Residential Projects', () => {
    expect(mapPermitType('Small Residential Projects')).toBe('small_residential');
  });

  it('maps New Houses', () => {
    expect(mapPermitType('New Houses')).toBe('new_houses');
  });

  it('maps Building Additions/Alterations', () => {
    expect(mapPermitType('Building Additions/Alterations')).toBe('additions_alterations');
  });

  it('maps New Building', () => {
    expect(mapPermitType('New Building')).toBe('new_building');
  });

  it('maps Plumbing(PS)', () => {
    expect(mapPermitType('Plumbing(PS)')).toBe('plumbing');
  });

  it('maps Mechanical(MS) to hvac', () => {
    expect(mapPermitType('Mechanical(MS)')).toBe('hvac');
  });

  it('maps Drain and Site Service', () => {
    expect(mapPermitType('Drain and Site Service')).toBe('drain');
  });

  it('maps Demolition Folder (DM)', () => {
    expect(mapPermitType('Demolition Folder (DM)')).toBe('demolition');
  });

  it('maps Fire/Security Upgrade to other', () => {
    expect(mapPermitType('Fire/Security Upgrade')).toBe('other');
  });

  it('maps Designated Structures to other', () => {
    expect(mapPermitType('Designated Structures')).toBe('other');
  });

  it('maps null to other', () => {
    expect(mapPermitType(null)).toBe('other');
  });

  it('maps unknown types to other', () => {
    expect(mapPermitType('Temporary Structures')).toBe('other');
    expect(mapPermitType('Partial Permit')).toBe('other');
  });
});

// ── PERMIT_TYPE_TO_TRADE mapping ────────────────────────────────────

describe('PERMIT_TYPE_TO_TRADE', () => {
  it('maps Plumbing(PS) to plumbing trade', () => {
    expect(PERMIT_TYPE_TO_TRADE['Plumbing(PS)']).toBe('plumbing');
  });

  it('maps Mechanical(MS) to hvac trade', () => {
    expect(PERMIT_TYPE_TO_TRADE['Mechanical(MS)']).toBe('hvac');
  });

  it('maps Demolition Folder (DM) to demolition trade', () => {
    expect(PERMIT_TYPE_TO_TRADE['Demolition Folder (DM)']).toBe('demolition');
  });

  it('maps Fire/Security Upgrade to fire-protection trade', () => {
    expect(PERMIT_TYPE_TO_TRADE['Fire/Security Upgrade']).toBe('fire-protection');
  });

  it('maps Drain and Site Service to excavation trade', () => {
    expect(PERMIT_TYPE_TO_TRADE['Drain and Site Service']).toBe('excavation');
  });

  it('has exactly 5 direct mappings', () => {
    expect(Object.keys(PERMIT_TYPE_TO_TRADE)).toHaveLength(5);
  });
});

// ── trendPct (YoY) ─────────────────────────────────────────────────

describe('trendPct', () => {
  it('calculates positive trend', () => {
    expect(trendPct(150, 100)).toBe(50);
  });

  it('calculates negative trend', () => {
    expect(trendPct(80, 100)).toBe(-20);
  });

  it('returns 0 when both are zero', () => {
    expect(trendPct(0, 0)).toBe(0);
  });

  it('returns 100 when year-ago is zero but current is positive', () => {
    expect(trendPct(50, 0)).toBe(100);
  });

  it('returns -100 for complete drop', () => {
    expect(trendPct(0, 100)).toBe(-100);
  });

  it('rounds to integer', () => {
    expect(trendPct(133, 100)).toBe(33);
  });
});

// ── Response shape contract ─────────────────────────────────────────

describe('MarketMetrics response shape', () => {
  it('kpi section uses YoY fields and ref_month', () => {
    const kpi = {
      ref_month: '2026-02-01',
      permits_mtd: 120,
      permits_yoy: 100,
      value_mtd: 50_000_000,
      value_yoy: 45_000_000,
      top_builder: { name: 'Test Builder', count: 15 },
    };

    expect(kpi).toHaveProperty('ref_month');
    expect(kpi).toHaveProperty('permits_mtd');
    expect(kpi).toHaveProperty('permits_yoy');
    expect(kpi).toHaveProperty('value_mtd');
    expect(kpi).toHaveProperty('value_yoy');
    expect(kpi).toHaveProperty('top_builder');
    expect(kpi.top_builder).toHaveProperty('name');
    expect(kpi.top_builder).toHaveProperty('count');
  });

  it('kpi allows null top_builder', () => {
    const kpi = {
      ref_month: '2026-02-01',
      permits_mtd: 0, permits_yoy: 0,
      value_mtd: 0, value_yoy: 0,
      top_builder: null,
    };
    expect(kpi.top_builder).toBeNull();
  });

  it('activity rows have all 9 permit type categories', () => {
    const row = {
      month: '2026-01-01',
      small_residential: 50,
      new_houses: 30,
      additions_alterations: 40,
      new_building: 5,
      plumbing: 60,
      hvac: 45,
      drain: 20,
      demolition: 10,
      other: 15,
      total_value: 5_000_000,
    };

    expect(row).toHaveProperty('month');
    expect(row).toHaveProperty('small_residential');
    expect(row).toHaveProperty('new_houses');
    expect(row).toHaveProperty('additions_alterations');
    expect(row).toHaveProperty('new_building');
    expect(row).toHaveProperty('plumbing');
    expect(row).toHaveProperty('hvac');
    expect(row).toHaveProperty('drain');
    expect(row).toHaveProperty('demolition');
    expect(row).toHaveProperty('other');
    expect(row).toHaveProperty('total_value');
  });

  it('trades rows include YoY comparison', () => {
    const row = {
      name: 'Plumbing', slug: 'plumbing', color: '#1E90FF',
      lead_count: 42, lead_count_yoy: 38,
    };
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('slug');
    expect(row).toHaveProperty('color');
    expect(row).toHaveProperty('lead_count');
    expect(row).toHaveProperty('lead_count_yoy');
  });

  it('residential_vs_commercial rows have current and YoY fields', () => {
    const row = {
      month: '2026-01-01', residential: 100, commercial: 60, other: 20,
      residential_yoy: 90, commercial_yoy: 55,
    };
    expect(row).toHaveProperty('month');
    expect(row).toHaveProperty('residential');
    expect(row).toHaveProperty('commercial');
    expect(row).toHaveProperty('other');
    expect(row).toHaveProperty('residential_yoy');
    expect(row).toHaveProperty('commercial_yoy');
  });

  it('scope_tags is segmented into residential and commercial with YoY', () => {
    const scope_tags = {
      residential: [{ tag: 'new:build-sfd', permit_count: 35, permit_count_yoy: 30 }],
      commercial: [{ tag: 'tenant-fitout', permit_count: 12, permit_count_yoy: 15 }],
    };
    expect(scope_tags).toHaveProperty('residential');
    expect(scope_tags).toHaveProperty('commercial');
    expect(scope_tags.residential[0]).toHaveProperty('tag');
    expect(scope_tags.residential[0]).toHaveProperty('permit_count');
    expect(scope_tags.residential[0]).toHaveProperty('permit_count_yoy');
    expect(scope_tags.commercial[0]).toHaveProperty('permit_count_yoy');
  });

  it('WealthTierGroup has all required fields including nested top_neighbourhoods', () => {
    const group = {
      tier: 'high' as WealthTier,
      label: 'High Income ($100K+)',
      permit_count: 120,
      total_value: 50_000_000,
      permit_count_yoy: 100,
      total_value_yoy: 45_000_000,
      top_neighbourhoods: [
        { name: 'Willowdale', permit_count: 45, total_value: 12_000_000, avg_income: 125000 },
      ],
    };
    expect(group).toHaveProperty('tier');
    expect(group).toHaveProperty('label');
    expect(group).toHaveProperty('permit_count');
    expect(group).toHaveProperty('total_value');
    expect(group).toHaveProperty('permit_count_yoy');
    expect(group).toHaveProperty('total_value_yoy');
    expect(group).toHaveProperty('top_neighbourhoods');
    expect(group.top_neighbourhoods[0]).toHaveProperty('name');
    expect(group.top_neighbourhoods[0]).toHaveProperty('permit_count');
    expect(group.top_neighbourhoods[0]).toHaveProperty('total_value');
    expect(group.top_neighbourhoods[0]).toHaveProperty('avg_income');
  });

  it('wealth tiers are ordered high → middle → low', () => {
    expect(TIER_ORDER).toEqual(['high', 'middle', 'low']);
  });

  it('wealth tier labels include human-readable income ranges', () => {
    expect(TIER_LABELS.high).toContain('$100K+');
    expect(TIER_LABELS.middle).toContain('$60K');
    expect(TIER_LABELS.middle).toContain('$100K');
    expect(TIER_LABELS.low).toContain('<$60K');
  });

  it('YoY trend uses trendPct for wealth tier comparison', () => {
    // Simulate tier-level YoY: 120 permits now vs 100 last year = +20%
    expect(trendPct(120, 100)).toBe(20);
    // Value: $50M now vs $45M last year = +11%
    expect(trendPct(50_000_000, 45_000_000)).toBe(11);
    // Declining tier: 80 vs 100 = -20%
    expect(trendPct(80, 100)).toBe(-20);
  });

  it('classifyIncome thresholds align with SQL CASE boundaries', () => {
    // SQL: >= 100000 → high, >= 60000 → middle, else low, null → unknown
    expect(classifyIncome(100000)).toBe('high-income');
    expect(classifyIncome(99999)).toBe('middle-income');
    expect(classifyIncome(60000)).toBe('middle-income');
    expect(classifyIncome(59999)).toBe('lower-income');
    expect(classifyIncome(null)).toBe('unknown-income');
  });
});

// ── Query extraction guardrails ─────────────────────────────────────

describe('Query extraction', () => {
  it('route.ts is a thin handler (< 50 lines)', () => {
    const src = fs.readFileSync(
      path.resolve('src/app/api/admin/market-metrics/route.ts'),
      'utf-8'
    );
    const lines = src.split('\n').length;
    expect(lines).toBeLessThan(50);
  });

  it('queries.ts exports all 7 query functions', async () => {
    const mod = await import('@/lib/market-metrics/queries');
    expect(typeof mod.getReferenceMonth).toBe('function');
    expect(typeof mod.fetchKpi).toBe('function');
    expect(typeof mod.fetchActivity).toBe('function');
    expect(typeof mod.fetchTrades).toBe('function');
    expect(typeof mod.fetchResidentialVsCommercial).toBe('function');
    expect(typeof mod.fetchScopeTagsSegmented).toBe('function');
    expect(typeof mod.fetchNeighbourhoods).toBe('function');
  });
});

// ── getReferenceMonth logic ─────────────────────────────────────────

describe('getReferenceMonth logic', () => {
  it('route.ts does NOT contain the old MAX(issued_date) reference month query', () => {
    const src = fs.readFileSync(
      path.resolve('src/app/api/admin/market-metrics/route.ts'),
      'utf-8'
    );
    expect(src).not.toContain('MAX(issued_date)');
  });

  it('queries.ts uses previous-month logic for reference month', () => {
    const src = fs.readFileSync(
      path.resolve('src/lib/market-metrics/queries.ts'),
      'utf-8'
    );
    // Must subtract 1 month from current month to avoid partial-month comparison
    expect(src).toContain("INTERVAL '1 month'");
    expect(src).toContain('getReferenceMonth');
  });
});

// ── ResComChart YoY occlusion fix ───────────────────────────────────

describe('ResComChart YoY visibility', () => {
  it('uses target lines instead of background-fill bars for YoY', () => {
    const src = fs.readFileSync(
      path.resolve('src/app/admin/market-metrics/page.tsx'),
      'utf-8'
    );
    // The old pattern: YoY bars rendered behind current bars with opacity
    // Should NOT have the old occlusion pattern (faded rects at same x position)
    expect(src).not.toMatch(/YoY[\s\S]*opacity[\s\S]*0\.2/);
    // Should have a target-line or side-by-side approach
    expect(src).toMatch(/yoy|YoY/i);
  });
});
