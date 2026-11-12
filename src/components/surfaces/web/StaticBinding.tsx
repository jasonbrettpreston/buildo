// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.5 (the first web consumer of STATIC adds its binding entry, golden shape,
//            one planted-defect case and one render smoke), §11b.2 (one binding per archetype per platform; refs only), §0b items 3-5 and 11,
//            §11b.1 (REPORT keeps the landed renderer), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-07
//            (one loading state everywhere), FE-18 (every string from content), FE-31 (C-8 closed mapping, C-9 44 px), FE-33 (render smoke), FE-34
//            (closed kinds and roles; a number throws), FE-35 (the loading state, its content), FE-36 (navigation is a route), FE-37 (a STATIC page may
//            read declared stored values on the server).
//
// MF-46 stage C · the web STATIC binding (owner: promoted entry binding_web_static; plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §3.2 and §12
// folds 13, 16, 18; operator D-2 (a) "1 y 2 y ..." 2026-11-11).
//   staticWebTree(page) -> the props golden of one render from one page of the page table (scripts/surfaces/_schema/static-page.json): refs only,
//                          {content: k} into the surface's content file. The section kinds and part roles are read from the one home,
//                          static-page.schema.json; an unknown kind, an unknown role, a role outside its kind, a missing or extra key, a non-string
//                          content key (a number) or a link that is not a same-origin path throws.
//   <StaticBinding/>    -> the tree rendered with the mapped Mantine parts only (bindings.json mapping.web.STATIC), through a function over the tree
//                          (no local JSX component, no createElement: C-8). A link is a Mantine Button rendered as the Next Link (a real route,
//                          126 §0b item 11); the one action is the mount's `retry` (an error boundary's reset). An unknown component, content key or
//                          action throws; nothing is skipped silently.
// MF-76 (dated 2026-11-11; operator D-1 (a), D-2 (a), D-3 (a) "3 y", D-6 (a) and the all-scenarios ruling; plan v3 §3.2-§3.5, §12 folds 8, 9, 12, 18,
// §13a, §13b): the landing kinds hero, figures, items and plans. A part naming `value` is a template with one {value} slot; the node carries
// {derived: <read>} and the render fills it from the server's `values` (server-formatted strings; a missing or non-string value throws: the server
// leaves out a part whose read failed, the binding never skips one). The citywide figures are the report loading state's own lines (report-
// presentation.json states.checked, one home), sent by the server as {derived: checked.citywide.<key>}. The two report regions are the shared
// REPORT renderers, never re-drawn: the processing demo is ReportView over the server's loading view (CSS pacing, Skip a real link to #sample) and
// the sample is ReportPage over the committed synthetic page tree, inside a keyboard-reachable named region that fades in by opacity when the demo
// ends (#sample:target and reduce motion show it at once); the step picture and the process scene are the report Picture, drawn only when the server
// sends an image.
'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, Group, List, ListItem, Stack, Text, Title } from '@mantine/core';
import { Picture, ReportView } from '@/components/report/ReportView';
import { ReportPage } from '@/components/report/ReportPage';
import type { PageView, ReportView as LoadingView, ViewImage } from '@/lib/surfaces/report/core';
import schema from '../../../../scripts/surfaces/_schema/static-page.schema.json';
import presentation from '../../../../scripts/surfaces/_schema/report-presentation.json';

export type StaticRef = { content: string } | { derived: string };
export type StaticNode = { component: string; props: Record<string, unknown>; children: Array<StaticNode | StaticRef> };
export type StaticPart = { role: string; content?: string; href?: string; value?: string; group?: string };
export type StaticSection = { kind: string; id: string; parts: StaticPart[] };
export type StaticPage = { sections: StaticSection[] };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The closed section kinds and the roles of each, read from static-page.schema.json (one home; FE-34 pattern). */
export const STATIC_KINDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  schema.$defs.section.oneOf.map((r) => {
    const kind = r.$ref.split('/').pop() as 'prose' | 'footer' | 'hero' | 'figures' | 'items' | 'plans';
    return [kind, schema.$defs[kind].properties.parts.items.properties.role.enum];
  }),
);
/** A same-origin path (the schema's href pattern): never `//host`, never a backslash, never a scheme. */
const HREF = new RegExp(schema.$defs.part.properties.href.pattern);
const KEY = new RegExp(schema.$defs.part.properties.content.pattern);
const SECTION_KEYS = ['kind', 'id', 'parts'];
const PART_KEYS = ['role', 'content', 'href', 'value', 'group'];
const VALUE = new RegExp(schema.$defs.part.properties.value.pattern);
/** The roles that carry an href and the roles that carry no content key, read from the schema's part rules (one home). */
const [LINK_RULE, BARE_RULE] = schema.$defs.part.allOf;
const LINK_ROLES: readonly string[] = LINK_RULE?.if.properties.role.enum ?? [];
const BARE_ROLES: readonly string[] = BARE_RULE?.if.properties.role.enum ?? [];
/** The citywide line keys of the report loading state, in its order (report-presentation.json states.checked; MF-62, one home). */
const CITYWIDE_KEYS: readonly string[] = Object.keys(presentation.states.checked.lines.citywide);
const SLOT = '{value}';

