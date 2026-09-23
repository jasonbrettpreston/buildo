// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
//            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3
//            docs/specs/01-pipeline/124_step_standard_policy.md (R-AU — the pricing
//            DATA admin surface; batch-2 row 2.5)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

// ─── Mock the admin guard ──────────────────────────────────────────────────────
// WF3 SEC-1 (2026-09-15): both exports now call `verifyAdminAuth` as their
// FIRST statement (Spec 33 §8). Until then this file's header claimed the
// routes were "admin-gated by src/middleware.ts (no per-route check needed)",
// which was wrong — the middleware admin arm only PRESENCE-checks a
// credential. These cases are about the handler's own behaviour, so the guard
// is stubbed to a session admin here; its ENFORCEMENT is locked separately in
// src/tests/admin-route-guard.infra.test.ts (real guard, no mock) and
// src/tests/admin-mutation-audit.infra.test.ts (401/403/400/500 paths).
vi.mock('@/lib/auth/verify-admin', () => ({
  verifyAdminAuth: vi
    .fn()
    .mockResolvedValue({ uid: '11111111-2222-3333-4444-555555555555', authMethod: 'session' }),
}));

// The audit row is asserted in admin-mutation-audit.infra.test.ts; here it is
// stubbed so these cases stay about the config apply itself. The pricing cases
// (A2) additionally lock the ORDER (audit before the first UPDATE) and the
// section_keys content, since the route derives both from Object.keys(parsed.data).
const mockWriteAdminAudit = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/admin/admin-audit', () => ({
  writeAdminAudit: mockWriteAdminAudit,
}));

// ─────────────────────────────────────────────────────────────────────────────

const mockGetRequest = () => new NextRequest('http://localhost/api/admin/control-panel/configs');
const mockPostRequest = () => new NextRequest('http://localhost/api/admin/control-panel/resync', { method: 'POST' });

