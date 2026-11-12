// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.5 (the first web consumer of STATIC adds its binding entry, golden shape,
//            one planted-defect case and one render smoke), §11b.2 (one binding per archetype per platform; refs only), §0b items 3-5 and 11,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18 (every string from content), FE-31 (C-8
//            closed mapping, C-9 44 px), FE-33 (render smoke), FE-34 (closed kinds and roles; a number throws), FE-36 (navigation is a route).
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
'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, Group, List, ListItem, Stack, Text, Title } from '@mantine/core';
import schema from '../../../../scripts/surfaces/_schema/static-page.schema.json';

export type StaticRef = { content: string };
export type StaticNode = { component: string; props: Record<string, unknown>; children: Array<StaticNode | StaticRef> };
export type StaticPart = { role: string; content: string; href?: string };
export type StaticSection = { kind: string; id: string; parts: StaticPart[] };
export type StaticPage = { sections: StaticSection[] };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The closed section kinds and the roles of each, read from static-page.schema.json (one home; FE-34 pattern). */
export const STATIC_KINDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  schema.$defs.section.oneOf.map((r) => {
    const kind = r.$ref.split('/').pop() as 'prose' | 'footer';
    return [kind, schema.$defs[kind].properties.parts.items.properties.role.enum];
  }),
);
/** A same-origin path (the schema's href pattern): never `//host`, never a backslash, never a scheme. */
const HREF = new RegExp(schema.$defs.part.properties.href.pattern);
const KEY = new RegExp(schema.$defs.part.properties.content.pattern);
const SECTION_KEYS = ['kind', 'id', 'parts'];
const PART_KEYS = ['role', 'content', 'href'];

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
} as const;
const L = WEB_STATIC_LAYOUT;

const ref = (content: string): StaticRef => ({ content });
const node = (component: string, props: Json, children: StaticNode['children'] = []): StaticNode => ({ component, props, children });
const fail = (why: string): never => { throw new Error(`StaticBinding: ${why}`); };

const checkPart = (p: unknown, kind: string, at: string): StaticPart => {
  if (!isObj(p)) return fail(`${at}: a part is not an object`);
  for (const k of Object.keys(p)) if (!PART_KEYS.includes(k)) fail(`${at}: unknown key "${k}"`);
  if (typeof p.role !== 'string' || !(STATIC_KINDS[kind] ?? []).includes(p.role)) fail(`${at}: role ${JSON.stringify(p.role)} is not a ${kind} role`);
  if (typeof p.content !== 'string' || !KEY.test(p.content)) fail(`${at}: content ${JSON.stringify(p.content)} is not a content key (a value is never typed into a page)`);
  if (p.role === 'link' ? typeof p.href !== 'string' || !HREF.test(p.href) : p.href !== undefined) fail(`${at}: href ${JSON.stringify(p.href)} is not allowed here`);
  return p as StaticPart;
};

const proseNode = (s: StaticSection): StaticNode => {
  const kids: StaticNode[] = [];
  let list: StaticNode | null = null;
  s.parts.forEach((p, i) => {
    const key = `${s.id}-${i}`;
    if (p.role === 'item') {
      if (list === null) { list = node('List', { key: `${key}-list`, className: L.list }); kids.push(list); }
      list.children.push(node('ListItem', { key, className: L.item }, [ref(p.content)]));
      return;
    }
    list = null;
    if (p.role === 'title') kids.push(node('Title', { key, testID: 'static-title', className: L.title }, [ref(p.content)]));
    else if (p.role === 'heading') kids.push(node('Text', { key, component: 'h2', className: L.heading }, [ref(p.content)]));
    else if (p.role === 'paragraph') kids.push(node('Text', { key, className: L.paragraph }, [ref(p.content)]));
    else kids.push(node('Button', { key, testID: 'static-retry', size: 'lg', variant: 'filled', color: 'yellow', className: L.retry, onClick: { action: 'retry' } }, [ref(p.content)]));
  });
  return node('Stack', { key: s.id, testID: `static-${s.id}`, component: 'section', className: L.prose }, kids);
};

const footerNode = (s: StaticSection): StaticNode => node('Stack', { key: s.id, testID: 'static-footer', component: 'footer', className: L.footer }, [
  node('Group', { key: `${s.id}-links`, className: L.links }, s.parts.filter((p) => p.role === 'link').map((p, i) =>
    node('Button', { key: `${s.id}-${i}`, testID: `static-link-${p.href}`, href: p.href, size: 'lg', variant: 'subtle', color: 'gray', className: L.link }, [ref(p.content)]))),
  ...s.parts.filter((p) => p.role === 'legal').map((p, i) => node('Text', { key: `${s.id}-legal-${i}`, testID: 'static-legal', className: L.legal }, [ref(p.content)])),
]);

/** The props tree of one page. Sections in table order; every shown text a content ref. */
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
  return node('Stack', { key: 'page', testID: 'static-page', component: 'main', className: L.screen }, [
    node('Stack', { key: 'column', className: L.column }, sections.map((s) => (s.kind === 'prose' ? proseNode(s) : footerNode(s)))),
  ]);
}

// ---- render half -------------------------------------------------------------------------------------------------------------------------------

export type StaticActions = { retry: () => void };
type Ctx = { content: Record<string, string>; actions: Partial<StaticActions> };

/** A content ref -> its text. A missing key, or a value that is not a string, throws (FE-05: a number is never shown). */
export function resolveStaticRef(v: unknown, content: Record<string, string>): string {
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

/** One tree node -> its mapped Mantine part. Every element below is a listed library component (bindings.json mapping.web.STATIC). */
function renderStaticNode(n: StaticNode, ctx: Ctx): ReactNode {
  const p = n.props;
  const kids = n.children.map((c) => (isObj(c) && 'component' in c ? renderStaticNode(c as StaticNode, ctx) : resolveStaticRef(c, ctx.content)));
  const k = p.key as string | undefined; // React keys are passed by name, never spread
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
    default:
      return fail(`unmapped component "${n.component}"`);
  }
}

/** Renders one props tree with the content strings and the mount's actions. */
export function StaticBinding({ tree, content, actions = {} }: { tree: StaticNode; content: Record<string, string>; actions?: Partial<StaticActions> }) {
  return <>{renderStaticNode(tree, { content, actions })}</>;
}
