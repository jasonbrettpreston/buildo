// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §2 + §6
//
// UI tests for <ParcelCostTool>: the four states (idle/loading/error/parcel), the miss +
// candidates flows, the NORMATIVE 3-tier order, the absent-vs-fits:false badge distinction,
// the warnings notice, accordion expand telemetry, and a 375px render smoke.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockUseParcelLookup = vi.fn();
const mockCaptureEvent = vi.fn();

vi.mock('@/features/admin-flight-center/api/useParcelLookup', () => {
  class ParcelLookupError extends Error {
    code: string;
    status: number | null;
    serverMessage: string | null;
    constructor(code: string, message: string, opts: { status?: number | null; serverMessage?: string | null } = {}) {
      super(message);
      this.code = code;
      this.status = opts.status ?? null;
      this.serverMessage = opts.serverMessage ?? null;
    }
  }
  return { useParcelLookup: (...a: unknown[]) => mockUseParcelLookup(...a), ParcelLookupError };
});
vi.mock('@/lib/observability/capture', () => ({ captureEvent: (...a: unknown[]) => mockCaptureEvent(...a) }));

import { ParcelCostTool } from '@/components/admin/ParcelCostTool';
import { GROUP_KEYS } from '@/app/api/admin/parcels/lookup/types';

beforeEach(() => {
  mockUseParcelLookup.mockReset();
  mockCaptureEvent.mockReset();
});

const idle = { data: undefined, isLoading: false, isError: false, error: null };

function payload() {
  const groups = Object.fromEntries(
    GROUP_KEYS.map((g) => [g, { [`${g}_field`]: g === 'zoning' ? 'RD' : null }]),
  );
  return {
    match: { parcelId: '5147875', matchType: 'exact', address: '26 Hurlingham Cres' },
    candidates: [] as Array<{ parcelId: string; address: string }>,
    warnings: [] as string[],
    parcel: {
      costMenu: {
        menu: {
          _schema_version: 1,
          kitchen: { total: 45000, per_sqm: 3000, area: 15, area_confidence: 'high' },
          garden_suite: { total: 320000, per_sqm: 4000, area: 80, area_confidence: 'medium', fits: false },
          // NB: "gut" is deliberately ABSENT — must render as not-computable, NOT "doesn't fit".
        },
        scalars: { cost_fb_total: 1200000 },
      },
      areas: { lot_size_sqm: 495, opt_aor_gfa_sqm: 320 },
      neighbourhood: {
        summary: { headline: 'Testville: 44 new builds; CoA 90% approval.', basis: 'neighbourhood' },
        coaProjects: [
          {
            applicationNumber: 'A123/26TEY', address: '10 Test St', status: 'Open', decision: null,
            decisionDate: null, hearingDate: '2026-08-01', description: 'Two-storey rear addition',
            projectType: 'addition', modeledGfaSqm: 85, estimatedCost: 400000,
          },
        ],
        comparableBuilds: [],
        compStats: {
          compCount: 7, compDominantBuild: 'new_build', compBuildRatioP50: 0.8, compFsiP50: 0.7,
          neighbourhoodId: 99, neighbourhoodCostPremium: 1.15,
        },
      },
      groups,
    },
  };
}

