// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.7 W6, 11b.3 dated note 2026-11-11 (MF-44, operator O-2 b: not found for every
//            lot until the live switch, after the sign-in and plan check), docs/specs/03-mobile/100_mobile_parcel_cost_tool.md 2.8 (log hygiene).
//
// MF-44 · the MaxBLD web report route (W6). Order: (1) the lot id is checked with the lookup contract's own parcelId rule before anything is read or
// logged; (2) the page gate; (3) while MAXBLD_WEB_LIVE is false, not found for every lot. It reads no report data and meters nothing (the report meter is
// imported only by the lookup route, parcel-tool-meter.logic.test.ts T13); the render of the v21 page from live data lands with the live switch.
import { notFound } from 'next/navigation';
import { ConsumerParcelLookupQuerySchema } from '@/app/api/parcels/lookup/types';
import { requireParcelToolPage } from '@/lib/auth/require-parcel-tool-page';
import { MAXBLD_WEB_LIVE } from '@/lib/surfaces/maxbld-web';

export const dynamic = 'force-dynamic';

export default async function MaxbldReportPage({ params }: { params: Promise<{ parcelId: string }> }) {
  const { parcelId } = await params;
  if (!ConsumerParcelLookupQuerySchema.safeParse({ parcelId }).success) notFound();
  await requireParcelToolPage();
  if (!MAXBLD_WEB_LIVE) notFound();
  // Fail closed: the switch must not be flipped before the live render lands with it (MB-44).
  throw new Error('MF-44: the live web report render lands with the live switch (MB-44)');
}
