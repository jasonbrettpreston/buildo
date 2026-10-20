// SPEC LINK: R-RS (operator CHAT-4, 2026-10-20: "A product report surface has one field declaration; every field names
//            exactly one source; a generator --check gates names, types, presentation and pending states; its outputs are
//            generated, never hand-edited" — scratchpad/chat-decisions/2026-10-20-batch-a.json; register row: lane layer2-spec),
//            docs/specs/02-web-admin/128_surface_standard_policy.md R-21 (one descriptor set, three renderers: the
//            prototype, the API and the app read ONE declaration), R-27 (one home; every table derived from it is
//            generated), R-17 + R-34 (a SLOT declares a FAIL, blocking disclosure); docs/specs/01-pipeline/
//            78_optimal_lot_configuration.md P5.12 (closed disclosure codes, parsed like maxbld-trace-lib.mjs
//            disclosureCodes) and §6.6 (display rules); docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2
//            (the consumer whitelist); docs/reference/maxbld-field-lineage.json (names + types of every scenario field).
//
// MaxBLD LOT REPORT v2 SCHEMA GENERATOR. Input: scripts/surfaces/_schema/report-v2.decl.json (sections → fields, each
// with exactly one source: lineage:<field> · consumer:<payload path> · parcels:<column> · presentation:<key> ·
// pending:<reason>), report-presentation.json and report-v2.rulings.json. It checks the declared field names against
// their sources so the Stitch prototype, the API and the app cannot drift, and renders:
//   docs/reference/maxbld-report-v2-schema.md      the human schema page
//   docs/reference/maxbld-report-v2.schema.json    JSON Schema 2020-12 for `scenarios` + `offers` (+ P5.12 templates)
//   docs/reference/maxbld-report-v2.types.ts       TypeScript types for `scenarios` + `offers`
//   docs/reference/maxbld-report-v2.sample.json    sample payloads with real P5.12 disclosure text
//   docs/reference/report-v2-lineage-queue.json    lineage rows the report needs and lineage lacks (for the by-law fix lane)
//
//   node scripts/analysis/report-schema.mjs --write   render the outputs (gates are reported, never block a write)
//   node scripts/analysis/report-schema.mjs --check   exit 1 on output drift or any gate FAIL; 2 = usage / structural
//
// Gates (REVIEW §6.2): RS-0 declaration shape · RS-1 lineage names + types · RS-2 consumer whitelist · RS-3 parcels
// columns · RS-4 presentation both ways · RS-5 pending (WARN; FAIL once the ruling is decided or the source exists) ·
// RS-6 disclosure codes ⊆ P5.12 · RS-7 §6.6 + decided lot-form rules hold in the samples · RS-8 sponsored slots ·
// RS-9 every lineage field declared or listed not_in_report · RS-11 every decided ruling's pinned registry values hold. Deterministic; no DB, no network, executes no repo code.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrationColumns } from './bylaw/maxbld-trace-lib.mjs';

const require = createRequire(import.meta.url);
export const DECL_PATH = 'scripts/surfaces/_schema/report-v2.decl.json';
export const DECL_SCHEMA_PATH = 'scripts/surfaces/_schema/report-v2.decl.schema.json';
export const GENERATOR = 'scripts/analysis/report-schema.mjs';
export class ReportSchemaError extends Error {}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
const readText = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const readJson = (root, rel) => JSON.parse(readText(root, rel));
const META_KEYS = new Set(['$comment', 'version']);
const HIDDEN_STATES_FALLBACK = ['not_permitted', 'not_applicable', 'not_buildable'];

// ------------------------------------------------------------------ inputs

/** Every input as plain JSON (structured-clonable), so tests mutate a copy and re-evaluate. */
export function loadInputs(root) {
  const decl = readJson(root, DECL_PATH);
  const consumerSrc = readText(root, decl.inputs.consumer_lookup);
  const block = /CONSUMER_HEADLINE_COLS\s*=\s*\[([\s\S]*?)\]/.exec(consumerSrc);
  if (!block) throw new ReportSchemaError(`CONSUMER_HEADLINE_COLS not found in ${decl.inputs.consumer_lookup}`);
  const desc = readJson(root, decl.inputs.consumer_descriptor);
  const cols = migrationColumns(root).get('parcels');
  const fmtSrc = readText(root, 'mobile/src/lib/parcelCostFormat.ts');
  return {
    decl,
    declSchema: readJson(root, DECL_SCHEMA_PATH),
    presentation: readJson(root, decl.inputs.presentation),
    rulings: readJson(root, decl.inputs.rulings),
    lineage: readJson(root, decl.inputs.lineage),
    spec78: readText(root, decl.inputs.spec78),
    consumer: {
      whitelist: (desc.inputs && desc.inputs.field_whitelist) || [],
      headline_cols: [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]),
    },
    parcels_columns: cols ? [...cols.keys()].sort(cmp) : [],
    formatter_exports: [...fmtSrc.matchAll(/^export function (\w+)/gm)].map((m) => m[1]),
  };
}

/** Spec 78 P5.12 → Map<code, {code, template, slots, importance, mandatory, source}>. */
export function disclosureTemplates(specText) {
  const start = specText.indexOf('### P5.12 Disclosures');
  const end = specText.indexOf('### P5.13', start);
  const out = new Map();
  if (start < 0 || end < 0) return out;
  for (const line of specText.slice(start, end).split('\n')) {
    const m = /^\| `([a-z0-9_]+)` \| "([^"]*)"([^|]*)\| (.*) \|$/.exec(line);
    if (!m) continue;
    const [, code, template, trailer, source] = m;
    const slots = uniqSorted([...template.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]));
    const imp = /(\w+) importance/.exec(trailer);
    out.set(code, { code, template, slots, importance: imp ? imp[1] : 'normal', mandatory: /\bmandatory\b/.test(trailer), source: source.trim() });
  }
  return out;
}

