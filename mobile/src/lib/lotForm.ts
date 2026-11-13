// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4, the lot_form_user_override and lot_form_effective rows (dated note 2026-11-13)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B)
//            scripts/surfaces/_schema/report-presentation.json lot_form_rules.semi_half (Q-1, Q-2, Q-3)
//
// SEMI-B · the pure rules of the pre-report semi question (operator "semi all y" and "semi ask a", 2026-11-13). The server names the lot's form and an
// `unsure` flag (the view parcel_lot_form, migration 320); the app asks the one question ONLY when unsure is true; clear semis and clear detached lots
// go straight to the report. The answer is the owner's input `lot_form_user_override` (O-12: the pipeline never reads it; there is no server store):
// it travels as a route param to the report, which applies it through `lotFormEffective` (P5.7). "Not sure" writes nothing: the semi view is the
// detected form, and the post-report "This isn't a semi" correction stays.
import type { ConsumerParcelLookupResult, ParcelLotForm } from '@/lib/schemas';

export type LotForm = ParcelLotForm['detected'];

/** The three answers, in the ruled order (the labels are content keys, never copy here). */
export const SEMI_ANSWERS = ['yes', 'no', 'not_sure'] as const;
export type SemiAnswer = (typeof SEMI_ANSWERS)[number];

const BASE = '/(app)/parcel-tool';
/** The report route param that says the question was answered (the report never asks twice). */
export const SEMI_PARAM = 'semi';
export const SEMI_ANSWERED = 'answered';
/** The report route param carrying lot_form_user_override. */
export const OVERRIDE_PARAM = 'lotFormOverride';

export const semiQuestionRoute = (parcelId: string): string => `${BASE}/semi-question?parcelId=${encodeURIComponent(parcelId)}`;

/** Ask only in the unsure band, and only once: an older server (no block) or `semi=answered` on the route never asks. */
export function needsSemiQuestion(data: Partial<ConsumerParcelLookupResult> | undefined, semiParam: string | undefined): boolean {
  return data?.lotForm?.unsure === true && semiParam !== SEMI_ANSWERED; // only the exact sentinel means answered (a stray param asks, never skips)
}

/** yes -> semi_half, no -> detached, not sure -> nothing is written. */
export function answerToOverride(answer: SemiAnswer): LotForm | null {
  return answer === 'yes' ? 'semi_half' : answer === 'no' ? 'detached' : null;
}

/** The report route after an answer: `semi=answered`, plus the override when one is written. */
export function reportRouteAfterAnswer(parcelId: string, answer: SemiAnswer): string {
  const override = answerToOverride(answer);
  return `${BASE}/${encodeURIComponent(parcelId)}?${SEMI_PARAM}=${SEMI_ANSWERED}${override === null ? '' : `&${OVERRIDE_PARAM}=${override}`}`;
}

/** lot_form_effective = lot_form_user_override ?? lot_form_detected (mirror of src/lib/parcels/lot-form.ts lotFormEffective). */
export function lotFormEffective(detected: LotForm, override: LotForm | null | undefined): LotForm {
  return override ?? detected;
}