/** The web layout table: Tailwind class strings (full literals), dark, as the MaxBLD search page (Spec 117 §6.1 palette). */
export const WEB_STATIC_LAYOUT = {
  screen: 'min-h-screen w-full bg-zinc-950',
  column: 'mx-auto w-full max-w-2xl gap-8 px-4 pt-10 pb-16',
  prose: 'gap-4',
  title: 'text-3xl font-bold tracking-tight text-zinc-100',
  heading: 'mt-4 text-xl font-semibold text-zinc-100',
  paragraph: 'text-base leading-7 text-zinc-300',
  list: 'text-base leading-7 text-zinc-300',
  item: 'text-base leading-7 text-zinc-300',
  retry: 'mt-2 self-start rounded-xl',
  footer: 'gap-3 border-t border-zinc-800 pt-6',
  links: 'gap-2',
  link: 'rounded-xl text-zinc-300',
  legal: 'text-[13px] leading-[18px] font-normal text-zinc-400',
  // MF-76: the landing (wider column; the report regions keep their own report-* colours).
  wide: 'mx-auto w-full max-w-6xl gap-16 px-4 pt-4 pb-16',
  hero: 'gap-10',
  nav: 'justify-between gap-2',
  navLinks: 'gap-1',
  wordmark: 'rounded-xl text-lg font-extrabold text-zinc-100',
  navLink: 'rounded-xl text-zinc-300',
  heroGrid: 'grid gap-10 md:grid-cols-2 md:items-start',
  heroCopy: 'gap-5',
  tagline: 'text-sm font-semibold uppercase tracking-[.12em] text-amber-400',
  h1: 'text-4xl font-extrabold tracking-tight text-zinc-100 md:text-5xl',
  accent: 'text-amber-400',
  sub: 'text-lg leading-7 text-zinc-300',
  cta: 'self-start rounded-xl',
  terms: 'text-sm leading-6 text-zinc-300',
  term: 'text-sm leading-6 text-zinc-300',
  media: 'gap-3',
  sample: 'landing-sample max-h-[640px] overflow-y-auto rounded-[20px] border border-zinc-800 bg-report-page focus-visible:outline-2 focus-visible:outline-amber-400',
  caption: 'text-[13px] leading-[18px] text-zinc-400',
  section: 'gap-6 scroll-mt-20',
  h2: 'text-3xl font-bold tracking-tight text-zinc-100',
  lede: 'text-lg leading-7 text-zinc-300',
  itemList: 'grid gap-6 md:grid-cols-3',
  itemBox: 'gap-2',
  itemLabel: 'text-sm font-semibold uppercase tracking-[.08em] text-zinc-400',
  h3: 'text-xl font-semibold text-zinc-100',
  itemText: 'text-base leading-7 text-zinc-300',
  figureList: 'grid gap-4 text-zinc-100 md:grid-cols-2',
  figure: 'text-xl font-semibold text-zinc-100',
  boxes: 'grid gap-4 md:grid-cols-4',
  box: 'gap-3 rounded-[20px] border border-zinc-800 bg-zinc-900 p-5',
  price: 'text-3xl font-bold text-zinc-100',
  per: 'text-base text-zinc-300',
  tax: 'text-sm text-zinc-400',
  note: 'text-sm text-zinc-400',
  boxLink: 'mt-auto rounded-xl',
  foot: 'text-base text-zinc-300',
} as const;
const L = WEB_STATIC_LAYOUT;

