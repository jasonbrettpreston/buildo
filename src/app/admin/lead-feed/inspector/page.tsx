'use client';
/**
 * 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 + §3.6
 *             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3
 *
 * Paired-tab Inspector page. Hosts both:
 *   - <LeadDetailInspector>  (Spec 76 §3.5, Spec 91 §4.3 LeadDetail)
 *   - <FlightJobDetailInspector> (Spec 76 §3.6, Spec 77 §3.3 FlightBoardDetail)
 *
 * URL is the source of truth so deep-links work:
 *   /admin/lead-feed/inspector?id=20-101234--00&tab=lead
 *   /admin/lead-feed/inspector?id=20-101234--00&tab=flight
 *
 * useSearchParams requires `<Suspense>` under the App Router; the
 * client subtree is wrapped in a Suspense boundary at the page level.
 */

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadDetailInspector } from '@/components/admin/LeadDetailInspector';
import { FlightJobDetailInspector } from '@/components/admin/FlightJobDetailInspector';

type Tab = 'lead' | 'flight';

function isValidTab(value: string | null): value is Tab {
  return value === 'lead' || value === 'flight';
}

export default function InspectorPage() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Lead / Flight Job Inspector
                </h1>
                <p className="text-sm text-gray-500">
                  Probe the LeadDetail (§3.5) and FlightBoardDetail (§3.6)
                  endpoints for any saved permit. Toggle tabs to compare the
                  two contract shapes for the same permit.
                </p>
              </div>
              <Link
                href="/admin/lead-feed"
                className="text-sm text-blue-600 hover:underline"
              >
                ← Lead Feed
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense
            fallback={<p className="text-sm text-gray-500">Loading inspector…</p>}
          >
            <InspectorTabs />
          </Suspense>
        </main>
      </div>
    </QueryClientProvider>
  );
}

function InspectorTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const idFromUrl = searchParams.get('id');
  const rawTab = searchParams.get('tab');
  const activeTab: Tab = isValidTab(rawTab) ? rawTab : 'lead';

  // Toggling tabs preserves the id so the operator can compare the two
  // endpoint shapes for the same permit without re-pasting.
  const toggleTab = (next: Tab) => {
    const params = new URLSearchParams();
    if (idFromUrl) params.set('id', idFromUrl);
    params.set('tab', next);
    router.replace(`/admin/lead-feed/inspector?${params.toString()}`);
  };

  return (
    <div data-testid="inspector-tabs">
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => toggleTab('lead')}
          data-testid="inspector-tab-lead"
          aria-current={activeTab === 'lead'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'lead'
              ? 'border-b-2 border-blue-600 text-blue-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lead Detail (§3.5)
        </button>
        <button
          type="button"
          onClick={() => toggleTab('flight')}
          data-testid="inspector-tab-flight"
          aria-current={activeTab === 'flight'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'flight'
              ? 'border-b-2 border-blue-600 text-blue-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Flight Job Detail (§3.6)
        </button>
      </div>

      {activeTab === 'lead' && <LeadDetailInspector initialId={idFromUrl} />}
      {activeTab === 'flight' && (
        <FlightJobDetailInspector initialId={idFromUrl} />
      )}
    </div>
  );
}
