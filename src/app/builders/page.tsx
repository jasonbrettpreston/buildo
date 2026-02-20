'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Builder {
  id: number;
  name: string;
  name_normalized: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  wsib_status: string | null;
  permit_count: number;
  enriched_at: string | null;
}

export default function BuildersPage() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(initialSearch);
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
      sort_by: 'permit_count',
      sort_order: 'desc',
    });
    if (search) params.set('search', search);

    fetch(`/api/builders?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setBuilders(data.builders || []);
        setTotal(data.pagination?.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Builders</h1>
              <p className="text-sm text-gray-500">
                {total.toLocaleString()} builders in database
              </p>
            </div>
            <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
              Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search builders by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : builders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No builders found</p>
            <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {builders.map((b) => (
                <a
                  key={b.id}
                  href={`/builders/${b.id}`}
                  className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900">{b.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{b.permit_count} permits</span>
                        {b.google_rating != null && (
                          <span className="text-yellow-500">
                            {'★'.repeat(Math.round(b.google_rating))} {b.google_rating}
                          </span>
                        )}
                        {b.wsib_status === 'active' && (
                          <span className="text-green-600 font-medium">WSIB Active</span>
                        )}
                        {b.phone && <span>{b.phone}</span>}
                      </div>
                    </div>
                    <div className="text-sm text-gray-400 shrink-0 ml-4">
                      {b.enriched_at ? 'Enriched' : 'Pending'}
                    </div>
                  </div>
                </a>
              ))}
            </div>

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
          </>
        )}
      </main>
    </div>
  );
}