const ref = (content: string): StaticRef => ({ content });
const node = (component: string, props: Json, children: StaticNode['children'] = []): StaticNode => ({ component, props, children });
const fail = (why: string): never => { throw new Error(`StaticBinding: ${why}`); };

const txt = (p: StaticPart): StaticRef => ref(p.content as string);
const derived = (name: string): StaticRef => ({ derived: name });
/** A content node; a part naming a value carries {derived: <read>} under `value` (filled at render; FE-05: the server formats). */
const textNode = (p: StaticPart, props: Json): StaticNode => node('Text', { ...props, ...(p.value === undefined ? {} : { value: derived(p.value) }) }, [txt(p)]);
const linkNode = (p: StaticPart, key: string, variant: string, color: string, className: string): StaticNode =>
  node('Button', { key, testID: `static-link-${p.href}`, href: p.href, size: 'lg', variant, color, className }, [txt(p)]);

const checkPart = (p: unknown, kind: string, at: string): StaticPart => {
  if (!isObj(p)) return fail(`${at}: a part is not an object`);
  for (const k of Object.keys(p)) if (!PART_KEYS.includes(k)) fail(`${at}: unknown key "${k}"`);
  if (typeof p.role !== 'string' || !(STATIC_KINDS[kind] ?? []).includes(p.role)) fail(`${at}: role ${JSON.stringify(p.role)} is not a ${kind} role`);
  const bare = BARE_ROLES.includes(p.role as string);
  if (bare ? p.content !== undefined || p.value !== undefined : typeof p.content !== 'string' || !KEY.test(p.content)) fail(`${at}: content ${JSON.stringify(p.content)} is not a content key (a value is never typed into a page)`);
  if (LINK_ROLES.includes(p.role as string) ? typeof p.href !== 'string' || !HREF.test(p.href) : p.href !== undefined) fail(`${at}: href ${JSON.stringify(p.href)} is not allowed here`);
  if (p.value !== undefined && (typeof p.value !== 'string' || !VALUE.test(p.value))) fail(`${at}: value ${JSON.stringify(p.value)} is not a declared read name`);
  if (p.role === 'checked' ? p.group !== 'citywide' : p.group !== undefined) fail(`${at}: group ${JSON.stringify(p.group)} is not allowed here`);
  return p as StaticPart;
};

const proseNode = (s: StaticSection): StaticNode => {
  const kids: StaticNode[] = [];
  let list: StaticNode | null = null;
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    if (p.role === 'item') {
      if (list === null) { list = node('List', { key: `${key}-list`, className: L.list }); kids.push(list); }
      list.children.push(node('ListItem', { key, className: L.item }, [txt(p)]));
      return;
    }
    list = null;
    if (p.role === 'title') kids.push(node('Title', { key, testID: 'static-title', className: L.title }, [txt(p)]));
    else if (p.role === 'heading') kids.push(node('Text', { key, component: 'h2', className: L.heading }, [txt(p)]));
    else if (p.role === 'paragraph') kids.push(node('Text', { key, className: L.paragraph }, [txt(p)]));
    else kids.push(node('Button', { key, testID: 'static-retry', size: 'lg', variant: 'filled', color: 'yellow', className: L.retry, onClick: { action: 'retry' } }, [txt(p)]));
  });
  return node('Stack', { key: s.id, testID: `static-${s.id}`, component: 'section', className: L.prose }, kids);
};

const footerNode = (s: StaticSection): StaticNode => node('Stack', { key: s.id, testID: 'static-footer', component: 'footer', className: L.footer }, [
  node('Group', { key: `${s.id}-links`, className: L.links }, s.parts.filter((p) => p.role === 'link').map((p, i) =>
    node('Button', { key: `${s.id}-${i}`, testID: `static-link-${p.href}`, href: p.href, size: 'lg', variant: 'subtle', color: 'gray', className: L.link }, [txt(p)]))),
  ...s.parts.filter((p) => p.role === 'legal').map((p, i) => node('Text', { key: `${s.id}-legal-${i}`, testID: 'static-legal', className: L.legal }, [txt(p)])),
]);

// ---- MF-76: the landing kinds ------------------------------------------------------------------------------------------------------------------

/** The hero: the nav (wordmark and links), the copy (tagline, the h1 with its accent, the sub line, the main link, the trial terms, the short legal
 * line) and the media (the scene slot, the processing demo, the sample region and its caption), each in table order. */
