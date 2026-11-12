// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 and §4 (dated notes 2026-11-12, MF-48 Stage B / MF-74)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7 dated note 2026-11-12 (Stage B), §11b (a page = descriptor + content +
//            library), §0b item 11 (navigation is a route); docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys), §6.5 (stable gates)
//
// Surface S-001 `mobile_parcel_detail` — the lot report (MF-48 Stage B with MF-74; operator 2026-11-12 "Ball y", B-1 a and B-2 a; 2026-11-11
// "you can get rid of the old report it serves no purpose" and "Q1 a Q2 i"). The mount file of the REPORT surface: the lookup query, the two
// callbacks and the host. Everything it shows comes from the binding (ReportBinding.tsx), the shared renderer and the generated content slice;
// the page view itself is built on the server by MF-57's core and sent as `page` (null for every lot until MB-44, so the approved miss text shows).
// Offline, the persisted query cache (mobile/app/_layout.tsx, 24 h) still serves a fetched page. Back goes back with history, else to the Lookup
// route (the MF-53 rule, NAV-AUDIT #3). The old hand-built screen, its sponsor slot and its phone formatting are retired (MF-74 Q2 i).
import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReportPageHost } from '@/components/surfaces/ReportPageHost';
import { REPORT_SLICE, reportScreenState } from '@/components/surfaces/ReportBinding';
import { useParcelLookup } from '@/hooks/useParcelLookup';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

export default function ParcelReportScreen() {
  const router = useRouter();
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const { data, isError, refetch } = useParcelLookup(parcelId);
  const { view, lifecycle } = reportScreenState({ data: data ? { page: data.page ?? null } : undefined, isError });
  const onRetry = useCallback(() => void refetch(), [refetch]);
  const onBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace(PARCEL_TAB_ROUTE.lookup)), [router]);
  return <ReportPageHost view={view} lifecycle={lifecycle} content={REPORT_SLICE.content} onRetry={onRetry} onBack={onBack} />;
}
