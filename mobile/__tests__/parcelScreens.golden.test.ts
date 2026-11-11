/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 and its dated note 2026-11-10 (one props golden per state per target;
//            refs only; contract paths; component names in bindings.json mapping), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31, FE-32, docs/specs/00-architecture/117_maxbld_brand.md §6.1 and its dated note 2026-11-10, Spec 117 §3.5 (44 px).
//
// MF-35 · the mobile golden test of mobile_parcel_search (plan v3 §7, §9). The committed goldens (src/tests/fixtures/surfaces/mobile_parcel_search,
// copied by scripts/surfaces/emit-mobile-surfaces.mjs into __tests__/fixtures/surfaces) must equal searchProps(situation) exactly; every situation
// is used by a golden or a named case; every content key is used by a committed golden (SV-SBIND counts only goldens, CR3-2); derived names are the
// declared closed list; and the layout rules hold on every tree: Text carries size, weight and colour; Button and Input carry min-h-[44px] and no
// other min-h-; each dark: token of a vendored variant in use has a twin with the same chain (P35-D2 a); a checked card has border-primary twins;
// SELECT is disabled with nothing checked; every component is in mapping.mobile.SEARCH; every child node carries a key (RG-15).
import fs from 'node:fs';
import path from 'node:path';
import { DERIVED_NAMES, SEARCH_SLICE, searchProps, type PropsNode } from '@/components/surfaces/SearchBinding';
import { SEARCH_CANDIDATE_LIMIT, SEARCH_DEBOUNCE_MS, SEARCH_MIN_QUERY_LEN } from '@/constants/parcelSearch';
import type { SearchSituation } from '@/lib/parcelSearchMatch';

type Json = Record<string, unknown>;
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const situations = rj(path.join(__dirname, 'fixtures/parcelSearch.situations.json')) as Record<string, SearchSituation>;
const goldens = (rj(path.join(__dirname, 'fixtures/surfaces/mobile_parcel_search.goldens.json')).goldens ?? {}) as Record<string, Json>;
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: { SEARCH: string[] } }; touch_targets: { mobile: Record<string, string[]> } };

/** The named cases (plan v3 §7): situations that are not committed goldens but are asserted below. */
export const NAMED_CASES = [
  'rate_limited_zero', 'fetching_with_candidates', 'none_checked', 'prompt_type_more', 'blank_idle', 'outside_toronto', 'typing_ahead',
  'navigating_intersection', 'navigating_multi_parcel', 'navigating_unlinked',
];

// ---- tree helpers ------------------------------------------------------------------------------------------------------------------------------
const isNode = (v: unknown): v is PropsNode => typeof v === 'object' && v !== null && 'component' in v;
const nodes = (t: PropsNode): PropsNode[] => [t, ...t.children.filter(isNode).flatMap(nodes)];
const refs = (v: unknown, kind: string): string[] => {
  if (Array.isArray(v)) return v.flatMap((x) => refs(x, kind));
  if (typeof v !== 'object' || v === null) return [];
  const o = v as Json;
  if (Object.keys(o).length === 1 && kind in o) return [String(o[kind])];
  return Object.values(o).flatMap((x) => refs(x, kind));
};
const byTestID = (t: PropsNode, id: string): PropsNode | undefined => nodes(t).find((n) => n.props.testID === id);
const tokens = (n: PropsNode): string[] => String(n.props.className ?? '').split(/\s+/).filter(Boolean);

