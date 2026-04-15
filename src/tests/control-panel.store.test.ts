// SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 2
import { describe, it, expect, beforeEach } from 'vitest';
import type { MarketplaceConfig, LogicVariableRow, TradeConfigRow, ScopeMatrixRow } from '@/lib/admin/control-panel';

// Minimal fixture for tests
function makeProductionConfig(): MarketplaceConfig {
  return {
    logicVariables: [
      { key: 'los_base_divisor', value: 10000, jsonValue: null, description: null, updatedAt: '2026-01-01T00:00:00.000Z' },
      { key: 'stall_penalty_precon', value: 45, jsonValue: null, description: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
    tradeConfigs: [
      {
        tradeSlug: 'plumbing',
        bidPhaseCutoff: 'P3',
        workPhaseTarget: 'P12',
        imminentWindowDays: 14,
        allocationPct: 0.065,
        multiplierBid: 2.8,
        multiplierWork: 1.6,
        baseRateSqft: 195,
        structureComplexityFactor: 1.4,
      },
    ],
    scopeMatrix: [
      { permitType: 'new building', structureType: 'sfd', gfaAllocationPercentage: 1.0 },
    ],
  };
}

// Dynamic import of store (will fail until store is created — that's the Red Light)
// Store uses Zustand v5 — use getState() + setState() pattern directly.
async function getStore() {
  const mod = await import('@/features/admin-controls/store/useAdminControlsStore');
  return mod.useAdminControlsStore;
}

describe('useAdminControlsStore', () => {
  beforeEach(async () => {
    const store = await getStore();
    store.getState().resetStore();
  });

  it('starts with null productionConfig and empty draftConfig', async () => {
    const store = await getStore();
    const state = store.getState();
    expect(state.productionConfig).toBeNull();
    expect(state.draftConfig).toBeNull();
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it('setProductionConfig initializes both production and draft to the same value', async () => {
    const store = await getStore();
    const config = makeProductionConfig();
    store.getState().setProductionConfig(config);
    const state = store.getState();
    expect(state.productionConfig).toEqual(config);
    expect(state.draftConfig).toEqual(config);
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it('updateDraftLogicVar marks hasUnsavedChanges = true', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLogicVar('los_base_divisor', 8000);
    const state = store.getState();
    expect(state.hasUnsavedChanges).toBe(true);
    const updated = state.draftConfig?.logicVariables.find(
      (v: LogicVariableRow) => v.key === 'los_base_divisor',
    );
    expect(updated?.value).toBe(8000);
  });

  it('updateDraftLogicVar does NOT mutate productionConfig', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLogicVar('los_base_divisor', 8000);
    const state = store.getState();
    const prod = state.productionConfig?.logicVariables.find(
      (v: LogicVariableRow) => v.key === 'los_base_divisor',
    );
    expect(prod?.value).toBe(10000); // unchanged
  });

  it('updateDraftTradeConfig updates the correct trade slug', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftTradeConfig('plumbing', { multiplierBid: 3.5 });
    const state = store.getState();
    const updated = state.draftConfig?.tradeConfigs.find(
      (t: TradeConfigRow) => t.tradeSlug === 'plumbing',
    );
    expect(updated?.multiplierBid).toBe(3.5);
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('updateDraftScopeCell updates the correct permit_type × structure_type cell', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftScopeCell('new building', 'sfd', 0.9);
    const state = store.getState();
    const cell = state.draftConfig?.scopeMatrix.find(
      (c: ScopeMatrixRow) => c.permitType === 'new building' && c.structureType === 'sfd',
    );
    expect(cell?.gfaAllocationPercentage).toBe(0.9);
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('resetDrafts reverts draft to production config and clears hasUnsavedChanges', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLogicVar('los_base_divisor', 1);
    expect(store.getState().hasUnsavedChanges).toBe(true);
    store.getState().resetDrafts();
    const state = store.getState();
    expect(state.hasUnsavedChanges).toBe(false);
    const restored = state.draftConfig?.logicVariables.find(
      (v: LogicVariableRow) => v.key === 'los_base_divisor',
    );
    expect(restored?.value).toBe(10000);
  });

  it('commitDrafts promotes draft to production and clears hasUnsavedChanges', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLogicVar('los_base_divisor', 8000);
    store.getState().commitDrafts();
    const state = store.getState();
    expect(state.hasUnsavedChanges).toBe(false);
    const prod = state.productionConfig?.logicVariables.find(
      (v: LogicVariableRow) => v.key === 'los_base_divisor',
    );
    expect(prod?.value).toBe(8000);
  });

  it('computeDiff returns only changed variables', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLogicVar('los_base_divisor', 8000);
    const diff = store.getState().computeDiff();
    expect(diff.logicVariables).toHaveLength(1);
    expect(diff.logicVariables?.[0]?.key).toBe('los_base_divisor');
    expect(diff.logicVariables?.[0]?.value).toBe(8000);
  });

  it('computeDiff returns empty arrays when nothing changed', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    const diff = store.getState().computeDiff();
    expect(diff.logicVariables ?? []).toHaveLength(0);
    expect(diff.tradeConfigs ?? []).toHaveLength(0);
    expect(diff.scopeMatrix ?? []).toHaveLength(0);
  });
});
