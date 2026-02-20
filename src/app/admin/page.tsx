'use client';

import { useState, useEffect } from 'react';

interface SyncRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  records_total: number;
  records_new: number;
  records_updated: number;
  records_unchanged: number;
  records_errors: number;
  error_message: string | null;
  duration_ms: number | null;
}

export default function AdminPage() {
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sync')
      .then((res) => res.json())
      .then((data) => setSyncRuns(data.runs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const latest = syncRuns[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-500">Sync monitoring & system health</p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/admin/data-quality"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Data Quality
              </a>
              <a
                href="/dashboard"
                className="text-sm text-blue-600 hover:underline"
              >
                &larr; Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Latest sync stats */}
        {latest && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard
              label="Last Sync"
              value={latest.status}
              color={latest.status === 'completed' ? 'text-green-600' : 'text-red-600'}
            />
            <StatCard
              label="Total Records"
              value={latest.records_total?.toLocaleString() || '0'}
            />
            <StatCard
              label="New"
              value={latest.records_new?.toLocaleString() || '0'}
              color="text-green-600"
            />
            <StatCard
              label="Updated"
              value={latest.records_updated?.toLocaleString() || '0'}
              color="text-blue-600"
            />
            <StatCard
              label="Duration"
              value={latest.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : 'N/A'}
            />
          </div>
        )}

        {/* Sync history table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Sync History</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : syncRuns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No sync runs yet. Trigger a sync to see data here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-left">Started</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">New</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                    <th className="px-4 py-3 text-right">Unchanged</th>
                    <th className="px-4 py-3 text-right">Errors</th>
                    <th className="px-4 py-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {syncRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-500">
                        #{run.id}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            run.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : run.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {run.records_total?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {run.records_new?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        {run.records_updated?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {run.records_unchanged?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {run.records_errors || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {run.duration_ms
                          ? `${(run.duration_ms / 1000).toFixed(1)}s`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Error log */}
        {latest?.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              Last Error
            </h3>
            <pre className="text-xs text-red-700 whitespace-pre-wrap">
              {latest.error_message}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