/** Every problem of the layout rules on one tree (each rule's planted case is below). */
export function layoutProblems(t: PropsNode, darkChains: { outline: string[]; input: string[] }): string[] {
  const out: string[] = [];
  const allowed = bindings.mapping.mobile.SEARCH;
  const touch = bindings.touch_targets.mobile;
  const walk = (n: PropsNode, parent: PropsNode | null): void => {
    const at = String(n.props.key ?? n.props.testID ?? n.component);
    if (!allowed.includes(n.component)) out.push(`${at}: ${n.component} is not in mapping.mobile.SEARCH`);
    if (parent && n.props.key === undefined) out.push(`${at}: a child node without a key`);
    const tk = tokens(n);
    if (n.component === 'Text') {
      if (!tk.some((x) => /^text-(xs|sm|base|lg|xl|2xl|\[\d+px\])$/.test(x))) out.push(`${at}: Text without a size`);
      if (!tk.some((x) => /^font-(normal|medium|semibold|bold)$/.test(x))) out.push(`${at}: Text without a weight`);
      if (!tk.some((x) => /^text-(zinc-\d+|red-\d+|\[#[0-9a-f]{6}\])$/.test(x))) out.push(`${at}: Text without a colour`);
    }
    if (touch[n.component]) {
      const mins = tk.filter((x) => /(^|:)min-h-/.test(x));
      if (!touch[n.component].some((x) => tk.includes(x)) || mins.length !== 1) out.push(`${at}: ${n.component} min-h tokens ${JSON.stringify(mins)} (need exactly min-h-[44px])`);
    }
    const chains = n.component === 'Input' ? darkChains.input : n.component === 'Button' && n.props.variant === 'outline' ? darkChains.outline : [];
    for (const c of chains) if (!tk.some((x) => x.startsWith(c))) out.push(`${at}: no ${c} twin`);
    if (n.props.role === 'radio' && (n.props.accessibilityState as Json | undefined)?.checked === true && !(tk.includes('border-primary') && tk.includes('dark:border-primary'))) out.push(`${at}: a checked card without border-primary dark:border-primary`);
    for (const c of n.children) if (isNode(c)) walk(c, n);
  };
  walk(t, null);
  const cards = nodes(t).filter((n) => n.props.role === 'radio');
  const select = byTestID(t, 'parcel-search-select');
  if (select && !cards.some((c) => (c.props.accessibilityState as Json).checked === true) && (select.props.disabled !== true || select.props.onPress !== null)) out.push('SELECT is enabled with nothing checked');
  for (const name of refs(t, 'derived')) if (!DERIVED_NAMES.some((re) => re.test(name))) out.push(`derived name ${name} is not declared`);
  return out;
}

/** The dark: chains of the vendored variants in use (Button outline, the Input base), read from the vendored files: the twins the layout owes. */
export function vendorDarkChains(): { outline: string[]; input: string[] } {
  const ui = path.join(MOBILE, 'src/vendor/rnr/components/ui');
  const chain = (s: string): string[] => [...new Set((s.match(/(?<![\w-])dark:[\w:-]*?(?:bg|border|text)-/g) ?? []).map((x) => x))];
  const button = fs.readFileSync(path.join(ui, 'button.tsx'), 'utf8');
  const outline = /outline: cn\(\s*'([^']*)'/.exec(button)?.[1] ?? '';
  const input = fs.readFileSync(path.join(ui, 'input.tsx'), 'utf8');
  const base = /'(dark:bg-input[^']*)'/.exec(input)?.[1] ?? '';
  return { outline: chain(outline), input: chain(base) };
}

describe('mobile_parcel_search goldens (FE-31; plan v3 §7)', () => {
  const names = Object.keys(goldens);
  it('10 committed goldens, one per declared state, each naming a situation; searchProps(situation) equals the golden props exactly', () => {
    expect(names.sort()).toEqual(['ambiguous', 'empty', 'error', 'loading', 'miss', 'rate_limited', 'redirect', 'schema_drift', 'static', 'unauthorized']);
    for (const n of names) {
      const g = goldens[n] as { situation: string; props: PropsNode; target: string; surface: string };
      expect([n, g.surface, g.target, g.situation in situations]).toEqual([n, 'mobile_parcel_search', 'mobile', true]);
      expect(searchProps(situations[g.situation] as SearchSituation)).toStrictEqual(g.props);
    }
  });
  it('every situation is used by a golden or a named case, and every named case is a situation (both directions)', () => {
    const used = new Set([...Object.values(goldens).map((g) => g.situation as string), ...NAMED_CASES]);
    expect(Object.keys(situations).filter((k) => k !== '$comment' && !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in situations))).toEqual([]);
  });
  it('OUTPUT fold LOW: every declared derived name is used by some golden or named case (no dead name)', () => {
    const used = [...names.map((n) => goldens[n]!.situation as string), ...NAMED_CASES].flatMap((k) => refs(searchProps(situations[k] as SearchSituation), 'derived'));
    expect(DERIVED_NAMES.filter((re) => !used.some((u) => re.test(u))).map(String)).toEqual([]);
  });
  it('every content key is used by a committed golden, and every content ref names a key (CR3-2)', () => {
    const used = new Set(Object.values(goldens).flatMap((g) => refs(g.props, 'content')));
    expect(Object.keys(SEARCH_SLICE.content).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in SEARCH_SLICE.content))).toEqual([]);
  });
  it('the layout rules hold on every golden and every named case', () => {
    const chains = vendorDarkChains();
    expect(chains).toEqual({ outline: ['dark:bg-', 'dark:border-', 'dark:active:bg-'], input: ['dark:bg-'] });
    for (const k of [...names.map((n) => goldens[n]!.situation as string), ...NAMED_CASES]) expect([k, layoutProblems(searchProps(situations[k] as SearchSituation), chains)]).toEqual([k, []]);
  });
  it('RED (planted): a missing dark twin, a sub-44 chip, a checked card without border-primary, SELECT enabled with nothing checked, an undeclared derived name, a Card, a keyless child', () => {
    const chains = vendorDarkChains();
    const t = searchProps(situations.ambiguous as SearchSituation);
    const col = (t.children[0] as PropsNode).children[0] as PropsNode;
    const card = col.children.find((c) => isNode(c) && c.props.role === 'radio' && (c.props.accessibilityState as Json).checked) as PropsNode;
    card.props.className = String(card.props.className).replace('dark:border-primary', '').replace('dark:active:bg-[#27272a]', '');
    const other = col.children.find((c) => isNode(c) && c.props.role === 'radio' && !(c.props.accessibilityState as Json).checked) as PropsNode;
    other.props.className = String(other.props.className).replace('min-h-[44px]', 'min-h-[44px] sm:min-h-8');
    col.children.push({ component: 'Card', props: {}, children: [{ derived: 'other' }] });
    const p = layoutProblems(t, chains);
    expect(p).toEqual(expect.arrayContaining([
      '100102: no dark:active:bg- twin',
      '100102: a checked card without border-primary dark:border-primary',
      '100100: Button min-h tokens ["min-h-[44px]","sm:min-h-8"] (need exactly min-h-[44px])',
      'Card: Card is not in mapping.mobile.SEARCH',
      'Card: a child node without a key',
      'derived name other is not declared',
    ]));
    const none = searchProps(situations.none_checked as SearchSituation);
    const sel = byTestID(none, 'parcel-search-select') as PropsNode;
    sel.props.disabled = false;
    expect(layoutProblems(none, chains)).toEqual(['SELECT is enabled with nothing checked']);
  });
});

