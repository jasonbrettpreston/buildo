// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/26_admin_dashboard.md §3.4 (engine health thresholds = the engine_health_* logic variables)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CG — ONE dead-tuple measurement, one threshold name)
//
// WF3 2026-10-14 (lane D3): the T6 engine badge coloured "Dead %" amber with a hard-coded 0.10. It must use the
// passed engine_health_dead_tuple_ratio_warn_max (resolved live by /api/quality), falling back to the seeded
// ENGINE_HEALTH_DEFAULTS only when none is passed. A live=0 / dead>0 table reads 100.0% (dead/(live+dead)) — kept.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TelemetrySection, type TelemetryData } from '@/components/funnel/FunnelPanels';
import { ENGINE_HEALTH_DEFAULTS } from '@/lib/quality/types';

/** 5% dead over 50K live rows: under the seeded 10% ceiling, over a tuned 2% one. */
const telemetry = (live: number, dead: number, deadRatio: number): TelemetryData => ({
  counts: { permits: { before: live, after: live, delta: 0 } },
  engine: { permits: { n_live_tup: live, n_dead_tup: dead, dead_ratio: deadRatio, seq_scan: 0, idx_scan: 1, seq_ratio: 0 } },
});

const deadBadge = () => screen.getByText(/^Dead:/);

describe('TelemetrySection T6 dead-tuple badge reads the logic variable, not a literal', () => {
  it('a tuned 0.02 ceiling colours a 5% table amber', () => {
    render(<TelemetrySection telemetry={telemetry(47500, 2500, 0.05)} thresholds={{ ...ENGINE_HEALTH_DEFAULTS, engine_health_dead_tuple_ratio_warn_max: 0.02 }} />);
    expect(deadBadge().className).toContain('text-amber-700');
  });

  it('INVERSE: the seeded 0.10 default leaves the same table grey', () => {
    render(<TelemetrySection telemetry={telemetry(47500, 2500, 0.05)} />);
    expect(deadBadge().className).toContain('text-gray-500');
  });

  it('a relaxed 0.90 ceiling leaves a 15% table grey', () => {
    render(<TelemetrySection telemetry={telemetry(42500, 7500, 0.15)} thresholds={{ ...ENGINE_HEALTH_DEFAULTS, engine_health_dead_tuple_ratio_warn_max: 0.9 }} />);
    expect(deadBadge().className).toContain('text-gray-500');
  });

  it('the min-rows floor comes from engine_health_dead_tuple_min_rows', () => {
    render(<TelemetrySection telemetry={telemetry(500, 500, 0.5)} thresholds={{ ...ENGINE_HEALTH_DEFAULTS, engine_health_dead_tuple_min_rows: 100 }} />);
    expect(deadBadge().className).toContain('text-amber-700');
  });

  it('a live=0 / dead>0 table displays 100.0% dead (accurate under dead/(live+dead))', () => {
    render(<TelemetrySection telemetry={telemetry(0, 40, 1)} />);
    expect(deadBadge().textContent).toBe('Dead: 100.0%');
  });
});
