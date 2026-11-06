// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md Rule 20 (binding: every displayed field's `source` is in the
//            closed set; the set is in a protected file; the lock has a RED fixture: a node with an invented field),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18 (the lock) and FE-27 (`parcels`),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.1 (the binding rule and its 2026-11-06 dated note).
//
// MF-10 · McFrontend queue · lane E. The FE-18 lock: the report declaration binds only to the closed set in
// scripts/surfaces/_schema/binding-sources.json. Every check is proven RED on a mutated copy of the real inputs (an invented
// field, a retired source form, a sixth source, a member that does not resolve) and GREEN on the committed tree. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const GEN = 'scripts/analysis/report-schema.mjs';
const BINDING = 'scripts/surfaces/_schema/binding-sources.json';
const RS: Json = await import(pathToFileURL(path.join(ROOT, GEN)).href).catch((err: unknown) => ({ importError: String(err) }));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const fresh = (): Json => structuredClone(RS.loadInputs(ROOT));
const gate = (inputs: Json, id: string): Json => {
  const g = RS.evaluate(inputs).gates.find((x: Json) => x.id === id);
  if (!g) throw new Error(`no gate ${id}`);
  return g;
};
const allFields = (inputs: Json): Json[] => inputs.decl.sections.flatMap((s: Json) => s.fields);
const aField = (inputs: Json, kind: string): Json => {
  const f = allFields(inputs).find((x) => String(x.source).startsWith(`${kind}:`));
  if (!f) throw new Error(`no field bound to ${kind}`);
  return f;
};

// The retired source form, built so this file itself holds no hit for the scan below.
const RETIRED = new RegExp(['line', 'age'].join(''), 'i');
export const scanRetired = (text: string): boolean => RETIRED.test(text);
const SEED_SIDE = [
  'scripts/surfaces/_schema/seed-report-v2.mjs',
  'scripts/surfaces/_schema/report-v2.decl.json',
  'scripts/surfaces/_schema/report-v2.decl.schema.json',
  'scripts/surfaces/_schema/report-presentation.json',
  'scripts/surfaces/_schema/report-v2.rulings.json',
  'scripts/analysis/report-schema.mjs',
];

describe('FE-18 / Rule 20: the closed binding set (binding-sources.json)', () => {
  it('names exactly the six sources: catalogue, content, user_input, ad_slot, external_embed, parcels (FE-18, FE-21, FE-23, FE-27)', () => {
    const bs = readJson(BINDING);
    expect(Object.keys(bs.sources).sort()).toEqual(['ad_slot', 'catalogue', 'content', 'external_embed', 'parcels', 'user_input']);
  });
  it('the committed declaration binds every field and card to a source in the set, and RS-1 is green', () => {
    expect(RS.importError).toBeUndefined();
    const inp = fresh();
    const kinds = Object.keys(readJson(BINDING).sources);
    for (const f of allFields(inp)) expect(kinds, f.path).toContain(String(f.source).split(':')[0]);
    for (const c of inp.decl.cards) expect(kinds, `card ${c.code}`).toContain(String(c.source).split(':')[0]);
    expect(gate(inp, 'RS-1').failing).toEqual([]);
  });
});

describe('Rule 20 RED fixture: an invented field fails (both directions)', () => {
  it('FAILs a field whose catalogue row does not exist (invented field)', () => {
    const inp = fresh();
    aField(inp, 'catalogue').source = 'catalogue:not_a_row';
    const g = gate(inp, 'RS-1');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('not_a_row');
  });
  it('FAILs a field with no source at all (a node with an invented field)', () => {
    const inp = fresh();
    const f = structuredClone(aField(inp, 'content'));
    f.path = 'scenarios.cards[].invented_field';
    f.name = 'invented_field';
    delete f.source;
    inp.decl.sections[0].fields.push(f);
    expect(gate(inp, 'RS-1').state).toBe('FAIL');
  });
  it('FAILs a retired source form (the old engine list)', () => {
    const inp = fresh();
    aField(inp, 'content').source = `${['line', 'age'].join('')}:main_gfa_sqm`;
    expect(gate(inp, 'RS-1').failing.join('\n')).toContain('closed set');
  });
  it('FAILs a pending source (a field with no source is refused, never pended)', () => {
    const inp = fresh();
    aField(inp, 'content').source = 'pending:spec_owed:N11';
    expect(gate(inp, 'RS-5').state).toBe('FAIL');
  });
  it('FAILs a sixth, unlisted source name', () => {
    const inp = fresh();
    aField(inp, 'content').source = 'sixth_source:anything';
    expect(gate(inp, 'RS-1').failing.join('\n')).toContain('sixth_source');
  });
  it('FAILs a content key that is not in the registry, and a parcels column that is not a migration column', () => {
    const inp = fresh();
    aField(inp, 'content').source = 'content:no_such_key';
    expect(gate(inp, 'RS-1').failing.join('\n')).toContain('no_such_key');
    const inp2 = fresh();
    aField(inp2, 'parcels').source = 'parcels:no_such_column';
    expect(gate(inp2, 'RS-1').failing.join('\n') + gate(inp2, 'RS-3').failing.join('\n')).toContain('no_such_column');
  });
  it('FAILs user_input, ad_slot and external_embed members until their contract file exists', () => {
    for (const kind of ['user_input', 'ad_slot', 'external_embed']) {
      const inp = fresh();
      aField(inp, 'content').source = `${kind}:some_id`;
      expect(gate(inp, 'RS-1').failing.join('\n'), kind).toContain(kind);
    }
  });
  it('FAILs a parcels path that is not on the S-001 consumer whitelist (RS-2)', () => {
    const inp = fresh();
    const f = aField(inp, 'parcels');
    f.path = 'parcel.secret.lot_size_sqm';
    f.name = 'lot_size_sqm';
    expect(gate(inp, 'RS-2').state).toBe('FAIL');
  });
  it('is GREEN on the unmutated copy (the other direction)', () => {
    const inp = fresh();
    for (const id of ['RS-1', 'RS-2', 'RS-3', 'RS-5']) expect(gate(inp, id).state, id).toBe('PASS');
  });
});

describe('MF-10 done-condition: zero retired-source (old engine list) references in the seed-side files', () => {
  it('the scan finds none in the committed seed, declaration, schema, registry, rulings and checker', () => {
    for (const rel of SEED_SIDE) expect(scanRetired(read(rel)), rel).toBe(false);
  });
  it('the scan itself fires on a mutated copy (RED direction)', () => {
    for (const rel of SEED_SIDE) expect(scanRetired(`${read(rel)}\nsource: ${['line', 'age'].join('')}:x`), rel).toBe(true);
  });
});
