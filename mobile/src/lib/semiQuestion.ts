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
import slice from '@/generated/surfaces/mobile_parcel_semi_question.json';
import { sliceNumber } from '@/lib/sliceConfig';
import type { ConsumerParcelLookupResult } from '@/lib/schemas';
import { classifyParcelSearchError, PARCEL_TAB_ROUTE, parcelSearchRoute, type ParcelSearchErrorClass } from '@/lib/parcelSearchMatch';
import { reportRouteAfterAnswer, SEMI_ANSWERS, type SemiAnswer } from '@/lib/lotForm';

/** SRCH.SEMI-3 (task-361, LX-E1): how long Continue waits for the answered lookup before it ends in the built error state (a timeframe; operator item in the lane report). FIX.TUNE (task-378): read from the surface config `continue_wait_ms` (the generated slice), not typed here. */
export const SEMI_CONTINUE_WAIT_MS: number = sliceNumber(slice, 'continue_wait_ms');

class SemiContinueTimeoutError extends Error {
  constructor() {
    super('The answered lookup did not settle in time');
    this.name = 'SemiContinueTimeoutError';
  }
}

/** Resolves or rejects as `p` does, or rejects with SemiContinueTimeoutError after `ms`; the timer is cleared on either settle and a late settle of `p` is handled. */
export function boundedWait<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SemiContinueTimeoutError()), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

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
  /** Continue's answered lookup is running (SRCH.SEMI-3): true only in the ask state. */
  busy: boolean;
  /** The redirect state's target (the report; the Lookup route for an empty parcel id), else null. task-450 V5: no data with an id is loading. */
  navigate: string | null;
};

export function buildSemiQuestionSituation(args: {
  parcelId: string;
  data: ConsumerParcelLookupResult | undefined;
  error: unknown;
  /** Kept in the type so callers do not change; not read since task-450 V5 (Spec 99 §6.5: isFetching is not a render gate). */
  isFetching: boolean;
  schemaDrift: boolean;
  selected: SemiAnswer | null;
  /** Continue's answered lookup is running; optional, false when omitted. */
  submitting?: boolean;
}): SemiQuestionSituation {
  const { parcelId, data, error } = args;
  const errors = classifyParcelSearchError(error, args.schemaDrift);
  let state: SemiQuestionState;
  let navigate: string | null = null;
  if (error != null) state = 'error';
  else if (!data) {
    // task-450 V5 (Spec 99 §6.5 :527-530; QUESTIONS-RULED.md Q8.4 a): a paused offline first fetch reports isFetching false with no data, so no data
    // with a parcel id is loading until the lookup settles; only an empty parcel id has nothing to wait for and goes to Lookup.
    if (parcelId) state = 'loading';
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
    busy: ask && args.submitting === true,
    navigate,
  };
}
