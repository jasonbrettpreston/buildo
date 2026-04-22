// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.3

import Link from 'next/link';
import { LeadFeedHealthDashboard } from '@/components/LeadFeedHealthDashboard';

export default function LeadFeedPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lead Feed Health</h1>
              <p className="text-sm text-gray-500">Feed readiness, coverage, engagement & test tool</p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadFeedHealthDashboard />
      </main>
    </div>
  );
}