describe('named cases (plan v3 §7; must-survive rows 7-17)', () => {
  const at = (k: string): PropsNode => searchProps(situations[k] as SearchSituation);
  const ids = (t: PropsNode): string[] => nodes(t).map((n) => n.props.testID).filter((x): x is string => typeof x === 'string');
  it('RateLimitError(0) renders BOTH the 429 notice ("0s") and the error block with Retry (MF35-DF1, pinned, not fixed)', () => {
    const t = at('rate_limited_zero');
    expect(ids(t)).toEqual(expect.arrayContaining(['parcel-search-ratelimit', 'parcel-search-error', 'parcel-search-retry']));
    expect(refs(t, 'contract')).toContain('contract_parcels_lookup.errors.429.retryAfterSeconds');
  });
  it('the spinner shows over still-listed candidates; the block order is notices, list, refine, miss, prompt', () => {
    const t = at('fetching_with_candidates');
    expect(ids(t)).toEqual(expect.arrayContaining(['parcel-search-spinner', 'parcel-candidate-100100']));
    const order = ids(at('rate_limited_zero')).filter((x) => /ratelimit|error|retry|candidate|refine|empty|prompt/.test(x));
    expect(order).toEqual(['parcel-search-ratelimit', 'parcel-search-error', 'parcel-search-retry']);
  });
  it('the prompt shows for a short query and not for an idle 3+ query; outside Toronto shows no spinner and no prompt', () => {
    expect(ids(at('prompt_type_more'))).toContain('parcel-search-prompt');
    expect(ids(at('blank_idle')).filter((x) => /prompt|empty|refine|error|ratelimit|entitlement|outside|candidate/.test(x))).toEqual([]);
    expect(ids(at('outside_toronto')).filter((x) => /prompt|spinner/.test(x))).toEqual([]);
    expect(ids(at('outside_toronto'))).toContain('parcel-search-outside-toronto');
  });
  it('no recent searches: no chip row; three: three chips with the legacy testIDs and labels', () => {
    expect(nodes(at('blank_idle')).some((n) => n.props.key === 'chips')).toBe(false);
    expect(ids(at('static')).filter((x) => x.startsWith('parcel-search-suggestion-'))).toEqual(['parcel-search-suggestion-Queen & Spadina', 'parcel-search-suggestion-26 Hurlingham Cres', 'parcel-search-suggestion-Bathurst St']);
  });
  it('the field shows the raw input at once while everything else reads the debounced query (row 22)', () => {
    const input = byTestID(at('typing_ahead'), 'parcel-search-input') as PropsNode;
    expect(input.props.value).toEqual({ derived: 'input' });
  });
  it('the map kinds and unique carry their route as navigate and render no address list (row 28)', () => {
    for (const k of ['navigating_intersection', 'navigating_multi_parcel', 'navigating_unlinked', 'redirect']) {
      const t = at(k);
      expect([k, t.props.navigate]).toEqual([k, (situations[k] as SearchSituation).route]);
      expect(nodes(t).some((n) => n.props.role === 'radio')).toBe(false);
    }
  });
  it('a candidate tap selects (no route); SELECT pushes the selected lot by the legacy route string', () => {
    const t = at('ambiguous');
    expect((byTestID(t, 'parcel-candidate-100100') as PropsNode).props.onPress).toEqual({ action: 'select', parcelId: { contract: 'contract_parcels_lookup.candidates.0.parcelId' } });
    expect((byTestID(t, 'parcel-search-select') as PropsNode).props.onPress).toEqual({ action: 'push', route: '/(app)/parcel-tool/100102' });
    expect(nodes(t).filter((n) => n.props.role === 'radio')).toHaveLength(SEARCH_CANDIDATE_LIMIT);
    expect(ids(t)).toContain('parcel-search-refine');
  });
});

