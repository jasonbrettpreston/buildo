// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 and its dated note 2026-11-10 item (5) (component names have one home,
//            bindings.json mapping.<platform>.<archetype>; the mobile table shape is MF-35's lock edit), §11b.4 (React Native Reusables, vendored),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (C-8 mobile half, C-9 mobile), FE-32 (contract paths), FE-33.
//
// MF-35 · the mobile binding (render half), shared by the mobile archetypes (P35-D10 a). It turns a props tree (SearchBinding.tsx) into the
// library parts. It renders ONLY through the COMPONENTS table below, whose keys equal bindings.json mapping.mobile.SEARCH and whose values are
// (MF-53, dated 2026-11-11: the table is the union of mapping.mobile.SEARCH and mapping.mobile.LIST; LIST adds react-native-maps' own MapView,
// Polygon and Marker for S-071's `render.projection: map`, configured by props, no hand-built part; the action `back` leaves the page)
// imported library parts (the vendored Reusables, React Native core layout, safe-area): the FE-31 C-8 mobile half reads this literal by AST.
// It has no layout, style or text of its own. It resolves refs (content, contract paths, derived names), `{text, vars}` templates (a 0 is "0",
// never dropped) and action data (the screen's callbacks). An unmapped component, icon, content key or action throws: the screen's ErrorBoundary
// reports it; nothing is skipped silently. React keys come from the tree's `key` props, never from an array index.
// MF-48 (Spec 126 §11b.2 dated note 2026-11-11, D-2 a and D-4 a): the same renderer also renders REPORT trees (ReportBinding.tsx), whose parts are a
// subset of this table (bindings.json mapping.mobile.REPORT), so the table is unchanged. A REPORT tree's texts are `part` refs into the page view
// built by MF-57's core (pageViewOf): this file only looks a ref up (section id, part index, role must match; an ad section's value or
// disclosure) and throws on anything else. The REPORT actions carry their arguments as data and each has its own case; there is no default.
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { AlertTriangle, ArrowRight, Ban, Check, Lock, MapPin, RefreshCw, Search, User, X } from 'lucide-react-native';
import { Alert, AlertDescription } from '@/vendor/rnr/components/ui/alert';
import { Button } from '@/vendor/rnr/components/ui/button';
import { Icon } from '@/vendor/rnr/components/ui/icon';
import { Input } from '@/vendor/rnr/components/ui/input';
import { Text } from '@/vendor/rnr/components/ui/text';

export const COMPONENTS = { SafeAreaView, ScrollView, View, Text, Input, Button, Alert, AlertDescription, Icon, ActivityIndicator, MapView, Polygon, Marker };
/** The closed icon table (plan v3 §2.2). */
export const ICONS = { Search, MapPin, AlertTriangle, RefreshCw, Lock, Ban, User, Check, ArrowRight, X };

type Json = Record<string, unknown>;
export type SurfaceActions = {
  change_input: (text: string) => void;
  set_input: (value: string) => void;
  retry: () => void;
  select: (parcelId: string) => void;
  push: (route: string) => void;
  open_account: () => void;
  /** MF-53: leave the page (the map page's clear button). */
  back: () => void;
  /** MF-46 follow-up (dated 2026-11-12): open Help & Support in the browser with a topic and a value (mobile/src/lib/maxbldHelp.ts). A host
   * that renders no help link need not pass it; a tree naming it there throws (the `in` guard). */
  open_help?: (topic: string, q: string) => void;
};
/** MF-48: the REPORT callbacks (ReportPageHost.tsx holds the UI state they change). */
export type ReportActions = {
  toggle_panel: (option: string, panel: 'size' | 'cost') => void;
  toggle_how: (option: string) => void;
  open_sheet: () => void;
  close_sheet: () => void;
  /** MF-48 Stage B: the error state's Retry (refetch) and the screen's Back (the same action names and cases as SEARCH and LIST). */
  retry: () => void;
  back: () => void;
};
export type SurfaceTree = { component: string; props: Json; children: unknown[] };
/** MF-48: the page view a `part` ref is looked up in (MF-57 pageViewOf; only what the lookup reads). */
type PageData = { sections: { id: string; ad?: Json; parts: { role: string; text: string }[] }[] };
type Ctx = { content: Record<string, string>; data: { contract: Json; derived: Json; page?: PageData }; actions: SurfaceActions | ReportActions };
// OUTPUT fold CR LOW-3: the actions prop is the union of the two sets on purpose; a tree naming an action the screen did not pass fails at run time
// (the `in` guard in action()), as MF-35's unknown-action plant pins.
type AllActions = SurfaceActions & ReportActions;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const walk = (root: unknown, segs: string[]): unknown => {
  let v = root;
  for (const s of segs) v = isObj(v) || Array.isArray(v) ? (v as Json)[s] : undefined;
  return v;
};

