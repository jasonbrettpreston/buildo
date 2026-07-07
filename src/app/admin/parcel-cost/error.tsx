'use client';
/**
 * Error boundary for /admin/parcel-cost (Parcel Cost Model Tool).
 * Catches RENDER-time exceptions (the in-component ErrorPanel only covers query errors) and
 * reports to Sentry with a feature tag. Modelled on the control-panel boundary — there is no
 * admin-root error.tsx, so without this a rendering crash goes unreported (Spec 33 §13.2).
 *
 * SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ParcelCostToolError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { feature: 'parcel-cost-tool' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Parcel Cost Tool Error</h2>
        <p className="text-sm text-gray-500 mb-6">
          Something went wrong rendering the parcel view. The error has been reported.
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
