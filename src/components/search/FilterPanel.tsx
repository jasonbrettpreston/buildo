'use client';

import { useState, useEffect } from 'react';

interface Trade {
  slug: string;
  name: string;
  color: string;
}

interface FilterPanelProps {
  onFilterChange: (filters: Record<string, string>) => void;
  initialFilters?: Record<string, string>;
}

const STATUS_OPTIONS = [
  'Inspection',
  'Permit Issued',
  'Revision Issued',
  'Under Review',
  'Issuance Pending',
  'Application On Hold',
  'Work Not Started',
  'Revocation Pending',
  'Pending Cancellation',
  'Abandoned',
];

const WARD_OPTIONS = Array.from({ length: 25 }, (_, i) =>
  String(i + 1).padStart(2, '0')
);

const PERMIT_TYPE_OPTIONS = [
  { value: 'Small Residential Projects', label: 'Small Residential' },
  { value: 'Plumbing(PS)', label: 'Plumbing (PS)' },
  { value: 'Mechanical(MS)', label: 'Mechanical (MS)' },
  { value: 'Building Additions/Alterations', label: 'Additions/Alterations' },
  { value: 'Drain and Site Service', label: 'Drain & Site Service' },
  { value: 'New Houses', label: 'New Houses' },
  { value: 'Fire/Security Upgrade', label: 'Fire/Security' },
  { value: 'Demolition Folder (DM)', label: 'Demolition (DM)' },
  { value: 'New Building', label: 'New Building' },
  { value: 'Residential Building Permit', label: 'Residential Permit' },
  { value: 'Non-Residential Building Permit', label: 'Non-Residential' },
  { value: 'Designated Structures', label: 'Designated Structures' },
  { value: 'Temporary Structures', label: 'Temporary Structures' },
  { value: 'Partial Permit', label: 'Partial Permit' },
];

