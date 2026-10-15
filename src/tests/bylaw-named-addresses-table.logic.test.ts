// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`applies_to.part` named_addresses + refs; `instrument`
//            {kind, citation, municipality}; generated fields written only by the generator), §9 G-DRIFT (`--check`
//            regenerates in memory and byte-compares; a hand edit is drift), §10 stage 8 (render: JSON the single source
//            of truth; total sort; no run timestamp)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-117 (R-DET), M-45 (pending drafts never reach the table)
//
// Lane NAMED-ADDR-2 (plan .cursor/mcbylaw/named-addr-plan.md, phase2-plan-v2 P2-8.0(a)). The operator ruling: every
// `applies_to.refs[]` string and `instrument.citation` of an agreed unit carries a DERIVED `addresses[]` / `citations[]`
// in the GENERATED table (docs/reference/bylaw-provisions.json), produced by the pure named-addresses.mjs; the raw string
// stays authoritative, the parse is regenerated and never hand-edited (G-DRIFT). The parcel resolution (match_status) is
// DB-derived and stays out of the table (named-addresses-run.mjs output only).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const NA = await mod('scripts/analysis/bylaw/named-addresses.mjs');
const R = await mod('scripts/analysis/bylaw/render.mjs');
const V = await mod('scripts/analysis/bylaw/validate.mjs');

const SSP = { unit_id: '900.2.10(737)#(737)[SSP]', applies_to: { part: 'named_addresses', refs: ['the odd numbered addresses of 2549B-2551B Dundas St. W.', '19 Dorval Rd.'] }, instrument: 'none' };
const PBS = { unit_id: '900.2.10(737)#(737)[PBS]', applies_to: { part: 'named_addresses', refs: ['48 Pine Crest Rd.'] }, instrument: { kind: 'former_bylaw', citation: 'former City of Toronto by-laws 22318, 171-67 and 188-71', municipality: 'former City of Toronto' } };
const MAP = { unit_id: '10.20.40.70(2)#(2)', applies_to: { part: 'map_area', refs: ['Map 1'] }, instrument: 'none' };
const PREV = { unit_id: '10.20.40.70(1)#whole', applies_to: { part: 'whole' }, instrument: { kind: 'former_bylaw', citation: 'Section 12(2) 155 of former City of Toronto By-law 438-86', municipality: 'former City of Toronto' } };

describe('deriveUnitNamed: the derived fields are the parser output, from the raw strings only', () => {
  it('named_addresses refs → one parse per raw ref, in ref order; citation → splitCitations', () => {
    const d = NA.deriveUnitNamed(PBS);
    expect(d.unit_id).toBe(PBS.unit_id);
    expect(d.refs).toEqual([NA.parseNamedRef('48 Pine Crest Rd.')]);
    expect(d.refs[0].raw).toBe('48 Pine Crest Rd.');
    expect(d.citation).toEqual(NA.splitCitations(PBS.instrument.citation));
    expect(d.citation.citations.map((c: Json) => c.bylaw)).toEqual(['22318', '171-67', '188-71']);
    const s = NA.deriveUnitNamed(SSP);
    expect(s.refs.map((r: Json) => r.raw)).toEqual(SSP.applies_to.refs);
    expect(s.citation).toBeNull();
  });
  it('a citation alone (part whole) carries citations[] and no refs', () => {
    expect(NA.deriveUnitNamed(PREV)).toEqual({ unit_id: PREV.unit_id, refs: [], citation: NA.splitCitations(PREV.instrument.citation) });
  });
  it('nothing named → null (map_area refs are map names, not addresses; instrument "none")', () => {
    expect(NA.deriveUnitNamed(MAP)).toBeNull();
    expect(NA.deriveUnitNamed({ unit_id: 'x#(1)', applies_to: { part: 'named_addresses', refs: [] }, instrument: { kind: 'former_bylaw', citation: '  ' } })).toBeNull();
    expect(NA.deriveUnitNamed({ unit_id: 'x#(1)' })).toBeNull();
  });
});

