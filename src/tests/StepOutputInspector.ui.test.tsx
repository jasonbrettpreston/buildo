// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// UI tests for <StepOutputInspector>: idle / loading / error / result states, the deep-link
// present-vs-omitted logic, the filterable-only dropdown, and pagination affordances.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockUseStepOutput = vi.fn();

vi.mock('@/features/admin-flight-center/api/useStepOutput', () => {
  class StepOutputError extends Error {
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
  return { useStepOutput: (...a: unknown[]) => mockUseStepOutput(...a), StepOutputError };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...p }, children),
}));

import { StepOutputInspector } from '@/components/admin/StepOutputInspector';

beforeEach(() => mockUseStepOutput.mockReset());

const DATA = {
  columns: ['permit_num', 'revision_num', 'trade_id'],
  filterableColumns: ['permit_num', 'trade_id'], // revision_num intentionally NOT filterable
  rows: [
    { permit_num: '23-1-BLD', revision_num: '00', trade_id: 8 }, // → deep-link
    { permit_num: null, revision_num: null, trade_id: null },    // → no lead identity, omit link
  ],
  total: 1124556,
  approxTotal: true,
};

describe('<StepOutputInspector>', () => {
  it('idle when no slug', () => {
    mockUseStepOutput.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    render(<StepOutputInspector />);
    expect(screen.getByTestId('step-output-idle')).toBeTruthy();
  });

  it('loading state', () => {
    mockUseStepOutput.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<StepOutputInspector initialSlug="classify_permits" />);
    expect(screen.getByTestId('step-output-loading')).toBeTruthy();
  });

  it('NOT_FOUND error → friendly message', async () => {
    const { StepOutputError } = await import('@/features/admin-flight-center/api/useStepOutput');
    mockUseStepOutput.mockReturnValue({ isLoading: false, isError: true, error: new StepOutputError('NOT_FOUND', 'x') });
    render(<StepOutputInspector initialSlug="assert_schema" />);
    expect(screen.getByTestId('step-output-error').textContent).toMatch(/no inspectable output table/i);
  });

  it('renders rows + column headers; deep-link present only for rows with a lead identity', () => {
    mockUseStepOutput.mockReturnValue({ isLoading: false, isError: false, data: DATA });
    render(<StepOutputInspector initialSlug="classify_permits" />);
    expect(screen.getByTestId('step-output-inspector')).toBeTruthy();
    // column headers (a name may also appear as a filter option, so allow ≥1 match)
    for (const c of DATA.columns) expect(screen.getAllByText(c).length).toBeGreaterThan(0);
    // exactly one deep-link (row 1 has permit_num; row 2 does not)
    const links = screen.getAllByTitle('Inspect this record');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toContain('inspector?id=23-1-BLD--00');
  });

  it('filter dropdown lists ONLY filterable columns (no geometry/non-text)', () => {
    mockUseStepOutput.mockReturnValue({ isLoading: false, isError: false, data: DATA });
    render(<StepOutputInspector initialSlug="classify_permits" />);
    expect(screen.queryByRole('option', { name: 'permit_num' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'trade_id' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'revision_num' })).toBeNull(); // not filterable
  });

  it('pagination: shows approx total, Prev disabled at offset 0', () => {
    mockUseStepOutput.mockReturnValue({ isLoading: false, isError: false, data: DATA });
    render(<StepOutputInspector initialSlug="classify_permits" />);
    expect(screen.getByText(/~1,124,556 \(approx\)/)).toBeTruthy();
    const prev = screen.getByText('← Prev') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });
});
