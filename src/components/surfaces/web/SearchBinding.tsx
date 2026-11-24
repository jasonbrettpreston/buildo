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
  showPrompt: boolean;
  recent: string[];
  selectedParcelId: string | null;
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
  segment: 'text-base font-normal text-zinc-100',
  segmentDiffers: 'text-base font-semibold text-amber-500',
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

const pill = (s: WebSituation): WebNode =>
  node('Group', { key: 'pill', className: L.pill }, [
    node('TextInput', {
      key: 'input',
      testID: 'parcel-search-input',
      className: L.input,
      size: 'lg',
      variant: 'unstyled',
      value: derived('input'),
      onChange: { action: 'change_input' },
      placeholder: content('search.input.placeholder'),
      ariaLabel: content('search.input.label'),
      ariaDescription: { text: content('search.input.hint'), vars: { min: derived('min_query_len') } }, // task-450 L5
      autoComplete: 'off',
    }),
    ...(s.isFetching ? [node('Loader', { key: 'spinner', testID: 'parcel-search-spinner', size: 'sm', color: 'yellow', ariaLabel: content('search.searching') })] : []),
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
  reportsLeftShown(s.entitlement)
    ? [node('Text', { key: 'reports-left', testID: 'parcel-search-reports-left', className: L.allowance }, [{
      text: content('search.reports_left'),
      vars: { left: entitlement('reportsLeft'), allowance: entitlement('reportsLimit'), reset: entitlement('resetsOnDisplay') },
    }])]
    : [];

const chips = (s: WebSituation): WebNode[] =>
  s.recent.length === 0
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

const notices = (s: WebSituation): WebNode[] => [
  ...(s.outcome === 'outside_toronto' ? [notice('outside-toronto', 'parcel-search-outside-toronto', 'red', L.noticeText, content('search.outside_toronto'))] : []),
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
  const c = s.candidates[i];
  return c ? diffCandidateAddress(s.query, c.address || c.parcelId) : [];
};

const addressList = (s: WebSituation): WebNode[] => {
  if (s.candidates.length === 0) return [];
  const route = s.selectedParcelId ? parcelSearchPath('unique', { parcelId: s.selectedParcelId, query: s.query }, WEB_BASE) : null;
  return [
    node('Group', { key: 'list-header', testID: 'parcel-search-list-header', className: L.listHeader }, [
      node('Text', { key: 'rail', className: L.rail }, [content('list.rail')]),
      node('Text', { key: 'badge', className: L.badge }, [{ text: content('list.badge'), vars: { count: derived('candidate_count') } }]),
    ]),
    ...s.candidates.map((c, i) => {
      const checked = c.parcelId === s.selectedParcelId;
      return node('Button', {
        key: c.parcelId,
        testID: `parcel-candidate-${c.parcelId}`,
        size: 'lg',
        variant: 'outline',
        color: 'gray',
        className: checked ? L.cardChecked : L.card,
        role: 'radio',
        checked,
        ariaLabel: derived(`label.${i}`),
        onClick: { action: 'select', parcelId: contract(`candidates.${i}.parcelId`) },
      }, [node('Text', { key: 'card-text', component: 'span', className: L.cardText }, segmentsOf(s, i).map((seg, j) =>
        node('Text', { key: `${c.parcelId}-${j}`, component: 'span', className: seg.differs ? L.segmentDiffers : L.segment }, [derived(`segments.${i}.${j}.text`)])))]);
    }),
    node('Button', {
      key: 'select',
      testID: 'parcel-search-select',
      size: 'lg',
      variant: 'filled',
      color: 'yellow',
      className: L.select,
      disabled: route === null,
      ariaLabel: content('list.select.label'),
      onClick: route === null ? null : { action: 'push', route },
    }, [content('list.select')]),
    node('Button', {
      key: 'report',
      testID: 'parcel-search-report',
      size: 'lg',
      variant: 'subtle',
      color: 'gray',
      className: L.report,
      onClick: { action: 'open_help', topic: 'wrong-lot', q: derived('input') }, // task-450 AC6 (B.7 doc-2:49; prior topic address_match)
    }, [content('list.report')]),
  ];
};

const tail = (s: WebSituation): WebNode[] => [
  ...(s.overCap ? [node('Text', { key: 'refine', testID: 'parcel-search-refine', className: L.refine }, [content('list.refine')])] : []),
  ...(s.showMiss ? [node('Text', { key: 'miss', testID: 'parcel-search-empty', className: L.miss }, [content('search.miss')])] : []),
  ...(s.showPrompt ? [node('Text', { key: 'prompt', testID: 'parcel-search-prompt', className: L.prompt }, [{ text: content('search.prompt'), vars: { min: derived('min_query_len') } }])] : []),
];

/** The props tree of one render. Block order is the mobile binding's (MF-35 must-survive row 17) without the legal line, which is in the footer (last child, MF-91). */
export function searchWebTree(s: WebSituation): WebNode {
  return node('Stack', { key: 'screen', testID: 'parcel-search-screen', className: L.screen }, [
    node('Stack', { key: 'column', testID: 'parcel-search-column', className: L.column }, [
      header(),
      pill(s),
      ...reportsLeft(s),
      ...chips(s),
      ...notices(s),
      ...addressList(s),
      ...tail(s),
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
      ...(reportsLeftShown(s.entitlement) ? { [ENTITLEMENT]: { reportsLeft: s.entitlement.reportsLeft, reportsLimit: s.entitlement.reportsLimit, resetsOnDisplay: s.entitlement.resetsOnDisplay } } : {}),
    },
    derived: {
      input: s.input,
      min_query_len: SEARCH_MIN_QUERY_LEN,
      candidate_count: s.candidates.length,
      recent: s.recent,
      label: s.candidates.map((c) => c.address || c.parcelId),
      segments: s.candidates.map((c, i) => segmentsOf(s, i)),
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
  if (!['change_input', 'set_input', 'retry', 'select', 'push'].includes(name)) throw new Error(`SearchBinding: unknown action "${name}"`);
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

/** The entries of `o` whose value is not undefined, typed for a JSX spread (the values are the tree's, as sent). */
const defined = (o: Record<string, unknown>): Record<string, never> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, never>;

/** Renders one props tree with the content strings, the bound data, the mount's callbacks and its run-time options. */
export function SearchBinding({ tree, content, data, actions = {}, runtime = {} }: {
  tree: WebNode; content: Record<string, string>; data: WebBindingData; actions?: Partial<WebActions>; runtime?: WebRuntime;
}) {
  return <>{renderWebNode(tree, { content, data, actions, runtime })}</>;
}
