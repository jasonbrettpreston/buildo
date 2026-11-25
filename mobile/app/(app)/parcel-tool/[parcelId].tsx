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
// task-267 LOAD.2 + task-317 LOAD.4 (PLAN-267-v2 step 7): the reads and the clock come from useReportScreen (the fast read first, then the report read);
// the screen is reportScreenState over their stable signals (no isFetching); the wall stays the first branch while no page is shown.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ReportPageHost } from '@/components/surfaces/ReportPageHost';
import { REPORT_SLICE, reportScreenState } from '@/components/surfaces/ReportBinding';
import { useReportScreen } from '@/hooks/useParcelLookup';
import { useGoBack, useSettledRedirect } from '@/hooks/useParcelPageHooks';
import { useWallState } from '@/hooks/useWallState';
import { needsSemiQuestion, semiQuestionRoute, SEMI_PARAM } from '@/lib/lotForm';

export default function ParcelReportScreen() {
  const { parcelId, [SEMI_PARAM]: semi } = useLocalSearchParams<{ parcelId: string; semi?: string }>();
  const semiParam = typeof semi === 'string' ? semi : undefined;
  const r = useReportScreen(parcelId, semiParam);
  const { data, isFetching, error } = r;
  // task-452 SEARCHFIX.4: a refused lookup (limit, expired) shows the wall once the entitlement read has answered; while it is pending the loading
  // lifecycle shows, never the error one; a shown report is never replaced (the wall is drawn only while view is null).
  const { kind: wallKind, wall } = useWallState(error);
  // SEMI-B (operator "semi ask a", 2026-11-13): an unsure lot (the doubt band of Spec 78 O-4) is asked the one question BEFORE the report shows. The
  // redirect fires once, on the first settled data (Spec 99 §6.5), never on a background refetch; a `semi` param means it was answered, and an older
  // server that sends no lotForm never asks. Clear semis and clear detached lots stay on the report.
  const ask = needsSemiQuestion(data, semiParam);
  useSettledRedirect(ask && parcelId ? semiQuestionRoute(parcelId) : null, isFetching);
  // SRCH.METER-2 (task-360, UX-2c): the server holds an unsure lot's page (null) until the answer, so while the question is owed the screen shows the loading
  // state, never the miss text, on the settled render before the redirect above fires.
  const { view, lifecycle, screen } = reportScreenState({
    data: data && !ask ? { page: data.page ?? null } : undefined, checked: ask ? null : r.checked, isError: r.isError, elapsedMs: r.elapsedMs,
    gaveUp: r.gaveUp, answeredThisVisit: r.answeredThisVisit && !ask, opened: r.opened, linesFull: r.linesFull,
  });
  const onBack = useGoBack();
  const waiting = view === null && wallKind === 'wait';
  return (
    <ReportPageHost
      view={view} lifecycle={waiting ? 'loading' : lifecycle} content={REPORT_SLICE.content} onRetry={r.retry} onBack={onBack} wall={view === null ? wall : null}
      screen={waiting ? 'holding' : screen} checked={ask ? null : r.checked} lineElapsedMs={r.lineElapsedMs} address={r.address} onOpen={r.open}
    />
  );
}
