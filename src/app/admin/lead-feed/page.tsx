// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.3 + §3.4 + §3.5

import Link from 'next/link';
import { TestFeedTool } from '@/components/admin/TestFeedTool';

export default function AdminLeadFeedPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Lead Feed Testing
              </h1>
              <p className="text-sm text-gray-500">
                Simulate geographic queries directly against the backend
              </p>
            </div>
            <Link href="/admin" className="text-sm text-blue-600 hover:underline">
              &larr; Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <TestFeedTool />

        {/* Spec 76 §3.4 + §3.5 + §3.6 sub-tools — Cycle 4 P4 nav. */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">
            More tools
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/admin/lead-feed/flight-center"
              className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all"
            >
              <div className="text-3xl mb-3">🛫</div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                Flight Center
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Search permits, claim them to your admin Flight Board, watch
                the predicted-start window.
              </p>
            </Link>

            <Link
              href="/admin/lead-feed/inspector"
              className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all"
            >
              <div className="text-3xl mb-3">🔍</div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                Detail Inspectors
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Probe LeadDetail (§3.5) and FlightBoardDetail (§3.6) endpoints
                for any saved permit. Compare contract shapes side-by-side.
              </p>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