/** Lineage `type` text → {type, unit, enum}. */
export function lineageType(t) {
  const en = [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const isEnum = /^text `/.test(t);
  const base = (type, unit) => ({ type, ...(unit ? { unit } : {}), ...(isEnum ? { enum: en } : {}) });
  if (/^integer/.test(t)) return base('integer');
  if (/^numeric m²/.test(t)) return base('number', 'm²');
  if (/^numeric m\b/.test(t)) return base('number', 'm');
  if (/^numeric \[0, 1\]/.test(t)) return base('number', 'fraction');
  if (/^numeric ratio/.test(t)) return base('number', 'ratio');
  if (/^numeric/.test(t)) return base('number');
  if (/^text\[\]/.test(t)) return base('text[]');
  if (/^text/.test(t)) return base('text');
  if (/^boolean/.test(t)) return base('boolean');
  if (/^jsonb/.test(t)) return base('jsonb', / m$/.test(t) ? 'm' : undefined);
  if (/^timestamptz/.test(t)) return base('timestamp');
  return { type: `?${t}` };
}

const parseSource = (s) => {
  const m = /^(lineage|consumer|parcels|presentation|pending):(.+)$/.exec(s || '');
  if (!m) return null;
  if (m[1] !== 'pending') return { kind: m[1], ref: m[2] };
  const p = /^(operator_ruling|operator_confirm|lineage_queue|spec_owed|spec100_amendment):(.+)$/.exec(m[2]);
  return p ? { kind: 'pending', reason: p[1], ref: p[2] } : { kind: 'pending', reason: null, ref: m[2] };
};
const allFields = (decl) => decl.sections.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id })));
const leafOf = (p) => p.split('.').pop().replace(/\[\]$/, '');
const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' && k in o ? o[k] : undefined), obj);

// ------------------------------------------------------------------ gates

export function evaluate(inputs) {
  const { decl, presentation, rulings, lineage, spec78, consumer } = inputs;
  const fields = allFields(decl);
  const lin = new Map(lineage.fields.map((f) => [f.field, f]));
  const codes = lineage.scenario_codes || {};
  const templates = disclosureTemplates(spec78);
  const rulingById = new Map(rulings.rulings.map((r) => [r.ref, r]));
  const gates = [];
  const gate = (id, question, failing, warnings = []) => gates.push({ id, question, state: failing.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS', failing: uniqSorted(failing), warnings: uniqSorted(warnings) });
  const refs = (f) => [['source', f.source], ['target', f.target], ['origin', f.origin], ['via', f.via]].filter(([, s]) => s).map(([role, s]) => ({ role, s, p: parseSource(s) }));
  const whitelisted = (q) => consumer.whitelist.some((w) => q === w || q.startsWith(`${w}.`));
  const under = (fp, q) => { const n = fp.replace(/\[\]/g, ''); return n === q || n.startsWith(`${q}.`); };

  // RS-0 shape
  const bad0 = [];
  try {
    const Ajv2020 = require('ajv/dist/2020.js').default || require('ajv/dist/2020.js');
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const ok = ajv.validate(inputs.declSchema, decl);
    if (!ok) for (const e of ajv.errors) bad0.push(`schema ${e.instancePath || '/'} ${e.message}`);
  } catch (err) { bad0.push(`schema validator: ${err.message}`); }
  const seenPath = new Map();
  for (const f of fields) {
    if (seenPath.has(f.path)) bad0.push(`duplicate path ${f.path} (${seenPath.get(f.path)}, ${f.section})`);
    seenPath.set(f.path, f.section);
    if (f.name !== leafOf(f.path)) bad0.push(`${f.path}: name "${f.name}" is not the path leaf`);
    if (f.target && !(parseSource(f.source) || {}).reason) bad0.push(`${f.path}: a target is only allowed on a pending row`);
  }
  const seenCode = new Set();
  for (const c of decl.cards) { if (seenCode.has(c.code)) bad0.push(`duplicate card ${c.code}`); seenCode.add(c.code); }
  gate('RS-0', 'the declaration has the declared shape (schema, unique paths, name = path leaf, target only on pending rows)', bad0);

  // RS-1 lineage
  const bad1 = [];
  for (const f of fields) for (const r of refs(f)) {
    if (!r.p || r.p.kind !== 'lineage') continue;
    const l = lin.get(r.p.ref);
    if (!l) { bad1.push(`${f.path}: ${r.role} lineage:${r.p.ref} is not a lineage field`); continue; }
    if (f.name !== r.p.ref) bad1.push(`${f.path}: payload key "${f.name}" renames lineage field "${r.p.ref}"`);
    const t = lineageType(l.type);
    if (t.type !== f.type) bad1.push(`${f.path}: type ${f.type} ≠ lineage ${t.type} (${l.type})`);
    if ((t.unit || null) !== (f.unit || null)) bad1.push(`${f.path}: unit ${f.unit || '∅'} ≠ lineage ${t.unit || '∅'} (${l.type})`);
    if (f.enum && t.enum && f.enum.join('|') !== t.enum.join('|')) bad1.push(`${f.path}: enum ${f.enum.join('/')} ≠ lineage ${t.enum.join('/')}`);
  }
  for (const c of decl.cards) {
    if (c.source !== 'lineage:scenario') continue;
    if (!(c.code in codes)) bad1.push(`card ${c.code}: not a lineage scenario code`);
    else if (codes[c.code] !== c.scenario) bad1.push(`card ${c.code}: scenario ${c.scenario} ≠ lineage ${codes[c.code]}`);
  }
  gate('RS-1', 'every lineage: name exists in the lineage, keeps its name as the payload key, and agrees on type / unit / enum', bad1);

  // RS-2 consumer
  const bad2 = [];
  for (const f of fields) for (const r of refs(f)) {
    if (!r.p || r.p.kind !== 'consumer') continue;
    const q = r.p.ref;
    if (r.role === 'source') {
      if (!whitelisted(q)) bad2.push(`${f.path}: consumer:${q} is not in the S-001 field_whitelist`);
      const a = /^parcel\.areas\.([a-z0-9_]+)$/.exec(q);
      if (a && !consumer.headline_cols.includes(a[1])) bad2.push(`${f.path}: ${a[1]} is not in CONSUMER_HEADLINE_COLS`);
    }
    if (!f.via && !under(f.path, q)) bad2.push(`${f.path}: path is not under its consumer ${r.role} ${q}`);
  }
  gate('RS-2', 'every consumer: path is in the S-001 whitelist (and CONSUMER_HEADLINE_COLS for parcel.areas.*)', bad2);

  // RS-3 parcels
  const bad3 = [];
  const pc = new Set(inputs.parcels_columns);
  for (const f of fields) for (const r of refs(f)) {
    if (!r.p || r.p.kind !== 'parcels') continue;
    if (!pc.has(r.p.ref)) bad3.push(`${f.path}: parcels.${r.p.ref} is not a migration column`);
    if (r.role === 'source') bad3.push(`${f.path}: parcels:${r.p.ref} as a live source — a parcels column reaches the app only through a consumer path (origin), after the Spec 100 §3.2 amendment`);
  }
  gate('RS-3', 'every parcels: column exists in the migrations; none is live before the Spec 100 §3.2 amendment', bad3);

  // RS-4 presentation both ways
  const bad4 = [];
  const used = new Set(['display_label']); // cards resolve their titles through display_label
  for (const f of fields) for (const r of refs(f)) {
    if (!r.p || r.p.kind !== 'presentation') continue;
    used.add(r.p.ref.split('.')[0]);
    if (getPath(presentation, r.p.ref) === undefined) bad4.push(`${f.path}: presentation:${r.p.ref} is not in the registry`);
  }
  for (const k of Object.keys(presentation)) if (!META_KEYS.has(k) && !used.has(k)) bad4.push(`registry key ${k}: referenced by no field`);
  const byCode = (presentation.display_label && presentation.display_label.by_code) || {};
  for (const c of decl.cards) if (!(c.code in byCode)) bad4.push(`card ${c.code}: no display_label.by_code entry`);
  for (const k of Object.keys(byCode)) if (!decl.cards.some((c) => c.code === k)) bad4.push(`display_label.by_code.${k}: no such card`);
  for (const [k, v] of Object.entries(presentation.formats || {})) for (const fn of [v.formatter, v.alt_formatter]) if (fn && !inputs.formatter_exports.includes(fn)) bad4.push(`formats.${k}: ${fn} is not exported by parcelCostFormat.ts`);
  gate('RS-4', 'every presentation: key resolves in the registry, and every registry key is referenced', bad4);

  // RS-5 pending
  const bad5 = [];
  const warn5 = [];
  const pendingCheck = (where, s, target) => {
    const p = parseSource(s);
    if (!p || p.kind !== 'pending') return;
    if (!p.reason) { bad5.push(`${where}: pending reason "${p.ref}" is not operator_ruling | operator_confirm | lineage_queue | spec_owed | spec100_amendment`); return; }
    if (p.reason === 'operator_confirm') {
      const m = /^(Q-[0-9]+)-scope$/.exec(p.ref);
      const r = m && rulingById.get(m[1]);
      const t = target && parseSource(target);
      if (!r) bad5.push(`${where}: operator_confirm ${p.ref} names no ruling in the register`);
      else if (r.status !== 'decided') bad5.push(`${where}: operator_confirm ${p.ref}: ${m[1]} is not decided — use operator_ruling`);
      else if (t && t.kind === 'consumer' && whitelisted(t.ref)) bad5.push(`${where}: the S-001 whitelist now has ${t.ref} — the scope was settled; switch the source`);
      else warn5.push(`${where}: waits on the operator confirming ${p.ref}`);
      return;
    }
    if (p.reason === 'spec100_amendment') {
      const r = rulingById.get(p.ref);
      const t = target && parseSource(target);
      if (!r || r.status !== 'decided') bad5.push(`${where}: spec100_amendment needs a decided ruling (${p.ref} is ${r ? r.status : 'unknown'})`);
      if (!t || t.kind !== 'consumer') bad5.push(`${where}: spec100_amendment needs a consumer: target`);
      else if (whitelisted(t.ref)) bad5.push(`${where}: the S-001 whitelist now has ${t.ref} — switch the source to ${target}`);
      else warn5.push(`${where}: waits on the Spec 100 §3.2 amendment (${p.ref})`);
      return;
    }
    if (p.reason === 'operator_ruling') {
      const r = rulingById.get(p.ref);
      if (!r) bad5.push(`${where}: ${p.ref} is not in the rulings register`);
      else if (r.status !== 'open') bad5.push(`${where}: ${p.ref} is ${r.status} — apply the decision and leave pending`);
      else warn5.push(`${where}: waits on ${p.ref}`);
    } else if (p.reason === 'lineage_queue') {
      const sc = /^scenario:(.+)$/.exec(p.ref);
      if (sc ? sc[1] in codes : lin.has(p.ref)) bad5.push(`${where}: lineage now has ${p.ref} — switch the source to lineage:`);
      else warn5.push(`${where}: queued for lineage (${p.ref})`);
    } else if (!(p.ref in (decl.spec_owed || {}))) bad5.push(`${where}: spec_owed ${p.ref} is not declared in spec_owed`);
    else warn5.push(`${where}: owed by ${p.ref}`);
    const t = target && parseSource(target);
    if (t && t.kind === 'lineage' && lin.has(t.ref)) bad5.push(`${where}: target lineage:${t.ref} now exists — the row is stale`);
  };
  for (const f of fields) pendingCheck(f.path, f.source, f.target);
  for (const c of decl.cards) pendingCheck(`card ${c.code}`, c.source);
  for (const d of decl.proposed_disclosures) {
    const r = rulingById.get(d.ruling);
    if (!r) bad5.push(`proposed disclosure ${d.code}: ${d.ruling} is not in the rulings register`);
    else if (r.status !== 'open') bad5.push(`proposed disclosure ${d.code}: ${d.ruling} is ${r.status}`);
  }
  gate('RS-5', 'every pending row names a closed reason; WARN while it waits, FAIL once the ruling is decided or the source exists', bad5, warn5);

  // RS-6 disclosure codes
  const bad6 = [];
  const warn6 = [];
  const proposed = new Map(decl.proposed_disclosures.map((d) => [d.code, d]));
  for (const d of decl.proposed_disclosures) if (templates.has(d.code)) bad6.push(`proposed disclosure ${d.code} is already a P5.12 code — drop the proposal`);
  const checkCode = (where, code) => {
    if (templates.has(code)) return;
    if (proposed.has(code)) warn6.push(`${where}: ${code} proposed (${proposed.get(code).ruling})`);
    else bad6.push(`${where}: ${code} is not a Spec 78 P5.12 code`);
  };
  for (const c of decl.cards) for (const code of c.disclosures || []) checkCode(`card ${c.code}`, code);
  for (const f of fields) for (const code of f.disclosures || []) checkCode(f.path, code);
  for (const s of decl.samples) {
    for (const code of s.values['scenarios.lot_disclosures'] || []) checkCode(`sample ${s.id} lot`, code);
    for (const c of [...s.cards, ...s.renovations]) {
      for (const code of c.disclosures) checkCode(`sample ${s.id} ${c.code}`, code);
      for (const [code, params] of Object.entries(c.params || {})) {
        if (!c.disclosures.includes(code)) bad6.push(`sample ${s.id} ${c.code}: params for ${code}, which the card does not carry`);
        const t = templates.get(code);
        if (t) for (const k of Object.keys(params)) if (!t.slots.includes(k)) bad6.push(`sample ${s.id} ${c.code}: ${code} has no slot {${k}}`);
      }
    }
  }
  gate('RS-6', 'every disclosure code used is in the Spec 78 P5.12 closed set', bad6, warn6);

  // RS-7 display rules in the samples
  const bad7 = [];
  const st = presentation.states || {};
  if (st.null_value !== '—') bad7.push('states.null_value must be "—" (null never renders as 0 / "no")');
  const hidden = st.hidden || HIDDEN_STATES_FALLBACK;
  const declared = new Set(fields.map((f) => f.path));
  const cardByCode = new Map(decl.cards.map((c) => [c.code, c]));
  const rules = presentation.lot_form_rules || {};
  for (const s of decl.samples) {
    const v = s.values;
    for (const k of Object.keys(v)) if (!declared.has(k)) bad7.push(`sample ${s.id}: value key ${k} is not a declared path`);
    for (const [arr, kind, base] of [[s.cards, 'new_build', 'scenarios.cards[]'], [s.renovations, 'renovation', 'scenarios.renovations[]']]) {
      for (const c of arr) {
        const card = cardByCode.get(c.code);
        if (!card) { bad7.push(`sample ${s.id}: card ${c.code} is not declared`); continue; }
        if (card.kind !== kind) bad7.push(`sample ${s.id}: card ${c.code} is ${card.kind}, listed under ${kind}`);
        if (parseSource(card.source).kind === 'pending') bad7.push(`sample ${s.id}: card ${c.code} is pending (${card.source}) and cannot render`);
        for (const k of Object.keys(c.values)) if (!declared.has(`${base}.${k}`)) bad7.push(`sample ${s.id} ${c.code}: value key ${k} is not a declared path under ${base}`);
        const status = c.values.scenario_status || '';
        if (hidden.some((h) => status === h || status.startsWith(`${h}:`))) bad7.push(`sample ${s.id} ${c.code}: ${status} is a hidden state but the card is rendered (§6.6 rule 1)`);
      }
    }
    if (v['scenarios.headline.scenario'] == null && !v['scenarios.headline.closed_reason']) bad7.push(`sample ${s.id}: neither a headline nor a closed reason (§6.6 rule 5)`);
    const permitted = s.cards.filter((c) => c.values.scenario_status === 'permitted').length;
    if ((v['scenarios.counts.permitted'] ?? 0) < permitted) bad7.push(`sample ${s.id}: counts.permitted < rendered permitted cards`);
    const eff = v['scenarios.lot_form.lot_form_effective'];
    const rule = eff && rules[eff];
    if (eff && !rule) bad7.push(`sample ${s.id}: no lot_form_rules entry for ${eff}`);
    if (rule) {
      const kinds = new Set(rule.show_card_kinds || []);
      if (!kinds.has('new_build') && s.cards.length) bad7.push(`sample ${s.id}: ${eff} lot shows new-build cards (${s.cards.map((c) => c.code).join(', ')}) — lot_form_rules.${eff} (Q-1)`);
      if (rule.headline === null && v['scenarios.headline.scenario'] != null) bad7.push(`sample ${s.id}: ${eff} lot has a headline — lot_form_rules.${eff} (Q-1)`);
      if (rule.suite_add_on === false && s.cards.some((c) => (c.values['suite.suite_type'] || 'none') !== 'none')) bad7.push(`sample ${s.id}: ${eff} lot shows a suite add-on (Q-3)`);
      if (rule.existing_estimates === 'hidden') {
        for (const [k, val] of Object.entries(v)) if (k.startsWith('scenarios.existing.') && !k.includes('.owner_input.') && val != null) bad7.push(`sample ${s.id}: ${eff} lot shows estimate ${k} (Q-2)`);
        for (const c of s.renovations) for (const [k, val] of Object.entries(c.values)) {
          const f = fields.find((x) => x.path === `scenarios.renovations[].${k}`);
          if (f && f.type === 'number' && val != null) bad7.push(`sample ${s.id} ${c.code}: ${eff} lot shows renovation number ${k} before owner input (Q-2)`);
        }
      }
    }
    for (const c of [...s.cards, ...s.renovations]) for (const code of c.disclosures) {
      const t = templates.get(code);
      if (!t) continue;
      const missing = t.slots.filter((k) => !((c.params || {})[code] || {})[k]);
      if (missing.length) bad7.push(`sample ${s.id} ${c.code}: ${code} leaves slot(s) ${missing.map((k) => `{${k}}`).join(' ')} unfilled`);
    }
    for (const code of v['scenarios.lot_disclosures'] || []) {
      const t = templates.get(code);
      if (t && t.slots.length) bad7.push(`sample ${s.id}: lot disclosure ${code} has slots, and lot disclosures carry no params`);
    }
  }
  gate('RS-7', 'the samples obey §6.6 (no hidden-state card, headline or closed reason, null = "—") and the decided lot-form rules (Q-1/Q-2/Q-3); every disclosure slot is filled', bad7);

  // RS-8 sponsored slots
  const bad8 = [];
  const ap = presentation.ad_placements || {};
  if (!presentation.sponsored_label) bad8.push('sponsored_label is empty (Spec 128 R-17)');
  if (ap.container !== 'offers' || ap.top_level !== true) bad8.push('ad_placements must render into the top-level offers[] list (Spec 100 §2.1: never inside parcel.*)');
  const keys = new Set();
  for (const p of ap.placements || []) {
    if (keys.has(p.key)) bad8.push(`placement ${p.key}: duplicate`);
    keys.add(p.key);
    const d = p.disclosure;
    if (!d) { bad8.push(`placement ${p.key}: no disclosure (R-17 FAIL)`); continue; }
    if (!d.label || d.label !== presentation.sponsored_label) bad8.push(`placement ${p.key}: disclosure label must be "${presentation.sponsored_label}"`);
    if (!d.check_id) bad8.push(`placement ${p.key}: disclosure has no check_id`);
    if (d.severity !== 'FAIL') bad8.push(`placement ${p.key}: disclosure severity must be FAIL (R-17)`);
    if (d.blocking !== true) bad8.push(`placement ${p.key}: disclosure must be blocking (R-34 (ii))`);
    if (!(Number.isInteger(p.max_slots) && p.max_slots >= 1)) bad8.push(`placement ${p.key}: max_slots`);
  }
  for (const f of fields) if (/offer/i.test(f.path) && !f.path.startsWith('offers[]')) bad8.push(`${f.path}: offer data outside the top-level offers[]`);
  for (const s of decl.samples) for (const o of s.offers) {
    if (!keys.has(o.placement_key)) bad8.push(`sample ${s.id}: offer ${o.offer_id} placement ${o.placement_key} is not declared`);
    if (o.disclosure_label !== presentation.sponsored_label) bad8.push(`sample ${s.id}: offer ${o.offer_id} has no "${presentation.sponsored_label}" label`);
  }
  gate('RS-8', 'every sponsored placement declares a FAIL, blocking "Sponsored" disclosure; offers stay top-level', bad8);

  // RS-9 lineage totality
  const bad9 = [];
  const refd = new Set();
  for (const f of fields) for (const r of refs(f)) if (r.p && r.p.kind === 'lineage') refd.add(r.p.ref);
  const nir = new Map();
  for (const n of decl.not_in_report) {
    if (nir.has(n.field)) bad9.push(`not_in_report ${n.field}: duplicate`);
    nir.set(n.field, n.reason);
    if (!lin.has(n.field)) bad9.push(`not_in_report ${n.field}: not a lineage field`);
    if (refd.has(n.field)) bad9.push(`not_in_report ${n.field}: also declared in the report`);
    if (!n.reason || /UNREVIEWED/.test(n.reason)) bad9.push(`not_in_report ${n.field}: no reason`);
  }
  for (const f of lin.keys()) if (!refd.has(f) && !nir.has(f)) bad9.push(`lineage ${f}: neither declared nor listed not_in_report`);
  gate('RS-9', 'every lineage field is declared in the report or listed not_in_report with a reason', bad9);

  // RS-11 decided rulings pin their checkable consequence in the registry (Q-1/Q-2/Q-3 lot-form rules)
  const bad11 = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const r of rulings.rulings) {
    if (!r.pins) continue;
    if (r.status !== 'decided') { bad11.push(`${r.ref}: pins on a ruling that is ${r.status}`); continue; }
    for (const [p, want] of Object.entries(r.pins)) {
      const got = getPath(presentation, p);
      if (!same(got, want)) bad11.push(`${r.ref}: presentation ${p} = ${JSON.stringify(got)}, the ruling pins ${JSON.stringify(want)}`);
    }
  }
  for (const ref of ['Q-1', 'Q-2', 'Q-3']) { const r = rulingById.get(ref); if (r && r.status === 'decided' && !r.pins) bad11.push(`${ref}: decided but pins nothing`); }
  gate('RS-11', 'every decided ruling that pins registry values (Q-1/Q-2/Q-3 semi_half rules) still holds them', bad11);

  return { gates, templates };
}

// ------------------------------------------------------------------ payload tree (shared by sample, JSON Schema, TS)

function buildTree(fields) {
  const root = { kind: 'object', children: new Map() };
  for (const f of fields) {
    if (f.path.startsWith('ui.') || f.path.includes('<')) continue;
    const segs = f.path.split('.');
    let node = root;
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      const arr = seg.endsWith('[]');
      const key = seg.replace(/\[\]$/, '');
      if (last) { node.children.set(key, { kind: 'leaf', field: f }); return; }
      if (!node.children.has(key)) node.children.set(key, arr ? { kind: 'array', item: { kind: 'object', children: new Map() } } : { kind: 'object', children: new Map() });
      const n = node.children.get(key);
      node = n.kind === 'array' ? n.item : n;
    });
  }
  return root;
}

const LEAF_JSON = {
  integer: { type: 'integer' }, number: { type: 'number' }, text: { type: 'string' }, boolean: { type: 'boolean' },
  'text[]': { type: 'array', items: { type: 'string' } }, jsonb: {}, 'object[]': { type: 'array', items: { type: 'object' } },
  timestamp: { type: 'string', format: 'date-time' }, url: { type: 'string', format: 'uri' }, month: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
  geojson: { type: 'object' },
};
const isCodeList = (f) => /(^|\.)(disclosures|lot_disclosures)$/.test(f.path);
const isCode = (f) => /disclosure_texts\[\]\.code$/.test(f.path);
const enumOf = (f, lin) => {
  if (f.enum) return f.enum;
  const p = parseSource(f.source);
  if (p && p.kind === 'lineage' && lin.has(p.ref)) return lineageType(lin.get(p.ref).type).enum;
  return undefined;
};

function leafSchema(f, lin) {
  const p = parseSource(f.source);
  const annot = { description: f.label, 'x-source': f.source, ...(f.target ? { 'x-target': f.target } : {}), 'x-status': f.status, 'x-render': f.render, ...(f.unit ? { 'x-unit': f.unit } : {}) };
  if (p && p.kind === 'lineage' && lin.has(p.ref)) annot['x-trust-tier'] = lin.get(p.ref).trust_tier;
  if (isCodeList(f)) return { ...annot, type: ['array', 'null'], items: { $ref: '#/$defs/disclosure_code' } };
  if (isCode(f)) return { ...annot, $ref: '#/$defs/disclosure_code' };
  const base = structuredClone(LEAF_JSON[f.type] || {});
  const en = enumOf(f, lin);
  if (en) return { ...annot, enum: [...en, null] };
  if (base.type) base.type = [base.type, 'null'];
  return { ...annot, ...base };
}

function nodeSchema(node, lin) {
  if (node.kind === 'leaf') return leafSchema(node.field, lin);
  if (node.kind === 'array') return { type: 'array', items: nodeSchema(node.item, lin) };
  const keys = [...node.children.keys()].sort(cmp);
  return { type: 'object', additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((k) => [k, nodeSchema(node.children.get(k), lin)])) };
}

const TS_LEAF = { integer: 'number', number: 'number', text: 'string', boolean: 'boolean', 'text[]': 'string[]', jsonb: 'unknown', 'object[]': 'Array<Record<string, unknown>>', timestamp: 'string', url: 'string', month: 'string', geojson: 'Record<string, unknown>' };
function nodeTs(node, lin, ind) {
  if (node.kind === 'leaf') {
    const f = node.field;
    if (isCodeList(f)) return 'DisclosureCode[] | null';
    if (isCode(f)) return 'DisclosureCode';
    const en = enumOf(f, lin);
    if (en) return `${en.map((e) => JSON.stringify(e)).join(' | ')} | null`;
    const t = TS_LEAF[f.type];
    return t === 'unknown' ? 'unknown' : `${t} | null`;
  }
  if (node.kind === 'array') return `Array<${nodeTs(node.item, lin, ind)}>`;
  const pad = '  '.repeat(ind + 1);
  const keys = [...node.children.keys()].sort(cmp);
  const lines = keys.map((k) => {
    const c = node.children.get(k);
    const doc = c.kind === 'leaf' ? `${pad}/** ${c.field.label.replace(/\*\//g, '* /')} — ${c.field.source}${c.field.unit ? ` (${c.field.unit})` : ''} */\n` : '';
    return `${doc}${pad}${k}: ${nodeTs(c, lin, ind + 1)};`;
  });
  return `{\n${lines.join('\n')}\n${'  '.repeat(ind)}}`;
}

// ------------------------------------------------------------------ sample payload

function fillTemplate(t, params) {
  return t.template.replace(/\{([^}]+)\}/g, (m, k) => (params && params[k] != null ? params[k] : m));
}
const discText = (templates, code, params) => {
  const t = templates.get(code);
  return { code, text: t ? fillTemplate(t, params) : null, importance: t ? t.importance : null, mandatory: t ? t.mandatory : null };
};

function statusText(map, status) {
  if (!status) return null;
  let best = null;
  for (const k of Object.keys(map)) if ((status === k || status.startsWith(`${k}:`)) && (!best || k.length > best.length)) best = k;
  return best ? map[best] : null;
}

function cardItem(node, base, card, ctx) {
  const { inputs, templates, lin } = ctx;
  const decl = inputs.decl;
  const pres = inputs.presentation;
  const dc = decl.cards.find((c) => c.code === card.code);
  const v = card.values;
  const derived = {
    scenario: dc.scenario,
    disclosures: card.disclosures,
    disclosure_params: card.params && Object.keys(card.params).length ? card.params : null,
    display_label: (pres.display_label.by_code[card.code] || '').replace('{dwelling_units}', v.dwelling_units ?? '{dwelling_units}'),
    trust_label: v.row_trust_level ? pres.trust_label[v.row_trust_level] ?? null : null,
    status_text: statusText(pres.status_text, v.scenario_status),
  };
  const lotForm = ctx.values['scenarios.lot_form.lot_form_effective'] || 'detached';
  const fill = (n, rel) => {
    const out = {};
    for (const [k, c] of [...n.children.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      const r = rel ? `${rel}.${k}` : k;
      if (c.kind === 'leaf') {
        if (r === 'field_trust') {
          out[k] = Object.fromEntries(Object.keys(v).filter((x) => lin.has(leafOf(x))).sort(cmp).map((x) => [leafOf(x), lin.get(leafOf(x)).trust_tier]));
        } else out[k] = r in v ? v[r] : r in derived ? derived[r] : null;
      } else if (c.kind === 'array') {
        if (k === 'disclosure_texts') out[k] = card.disclosures.map((code) => discText(templates, code, (card.params || {})[code]));
        else if (k === 'illustrations') {
          const key = dc.kind === 'renovation' ? `${card.code}|any|none|${lotForm}` : `${card.code}|${v.roof_form_headline}|${v['suite.suite_type'] || 'none'}|${lotForm}`;
          out[k] = (pres.illustrations.assets || []).filter((x) => x.key === key).map((a) => ({ alt: a.alt, asset_id: a.asset_id, caption: a.caption, kind: 'illustration' }));
        } else out[k] = [];
      } else out[k] = fill(c, r);
    }
    return out;
  };
  return fill(node, '');
}

function samplePayload(tree, s, ctx) {
  const walk = (node, prefix) => {
    const out = {};
    for (const [k, c] of [...node.children.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (c.kind === 'leaf') out[k] = p in s.values ? s.values[p] : null;
      else if (c.kind === 'array') {
        if (p === 'scenarios.cards') out[k] = s.cards.map((card) => cardItem(c.item, p, card, ctx));
        else if (p === 'scenarios.renovations') out[k] = s.renovations.map((card) => cardItem(c.item, p, card, ctx));
        else if (p === 'offers') out[k] = s.offers.map((o) => Object.fromEntries([...c.item.children.keys()].sort(cmp).map((x) => [x, o[x] ?? null])));
        else if (p === 'scenarios.lot_disclosure_texts') out[k] = (s.values['scenarios.lot_disclosures'] || []).map((code) => discText(ctx.templates, code, null));
        else out[k] = [];
      } else out[k] = walk(c, p);
    }
    return out;
  };
  return walk(tree, '');
}

// ------------------------------------------------------------------ render

const srcFamily = (s) => { const p = parseSource(s); return p ? (p.kind === 'pending' ? `pending:${p.reason}` : p.kind) : '?'; };
const md = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

export function render(inputs, ev) {
  const { decl, lineage, presentation, rulings } = inputs;
  const lin = new Map(lineage.fields.map((f) => [f.field, f]));
  const fields = allFields(decl);
  const tree = buildTree(fields);
  const templates = ev.templates;
  const codesSorted = [...templates.keys()].sort(cmp);
  const T = (k) => tree.children.get(k);

  // JSON Schema (scenarios + offers)
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'maxbld-report-v2.schema.json',
    title: 'MaxBLD lot report v2 — scenarios + offers',
    $comment: `GENERATED by ${GENERATOR} --write from ${DECL_PATH}. Do not edit. Every property carries x-source (its one source), x-status and, for lineage fields, x-trust-tier (the per-field trust map, O-17).`,
    type: 'object',
    additionalProperties: false,
    required: ['offers', 'scenarios'],
    properties: { offers: nodeSchema(T('offers'), lin), scenarios: nodeSchema(T('scenarios'), lin) },
    $defs: { disclosure_code: { enum: codesSorted, description: 'Spec 78 P5.12 closed disclosure codes' } },
    'x-disclosure-templates': Object.fromEntries(codesSorted.map((c) => { const t = templates.get(c); return [c, { template: t.template, slots: t.slots, importance: t.importance, mandatory: t.mandatory }]; })),
  };

  // TS
  const ts = [
    `// GENERATED by ${GENERATOR} --write from ${DECL_PATH}. Do not edit; regenerate.`,
    '// Types of the MaxBLD lot report v2 `scenarios` block and the top-level `offers` list (Spec 128 R-21: one declaration,',
    '// three renderers). Every property names its one source; pending:* properties are not produced yet.',
    '',
    `export type DisclosureCode =\n${codesSorted.map((c) => `  | ${JSON.stringify(c)}`).join('\n')};`,
    '',
    `export type ReportV2Scenarios = ${nodeTs(T('scenarios'), lin, 0)};`,
    '',
    `export type ReportV2Offer = ${nodeTs(T('offers').item, lin, 0)};`,
    '',
    'export interface ReportV2Payload {',
    '  scenarios: ReportV2Scenarios;',
    '  offers: ReportV2Offer[];',
    '}',
    '',
  ].join('\n');

  // sample
  const ctx = { inputs, templates, lin };
  const sample = {
    $comment: `GENERATED by ${GENERATOR} --write from ${DECL_PATH} samples + the Spec 78 P5.12 templates. Illustrative values (see each basis); the disclosure text is the real template text.`,
    samples: decl.samples.map((s) => ({ id: s.id, title: s.title, basis: s.basis, payload: samplePayload(tree, s, { ...ctx, values: s.values }) })),
  };

  // lineage queue
  const q = new Map();
  const addQ = (key, kind, f, extra) => {
    if (!q.has(key)) q.set(key, { field: key, kind, needed_by: [], ...extra });
    if (f) q.get(key).needed_by.push(f.path);
  };
  for (const f of fields) {
    const p = parseSource(f.source);
    const t = f.target && parseSource(f.target);
    if (p && p.kind === 'pending' && p.reason === 'lineage_queue') addQ(p.ref, 'field', f, { type: f.type, ...(f.unit ? { unit: f.unit } : {}), label: f.label, blocked_by: null, note: f.note || '' });
    else if (t && t.kind === 'lineage' && p.reason === 'operator_ruling') addQ(t.ref, 'field', f, { type: f.type, ...(f.unit ? { unit: f.unit } : {}), label: f.label, blocked_by: p.ref, note: f.note || '' });
  }
  for (const c of decl.cards) {
    const p = parseSource(c.source);
    if (p.kind === 'pending' && p.reason === 'lineage_queue') addQ(p.ref, 'scenario_code', null, { scenario: c.scenario, label: c.title, blocked_by: null, note: c.note || '' });
    if (p.kind === 'pending' && p.reason === 'operator_ruling') addQ(`scenario:${c.code}`, 'scenario_code', null, { scenario: c.scenario, label: c.title, blocked_by: p.ref, note: c.note || '' });
  }
  const queue = {
    $comment: `GENERATED by ${GENERATOR} --write from ${DECL_PATH}. The lineage rows the v2 report needs and docs/reference/maxbld-field-lineage.json lacks, for the by-law fix lane (sole writer of the lineage). blocked_by = an open operator ruling. Once a row lands in the lineage, RS-5 FAILs until the declaration switches it to lineage:<field>.`,
    rows: [...q.values()].map((r) => ({ ...r, needed_by: uniqSorted(r.needed_by) })).sort((a, b) => cmp(a.field, b.field)),
  };

  // markdown
  const L = [];
  const counts = {};
  for (const f of fields) counts[srcFamily(f.source)] = (counts[srcFamily(f.source)] || 0) + 1;
  L.push('# MaxBLD lot report v2 — schema (generated — do not edit)');
  L.push('');
  L.push(`> GENERATED by \`${GENERATOR}\` from \`${DECL_PATH}\`, \`${decl.inputs.presentation}\`, \`${decl.inputs.rulings}\`, \`${decl.inputs.lineage}\` and Spec 78 P5.12. Do not edit. Regenerate with \`node ${GENERATOR} --write\`; \`--check\` fails on drift or a gate FAIL. Machine forms: \`${decl.outputs.json_schema}\`, \`${decl.outputs.types}\`, \`${decl.outputs.sample}\`, \`${decl.outputs.lineage_queue}\`.`);
  L.push('');
  L.push('Rule: R-RS (operator CHAT-4, 2026-10-20; scratchpad/chat-decisions/2026-10-20-batch-a.json; register row by lane layer2-spec) — one field declaration per report surface, one source per field, checked by this generator; outputs generated, never hand-edited.');
  L.push('');
  L.push('Every field has exactly one source: `lineage:` (docs/reference/maxbld-field-lineage.json), `consumer:` (the S-001 / Spec 100 §3.2 whitelist), `parcels:` (a column, only after a Spec 100 amendment), `presentation:` (report-presentation.json) or `pending:` (an open operator ruling, a lineage row queued for the by-law fix lane, or an owed spec).');
  L.push('');
  L.push(`## Totals`);
  L.push('');
  L.push(`${fields.length} fields in ${decl.sections.length} sections; ${decl.cards.length} scenario cards; ${decl.not_in_report.length} lineage fields not in the report.`);
  L.push('');
  L.push('| Source | Fields |');
  L.push('|---|---|');
  for (const k of Object.keys(counts).sort(cmp)) L.push(`| \`${k}\` | ${counts[k]} |`);
  L.push('');
  L.push('## Gates');
  L.push('');
  L.push('| Gate | State | Question | Failing | Waiting |');
  L.push('|---|---|---|---|---|');
  for (const g of ev.gates) L.push(`| ${g.id} | ${g.state} | ${md(g.question)} | ${g.failing.length ? md(g.failing.join('; ')) : '—'} | ${g.warnings.length} |`);
  L.push('');
  L.push('## Operator rulings');
  L.push('');
  L.push('| Ruling | Topic | Status | Decision | Rows pending on it |');
  L.push('|---|---|---|---|---|');
  for (const r of rulings.rulings) {
    const n = fields.filter((f) => f.source === `pending:operator_ruling:${r.ref}`).length + decl.cards.filter((c) => c.source === `pending:operator_ruling:${r.ref}`).length;
    L.push(`| ${r.ref} | ${md(r.key)} | ${r.status} | ${md(r.decision ? `${r.decision.decided}: ${r.decision.text}` : '—')} | ${n} |`);
  }
  L.push('');
  L.push('## Scenario cards');
  L.push('');
  L.push('| Code | Scenario | Kind | Title | Status | Source | Note |');
  L.push('|---|---|---|---|---|---|---|');
  for (const c of decl.cards) L.push(`| ${c.code} | \`${c.scenario}\` | ${c.kind} | ${md(presentation.display_label.by_code[c.code])} | ${c.status} | \`${c.source}\` | ${md(c.note)} |`);
  for (const s of decl.sections) {
    L.push('');
    L.push(`## ${s.title} (\`${s.id}\`)`);
    L.push('');
    L.push('| Label | Path | Type | Unit | Status | Render | Source | Note |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const f of s.fields) L.push(`| ${md(f.label)} | \`${md(f.path)}\` | ${f.type} | ${f.unit || ''} | ${f.status} | ${f.render} | \`${md(f.source)}\`${f.target ? ` → \`${md(f.target)}\`` : ''}${f.origin ? ` (from \`${md(f.origin)}\`)` : ''}${f.via ? ` via \`${md(f.via)}\`` : ''} | ${md(f.note)} |`);
  }
  L.push('');
  L.push('## Lineage fields not in the report');
  L.push('');
  L.push('| Field | Reason |');
  L.push('|---|---|');
  for (const n of decl.not_in_report) L.push(`| \`${n.field}\` | ${md(n.reason)} |`);
  L.push('');
  L.push('## Lineage queue (for the by-law fix lane)');
  L.push('');
  L.push('| Field | Kind | Blocked by | Needed by |');
  L.push('|---|---|---|---|');
  for (const r of queue.rows) L.push(`| \`${r.field}\` | ${r.kind} | ${r.blocked_by || '—'} | ${md(r.needed_by.map((p) => `\`${p}\``).join(', ') || '(card)')} |`);
  L.push('');
  L.push('## Disclosure templates (Spec 78 P5.12)');
  L.push('');
  L.push('| Code | Importance | Mandatory | Slots | Template |');
  L.push('|---|---|---|---|---|');
  for (const c of codesSorted) { const t = templates.get(c); L.push(`| \`${c}\` | ${t.importance} | ${t.mandatory ? 'yes' : ''} | ${t.slots.map((x) => `{${md(x)}}`).join(' ')} | ${md(t.template)} |`); }
  L.push('');

  const j = (o) => `${JSON.stringify(o, null, 2)}\n`;
  return {
    [decl.outputs.markdown]: `${L.join('\n')}`,
    [decl.outputs.json_schema]: j(schema),
    [decl.outputs.types]: ts,
    [decl.outputs.sample]: j(sample),
    [decl.outputs.lineage_queue]: j(queue),
  };
}

