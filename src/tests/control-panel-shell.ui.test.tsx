// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 4
//
// ControlPanelShell error-state differentiation (P20, Spec 86 §5).
// Two-phase handleConfirm contract:
//   Phase 1 (applyUpdate fails): keep modal open, preserve draft, fire error toast
//   Phase 2 (triggerPipeline fails after save): close modal, fire warning toast
//
// Isolated from control-panel.ui.test.tsx because vi.mock calls are hoisted to
// module scope and would shadow the real StickyActionBar/ConfirmSyncModal needed
// by the height-class and diff-display tests in that file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { MarketplaceConfig } from '@/lib/admin/control-panel';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockToastError = vi.fn();
const mockToastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

const mockApplyUpdate = vi.fn();
const mockTriggerPipeline = vi.fn();

vi.mock('@/features/admin-controls/api/useUpdateConfigs', () => ({
  useUpdateConfigs: () => ({ mutateAsync: mockApplyUpdate, isPending: false }),
}));

vi.mock('@/features/admin-controls/api/useTriggerPipeline', () => ({
  useTriggerPipeline: () => ({ mutateAsync: mockTriggerPipeline, isPending: false }),
}));

vi.mock('@/features/admin-controls/api/useGetConfigs', () => ({
  useGetConfigs: () => ({ isLoading: false, isError: false }),
}));

vi.mock('@/features/admin-controls/lib/telemetry', () => ({
  captureAdminEvent: vi.fn(),
}));

// Stub child components to avoid their own dependency trees.
// ConfirmSyncModal stub renders a button when open=true; StickyActionBar fires onApply.
vi.mock('@/features/admin-controls/components/GlobalConfigCard', async () => {
  const actual = await import('@/features/admin-controls/components/GlobalConfigCard');
  return { ...actual, GlobalConfigCard: () => <div data-testid="global-config-card" /> };
});
vi.mock('@/features/admin-controls/components/TradeGrid', () => ({
  TradeGrid: () => <div data-testid="trade-grid" />,
}));
vi.mock('@/features/admin-controls/components/IntensityMatrix', () => ({
  IntensityMatrix: () => <div data-testid="intensity-matrix" />,
}));
vi.mock('@/features/admin-controls/components/ConfirmSyncModal', () => ({
  ConfirmSyncModal: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    isPending: boolean;
    diff: unknown;
    productionConfig: unknown;
  }) =>
    open ? (
      <button data-testid="confirm-btn" onClick={onConfirm}>
        Confirm
      </button>
    ) : null,
}));
vi.mock('@/features/admin-controls/components/StickyActionBar', () => ({
  StickyActionBar: ({
    onApply,
  }: {
    onDiscard: () => void;
    onApply: () => void;
    isPending: boolean;
  }) => (
    <button className="h-11" data-testid="apply-btn" onClick={onApply}>
      Apply
    </button>
  ),
}));

// ─── Store mock ───────────────────────────────────────────────────────────────

const makeConfig = (): MarketplaceConfig => ({
  logicVariables: [{ key: 'los_base_divisor', value: 10000, jsonValue: null, description: null, updatedAt: '' }],
  tradeConfigs: [],
  scopeMatrix: [],
});

const makeStore = () => ({
  productionConfig: makeConfig(),
  draftConfig: makeConfig(),
  hasUnsavedChanges: true,
  setProductionConfig: vi.fn(),
  updateDraftLogicVar: vi.fn(),
  updateDraftTradeConfig: vi.fn(),
  updateDraftScopeCell: vi.fn(),
  resetDrafts: vi.fn(),
  commitDrafts: vi.fn(),
  computeDiff: vi.fn(() => ({})),
  resetStore: vi.fn(),
});

let mockStoreState = makeStore();

vi.mock('@/features/admin-controls/store/useAdminControlsStore', () => ({
  useAdminControlsStore: vi.fn((selector?: (s: ReturnType<typeof makeStore>) => unknown) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ControlPanelShell — handleConfirm error-state differentiation', () => {
  beforeEach(async () => {
    mockToastError.mockClear();
    mockToastWarning.mockClear();
    mockApplyUpdate.mockReset();
    mockTriggerPipeline.mockReset();
    mockStoreState = makeStore();
    // Reset module registry so ControlPanelShell re-imports with fresh state
    vi.resetModules();
  });

  it('keeps modal open and fires error toast when applyUpdate throws', async () => {
    mockApplyUpdate.mockRejectedValue(new Error('DB write failed'));
    mockTriggerPipeline.mockResolvedValue(undefined);

    const { ControlPanelShell } = await import('@/features/admin-controls/components/ControlPanelShell');
    render(<ControlPanelShell />);

    // Open confirm modal via Apply button
    await act(async () => {
      fireEvent.click(screen.getByTestId('apply-btn'));
    });
    expect(screen.queryByTestId('confirm-btn')).not.toBeNull();

    // Click Confirm — applyUpdate throws
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-btn'));
    });

    // Modal must remain open (Phase 1 save fail → keep modal)
    expect(screen.queryByTestId('confirm-btn')).not.toBeNull();
    // Error toast must fire (not warning)
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
    // Pipeline must NOT be called (short-circuit after save fail)
    expect(mockTriggerPipeline).not.toHaveBeenCalled();
  });

  it('closes modal and fires warning toast when triggerPipeline throws after save succeeds', async () => {
    mockApplyUpdate.mockResolvedValue(undefined);
    mockTriggerPipeline.mockRejectedValue(new Error('Pipeline timeout'));

    const { ControlPanelShell } = await import('@/features/admin-controls/components/ControlPanelShell');
    render(<ControlPanelShell />);

    // Open confirm modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('apply-btn'));
    });
    expect(screen.queryByTestId('confirm-btn')).not.toBeNull();

    // Click Confirm — save succeeds, pipeline fails
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-btn'));
    });

    // Modal must be closed (save succeeded → Phase 2 always closes modal)
    expect(screen.queryByTestId('confirm-btn')).toBeNull();
    // Warning toast (not error) must fire
    expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('Saved'));
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
