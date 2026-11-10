// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (every MaxBLD page is descriptor + content + standard library components),
//            FE-03 (a planted bad descriptor exits 1), FE-13 (the gate this module extends); docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b,
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 3.2a (the non-REPORT counterpart), docs/specs/02-web-admin/128_surface_standard_policy.md rules 1, 4, 19, 20.
//
// MF-42 · McFrontend queue · lane G. The three generic arms of scripts/surfaces/surface-validate.mjs, in ONE place (R-27):
//   SV-DESC   the converted manifest (shape, scope totality over the descriptor walk) and every converted descriptor (the ONE validator,
//             no UNRESEARCHED, status generated, render.form against its contract schema);
//   SV-SCREEN per converted surface: one golden per state per declared target, covers resolve, every state covered, nothing stray, fingerprints fresh;
//   SV-SBIND  per converted surface: content keys exist and are used, columns on the whitelist, golden props carry no display text (only binding refs).
// What JSON Schema can refuse, screen-data.schema.json refuses (plan.min cut 7); this file keeps only the cross-file checks.
// queueProblems() is exported for the FE-31 lock and is NOT run by the gate: the gate reads only the tree it sits in (plan.min M-0).
// Pure over committed files. Read-only. No DB, no network. Every finding is one line `SV-<ARM> <subject>: <problem>`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GOLDEN_DIR, readJson, sha16 } from './report-checks.mjs';

const require_ = createRequire(import.meta.url);
const AjvModule = require_('ajv');
const Ajv = AjvModule.default ?? AjvModule;

const SCHEMA_DIR = 'scripts/surfaces/_schema';
export const MANIFEST = `${SCHEMA_DIR}/converted-surfaces.json`;
export const BINDINGS = `${SCHEMA_DIR}/bindings.json`;
export const DATA_SCHEMA = `${SCHEMA_DIR}/screen-data.schema.json`;
export const VALIDATOR = 'src/lib/surfaces/generated/validate-descriptor.mjs';
export const GOLDEN_ROOT = 'src/tests/fixtures/surfaces';
// The closed JSON Schema subset a render.form contract may use (P42-D1 a); arrays (items) bring library default strings, so they are out.
export const FORM_KEYWORDS = ['type', 'properties', 'required', 'enum', 'const', 'format', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern',
  'readOnly', 'additionalProperties', '$comment'];
export const FORM_FORMATS = ['date', 'date-time', 'email', 'uri', 'uuid'];
const OPTION_VALUE = /^[a-z0-9_]+$/;
// The binding standard (MF-40 plan delta 1, option C; FE-32): a contract path is <contract_id>.<seg>(.<seg>)*; a name segment is a wire key as sent
// (camelCase allowed, never mapped) and must be on the contract's field whitelist; an index segment (0 or a number without a leading zero) may
// only follow a name. The second segment
// `errors` is RESERVED: <contract_id>.errors.<class>.<field> names a detail field of one declared error class.
const CONTRACT_ID = /^[a-z0-9_]+$/;
const NAME_SEG = /^[A-Za-z][A-Za-z0-9_]*$/;
const INDEX_SEG = /^(0|[1-9][0-9]*)$/;
export const ERRORS_SEG = 'errors';
const whitelistOf = (d) => (Array.isArray(d?.inputs?.field_whitelist) ? d.inputs.field_whitelist : []);

const tryJson = (p) => { try { return readJson(p); } catch { return undefined; } };
const sorted = (xs) => [...xs].sort();

const ajvErrors = (validate) => (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
const shapes = new Map();
/** The compiled shape `name` (a definition of screen-data.schema.json) of the tree at `root`. */
export const shapeOf = (root, name) => {
  if (!shapes.has(root)) {
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(readJson(path.join(root, DATA_SCHEMA)), 'screen-data');
    shapes.set(root, ajv);
  }
  return shapes.get(root).getSchema(`screen-data#/definitions/${name}`);
};
/** `[]` when `doc` has the shape, else one `<path> <message>` per AJV error. */
export const shapeProblems = (root, name, doc) => { const v = shapeOf(root, name); return v(doc) ? [] : ajvErrors(v); };

const walkDescriptors = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '_schema' ? [] : walkDescriptors(p);
    return e.name.endsWith('.descriptor.json') ? [p] : [];
  });
};