/** A ref or template → its value; anything else is returned as is. */
export function resolveValue(v: unknown, ctx: Ctx): unknown {
  if (!isObj(v)) return v;
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === 'content') {
    const k = v.content as string;
    if (!Object.hasOwn(ctx.content, k)) throw new Error(`SurfaceRenderer: unknown content key "${k}"`);
    return ctx.content[k];
  }
  if (keys.length === 1 && (keys[0] === 'contract' || keys[0] === 'derived')) {
    const found = walk(keys[0] === 'contract' ? ctx.data.contract : ctx.data.derived, String(v[keys[0]]).split('.'));
    // OUTPUT fold LOW: a ref that resolves to nothing is a gap, never rendered as ''; a null value (a field sent as null) is allowed.
    if (found === undefined) throw new Error(`SurfaceRenderer: unresolved ref ${JSON.stringify(v)}`);
    return found;
  }
  if (keys.length === 1 && keys[0] === 'part') return partText(String(v.part), ctx);
  if (keys.every((k) => k === 'text' || k === 'vars') && 'text' in v && 'vars' in v && isObj(v.vars)) {
    const vars = v.vars;
    return String(resolveValue(v.text, ctx)).replace(/\{(\w+)\}/g, (m, name: string) => (Object.hasOwn(vars, name) ? String(resolveValue(vars[name], ctx) ?? '') : m));
  }
  return v;
}

const PART_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PART_INDEX = /^(0|[1-9][0-9]*)$/;
const AD_ROLES = ['value', 'disclosure'];
/** MF-48 · a `part` ref → its text: `<section id>.<part index>.<role>` or `<section id>.ad.<value|disclosure>`. Anything else throws. */
function partText(ref: string, ctx: Ctx): unknown {
  const [id = '', at = '', ...rest] = ref.split('.');
  const role = rest.join('.');
  const fail = (): never => { throw new Error(`SurfaceRenderer: unresolved ref ${JSON.stringify({ part: ref })}`); };
  const s = PART_ID.test(id) ? ctx.data.page?.sections.find((x) => x.id === id) : undefined;
  if (!s) return fail();
  if (at === 'ad') return s.ad && AD_ROLES.includes(role) && typeof s.ad[role] === 'string' ? s.ad[role] : fail();
  const p = PART_INDEX.test(at) ? (s.parts as unknown as Record<string, { role: string; text: string } | undefined>)[at] : undefined;
  return p && p.role === role ? p.text : fail();
}

const action = (a: Json, ctx: Ctx): ((arg?: unknown) => void) => {
  const name = a.action as keyof AllActions;
  if (!(name in ctx.actions)) throw new Error(`SurfaceRenderer: unknown action "${String(a.action)}"`);
  const act = ctx.actions as AllActions;
  switch (name) {
    case 'change_input':
      return (text) => act.change_input(String(text));
    case 'set_input':
      return () => act.set_input(String(resolveValue(a.value, ctx)));
    case 'select':
      return () => act.select(String(resolveValue(a.parcelId, ctx)));
    case 'push':
      return () => act.push(String(a.route));
    case 'retry':
      return () => act.retry();
    case 'open_account':
      return () => act.open_account();
    case 'back':
      return () => act.back();
    case 'open_help':
      return () => act.open_help?.(String(a.topic), String(resolveValue(a.q, ctx)));
    case 'toggle_panel':
      if (a.panel !== 'size' && a.panel !== 'cost') throw new Error(`SurfaceRenderer: unknown panel "${String(a.panel)}"`);
      return () => act.toggle_panel(String(a.option), a.panel as 'size' | 'cost');
    case 'toggle_how':
      return () => act.toggle_how(String(a.option));
    case 'open_sheet':
      return () => act.open_sheet();
    case 'close_sheet':
      return () => act.close_sheet();
    default: {
      const unhandled: never = name;
      throw new Error(`SurfaceRenderer: no case for action "${String(unhandled)}"`);
    }
  }
};

const ACTION_PROPS = new Set(['onPress', 'onChangeText']);
const DATA_PROPS = new Set(['key', 'navigate']);

function renderNode(n: SurfaceTree, ctx: Ctx): React.ReactNode {
  const C = COMPONENTS[n.component as keyof typeof COMPONENTS] as React.ComponentType<Json> | undefined;
  if (!C) throw new Error(`SurfaceRenderer: unmapped component "${n.component}"`);
  const props: Json = {};
  for (const [k, v] of Object.entries(n.props)) {
    if (DATA_PROPS.has(k)) continue;
    if (ACTION_PROPS.has(k)) {
      if (isObj(v)) props[k] = action(v, ctx);
      continue;
    }
    if (k === 'icon') {
      const icon = ICONS[v as keyof typeof ICONS];
      if (!icon) throw new Error(`SurfaceRenderer: unknown icon "${String(v)}"`);
      props[n.component === 'Icon' ? 'as' : 'icon'] = icon;
      continue;
    }
    props[k] = resolveValue(v, ctx);
  }
  const kids = n.children.map((c) => (isObj(c) && 'component' in c ? renderNode(c as SurfaceTree, ctx) : String(resolveValue(c, ctx) ?? '')));
  return (
    <C key={n.props.key as string | undefined} {...props}>
      {kids.length === 0 ? undefined : kids}
    </C>
  );
}

/** Renders one props tree with the content strings, the bound data and the screen's callbacks. */
export function SurfaceRenderer({ tree, content, data, actions }: { tree: SurfaceTree; content: Record<string, string>; data: Ctx['data']; actions: SurfaceActions | ReportActions }) {
  return renderNode(tree, { content, data, actions });
}
