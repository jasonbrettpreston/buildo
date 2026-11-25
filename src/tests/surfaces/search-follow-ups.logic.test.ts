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
// Dated note 2026-11-25 (task-456 R5; mcfixreborn-g3 GROUNDER-C.md:123, GROUNDER-D.md:124): C.5 and C.7 have since landed under task-336
// (SRCH.LOTCARD, RR-0284): frontageStreet and hasFootprint are in the map field whitelist (14 -> 16 entries), pinned below. The prior text is kept.
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

// Dated 2026-11-25 (task-456 R5; prior title kept: "GAP.13: fingerprints follow the content files, and no field was added"): the second case pins the two ruled fields that were added (RR-0284).
describe('GAP.13: fingerprints follow the content files', () => {
  it.each([SEARCH, MAP])('%s: every committed golden fingerprint equals the current sha16 of its content and descriptor files', (id) => {
    for (const f of goldenFiles(id)) {
      const files = rj(f).fingerprint.files as Record<string, string>;
      const stale = Object.entries(files).filter(([p, h]) => h !== sha16(path.join(ROOT, p)));
      expect([f, stale]).toEqual([f, []]);
    }
  });
  it('SRCH.LOTCARD (RR-0284): the map field whitelist is the 14 entries plus exactly the two ruled fields (14 -> 16, both ways)', () => {
    const d = rj(`${SURF}/${MAP}.descriptor.json`);
    expect(d.inputs.field_whitelist).toEqual([
      'resolution', 'map.address', 'map.pin', 'map.fit', 'map.truncated', 'map.lots[].parcelId', 'map.lots[].area', 'map.lots[].frontage',
      'map.lots[].zoning', 'map.lots[].centroid', 'map.lots[].outline', 'map.lots[].frontageStreet', 'map.lots[].hasFootprint',
      'map.neighbours[].parcelId', 'map.neighbours[].outline', 'match.parcelId',
    ]);
    const parcels = d.inputs.tables.find((t: Json) => t.table === 'parcels');
    expect(parcels.columns).toEqual(['parcel_id', 'lot_size_sqm', 'frontage_m', 'zoning_zn_string', 'centroid_lat', 'centroid_lng', 'geom', 'primary_frontage_street_name']);
    expect(d.inputs.tables.map((t: Json) => t.table)).toContain('parcel_buildings');
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

describe('SRCH.LOTCARD (task-336, RR-0284): C.5 footprint presence on the map and C.7 the card lead (choose-lot.html:306)', () => {
  const LEADS = {
    'lot.letter': 'Lot {letter}',
    // SEARCHFIX.3 V1 (task-451, dated 2026-11-24; MD:776 "'at the back' when it has none", doc-2 C.7, FOLD-PLAN.md:57; prior values 'Lot {letter} · has the house'
    // and 'Lot {letter} · no building'): a lot with no fronting street reads "at the back".
    'lot.lead.house': 'Lot {letter} · has the house · at the back',
    'lot.lead.no_building': 'Lot {letter} · no building · at the back',
    'lot.lead.no_building_faces': 'Lot {letter} · no building · faces {street}',
    'lot.lead.house_faces': 'Lot {letter} · has the house · faces {street}',
  };
  // SEARCHFIX.3 V1 (task-451 AC2, dated 2026-11-24): the prior title said '"at the back" is not data and is not used (RR-0289, MORNING-DECISIONS.md:1117)' and its
  // assertion was that no content value holds "at the back". RR-0289 rules massing presence only; "at the back" is the v8 phrase for a lot with no fronting street
  // (MD:776, doc-2 C.7, FOLD-PLAN.md:57), so the lock is now on where the phrase may and may not appear.
  it('lead keys carry the v8 words (choose-lot.html:306) in the content file and the slice; "at the back" ends only the two no-street leads', () => {
    for (const [k, v] of Object.entries(LEADS)) expect([k, mapContent[k], mapSlice[k]]).toEqual([k, v, v]);
    for (const k of ['lot.lead.house', 'lot.lead.no_building']) expect([k, mapContent[k]!.endsWith(' · at the back')]).toEqual([k, true]);
    for (const k of ['lot.lead.house_faces', 'lot.lead.no_building_faces', 'lot.letter']) expect([k, /at the back/.test(mapContent[k]!)]).toEqual([k, false]);
  });
  const leadKey = (name: string, i: number): { key: string; street: unknown } => {
    const g = rj(`${GOLD}/${MAP}/${name}.mobile.json`);
    const card = byTestId(g.props, `parcel-lotmap-card-${['PCL-A1', 'PCL-B2', 'PCL-C3'][i]}`)!;
    const refs = contentRefs(card).filter((k) => k.startsWith('lot.lead.') || k === 'lot.letter');
    const text = JSON.stringify(card);
    const street = /"street":(\{[^}]*\})/.exec(text)?.[1] ?? null;
    return { key: refs[0]!, street: street && JSON.parse(street) };
  };
  // SEARCHFIX.3 (task-451, dated 2026-11-24; prior title ended '("no building" only)'): the key is unchanged; its text now ends "at the back".
  it('two lots: A has a footprint and a street (house and faces), B has no footprint and no street ("no building · at the back")', () => {
    expect(leadKey('multi_parcel_2', 0)).toEqual({ key: 'lot.lead.house_faces', street: { contract: 'contract_parcels_lookup.map.lots.0.frontageStreet' } });
    expect(leadKey('multi_parcel_2', 1)).toEqual({ key: 'lot.lead.no_building', street: null });
  });
  it('three lots cover the other variants: house only, no building with a street, and a lot whose response lacks both fields (older or cached server: plain letter)', () => {
    expect(leadKey('multi_parcel_3plus', 0).key).toBe('lot.lead.house');
    expect(leadKey('multi_parcel_3plus', 1)).toEqual({ key: 'lot.lead.no_building_faces', street: { contract: 'contract_parcels_lookup.map.lots.1.frontageStreet' } });
    expect(leadKey('multi_parcel_3plus', 2)).toEqual({ key: 'lot.letter', street: null }); // C has neither field: says neither house nor building
  });
  it('a response without the field says neither house nor building: the plain lot letter (older or cached server)', () => {
    const fx = rj('mobile/__tests__/fixtures/lotMap.situations.json');
    expect(fx.inputs.lot_facts_null.data.map.lots.every((l: Json) => !('hasFootprint' in l))).toBe(true);
    const binding = fs.readFileSync(path.join(ROOT, 'mobile/src/components/surfaces/LotMapBinding.tsx'), 'utf8');
    expect(binding).toContain("const known = lot.hasFootprint !== undefined;");
    expect(binding).toContain("!known ? 'lot.letter'");
  });
  it('the map draws a lot with a footprint in its own fill tier, never in the selected tier unless picked', () => {
    const g = rj(`${GOLD}/${MAP}/multi_parcel_2.mobile.json`);
    const fills: string[] = [];
    const walk = (n: Json): void => { if (n.component === 'Polygon') fills.push(`${n.props.key}=${n.props.fillColor}`); for (const c of (n.children ?? []) as Json[]) if (c && typeof c === 'object' && 'component' in c) walk(c); };
    walk(g.props);
    expect(fills).toEqual(['lot-PCL-A1-0=rgba(245,158,11,0.24)', 'lot-PCL-B2-0=rgba(245,158,11,0.12)']);
  });
  it('the mobile mirror accepts both fields as optional and the server schema requires them', () => {
    const mobile = fs.readFileSync(path.join(ROOT, 'mobile/src/lib/schemas.ts'), 'utf8');
    expect(mobile).toMatch(/frontageStreet: z\.string\(\)\.nullable\(\)\.optional\(\)/);
    expect(mobile).toMatch(/hasFootprint: z\.boolean\(\)\.optional\(\)/);
    const server = fs.readFileSync(path.join(ROOT, 'src/app/api/parcels/lookup/types.ts'), 'utf8');
    expect(server).toMatch(/frontageStreet: z\.string\(\)\.nullable\(\)/);
    expect(server).toMatch(/hasFootprint: z\.boolean\(\)/);
  });
  it('the data-check script exists, is read-only, prints its SQL on --dry-run and names no connection by default', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/lot-map-data-check.mjs'), 'utf8');
    expect(src).toContain('--dry-run');
    expect(src).toContain('BEGIN READ ONLY');
    expect(src).toContain('55322');
    expect(src).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/);
  });
  // SEARCHFIX.3 L7 (task-451; GROUNDER-G item 2): a flag with no value, or with the next flag as its value, is an error (usage, exit 2), never a silent read.
  it('SEARCHFIX.3 L7: --url or --parcels with a missing value or a flag as its value sets an error; a real value does not', async () => {
    const parseArgs = (await import('../../../scripts/analysis/lot-map-data-check.mjs')).parseArgs as unknown as (argv: string[]) => { error?: string };
    expect(parseArgs(['--parcels', '--url', 'x']).error).toBeTruthy();
    expect(parseArgs(['--url']).error).toBeTruthy();
    expect(parseArgs(['--url', '--dry-run']).error).toBeTruthy();
    expect(parseArgs(['--parcels']).error).toBeTruthy();
    expect(parseArgs(['--parcels', '1,2']).error).toBeUndefined();
    expect(parseArgs(['--url', 'postgres://u@127.0.0.1:55322/db']).error).toBeUndefined();
    expect(parseArgs(['--dry-run']).error).toBeUndefined();
  });
  it('the data-check guard refuses every host, port, scheme and query override but the rehearsal stack', async () => {
    const { refuse } = await import('../../../scripts/analysis/lot-map-data-check.mjs');
    expect(refuse('postgres://u:p@127.0.0.1:55322/db')).toBeNull();
    for (const bad of ['postgres://u@127.0.0.1:54322/db', 'postgres://u@db.example.com:55322/db', 'postgres://u@127.0.0.1:55322/db?host=db.example.com', 'http://127.0.0.1:55322/db', 'garbage'])
      expect([bad, refuse(bad) !== null]).toEqual([bad, true]);
  });
  it('MF-53 carries the 2026-11-19 SRCH.LOTCARD dated note with the ruling verbatim and keeps the earlier notes', () => {
    const queue = fs.readFileSync(path.join(ROOT, '.cursor/MCFRONTEND-QUEUE.md'), 'utf8');
    const start = queue.indexOf('\n**MF-53 ');
    const r = queue.slice(start, queue.indexOf('\n**MF-', start + 1));
    expect(r).toContain('lane BL-LOTCARD, task-336');
    expect(r).toContain("if it a small change let's do it - we have the data - why not");
    expect(r).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-53 · McFrontend queue · lane BL-GAP13');
    expect(r).toContain('RR-0289');
    expect(r).toContain('should be reliable to say something is there');
  });
});
