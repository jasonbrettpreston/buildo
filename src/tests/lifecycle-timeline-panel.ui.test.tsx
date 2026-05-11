// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 7 (Lifecycle Timeline panel)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5 (Inspector Lifecycle Timeline)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3/§5/§9 (Client Component, a11y, empty states)
//
// RTL tests for the LifecycleTimelinePanel — the Cycle 7 admin UI surface
// that renders the WF1 #B lifecycle.timeline[] data layer. The panel sits
// ABOVE the existing 8-panel diagnostic grid in LeadDetailInspector and
// gives operators a one-glance view of "is this permit on-pace, slow,
// or stalled?" via cohort-band classification.
//
// WF1 #C R4 — Red Light tests (11 RTL cases, including 2 a11y + 1 loading
// per R0 Gemini findings). Fixtures captured at R3 from the live DB
// pin three real-shape scenarios so tests are deterministic.
//
// Assertion style: `.toBeDefined()` + `.getAttribute()` calls — matches
// the rest of the project's RTL suite (jest-dom matchers are not loaded
// globally; see src/tests/admin-health-tile.ui.test.tsx:11).

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LifecycleTimelinePanel } from '@/components/admin/lead-inspector/LifecycleTimelinePanel';
import type { LeadInspectTimelineEntry } from '@/lib/admin/lead-schemas';

/** Helper: build a minimal valid TimelineEntry with overrides. */
function entry(overrides: Partial<LeadInspectTimelineEntry>): LeadInspectTimelineEntry {
  return {
    phase: 'P10',
    phase_name: 'Foundations',
    status: 'completed',
    entered_at: '2026-01-01T00:00:00.000Z',
    exited_at: '2026-02-01T00:00:00.000Z',
    days_in_phase: 31,
    cohort_median_days: 30,
    cohort_p25_days: 20,
    cohort_p75_days: 50,
    cohort_sample_size: 100,
    ...overrides,
  };
}