/**
 * Everything the three arms read, once per root: the manifest, bindings.json, every descriptor (kind SURFACE in scope, by id) and the problems of
 * reading them. Data problems are findings (never a throw); a missing module or validator throws, and the gate prints that as the arm being unavailable.
 */
export async function loadContext(root) {
  const problems = [];
  const manifest = tryJson(path.join(root, MANIFEST));
  if (manifest === undefined) problems.push('converted-surfaces.json: missing or not JSON');
  else problems.push(...shapeProblems(root, 'manifest', manifest).map((p) => `converted-surfaces.json: ${p}`));
  const bindings = tryJson(path.join(root, BINDINGS));
  if (bindings === undefined) problems.push('bindings.json: missing or not JSON');
  else problems.push(...shapeProblems(root, 'bindings', bindings).map((p) => `bindings.json: ${p}`));
  const validator = await import(pathToFileURL(path.join(root, VALIDATOR)).href);
  const scopes = Array.isArray(manifest?.scope?.programme_scopes) ? manifest.scope.programme_scopes : [];
  const all = new Map(); // id -> {d, file} for every SURFACE descriptor; inScope filters it
  const contracts = new Map(); // id -> d for every CONTRACT descriptor (MF-37, FE-32: the golden-side `contract` ref resolves here)
  for (const file of walkDescriptors(path.join(root, 'scripts/surfaces')).sort()) {
    const d = tryJson(file);
    const rel = path.relative(root, file);
    if (d === undefined) { problems.push(`${rel}: not JSON`); continue; }
    if (d?.kind === 'SURFACE' && typeof d?.identity?.id === 'string') all.set(d.identity.id, { d, file: rel });
    if (d?.kind === 'CONTRACT' && typeof d?.identity?.id === 'string') contracts.set(d.identity.id, d);
  }
  const inScope = new Map([...all].filter(([, v]) => scopes.includes(v.d.programme?.scope)));
  return { root, manifest, bindings, validator, inScope, contracts, problems, ok: problems.length === 0 };
}

const listsOf = (m) => ({
  converted: m.converted, pending_conversion: m.pending_conversion.map((p) => p.id), parked: m.parked, report: m.report,
});

// ---- SV-DESC -------------------------------------------------------------------------------------------------------------------------------

const decodePointer = (ptr) => ptr.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
/** The object a render.form schema_ref points at, or a problem line. */
export const resolveSchemaRef = (root, ref) => {
  const [file, ptr = ''] = String(ref).split('#');
  const doc = tryJson(path.join(root, file));
  if (doc === undefined) return { problem: `schema_ref ${ref}: does not resolve` };
  let t = doc;
  for (const k of decodePointer(ptr)) t = t !== null && typeof t === 'object' ? t[k] : undefined;
  if (t === null || typeof t !== 'object' || typeof t.properties !== 'object' || t.properties === null) return { problem: `schema_ref ${ref}: does not resolve to an object with properties` };
  return { file, target: t };
};

const keywordProblems = (node, at) => {
  if (node === null || typeof node !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    if (!FORM_KEYWORDS.includes(k)) { out.push(`schema keyword not allowed: ${k} at ${at || '/'}`); continue; }
    if (k === 'additionalProperties' && v !== false) { out.push(`schema keyword not allowed: additionalProperties other than false at ${at || '/'}`); continue; }
    if (k === 'format' && !FORM_FORMATS.includes(v)) out.push(`schema format not allowed: ${v} at ${at || '/'}`);
    if (k === 'properties' && v && typeof v === 'object') for (const [p, s] of Object.entries(v)) out.push(...keywordProblems(s, `${at}/properties/${p}`));
  }
  return out;
};

