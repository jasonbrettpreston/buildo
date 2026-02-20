'use client';

import { DataQualityDashboard } from '@/components/DataQualityDashboard';

export default function DataQualityPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Data Quality
              </h1>
              <p className="text-sm text-gray-500">
                Matching coverage, confidence & freshness across all data sources
              </p>
            </div>
            <a
              href="/admin"
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Admin
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DataQualityDashboard />
      </main>
    </div>
  );
}