const heroNode = (s: StaticSection): StaticNode => {
  const nav: StaticNode[] = [];
  const links: StaticNode[] = [];
  const copy: StaticNode[] = [];
  const media: StaticNode[] = [];
  let title: StaticNode | null = null;
  let terms: StaticNode | null = null;
  let sample: StaticNode | null = null;
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    if (p.role !== 'term') terms = null;
    if (p.role !== 'caption' && p.role !== 'sample') sample = null;
    if (p.role === 'wordmark') nav.push(linkNode(p, key, 'subtle', 'gray', L.wordmark));
    else if (p.role === 'nav') links.push(linkNode(p, key, 'subtle', 'gray', L.navLink));
    else if (p.role === 'tagline') copy.push(textNode(p, { key, className: L.tagline }));
    else if (p.role === 'title') { title = node('Title', { key, testID: 'static-title', className: L.h1 }, [txt(p)]); copy.push(title); }
    else if (p.role === 'accent') {
      if (title === null) fail(`${s.id}: an accent follows the title`);
      (title as StaticNode).children.push(node('Text', { key, component: 'span', className: L.accent }, [txt(p)]));
    } else if (p.role === 'sub') copy.push(textNode(p, { key, className: L.sub }));
    else if (p.role === 'cta') copy.push(linkNode(p, key, 'filled', 'yellow', L.cta));
    else if (p.role === 'term') {
      if (terms === null) { terms = node('List', { key: `${key}-terms`, testID: 'landing-terms', className: L.terms }); copy.push(terms); }
      (terms as StaticNode).children.push(node('ListItem', { key, className: L.term }, [textNode(p, { key: `${key}-t`, component: 'span' })]));
    } else if (p.role === 'legal') copy.push(textNode(p, { key, testID: 'static-legal', className: L.legal }));
    else if (p.role === 'scene') media.push(node('Picture', { key, testID: 'landing-scene', image: derived('scene') }));
    else if (p.role === 'demo') media.push(node('ReportView', { key, testID: 'landing-demo', view: derived('demo') }));
    else if (p.role === 'sample') {
      sample = node('Stack', { key, id: 'sample', testID: 'landing-sample', component: 'section', tabIndex: 0, label: txt(p), className: L.sample }, [node('ReportPage', { key: `${key}-page`, view: derived('sample') })]);
      media.push(sample);
    } else {
      if (sample === null) fail(`${s.id}: a caption follows the sample`);
      media.push(textNode(p, { key, testID: 'landing-caption', className: L.caption }));
    }
  });
  if (title === null) fail(`${s.id}: a hero has a title`);
  return node('Stack', { key: s.id, testID: `static-${s.id}`, id: s.id, component: 'header', className: L.hero }, [
    node('Group', { key: `${s.id}-nav`, component: 'nav', className: L.nav }, [...nav, node('Group', { key: `${s.id}-links`, className: L.navLinks }, links)]),
    node('Group', { key: `${s.id}-grid`, className: L.heroGrid }, [
      node('Stack', { key: `${s.id}-copy`, className: L.heroCopy }, copy),
      node('Stack', { key: `${s.id}-media`, className: L.media }, media),
    ]),
  ]);
};

/** The head of a section (an h2 and a lede or intro); any other part before the body throws. */
const headNode = (p: StaticPart, key: string): StaticNode =>
  (p.role === 'heading' ? textNode(p, { key, component: 'h2', className: L.h2 }) : textNode(p, { key, className: L.lede }));

/** figures: the heading, then one list of figures; the citywide group is the report loading state's lines, one ref per key. */
const figuresNode = (s: StaticSection): StaticNode => {
  const head: StaticNode[] = [];
  const list = node('List', { key: `${s.id}-list`, testID: 'landing-figures', className: L.figureList });
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    if (p.role === 'heading') { if (list.children.length) fail(`${s.id}: the heading comes first`); head.push(headNode(p, key)); }
    else if (p.role === 'figure') list.children.push(node('ListItem', { key, className: L.figure }, [textNode(p, { key: `${key}-t`, component: 'span' })]));
    else for (const k of CITYWIDE_KEYS) list.children.push(node('ListItem', { key: `${key}-${k}`, testID: `landing-checked-${k}`, className: L.figure }, [derived(`checked.${p.group}.${k}`)]));
  });
  return node('Stack', { key: s.id, testID: `static-${s.id}`, id: s.id, component: 'section', className: L.section }, [...head, list]);
};