/** The render.form checks of one descriptor against its contract schema and the widget/type table (P42-D1 a); options_from resolves in `contracts`. */
export const formProblems = (root, d, widgetTypes, contracts) => {
  const form = d.render?.form;
  if (form === undefined || form === null || typeof form !== 'object') return [];
  const r = resolveSchemaRef(root, form.schema_ref);
  if (r.problem) return [r.problem];
  const out = keywordProblems(r.target, '');
  const props = r.target.properties;
  const fields = Array.isArray(form.fields) ? form.fields : [];
  const named = fields.map((f) => f.field);
  for (const f of named) if (!(f in props)) out.push(`field ${f} is not a property`);
  for (const p of Object.keys(props)) if (!named.includes(p)) out.push(`property ${p} has no field`);
  for (const f of fields) {
    const p = props[f.field];
    if (p === null || typeof p !== 'object') { if (f.field in props) out.push(`property ${f.field} is not an object`); continue; }
    const allowed = widgetTypes?.[f.widget] ?? [];
    const types = [].concat(p.type ?? []).filter((t) => t !== 'null');
    if (!allowed.includes('*') && (types.length === 0 || types.some((t) => !allowed.includes(t)))) out.push(`field ${f.field}: widget ${f.widget} does not fit type ${types.join('|') || 'none'}`);
    if (f.options_from !== undefined && f.widget !== 'select') out.push(`field ${f.field}: options_from needs widget select`);
    if (f.widget === 'select') {
      const from = f.options_from;
      if (from !== undefined && Array.isArray(p.enum)) out.push(`field ${f.field}: select has both an enum and options_from`);
      else if (from !== undefined) out.push(...optionsFromProblems(f.field, from, contracts));
      else if (!Array.isArray(p.enum)) out.push(`field ${f.field}: select needs an enum or options_from`);
      else for (const v of p.enum) if (!OPTION_VALUE.test(String(v))) out.push(`field ${f.field}: option value ${v} is not [a-z0-9_]+`);
    }
  }
  return out;
};

/** options_from: items is a contract path; value and label are on that contract's field whitelist. */
const optionsFromProblems = (field, from, contracts) => {
  const out = contractRefProblems(from.items, `field ${field} options_from`, contracts);
  if (out.length > 0) return out;
  const wl = whitelistOf(contracts.get(String(from.items).split('.')[0]));
  for (const k of ['value', 'label']) if (!wl.includes(from[k])) out.push(`field ${field}: options_from ${k} ${from[k]} not on the contract field whitelist`);
  return out;
};

/**
 * The render.list checks of a converted web LIST with columns (binding standard): id_field on the whitelist; rows a contract path; an image column
 * has an alt_field on the whitelist and no sort_field; an enum column declares its values; each row action kind once.
 */
export const listProblems = (d, contracts) => {
  const list = d.render?.list;
  if (list === null || typeof list !== 'object' || !Array.isArray(list.columns) || !targetsOf(d).includes('web')) return [];
  const wl = whitelistOf(d);
  const out = [];
  if (list.id_field === undefined) out.push('render.list needs id_field');
  else if (!wl.includes(list.id_field)) out.push(`id_field ${list.id_field} not in inputs.field_whitelist`);
  if (list.rows !== undefined) out.push(...contractRefProblems(list.rows, 'render.list.rows', contracts));
  for (const c of list.columns) {
    if (c.display === 'image') {
      if (c.alt_field === undefined || !wl.includes(c.alt_field)) out.push(`column ${c.field}: an image column needs an alt_field in inputs.field_whitelist`);
      if (c.sort_field !== undefined) out.push(`column ${c.field}: an image column takes no sort_field`);
    }
    if (c.display === 'enum' && !Array.isArray(c.values)) out.push(`column ${c.field}: an enum column needs values`);
  }
  const kinds = (list.row_actions ?? []).map((a) => a.kind);
  for (const k of new Set(kinds.filter((x, i) => kinds.indexOf(x) !== i))) out.push(`row action ${k} declared twice`);
  return out;
};

