// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.3
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// RTL test for the <HealthTile> component. Spec 30 §2.3 mandates three
// render states (loading / ok / unavailable). This test exercises each
// state-discriminated render path; data flow + polling is owned by the
// page (/admin/app-health) and not covered here (Spec 34 §3 Playwright
// is the authority for end-to-end behavior).
//
// Assertion style: `.toBeDefined()` / `.toBeNull()` — matches the rest
// of the project's RTL suite (jest-dom matchers are not loaded globally).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { HealthTile } from '@/components/admin/HealthTile';
import type { TileResult } from '@/lib/admin/healthSchema';

interface SampleOk {
  value: number;
  link: string;
}

const renderOkSample = (p: SampleOk) => (
  <div>
    <div data-testid="primary">{p.value}</div>
    <a data-testid="link" href={p.link}>
      View →
    </a>
  </div>
);

describe('<HealthTile> — Spec 30 §2.3 three render states', () => {
  it('renders loading skeleton when state is null', () => {
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={null}
        renderOk={renderOkSample}
      />,
    );
    expect(screen.getByTestId('health-tile-loading')).toBeDefined();
    expect(screen.getByText('Sample Tile')).toBeDefined();
    expect(screen.getByText('24h')).toBeDefined();
    // Loading state MUST NOT call renderOk — payload not yet available.
    expect(screen.queryByTestId('primary')).toBeNull();
    expect(screen.queryByTestId('link')).toBeNull();
  });

  it('renders ok state with payload via renderOk callback', () => {
    const okState: TileResult<SampleOk> = {
      status: 'ok',
      payload: { value: 42, link: 'https://example.test/' },
    };
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={okState}
        renderOk={renderOkSample}
      />,
    );
    expect(screen.getByTestId('health-tile-ok')).toBeDefined();
    expect(screen.getByText('Sample Tile')).toBeDefined();
    expect(screen.getByTestId('primary').textContent).toBe('42');
    expect(screen.getByTestId('link').getAttribute('href')).toBe(
      'https://example.test/',
    );
  });

  it('renders unavailable state with reason label', () => {
    const unavailable: TileResult<SampleOk> = {
      status: 'unavailable',
      reason: 'rate_limited',
    };
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={unavailable}
        renderOk={renderOkSample}
      />,
    );
    expect(screen.getByTestId('health-tile-unavailable')).toBeDefined();
    expect(screen.getByText('Sample Tile')).toBeDefined();
    // Default reason mapping: rate_limited → "Rate-limited (back off)"
    expect(screen.getByText(/rate-limited/i)).toBeDefined();
    // Em-dash placeholder for the missing primary metric.
    expect(screen.getByText('—')).toBeDefined();
    // renderOk MUST NOT be called when unavailable.
    expect(screen.queryByTestId('primary')).toBeNull();
  });

  it('falls back to raw reason string when reason is not in the default map', () => {
    const unavailable: TileResult<SampleOk> = {
      status: 'unavailable',
      reason: 'custom_unmapped_reason',
    };
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={unavailable}
        renderOk={renderOkSample}
      />,
    );
    // Raw reason is shown verbatim when no label is mapped.
    expect(screen.getByText('custom_unmapped_reason')).toBeDefined();
  });

  it('honors caller-supplied reasonLabels override', () => {
    const unavailable: TileResult<SampleOk> = {
      status: 'unavailable',
      reason: 'env_missing',
    };
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={unavailable}
        renderOk={renderOkSample}
        reasonLabels={{ env_missing: 'Add SENTRY_API_TOKEN to env' }}
      />,
    );
    expect(screen.getByText('Add SENTRY_API_TOKEN to env')).toBeDefined();
    // Default mapping ("Not configured") is overridden, not appended.
    expect(screen.queryByText('Not configured')).toBeNull();
  });

  it('exposes raw reason via title attribute for tooltip-on-hover debugging', () => {
    const unavailable: TileResult<SampleOk> = {
      status: 'unavailable',
      reason: 'aggregator_threw',
    };
    render(
      <HealthTile<SampleOk>
        title="Sample Tile"
        window="24h"
        state={unavailable}
        renderOk={renderOkSample}
      />,
    );
    // Friendly label shown; raw reason on title attribute (operator
    // hovers to see the raw machine-readable reason for debugging).
    const friendlyLabel = screen.getByText(/internal error/i);
    expect(friendlyLabel.getAttribute('title')).toBe('aggregator_threw');
  });
});