describe('one home for the config values (row 24, RG-14)', () => {
  it('OUTPUT fold LOW: the binding re-exports the debounce and the minimum length from the slice (the descriptor is their one home)', () => {
    const src = fs.readFileSync(path.join(MOBILE, 'src/components/surfaces/SearchBinding.tsx'), 'utf8');
    expect(/export const SEARCH_DEBOUNCE_MS = SEARCH_SLICE\.config\.debounce_ms/.test(src)).toBe(true);
    expect(/export const SEARCH_MIN_QUERY_LEN = SEARCH_SLICE\.config\.min_query_len/.test(src)).toBe(true);
  });
  it('the slice config equals the constants, and the content strings that state them carry the same numbers', () => {
    expect(SEARCH_SLICE.config).toEqual({ debounce_ms: SEARCH_DEBOUNCE_MS, min_query_len: SEARCH_MIN_QUERY_LEN });
    expect(SEARCH_SLICE.content['search.prompt']).toContain(`at least ${SEARCH_MIN_QUERY_LEN} characters`);
    expect(SEARCH_SLICE.content['search.input.hint']).toContain(`at least ${SEARCH_MIN_QUERY_LEN} characters`);
    expect(SEARCH_SLICE.content['list.refine']).toContain(`More than ${SEARCH_CANDIDATE_LIMIT} lots`);
  });
});

