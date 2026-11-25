// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one binding per archetype per platform; refs only) and its dated note
//            2026-11-10 (the binding standard: contract paths, the reserved errors segment, component names in bindings.json mapping),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18 (every value through a binding kind), FE-31, FE-32,
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 and its dated note 2026-11-10 (the search page layout),
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 dated note 2026-11-10.
//
// MF-35 · the mobile SEARCH binding (props half). Pure: no React, no JSX. `searchProps(situation)` maps one render situation of the parcel search
// page to a props tree `{component, props, children}`; that tree IS the golden (src/tests/fixtures/surfaces/mobile_parcel_search/<state>.mobile.json).
// Every displayed value is a ref, never a string:
//   {"content": k}    a key of mobile_parcel_search.content.json (through the generated slice);
//   {"contract": p}   a path in the lookup response (`contract_parcels_lookup.candidates.<i>.<field>`) or an error detail
//                     (`contract_parcels_lookup.errors.429.retryAfterSeconds`), the binding standard's grammar;
//   {"derived": n}    a value derived on the client by mobile/src/lib/parcelSearchMatch.ts (P35-D14 a: a declared deviation with the closed
//                     list DERIVED_NAMES below; the mobile golden test refuses any other name and any declared name no tree uses).
// A template is `{text: ref, vars: {name: ref}}`. Actions are data `{action, ...}`; the screen supplies the callbacks (SurfaceRenderer.tsx).
// Class strings, sizes and hexes come from the layout table (PARCEL_SEARCH_LAYOUT, mobile/src/constants/parcelSearch.ts).
// FE-05 (a listed binding module): no numeric literal but 0 and 1, no arithmetic; lengths and caps are decided in parcelSearchMatch.ts.
import slice from '@/generated/surfaces/mobile_parcel_search.json';
import { sliceNumber, type SliceBound } from '@/lib/sliceConfig';
import {
  PARCEL_SEARCH_ICON as I,
  PARCEL_SEARCH_LAYOUT as L,
  SEARCH_BOTTOM_PADDING,
  SEARCH_MAX_WIDTH,
} from '@/constants/parcelSearch';
import { REPORT_HEX as R } from '@/constants/reportPage';
import { diffCandidateAddress, parcelSearchRoute, type AddressSegment, type SearchSituation } from '@/lib/parcelSearchMatch';
import { reportsLeftShown } from '@/lib/parcelSearchCore';

/** The generated slice: the descriptor's config values and the content strings (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const SEARCH_SLICE: { surface: string; config: Record<string, number>; bounds: Record<string, SliceBound>; content: Record<string, string> } = slice;

// CR3-10 (OUTPUT fold LOW): the screen reads the debounce and the minimum length from the slice, i.e. from the descriptor's config.debounce_ms and
// config.min_query_len (their one declared home), and the cap (task-454: config.candidate_cap, no longer the constants file), all through the binding.
// FIX.CONFIG-BOUNDS (task-395): both numbers go through sliceNumber, which applies the registered bounds the slice carries (maxbld_page_debounce_ms, maxbld_page_min_query_len). They are the only copies: the typed constants in constants/parcelSearch.ts are gone.
export const SEARCH_DEBOUNCE_MS = sliceNumber(SEARCH_SLICE, 'debounce_ms');
export const SEARCH_MIN_QUERY_LEN = sliceNumber(SEARCH_SLICE, 'min_query_len');
// task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494 "register them"; Spec 128 Rule 3): the candidate cap is the registered setting maxbld_page_candidate_cap
// (config.candidate_cap of the slice, bounds 10 to 50, fail), the number the server reads too; the phone takes a change at the next app build. Prior text:
// the cap was the typed constant SEARCH_CANDIDATE_LIMIT = 10 of constants/parcelSearch.ts, re-exported here.
export const SEARCH_CANDIDATE_LIMIT = sliceNumber(SEARCH_SLICE, 'candidate_cap');

export type Ref = { content: string } | { contract: string } | { derived: string };
export type Template = { text: Ref; vars: Record<string, Ref> };
export type PropsNode = { component: string; props: Record<string, unknown>; children: Child[] };
export type Child = PropsNode | Ref | Template;

/** P35-D14 a: the closed list of derived names (patterns), declared in the descriptor's deviation entry. */
export const DERIVED_NAMES = [/^input$/, /^min_query_len$/, /^candidate_count$/, /^recent\.(0|[1-9][0-9]*)$/, /^label\.(0|[1-9][0-9]*)$/, /^segments\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.text$/];

