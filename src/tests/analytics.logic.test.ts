// 🔗 SPEC LINK: docs/specs/23_analytics.md
// Analytics query function signatures and data transformation
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db client before importing analytics
vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
}));

import {
  getPermitsByDateRange,
  getTradeDistribution,
  getCostByWard,
  getStatusDistribution,
  getTopBuilders,
  getPermitTrends,
} from '@/lib/analytics/queries';
import { query } from '@/lib/db/client';

const mockQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPermitsByDateRange', () => {
  it('returns parsed date and count objects', async () => {
    mockQuery.mockResolvedValueOnce([
      { date: '2024-01-01', count: '42' },
      { date: '2024-01-08', count: '38' },
    ]);

    const result = await getPermitsByDateRange(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      'week'
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2024-01-01', count: 42 });
    expect(result[1]).toEqual({ date: '2024-01-08', count: 38 });
  });

  it('passes groupBy parameter to query', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await getPermitsByDateRange(
      new Date('2024-01-01'),
      new Date('2024-12-31'),
      'month'
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const args = mockQuery.mock.calls[0];
    expect(args[1]![0]).toBe('month');
  });

  it('returns empty array when no data', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await getPermitsByDateRange(
      new Date('2099-01-01'),
      new Date('2099-12-31'),
      'day'
    );
    expect(result).toEqual([]);
  });
});

describe('getTradeDistribution', () => {
  it('returns parsed trade distribution data', async () => {
    mockQuery.mockResolvedValueOnce([
      { trade_name: 'Plumbing', count: '500', avg_score: '72.50' },
      { trade_name: 'Electrical', count: '320', avg_score: '68.30' },
    ]);

    const result = await getTradeDistribution(
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      trade_name: 'Plumbing',
      count: 500,
      avg_score: 72.5,
    });
  });

  it('parses count and avg_score as numbers', async () => {
    mockQuery.mockResolvedValueOnce([
      { trade_name: 'HVAC', count: '1', avg_score: '0.00' },
    ]);

    const result = await getTradeDistribution(
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );

    expect(typeof result[0].count).toBe('number');
    expect(typeof result[0].avg_score).toBe('number');
  });
});

describe('getCostByWard', () => {
  it('returns parsed ward cost data', async () => {
    mockQuery.mockResolvedValueOnce([
      { ward: '10', total_cost: '50000000', permit_count: '1200' },
      { ward: '14', total_cost: '30000000', permit_count: '800' },
    ]);

    const result = await getCostByWard();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ward: '10',
      total_cost: 50000000,
      permit_count: 1200,
    });
  });

  it('takes no parameters', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getCostByWard();
    // Should be called without parameterized values array (or empty)
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('getStatusDistribution', () => {
  it('returns parsed status counts', async () => {
    mockQuery.mockResolvedValueOnce([
      { status: 'Issued', count: '150000' },
      { status: 'Application', count: '50000' },
      { status: 'Completed', count: '30000' },
    ]);

    const result = await getStatusDistribution();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ status: 'Issued', count: 150000 });
    expect(result[2]).toEqual({ status: 'Completed', count: 30000 });
  });
});

describe('getTopBuilders', () => {
  it('returns parsed builder data with default limit', async () => {
    mockQuery.mockResolvedValueOnce([
      { name: 'ACME CONSTRUCTION', permit_count: '150', avg_cost: '250000.50' },
    ]);

    const result = await getTopBuilders();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'ACME CONSTRUCTION',
      permit_count: 150,
      avg_cost: 250000.5,
    });
  });

  it('passes custom limit to query', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getTopBuilders(5);

    const args = mockQuery.mock.calls[0];
    expect(args[1]).toContain(5);
  });
});

describe('getPermitTrends', () => {
  it('returns parsed trend data', async () => {
    mockQuery.mockResolvedValueOnce([
      { date: '2024-03-01', new_count: '120', updated_count: '350' },
      { date: '2024-03-02', new_count: '95', updated_count: '280' },
    ]);

    const result = await getPermitTrends(30);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2024-03-01',
      new_count: 120,
      updated_count: 350,
    });
  });

  it('defaults to 30 days', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getPermitTrends();

    const args = mockQuery.mock.calls[0];
    expect(args[1]).toContain(30);
  });
});
