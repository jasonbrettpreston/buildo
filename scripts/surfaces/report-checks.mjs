// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md 3.x gate table rows S-golden and S-parity (127 4.3 and the 2026-11-09 notes),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3, 11a.7, 126:552 (R-27: one home),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-13 (the gate), FE-06 (the honest lock), FE-29 (the node contract file).
//
// MF-15 · McFrontend queue · lane G. The REPORT golden checks, in ONE place (operator MF-15 D-1 a). Imported by
// scripts/surfaces/surface-validate.mjs and by the landed locks report-honest and report-golden-parity (their assertions are unchanged).
// Pure over committed data files; no copy of any closed list: the closed sets are read at run time from report-tree.schema.json,
// report-presentation.json and binding-sources.json. Read-only. No DB, no network.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Module from 'ajv/dist/2020.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const SCHEMA_DIR = 'scripts/surfaces/_schema';
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GOLDEN_DIR = 'src/tests/fixtures/surfaces/report';
// The four targets are spelled by Spec 127 S-golden: the whole declaration.
export const TARGETS = ['mobile', 'web', 'admin', 'pdf'];
// The four fingerprint inputs of a tranche-1 golden (Spec 127 4.3 dated note 2026-11-09). A fifth is a one-line change here plus a re-stamp.
export const FP_FILES = [
  `${SCHEMA_DIR}/binding-sources.json`,
  `${SCHEMA_DIR}/report-presentation.json`,
  `${SCHEMA_DIR}/report-tree.schema.json`,
  `${SCHEMA_DIR}/report-v2.decl.json`,
];
// Tranche-1 constraint (MF-12 D-3 b, 2026-11-08): tranche-1 nodes bind only to catalogue or content. A named subset of the closed binding set, to widen by its own ruling.
export const TRANCHE1_KINDS = ['catalogue', 'content'];
// The three keys of report-presentation.json `disclosure_texts` that are the object's own metadata, not codes.
const DISCLOSURE_META = ['generated_from', 'note', 'importance_default'];

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const sha16 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
export const sha16Text = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

const kindsOf = (root) => Object.keys(readJson(path.join(root, SCHEMA_DIR, 'binding-sources.json')).sources);
// Source kinds are the keys of binding-sources.json `sources` (the closed binding set), read at run time, never copied.
export const SOURCE_KINDS = kindsOf(REPO);

// The closed binding set, then the tranche-1 constraint. `kinds` defaults to this repo's set; the gate passes its own root's.
export const sourceProblems = (kind, kinds = SOURCE_KINDS) => [
  ...(kinds.includes(kind) ? [] : [`source kind not in binding-sources.json: ${kind}`]),
  ...(TRANCHE1_KINDS.includes(kind) ? [] : [`source kind outside the tranche-1 constraint (D-3 b): ${kind}`]),
];

export const parityOk = (trees) => trees.every((t) => JSON.stringify(t) === JSON.stringify(trees[0]));

const contracts = new Map();
const contractOf = (root) => {
  if (!contracts.has(root)) {
    const schema = readJson(path.join(root, SCHEMA_DIR, 'report-tree.schema.json'));
    const pres = readJson(path.join(root, SCHEMA_DIR, 'report-presentation.json'));
    contracts.set(root, {
      validate: new Ajv2020({ allErrors: true, strict: true }).compile(schema),
      lifecycle: schema.properties.lifecycle.enum,
      reasons: Object.keys(pres.status_text),
      codes: Object.keys(pres.disclosure_texts).filter((k) => !DISCLOSURE_META.includes(k)),
    });
  }
  return contracts.get(root);
};
export const lifecycleStates = (root = REPO) => contractOf(root).lifecycle;