/** SRCH.DAYLIGHT (task-322): the prop colours are the report's Daylight hexes (reportPage.ts REPORT_HEX, twins of the report-* keys of mobile/tailwind.config.js); the dark PARCEL_SEARCH_HEX stays for the Account screen and the shelf. */
const H = { primary: R.amber, onPrimary: R.ink, check: R.ink, textMuted: R.muted, placeholder: R.muted } as const;

const CONTRACT = 'contract_parcels_lookup';
const ENTITLEMENT = 'contract_parcels_entitlement';
const content = (key: string): Ref => ({ content: key });
const contract = (p: string): Ref => ({ contract: `${CONTRACT}.${p}` });
const entitlement = (field: string): Ref => ({ contract: `${ENTITLEMENT}.${field}` });
const derived = (name: string): Ref => ({ derived: name });
const node = (component: string, props: Record<string, unknown>, children: Child[] = []): PropsNode => ({ component, props, children });

const header = (): PropsNode =>
  node('View', { key: 'header', className: L.header }, [
    node('Text', { key: 'wordmark', className: L.wordmark, role: 'header' }, [
      content('search.wordmark.max'),
      node('Text', { key: 'wordmark-accent', className: L.wordmarkAccent }, [content('search.wordmark.bld')]),
    ]),
    node('Text', { key: 'tagline', className: L.tagline }, [content('search.tagline')]),
  ]);

const pill = (s: SearchSituation): PropsNode =>
  node('View', { key: 'pill', className: L.pill }, [
    node('Icon', { key: 'search-icon', icon: 'Search', size: I.field, color: H.textMuted }),
    node('Input', {
      key: 'input',
      testID: 'parcel-search-input',
      className: L.input,
      value: derived('input'),
      onChangeText: { action: 'change_input' },
      placeholder: content('search.input.placeholder'),
      placeholderTextColor: H.placeholder,
      autoCapitalize: 'none',
      autoCorrect: false,
      returnKeyType: 'search',
      accessibilityLabel: content('search.input.label'),
      accessibilityHint: { text: content('search.input.hint'), vars: { min: derived('min_query_len') } }, // task-450 L5: the setting fills {min}
    }),
    ...(s.isFetching
      ? [node('ActivityIndicator', { key: 'spinner', testID: 'parcel-search-spinner', size: 'small', color: H.primary, accessibilityLabel: content('search.searching') })]
      : []),
  ]);

/** MF-58 (ruling 2026-11-10 items 16 and 5): the legal line, always shown. SRCH.LEGAL (task-389; operator "1 a 2 b 3 a 4 a 5 c 6 accept", 2026-11-20): it is the last block of the page, after every result block (v8 search.html:267-269). */
const legal = (): PropsNode => node('Text', { key: 'legal', testID: 'parcel-search-legal', className: L.legal }, [content('search.legal')]);

/**
 * SRCH.A6 (task-320; RR-0307; small-pages-v8 search.html:267): "6 of 10 reports left until 9 Dec 2026". The three values are served by the entitlement
 * read (reportsLeft, reportsLimit; resetsOnDisplay, the Toronto date written by the server, RR-0310) and printed as served. Drawn only when the read answered with all
 * three; loading, a failed read and no plan draw no line (v8 draws none).
 */
const reportsLeft = (s: SearchSituation): PropsNode[] =>
  reportsLeftShown(s.entitlement)
    ? [node('Text', { key: 'reports-left', testID: 'parcel-search-reports-left', className: L.allowance }, [{
      text: content('search.reports_left'),
      vars: { left: entitlement('reportsLeft'), allowance: entitlement('reportsLimit'), reset: entitlement('resetsOnDisplay') },
    }])]
    : [];

