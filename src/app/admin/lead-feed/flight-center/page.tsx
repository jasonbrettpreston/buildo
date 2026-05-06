'use client';
/**
 * 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
 *             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3
 *             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
 *
 * Flight Center page — admin-scoped flight board UI mirroring mobile
 * Spec 77 §3.2. Server-component-first per Spec 33 §3, but THIS page
 * renders the polling tool which is `'use client'`, so the smallest
 * client subtree is the page itself. The /admin layout above stays
 * server-rendered.
 *
 * QueryClient lives PER MOUNT via useState(() => new QueryClient(...)),
 * not at module scope — same pattern Cycle 2 Phase 4 established for
 * the App Health Dashboard. Avoids HMR cross-mount poisoning + keeps
 * cache scoped to the page lifecycle.
 */

import { useState } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlightCenterTool } from '@/components/admin/FlightCenterTool';

export default function FlightCenterPage() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Flight Center</h1>
                <p className="text-sm text-gray-500">
                  Admin-scoped flight board — search permits, claim them, watch the
                  predicted-start window.
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
          <FlightCenterTool />
        </main>
      </div>
    </QueryClientProvider>
  );
}
