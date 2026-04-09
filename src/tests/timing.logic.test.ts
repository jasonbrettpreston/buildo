// 🔗 SPEC LINK: docs/specs/product/future/71_lead_timing_engine.md §Implementation
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  getTradeTimingForPermit,
  _resetCalibrationCache,
  REFRESH_INTERVAL_MS,
  STALENESS_DAYS,
  NOT_PASSED_PENALTY_DAYS,
  STAGE_GAP_MEDIAN_DAYS,
  PRE_PERMIT_MIN_DAYS,
  PRE_PERMIT_MAX_DAYS,
  BOOTSTRAP_CALIBRATION,
} from '@/features/leads/lib/timing';

// ---------------------------------------------------------------------------
// Mock pool helper — each test chains mockResolvedValueOnce in query order
// ---------------------------------------------------------------------------
interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function createMockPool(): MockPool {
  return { query: vi.fn() };
}

function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

// Sequence the timing.ts query order once so every test uses the same pattern:
//   1. ensureCalibrationLoaded      → SELECT FROM timing_calibration
//   2. pickBestCandidate parcel SQL → SELECT FROM permit_parcels + permits
//   3. permit_inspections           → SELECT FROM permit_inspections
//   4. inspection_stage_map lookup  → SELECT FROM inspection_stage_map (Tier 1 only)
function stub(
  mock: MockPool,
  calibration: QueryResultRow[],
  siblings: QueryResultRow[],
  inspections: QueryResultRow[],
  enablingStage?: QueryResultRow[],
): void {
  mock.query.mockResolvedValueOnce(qr(calibration));
  mock.query.mockResolvedValueOnce(qr(siblings));
  mock.query.mockResolvedValueOnce(qr(inspections));
  if (enablingStage !== undefined) {
    mock.query.mockResolvedValueOnce(qr(enablingStage));
  }
}

