// @vitest-environment jsdom
// SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phases 3-6
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { MarketplaceConfig } from '@/lib/admin/control-panel';

// ─── Mock TanStack Query ───────────────────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  QueryClient: class { },
}));

// ─── Mock Zustand store ────────────────────────────────────────────────────────
const makeDefaultStore = () => ({
  productionConfig: null as MarketplaceConfig | null,
  draftConfig: null as MarketplaceConfig | null,
  hasUnsavedChanges: false,
  setProductionConfig: vi.fn(),
  updateDraftLogicVar: vi.fn(),
  updateDraftTradeConfig: vi.fn(),
  updateDraftScopeCell: vi.fn(),
  resetDrafts: vi.fn(),
  commitDrafts: vi.fn(),
  computeDiff: vi.fn(() => ({})),
  resetStore: vi.fn(),
});

let mockStoreState = makeDefaultStore();

vi.mock('@/features/admin-controls/store/useAdminControlsStore', () => ({
  // Apply selector when called with one — matches real Zustand usage pattern
  useAdminControlsStore: vi.fn((selector?: (s: ReturnType<typeof makeDefaultStore>) => unknown) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  }),
}));

// ─── DeltaGuardInput ──────────────────────────────────────────────────────────
describe('DeltaGuardInput — amber warning at >50% deviation', () => {
  beforeEach(() => {
    mockStoreState = makeDefaultStore();
  });

  it('renders without amber class at normal value', async () => {
    const { DeltaGuardInput } = await import('@/features/admin-controls/components/DeltaGuardInput');
    render(
      <DeltaGuardInput
        varKey="los_base_divisor"
        value={10000}
        onChange={vi.fn()}
      />,
    );
    const container = screen.getByTestId('delta-guard-container');
    expect(container).toBeDefined();
    expect(container.className).not.toMatch(/amber|yellow/);
  });

  it('applies amber indicator when value deviates > 50% from default', async () => {
    const { DeltaGuardInput } = await import('@/features/admin-controls/components/DeltaGuardInput');
    render(
      <DeltaGuardInput
        varKey="los_base_divisor"
        value={4000}  // 4000 vs 10000 default = 60% deviation
        onChange={vi.fn()}
      />,
    );
    const container = screen.getByTestId('delta-guard-container');
    expect(container.className).toMatch(/amber|yellow/);
  });
});

// ─── StickyActionBar ──────────────────────────────────────────────────────────
describe('StickyActionBar — visibility tied to hasUnsavedChanges', () => {
  beforeEach(() => {
    mockStoreState = makeDefaultStore();
  });

  it('is not rendered when hasUnsavedChanges is false', async () => {
    mockStoreState = { ...makeDefaultStore(), hasUnsavedChanges: false };
    const { StickyActionBar } = await import('@/features/admin-controls/components/StickyActionBar');
    const { container } = render(<StickyActionBar onDiscard={vi.fn()} onApply={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Discard and Apply buttons when dirty', async () => {
    mockStoreState = { ...makeDefaultStore(), hasUnsavedChanges: true };
    const { StickyActionBar } = await import('@/features/admin-controls/components/StickyActionBar');
    render(<StickyActionBar onDiscard={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Discard/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Apply/i })).toBeDefined();
  });

  it('calls onDiscard when Discard button is clicked', async () => {
    mockStoreState = { ...makeDefaultStore(), hasUnsavedChanges: true };
    const onDiscard = vi.fn();
    const { StickyActionBar } = await import('@/features/admin-controls/components/StickyActionBar');
    render(<StickyActionBar onDiscard={onDiscard} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});

// ─── ConfirmSyncModal ─────────────────────────────────────────────────────────
describe('ConfirmSyncModal — diff display', () => {
  it('renders Old → New values for each changed variable', async () => {
    const { ConfirmSyncModal } = await import('@/features/admin-controls/components/ConfirmSyncModal');
    const diff = {
      logicVariables: [{ key: 'los_base_divisor', value: 5000 }],
    };
    const productionConfig: MarketplaceConfig = {
      logicVariables: [
        { key: 'los_base_divisor', value: 10000, jsonValue: null, description: null, updatedAt: '' },
      ],
      tradeConfigs: [],
      scopeMatrix: [],
    };
    render(
      <ConfirmSyncModal
        open={true}
        diff={diff}
        productionConfig={productionConfig}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('los_base_divisor')).toBeDefined();
    expect(screen.getByText('10000')).toBeDefined();
    expect(screen.getByText('5000')).toBeDefined();
  });
});

// ─── Mobile viewport — touch target size ─────────────────────────────────────
describe('Touch target sizes — mobile (375px) compliance', () => {
  it('StickyActionBar buttons carry a sufficient height class (>= 44px)', async () => {
    mockStoreState = { ...makeDefaultStore(), hasUnsavedChanges: true };

    const { StickyActionBar } = await import('@/features/admin-controls/components/StickyActionBar');
    const { container } = render(<StickyActionBar onDiscard={vi.fn()} onApply={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    for (const button of Array.from(buttons)) {
      const classes = button.className;
      // Tailwind: h-11 = 44px, h-12 = 48px; py-3 on text-sm also gives ~44px.
      const hasSufficientHeight = /h-11|h-12|h-14|py-3|py-4/.test(classes);
      expect(hasSufficientHeight, `button "${button.textContent}" lacks 44px height class`).toBe(true);
    }
  });
});
