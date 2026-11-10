// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 dated note 2026-11-10 (what is kept and what changes, as ruled),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md §4.2 (the Intent Ledger: CONTRACT / INCIDENTAL / DEFECT),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-35 · the legacy oracle (plan v2 §9, RG-7, v1 F1; v3 §9: index.tsx only). Every testID, a11y/input attribute and visible text of the search
// screen BEFORE the conversion (docs/reports/red-evidence/MF-35/legacy-props.json, extracted from 1e87de532) must survive in the converted
// surface: a testID in some committed mobile golden; a text or attribute value among the content strings (placeholders filled with the config
// values) or the golden's literal props; or it sits in INTENTIONALLY_CHANGED with the ruling that changed it. Root vitest reads the files as text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const legacy = rj('docs/reports/red-evidence/MF-35/legacy-props.json');
const content: Record<string, string> = rj('scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json');
const GDIR = 'src/tests/fixtures/surfaces/mobile_parcel_search';
const goldens = fs.readdirSync(path.join(ROOT, GDIR)).filter((f) => f.endsWith('.mobile.json')).map((f) => rj(`${GDIR}/${f}`));
const CONFIG: Record<string, string> = { SEARCH_MIN_QUERY_LEN: '3', SEARCH_CANDIDATE_LIMIT: '10' };

/** Ruled changes (CONTRACT, S6 vocabulary), each with its cite: plan v3 §4 rows 6, 9, 18 and the operator rulings quoted in plan v3 §0.2. */
export const INTENTIONALLY_CHANGED: Record<string, string> = {
  'Toronto lot lookup': 'the tagline becomes "Lot & Zoning Intelligence" (ruling 2026-11-09 item 1, the operator search layout)',
  'placeholder=Search an address, e.g. 26 Hurlingham Cres': 'the placeholder becomes "Search Toronto address..." (ruling 2026-11-09 item 1)',
  'accessibilityLabel=Search ${s.label}': 'the chips are the recent searches; the label is "Search <query>" (ruling 2026-11-09 item 2, P35-D16 a)',
  'accessibilityLabel=Open lot at ${c.address || c.parcelId}': 'a tap now selects a radio card labelled with the address; SELECT opens the lot (accepted 2026-11-09 item 1, P35-D17 a)',
  'Parcel {c.parcelId}': 'the radio cards carry the address only, as the layout (accepted 2026-11-09 item 1; plan v3 §2.2)',
};

const fill = (s: string): string => s.replace(/\$?\{([A-Z_]+)\}/g, (m, k: string) => CONFIG[k] ?? m).replace(/\$?\{[^}]+\}/g, '{}');
const contentForms = new Set(Object.values(content).map((v) => v.replace(/\{[^}]+\}/g, '{}')));
const literals = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(literals) : v && typeof v === 'object' ? Object.values(v).flatMap(literals) : []);
const goldenStrings = new Set(goldens.flatMap((g) => literals(g.props)));
const goldenTestIDs = [...goldenStrings].filter((s) => s.startsWith('parcel-'));

export const oracleProblems = (lg: Json, forms: Set<string>, ids: string[], strings: Set<string>): string[] => {
  const out: string[] = [];
  for (const id of lg.testIDs as string[]) {
    if (INTENTIONALLY_CHANGED[id]) continue;
    const prefix = id.split('${')[0] as string;
    if (!ids.some((x) => (id.includes('${') ? x.startsWith(prefix) : x === id))) out.push(`testID ${id} is not in any golden`);
  }
  for (const a of lg.attrs as string[]) {
    if (INTENTIONALLY_CHANGED[a]) continue;
    const value = a.slice(a.indexOf('=') + 1);
    if (!forms.has(fill(value)) && !strings.has(value)) out.push(`attribute ${a} is neither content nor a golden literal`);
  }
  for (const t of lg.text as string[]) {
    if (INTENTIONALLY_CHANGED[t]) continue;
    if (!forms.has(fill(t))) out.push(`text "${t}" is not a content string`);
  }
  return out;
};

describe('the parcel search legacy oracle (MF-35)', () => {
  it('every legacy testID, attribute and text survives in the converted surface or is a ruled change', () => {
    expect([legacy.testIDs.length, legacy.attrs.length, legacy.text.length]).toEqual([11, 11, 13]);
    expect(oracleProblems(legacy, contentForms, goldenTestIDs, goldenStrings)).toEqual([]);
  });
  it('every INTENTIONALLY_CHANGED entry names a real legacy literal', () => {
    const all = new Set([...legacy.testIDs, ...legacy.attrs, ...legacy.text]);
    expect(Object.keys(INTENTIONALLY_CHANGED).filter((k) => !all.has(k))).toEqual([]);
  });
  it('RED (planted): a dropped testID, a straight apostrophe where legacy has a curly one, a changed hint', () => {
    const forms = new Set([...contentForms].map((v) => v.replace('Couldn’t reach', "Couldn't reach").replace('to search for a lot', 'to search')));
    expect(oracleProblems(legacy, forms, goldenTestIDs.filter((x) => x !== 'parcel-search-retry'), goldenStrings)).toEqual([
      'testID parcel-search-retry is not in any golden',
      'attribute accessibilityHint=Enter at least ${SEARCH_MIN_QUERY_LEN} characters to search for a lot is neither content nor a golden literal',
      'text "Couldn’t reach the lot service. Check your connection and try again." is not a content string',
    ]);
  });
});