/** SV-DESC: the manifest's shape and totality over the in-scope descriptors, then each converted descriptor. */
export function descArm(ctx) {
  const out = ctx.problems.map((p) => `SV-DESC ${p}`);
  const m = ctx.manifest;
  if (out.length > 0 || !m) return { findings: out, note: '' };
  const lists = listsOf(m);
  const where = new Map();
  for (const [name, ids] of Object.entries(lists)) for (const id of ids) where.set(id, [...(where.get(id) ?? []), name]);
  if (ctx.inScope.size !== m.scope.expected_count) out.push(`SV-DESC scope: ${ctx.inScope.size} in-scope SURFACE descriptors, expected ${m.scope.expected_count}`);
  for (const id of sorted(ctx.inScope.keys())) {
    const { d } = ctx.inScope.get(id);
    const ls = where.get(id) ?? [];
    if (ls.length === 0) out.push(`SV-DESC ${id}: in no list`);
    if (ls.length > 1) out.push(`SV-DESC ${id}: in ${ls.length} lists (${ls.join(', ')})`);
    const isReport = d.identity?.archetype === 'REPORT';
    if (isReport && ls.some((l) => l !== 'report')) out.push(`SV-DESC ${id}: REPORT outside report`);
    if (!isReport && ls.includes('report')) out.push(`SV-DESC ${id}: not a REPORT but in report`);
    if (d.status === 'generated' && !ls.includes('converted')) out.push(`SV-DESC ${id}: status generated but not in converted`);
  }
  for (const id of sorted(where.keys())) if (!ctx.inScope.has(id)) out.push(`SV-DESC ${id}: listed but no in-scope SURFACE descriptor`);
  for (const id of sorted(ctx.contracts.keys())) if (whitelistOf(ctx.contracts.get(id)).includes(ERRORS_SEG)) out.push(`SV-DESC ${id}: field_whitelist names the reserved segment errors`);
  for (const id of m.converted) {
    const e = ctx.inScope.get(id);
    if (!e) continue;
    const { d } = e;
    out.push(...ctx.validator.validateDescriptor(d).errors.map((x) => `SV-DESC ${id}: ${x}`));
    const n = ctx.validator.unresearchedCount(d);
    if (n > 0) out.push(`SV-DESC ${id}: ${n} UNRESEARCHED left`);
    if (d.status !== 'generated') out.push(`SV-DESC ${id}: status is ${d.status}, not generated`);
    out.push(...formProblems(ctx.root, d, ctx.bindings.widget_types, ctx.contracts).map((x) => `SV-DESC ${id}: ${x}`));
    out.push(...listProblems(d, ctx.contracts).map((x) => `SV-DESC ${id}: ${x}`));
  }
  const c = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
  return { findings: out, note: `S-desc ok (examined ${ctx.inScope.size} in scope: converted ${c.converted}, pending ${c.pending_conversion}, parked ${c.parked}, report ${c.report})` };
}

// ---- the per-surface inputs of SV-SCREEN and SV-SBIND ----------------------------------------------------------------------------------------

/** The converted surfaces the screen arms judge (only when the manifest and descriptors read clean). */
const convertedOf = (ctx) => (ctx.ok ? ctx.manifest.converted.filter((id) => ctx.inScope.has(id)) : []);
const waitsNote = (ctx, label) => (ctx.ok && ctx.manifest.converted.length === 0 ? `${label} WAITS ${ctx.manifest.waits}` : null);
export const contentPath = (file, id) => path.join(path.dirname(file), `${id}.content.json`);
/** The fingerprint inputs of one surface: its own descriptor, content file and form contract schema (never bindings.json). */
export const fingerprintFiles = (id, e) => {
  const files = [e.file, contentPath(e.file, id)];
  const ref = e.d.render?.form?.schema_ref;
  if (typeof ref === 'string') files.push(ref.split('#')[0]);
  return sorted(files);
};
export const targetsOf = (d) => (Array.isArray(d.identity?.platforms) ? d.identity.platforms : []);
const goldensOf = (ctx, id) => {
  const dir = path.join(ctx.root, GOLDEN_ROOT, id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).map((e) => e.name).sort().map((f) => ({ f, doc: f.endsWith('.json') ? tryJson(path.join(dir, f)) : undefined }));
};

// ---- SV-SCREEN ------------------------------------------------------------------------------------------------------------------------------

