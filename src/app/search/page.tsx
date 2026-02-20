'use client';

import { useState, useEffect, useCallback } from 'react';
import { FilterPanel } from '@/components/search/FilterPanel';
import { PermitCard } from '@/components/permits/PermitCard';
import { useRouter, useSearchParams } from 'next/navigation';

interface PermitResult {
  permit_num: string;
  revision_num: string;
  permit_type: string;
  work: string;
  street_num: string;
  street_name: string;
  street_type: string;
  city: string;
  ward: string;
  status: string;
  description: string;
  est_const_cost: number | null;
  issued_date: string | null;
  builder_name: string;
  trades?: {
    trade_slug: string;
    trade_name: string;
    color: string;
    lead_score: number;
    confidence: number;
    phase: string;
  }[];
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      initial[key] = value;
    });
    return initial;
  });
  const [results, setResults] = useState<PermitResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('lead_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort_by: sortBy,
        sort_order: sortOrder,
        ...filters,
      });
      const res = await fetch(`/api/permits?${params}`);
      const data = await res.json();
      setResults(data.data || []);
      setTotalPages(data.pagination?.total_pages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  function handleFilterChange(newFilters: Record<string, string>) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleView(permit: PermitResult) {
    router.push(`/permits/${permit.permit_num}--${permit.revision_num}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Search Permits</h1>
              <p className="text-sm text-gray-500">
                Full-text search across all Toronto building permits
              </p>
            </div>
            <nav className="flex items-center gap-4">
              <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
                Dashboard
              </a>
              <a href="/map" className="text-sm text-gray-600 hover:text-gray-900">
                Map View
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="mb-6">
          <FilterPanel onFilterChange={handleFilterChange} initialFilters={filters} />
        </div>

        {/* Sort controls */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {loading ? 'Searching...' : `${total.toLocaleString()} results`}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="lead_score">Lead Score</option>
              <option value="issued_date">Issued Date</option>
              <option value="est_const_cost">Est. Cost</option>
              <option value="application_date">Application Date</option>
            </select>
            <button
              onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? '\u2191' : '\u2193'}
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
              >
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No permits found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try adjusting your search terms or filters
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((permit) => (
              <PermitCard
                key={`${permit.permit_num}--${permit.revision_num}`}
                permit={permit}
                trades={permit.trades}
                onView={() => handleView(permit)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
