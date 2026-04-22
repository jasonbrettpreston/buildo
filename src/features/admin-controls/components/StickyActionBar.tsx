'use client';
/**
 * StickyActionBar — visible only when hasUnsavedChanges is true.
 * Contains "Discard Changes" and "Apply & Re-Sync" buttons.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 6
 */

import React from 'react';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

interface StickyActionBarProps {
  onDiscard: () => void;
  onApply: () => void;
  isPending?: boolean;
}

export function StickyActionBar({ onDiscard, onApply, isPending = false }: StickyActionBarProps) {
  const hasUnsavedChanges = useAdminControlsStore((s) => s.hasUnsavedChanges);

  if (!hasUnsavedChanges) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-600">
          You have unsaved changes — sync to update the pipeline.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={isPending}
            className="h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700
                       hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Discard Changes
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isPending}
            className="h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Applying…' : 'Apply & Re-Sync'}
          </button>
        </div>
      </div>
    </div>
  );
}
