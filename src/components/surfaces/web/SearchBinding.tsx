// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.5 (the first web consumer of SEARCH adds its binding entry, golden shape,
//            one planted-defect case and one render smoke), §11b.2 (one binding per archetype per platform; refs only), §11b.3 dated note
//            2026-11-11 (MF-44: the web target of mobile_parcel_search), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no
//            maths here), FE-07 (parity with the mobile goldens), FE-31 (C-8 closed mapping, C-9 44 px), FE-32 (contract paths).
//
// MF-44 · the web SEARCH binding (owner: promoted entry binding_web_search; operator "01-a 0-2 b as long as they are complaint").
//   searchWebTree(situation) -> the props golden of one render: the SAME blocks, block order, refs and actions as the mobile binding
//                               (mobile/src/components/surfaces/SearchBinding.tsx searchProps), drawn with Mantine parts. Refs only:
//                               {content: k} (mobile_parcel_search.content.json), {contract: path} (contract_parcels_lookup), {derived: name}
//                               (the mobile binding's closed DERIVED_NAMES), and {text, vars} templates. The parity lock
//                               src/tests/surfaces/search-parity.golden.test.ts holds the two targets equal per state.
//   searchWebData(situation) -> the values those refs resolve against (the lookup response as sent, the derived values).
//   <SearchBinding/>          -> the tree rendered with the mapped Mantine parts only (bindings.json mapping.web.SEARCH), through a function
//                               over the tree (no local JSX component, no createElement: C-8). An unknown component, content key, ref or action
//                               throws; nothing is skipped silently.
// The address highlighting and the route shape come from the shared pure core (mobile/src/lib/parcelSearchCore.ts), never re-implemented.
// Navigation and fetching are the mount's (live switch, src/lib/surfaces/maxbld-web.ts); the tree carries action data only.
// Dated 2026-11-12 (MF-46 follow-up, P35-D18 a; FE-07 parity with the mobile goldens): "Report incorrect address match" under SELECT carries the
// action open_help {topic, q}; on the web it renders as a real link (126 §0b item 11) to the Help & Support page, the topic and the query in the
// URL fragment (read by the page on the client, never sent to a server).
// Dated 2026-11-25 (task-465 McFixV2.1; RR-0483, RR-0487, RR-0445 "mobile first ... it works onthe web", FE-07 parity; prior text kept): the tree
// mirrors the phone's new box: the field and its drop-down (the lines after Enter, the rows as links that open their page, the one line under the
// rows, the help link); the radio cards, SELECT, the list title and the count badge are gone. Enter fires the action `submit`.
'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { footerNode, type FooterLayout, type FooterSection } from './footerNode';
import { diffCandidateAddress, parcelSearchPath, reportsLeftShown, type AddressSegment, type EntitlementLine, type SearchOutcome } from '../../../../mobile/src/lib/parcelSearchCore';
// task-450 L5: the minimum length is the setting the phone reads (the generated slice's config.min_query_len, held to its bounds by sliceNumber).
import { sliceNumber } from '../../../../mobile/src/lib/sliceConfig';
import searchSlice from '../../../../mobile/src/generated/surfaces/mobile_parcel_search.json';

const SEARCH_MIN_QUERY_LEN = sliceNumber(searchSlice, 'min_query_len');

export type Ref = { content: string } | { contract: string } | { derived: string };
export type Template = { text: Ref; vars: Record<string, Ref> };
export type WebNode = { component: string; props: Record<string, unknown>; children: Array<WebNode | Ref | Template> };

/** The situation of one render: the shape of the mobile SearchSituation (mobile/src/lib/parcelSearchMatch.ts), read as data. */
export type WebSituation = {
  input: string;
  query: string;
  outcome: SearchOutcome;
  isFetching: boolean;
  errors: { rateLimited: boolean; retryAfterSeconds: number | null; entitlement: boolean; unexpected: boolean; schemaDrift: boolean };
  candidates: Array<{ parcelId: string; address: string }>;
  overCap: boolean;
  showMiss: boolean;
  recent: string[];
  /** task-465: the mobile SearchSituation's new fields (prior field kept as text: selectedParcelId). */
  submitted: string | null;
  rows: Array<{ parcelId: string; address: string; route: string }>;
  hint: 'several' | 'refine' | null;
  showOutside: boolean;
  showChips: boolean;
  showCount: boolean;
  route: string | null;
  /** SRCH.A6 (task-320): the served count fields of the reports-left line; absent or null draws no line. Inert on the web until MAXBLD_WEB_LIVE flips (LS.12, task-287). */
  entitlement?: EntitlementLine | null;
};

