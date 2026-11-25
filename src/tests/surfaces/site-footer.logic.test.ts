// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one binding per archetype per platform; refs only; one tree, a render per binding),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18 (every string from content), FE-07 (parity), FE-34 (closed roles; nothing skipped silently).
//
// MF-91 (SRCH.FOOTER, task-332; operator, verbatim, 2026-11-19: "1. once  -approved" (MORNING-DECISIONS.md:1061) and "this is a shared component"
// (MORNING-DECISIONS.md:1066)) · the ONE shared web footer. Cases:
//   T1 the tree builder is defined once (src/components/surfaces/web/footerNode.ts) and imported by the three bindings; the module imports no binding;
//   T2 every web search tree ends with the footer node: legal, Terms /terms, Privacy /privacy, Help /help, copyright, in the v8 order (search.txt:323);
//   T3 search.legal is in the web tree once (in the footer) and once in every committed mobile golden (A.10), which has no footer;
//   T4 the static pages' footer subtree keeps its shape (the extraction moves nothing);
//   T5 the four footer strings of the F01 content file equal the static pages' and the login page's wording;
//   RED planted defects: an unknown role, a link with no href, a layout with no class, a missing footer text key each throw a named error.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FOOTER_TEXT_KEYS, footerNode, pickFooterText, type FooterLayout, type FooterNode } from '../../components/surfaces/web/footerNode';
import { searchWebTree, WEB_SEARCH_LAYOUT, type WebSituation } from '../../components/surfaces/web/SearchBinding';
import { staticWebTree, WEB_STATIC_LAYOUT } from '../../components/surfaces/web/StaticBinding';
import { STATIC_CONTENT, staticPage } from '../../lib/surfaces/maxbld-static';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SEARCH_DIR = 'src/tests/fixtures/surfaces/mobile_parcel_search';
const SITUATIONS: Record<string, WebSituation> = rj('mobile/__tests__/fixtures/parcelSearch.situations.json') as never;
const GOLDENS = fs.readdirSync(path.join(ROOT, SEARCH_DIR)).filter((f) => f.endsWith('.web.json')).sort();
const F01_CONTENT = rj('scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json');
const FOOTER_STRINGS = { 'footer.terms': 'Terms of Service', 'footer.privacy': 'Privacy Policy', 'footer.help': 'Help & Support', 'footer.copyright': '© MaxBLD' };

const nodesOf = (n: unknown): Json[] => (n !== null && typeof n === 'object' && 'component' in (n as Json)
  ? [n as Json, ...((n as Json).children as unknown[]).flatMap(nodesOf)] : []);
const countRef = (tree: unknown, key: string): number => (JSON.stringify(tree).match(new RegExp(`"content":"${key.replace('.', '\\.')}"`, 'g')) ?? []).length;
const walk = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));

describe('T1 one builder, three users', () => {
  const files = walk('src/components');
  it('footerNode is defined in one module only and no other file builds a footer element', () => {
    expect(files.filter((f) => /\b(const|function)\s+footerNode\b/.test(read(f)))).toEqual(['src/components/surfaces/web/footerNode.ts']);
    expect(files.filter((f) => /component:\s*'footer'/.test(read(f)))).toEqual(['src/components/surfaces/web/footerNode.ts']);
  });
  it('the static, search and report bindings import it', () => {
    for (const f of ['src/components/surfaces/web/StaticBinding.tsx', 'src/components/surfaces/web/SearchBinding.tsx', 'src/components/report/ReportPage.tsx']) {
      expect(read(f), f).toMatch(/from '(\.\/footerNode|@\/components\/surfaces\/web\/footerNode|\.\.\/surfaces\/web\/footerNode)'/);
    }
  });
  it('the module imports no binding (no cycle: the report page imports it, the static binding imports the report page)', () => {
    expect(read('src/components/surfaces/web/footerNode.ts')).not.toMatch(/from '[^']*(StaticBinding|SearchBinding|ReportPage|ReportView)'/);
  });
});

describe('T2 the web search tree ends with the footer node, five items in the v8 order', () => {
  it('eleven goldens: the last child of the screen is the footer', () => {
    // Dated 2026-11-25 (task-465 McFixV2.1; prior pin 11, title kept): + the typing state partial (golden suggest): 11 -> 12.
    expect(GOLDENS).toHaveLength(12); // SRCH.A6 (task-320; dated 2026-11-19): 10 -> 11, the state hit (golden reports_left)
    for (const f of GOLDENS) {
      const g = rj(`${SEARCH_DIR}/${f}`);
      const tree = searchWebTree(SITUATIONS[g.situation] as WebSituation) as unknown as Json;
      const footer = tree.children[tree.children.length - 1] as Json;
      expect([f, footer.component, footer.props.component, footer.props.testID, footer.props.className]).toEqual([f, 'Stack', 'footer', 'parcel-search-footer', WEB_SEARCH_LAYOUT.footer]);
      const kids = footer.children as Json[];
      expect(kids.map((k) => k.props.testID)).toEqual(['parcel-search-legal', undefined, 'parcel-search-copyright']);
      expect(kids[0]?.children).toEqual([{ content: 'search.legal' }]);
      const links = (kids[1] as Json).children as Json[];
      expect(links.map((l) => [l.props.testID, l.props.href, l.children])).toEqual([
        ['parcel-search-link-/terms', '/terms', [{ content: 'footer.terms' }]],
        ['parcel-search-link-/privacy', '/privacy', [{ content: 'footer.privacy' }]],
        ['parcel-search-link-/help', '/help', [{ content: 'footer.help' }]],
      ]);
      expect(kids[2]?.children).toEqual([{ content: 'footer.copyright' }]);
      expect(rj(`${SEARCH_DIR}/${f}`).props, f).toEqual(tree); // the committed golden is the regenerated tree
    }
  });
});

