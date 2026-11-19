// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 and §4 (dated note 2026-11-13, SEMI-B)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST), §11b (a page = descriptor + content + library)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys), §6.5 (a redirect fires on the first settled data only)
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4
//
// Surface S-093 `mobile_parcel_semi_question` — the one-question page before the report (operator "semi ask a", 2026-11-13), on the MF-53 "choose your
// lot" pattern (disambiguate.tsx). The mount file of a converted surface: hooks, the redirect effect and the callbacks only; everything it shows comes
// from the binding (SemiQuestionBinding.tsx), the shared renderer and the content file. It reads the SAME query as the report (['parcel-lookup', id]),
// so it makes no extra request. Nothing is selected at open. The answer is the owner's lot_form_user_override, carried to the report as a route param
// (lotForm.ts; O-12: the pipeline never reads it, no server store); Continue REPLACES this page with the report so Back from the report never returns here.
// SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): Continue first fetches the same lookup with the one flag `semi: 'answered'`, which lets the server count
// the lot once its report is produced, stores the result in the report's cache entry, then opens the report. A failed fetch shows the built error
// state and does not navigate; Try again clears it and the chosen answer is still there.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SurfaceRenderer, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { SEMI_QUESTION_SLICE, semiQuestionData, semiQuestionProps } from '@/components/surfaces/SemiQuestionBinding';
import { fetchParcelLookup, useParcelLookup, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { SEMI_ANSWERS, type SemiAnswer } from '@/lib/lotForm';
import { buildSemiQuestionSituation } from '@/lib/semiQuestion';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

export default function SemiQuestionScreen() {
  const router = useRouter();
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  const id = typeof parcelId === 'string' ? parcelId : '';
  const [selected, setSelected] = useState<SemiAnswer | null>(null);
  const { data, isFetching, error, refetch } = useParcelLookup(id || undefined);
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const submittingRef = useRef(false);

  const situation = useMemo(
    () => buildSemiQuestionSituation({ parcelId: id, data, error: submitError ?? error, isFetching, schemaDrift: (submitError ?? error) instanceof ParcelLookupSchemaError, selected }),
    [id, data, error, submitError, isFetching, selected],
  );

  // The redirect state (a lot that is not unsure) replaces this page once, on settled data, never on a background refetch.
  const redirectedRef = useRef(false);
  const target = situation.navigate;
  useEffect(() => {
    if (isFetching || target === null || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(target);
  }, [target, isFetching, router]);

  // Continue: the answered lookup, stored under the report's key, then the report; never throws, a second press while it runs is ignored.
  const continueToReport = useCallback(async (route: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const result = await fetchParcelLookup({ parcelId: id, semi: 'answered' });
      queryClient.setQueryData(['parcel-lookup', id], result);
      redirectedRef.current = true;
      router.replace(route);
    } catch (e) {
      setSubmitError(e);
    } finally {
      submittingRef.current = false;
    }
  }, [id, queryClient, router]);

  const actions = useMemo(
    () => ({
      change_input: () => undefined,
      set_input: () => undefined,
      retry: () => { if (submitError != null) setSubmitError(null); else void refetch(); },
      // The renderer's `select` carries a string; here it is the answer (the descriptor's deviation entry).
      select: (answer: string) => {
        if ((SEMI_ANSWERS as readonly string[]).includes(answer)) setSelected(answer as SemiAnswer);
      },
      push: (route: string) => void continueToReport(route),
      back: () => (router.canGoBack() ? router.back() : router.replace(PARCEL_TAB_ROUTE.lookup)),
    }),
    [refetch, router, submitError, continueToReport],
  );

  return (
    <SurfaceRenderer tree={semiQuestionProps(situation) as SurfaceTree} content={SEMI_QUESTION_SLICE.content} data={semiQuestionData(situation)} actions={actions} />
  );
}
