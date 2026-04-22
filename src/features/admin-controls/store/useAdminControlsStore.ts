/**
 * Zustand store for the Control Panel "Draft vs. Production" state.
 *
 * productionConfig = the live DB state (committed).
 * draftConfig      = the admin's in-flight edits (not yet saved).
 * hasUnsavedChanges = derived: draftConfig differs from productionConfig.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 */

import { create } from 'zustand';
import type {
  MarketplaceConfig,
  LogicVariableRow,
  TradeConfigRow,
  ScopeMatrixRow,
  ConfigUpdatePayload,
} from '@/lib/admin/control-panel';

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface AdminControlsState {
  productionConfig: MarketplaceConfig | null;
  draftConfig: MarketplaceConfig | null;
  hasUnsavedChanges: boolean;

  // Actions
  setProductionConfig: (config: MarketplaceConfig) => void;
  /** Re-fetched after a save: updates productionConfig only — does NOT reset draftConfig.
   *  Prevents in-flight edits from being wiped when the save invalidation re-fetches. */
  refreshProductionConfig: (config: MarketplaceConfig) => void;
  updateDraftLogicVar: (key: string, value: number | null, jsonValue?: Record<string, number> | null) => void;
  updateDraftTradeConfig: (tradeSlug: string, patch: Partial<Omit<TradeConfigRow, 'tradeSlug'>>) => void;
  updateDraftScopeCell: (permitType: string, structureType: string, gfaAllocationPercentage: number) => void;
  resetDrafts: () => void;
  commitDrafts: () => void;
  resetStore: () => void;

  // Derived
  computeDiff: () => ConfigUpdatePayload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep clone helper (avoids accidental production mutation)
// ─────────────────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAdminControlsStore = create<AdminControlsState>((set, get) => ({
  productionConfig: null,
  draftConfig: null,
  hasUnsavedChanges: false,

  setProductionConfig(config: MarketplaceConfig) {
    set({
      productionConfig: deepClone(config),
      draftConfig: deepClone(config),
      hasUnsavedChanges: false,
    });
  },

  refreshProductionConfig(config: MarketplaceConfig) {
    // Used after a successful save invalidation re-fetch. Updates productionConfig
    // to the actual DB state without touching draftConfig — preserves any edits
    // the user made while the PUT was in flight.
    set((state) => ({
      productionConfig: deepClone(config),
      hasUnsavedChanges:
        JSON.stringify(state.draftConfig) !== JSON.stringify(config),
    }));
  },

  updateDraftLogicVar(
    key: string,
    value: number | null,
    jsonValue: Record<string, number> | null = null,
  ) {
    set((state) => {
      if (!state.draftConfig) return {};
      const draft = deepClone(state.draftConfig);
      const idx = draft.logicVariables.findIndex((v: LogicVariableRow) => v.key === key);
      if (idx !== -1) {
        // SAFETY: idx checked above; noUncheckedIndexedAccess not enabled in tsconfig
        const lv = draft.logicVariables[idx]!;
        lv.value = value;
        if (jsonValue !== null) lv.jsonValue = jsonValue;
      }
      return {
        draftConfig: draft,
        hasUnsavedChanges: JSON.stringify(draft) !== JSON.stringify(state.productionConfig),
      };
    });
  },

  updateDraftTradeConfig(tradeSlug: string, patch: Partial<Omit<TradeConfigRow, 'tradeSlug'>>) {
    set((state) => {
      if (!state.draftConfig) return {};
      const draft = deepClone(state.draftConfig);
      const idx = draft.tradeConfigs.findIndex((t: TradeConfigRow) => t.tradeSlug === tradeSlug);
      if (idx !== -1) {
        // SAFETY: idx checked above; spread preserves required tradeSlug from existing row
        const existing = draft.tradeConfigs[idx]!;
        draft.tradeConfigs[idx] = { ...existing, ...patch } as TradeConfigRow;
      }
      return {
        draftConfig: draft,
        hasUnsavedChanges: JSON.stringify(draft) !== JSON.stringify(state.productionConfig),
      };
    });
  },

  updateDraftScopeCell(permitType: string, structureType: string, gfaAllocationPercentage: number) {
    set((state) => {
      if (!state.draftConfig) return {};
      const draft = deepClone(state.draftConfig);
      const idx = draft.scopeMatrix.findIndex(
        (c: ScopeMatrixRow) => c.permitType === permitType && c.structureType === structureType,
      );
      if (idx !== -1) {
        // SAFETY: idx checked above
        draft.scopeMatrix[idx]!.gfaAllocationPercentage = gfaAllocationPercentage;
      } else {
        // New cell (not in seed data — add it)
        draft.scopeMatrix.push({ permitType, structureType, gfaAllocationPercentage });
      }
      return {
        draftConfig: draft,
        hasUnsavedChanges: JSON.stringify(draft) !== JSON.stringify(state.productionConfig),
      };
    });
  },

  resetDrafts() {
    const { productionConfig } = get();
    set({
      draftConfig: productionConfig ? deepClone(productionConfig) : null,
      hasUnsavedChanges: false,
    });
  },

  commitDrafts() {
    const { draftConfig } = get();
    set({
      productionConfig: draftConfig ? deepClone(draftConfig) : null,
      hasUnsavedChanges: false,
    });
  },

  resetStore() {
    set({ productionConfig: null, draftConfig: null, hasUnsavedChanges: false });
  },

  computeDiff(): ConfigUpdatePayload {
    const { productionConfig, draftConfig } = get();
    if (!productionConfig || !draftConfig) return {};

    const diff: ConfigUpdatePayload = {};

    // Logic variables diff
    const changedVars = draftConfig.logicVariables.filter((draftVar: LogicVariableRow) => {
      const prod = productionConfig.logicVariables.find(
        (v: LogicVariableRow) => v.key === draftVar.key,
      );
      return !prod ||
        prod.value !== draftVar.value ||
        JSON.stringify(prod.jsonValue) !== JSON.stringify(draftVar.jsonValue);
    });
    if (changedVars.length > 0) {
      diff.logicVariables = changedVars.map((v: LogicVariableRow) => ({
        key: v.key,
        value: v.value,
        jsonValue: v.jsonValue,
      }));
    }

    // Trade configs diff
    const changedTrades = draftConfig.tradeConfigs.filter((draftTrade: TradeConfigRow) => {
      const prod = productionConfig.tradeConfigs.find(
        (t: TradeConfigRow) => t.tradeSlug === draftTrade.tradeSlug,
      );
      return !prod || JSON.stringify(prod) !== JSON.stringify(draftTrade);
    });
    if (changedTrades.length > 0) {
      diff.tradeConfigs = changedTrades.map((t: TradeConfigRow) => ({
        tradeSlug: t.tradeSlug,
        bidPhaseCutoff: t.bidPhaseCutoff,
        workPhaseTarget: t.workPhaseTarget,
        imminentWindowDays: t.imminentWindowDays,
        allocationPct: t.allocationPct,
        multiplierBid: t.multiplierBid,
        multiplierWork: t.multiplierWork,
        baseRateSqft: t.baseRateSqft,
        structureComplexityFactor: t.structureComplexityFactor,
      }));
    }

    // Scope matrix diff
    const changedCells = draftConfig.scopeMatrix.filter((draftCell: ScopeMatrixRow) => {
      const prod = productionConfig.scopeMatrix.find(
        (c: ScopeMatrixRow) =>
          c.permitType === draftCell.permitType && c.structureType === draftCell.structureType,
      );
      return !prod || prod.gfaAllocationPercentage !== draftCell.gfaAllocationPercentage;
    });
    if (changedCells.length > 0) {
      diff.scopeMatrix = changedCells;
    }

    return diff;
  },
}));
