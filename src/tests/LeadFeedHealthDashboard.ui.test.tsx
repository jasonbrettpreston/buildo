// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §2.3
//
// LeadFeedHealthDashboard UI tests — admin lead feed observability dashboard.
// Tests cover all 4 sections: readiness gauge, cost/timing coverage,
// engagement panel, and test feed tool. Mobile (375px) + desktop viewports.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Tremor components — render as simple divs with data attributes
vi.mock('@tremor/react', () => ({
  ProgressCircle: ({ value, color, children, ...rest }: { value: number; color?: string; children?: React.ReactNode }) => (
    <div data-testid="progress-circle" data-value={value} data-color={color} {...rest}>
      {children}
    </div>
  ),
  BarList: ({ data, ...rest }: { data: Array<{ name: string; value: number }> }) => (
    <div data-testid="bar-list" {...rest}>
      {data.map((d) => (
        <div key={d.name} data-testid={`bar-item-${d.name}`} data-value={d.value}>
          {d.name}: {d.value}
        </div>
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { LeadFeedHealthResponse, TestFeedDebug } from '@/lib/admin/lead-feed-health';

function makeHealthResponse(overrides?: Partial<LeadFeedHealthResponse>): LeadFeedHealthResponse {
  return {
    readiness: {
      active_permits: 10000,
      permits_geocoded: 9500,
      permits_classified: 8800,
      permits_with_cost: 7200,
      timing_types_calibrated: 12,
      timing_freshness_hours: 6.5,
      feed_ready_pct: 68.4,
      builders_total: 5000,
      builders_with_contact: 3200,
      builders_wsib_verified: 1800,
    },
    cost_coverage: {
      total: 7200,
      from_permit: 4000,
      from_model: 2800,
      null_cost: 400,
      coverage_pct: 94.4,
    },
    engagement: {
      views_today: 45,
      views_7d: 320,
      saves_today: 12,
      saves_7d: 85,
      unique_users_7d: 18,
      avg_competition_per_lead: 2.3,
      top_trades: [
        { trade_slug: 'plumbing', views: 120, saves: 35 },
        { trade_slug: 'electrical', views: 95, saves: 28 },
        { trade_slug: 'hvac', views: 60, saves: 15 },
      ],
    },
    performance: {
      avg_latency_ms: null,
      p95_latency_ms: null,
      error_rate_pct: null,
      avg_results_per_query: null,
    },
    ...overrides,
  };
}

function makeTestFeedDebug(): TestFeedDebug {
  return {
    query_duration_ms: 142,
    permits_in_results: 8,
    builders_in_results: 3,
    score_distribution: {
      min: 22, max: 87, median: 55, p25: 38, p75: 72,
    },
    pillar_averages: {
      proximity: 7.2, timing: 5.8, value: 6.1, opportunity: 4.5,
    },
  };
}

// ---------------------------------------------------------------------------
// Fetch mock setup
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  // Default: health endpoint returns good data
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(makeHealthResponse()),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Lazy import — must come after mocks
// ---------------------------------------------------------------------------

async function renderDashboard() {
  const mod = await import('@/components/LeadFeedHealthDashboard');
  const { LeadFeedHealthDashboard } = mod;
  return render(<LeadFeedHealthDashboard />);
}

// ---------------------------------------------------------------------------
// Section 1: Feed Readiness Gauge
// ---------------------------------------------------------------------------

describe('Section 1 — Feed Readiness Gauge', () => {
  it('renders feed_ready_pct in the progress circle', async () => {
    await renderDashboard();
    await waitFor(() => {
      const circle = screen.getByTestId('progress-circle');
      expect(circle).toBeDefined();
      expect(circle.getAttribute('data-value')).toBe('68.4');
    });
  });

  it('shows YELLOW traffic light for 50-80% readiness', async () => {
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      expect(el.textContent).toContain('YELLOW');
    });
  });

  it('shows GREEN traffic light for >80% readiness', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          feed_ready_pct: 85.2,
          timing_freshness_hours: 6.5,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      expect(el.textContent).toContain('GREEN');
    });
  });

  it('shows RED traffic light for <50% readiness', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          feed_ready_pct: 35.0,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      expect(el.textContent).toContain('RED');
    });
  });

  it('shows YELLOW when timing is stale (>48h) even if pct is high', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          feed_ready_pct: 85.0,
          timing_freshness_hours: 72,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      // Stale timing forces YELLOW per spec: "YELLOW = 50-80% OR stale timing"
      expect(el.textContent).toContain('YELLOW');
    });
  });

  it('shows GREEN when timing_freshness_hours is null and pct > 80', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          feed_ready_pct: 85.0,
          timing_freshness_hours: null,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      // null timing = "never calibrated" treated as non-stale for traffic light
      expect(el.textContent).toContain('GREEN');
    });
  });

  it('shows RED traffic light when cost_coverage.total is 0', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          feed_ready_pct: 85.0,
        },
        cost_coverage: {
          total: 0,
          from_permit: 0,
          from_model: 0,
          null_cost: 0,
          coverage_pct: 0,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const el = screen.getByTestId('traffic-light');
      expect(el.textContent).toContain('RED');
    });
  });

  it('renders breakdown bar with geocoded/classified/cost segments', async () => {
    await renderDashboard();
    await waitFor(() => {
      const bar = screen.getByTestId('breakdown-bar');
      expect(bar).toBeDefined();
      // Check that all 3 breakdown labels exist
      expect(bar.textContent).toContain('Geocoded');
      expect(bar.textContent).toContain('Classified');
      expect(bar.textContent).toContain('Cost Estimated');
      expect(bar.textContent).toContain('9,500');
      expect(bar.textContent).toContain('8,800');
      expect(bar.textContent).toContain('7,200');
    });
  });

  it('renders builder readiness row', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/5,000/)).toBeDefined(); // total
      expect(screen.getByText(/3,200/)).toBeDefined(); // with contact
      expect(screen.getByText(/1,800/)).toBeDefined(); // wsib
    });
  });
});

