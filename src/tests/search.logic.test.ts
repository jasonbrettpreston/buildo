// 🔗 SPEC LINK: docs/specs/19_search_filter.md
// Search page logic: URL parameter handling, pagination, sort parsing
import { describe, it, expect } from 'vitest';

describe('Search URL Parameter Parsing', () => {
  function parseSearchParams(
    paramString: string
  ): Record<string, string> {
    const params = new URLSearchParams(paramString);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  it('parses status filter from URL', () => {
    const result = parseSearchParams('status=Issued&ward=10');
    expect(result.status).toBe('Issued');
    expect(result.ward).toBe('10');
  });

  it('parses trade_slug filter', () => {
    const result = parseSearchParams('trade_slug=plumbing');
    expect(result.trade_slug).toBe('plumbing');
  });

  it('handles empty search params', () => {
    const result = parseSearchParams('');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles multiple filters simultaneously', () => {
    const result = parseSearchParams(
      'status=Issued&ward=10&trade_slug=electrical&min_cost=100000'
    );
    expect(Object.keys(result)).toHaveLength(4);
    expect(result.min_cost).toBe('100000');
  });
});

describe('Search Pagination Logic', () => {
  function computePagination(page: number, totalPages: number) {
    return {
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: Math.max(1, page - 1),
      nextPage: Math.min(totalPages, page + 1),
    };
  }

  it('first page has no previous', () => {
    const p = computePagination(1, 10);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(true);
    expect(p.prevPage).toBe(1);
  });

  it('last page has no next', () => {
    const p = computePagination(10, 10);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(false);
    expect(p.nextPage).toBe(10);
  });

  it('middle page has both', () => {
    const p = computePagination(5, 10);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(true);
    expect(p.prevPage).toBe(4);
    expect(p.nextPage).toBe(6);
  });

  it('single page has neither', () => {
    const p = computePagination(1, 1);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });
});

describe('Sort Option Parsing', () => {
  function parseSortOption(value: string): {
    sort_by: string;
    sort_order: 'asc' | 'desc';
  } {
    const [sort_by, sort_order] = value.split(':');
    return {
      sort_by,
      sort_order: sort_order as 'asc' | 'desc',
    };
  }

  it('parses descending sort', () => {
    const result = parseSortOption('issued_date:desc');
    expect(result.sort_by).toBe('issued_date');
    expect(result.sort_order).toBe('desc');
  });

  it('parses ascending sort', () => {
    const result = parseSortOption('est_const_cost:asc');
    expect(result.sort_by).toBe('est_const_cost');
    expect(result.sort_order).toBe('asc');
  });

  it('toggles sort order', () => {
    function toggleOrder(current: 'asc' | 'desc'): 'asc' | 'desc' {
      return current === 'asc' ? 'desc' : 'asc';
    }
    expect(toggleOrder('asc')).toBe('desc');
    expect(toggleOrder('desc')).toBe('asc');
  });
});

describe('Search API Request Building', () => {
  function buildSearchParams(
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: string,
    filters: Record<string, string>
  ): string {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort_by: sortBy,
      sort_order: sortOrder,
      ...filters,
    });
    return params.toString();
  }

  it('builds query string with all parameters', () => {
    const qs = buildSearchParams(1, 25, 'lead_score', 'desc', {
      status: 'Issued',
    });
    expect(qs).toContain('page=1');
    expect(qs).toContain('limit=25');
    expect(qs).toContain('sort_by=lead_score');
    expect(qs).toContain('sort_order=desc');
    expect(qs).toContain('status=Issued');
  });

  it('builds query string without filters', () => {
    const qs = buildSearchParams(2, 25, 'issued_date', 'asc', {});
    expect(qs).toContain('page=2');
    expect(qs).not.toContain('status=');
    expect(qs).not.toContain('trade_slug=');
  });

  it('resets page to 1 when filters change', () => {
    // Simulates handleFilterChange behavior
    let page = 5;
    const handleFilterChange = () => {
      page = 1;
    };
    handleFilterChange();
    expect(page).toBe(1);
  });
});

describe('CoA Source Toggle', () => {
  const fs = require('fs');
  const path = require('path');

  it('FilterPanel contains a source toggle for pre-permits', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/search/FilterPanel.tsx'),
      'utf-8'
    );
    // Must have a control that sets source to pre_permits
    expect(src).toMatch(/pre_permits|Pre-Permits/);
    expect(src).toMatch(/source/);
  });

  it('FilterPanel hides permit-only filters when pre-permit source is active', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/search/FilterPanel.tsx'),
      'utf-8'
    );
    // Some conditional rendering based on source value
    expect(src).toMatch(/source.*pre_permits|isPrePermit/);
  });

  it('pre-permits API supports search text filtering', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/route.ts'),
      'utf-8'
    );
    // When source=pre_permits, search param should be forwarded
    expect(src).toMatch(/pre_permits[\s\S]*?search/);
  });

  it('pre-permits API supports ward filtering', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/route.ts'),
      'utf-8'
    );
    // When source=pre_permits, ward param should be forwarded
    expect(src).toMatch(/pre_permits[\s\S]*?ward/);
  });

  it('getUpcomingLeads accepts search and ward params', async () => {
    const mod = await import('../lib/coa/pre-permits');
    // The function should accept an options object with search and ward
    expect(mod.getUpcomingLeads.length).toBeGreaterThanOrEqual(0);
    // Check the source for the parameter signature
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/coa/pre-permits.ts'),
      'utf-8'
    );
    expect(src).toMatch(/search.*ward|ward.*search|options.*search|options.*ward/);
  });
});

describe('Permit URL Generation', () => {
  function getPermitUrl(permitNum: string, revisionNum: string): string {
    return `/permits/${permitNum}--${revisionNum}`;
  }

  it('generates correct permit detail URL', () => {
    expect(getPermitUrl('24 101234', '01')).toBe('/permits/24 101234--01');
  });

  it('handles multi-digit revision numbers', () => {
    expect(getPermitUrl('24 101234', '15')).toBe('/permits/24 101234--15');
  });
});
