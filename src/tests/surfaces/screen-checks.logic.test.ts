// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-13 (the gate and its arms; dated note: MF-42 adds SV-DESC, SV-SCREEN,
//            SV-SBIND), FE-31 (descriptor valid, no UNRESEARCHED, no golden "none", the converted manifest both directions, one golden per state per
//            target, covers, every string from content, every value through a binding kind); plan.min sections 1 (cut 2: one case per finding line) and 3.
//
// MF-42 · McFrontend queue · lane G. The three generic arms of scripts/surfaces/screen-checks.mjs, called directly on an in-test fixture tree (four
// converted copies of live descriptors, screen-fixture.ts). Each arm has a clean case and one planted case per distinct finding line; a variant that
// prints the same line shares that case (plan.min cut 2 merge rule). Not an FE lock of its own: the FE-31 lock is surface-conformance.logic.test.ts.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadContext, descArm, screenArm, sbindArm } from '../../../scripts/surfaces/screen-checks.mjs';
import { buildFixture, contentFile, editDescriptor, editGolden, editManifest, FORM_SCHEMA, goldenPath, restamp, rj, wj, type Fixture } from './screen-fixture';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
const fresh = (): Fixture => { const fx = buildFixture('mf42-sc-'); roots.push(fx.root); return fx; };
const lines = async (fx: Fixture): Promise<string[]> => {
  const ctx = await loadContext(fx.root);
  return [descArm(ctx), screenArm(ctx), sbindArm(ctx)].flatMap((r) => r.findings);
};
const has = async (fx: Fixture, want: string): Promise<void> => { expect(await lines(fx)).toContain(want); };
const some = async (fx: Fixture, part: string): Promise<void> => { const l = await lines(fx); expect(l.some((x) => x.includes(part)), `${part} in\n${l.join('\n')}`).toBe(true); };
const contract = (fx: Fixture, fn: (s: Record<string, any>) => void): void => { // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON Schema
  const p = path.join(fx.root, FORM_SCHEMA); const s = rj(p); fn(s.definitions.request); wj(p, s); restamp(fx);
};

describe('clean: every arm is green on the four converted fixtures', () => {
  it('no finding, and each note counts what it examined', async () => {
    const fx = fresh();
    const ctx = await loadContext(fx.root);
    const [d, s, b] = [descArm(ctx), screenArm(ctx), sbindArm(ctx)];
    expect([...d.findings, ...s.findings, ...b.findings]).toEqual([]);
    expect(d.note).toBe('S-desc ok (examined 4 in scope: converted 4, pending 0, parked 0, report 0)');
    expect(s.note).toMatch(/^S-screen ok \(4 surfaces, \d+ goldens\)$/);
    expect(b.note).toMatch(/^S-sbind ok \(4 surfaces, \d+ strings\)$/);
  });
  it('an empty manifest with waits is a stated WAITS, never ok', async () => {
    const fx = fresh();
    editManifest(fx, (m) => { m.parked = m.converted; m.converted = []; m.waits = 'MF-37'; });
    editDescriptor(fx, 'FORM', (d) => { d.status = 'new'; });
    for (const a of ['LIST', 'SEARCH', 'STATIC'] as const) editDescriptor(fx, a, (d) => { d.status = 'new'; });
    const ctx = await loadContext(fx.root);
    expect([descArm(ctx).findings, screenArm(ctx).note, sbindArm(ctx).note]).toEqual([[], 'S-screen WAITS MF-37', 'S-sbind WAITS MF-37']);
  });
});