describe('shape lock (rows 19-20; RG-11, RG-17)', () => {
  const files = ['app/(app)/parcel-tool/index.tsx', 'src/components/surfaces/SearchBinding.tsx', 'src/components/surfaces/SurfaceRenderer.tsx'];
  it('the screen and the binding modules hold no analytics or logging call and no lead-gen import', () => {
    for (const f of files) {
      const t = fs.readFileSync(path.join(MOBILE, f), 'utf8');
      expect([f, /\btrack\(|console\./.test(t), /useFilterStore|@\/lib\/onboarding|useLeadFeed|useFlightBoard/.test(t)]).toEqual([f, false, false]);
    }
  });
  it('the screen imports only react, expo-router, the binding modules, @/lib, @/hooks and @/store', () => {
    const t = fs.readFileSync(path.join(MOBILE, files[0]!), 'utf8');
    const specs = [...t.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    expect(specs.filter((s) => !/^(react|expo-router|@\/components\/surfaces\/(SurfaceRenderer|SearchBinding)|@\/lib\/|@\/hooks\/|@\/store\/)/.test(s))).toEqual([]);
  });
});

// MF-58 · the legal line (operator ruling 2026-11-10, report panel item 16 "yes critical - we should also have a legal not on the landing and
// search page"; wording ruling 2026-11-10 item 5 "all three accepted": "Search: under the address input, before results. Never only in a modal
// or collapsible. Lawyer check before launch." (the lawyer check is owed before launch, recorded on the queue row; it does not block the build)).
// Dated 2026-11-11 (MF-62 follow-up; operator D-1 a, verbatim "3 y", on the Landing v9 R2 short disclaimer, verbatim "2. add not legal advice as
// well"): the short line supersedes wording ruling 2026-11-10 item 5 here and on the report page; the lawyer check (MF-72) now covers the short line.
const LEGAL_TEXT = 'This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City.';

describe('MF-58 the legal line on the search page (ruling 2026-11-10 items 16 and 5)', () => {
  const column = (t: PropsNode): PropsNode => (t.children[0] as PropsNode).children[0] as PropsNode;
  const keys = (t: PropsNode): unknown[] => column(t).children.map((c) => (isNode(c) ? c.props.key : null));
  it('the content key search.legal holds the ruled text verbatim', () => {
    expect(SEARCH_SLICE.content['search.legal']).toBe(LEGAL_TEXT);
  });
  it('in every golden and every named case the line is the column child right after the address input, before any result block', () => {
    for (const k of [...Object.values(goldens).map((g) => g.situation as string), ...NAMED_CASES]) {
      const t = searchProps(situations[k] as SearchSituation);
      const ks = keys(t);
      expect([k, ks[ks.indexOf('pill') + 1]]).toEqual([k, 'legal']);
      const legal = column(t).children.find((c) => isNode(c) && c.props.key === 'legal') as PropsNode;
      expect([k, legal.component, legal.props.testID, legal.children]).toEqual([k, 'Text', 'parcel-search-legal', [{ content: 'search.legal' }]]);
    }
  });
});

// MF-62 follow-up · the search placeholder (operator 2026-11-11, small pages v7.1 item 9, verbatim: "inside the search box - should be enter lot
// address"; and 14:54 "app search placeholder is lot address?"). Supersedes "Search Toronto address..." (ruling 2026-11-09 item 1). Content only:
// the MF-35 search binding reads the key; the generated slice carries it.
describe('the search placeholder (small pages v7.1 item 9)', () => {
  it('the content key search.input.placeholder holds the ruled text verbatim', () => {
    expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter lot address');
  });
});
