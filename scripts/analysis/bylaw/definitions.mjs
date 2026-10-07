// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`definitions_used[]` G, `input_fidelity`), §6.2
//            (likely answers), §6.4 rule 11 (definitions linked by a declared matcher; a flip needs --accept --ruling),
//            §9 G-READ (the dsl_input -> Ch.800 map is total; every mapped definition carries input_fidelity);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-26; docs/reports/mcbylaw-phase1-plan.md S5
//
// The definitions matcher and the G-READ definitions arm. PURE except loadFidelity().
//
//   definitionTerms(rows, matcher)         → [{definition_id, term, forms[]}] from the sliced 800.50 rows
//   termsUsed(text, terms, matcher)        → sorted definition ids whose term occurs in `text`
//   definitionUsage({rows, inScope, matcher}) → {used: Set, byRow: {regulation_id: ids[]}} (transitive if declared)
//   checkDefinitions({rows, vocab, fidelity, inScopeIds}) → {pass, violations, checked, counts}   G-READ definitions arm
//   selfTest()
//
// The matcher (vocab.definitions_matcher): case-insensitive whole words; the term or its plural (+s, +es, y→ies);
// a parenthetical in the term is dropped; a term "A and B" defines both A and B (800.50(405) "Lawful and Lawfully");
// longest terms first, and a span a longer term matched is not re-matched by a shorter term inside it ("Front Yard
// Setback" does not also count "Front Yard"); transitive: a used definition's own text makes the terms it uses used.
//
// Reason codes (closed):
//   dsl_input_unmapped              a dsl_input with neither a definition nor a null_reason, or with both
//   definition_unresolved           a dsl_input maps to a definition id that is not a sliced 800.50 row
//   mapped_definition_out_of_scope  a mapped measurement definition is not in scope (no in-scope row uses it)
//   input_fidelity_missing          a mapped definition has no input_fidelity record
//   input_fidelity_invalid          a record's status is outside vocab.input_fidelity_status, or it lacks
//                                   our_field / why / evidence_ref, or its `input` is not the input that maps to it
//   input_fidelity_orphan           a record for a definition no dsl_input maps to

import fs from 'node:fs';
import path from 'node:path';

export const FIDELITY_REL = 'scripts/seeds/bylaw/input-fidelity.json';

export const REASON_CODES = Object.freeze([
  'dsl_input_unmapped',
  'definition_unresolved',
  'mapped_definition_out_of_scope',
  'input_fidelity_missing',
  'input_fidelity_invalid',
  'input_fidelity_orphan',
]);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Read the committed input-fidelity records (the one I/O function here). */
export function loadFidelity(root) {
  return JSON.parse(fs.readFileSync(path.join(root, FIDELITY_REL), 'utf8'));
}

/** Surface forms of one term under the matcher: singular + declared plurals. PURE. */
function formsOf(term, matcher) {
  const base = term.toLowerCase().replace(/\s+/g, ' ').trim();
  const forms = new Set([base]);
  const pl = new Set(matcher.plurals || []);
  if (pl.has('s')) forms.add(`${base}s`);
  if (pl.has('es') && /(?:s|x|z|ch|sh)$/.test(base)) forms.add(`${base}es`);
  if (pl.has('ies') && /[^aeiou]y$/.test(base)) forms.add(`${base.slice(0, -1)}ies`);
  return [...forms];
}

/**
 * The terms the 800.50 rows define. `rows` = slice rows; definition rows carry `term` and `regulation_id`.
 * A term "A and B" yields both A and B; a parenthetical is dropped when declared. PURE.
 */