/** The web base path of the parcel tool pages (Spec 126 §11b.3 dated note 2026-11-11: the app's route name, §11b.7 A2/A4). */
export const WEB_BASE = '/parcel-tool';

/** The web layout table: Tailwind class strings (full literals), the S-002 search page of Spec 117 §6.1 in the default palette. */
export const WEB_SEARCH_LAYOUT = {
  screen: 'min-h-screen w-full bg-zinc-950',
  column: 'mx-auto w-full max-w-md px-4 pb-24',
  header: 'items-center pt-10 pb-6',
  wordmark: 'text-2xl font-bold tracking-tight text-zinc-100',
  wordmarkAccent: 'text-2xl font-bold tracking-tight text-amber-500',
  tagline: 'mt-1 font-mono text-[11px] font-normal uppercase tracking-widest text-zinc-400',
  pill: 'flex-nowrap items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 py-1 pl-4 pr-1',
  // task-465: the box (the bar and the drop-down under a thin line), as the phone.
  box: 'w-full gap-0 overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-900',
  bar: 'flex-nowrap items-center gap-2 py-1 pl-4 pr-1',
  drop: 'w-full gap-0 border-t border-zinc-800',
  row: 'h-auto w-full justify-start rounded-none border-t border-zinc-800 px-4 py-2',
  rowText: 'text-[15px] font-medium text-zinc-100',
  msg: 'w-full gap-0 px-4 py-3',
  msgTitle: 'text-[15px] font-normal text-zinc-100',
  msgSub: 'text-[13px] font-normal text-zinc-400',
  hint: 'border-t border-zinc-800 px-4 pt-2 pb-2 text-[12px] font-normal text-zinc-400',
  /** ph-no-capture: the analytics client never records the typed address (Spec 100 §2.8; MF-44 security S-7). */
  input: 'flex-1 ph-no-capture',
  // MF-91 (RR-0270): the legal sentence is in the footer, once (v8 .wfoot: the sentence, the links, the copyright); the line under the input is gone on the web.
  footer: 'mt-auto w-full gap-3 border-t border-zinc-800 px-4 py-6',
  footerLinks: 'gap-2',
  footerLink: 'rounded-xl text-zinc-300',
  footerLegal: 'text-[13px] leading-[18px] font-normal text-zinc-400',
  footerCopyright: 'text-[13px] leading-[18px] font-normal text-zinc-400',
  /** SRCH.A6 (task-320): the reports-left line under the box (v8 .small). */
  allowance: 'mt-3 text-center text-[13px] leading-[18px] font-normal text-zinc-400',
  chipRow: 'mt-3 gap-2',
  chip: 'rounded-full font-mono text-xs font-normal',
  notice: 'mt-3 rounded-xl',
  noticeText: 'text-xs font-normal text-red-400',
  noticeTextNeutral: 'text-xs font-normal text-zinc-300',
  retry: 'mt-2 rounded-xl',
  listHeader: 'mt-4 items-center justify-between',
  rail: 'font-mono text-[11px] font-normal uppercase tracking-widest text-zinc-400',
  badge: 'font-mono text-[11px] font-normal uppercase tracking-widest text-amber-500',
  card: 'mt-2 h-auto w-full justify-start rounded-xl border-zinc-800 bg-zinc-900 px-3 py-3',
  cardChecked: 'mt-2 h-auto w-full justify-start rounded-xl border-amber-500 bg-zinc-900 px-3 py-3',
  cardText: 'text-base font-normal text-zinc-100',
  // task-465 (O12): the typed part bold, the rest medium (prior: the differing part in amber).
  segment: 'text-[15px] font-bold text-zinc-100',
  segmentDiffers: 'text-[15px] font-medium text-zinc-100',
  select: 'mt-4 w-full rounded-xl uppercase tracking-widest',
  report: 'mt-2 self-center rounded-xl text-xs font-normal text-zinc-400 underline', // MF-46 follow-up (dated 2026-11-12)
  refine: 'mt-3 text-center text-xs font-normal text-zinc-400',
  miss: 'mt-10 text-center text-base font-normal text-zinc-400',
  prompt: 'mt-10 text-center text-base font-normal text-zinc-500',
} as const;
const L = WEB_SEARCH_LAYOUT;
/** The Help & Support page: the public maxbld.ca row /help (src/lib/auth/host-policy.ts; the page table's footer link). */
const HELP_PATH = '/help';

