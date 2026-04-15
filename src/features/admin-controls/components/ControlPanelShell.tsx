'use client';
/**
 * ControlPanelShell — top-level admin UI for Spec 86.
 *
 * Hosts three tabs (Platform Variables / Trade Configurations / Scope Matrix),
 * a StickyActionBar, and the ConfirmSyncModal diff dialog.
 *
 * Data flow:
 *   useGetConfigs  → loads production config → sets Zustand store
 *   user edits     → Zustand draftConfig mutations (hasUnsavedChanges = true)
 *   Apply pressed  → ConfirmSyncModal diff → useUpdateConfigs PUT
 *                    → useUpdateConfigs success → useTriggerPipeline POST
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phases 1-6
 */

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAdminControlsStore } from '../store/useAdminControlsStore';
import { useGetConfigs } from '../api/useGetConfigs';
import { useUpdateConfigs } from '../api/useUpdateConfigs';
import { useTriggerPipeline } from '../api/useTriggerPipeline';
import { GlobalConfigCard } from './GlobalConfigCard';
import { TradeGrid } from './TradeGrid';
import { IntensityMatrix } from './IntensityMatrix';
import { ConfirmSyncModal } from './ConfirmSyncModal';
import { StickyActionBar } from './StickyActionBar';
import { captureAdminEvent } from '../lib/telemetry';

type Tab = 'variables' | 'trades' | 'matrix';

export function ControlPanelShell() {
  const [activeTab, setActiveTab] = useState<Tab>('variables');
  const [showConfirm, setShowConfirm] = useState(false);

  const draftConfig = useAdminControlsStore((s) => s.draftConfig);
  const productionConfig = useAdminControlsStore((s) => s.productionConfig);
  const resetDrafts = useAdminControlsStore((s) => s.resetDrafts);
  const computeDiff = useAdminControlsStore((s) => s.computeDiff);

  // Memoize the diff so it is only recomputed when draft or production changes,
  // not on every render (e.g. isPending toggle, tab switch).
  const currentDiff = useMemo(() => computeDiff(), [computeDiff, draftConfig, productionConfig]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const { isLoading, isError } = useGetConfigs();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutateAsync: applyUpdate, isPending: isApplying } = useUpdateConfigs();
  const { mutateAsync: triggerPipeline, isPending: isTriggering } = useTriggerPipeline();

  const isPending = isApplying || isTriggering;

  // ── Action bar handlers ───────────────────────────────────────────────────
  function handleDiscard() {
    resetDrafts();
    toast.info('Changes discarded.');
    captureAdminEvent('admin_gravity_discarded');
  }

  function handleApplyClick() {
    setShowConfirm(true);
  }

  async function handleConfirm() {
    try {
      // useUpdateConfigs calls computeDiff() internally — no arg needed
      await applyUpdate();
      await triggerPipeline();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to apply: ${msg}`);
      captureAdminEvent('admin_gravity_save_failed', { error: msg });
    } finally {
      setShowConfirm(false);
    }
  }

  function handleCancelConfirm() {
    setShowConfirm(false);
  }

  // ── Loading / error states ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-gray-500">
        Loading configuration…
      </div>
    );
  }

  if (isError || !draftConfig) {
    return (
      <div className="py-20 text-center text-sm text-red-600">
        Failed to load configuration. Refresh the page to retry.
      </div>
    );
  }

  // ── Tab content ───────────────────────────────────────────────────────────
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'variables', label: 'Platform Variables' },
    { id: 'trades',    label: 'Trade Configurations' },
    { id: 'matrix',    label: 'Scope Matrix' },
  ];

  return (
    <>
      {/* Tab nav */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Control panel sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'shrink-0 pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div className="pb-24">
        {activeTab === 'variables' && (
          <GlobalConfigCard variables={draftConfig.logicVariables} />
        )}
        {activeTab === 'trades' && (
          <TradeGrid trades={draftConfig.tradeConfigs} />
        )}
        {activeTab === 'matrix' && (
          <IntensityMatrix cells={draftConfig.scopeMatrix} />
        )}
      </div>

      {/* Sticky action bar — visible only when dirty */}
      <StickyActionBar
        onDiscard={handleDiscard}
        onApply={handleApplyClick}
        isPending={isPending}
      />

      {/* Confirm diff modal */}
      {productionConfig && (
        <ConfirmSyncModal
          open={showConfirm}
          diff={currentDiff}
          productionConfig={productionConfig}
          onConfirm={() => { void handleConfirm(); }}
          onCancel={handleCancelConfirm}
          isPending={isPending}
        />
      )}
    </>
  );
}