describe('SV-DESC: the descriptor (the ONE validator, cutover, render.form)', () => {
  it('an invalid widget is refused by the schema', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { d.render.form.fields[0].widget = 'rich_editor'; });
    await some(fx, 'SV-DESC admin_placements: /render/form/fields/0/widget ');
  });
  it('a generated FORM without render.form', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { delete d.render.form; });
    await has(fx, "SV-DESC admin_placements: /render must have required property 'form'");
  });
  it('a generated LIST (projection list) without columns', async () => {
    const fx = fresh(); editDescriptor(fx, 'LIST', (d) => { delete d.render.list.columns; });
    await has(fx, "SV-DESC admin_surface_registry: /render/list must have required property 'columns'");
  });
  it('a generated LIST whose render.list is the sentinel', async () => {
    const fx = fresh(); editDescriptor(fx, 'LIST', (d) => { d.render.list = 'UNRESEARCHED'; });
    await has(fx, 'SV-DESC admin_surface_registry: /render/list must be object');
  });
  it('an UNRESEARCHED left where the schema allows it (STATIC programme.phase)', async () => {
    const fx = fresh(); editDescriptor(fx, 'STATIC', (d) => { d.programme.phase = 'UNRESEARCHED'; });
    await has(fx, 'SV-DESC web_landing: 1 UNRESEARCHED left');
  });
  it('golden "none" on a generated descriptor', async () => {
    const fx = fresh(); editDescriptor(fx, 'SEARCH', (d) => { d.states[0].golden = 'none'; });
    await has(fx, 'SV-DESC mobile_parcel_search: /states/0/golden must NOT be valid');
  });
  it('a converted descriptor whose status is not generated', async () => {
    const fx = fresh(); editDescriptor(fx, 'SEARCH', (d) => { d.status = 'exists'; });
    await has(fx, 'SV-DESC mobile_parcel_search: status is exists, not generated');
  });
  it('a dangling schema_ref', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { d.render.form.schema_ref = 'scripts/surfaces/fixture/gone.json#/definitions/request'; });
    await has(fx, 'SV-DESC admin_placements: schema_ref scripts/surfaces/fixture/gone.json#/definitions/request: does not resolve');
  });
  it('a contract property with no field, and a field that is no property', async () => {
    const fx = fresh();
    contract(fx, (s) => { s.properties.extra = { type: 'string' }; });
    editDescriptor(fx, 'FORM', (d) => { d.render.form.fields[0].field = 'placement_keyz'; });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC admin_placements: property extra has no field');
    expect(l).toContain('SV-DESC admin_placements: field placement_keyz is not a property');
  });
  it('additionalProperties other than false (it brings the library add-key UI and its default strings)', async () => {
    const fx = fresh(); contract(fx, (s) => { s.additionalProperties = true; });
    await has(fx, 'SV-DESC admin_placements: schema keyword not allowed: additionalProperties other than false at /');
  });
  it('a contract property that is not an object', async () => {
    const fx = fresh(); contract(fx, (s) => { s.properties.max_slots = null; });
    await has(fx, 'SV-DESC admin_placements: property max_slots is not an object');
  });
  it('a keyword outside the closed subset (items), and a format outside it', async () => {
    const fx = fresh();
    contract(fx, (s) => { s.properties.placement_key.items = {}; s.properties.flight_start.format = 'time'; });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC admin_placements: schema keyword not allowed: items at /properties/placement_key');
    expect(l).toContain('SV-DESC admin_placements: schema format not allowed: time at /properties/flight_start');
  });
  it('a widget that does not fit the property type', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { d.render.form.fields[0].widget = 'checkbox'; });
    await has(fx, 'SV-DESC admin_placements: field placement_key: widget checkbox does not fit type string');
  });
  it('a select over no enum, and an option value outside [a-z0-9_]+', async () => {
    const fx = fresh();
    contract(fx, (s) => { s.properties.surface_archetype.enum = ['a.b']; });
    editDescriptor(fx, 'FORM', (d) => { d.render.form.fields[0].widget = 'select'; });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC admin_placements: field placement_key: select needs an enum or options_from');
    expect(l).toContain('SV-DESC admin_placements: field surface_archetype: option value a.b is not [a-z0-9_]+');
  });
});

// The binding standard (MF-40 plan delta 1, option C; section 8 folds 1, 5, 6): options_from selects, the generic LIST keys, the reserved errors segment.
const FX_CONTRACT = 'scripts/surfaces/fixture/contracts/contract_fx_list.descriptor.json';
const withContract = (fx: Fixture, whitelist = ['advertisers', 'advertiser_id', 'name', 'offers', 'offer_id']): void => {
  wj(path.join(fx.root, FX_CONTRACT), { kind: 'CONTRACT', identity: { id: 'contract_fx_list' }, inputs: { field_whitelist: whitelist } });
};
const pickFrom = (fx: Fixture, from: Record<string, string>, dropEnum = true): void => {
  if (dropEnum) contract(fx, (s) => { delete s.properties.surface_archetype.enum; });
  editDescriptor(fx, 'FORM', (d) => { d.render.form.fields[1].options_from = from; });
};
const OK_FROM = { items: 'contract_fx_list.advertisers', value: 'advertiser_id', label: 'name' };