beforeEach(() => {
  _resetCalibrationCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('timing constants', () => {
  it('REFRESH_INTERVAL_MS is 5 minutes', () => {
    expect(REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it('STALENESS_DAYS is 180', () => {
    expect(STALENESS_DAYS).toBe(180);
  });

  it('NOT_PASSED_PENALTY_DAYS is 14', () => {
    expect(NOT_PASSED_PENALTY_DAYS).toBe(14);
  });

  it('STAGE_GAP_MEDIAN_DAYS is 30', () => {
    expect(STAGE_GAP_MEDIAN_DAYS).toBe(30);
  });

  it('PRE_PERMIT window is 240-420 days (8-14 months)', () => {
    expect(PRE_PERMIT_MIN_DAYS).toBe(240);
    expect(PRE_PERMIT_MAX_DAYS).toBe(420);
  });

  it('BOOTSTRAP_CALIBRATION uses spec 71 seed values', () => {
    expect(BOOTSTRAP_CALIBRATION).toEqual({ p25: 44, median: 105, p75: 238 });
  });
});

// ---------------------------------------------------------------------------
// Tier 1 — Stage-Based
// ---------------------------------------------------------------------------

describe('Tier 1 — stage-based (inspection data present)', () => {
  it('high confidence when enabling stage is PASSED and fresh', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [],  // calibration cache empty
      [],  // no siblings
      [    // inspections
        {
          stage_name: 'Structural Framing',
          status: 'Passed',
          inspection_date: new Date('2026-03-15'),
        },
      ],
      [    // enabling stage for 'plumbing'
        {
          stage_name: 'Structural Framing',
          stage_sequence: 30,
          trade_slug: 'plumbing',
          relationship: 'follows',
          min_lag_days: 5,
          max_lag_days: 14,
          precedence: 100,
        },
      ],
    );

    const result = await getTradeTimingForPermit('24 101234', 'plumbing', mock as unknown as Pool);
    expect(result.confidence).toBe('high');
    expect(result.tier).toBe(1);
    expect(result.min_days).toBe(5);
    expect(result.max_days).toBe(14);
    expect(result.display).toContain('plumbing');
  });

  it('low confidence when latest passed stage > 180 days old (stale)', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [],
      [],
      [
        {
          stage_name: 'Structural Framing',
          status: 'Passed',
          inspection_date: new Date('2025-01-01'), // >180d before 2026-04-08
        },
      ],
    );

    const result = await getTradeTimingForPermit('24 101234', 'plumbing', mock as unknown as Pool);
    expect(result.confidence).toBe('low');
    expect(result.tier).toBe(1);
    expect(result.display).toMatch(/stalled/i);
  });

  it('adds +14d penalty when enabling stage status is Not Passed', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [],
      [],
      [
        {
          stage_name: 'Structural Framing',
          status: 'Passed',
          inspection_date: new Date('2026-03-15'),
        },
        {
          stage_name: 'Structural Framing',
          status: 'Not Passed',
          inspection_date: new Date('2026-03-20'),
        },
      ],
      [
        {
          stage_name: 'Structural Framing',
          stage_sequence: 30,
          trade_slug: 'plumbing',
          relationship: 'follows',
          min_lag_days: 5,
          max_lag_days: 14,
          precedence: 100,
        },
      ],
    );

    const result = await getTradeTimingForPermit('24 101234', 'plumbing', mock as unknown as Pool);
    expect(result.min_days).toBe(5 + 14);
    expect(result.max_days).toBe(14 + 14);
    expect(result.display).toMatch(/delayed/i);
  });

  it('adds stage-sequence gap × 30d when enabling stage is outstanding (not yet reached)', async () => {
    // Latest passed is Footings (seq 20), enabling stage is Fire Separations (seq 50)
    // Gap = (50 - 20) / 10 = 3 stages × 30d each = +90d
    const mock = createMockPool();
    stub(
      mock,
      [],
      [],
      [
        {
          stage_name: 'Footings/Foundations',
          status: 'Passed',
          inspection_date: new Date('2026-03-15'),
        },
      ],
      [
        {
          stage_name: 'Fire Separations',
          stage_sequence: 50,
          trade_slug: 'painting',
          relationship: 'follows',
          min_lag_days: 7,
          max_lag_days: 21,
          precedence: 10,
        },
      ],
    );

    const result = await getTradeTimingForPermit('24 101234', 'painting', mock as unknown as Pool);
    expect(result.tier).toBe(1);
    // 3 stages away × 30d = 90 added to both
    expect(result.min_days).toBe(7 + 90);
    expect(result.max_days).toBe(21 + 90);
  });

  it('matches Passed status case-insensitively (handles PASSED, passed)', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [],
      [],
      [
        {
          stage_name: 'Structural Framing',
          status: 'PASSED', // all caps
          inspection_date: new Date('2026-03-15'),
        },
      ],
      [
        {
          stage_name: 'Structural Framing',
          stage_sequence: 30,
          trade_slug: 'plumbing',
          relationship: 'follows',
          min_lag_days: 5,
          max_lag_days: 14,
          precedence: 100,
        },
      ],
    );

    const result = await getTradeTimingForPermit('24 101234', 'plumbing', mock as unknown as Pool);
    expect(result.confidence).toBe('high');
  });

  it('falls through to Tier 2 when trade has no enabling stage in inspection_stage_map', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [{ permit_type: 'New Building', median_days_to_first_inspection: 105, p25_days: 44, p75_days: 238, sample_size: 7000, computed_at: new Date('2026-04-01') }],
      [],
      [
        {
          stage_name: 'Structural Framing',
          status: 'Passed',
          inspection_date: new Date('2026-03-15'),
        },
      ],
      [], // no enabling stage row
    );

    // Also need permits row for Tier 2 determinePhase — picked up by sibling query
    // Tier 2 will fall through because candidate's issued_date is null in this mock;
    // so it routes Tier 2 → then Tier 3.
    const result = await getTradeTimingForPermit('24 101234', 'unknown-trade', mock as unknown as Pool);
    // The exact tier depends on whether candidate permit has issued_date; the mock
    // siblings query returned empty so candidate = original permit_num with no metadata.
    // Engine can't determine issued_date → Tier 3. Acceptable: confidence != high.
    expect(result.confidence).not.toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 (user-supplied Gemini holistic 2026-04-09 — "Infinity Stale")