export function definitionTerms(rows, matcher = {}) {
  const out = [];
  for (const r of rows) {
    if (r.kind !== 'definition' || !isStr(r.term)) continue;
    let t = r.term;
    if (matcher.strip_parenthetical) t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
    t = t.replace(/[:,]+$/, '').trim();
    const parts = /\band\b/i.test(t) && t.split(/\s+and\s+/i).every((p) => /^[A-Z]/.test(p.trim())) ? t.split(/\s+and\s+/i) : [t];
    const forms = [...new Set(parts.flatMap((p) => formsOf(p.trim(), matcher)))];
    out.push({ definition_id: r.regulation_id, forms, term: r.term });
  }
  return out.sort((a, b) => cmpStr(a.definition_id, b.definition_id));
}

/** Compiled [{definition_id, re, len}] longest form first (for span consumption). PURE. */
function compile(terms, matcher) {
  const flags = matcher.case_insensitive === false ? 'g' : 'gi';
  const items = [];
  for (const t of terms) for (const f of t.forms) items.push({ definition_id: t.definition_id, len: f.length, re: new RegExp(`(?<![A-Za-z-])${reEsc(f).replace(/ /g, '\\s+')}(?![A-Za-z-])`, flags) });
  return items.sort((a, b) => b.len - a.len || cmpStr(a.definition_id, b.definition_id));
}

/** Definition ids whose term occurs in `text` (sorted). `compiled` may be passed to avoid recompiling. PURE. */
export function termsUsed(text, terms, matcher = {}, compiled = null) {
  const items = compiled || compile(terms, matcher);
  const taken = [];
  const used = new Set();
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && a < e);
  for (const it of items) {
    for (const m of String(text).matchAll(it.re)) {
      const s = m.index;
      const e = s + m[0].length;
      if (matcher.longest_first !== false && overlaps(s, e)) continue;
      taken.push([s, e]);
      used.add(it.definition_id);
    }
  }
  return [...used].sort(cmpStr);
}

/**
 * Which definitions the in-scope regulations use. `inScope(row)` decides the non-definition rows that count.
 * Transitive when the matcher says so: a used definition's verbatim makes the terms it uses used. PURE.
 * @returns {{used: Set<string>, byRow: Object<string, string[]>, direct: Set<string>}}
 */
export function definitionUsage({ rows, inScope, matcher = {} }) {
  const terms = definitionTerms(rows, matcher);
  const compiled = compile(terms, matcher);
  const byRow = {};
  const direct = new Set();
  for (const r of rows) {
    if (r.kind === 'definition') continue;
    const ids = termsUsed(r.verbatim, terms, matcher, compiled);
    byRow[r.regulation_id] = ids;
    if (inScope(r)) for (const id of ids) direct.add(id);
  }
  const used = new Set(direct);
  if (matcher.transitive) {
    const defText = new Map(rows.filter((r) => r.kind === 'definition').map((r) => [r.regulation_id, r.verbatim]));
    const queue = [...used].sort(cmpStr);
    while (queue.length) {
      const id = queue.shift();
      const ids = termsUsed(defText.get(id) || '', terms, matcher, compiled).filter((x) => x !== id);
      byRow[id] = ids;
      for (const x of ids) {
        if (used.has(x)) continue;
        used.add(x);
        queue.push(x);
      }
    }
  }
  return { byRow, direct, used };
}

/**
 * G-READ definitions arm (Spec 68 §9): the vocab.dsl_input → Ch.800 map is total; every mapped definition exists,
 * is in scope, and carries a complete input_fidelity record in the closed status set; no orphan records. PURE.
 * `inScopeIds` = the set of in-scope regulation ids (from universe.mjs), or null to skip the in-scope check.
 */