describe('T3 the legal sentence once on the web page, once on the mobile page', () => {
  it('web: search.legal appears once per tree, never in the column; mobile: once, under the input, no footer ref', () => {
    for (const f of GOLDENS) {
      const web = rj(`${SEARCH_DIR}/${f}`).props as Json;
      expect([f, countRef(web, 'search.legal')]).toEqual([f, 1]);
      const column = (web.children[0] as Json);
      expect(nodesOf(column).map((n) => n.props.testID)).not.toContain('parcel-search-legal');
      const m = rj(`${SEARCH_DIR}/${f.replace('.web.', '.mobile.')}`).props as Json;
      expect([f, countRef(m, 'search.legal')]).toEqual([f, 1]);
      expect(JSON.stringify(m)).not.toMatch(/"content":"footer\./);
      expect(nodesOf(m).map((n) => n.props.testID)).toContain('parcel-search-legal');
    }
  });
});

describe('T4 the static pages keep their footer shape', () => {
  it('every static page: Stack footer with one Group of three links, then the legal line, as before the extraction', () => {
    let seen = 0;
    for (const [id, state] of [['web_help', 'static'], ['web_terms', 'static'], ['web_privacy', 'static'], ['web_maxbld_error', 'error']] as const) {
      const tree = staticWebTree(staticPage(id, state).page) as unknown as Json;
      const footer = nodesOf(tree).find((n) => n.props.testID === 'static-footer') as Json;
      expect(footer.props, id).toEqual({ key: 'footer', testID: 'static-footer', component: 'footer', className: WEB_STATIC_LAYOUT.footer });
      const [group, legal, ...rest] = footer.children as Json[];
      expect(rest, id).toEqual([]);
      expect(group, id).toEqual({ component: 'Group', props: { key: 'footer-links', className: WEB_STATIC_LAYOUT.links }, children: [
        ['/terms', 'footer.terms', 0], ['/privacy', 'footer.privacy', 1], ['/help', 'footer.help', 2],
      ].map(([href, key, i]) => ({ component: 'Button', props: { key: `footer-${i}`, testID: `static-link-${href}`, href, size: 'lg', variant: 'subtle', color: 'gray', className: WEB_STATIC_LAYOUT.link }, children: [{ content: key }] })) });
      expect(legal, id).toEqual({ component: 'Text', props: { key: 'footer-legal-0', testID: 'static-legal', className: WEB_STATIC_LAYOUT.legal }, children: [{ content: 'footer.legal' }] });
      seen += 1;
    }
    expect(seen).toBeGreaterThanOrEqual(4);
  });
});

describe('T5 the content strings', () => {
  it('the F01 file carries the four footer keys with the wording of the login and static content files', () => {
    for (const [k, v] of Object.entries(FOOTER_STRINGS)) expect([k, F01_CONTENT[k]]).toEqual([k, v]);
    expect(rj('scripts/surfaces/platform_shared/F16/surfaces/web_login.content.json')['footer.copyright']).toBe(FOOTER_STRINGS['footer.copyright']);
    for (const id of Object.keys(STATIC_CONTENT)) for (const k of ['footer.terms', 'footer.privacy', 'footer.help'] as const) expect([id, k, STATIC_CONTENT[id]?.[k]]).toEqual([id, k, FOOTER_STRINGS[k]]);
    expect(pickFooterText(F01_CONTENT)).toEqual(FOOTER_STRINGS);
    expect([...FOOTER_TEXT_KEYS]).toEqual(Object.keys(FOOTER_STRINGS));
  });
});

describe('RED: planted defects are loud', () => {
  const L: FooterLayout = { footer: 'f', links: 'l', link: 'k', line: 'n', legal: 'g', copyright: 'c' };
  const sec = (parts: Json[]) => ({ id: 'footer', parts }) as never;
  it('an unknown role, a link with no href and a layout with no class each throw a named error', () => {
    expect(() => footerNode(sec([{ role: 'banner', content: 'x' }]), L, 'p')).toThrow('footerNode: unknown role "banner"');
    expect(() => footerNode(sec([{ role: 'link', content: 'x' }]), L, 'p')).toThrow('footerNode: a link needs an href');
    const { copyright: _gone, ...short } = L; // eslint-disable-line @typescript-eslint/no-unused-vars -- removed on purpose
    expect(() => footerNode(sec([{ role: 'copyright', content: 'x' }]), short as never, 'p')).toThrow('footerNode: the layout has no class for "copyright"');
  });
  it('a part with no content key throws; a footer text with a missing key throws, no fallback string', () => {
    expect(() => footerNode(sec([{ role: 'legal' }]), L, 'p')).toThrow('footerNode: a legal part needs a content key');
    const { ['footer.help']: _gone, ...rest } = F01_CONTENT; // eslint-disable-line @typescript-eslint/no-unused-vars -- removed on purpose
    expect(() => pickFooterText(rest as Record<string, string>)).toThrow('footer text: missing key "footer.help"');
  });
  it('control: a valid section builds one footer node with consecutive links in one group', () => {
    const n = footerNode(sec([{ role: 'line', content: 'a' }, { role: 'link', content: 'b', href: '/b' }, { role: 'link', content: 'c', href: '/c' }, { role: 'copyright', content: 'd' }]), L, 'p') as FooterNode;
    expect(n.children.map((c: FooterNode | { content: string }) => (c as FooterNode).props.testID)).toEqual(['p-line', undefined, 'p-copyright']);
  });
});