const STRUCTURE_TYPE_OPTIONS = [
  { value: 'SFD - Detached', label: 'Detached' },
  { value: 'SFD - Semi-Detached', label: 'Semi-Detached' },
  { value: 'Office', label: 'Office' },
  { value: 'Apartment Building', label: 'Apartment' },
  { value: 'SFD - Townhouse', label: 'Townhouse' },
  { value: 'Retail Store', label: 'Retail' },
  { value: 'Multiple Unit Building', label: 'Multi-Unit' },
  { value: '2 Unit - Detached', label: '2 Unit Detached' },
  { value: 'Multiple Use/Non Residential', label: 'Multi-Use Non-Res' },
  { value: 'Other', label: 'Other' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Laneway / Rear Yard Suite', label: 'Laneway Suite' },
  { value: 'Restaurant 30 Seats or Less', label: 'Restaurant (Small)' },
  { value: 'Stacked Townhouses', label: 'Stacked Townhouse' },
  { value: 'Mixed Use/Res w Non Res', label: 'Mixed Use' },
];

const WORK_OPTIONS = [
  { value: 'Building Permit Related(PS)', label: 'Plumbing Related' },
  { value: 'Building Permit Related(MS)', label: 'Mechanical Related' },
  { value: 'Interior Alterations', label: 'Interior Alterations' },
  { value: 'Multiple Projects', label: 'Multiple Projects' },
  { value: 'New Building', label: 'New Building' },
  { value: 'Building Permit Related (DR)', label: 'Drain Related' },
  { value: 'Addition(s)', label: 'Additions' },
  { value: 'Demolition', label: 'Demolition' },
  { value: 'Fire Alarm', label: 'Fire Alarm' },
  { value: 'Garage', label: 'Garage' },
  { value: 'Garage Repair/Reconstruction', label: 'Garage Repair' },
  { value: 'Porch', label: 'Porch' },
  { value: 'Deck', label: 'Deck' },
  { value: 'Underpinning', label: 'Underpinning' },
  { value: 'Sprinklers', label: 'Sprinklers' },
];

const SORT_OPTIONS = [
  { value: 'issued_date:desc', label: 'Recently Issued' },
  { value: 'application_date:desc', label: 'Recently Applied' },
  { value: 'est_const_cost:desc', label: 'Highest Cost' },
  { value: 'est_const_cost:asc', label: 'Lowest Cost' },
];

export function FilterPanel({ onFilterChange, initialFilters = {} }: FilterPanelProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search || '');
  const [showTradeInfo, setShowTradeInfo] = useState(false);

  const isPrePermitSource = filters.source === 'pre_permits';

  useEffect(() => {
    fetch('/api/trades')
      .then((res) => res.json())
      .then((data) => setTrades(data.trades || []))
      .catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilter('search', searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function updateFilter(key: string, value: string) {
    const next = { ...filters };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    setFilters(next);
    onFilterChange(next);
  }

  function updateSort(value: string) {
    const next = { ...filters };
    if (value) {
      const [sortBy, sortOrder] = value.split(':');
      next.sort_by = sortBy;
      next.sort_order = sortOrder;
    } else {
      delete next.sort_by;
      delete next.sort_order;
    }
    setFilters(next);
    onFilterChange(next);
  }

  function clearAll() {
    setFilters({});
    setSearchInput('');
    onFilterChange({});
  }

  const activeCount = Object.keys(filters).filter((k) => filters[k]).length;

  function updateSource(source: string) {
    const next: Record<string, string> = {};
    // Keep only search and ward when switching to pre-permits; keep all when switching back
    if (source === 'pre_permits') {
      if (filters.search) next.search = filters.search;
      if (filters.ward) next.ward = filters.ward;
      next.source = 'pre_permits';
    } else {
      // Switching back to permits: carry over search and ward
      if (filters.search) next.search = filters.search;
      if (filters.ward) next.ward = filters.ward;
    }
    setFilters(next);
    onFilterChange(next);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Source Toggle */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => updateSource('permits')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            !isPrePermitSource
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Building Permits
        </button>
        <button
          type="button"
          onClick={() => updateSource('pre_permits')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            isPrePermitSource
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pre-Permits (Upcoming)
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder={isPrePermitSource
            ? 'Search pre-permits by address, description, applicant...'
            : 'Search permits by address, description, builder...'}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Ward — always visible (applies to both permits and pre-permits) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Ward
          </label>
          <select
            value={filters.ward || ''}
            onChange={(e) => updateFilter('ward', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="">All wards</option>
            {WARD_OPTIONS.map((w) => (
              <option key={w} value={w}>
                Ward {w}
              </option>
            ))}
          </select>
        </div>

        {/* Status — only for building permits */}
        {!isPrePermitSource && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Permit Type — only for building permits */}
        {!isPrePermitSource && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Permit Type
            </label>
            <select
              value={filters.permit_type || ''}
              onChange={(e) => updateFilter('permit_type', e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">All types</option>
              {PERMIT_TYPE_OPTIONS.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Permit-only filters: Trade, Cost, Structure, Work, Sort */}
      {!isPrePermitSource && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {/* Trade */}
            <div className="relative">
              <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
                Trade
                <button
                  type="button"
                  onClick={() => setShowTradeInfo(!showTradeInfo)}
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[9px] font-bold hover:bg-blue-500 transition-colors"
                  aria-label="How trades are classified"
                >
                  i
                </button>
              </label>
              {showTradeInfo && (
                <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 text-sm">How Trades Are Classified</span>
                    <button
                      type="button"
                      onClick={() => setShowTradeInfo(false)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                  <p className="mb-2">
                    Trades are <strong>inferred</strong> from permit metadata, not from actual building plans. Classifications are estimates that improve over time.
                  </p>
                  <table className="w-full text-[10px] border-collapse mb-2">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 pr-2 font-semibold text-gray-700">Tier</th>
                        <th className="text-left py-1 pr-2 font-semibold text-gray-700">Source</th>
                        <th className="text-left py-1 font-semibold text-gray-700">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 pr-2">1 - Direct</td>
                        <td className="py-1 pr-2">Permit Type code</td>
                        <td className="py-1 text-green-600 font-medium">95%</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 pr-2">2 - Pattern</td>
                        <td className="py-1 pr-2">Work, Structure Type</td>
                        <td className="py-1 text-yellow-600 font-medium">50-85%</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-2">3 - Keywords</td>
                        <td className="py-1 pr-2">Description scan</td>
                        <td className="py-1 text-orange-500 font-medium">50-70%</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-gray-400 italic">
                    This linkage can be updated as classification rules are refined.
                  </p>
                </div>
              )}
              <select
                value={filters.trade_slug || ''}
                onChange={(e) => updateFilter('trade_slug', e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">All trades</option>
                {trades.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cost range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Min Cost
              </label>
              <select
                value={filters.min_cost || ''}
                onChange={(e) => updateFilter('min_cost', e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">Any</option>
                <option value="10000">$10K+</option>
                <option value="50000">$50K+</option>
                <option value="100000">$100K+</option>
                <option value="500000">$500K+</option>
                <option value="1000000">$1M+</option>
                <option value="5000000">$5M+</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Sort By
              </label>
              <select
                value={filters.sort_by && filters.sort_order ? `${filters.sort_by}:${filters.sort_order}` : ''}
                onChange={(e) => updateSort(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">Default</option>
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {/* Structure Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Structure Type
              </label>
              <select
                value={filters.structure_type || ''}
                onChange={(e) => updateFilter('structure_type', e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">All structures</option>
                {STRUCTURE_TYPE_OPTIONS.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Work */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Work
              </label>
              <select
                value={filters.work || ''}
                onChange={(e) => updateFilter('work', e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="">All work types</option>
                {WORK_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Active filters */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {activeCount} filter{activeCount !== 1 ? 's' : ''} active
          </span>
          <button
            onClick={clearAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