const mk = (agreedUnits: Json[]) => {
  const rows = ['10.20.40.70(2)', '10.20.40.70(1)', '900.2.10(737)'].map((id, i) => ({ regulation_id: id, page: 'p1', section: '10.20', article: id.replace(/\(.*$/, ''), kind: 'regulation', start: 100 - i * 30, verbatim: `v ${id}`, sha256: 'a', clauses: [], literals: [], refs: [], tags: [], defects: [] }));
  return {
    slice: { rows, units: [], slicer_version: 'slice-v1' },
    scoped: rows.map((r) => ({ regulation_id: r.regulation_id, scope: 'in_scope', reason: null, rule_id: 'R', ruling: null })),
    manifest: { adoption_id: 'adoption-x', normalizer_version: 'norm-v1', pages: [{ key: 'p1', role: 'section', section: '10.20', url: 'u', raw_sha256: 'r', normalized_sha256: 'n'.repeat(64), fetch_id: 'F', consolidation: null }] },
    amendments: { statuses: {} },
    vocab: { version: 'v' },
    agreedUnits,
  };
};

describe('buildTable: named_units on the GENERATED row (never in an authored draft)', () => {
  const doc = R.buildTable(mk([SSP, PBS, MAP, PREV]));
  const row = (id: string) => doc.rows.find((r: Json) => r.regulation_id === id);
  it('a row whose agreed units name refs or a citation carries named_units, sorted by unit_id, equal to the parser output', () => {
    expect(row('900.2.10(737)').named_units).toEqual([NA.deriveUnitNamed(PBS), NA.deriveUnitNamed(SSP)]);
    expect(row('10.20.40.70(1)').named_units).toEqual([NA.deriveUnitNamed(PREV)]);
  });
  it('a row with nothing named carries no named_units key (the other row lines are unchanged)', () => {
    expect(Object.hasOwn(row('10.20.40.70(2)'), 'named_units')).toBe(false);
    expect(Object.hasOwn(R.buildTable(mk([])).rows[0], 'named_units')).toBe(false);
  });
  it('validated_against names the parser version (a parser change is a visible regeneration)', () => {
    expect(doc.validated_against.named_addr_version).toBe(NA.NAMED_ADDR_VERSION);
  });
  it('total sort: agreed-unit input order never changes the bytes', () => {
    const a = R.renderAll(R.buildTable(mk([SSP, PBS, MAP, PREV])));
    const b = R.renderAll(R.buildTable(mk([PREV, MAP, PBS, SSP])));
    expect(a[R.JSON_REL]).toBe(b[R.JSON_REL]);
    expect(a[R.MD_REL]).toBe(b[R.MD_REL]);
  });
  it('an agreed unit naming no row is a structural error, never silently dropped', () => {
    expect(() => R.buildTable(mk([{ ...SSP, unit_id: '999.9(1)#(1)' }]))).toThrow(/named unit/);
  });
});

describe('G-DRIFT lock: the derived fields are regenerated, a hand edit is drift', () => {
  const text = R.renderJson(R.buildTable(mk([SSP, PBS])));
  it('the canonical JSON round-trips with named_units', () => {
    expect(R.renderJson(JSON.parse(text))).toBe(text);
  });
  it('a hand-edited derived address (or citation) differs from the regeneration', () => {
    const edited = text.replace('"from_key":"2549B"', '"from_key":"2547B"');
    expect(edited).not.toBe(text);
    expect(edited).not.toBe(R.renderJson(R.buildTable(mk([SSP, PBS]))));
    const cit = text.replace('"bylaw":"171-67"', '"bylaw":"171-68"');
    expect(cit).not.toBe(text);
  });
  it('renderSelfTest carries the named-address drift fixture and it fires', () => {
    const st = V.renderSelfTest();
    const r = st.results.find((x: Json) => /derived named address/.test(x.name));
    expect(r).toBeDefined();
    expect(r.pass).toBe(true);
    expect(st.pass).toBe(true);
  });
});

describe('the committed table: every named_units entry equals the parser re-run on its raw strings', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, R.JSON_REL), 'utf8'));
  const entries: Json[] = doc.rows.flatMap((r: Json) => (r.named_units ?? []).map((n: Json) => ({ ...n, regulation_id: r.regulation_id })));
  it('the table carries named units (anti-vacuity) under the current parser version', () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
    expect(entries.some((e) => e.refs.length > 0)).toBe(true);
    expect(entries.some((e) => e.citation !== null)).toBe(true);
    expect(doc.validated_against.named_addr_version).toBe(NA.NAMED_ADDR_VERSION);
  });
  it('re-derived from raw, byte-equal (a hand edit of addresses[] / citations[] fails here and in --check)', () => {
    for (const e of entries) {
      const unit = {
        unit_id: e.unit_id,
        applies_to: e.refs.length ? { part: 'named_addresses', refs: e.refs.map((x: Json) => x.raw) } : { part: 'whole' },
        instrument: e.citation ? { citation: e.citation.raw } : 'none',
      };
      const { regulation_id: _rid, ...committed } = e; // eslint-disable-line @typescript-eslint/no-unused-vars -- strip the test-added key
      expect({ id: e.unit_id, derived: NA.deriveUnitNamed(unit) }).toStrictEqual({ id: e.unit_id, derived: committed });
      expect(e.unit_id.startsWith(`${e.regulation_id}#`)).toBe(true);
    }
  });
  it('no DB-derived resolution leaks into the table (match_status / parcels stay runner output)', () => {
    const s = JSON.stringify(entries);
    expect(s).not.toMatch(/"match_status"|"parcels"|"address_point_id"|"parcel_id"/);
  });
});
