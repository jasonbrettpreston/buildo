// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (props goldens, content file one source; regenerated, never hand-edited),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31, FE-32 (every value a ref), FE-05 (no maths in a binding),
//            docs/specs/00-architecture/137_mcqueue.md rule 10 (M-246 dated notes keep the prior text).
//
// GAP.13 (task-12, Increment 1·B; McFrontend follow-up rows on MF-35 and MF-53) · the search follow-ups built to the v8 small pages and nothing else.
//   A.1  the tagline reads "Lot Intelligence" (search.html:264; operator "1 y", open-questions.md:936);
//   C.1  the choose-your-lot heading reads "This address covers {count} lots. Which one do you mean?" (choose-lot.html:265), the count being the
//        existing derived name lot_count; it replaces the rail and the badge (content keys map.rail and map.badge retire).
// Not built here, by ruling or by missing data (see task-12): A.11 (web twin needed by the FE-07 parity lock), C.5 and C.7 (footprint presence and the
// primary frontage street name are not in the map field whitelist, pinned below so a field cannot arrive without a ruling), C.6 (RR-0172: the map's own
// road labels), C.10 (tap selects, already built). Root test: reads committed files as text, no DB, no network, no mobile import.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sha16 } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const SURF = 'scripts/surfaces/parcel_product/F01/surfaces';
const SEARCH = 'mobile_parcel_search';
const MAP = 'mobile_parcel_disambiguation_map';
const GOLD = 'src/tests/fixtures/surfaces';
const searchContent: Record<string, string> = rj(`${SURF}/${SEARCH}.content.json`);
const mapContent: Record<string, string> = rj(`${SURF}/${MAP}.content.json`);
const searchSlice = rj(`mobile/src/generated/surfaces/${SEARCH}.json`).content as Record<string, string>;
const mapSlice = rj(`mobile/src/generated/surfaces/${MAP}.json`).content as Record<string, string>;
const goldenFiles = (id: string): string[] => fs.readdirSync(path.join(ROOT, GOLD, id)).filter((f) => f.endsWith('.json')).sort().map((f) => `${GOLD}/${id}/${f}`);

const HEADING = 'This address covers {count} lots. Which one do you mean?';

/** The first node (depth first) whose props.testID is `id`. */
const byTestId = (n: Json, id: string): Json | null => {
  if (n?.props?.testID === id) return n;
  for (const c of (n?.children ?? []) as Json[]) {
    if (c && typeof c === 'object' && 'component' in c) {
      const f = byTestId(c, id);
      if (f) return f;
    }
  }
  return null;
};
/** Every content key a tree refers to, templates included. */
const contentRefs = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(contentRefs);
  if (v === null || typeof v !== 'object') return [];
  const o = v as Json;
  const keys = Object.keys(o);
  if (keys.length === 1 && keys[0] === 'content') return [String(o.content)];
  return Object.values(o).flatMap(contentRefs);
};

describe('GAP.13 A.1: the tagline reads Lot Intelligence (search.html:264)', () => {
  it('the content file and the generated mobile slice carry the ruled text, and no old tagline is left', () => {
    expect(searchContent['search.tagline']).toBe('Lot Intelligence');
    expect(searchSlice['search.tagline']).toBe('Lot Intelligence');
    expect(Object.values(searchContent).filter((v) => /Zoning Intelligence/.test(v))).toEqual([]);
    expect(Object.values(searchSlice).filter((v) => /Zoning Intelligence/.test(v))).toEqual([]);
  });
  it('the wordmark pieces stay (Max, BLD), unchanged by the ruling', () => {
    expect([searchContent['search.wordmark.max'], searchContent['search.wordmark.bld']]).toEqual(['Max', 'BLD']);
  });
  it('the mobile smoke test and the legacy oracle name the new tagline and the newest ruling', () => {
    const smoke = fs.readFileSync(path.join(ROOT, 'mobile/__tests__/surfaceRenderer.smoke.test.tsx'), 'utf8');
    expect(smoke).toContain("screen.getByText('Lot Intelligence')");
    expect(smoke).not.toContain('Lot & Zoning Intelligence');
    const oracle = fs.readFileSync(path.join(ROOT, 'src/tests/surfaces/parcel-legacy-oracle.logic.test.ts'), 'utf8');
    expect(oracle).toContain('the tagline becomes "Lot Intelligence" (operator "1 y" 2026-11-11');
    expect(oracle).not.toContain('the tagline becomes "Lot & Zoning Intelligence"');
  });
});