// The FE-06 honest-display checks: the node contract (the schema) plus what the schema cannot express (its `$comment`).
export const honestProblems = (tree, root = REPO) => {
  const c = contractOf(root);
  const out = [];
  if (!c.validate(tree)) out.push(...(c.validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`));
  const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
  const isLife = c.lifecycle.includes(tree?.lifecycle);
  if (isLife && nodes.length !== 1) out.push('a lifecycle tree carries exactly one message node');
  nodes.forEach((n, i) => {
    const s = n?.status;
    if (typeof s === 'string' && s.startsWith('not_evaluated:') && !c.reasons.includes(s)) out.push(`node ${i}: not_evaluated reason has no content text: ${s}`);
    (Array.isArray(n?.disclosures) ? n.disclosures : []).forEach((code) => {
      if (typeof code === 'string' && !c.codes.includes(code)) out.push(`node ${i}: disclosure code not in disclosure_texts: ${code}`);
    });
    if (s === 'none' && !isLife) out.push(`node ${i}: none outside a lifecycle tree`);
    if (isLife && s !== 'none') out.push(`node ${i}: lifecycle node must carry none`);
  });
  return out;
};

// ---- the gate's file arms. Each returns finding lines `SV-<ARM> <subject>: <problem>`; a missing or unparseable file is a finding, never a throw.
const load = (arm, root, rel, out) => {
  try {
    return readJson(path.join(root, rel));
  } catch (e) {
    out.push(`SV-${arm} ${path.basename(rel)}: ${e.code === 'ENOENT' ? 'missing' : 'unreadable or not JSON'}`);
    return undefined;
  }
};
export const manifestOf = (root = REPO) => {
  try { return readJson(path.join(root, GOLDEN_DIR, 'states.json')); } catch { return undefined; }
};
const statesOf = (m) => (Array.isArray(m?.states) ? m.states : []);
const fileName = (s, t) => `${s}.${t}.json`;

// Loads every present golden of the manifest, keyed `<state>.<target>`. An unreadable golden is reported once, by the GOLDEN arm; the other arms skip it.
const goldensOf = (root, m, arm, out) => {
  const g = new Map();
  for (const s of statesOf(m)) for (const t of TARGETS) {
    const f = path.join(GOLDEN_DIR, fileName(s, t));
    if (fs.existsSync(path.join(root, f))) { const j = load(arm, root, f, arm === 'GOLDEN' ? out : []); if (j !== undefined) g.set(`${s}.${t}`, j); }
  }
  return g;
};

export const goldenProblems = (root = REPO) => {
  const out = [];
  const m = manifestOf(root);
  if (m === undefined) return ['SV-GOLDEN states.json: missing or not JSON'];
  if (!Array.isArray(m.states) || m.states.length === 0) out.push('SV-GOLDEN states.json: states is not a non-empty list');
  if (JSON.stringify(m.targets) !== JSON.stringify(TARGETS)) out.push(`SV-GOLDEN states.json: targets are not ${TARGETS.join(',')}`);
  const want = new Set(['states.json']);
  for (const s of statesOf(m)) for (const t of TARGETS) {
    want.add(fileName(s, t));
    if (!fs.existsSync(path.join(root, GOLDEN_DIR, fileName(s, t)))) out.push(`SV-GOLDEN ${fileName(s, t)}: missing`);
  }
  for (const f of fs.readdirSync(path.join(root, GOLDEN_DIR)).sort()) if (!want.has(f)) out.push(`SV-GOLDEN ${f}: not in manifest`);
  const now = {};
  for (const p of FP_FILES) { try { now[p] = sha16(path.join(root, p)); } catch { out.push(`SV-GOLDEN ${path.basename(p)}: missing`); } }
  for (const [key, g] of goldensOf(root, m, 'GOLDEN', out)) {
    const name = `${key}.json`;
    const fp = g.fingerprint ?? {};
    if (fp.response_fixture !== sha16Text(g.response_fixture)) out.push(`SV-GOLDEN ${name}: fingerprint stale: fixture hash`);
    if (JSON.stringify(Object.keys(fp.files ?? {}).sort()) !== JSON.stringify([...FP_FILES].sort())) out.push(`SV-GOLDEN ${name}: fingerprint files differ`);
    for (const p of FP_FILES) if (fp.files?.[p] !== undefined && now[p] !== undefined && fp.files[p] !== now[p]) out.push(`SV-GOLDEN ${name}: fingerprint stale: ${path.basename(p)}`);
  }
  return out;
};

export const parityProblems = (root = REPO) => {
  const out = [];
  const m = manifestOf(root);
  const g = goldensOf(root, m, 'PARITY', out);
  for (const s of statesOf(m)) {
    const have = TARGETS.filter((t) => g.has(`${s}.${t}`));
    for (const field of ['rendered_tree', 'response_fixture']) {
      for (const t of have.slice(1)) if (!parityOk([g.get(`${s}.${have[0]}`)[field], g.get(`${s}.${t}`)[field]])) out.push(`SV-PARITY ${s}: ${field} differs: ${have[0]} vs ${t}`);
    }
    for (const t of have) {
      const j = g.get(`${s}.${t}`);
      if (j.target !== t) out.push(`SV-PARITY ${fileName(s, t)}: target field is ${j.target}`);
      if (j.state !== s) out.push(`SV-PARITY ${fileName(s, t)}: state field is ${j.state}`);
    }
  }
  return out;
};

export const bindProblems = (root = REPO) => {
  const out = [];
  const m = manifestOf(root);
  const decl = load('BIND', root, `${SCHEMA_DIR}/report-v2.decl.json`, out);
  const pres = load('BIND', root, `${SCHEMA_DIR}/report-presentation.json`, out);
  if (!decl || !pres) return out;
  const kinds = kindsOf(root);
  const decls = decl.sections.flatMap((x) => x.fields);
  for (const [key, g] of goldensOf(root, m, 'BIND', out)) {
    const name = `${key}.json`;
    const tree = g.rendered_tree ?? {};
    for (const n of Array.isArray(tree.nodes) ? tree.nodes : []) {
      const d = decls.find((f) => f.name === n.field);
      const at = `SV-BIND ${name}: node ${n.field}:`;
      if (!d) { out.push(`${at} field not in declaration`); continue; }
      if (!kinds.includes(d.source?.split(':')[0])) out.push(`${at} declared source kind not in binding-sources.json: ${d.source?.split(':')[0]}`);
      if (d.source?.split(':')[0] !== n.source) out.push(`${at} source ${n.source} is not the declared ${d.source?.split(':')[0]}`);
      sourceProblems(n.source, kinds).forEach((p) => out.push(`${at} ${p}`));
      const label = n.status === 'at_least' ? `${d.label}, at least` : d.label;
      if (n.label !== label) out.push(`${at} label is not the declared label`);
      if (n.field === 'status_text' && tree.lifecycle === undefined) {
        const key2 = String(n.status).startsWith('not_permitted:') ? 'not_permitted' : n.status;
        const text = String(pres.status_text?.[key2]).replace('{clause}', String(n.status).split(':')[1] ?? '');
        if (n.value !== text) out.push(`${at} status_text value is not the content text`);
      }
    }
  }
  return out;
};

export const statusProblems = (root = REPO) => {
  const out = [];
  const m = manifestOf(root);
  const life = lifecycleStates(root);
  for (const [key, g] of goldensOf(root, m, 'STATUS', out)) {
    const name = `${key}.json`;
    honestProblems(g.rendered_tree, root).forEach((p) => out.push(`SV-STATUS ${name}: ${p}`));
    const isLife = life.includes(g.state);
    if ('lifecycle' in (g.rendered_tree ?? {}) !== isLife) out.push(`SV-STATUS ${name}: lifecycle key ${isLife ? 'missing' : 'present'}`);
    else if (isLife && g.rendered_tree.lifecycle !== g.state) out.push(`SV-STATUS ${name}: lifecycle is not ${g.state}`);
  }
  return out;
};