const CONTRACT = 'contract_parcels_lookup';
const ENTITLEMENT = 'contract_parcels_entitlement';
const content = (key: string): Ref => ({ content: key });
const contract = (p: string): Ref => ({ contract: `${CONTRACT}.${p}` });
const entitlement = (field: string): Ref => ({ contract: `${ENTITLEMENT}.${field}` });
const derived = (name: string): Ref => ({ derived: name });
const node = (component: string, props: Record<string, unknown>, children: WebNode['children'] = []): WebNode => ({ component, props, children });

const header = (): WebNode =>
  node('Stack', { key: 'header', className: L.header }, [
    node('Title', { key: 'wordmark', className: L.wordmark }, [
      content('search.wordmark.max'),
      node('Text', { key: 'wordmark-accent', component: 'span', className: L.wordmarkAccent }, [content('search.wordmark.bld')]),
    ]),
    node('Text', { key: 'tagline', className: L.tagline }, [content('search.tagline')]),
  ]);

/** task-465: the box: the bar (the field, Enter fires `submit`; the spinner) and the drop-down, as the phone's box (SearchBinding.tsx box()). */
const box = (s: WebSituation): WebNode =>
  node('Stack', { key: 'box', testID: 'parcel-search-box', className: L.box }, [
    node('Group', { key: 'bar', className: L.bar }, [
      node('TextInput', {
        key: 'input',
        testID: 'parcel-search-input',
        className: L.input,
        size: 'lg',
        variant: 'unstyled',
        value: derived('input'),
        onChange: { action: 'change_input' },
        onSubmit: { action: 'submit' },
        placeholder: content('search.input.placeholder'),
        ariaLabel: content('search.input.label'),
        ariaDescription: { text: content('search.input.hint'), vars: { min: derived('min_query_len') } }, // task-450 L5
        autoComplete: 'off',
      }),
      ...(s.isFetching ? [node('Loader', { key: 'spinner', testID: 'parcel-search-spinner', size: 'sm', color: 'yellow', ariaLabel: content('search.searching') })] : []),
    ]),
    ...drop(s),
  ]);

/** MF-91 (SRCH.FOOTER; operator "1. once  -approved"): the web footer, five items in the v8 order (search.txt:323): the legal sentence (MF-58's key, now once, here), Terms of
 * Service, Privacy Policy, Help and Support, the copyright. Built by the one shared builder (footerNode.ts); the mobile page keeps its A.10 line under the input. */
export const SEARCH_FOOTER: FooterSection = {
  id: 'footer',
  parts: [
    { role: 'legal', content: 'search.legal' },
    { role: 'link', content: 'footer.terms', href: '/terms' },
    { role: 'link', content: 'footer.privacy', href: '/privacy' },
    { role: 'link', content: 'footer.help', href: '/help' },
    { role: 'copyright', content: 'footer.copyright' },
  ],
};
const SEARCH_FOOTER_LAYOUT: FooterLayout = { footer: L.footer, links: L.footerLinks, link: L.footerLink, legal: L.footerLegal, line: L.footerLegal, copyright: L.footerCopyright };
const footer = (): WebNode => footerNode(SEARCH_FOOTER, SEARCH_FOOTER_LAYOUT, 'parcel-search') as WebNode;

/** SRCH.A6 (task-320; RR-0307; v8 search.html:320): the mobile line, the same refs; drawn only when the read answered with all three served fields. */
const reportsLeft = (s: WebSituation): WebNode[] =>
  s.showCount && reportsLeftShown(s.entitlement)
    ? [node('Text', { key: 'reports-left', testID: 'parcel-search-reports-left', className: L.allowance }, [{
      text: content('search.reports_left'),
      vars: { left: entitlement('reportsLeft'), allowance: entitlement('reportsLimit'), reset: entitlement('resetsOnDisplay') },
    }])]
    : [];

const chips = (s: WebSituation): WebNode[] =>
  s.recent.length === 0 || !s.showChips
    ? []
    : [node('Group', { key: 'chips', className: L.chipRow }, s.recent.map((q, i) => node('Button', {
      key: `chip-${q}`,
      testID: `parcel-search-suggestion-${q}`,
      size: 'lg',
      variant: 'outline',
      color: 'gray',
      className: L.chip,
      ariaLabel: { text: content('search.chip.label'), vars: { query: derived(`recent.${i}`) } },
      onClick: { action: 'set_input', value: derived(`recent.${i}`) },
    }, [derived(`recent.${i}`)])))];