export function screenArm(ctx) {
  const waits = waitsNote(ctx, 'S-screen');
  const out = [];
  let count = 0;
  const ids = convertedOf(ctx);
  const groot = path.join(ctx.root, GOLDEN_ROOT);
  if (ctx.ok && fs.existsSync(groot)) {
    for (const e of fs.readdirSync(groot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() && (path.posix.join(GOLDEN_ROOT, e.name) === GOLDEN_DIR || ids.includes(e.name))) continue;
      out.push(`SV-SCREEN ${GOLDEN_ROOT}/${e.name}: not a converted surface's golden dir`);
    }
  }
  for (const id of ids) {
    const e = ctx.inScope.get(id);
    const states = Array.isArray(e.d.states) ? e.d.states : [];
    const targets = targetsOf(e.d);
    const names = states.map((s) => s.name);
    for (const n of new Set(names.filter((x, i) => names.indexOf(x) !== i))) out.push(`SV-SCREEN ${id}: state ${n} declared twice`);
    const checks = (Array.isArray(e.d.checks) ? e.d.checks : []).map((c) => c.id);
    const gs = goldensOf(ctx, id);
    const have = new Set(gs.map((g) => g.f));
    const expected = new Set(states.flatMap((s) => targets.map((t) => `${s.golden}.${t}.json`)));
    for (const s of states) {
      const mine = targets.map((t) => `${s.golden}.${t}.json`);
      if (mine.every((f) => !have.has(f))) { out.push(`SV-SCREEN ${id}: state ${s.name}: golden ${s.golden} names no file`); continue; }
      for (const f of mine) if (!have.has(f)) out.push(`SV-SCREEN ${id}/${f}: missing`);
    }
    const fpFiles = fingerprintFiles(id, e);
    const covered = new Set();
    for (const { f, doc } of gs) {
      if (!expected.has(f)) { out.push(`SV-SCREEN ${id}/${f}: not a declared state x target`); continue; }
      count += 1;
      if (doc === undefined) { out.push(`SV-SCREEN ${id}/${f}: unreadable or not JSON`); continue; }
      const shape = shapeProblems(ctx.root, 'golden', doc);
      if (shape.length > 0) { out.push(...shape.map((p) => `SV-SCREEN ${id}/${f}: ${p}`)); continue; }
      const target = f.split('.').at(-2);
      if (doc.surface !== id) out.push(`SV-SCREEN ${id}/${f}: surface field is ${doc.surface}`);
      if (doc.target !== target) out.push(`SV-SCREEN ${id}/${f}: target field is ${doc.target}`);
      if (!names.includes(doc.state)) out.push(`SV-SCREEN ${id}/${f}: state field ${doc.state} is not a state`);
      covered.add(doc.state);
      for (const c of doc.covers) {
        if (names.includes(c)) covered.add(c);
        else if (!checks.includes(c)) out.push(`SV-SCREEN ${id}/${f}: covers ${c} is not a state or check`);
      }
      const keys = sorted(Object.keys(doc.fingerprint.files));
      if (JSON.stringify(keys) !== JSON.stringify(fpFiles)) out.push(`SV-SCREEN ${id}/${f}: fingerprint files differ`);
      for (const p of fpFiles) {
        const abs = path.join(ctx.root, p);
        if (doc.fingerprint.files[p] !== undefined && (!fs.existsSync(abs) || doc.fingerprint.files[p] !== sha16(abs))) out.push(`SV-SCREEN ${id}/${f}: fingerprint stale: ${path.basename(p)}`);
      }
    }
    for (const n of names) if (!covered.has(n) && have.size > 0) out.push(`SV-SCREEN ${id}: state ${n} not covered`);
  }
  return { findings: out, note: waits ?? `S-screen ok (${ids.length} surfaces, ${count} goldens)` };
}

// ---- SV-SBIND -------------------------------------------------------------------------------------------------------------------------------

