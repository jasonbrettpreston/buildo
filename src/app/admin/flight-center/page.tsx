// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3
//
// /admin/flight-center — the standalone Flight Center (Spec 36, req 1).
// RSC SHELL per Spec 33 §3: this page is a Server Component; the only
// client subtree is <FlightCenterTool> (TanStack Query via the root
// PersistQueryClientProvider in src/app/providers.tsx — no per-page
// QueryClient). Suspense wraps the tool because the drawer's
// LeadDetailInspector reads useSearchParams (parcel-cost precedent).
// Admin-only via route-guard.ts (/admin/* blanket) + the API routes'
// verifyAdminAuth (the real boundary).

import { Suspense } from 'react';
import Link from 'next/link';
import { FlightCenterTool } from '@/components/admin/FlightCenterTool';

export const metadata = {
  title: 'Flight Center — Buildo Admin',
};

export default function FlightCenterPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Flight Center</h1>
              <p className="text-sm text-gray-500">
                Your project watchlist — search any address, save permits and CoAs,
                and watch the delayed / expected-start signals.
              </p>
            </div>
            <Link href="/admin" className="text-sm text-blue-600 hover:underline">
              &larr; Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}
        >
          <FlightCenterTool />
        </Suspense>
      </main>
    </div>
  );
}
