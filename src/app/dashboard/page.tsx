'use client';

import { useState, useEffect } from 'react';
import { FilterPanel } from '@/components/search/FilterPanel';
import { PermitFeed } from '@/components/permits/PermitFeed';

interface DashboardStats {
  total_permits: number;
  active_permits: number;
  permits_this_week: number;
  coa_total: number;
  coa_linked: number;
  coa_upcoming: number;
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

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
          <StatCard
            label="Total Permits"
            value={stats ? stats.total_permits.toLocaleString() : '--'}
          />
          <StatCard
            label="Active Permits"
            value={stats ? stats.active_permits.toLocaleString() : '--'}
          />
          <StatCard
            label="New This Week"
            value={stats ? stats.permits_this_week.toLocaleString() : '--'}
          />
          <StatCard
            label="Upcoming Pre-Permits"
            value={stats ? stats.coa_upcoming.toLocaleString() : '--'}
            accent="purple"
          />
        </div>

        {/* CoA stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="CoA Applications"
            value={stats ? stats.coa_total.toLocaleString() : '--'}
          />
          <StatCard
            label="CoA Linked to Permits"
            value={stats ? stats.coa_linked.toLocaleString() : '--'}
          />
          <StatCard
            label="CoA Unlinked"
            value={stats ? (stats.coa_total - stats.coa_linked).toLocaleString() : '--'}
          />
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'purple';
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      accent === 'purple'
        ? 'bg-purple-50 border-purple-200'
        : 'bg-white border-gray-200'
    }`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${
        accent === 'purple' ? 'text-purple-700' : 'text-gray-900'
      }`}>
        {value}
      </p>
    </div>
  );
}