/** The content keys a descriptor itself uses: form labels, help, placeholders, submit, select option labels; column labels. */
export const usedKeys = (root, d) => {
  const keys = new Set();
  const form = d.render?.form;
  if (form && typeof form === 'object') {
    if (form.submit) keys.add(form.submit);
    const r = resolveSchemaRef(root, form.schema_ref);
    for (const f of form.fields ?? []) {
      for (const k of ['label', 'help', 'placeholder']) if (f[k]) keys.add(f[k]);
      const p = r.target?.properties?.[f.field];
      if (f.widget === 'select' && f.label && Array.isArray(p?.enum)) for (const v of p.enum) keys.add(`${f.label}.option.${v}`);
    }
  }
  const list = d.render?.list;
  if (list && typeof list === 'object') {
    for (const c of list.columns ?? []) {
      keys.add(c.label);
      const values = c.display === 'boolean' ? ['true', 'false'] : c.display === 'enum' && Array.isArray(c.values) ? c.values : [];
      for (const v of values) keys.add(`${c.label}.option.${v}`);
    }
    for (const a of list.row_actions ?? []) keys.add(a.label);
  }
  return keys;
};

/**
 * The golden-side rule (X2, FE-18): under a display key a value is a binding ref `{<kind>: <key>}` (kinds in bindings.json ref_kinds), a node, a list
 * of those, or true/false/null. A string is display text written into the golden; a number is a value that skipped a binding. Keys in
 * non_display_keys carry no display text and are not judged.
 */
/**
 * MF-37 (FE-32): a golden `{"contract": "<contract_id>.<field>"}` names a field of a declared CONTRACT descriptor's response projection
 * (inputs.field_whitelist); an unknown contract or field is a finding, and so is a walk that was given no contract set.
 * Binding standard (MF-40 plan delta 1, option C): the ref is a PATH `<contract_id>.<seg>(.<seg>)*` (the two-part form unchanged). A name segment is
 * a wire key as sent and must be on the whitelist (checked by name only: the whitelist is flat); an index may only follow a name. A second segment
 * `errors` is reserved: `<contract_id>.errors.<class>.<field>`, the class one of the contract's errors.classes[] and the field in its `fields`.
 */
export const contractRefProblems = (ref, at, contracts) => {
  const segs = typeof ref === 'string' ? ref.split('.') : [];
  const [id, ...rest] = segs;
  if (rest.length === 0 || !CONTRACT_ID.test(id) || !rest.every((s) => NAME_SEG.test(s) || INDEX_SEG.test(s))) return [`contract ref ${ref} is not <contract_id>.<field> at ${at}`];
  const d = contracts instanceof Map ? contracts.get(id) : undefined;
  if (!d) return [`unknown contract ${id} at ${at}`];
  if (rest[0] === ERRORS_SEG) {
    if (rest.length !== 3) return [`contract ref ${ref} is not <contract_id>.errors.<class>.<field> at ${at}`];
    const cls = (Array.isArray(d.errors?.classes) ? d.errors.classes : []).find((c) => c.class === rest[1]);
    if (!cls) return [`unknown error class ${rest[1]} of ${id} at ${at}`];
    return Array.isArray(cls.fields) && cls.fields.includes(rest[2]) ? [] : [`unknown error field ${ref} at ${at}`];
  }
  if (rest.some((s, i) => INDEX_SEG.test(s) && (i === 0 || INDEX_SEG.test(rest[i - 1])))) return [`contract ref ${ref}: an index must follow a name at ${at}`];
  const fields = whitelistOf(d);
  return rest.every((s) => INDEX_SEG.test(s) || fields.includes(s)) ? [] : [`unknown contract field ${ref} at ${at}`];
};
export const propsProblems = (value, at, ctx) => {
  const { kinds, nonDisplay, content, used } = ctx;
  if (typeof value === 'string') return [`raw string at ${at}`];
  if (typeof value === 'number') return [`non-string display value at ${at}`];
  if (value === null || typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => propsProblems(v, `${at}/${i}`, ctx));
  const keys = Object.keys(value);
  if (keys.length === 1 && kinds.includes(keys[0])) {
    const ref = value[keys[0]];
    if (keys[0] === 'content') {
      used.add(ref);
      return typeof ref === 'string' && Object.hasOwn(content, ref) ? [] : [`unknown content key ${ref} at ${at}`];
    }
    if (keys[0] === 'contract') return contractRefProblems(ref, at, ctx.contracts);
    return [];
  }
  if (keys.length === 1 && !nonDisplay.includes(keys[0]) && typeof value[keys[0]] === 'string') return [`unknown binding kind ${keys[0]} at ${at}`];
  return keys.filter((k) => !nonDisplay.includes(k) || (value[k] !== null && typeof value[k] === 'object')).flatMap((k) => propsProblems(value[k], `${at}/${k}`, ctx));
};