const notice = (key: string, testID: string, color: string, textClassName: string, text: Ref | Template, extra: WebNode[] = []): WebNode =>
  node('Alert', { key, testID, color, variant: 'light', className: L.notice }, [
    node('Text', { key: `${key}-text`, className: textClassName }, [text]),
    ...extra,
  ]);

// task-465: the outside-Toronto line moved into the drop-down (as the phone).
const notices = (s: WebSituation): WebNode[] => [
  ...(s.errors.rateLimited
    ? [notice('ratelimit', 'parcel-search-ratelimit', 'red', L.noticeText, { text: content('search.ratelimit'), vars: { seconds: contract('errors.429.retryAfterSeconds') } })]
    : []),
  ...(s.errors.entitlement ? [notice('entitlement', 'parcel-search-entitlement', 'yellow', L.noticeTextNeutral, content('search.entitlement'))] : []),
  ...(s.errors.unexpected
    ? [notice('error', 'parcel-search-error', 'red', L.noticeText, content(s.errors.schemaDrift ? 'search.schema_drift' : 'search.error'),
      s.errors.schemaDrift ? [] : [node('Button', {
        key: 'retry', testID: 'parcel-search-retry', size: 'lg', variant: 'filled', color: 'yellow', className: L.retry,
        ariaLabel: content('search.retry.label'), onClick: { action: 'retry' },
      }, [content('search.retry.text')])])]
    : []),
];

const segmentsOf = (s: WebSituation, i: number): AddressSegment[] => {
  const r = s.rows[i];
  return r ? diffCandidateAddress(s.query, r.address || r.parcelId) : [];
};

const msg = (key: string, testID: string, first: Ref | Template, second: WebNode[] = []): WebNode =>
  node('Stack', { key, className: L.msg }, [node('Text', { key: `${key}-text`, testID, className: L.msgTitle }, [first]), ...second]);

/** task-465: the drop-down, block for block the phone's (SearchBinding.tsx drop()). */
const drop = (s: WebSituation): WebNode[] => {
  const lines: WebNode[] = [
    ...(s.showMiss
      ? [msg('miss', 'parcel-search-empty', { text: content('search.miss'), vars: { query: derived('input') } },
        [node('Text', { key: 'miss-hint', className: L.msgSub }, [content('search.miss.hint')])])]
      : []),
    ...(s.showOutside
      ? [msg('outside-toronto', 'parcel-search-outside-toronto', content('search.outside_toronto.title'),
        [node('Text', { key: 'outside-toronto-sub', className: L.msgSub }, [content('search.outside_toronto')])])]
      : []),
    ...s.rows.map((r, i) => node('Button', {
      key: r.parcelId,
      testID: `parcel-candidate-${r.parcelId}`,
      size: 'lg',
      variant: 'subtle',
      color: 'gray',
      className: L.row,
      ariaLabel: derived(`label.${i}`),
      // The web route of the row's lot (the situation's route is the app's). A map-kind row has no web route yet: the web never navigates to the
      // core's disambiguate?q= path (maxbld-web.ts, MF-44 security S-7), so it renders without a handler (disabled).
      onClick: s.outcome === 'multi_parcel' ? null : { action: 'push', route: parcelSearchPath('unique', { parcelId: r.parcelId, query: s.query }, WEB_BASE) },
    }, [node('Text', { key: 'row-text', component: 'span', className: L.rowText }, segmentsOf(s, i).map((seg, j) =>
      node('Text', { key: `${r.parcelId}-${j}`, component: 'span', className: seg.differs ? L.segmentDiffers : L.segment }, [derived(`segments.${i}.${j}.text`)])))])),
    ...(s.hint === 'several' ? [node('Text', { key: 'hint', testID: 'parcel-search-hint', className: L.hint }, [content('list.hint')])] : []),
    ...(s.hint === 'refine' ? [node('Text', { key: 'refine', testID: 'parcel-search-refine', className: L.hint }, [content('list.refine')])] : []),
    ...(s.rows.length > 0
      ? [node('Button', {
        key: 'report',
        testID: 'parcel-search-report',
        size: 'lg',
        variant: 'subtle',
        color: 'gray',
        className: L.report,
        onClick: { action: 'open_help', topic: 'wrong-lot', q: derived('input') }, // task-450 AC6 (B.7 doc-2:49; prior topic address_match)
      }, [content('list.report')])]
      : []),
  ];
  return lines.length === 0 ? [] : [node('Stack', { key: 'drop', testID: 'parcel-search-drop', className: L.drop }, lines)];
};

