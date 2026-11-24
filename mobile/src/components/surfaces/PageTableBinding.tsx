// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2 (the page structure is DATA rows of the page table, drawn by
//            shared section-kind builders; derivation, geometry, input state and fetch stay code; style class tables stay typed per platform),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18 (every text a content key), FE-31.
//
// PAGE.TABLE (task-390, Increment 1·B) · the phone rows-to-props-tree builder. Pure and import-free (read by relative path by the root tests, as
// parcelSearchCore.ts is): `pageProps(screen, flags, values, styles)` turns the rows of one screen of scripts/surfaces/_schema/static-page.json
// (`screens`, copied to the generated slice by scripts/surfaces/emit-mobile-surfaces.mjs) into the props tree the UNCHANGED SurfaceRenderer.tsx draws.
//   flags   the situation's positive flags by name (the binding's closed list); a section or part with a `when` shows only when its flag is true;
//           a `when` naming a flag the binding did not supply throws (fail closed, never a blank page);
//   values  the values the rows name: `answers` (choices list), `selected`, `route` (a button target; null disables it), `navigate` (the redirect);
//   styles  the typed per-platform class table of the calling binding (never in the rows).
// The tree shape is the one SemiQuestionBinding drew before the table (same keys, same order of props), so its goldens are unchanged.
type Ref = { content: string } | { contract: string } | { derived: string };
type Template = { text: Ref; vars: Record<string, Ref> };
export type PageNode = { component: string; props: Record<string, unknown>; children: PageChild[] };
type PageChild = PageNode | Ref | Template;

type Gate = { when?: string; platforms?: ReadonlyArray<'web' | 'mobile'> };
type BarPart = { role: 'back'; icon: string; content: string; action: string };
type ButtonRow = { variant: 'default' | 'outline'; label: string; content: string; action: string; idle?: string; target?: string; busy?: string };
type NoticePart = ({ role: 'text'; content: string; vars?: Record<string, string> } | ({ role: 'button'; id: string } & Omit<ButtonRow, 'idle' | 'target' | 'busy'>)) & { when?: string };
export type PageSection = Gate & (
  | { kind: 'bar'; id: string; parts: BarPart[] }
  | { kind: 'status'; id: string; content: string }
  | { kind: 'text'; id: string; role: 'header'; content: string }
  | { kind: 'notice'; id: string; tone: 'error' | 'neutral'; icon: string; parts: NoticePart[] }
  | { kind: 'choices'; id: string; list: string; select: string; content: string; action: string; arg: string }
  | ({ kind: 'button'; id: string } & ButtonRow)
);
export type PageScreen = { prefix: string; contract: string; binding: string; platforms?: ReadonlyArray<'web' | 'mobile'>; sections: PageSection[] };
export type PageValues = Record<string, string | readonly string[] | null>;
export type PageStyles = {
  screen: string; scroll: string; column: string; bottomPadding: number; maxWidth: number;
  bar: string; back: string; backIconSize: number; iconColor: string;
  status: string; heading: string;
  notice: Record<'error' | 'neutral', { box: string; icon: string; text: string }>;
  card: { idle: string; checked: string; row: string; dotIdle: string; dotChecked: string; text: string };
  button: Record<'default' | 'outline', { className: string; busyClassName: string; text: string }>;
};

const node = (component: string, props: Record<string, unknown>, children: PageChild[] = []): PageNode => ({ component, props, children });
const content = (key: string): Ref => ({ content: key });

