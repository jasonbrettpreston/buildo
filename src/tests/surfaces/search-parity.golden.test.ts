// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-07 (P6 same everywhere; parity keyed by surface),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15, docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (Locks row)
//            and §11b.3 dated note 2026-11-11 (MF-44: the web target of mobile_parcel_search, parity with the mobile goldens).
//
// MF-44 · the search parity lock (operator "01-a 0-2 b as long as they are complaint"). For every declared state of mobile_parcel_search, the
// committed web golden and the committed mobile golden must carry: (1) the same set of binding refs (content keys, contract paths, derived names,
// template texts and vars); (2) the same action names; (3) the same blocks in the same order (the ordered testID list); (4) the same situation.
// The component names and classes differ by platform and are not compared. RED cases plant one change in one target. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src/tests/fixtures/surfaces/mobile_parcel_search');
const DESCRIPTOR = path.join(ROOT, 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const KINDS = ['content', 'contract', 'derived'];

/** Every binding ref under `v`, as a canonical string (a template's text and vars are refs too). */
export const refsOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(refsOf);
  if (v === null || typeof v !== 'object') return [];
  const o = v as Json;
  const keys = Object.keys(o);
  if (keys.length === 1 && KINDS.includes(keys[0] as string)) return [`${keys[0]}:${String(o[keys[0] as string])}`];
  return Object.values(o).flatMap(refsOf);
};
/** Every action name under `v`. */
export const actionsOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(actionsOf);
  if (v === null || typeof v !== 'object') return [];
  const o = v as Json;
  return [...(typeof o.action === 'string' ? [o.action] : []), ...Object.values(o).flatMap(actionsOf)];
};
/** The testIDs of a props tree in document order (the block order). */
export const testIdsOf = (n: Json): string[] => [
  ...(typeof n.props?.testID === 'string' ? [n.props.testID] : []),
  ...((n.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(testIdsOf),
];
const uniq = (xs: string[]): string[] => [...new Set(xs)].sort();

/** Every node of a props tree, in document order. */
const nodesOf = (n: Json): Json[] => [n, ...((n.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(nodesOf)];
/** A copy of a props tree without the nodes `gone` names (and their subtrees). */
const without = (n: Json, gone: (x: Json) => boolean): Json => ({
  ...n,
  children: ((n.children ?? []) as Json[]).filter((c) => !(c && typeof c === 'object' && 'component' in c && gone(c))).map((c) => (c && typeof c === 'object' && 'component' in c ? without(c, gone) : c)),
});
/** MF-91 (SRCH.FOOTER, task-332; operator, verbatim: "1. once  -approved"): the two RULED differences between the targets, named as data. The web page
 * shows the legal sentence once, in its footer (the footer subtree, five refs); the mobile page keeps its A.10 legal line under the input and has no footer. */
const WEB_FOOTER_REFS = ['content:footer.copyright', 'content:footer.help', 'content:footer.privacy', 'content:footer.terms', 'content:search.legal'];
const isWebFooter = (n: Json): boolean => n.props?.component === 'footer';
const isLegal = (n: Json): boolean => n.props?.testID === 'parcel-search-legal';

/** The parity problems of one state's two goldens: the exact diff set is the footer and the legal line; everything else must be equal. */
export const parityProblems = (state: string, web: Json, mobile: Json): string[] => {
  const out: string[] = [];
  const [wf, ml] = [nodesOf(web.props).filter(isWebFooter), nodesOf(mobile.props).filter(isLegal)];
  if (wf.length !== 1) out.push(`${state}: web has ${wf.length} footer nodes, expected 1`);
  else {
    const fr = uniq(refsOf(wf[0] as Json));
    if (JSON.stringify(fr) !== JSON.stringify(WEB_FOOTER_REFS)) out.push(`${state}: web footer refs are ${fr.join(',')}`);
    if (web.props.children[web.props.children.length - 1] !== wf[0]) out.push(`${state}: the web footer is not last`);
  }
  if (ml.length !== 1) out.push(`${state}: mobile has ${ml.length} legal lines under the input, expected 1`);
  const [wp, mp] = [without(web.props, isWebFooter), without(mobile.props, isLegal)];
  if (nodesOf(wp).some(isLegal)) out.push(`${state}: the web legal line is not only in the footer`);
  const [rw, rm] = [uniq(refsOf(wp)), uniq(refsOf(mp))];
  for (const r of rm) if (!rw.includes(r)) out.push(`${state}: web lacks ${r}`);
  for (const r of rw) if (!rm.includes(r)) out.push(`${state}: mobile lacks ${r}`);
  const [aw, am] = [uniq(actionsOf(wp)), uniq(actionsOf(mp))];
  if (JSON.stringify(aw) !== JSON.stringify(am)) out.push(`${state}: actions differ: web ${aw.join(',')} / mobile ${am.join(',')}`);
  const [tw, tm] = [testIdsOf(wp), testIdsOf(mp)];
  if (JSON.stringify(tw) !== JSON.stringify(tm)) out.push(`${state}: block order differs: web ${tw.join(',')} / mobile ${tm.join(',')}`);
  if (web.situation !== mobile.situation) out.push(`${state}: situation differs: ${String(web.situation)} / ${String(mobile.situation)}`);
  return out;
};

const STATES: Json[] = rj(DESCRIPTOR).states;
const pair = (golden: string): [Json, Json] => [rj(path.join(DIR, `${golden}.web.json`)), rj(path.join(DIR, `${golden}.mobile.json`))];

describe('FE-07 search parity: web vs mobile goldens of mobile_parcel_search', () => {
  // Dated 2026-11-25 (task-465 McFixV2.1; prior title kept: "... all 11 states ..."): 12 states, the typing state `partial` with the golden `suggest`.
  it('the descriptor declares both targets and all 12 states have a web and a mobile golden', () => {
    expect(rj(DESCRIPTOR).identity.platforms).toEqual(['mobile', 'web']);
    // Dated 2026-11-19 (task-353 SUITE.FIX-2): 10 -> 11 states. SRCH.A6 (task-320, commit ace05ccee; operator RR-0307) added the state `hit` with the
    // golden `reports_left` (reports_left.web.json and reports_left.mobile.json, both tracked, so the web/mobile pair the loop below checks holds).
    expect(STATES.map((s) => s.golden)).toEqual(['loading', 'redirect', 'ambiguous', 'miss', 'empty', 'schema_drift', 'rate_limited', 'unauthorized', 'error', 'static', 'reports_left', 'suggest']);
    for (const s of STATES) for (const t of ['web', 'mobile']) expect(fs.existsSync(path.join(DIR, `${s.golden}.${t}.json`)), `${s.golden}.${t}`).toBe(true);
  });
  it('every state: the same refs, actions, block order and situation on both targets (non-vacuous)', () => {
    let refs = 0;
    for (const s of STATES) {
      const [w, m] = pair(s.golden);
      expect([s.golden, parityProblems(s.golden, w, m)]).toEqual([s.golden, []]);
      refs += uniq(refsOf(w.props)).length;
    }
    expect(refs).toBeGreaterThan(100);
    const [w] = pair('ambiguous');
    expect(uniq(refsOf(w.props)).filter((r) => r.startsWith('contract:') || r.startsWith('derived:segments.')).length).toBeGreaterThan(3);
  });
  it('the web legal line is in the footer, the last block, and nowhere else; the mobile legal line stays under the input (RR-0270)', () => {
    for (const s of STATES) {
      const [w, m] = pair(s.golden);
      const ids = testIdsOf(w.props);
      expect([s.golden, ids.filter((x) => x === 'parcel-search-legal').length, ids.indexOf('parcel-search-footer') > ids.indexOf('parcel-search-input')]).toEqual([s.golden, 1, true]);
      const mi = testIdsOf(m.props);
      expect([s.golden, mi.indexOf('parcel-search-legal') > mi.indexOf('parcel-search-input'), mi.includes('parcel-search-footer')]).toEqual([s.golden, true, false]);
    }
  });
});

describe('FE-07 search parity RED: one planted change in one target is reported', () => {
  const [w, m] = pair('ambiguous');
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  it('the legal sentence dropped from the web footer, and put back under the web input', () => {
    const lost = clone(w);
    lost.props.children[lost.props.children.length - 1].children[0].children = [];
    expect(parityProblems('ambiguous', lost, m)).toEqual(['ambiguous: web footer refs are content:footer.copyright,content:footer.help,content:footer.privacy,content:footer.terms']);
    const back = clone(w);
    back.props.children[0].children.splice(2, 0, { component: 'Text', props: { key: 'legal', testID: 'parcel-search-legal' }, children: [{ content: 'search.legal' }] });
    expect(parityProblems('ambiguous', back, m).some((l) => l.startsWith('ambiguous: the web legal line is not only in the footer'))).toBe(true);
  });
  it('a third difference inside the footer is reported', () => {
    const bad = clone(w);
    bad.props.children[bad.props.children.length - 1].children.push({ component: 'Text', props: { key: 'x' }, children: [{ content: 'search.miss' }] });
    expect(parityProblems('ambiguous', bad, m)).toEqual(['ambiguous: web footer refs are content:footer.copyright,content:footer.help,content:footer.privacy,content:footer.terms,content:search.legal,content:search.miss']);
  });
  it('a renamed action, a swapped block and a different situation', () => {
    const bad = clone(w);
    // Dated 2026-11-25 (task-465; prior plant kept as text: the column children 1 and 2 swapped): the ambiguous column holds the header and the box
    // only (the chips and the count hide while the drop-down is open), so two drop-down rows are swapped instead.
    const drop = bad.props.children[0].children[1].children[1].children as Json[];
    [drop[0], drop[1]] = [drop[1] as Json, drop[0] as Json];
    bad.situation = 'static';
    // Dated 2026-11-25 (task-465; prior plant kept as text: the action select renamed): the rows carry push, so a push is renamed.
    const renamed = JSON.stringify(bad).replace('"action":"push"', '"action":"choose"');
    const lines = parityProblems('ambiguous', JSON.parse(renamed), m);
    expect(lines.some((l) => l.startsWith('ambiguous: actions differ'))).toBe(true);
    expect(lines.some((l) => l.startsWith('ambiguous: block order differs'))).toBe(true);
    expect(lines).toContain('ambiguous: situation differs: static / ambiguous');
  });
  it('a ref only the web golden carries (the other direction)', () => {
    const bad = clone(w);
    bad.props.children[0].children[1].children.push({ content: 'search.miss' });
    expect(parityProblems('ambiguous', bad, m)).toEqual(['ambiguous: mobile lacks content:search.miss']);
  });
  it('control: the committed pair reports nothing', () => {
    expect(parityProblems('ambiguous', w, m)).toEqual([]);
  });
});