// ------------------------------------------------------------------ run

export async function run({ root, mode }) {
  const inputs = loadInputs(root);
  const ev = evaluate(inputs);
  const files = render(inputs, ev);
  const drift = [];
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    if (mode === 'write') {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(`${abs}.tmp`, text);
      fs.renameSync(`${abs}.tmp`, abs);
    } else if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8') !== text) drift.push(rel);
  }
  return { gates: ev.gates, files: Object.keys(files), drift };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const flags = process.argv.slice(2);
  const unknown = flags.filter((f) => f !== '--write' && f !== '--check');
  if (unknown.length || flags.length !== 1) {
    console.error(`usage: node ${GENERATOR} --write | --check${unknown.length ? ` (unknown: ${unknown.join(' ')})` : ''}`);
    process.exitCode = 2;
  } else {
    const mode = flags[0] === '--write' ? 'write' : 'check';
    run({ root, mode }).then((r) => {
      const line = r.gates.map((g) => `${g.id} ${g.state}${g.state === 'PASS' ? '' : ` (${g.failing.length || g.warnings.length})`}`).join(' · ');
      const fails = r.gates.filter((g) => g.state === 'FAIL');
      for (const g of fails) console.error(`${g.id} FAIL: ${g.failing.join('\n  ')}`);
      if (mode === 'write') console.log(`report-schema wrote ${r.files.length} files; ${line}`);
      else if (r.drift.length) { console.error(`report-schema DRIFT: ${r.drift.join(', ')} — rerun with --write`); process.exitCode = 1; }
      else console.log(`report-schema current; ${line}`);
      if (mode === 'check' && fails.length) process.exitCode = 1;
    }).catch((err) => {
      console.error(err instanceof ReportSchemaError ? `refused — ${err.message}` : (err && err.stack) || String(err));
      process.exitCode = 2;
    });
  }
}
