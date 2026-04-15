'use client';
/**
 * Admin Control Panel — edit Gravity config (logic_variables, trade_configurations,
 * scope_intensity_matrix) and trigger downstream pipeline re-sync.
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md
 */

import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ControlPanelShell } from '@/features/admin-controls/components/ControlPanelShell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function ControlPanelPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Control Panel</h1>
                <p className="text-sm text-gray-500">
                  Edit Gravity config — logic variables, trade multipliers, and scope matrix
                </p>
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
          <ControlPanelShell />
        </main>
      </div>

      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
