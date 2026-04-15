'use client';

import Link from 'next/link';

// ---------------------------------------------------------------------------
// Page — Admin Navigation Hub
// ---------------------------------------------------------------------------

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-500">Manage data pipelines and analytics</p>
            </div>
            <a
              href="/dashboard"
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Link
            href="/admin/data-quality"
            className="group bg-white rounded-xl border border-gray-200 p-8 hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              Data Quality
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Pipeline health, coverage metrics, and data freshness
            </p>
          </Link>

          <Link
            href="/admin/market-metrics"
            className="group bg-white rounded-xl border border-gray-200 p-8 hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="text-4xl mb-4">📈</div>
            <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              Market Metrics
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Permit trends, trade analysis, and market intelligence
            </p>
          </Link>

          <Link
            href="/admin/lead-feed"
            className="group bg-white rounded-xl border border-gray-200 p-8 hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="text-4xl mb-4">🎯</div>
            <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              Lead Feed Health
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Feed readiness, cost/timing coverage, engagement, and test feed
            </p>
          </Link>

          <Link
            href="/admin/control-panel"
            className="group bg-white rounded-xl border border-gray-200 p-8 hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="text-4xl mb-4">⚙️</div>
            <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              Control Panel
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Edit Gravity config — logic variables, trade multipliers, and scope matrix
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