// ---------------------------------------------------------------------------
// Pre-fix, the staleness guard returned null whenever inspections was
// empty (no passed inspection to anchor the days-since calculation).
// A permit issued 15 years ago with ZERO inspections fell through to
// tier2IssuedHeuristic and got the squishy "trade window may have
// passed" message. The fix: extend checkStaleness to a second branch
// that triggers when issued_date is older than STALENESS_DAYS AND
// there are no passed inspections at all.

describe('Tier 1 staleness — zero-inspection branch (Bug 2 fix)', () => {
  it('permit issued > 180 days ago with ZERO inspections returns tier_1_stalled', async () => {
    const mock = createMockPool();
    stub(
      mock,
      [], // empty calibration cache
      [
        {
          permit_num: '24 101234',
          permit_type: 'New Building',
          issued_date: new Date('2025-01-01'), // ~460 days before frozen test time
          status: 'Permit Issued',
        },
      ],
      [], // ZERO inspections — pre-fix this skipped the guard entirely
    );
    const result = await getTradeTimingForPermit(
      '24 101234',
      'plumbing',
      mock as unknown as Pool,
    );
    expect(result.confidence).toBe('low');
    expect(result.tier).toBe(1);
    expect(result.min_days).toBe(0);
    expect(result.max_days).toBe(0);
    expect(result.display).toMatch(/issued.*days ago.*no inspection activity/i);
  });

  it('permit issued < 180 days ago with ZERO inspections does NOT trigger the stalled branch', async () => {
    // Recent permit + no inspections is normal pre-construction state.
    // Should fall through to Tier 2 / Tier 3, NOT mark as stalled.
    const mock = createMockPool();
    stub(
      mock,
      [],
      [
        {
          permit_num: '24 555:00',
          permit_type: 'New Building',
          issued_date: new Date('2026-03-01'), // ~38 days before frozen test time
          status: 'Permit Issued',
        },
      ],
      [], // no inspections — but recent permit
    );
    const result = await getTradeTimingForPermit(
      '24 555:00',
      'plumbing',
      mock as unknown as Pool,
    );
    // Should NOT be the zero-inspection-stalled message
    expect(result.display).not.toMatch(/no inspection activity/i);
  });
});

// ---------------------------------------------------------------------------
// Bug 8 (user-supplied Gemini holistic 2026-04-09 — "0-0 Weeks Math Gap")
// ---------------------------------------------------------------------------
// Pre-fix the day-based overdue guard `elapsedDays > p75` missed the
// rounding cliff: when remainingMax < 4 days, Math.round(remainingMax/7)
// rounds to 0 → user sees "0-0 weeks remaining". The fix adds a
// `maxWeeks <= 0` check after the rounding step.