const chips = (s: SearchSituation): PropsNode[] =>
  s.recent.length === 0
    ? []
    : [node('View', { key: 'chips', className: L.chipRow }, s.recent.map((q, i) => node('Button', {
      key: `chip-${q}`,
      testID: `parcel-search-suggestion-${q}`,
      variant: 'outline',
      className: L.chip,
      accessibilityRole: 'button',
      accessibilityLabel: { text: content('search.chip.label'), vars: { query: derived(`recent.${i}`) } },
      onPress: { action: 'set_input', value: derived(`recent.${i}`) },
    }, [node('Text', { key: 'chip-text', className: L.chipText }, [derived(`recent.${i}`)])])))];

const notice = (key: string, testID: string, icon: string, iconClassName: string, textClassName: string, text: Child, extra: PropsNode[] = [], className: string = L.notice): PropsNode =>
  node('Alert', { key, testID, icon, iconClassName, className }, [
    node('AlertDescription', { key: `${key}-text`, className: textClassName }, [text]),
    ...extra,
  ]);

const notices = (s: SearchSituation): PropsNode[] => [
  ...(s.outcome === 'outside_toronto'
    ? [notice('outside-toronto', 'parcel-search-outside-toronto', 'Ban', L.noticeIcon, L.noticeText, content('search.outside_toronto'), [], L.noticeError)]
    : []),
  ...(s.errors.rateLimited
    ? [notice('ratelimit', 'parcel-search-ratelimit', 'AlertTriangle', L.noticeIcon, L.noticeText,
      { text: content('search.ratelimit'), vars: { seconds: contract('errors.429.retryAfterSeconds') } }, [], L.noticeError)]
    : []),
  ...(s.errors.entitlement
    ? [notice('entitlement', 'parcel-search-entitlement', 'Lock', L.entitlementIcon, L.noticeTextNeutral, content('search.entitlement'))]
    : []),
  ...(s.errors.unexpected
    ? [notice('error', 'parcel-search-error', 'AlertTriangle', L.noticeIcon, L.noticeText,
      content(s.errors.schemaDrift ? 'search.schema_drift' : 'search.error'),
      s.errors.schemaDrift ? [] : [node('Button', {
        key: 'retry',
        testID: 'parcel-search-retry',
        variant: 'default',
        className: L.retry,
        accessibilityRole: 'button',
        accessibilityLabel: content('search.retry.label'),
        onPress: { action: 'retry' },
      }, [
        node('Icon', { key: 'retry-icon', icon: 'RefreshCw', size: I.notice, color: H.onPrimary }),
        node('Text', { key: 'retry-text', className: L.retryText }, [content('search.retry.text')]),
      ])], L.noticeError)]
    : []),
];

const segments = (s: SearchSituation, i: number, parcelId: string): PropsNode[] =>
  segmentsOf(s, i).map((seg, j) => node('Text', { key: `${parcelId}-${j}`, className: seg.differs ? L.segmentDiffers : L.segment }, [derived(`segments.${i}.${j}.text`)]));

const segmentsOf = (s: SearchSituation, i: number): AddressSegment[] => {
  const c = s.candidates[i];
  return c ? diffCandidateAddress(s.query, c.address || c.parcelId) : [];
};

