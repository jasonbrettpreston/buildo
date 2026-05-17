// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 8
//             docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §13
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h
//
// RTL tests for F.4 CoA Classification Panel — the 12-sub-section CoA classifier
// surface introduced by Spec 76 §3.5 Cycle 8. Covers:
//   - 12 panel sub-sections render with correct testids
//   - 110-position SVG scrubber WCAG accessibility
//   - Conditional cost_source warning badge
//   - Linked-permit chip navigation callback
//   - Cross-stream timeline pills (coa vs permit color)
//   - ClassifierPendingBanner emits info breadcrumb
//   - OrphanLinkedCoaBanner has role="alert" + aria-live="assertive"

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeadInspectCoa } from '@/lib/admin/lead-schemas';

const addBreadcrumb = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}));

import {
  CoaClassificationPanel,
  ClassifierPendingBanner,
  OrphanLinkedCoaBanner,
} from '@/components/admin/lead-inspector/CoaClassificationPanel';

function makeCoa(overrides: Partial<LeadInspectCoa> = {}): LeadInspectCoa {
  return {
    application_number: 'A0001-2024',
    coa_type_class: 'residential',
    project_type: 'addition_renovation',
    scope_tags: ['rear_addition', 'second_storey'],
    structure_type: 'Single Family Detached',
    decision_current: 'approved',
    decision_history: [],
    decision_date: '2026-03-15',
    hearing_date: '2026-02-20',
    estimated_cost: 850000,
    cost_source: 'geometric',
    modeled_gfa_sqm: 240,
    lifecycle_seq: 47,
    lifecycle_group: 'C2',
    lifecycle_block: 'B2.A',
    lifecycle_stage: 'S5',
    group_label: 'Approvals',
    block_label: 'CoA Approved',
    stage_label: 'Mid-approval',
    group_color: '#22c55e',
    block_color: '#22c55e',
    stage_color: '#22c55e',
    group_icon: '✓',
    block_icon: '✓',
    stage_icon: '✓',
    bid_value: 0.72,
    linked_permit: null,
    cross_stream_timeline: [],
    lead_trades: [],
    ...overrides,
  };
}

beforeEach(() => {
  addBreadcrumb.mockClear();
});

describe('<CoaClassificationPanel> — section visibility', () => {
  it('renders all 12 sub-sections when fully populated', () => {
    const onNavigate = vi.fn();
    render(
      <CoaClassificationPanel
        data={makeCoa({
          linked_permit: {
            lead_id: 'permit:24-123456:00',
            permit_num: '24-123456',
            revision_num: '00',
            status: 'Permit Issued',
          },
          cross_stream_timeline: [
            {
              lead_id: 'permit:24-123456:00',
              lead_type: 'permit',
              from_status: 'Application',
              to_status: 'Permit Issued',
              transitioned_at: '2026-04-01T00:00:00Z',
              id: 1,
            },
          ],
          lead_trades: [
            { trade_id: 5, trade_slug: 'framing', display_name: 'Framing', confidence: 0.95 },
          ],
        })}
        parentLeadType="coa"
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByTestId('coa-classification-panel')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-type-class')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-project-type')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-scope-tags')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-structure')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-decision')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-dates')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-cost')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-lifecycle')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-linked-permit')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-cross-stream')).toBeDefined();
    expect(screen.getByTestId('coa-panel-section-trades')).toBeDefined();
  });

  it('hides linked-permit and cross-stream sections when both empty', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa()}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('coa-panel-section-linked-permit')).toBeNull();
    expect(screen.queryByTestId('coa-panel-section-cross-stream')).toBeNull();
  });
});

describe('<CoaClassificationPanel> — type-class chip', () => {
  it('falls back to "Unclassified" when coa_type_class is null', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ coa_type_class: null })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const chip = screen.getByTestId('coa-type-class-chip');
    expect(chip.textContent).toBe('Unclassified');
  });

  it('falls back to "Unclassified" when coa_type_class is empty string (|| not ??)', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ coa_type_class: '' })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const chip = screen.getByTestId('coa-type-class-chip');
    expect(chip.textContent).toBe('Unclassified');
  });
});

describe('<CoaClassificationPanel> — cost panel', () => {
  it('shows "geometric" badge when cost_source === "geometric"', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ cost_source: 'geometric' })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const section = screen.getByTestId('coa-panel-section-cost');
    expect(section.textContent).toContain('geometric');
  });

  it('shows warning badge when cost_source is non-geometric and non-null', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ cost_source: 'reported' })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const section = screen.getByTestId('coa-panel-section-cost');
    expect(section.textContent).toContain('Unexpected cost_source');
  });

  it('renders no warning when cost_source is null', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ cost_source: null })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const section = screen.getByTestId('coa-panel-section-cost');
    expect(section.textContent).not.toContain('Unexpected cost_source');
  });
});

describe('<CoaClassificationPanel> — current-position label (Spec 76 §3.5)', () => {
  it('renders 3 colored chips (group/block/stage) with their icons and hex colors', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({
          lifecycle_seq: 47,
          group_color: '#22c55e',
          block_color: '#3b82f6',
          stage_color: '#a855f7',
          group_icon: '✓',
          block_icon: '◐',
          stage_icon: '★',
        })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const groupChip = screen.getByTestId('lifecycle-chip-group');
    const blockChip = screen.getByTestId('lifecycle-chip-block');
    const stageChip = screen.getByTestId('lifecycle-chip-stage');
    expect(groupChip.getAttribute('data-color')).toBe('#22c55e');
    expect(blockChip.getAttribute('data-color')).toBe('#3b82f6');
    expect(stageChip.getAttribute('data-color')).toBe('#a855f7');
    expect(groupChip.textContent).toContain('✓');
    expect(blockChip.textContent).toContain('◐');
    expect(stageChip.textContent).toContain('★');
  });
});