// ---------------------------------------------------------------------------
// Section 2: Cost & Timing Coverage
// ---------------------------------------------------------------------------

describe('Section 2 — Cost & Timing Coverage', () => {
  it('shows cost source breakdown', async () => {
    await renderDashboard();
    await waitFor(() => {
      // Use getAllByText since "Permit" may appear multiple places, and check
      // the cost section contains the cost row labels and values
      const costSection = screen.getByText('Cost Coverage').closest('div')!;
      expect(costSection.textContent).toContain('Permit-Reported');
      expect(costSection.textContent).toContain('Model-Estimated');
      expect(costSection.textContent).toContain('4,000');
      expect(costSection.textContent).toContain('2,800');
    });
  });

  it('shows timing freshness badge green for <24h', async () => {
    await renderDashboard();
    await waitFor(() => {
      const badge = screen.getByTestId('timing-freshness-badge');
      expect(badge.className).toContain('green');
    });
  });

  it('shows timing freshness badge yellow for 24-48h', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          timing_freshness_hours: 30,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const badge = screen.getByTestId('timing-freshness-badge');
      expect(badge.className).toContain('yellow');
    });
  });

  it('shows timing freshness badge red for >48h', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        readiness: {
          ...makeHealthResponse().readiness,
          timing_freshness_hours: 72,
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      const badge = screen.getByTestId('timing-freshness-badge');
      expect(badge.className).toContain('red');
    });
  });

  it('shows timing calibration count', async () => {
    await renderDashboard();
    await waitFor(() => {
      const timingSection = screen.getByText('Timing Calibration').closest('div')!;
      expect(timingSection.textContent).toContain('12');
    });
  });
});

// ---------------------------------------------------------------------------
// Section 3: User Engagement
// ---------------------------------------------------------------------------

