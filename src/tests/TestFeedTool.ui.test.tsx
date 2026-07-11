// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
//
// TestFeedTool UI tests — standalone admin PostGIS query tester.
// Tests cover form inputs, button interaction, loading state, error state,
// results display, and mobile viewport (375px).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { TestFeedTool } from '@/components/admin/TestFeedTool';

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSuccessResponse() {
  return {
    data: [
      { lead_type: 'permit', permit_num: 'BP-001', relevance_score: 85 },
      { lead_type: 'permit', permit_num: 'BP-002', relevance_score: 72 },
    ],
    meta: { count: 2, radius_km: 10 },
    _debug: {
      query_duration_ms: 143,
      permits_in_results: 2,
      builders_in_results: 0,
      score_distribution: { min: 72, max: 85, median: 78, p25: 74, p75: 83 },
      pillar_averages: { proximity: 22, timing: 18, value: 14, opportunity: 16 },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestFeedTool — initial render', () => {
  it('renders the Run Test Query button', () => {
    render(<TestFeedTool />);
    expect(screen.getByRole('button', { name: /run test query/i })).toBeDefined();
  });

  it('renders lat/lng/trade/radius inputs', () => {
    render(<TestFeedTool />);
    expect(screen.getByLabelText(/latitude/i)).toBeDefined();
    expect(screen.getByLabelText(/longitude/i)).toBeDefined();
    expect(screen.getByLabelText(/trade/i)).toBeDefined();
    expect(screen.getByLabelText(/radius/i)).toBeDefined();
  });

  it('defaults lat to 43.6532 (Toronto)', () => {
    render(<TestFeedTool />);
    const lat = screen.getByLabelText(/latitude/i) as HTMLInputElement;
    expect(lat.value).toBe('43.6532');
  });

  it('defaults lng to -79.3832', () => {
    render(<TestFeedTool />);
    const lng = screen.getByLabelText(/longitude/i) as HTMLInputElement;
    expect(lng.value).toBe('-79.3832');
  });

  it('defaults trade to plumbing', () => {
    render(<TestFeedTool />);
    const trade = screen.getByLabelText(/trade/i) as HTMLSelectElement;
    expect(trade.value).toBe('plumbing');
  });

  it('button and inputs have min-h-[44px] touch targets', () => {
    const { container } = render(<TestFeedTool />);
    const button = container.querySelector('button');
    expect(button?.className).toContain('min-h-[44px]');
    const inputs = container.querySelectorAll('input[type="number"], select');
    inputs.forEach((el) => {
      expect(el.className).toContain('min-h-[44px]');
    });
  });
});

describe('TestFeedTool — mobile viewport (375px)', () => {
  it('renders form and button at 375px width', () => {
    render(<TestFeedTool />);
    expect(screen.getByLabelText(/latitude/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /run test query/i })).toBeDefined();
  });
});

describe('TestFeedTool — success flow', () => {
  it('disables button and shows "Running..." while fetching', async () => {
    let resolve: (v: unknown) => void = () => {};
    const pending = new Promise((r) => { resolve = r; });
    fetchMock.mockReturnValueOnce(pending);

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    const btn = screen.getByRole('button', { name: /running/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // resolve so the component can settle
    resolve({ ok: true, json: async () => makeSuccessResponse() });
  });

  it('renders debug panel after successful query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeSuccessResponse(),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByTestId('debug-panel')).toBeDefined();
    });
    expect(screen.getByText('143ms')).toBeDefined();
  });

  it('renders permit list with permit_num and relevance_score', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeSuccessResponse(),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByText(/BP-001/)).toBeDefined();
      expect(screen.getByText(/BP-002/)).toBeDefined();
    });
  });

  it('shows "No results" when data array is empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...makeSuccessResponse(),
        data: [],
        meta: { count: 0, radius_km: 10 },
      }),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeDefined();
    });
  });
});

describe('TestFeedTool — error states', () => {
  it('displays string error message from API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'PostGIS not installed' }),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByText(/PostGIS not installed/i)).toBeDefined();
    });
  });

  it('displays nested error.message from structured API error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: 'DEV_ENV_MISSING_POSTGIS', message: 'Install PostGIS first' },
      }),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByText(/Install PostGIS first/i)).toBeDefined();
    });
  });

  it('clears previous results when a new query is run', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeSuccessResponse(),
    });

    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.getByTestId('debug-panel')).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'DB error' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('debug-panel')).toBeNull();
      expect(screen.getByText(/DB error/i)).toBeDefined();
    });
  });
});