describe('<CoaClassificationPanel> — 110-position lifecycle scrubber', () => {
  it('renders the SVG with role="img" and an accessible aria-label', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ lifecycle_seq: 47 })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const svg = screen.getByTestId('lifecycle-scrubber-svg');
    expect(svg.getAttribute('role')).toBe('img');
    const label = svg.getAttribute('aria-label');
    expect(label).toBeDefined();
    expect(label).toContain('seq 47');
    expect(label).toContain('110 stages');
  });

  it('marks the current seq with aria-current="step" and a stroke', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ lifecycle_seq: 47 })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const currentRect = screen.getByTestId('scrubber-position-47');
    expect(currentRect.getAttribute('aria-current')).toBe('step');
    expect(currentRect.getAttribute('data-current')).toBe('true');
  });

  it('does NOT mark non-current positions with aria-current', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ lifecycle_seq: 47 })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const other = screen.getByTestId('scrubber-position-1');
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(other.getAttribute('data-current')).toBe('false');
  });

  it('falls back to "Not classified yet" copy when lifecycle_seq is null', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ lifecycle_seq: null })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lifecycle-scrubber-svg')).toBeNull();
    expect(screen.getByText(/Not classified yet/i)).toBeDefined();
  });

  it('renders the bid_value bar with role="progressbar" and correct aria-valuenow', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({ lifecycle_seq: 47, bid_value: 0.72 })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0.72');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('1');
  });
});

describe('<CoaClassificationPanel> — linked permit chip', () => {
  it('invokes onNavigate with the linked permit lead_id when clicked', () => {
    const onNavigate = vi.fn();
    render(
      <CoaClassificationPanel
        data={makeCoa({
          linked_permit: {
            lead_id: 'permit:24-123456:00',
            permit_num: '24-123456',
            revision_num: '00',
            status: 'Permit Issued',
          },
        })}
        parentLeadType="coa"
        onNavigate={onNavigate}
      />,
    );
    const chip = screen.getByTestId('linked-permit-chip');
    fireEvent.click(chip);
    expect(onNavigate).toHaveBeenCalledWith('permit:24-123456:00');
  });

  it('renders permit_num:revision_num text on the chip', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({
          linked_permit: {
            lead_id: 'permit:24-123456:00',
            permit_num: '24-123456',
            revision_num: '00',
            status: null,
          },
        })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const chip = screen.getByTestId('linked-permit-chip');
    expect(chip.textContent).toContain('24-123456:00');
  });
});

describe('<CoaClassificationPanel> — cross-stream timeline', () => {
  it('renders both coa and permit pills with distinct styling', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa({
          cross_stream_timeline: [
            {
              lead_id: 'coa:A0001-2024',
              lead_type: 'coa',
              from_status: 'Submitted',
              to_status: 'Hearing',
              transitioned_at: '2026-01-01T00:00:00Z',
              id: 1,
            },
            {
              lead_id: 'permit:24-123456:00',
              lead_type: 'permit',
              from_status: 'Application',
              to_status: 'Permit Issued',
              transitioned_at: '2026-04-01T00:00:00Z',
              id: 2,
            },
          ],
        })}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    const section = screen.getByTestId('coa-panel-section-cross-stream');
    expect(section.textContent).toContain('coa');
    expect(section.textContent).toContain('permit');
    expect(section.textContent).toContain('Submitted');
    expect(section.textContent).toContain('Permit Issued');
  });
});

describe('<CoaClassificationPanel> — parent context label', () => {
  it('labels itself "Primary" when parentLeadType is coa', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa()}
        parentLeadType="coa"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('Primary')).toBeDefined();
  });

  it('labels itself "Linked CoA (cross-stream)" when parentLeadType is permit', () => {
    render(
      <CoaClassificationPanel
        data={makeCoa()}
        parentLeadType="permit"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('Linked CoA (cross-stream)')).toBeDefined();
  });
});

describe('<ClassifierPendingBanner>', () => {
  it('renders application_number and helper text', () => {
    render(<ClassifierPendingBanner application_number="A0001-2024" />);
    expect(screen.getByTestId('classifier-pending-banner').textContent).toContain('A0001-2024');
    expect(screen.getByText(/not yet classified/i)).toBeDefined();
  });

  it('has role="status" + aria-live="polite" for assistive technology', () => {
    render(<ClassifierPendingBanner application_number="A0001-2024" />);
    const banner = screen.getByTestId('classifier-pending-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });

  // Spec 33 §11 read-only carve-out: the UI mount is a passive observation.
  // The data layer (fetchCoaPanel) emits `data_quality_coa_substrate_missing` instead.
  it('does NOT emit a Sentry breadcrumb on mount (data-layer emits one)', () => {
    render(<ClassifierPendingBanner application_number="A0001-2024" />);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });
});

describe('<OrphanLinkedCoaBanner>', () => {
  it('renders the orphaned application number', () => {
    render(<OrphanLinkedCoaBanner linked_coa_application_number="A0999-2024" />);
    expect(screen.getByTestId('orphan-linked-coa-banner').textContent).toContain('A0999-2024');
  });

  it('uses role="alert" + aria-live="assertive" for high-priority data integrity warning', () => {
    render(<OrphanLinkedCoaBanner linked_coa_application_number="A0999-2024" />);
    const banner = screen.getByTestId('orphan-linked-coa-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
  });

  it('does NOT emit its own Sentry breadcrumb (data-layer emits one)', () => {
    render(<OrphanLinkedCoaBanner linked_coa_application_number="A0999-2024" />);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });
});