describe('GAP.13 C.1: the choose-your-lot heading (choose-lot.html:265)', () => {
  it('map.heading carries the v8 text; map.rail and map.badge are retired from the content file and the slice', () => {
    expect(mapContent['map.heading']).toBe(HEADING);
    expect(mapSlice['map.heading']).toBe(HEADING);
    for (const k of ['map.rail', 'map.badge']) expect([k, k in mapContent, k in mapSlice]).toEqual([k, false, false]);
  });
  it.each(['multi_parcel_2', 'multi_parcel_3plus'])('%s: one heading text with the existing lot_count, and no rail or badge', (name) => {
    const g = rj(`${GOLD}/${MAP}/${name}.mobile.json`);
    const header = byTestId(g.props, 'parcel-lotmap-header');
    expect(header).not.toBeNull();
    const texts = (header!.children as Json[]).filter((c) => 'component' in c);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.component).toBe('Text');
    expect(texts[0]!.props.role).toBe('header');
    expect(texts[0]!.children).toEqual([{ text: { content: 'map.heading' }, vars: { count: { derived: 'lot_count' } } }]);
    const used = contentRefs(g.props);
    expect(used.filter((k) => k === 'map.rail' || k === 'map.badge')).toEqual([]);
  });
  it('every content key of the map page is used by some golden, and every ref names a key (no dead key, no dangling ref)', () => {
    const used = new Set(goldenFiles(MAP).flatMap((f) => contentRefs(rj(f).props)));
    expect(Object.keys(mapContent).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in mapContent))).toEqual([]);
  });
});

describe('GAP.13: fingerprints follow the content files, and no field was added', () => {
  it.each([SEARCH, MAP])('%s: every committed golden fingerprint equals the current sha16 of its content and descriptor files', (id) => {
    for (const f of goldenFiles(id)) {
      const files = rj(f).fingerprint.files as Record<string, string>;
      const stale = Object.entries(files).filter(([p, h]) => h !== sha16(path.join(ROOT, p)));
      expect([f, stale]).toEqual([f, []]);
    }
  });
  it('the map field whitelist is unchanged: no footprint and no street-name field (C.5 and C.7 wait for a ruling)', () => {
    const d = rj(`${SURF}/${MAP}.descriptor.json`);
    expect(d.inputs.field_whitelist).toEqual([
      'resolution', 'map.address', 'map.pin', 'map.fit', 'map.truncated', 'map.lots[].parcelId', 'map.lots[].area', 'map.lots[].frontage',
      'map.lots[].zoning', 'map.lots[].centroid', 'map.lots[].outline', 'map.neighbours[].parcelId', 'map.neighbours[].outline', 'match.parcelId',
    ]);
  });
});

describe('GAP.13: the dated notes on the parent queue rows (M-246, prior text kept)', () => {
  const queue = fs.readFileSync(path.join(ROOT, '.cursor/MCFRONTEND-QUEUE.md'), 'utf8');
  const row = (id: string): string => {
    const start = queue.indexOf(`\n**${id} `);
    const next = queue.indexOf('\n**MF-', start + 1);
    return queue.slice(start, next === -1 ? undefined : next);
  };
  it('MF-35 carries a 2026-11-19 note for the tagline and keeps the 2026-11-09 note naming the first tagline', () => {
    const r = row('MF-35');
    expect(r).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-35');
    expect(r).toContain('Lot Intelligence');
    expect(r).toContain('Dated note 2026-11-09 (M-246, prior text kept; MaxBLD page layouts');
  });
  it('MF-53 carries a 2026-11-19 note for the heading that amends plan.v4:72 and keeps its earlier notes', () => {
    const r = row('MF-53');
    expect(r).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-53');
    expect(r).toContain('plan.v4.md:72');
    expect(r).toContain(HEADING);
    expect(r).toContain('Dated note 2026-11-12 (M-246, prior text kept; MF-53');
  });
});