/** items: the heading and lede, then items; an item starts at a label, or at a title not right after a label. */
const itemsNode = (s: StaticSection): StaticNode => {
  const head: StaticNode[] = [];
  const list = node('List', { key: `${s.id}-list`, testID: `landing-${s.id}-items`, className: L.itemList });
  let item: StaticNode | null = null;
  let prev = '';
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    if (p.role === 'heading' || p.role === 'lede') {
      if (item !== null) fail(`${s.id}: the heading and lede come before the items`);
      head.push(headNode(p, key));
    } else {
      if (p.role === 'label' || (p.role === 'title' && prev !== 'label')) {
        item = node('Stack', { key: `${key}-item`, className: L.itemBox });
        list.children.push(node('ListItem', { key: `${key}-li` }, [item]));
      }
      if (item === null) fail(`${s.id}: a ${p.role} outside an item`);
      const box = item as StaticNode;
      if (p.role === 'label') box.children.push(textNode(p, { key, className: L.itemLabel }));
      else if (p.role === 'title') box.children.push(textNode(p, { key, component: 'h3', className: L.h3 }));
      else if (p.role === 'text') box.children.push(textNode(p, { key, className: L.itemText }));
      else box.children.push(node('Picture', { key, testID: 'landing-picture', image: derived('picture') }));
    }
    prev = p.role;
  });
  return node('Stack', { key: s.id, testID: `static-${s.id}`, id: s.id, component: 'section', className: L.section }, [...head, list]);
};

/** plans: the heading and intro, then boxes (a box starts at its name), then the foot. A price is followed by its per and tax parts (drip
 * pricing, Competition Act s.74.01(1.1)): a price without them, or a per or tax without a price, throws. */
const plansNode = (s: StaticSection): StaticNode => {
  const head: StaticNode[] = [];
  const boxes = node('Group', { key: `${s.id}-boxes`, testID: 'landing-plans', className: L.boxes });
  const foot: StaticNode[] = [];
  let box: StaticNode | null = null;
  let before = '';
  const order = (role: string): void => {
    if (before === 'price' && role !== 'per') fail(`${s.id}: a price is followed by its per and tax parts`);
    if (before === 'per' && role !== 'tax') fail(`${s.id}: a per sits between its price and its tax`);
    if (role === 'per' && before !== 'price') fail(`${s.id}: a per sits between its price and its tax`);
    if (role === 'tax' && before !== 'per') fail(`${s.id}: a tax follows its price and per`);
    before = role;
  };
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    order(p.role);
    if (p.role === 'heading' || p.role === 'intro') {
      if (box !== null) fail(`${s.id}: the heading and intro come before the boxes`);
      head.push(headNode(p, key));
      return;
    }
    if (p.role === 'foot') { foot.push(textNode(p, { key, className: L.foot })); return; }
    if (foot.length) fail(`${s.id}: the foot comes last`);
    if (p.role === 'name') { box = node('Stack', { key: `${key}-box`, testID: `landing-plan-${key}`, className: L.box }); boxes.children.push(box); }
    if (box === null) fail(`${s.id}: a ${p.role} outside a box`);
    const b = box as StaticNode;
    if (p.role === 'name') b.children.push(textNode(p, { key, component: 'h3', className: L.h3 }));
    else if (p.role === 'price') b.children.push(textNode(p, { key, testID: 'landing-price', className: L.price }));
    else if (p.role === 'per') b.children.push(textNode(p, { key, className: L.per }));
    else if (p.role === 'tax') b.children.push(textNode(p, { key, testID: 'landing-tax', className: L.tax }));
    else if (p.role === 'tick') b.children.push(textNode(p, { key, className: L.itemText }));
    else if (p.role === 'note') b.children.push(textNode(p, { key, className: L.note }));
    else b.children.push(linkNode(p, key, 'light', 'yellow', L.boxLink));
  });
  order('');
  return node('Stack', { key: s.id, testID: `static-${s.id}`, id: s.id, component: 'section', className: L.section }, [...head, boxes, ...foot]);
};

const KIND_NODES: Record<string, (s: StaticSection) => StaticNode> = { prose: proseNode, footer: footerNode, hero: heroNode, figures: figuresNode, items: itemsNode, plans: plansNode };