/** The props tree of one render. Block order is the mobile binding's (MF-35 must-survive row 17) without the legal line, which is in the footer (last child, MF-91). */
export function searchWebTree(s: WebSituation): WebNode {
  return node('Stack', { key: 'screen', testID: 'parcel-search-screen', className: L.screen }, [
    node('Stack', { key: 'column', testID: 'parcel-search-column', className: L.column }, [
      header(),
      box(s),
      ...reportsLeft(s),
      ...chips(s),
      ...notices(s),
    ]),
    footer(),
  ]);
}

export type WebBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the refs of `searchWebTree(s)` resolve against (the mobile binding's searchData, the same keys). */
export function searchWebData(s: WebSituation): WebBindingData {
  return {
    contract: {
      [CONTRACT]: { candidates: s.candidates, errors: { '429': { retryAfterSeconds: s.errors.retryAfterSeconds } } },
      ...(s.showCount && reportsLeftShown(s.entitlement) ? { [ENTITLEMENT]: { reportsLeft: s.entitlement.reportsLeft, reportsLimit: s.entitlement.reportsLimit, resetsOnDisplay: s.entitlement.resetsOnDisplay } } : {}),
    },
    derived: {
      input: s.input,
      min_query_len: SEARCH_MIN_QUERY_LEN,
      recent: s.recent,
      label: s.rows.map((r) => r.address || r.parcelId),
      segments: s.rows.map((_r, i) => segmentsOf(s, i)),
    },
  };
}

// ---- render half -------------------------------------------------------------------------------------------------------------------------------

export type WebActions = {
  change_input: (text: string) => void;
  set_input: (value: string) => void;
  retry: () => void;
  select: (parcelId: string) => void;
  push: (route: string) => void;
  /** task-465: Enter in the field runs the typed search. */
  submit: () => void;
};
/** Run-time options of the mount (not in the golden): `disabled` turns off the input and every button (the live switch is off). */
export type WebRuntime = { disabled?: boolean };
type Ctx = { content: Record<string, string>; data: WebBindingData; actions: Partial<WebActions>; runtime: WebRuntime };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const walk = (root: unknown, segs: string[]): unknown => {
  let v = root;
  for (const seg of segs) v = isObj(v) || Array.isArray(v) ? (v as Record<string, unknown>)[seg] : undefined;
  return v;
};

/** A ref or template -> its value; anything else as is. A missing content key or an unresolved ref throws. */
export function resolveWebValue(v: unknown, ctx: Pick<Ctx, 'content' | 'data'>): unknown {
  if (!isObj(v)) return v;
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === 'content') {
    const k = String(v.content);
    if (!Object.hasOwn(ctx.content, k)) throw new Error(`SearchBinding: unknown content key "${k}"`);
    return ctx.content[k];
  }
  if (keys.length === 1 && (keys[0] === 'contract' || keys[0] === 'derived')) {
    const found = walk(keys[0] === 'contract' ? ctx.data.contract : ctx.data.derived, String(v[keys[0]]).split('.'));
    if (found === undefined) throw new Error(`SearchBinding: unresolved ref ${JSON.stringify(v)}`);
    return found;
  }
  if (keys.every((x) => x === 'text' || x === 'vars') && 'text' in v && isObj(v.vars)) {
    const vars = v.vars;
    return String(resolveWebValue(v.text, ctx)).replace(/\{(\w+)\}/g, (m, name: string) => (Object.hasOwn(vars, name) ? String(resolveWebValue(vars[name], ctx) ?? '') : m));
  }
  return v;
}

const handler = (a: unknown, ctx: Ctx): ((e?: unknown) => void) | undefined => {
  if (!isObj(a)) return undefined;
  const name = String(a.action);
  if (!['change_input', 'set_input', 'retry', 'select', 'push', 'submit'].includes(name)) throw new Error(`SearchBinding: unknown action "${name}"`);
  const f = ctx.actions[name as keyof WebActions];
  if (!f) return undefined;
  switch (name) {
    case 'change_input':
      return (e) => (f as WebActions['change_input'])(String((e as { currentTarget?: { value?: string } })?.currentTarget?.value ?? ''));
    case 'set_input':
      return () => (f as WebActions['set_input'])(String(resolveWebValue(a.value, ctx)));
    case 'select':
      return () => (f as WebActions['select'])(String(resolveWebValue(a.parcelId, ctx)));
    case 'push':
      return () => (f as WebActions['push'])(String(a.route));
    default:
      return () => (f as () => void)();
  }
};

