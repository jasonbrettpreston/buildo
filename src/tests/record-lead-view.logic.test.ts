// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { buildLeadKey, recordLeadView } from '@/features/leads/lib/record-lead-view';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function createMockPool(): MockPool {
  return { query: vi.fn() };
}

function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildLeadKey — deterministic format from spec 70 §Database Schema
// ---------------------------------------------------------------------------

describe('buildLeadKey', () => {
  it('formats permit lead as permit:{permit_num}:{revision_num}', () => {
    expect(
      buildLeadKey({
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      }),
    ).toBe('permit:24 101234:01');
  });

  it('formats builder lead as builder:{entity_id}', () => {
    expect(
      buildLeadKey({
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
        entity_id: 9183,
      }),
    ).toBe('builder:9183');
  });

  it('produces disjoint keys: permit IDs always contain `:`, builder IDs never do (after the prefix)', () => {
    const permitKey = buildLeadKey({
      user_id: 'u1',
      trade_slug: 'plumbing',
      action: 'view',
      lead_type: 'permit',
      permit_num: '24 101234',
      revision_num: '01',
    });
    const builderKey = buildLeadKey({
      user_id: 'u1',
      trade_slug: 'plumbing',
      action: 'view',
      lead_type: 'builder',
      entity_id: 9183,
    });
    expect(permitKey.startsWith('permit:')).toBe(true);
    expect(builderKey.startsWith('builder:')).toBe(true);
    expect(permitKey).not.toBe(builderKey);
  });
});

// ---------------------------------------------------------------------------
// recordLeadView — DB upsert + competition count
// ---------------------------------------------------------------------------

describe('recordLeadView — function behaviour', () => {
  it('upserts a permit view and returns the competition_count', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([])); // upsert
    mock.query.mockResolvedValueOnce(qr([{ count: '7' }])); // count
    const result = await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    expect(result.ok).toBe(true);
    expect(result.competition_count).toBe(7);
  });

  it('builds INSERT params from permit branch with NULL entity_id', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const upsertParams = mock.query.mock.calls[0]?.[1];
    expect(upsertParams[0]).toBe('u1'); // user_id
    expect(upsertParams[1]).toBe('permit:24 101234:01'); // lead_key
    expect(upsertParams[2]).toBe('permit'); // lead_type
    expect(upsertParams[3]).toBe('24 101234'); // permit_num
    expect(upsertParams[4]).toBe('01'); // revision_num
    expect(upsertParams[5]).toBeNull(); // entity_id
    expect(upsertParams[6]).toBe('plumbing'); // trade_slug
  });

  it('builds INSERT params from builder branch with NULL permit cols', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
        entity_id: 9183,
      },
      mock as unknown as Pool,
    );
    const upsertParams = mock.query.mock.calls[0]?.[1];
    expect(upsertParams[1]).toBe('builder:9183'); // lead_key
    expect(upsertParams[2]).toBe('builder');
    expect(upsertParams[3]).toBeNull(); // permit_num
    expect(upsertParams[4]).toBeNull(); // revision_num
    expect(upsertParams[5]).toBe(9183);
  });

  it('action=save sets saved=true in the upsert', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'save',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const sql = mock.query.mock.calls[0]?.[0];
    const params = mock.query.mock.calls[0]?.[1];
    expect(String(sql)).toContain('saved = EXCLUDED.saved');
    expect(params[7]).toBe(true);
  });

  it('action=unsave sets saved=false in the upsert', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'unsave',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[7]).toBe(false);
  });

  it('save/unsave do NOT refresh viewed_at (spec 70 §4 — saves are private, must not inflate competition window)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'save',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const sql = String(mock.query.mock.calls[0]?.[0]);
    // The conflict branch must update `saved` only — NOT touch `viewed_at`.
    // Previously `SET viewed_at = NOW(), saved = EXCLUDED.saved` incorrectly
    // refreshed the competition window on every save/unsave click.
    const conflictClause = sql.split('DO UPDATE')[1] ?? '';
    expect(conflictClause).toContain('saved = EXCLUDED.saved');
    expect(conflictClause).not.toContain('viewed_at = NOW()');
  });

  it('action=view does NOT regress saved state — uses non-saved-touching upsert', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '0' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const sql = mock.query.mock.calls[0]?.[0];
    expect(String(sql)).not.toContain('saved = EXCLUDED.saved');
  });

  it('competition count query filters by 30-day window', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([{ count: '3' }]));
    await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    const countSql = mock.query.mock.calls[1]?.[0];
    expect(String(countSql)).toMatch(/COUNT\(DISTINCT user_id\)/);
    expect(String(countSql)).toMatch(/INTERVAL '30 days'/);
  });

  it('returns ok=false + competition_count=0 on pool error', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    expect(result.ok).toBe(false);
    expect(result.competition_count).toBe(0);
  });

  it('handles empty count result row gracefully', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([])); // empty count rows
    const result = await recordLeadView(
      {
        user_id: 'u1',
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      },
      mock as unknown as Pool,
    );
    expect(result.ok).toBe(true);
    expect(result.competition_count).toBe(0);
  });
});