export function checkDefinitions({ rows, vocab, fidelity, inScopeIds = null }) {
  const v = [];
  const defIds = new Set(rows.filter((r) => r.kind === 'definition').map((r) => r.regulation_id));
  const statuses = new Set(vocab.input_fidelity_status || []);
  const records = isMap(fidelity) && isMap(fidelity.records) ? fidelity.records : {};
  const mapped = new Map(); // definition id -> input name
  let checked = 0;
  for (const name of Object.keys(vocab.dsl_input || {}).sort(cmpStr)) {
    checked++;
    const i = vocab.dsl_input[name];
    const hasDef = i && i.definition !== undefined;
    const hasNull = i && i.null_reason !== undefined;
    if (hasDef === hasNull) {
      v.push(`dsl_input_unmapped: ${name} needs exactly one of definition | null_reason`);
      continue;
    }
    if (!hasDef) continue;
    if (!defIds.has(i.definition)) {
      v.push(`definition_unresolved: ${name} -> ${i.definition}`);
      continue;
    }
    if (inScopeIds && !inScopeIds.has(i.definition)) v.push(`mapped_definition_out_of_scope: ${name} -> ${i.definition}`);
    if (mapped.has(i.definition)) continue; // two inputs may share a definition; one record covers it
    mapped.set(i.definition, name);
  }
  for (const [def, name] of [...mapped].sort((a, b) => cmpStr(a[0], b[0]))) {
    const rec = records[def];
    if (!isMap(rec)) {
      v.push(`input_fidelity_missing: ${def} (mapped from ${name})`);
      continue;
    }
    const inputs = Object.keys(vocab.dsl_input).filter((n) => vocab.dsl_input[n].definition === def);
    const bad = [];
    if (!statuses.has(rec.status)) bad.push(`status ${rec.status}`);
    for (const k of ['our_field', 'why', 'evidence_ref']) if (!isStr(rec[k])) bad.push(`${k} missing`);
    if (!inputs.includes(rec.input)) bad.push(`input ${rec.input} does not map to ${def}`);
    if (bad.length) v.push(`input_fidelity_invalid: ${def} ${bad.join(', ')}`);
  }
  for (const def of Object.keys(records).sort(cmpStr)) if (!mapped.has(def)) v.push(`input_fidelity_orphan: ${def}`);
  const counts = { inputs: checked, mapped_definitions: mapped.size, null_mapped: checked - [...Object.values(vocab.dsl_input || {})].filter((i) => i && i.definition !== undefined).length };
  counts.by_status = {};
  for (const def of mapped.keys()) {
    const s = isMap(records[def]) ? records[def].status : 'missing';
    counts.by_status[s] = (counts.by_status[s] || 0) + 1;
  }
  return { checked, counts, pass: v.length === 0, violations: v };
}

// ---------------------------------------------------------------- self-test

const defRow = (n, term, verbatim) => ({ kind: 'definition', regulation_id: `800.50(${n})`, term, verbatim: verbatim || `(${n}) ${term} means x.` });
const regRow = (id, verbatim) => ({ kind: 'regulation', regulation_id: id, verbatim });

/** Rows for the fixtures: four definitions, two regulations. */
export function fixtureRows() {
  return [
    defRow(285, 'Front Yard', '(285) Front Yard means a yard between the front lot line and the building.'),
    defRow(290, 'Front Yard Setback', '(290) Front Yard Setback means the distance from the front lot line.'),
    defRow(445, 'Lot Frontage', '(445) Lot Frontage means the horizontal distance between the side lot lines.'),
    defRow(450, 'Lot Line', '(450) Lot Line means a boundary of a lot.'),
    defRow(405, 'Lawful and Lawfully', '(405) Lawful and Lawfully means in conformity.'),
    regRow('10.20.40.70(1)', '(1) Front Yard Setback The required minimum front yard setback is 6.0 metres.'),
    regRow('10.20.30.20(1)', '(1) Minimum Lot Frontage The required minimum lot frontage is 12.0 metres, lawfully.'),
  ];
}

const FX_MATCHER = { case_insensitive: true, plurals: ['s', 'es', 'ies'], longest_first: true, strip_parenthetical: true, transitive: true };
const fxVocab = (inputs) => ({ dsl_input: inputs, input_fidelity_status: ['matches', 'approximates', 'differs', 'unknown'] });
const fxRec = (input, extra = {}) => ({ input, our_field: 'parcels.frontage_m', status: 'approximates', why: 'MBR', evidence_ref: 'scripts/lib/compute/load-parcels.js#estimateLotDimensions', ...extra });

