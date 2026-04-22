'use client';
/**
 * Error boundary for /admin/control-panel.
 * Wired to Sentry with a feature tag so we can filter control-panel errors.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 1
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ControlPanelError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { feature: 'admin-controls' },
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Control Panel Error</h2>
        <p className="text-sm text-gray-500 mb-6">
          Something went wrong loading the control panel. The error has been reported.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Try Again
          </button>
          <Link
            href="/admin"
            className="h-11 flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700
                       hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Back to Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
