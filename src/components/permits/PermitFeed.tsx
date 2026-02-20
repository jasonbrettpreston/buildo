'use client';

import { useState, useEffect, useCallback } from 'react';
import { PermitCard } from './PermitCard';
import { useRouter } from 'next/navigation';

interface PermitWithTrades {
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

interface PermitFeedProps {
  filters?: Record<string, string>;
  savedPermitIds?: Set<string>;
  onSave?: (permitNum: string, revisionNum: string) => void;
}

export function PermitFeed({ filters = {}, savedPermitIds, onSave }: PermitFeedProps) {
  const router = useRouter();
  const [permits, setPermits] = useState<PermitWithTrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', ...filters });
      const res = await fetch(`/api/permits?${params}`);
      const data = await res.json();
      setPermits(data.data || []);
      setTotalPages(data.pagination?.total_pages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch permits:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchPermits();
  }, [fetchPermits]);

  const handleView = (permit: PermitWithTrades) => {
    router.push(`/permits/${permit.permit_num}--${permit.revision_num}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-3 bg-gray-200 rounded w-full mb-1" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (permits.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No permits found</p>
        <p className="text-gray-400 text-sm mt-1">
          Try adjusting your filters or search terms
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {total.toLocaleString()} permits found
        </p>
      </div>

      <div className="space-y-3">
        {permits.map((permit) => {
          const permitId = `${permit.permit_num}--${permit.revision_num}`;
          return (
            <PermitCard
              key={permitId}
              permit={permit}
              trades={permit.trades}
              saved={savedPermitIds?.has(permitId)}
              onView={() => handleView(permit)}
              onSave={
                onSave
                  ? () => onSave(permit.permit_num, permit.revision_num)
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