export const FIXTURES = Object.freeze([
  { reason: null, name: 'good twin', vocab: fxVocab({ lot_frontage_m: { unit: 'm', definition: '800.50(445)' }, dwelling_units: { unit: 'units', null_reason: 'not_a_measurement' } }), fidelity: { records: { '800.50(445)': fxRec('lot_frontage_m') } } },
  { reason: 'dsl_input_unmapped', vocab: fxVocab({ lot_frontage_m: { unit: 'm' } }), fidelity: { records: {} } },
  { reason: 'definition_unresolved', vocab: fxVocab({ lot_frontage_m: { unit: 'm', definition: '800.50(999)' } }), fidelity: { records: {} } },
  { reason: 'mapped_definition_out_of_scope', vocab: fxVocab({ lot_frontage_m: { unit: 'm', definition: '800.50(445)' } }), fidelity: { records: { '800.50(445)': fxRec('lot_frontage_m') } }, inScope: new Set(['800.50(290)']) },
  { reason: 'input_fidelity_missing', vocab: fxVocab({ lot_frontage_m: { unit: 'm', definition: '800.50(445)' } }), fidelity: { records: {} } },
  { reason: 'input_fidelity_invalid', vocab: fxVocab({ lot_frontage_m: { unit: 'm', definition: '800.50(445)' } }), fidelity: { records: { '800.50(445)': fxRec('lot_frontage_m', { status: 'probably' }) } } },
  { reason: 'input_fidelity_orphan', vocab: fxVocab({}), fidelity: { records: { '800.50(445)': fxRec('lot_frontage_m') } } },
]);

/** Matcher fixtures: longest-first, plural, "A and B", transitive. */
export function matcherSelfTest() {
  const rows = fixtureRows();
  const terms = definitionTerms(rows, FX_MATCHER);
  const results = [];
  const t1 = termsUsed('The required minimum front yard setback is 6.0 metres.', terms, FX_MATCHER);
  results.push({ name: 'longest first: front yard setback does not also count front yard', ok: t1.join() === '800.50(290)', got: t1 });
  const t2 = termsUsed('lot lines and lawfully', terms, FX_MATCHER);
  results.push({ name: 'plural + "A and B" term', ok: t2.join() === '800.50(405),800.50(450)', got: t2 });
  const u = definitionUsage({ rows, inScope: (r) => r.regulation_id === '10.20.30.20(1)', matcher: FX_MATCHER });
  const used = [...u.used].sort();
  results.push({ name: 'transitive: Lot Frontage -> Lot Line (via "side lot lines")', ok: used.join() === '800.50(405),800.50(445),800.50(450)', got: used });
  const nt = definitionUsage({ rows, inScope: (r) => r.regulation_id === '10.20.30.20(1)', matcher: { ...FX_MATCHER, transitive: false } });
  results.push({ name: 'non-transitive leaves Lot Line unused', ok: !nt.used.has('800.50(450)'), got: [...nt.used].sort() });
  return results;
}

export function selfTest() {
  const rows = fixtureRows();
  const results = [...matcherSelfTest()];
  for (const f of FIXTURES) {
    const r = checkDefinitions({ rows, vocab: f.vocab, fidelity: f.fidelity, inScopeIds: f.inScope || null });
    const codes = [...new Set(r.violations.map((x) => x.split(':')[0]))];
    const ok = f.reason === null ? r.pass : !r.pass && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.name || f.reason, expected: f.reason, got: codes, ok });
  }
  const covered = new Set(FIXTURES.map((f) => f.reason).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, ok: false, got: [] });
  return { pass: results.every((r) => r.ok), results };
}