describe('GET /api/admin/control-panel/configs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with MarketplaceConfig shape on success', async () => {
    // Simulate 5 DB queries returning minimal rows (the two pricing SELECTs
    // are added by batch-2 row 2.5 — see A1 below for their full assertion).
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
      })
      .mockResolvedValueOnce({ rows: [] }) // archetype_cost_rates
      .mockResolvedValueOnce({ rows: [] }); // parcel_cost_lines

    const { GET } = await import('@/app/api/admin/control-panel/configs/route');
    const response = await GET(mockGetRequest());
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

  // ── A1 (batch-2 row 2.5) ────────────────────────────────────────────────────
  // RED today: `pricingRates`/`pricingLines` are absent from the response —
  // loadAllConfigs issues 3 SELECTs, not 5, and MarketplaceConfig has no such
  // keys. Spec 88 §2.3 / Spec 124 R-AU.
  it('A1: returns pricingRates/pricingLines mapped from the two extra result sets', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // logic_variables
      .mockResolvedValueOnce({ rows: [] }) // trade_configurations JOIN
      .mockResolvedValueOnce({ rows: [] }) // scope_intensity_matrix
      .mockResolvedValueOnce({
        rows: [
          {
            archetype: 'KIT',
            cost_per_sqm: 1250.5,
            cost_adjustment_factor: 1.05,
            escalation_index_base: 1.12,
            source: 'RSMeans 2026',
            as_of_date: '2026-01-01',
          },
          {
            archetype: 'BATH',
            cost_per_sqm: 900,
            cost_adjustment_factor: 1,
            escalation_index_base: 1.1,
            source: null,
            as_of_date: '2026-01-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'kitchen', archetype: 'KIT', base_confidence: 'high', fit_permitted_values: ['reno_kitchen_gfa_pct'] },
          { id: 'bath', archetype: 'BATH', base_confidence: 'low', fit_permitted_values: null },
        ],
      });

    const { GET } = await import('@/app/api/admin/control-panel/configs/route');
    const response = await GET(mockGetRequest());
    const body = (await response.json()) as {
      data: {
        pricingRates: Array<Record<string, unknown>>;
        pricingLines: Array<Record<string, unknown>>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.pricingRates).toHaveLength(2);
    expect(body.data.pricingRates[0]).toEqual({
      archetype: 'KIT',
      costPerSqm: 1250.5,
      costAdjustmentFactor: 1.05,
      escalationIndexBase: 1.12,
      source: 'RSMeans 2026',
      asOfDate: '2026-01-01',
    });
    expect(body.data.pricingRates[1]!.source).toBeNull();
    expect(body.data.pricingLines).toHaveLength(2);
    expect(body.data.pricingLines[0]).toEqual({
      id: 'kitchen',
      archetype: 'KIT',
      baseConfidence: 'high',
      fitPermittedValues: ['reno_kitchen_gfa_pct'],
    });
    expect(body.data.pricingLines[1]!.fitPermittedValues).toBeNull();

    // The two pricing SELECTs are the 4th and 5th statements, ordered.
    const sql5 = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sql5.some((s) => /FROM archetype_cost_rates/.test(s))).toBe(true);
    expect(sql5.some((s) => /FROM parcel_cost_lines/.test(s))).toBe(true);
  });

  it('returns 500 on DB error and calls logError', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const { GET } = await import('@/app/api/admin/control-panel/configs/route');
    const response = await GET(mockGetRequest());
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

  // ── A2 (batch-2 row 2.5) ────────────────────────────────────────────────────
  // RED today: the payload's pricingRates/pricingLines are silently STRIPPED by
  // ConfigUpdatePayloadSchema, so no UPDATE ever reaches the client and the
  // response counts 0. Spec 88 §2.3 / Spec 124 R-AU.
  it('A2: PUT applies both pricing sections in ONE transaction, audit before the first UPDATE', async () => {
    const order: string[] = [];
    mockWriteAdminAudit.mockImplementation(async () => {
      order.push('audit');
    });
    mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      order.push(String(sql).replace(/\s+/g, ' ').trim());
      void params;
      return { rowCount: 1 };
    });

    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({
        pricingRates: [{ archetype: 'KIT', costPerSqm: 1300 }],
        pricingLines: [{ id: 'kitchen', baseConfidence: 'low' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = (await response.json()) as { data: { rows_updated: number } };

    expect(response.status).toBe(200);
    expect(body.data.rows_updated).toBe(2);

    // Exactly one UPDATE per pricing table.
    const updates = order.filter((s) => /^UPDATE /.test(s));
    const rateUpdates = updates.filter((s) => /UPDATE archetype_cost_rates/.test(s));
    const lineUpdates = updates.filter((s) => /UPDATE parcel_cost_lines/.test(s));
    expect(rateUpdates).toHaveLength(1);
    expect(lineUpdates).toHaveLength(1);
    expect(rateUpdates[0]).toMatch(/cost_per_sqm = /);
    expect(rateUpdates[0]).toMatch(/updated_at = now\(\)/);
    expect(rateUpdates[0]).toMatch(/IS DISTINCT FROM/);
    expect(lineUpdates[0]).toMatch(/base_confidence|base_confidence = /);
    expect(lineUpdates[0]).toMatch(/IS DISTINCT FROM/);

    // Params: enumerated, parameterised.
    const rateCall = mockClient.query.mock.calls.find(
      (c) => /UPDATE archetype_cost_rates/.test(String(c[0])),
    );
    expect(rateCall?.[1]).toEqual(['KIT', 1300]);
    const lineCall = mockClient.query.mock.calls.find(
      (c) => /UPDATE parcel_cost_lines/.test(String(c[0])),
    );
    expect(lineCall?.[1]).toEqual(['kitchen', 'low']);

    // BEGIN precedes the UPDATEs; COMMIT follows them.
    const beginIdx = order.indexOf('BEGIN');
    const commitIdx = order.indexOf('COMMIT');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    expect(order.indexOf(rateUpdates[0]!)).toBeGreaterThan(beginIdx);
    expect(order.indexOf(lineUpdates[0]!)).toBeLessThan(commitIdx);

    // Audit fires ONCE, BEFORE the first UPDATE, and names both sections.
    expect(order.filter((s) => s === 'audit')).toHaveLength(1);
    expect(order.indexOf('audit')).toBeLessThan(order.indexOf('BEGIN'));
    expect(mockWriteAdminAudit).toHaveBeenCalledTimes(1);
    const auditPayload = mockWriteAdminAudit.mock.calls[0]![0] as {
      action: string;
      newValue: { section_keys: string[] };
    };
    expect(auditPayload.action).toBe('control_panel_config_update');
    expect(auditPayload.newValue.section_keys).toContain('pricingRates');
    expect(auditPayload.newValue.section_keys).toContain('pricingLines');
  });

  // ── A3 (batch-2 row 2.5) ────────────────────────────────────────────────────
  // RED today: `areaField` is a structural line field that .strict() must
  // REFUSE — today the payload schema strips unknowns, so this PUT returns 200
  // and writes to the DB. Spec 124 R-AU / plan Fold A5.
  it('A3: PUT with a structural line key → 400 naming the key; no DB work, no audit', async () => {
    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pricingLines: [{ id: 'kitchen', areaField: 'gfa_sqm' }] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('areaField');
    // Validation precedes the audit and the transaction (route order).
    expect(mockWriteAdminAudit).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  // ── A4 (batch-2 row 2.5) ────────────────────────────────────────────────────
  // Replay: both pricing rows already match, so the IS DISTINCT FROM guard
  // matches nothing (rowCount 0) and updated_at is NOT bumped.
  // RED today: stripped payload → these sections never reach the DB at all.
  it('A4: replayed identical pricing PUT updates 0 rows for those sections', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (/UPDATE archetype_cost_rates|UPDATE parcel_cost_lines/.test(String(sql))) {
        return { rowCount: 0 };
      }
      return { rowCount: 0 };
    });

    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({
        pricingRates: [{ archetype: 'KIT', costPerSqm: 1300 }],
        pricingLines: [{ id: 'kitchen', baseConfidence: 'low' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = (await response.json()) as { data: { rows_updated: number } };

    expect(response.status).toBe(200);
    expect(body.data.rows_updated).toBe(0);
    // The statements WERE issued (guarded), they just matched nothing.
    const updates = mockClient.query.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => /^UPDATE /.test(s.trim()));
    expect(updates.filter((s) => /archetype_cost_rates/.test(s))).toHaveLength(1);
    expect(updates.filter((s) => /parcel_cost_lines/.test(s))).toHaveLength(1);
  });

  // ── A5 (batch-2 row 2.5) ────────────────────────────────────────────────────
  // The lines UPDATE throws → the whole pricing apply rolls back.
  // RED today: the section is stripped, so nothing throws and the route 200s.
  it('A5: lines UPDATE failure → ROLLBACK, 500, logError once', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (/UPDATE parcel_cost_lines/.test(String(sql))) {
        throw new Error('parcel_cost_lines write failed');
      }
      return { rowCount: 1 };
    });

    const { PUT } = await import('@/app/api/admin/control-panel/configs/route');
    const req = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({
        pricingRates: [{ archetype: 'KIT', costPerSqm: 1300 }],
        pricingLines: [{ id: 'kitchen', baseConfidence: 'low' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PUT(req as never);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBeTruthy();
    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]).trim());
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/control-panel/resync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with step list on success', async () => {
    const { POST } = await import('@/app/api/admin/control-panel/resync/route');
    const response = await POST(mockPostRequest());
    const body = await response.json() as { meta: { steps: string[] } };

    expect(response.status).toBe(200);
    expect(body.meta.steps).toBeDefined();
    expect(Array.isArray(body.meta.steps)).toBe(true);
  });
});