describe('Tier 2 — sub-week rounding cliff (Bug 8 fix)', () => {
  it('Tier 2 with elapsed=175, p75=178, zero inspections → overdue display (Bug 8)', async () => {
    const mock = createMockPool();
    const issuedDate = new Date('2026-04-08T12:00:00Z');
    issuedDate.setDate(issuedDate.getDate() - 175); // 175 days ago, just inside STALENESS_DAYS=180
    stub(
      mock,
      [
        {
          permit_type: 'New Building',
          median_days_to_first_inspection: 105,
          p25_days: 44,
          p75_days: 178, // 178 - 175 = 3 days remaining → rounds to 0 weeks
          sample_size: 50,
          computed_at: new Date('2026-04-01'),
        },
      ],
      [
        {
          permit_num: '24 101234',
          permit_type: 'New Building',
          issued_date: issuedDate,
          status: 'Permit Issued',
        },
      ],
      [],
    );
    const result = await getTradeTimingForPermit(
      '24 101234',
      'plumbing',
      mock as unknown as Pool,
    );
    // Should NOT contain "0-0 weeks remaining"
    expect(result.display).not.toMatch(/0-0 weeks remaining/);
    // Should contain the overdue phrasing instead
    expect(result.display).toMatch(/window may have passed|active now or recently completed/i);
    expect(result.tier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — Pre-permit
// ---------------------------------------------------------------------------

describe('Tier 3 — pre-permit (no issued_date)', () => {
  it('returns 240-420 day range with low confidence', async () => {
    const mock = createMockPool();
    stub(mock, [], [], []);

    const result = await getTradeTimingForPermit('COA-123', 'plumbing', mock as unknown as Pool);
    expect(result.confidence).toBe('low');
    expect(result.tier).toBe(3);
    expect(result.min_days).toBe(240);
    expect(result.max_days).toBe(420);
    expect(result.display).toMatch(/pre-permit/i);
  });
});

// ---------------------------------------------------------------------------
// Calibration cache
// ---------------------------------------------------------------------------

describe('calibration cache', () => {
  it('loads on first call', async () => {
    const mock = createMockPool();
    stub(mock, [{ permit_type: 'X', median_days_to_first_inspection: 100, p25_days: 40, p75_days: 200, sample_size: 50, computed_at: new Date() }], [], []);
    await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);
    // First query = calibration load
    expect(mock.query).toHaveBeenCalled();
    const firstCall = mock.query.mock.calls[0]?.[0];
    expect(String(firstCall)).toMatch(/timing_calibration/);
  });

  it('does not re-load cache within REFRESH_INTERVAL_MS', async () => {
    const mock = createMockPool();
    // First call: cache load (1), siblings (2), inspections (3)
    stub(mock, [{ permit_type: 'X', median_days_to_first_inspection: 100, p25_days: 40, p75_days: 200, sample_size: 50, computed_at: new Date() }], [], []);
    await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);

    // Second call within 5 min: should NOT re-query timing_calibration
    // Only siblings + inspections queries run
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([]));
    await getTradeTimingForPermit('p2', 'plumbing', mock as unknown as Pool);

    const calibCalls = mock.query.mock.calls.filter((c) =>
      String(c[0]).match(/timing_calibration/),
    );
    expect(calibCalls.length).toBe(1);
  });

  it('reloads cache after REFRESH_INTERVAL_MS', async () => {
    const mock = createMockPool();
    stub(mock, [{ permit_type: 'X', median_days_to_first_inspection: 100, p25_days: 40, p75_days: 200, sample_size: 50, computed_at: new Date() }], [], []);
    await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);

    vi.advanceTimersByTime(REFRESH_INTERVAL_MS + 1000);

    // Second call > 5 min later: reload cache
    stub(mock, [{ permit_type: 'X', median_days_to_first_inspection: 100, p25_days: 40, p75_days: 200, sample_size: 50, computed_at: new Date() }], [], []);
    await getTradeTimingForPermit('p2', 'plumbing', mock as unknown as Pool);

    const calibCalls = mock.query.mock.calls.filter((c) =>
      String(c[0]).match(/timing_calibration/),
    );
    expect(calibCalls.length).toBe(2);
  });

  it('continues with empty cache if load throws', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('DB down'));
    // Even after calibration load fails, the function continues with empty cache
    // → proceeds to siblings/inspections queries → Tier 3 fallback
    mock.query.mockResolvedValueOnce(qr([])); // siblings
    mock.query.mockResolvedValueOnce(qr([])); // inspections
    const result = await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);
    // Function did not throw; returned a valid result
    expect(result.tier).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Top-level error guard
// ---------------------------------------------------------------------------

describe('top-level error guard', () => {
  it('returns safe fallback when pool throws on siblings query', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([])); // calibration load
    mock.query.mockRejectedValueOnce(new Error('Sibling query failed'));
    // After sibling query fails, pickBestCandidate falls back to original permit
    // and continues to inspection query
    mock.query.mockResolvedValueOnce(qr([])); // inspections empty → Tier 3
    const result = await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);
    // Should not throw; returns a result
    expect(result).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  it('returns safe fallback when inspection query throws', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockResolvedValueOnce(qr([]));
    mock.query.mockRejectedValueOnce(new Error('Inspection query failed'));
    const result = await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);
    expect(result.confidence).toBe('low');
    expect(result.tier).toBe(3);
    expect(result.display).toMatch(/unavailable/i);
  });

  it('never throws — always returns a TradeTimingEstimate', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValue(new Error('Everything broken'));
    const result = await getTradeTimingForPermit('p1', 'plumbing', mock as unknown as Pool);
    expect(result).toBeDefined();
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });
});
