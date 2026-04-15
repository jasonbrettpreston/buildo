// SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 2
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pg pool ──────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('@/lib/db/client', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

// ─── Mock logger ───────────────────────────────────────────────────────────────
const mockLogError = vi.fn();
vi.mock('@/lib/logger', () => ({
  logError: mockLogError,
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/control-panel/configs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with MarketplaceConfig shape on success', async () => {
    // Simulate 3 DB queries returning minimal rows
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            variable_key: 'los_base_divisor',
            variable_value: '10000',
            variable_value_json: null,
            description: null,
            updated_at: new Date('2026-01-01'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            trade_slug: 'plumbing',
            bid_phase_cutoff: 'P3',
            work_phase_target: 'P12',
            imminent_window_days: 14,
            allocation_pct: '0.0650',
            multiplier_bid: '2.8',
            multiplier_work: '1.6',
            base_rate_sqft: '195.00',
            structure_complexity_factor: '1.40',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { permit_type: 'new building', structure_type: 'sfd', gfa_allocation_percentage: '1.0000' },
        ],
      });

    const { GET } = await import('@/app/api/admin/control-panel/configs/route');
    const response = await GET();
    const body = await response.json() as { data: { logicVariables: unknown[]; tradeConfigs: unknown[]; scopeMatrix: unknown[] }; meta: { fetched_at: string } };

    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();
    expect(body.data.logicVariables).toHaveLength(1);
    expect((body.data.logicVariables[0] as { key: string }).key).toBe('los_base_divisor');
    expect((body.data.logicVariables[0] as { value: number }).value).toBe(10000);
    expect(body.data.tradeConfigs).toHaveLength(1);
    expect(body.data.scopeMatrix).toHaveLength(1);
    expect(body.meta.fetched_at).toBeDefined();
  });

  it('returns 500 on DB error and calls logError', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const { GET } = await import('@/app/api/admin/control-panel/configs/route');
    const response = await GET();
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBeTruthy();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining('control-panel'),
      expect.any(Error),
      expect.any(Object),
    );
  });
});

describe('PUT /api/admin/control-panel/configs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rowCount: 0 });
  });

  it('returns 400 with Zod error message for malformed payload', async () => {
    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ tradeConfigs: [{ tradeSlug: '' }] }), // empty slug = invalid
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.error).toMatch(/tradeSlug/);
  });

  it('returns 200 on a valid empty-diff payload', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT

    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = await response.json() as { data: { rows_updated: number } };

    expect(response.status).toBe(200);
    expect(body.data.rows_updated).toBe(0);
  });

  it('returns 500 and calls logError when DB transaction throws', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('BEGIN failed'));

    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ logicVariables: [{ key: 'los_base_divisor', value: 5000 }] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBeTruthy();
    expect(mockLogError).toHaveBeenCalled();
  });
});

describe('POST /api/admin/control-panel/resync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with step list on success', async () => {
    const { POST } = await import('@/app/api/admin/control-panel/resync/route');
    const response = await POST();
    const body = await response.json() as { meta: { steps: string[] } };

    expect(response.status).toBe(200);
    expect(body.meta.steps).toBeDefined();
    expect(Array.isArray(body.meta.steps)).toBe(true);
  });
});
