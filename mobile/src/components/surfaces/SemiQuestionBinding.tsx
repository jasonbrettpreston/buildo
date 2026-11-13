// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST), §11b.2 (one binding per archetype per platform; refs only) and its
//            dated note 2026-11-10 (the binding standard), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-31,
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B).
//
// SEMI-B · the mobile LIST binding of S-093 `mobile_parcel_semi_question`, the one-question page before the report (operator "semi ask a", 2026-11-13),
// on the MF-53 pattern (LotMapBinding.tsx). Pure: no React, no JSX. `semiQuestionProps(situation)` maps one situation (mobile/src/lib/semiQuestion.ts)
// to a props tree; that tree IS the golden. Every displayed value is a ref: {"content": k} a key of mobile_parcel_semi_question.content.json (through
// the generated slice), {"contract": p} a 429 detail, {"derived": n} a value from the situation (the closed list SEMI_QUESTION_DERIVED_NAMES).
// The three answers are radio cards (the lot-card idiom), nothing selected at open, Continue disabled until one is chosen. Classes, hexes and numbers
// are the MF-53 layout table (mobile/src/constants/lotMap.ts), reused verbatim: no new constant.
import slice from '@/generated/surfaces/mobile_parcel_semi_question.json';
import { LOT_MAP_BOTTOM_PADDING, LOT_MAP_HEX as H, LOT_MAP_LAYOUT as L, LOT_MAP_SIZES as Z } from '@/constants/lotMap';
import { SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import type { SemiQuestionSituation } from '@/lib/semiQuestion';
import type { Child, PropsNode, Ref } from '@/components/surfaces/SearchBinding';

/** The generated slice: the content strings (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const SEMI_QUESTION_SLICE: { surface: string; config: Record<string, number>; content: Record<string, string> } = slice;

/** The closed list of derived names (patterns), declared in the S-093 deviation entry. */
export const SEMI_QUESTION_DERIVED_NAMES = [/^answer\.(0|[1-9][0-9]*)$/];

const CONTRACT = 'contract_parcels_lookup';
const content = (key: string): Ref => ({ content: key });
const contract = (p: string): Ref => ({ contract: `${CONTRACT}.${p}` });
const derived = (name: string): Ref => ({ derived: name });
const node = (component: string, props: Record<string, unknown>, children: Child[] = []): PropsNode => ({ component, props, children });

const header = (): PropsNode =>
  node('View', { key: 'header', className: L.listHeader }, [
    node('Button', {
      key: 'back',
      testID: 'parcel-semi-back',
      variant: 'ghost',
      size: 'icon',
      className: L.clear,
      accessibilityRole: 'button',
      accessibilityLabel: content('back.label'),
      onPress: { action: 'back' },
    }, [node('Icon', { key: 'back-icon', icon: 'X', size: Z.icon, color: H.icon })]),
  ]);

const notice = (key: string, icon: string, iconClassName: string, children: Child[]): PropsNode =>
  node('Alert', { key, testID: `parcel-semi-${key}`, icon, iconClassName, className: L.notice }, children as PropsNode[]);

const errorNotices = (s: SemiQuestionSituation): PropsNode[] => [
  ...(s.errors.rateLimited
    ? [notice('ratelimit', 'AlertTriangle', L.noticeIcon, [node('AlertDescription', { key: 'ratelimit-text', className: L.noticeText }, [
      { text: content('state.ratelimit'), vars: { seconds: contract('errors.429.retryAfterSeconds') } },
    ])])]
    : []),
  ...(s.errors.entitlement
    ? [notice('entitlement', 'Lock', L.noticeIconNeutral, [node('AlertDescription', { key: 'entitlement-text', className: L.noticeTextNeutral }, [content('state.entitlement')])])]
    : []),
  ...(s.errors.unexpected
    ? [notice('error', 'AlertTriangle', L.noticeIcon, [
      node('AlertDescription', { key: 'error-text', className: L.noticeText }, [content(s.errors.schemaDrift ? 'state.schema_drift' : 'state.error')]),
      ...(s.errors.schemaDrift ? [] : [node('Button', {
        key: 'retry',
        testID: 'parcel-semi-retry',
        variant: 'default',
        className: L.retry,
        accessibilityRole: 'button',
        accessibilityLabel: content('retry.label'),
        onPress: { action: 'retry' },
      }, [node('Text', { key: 'retry-text', className: L.retryText }, [content('retry.text')])])]),
    ])]
    : []),
];

const cards = (s: SemiQuestionSituation): PropsNode[] =>
  s.answers.map((a, i) => {
    const checked = a === s.selected;
    return node('Button', {
      key: `answer-${a}`,
      testID: `parcel-semi-answer-${a}`,
      variant: 'outline',
      className: checked ? L.cardChecked : L.card,
      role: 'radio',
      accessibilityState: { checked },
      accessibilityLabel: content(`answer.${a}`),
      onPress: { action: 'select', parcelId: derived(`answer.${i}`) },
    }, [node('View', { key: 'card-row', className: L.cardRow }, [
      node('Text', { key: 'card-title', className: L.cardArea }, [content(`answer.${a}`)]),
      ...(checked ? [node('Icon', { key: 'check', icon: 'Check', size: Z.icon, color: H.primary })] : []),
    ])]);
  });

const continueButton = (s: SemiQuestionSituation): PropsNode =>
  node('Button', {
    key: 'continue',
    testID: 'parcel-semi-continue',
    variant: 'default',
    className: L.select,
    disabled: s.route === null,
    accessibilityRole: 'button',
    accessibilityState: { disabled: s.route === null },
    accessibilityLabel: content('select.label'),
    onPress: s.route === null ? null : { action: 'push', route: s.route },
  }, [node('Text', { key: 'continue-text', className: L.selectText }, [content(s.route === null ? 'select.none' : 'select.go')])]);

const body = (s: SemiQuestionSituation): PropsNode[] => {
  switch (s.state) {
    case 'loading':
      return [node('View', { key: 'loading', className: L.loading }, [
        node('ActivityIndicator', { key: 'spinner', testID: 'parcel-semi-spinner', size: 'small', color: H.primary, accessibilityLabel: content('state.loading') }),
        node('Text', { key: 'loading-text', className: L.loadingText }, [content('state.loading')]),
      ])];
    case 'error':
      return errorNotices(s);
    case 'ask':
      return [
        node('Text', { key: 'question', testID: 'parcel-semi-question', className: L.noticeHeading, role: 'header' }, [content('question.title')]),
        ...cards(s),
        continueButton(s),
      ];
    case 'redirect':
      return [];
  }
};

/** The props tree of one render. The redirect state adds `navigate` (the mount's effect replaces the route with it). */
export function semiQuestionProps(s: SemiQuestionSituation): PropsNode {
  return node('SafeAreaView', { className: L.screen, edges: { top: 'additive' }, testID: 'parcel-semi-screen', ...(s.navigate ? { navigate: s.navigate } : {}) }, [
    node('ScrollView', {
      key: 'scroll',
      className: L.scroll,
      contentContainerStyle: { paddingBottom: LOT_MAP_BOTTOM_PADDING, alignItems: 'center' },
      keyboardShouldPersistTaps: 'handled',
    }, [node('View', { key: 'column', testID: 'parcel-semi-column', className: L.column, style: { maxWidth: SEARCH_MAX_WIDTH } }, [
      header(),
      ...body(s),
    ])]),
  ]);
}

export type SemiQuestionBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the refs of `semiQuestionProps(s)` resolve against: the 429 detail and the answers in order. */
export function semiQuestionData(s: SemiQuestionSituation): SemiQuestionBindingData {
  return {
    contract: { [CONTRACT]: { errors: { '429': { retryAfterSeconds: s.errors.retryAfterSeconds } } } },
    derived: { answer: [...s.answers] },
  };
}