describe('SV-DESC: the binding standard (options_from, the generic LIST, the reserved errors segment)', () => {
  it('clean: a select whose options come from a declared contract array (no enum)', async () => {
    const fx = fresh(); withContract(fx); pickFrom(fx, OK_FROM);
    expect((await lines(fx)).filter((x) => x.startsWith('SV-DESC'))).toEqual([]);
  });
  it('RED: options_from on an unknown contract, an index-first path, a value and a label off the whitelist', async () => {
    const a = fresh(); withContract(a); pickFrom(a, { ...OK_FROM, items: 'contract_no_such.advertisers' });
    await has(a, 'SV-DESC admin_placements: unknown contract contract_no_such at field surface_archetype options_from');
    const b = fresh(); withContract(b); pickFrom(b, { ...OK_FROM, items: 'contract_fx_list.0.advertisers' });
    await has(b, 'SV-DESC admin_placements: contract ref contract_fx_list.0.advertisers: an index must follow a name at field surface_archetype options_from');
    const c = fresh(); withContract(c); pickFrom(c, { ...OK_FROM, value: 'uuid', label: 'title' });
    const l = await lines(c);
    expect(l).toContain('SV-DESC admin_placements: field surface_archetype: options_from value uuid not on the contract field whitelist');
    expect(l).toContain('SV-DESC admin_placements: field surface_archetype: options_from label title not on the contract field whitelist');
  });
  it('RED: a select with both an enum and options_from; options_from on a widget that is not a select', async () => {
    const a = fresh(); withContract(a); pickFrom(a, OK_FROM, false);
    await has(a, 'SV-DESC admin_placements: field surface_archetype: select has both an enum and options_from');
    const b = fresh(); withContract(b);
    editDescriptor(b, 'FORM', (d) => { d.render.form.fields[0].options_from = OK_FROM; });
    await has(b, 'SV-DESC admin_placements: field placement_key: options_from needs widget select');
  });
  it('RED: a converted web LIST with columns and no id_field; an id_field off the whitelist', async () => {
    const a = fresh(); editDescriptor(a, 'LIST', (d) => { delete d.render.list.id_field; });
    await has(a, 'SV-DESC admin_surface_registry: render.list needs id_field');
    const b = fresh(); editDescriptor(b, 'LIST', (d) => { d.render.list.id_field = 'secret'; });
    await has(b, 'SV-DESC admin_surface_registry: id_field secret not in inputs.field_whitelist');
  });
  it('rows: clean on a declared contract array; RED on an unknown field', async () => {
    const a = fresh(); withContract(a); editDescriptor(a, 'LIST', (d) => { d.render.list.rows = 'contract_fx_list.offers'; });
    expect((await lines(a)).filter((x) => x.startsWith('SV-DESC'))).toEqual([]);
    const b = fresh(); withContract(b); editDescriptor(b, 'LIST', (d) => { d.render.list.rows = 'contract_fx_list.rowz'; });
    await has(b, 'SV-DESC admin_surface_registry: unknown contract field contract_fx_list.rowz at render.list.rows');
  });
  it('RED: an image column with no alt_field and with a sort_field; an enum column with no values; a row action kind twice', async () => {
    const fx = fresh();
    editDescriptor(fx, 'LIST', (d) => {
      d.render.list.columns[0].display = 'image';
      delete d.render.list.columns[1].values;
      d.render.list.row_actions = [{ kind: 'edit', label: 'admin_surface_registry.col.id' }, { kind: 'edit', label: 'admin_surface_registry.col.id' }];
    });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC admin_surface_registry: column id: an image column needs an alt_field in inputs.field_whitelist');
    expect(l).toContain('SV-DESC admin_surface_registry: column id: an image column takes no sort_field');
    expect(l).toContain('SV-DESC admin_surface_registry: column status: an enum column needs values');
    expect(l).toContain('SV-DESC admin_surface_registry: row action edit declared twice');
  });
  it('RED: a CONTRACT whose field whitelist names the reserved segment errors', async () => {
    const fx = fresh(); withContract(fx, ['errors', 'name']);
    await has(fx, 'SV-DESC contract_fx_list: field_whitelist names the reserved segment errors');
  });
  it('SV-SBIND: an enum column\'s option keys and a row action label are used content keys', async () => {
    const fx = fresh();
    const p = contentFile(fx, 'LIST'); const c = rj(p); delete c['admin_surface_registry.col.status.option.new']; wj(p, c); restamp(fx);
    await has(fx, 'SV-SBIND admin_surface_registry: content key missing: admin_surface_registry.col.status.option.new');
  });
});