export function sbindArm(ctx) {
  const waits = waitsNote(ctx, 'S-sbind');
  const out = [];
  let strings = 0;
  const ids = convertedOf(ctx);
  for (const id of ids) {
    const e = ctx.inScope.get(id);
    const cfile = contentPath(e.file, id);
    const content = tryJson(path.join(ctx.root, cfile));
    if (content === undefined) { out.push(`SV-SBIND ${path.basename(cfile)}: missing or not JSON`); continue; }
    const shape = shapeProblems(ctx.root, 'content', content);
    if (shape.length > 0) { out.push(...shape.map((p) => `SV-SBIND ${path.basename(cfile)}: ${p}`)); continue; }
    strings += Object.keys(content).length;
    const used = usedKeys(ctx.root, e.d);
    for (const k of sorted(used)) if (!Object.hasOwn(content, k)) out.push(`SV-SBIND ${id}: content key missing: ${k}`);
    const whitelist = Array.isArray(e.d.inputs?.field_whitelist) ? e.d.inputs.field_whitelist : [];
    const list = e.d.render?.list;
    for (const c of (list && typeof list === 'object' ? list.columns ?? [] : [])) {
      if (!whitelist.includes(c.field)) out.push(`SV-SBIND ${id}: column ${c.field} not in inputs.field_whitelist`);
      if (c.sort_field !== undefined && !whitelist.includes(c.sort_field)) out.push(`SV-SBIND ${id}: sort_field ${c.sort_field} not in inputs.field_whitelist`);
    }
    const walk = { kinds: ctx.bindings.ref_kinds, nonDisplay: ctx.bindings.non_display_keys, content, used, contracts: ctx.contracts };
    for (const { f, doc } of goldensOf(ctx, id)) {
      if (!doc || typeof doc.props !== 'object') continue; // shape is SV-SCREEN's
      out.push(...propsProblems(doc.props, '/props', walk).map((p) => `SV-SBIND ${id}/${f}: ${p}`));
    }
    for (const k of sorted(Object.keys(content))) if (!used.has(k)) out.push(`SV-SBIND ${id}: orphan content key ${k}`);
  }
  return { findings: out, note: waits ?? `S-sbind ok (${ids.length} surfaces, ${strings} strings)` };
}

export const ARMS = [['S-desc', 'DESC', descArm], ['S-screen', 'SCREEN', screenArm], ['S-sbind', 'SBIND', sbindArm]];

// ---- the queue-state check (FE-31 lock C-1 only; never the gate, plan.min M-0) --------------------------------------------------------------

/** Every row the manifest names (waits and each pending row) must be an existing McFrontend queue heading that is not DONE. */
export function queueProblems(manifest, queueText) {
  if (typeof queueText !== 'string') return [`queue ${manifest?.queue}: missing`];
  const heads = new Map();
  for (const line of queueText.split('\n')) {
    const m = /^\*\*(MF-\d+)\s/.exec(line);
    if (m && !heads.has(m[1])) heads.set(m[1], /\bDONE\b/.test(line));
  }
  const rows = new Map();
  if (manifest.waits) rows.set(manifest.waits, ['waits']);
  for (const p of manifest.pending_conversion ?? []) rows.set(p.row, [...(rows.get(p.row) ?? []), p.id]);
  const out = [];
  for (const [row, who] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    if (!heads.has(row)) out.push(`queue ${row}: no heading (named by ${who.join(', ')})`);
    else if (heads.get(row)) out.push(`queue ${row}: heading is DONE (named by ${who.join(', ')})`);
  }
  return out;
}
