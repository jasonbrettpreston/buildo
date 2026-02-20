'use client';

import { useState } from 'react';
import { FilterPanel } from '@/components/search/FilterPanel';
import { PermitFeed } from '@/components/permits/PermitFeed';

export default function DashboardPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Buildo</h1>
              <p className="text-sm text-gray-500">
                Toronto Building Permit Leads
              </p>
            </div>
            <nav className="flex items-center gap-4">
              <a
                href="/search"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Search
              </a>
              <a
                href="/map"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Map
              </a>
              <a
                href="/admin"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Admin
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Permits" value="237,000+" />
          <StatCard label="Active Trades" value="20" />
          <StatCard label="New Today" value="--" />
          <StatCard label="Updated Today" value="--" />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterPanel onFilterChange={setFilters} />
        </div>

        {/* Permit Feed */}
        <PermitFeed filters={filters} />
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