describe('SV-DESC: the manifest (schema shape, then totality over the descriptor walk)', () => {
  it('a missing manifest', async () => {
    const fx = fresh(); fs.rmSync(path.join(fx.root, 'scripts/surfaces/_schema/converted-surfaces.json'));
    await has(fx, 'SV-DESC converted-surfaces.json: missing or not JSON');
  });
  it('an empty converted list without waits', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.parked = m.converted; m.converted = []; });
    await has(fx, "SV-DESC converted-surfaces.json: / must have required property 'waits'");
  });
  it('waits that names no row id', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.parked = m.converted; m.converted = []; m.waits = 'soon'; });
    await has(fx, 'SV-DESC converted-surfaces.json: /waits must match pattern "^MF-\\d+$"');
  });
  it('waits beside a non-empty converted list', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.waits = 'MF-37'; });
    await has(fx, 'SV-DESC converted-surfaces.json: / must NOT be valid');
  });
  it('a duplicate id inside converted (schema uniqueItems)', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.converted.push(m.converted[0]); });
    await some(fx, 'SV-DESC converted-surfaces.json: /converted must NOT have duplicate items');
  });
  it('expected_count off by one', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.scope.expected_count = 5; });
    await has(fx, 'SV-DESC scope: 4 in-scope SURFACE descriptors, expected 5');
  });
  it('an in-scope id in no list (and, generated, not in converted)', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.converted = m.converted.filter((x: string) => x !== 'web_landing'); });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC web_landing: in no list');
    expect(l).toContain('SV-DESC web_landing: status generated but not in converted');
  });
  it('one id in two lists (pending_conversion and parked: cross-list exclusivity is hand code, MIN-5)', async () => {
    const fx = fresh();
    editManifest(fx, (m) => { m.converted = m.converted.filter((x: string) => x !== 'web_landing'); m.parked = ['web_landing']; m.pending_conversion = [{ id: 'web_landing', row: 'MF-46' }]; });
    editDescriptor(fx, 'STATIC', (d) => { d.status = 'exists'; });
    await has(fx, 'SV-DESC web_landing: in 2 lists (pending_conversion, parked)');
  });
  it('a manifest id with no descriptor', async () => {
    const fx = fresh(); editManifest(fx, (m) => { m.parked = ['ghost_surface']; });
    await has(fx, 'SV-DESC ghost_surface: listed but no in-scope SURFACE descriptor');
  });
  it('a REPORT outside report, and a non-REPORT inside it', async () => {
    const fx = fresh();
    editDescriptor(fx, 'STATIC', (d) => { d.identity.archetype = 'REPORT'; });
    editManifest(fx, (m) => { m.converted = m.converted.filter((x: string) => x !== 'mobile_parcel_search'); m.report = ['mobile_parcel_search']; });
    editDescriptor(fx, 'SEARCH', (d) => { d.status = 'exists'; });
    const l = await lines(fx);
    expect(l).toContain('SV-DESC web_landing: REPORT outside report');
    expect(l).toContain('SV-DESC mobile_parcel_search: not a REPORT but in report');
  });
});