// ===========================================================================
// Feed Browser (Spec 76 §3.2, Phase 18) — lead_type axis, scoping statement,
// dense table, watchlist saved-state + save, inspect click-through.
// ===========================================================================

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

function browserResponse(
  data: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    data,
    meta: { count: data.length, radius_km: 10 },
    _debug: {
      query_duration_ms: 12,
      permits_in_results: data.filter((d) => d.lead_type === 'permit').length,
      builders_in_results: 0,
      score_distribution: null,
      pillar_averages: null,
    },
  };
}

/** Queue a feed response then a watchlist GET response for one runQuery. */
function queueQuery(
  feed: Record<string, unknown>,
  watchlistKeys: string[] = [],
) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => feed });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: watchlistKeys.map((lead_key) => ({ lead_key })) }),
  });
}

describe('TestFeedTool — Feed Browser lead_type axis', () => {
  it('renders a lead_type selector defaulting to "all"', () => {
    render(<TestFeedTool />);
    const sel = screen.getByLabelText(/lead type/i) as HTMLSelectElement;
    expect(sel.value).toBe('all');
  });

  it('sends the selected lead_type in the query string', async () => {
    queueQuery(browserResponse([]));
    render(<TestFeedTool />);
    fireEvent.change(screen.getByLabelText(/lead type/i), {
      target: { value: 'coa' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(firstUrl).toContain('lead_type=coa');
  });
});

describe('TestFeedTool — Feed Browser scoping + table', () => {
  it('states the single-trade + single-point scope explicitly', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'permit', lead_id: '20-101234:00', permit_num: '20-101234', revision_num: '00', relevance_score: 80 },
      ]),
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    await waitFor(() => {
      expect(screen.getByTestId('feed-browser-scope')).toBeDefined();
    });
    const scope = screen.getByTestId('feed-browser-scope');
    expect(scope.textContent).toMatch(/Viewing as/i);
    expect(scope.textContent).toContain('43.6532');
    expect(scope.textContent).toMatch(/single-trade/i);
  });

  it('renders a dense results table with a row per lead', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'permit', lead_id: '20-101234:00', permit_num: '20-101234', revision_num: '00', relevance_score: 80 },
        { lead_type: 'coa', lead_id: 'coa:A0001-2024', application_number: 'A0001-2024', relevance_score: 70 },
      ]),
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    await waitFor(() => {
      expect(screen.getByTestId('feed-browser-table')).toBeDefined();
    });
    expect(screen.getByTestId('feed-browser-row-0')).toBeDefined();
    expect(screen.getByTestId('feed-browser-row-1')).toBeDefined();
  });
});

describe('TestFeedTool — Feed Browser inspect click-through', () => {
  it('prepends permit: and links to the NUM--REV inspector segment', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'permit', lead_id: '20-101234:00', permit_num: '20-101234', revision_num: '00', relevance_score: 80 },
      ]),
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    const link = (await screen.findByTestId('feed-browser-inspect-0')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('id=20-101234--00');
  });

  it('passes CoA ids through to the COA- inspector segment', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'coa', lead_id: 'coa:A0001-2024', application_number: 'A0001-2024', relevance_score: 70 },
      ]),
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    const link = (await screen.findByTestId('feed-browser-inspect-0')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('id=COA-A0001-2024');
  });
});

describe('TestFeedTool — Feed Browser watchlist saved-state', () => {
  it('reads saved-state from admin_watchlist (shows ✓ Saved, no Save button)', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'permit', lead_id: '20-101234:00', permit_num: '20-101234', revision_num: '00', relevance_score: 80 },
      ]),
      ['permit:20-101234:00'],
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    await waitFor(() => {
      expect(screen.getByTestId('feed-browser-saved-0')).toBeDefined();
    });
    expect(screen.queryByTestId('feed-browser-save-0')).toBeNull();
  });

  it('POSTs to /api/admin/leads/watchlist and flips to Saved on click', async () => {
    queueQuery(
      browserResponse([
        { lead_type: 'permit', lead_id: '20-101234:00', permit_num: '20-101234', revision_num: '00', relevance_score: 80 },
      ]),
    );
    render(<TestFeedTool />);
    fireEvent.click(screen.getByRole('button', { name: /run test query/i }));
    const saveBtn = await screen.findByTestId('feed-browser-save-0');

    // POST watchlist response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { added: 1, skipped_existing: 0, failed: [] } }),
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('feed-browser-saved-0')).toBeDefined();
    });
    const postCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/admin/leads/watchlist') && c[1]?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.items[0]).toMatchObject({
      lead_type: 'permit',
      permit_num: '20-101234',
      revision_num: '00',
    });
    expect(toastSuccess).toHaveBeenCalled();
  });
});
