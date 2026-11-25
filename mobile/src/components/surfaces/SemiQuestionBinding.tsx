// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST), §11b.2 (one binding per archetype per platform; refs only) and its
//            dated note 2026-11-10 (the binding standard), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-31,
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B).
//
// SEMI-B · the mobile LIST binding of S-093 `mobile_parcel_semi_question`, the one-question page before the report (operator "semi ask a", 2026-11-13),
// on the MF-53 pattern (LotMapBinding.tsx). Pure: no React, no JSX. `semiQuestionProps(situation)` maps one situation (mobile/src/lib/semiQuestion.ts)
// to a props tree; that tree IS the golden. Every displayed value is a ref: {"content": k} a key of mobile_parcel_semi_question.content.json (through
// the generated slice), {"contract": p} a 429 detail, {"derived": n} a value from the situation (the closed list SEMI_QUESTION_DERIVED_NAMES).
// The three answers are radio cards (the lot-card idiom), nothing selected at open, Continue disabled until one is chosen. Classes, hexes and numbers
// are the MF-53 layout table (mobile/src/constants/lotMap.ts); SRCH.SEMI stage 2 (task-319, MF-93) draws the approved mock with the semi-prefixed keys of that table.
//
// PAGE.TABLE (task-390): the page structure (block order, texts, actions, which block shows under a named flag) is the rows of `screens.mobile_parcel_semi_question`
// in scripts/surfaces/_schema/static-page.json, copied into the slice (`page`) and drawn by pageProps (PageTableBinding.tsx). This file keeps what stays code:
// the closed flag list, the situation -> flags and values derivation, and the typed class table.
import slice from '@/generated/surfaces/mobile_parcel_semi_question.json';
import { LOT_MAP_BOTTOM_PADDING, LOT_MAP_HEX as H, LOT_MAP_LAYOUT as L, LOT_MAP_SIZES as Z } from '@/constants/lotMap';
import { SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import type { SemiQuestionSituation } from '@/lib/semiQuestion';
import type { SemiAnswer } from '@/lib/lotForm';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { pageProps, type PageScreen, type PageStyles } from '@/components/surfaces/PageTableBinding';

/** The generated slice: the content strings and the page rows (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const SEMI_QUESTION_SLICE: { surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen } = slice as unknown as {
  surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen;
};

/** The closed list of derived names (patterns), declared in the S-093 deviation entry. */
export const SEMI_QUESTION_DERIVED_NAMES = [/^answer\.(0|[1-9][0-9]*)$/];

/** The closed list of flag names a `when` of the rows may name (static-page.logic.test.ts T9 checks the rows against it). */
export const SEMI_QUESTION_FLAG_NAMES = ['loading', 'ask', 'rate_limited', 'entitlement', 'unexpected', 'plain_error', 'schema_drift', 'busy'] as const;
/** The closed lists of the other names the rows may use: the values the binding passes, the contract paths it resolves, the leaves a choices row expands to, and its contract id
 *  (read by the S-page arm of scripts/surfaces/surface-validate.mjs; data, not logic). */
export const SEMI_QUESTION_VALUE_NAMES = ['answers', 'selected', 'route', 'navigate'] as const;
export const SEMI_QUESTION_VAR_PATHS = ['errors.429.retryAfterSeconds'] as const;
export const SEMI_QUESTION_CHOICES: Record<string, readonly SemiAnswer[]> = { answers: ['yes', 'no', 'not_sure'] };
export const SEMI_QUESTION_CONTRACT = 'contract_parcels_lookup';
type SemiQuestionFlags = Record<(typeof SEMI_QUESTION_FLAG_NAMES)[number], boolean>;

const CONTRACT = SEMI_QUESTION_CONTRACT;

/** The typed per-platform class table (the MF-53 layout table; the rows never carry a class). */
const STYLES: PageStyles = {
  screen: L.screen, scroll: L.scroll, column: L.column, bottomPadding: LOT_MAP_BOTTOM_PADDING, maxWidth: SEARCH_MAX_WIDTH,
  bar: L.semiTop, back: L.semiBack, backIconSize: Z.backIcon, iconColor: H.icon,
  // task-465 (RR-0485 "1 inside"; mock state 7): the semi page reads its own question and answer keys; the wall keeps semiHeading and semiCard*.
  status: L.semiLoadingText, heading: L.semiQuestionHeading,
  notice: {
    error: { box: L.noticeError, icon: L.noticeIcon, text: L.noticeText },
    neutral: { box: L.notice, icon: L.noticeIconNeutral, text: L.noticeTextNeutral },
  },
  card: { idle: L.semiAnswerCard, checked: L.semiAnswerCardChecked, row: L.semiCardRow, dotIdle: L.semiDot, dotChecked: L.semiDotChecked, text: L.semiAnswerText },
  // SRCH.SEMI-3 (task-361, UX-4): while the answered lookup runs Continue is busy: the approved busy look (semi-question.html:130 `.btn.p[aria-busy="true"] { opacity:.85 }`).
  button: {
    default: { className: L.semiSelect, busyClassName: `${L.semiSelect} opacity-[0.85]`, text: L.selectText },
    outline: { className: L.semiRetry, busyClassName: L.semiRetry, text: L.retryText },
  },
};

/** The flags of one situation (derivation stays code): the notices show in the error state only; the schema-drift text and the retry are exclusive. */
function flagsOf(s: SemiQuestionSituation): SemiQuestionFlags {
  const error = s.state === 'error';
  const unexpected = error && s.errors.unexpected;
  return {
    loading: s.state === 'loading',
    ask: s.state === 'ask',
    rate_limited: error && s.errors.rateLimited,
    entitlement: error && s.errors.entitlement,
    unexpected,
    plain_error: unexpected && !s.errors.schemaDrift,
    schema_drift: unexpected && s.errors.schemaDrift,
    busy: s.busy,
  };
}

/** The props tree of one render. The redirect state adds `navigate` (the mount's effect replaces the route with it). */
export function semiQuestionProps(s: SemiQuestionSituation): PropsNode {
  return pageProps(SEMI_QUESTION_SLICE.page, flagsOf(s), { answers: s.answers, selected: s.selected, route: s.route, navigate: s.navigate }, STYLES);
}

export type SemiQuestionBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the refs of `semiQuestionProps(s)` resolve against: the 429 detail and the answers in order. */
export function semiQuestionData(s: SemiQuestionSituation): SemiQuestionBindingData {
  return {
    contract: { [CONTRACT]: { errors: { '429': { retryAfterSeconds: s.errors.retryAfterSeconds } } } },
    derived: { answer: [...s.answers] },
  };
}