describe('SV-SCREEN: one golden per state per declared target, covers, nothing stray, fingerprints', () => {
  it('a declared target with no golden', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { d.identity.platforms = ['web', 'mobile']; });
    await has(fx, 'SV-SCREEN admin_placements/loading.mobile.json: missing');
  });
  it('states[].golden naming no file', async () => {
    const fx = fresh(); editDescriptor(fx, 'STATIC', (d) => { d.states[0].golden = 'gone'; });
    await has(fx, 'SV-SCREEN web_landing: state static: golden gone names no file');
  });
  it('a stray file, and a golden for an undeclared target, print the same line', async () => {
    const fx = fresh();
    fs.writeFileSync(goldenPath(fx, 'STATIC', 'notes.json'), '{}\n');
    fs.copyFileSync(goldenPath(fx, 'STATIC', 'static.web.json'), goldenPath(fx, 'STATIC', 'static.pdf.json'));
    const l = await lines(fx);
    expect(l).toContain('SV-SCREEN web_landing/notes.json: not a declared state x target');
    expect(l).toContain('SV-SCREEN web_landing/static.pdf.json: not a declared state x target');
  });
  it('a nested directory, a non-JSON file and a .json.bak copy in a surface dir are strays too', async () => {
    const fx = fresh();
    fs.mkdirSync(goldenPath(fx, 'STATIC', 'old'));
    fs.copyFileSync(goldenPath(fx, 'STATIC', 'static.web.json'), path.join(goldenPath(fx, 'STATIC', 'old'), 'static.web.json'));
    fs.writeFileSync(goldenPath(fx, 'STATIC', 'raw.txt'), 'x\n');
    fs.copyFileSync(goldenPath(fx, 'STATIC', 'static.web.json'), goldenPath(fx, 'STATIC', 'static.web.json.bak'));
    const l = await lines(fx);
    for (const f of ['old', 'raw.txt', 'static.web.json.bak']) expect(l).toContain(`SV-SCREEN web_landing/${f}: not a declared state x target`);
  });
  it('a golden dir for a surface that is not converted (an orphan, or one left behind)', async () => {
    const fx = fresh(); fs.mkdirSync(path.join(fx.root, 'src/tests/fixtures/surfaces/ghost'));
    await has(fx, "SV-SCREEN src/tests/fixtures/surfaces/ghost: not a converted surface's golden dir");
  });
  it('a state name declared twice', async () => {
    const fx = fresh(); editDescriptor(fx, 'FORM', (d) => { d.states.push({ ...d.states[0] }); });
    await has(fx, 'SV-SCREEN admin_placements: state loading declared twice');
  });
  it('a dangling covers entry', async () => {
    const fx = fresh(); editGolden(fx, 'FORM', 'hit.web.json', (g) => { g.covers.push('nowhere'); });
    await has(fx, 'SV-SCREEN admin_placements/hit.web.json: covers nowhere is not a state or check');
  });
  it('an uncovered state', async () => {
    const fx = fresh(); editGolden(fx, 'FORM', 'loading.web.json', (g) => { g.state = 'hit'; g.covers = ['hit']; });
    await has(fx, 'SV-SCREEN admin_placements: state loading not covered');
  });
  it('a target field that names another target', async () => {
    const fx = fresh(); editGolden(fx, 'FORM', 'hit.web.json', (g) => { g.target = 'mobile'; });
    await has(fx, 'SV-SCREEN admin_placements/hit.web.json: target field is mobile');
  });
  it('a golden of the wrong shape', async () => {
    const fx = fresh(); editGolden(fx, 'FORM', 'hit.web.json', (g) => { g.extra = 1; });
    await has(fx, 'SV-SCREEN admin_placements/hit.web.json: / must NOT have additional properties');
  });
  it('a stale fingerprint (the content file changed, goldens not re-stamped)', async () => {
    const fx = fresh();
    const p = contentFile(fx, 'FORM'); const c = rj(p); c['admin_placements.submit'] = 'Save now'; wj(p, c);
    await has(fx, 'SV-SCREEN admin_placements/hit.web.json: fingerprint stale: admin_placements.content.json');
  });
  it('a fingerprint over the wrong file set', async () => {
    const fx = fresh(); editGolden(fx, 'FORM', 'hit.web.json', (g) => { delete g.fingerprint.files[FORM_SCHEMA]; });
    await has(fx, 'SV-SCREEN admin_placements/hit.web.json: fingerprint files differ');
  });
});