describe('Section 3 — User Engagement', () => {
  it('renders views and saves counts', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/45/)).toBeDefined();  // views_today
      expect(screen.getByText(/320/)).toBeDefined();  // views_7d
      expect(screen.getByText(/85/)).toBeDefined();   // saves_7d
    });
  });

  it('renders unique users count', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/18/)).toBeDefined(); // unique_users_7d
    });
  });

  it('renders trade breakdown with BarList', async () => {
    await renderDashboard();
    await waitFor(() => {
      const barList = screen.getByTestId('bar-list');
      expect(barList).toBeDefined();
      expect(screen.getByTestId('bar-item-plumbing')).toBeDefined();
      expect(screen.getByTestId('bar-item-electrical')).toBeDefined();
    });
  });

  it('handles zero engagement gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeHealthResponse({
        engagement: {
          views_today: 0,
          views_7d: 0,
          saves_today: 0,
          saves_7d: 0,
          unique_users_7d: 0,
          avg_competition_per_lead: 0,
          top_trades: [],
        },
      })),
    });
    await renderDashboard();
    await waitFor(() => {
      // Should render without crashing
      expect(screen.getByTestId('engagement-section')).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Section 4: Test Feed Tool
// ---------------------------------------------------------------------------

describe('Section 4 — Test Feed Tool', () => {
  it('renders form with default values', async () => {
    await renderDashboard();
    await waitFor(() => {
      const latInput = screen.getByLabelText(/Latitude/i) as HTMLInputElement;
      const lngInput = screen.getByLabelText(/Longitude/i) as HTMLInputElement;
      expect(latInput.value).toBe('43.6532');
      expect(lngInput.value).toBe('-79.3832');
    });
  });

  it('renders trade dropdown', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByLabelText(/Trade/i)).toBeDefined();
    });
  });

  it('renders radius slider', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByLabelText(/Radius/i)).toBeDefined();
    });
  });

  it('submits test feed request on button click', async () => {
    const testFeedResponse = {
      data: [{ lead_type: 'permit', relevance_score: 72, permit_num: 'P1', revision_num: 0 }],
      error: null,
      meta: { next_cursor: null, count: 1, radius_km: 10 },
      _debug: makeTestFeedDebug(),
    };

    // Route by URL: health endpoint vs test-feed endpoint
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('test-feed')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(testFeedResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeHealthResponse()) });
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Run Test/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Run Test/i));

    await waitFor(() => {
      const debugPanel = screen.getByTestId('debug-panel');
      expect(debugPanel.textContent).toContain('142'); // query_duration_ms
      expect(debugPanel.textContent).toContain('8');   // permits_in_results
    });
  });

  it('shows debug panel with score distribution', async () => {
    const testFeedResponse = {
      data: [],
      error: null,
      meta: { next_cursor: null, count: 0, radius_km: 10 },
      _debug: makeTestFeedDebug(),
    };

    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('test-feed')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(testFeedResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeHealthResponse()) });
    });

    await renderDashboard();
    await waitFor(() => screen.getByText(/Run Test/i));
    fireEvent.click(screen.getByText(/Run Test/i));

    await waitFor(() => {
      expect(screen.getByTestId('debug-panel')).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading / Error states
// ---------------------------------------------------------------------------

describe('Loading & Error states', () => {
  it('shows loading skeletons initially', async () => {
    // Never resolve the fetch
    fetchMock.mockReturnValue(new Promise(() => {}));
    await renderDashboard();
    expect(screen.getByTestId('dashboard-loading')).toBeDefined();
  });

  it('shows error state on fetch failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'DB down' }) });
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Viewport: Mobile (375px) + Desktop
// ---------------------------------------------------------------------------

describe('Responsive layout', () => {
  it('renders at 375px mobile width without crash', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('progress-circle')).toBeDefined();
    });
  });

  it('Run Test button has min touch target of 44px', async () => {
    await renderDashboard();
    await waitFor(() => {
      const btn = screen.getByText(/Run Test/i);
      expect(btn.className).toContain('min-h-[44px]');
    });
  });
});

// ---------------------------------------------------------------------------
// Polling behavior
// ---------------------------------------------------------------------------

describe('Polling', () => {
  it('calls health endpoint on mount and sets up interval', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    await renderDashboard();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // Verify a 10s interval was set up
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);
    setIntervalSpy.mockRestore();
  });
});