/** The props tree of one page. Sections in table order; every shown text a content ref or a server value ref. */
export function staticWebTree(page: StaticPage): StaticNode {
  if (!isObj(page) || !Array.isArray(page.sections) || page.sections.length === 0 || Object.keys(page).some((k) => k !== 'sections')) fail('a page is { sections: [...] } with at least one section');
  const sections = page.sections.map((s, i): StaticSection => {
    const at = `section ${i}`;
    if (!isObj(s)) return fail(`${at}: not an object`);
    for (const k of Object.keys(s)) if (!SECTION_KEYS.includes(k)) fail(`${at}: unknown key "${k}"`);
    if (typeof s.kind !== 'string' || !Object.hasOwn(STATIC_KINDS, s.kind)) fail(`${at}: unknown section kind ${JSON.stringify(s.kind)}`);
    if (typeof s.id !== 'string' || s.id === '') fail(`${at}: no id`);
    if (!Array.isArray(s.parts) || s.parts.length === 0) fail(`${at}: no parts`);
    return { kind: s.kind, id: s.id, parts: (s.parts as unknown[]).map((p, j) => checkPart(p, s.kind as string, `${at} part ${j}`)) };
  });
  const landing = sections.some((s) => s.kind === 'hero');
  return node('Stack', { key: 'page', testID: 'static-page', component: 'main', className: L.screen }, [
    node('Stack', { key: 'column', className: landing ? L.wide : L.column }, sections.map((s) => (KIND_NODES[s.kind] as (x: StaticSection) => StaticNode)(s))),
  ]);
}

// ---- render half -------------------------------------------------------------------------------------------------------------------------------

export type StaticActions = { retry: () => void };
/** MF-76: the server's values (each a server-formatted string, FE-05) and the shared report views the landing embeds. */
export type StaticValues = Record<string, string>;
export type StaticReport = { demo?: LoadingView; sample?: PageView; picture?: ViewImage; scene?: ViewImage };
type Ctx = { content: Record<string, string>; actions: Partial<StaticActions>; values: StaticValues; report: StaticReport };

/** A server value by name; a missing value or one that is not a non-empty string throws (the server leaves out a part whose read failed). */
const valueOf = (name: unknown, values: StaticValues): string => {
  const v: unknown = typeof name === 'string' && Object.hasOwn(values, name) ? values[name] : undefined;
  if (typeof v !== 'string' || v === '') return fail(`no server value "${String(name)}" (a string, FE-05)`);
  return v;
};

/** A content ref -> its text; MF-76: a {derived: name} ref -> the server value. A missing key, or a value that is not a string, throws (FE-05: a
 * number is never shown). */
export function resolveStaticRef(v: unknown, content: Record<string, string>, values: StaticValues = {}): string {
  if (isObj(v) && Object.keys(v).length === 1 && 'derived' in v) return valueOf(v.derived, values);
  if (!isObj(v) || Object.keys(v).length !== 1 || typeof v.content !== 'string') return fail(`not a content ref: ${JSON.stringify(v)}`);
  if (!Object.hasOwn(content, v.content)) return fail(`unknown content key "${v.content}"`);
  const t: unknown = content[v.content];
  if (typeof t !== 'string') return fail(`content "${v.content}" is not a string`);
  return t;
}

const handler = (a: unknown, ctx: Ctx): (() => void) | undefined => {
  if (a === undefined) return undefined;
  if (!isObj(a) || a.action !== 'retry') return fail(`unknown action ${JSON.stringify(a)}`);
  return ctx.actions.retry;
};

/** The entries of `o` whose value is not undefined, typed for a JSX spread (the values are the tree's, as sent). */
const defined = (o: Json): Record<string, never> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, never>;

/** MF-76: the one {value} slot of a template filled with the server value; a template without its value, or a value without its slot, throws. */
const filled = (kids: ReactNode[], value: unknown, values: StaticValues): ReactNode[] => {
  const slotted = (t: ReactNode): boolean => typeof t === 'string' && t.includes(SLOT);
  if (value === undefined) {
    if (kids.some(slotted)) fail('a {value} template without its value');
    return kids;
  }
  if (!isObj(value) || !('derived' in value)) return fail(`value ${JSON.stringify(value)} is not a server value ref`);
  const [t, ...more] = kids;
  if (more.length || typeof t !== 'string' || t.indexOf(SLOT) < 0 || t.indexOf(SLOT) !== t.lastIndexOf(SLOT)) return fail('a value fills a template with exactly one {value} slot');
  const v = valueOf(value.derived, values);
  return [t.replace(SLOT, () => v)];
};

