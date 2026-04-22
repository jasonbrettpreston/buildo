'use client';
/**
 * ConfirmSyncModal — diff preview dialog before committing changes.
 * Shows Old → New for each changed variable.
 * Uses Shadcn Dialog on desktop, Shadcn Drawer on mobile (spec §12.5).
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 6
 */

import React from 'react';
import type { MarketplaceConfig, ConfigUpdatePayload } from '@/lib/admin/control-panel';

interface ConfirmSyncModalProps {
  open: boolean;
  diff: ConfigUpdatePayload;
  productionConfig: MarketplaceConfig;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

function formatValue(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return String(val);
}

export function ConfirmSyncModal({
  open,
  diff,
  productionConfig,
  onConfirm,
  onCancel,
  isPending = false,
}: ConfirmSyncModalProps) {
  if (!open) return null;

  const changedVars = diff.logicVariables ?? [];
  const changedTrades = diff.tradeConfigs ?? [];
  const changedCells = diff.scopeMatrix ?? [];
  const totalChanges = changedVars.length + changedTrades.length + changedCells.length;

  return (
    // Backdrop — disabled during pending save to prevent race with in-flight PUT
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={isPending ? undefined : onCancel}
    >
      {/* Modal panel */}
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Confirm Changes</h2>
        <p className="mb-4 text-sm text-gray-500">
          {totalChanges === 0
            ? 'No changes to apply.'
            : `Review ${totalChanges} change(s) before applying.`}
        </p>

        {/* Logic variables diff */}
        {changedVars.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Platform Variables
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="pb-1 font-medium">Variable</th>
                  <th className="pb-1 font-medium">Old</th>
                  <th className="pb-1 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {changedVars.map((lv) => {
                  const prod = productionConfig.logicVariables.find((v) => v.key === lv.key);
                  return (
                    <tr key={lv.key} className="border-b border-gray-50">
                      <td className="py-1 font-mono text-gray-800">{lv.key}</td>
                      <td className="py-1 text-gray-500">{formatValue(prod?.value)}</td>
                      <td className="py-1 font-medium text-blue-700">{formatValue(lv.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Trade configs diff */}
        {changedTrades.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Trade Configurations ({changedTrades.length} trade{changedTrades.length > 1 ? 's' : ''})
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="pb-1 font-medium">Trade</th>
                  <th className="pb-1 font-medium">Field</th>
                  <th className="pb-1 font-medium">Old</th>
                  <th className="pb-1 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {changedTrades.map((t) => {
                  const prod = productionConfig.tradeConfigs.find((p) => p.tradeSlug === t.tradeSlug);
                  // Show one row per changed field
                  const fields = Object.entries(t).filter(([k]) => k !== 'tradeSlug') as Array<[string, unknown]>;
                  return fields.map(([field, newVal]) => (
                    <tr key={`${t.tradeSlug}:${field}`} className="border-b border-gray-50">
                      <td className="py-1 font-mono text-xs text-gray-800">{t.tradeSlug}</td>
                      <td className="py-1 text-xs text-gray-500">{field}</td>
                      <td className="py-1 text-xs text-gray-500">{formatValue(prod ? (prod as unknown as Record<string, number | null | undefined>)[field] : undefined)}</td>
                      <td className="py-1 text-xs font-medium text-blue-700">{formatValue(newVal as number | null | undefined)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Scope matrix diff */}
        {changedCells.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Scope Matrix ({changedCells.length} cell{changedCells.length > 1 ? 's' : ''})
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="pb-1 font-medium">Permit</th>
                  <th className="pb-1 font-medium">Structure</th>
                  <th className="pb-1 font-medium">Old</th>
                  <th className="pb-1 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {changedCells.map((c) => {
                  const prod = productionConfig.scopeMatrix.find(
                    (p) => p.permitType === c.permitType && p.structureType === c.structureType,
                  );
                  return (
                    <tr key={`${c.permitType}:${c.structureType}`} className="border-b border-gray-50">
                      <td className="py-1 font-mono text-xs text-gray-800">{c.permitType}</td>
                      <td className="py-1 font-mono text-xs text-gray-800">{c.structureType}</td>
                      <td className="py-1 text-xs text-gray-500">{formatValue(prod?.gfaAllocationPercentage)}</td>
                      <td className="py-1 text-xs font-medium text-blue-700">{formatValue(c.gfaAllocationPercentage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-11 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700
                       hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || totalChanges === 0}
            className="h-11 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white
                       hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Applying…' : 'Confirm & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
