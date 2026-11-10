// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 and its dated note 2026-11-10 item (5) (component names have one home,
//            bindings.json mapping.<platform>.<archetype>; the mobile table shape is MF-35's lock edit), §11b.4 (React Native Reusables, vendored),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (C-8 mobile half, C-9 mobile), FE-32 (contract paths), FE-33.
//
// MF-35 · the mobile binding (render half), shared by the mobile archetypes (P35-D10 a). It turns a props tree (SearchBinding.tsx) into the
// library parts. It renders ONLY through the COMPONENTS table below, whose keys equal bindings.json mapping.mobile.SEARCH and whose values are
// imported library parts (the vendored Reusables, React Native core layout, safe-area): the FE-31 C-8 mobile half reads this literal by AST.
// It has no layout, style or text of its own. It resolves refs (content, contract paths, derived names), `{text, vars}` templates (a 0 is "0",
// never dropped) and action data (the screen's callbacks). An unmapped component, icon, content key or action throws: the screen's ErrorBoundary
// reports it; nothing is skipped silently. React keys come from the tree's `key` props, never from an array index.
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowRight, Ban, Check, Lock, MapPin, RefreshCw, Search, User } from 'lucide-react-native';
import { Alert, AlertDescription } from '@/vendor/rnr/components/ui/alert';
import { Button } from '@/vendor/rnr/components/ui/button';
import { Icon } from '@/vendor/rnr/components/ui/icon';
import { Input } from '@/vendor/rnr/components/ui/input';
import { Text } from '@/vendor/rnr/components/ui/text';

export const COMPONENTS = { SafeAreaView, ScrollView, View, Text, Input, Button, Alert, AlertDescription, Icon, ActivityIndicator };
/** The closed icon table (plan v3 §2.2). */
export const ICONS = { Search, MapPin, AlertTriangle, RefreshCw, Lock, Ban, User, Check, ArrowRight };

type Json = Record<string, unknown>;
export type SurfaceActions = {
  change_input: (text: string) => void;
  set_input: (value: string) => void;
  retry: () => void;
  select: (parcelId: string) => void;
  push: (route: string) => void;
  open_account: () => void;
};
export type SurfaceTree = { component: string; props: Json; children: unknown[] };
type Ctx = { content: Record<string, string>; data: { contract: Json; derived: Json }; actions: SurfaceActions };

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
  if (keys.length === 1 && keys[0] === 'contract') return walk(ctx.data.contract, String(v.contract).split('.'));
  if (keys.length === 1 && keys[0] === 'derived') return walk(ctx.data.derived, String(v.derived).split('.'));
  if (keys.every((k) => k === 'text' || k === 'vars') && 'text' in v && 'vars' in v && isObj(v.vars)) {
    const vars = v.vars;
    return String(resolveValue(v.text, ctx)).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(resolveValue(vars[name], ctx) ?? '') : m));
  }
  return v;
}

const action = (a: Json, ctx: Ctx): ((arg?: unknown) => void) => {
  const name = a.action as keyof SurfaceActions;
  if (!(name in ctx.actions)) throw new Error(`SurfaceRenderer: unknown action "${String(a.action)}"`);
  switch (name) {
    case 'change_input':
      return (text) => ctx.actions.change_input(String(text));
    case 'set_input':
      return () => ctx.actions.set_input(String(resolveValue(a.value, ctx)));
    case 'select':
      return () => ctx.actions.select(String(resolveValue(a.parcelId, ctx)));
    case 'push':
      return () => ctx.actions.push(String(a.route));
    default:
      return () => ctx.actions[name as 'retry' | 'open_account']();
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
export function SurfaceRenderer({ tree, content, data, actions }: { tree: SurfaceTree; content: Record<string, string>; data: Ctx['data']; actions: SurfaceActions }) {
  return renderNode(tree, { content, data, actions });
}
