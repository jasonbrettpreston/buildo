// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-03 (planted bad descriptor: exit 1, clean: exit 0) and FE-31 (the
//            converted-surface checks); plan.min cut 1 (fixtures are built in the test, nothing committed under fixtures/surfaces/conformance/).
//
// MF-42 · McFrontend queue · lane G. The in-test fixture helper shared by surface-validate.infra.test.ts (FE-03) and screen-checks.logic.test.ts.
// It copies the four REAL descriptors (FORM admin_placements, LIST admin_surface_registry, SEARCH mobile_parcel_search, STATIC web_landing) into a temp
// tree, converts each (status generated, golden = the state name, owns no component), answers its measured UNRESEARCHED fields with concrete values,
// adds render.form / render.list.columns, and synthesizes the FORM contract schema, one content file and one golden per state per target, the manifest
// and the fingerprints. Every patched path must already exist in the live descriptor and the result must be valid with 0 sentinels, so an edit to
// one of the four live descriptors breaks this helper LOUDLY in the editing commit (the coupling plan.min names), never silently.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped descriptor JSON
export const REPO = process.cwd();
export const SCHEMA = 'scripts/surfaces/_schema';
export const ARCHETYPES = ['FORM', 'LIST', 'SEARCH', 'STATIC'] as const;
export type Arch = (typeof ARCHETYPES)[number];
export const SOURCES: Record<Arch, string> = {
  FORM: 'scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.descriptor.json',
  LIST: 'scripts/surfaces/parcel_admin/F09/surfaces/admin_surface_registry.descriptor.json',
  SEARCH: 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json',
  STATIC: 'scripts/surfaces/parcel_product/F06/surfaces/web_landing.descriptor.json',
};
export const FORM_SCHEMA = 'scripts/surfaces/fixture/placements.request.schema.json';
const FORM_REF = `${FORM_SCHEMA}#/definitions/request`;