describe('<LifecycleTimelinePanel> — completed entries', () => {
  it('renders all completed entries with chevrons between adjacent stages (chronological order)', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P6', phase_name: 'Permit Applied', status: 'completed', days_in_phase: 10 }),
      entry({ phase: 'P8', phase_name: 'Mobilization', status: 'completed', days_in_phase: 15 }),
      entry({ phase: 'P10', phase_name: 'Foundations', status: 'current', exited_at: null, days_in_phase: 8 }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    expect(screen.getByText('Permit Applied')).toBeDefined();
    expect(screen.getByText('Mobilization')).toBeDefined();
    expect(screen.getByText('Foundations')).toBeDefined();
    // Two chevrons between three adjacent stages (or more if the
    // completed→current boundary adds one).
    const chevrons = screen.getAllByTestId('timeline-chevron');
    expect(chevrons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('<LifecycleTimelinePanel> — current entry', () => {
  it('renders the current entry with "in progress" suffix and a cohort-band pill', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({
        phase: 'P10',
        phase_name: 'Foundations',
        status: 'current',
        days_in_phase: 35,
        exited_at: null,
        cohort_p25_days: 20,
        cohort_p75_days: 50,
        cohort_sample_size: 200,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    expect(screen.getByText(/in progress/i)).toBeDefined();
    // 35d is within p25-p75 band → amber pill, text "TRENDING SLOW"
    expect(screen.getByText(/trending slow/i)).toBeDefined();
  });
});

describe('<LifecycleTimelinePanel> — upcoming entries', () => {
  it('renders upcoming entries with predicted days from cohort_median_days', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P10', phase_name: 'Foundations', status: 'current', days_in_phase: 5, exited_at: null }),
      entry({
        phase: 'P11',
        phase_name: 'Structural Framing',
        status: 'upcoming',
        entered_at: null,
        exited_at: null,
        days_in_phase: 45,
        cohort_median_days: 45,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    expect(screen.getByText('Structural Framing')).toBeDefined();
    expect(screen.getByText(/~45d/)).toBeDefined();
  });
});

describe('<LifecycleTimelinePanel> — empty state', () => {
  it('renders empty-state copy (not a blank canvas) when timeline is empty', () => {
    render(<LifecycleTimelinePanel timeline={[]} />);
    expect(screen.getByText(/lifecycle data unavailable/i)).toBeDefined();
  });
});

describe('<LifecycleTimelinePanel> — terminal phase', () => {
  it('renders no upcoming region when current phase is terminal (P18/P19/P20/O3)', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P17', phase_name: 'Occupancy', status: 'completed' }),
      entry({
        phase: 'P18',
        phase_name: 'Project Closed',
        status: 'current',
        days_in_phase: 1,
        exited_at: null,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    // No 'upcoming' entries in the timeline → no upcoming region rendered.
    expect(screen.queryByTestId('timeline-upcoming-region')).toBeNull();
  });
});

describe('<LifecycleTimelinePanel> — off-canonical-path (84-W11 surface)', () => {
  it('renders a low-emphasis off-path marker with Spec 84 §3 tooltip', () => {
    // Mid-pipeline permit (not terminal) but with NO upcoming entries —
    // signals that buildTimeline saw an off-canonical-path currentPhase.
    // R8 DeepSeek MED: tooltip references Spec 84 §3 canonical phase
    // paths (not bug 84-W11, which is about P3/P4/P5 ID collisions).
    const timeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P3', phase_name: 'CoA Approved', status: 'completed' }),
      entry({
        phase: 'O1',
        phase_name: 'Orphan Active',
        status: 'current',
        days_in_phase: 5,
        exited_at: null,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} permitType="New Houses" />);
    const marker = screen.getByText(/off canonical path/i);
    expect(marker).toBeDefined();
    const title = marker.getAttribute('title') ?? '';
    expect(title).toMatch(/Spec 84 §3/);
    expect(title).toMatch(/New Houses/);
    // Must NOT reference 84-W11 — that bug is unrelated.
    expect(title).not.toMatch(/84-W11/);
  });
});

describe('<LifecycleTimelinePanel> — unreliable cohort (sample_size < 30)', () => {
  it('renders an unreliable info icon with tooltip referencing Spec 84 §7', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({
        phase: 'P10',
        phase_name: 'Foundations',
        status: 'current',
        days_in_phase: 15,
        exited_at: null,
        cohort_sample_size: 7,
        cohort_p25_days: 20,
        cohort_p75_days: 50,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    const marker = screen.getByTestId('cohort-unreliable-marker');
    expect(marker).toBeDefined();
    const title = marker.getAttribute('title') ?? '';
    expect(title).toMatch(/Spec 84 §7/);
    expect(title).toMatch(/Cohort sample 7/);
  });
});

describe('<LifecycleTimelinePanel> — missing calibration data', () => {
  it("renders 'NO COHORT DATA' pill (not '0d') when cohort_median_days is null", () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({
        phase: 'P10',
        phase_name: 'Foundations',
        status: 'current',
        days_in_phase: 15,
        exited_at: null,
        cohort_median_days: null,
        cohort_p25_days: null,
        cohort_p75_days: null,
        cohort_sample_size: 0,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    expect(screen.getByText(/no cohort data/i)).toBeDefined();
    // Must NOT render a misleading "0d" fallback.
    expect(screen.queryByText(/^0d$/)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────
// R0 Gemini findings — a11y (HIGH) + loading state (MED)
// ───────────────────────────────────────────────────────────────────────

describe('<LifecycleTimelinePanel> — accessibility (R0 Gemini HIGH)', () => {
  it('a11y #1 — cohort-band pill carries text label AND aria-label (not color alone)', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({
        phase: 'P10',
        phase_name: 'Foundations',
        status: 'current',
        days_in_phase: 60,
        exited_at: null,
        cohort_p25_days: 20,
        cohort_p75_days: 50,
        cohort_sample_size: 100,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    expect(screen.getByText(/stalled/i)).toBeDefined();
    // The pill itself OR its container has an aria-label naming the band.
    const ariaLabelled = screen.getByLabelText(/cohort status:\s*stalled/i);
    expect(ariaLabelled).toBeDefined();
  });

  it('a11y #2 — scrollable timeline container has tabindex and aria-label', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P3', phase_name: 'CoA Approved', status: 'completed' }),
      entry({ phase: 'P6', phase_name: 'Permit Applied', status: 'current', exited_at: null, days_in_phase: 5 }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    const container = screen.getByTestId('timeline-scroll-container');
    expect(container.getAttribute('tabindex')).toBe('0');
    expect(container.getAttribute('aria-label') ?? '').toMatch(/lifecycle timeline/i);
  });
});

describe('<LifecycleTimelinePanel> — loading state (R0 Gemini MED + R8 Gemini HIGH)', () => {
  it("renders a skeleton row matching chevron-progression shape when loading={true}", () => {
    render(<LifecycleTimelinePanel timeline={undefined} loading={true} />);
    const skeleton = screen.getByTestId('timeline-skeleton');
    expect(skeleton).toBeDefined();
    const placeholders = screen.getAllByTestId('timeline-skeleton-placeholder');
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
  });

  it('R8 Gemini HIGH — renders skeleton even when stale timeline data is present alongside loading=true', () => {
    // Before R8 fix: `loading && (timeline == null || .length === 0)` would
    // skip the skeleton when a parent re-fetch handed us stale data
    // alongside loading=true, producing a content pop on resolution.
    // Loading state must be independent of timeline shape.
    const staleTimeline: LeadInspectTimelineEntry[] = [
      entry({ phase: 'P5', phase_name: 'Zoning Review', status: 'completed' }),
    ];
    render(<LifecycleTimelinePanel timeline={staleTimeline} loading={true} />);
    expect(screen.getByTestId('timeline-skeleton')).toBeDefined();
    // The stale timeline data should NOT be rendered while loading.
    expect(screen.queryByText('Zoning Review')).toBeNull();
  });
});

describe('<LifecycleTimelinePanel> — R8 worktree BUG 2 keyboard access', () => {
  it('UnreliableMarker is keyboard-focusable (tabIndex=0) so the title tooltip fires on focus', () => {
    const timeline: LeadInspectTimelineEntry[] = [
      entry({
        phase: 'P10',
        phase_name: 'Foundations',
        status: 'current',
        days_in_phase: 5,
        exited_at: null,
        cohort_sample_size: 7,
        cohort_p25_days: 20,
        cohort_p75_days: 50,
      }),
    ];
    render(<LifecycleTimelinePanel timeline={timeline} />);
    const marker = screen.getByTestId('cohort-unreliable-marker');
    // Without tabIndex=0 the marker is unreachable by keyboard Tab — the
    // title tooltip would only fire on mouse hover, violating Spec 33 §9
    // keyboard-nav mandate.
    expect(marker.getAttribute('tabindex')).toBe('0');
  });
});
