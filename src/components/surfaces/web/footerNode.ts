// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one binding per archetype per platform; refs only; one tree, a render per
//            binding), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18 (every string from content), FE-34 (closed roles; nothing
//            skipped silently).
//
// MF-91 (SRCH.FOOTER, task-332; operator, verbatim, 2026-11-19: "1. once  -approved" (MORNING-DECISIONS.md:1061) and "this is a shared component"
// (MORNING-DECISIONS.md:1066)) · THE one web footer. The tree builder moved here from StaticBinding.tsx (footerNode, MF-46 stage C) and is used by the
// three web users: the static pages (StaticBinding), the web search page (SearchBinding) and the web report page (ReportPage, plain tags: it renders
// without a Mantine provider). A footer is a section of parts in render order; the tree carries refs only ({content: key}); each binding renders the
// tree with its own mapped parts. This module imports no binding (the report page imports it, and the static binding imports the report page).
//   roles: link (consecutive links form one Group), legal, line, copyright. A link has an href (a same-origin path, checked by the caller's table).
//   An unknown role, a link with no href, a part with no content key or a layout with no class for a role throws a named error; nothing is skipped.
export type FooterRef = { content: string };
export type FooterNode = { component: string; props: Record<string, unknown>; children: Array<FooterNode | FooterRef> };
export type FooterPart = { role: string; content?: string; href?: string; pending?: boolean };
export type FooterSection = { id: string; parts: FooterPart[] };
/** The class strings of one user's layout table. */
export type FooterLayout = Record<'footer' | 'links' | 'link' | 'line' | 'legal' | 'copyright', string>;

/** The four strings every web user shows besides the legal sentence and the report's own lines (one wording, every content file). */
export const FOOTER_TEXT_KEYS = ['footer.terms', 'footer.privacy', 'footer.help', 'footer.copyright'] as const;
export type FooterText = Record<(typeof FOOTER_TEXT_KEYS)[number], string>;

/** The footer strings out of a content file; a missing or non-string key throws (FE-18: no fallback text is typed in code). */
export function pickFooterText(content: Record<string, string>): FooterText {
  const out: Record<string, string> = {};
  for (const k of FOOTER_TEXT_KEYS) {
    const v: unknown = Object.hasOwn(content, k) ? content[k] : undefined;
    if (typeof v !== 'string' || v === '') throw new Error(`footer text: missing key "${k}"`);
    out[k] = v;
  }
  return out as FooterText;
}

const fail = (why: string): never => { throw new Error(`footerNode: ${why}`); };
const node = (component: string, props: Record<string, unknown>, children: FooterNode['children'] = []): FooterNode => ({ component, props, children });

/** The footer node of one section. `prefix` names the test ids: `<prefix>-footer`, `-link-<href>`, `-legal`, `-line`, `-copyright` (the links group has none, as before). */
export const footerNode = (s: FooterSection, L: FooterLayout, prefix: string): FooterNode => {
  const cls = (role: keyof FooterLayout): string => {
    const c = Object.hasOwn(L, role) ? L[role] : undefined;
    return typeof c === 'string' ? c : fail(`the layout has no class for "${role}"`);
  };
  const key = (p: FooterPart): string => (typeof p.content === 'string' && p.content !== '' ? p.content : fail(`a ${p.role} part needs a content key`));
  const kids: FooterNode[] = [];
  let links: FooterNode | null = null;
  const seen: Record<string, number> = {};
  s.parts.forEach((p) => {
    const n = seen[p.role] ?? 0;
    seen[p.role] = n + 1;
    if (p.role === 'link') {
      if (typeof p.href !== 'string' || p.href === '') fail('a link needs an href');
      if (links === null) { links = node('Group', { key: `${s.id}-links`, className: cls('links') }); kids.push(links); }
      links.children.push(node('Button', { key: `${s.id}-${n}`, testID: `${prefix}-link-${p.href}`, href: p.href, size: 'lg', variant: 'subtle', color: 'gray', className: cls('link') }, [{ content: key(p) }]));
      return;
    }
    links = null;
    if (p.role !== 'legal' && p.role !== 'line' && p.role !== 'copyright') return fail(`unknown role "${p.role}"`);
    kids.push(node('Text', {
      key: `${s.id}-${p.role}-${n}`, testID: `${prefix}-${p.role}`, className: cls(p.role),
      ...(p.pending === true ? { pending: true } : {}),
    }, [{ content: key(p) }]));
  });
  return node('Stack', { key: s.id, testID: `${prefix}-footer`, component: 'footer', className: cls('footer') }, kids);
};