describe('SV-SBIND: content keys, columns, and no display text in goldens', () => {
  it('a label key with no content', async () => {
    const fx = fresh();
    const p = contentFile(fx, 'FORM'); const c = rj(p); delete c['admin_placements.help.max_slots']; wj(p, c); restamp(fx);
    await has(fx, 'SV-SBIND admin_placements: content key missing: admin_placements.help.max_slots');
  });
  it('an empty content value is refused by the schema', async () => {
    const fx = fresh();
    const p = contentFile(fx, 'FORM'); const c = rj(p); c['admin_placements.submit'] = ''; wj(p, c); restamp(fx);
    await has(fx, 'SV-SBIND admin_placements.content.json: /admin_placements.submit must NOT have fewer than 1 characters');
  });
  it('an orphan content key', async () => {
    const fx = fresh();
    const p = contentFile(fx, 'SEARCH'); const c = rj(p); c['mobile_parcel_search.unused'] = 'Unused'; wj(p, c); restamp(fx);
    await has(fx, 'SV-SBIND mobile_parcel_search: orphan content key mobile_parcel_search.unused');
  });
  it('a column (and a sort field) off the whitelist', async () => {
    const fx = fresh(); editDescriptor(fx, 'LIST', (d) => { d.render.list.columns[0].field = 'secret'; d.render.list.columns[0].sort_field = 'secret'; });
    const l = await lines(fx);
    expect(l).toContain('SV-SBIND admin_surface_registry: column secret not in inputs.field_whitelist');
    expect(l).toContain('SV-SBIND admin_surface_registry: sort_field secret not in inputs.field_whitelist');
  });
  it('display text written into a golden (a child, and a library default string such as noRecordsText)', async () => {
    const fx = fresh();
    editGolden(fx, 'LIST', 'empty.web.json', (g) => { g.props.children[0].children = ['Save']; g.props.props.noRecordsText = 'No records'; });
    const l = await lines(fx);
    expect(l).toContain('SV-SBIND admin_surface_registry/empty.web.json: raw string at /props/children/0/children/0');
    expect(l).toContain('SV-SBIND admin_surface_registry/empty.web.json: raw string at /props/props/noRecordsText');
  });
  it('display text hidden in a subtree under a non-display key (icon, value) is still found', async () => {
    const fx = fresh(); editGolden(fx, 'STATIC', 'static.web.json', (g) => { g.props.props = { icon: { component: 'Text', children: ['Raw hidden text'] }, value: ['Hidden'] }; });
    const l = await lines(fx);
    expect(l).toContain('SV-SBIND web_landing/static.web.json: raw string at /props/props/icon/children/0');
    expect(l).toContain('SV-SBIND web_landing/static.web.json: raw string at /props/props/value/0');
  });
  it('a content ref to an unknown key', async () => {
    const fx = fresh(); editGolden(fx, 'STATIC', 'static.web.json', (g) => { g.props.children[0].children = [{ content: 'web_landing.nope' }]; });
    await has(fx, 'SV-SBIND web_landing/static.web.json: unknown content key web_landing.nope at /props/children/0/children/0');
  });
  it('a ref of a kind not in ref_kinds', async () => {
    const fx = fresh(); editGolden(fx, 'STATIC', 'static.web.json', (g) => { g.props.children[0].children = [{ catalogue: 'x' }]; });
    // MF-35 (dated 2026-11-10): derived joined ref_kinds (P35-D14 a); the plant uses catalogue, still not a ref kind.
    await has(fx, 'SV-SBIND web_landing/static.web.json: unknown binding kind catalogue at /props/children/0/children/0');
  });
  it('a non-string value under a display key (MIN-2)', async () => {
    const fx = fresh(); editGolden(fx, 'STATIC', 'static.web.json', (g) => { g.props.children[0].children = 5; });
    await has(fx, 'SV-SBIND web_landing/static.web.json: non-string display value at /props/children/0/children');
  });
  it('control: a string under a non-display key (variant) and a boolean are not display text', async () => {
    const fx = fresh(); editGolden(fx, 'STATIC', 'static.web.json', (g) => { g.props.props = { variant: 'hero', disabled: false }; });
    expect(await lines(fx)).toEqual([]);
  });
});
