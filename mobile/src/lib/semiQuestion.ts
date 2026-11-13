// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST), §11b.2
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (a redirect fires on the first settled data only)
//
// SEMI-B · the situation of S-093 `mobile_parcel_semi_question`, the one-question page before the report (operator "semi ask a", 2026-11-13; modelled
// on mobile/src/lib/lotMap.ts, the MF-53 "choose your lot" page). Pure helpers the mount feeds and the binding reads; the binding does no maths (FE-05).
//   loading   the lookup is in flight                         ask       the lot is unsure: the three answers, nothing selected at open
//   error     the search page's error classes                 redirect  the lot is NOT unsure (or an older server sent no block): the report
// It reads the SAME lookup entry the report reads (['parcel-lookup', parcelId]), so no extra request. The chosen answer opens the report through
// reportRouteAfterAnswer (lotForm.ts): the answer is lot_form_user_override, carried as a route param (O-12: no server store).
import type { ConsumerParcelLookupResult } from '@/lib/schemas';
import { classifyParcelSearchError, PARCEL_TAB_ROUTE, parcelSearchRoute, type ParcelSearchErrorClass } from '@/lib/parcelSearchMatch';
import { reportRouteAfterAnswer, SEMI_ANSWERS, type SemiAnswer } from '@/lib/lotForm';

export const SEMI_QUESTION_STATES = ['loading', 'ask', 'error', 'redirect'] as const;
export type SemiQuestionState = (typeof SEMI_QUESTION_STATES)[number];

export type SemiQuestionSituation = {
  parcelId: string;
  state: SemiQuestionState;
  errors: ParcelSearchErrorClass;
  /** The answers shown, in the ruled order (empty outside `ask`). */
  answers: SemiAnswer[];
  /** The chosen answer, or null: nothing is selected at open. */
  selected: SemiAnswer | null;
  /** Where Continue goes (the report with the answer), else null (Continue disabled). */
  route: string | null;
  /** The redirect state's target (the report; the Lookup route with no data), else null. */
  navigate: string | null;
};

export function buildSemiQuestionSituation(args: {
  parcelId: string;
  data: ConsumerParcelLookupResult | undefined;
  error: unknown;
  isFetching: boolean;
  schemaDrift: boolean;
  selected: SemiAnswer | null;
}): SemiQuestionSituation {
  const { parcelId, data, error, isFetching } = args;
  const errors = classifyParcelSearchError(error, args.schemaDrift);
  let state: SemiQuestionState;
  let navigate: string | null = null;
  if (error != null) state = 'error';
  else if (!data) {
    if (isFetching) state = 'loading';
    else { state = 'redirect'; navigate = PARCEL_TAB_ROUTE.lookup; }
  } else if (data.lotForm?.unsure === true) state = 'ask';
  else { state = 'redirect'; navigate = parcelSearchRoute('unique', { parcelId, query: '' }); }
  const ask = state === 'ask';
  const selected = ask ? args.selected : null;
  return {
    parcelId,
    state,
    errors: error != null ? errors : { ...errors, unexpected: false },
    answers: ask ? [...SEMI_ANSWERS] : [],
    selected,
    route: selected === null ? null : reportRouteAfterAnswer(parcelId, selected),
    navigate,
  };
}