export const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
export const wj = (p: string, j: unknown): void => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`); };
export const sha16 = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

// Set `value` at `ptr` ('/a/b'); the parent and the key must already exist (a patch that misses is an error, never a silent add).
const patch = (d: Json, ptr: string, value: unknown, add = false): void => {
  const keys = ptr.split('/').slice(1);
  const last = keys.pop() as string;
  let t = d;
  for (const k of keys) { if (t[k] === undefined) throw new Error(`fixture patch: ${ptr} missing in the live descriptor`); t = t[k]; }
  if (!add && !(last in t)) throw new Error(`fixture patch: ${ptr} missing in the live descriptor`);
  t[last] = value;
};

// The measured patches (plan.min cut 1, MIN-6: concrete values, never sentinels).
const PATCHES: Record<Arch, Array<[string, unknown]>> = {
  FORM: [['/guards/rls_class/answer', 'A'], ['/programme/phase', 'B2']],
  LIST: [['/render/list', { item_archetype: 'row', pagination: 'offset', recycling: 'none' }]],
  SEARCH: [],
  STATIC: [['/identity/spec', 'docs/specs/02-web-admin/126_maxbld_surface_standard.md'], ['/a11y/touch_target_min_px', 44], ['/programme/phase', 'B2']],
};

// The FORM contract: a closed request object whose properties cover each widget kind the closed subset allows.
export const FORM_CONTRACT = {
  definitions: {
    request: {
      type: 'object', additionalProperties: false, required: ['placement_key', 'surface_archetype', 'max_slots'],
      properties: {
        placement_key: { type: 'string', minLength: 1 },
        surface_archetype: { type: 'string', enum: ['slot', 'feed'] },
        max_slots: { type: 'integer', minimum: 1 },
        disclosure_required: { type: 'boolean' },
        flight_start: { type: 'string', format: 'date' },
      },
    },
  },
};
const FORM_FIELDS = [
  { field: 'placement_key', widget: 'text', label: 'admin_placements.field.placement_key' },
  { field: 'surface_archetype', widget: 'select', label: 'admin_placements.field.surface_archetype' },
  { field: 'max_slots', widget: 'number', label: 'admin_placements.field.max_slots', help: 'admin_placements.help.max_slots' },
  { field: 'disclosure_required', widget: 'checkbox', label: 'admin_placements.field.disclosure_required' },
  { field: 'flight_start', widget: 'date', label: 'admin_placements.field.flight_start' },
];

export const LIST_STATUS = ['new', 'generated'];

export interface Fixture { root: string; ids: Record<Arch, string>; files: Record<Arch, string> }

/** A converted copy of one live descriptor (validity and sentinels are asserted by the callers through the ONE validator). */
export const convert = (arch: Arch): Json => {
  const d = rj(path.join(REPO, SOURCES[arch]));
  d.status = 'generated';
  d.identity.owns.components = [];
  for (const [ptr, v] of PATCHES[arch]) patch(d, ptr, v);
  for (const s of d.states) s.golden = s.name;
  if (arch === 'FORM') patch(d, '/render/form', { schema_ref: FORM_REF, fields: structuredClone(FORM_FIELDS), submit: 'admin_placements.submit' }, true);
  // Binding standard (MF-40 plan delta 1 section 8 fold 5): a converted web LIST with columns names its id_field; an enum column declares its values.
  if (arch === 'LIST') {
    d.render.list.columns = [{ field: 'id', label: 'admin_surface_registry.col.id', display: 'text', sort_field: 'id' }, { field: 'status', label: 'admin_surface_registry.col.status', display: 'enum', values: LIST_STATUS }];
    d.render.list.id_field = 'id';
  }
  return d;
};

/** The content keys a converted fixture uses (its descriptor's keys, plus one title the goldens bind). */
const contentOf = (arch: Arch, id: string): Record<string, string> => {
  const keys = [`${id}.title`];
  if (arch === 'FORM') keys.push(...FORM_FIELDS.flatMap((f) => [f.label, ...(f.help ? [f.help] : [])]), 'admin_placements.submit', 'admin_placements.field.surface_archetype.option.slot', 'admin_placements.field.surface_archetype.option.feed');
  if (arch === 'LIST') keys.push('admin_surface_registry.col.id', 'admin_surface_registry.col.status', ...LIST_STATUS.map((v) => `admin_surface_registry.col.status.option.${v}`));
  return Object.fromEntries(keys.map((k) => [k, `Text for ${k}`]));
};

/** The goldens of one surface: one per state per declared target, binding every content key by ref (no display text). */
const goldensOf = (d: Json, content: Record<string, string>): Array<[string, Json]> => d.states.flatMap((s: Json) => d.identity.platforms.map((t: string) => [
  `${s.golden}.${t}.json`,
  { surface: d.identity.id, state: s.name, target: t, covers: [s.name], props: { component: 'Stack', props: { variant: 'page' }, children: Object.keys(content).map((k) => ({ component: 'Text', children: [{ content: k }] })) }, fingerprint: { files: {} } },
]));

/** Re-stamp every golden's fingerprint of `root` (the per-surface inputs: descriptor, content, form schema). */
export const restamp = (fx: Fixture): void => {
  for (const arch of ARCHETYPES) {
    const id = fx.ids[arch];
    const dfile = fx.files[arch];
    const inputs = [dfile, path.join(path.dirname(dfile), `${id}.content.json`)];
    if (arch === 'FORM') inputs.push(FORM_SCHEMA);
    const files = Object.fromEntries(inputs.sort().map((p) => [p, sha16(path.join(fx.root, p))]));
    const dir = path.join(fx.root, 'src/tests/fixtures/surfaces', id);
    for (const f of fs.readdirSync(dir)) { const g = rj(path.join(dir, f)); g.fingerprint.files = files; wj(path.join(dir, f), g); }
  }
};

/** A temp tree holding the screen-checks inputs for the four converted fixtures (and only them), green as built. */
export const buildFixture = (prefix = 'mf42-'): Fixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const f of ['screen-data.schema.json', 'bindings.json', 'surface.schema.json']) fs.cpSync(path.join(REPO, SCHEMA, f), path.join(root, SCHEMA, f));
  fs.cpSync(path.join(REPO, 'src/lib/surfaces/generated'), path.join(root, 'src/lib/surfaces/generated'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'));
  wj(path.join(root, FORM_SCHEMA), FORM_CONTRACT);
  const ids = {} as Record<Arch, string>;
  const files = {} as Record<Arch, string>;
  for (const arch of ARCHETYPES) {
    const d = convert(arch);
    const id = d.identity.id as string;
    ids[arch] = id;
    files[arch] = `scripts/surfaces/fixture/${arch.toLowerCase()}/surfaces/${id}.descriptor.json`;
    wj(path.join(root, files[arch]), d);
    const content = contentOf(arch, id);
    wj(path.join(root, path.dirname(files[arch]), `${id}.content.json`), content);
    for (const [f, g] of goldensOf(d, content)) wj(path.join(root, 'src/tests/fixtures/surfaces', id, f), g);
  }
  const scopes = [...new Set(ARCHETYPES.map((a) => rj(path.join(root, files[a])).programme.scope))].sort();
  wj(path.join(root, SCHEMA, 'converted-surfaces.json'), {
    scope: { programme_scopes: scopes, expected_count: ARCHETYPES.length },
    converted: ARCHETYPES.map((a) => ids[a]), pending_conversion: [], parked: [], report: [], queue: '.cursor/MCFRONTEND-QUEUE.md',
  });
  const fx = { root, ids, files };
  restamp(fx);
  return fx;
};

/** Edit one fixture descriptor in place (and re-stamp, so only the planted defect is judged unless `stamp` is false). */
export const editDescriptor = (fx: Fixture, arch: Arch, fn: (d: Json) => void, stamp = true): void => {
  const p = path.join(fx.root, fx.files[arch]);
  const d = rj(p); fn(d); wj(p, d);
  if (stamp) restamp(fx);
};
export const goldenPath = (fx: Fixture, arch: Arch, file: string): string => path.join(fx.root, 'src/tests/fixtures/surfaces', fx.ids[arch], file);
export const editGolden = (fx: Fixture, arch: Arch, file: string, fn: (g: Json) => void): void => { const p = goldenPath(fx, arch, file); const g = rj(p); fn(g); wj(p, g); };
export const contentFile = (fx: Fixture, arch: Arch): string => path.join(fx.root, path.dirname(fx.files[arch]), `${fx.ids[arch]}.content.json`);
export const editManifest = (fx: Fixture, fn: (m: Json) => void): void => { const p = path.join(fx.root, SCHEMA, 'converted-surfaces.json'); const m = rj(p); fn(m); wj(p, m); };
