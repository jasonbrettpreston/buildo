// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
//
// TestFeedTool UI tests — standalone admin PostGIS query tester.
// Tests cover form inputs, button interaction, loading state, error state,
// results display, and mobile viewport (375px).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