const addressList = (s: SearchSituation): PropsNode[] => {
  if (s.candidates.length === 0) return [];
  const route = s.selectedParcelId ? parcelSearchRoute('unique', { parcelId: s.selectedParcelId, query: s.query }) : null;
  return [
    node('View', { key: 'list-header', testID: 'parcel-search-list-header', className: L.listHeader }, [
      node('Text', { key: 'rail', className: L.rail }, [content('list.rail')]),
      node('Text', { key: 'badge', className: L.badge }, [{ text: content('list.badge'), vars: { count: derived('candidate_count') } }]),
    ]),
    ...s.candidates.map((c, i) => {
      const checked = c.parcelId === s.selectedParcelId;
      return node('Button', {
        key: c.parcelId,
        testID: `parcel-candidate-${c.parcelId}`,
        variant: 'outline',
        className: checked ? L.cardChecked : L.card,
        role: 'radio',
        accessibilityState: { checked },
        accessibilityLabel: derived(`label.${i}`),
        onPress: { action: 'select', parcelId: contract(`candidates.${i}.parcelId`) },
      }, [node('View', { key: 'card-row', className: L.cardRow }, [
        node('Text', { key: 'card-text', className: L.cardText }, segments(s, i, c.parcelId)),
        ...(checked ? [node('Icon', { key: 'check', icon: 'Check', size: I.button, color: H.check })] : []),
      ])]);
    }),
    node('Button', {
      key: 'select',
      testID: 'parcel-search-select',
      variant: 'default',
      className: L.select,
      disabled: route === null,
      accessibilityRole: 'button',
      accessibilityState: { disabled: route === null },
      accessibilityLabel: content('list.select.label'),
      onPress: route === null ? null : { action: 'push', route },
    }, [
      node('Text', { key: 'select-text', className: L.selectText }, [content('list.select')]),
      node('Icon', { key: 'select-icon', icon: 'ArrowRight', size: I.button, color: H.onPrimary }),
    ]),
    // MF-46 follow-up (P35-D18 a, dated 2026-11-12): "Report incorrect address match" opens Help & Support with the topic and the query.
    // Dated 2026-11-24 (task-450 AC6, B.7 doc-2:49; prior topic address_match): the topic is wrong-lot ("Wrong address or lot").
    node('Button', {
      key: 'report',
      testID: 'parcel-search-report',
      variant: 'link',
      className: L.report,
      accessibilityRole: 'link',
      onPress: { action: 'open_help', topic: 'wrong-lot', q: derived('input') },
    }, [node('Text', { key: 'report-text', className: L.reportText }, [content('list.report')])]),
  ];
};

const tail = (s: SearchSituation): PropsNode[] => [
  ...(s.overCap ? [node('Text', { key: 'refine', testID: 'parcel-search-refine', className: L.refine }, [content('list.refine')])] : []),
  ...(s.showMiss
    ? [node('View', { key: 'miss', className: L.miss }, [
      node('Icon', { key: 'miss-icon', icon: 'MapPin', size: I.miss, color: H.textMuted }),
      node('Text', { key: 'miss-text', testID: 'parcel-search-empty', className: L.missText }, [content('search.miss')]),
    ])]
    : []),
  ...(s.showPrompt ? [node('Text', { key: 'prompt', testID: 'parcel-search-prompt', className: L.prompt }, [{ text: content('search.prompt'), vars: { min: derived('min_query_len') } }])] : []),
];

/** The props tree of one render. Block order is the legacy one (must-survive row 17). A navigable outcome adds `navigate` (the effect pushes it). */
export function searchProps(s: SearchSituation): PropsNode {
  return node('SafeAreaView', { className: L.screen, edges: { top: 'additive' }, testID: 'parcel-search-screen', ...(s.route ? { navigate: s.route } : {}) }, [
    node('ScrollView', {
      key: 'scroll',
      className: L.scroll,
      contentContainerStyle: { paddingBottom: SEARCH_BOTTOM_PADDING, alignItems: 'center' },
      keyboardShouldPersistTaps: 'handled',
    }, [node('View', { key: 'column', testID: 'parcel-search-column', className: L.column, style: { maxWidth: SEARCH_MAX_WIDTH } }, [
      header(),
      pill(s),
      ...reportsLeft(s),
      ...chips(s),
      ...notices(s),
      ...addressList(s),
      ...tail(s),
      legal(),
    ])]),
  ]);
}

export type BindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the refs of `searchProps(s)` resolve against: the lookup response and its 429 detail, and the derived values. */
export function searchData(s: SearchSituation): BindingData {
  return {
    contract: {
      [CONTRACT]: { candidates: s.candidates, errors: { '429': { retryAfterSeconds: s.errors.retryAfterSeconds } } },
      ...(reportsLeftShown(s.entitlement) ? { [ENTITLEMENT]: { reportsLeft: s.entitlement.reportsLeft, reportsLimit: s.entitlement.reportsLimit, resetsOnDisplay: s.entitlement.resetsOnDisplay } } : {}),
    },
    derived: {
      input: s.input,
      min_query_len: SEARCH_MIN_QUERY_LEN, // task-450 L5: the setting (config.min_query_len through sliceNumber), never a typed 3
      candidate_count: s.candidates.length,
      recent: s.recent,
      label: s.candidates.map((c) => c.address || c.parcelId),
      segments: s.candidates.map((c, i) => segmentsOf(s, i)),
    },
  };
}