describe('<ParcelCostTool> states', () => {
  it('idle: prompt only, no results', () => {
    mockUseParcelLookup.mockReturnValue(idle);
    render(<ParcelCostTool />);
    expect(screen.getByText(/Enter an address/)).toBeTruthy();
  });

  it('loading skeleton after a submitted search', () => {
    mockUseParcelLookup.mockReturnValue({ ...idle, isLoading: true });
    render(<ParcelCostTool />);
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '26 Hurlingham Cres' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(mockCaptureEvent).toHaveBeenCalledWith('admin_parcel_lookup_searched', expect.anything());
  });

  it('too-short input → inline validation, no query submitted', () => {
    mockUseParcelLookup.mockReturnValue(idle);
    render(<ParcelCostTool />);
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText(/at least 3 characters/)).toBeTruthy();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it('error state renders the typed panel', () => {
    mockUseParcelLookup.mockReturnValue({ ...idle, isError: true, error: new Error('boom') });
    render(<ParcelCostTool />);
    expect(screen.getByRole('alert').textContent).toContain('Lookup failed');
  });

  it('miss: "no parcel found"', () => {
    mockUseParcelLookup.mockReturnValue({ ...idle, data: { match: null, candidates: [], warnings: [], parcel: null } });
    render(<ParcelCostTool />);
    expect(screen.getByText(/No parcel found/)).toBeTruthy();
  });

  it('candidates: list renders; click re-queries by parcelId (never by re-parsed text)', () => {
    mockUseParcelLookup.mockReturnValue({
      ...idle,
      data: {
        match: null, warnings: [], parcel: null,
        candidates: [{ parcelId: 'P1', address: '26 Hurlingham Cres' }, { parcelId: 'P2', address: '26A Hurlingham Cres' }],
      },
    });
    render(<ParcelCostTool />);
    fireEvent.click(screen.getByText(/26A Hurlingham Cres/));
    const lastArgs = mockUseParcelLookup.mock.calls.at(-1)![0] as { parcelId: string | null };
    expect(lastArgs.parcelId).toBe('P2');
  });
});

describe('<ParcelCostTool> parcel view (the NORMATIVE 3 tiers)', () => {
  beforeEach(() => mockUseParcelLookup.mockReturnValue({ ...idle, data: payload() }));

  it('tier order: cost menu → neighbourhood → all-fields', () => {
    render(<ParcelCostTool />);
    const html = document.body.innerHTML;
    const i1 = html.indexOf('Renovation cost menu');
    const i2 = html.indexOf('happening in the neighbourhood');
    const i3 = html.indexOf('All fields');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it('absent-vs-fits:false rendered DISTINCTLY: fits:false badge vs an explicit n/a row (Spec 89 §2.3)', () => {
    render(<ParcelCostTool />);
    expect(screen.getByText('doesn’t fit')).toBeTruthy();          // fits:false → amber badge
    expect(screen.getByText('Gut renovation')).toBeTruthy();       // ABSENT line → explicit n/a row
    expect(screen.getAllByText(/n\/a — not computable/).length).toBeGreaterThan(0);
    expect(screen.getByText('Kitchen')).toBeTruthy();              // computed line renders values
  });

  it('the 12 cost scalars render even alongside the menu (Tier 1 contract)', () => {
    render(<ParcelCostTool />);
    expect(screen.getByText('fb total')).toBeTruthy();             // cost_fb_total → prettified label
    expect(screen.getByText('$1,200,000')).toBeTruthy();
  });

  it('cost scalars still render when the per-line menu is null', () => {
    const p = payload();
    (p.parcel.costMenu as { menu: unknown }).menu = null;
    mockUseParcelLookup.mockReturnValue({ ...idle, data: p });
    render(<ParcelCostTool />);
    expect(screen.getByText(/Cost menu not yet computed/)).toBeTruthy();
    expect(screen.getByText('$1,200,000')).toBeTruthy();           // scalars unaffected by null menu
  });

  it('CoA projects table renders the specific applications', () => {
    render(<ParcelCostTool />);
    expect(screen.getByText('A123/26TEY')).toBeTruthy();
    expect(screen.getByText(/Two-storey rear addition/)).toBeTruthy();
  });

  it('all 9 groups render as collapsed accordions; expand fires captureEvent', () => {
    render(<ParcelCostTool />);
    const summaries = document.querySelectorAll('details > summary');
    expect(summaries.length).toBe(GROUP_KEYS.length);
    const details = summaries[0]!.parentElement as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: false }));
    expect(mockCaptureEvent).toHaveBeenCalledWith('admin_parcel_group_expanded', expect.anything());
  });

  it('warnings notice renders when a tier degraded', () => {
    const p = payload();
    p.warnings = ['cost menu unavailable (data shape drift — logged)'];
    mockUseParcelLookup.mockReturnValue({ ...idle, data: p });
    render(<ParcelCostTool />);
    expect(screen.getByText(/Data partially unavailable/)).toBeTruthy();
  });

  it('375px smoke: renders without crashing at mobile width', () => {
    (window as unknown as { innerWidth: number }).innerWidth = 375;
    window.dispatchEvent(new Event('resize'));
    render(<ParcelCostTool />);
    expect(screen.getByText('Parcel Cost Model Tool')).toBeTruthy();
  });
});

describe('<ParcelCostTool> tier-degradation null-guards (Spec 89 §2.4 crash-proofing)', () => {
  it('null scalars: no crash; scalars section absent or shows fallback', () => {
    const p = payload();
    (p.parcel.costMenu as { scalars: unknown }).scalars = null;
    mockUseParcelLookup.mockReturnValue({ ...idle, data: p });
    expect(() => render(<ParcelCostTool />)).not.toThrow();
    // no $1,200,000 scalar value visible (was from scalars)
    expect(screen.queryByText('$1,200,000')).toBeNull();
  });

  it('null coaProjects: no crash; "No CoA applications" shown', () => {
    const p = payload();
    (p.parcel.neighbourhood as { coaProjects: unknown }).coaProjects = null;
    mockUseParcelLookup.mockReturnValue({ ...idle, data: p });
    expect(() => render(<ParcelCostTool />)).not.toThrow();
    expect(screen.getByText(/No CoA applications/)).toBeTruthy();
  });

  it('loading state: does NOT render previous parcel data during a new lookup', () => {
    // First render: show a parcel
    mockUseParcelLookup.mockReturnValue({ ...idle, data: payload() });
    const { rerender } = render(<ParcelCostTool />);

    // Submit a search to set submittedQ (so the loading skeleton gate is satisfied)
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '26 Hurlingham Cres' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    // Parcel heading is visible while not loading
    expect(screen.getByText('26 Hurlingham Cres')).toBeTruthy();

    // Re-render with isLoading=true (new search in flight) — stale data should be hidden
    mockUseParcelLookup.mockReturnValue({ ...idle, data: payload(), isLoading: true });
    rerender(<ParcelCostTool />);
    expect(screen.queryByText('26 Hurlingham Cres')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
  });

  it('fits===undefined renders an honest unknown badge (not silently suppressed)', () => {
    const p = payload();
    // Add a line with fits explicitly undefined (absent key means undefined)
    (p.parcel.costMenu.menu as Record<string, unknown>)['basement'] = { total: 50000, per_sqm: 1000, area: 50 };
    mockUseParcelLookup.mockReturnValue({ ...idle, data: p });
    render(<ParcelCostTool />);
    // Should show "?" for the fits column on lines where fits is undefined
    expect(screen.queryAllByText('?').length).toBeGreaterThan(0);
  });
});