/** The whole tree of one render. */
export function pageProps(screen: PageScreen, flags: Readonly<Record<string, boolean>>, values: PageValues, styles: PageStyles): PageNode {
  if (screen.platforms !== undefined && !screen.platforms.includes('mobile')) throw new Error('page table: the screen is not drawn on mobile');
  const on = (name: string | undefined): boolean => {
    if (name === undefined) return true;
    if (!Object.hasOwn(flags, name)) throw new Error(`page table: the flag ${name} is not supplied`);
    return flags[name] === true;
  };
  const drawn = (g: Gate): boolean => (g.platforms === undefined || g.platforms.includes('mobile')) && on(g.when);
  // A name no value supplies throws by name (like a flag); a supplied null is the legal "disabled" state.
  const val = (name: string): PageValues[string] => {
    if (!Object.hasOwn(values, name)) throw new Error(`page table: the value ${name} is not supplied`);
    return values[name] as PageValues[string];
  };
  const str = (name: string): string | null => {
    const v = val(name);
    return typeof v === 'string' ? v : null;
  };
  const testID = (id: string): string => `${screen.prefix}-${id}`;

  const button = (id: string, b: ButtonRow): PageNode => {
    const st = styles.button[b.variant];
    const base = { key: id, testID: testID(id), variant: b.variant };
    if (b.target === undefined) {
      return node('Button', { ...base, className: st.className, accessibilityRole: 'button', accessibilityLabel: content(b.label), onPress: { action: b.action } },
        [node('Text', { key: `${id}-text`, className: st.text }, [content(b.content)])]);
    }
    const target = str(b.target);
    const busy = b.busy !== undefined && on(b.busy);
    return node('Button', {
      ...base,
      className: busy ? st.busyClassName : st.className,
      disabled: target === null,
      accessibilityRole: 'button',
      accessibilityState: busy ? { disabled: target === null, busy: true } : { disabled: target === null },
      accessibilityLabel: content(b.label),
      onPress: target === null ? null : { action: b.action, [b.target]: target },
    }, [node('Text', { key: `${id}-text`, className: st.text }, [content(target === null ? (b.idle ?? b.content) : b.content)])]);
  };

  const section = (s: PageSection): PageNode[] => {
    switch (s.kind) {
      case 'bar':
        return [node('View', { key: s.id, className: styles.bar }, s.parts.map((p) => node('Button', {
          key: p.role, testID: testID(p.role), variant: 'ghost', size: 'icon', className: styles.back, accessibilityRole: 'button',
          accessibilityLabel: content(p.content), onPress: { action: p.action },
        }, [node('Icon', { key: `${p.role}-icon`, icon: p.icon, size: styles.backIconSize, color: styles.iconColor })])))];
      case 'status':
        return [node('Text', { key: `${s.id}-text`, testID: testID(s.id), className: styles.status, role: 'status' }, [content(s.content)])];
      case 'text':
        return [node('Text', { key: s.id, testID: testID(s.id), className: styles.heading, role: s.role }, [content(s.content)])];
      case 'notice': {
        const t = styles.notice[s.tone];
        return [node('Alert', { key: s.id, testID: testID(s.id), icon: s.icon, iconClassName: t.icon, className: t.box }, s.parts.filter((p) => on(p.when)).map((p): PageNode => {
          if (p.role === 'button') return button(p.id, p);
          const child: PageChild = p.vars === undefined ? content(p.content)
            : { text: content(p.content), vars: Object.fromEntries(Object.entries(p.vars).map(([k, path]) => [k, { contract: `${screen.contract}.${path}` }])) };
          return node('AlertDescription', { key: `${s.id}-text`, className: t.text }, [child]);
        }))];
      }
      case 'choices': {
        const list = val(s.list);
        if (!Array.isArray(list)) throw new Error(`page table: the list ${s.list} is not supplied`);
        const selected = str(s.select);
        return (list as readonly string[]).map((a, i) => {
          const checked = a === selected;
          return node('Button', {
            key: `${s.id}-${a}`,
            testID: testID(`${s.id}-${a}`),
            variant: 'outline',
            className: checked ? styles.card.checked : styles.card.idle,
            role: 'radio',
            accessibilityState: { checked },
            accessibilityLabel: content(`${s.content}.${a}`),
            onPress: { action: s.action, [s.arg]: { derived: `${s.id}.${i}` } },
          }, [node('View', { key: 'card-row', className: styles.card.row }, [
            node('View', { key: 'card-dot', className: checked ? styles.card.dotChecked : styles.card.dotIdle }),
            node('Text', { key: 'card-title', className: styles.card.text }, [content(`${s.content}.${a}`)]),
          ])]);
        });
      }
      case 'button':
        return [button(s.id, s)];
    }
  };

  const shown = screen.sections.filter(drawn);
  const navigate = typeof values.navigate === 'string' ? values.navigate : null;
  return node('SafeAreaView', { className: styles.screen, edges: { top: 'additive' }, testID: testID('screen'), ...(navigate !== null && navigate !== '' ? { navigate } : {}) }, [
    ...shown.filter((s) => s.kind === 'bar').flatMap(section),
    node('ScrollView', {
      key: 'scroll',
      className: styles.scroll,
      contentContainerStyle: { paddingBottom: styles.bottomPadding, alignItems: 'center' },
      keyboardShouldPersistTaps: 'handled',
    }, [node('View', { key: 'column', testID: testID('column'), className: styles.column, style: { maxWidth: styles.maxWidth } },
      shown.filter((s) => s.kind !== 'bar').flatMap(section))]),
  ]);
}
