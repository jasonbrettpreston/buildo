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

/** The parity problems of one state's two goldens. */
export const parityProblems = (state: string, web: Json, mobile: Json): string[] => {
  const out: string[] = [];
  const [rw, rm] = [uniq(refsOf(web.props)), uniq(refsOf(mobile.props))];
  for (const r of rm) if (!rw.includes(r)) out.push(`${state}: web lacks ${r}`);
  for (const r of rw) if (!rm.includes(r)) out.push(`${state}: mobile lacks ${r}`);
  const [aw, am] = [uniq(actionsOf(web.props)), uniq(actionsOf(mobile.props))];
  if (JSON.stringify(aw) !== JSON.stringify(am)) out.push(`${state}: actions differ: web ${aw.join(',')} / mobile ${am.join(',')}`);
  const [tw, tm] = [testIdsOf(web.props), testIdsOf(mobile.props)];
  if (JSON.stringify(tw) !== JSON.stringify(tm)) out.push(`${state}: block order differs: web ${tw.join(',')} / mobile ${tm.join(',')}`);
  if (web.situation !== mobile.situation) out.push(`${state}: situation differs: ${String(web.situation)} / ${String(mobile.situation)}`);
  return out;
};

const STATES: Json[] = rj(DESCRIPTOR).states;
const pair = (golden: string): [Json, Json] => [rj(path.join(DIR, `${golden}.web.json`)), rj(path.join(DIR, `${golden}.mobile.json`))];

describe('FE-07 search parity: web vs mobile goldens of mobile_parcel_search', () => {
  it('the descriptor declares both targets and all 10 states have a web and a mobile golden', () => {
    expect(rj(DESCRIPTOR).identity.platforms).toEqual(['mobile', 'web']);
    expect(STATES.map((s) => s.golden)).toEqual(['loading', 'redirect', 'ambiguous', 'miss', 'empty', 'schema_drift', 'rate_limited', 'unauthorized', 'error', 'static']);
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
  it('the legal line sits under the input and before every result block on the web (queue N8; ruling 16)', () => {
    for (const s of STATES) {
      const ids = testIdsOf(pair(s.golden)[0].props);
      const legal = ids.indexOf('parcel-search-legal');
      expect([s.golden, legal > ids.indexOf('parcel-search-input'), ids.slice(legal + 1).every((x) => !['parcel-search-input', 'parcel-search-account'].includes(x))]).toEqual([s.golden, true, true]);
    }
  });
});

describe('FE-07 search parity RED: one planted change in one target is reported', () => {
  const [w, m] = pair('ambiguous');
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  it('a ref dropped from the web golden', () => {
    const bad = clone(w);
    bad.props.children[0].children[2] = { component: 'Text', props: { key: 'legal', testID: 'parcel-search-legal' }, children: [] };
    expect(parityProblems('ambiguous', bad, m)).toEqual(['ambiguous: web lacks content:search.legal']);
  });
  it('a renamed action, a swapped block and a different situation', () => {
    const bad = clone(w);
    const col = bad.props.children[0].children as Json[];
    [col[1], col[2]] = [col[2] as Json, col[1] as Json];
    bad.situation = 'static';
    const select = JSON.stringify(bad).replace('"action":"select"', '"action":"choose"');
    const lines = parityProblems('ambiguous', JSON.parse(select), m);
    expect(lines.some((l) => l.startsWith('ambiguous: actions differ'))).toBe(true);
    expect(lines.some((l) => l.startsWith('ambiguous: block order differs'))).toBe(true);
    expect(lines).toContain('ambiguous: situation differs: static / ambiguous');
  });
  it('a ref only the web golden carries (the other direction)', () => {
    const bad = clone(w);
    bad.props.children[0].children[2].children.push({ content: 'search.miss' });
    expect(parityProblems('ambiguous', bad, m)).toEqual(['ambiguous: mobile lacks content:search.miss']);
  });
  it('control: the committed pair reports nothing', () => {
    expect(parityProblems('ambiguous', w, m)).toEqual([]);
  });
});