/** MF-76: the shared report view a node names ({derived: demo | sample | picture | scene}); missing throws (the server leaves the part out). */
const reportOf = <K extends keyof StaticReport>(ref: unknown, name: K, report: StaticReport): NonNullable<StaticReport[K]> => {
  if (!isObj(ref) || ref.derived !== name) return fail(`not a ${name} ref: ${JSON.stringify(ref)}`);
  const v = report[name];
  if (v === undefined) return fail(`no ${name} view (the server leaves this part out)`);
  return v as NonNullable<StaticReport[K]>;
};

/** One tree node -> its mapped Mantine part. Every element below is a listed library component (bindings.json mapping.web.STATIC) or, by exact
 * name and module, one of the shared REPORT renderers (MF-76; Spec 126 §11b.1, FE-07). */
function renderStaticNode(n: StaticNode, ctx: Ctx): ReactNode {
  const p = n.props;
  const kids = filled(n.children.map((c) => (isObj(c) && 'component' in c ? renderStaticNode(c as StaticNode, ctx) : resolveStaticRef(c, ctx.content, ctx.values))), p.value, ctx.values);
  const k = p.key as string | undefined; // React keys are passed by name, never spread
  const base = defined({ 'data-testid': p.testID, className: p.className });
  switch (n.component) {
    case 'Stack': {
      if (p.label === undefined) return <Stack key={k} {...base} {...defined({ id: p.id, component: p.component })}>{kids}</Stack>;
      // MF-76: the sample region: named, keyboard-reachable (WCAG 2.1.1); it fades in by opacity when the demo ends (--reveal, the server's minimum).
      const ms = ctx.report.demo?.checked?.min_ms;
      const reveal = ms === undefined ? undefined : { ['--reveal' as string]: `${ms}ms` };
      return <Stack key={k} {...base} {...defined({ id: p.id, component: p.component, tabIndex: p.tabIndex, style: reveal })} aria-label={resolveStaticRef(p.label, ctx.content)}>{kids}</Stack>;
    }
    case 'Group':
      return <Group key={k} {...base} {...defined({ component: p.component })}>{kids}</Group>;
    case 'Title':
      return <Title key={k} {...base}>{kids}</Title>;
    case 'Text':
      return <Text key={k} {...base} {...defined({ component: p.component })}>{kids}</Text>;
    case 'List':
      return <List key={k} {...base}>{kids}</List>;
    case 'ListItem':
      return <ListItem key={k} {...base}>{kids}</ListItem>;
    case 'Button': {
      const look = defined({ size: p.size, variant: p.variant, color: p.color });
      if (p.href !== undefined) {
        if (typeof p.href !== 'string' || !HREF.test(p.href)) return fail(`href ${JSON.stringify(p.href)} is not a same-origin path`);
        return <Button key={k} {...base} {...look} component={Link} href={p.href}>{kids}</Button>;
      }
      const click = handler(p.onClick, ctx);
      return <Button key={k} {...base} {...look} {...defined({ onClick: click })} disabled={click === undefined}>{kids}</Button>;
    }
    case 'ReportView':
      return <ReportView key={k} view={reportOf(p.view, 'demo', ctx.report)} />;
    case 'ReportPage':
      return <ReportPage key={k} view={reportOf(p.view, 'sample', ctx.report)} />;
    case 'Picture':
      return <Picture key={k} im={reportOf(p.image, (isObj(p.image) && p.image.derived === 'scene' ? 'scene' : 'picture'), ctx.report)} />;
    default:
      return fail(`unmapped component "${n.component}"`);
  }
}

/** Renders one props tree with the content strings, the mount's actions and (MF-76) the server's values and report views. */
export function StaticBinding({ tree, content, actions = {}, values = {}, report = {} }: { tree: StaticNode; content: Record<string, string>; actions?: Partial<StaticActions>; values?: StaticValues; report?: StaticReport }) {
  return <>{renderStaticNode(tree, { content, actions, values, report })}</>;
}
