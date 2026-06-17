// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//
// Admin page host for the Step-Output Inspector. Reads ?slug from the URL (set by the
// FreshnessTimeline "Inspect output" link) and renders the row browser. Admin-only via
// route-guard.ts (/admin/* blanket) + the API's verifyAdminAuth.

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { StepOutputInspector } from '@/components/admin/StepOutputInspector';

function StepOutputPageInner() {
  const slug = useSearchParams().get('slug');
  return <StepOutputInspector initialSlug={slug} />;
}

export default function StepOutputPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <StepOutputPageInner />
    </Suspense>
  );
}
