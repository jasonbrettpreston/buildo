// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
//            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3
//            docs/specs/01-pipeline/124_step_standard_policy.md (R-AU)
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
    // Batch-2 row 2.5 (Spec 88 §2.3, Spec 124 R-AU) — pricing fixtures for E2.
    pricingRates: [
      {
        archetype: 'KIT',
        costPerSqm: 1200,
        costAdjustmentFactor: 1.0,
        escalationIndexBase: 1.05,
        source: 'seed',
        asOfDate: '2026-01-01',
      },
    ],
    pricingLines: [
      {
        id: 'kitchen',
        archetype: 'KIT',
        baseConfidence: 'high',
        fitPermittedValues: ['as_of_right'],
      },
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

  // ── refreshProductionConfig ────────────────────────────────────────────────
  // This action is the critical guard against the race condition where in-flight
  // edits made DURING a pending PUT would be silently orphaned if setProductionConfig
  // (which resets draftConfig) were called on the re-fetch after a successful save.

  it('refreshProductionConfig updates production without overwriting draftConfig', async () => {
    const store = await getStore();
    const original = makeProductionConfig();
    store.getState().setProductionConfig(original);
    // User makes a draft edit
    store.getState().updateDraftLogicVar('los_base_divisor', 7777);
    expect(store.getState().hasUnsavedChanges).toBe(true);

    // Simulate a DB re-fetch returning a new production config (e.g. another
    // operator just saved). The draft edit must survive.
    const newProduction = makeProductionConfig();
    newProduction.logicVariables[0]!.value = 9000; // server side changed
    store.getState().refreshProductionConfig(newProduction);

    const state = store.getState();
    // Production is updated
    expect(state.productionConfig?.logicVariables[0]!.value).toBe(9000);
    // Draft still has the user's pending edit
    const draftVar = state.draftConfig?.logicVariables.find(
      (v: LogicVariableRow) => v.key === 'los_base_divisor',
    );
    expect(draftVar?.value).toBe(7777);
    // hasUnsavedChanges reflects that draft differs from new production
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('refreshProductionConfig sets hasUnsavedChanges=false when draft already matches new production', async () => {
    const store = await getStore();
    const original = makeProductionConfig();
    store.getState().setProductionConfig(original);
    // No edits — draft equals production
    expect(store.getState().hasUnsavedChanges).toBe(false);

    // Re-fetch returns the same config (nothing changed server-side)
    store.getState().refreshProductionConfig(makeProductionConfig());

    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  // ── Batch-2 row 2.5 (Spec 88 §2.3 / Spec 124 R-AU): pricing draft edits ─────

  // RED (before E2): store.updateDraftRate is undefined → TypeError.
  it('S1 — updateDraftRate emits ONLY the changed field in computeDiff().pricingRates', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftRate('KIT', { costPerSqm: 1300 });
    expect(store.getState().hasUnsavedChanges).toBe(true);
    expect(store.getState().computeDiff().pricingRates).toEqual([
      { archetype: 'KIT', costPerSqm: 1300 },
    ]);
  });

  // RED (before E2): store.updateDraftLine is undefined → TypeError.
  it('S2 — updateDraftLine emits ONLY the changed field in computeDiff().pricingLines', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftLine('kitchen', { baseConfidence: 'low' });
    expect(store.getState().computeDiff().pricingLines).toEqual([
      { id: 'kitchen', baseConfidence: 'low' },
    ]);
  });

  // RED (before E2): computeDiff never returns a pricingRates key.
  it('S3 — reverting a rate field to its production value drops the pricingRates key entirely', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftRate('KIT', { costPerSqm: 1300 });
    expect(store.getState().computeDiff().pricingRates).toHaveLength(1);
    // Set it back to the production value → no change remains.
    store.getState().updateDraftRate('KIT', { costPerSqm: 1200 });
    const diff = store.getState().computeDiff();
    // Convention matches the other sections: the key is ABSENT, not [].
    expect('pricingRates' in diff).toBe(false);
    expect(diff.pricingRates).toBeUndefined();
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  // RED (before E2): pricing edits can't be made, so nothing to clear.
  it('S4 — resetDrafts clears pricing edits (draft equals production again)', async () => {
    const store = await getStore();
    store.getState().setProductionConfig(makeProductionConfig());
    store.getState().updateDraftRate('KIT', { costPerSqm: 9999 });
    store.getState().updateDraftLine('kitchen', { baseConfidence: 'low' });
    expect(store.getState().hasUnsavedChanges).toBe(true);
    store.getState().resetDrafts();
    const state = store.getState();
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.draftConfig?.pricingRates[0]!.costPerSqm).toBe(1200);
    expect(state.draftConfig?.pricingLines[0]!.baseConfidence).toBe('high');
  });
});
