// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md
//
// Admin page host for the Parcel Cost Model Tool — the admin prototype of the future consumer
// parcel screen. Thin shell: all state + rendering live in <ParcelCostTool />. Admin-only via
// route-guard.ts (/admin/* blanket) + the API's verifyAdminAuth.

'use client';

import { Suspense } from 'react';
import { ParcelCostTool } from '@/components/admin/ParcelCostTool';

export default function ParcelCostPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <ParcelCostTool />
    </Suspense>
  );
}