const text = (v: unknown, ctx: Ctx): string | undefined => {
  const r = resolveWebValue(v, ctx);
  return r === undefined || r === null ? undefined : String(r);
};

/** One tree node -> its mapped Mantine part. Every element below is a listed library component (bindings.json mapping.web.SEARCH). */
function renderWebNode(n: WebNode, ctx: Ctx): ReactNode {
  const p = n.props;
  const kids = n.children.map((c) => (isObj(c) && 'component' in c ? renderWebNode(c as WebNode, ctx) : text(c, ctx)));
  const off = ctx.runtime.disabled === true;
  // Only the attributes that carry a value (exactOptionalPropertyTypes): the tree's key, test id and classes, then the part's own.
  const k = p.key as string | undefined; // React keys are passed by name, never spread (React 19 warns on a spread key)
  const base = defined({ 'data-testid': p.testID, className: p.className });
  switch (n.component) {
    case 'Stack':
      return <Stack key={k} {...base} {...defined({ component: p.component })}>{kids}</Stack>;
    case 'Group':
      return <Group key={k} {...base}>{kids}</Group>;
    case 'Title':
      return <Title key={k} {...base}>{kids}</Title>;
    case 'Text':
      return <Text key={k} {...base} {...defined({ component: p.component })}>{kids}</Text>;
    case 'TextInput':
      return (
        <TextInput key={k} {...base}
          {...defined({
            size: p.size, variant: p.variant, placeholder: text(p.placeholder, ctx), 'aria-label': text(p.ariaLabel, ctx),
            'aria-description': text(p.ariaDescription, ctx), autoComplete: p.autoComplete, onChange: handler(p.onChange, ctx),
            onKeyDown: enterKey(handler(p.onSubmit, ctx)),
          })}
          value={text(p.value, ctx) ?? ''}
          readOnly={handler(p.onChange, ctx) === undefined}
          disabled={off}
        />
      );
    case 'Loader':
      return <Loader key={k} {...base} {...defined({ size: p.size, color: p.color, 'aria-label': text(p.ariaLabel, ctx) })} />;
    case 'Alert':
      return <Alert key={k} {...base} {...defined({ color: p.color, variant: p.variant })}>{kids}</Alert>;
    case 'Button': {
      // MF-91: a footer link is a real route (126 §0b item 11); it is not a control of the search form, so the live switch does not disable it.
      if (typeof p.href === 'string') return <Button key={k} {...base} {...defined({ size: p.size, variant: p.variant, color: p.color })} component={Link} href={p.href}>{kids}</Button>;
      if (isObj(p.onClick) && p.onClick.action === 'open_help') {
        const href = `${HELP_PATH}#topic=${encodeURIComponent(String(p.onClick.topic))}&q=${encodeURIComponent(String(resolveWebValue(p.onClick.q, ctx)))}`;
        return <Button key={k} {...base} {...defined({ size: p.size, variant: p.variant, color: p.color })} component={Link} href={href}>{kids}</Button>;
      }
      const click = handler(p.onClick, ctx);
      return (
        <Button key={k} {...base}
          {...defined({
            size: p.size, variant: p.variant, color: p.color, role: p.role, 'aria-checked': p.role === 'radio' ? p.checked === true : undefined,
            'aria-label': text(p.ariaLabel, ctx), onClick: click,
          })}
          disabled={off || p.disabled === true || click === undefined}
        >
          {kids}
        </Button>
      );
    }
    default:
      throw new Error(`SearchBinding: unmapped component "${n.component}"`);
  }
}

/** task-465: the field's Enter key fires the submit handler; any other key does nothing here. */
const enterKey = (f: ((e?: unknown) => void) | undefined): ((e: { key?: string }) => void) | undefined =>
  f === undefined ? undefined : (e) => { if (e.key === 'Enter') f(); };

/** The entries of `o` whose value is not undefined, typed for a JSX spread (the values are the tree's, as sent). */
const defined = (o: Record<string, unknown>): Record<string, never> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, never>;

/** Renders one props tree with the content strings, the bound data, the mount's callbacks and its run-time options. */
export function SearchBinding({ tree, content, data, actions = {}, runtime = {} }: {
  tree: WebNode; content: Record<string, string>; data: WebBindingData; actions?: Partial<WebActions>; runtime?: WebRuntime;
}) {
  return <>{renderWebNode(tree, { content, data, actions, runtime })}</>;
}
