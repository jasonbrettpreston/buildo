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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SurfaceRenderer, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { SEMI_QUESTION_SLICE, semiQuestionData, semiQuestionProps } from '@/components/surfaces/SemiQuestionBinding';
import { useParcelLookup, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { SEMI_ANSWERS, type SemiAnswer } from '@/lib/lotForm';
import { buildSemiQuestionSituation } from '@/lib/semiQuestion';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

export default function SemiQuestionScreen() {
  const router = useRouter();
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  const id = typeof parcelId === 'string' ? parcelId : '';
  const [selected, setSelected] = useState<SemiAnswer | null>(null);
  const { data, isFetching, error, refetch } = useParcelLookup(id || undefined);

  const situation = useMemo(
    () => buildSemiQuestionSituation({ parcelId: id, data, error, isFetching, schemaDrift: error instanceof ParcelLookupSchemaError, selected }),
    [id, data, error, isFetching, selected],
  );

  // The redirect state (a lot that is not unsure) replaces this page once, on settled data, never on a background refetch.
  const redirectedRef = useRef(false);
  const target = situation.navigate;
  useEffect(() => {
    if (isFetching || target === null || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(target);
  }, [target, isFetching, router]);

  const actions = useMemo(
    () => ({
      change_input: () => undefined,
      set_input: () => undefined,
      retry: () => void refetch(),
      // The renderer's `select` carries a string; here it is the answer (the descriptor's deviation entry).
      select: (answer: string) => {
        if ((SEMI_ANSWERS as readonly string[]).includes(answer)) setSelected(answer as SemiAnswer);
      },
      push: (route: string) => router.replace(route),
      open_account: () => undefined,
      back: () => (router.canGoBack() ? router.back() : router.replace(PARCEL_TAB_ROUTE.lookup)),
    }),
    [refetch, router],
  );

  return (
    <SurfaceRenderer tree={semiQuestionProps(situation) as SurfaceTree} content={SEMI_QUESTION_SLICE.content} data={semiQuestionData(situation)} actions={actions} />
  );
}
